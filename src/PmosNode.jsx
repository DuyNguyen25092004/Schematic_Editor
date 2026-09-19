import React from 'react';
import { Handle, Position } from 'reactflow';

export default function PmosNode({ data }) {
  const rot = data.rot || 0;
  const flip = data.flip || false;
  const transformStr = `rotate(${rot}deg) scaleX(${flip ? -1 : 1})`;

  return (
    <div style={{ position: 'relative', width: '160px', height: '100px', boxSizing: 'border-box' }}>
      
      {/* ĐỔI TÂM XOAY Ở ĐÂY: transformOrigin: '35px 50px' */}
      <div style={{ width: '100%', height: '100%', transform: transformStr, transformOrigin: '40px 50px' }}>
        <Handle type="target" position={Position.Left} id="gate"
          style={{ left: '20px', top: '50px', transform: 'translate(-50%,-50%)', opacity: 0, width: 20, height: 20, zIndex: 100, border: 'none' }} />
        <Handle type="source" position={Position.Top} id="drain"
          style={{ left: '50px', top: '30px', transform: 'translate(-50%,-50%)', opacity: 0, width: 20, height: 20, zIndex: 100, border: 'none' }} />
        <Handle type="source" position={Position.Bottom} id="source"
          style={{ left: '50px', top: '70px', transform: 'translate(-50%,-50%)', opacity: 0, width: 20, height: 20, zIndex: 100, border: 'none' }} />

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
        position: 'absolute', left: '58px', top: '32px', display: 'flex', flexDirection: 'column', gap: '1px',
        whiteSpace: 'nowrap', pointerEvents: 'none',
      }}>
        <div style={{ fontWeight: 900, fontSize: '16px', fontStyle: 'italic', fontFamily: 'sans-serif', lineHeight: 1.1 }}>{data.reference}</div>
        {data.w && <div style={{ fontSize: '10px', fontFamily: 'sans-serif', color: '#444', lineHeight: 1.2 }}>W={data.w}</div>}
        {data.l && <div style={{ fontSize: '10px', fontFamily: 'sans-serif', color: '#444', lineHeight: 1.2 }}>L={data.l}</div>}
      </div>
    </div>
  );
}