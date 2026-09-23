
function OnlineUsers({ me, others, onRename }) {
  const chip = (color, text, extra = {}) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      background: '#fff', border: `2px solid ${color}`, borderRadius: 14,
      fontFamily: 'sans-serif', fontSize: 12, fontWeight: 600, color: '#333', ...extra,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {text}
    </div>
  );
  return (
    <div style={{
      position: 'absolute', top: 10, right: 16, zIndex: 21,
      display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 320,
    }}>
      {Object.entries(others).map(([uid, u]) => (
        <div key={uid}>{chip(u.color || '#888', u.name || '?')}</div>
      ))}
      {me && (
        <div title="Bấm để đổi tên" onClick={() => onRename(window.prompt('Tên hiển thị:', me.name))}>
          {chip(me.color, `${me.name} (bạn)`, { cursor: 'pointer' })}
        </div>
      )}
    </div>
  );
}

export default OnlineUsers