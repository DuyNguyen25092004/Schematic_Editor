import React from 'react';
import LatexText from '../components/LatexText';

export default function TextNode({ id, data, selected }) {
  return (
    <div
      // Bắt ở pha capture vì React Flow chặn dblclick ở pha bubble
      onDoubleClickCapture={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('text-node-edit', { detail: { id } }));
      }}
      style={{
        display: 'inline-block', padding: 2, borderRadius: 3, cursor: 'default',
        border: `1px dashed ${selected ? '#1677ff' : 'transparent'}`,
        background: selected ? 'rgba(22, 119, 255, 0.08)' : 'transparent',
      }}
    >
      <LatexText text={data.text} latex={data.latex} size={data.size || 14} />
    </div>
  );
}