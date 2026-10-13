
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
    if (uid === hostUid) return { icon: '👑', tip: `${u.name} (Host)` };
    if (u.hasDriveAccess) return { icon: '📁', tip: `${u.name} (Google Drive Verified - Editor)` };
    if (hostUser?.approvedEditors?.[uid]) return { icon: '✏️', tip: `${u.name} (Approved Editor)` };
    return { icon: '👁️', tip: `${u.name} (Viewer)` };
  };

  const getMyBadge = () => {
    if (isHost) return { icon: '👑', tip: 'You are Host (Full access)' };
    if (me?.hasDriveAccess) return { icon: '📁', tip: 'Google Drive permission (Editor)' };
    if (canEdit) return { icon: '✏️', tip: 'You are approved to edit' };
    return { icon: '👁️', tip: 'You are in View-only mode' };
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
        <div title="Click to change display name" onClick={() => onRename(window.prompt('Display name:', me.name))}>
          {chip(me.color, `${me.name} (you)`, myBadge.icon, `${myBadge.tip} - Click to change name`, { cursor: 'pointer' })}
        </div>
      )}
    </div>
  );
}

export default OnlineUsers