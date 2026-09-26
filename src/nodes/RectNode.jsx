import React, { useEffect, useRef, useState } from 'react';
import { NodeResizer } from 'reactflow';
import { GRID } from '../constants';

// Chọn màu chữ đen/trắng theo độ sáng của màu nền, để chữ luôn đọc được
// trên mọi màu hình chữ nhật.
function contrastText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? '#222' : '#fff';
}

// Hình chữ nhật kéo được cạnh/góc để đổi kích thước (NodeResizer của reactflow
// tự lo phần kéo-thả trong lúc thao tác). Khi thả tay (onResizeEnd) mới ghi lại
// data.width/data.height để lưu file / dùng cho box-select, obstacle,... vì các
// chỗ đó lấy kích thước qua getSymbolBox(type, data) thay vì đo DOM trực tiếp.
//
// Double-click vào hình -> mở ô nhập chữ đè lên (textarea). Gõ xong bấm ra
// ngoài (blur) hoặc Enter để lưu, Esc để huỷ. Chữ được lưu vào data.text qua
// callback data.onTextChange (Flow.jsx gắn callback này khi tạo/khôi phục node).
export default function RectNode({ id, data, selected }) {
  const color = data.color || '#1677ff';
  const isNone = color === 'transparent';         // "Không màu" -> chỉ có viền
  const opacity = data.opacity ?? 1;
  // Không màu -> viền cố định màu xám đậm (nếu không viền cũng trong suốt luôn,
  // không thấy hình đâu cả); chữ dùng màu tối vì nền lúc này là canvas màu sáng.
  const borderColor = isNone ? '#555' : color;
  const textColor = isNone ? '#222' : contrastText(color);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text || '');
  const textareaRef = useRef(null);

  // Nếu chữ bị đổi từ nơi khác (Property Panel, đồng bộ realtime, undo...)
  // trong lúc KHÔNG đang gõ, cập nhật lại nội dung hiển thị theo.
  useEffect(() => {
    if (!editing) setDraft(data.text || '');
  }, [data.text, editing]);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  const startEditing = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setDraft(data.text || '');
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== (data.text || '')) data.onTextChange?.(id, draft);
  };

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
      <div onDoubleClick={startEditing} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div
          style={{
            position: 'absolute', inset: 0, boxSizing: 'border-box',
            borderRadius: 4,
            background: isNone ? 'transparent' : color,
            opacity: isNone ? 1 : opacity,
            border: `2px solid ${borderColor}`,
          }}
        />
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation(); // đang gõ chữ -> không để lọt phím tắt (R, C, Delete...)
              if (e.key === 'Escape') { setDraft(data.text || ''); setEditing(false); }
              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            }}
            placeholder="Nhập chữ..."
            style={{
              position: 'absolute', inset: 4, resize: 'none', border: 'none', outline: 'none',
              background: 'transparent', color: textColor, fontFamily: 'sans-serif', fontSize: 13,
              fontWeight: 600, textAlign: 'center', lineHeight: 1.3,
            }}
          />
        ) : data.text ? (
          <div
            style={{
              position: 'absolute', inset: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: textColor, fontFamily: 'sans-serif', fontSize: 13, fontWeight: 600,
              textAlign: 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              overflow: 'hidden', pointerEvents: 'none',
            }}
          >
            {data.text}
          </div>
        ) : null}
      </div>
    </>
  );
}