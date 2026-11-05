import { useEffect } from 'react';
import { GRID } from '../constants';
import { getSymbolBBox } from '../geometry/ports';
import { resolvePoints } from '../routing/resolveWire';
import { pointAtRatio } from '../geometry/pathUtils';
import { attachFreeEndpointsToPorts } from '../wires/snap';

// Đảo dấu nhưng không sinh -0
const neg = (v) => (v ? -v : 0);
// Khoảng dịch cố định khi lật dọc theo trục dây mà nhãn đang ở chính giữa
const NAME_FLIP_SHIFT = 30;

function mirrorLabelObj(lbl, horizontal, mode) {
  const off = lbl.offset || { x: 0, y: 0 };
  const ratio = lbl.ratio ?? 0.5;
  const flipRatio = Math.round((1 - ratio) * 100) / 100;
  const centered = Math.abs(ratio - 0.5) < 0.005;

  if (horizontal) {
    if (mode === 'V') {
      const curSide = lbl.side || 'above';
      const nextSide = curSide === 'below' ? 'above' : 'below';
      return { ...lbl, side: nextSide, offset: { x: off.x, y: neg(off.y) } };
    }
    // mode H: dọc theo dây ngang
    if (centered) return { ...lbl, offset: { x: off.x ? neg(off.x) : NAME_FLIP_SHIFT, y: off.y } };
    return { ...lbl, ratio: flipRatio, offset: { x: neg(off.x), y: off.y } };
  }
  // vertical
  if (mode === 'H') {
    const curSide = lbl.side || 'right';
    const nextSide = curSide === 'left' ? 'right' : 'left';
    return { ...lbl, side: nextSide, offset: { x: neg(off.x), y: off.y } };
  }
  // mode V: dọc theo dây dọc
  if (centered) return { ...lbl, offset: { x: off.x, y: off.y ? neg(off.y) : NAME_FLIP_SHIFT } };
  return { ...lbl, ratio: flipRatio, offset: { x: off.x, y: neg(off.y) } };
}

