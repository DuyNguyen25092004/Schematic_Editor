import React from 'react';
import { Handle, Position, useStore } from 'reactflow';
import { SYMBOLS } from '../symbols';
import { GRID, VDD_BAR, getPorts, getSymbolBox, getVddSpan } from '../constants';
import LatexText, { formatLatexRef } from '../components/LatexText';

const GATE_LABEL = { x: 40, y: 35, side: 'top' };
const LABELS = {
  opamp:   { x: 36, y: 16, side: 'top' },
  fdopamp: { x: 36, y: 16, side: 'top' },
  inverter: { x: 35, y: 35, side: 'top' },
  buffer:   { x: 35, y: 35, side: 'top' },
  and:      GATE_LABEL,
  or:       GATE_LABEL,
  nand:     GATE_LABEL,
  nor:      GATE_LABEL,
  xor:      GATE_LABEL,
  xnor:     GATE_LABEL,
};
const SIDE_VEC = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] };
const vecToSide = ([x, y]) => (x > 0 ? 'right' : x < 0 ? 'left' : y > 0 ? 'bottom' : 'top');
const dirToPosition = ({ x, y }) =>
  (x < 0 ? Position.Left : x > 0 ? Position.Right : y < 0 ? Position.Top : Position.Bottom);

function transformVec(dx, dy, flip, rot) {
  if (flip) dx = -dx;
  const a = ((rot % 360) + 360) % 360;
  if (a === 90) return [-dy, dx];
  if (a === 180) return [-dx, -dy];
  if (a === 270) return [dy, -dx];
  return [dx, dy];
}

export default function SymbolNode({ data, selected, type }) {
  const zoom = useStore((s) => s.transform[2]);
  const strokeScale = Math.max(0.2, Math.min(1, zoom || 1));
  const sw = 1.5 / strokeScale;
  const Symbol = SYMBOLS[type];
  const ports = getPorts(type, data);
  const box = getSymbolBox(type, data);
  const rot = data.rot || 0;
  const flip = data.flip || false;
  const transformStr = `rotate(${rot}deg) scaleX(${flip ? -1 : 1})`;

  // VDD rail: thanh có thể kéo dài -> vùng vẽ và vị trí nhãn phụ thuộc data.len
    // VDD rail: thanh có thể kéo dài -> vùng vẽ và vị trí nhãn phụ thuộc data.left / data.len
  const isVdd = type === 'vdd';
  const span = isVdd ? getVddSpan(data) : null;
  const vddEnd = isVdd ? VDD_BAR.x0 + span.right * GRID : 0;
  // Vùng vẽ SVG: mở rộng cả sang trái (x âm) lẫn phải khi thanh được kéo dài
  const svgX0 = isVdd ? Math.min(0, VDD_BAR.x0 - span.left * GRID - 10) : 0;
  const svgW = (isVdd ? Math.max(160, vddEnd + 20) : 160) - svgX0;

  let label = null;
  const cfg = isVdd ? { x: vddEnd + 8, y: VDD_BAR.y, side: 'right' } : LABELS[type];
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
        {!isVdd && ports.map((p) => (
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

        {/* VDD: vùng bấm trong suốt phủ đúng thanh (thanh có thể dài hơn khung 160px) */}
        {isVdd && (
          <div style={{
            position: 'absolute', left: `${box.x}px`, top: `${box.y}px`,
            width: `${box.w}px`, height: `${box.h}px`, zIndex: 4,
          }} />
        )}
        <div style={{ position: 'absolute', left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, pointerEvents: 'all' }} />
        <svg width={svgW} height="100" viewBox={`${svgX0} 0 ${svgW} 100`}
            style={{ position: 'absolute', left: svgX0, top: 0, pointerEvents: 'none' }}>
        <Symbol strokeWidth={sw} data={data} />
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
          <LatexText
            text={formatLatexRef(data.reference, isVdd)}
            latex={true}
            size={isVdd ? 16 : 14}
            color="#000"
          />
        </div>
      )}
    </div>
  );
}