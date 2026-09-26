import { useEffect, useState } from 'react';
import { driveListFolder, driveSave, driveLoad } from './driveStorage';
import { inviteMember } from './groupStorage';

const box = {
  width: 300, // vị trí do khung chung trong App.jsx quyết định
  maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', // tránh đè nút zoom ở góc trái dưới
  background: '#fff', border: '1px solid #ddd', borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10,
  fontFamily: 'sans-serif', fontSize: 13, color: '#222',
};
const input = { width: '100%', boxSizing: 'border-box', padding: 6, marginBottom: 6 };
const btn = { padding: '6px 10px', marginRight: 6, marginBottom: 6, cursor: 'pointer' };

// Giờ chỉ phụ trách: đăng nhập, mời thành viên, lưu/mở file trong group ĐANG mở.
// Việc chọn / tạo group đã chuyển sang GroupTabBar (thanh tab dưới cùng).
export default function GroupPanel({
  nodes, wires, setNodes, setWires, onOpenRoom, onNewRoom,
  logged, email, login, logout, group, groupId, myRole, onResizeRect,onTextChangeRect,
}) {
  const [open, setOpen] = useState(false);

  const [files, setFiles] = useState([]);
  const [currentFileId, setCurrentFileId] = useState(null);
  const [fileName, setFileName] = useState('So do moi');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('edit');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { await fn(); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  // Group đổi (chọn từ tab bar) -> tải lại danh sách file, reset file đang mở
  useEffect(() => {
    setFiles([]); setCurrentFileId(null);
    if (!group) return;
    run(async () => setFiles(await driveListFolder(group.folderId)));
  }, [group?.id]);

  const handleInvite = () => run(async () => {
    if (!inviteEmail) return;
    await inviteMember(groupId, inviteEmail.trim(), inviteRole);
    setMsg(`Đã mời ${inviteEmail} (${inviteRole}) ✔`);
    setInviteEmail('');
  });

  // Mở file: tải thẳng từ Drive bằng token của người đang đăng nhập
  const openFile = (f) => run(async () => {
    const data = await driveLoad(f.id);
    setNodes((data.nodes || []).map((n) => ({
      ...n,
      // rect: khôi phục đúng kích thước đã lưu + gắn lại callback resize
      data: n.type === 'rect' ? { ...n.data, onResize: onResizeRect, onTextChange: onTextChangeRect } : n.data,
      style: { width: n.data?.width || 160, height: n.data?.height || 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
    })));
    setWires(data.wires || []);
    setCurrentFileId(f.id);
    onOpenRoom?.(f.id);
    setFileName(f.name.replace('.schem.json', ''));
    setMsg(`Đã mở: ${f.name}`);
  });

  const saveFile = () => run(async () => {
    const payload = {
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
      wires: wires.map(({ selected, ...w }) => w),
    };
    const res = await driveSave(fileName, payload, currentFileId, group.folderId);
    setCurrentFileId(res.id);
    if (!currentFileId) onOpenRoom?.(res.id); // file mới lưu -> vào phòng realtime của file
    setMsg('Đã lưu vào Drive ✔');
    const list = await driveListFolder(group.folderId);
    setFiles(list);
  });

  const newFile = () => {
    setNodes([]); setWires([]); setCurrentFileId(null); setFileName('So do moi');
    onNewRoom?.();
  };

  if (!open) {
    return (
      <button style={btn} onClick={() => setOpen(true)}>
        👥 Group
      </button>
    );
  }

  return (
    <div style={box} onMouseDown={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b>👥 Group (Drive)</b>
        <span style={{ cursor: 'pointer' }} onClick={() => setOpen(false)}>✕</span>
      </div>

      {!logged && (
        <button style={btn} disabled={busy} onClick={login}>Đăng nhập Google</button>
      )}

      {logged && (
        <div style={{ marginBottom: 8 }}>Đăng nhập: {email}</div>
      )}

      {logged && !group && (
        <div style={{ color: '#888' }}>
          Chưa chọn group nào — chọn hoặc tạo group ở thanh tab phía dưới màn hình.
        </div>
      )}

      {/* Đã mở đúng 1 group (chọn từ GroupTabBar) */}
      {logged && group && myRole && (
        <>
          <div style={{ marginBottom: 8 }}>
            Group: <b>{group.name}</b> — quyền của bạn: <b>{myRole}</b>
          </div>

          {myRole !== 'view' && (
            <>
              <input style={input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              <button style={btn} disabled={busy} onClick={saveFile}>{currentFileId ? 'Lưu' : 'Lưu mới'}</button>
              <button style={btn} onClick={newFile}>Mới</button>
            </>
          )}

          <div style={{ marginTop: 8, maxHeight: 140, overflowY: 'auto' }}>
            {files.length === 0 && <i>Chưa có sơ đồ nào trong group</i>}
            {files.map((f) => (
              <div key={f.id} style={{
                padding: '4px 0', borderTop: '1px solid #eee', cursor: 'pointer',
                fontWeight: f.id === currentFileId ? 'bold' : 'normal',
              }} onClick={() => openFile(f)}>
                {f.name.replace('.schem.json', '')}
              </div>
            ))}
          </div>

          {myRole === 'owner' && (
            <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 8 }}>
              <div style={{ marginBottom: 4 }}>Mời thành viên:</div>
              <input style={input} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Gmail thành viên" />
              <select style={input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="edit">Có thể sửa (edit)</option>
                <option value="view">Chỉ xem (view)</option>
              </select>
              <button style={btn} disabled={busy} onClick={handleInvite}>Mời</button>
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 12 }}>
            Link chia sẻ group: <code>{window.location.origin + window.location.pathname}?g={groupId}</code>
          </div>
        </>
      )}

      {logged && group && !myRole && (
        <div style={{ color: '#c00' }}>Bạn chưa được mời vào group này.</div>
      )}

      {busy && <div style={{ marginTop: 6 }}>Đang xử lý...</div>}
      {msg && <div style={{ marginTop: 6, color: '#c00' }}>{msg}</div>}
      {logged && <button style={{ ...btn, marginTop: 8 }} onClick={logout}>Thoát</button>}
    </div>
  );
}