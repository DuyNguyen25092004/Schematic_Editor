import React from 'react';
import { Handle, Position } from 'reactflow';

function getLabelAnchor(rot, flip) {
  const cx = 40, cy = 50;
  const hDist = 18;
  const vDist = 16;
  let dx = hDist, dy = 0;
  if (flip) dx = -dx;

  const angle = ((rot % 360) + 360) % 360;
  let rx = dx, ry = dy;
  if (angle === 90) { rx = -dy; ry = dx; }
  else if (angle === 180) { rx = -dx; ry = -dy; }
  else if (angle === 270) { rx = dy; ry = -dx; }

  if (rx !== 0) rx = rx > 0 ? hDist : -hDist;
  if (ry !== 0) ry = ry > 0 ? vDist : -vDist;

  let side;
  if (Math.abs(rx) >= Math.abs(ry) === false) side = ry > 0 ? 'bottom' : 'top';
  else side = rx > 0 ? 'right' : 'left';

  return { x: cx + rx, y: cy + ry, side };
}

export default function PmosNode({ data, selected }) {
  const rot = data.rot || 0;
  const flip = data.flip || false;
  const transformStr = `rotate(${rot}deg) scaleX(${flip ? -1 : 1})`;
  const anchor = getLabelAnchor(rot, flip);

  const labelTransform = {
    right:  'translate(0, -50%)',
    left:   'translate(-100%, -50%)',
    top:    'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
  }[anchor.side];

  const isVerticalSide = anchor.side === 'top' || anchor.side === 'bottom';

  return (
    <div style={{ position: 'relative', width: '160px', height: '100px', boxSizing: 'border-box' }}>

      <div style={{ width: '100%', height: '100%', transform: transformStr, transformOrigin: '40px 50px' }}>
        <Handle type="target" position={Position.Left} id="gate"
          style={{ left: '20px', top: '50px', transform: 'translate(-50%,-50%)', opacity: 0, width: 20, height: 20, zIndex: 100, border: 'none' }} />
        <Handle type="source" position={Position.Top} id="drain"
          style={{ left: '50px', top: '30px', transform: 'translate(-50%,-50%)', opacity: 0, width: 20, height: 20, zIndex: 100, border: 'none' }} />
        <Handle type="source" position={Position.Bottom} id="source"
          style={{ left: '50px', top: '70px', transform: 'translate(-50%,-50%)', opacity: 0, width: 20, height: 20, zIndex: 100, border: 'none' }} />

        {selected && (
          <div style={{
            position: 'absolute',
            left: '16px', top: '27px', width: '36px', height: '46px',
            border: '2px solid #1677ff',
            borderRadius: '3px',
            background: 'rgba(22, 119, 255, 0.08)',
            boxShadow: '0 0 0 3px rgba(22, 119, 255, 0.15)',
            pointerEvents: 'none',
            zIndex: 5,
          }} />
        )}

        <svg width="160" height="100" viewBox="0 0 160 100" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
          <g stroke="#000" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" fill="none" shapeRendering="crispEdges">
            <line x1="20" y1="50" x2="28" y2="50" />
            <rect x="28" y="40" width="3" height="20" fill="#000" stroke="none" />
            <rect x="33" y="37" width="3" height="26" fill="#000" stroke="none" />
            <polyline points="50,30 50,43 36,43" />
            <polyline points="50,70 50,57 36,57" />
            <polygon points="36,43 45,39 45,47" fill="#000" stroke="none" />
          </g>
        </svg>
      </div>

      <div style={{
        position: 'absolute',
        left: `${anchor.x}px`, top: `${anchor.y}px`,
        transform: labelTransform,
        display: 'flex', flexDirection: 'column',
        alignItems: isVerticalSide ? 'center' : (anchor.side === 'left' ? 'flex-end' : 'flex-start'),
        whiteSpace: 'nowrap', pointerEvents: 'none',
        fontFamily: 'sans-serif', lineHeight: 1.15,
      }}>
        <div style={{ fontWeight: 900, fontSize: '13px', fontStyle: 'italic' }}>
          {data.reference}
        </div>
        {data.w && <div style={{ fontSize: '9px', color: '#555' }}>W={data.w}</div>}
        {data.l && <div style={{ fontSize: '9px', color: '#555' }}>L={data.l}</div>}
      </div>
    </div>
  );
}