// Lật tên dây (wire name) theo phép đối xứng.
// - Lật vuông góc với dây: đổi phía (above/below hoặc left/right) + đảo offset tương ứng.
// - Lật dọc theo dây: đảo nameRatio (1 - r) + đảo offset; nếu nhãn đang ở giữa (0.5) thì
//   dịch ±NAME_FLIP_SHIFT px dọc dây (lần sau lật lại) để nhãn luôn có chuyển động nhìn thấy được.
function mirrorWireName(w, horizontal, mode) {
  const off = w.labelOffset || { x: 0, y: 0 };
  const ratio = w.nameRatio ?? 0.5;
  const flipRatio = Math.round((1 - ratio) * 100) / 100;
  const centered = Math.abs(ratio - 0.5) < 0.005;

  // Lật luôn cả w.labels nếu có
  const newLabels = (w.labels || []).map((l) => mirrorLabelObj(l, horizontal, mode));

  let nextSide = w.nameSide;
  let nextOffset = off;
  let nextRatio = ratio;

  if (horizontal) {
    if (mode === 'V') {
      const curSide = w.nameSide || 'above';
      nextSide = curSide === 'below' ? 'above' : 'below';
      nextOffset = { x: off.x, y: neg(off.y) };
    } else {
      // mode H: dọc theo dây ngang
      if (centered) {
        nextOffset = { x: off.x ? neg(off.x) : NAME_FLIP_SHIFT, y: off.y };
      } else {
        nextRatio = flipRatio;
        nextOffset = { x: neg(off.x), y: off.y };
      }
    }
  } else {
    // vertical
    if (mode === 'H') {
      const curSide = w.nameSide || 'right';
      nextSide = curSide === 'left' ? 'right' : 'left';
      nextOffset = { x: neg(off.x), y: off.y };
    } else {
      // mode V: dọc theo dây dọc
      if (centered) {
        nextOffset = { x: off.x, y: off.y ? neg(off.y) : NAME_FLIP_SHIFT };
      } else {
        nextRatio = flipRatio;
        nextOffset = { x: off.x, y: neg(off.y) };
      }
    }
  }

  return {
    ...w,
    nameSide: nextSide,
    nameRatio: nextRatio,
    labelOffset: nextOffset,
    labels: newLabels,
  };
}

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
    textTool, openWireLabelDialog, openTextNodeDialog, openTextDialog, cancelTextTool,
    onOpenNetlist,
    onToggleSwitch,
    canEdit = true,
    isPropertyPanelOpen, setIsPropertyPanelOpen,
    disabled = false,
  } = ctx;
 useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Ctrl+E: Mở hộp thoại xuất SPICE Netlist
      if ((e.key === 'e' || e.key === 'E') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onOpenNetlist?.();
        return;
      }

      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey) {
        e.preventDefault();
        fitView({ padding: 0.2, duration: 300 });
        return;
      }
      
      // Nếu không có quyền chỉnh sửa, vô hiệu hóa mọi phím tắt thay đổi mạch
      if (!canEdit) return;
      
      // Phím U (hoặc Ctrl+Z): hoàn tác. Không chạy khi đang di chuyển/sao chép dở.
      if (((e.key === 'u' || e.key === 'U') && !e.ctrlKey && !e.metaKey && !e.altKey) ||
          ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey)) {
        e.preventDefault();
        if (e.repeat || moveGroup || copyGroup || cursorNodeId) return;
        undo?.(() => setSelected(null));
        return;
      }

      const currentNodes = nodesRef.current || nodes;
      const currentWires = wiresRef.current || wires;
      const activeNodes = currentNodes.filter((n) => n.selected);
      const activeWires = currentWires.filter((w) => w.selected);
      
      // Phím Q: Bật/tắt bảng thuộc tính Property Panel cho đối tượng đang chọn
      if ((e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.repeat || moveGroup || copyGroup || cursorNodeId || placingType || textTool) return;
        const hasSelection = activeNodes.length > 0 || activeWires.length > 0 ||
          selected?.kind === 'node' || selected?.kind === 'wire' ||
          selected?.kind === 'node-label' || selected?.kind === 'wire-label' || selected?.kind === 'wire-name';
        if (hasSelection) {
          e.preventDefault();
          if (!selected) {
            if (activeNodes.length > 0) {
              setSelected({ kind: 'node', id: activeNodes[0].id });
            } else if (activeWires.length > 0) {
              setSelected({ kind: 'wire', id: activeWires[0].id });
            }
          }
          setIsPropertyPanelOpen?.((prev) => !prev);
          return;
        }
      }

      // Phím L: đặt tên / nhãn cho dây (Wire Label)
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.repeat || moveGroup || copyGroup || cursorNodeId || placingType || textTool) return;
        e.preventDefault();
        setIsWiringMode(false); setIsMoveMode(false); setIsCopyMode(false);
        (openWireLabelDialog || openTextDialog)?.();
        return;
      }

      // Phím T: thêm văn bản tự do trên canvas (Text)
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.repeat || moveGroup || copyGroup || cursorNodeId || placingType || textTool) return;
        e.preventDefault();
        setIsWiringMode(false); setIsMoveMode(false); setIsCopyMode(false);
        (openTextNodeDialog || openTextDialog)?.();
        return;
      }
      
      if (e.key === 'r' || e.key === 'R') {
        if (e.repeat) return;

        const isMirrorH = e.shiftKey && !e.ctrlKey && !e.metaKey;
        const isMirrorV = (e.ctrlKey || e.metaKey) && !e.shiftKey;
        const isRotate = !e.ctrlKey && !e.metaKey && !e.shiftKey;

        // Chỉ xử lý nếu là R, Ctrl+R hoặc Shift+R
        if (!isMirrorH && !isMirrorV && !isRotate) return;
        e.preventDefault();

        const isWireNameSelected = selected?.kind === 'wire-name' || moveGroup?.labelItem?.kind === 'wire-name';
        const isWireLabelSelected = selected?.kind === 'wire-label' || moveGroup?.labelItem?.kind === 'wire-label';
        const singleWire = isWireNameSelected
          ? currentWires.find((w) => w.id === (selected?.wireId || moveGroup?.labelItem?.wireId))
          : isWireLabelSelected
          ? currentWires.find((w) => w.id === (selected?.wireId || moveGroup?.labelItem?.wireId))
          : (selected?.kind === 'wire' ? currentWires.find((w) => w.id === selected.id)
          : (activeWires.length === 1 && activeNodes.length === 0 ? activeWires[0] : null));

        // 1) Thao tác trực tiếp trên nhãn dây (wire-name / wire-label)
        if (singleWire && (isWireNameSelected || isWireLabelSelected)) {
          const rp = resolvePoints(singleWire.points, nodesRef.current, singleWire.lockedVertical, wiresRef.current, singleWire.id, singleWire.routed);
          const ratio = singleWire.nameRatio ?? (singleWire.labels?.[0]?.ratio ?? 0.5);
          const mid = pointAtRatio(rp, ratio);
          e.stopPropagation();

          setWires((ws) => ws.map((w) => {
            if (w.id !== singleWire.id) return w;
            const curOffset = w.labelOffset || w.labels?.[0]?.offset || { x: 0, y: 0 };
            if (isMirrorV) return mirrorWireName(w, mid.horizontal, 'V');
            if (isMirrorH) return mirrorWireName(w, mid.horizontal, 'H');
            if (isRotate) {
              const nextOffset = { x: neg(curOffset.y), y: curOffset.x || 0 };
              const curSide = w.nameSide || (mid.horizontal ? 'above' : 'right');
              let nextSide;
              if (mid.horizontal) {
                nextSide = curSide === 'below' ? 'above' : 'below';
              } else {
                nextSide = curSide === 'left' ? 'right' : 'left';
              }
              return { ...w, nameSide: nextSide, labelOffset: nextOffset };
            }
            return w;
          }));
          return;
        }

        // 2) Chọn riêng đúng 1 dây (hoặc dây đang được chọn):
        // Nếu là dây thẳng (dọc hoặc ngang), khi lật thì hình học dây giữ nguyên 100%, chỉ lật nhãn
        if (singleWire && !moveGroup && !copyGroup && (isMirrorV || isMirrorH)) {
          const rp = resolvePoints(singleWire.points, nodesRef.current, singleWire.lockedVertical, wiresRef.current, singleWire.id, singleWire.routed);
          const isPureVertical = rp.every((p) => Math.abs(p.x - rp[0].x) < 1);
          const isPureHorizontal = rp.every((p) => Math.abs(p.y - rp[0].y) < 1);

          if (isPureVertical || isPureHorizontal) {
            const ratio = singleWire.nameRatio ?? (singleWire.labels?.[0]?.ratio ?? 0.5);
            const mid = pointAtRatio(rp, ratio);
            e.stopPropagation();
            setWires((ws) => ws.map((w) => (w.id === singleWire.id
              ? mirrorWireName(w, isPureHorizontal, isMirrorV ? 'V' : 'H')
              : w)));
            return;
          }
        }

        const targetIds = moveGroup ? moveGroup.items.map((i) => i.id)
          : copyGroup ? copyGroup.items.map((i) => i.id)
          : activeNodes.map((n) => n.id);
        if (targetIds.length === 0 && selected?.kind === 'node') targetIds.push(selected.id);

        const targetWireIds = moveGroup ? (moveGroup.wireItems || []).map((i) => i.id)
          : copyGroup ? (copyGroup.wireItems || []).map((i) => i.id)
          : activeWires.map((w) => w.id);
        if (targetWireIds.length === 0 && selected?.kind === 'wire') targetWireIds.push(selected.id);

        if (targetIds.length > 0 || targetWireIds.length > 0) {
          e.preventDefault();
          e.stopPropagation();

          setIsRotatingFlag(true);

          const targetSet = new Set(targetIds);
          const targetNodesArr = nodesRef.current.filter((n) => targetSet.has(n.id));
          const wireSet = new Set(targetWireIds);

          // Tự động gom các dây nằm trọn giữa các linh kiện trong nhóm được chọn
          wiresRef.current?.forEach((w) => {
            const allEndsInside = w.points.every((p) => !p.nodeId || targetSet.has(p.nodeId));
            const touchesAny = w.points.some((p) => p.nodeId && targetSet.has(p.nodeId));
            if (touchesAny && allEndsInside) wireSet.add(w.id);
          });

          if (targetNodesArr.length === 0 && wireSet.size === 0) {
            setIsRotatingFlag(false);
            return;
          }

          // XÁC ĐỊNH TÂM XOAY / LẬT:
          // Nếu chỉ chọn đúng 1 linh kiện và không có dây -> xoay quanh tâm (40, 50) của chính nó
          // Nếu bôi đen cả cụm (nhiều linh kiện hoặc có dây) -> xoay quanh tâm bounding box của toàn bộ cụm!
          let cx, cy;
          const isSingleNode = targetNodesArr.length === 1 && wireSet.size === 0;

          if (isSingleNode) {
            const n = targetNodesArr[0];
            cx = n.position.x + 40;
            cy = n.position.y + 50;
          } else {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            targetNodesArr.forEach((n) => {
              if (n.type === 'text') {
                minX = Math.min(minX, n.position.x);
                maxX = Math.max(maxX, n.position.x + 60);
                minY = Math.min(minY, n.position.y);
                maxY = Math.max(maxY, n.position.y + 30);
              } else {
                const box = getSymbolBBox(n);
                minX = Math.min(minX, box.x1);
                maxX = Math.max(maxX, box.x2);
                minY = Math.min(minY, box.y1);
                maxY = Math.max(maxY, box.y2);
              }
            });

            wireSet.forEach((wId) => {
              const w = wiresRef.current?.find((x) => x.id === wId);
              if (w) {
                w.points.forEach((p) => {
                  minX = Math.min(minX, p.x);
                  maxX = Math.max(maxX, p.x);
                  minY = Math.min(minY, p.y);
                  maxY = Math.max(maxY, p.y);
                });
              }
            });

            if (!Number.isFinite(minX)) {
              setIsRotatingFlag(false);
              return;
            }

            // Làm tròn tâm theo ô lưới GRID để mọi điểm và linh kiện sau biến đổi luôn nằm đúng lưới
            cx = Math.round(((minX + maxX) / 2) / GRID) * GRID;
            cy = Math.round(((minY + maxY) / 2) / GRID) * GRID;
          }

          // Phép biến đổi toạ độ quanh tâm (cx, cy) hoặc bounding box:
          const rotatePt = (x, y) => ({
            x: cx - (y - cy),
            y: cy + (x - cx),
          });

          const flipHPt = (x, y) => ({
            x: isSingleNode ? (2 * cx - x) : ((minX + maxX) - x),
            y,
          });

          const flipVPt = (x, y) => ({
            x: isSingleNode ? (2 * cy - y) : ((minY + maxY) - y),
            y,
          });

          const transformPt = (x, y) => {
            if (isMirrorH) return flipHPt(x, y);
            if (isMirrorV) return flipVPt(x, y);
            return rotatePt(x, y);
          };

          const snapPt = (p) => ({
            x: Math.round(p.x / GRID) * GRID,
            y: Math.round(p.y / GRID) * GRID,
          });

          // 1. Biến đổi các linh kiện trong nhóm:
          const newNodesFull = nodesRef.current.map((n) => {
            if (!targetSet.has(n.id)) return n;

            // Văn bản tự do: chỉ biến đổi vị trí theo cụm
            if (n.type === 'text') {
              const np = snapPt(transformPt(n.position.x, n.position.y));
              return { ...n, position: { x: np.x, y: np.y } };
            }

            // Hình chữ nhật / Box: biến đổi vị trí và hoán đổi kích thước khi xoay
            if (n.type === 'rect' || n.type === 'box') {
              const rw = n.data?.width || 160;
              const rh = n.data?.height || 100;
              const rcx = n.position.x + rw / 2;
              const rcy = n.position.y + rh / 2;
              const nrc = snapPt(transformPt(rcx, rcy));
              if (isMirrorH || isMirrorV) {
                return {
                  ...n,
                  position: { x: Math.round((nrc.x - rw / 2) / GRID) * GRID, y: Math.round((nrc.y - rh / 2) / GRID) * GRID },
                };
              }
              return {
                ...n,
                position: { x: Math.round((nrc.x - rh / 2) / GRID) * GRID, y: Math.round((nrc.y - rw / 2) / GRID) * GRID },
                data: { ...n.data, width: rh, height: rw },
              };
            }

            // Linh kiện thông thường:
            const worldCx = n.position.x + 40;
            const worldCy = n.position.y + 50;
            const np = snapPt(transformPt(worldCx, worldCy));

            const curRot = n.data?.rot || 0;
            const curFlip = n.data?.flip || false;

            let nextRot = curRot;
            let nextFlip = curFlip;

            if (isMirrorH) {
              // Lật ngang (Shift+R): (360 - rot) % 360, đảo cờ flip
              nextRot = (360 - curRot) % 360;
              nextFlip = !curFlip;
            } else if (isMirrorV) {
              // Lật dọc (Ctrl+R): (180 - rot + 360) % 360, đảo cờ flip
              nextRot = (180 - curRot + 360) % 360;
              nextFlip = !curFlip;
            } else {
              // Xoay 90 độ CW (R): cộng 90 độ, giữ nguyên flip
              nextRot = (curRot + 90) % 360;
            }

            return {
              ...n,
              position: { x: np.x - 40, y: np.y - 50 },
              data: {
                ...n.data,
                rot: nextRot,
                flip: nextFlip,
              },
            };
          });

          // 2. Biến đổi toàn bộ các dây điện trong cụm:
          // GIỮ NGUYÊN TOÀN BỘ CÁC ĐIỂM (WAYPOINTS) VÀ XOAY / LẬT CẢ DÂY NGUYÊN VẸN!
          const newWiresFull = wiresRef.current.map((w) => {
            if (!wireSet.has(w.id)) return w;

            const newPoints = w.points.map((p) => {
              const np = snapPt(transformPt(p.x, p.y));
              return {
                ...p,
                x: np.x,
                y: np.y,
              };
            });

            const isHoriz = Math.abs(newPoints[newPoints.length - 1].y - newPoints[0].y) <= Math.abs(newPoints[newPoints.length - 1].x - newPoints[0].x);
            let nextSide = w.nameSide;
            let nextOffset = w.labelOffset ? { ...w.labelOffset } : { x: 0, y: 0 };
            if (isMirrorV) {
              const curSide = w.nameSide || (isHoriz ? 'above' : 'right');
              nextSide = curSide === 'below' ? 'above' : 'below';
              nextOffset.y = neg(nextOffset.y);
            } else if (isMirrorH) {
              const curSide = w.nameSide || (isHoriz ? 'above' : 'right');
              nextSide = curSide === 'left' ? 'right' : 'left';
              nextOffset.x = neg(nextOffset.x);
            } else if (isRotate) {
              const curSide = w.nameSide || (isHoriz ? 'above' : 'right');
              if (curSide === 'above') nextSide = 'right';
              else if (curSide === 'right') nextSide = 'below';
              else if (curSide === 'below') nextSide = 'left';
              else if (curSide === 'left') nextSide = 'above';
              nextOffset = { x: neg(nextOffset.y), y: nextOffset.x };
            }

            const updatedLabels = (w.labels || []).map((l) => {
              if (isMirrorV) return mirrorLabelObj(l, isHoriz, 'V');
              if (isMirrorH) return mirrorLabelObj(l, isHoriz, 'H');
              return l;
            });

            return {
              ...w,
              points: newPoints,
              ...(nextSide !== undefined ? { nameSide: nextSide } : {}),
              labelOffset: nextOffset,
              labels: updatedLabels,
              routed: false,
            };
          });

          setNodes(newNodesFull);
          setWires(newWiresFull);

          // Rebase moveGroup và copyGroup
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
        if (isPropertyPanelOpen) {
          setIsPropertyPanelOpen(false);
          return;
        }
        if (moveGroup?.labelItem) {
          const { labelItem } = moveGroup;
          if (labelItem.kind === 'node-label') {
            setNodes((ns) => ns.map((n) => (n.id === labelItem.nodeId
              ? { ...n, data: { ...n.data, labelOffset: labelItem.initialOffset } }
              : n)));
          } else if (labelItem.kind === 'wire-label') {
            setWiresRaw((ws) => ws.map((w) => (w.id === labelItem.wireId
              ? {
                  ...w,
                  labels: (w.labels || []).map((lbl) => (lbl.id === labelItem.labelId ? { ...lbl, ratio: labelItem.initialRatio, offset: labelItem.initialOffset || { x: 0, y: 0 } } : lbl)),
                }
              : w)));
          } else if (labelItem.kind === 'wire-name') {
            setWiresRaw((ws) => ws.map((w) => (w.id === labelItem.wireId ? { ...w, nameRatio: labelItem.initialRatio, labelOffset: labelItem.initialOffset || { x: 0, y: 0 } } : w)));
          }
          setMoveGroup(null);
          setIsMoveMode(false);
          return;
        }
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
        cancelTextTool?.();
        return;
      }

      if (moveGroup || copyGroup || cursorNodeId || textTool) return;

      if (e.key === 'm' || e.key === 'M') {
        if (selected?.kind === 'node-label') {
          e.preventDefault();
          const targetNodeId = selected.nodeId || selected.id;
          const n = nodes.find((x) => x.id === targetNodeId);
          if (!n) return;
          const flowPos = screenToFlowPosition(lastMouse.current);
          setMoveGroup({
            startX: Math.round(flowPos.x / GRID) * GRID,
            startY: Math.round(flowPos.y / GRID) * GRID,
            labelItem: {
              kind: 'node-label',
              nodeId: n.id,
              initialOffset: n.data?.labelOffset || { x: 0, y: 0 },
            },
          });
          setIsMoveMode(true);
          return;
        }

        if (selected?.kind === 'wire-label') {
          e.preventDefault();
          const w = (wiresRef.current || wires).find((x) => x.id === selected.wireId);
          const l = w?.labels?.find((x) => x.id === selected.labelId);
          if (!w || !l) return;
          const flowPos = screenToFlowPosition(lastMouse.current);
          setMoveGroup({
            startX: Math.round(flowPos.x / GRID) * GRID,
            startY: Math.round(flowPos.y / GRID) * GRID,
            labelItem: {
              kind: 'wire-label',
              wireId: w.id,
              labelId: l.id,
              initialOffset: l.offset || { x: 0, y: 0 },
              initialRatio: l.ratio ?? 0.5,
            },
          });
          setIsMoveMode(true);
          return;
        }

        if (selected?.kind === 'wire-name') {
          e.preventDefault();
          const w = wires.find((x) => x.id === selected.wireId);
          if (!w) return;
          const flowPos = screenToFlowPosition(lastMouse.current);
          setMoveGroup({
            startX: Math.round(flowPos.x / GRID) * GRID,
            startY: Math.round(flowPos.y / GRID) * GRID,
            labelItem: {
              kind: 'wire-name',
              wireId: w.id,
              initialOffset: w.labelOffset || { x: 0, y: 0 },
              initialRatio: w.nameRatio ?? 0.5,
            },
          });
          setIsMoveMode(true);
          return;
        }
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
          const existingIds = new Set(nodes.map((n) => n.id));
          const existingRefs = new Set(nodes.map((n) => n.data?.reference).filter(Boolean));
          const reserved = new Set();
          const genId = (prefix) => {
            let i = 1;
            const cleanPrefix = prefix.replace(/_$/, '');
            const isDevicePrefix = ['M', 'Q', 'R', 'C', 'U', 'V', 'I'].includes(cleanPrefix) || prefix.endsWith('_');
            const checkExists = (num) => {
              const v1 = `${cleanPrefix}_{${num}}`;
              const v2 = `${cleanPrefix}_${num}`;
              const v3 = `${cleanPrefix}${num}`;
              const v4 = `${prefix}${num}`;
              return existingIds.has(v1) || existingIds.has(v2) || existingIds.has(v3) || existingIds.has(v4) ||
                     existingRefs.has(v1) || existingRefs.has(v2) || existingRefs.has(v3) || existingRefs.has(v4) ||
                     reserved.has(v1) || reserved.has(v2) || reserved.has(v3) || reserved.has(v4);
            };
            while (checkExists(i)) {
              i++;
            }
            const id = isDevicePrefix ? `${cleanPrefix}_{${i}}` : `${prefix}${i}`;
            reserved.add(id);
            return id;
          };

          const idMap = new Map(); // old nodeId -> new nodeId
          const newNodes = targetNodes.map((n) => {
            const rawPrefix = n.type === 'text' ? 'TXT' : ((n.data?.reference || 'U').replace(/[0-9{}]/g, '') || 'U');
            const prefix = (['M', 'Q', 'R', 'C', 'U', 'V', 'I'].includes(rawPrefix.replace(/_$/, '')))
              ? `${rawPrefix.replace(/_$/, '')}_`
              : rawPrefix;
            const newId = genId(prefix);
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              data: n.type === 'text' ? { ...n.data } : { ...n.data, reference: n.type === 'vdd' ? n.data.reference : newId },
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
            return { id: wireIdMap.get(w.id), points, net: w.net, name: w.name, color: w.color, labels: (w.labels || []).map((l) => ({ ...l })), selected: false };
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
      else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setQuickAddOpen(true); setSelected(null); }
      else if (e.key === ' ' || e.code === 'Space') {
        if (!isWiringMode && !placingType && !isMoveMode && !isCopyMode) {
          if (selected?.kind === 'node') {
            const targetNode = nodes.find((n) => n.id === selected.id);
            if (targetNode && ['sw_open', 'sw_closed', 'sw_spdt', 'sw_sp3t', 'sw_sp4t'].includes(targetNode.type)) {
              e.preventDefault();
              onToggleSwitch?.(targetNode.id);
            }
          }
        }
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isWiringMode && !placingType && (activeNodes.length > 0 || activeWires.length > 0 || selected)) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [isWiringMode, isMoveMode, isCopyMode, placingType, selected, moveGroup, copyGroup, cursorNodeId, nodes, wires, deleteSelected, setNodes, setWiresRaw, screenToFlowPosition, fitView, undo, textTool, openWireLabelDialog, openTextNodeDialog, openTextDialog, cancelTextTool, canEdit, isPropertyPanelOpen, setIsPropertyPanelOpen, onToggleSwitch]);
}