import { useEffect } from 'react';
import { GRID } from '../constants';
import { resolvePoints } from '../routing/resolveWire';
import { attachFreeEndpointsToPorts } from '../wires/snap';

export function useKeyboardShortcuts(ctx) {
const {
    nodes, wires, selected, moveGroup, copyGroup, cursorNodeId,
    isWiringMode, isMoveMode, isCopyMode, placingType,
    nodesRef, wiresRef, lastMouse,
    setNodes, setWires, setWiresRaw, setSelected,
    setMoveGroup, setCopyGroup, setCursorNodeId,
    setIsMoveMode, setIsCopyMode, setIsWiringMode,
    setIsRotatingFlag, setQuickAddOpen,
    screenToFlowPosition, fitView, deleteSelected, undo,
} = ctx;
 useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey) {
        e.preventDefault();
        fitView({ padding: 0.2, duration: 300 });
        return;
      }
      
      // Phím U (hoặc Ctrl+Z): hoàn tác. Không chạy khi đang di chuyển/sao chép dở.
      if (((e.key === 'u' || e.key === 'U') && !e.ctrlKey && !e.metaKey && !e.altKey) ||
          ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey)) {
        e.preventDefault();
        if (e.repeat || moveGroup || copyGroup || cursorNodeId) return;
        undo?.(() => setSelected(null));
        return;
      }

      const activeNodes = nodes.filter((n) => n.selected);
      const activeWires = wires.filter((w) => w.selected);
      
      // Phím L: đặt tên cho dây đang chọn
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.repeat || moveGroup || copyGroup || cursorNodeId) return;
        const wireId = selected?.kind === 'wire' ? selected.id
          : (activeWires.length === 1 ? activeWires[0].id : null);
        if (wireId) {
          e.preventDefault(); // tránh ký tự 'l' bị gõ vào ô vừa focus
          if (selected?.kind !== 'wire') setSelected({ kind: 'wire', id: wireId });
          setTimeout(() => {
            const el = document.getElementById('wire-name-input');
            if (el) { el.focus(); el.select(); }
          }, 0);
          return;
        }
      }
      
      if (e.key === 'r' || e.key === 'R') {
        if (e.repeat) return;
        const targetIds = moveGroup ? moveGroup.items.map((i) => i.id)
          : copyGroup ? copyGroup.items.map((i) => i.id)
          : activeNodes.map((n) => n.id);
        if (targetIds.length === 0 && selected?.kind === 'node') targetIds.push(selected.id);

        const targetWireIds = moveGroup ? (moveGroup.wireItems || []).map((i) => i.id)
          : copyGroup ? (copyGroup.wireItems || []).map((i) => i.id)
          : activeWires.map((w) => w.id);
        if (targetWireIds.length === 0 && selected?.kind === 'wire') targetWireIds.push(selected.id);
        if (targetIds.length > 0 || targetWireIds.length > 0) {
          const isFlip = e.ctrlKey;
          if (isFlip) e.preventDefault();

          setIsRotatingFlag(true); // <-- BẬT trước khi setNodes/setWires

          const targetSet = new Set(targetIds);
          const targetNodesArr = nodesRef.current.filter((n) => targetSet.has(n.id));
          const wireSet = new Set(targetWireIds);

          wiresRef.current?.forEach((w) => {
            const allEndsInside = w.points.every((p) => !p.nodeId || targetSet.has(p.nodeId));
            const touchesAny = w.points.some((p) => p.nodeId && targetSet.has(p.nodeId));
            if (touchesAny && allEndsInside) wireSet.add(w.id);
          });

          if (targetNodesArr.length === 0 && wireSet.size === 0) {
            setIsRotatingFlag(false);
            return;
          }

          // Tâm cả khối — GIỮ NGUYÊN dạng số thực (KHÔNG làm tròn về lưới ở bước này),
          // tránh cộng dồn sai số qua nhiều lượt rotate/flip liên tiếp.
          let sumX = 0, sumY = 0, cnt = 0;
          targetNodesArr.forEach((n) => { sumX += n.position.x + 40; sumY += n.position.y + 50; cnt++; });
          wiresRef.current?.forEach((w) => {
            if (!wireSet.has(w.id)) return;
            w.points.forEach((p) => { sumX += p.x; sumY += p.y; cnt++; });
          });
          if (cnt === 0) { setIsRotatingFlag(false); return; }
          const cx = sumX / cnt;
          const cy = sumY / cnt;

          const rotatePt = (x, y) => ({ x: cx - (y - cy), y: cy + (x - cx) });
          const flipPt = (x, y) => ({ x: 2 * cx - x, y });
          const transformPt = (x, y) => (isFlip ? flipPt(x, y) : rotatePt(x, y));
          const snapPt = (p) => ({ x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID });

          // Tính TRƯỚC danh sách node/wire mới ra biến cục bộ — dùng chung cho cả
          // setNodes/setWires lẫn việc rebase moveGroup ngay dưới đây (setState là
          // async nên không thể đọc lại giá trị mới qua closure ngay lập tức).
          const newNodesFull = nodesRef.current.map((n) => {
            if (!targetSet.has(n.id)) return n;
            const worldCx = n.position.x + 40;
            const worldCy = n.position.y + 50;
            const np = snapPt(transformPt(worldCx, worldCy));
            return {
              ...n,
              position: { x: np.x - 40, y: np.y - 50 },
              data: {
                ...n.data,
                ...(isFlip ? { flip: !n.data.flip } : { rot: ((n.data.rot || 0) + 90) % 360 }),
              },
            };
          });

          const newWiresFull = wiresRef.current.map((w) => {
            if (!wireSet.has(w.id)) return w;

            const transform = (p) => {
              const np = snapPt(transformPt(p.x, p.y));
              return { ...p, x: np.x, y: np.y };
            };

            // Bỏ các waypoint giữa CŨ (là kết quả route/kéo tay từ trước) — chỉ giữ 2 đầu mút,
            // để Dijkstra tính lại đường đi sạch từ đầu theo vị trí MỚI, tránh bị ép đi qua
            // điểm gấp khúc cũ không còn hợp lý sau khi xoay/lật.
            const first = w.points[0];
            const last = w.points[w.points.length - 1];
            const newPoints = w.points.length > 2
              ? [transform(first), transform(last)]
              : w.points.map(transform);

            return { ...w, points: newPoints, routed: false };
          });

          setNodes(newNodesFull);
          setWires(newWiresFull);

          // Rebase moveGroup theo vị trí VỪA rotate/flip — nếu không, lần mousemove
          // tiếp theo sẽ dùng initialX/initialY/initialPoints CŨ (trước rotate) cộng
          // dx/dy mới, làm node/dây "nhảy" bật ngược lại theo hướng khác.
          if (moveGroup) {
            const flowPos = screenToFlowPosition(lastMouse.current);
            setMoveGroup((mg) => {
              if (!mg) return mg;
              return {
                startX: Math.round(flowPos.x / GRID) * GRID,
                startY: Math.round(flowPos.y / GRID) * GRID,
                items: mg.items.map((it) => {
                  const n = newNodesFull.find((x) => x.id === it.id);
                  return n ? { id: it.id, initialX: n.position.x, initialY: n.position.y } : it;
                }),
                wireItems: (mg.wireItems || []).map((it) => {
                  const w = newWiresFull.find((x) => x.id === it.id);
                  return w ? { id: it.id, initialPoints: w.points.map((p) => ({ ...p })) } : it;
                }),
              };
            });
          }

          if (copyGroup) {
            const flowPos = screenToFlowPosition(lastMouse.current);
            setCopyGroup((cg) => {
              if (!cg) return cg;
              return {
                startX: Math.round(flowPos.x / GRID) * GRID,
                startY: Math.round(flowPos.y / GRID) * GRID,
                items: cg.items.map((it) => {
                  const n = newNodesFull.find((x) => x.id === it.id);
                  return n ? { id: it.id, initialX: n.position.x, initialY: n.position.y } : it;
                }),
                wireItems: (cg.wireItems || []).map((it) => {
                  const w = newWiresFull.find((x) => x.id === it.id);
                  return w ? { id: it.id, initialPoints: w.points.map((p) => ({ ...p })) } : it;
                }),
              };
            });
          }

          setTimeout(() => setIsRotatingFlag(false), 300);
          return;
        }
      }

      if (e.key === 'Escape') {
        if (isCopyMode && cursorNodeId) setNodes((ns) => ns.filter((n) => n.id !== cursorNodeId));

        // THÊM: nếu đang copy cả khối thì xoá luôn các bản sao vừa tạo
        if (isCopyMode && copyGroup) {
          const nodeIds = new Set(copyGroup.items.map((i) => i.id));
          const wireIds = new Set((copyGroup.wireItems || []).map((i) => i.id));
          setNodes((ns) => ns.filter((n) => !nodeIds.has(n.id)));
          setWiresRaw((ws) => ws.filter((w) => !wireIds.has(w.id)));
        }

        const movedIds = new Set((moveGroup?.wireItems || []).map((i) => i.id));
        setWires((ws) => {
          const cleaned = ws.map((w) => {
            if (w.lockedVertical === undefined) return w;
            const { lockedVertical, ...rest } = w;
            return rest;
          });
          return attachFreeEndpointsToPorts(cleaned, nodesRef.current, movedIds);
        });
        setMoveGroup(null);
        setCopyGroup(null);
        setCursorNodeId(null);
        setIsMoveMode(false);
        setIsCopyMode(false);
        setIsWiringMode(false);
        setQuickAddOpen(false);
        return;
      }

      if (moveGroup || copyGroup || cursorNodeId) return;

      if (e.key === 'm' || e.key === 'M') {
        const targetNodes = activeNodes.length > 0
          ? activeNodes
          : (selected?.kind === 'node' ? [nodes.find((n) => n.id === selected.id)].filter(Boolean) : []);

        let targetWires = activeWires.length > 0
          ? activeWires
          : (selected?.kind === 'wire' ? [wires.find((w) => w.id === selected.id)].filter(Boolean) : []);

        // --- MỞ RỘNG targetWires: kéo theo mọi dây chạm đầu tự do vào dây đang chọn (lan truyền) ---
        // Chỉ di chuyển đúng những dây đã chọn, không lan sang dây khác
        const resolvedWires = wires.map((w) => ({ w, pts: resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed) }));
        const resolvedMap = new Map(resolvedWires.map(({ w, pts }) => [w.id, pts]));
        const includedIds = new Set(targetWires.map((w) => w.id));

        // ------------------------------------------------------------------------------------------


        if (targetNodes.length > 0 || targetWires.length > 0) {
          const flowPos = screenToFlowPosition(lastMouse.current);
          const targetNodeIds = targetNodes.map((n) => n.id);
          const lastIdx = (w) => w.points.length - 1;

          // 1) Dây KHÔNG được kéo mà đang rẽ nhánh (onWireId) vào dây được kéo -> đóng băng tại chỗ
          setWiresRaw((ws) => ws.map((w) => {
            if (includedIds.has(w.id)) return w;
            const rp = resolvedMap.get(w.id);
            const li = lastIdx(w);
            let changed = false;
            const ends = [0, li].map((i) => {
              const p = w.points[i];
              if (p.onWireId && includedIds.has(p.onWireId)) {
                changed = true;
                const q = i === 0 ? rp[0] : rp[rp.length - 1];
                return { x: q.x, y: q.y };
              }
              return p;
            });
            if (!changed) return w;
            // giữ hình dạng đã định tuyến: điểm giữa lấy từ đường đã resolve
            const mid = rp.slice(1, -1).map((q) => ({ x: q.x, y: q.y }));
            return { ...w, points: [ends[0], ...mid, ends[1]], lockedVertical: undefined };
          }));

          // 2) Dây được kéo: chụp lại hình dạng đã định tuyến, gỡ các binding không đi cùng
          const keep = (p) =>
            (p.nodeId && targetNodeIds.includes(p.nodeId)) ||
            (p.onWireId && includedIds.has(p.onWireId));

          setMoveGroup({
            startX: Math.round(flowPos.x / GRID) * GRID,
            startY: Math.round(flowPos.y / GRID) * GRID,
            items: targetNodes.map((n) => ({ id: n.id, initialX: n.position.x, initialY: n.position.y })),
            wireItems: targetWires.map((w) => {
              const li = lastIdx(w);
              const willStrip = [w.points[0], w.points[li]].some((p) => (p.nodeId || p.onWireId) && !keep(p));
              let base = w.points;
              if (willStrip) {
                const rp = resolvedMap.get(w.id);
                base = rp.map((q, i) => {
                  if (i === 0) return { ...q, ...(({ nodeId, portId, onWireId }) => ({ nodeId, portId, onWireId }))(w.points[0]) };
                  if (i === rp.length - 1) return { ...q, ...(({ nodeId, portId, onWireId }) => ({ nodeId, portId, onWireId }))(w.points[li]) };
                  return { x: q.x, y: q.y };
                });
              }
              return {
                id: w.id,
                initialPoints: base.map((p) => (keep(p) ? { ...p } : { x: p.x, y: p.y })),
              };
            }),
          });
          setIsMoveMode(true);
        } else {
          setIsMoveMode(true);
        }
        setIsCopyMode(false); setIsWiringMode(false); setSelected(null);
      }
      else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey) {
        const targetNodes = activeNodes.length > 0
          ? activeNodes
          : (selected?.kind === 'node' ? [nodes.find((n) => n.id === selected.id)].filter(Boolean) : []);
        const targetWires = activeWires.length > 0
          ? activeWires
          : (selected?.kind === 'wire' ? [wires.find((w) => w.id === selected.id)].filter(Boolean) : []);

        if (targetNodes.length > 0 || targetWires.length > 0) {
          // --- Copy cả khối: nhân bản node + wire đã bôi đen, gắn vào con trỏ ---
          const reserved = new Set(nodes.map((n) => n.id));
          const genId = (prefix) => {
            let i = 1;
            while (reserved.has(`${prefix}${i}`)) i++;
            const id = `${prefix}${i}`;
            reserved.add(id);
            return id;
          };

          const idMap = new Map(); // old nodeId -> new nodeId
          const newNodes = targetNodes.map((n) => {
            const prefix = (n.data.reference || 'U').replace(/[0-9]/g, '') || 'U';
            const newId = genId(prefix);
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              data: { ...n.data, reference: n.type === 'vdd' ? n.data.reference : newId },
              position: { ...n.position },
              selected: false,
            };
          });

          const targetWireIdSet = new Set(targetWires.map((w) => w.id));
          const wireIdMap = new Map(); // old wireId -> new wireId
          const resolvedMap = new Map(
            targetWires.map((w) => [w.id, resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed)])
          );

          targetWires.forEach((w) => {
            wireIdMap.set(w.id, `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
          });

          const newWires = targetWires.map((w) => {
            const rp = resolvedMap.get(w.id);
            const li = w.points.length - 1;
            const points = w.points.map((p, i) => {
              if (p.nodeId) {
                if (idMap.has(p.nodeId)) return { ...p, nodeId: idMap.get(p.nodeId) };
                // đầu bám vào node NGOÀI khối -> gỡ, giữ nguyên toạ độ hiện tại
                const q = i === 0 ? rp[0] : rp[rp.length - 1];
                return { x: q.x, y: q.y };
              }
              if (p.onWireId) {
                if (targetWireIdSet.has(p.onWireId)) return { ...p, onWireId: wireIdMap.get(p.onWireId) };
                return { x: p.x, y: p.y }; // bám dây ngoài khối -> gỡ
              }
              return { ...p };
            });
            return { id: wireIdMap.get(w.id), points, net: w.net, name: w.name, color: w.color, selected: false };
          });

          setNodes((ns) => [...ns, ...newNodes]);
          setWiresRaw((ws) => [...ws, ...newWires]);

          const flowPos = screenToFlowPosition(lastMouse.current);
          setCopyGroup({
            startX: Math.round(flowPos.x / GRID) * GRID,
            startY: Math.round(flowPos.y / GRID) * GRID,
            items: newNodes.map((n) => ({ id: n.id, initialX: n.position.x, initialY: n.position.y })),
            wireItems: newWires.map((w) => ({ id: w.id, initialPoints: w.points.map((p) => ({ ...p })) })),
          });
          setIsCopyMode(true);
          setIsMoveMode(false);
          setIsWiringMode(false);
          setSelected(null);
        } else {
          // --- Không có gì được chọn -> giữ hành vi cũ: chờ click 1 linh kiện để nhân bản ---
          setIsCopyMode(true);
          setIsMoveMode(false);
          setIsWiringMode(false);
          setSelected(null);
        }
      }
      else if (e.key === 'w' || e.key === 'W') { setIsWiringMode(true); setIsMoveMode(false); setIsCopyMode(false); setSelected(null); }
      else if (e.key === 'i' || e.key === 'I') { setQuickAddOpen(true); setSelected(null); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isWiringMode && !placingType && (activeNodes.length > 0 || activeWires.length > 0 || selected)) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [isWiringMode, isMoveMode, isCopyMode, placingType, selected, moveGroup, copyGroup, cursorNodeId, nodes, wires, deleteSelected, setNodes, setWiresRaw, screenToFlowPosition, fitView, undo]);
}