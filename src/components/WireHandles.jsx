import React, { useRef } from 'react';
import { GRID } from '../constants';
import { resolvePoints } from '../routing/resolveWire';
import { snapPoint } from '../wires/snap';
import { computeDraggedWire, computeEndpointDrag } from '../wires/wireOps';

function WireHandles({ wire, nodes, wires, setWires, screenToFlowPosition }) {
  const dragRef = useRef(null); // { kind: 'end'|'mid', initialPoints, ... }

  // displayPts dùng resolvePoints để khớp 100% với đường nét vẽ trên Canvas SVG
  const displayPts = resolvePoints(wire.points, nodes, wire.lockedVertical, wires, wire.id, wire.routed);

  const startEndDrag = (e, index) => {
    e.stopPropagation();
    e.preventDefault();
    const isStart = index === 0;

    // Chốt mốc ban đầu từ displayPts để không bị trôi sai số tích lũy qua các frame
    dragRef.current = {
      kind: 'end',
      isStart,
      initialPoints: displayPts.map((p) => ({ ...p })),
    };

    const onMove = (ev) => {
      const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const d = dragRef.current;
      if (!d || d.kind !== 'end') return;
      const snapped = snapPoint(flowPos, nodes, wires.filter((w) => w.id !== wire.id));
      const newPts = computeEndpointDrag(d.initialPoints, d.isStart, snapped);
      setWires((ws) => ws.map((w) => {
        if (w.id !== wire.id) return w;
        return { ...w, points: newPts, routed: false };
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

    const A = displayPts[segIndex];
    const B = displayPts[segIndex + 1];
    if (!A || !B) return;

    const horizontal = Math.abs(A.y - B.y) < 1;
    const fixedAxis = horizontal ? 'y' : 'x';

    // Chốt mốc cố định: initialPoints từ displayPts, segIndex và trục di chuyển
    dragRef.current = {
      kind: 'mid',
      segIndex,
      fixedAxis,
      initialPoints: displayPts.map((p) => ({ ...p })),
    };

    const onMove = (ev) => {
      const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const d = dragRef.current;
      if (!d || d.kind !== 'mid') return;
      const gx = Math.round(flowPos.x / GRID) * GRID;
      const gy = Math.round(flowPos.y / GRID) * GRID;
      const newVal = d.fixedAxis === 'y' ? gy : gx;

      const newPts = computeDraggedWire(d.initialPoints, d.segIndex, newVal);
      setWires((ws) => ws.map((w) => {
        if (w.id !== wire.id) return w;
        return { ...w, points: newPts, routed: false };
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

export default WireHandles;