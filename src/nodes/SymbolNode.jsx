import React from 'react';
import { Handle, Position } from 'reactflow';
import { SYMBOLS } from '../symbols';
import { getPorts, getSymbolBox } from '../constants';

// Vị trí + phía của chữ (chưa xoay), toạ độ trong node 160x100. Loại nào không có mục = không hiện chữ.
const LABELS = {
  vdd:     { x: 50, y: 45, side: 'top' },
  opamp:   { x: 36, y: 16, side: 'top' },
  fdopamp: { x: 36, y: 16, side: 'top' },
};

const SIDE_VEC = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] };
const vecToSide = ([x, y]) => (x > 0 ? 'right' : x < 0 ? 'left' : y > 0 ? 'bottom' : 'top');
const dirToPosition = ({ x, y }) =>
  (x < 0 ? Position.Left : x > 0 ? Position.Right : y < 0 ? Position.Top : Position.Bottom);

// Lật ngang rồi xoay quanh tâm (giống CSS `rotate() scaleX()` của node)
function transformVec(dx, dy, flip, rot) {
  if (flip) dx = -dx;
  const a = ((rot % 360) + 360) % 360;
  if (a === 90) return [-dy, dx];
  if (a === 180) return [-dx, -dy];
  if (a === 270) return [dy, -dx];
  return [dx, dy];
}

export default function SymbolNode({ data, selected, type }) {
  const Symbol = SYMBOLS[type];
  const ports = getPorts(type);
  const box = getSymbolBox(type);
  const rot = data.rot || 0;
  const flip = data.flip || false;
  const transformStr = `rotate(${rot}deg) scaleX(${flip ? -1 : 1})`;

  let label = null;
  const cfg = LABELS[type];
  if (cfg) {
    const [rx, ry] = transformVec(cfg.x - 40, cfg.y - 50, flip, rot);
    const side = vecToSide(transformVec(...SIDE_VEC[cfg.side], flip, rot));
    label = { x: 40 + rx, y: 50 + ry, side };
  }
  const labelTransform = label && {
    right:  'translate(0, -50%)',
    left:   'translate(-100%, -50%)',
    top:    'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
  }[label.side];
  const isVerticalSide = label && (label.side === 'top' || label.side === 'bottom');

  return (
    <div style={{ position: 'relative', width: '160px', height: '100px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', height: '100%', transform: transformStr, transformOrigin: '40px 50px' }}>
        {ports.map((p) => (
          <Handle key={p.id} type="source" position={dirToPosition(p.dir)} id={p.id}
            style={{ left: `${p.x}px`, top: `${p.y}px`, transform: 'translate(-50%,-50%)', opacity: 0,
                     width: 20, height: 20, zIndex: 100, border: 'none' }} />
        ))}

        {selected && (
          <div style={{
            position: 'absolute',
            left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`,
            border: '2px solid #1677ff', borderRadius: '3px',
            background: 'rgba(22, 119, 255, 0.08)',
            boxShadow: '0 0 0 3px rgba(22, 119, 255, 0.15)',
            pointerEvents: 'none', zIndex: 5,
          }} />
        )}

        <svg width="160" height="100" viewBox="0 0 160 100" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
          <Symbol strokeWidth={2} />
        </svg>
      </div>

      {label && (
        <div style={{
          position: 'absolute',
          left: `${label.x}px`, top: `${label.y}px`,
          transform: labelTransform,
          display: 'flex', flexDirection: 'column',
          alignItems: isVerticalSide ? 'center' : (label.side === 'left' ? 'flex-end' : 'flex-start'),
          whiteSpace: 'nowrap', pointerEvents: 'none',
          fontFamily: 'sans-serif', lineHeight: 1.15,
        }}>
          <div style={{ fontWeight: 900, fontSize: '13px', fontStyle: 'italic' }}>
            {data.reference}
          </div>
        </div>
      )}
    </div>
  );
}