
function OnlineUsers({ me, others = {}, onRename, isHost, canEdit, hostUid, hostUser }) {
  const chip = (color, text, roleIcon, tooltip, extra = {}) => (
    <div
      title={tooltip}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
        background: '#fff', border: `2px solid ${color}`, borderRadius: 14,
        fontFamily: 'sans-serif', fontSize: 12, fontWeight: 600, color: '#333',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)', ...extra,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span>{text}</span>
      {roleIcon && <span style={{ fontSize: 12 }}>{roleIcon}</span>}
    </div>
  );

  const getOtherBadge = (uid, u) => {
    if (uid === hostUid) return { icon: '👑', tip: `${u.name} (Chủ phòng)` };
    if (u.hasDriveAccess) return { icon: '📁', tip: `${u.name} (Xác thực Google Drive - Quyền sửa)` };
    if (hostUser?.approvedEditors?.[uid]) return { icon: '✏️', tip: `${u.name} (Đã được duyệt chỉnh sửa)` };
    return { icon: '👁️', tip: `${u.name} (Chỉ xem)` };
  };

  const getMyBadge = () => {
    if (isHost) return { icon: '👑', tip: 'Bạn là Chủ phòng (Toàn quyền)' };
    if (me?.hasDriveAccess) return { icon: '📁', tip: 'Bạn có quyền Google Drive (Tự động chỉnh sửa)' };
    if (canEdit) return { icon: '✏️', tip: 'Bạn đã được duyệt quyền chỉnh sửa' };
    return { icon: '👁️', tip: 'Bạn đang ở chế độ Chỉ xem' };
  };

  const myBadge = getMyBadge();

  return (
    <div style={{
      position: 'absolute', top: 10, right: 16, zIndex: 21,
      display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 360,
    }}>
      {Object.entries(others).map(([uid, u]) => {
        const badge = getOtherBadge(uid, u);
        return (
          <div key={uid}>
            {chip(u.color || '#888', u.name || '?', badge.icon, badge.tip)}
          </div>
        );
      })}
      {me && (
        <div title="Bấm để đổi tên hiển thị" onClick={() => onRename(window.prompt('Tên hiển thị:', me.name))}>
          {chip(me.color, `${me.name} (bạn)`, myBadge.icon, `${myBadge.tip} - Bấm để đổi tên`, { cursor: 'pointer' })}
        </div>
      )}
    </div>
  );
}

export default OnlineUsers