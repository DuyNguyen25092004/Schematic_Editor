import { useState } from 'react';

const bar = {
  height: 34,
  background: '#f5f5f5',
  borderTop: '1px solid #ddd',
  display: 'flex',
  alignItems: 'stretch',
  fontFamily: 'sans-serif',
  fontSize: 13,
  userSelect: 'none',
  flexShrink: 0,
};

const tab = (active) => ({
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  borderRight: '1px solid #e2e2e2',
  color: active ? '#1a73e8' : '#444',
  fontWeight: active ? 'bold' : 'normal',
  background: active ? '#fff' : 'transparent',
  borderTop: active ? '2px solid #1a73e8' : '2px solid transparent',
  whiteSpace: 'nowrap',
});

const addBtn = {
  width: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#666',
  fontSize: 16,
  borderRight: '1px solid #e2e2e2',
};

// Thanh tab ngang ở dưới cùng màn hình để chuyển đổi / tạo Group (Drive),
// thay cho danh sách "Group của bạn" trước đây nằm trong popup GroupPanel.
export default function GroupTabBar({ logged, email, myGroups, groupId, onSelect, onCreate, onLogin }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  if (!logged) {
    return (
      <div style={bar}>
        <div style={{ ...tab(false), color: '#1a73e8' }} onClick={onLogin}>
          👥 Đăng nhập Google để dùng Group
        </div>
      </div>
    );
  }

  const groups = myGroups || [];

  const submitNew = () => {
    const trimmed = name.trim();
    if (!trimmed) { setAdding(false); return; }
    onCreate(trimmed);
    setName('');
    setAdding(false);
  };

  return (
    <div style={bar}>
      {groups.length === 0 && myGroups !== null && (
        <div style={{ ...tab(false), color: '#888', cursor: 'default' }}>Chưa có group nào</div>
      )}

      {groups.map((g) => (
        <div key={g.id} style={tab(g.id === groupId)} onClick={() => onSelect(g)} title={email}>
          {g.name}
        </div>
      ))}

      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submitNew}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNew();
            if (e.key === 'Escape') { setName(''); setAdding(false); }
          }}
          placeholder="Tên group mới"
          style={{ width: 140, margin: '4px 6px', padding: '2px 6px' }}
        />
      ) : (
        <div style={addBtn} title="Tạo group mới" onClick={() => setAdding(true)}>+</div>
      )}
    </div>
  );
}