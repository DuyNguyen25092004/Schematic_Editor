import React, { useState } from 'react';
import { COMPONENT_LIBRARY, COMPONENT_CATEGORIES } from '../constants';
import { MiniIcon } from '../symbols/index.jsx';

// ============ PANEL DANH SÁCH LINH KIỆN (SIDEBAR) ============
// Nhóm theo category, mỗi nhóm thu gọn/mở được, linh kiện xếp lưới 3 cột.
const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

function ComponentPalette({ onComponentDragStart }) {
  const [collapsed, setCollapsed] = useState(() => new Set());

  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
    onComponentDragStart?.(type);

    // Ẩn ảnh kéo mặc định của trình duyệt (không cho nó tự scale icon sidebar)
    const emptyImg = new Image();
    emptyImg.src = EMPTY_IMG;
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
  };

  return (
    <div style={{
      position: 'relative', zIndex: 30,
      width: 232, minWidth: 232, height: '100%', background: '#fff',
      borderRight: '1px solid #e0e0e0', fontFamily: 'sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Tiêu đề + tổng số linh kiện */}
      <div style={{ padding: 10, borderBottom: '1px solid #eee' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', background: '#f3f3f3', borderRadius: 6,
          border: '1px solid #e6e6e6',
        }}>
          <span style={{ fontSize: 12, color: '#777' }}>▾</span>
          <span style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6, color: '#333' }}>ALL DEVICES</span>
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#555',
            background: '#dcdcdc', borderRadius: 10, padding: '1px 8px',
          }}>
            {COMPONENT_LIBRARY.length}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px' }}>
        {COMPONENT_CATEGORIES.map((cat) => {
          const items = COMPONENT_LIBRARY.filter((c) => c.category === cat.id);
          if (!items.length) return null;
          const isClosed = collapsed.has(cat.id);
          return (
            <div key={cat.id}>
              <div
                onClick={() => toggle(cat.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '12px 2px 8px',
                  cursor: 'pointer', userSelect: 'none',
                  fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: '#777',
                }}
              >
                <span style={{
                  display: 'inline-block', fontSize: 9, transition: 'transform .15s',
                  transform: isClosed ? 'rotate(-90deg)' : 'none',
                }}>▼</span>
                <span>{cat.label.toUpperCase()}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#999' }}>{items.length}</span>
              </div>

              {!isClosed && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {items.map((comp) => (
                    <div
                      key={comp.type}
                      draggable
                      title={comp.label}
                      onDragStart={(e) => onDragStart(e, comp.type)}
                      style={{
                        height: 66, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 6,
                        border: '1px solid #e3e3e3', borderRadius: 8, background: '#f4f4f4',
                        cursor: 'grab', userSelect: 'none',
                        fontSize: 11, fontWeight: 700, color: '#333',
                        transition: 'background .15s, border-color .15s, box-shadow .15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#eef5ff';
                        e.currentTarget.style.borderColor = '#1677ff';
                        e.currentTarget.style.boxShadow = '0 1px 4px rgba(22,119,255,.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f4f4f4';
                        e.currentTarget.style.borderColor = '#e3e3e3';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <MiniIcon type={comp.type} width={42} height={30} />
                      <span>{comp.short || comp.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '10px 14px', fontSize: 11.5, color: '#888', borderTop: '1px solid #eee', lineHeight: 1.5 }}>
        Kéo linh kiện vào canvas, hoặc bấm phím <b>I</b> để gọi nhanh.
      </div>
    </div>
  );
}

export default ComponentPalette;