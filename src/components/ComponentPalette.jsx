import {COMPONENT_LIBRARY} from '../constants';
import {MiniIcon} from '../symbols/index.jsx';
import React from 'react';

// ============ PANEL DANH SÁCH LINH KIỆN (SIDEBAR) ============
function ComponentPalette({ onComponentDragStart }) {
  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
    onComponentDragStart?.(type);

    // Ẩn ảnh kéo mặc định của trình duyệt (không cho nó tự scale icon sidebar)
    const emptyImg = new Image();
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
  };

  return (
    <div style={{
      width: 200, minWidth: 200, height: '100%', background: '#fff',
      borderRight: '1px solid #e0e0e0', fontFamily: 'sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid #eee', color: '#333' }}>
        Linh kiện
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {COMPONENT_LIBRARY.map((comp) => (
          <div
            key={comp.type}
            draggable
            onDragStart={(e) => onDragStart(e, comp.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8,
              cursor: 'grab', background: '#fafafa', userSelect: 'none',
              fontSize: 13, fontWeight: 600, color: '#333',
              transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f6ff'; e.currentTarget.style.borderColor = '#1677ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.borderColor = '#ddd'; }}
          >
            <MiniIcon type={comp.type} />
            {comp.label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', padding: '12px 16px', fontSize: 12, color: '#888', borderTop: '1px solid #eee', lineHeight: 1.5 }}>
        Kéo linh kiện vào canvas, hoặc bấm phím <b>I</b> để gọi nhanh.
      </div>
    </div>
  );
}

export default ComponentPalette
