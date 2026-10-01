import { useEffect, useRef, useState } from 'react';
import { ref, update, onValue } from 'firebase/database';
import { rtdb, ensureSignedIn } from './firebase';
import { nodeBoxStyle } from '../constants';

const clean = (o) => JSON.parse(JSON.stringify(o));

const stripNode = (n) => clean({
  id: n.id,
  type: n.type,
  position: { x: Math.round(n.position?.x ?? 0), y: Math.round(n.position?.y ?? 0) },
  data: n.data ? { ...n.data, onResize: undefined, onTextChange: undefined } : {},
});

const stripWire = (w) => clean({
  id: w.id,
  points: (w.points || []).map((p) => ({
    x: Math.round(p.x),
    y: Math.round(p.y),
    nodeId: p.nodeId ?? null,
    portId: p.portId ?? null,
    onWireId: p.onWireId ?? null,
  })),
  net: w.net ?? null,
  name: w.name ?? null,
  color: w.color ?? null,
  labels: w.labels ?? null,
});

const computeSignature = (nodes, wires) => {
  const nSig = (nodes || []).map((n) => `${n.id}:${n.type}:${Math.round(n.position?.x ?? 0)},${Math.round(n.position?.y ?? 0)}:${JSON.stringify(n.data || {})}`).join(';');
  const wSig = (wires || []).map((w) => `${w.id}:${(w.points || []).map((p) => `${Math.round(p.x)},${Math.round(p.y)},${p.nodeId || ''},${p.portId || ''},${p.onWireId || ''}`).join('/')}:${w.name || ''}:${w.net || ''}:${w.color || ''}:${JSON.stringify(w.labels || null)}`).join(';');
  return `${nSig}||${wSig}`;
};

