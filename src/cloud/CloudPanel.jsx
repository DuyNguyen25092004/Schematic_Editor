import { useState } from 'react';
import {
  driveLogin, driveLogout, driveList, driveSave, driveLoad, driveDelete, isLoggedIn,
} from './driveStorage';

const NODE_STYLE = {
  width: 160, height: 100, background: 'transparent',
  border: 'none', padding: 0, boxShadow: 'none',
};
const box = {
  width: 270, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', // vị trí do khung chung trong App.jsx quyết định
  background: '#fff', border: '1px solid #ddd', borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10,
  fontFamily: 'sans-serif', fontSize: 13, color: '#222',
};
const input = { width: '100%', boxSizing: 'border-box', padding: 6, marginBottom: 6 };
const btn = { padding: '6px 10px', marginRight: 6, cursor: 'pointer' };

export default function CloudPanel({ nodes, wires, setNodes, setWires, onOpenRoom, onNewRoom, onResizeRect, onTextChangeRect }) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(isLoggedIn());
  const [list, setList] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [name, setName] = useState('So do moi');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { await fn(); }
    catch (e) {
      setMsg(e.message);
      if (!isLoggedIn()) setLogged(false);
    }
    setBusy(false);
  };

  const refresh = async () => setList(await driveList());

  const login = () => run(async () => {
    await driveLogin();
    setLogged(true);
    await refresh();
  });

  const logout = () => { driveLogout(); setLogged(false); setList([]); setCurrentId(null); };

  const save = () => run(async () => {
    const payload = {
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
      wires: wires.map(({ selected, ...w }) => w),
    };
    const res = await driveSave(name, payload, currentId);
    setCurrentId(res.id);
    if (!currentId) onOpenRoom?.(res.id); // file mới lưu -> vào phòng realtime của file
    setMsg('Đã lưu vào Drive ✔');
    await refresh();
  });

  const load = (f) => run(async () => {
    const data = await driveLoad(f.id);
    setNodes(data.nodes.map((n) => ({
      ...n,
      // rect: khôi phục đúng kích thước đã lưu + gắn lại callback resize
      data: n.type === 'rect' ? { ...n.data, onResize: onResizeRect, onTextChange: onTextChangeRect } : n.data,
      style: { ...NODE_STYLE, width: n.data?.width || 160, height: n.data?.height || 100 },
    })));
    setWires(data.wires || []);
    setCurrentId(f.id);
    setName(f.name.replace('.schem.json', ''));
    onOpenRoom?.(f.id);
    setMsg('Đã mở: ' + f.name);
  });

  const remove = (f) => run(async () => {
    if (!confirm(`Xóa "${f.name}" khỏi Drive?`)) return;
    await driveDelete(f.id);
    if (f.id === currentId) setCurrentId(null);
    await refresh();
  });

  const newDoc = () => {
    setNodes([]); setWires([]); setCurrentId(null); setName('So do moi');
    onNewRoom?.();
  };

  if (!open) {
    return (
      <button style={btn}
        onClick={() => setOpen(true)}>
        ☁ Drive
      </button>
    );
  }

  return (
    <div style={box} onMouseDown={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <b>☁ Google Drive</b>
        <span style={{ cursor: 'pointer' }} onClick={() => setOpen(false)}>✕</span>
      </div>

      {!logged ? (
        <button style={btn} disabled={busy} onClick={login}>Đăng nhập Google</button>
      ) : (
        <>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
          <button style={btn} disabled={busy} onClick={save}>{currentId ? 'Lưu' : 'Lưu mới'}</button>
          <button style={btn} onClick={newDoc}>Mới</button>
          <button style={btn} onClick={logout}>Thoát</button>

          <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>
            {list.length === 0 && <i>Chưa có sơ đồ nào</i>}
            {list.map((f) => (
              <div key={f.id} style={{
                display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                borderTop: '1px solid #eee',
                fontWeight: f.id === currentId ? 'bold' : 'normal',
              }}>
                <span style={{ cursor: 'pointer' }} onClick={() => load(f)}>
                  {f.name.replace('.schem.json', '')}
                </span>
                <span style={{ cursor: 'pointer' }} onClick={() => remove(f)}>🗑</span>
              </div>
            ))}
          </div>
        </>
      )}
      {busy && <div style={{ marginTop: 6 }}>Đang xử lý...</div>}
      {msg && <div style={{ marginTop: 6, color: '#c00' }}>{msg}</div>}
    </div>
  );
}