import React from 'react';
import { NodeResizer } from 'reactflow';
import { GRID } from '../constants';

// Hình chữ nhật kéo được cạnh/góc để đổi kích thước (NodeResizer của reactflow
// tự lo phần kéo-thả trong lúc thao tác). Khi thả tay (onResizeEnd) mới ghi lại
// data.width/data.height để lưu file / dùng cho box-select, obstacle,... vì các
// chỗ đó lấy kích thước qua getSymbolBox(type, data) thay vì đo DOM trực tiếp.
export default function RectNode({ id, data, selected }) {
  const color = data.color || '#1677ff';
  const opacity = data.opacity ?? 1;

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={GRID * 3}
        minHeight={GRID * 3}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: '#fff', border: '2px solid #1677ff' }}
        lineStyle={{ borderColor: '#1677ff', borderWidth: 1.5 }}
        onResizeEnd={(_, params) => data.onResize?.(id, { width: params.width, height: params.height })}
      />
      <div
        style={{
          width: '100%', height: '100%', boxSizing: 'border-box',
          borderRadius: 4, background: color, opacity,
          border: `2px solid ${color}`,
        }}
      />
    </>
  );
}