export function useCircuitSync({
  circuitId, nodes, wires, setNodes, setWiresRaw,
  isEditingLocally, seedNodes = [],
  onResizeRect, onTextChangeRect,
}) {
  const [ready, setReady] = useState(false);
  const myUidRef = useRef(null);
  const lastReceivedTs = useRef(0);
  const lastSentSignature = useRef('');
  const sendTimer = useRef(null);
  const firstRoomRef = useRef(true);

  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const wiresRef = useRef(wires);
  useEffect(() => { wiresRef.current = wires; }, [wires]);

  const onResizeRectRef = useRef(onResizeRect);
  useEffect(() => { onResizeRectRef.current = onResizeRect; }, [onResizeRect]);

  const onTextChangeRectRef = useRef(onTextChangeRect);
  useEffect(() => { onTextChangeRectRef.current = onTextChangeRect; }, [onTextChangeRect]);

  // ---------- KẾT NỐI VÀ LẮNG NGHE ĐỒNG BỘ TỪ PHÒNG (RTDB) ----------
  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    const isInitialRoom = firstRoomRef.current;
    firstRoomRef.current = false;
    setReady(false);
    lastReceivedTs.current = 0;
    lastSentSignature.current = '';

    ensureSignedIn().then((user) => {
      if (cancelled) return;
      myUidRef.current = user.uid;

      const roomRef = ref(rtdb, `presence/${circuitId}`);
      let firstSnapshot = true;

      unsub = onValue(roomRef, (snap) => {
        if (cancelled) return;
        const roomData = snap.val() || {};

        // Tìm trạng thái mạch mới nhất do bất kỳ peer nào trong phòng gửi lên
        let newestPeerCircuit = null;
        let newestPeerTs = 0;

        for (const [peerId, peerVal] of Object.entries(roomData)) {
          if (peerId !== user.uid && peerVal?.circuitJson) {
            try {
              const parsed = JSON.parse(peerVal.circuitJson);
              if (parsed?.ts && parsed.ts > newestPeerTs) {
                newestPeerTs = parsed.ts;
                newestPeerCircuit = parsed;
              }
            } catch (e) {
              console.error('Lỗi phân tích circuitJson từ peer:', e);
            }
          }
        }

        if (firstSnapshot) {
          firstSnapshot = false;
          if (newestPeerCircuit) {
            // Có dữ liệu mạch sẵn trong phòng từ peer khác -> tiếp nhận mạch đó
            lastReceivedTs.current = newestPeerTs;
            const remoteNodes = (newestPeerCircuit.nodes || []).map((n) => ({
              ...n,
              data: n.type === 'rect' ? { ...n.data, onResize: onResizeRectRef.current, onTextChange: onTextChangeRectRef.current } : n.data,
              style: nodeBoxStyle({ type: n.type, data: n.data }),
              selected: false,
            }));
            const remoteWires = (newestPeerCircuit.wires || []).map((w) => ({ ...w, selected: false }));
            lastSentSignature.current = computeSignature(remoteNodes, remoteWires);
            setNodes(remoteNodes);
            setWiresRaw(remoteWires);
          } else if (isInitialRoom && (!nodesRef.current || nodesRef.current.length === 0) && seedNodes.length > 0) {
            // Phòng mới hoàn toàn lần đầu mở -> seed dữ liệu mẫu
            const seededNodes = seedNodes.map((n) => ({
              ...n,
              data: n.type === 'rect' ? { ...n.data, onResize: onResizeRectRef.current, onTextChange: onTextChangeRectRef.current } : n.data,
              style: nodeBoxStyle({ type: n.type, data: n.data }),
              selected: false,
            }));
            const seededWires = [];
            lastSentSignature.current = computeSignature(seededNodes, seededWires);
            setNodes(seededNodes);
            setWiresRaw(seededWires);

            // Gửi dữ liệu seed cho phòng
            const ts = Date.now();
            lastReceivedTs.current = ts;
            update(ref(rtdb, `presence/${circuitId}/${user.uid}`), {
              circuitJson: JSON.stringify({
                ts,
                nodes: seededNodes.map(stripNode),
                wires: seededWires.map(stripWire),
              }),
            }).catch(console.error);
          } else if (nodesRef.current && nodesRef.current.length > 0) {
            // Người này vừa nạp file mạch từ Google Drive vào phòng -> đồng bộ nội dung file này cho phòng
            const ts = Date.now();
            lastReceivedTs.current = ts;
            const currentNodes = nodesRef.current;
            const currentWires = wiresRef.current;
            lastSentSignature.current = computeSignature(currentNodes, currentWires);
            update(ref(rtdb, `presence/${circuitId}/${user.uid}`), {
              circuitJson: JSON.stringify({
                ts,
                nodes: currentNodes.map(stripNode),
                wires: currentWires.map(stripWire),
              }),
            }).catch(console.error);
          }
          setReady(true);
          return;
        }

        // Các cập nhật tiếp theo trong quá trình cùng vẽ (sau khi đã khởi tạo):
        if (newestPeerCircuit && newestPeerTs > lastReceivedTs.current) {
          lastReceivedTs.current = newestPeerTs;

          setNodes((currentNs) => {
            const currentMap = new Map((currentNs || []).map((n) => [n.id, n]));
            return (newestPeerCircuit.nodes || []).map((n) => {
              const old = currentMap.get(n.id);
              return {
                ...n,
                data: n.type === 'rect' ? { ...n.data, onResize: onResizeRectRef.current, onTextChange: onTextChangeRectRef.current } : n.data,
                style: nodeBoxStyle({ type: n.type, data: n.data }),
                selected: old?.selected ?? false,
              };
            });
          });

          setWiresRaw((currentWs) => {
            const currentMap = new Map((currentWs || []).map((w) => [w.id, w]));
            return (newestPeerCircuit.wires || []).map((w) => {
              const old = currentMap.get(w.id);
              return {
                ...w,
                selected: old?.selected ?? false,
              };
            });
          });

          lastSentSignature.current = computeSignature(newestPeerCircuit.nodes, newestPeerCircuit.wires);
        }
      });
    });

    return () => {
      cancelled = true;
      unsub();
      clearTimeout(sendTimer.current);
    };
  }, [circuitId, setNodes, setWiresRaw]);

  // ---------- GỬI CẬP NHẬT CỦA MÌNH LÊN PHÒNG KHI CÓ THAY ĐỔI ----------
  useEffect(() => {
    if (!ready || isEditingLocally || !myUidRef.current) return;

    const currentSig = computeSignature(nodes, wires);
    if (currentSig === lastSentSignature.current) return; // Không có thay đổi thực tế

    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      if (isEditingLocally || !myUidRef.current) return;

      const latestNodes = nodesRef.current;
      const latestWires = wiresRef.current;
      const latestSig = computeSignature(latestNodes, latestWires);

      if (latestSig === lastSentSignature.current) return;

      const ts = Date.now();
      lastSentSignature.current = latestSig;
      lastReceivedTs.current = ts;

      const payload = {
        ts,
        nodes: latestNodes.map(stripNode),
        wires: latestWires.map(stripWire),
      };

      update(ref(rtdb, `presence/${circuitId}/${myUidRef.current}`), {
        circuitJson: JSON.stringify(payload),
      }).catch(console.error);
    }, 60);

    return () => clearTimeout(sendTimer.current);
  }, [nodes, wires, ready, isEditingLocally, circuitId]);
}