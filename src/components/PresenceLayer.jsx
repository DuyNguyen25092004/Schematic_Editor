import React from 'react';
import { useStore } from 'reactflow';
import { getSymbolBBox } from '../geometry/ports';
import { pointsToPolyline } from '../geometry/pathUtils';
import { resolvePoints } from '../routing/resolveWire';


// ============ CON TRỎ + VIỀN CHỌN CỦA NGƯỜI KHÁC ============
function PresenceLayer({ others, nodes, wires }) {
  const [tx, ty, zoom] = useStore((s) => s.transform);
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: 0, height: 0,
      transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
      transformOrigin: '0 0', pointerEvents: 'none', zIndex: 6,
    }}>
      <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
        {Object.entries(others).map(([uid, u]) => {
          const color = u.color || '#888';
          const ids = (u.sel || '').split(',').filter(Boolean);
          const label = u.name || '?';
          return (
            <g key={uid}>
              {ids.map((id) => {
                const n = nodes.find((n) => n.id === id);
                if (n) {
                  const b = getSymbolBBox(n);
                  return (
                    <rect key={id} x={b.x1 - 3} y={b.y1 - 3}
                          width={b.x2 - b.x1 + 6} height={b.y2 - b.y1 + 6}
                          fill={color} fillOpacity={0.08}
                          stroke={color} strokeWidth={2} strokeDasharray="4 3" />
                  );
                }
                const w = wires.find((w) => w.id === id);
                if (w) {
                  return (
                    <polyline key={id}
                      points={pointsToPolyline(resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed))}
                      fill="none" stroke={color} strokeWidth={5} strokeOpacity={0.35}
                      strokeLinecap="round" strokeLinejoin="round" />
                  );
                }
                return null;
              })}
              {u.x != null && u.y != null && (
                <g transform={`translate(${u.x},${u.y}) scale(${1 / zoom})`}>
                  <path d="M0,0 L0,16 L4.5,12 L8,19 L10.5,18 L7,11 L13,11 Z"
                        fill={color} stroke="#fff" strokeWidth={1} />
                  <rect x={12} y={16} rx={4} height={18} width={label.length * 7 + 12} fill={color} />
                  <text x={18} y={29} fontSize={11} fontFamily="sans-serif" fontWeight={600} fill="#fff">
                    {label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default PresenceLayer