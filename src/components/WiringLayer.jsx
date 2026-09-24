import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useReactFlow, useStore } from 'reactflow';
import { snapPoint } from '../wires/snap';
import { getJunctionDots } from '../wires/wireOps';
import { resolvePoints } from '../routing/resolveWire';
import WireHandles from './WireHandles';
import { orthoPath, pointsToPolyline, midOfPolyline } from '../geometry/pathUtils';

function WiringLayer({ isWiringMode, isBoxSelecting, nodes, wires, setWires, selected, setSelected }) {  
  const { screenToFlowPosition } = useReactFlow();
  const [draft, setDraft] = useState(null);
  const [cursor, setCursor] = useState(null);
  const clickTimer = useRef(null);

  const transform = useStore((s) => s.transform);
  const [tx, ty, zoom] = transform;

  useEffect(() => {
    if (!isWiringMode) { setDraft(null); setCursor(null); }
  }, [isWiringMode]);

  useEffect(() => {
    const onKey = (e) => {
      if (!isWiringMode) return;
      if (e.key === 'Backspace' && draft) {
        e.preventDefault();
        setDraft(draft.length <= 1 ? null : draft.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWiringMode, draft]);

  const toFlow = useCallback(
    // Gọi hàm snapPoint mới, truyền thêm wires vào
    (e) => snapPoint(screenToFlowPosition({ x: e.clientX, y: e.clientY }), nodes, wires),
    [screenToFlowPosition, nodes, wires]
  );

  const handleMove = (e) => setCursor(toFlow(e));

  const handleClick = (e) => {
    if (clickTimer.current) return;
    const p = toFlow(e); // p có thể có onWireId/arcRatio từ snapPoint
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setDraft((prev) => {
        if (!prev) return [p]; // OK — p giữ nguyên object đầy đủ field từ snapPoint
        const last = prev[prev.length - 1];
        if (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) return prev;
        return [...prev, ...orthoPath(last, p).slice(1)]; // orthoPath giờ dùng bind() đã sửa — giữ được onWireId
      });
    }, 220);
  };
    const draftRef = useRef(null);
    useEffect(() => { draftRef.current = draft; }, [draft]);
    
    const handleDoubleClick = (e) => {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      const prev = draftRef.current;
      if (!prev) return;
      const p = toFlow(e);
      const last = prev[prev.length - 1];
      const pts = (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1)
        ? prev
        : [...prev, ...orthoPath(last, p).slice(1)];
      if (pts.length >= 2) {
        const id = `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setWires((ws) => [...ws, { id, points: pts }]);
      }
      setDraft(null);
    };

  const preview = draft && cursor ? orthoPath(draft[draft.length - 1], cursor) : null;

  

  return (
    <>
      <div
        onMouseMove={isWiringMode ? handleMove : undefined}
        onClick={isWiringMode ? handleClick : undefined}
        onDoubleClick={isWiringMode ? handleDoubleClick : undefined}
        style={{
          position: 'absolute', inset: 0, zIndex: 5,
          pointerEvents: isWiringMode ? 'auto' : 'none',
          cursor: isWiringMode ? 'crosshair' : 'default',
        }}
      />

      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: 0, height: 0,
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', userSelect: 'none' }}>
            {wires.map((w) => {
              const rp = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
              const pts = pointsToPolyline(rp);
              const isSel = w.selected || (selected?.kind === 'wire' && selected.id === w.id);
              const wireColor = w.color || '#000';
              const mid = w.name ? midOfPolyline(rp) : null;
              return (
                <g key={w.id}>
                  <polyline
                    points={pts} fill="none" stroke="transparent" strokeWidth={10}
                    style={{
                      pointerEvents: (isWiringMode || isBoxSelecting) ? 'none' : 'stroke',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected({ kind: 'wire', id: w.id });
                      setWires(ws => ws.map(wire => ({ ...wire, selected: wire.id === w.id })));
                    }}
                  />
                  {isSel && (
                    <polyline
                      points={pts} fill="none" pointerEvents="none"
                      stroke="#1677ff" strokeOpacity={0.5} strokeWidth={6}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  )}
                  <polyline
                    points={pts} fill="none" pointerEvents="none"
                    stroke={wireColor}
                    strokeWidth={isSel ? 2.5 : 2}
                    strokeLinecap="square" strokeLinejoin="miter"
                    shapeRendering="crispEdges"
                  />
                  {mid && (
                    <text
                      x={mid.x} y={mid.y - 4}
                      textAnchor="middle" fontSize={11} fontFamily="sans-serif"
                      fill={isSel ? '#1677ff' : wireColor}
                      pointerEvents="none"
                      style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}
                    >
                      {w.name}
                    </text>
                  )}
                </g>
              );
            })}
          
          {/* 1. Render tất cả các dấu chấm giao nhau (Solder Dots) của các dây cố định */}
          {getJunctionDots(wires, nodes).map((dot, idx) => (
            <circle key={`dot-${idx}`} cx={dot.x} cy={dot.y} r={3.5} fill="#000" pointerEvents="none" />
          ))}

          {/* Handle chỉnh sửa dây đang được chọn — chỉ hiện khi KHÔNG đang wiring/box-select */}
          {!isWiringMode && !isBoxSelecting && selected?.kind === 'wire' && (() => {
            const w = wires.find((x) => x.id === selected.id);
            return w ? (
              <WireHandles
                wire={w}
                nodes={nodes}
                wires={wires}
                setWires={setWires}
                screenToFlowPosition={screenToFlowPosition}
              />
            ) : null;
          })()}

          {/* 2. Dây đang vẽ phác (Draft) */}
          {draft && (
            <polyline points={pointsToPolyline(draft)} fill="none" stroke="#000"
                       strokeWidth={2} strokeLinecap="square" shapeRendering="crispEdges" />
          )}
          {preview && (
            <polyline points={pointsToPolyline(preview)} fill="none" stroke="#ff4d4f"
                       strokeWidth={2} strokeDasharray="4 3" />
          )}
          
          {/* 3. Con trỏ chuột: Hiện chấm đỏ nếu vào chân, chấm ĐEN nếu vào dây, chấm xám nếu rảnh */}
          {isWiringMode && cursor && (
            <circle 
              cx={cursor.x} 
              cy={cursor.y} 
              r={cursor.portId || cursor.onWireId ? 4 : 2.5}
              fill={cursor.portId ? '#ff4d4f' : (cursor.onWireId ? '#000' : '#888')} 
            />
          )}
        </svg>
      </div>
    </>
  );
}

export default  WiringLayer