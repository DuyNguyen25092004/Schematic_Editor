import React, { useRef } from 'react';
import { GRID } from '../constants';
import { resolveSkeleton } from '../routing/resolveWire';
import { snapPoint } from '../wires/snap';
import { fixOrthogonalChain, offsetSegment } from '../wires/wireOps';
import { simplifyMiddle } from '../geometry/pathUtils';

function WireHandles({ wire, nodes, wires, setWires, screenToFlowPosition }) {
  const dragRef = useRef(null); // { kind: 'end'|'mid', index, segIndex, fixedAxis }

  const displayPts = resolveSkeleton(wire.points, nodes, wires, wire.id, wire.routed);

  const startEndDrag = (e, index) => {
    e.stopPropagation();
    e.preventDefault();
    // Chốt VAI TRÒ (đầu đầu hay đầu cuối) thay vì chốt index tuyệt đối —
    // vì simplifyMiddle() có thể làm mảng points co lại giữa chừng lúc đang kéo,
    // khiến index cũ (ví dụ 2) không còn hợp lệ nữa (mảng chỉ còn 2 phần tử).
    const isStart = index === 0;
    dragRef.current = { kind: 'end', isStart };

    const onMove = (ev) => {
      const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const d = dragRef.current;
      if (!d || d.kind !== 'end') return;
      const snapped = snapPoint(flowPos, nodes, wires.filter((w) => w.id !== wire.id));
      setWires((ws) => ws.map((w) => {
        if (w.id !== wire.id) return w;
        const before = w.points;
        if (before.length < 2) return w;               // an toàn tuyệt đối
        const idx = d.isStart ? 0 : before.length - 1;  // luôn tính LẠI theo độ dài HIỆN TẠI
        const pts = before.map((p) => ({ ...p }));
        pts[idx] = snapped;
        const fixed = fixOrthogonalChain(before, pts, idx);
        const simplified = simplifyMiddle(fixed);
        return { ...w, points: simplified, routed: false };
      }));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startSegDrag = (e, segIndex) => {
    e.stopPropagation();
    e.preventDefault();

    // Chốt trục 1 lần lúc mousedown (dựa theo hướng đoạn ngay lúc bắt đầu kéo)
    const points = wire.points.map((p) => ({ ...p }));
    const i = segIndex;
    const pi = points[i], pj = points[i + 1];
    if (!pi || !pj) return;
    const piPinned = !!(pi.nodeId || pi.onWireId);
    const pjPinned = !!(pj.nodeId || pj.onWireId);
    const horizontal = Math.abs(pi.y - pj.y) < 1;
    const fixedAxis = horizontal ? 'y' : 'x';
    let fixedSegIndex = segIndex;

    if (piPinned || pjPinned) {
      const along = horizontal ? 'x' : 'y';
      const newVal = pi[fixedAxis];
      const mid = [];
      const newPi = { ...pi };
      const newPj = { ...pj };
      if (piPinned) mid.push({ [along]: pi[along], [fixedAxis]: newVal });
      else newPi[fixedAxis] = newVal;
      if (pjPinned) mid.push({ [along]: pj[along], [fixedAxis]: newVal });
      else newPj[fixedAxis] = newVal;

      const before = points.slice(0, i);
      const after = points.slice(i + 2);
      const newPoints = [...before, newPi, ...mid, newPj, ...after];
      fixedSegIndex = i + (piPinned ? 1 : 0);

      setWires((ws) => ws.map((w) =>
        w.id === wire.id ? { ...w, points: newPoints, routed: false } : w
      ));
    }

    dragRef.current = { kind: 'mid', segIndex: fixedSegIndex, fixedAxis };

    const onMove = (ev) => {
      const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const d = dragRef.current;
      if (!d || d.kind !== 'mid') return;
      const gx = Math.round(flowPos.x / GRID) * GRID;
      const gy = Math.round(flowPos.y / GRID) * GRID;
      const newVal = d.fixedAxis === 'y' ? gy : gx;
      setWires((ws) => ws.map((w) => {
        if (w.id !== wire.id) return w;
        const before = w.points;
        if (d.segIndex < 0 || d.segIndex + 1 >= before.length) return w; // guard
        const offset = offsetSegment(before, d.segIndex, newVal);
        const fixed = fixOrthogonalChain(before, offset, d.segIndex);
        const simplified = simplifyMiddle(fixed);
        return { ...w, points: simplified, routed: false };
      }));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      {displayPts.length >= 2 && displayPts.slice(0, -1).map((p, i) => {
        const q = displayPts[i + 1];
        const isHorizontal = Math.abs(p.y - q.y) < 1;
        return (
          <line
            key={`seg-${i}`}
            x1={p.x} y1={p.y} x2={q.x} y2={q.y}
            stroke="transparent" strokeWidth={14}
            style={{ cursor: isHorizontal ? 'ns-resize' : 'ew-resize', pointerEvents: 'all', userSelect: 'none' }}
            onMouseDown={(e) => startSegDrag(e, i)}
            onClick={(e) => e.stopPropagation()}
          />
        );
      })}

      {displayPts.length >= 2 && [0, displayPts.length - 1].map((idx) => (
        <circle
          key={`end-${idx}`}
          cx={displayPts[idx].x} cy={displayPts[idx].y} r={6}
          fill="#fff" stroke="#1677ff" strokeWidth={2}
          style={{ cursor: 'pointer', pointerEvents: 'all', userSelect: 'none' }}
          onMouseDown={(e) => startEndDrag(e, idx)}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </>
  );
}

export default WireHandles