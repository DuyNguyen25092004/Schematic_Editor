import {COMPONENT_LIBRARY} from '../constants';
import {MiniIcon} from '../symbols/index.jsx';
import React from 'react';

// ============ HỘP GỢI Ý ĐẶT LINH KIỆN NHANH (PHÍM "I") ============
function QuickAddMenu({ onPick, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: 50, background: '#fff', border: '1px solid #ddd', borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: 8, minWidth: 220,
      fontFamily: 'sans-serif',
    }}>
      <div style={{ padding: '6px 10px', fontSize: 12, color: '#888', fontWeight: 600 }}>
        Chọn linh kiện để đặt — Esc để hủy
      </div>
      {COMPONENT_LIBRARY.map((comp) => (
        <div
          key={comp.type}
          onClick={() => onPick(comp)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f6ff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <MiniIcon type={comp.type} data={comp.defaultData} />
          {comp.label}
        </div>
      ))}
    </div>
  );
}

export default QuickAddMenu
