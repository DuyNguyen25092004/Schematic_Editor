import { useEffect, useState } from 'react';
import { driveLogin, driveLogout, driveGetEmail, driveListFolder, driveSave, driveLoad, isLoggedIn } from './driveStorage';
import { createGroup, getGroup, inviteMember, roleOf, findMyGroups } from './groupStorage';

const box = {
  width: 300, // vị trí do khung chung trong App.jsx quyết định
  maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', // tránh đè nút zoom ở góc trái dưới
  background: '#fff', border: '1px solid #ddd', borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10,
  fontFamily: 'sans-serif', fontSize: 13, color: '#222',
};
const input = { width: '100%', boxSizing: 'border-box', padding: 6, marginBottom: 6 };
const btn = { padding: '6px 10px', marginRight: 6, marginBottom: 6, cursor: 'pointer' };

// Giữ lại ?c= (phòng realtime) khi đổi ?g= trên URL
const urlKeepingRoom = (query = '') => {
  const p = new URLSearchParams(query);
  const c = new URLSearchParams(window.location.search).get('c');
  if (c) p.set('c', c);
  const qs = p.toString();
  return window.location.pathname + (qs ? `?${qs}` : '');
};

export default function GroupPanel({ nodes, wires, setNodes, setWires, onOpenRoom, onNewRoom }) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(isLoggedIn());
  const [email, setEmail] = useState(null);

  const [groupId, setGroupId] = useState(new URLSearchParams(window.location.search).get('g'));
  const [group, setGroup] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [myGroups, setMyGroups] = useState(null); // null = chưa tải, [] = không có group nào

  const [files, setFiles] = useState([]);
  const [currentFileId, setCurrentFileId] = useState(null);
  const [fileName, setFileName] = useState('So do moi');

  const [newGroupName, setNewGroupName] = useState('Nhom moi');
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

  // Đăng nhập Drive + lấy email
  const login = () => run(async () => {
    await driveLogin();
    setLogged(true);
    const em = await driveGetEmail();
    setEmail(em);
  });
  const logout = () => {
    driveLogout(); setLogged(false); setEmail(null);
    setGroup(null); setMyGroups(null); setGroupId(null);
    window.history.pushState({}, '', urlKeepingRoom());
  };

  // Sau khi có email: nếu URL có ?g=, mở đúng group đó; nếu không, liệt kê TẤT CẢ group của email này
  useEffect(() => {
    if (!logged || !email) return;
    run(async () => {
      if (groupId) {
        const g = await getGroup(groupId);
        if (!g) { setMsg('Không tìm thấy group này.'); return; }
        const role = roleOf(g, email);
        if (!role) { setMsg('Bạn chưa được mời vào group này.'); return; }
        setGroup(g); setMyRole(role);
        const list = await driveListFolder(g.folderId);
        setFiles(list);
      } else {
        const groups = await findMyGroups(email);
        setMyGroups(groups);
      }
    });
  }, [logged, email, groupId]);

  const openGroup = (g) => {
    setGroupId(g.id);
    window.history.pushState({}, '', urlKeepingRoom(`g=${g.id}`));
  };

  const backToMyGroups = () => {
    setGroup(null); setGroupId(null); setFiles([]); setCurrentFileId(null);
    window.history.pushState({}, '', urlKeepingRoom());
    run(async () => setMyGroups(await findMyGroups(email)));
  };

  const handleCreateGroup = () => run(async () => {
    const id = await createGroup(newGroupName, email);
    openGroup({ id });
  });

  const handleInvite = () => run(async () => {
    if (!inviteEmail) return;
    await inviteMember(groupId, inviteEmail.trim(), inviteRole);
    setMsg(`Đã mời ${inviteEmail} (${inviteRole}) ✔`);
    setInviteEmail('');
  });

  // Mở file: tải thẳng từ Drive bằng token của người đang đăng nhập
  const openFile = (f) => run(async () => {
    const data = await driveLoad(f.id);
    setNodes((data.nodes || []).map((n) => ({ ...n, style: { width: 160, height: 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' } })));
    setWires(data.wires || []);
    setCurrentFileId(f.id);
    onOpenRoom?.(f.id); // phòng realtime = id file Drive
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

      {logged && !group && (
        <div style={{ marginBottom: 8 }}>Đăng nhập: {email}</div>
      )}

      {/* Chưa mở group nào -> hiện danh sách group của chính người này, tự tra theo email */}
      {logged && !group && (
        <>
          <div style={{ margin: '8px 0', fontWeight: 'bold' }}>Group của bạn:</div>
          {myGroups === null && <div>Đang tải...</div>}
          {myGroups?.length === 0 && <div style={{ color: '#888' }}>Bạn chưa thuộc group nào.</div>}
          {myGroups?.map((g) => (
            <div key={g.id} style={{ padding: '4px 0', borderTop: '1px solid #eee', cursor: 'pointer' }}
              onClick={() => openGroup(g)}>
              {g.name} <span style={{ color: '#888' }}>({roleOf(g, email)})</span>
            </div>
          ))}

          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 8 }}>
            <input style={input} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Tên group mới" />
            <button style={btn} disabled={busy} onClick={handleCreateGroup}>Tạo Group mới</button>
          </div>
        </>
      )}

      {/* Đã mở đúng 1 group */}
      {logged && group && myRole && (
        <>
          <div style={{ marginBottom: 4 }}>
            <span style={{ cursor: 'pointer', color: '#06c' }} onClick={backToMyGroups}>← Group của tôi</span>
          </div>
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