import React from 'react';
import { NodeResizer } from 'reactflow';
import { GRID } from '../constants';
import { SYMBOLS } from '../symbols';

export default function WaveNode({ id, data, selected, type }) {
  const width = Math.max(GRID * 3, data.width ?? 80);
  const height = Math.max(GRID * 2, data.height ?? 40);
  const rot = data.rot || 0;
  const flip = data.flip || false;
  const transformStr = `rotate(${rot}deg) scaleX(${flip ? -1 : 1})`;

  const Symbol = SYMBOLS[type];

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={GRID * 3}
        minHeight={GRID * 2}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: '#fff', border: '2px solid #1677ff' }}
        lineStyle={{ borderColor: '#1677ff', borderWidth: 1.5 }}
        onResizeEnd={(_, params) => {
          const w = Math.round(params.width / GRID) * GRID;
          const h = Math.round(params.height / GRID) * GRID;
          data.onResize?.(id, { width: w, height: h });
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          transform: transformStr,
          transformOrigin: 'center center',
        }}
      >
        <svg
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
          viewBox={`0 0 ${width} ${height}`}
        >
          {Symbol && <Symbol data={{ ...data, width, height, cx: width / 2, cy: height / 2 }} />}
        </svg>
      </div>
    </>
  );
}
