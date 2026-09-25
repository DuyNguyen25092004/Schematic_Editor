import { useCallback, useEffect, useRef } from 'react';

// ============ UNDO (phím U / Ctrl+Z) ============
// Tự theo dõi nodes + wires: mỗi "đợt thay đổi" (gom các thay đổi liên tiếp trong DEBOUNCE_MS,
// ví dụ kéo dây, kéo dài VDD, gõ tên) = 1 bước undo. Chọn/bỏ chọn, đo kích thước node KHÔNG tính.
// Dữ liệu nhận từ người khác / nạp phòng (qua remoteSetNodes, remoteSetWiresRaw) KHÔNG tạo bước undo.
const DEBOUNCE_MS = 300;
const MAX_HISTORY = 100;

const nodesSig = (nodes) =>
  JSON.stringify(nodes.map((n) => [n.id, n.type, n.position?.x, n.position?.y, n.data]));
const wiresSig = (wires) =>
  JSON.stringify(wires.map((w) => { const { selected: _s, ...rest } = w; return rest; }));
const snapSig = (s) => `${nodesSig(s.nodes)}|${wiresSig(s.wires)}`;

export function useUndo({ nodes, wires, setNodes, setWiresRaw, circuitId }) {
  const stack = useRef([]);                       // các trạng thái cũ (mới nhất ở cuối)
  const stable = useRef({ nodes, wires });        // trạng thái "yên" gần nhất (trước đợt thay đổi hiện tại)
  const sigRef = useRef(snapSig(stable.current));
  const latest = useRef({ nodes, wires });
  const timer = useRef(null);
  const externalRef = useRef(false);

  latest.current = { nodes, wires };

  // Theo dõi thay đổi
  useEffect(() => {
    const sig = snapSig({ nodes, wires });
    if (sig === sigRef.current) return;           // chỉ đổi selection / kích thước -> bỏ qua
    sigRef.current = sig;

    // Thay đổi do nạp dữ liệu / người khác gửi tới, và không đang có đợt sửa dang dở
    if (externalRef.current && !timer.current) {
      externalRef.current = false;
      stable.current = { nodes, wires };
      return;
    }
    externalRef.current = false;

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const cur = latest.current;
      if (snapSig(cur) !== snapSig(stable.current)) {
        stack.current.push(stable.current);
        if (stack.current.length > MAX_HISTORY) stack.current.shift();
      }
      stable.current = cur;
    }, DEBOUNCE_MS);
  }, [nodes, wires]);

  // Đổi phòng -> xoá lịch sử
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = null;
    stack.current = [];
    stable.current = latest.current;
    sigRef.current = snapSig(latest.current);
  }, [circuitId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const undo = useCallback((onRestored) => {
    let target = null;
    if (timer.current) {                          // đang có thay đổi chưa chốt -> hoàn tác nó
      clearTimeout(timer.current);
      timer.current = null;
      target = stable.current;
    } else if (stack.current.length) {
      target = stack.current.pop();
    }
    if (!target) return false;

    const restoredNodes = target.nodes.map((n) => ({ ...n, selected: false, dragging: false }));
    const restoredWires = target.wires.map((w) => ({ ...w, selected: false }));
    stable.current = { nodes: restoredNodes, wires: restoredWires };
    sigRef.current = snapSig(stable.current);
    externalRef.current = false;
    setNodes(restoredNodes);
    setWiresRaw(restoredWires);                   // bỏ qua bước gộp dây: khôi phục đúng nguyên trạng
    onRestored?.();
    return true;
  }, [setNodes, setWiresRaw]);

  // Bọc setter dùng cho dữ liệu từ xa: nếu nội dung thật sự đổi thì đánh dấu "không phải thao tác của mình"
  const remoteSetNodes = useCallback((updater) => {
    setNodes((ns) => {
      const next = typeof updater === 'function' ? updater(ns) : updater;
      if (nodesSig(next) !== nodesSig(ns)) externalRef.current = true;
      return next;
    });
  }, [setNodes]);
  const remoteSetWiresRaw = useCallback((updater) => {
    setWiresRaw((ws) => {
      const next = typeof updater === 'function' ? updater(ws) : updater;
      if (wiresSig(next) !== wiresSig(ws)) externalRef.current = true;
      return next;
    });
  }, [setWiresRaw]);

  return { undo, remoteSetNodes, remoteSetWiresRaw };
}