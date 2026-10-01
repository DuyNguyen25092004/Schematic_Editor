import { useState, useEffect, useRef, useCallback } from 'react';
import {
  driveLogin, driveLogout, driveLoad, driveSave, driveDelete,
  driveListFolderContents, driveCreateFolder, driveGetFolderMeta,
  driveGetEmail, isLoggedIn,
} from './driveStorage';
import { nodeBoxStyle } from '../constants';

const SUFFIX = '.schem.json';

// Helper tạo snapshot cấu trúc mạch để so sánh thay đổi chính xác
function makeCircuitSnapshot(nodes, wires) {
  return JSON.stringify({
    nodes: (nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: Math.round(n.position?.x ?? 0), y: Math.round(n.position?.y ?? 0) },
      data: n.data ?? {},
    })),
    wires: (wires || []).map((w) => ({
      id: w.id,
      points: w.points?.map((p) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        nodeId: p.nodeId ?? null,
        portId: p.portId ?? null,
        onWireId: p.onWireId ?? null,
      })),
      net: w.net ?? null,
      name: w.name ?? null,
      color: w.color ?? null,
      labels: w.labels ?? null,
    })),
  });
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function CloudPanel({
  nodes, wires, setNodes, setWires, onOpenRoom, onNewRoom,
}) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(isLoggedIn());
  const [email, setEmail] = useState('');

  // Thông tin file đang được mở trong editor
  const [activeFile, setActiveFile] = useState(() => {
    try {
      const saved = sessionStorage.getItem('schem_active_file');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Tên file trong ô input để lưu
  const [fileNameInput, setFileNameInput] = useState(() => activeFile?.name || 'So do moi');

  // Thư mục hiện tại đang duyệt trong Google Drive
  const [currentFolder, setCurrentFolder] = useState({ id: 'root', name: 'Drive của tôi' });
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'Drive của tôi' }]);

  // Danh sách trong thư mục đang duyệt: folders và files
  const [folderItems, setFolderItems] = useState({ folders: [], files: [] });
  const [loadingFolder, setLoadingFolder] = useState(false);

  // Tạo thư mục mới
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Trạng thái lưu & tự động lưu
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('schem_autosave_enabled');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Ref lưu snapshot lần lưu gần nhất và debounce timer
  const lastSavedSnapshotRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const nodesRef = useRef(nodes);
  const wiresRef = useRef(wires);
  const activeFileRef = useRef(activeFile);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { wiresRef.current = wires; }, [wires]);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

  // Cập nhật email khi đăng nhập
  useEffect(() => {
    if (logged) {
      driveGetEmail().then((em) => setEmail(em || '')).catch(() => {});
    } else {
      setEmail('');
    }
  }, [logged]);

  // Lưu cấu hình autoSave vào localStorage
  const handleToggleAutoSave = (checked) => {
    setAutoSaveEnabled(checked);
    try {
      localStorage.setItem('schem_autosave_enabled', String(checked));
    } catch {
      // ignore
    }
  };

  // Helper thực thi các hành động bất đồng bộ với thông báo
  const run = async (fn) => {
    setBusy(true);
    setMsg('');
    try {
      return await fn();
    } catch (e) {
      setMsg(e.message || 'Đã có lỗi xảy ra');
      if (!isLoggedIn()) setLogged(false);
      return null;
    } finally {
      setBusy(false);
    }
  };

  // Tải nội dung thư mục
  const loadFolderContents = useCallback(async (folderId) => {
    if (!isLoggedIn()) return;
    setLoadingFolder(true);
    try {
      const res = await driveListFolderContents(folderId);
      setFolderItems(res);
    } catch (e) {
      setMsg('Không thể nạp nội dung thư mục: ' + e.message);
    } finally {
      setLoadingFolder(false);
    }
  }, []);

  // Khi mở panel hoặc đổi thư mục duyệt -> nạp lại nội dung
  useEffect(() => {
    if (open && logged) {
      loadFolderContents(currentFolder.id);
    }
  }, [open, logged, currentFolder.id, loadFolderContents]);

  // Đăng nhập Google
  const handleLogin = () => run(async () => {
    await driveLogin();
    setLogged(true);
    const em = await driveGetEmail();
    setEmail(em || '');
    await loadFolderContents(currentFolder.id);
  });

  // Đăng xuất Google
  const handleLogout = () => {
    driveLogout();
    setLogged(false);
    setEmail('');
    setActiveFile(null);
    activeFileRef.current = null;
    lastSavedSnapshotRef.current = null;
    setSaveStatus('idle');
    try {
      sessionStorage.removeItem('schem_active_file');
    } catch {
      // ignore
    }
  };

  // Điều hướng vào 1 thư mục con
  const navigateToSubfolder = (folder) => {
    const nextCrumb = { id: folder.id, name: folder.name };
    setBreadcrumbs((prev) => [...prev, nextCrumb]);
    setCurrentFolder(nextCrumb);
  };

  // Điều hướng qua breadcrumbs
  const navigateBreadcrumb = (index) => {
    const target = breadcrumbs[index];
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setCurrentFolder(target);
  };

  // Lên 1 cấp thư mục
  const navigateUp = () => {
    if (breadcrumbs.length <= 1) return;
    const nextBreadcrumbs = breadcrumbs.slice(0, -1);
    const parent = nextBreadcrumbs[nextBreadcrumbs.length - 1];
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolder(parent);
  };

  // Tạo thư mục mới trên Google Drive
  const handleCreateNewFolder = () => run(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const res = await driveCreateFolder(name, currentFolder.id);
    setNewFolderName('');
    setIsCreatingFolder(false);
    setMsg(`Đã tạo thư mục "${res.name}" ✔`);
    await loadFolderContents(currentFolder.id);
  });

  // ===================== THAO TÁC FILE =====================

  // Mở 1 file từ Google Drive
  const handleOpenFile = (f) => run(async () => {
    const data = await driveLoad(f.id);
    const loadedNodes = (data.nodes || []).map((n) => ({ ...n, style: nodeBoxStyle(n) }));
    const loadedWires = data.wires || [];

    setNodes(loadedNodes);
    setWires(loadedWires);

    const cleanName = f.name.replace(SUFFIX, '');
    const fileMeta = {
      id: f.id,
      name: cleanName,
      folderId: currentFolder.id,
      folderName: currentFolder.name,
    };

    setActiveFile(fileMeta);
    activeFileRef.current = fileMeta;
    setFileNameInput(cleanName);

    try {
      sessionStorage.setItem('schem_active_file', JSON.stringify(fileMeta));
    } catch {
      // ignore
    }

    // Đánh dấu snapshot đã lưu tại thời điểm vừa mở
    lastSavedSnapshotRef.current = makeCircuitSnapshot(loadedNodes, loadedWires);
    setSaveStatus('saved');
    setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    onOpenRoom?.(f.id); // chuyển phòng realtime
    setMsg(`Đã mở: ${f.name} ✔`);
    setOpen(false); // Đóng modal để người dùng vẽ
  });

  // Hàm cốt lõi thực hiện lưu file vào Drive
  const doSaveToDrive = async ({ targetFileId, targetFolderId, targetName }) => {
    const payload = {
      nodes: nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data })),
      wires: wiresRef.current.map(({ selected, ...w }) => w),
    };

    const res = await driveSave(targetName, payload, targetFileId, targetFolderId);
    const cleanName = res.name.replace(SUFFIX, '');

    // Lấy thông tin thư mục cha
    const resolvedFolderId = targetFolderId || 'root';
    let resolvedFolderName = currentFolder.name;
    if (resolvedFolderId !== currentFolder.id) {
      const meta = await driveGetFolderMeta(resolvedFolderId);
      resolvedFolderName = meta.name;
    }

    const updatedFile = {
      id: res.id,
      name: cleanName,
      folderId: resolvedFolderId,
      folderName: resolvedFolderName,
    };

    setActiveFile(updatedFile);
    activeFileRef.current = updatedFile;
    setFileNameInput(cleanName);

    try {
      sessionStorage.setItem('schem_active_file', JSON.stringify(updatedFile));
    } catch {
      // ignore
    }

    lastSavedSnapshotRef.current = makeCircuitSnapshot(nodesRef.current, wiresRef.current);
    setSaveStatus('saved');
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLastSavedTime(timeStr);

    if (!targetFileId) {
      onOpenRoom?.(res.id);
    }

    return updatedFile;
  };

  // Nút: "Lưu vào thư mục hiện tại" (nếu là file mới, hoặc lưu đè nếu đang mở file trong thư mục này)
  const handleSaveToCurrentFolder = () => run(async () => {
    const name = fileNameInput.trim() || 'So do moi';
    const isUpdatingSameFile = activeFile?.id && activeFile?.folderId === currentFolder.id && activeFile?.name === name;

    const res = await doSaveToDrive({
      targetFileId: isUpdatingSameFile ? activeFile.id : null,
      targetFolderId: currentFolder.id,
      targetName: name,
    });

    setMsg(`Đã lưu "${res.name}" vào thư mục "${currentFolder.name}" ✔`);
    await loadFolderContents(currentFolder.id);
  });

  // Nút: "Lưu đè file đang mở" (giữ nguyên file ID và thư mục hiện tại của file đó)
  const handleOverwriteCurrentFile = () => run(async () => {
    if (!activeFile?.id) return;
    const name = fileNameInput.trim() || activeFile.name;
    await doSaveToDrive({
      targetFileId: activeFile.id,
      targetFolderId: activeFile.folderId,
      targetName: name,
    });
    setMsg(`Đã lưu cập nhật vào file "${activeFile.name}" ✔`);
    if (currentFolder.id === activeFile.folderId) {
      await loadFolderContents(currentFolder.id);
    }
  });

  // Nút: "Lưu thành bản mới vào thư mục này"
  const handleSaveAsNew = () => run(async () => {
    const name = fileNameInput.trim() || 'So do moi (ban sao)';
    const res = await doSaveToDrive({
      targetFileId: null,
      targetFolderId: currentFolder.id,
      targetName: name,
    });
    setMsg(`Đã tạo bản mới "${res.name}" trong thư mục "${currentFolder.name}" ✔`);
    await loadFolderContents(currentFolder.id);
  });

  // Xóa file trên Google Drive
  const handleDeleteFile = (f) => run(async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa file "${f.name}" khỏi Google Drive không?`)) return;
    await driveDelete(f.id);
    if (activeFile?.id === f.id) {
      setActiveFile(null);
      activeFileRef.current = null;
      lastSavedSnapshotRef.current = null;
      setSaveStatus('idle');
      try {
        sessionStorage.removeItem('schem_active_file');
      } catch {
        // ignore
      }
    }
    setMsg(`Đã xóa "${f.name}" ✔`);
    await loadFolderContents(currentFolder.id);
  });

  // Tạo sơ đồ mới (trang trắng)
  const handleNewDocument = () => {
    if (saveStatus === 'dirty') {
      if (!window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn tạo sơ đồ mới không?')) return;
    }
    setNodes([]);
    setWires([]);
    setActiveFile(null);
    activeFileRef.current = null;
    lastSavedSnapshotRef.current = null;
    setFileNameInput('So do moi');
    setSaveStatus('idle');
    try {
      sessionStorage.removeItem('schem_active_file');
    } catch {
      // ignore
    }
    onNewRoom?.();
    setMsg('Đã tạo sơ đồ mới trống');
  };

  // ===================== CƠ CHẾ AUTO-SAVE =====================
  useEffect(() => {
    const curFile = activeFileRef.current;
    if (!curFile?.id) return; // Chưa mở hay lưu file nào -> không auto-save
    if (!logged) return;

    const currentSnapshot = makeCircuitSnapshot(nodes, wires);

    // Lần đầu gán snapshot sau khi mở/lưu
    if (lastSavedSnapshotRef.current === null) {
      lastSavedSnapshotRef.current = currentSnapshot;
      return;
    }

    // Nếu không có thay đổi so với bản đã lưu
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }

    // Có thay đổi thực tế trên sơ đồ!
    setSaveStatus('dirty');

    if (!autoSaveEnabled) return;

    // Hủy timer cũ nếu có thao tác liên tục
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce 1.5 giây sau thao tác cuối để tự động lưu trực tiếp
    debounceTimerRef.current = setTimeout(async () => {
      if (!activeFileRef.current?.id) return;
      setSaveStatus('saving');
      try {
        const payload = {
          nodes: nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data })),
          wires: wiresRef.current.map(({ selected, ...w }) => w),
        };
        await driveSave(
          activeFileRef.current.name,
          payload,
          activeFileRef.current.id,
          activeFileRef.current.folderId
        );
        lastSavedSnapshotRef.current = currentSnapshot;
        setSaveStatus('saved');
        const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(timeStr);
      } catch (err) {
        setSaveStatus('error');
        setMsg('Tự động lưu lỗi: ' + err.message);
      }
    }, 1500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [nodes, wires, autoSaveEnabled, logged]);

  // Phím tắt Ctrl+S / Cmd+S để lưu ngay lập tức
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        if (activeFileRef.current?.id) {
          // File đã có -> lưu đè ngay lập tức
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          setSaveStatus('saving');
          const payload = {
            nodes: nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data })),
            wires: wiresRef.current.map(({ selected, ...w }) => w),
          };
          driveSave(activeFileRef.current.name, payload, activeFileRef.current.id, activeFileRef.current.folderId)
            .then(() => {
              lastSavedSnapshotRef.current = makeCircuitSnapshot(nodesRef.current, wiresRef.current);
              setSaveStatus('saved');
              setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
              setMsg('Đã lưu (Ctrl+S) ✔');
            })
            .catch((err) => {
              setSaveStatus('error');
              setMsg('Lỗi lưu: ' + err.message);
            });
        } else {
          // Chưa có file -> mở panel để người dùng chọn thư mục và đặt tên
          setOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  // Cảnh báo nếu thoát trang khi còn thay đổi chưa lưu
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (saveStatus === 'dirty') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveStatus]);

  // Render trạng thái badge nhỏ gọn
  const renderStatusBadge = () => {
    if (saveStatus === 'saving') {
      return (
        <span style={{ color: '#1677ff', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          💾 Đang lưu...
        </span>
      );
    }
    if (saveStatus === 'saved') {
      return (
        <span style={{ color: '#52c41a', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          🟢 Đã lưu {lastSavedTime ? `(${lastSavedTime})` : ''}
        </span>
      );
    }
    if (saveStatus === 'dirty') {
      return (
        <span style={{ color: '#fa8c16', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          🟡 Chưa lưu
        </span>
      );
    }
    if (saveStatus === 'error') {
      return (
        <span style={{ color: '#ff4d4f', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          🔴 Lỗi lưu
        </span>
      );
    }
    return null;
  };

  // Nút bấm ngoài thanh công cụ khi panel đang đóng
  const renderTriggerBar = () => {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: '#fff', border: '1px solid #ddd', borderRadius: 8,
        padding: '3px 8px', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        fontFamily: 'sans-serif', fontSize: 12,
      }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', borderRadius: 4, color: '#1677ff',
          }}
          title="Mở bảng quản lý thư mục Google Drive"
        >
          ☁ Drive
        </button>

        {logged && activeFile && (
          <>
            <span style={{ color: '#ddd' }}>|</span>
            <span
              style={{
                maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: 600, color: '#333', cursor: 'pointer',
              }}
              onClick={() => setOpen(true)}
              title={`File: ${activeFile.name}\nThư mục: ${activeFile.folderName}`}
            >
              📄 {activeFile.name}
            </span>
            <span style={{ fontSize: 11, color: '#888' }}>
              ({activeFile.folderName})
            </span>
            <span style={{ color: '#ddd' }}>|</span>
            {renderStatusBadge()}
            {saveStatus === 'dirty' && (
              <button
                onClick={handleOverwriteCurrentFile}
                style={{
                  padding: '2px 8px', background: '#fa8c16', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                  fontWeight: 600,
                }}
                title="Lưu ngay (Ctrl+S)"
              >
                Lưu ngay
              </button>
            )}
          </>
        )}

        {logged && !activeFile && (
          <>
            <span style={{ color: '#ddd' }}>|</span>
            <span style={{ color: '#888', fontStyle: 'italic', cursor: 'pointer' }} onClick={() => setOpen(true)}>
              Chưa lưu vào Drive
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {renderTriggerBar()}

      {open && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.45)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: '92vw', maxWidth: 660, maxHeight: '88vh',
              background: '#fff', borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 18px', background: '#f8f9fa', borderBottom: '1px solid #e9ecef',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>☁</span>
                <b style={{ fontSize: 15, color: '#1a1a1a' }}>Google Drive — Quản lý thư mục & Tự động lưu</b>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  border: 'none', background: 'transparent', fontSize: 18,
                  cursor: 'pointer', color: '#666', padding: '2px 8px', borderRadius: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!logged ? (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <div style={{ fontSize: 42, marginBottom: 12 }}>☁</div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#222' }}>Đăng nhập Google Drive</h3>
                  <p style={{ color: '#666', fontSize: 13, maxWidth: 420, margin: '0 auto 18px auto', lineHeight: 1.5 }}>
                    Kết nối với tài khoản Google để chọn chính xác thư mục bạn muốn lưu, mở lại file mạch điện và tự động cập nhật mọi thay đổi trực tiếp lên Drive.
                  </p>
                  <button
                    disabled={busy}
                    onClick={handleLogin}
                    style={{
                      background: '#1677ff', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '10px 24px', fontSize: 14,
                      fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                      boxShadow: '0 2px 6px rgba(22,119,255,0.3)',
                    }}
                  >
                    {busy ? 'Đang kết nối...' : 'Đăng nhập Google'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Thanh thông tin tài khoản & trạng thái file đang mở */}
                  <div style={{
                    background: '#f4f6fa', borderRadius: 8, padding: '10px 14px',
                    display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#555' }}>
                        Tài khoản: <b>{email || 'Đã đăng nhập'}</b>
                      </span>
                      <button
                        onClick={handleLogout}
                        style={{
                          border: 'none', background: 'transparent', color: '#ff4d4f',
                          cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
                        }}
                      >
                        Đăng xuất
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontSize: 13 }}>
                        File đang mở: {activeFile ? (
                          <>
                            <b style={{ color: '#1677ff' }}>{activeFile.name}</b>
                            <span style={{ color: '#666', fontSize: 12, marginLeft: 6 }}>
                              (trong thư mục: <b>{activeFile.folderName}</b>)
                            </span>
                          </>
                        ) : (
                          <i style={{ color: '#888' }}>Chưa mở file nào (Sơ đồ mới chưa lưu)</i>
                        )}
                      </div>
                      <div>{renderStatusBadge()}</div>
                    </div>

                    {/* Checkbox tự động lưu */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: '1px dashed #ddd' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#333' }}>
                        <input
                          type="checkbox"
                          checked={autoSaveEnabled}
                          onChange={(e) => handleToggleAutoSave(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Tự động lưu trực tiếp vào file trên Google Drive mỗi khi có thay đổi (Auto-save)</span>
                      </label>
                    </div>
                  </div>

                  {/* Khu vực Nhập tên và Nút lưu file */}
                  <div style={{
                    background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
                    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap' }}>
                        Tên sơ đồ:
                      </label>
                      <input
                        value={fileNameInput}
                        onChange={(e) => setFileNameInput(e.target.value)}
                        placeholder="Nhập tên sơ đồ mạch..."
                        style={{
                          flex: 1, padding: '7px 10px', fontSize: 13,
                          border: '1px solid #ccc', borderRadius: 6, outline: 'none',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {/* Nút lưu vào thư mục đang xem */}
                      <button
                        disabled={busy}
                        onClick={handleSaveToCurrentFolder}
                        style={{
                          background: '#1677ff', color: '#fff', border: 'none',
                          borderRadius: 6, padding: '7px 14px', fontSize: 12,
                          fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                        title={`Lưu file "${fileNameInput}" vào thư mục "${currentFolder.name}"`}
                      >
                        💾 Lưu vào thư mục: {currentFolder.name}
                      </button>

                      {/* Nếu đang mở file cũ và muốn lưu đè vào file đó */}
                      {activeFile?.id && (
                        <button
                          disabled={busy}
                          onClick={handleOverwriteCurrentFile}
                          style={{
                            background: '#52c41a', color: '#fff', border: 'none',
                            borderRadius: 6, padding: '7px 12px', fontSize: 12,
                            fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                          }}
                          title={`Ghi đè trực tiếp vào file "${activeFile.name}" trong thư mục "${activeFile.folderName}"`}
                        >
                          Lưu đè file hiện tại
                        </button>
                      )}

                      {/* Nút lưu bản mới */}
                      {activeFile?.id && (
                        <button
                          disabled={busy}
                          onClick={handleSaveAsNew}
                          style={{
                            background: '#fafafa', border: '1px solid #ccc', color: '#333',
                            borderRadius: 6, padding: '7px 12px', fontSize: 12,
                            fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Lưu thành bản mới
                        </button>
                      )}

                      <button
                        onClick={handleNewDocument}
                        style={{
                          background: '#fff', border: '1px solid #ddd', color: '#555',
                          borderRadius: 6, padding: '7px 12px', fontSize: 12,
                          cursor: 'pointer', marginLeft: 'auto',
                        }}
                      >
                        📄 Tạo sơ đồ mới
                      </button>
                    </div>
                  </div>

                  {/* KHU VỰC DUYỆT THƯ MỤC GOOGLE DRIVE */}
                  <div style={{
                    border: '1px solid #e0e0e0', borderRadius: 8,
                    display: 'flex', flexDirection: 'column', flex: 1, minHeight: 240,
                  }}>
                    {/* Thanh điều hướng Breadcrumbs */}
                    <div style={{
                      padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #e8e8e8',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 6,
                    }}>
                      {/* Breadcrumbs */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, flexWrap: 'wrap' }}>
                        {breadcrumbs.map((crumb, idx) => (
                          <span key={crumb.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {idx > 0 && <span style={{ color: '#aaa' }}>/</span>}
                            <span
                              onClick={() => navigateBreadcrumb(idx)}
                              style={{
                                cursor: idx < breadcrumbs.length - 1 ? 'pointer' : 'default',
                                fontWeight: idx === breadcrumbs.length - 1 ? 700 : 500,
                                color: idx === breadcrumbs.length - 1 ? '#1a1a1a' : '#1677ff',
                                textDecoration: idx < breadcrumbs.length - 1 ? 'underline' : 'none',
                              }}
                            >
                              {idx === 0 ? '🏠 ' : '📁 '}
                              {crumb.name}
                            </span>
                          </span>
                        ))}
                      </div>

                      {/* Nút thao tác thư mục */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          disabled={breadcrumbs.length <= 1 || loadingFolder}
                          onClick={navigateUp}
                          style={{
                            padding: '4px 8px', fontSize: 11, borderRadius: 4,
                            border: '1px solid #ddd', background: '#fff',
                            cursor: breadcrumbs.length > 1 ? 'pointer' : 'not-allowed',
                            color: breadcrumbs.length > 1 ? '#333' : '#aaa',
                          }}
                          title="Lên thư mục cha"
                        >
                          ⬆ Lên 1 cấp
                        </button>

                        <button
                          onClick={() => setIsCreatingFolder((v) => !v)}
                          style={{
                            padding: '4px 8px', fontSize: 11, borderRadius: 4,
                            border: '1px solid #1677ff', background: '#e6f4ff',
                            color: '#1677ff', cursor: 'pointer', fontWeight: 600,
                          }}
                          title="Tạo thư mục con trong thư mục này"
                        >
                          📁➕ Thư mục mới
                        </button>

                        <button
                          disabled={loadingFolder}
                          onClick={() => loadFolderContents(currentFolder.id)}
                          style={{
                            padding: '4px 8px', fontSize: 11, borderRadius: 4,
                            border: '1px solid #ddd', background: '#fff', cursor: 'pointer',
                          }}
                          title="Tải lại thư mục"
                        >
                          🔄
                        </button>
                      </div>
                    </div>

                    {/* Hộp tạo thư mục mới (nếu bật) */}
                    {isCreatingFolder && (
                      <div style={{
                        padding: '8px 12px', background: '#f0f7ff', borderBottom: '1px solid #bae0ff',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 12, color: '#333', fontWeight: 500 }}>Tên thư mục con:</span>
                        <input
                          autoFocus
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateNewFolder();
                            if (e.key === 'Escape') setIsCreatingFolder(false);
                          }}
                          placeholder="Ví dụ: Mach_Nguon, Mach_So..."
                          style={{
                            flex: 1, padding: '4px 8px', fontSize: 12,
                            border: '1px solid #91caff', borderRadius: 4, outline: 'none',
                          }}
                        />
                        <button
                          onClick={handleCreateNewFolder}
                          disabled={busy || !newFolderName.trim()}
                          style={{
                            padding: '4px 10px', fontSize: 12, background: '#1677ff',
                            color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
                          }}
                        >
                          Tạo
                        </button>
                        <button
                          onClick={() => setIsCreatingFolder(false)}
                          style={{
                            padding: '4px 8px', fontSize: 12, background: '#fff',
                            border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer',
                          }}
                        >
                          Hủy
                        </button>
                      </div>
                    )}

                    {/* Danh sách Thư mục con & File */}
                    <div style={{ flex: 1, maxHeight: 260, overflowY: 'auto', padding: 4 }}>
                      {loadingFolder ? (
                        <div style={{ textAlign: 'center', padding: '30px 0', color: '#888', fontSize: 13 }}>
                          Đang tải dữ liệu từ Google Drive...
                        </div>
                      ) : (
                        <>
                          {folderItems.folders.length === 0 && folderItems.files.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: '#999', fontSize: 12, fontStyle: 'italic' }}>
                              Thư mục này trống (chưa có thư mục con hay file sơ đồ nào)
                            </div>
                          )}

                          {/* Danh sách Thư mục con */}
                          {folderItems.folders.map((f) => (
                            <div
                              key={f.id}
                              onClick={() => navigateToSubfolder(f)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: '#333' }}>
                                <span style={{ fontSize: 16 }}>📁</span>
                                <span>{f.name}</span>
                              </div>
                              <span style={{ fontSize: 11, color: '#888' }}>Thư mục ›</span>
                            </div>
                          ))}

                          {/* Danh sách File sơ đồ */}
                          {folderItems.files.map((file) => {
                            const isCurrentOpen = activeFile?.id === file.id;
                            const cleanTitle = file.name.replace(SUFFIX, '');
                            return (
                              <div
                                key={file.id}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '7px 10px', borderRadius: 6,
                                  background: isCurrentOpen ? '#e6f4ff' : 'transparent',
                                  borderTop: '1px solid #f0f0f0',
                                }}
                              >
                                <div
                                  onClick={() => handleOpenFile(file)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8, flex: 1,
                                    cursor: 'pointer', overflow: 'hidden',
                                  }}
                                  title={`Bấm để mở "${file.name}"`}
                                >
                                  <span style={{ fontSize: 16 }}>📄</span>
                                  <span style={{
                                    fontSize: 13, fontWeight: isCurrentOpen ? 700 : 500,
                                    color: isCurrentOpen ? '#1677ff' : '#222',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {cleanTitle}
                                  </span>
                                  {isCurrentOpen && (
                                    <span style={{
                                      fontSize: 10, background: '#1677ff', color: '#fff',
                                      padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                                    }}>
                                      Đang mở
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 11, color: '#888' }}>
                                    {formatDateTime(file.modifiedTime)}
                                  </span>
                                  <button
                                    onClick={() => handleOpenFile(file)}
                                    style={{
                                      padding: '3px 8px', fontSize: 11, background: '#1677ff',
                                      color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
                                    }}
                                  >
                                    Mở
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFile(file)}
                                    style={{
                                      padding: '3px 6px', fontSize: 12, background: 'transparent',
                                      border: 'none', cursor: 'pointer', color: '#999',
                                    }}
                                    title="Xóa file khỏi Google Drive"
                                  >
                                    🗑
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Thông báo tiến trình hoặc lỗi */}
              {busy && (
                <div style={{ color: '#1677ff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⏳</span> Đang xử lý trên Google Drive...
                </div>
              )}
              {msg && (
                <div style={{
                  padding: '6px 12px', borderRadius: 6, fontSize: 12,
                  background: msg.includes('✔') ? '#f6ffed' : '#fff2f0',
                  color: msg.includes('✔') ? '#389e0d' : '#cf1322',
                  border: `1px solid ${msg.includes('✔') ? '#b7eb8f' : '#ffccc7'}`,
                }}>
                  {msg}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '10px 18px', background: '#f8f9fa', borderTop: '1px solid #e9ecef',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '7px 16px', background: '#fff', border: '1px solid #ddd',
                  borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500,
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}