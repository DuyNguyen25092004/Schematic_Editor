import { useState, useEffect, useRef, useCallback } from 'react';
import {
  driveLogin, driveLogout, driveLoad, driveSave, driveDelete,
  driveListFolderContents, driveCreateFolder, driveGetFolderMeta,
  driveGetEmail, isLoggedIn, parseFolderIdFromUrl,
} from './driveStorage';
import { nodeBoxStyle } from '../constants';
import { db } from '../realtime/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const SUFFIX = '.schem.json';

// Helper tạo snapshot cấu trúc mạch để so sánh thay đổi chính xác
function makeCircuitSnapshot(nodes, wires, sheets) {
  if (sheets && Array.isArray(sheets) && sheets.length > 0) {
    return JSON.stringify(sheets.map((s) => ({
      id: s.id,
      name: s.name,
      nodes: (s.nodes || []).map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: Math.round(n.position?.x ?? 0), y: Math.round(n.position?.y ?? 0) },
        data: n.data ?? {},
      })),
      wires: (s.wires || []).map((w) => ({
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
    })));
  }
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
  return `${d.toLocaleDateString('en-US')} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function CloudPanel({
  nodes, wires, setNodes, setWires, onOpenRoom, onNewRoom,
  sheets, setSheets, activeSheetId, setActiveSheetId,
  onAuthChange, openTrigger,
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openTrigger) setOpen(true);
  }, [openTrigger]);
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
  const [fileNameInput, setFileNameInput] = useState(() => activeFile?.name || 'New Schematic');

  // Thư mục hiện tại đang duyệt trong Google Drive
  const [currentFolder, setCurrentFolder] = useState({ id: 'root', name: 'My Drive' });
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);

  // Danh sách trong thư mục đang duyệt: folders và files
  const [folderItems, setFolderItems] = useState({ folders: [], files: [] });
  const [loadingFolder, setLoadingFolder] = useState(false);

  // Tạo thư mục mới
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Mở thư mục bằng Link / ID
  const [isOpeningUrl, setIsOpeningUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');

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

  const sheetsRef = useRef(sheets);
  const activeSheetIdRef = useRef(activeSheetId);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { wiresRef.current = wires; }, [wires]);
  useEffect(() => { sheetsRef.current = sheets; }, [sheets]);
  useEffect(() => { activeSheetIdRef.current = activeSheetId; }, [activeSheetId]);
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
      setMsg(e.message || 'An error occurred');
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
      setMsg('Failed to load folder contents: ' + e.message);
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
    onAuthChange?.();
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
    onAuthChange?.();
  };

  // Chuyển sang xem "My Drive"
  const switchToMyDrive = () => {
    const root = { id: 'root', name: 'My Drive' };
    setCurrentFolder(root);
    setBreadcrumbs([root]);
  };

  // Chuyển sang xem "Shared with me"
  const switchToSharedWithMe = () => {
    const shared = { id: 'sharedWithMe', name: 'Shared with me' };
    setCurrentFolder(shared);
    setBreadcrumbs([shared]);
  };

  // Mở thư mục bằng link hoặc ID Google Drive
  const handleOpenFolderByUrl = () => run(async () => {
    const parsedId = parseFolderIdFromUrl(urlInput);
    if (!parsedId) {
      setMsg('Invalid folder link or ID.');
      return;
    }
    const meta = await driveGetFolderMeta(parsedId);
    if (!meta || !meta.id) {
      setMsg('Cannot access this folder. Please check your permissions or folder ID.');
      return;
    }
    const folderObj = { id: meta.id, name: meta.name || 'Shared Folder' };
    setCurrentFolder(folderObj);
    setBreadcrumbs([
      { id: 'sharedWithMe', name: 'Shared with me' },
      folderObj,
    ]);
    setIsOpeningUrl(false);
    setUrlInput('');
    setMsg(`Opened folder "${folderObj.name}" ✔`);
  });

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
    if (currentFolder.id === 'sharedWithMe') {
      setMsg('Cannot create folder directly in "Shared with me". Please select a subfolder or switch to "My Drive".');
      return;
    }
    const name = newFolderName.trim();
    if (!name) return;
    const res = await driveCreateFolder(name, currentFolder.id);
    setNewFolderName('');
    setIsCreatingFolder(false);
    setMsg(`Created folder "${res.name}" ✔`);
    await loadFolderContents(currentFolder.id);
  });

  // ===================== THAO TÁC FILE =====================

  // Mở 1 file từ Google Drive
  const handleOpenFile = (f) => run(async () => {
    const data = await driveLoad(f.id);
    let loadedSheets = [];
    let activeSheet = null;

    if (data.sheets && Array.isArray(data.sheets) && data.sheets.length > 0) {
      loadedSheets = data.sheets.map((s) => ({
        id: s.id,
        name: s.name || 'Sheet',
        nodes: (s.nodes || []).map((n) => ({ ...n, style: nodeBoxStyle(n) })),
        wires: s.wires || [],
      }));
      const targetActiveId = data.activeSheetId && loadedSheets.some((s) => s.id === data.activeSheetId)
        ? data.activeSheetId
        : loadedSheets[0].id;
      activeSheet = loadedSheets.find((s) => s.id === targetActiveId) || loadedSheets[0];
      if (setSheets) setSheets(loadedSheets);
      if (setActiveSheetId) setActiveSheetId(targetActiveId);
    } else {
      const loadedNodes = (data.nodes || []).map((n) => ({ ...n, style: nodeBoxStyle(n) }));
      const loadedWires = data.wires || [];
      const singleSheet = [{ id: 'sheet_1', name: f.name.replace(SUFFIX, '') || 'Sheet 1', nodes: loadedNodes, wires: loadedWires }];
      loadedSheets = singleSheet;
      activeSheet = singleSheet[0];
      if (setSheets) setSheets(singleSheet);
      if (setActiveSheetId) setActiveSheetId('sheet_1');
    }

    setNodes(activeSheet.nodes || []);
    setWires(activeSheet.wires || []);

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
    lastSavedSnapshotRef.current = makeCircuitSnapshot(activeSheet.nodes, activeSheet.wires, loadedSheets);
    setSaveStatus('saved');
    setLastSavedTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    const openTs = Date.now();
    try {
      const strippedSheets = loadedSheets.map((s) => ({
        id: s.id,
        name: s.name,
        nodes: (s.nodes || []).map(({ id, type, position, data }) => ({ id, type, position, data })),
        wires: (s.wires || []).map(({ selected, ...w }) => w),
      }));
      localStorage.setItem(`schem_backup_${f.id}`, JSON.stringify({
        sheets: strippedSheets,
        activeSheetId: activeSheet?.id || 'sheet_1',
        ts: openTs,
      }));
      setDoc(doc(db, 'circuits', f.id), {
        sheets: strippedSheets,
        activeSheetId: activeSheet?.id || 'sheet_1',
        ts: openTs,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    } catch {}

    onOpenRoom?.(f.id, fileMeta); // chuyển phòng realtime
    setMsg(`Đã mở: ${f.name} ✔`);
    setOpen(false); // Đóng modal để người dùng vẽ
  });

  // Hàm cốt lõi thực hiện lưu file vào Drive
  const doSaveToDrive = async ({ targetFileId, targetFolderId, targetName }) => {
    const curNodes = nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data }));
    const curWires = wiresRef.current.map(({ selected, ...w }) => w);
    const curActiveId = activeSheetIdRef.current;

    // Lưu toàn bộ các sheet của project vào file Drive
    const fullSheets = (sheetsRef.current || []).map((s) => ({
      id: s.id,
      name: s.name,
      nodes: s.id === curActiveId ? curNodes : (s.nodes || []).map(({ id, type, position, data }) => ({ id, type, position, data })),
      wires: s.id === curActiveId ? curWires : (s.wires || []).map(({ selected, ...w }) => w),
    }));

    const payload = {
      sheets: fullSheets,
      activeSheetId: curActiveId,
      nodes: curNodes,
      wires: curWires,
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

    lastSavedSnapshotRef.current = makeCircuitSnapshot(curNodes, curWires, fullSheets);
    setSaveStatus('saved');
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLastSavedTime(timeStr);

    const saveTs = Date.now();
    try {
      localStorage.setItem(`schem_backup_${res.id}`, JSON.stringify({
        sheets: fullSheets,
        activeSheetId: curActiveId,
        ts: saveTs,
      }));
      setDoc(doc(db, 'circuits', res.id), {
        sheets: fullSheets,
        activeSheetId: curActiveId,
        ts: saveTs,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    } catch {}

    if (!targetFileId) {
      onOpenRoom?.(res.id, updatedFile);
    }

    return updatedFile;
  };

  // Nút: "Lưu vào thư mục hiện tại" (nếu là file mới, hoặc lưu đè nếu đang mở file trong thư mục này)
  const handleSaveToCurrentFolder = () => run(async () => {
    if (currentFolder.id === 'sharedWithMe') {
      setMsg('The "Shared with me" root is a general list. Please navigate into a subfolder to save your file.');
      return;
    }
    const name = fileNameInput.trim() || 'New Schematic';
    const isUpdatingSameFile = activeFile?.id && activeFile?.folderId === currentFolder.id && activeFile?.name === name;

    const res = await doSaveToDrive({
      targetFileId: isUpdatingSameFile ? activeFile.id : null,
      targetFolderId: currentFolder.id,
      targetName: name,
    });

    setMsg(`Saved "${res.name}" to folder "${currentFolder.name}" ✔`);
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
    setMsg(`Saved updates to file "${activeFile.name}" ✔`);
    if (currentFolder.id === activeFile.folderId) {
      await loadFolderContents(currentFolder.id);
    }
  });

  // Nút: "Lưu thành bản mới vào thư mục này"
  const handleSaveAsNew = () => run(async () => {
    if (currentFolder.id === 'sharedWithMe') {
      setMsg('The "Shared with me" root is a general list. Please navigate into a subfolder to save your file.');
      return;
    }
    const name = fileNameInput.trim() || 'New Schematic (copy)';
    const res = await doSaveToDrive({
      targetFileId: null,
      targetFolderId: currentFolder.id,
      targetName: name,
    });
    setMsg(`Created new copy "${res.name}" in folder "${currentFolder.name}" ✔`);
    await loadFolderContents(currentFolder.id);
  });

  // Xóa file trên Google Drive
  const handleDeleteFile = (f) => run(async () => {
    if (!window.confirm(`Are you sure you want to delete file "${f.name}" from Google Drive?`)) return;
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
    setMsg(`Deleted "${f.name}" ✔`);
    await loadFolderContents(currentFolder.id);
  });

  // Tạo sơ đồ mới (trang trắng)
  const handleNewDocument = () => {
    if (saveStatus === 'dirty') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to create a new schematic?')) return;
    }
    const initialSheet = [{ id: 'sheet_1', name: 'Sheet 1', nodes: [], wires: [] }];
    if (setSheets) setSheets(initialSheet);
    if (setActiveSheetId) setActiveSheetId('sheet_1');
    setNodes([]);
    setWires([]);
    setActiveFile(null);
    activeFileRef.current = null;
    lastSavedSnapshotRef.current = null;
    setFileNameInput('New Schematic');
    setSaveStatus('idle');
    try {
      sessionStorage.removeItem('schem_active_file');
    } catch {
      // ignore
    }
    onNewRoom?.();
    setMsg('Created new empty schematic');
  };

  // ===================== CƠ CHẾ AUTO-SAVE =====================
  useEffect(() => {
    const curFile = activeFileRef.current;
    if (!curFile?.id) return; // Chưa mở hay lưu file nào -> không auto-save
    if (!logged) return;

    const fullSheets = (sheetsRef.current || []).map((s) => ({
      ...s,
      nodes: s.id === activeSheetIdRef.current ? nodes : s.nodes,
      wires: s.id === activeSheetIdRef.current ? wires : s.wires,
    }));
    const currentSnapshot = makeCircuitSnapshot(nodes, wires, fullSheets);

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
        const curNodes = nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data }));
        const curWires = wiresRef.current.map(({ selected, ...w }) => w);
        const curActiveId = activeSheetIdRef.current;
        const currentFullSheets = (sheetsRef.current || []).map((s) => ({
          id: s.id,
          name: s.name,
          nodes: s.id === curActiveId ? curNodes : (s.nodes || []).map(({ id, type, position, data }) => ({ id, type, position, data })),
          wires: s.id === curActiveId ? curWires : (s.wires || []).map(({ selected, ...w }) => w),
        }));

        const payload = {
          sheets: currentFullSheets,
          activeSheetId: curActiveId,
          nodes: curNodes,
          wires: curWires,
        };
        await driveSave(
          activeFileRef.current.name,
          payload,
          activeFileRef.current.id,
          activeFileRef.current.folderId
        );

        const autoSaveTs = Date.now();
        try {
          localStorage.setItem(`schem_backup_${activeFileRef.current.id}`, JSON.stringify({
            sheets: currentFullSheets,
            activeSheetId: curActiveId,
            ts: autoSaveTs,
          }));
          setDoc(doc(db, 'circuits', activeFileRef.current.id), {
            sheets: currentFullSheets,
            activeSheetId: curActiveId,
            ts: autoSaveTs,
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        } catch {}

        lastSavedSnapshotRef.current = currentSnapshot;
        setSaveStatus('saved');
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(timeStr);
      } catch (err) {
        setSaveStatus('error');
        setMsg('Auto-save error: ' + err.message);
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

          const curNodes = nodesRef.current.map(({ id, type, position, data }) => ({ id, type, position, data }));
          const curWires = wiresRef.current.map(({ selected, ...w }) => w);
          const curActiveId = activeSheetIdRef.current;
          const currentFullSheets = (sheetsRef.current || []).map((s) => ({
            id: s.id,
            name: s.name,
            nodes: s.id === curActiveId ? curNodes : (s.nodes || []).map(({ id, type, position, data }) => ({ id, type, position, data })),
            wires: s.id === curActiveId ? curWires : (s.wires || []).map(({ selected, ...w }) => w),
          }));

          const payload = {
            sheets: currentFullSheets,
            activeSheetId: curActiveId,
            nodes: curNodes,
            wires: curWires,
          };

          driveSave(activeFileRef.current.name, payload, activeFileRef.current.id, activeFileRef.current.folderId)
            .then(() => {
              const saveTs = Date.now();
              try {
                localStorage.setItem(`schem_backup_${activeFileRef.current.id}`, JSON.stringify({
                  sheets: currentFullSheets,
                  activeSheetId: curActiveId,
                  ts: saveTs,
                }));
                setDoc(doc(db, 'circuits', activeFileRef.current.id), {
                  sheets: currentFullSheets,
                  activeSheetId: curActiveId,
                  ts: saveTs,
                  updatedAt: serverTimestamp(),
                }, { merge: true }).catch(() => {});
              } catch {}

              lastSavedSnapshotRef.current = makeCircuitSnapshot(curNodes, curWires, currentFullSheets);
              setSaveStatus('saved');
              setLastSavedTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
              setMsg('Saved (Ctrl+S) ✔');
            })
            .catch((err) => {
              setSaveStatus('error');
              setMsg('Save error: ' + err.message);
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
          💾 Saving...
        </span>
      );
    }
    if (saveStatus === 'saved') {
      return (
        <span style={{ color: '#52c41a', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          🟢 Saved {lastSavedTime ? `(${lastSavedTime})` : ''}
        </span>
      );
    }
    if (saveStatus === 'dirty') {
      return (
        <span style={{ color: '#fa8c16', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          🟡 Unsaved
        </span>
      );
    }
    if (saveStatus === 'error') {
      return (
        <span style={{ color: '#ff4d4f', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
          🔴 Save Error
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
          title="Open Google Drive folder management"
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
              title={`File: ${activeFile.name}\nFolder: ${activeFile.folderName}`}
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
                title="Save now (Ctrl+S)"
              >
                Save now
              </button>
            )}
          </>
        )}

        {logged && !activeFile && (
          <>
            <span style={{ color: '#ddd' }}>|</span>
            <span style={{ color: '#888', fontStyle: 'italic', cursor: 'pointer' }} onClick={() => setOpen(true)}>
              Not saved to Drive
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
                <b style={{ fontSize: 15, color: '#1a1a1a' }}>Google Drive — Folder Management & Auto-Save</b>
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
                  <h3 style={{ margin: '0 0 8px 0', color: '#222' }}>Sign in to Google Drive</h3>
                  <p style={{ color: '#666', fontSize: 13, maxWidth: 420, margin: '0 auto 18px auto', lineHeight: 1.5 }}>
                    Connect your Google account to choose exactly where to save schematics, reopen existing circuits, and auto-sync changes to Google Drive.
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
                    {busy ? 'Connecting...' : 'Sign in with Google'}
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
                        Account: <b>{email || 'Signed in'}</b>
                      </span>
                      <button
                        onClick={handleLogout}
                        style={{
                          border: 'none', background: 'transparent', color: '#ff4d4f',
                          cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
                        }}
                      >
                        Sign out
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontSize: 13 }}>
                        Open file: {activeFile ? (
                          <>
                            <b style={{ color: '#1677ff' }}>{activeFile.name}</b>
                            <span style={{ color: '#666', fontSize: 12, marginLeft: 6 }}>
                              (in folder: <b>{activeFile.folderName}</b>)
                            </span>
                          </>
                        ) : (
                          <i style={{ color: '#888' }}>No file open (New unsaved schematic)</i>
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
                        <span>Automatically save changes directly to Google Drive (Auto-save)</span>
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
                        Schematic name:
                      </label>
                      <input
                        value={fileNameInput}
                        onChange={(e) => setFileNameInput(e.target.value)}
                        placeholder="Enter schematic name..."
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
                        title={`Save file "${fileNameInput}" to folder "${currentFolder.name}"`}
                      >
                        💾 Save to folder: {currentFolder.name}
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
                          title={`Overwrite existing file "${activeFile.name}" in folder "${activeFile.folderName}"`}
                        >
                          Overwrite Current File
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
                          Save as Copy
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
                        📄 New Schematic
                      </button>
                    </div>
                  </div>

                  {/* KHU VỰC DUYỆT THƯ MỤC GOOGLE DRIVE */}
                  <div style={{
                    border: '1px solid #e0e0e0', borderRadius: 8,
                    display: 'flex', flexDirection: 'column', flex: 1, minHeight: 240,
                    overflow: 'hidden',
                  }}>
                    {/* Tabs switch between My Drive and Shared with me */}
                    <div style={{
                      display: 'flex', alignItems: 'center', borderBottom: '1px solid #e2e8f0',
                      background: '#f8fafc', padding: '0 8px', gap: 4, flexWrap: 'wrap',
                    }}>
                      <button
                        onClick={switchToMyDrive}
                        style={{
                          padding: '8px 14px', border: 'none', background: 'transparent',
                          borderBottom: breadcrumbs[0]?.id === 'root' ? '2px solid #1677ff' : '2px solid transparent',
                          color: breadcrumbs[0]?.id === 'root' ? '#1677ff' : '#64748b',
                          fontWeight: breadcrumbs[0]?.id === 'root' ? 700 : 500,
                          fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <span>🏠</span> My Drive
                      </button>
                      <button
                        onClick={switchToSharedWithMe}
                        style={{
                          padding: '8px 14px', border: 'none', background: 'transparent',
                          borderBottom: breadcrumbs[0]?.id === 'sharedWithMe' ? '2px solid #1677ff' : '2px solid transparent',
                          color: breadcrumbs[0]?.id === 'sharedWithMe' ? '#1677ff' : '#64748b',
                          fontWeight: breadcrumbs[0]?.id === 'sharedWithMe' ? 700 : 500,
                          fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <span>👥</span> Shared with me
                      </button>
                      <button
                        onClick={() => setIsOpeningUrl((v) => !v)}
                        style={{
                          marginLeft: 'auto', padding: '4px 10px', fontSize: 11,
                          border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff',
                          color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        title="Enter Google Drive link or shared folder ID"
                      >
                        <span>🔗</span> Open Folder Link / ID
                      </button>
                    </div>

                    {/* Folder Link / ID input box */}
                    {isOpeningUrl && (
                      <div style={{
                        padding: '8px 12px', background: '#f0f7ff', borderBottom: '1px solid #bae0ff',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 12, color: '#333', fontWeight: 500 }}>Folder Link or ID:</span>
                        <input
                          autoFocus
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleOpenFolderByUrl();
                            if (e.key === 'Escape') setIsOpeningUrl(false);
                          }}
                          placeholder="Paste drive.google.com/drive/folders/... link or folder ID"
                          style={{
                            flex: 1, padding: '4px 8px', fontSize: 12,
                            border: '1px solid #91caff', borderRadius: 4, outline: 'none',
                          }}
                        />
                        <button
                          onClick={handleOpenFolderByUrl}
                          disabled={busy || !urlInput.trim()}
                          style={{
                            padding: '4px 10px', fontSize: 12, background: '#1677ff',
                            color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
                          }}
                        >
                          Open
                        </button>
                        <button
                          onClick={() => setIsOpeningUrl(false)}
                          style={{
                            padding: '4px 8px', fontSize: 12, background: '#fff',
                            border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer',
                          }}
                        >
                          Close
                        </button>
                      </div>
                    )}

                    {/* Breadcrumbs Navigation */}
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
                              {idx === 0 ? (crumb.id === 'sharedWithMe' ? '👥 ' : '🏠 ') : '📁 '}
                              {crumb.name}
                            </span>
                          </span>
                        ))}
                      </div>

                      {/* Folder action buttons */}
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
                          title="Up one level"
                        >
                          ⬆ Up 1 Level
                        </button>

                        <button
                          disabled={currentFolder.id === 'sharedWithMe'}
                          onClick={() => setIsCreatingFolder((v) => !v)}
                          style={{
                            padding: '4px 8px', fontSize: 11, borderRadius: 4,
                            border: currentFolder.id === 'sharedWithMe' ? '1px solid #ddd' : '1px solid #1677ff',
                            background: currentFolder.id === 'sharedWithMe' ? '#f5f5f5' : '#e6f4ff',
                            color: currentFolder.id === 'sharedWithMe' ? '#aaa' : '#1677ff',
                            cursor: currentFolder.id === 'sharedWithMe' ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                          }}
                          title={currentFolder.id === 'sharedWithMe' ? 'Cannot create folder in shared root' : 'Create subfolder in this folder'}
                        >
                          📁➕ New Folder
                        </button>

                        <button
                          disabled={loadingFolder}
                          onClick={() => loadFolderContents(currentFolder.id)}
                          style={{
                            padding: '4px 8px', fontSize: 11, borderRadius: 4,
                            border: '1px solid #ddd', background: '#fff', cursor: 'pointer',
                          }}
                          title="Refresh folder"
                        >
                          🔄
                        </button>
                      </div>
                    </div>

                    {/* New folder creation box */}
                    {isCreatingFolder && (
                      <div style={{
                        padding: '8px 12px', background: '#f0f7ff', borderBottom: '1px solid #bae0ff',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 12, color: '#333', fontWeight: 500 }}>Subfolder name:</span>
                        <input
                          autoFocus
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateNewFolder();
                            if (e.key === 'Escape') setIsCreatingFolder(false);
                          }}
                          placeholder="e.g. Power_Circuits, Logic_Gates..."
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
                          Create
                        </button>
                        <button
                          onClick={() => setIsCreatingFolder(false)}
                          style={{
                            padding: '4px 8px', fontSize: 12, background: '#fff',
                            border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Subfolders & Files List */}
                    <div style={{ flex: 1, maxHeight: 260, overflowY: 'auto', padding: 4 }}>
                      {loadingFolder ? (
                        <div style={{ textAlign: 'center', padding: '30px 0', color: '#888', fontSize: 13 }}>
                          Loading data from Google Drive...
                        </div>
                      ) : (
                        <>
                          {folderItems.folders.length === 0 && folderItems.files.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: '#999', fontSize: 12, fontStyle: 'italic' }}>
                              This folder is empty (no subfolders or schematic files)
                            </div>
                          )}

                          {/* Subfolders list */}
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
                                <span style={{ fontSize: 16 }}>{f.isShortcut ? '🔗📁' : '📁'}</span>
                                <span>{f.name}</span>
                                {f.isShortcut && (
                                  <span style={{ fontSize: 10, background: '#e2e8f0', color: '#475569', padding: '1px 5px', borderRadius: 3 }}>
                                    Shortcut
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: 11, color: '#888' }}>Folder ›</span>
                            </div>
                          ))}

                          {/* Schematic files list */}
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
                                  title={`Click to open "${file.name}"`}
                                >
                                  <span style={{ fontSize: 16 }}>{file.isShortcut ? '🔗📄' : '📄'}</span>
                                  <span style={{
                                    fontSize: 13, fontWeight: isCurrentOpen ? 700 : 500,
                                    color: isCurrentOpen ? '#1677ff' : '#222',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {cleanTitle}
                                  </span>
                                  {file.isShortcut && (
                                    <span style={{ fontSize: 10, background: '#e2e8f0', color: '#475569', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
                                      Shortcut
                                    </span>
                                  )}
                                  {isCurrentOpen && (
                                    <span style={{
                                      fontSize: 10, background: '#1677ff', color: '#fff',
                                      padding: '1px 6px', borderRadius: 10, fontWeight: 600, flexShrink: 0,
                                    }}>
                                      Currently Open
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
                                    Open
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFile(file)}
                                    style={{
                                      padding: '3px 6px', fontSize: 12, background: 'transparent',
                                      border: 'none', cursor: 'pointer', color: '#999',
                                    }}
                                    title="Delete file from Google Drive"
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

              {/* Progress and status message */}
              {busy && (
                <div style={{ color: '#1677ff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⏳</span> Processing on Google Drive...
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}