import { useEffect, useRef, useState } from 'react';
import { ref, update, onValue } from 'firebase/database';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, rtdb, ensureSignedIn } from './firebase';
import { nodeBoxStyle } from '../constants';

const clean = (o) => JSON.parse(JSON.stringify(o));

const stripNode = (n) => clean({
  id: n.id,
  type: n.type,
  position: { x: Math.round(n.position?.x ?? 0), y: Math.round(n.position?.y ?? 0) },
  data: n.data ? { ...n.data, onResize: undefined, onTextChange: undefined } : {},
});

const stripWire = (w) => clean({
  id: w.id,
  points: (w.points || []).map((p) => ({
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
});

const stripSheet = (s) => clean({
  id: s.id,
  name: s.name,
  nodes: (s.nodes || []).map(stripNode),
  wires: (s.wires || []).map(stripWire),
});

const computeSignature = (nodes, wires) => {
  const nSig = (nodes || []).map((n) => `${n.id}:${n.type}:${Math.round(n.position?.x ?? 0)},${Math.round(n.position?.y ?? 0)}:${JSON.stringify(n.data || {})}`).join(';');
  const wSig = (wires || []).map((w) => `${w.id}:${(w.points || []).map((p) => `${Math.round(p.x)},${Math.round(p.y)},${p.nodeId || ''},${p.portId || ''},${p.onWireId || ''}`).join('/')}:${w.name || ''}:${w.net || ''}:${w.color || ''}:${JSON.stringify(w.labels || null)}`).join(';');
  return `${nSig}||${wSig}`;
};

const computeSheetsSignature = (sheets) => {
  return (sheets || []).map((s) => `${s.id}:${s.name}:${computeSignature(s.nodes, s.wires)}`).join('|||');
};

export function useCircuitSync({
  circuitId,
  sheets, setSheets,
  activeSheetId, setActiveSheetId,
  nodes, wires, setNodes, setWiresRaw,
  isEditingLocally, seedNodes = [],
  onResizeRect, onTextChangeRect,
  canEdit = true,
}) {
  const [ready, setReady] = useState(false);
  const myUidRef = useRef(null);
  const lastReceivedTs = useRef(0);
  const lastSentSignature = useRef('');
  const sendTimer = useRef(null);
  const firestoreSaveTimer = useRef(null);
  const firstRoomRef = useRef(true);

  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const wiresRef = useRef(wires);
  useEffect(() => { wiresRef.current = wires; }, [wires]);

  const sheetsRef = useRef(sheets);
  useEffect(() => { sheetsRef.current = sheets; }, [sheets]);

  const activeSheetIdRef = useRef(activeSheetId);
  useEffect(() => { activeSheetIdRef.current = activeSheetId; }, [activeSheetId]);

  const onResizeRectRef = useRef(onResizeRect);
  useEffect(() => { onResizeRectRef.current = onResizeRect; }, [onResizeRect]);

  const onTextChangeRectRef = useRef(onTextChangeRect);
  useEffect(() => { onTextChangeRectRef.current = onTextChangeRect; }, [onTextChangeRect]);

  // Lưu backup khẩn cấp vào localStorage khi người dùng đóng/reload tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!circuitId) return;
      try {
        const curSheets = (sheetsRef.current || []).map((s) =>
          s.id === activeSheetIdRef.current
            ? { ...s, nodes: nodesRef.current, wires: wiresRef.current }
            : s
        );
        localStorage.setItem(`schem_backup_${circuitId}`, JSON.stringify({
          sheets: curSheets.map(stripSheet),
          activeSheetId: activeSheetIdRef.current,
          ts: Date.now(),
        }));
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [circuitId]);

  // ---------- KẾT NỐI VÀ LẮNG NGHE ĐỒNG BỘ TỪ PHÒNG (FIRESTORE + RTDB) ----------
  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    const isInitialRoom = firstRoomRef.current;
    firstRoomRef.current = false;
    setReady(false);
    lastReceivedTs.current = 0;
    lastSentSignature.current = '';

    ensureSignedIn().then(async (user) => {
      if (cancelled) return;
      myUidRef.current = user.uid;

      // 1. Đọc dữ liệu bền vững từ Firestore trước (đảm bảo F5 không mất mạch)
      const circuitDocRef = doc(db, 'circuits', circuitId);
      let firestoreCircuit = null;
      try {
        const snap = await getDoc(circuitDocRef);
        if (snap.exists()) {
          firestoreCircuit = snap.data();
        }
      } catch (err) {
        console.warn('[Firestore] Lỗi đọc mạch từ Firestore:', err);
      }

      // Đọc backup khẩn cấp từ localStorage (nếu có)
      let localBackup = null;
      try {
        const raw = localStorage.getItem(`schem_backup_${circuitId}`);
        if (raw) localBackup = JSON.parse(raw);
      } catch {}

      if (cancelled) return;

      const roomRef = ref(rtdb, `presence/${circuitId}`);
      let firstSnapshot = true;

      unsub = onValue(roomRef, (snap) => {
        if (cancelled) return;
        const roomData = snap.val() || {};

        // Tìm trạng thái mạch mới nhất do bất kỳ peer nào trong phòng gửi lên
        let newestPeerCircuit = null;
        let newestPeerTs = 0;

        for (const [peerId, peerVal] of Object.entries(roomData)) {
          if (peerId !== user.uid && peerVal?.circuitJson) {
            try {
              const parsed = JSON.parse(peerVal.circuitJson);
              if (parsed?.ts && parsed.ts > newestPeerTs) {
                newestPeerTs = parsed.ts;
                newestPeerCircuit = parsed;
              }
            } catch (e) {
              console.error('Lỗi phân tích circuitJson từ peer:', e);
            }
          }
        }

        if (firstSnapshot) {
          firstSnapshot = false;

          const firestoreTs = firestoreCircuit?.ts || 0;
          const localTs = localBackup?.ts || 0;

          const candidates = [
            { source: 'peer', circuit: newestPeerCircuit, ts: newestPeerTs },
            { source: 'firestore', circuit: firestoreCircuit, ts: firestoreTs },
            { source: 'localBackup', circuit: localBackup, ts: localTs },
          ].filter(
            (c) =>
              c.circuit &&
              ((c.circuit.sheets && c.circuit.sheets.length > 0 && c.circuit.sheets.some((s) => (s.nodes?.length > 0 || s.wires?.length > 0))) ||
                (c.circuit.nodes && c.circuit.nodes.length > 0))
          );

          candidates.sort((a, b) => (b.ts || 0) - (a.ts || 0));

          let chosenCircuit = candidates.length > 0 ? candidates[0].circuit : null;
          let chosenSource = candidates.length > 0 ? candidates[0].source : 'seed';

          if (chosenCircuit) {
            const finalTs = chosenCircuit.ts || Date.now();
            lastReceivedTs.current = finalTs;

            let loadedSheets = [];
            if (chosenCircuit.sheets && Array.isArray(chosenCircuit.sheets) && chosenCircuit.sheets.length > 0) {
              loadedSheets = chosenCircuit.sheets.map((s) => ({
                id: s.id,
                name: s.name || 'Trang',
                nodes: (s.nodes || []).map((n) => ({
                  ...n,
                  data: n.type === 'rect' ? { ...n.data, onResize: onResizeRectRef.current, onTextChange: onTextChangeRectRef.current } : n.data,
                  style: nodeBoxStyle({ type: n.type, data: n.data }),
                  selected: false,
                })),
                wires: (s.wires || []).map((w) => ({ ...w, selected: false })),
              }));
            } else {
              // Định dạng file cũ chỉ có 1 trang
              const rootNodes = (chosenCircuit.nodes || []).map((n) => ({
                ...n,
                data: n.type === 'rect' ? { ...n.data, onResize: onResizeRectRef.current, onTextChange: onTextChangeRectRef.current } : n.data,
                style: nodeBoxStyle({ type: n.type, data: n.data }),
                selected: false,
              }));
              const rootWires = (chosenCircuit.wires || []).map((w) => ({ ...w, selected: false }));
              loadedSheets = [{
                id: 'sheet_1',
                name: 'Sheet 1',
                nodes: rootNodes,
                wires: rootWires,
              }];
            }

            const targetActiveId = chosenCircuit.activeSheetId && loadedSheets.some((s) => s.id === chosenCircuit.activeSheetId)
              ? chosenCircuit.activeSheetId
              : loadedSheets[0]?.id || 'sheet_1';
            const activeSheet = loadedSheets.find((s) => s.id === targetActiveId) || loadedSheets[0];

            lastSentSignature.current = computeSheetsSignature(loadedSheets);
            setSheets(loadedSheets);
            setActiveSheetId(targetActiveId);
            setNodes(activeSheet?.nodes || []);
            setWiresRaw(activeSheet?.wires || []);

            // Gửi thông báo lên RTDB để các peer khác biết trạng thái dự án
            update(ref(rtdb, `presence/${circuitId}/${user.uid}`), {
              circuitJson: JSON.stringify({
                ts: finalTs,
                sheets: loadedSheets.map(stripSheet),
                updatedSheetId: targetActiveId,
              }),
            }).catch(console.error);

            // Đồng bộ sang Firestore nếu nguồn là localBackup hoặc peer
            if (chosenSource !== 'firestore') {
              setDoc(circuitDocRef, {
                sheets: loadedSheets.map(stripSheet),
                activeSheetId: targetActiveId,
                ts: finalTs,
                updatedAt: serverTimestamp(),
              }, { merge: true }).catch(console.error);
            }
          } else if (sheetsRef.current && sheetsRef.current.length > 0 && (sheetsRef.current[0].nodes?.length > 0 || sheetsRef.current[0].wires?.length > 0)) {
            // Mở từ Google Drive vào phòng
            const ts = Date.now();
            lastReceivedTs.current = ts;
            const currentSheets = sheetsRef.current;
            lastSentSignature.current = computeSheetsSignature(currentSheets);

            const activeSheet = currentSheets.find((s) => s.id === activeSheetIdRef.current) || currentSheets[0];
            setNodes(activeSheet?.nodes || []);
            setWiresRaw(activeSheet?.wires || []);

            update(ref(rtdb, `presence/${circuitId}/${user.uid}`), {
              circuitJson: JSON.stringify({
                ts,
                sheets: currentSheets.map(stripSheet),
                updatedSheetId: activeSheetIdRef.current,
              }),
            }).catch(console.error);

            setDoc(circuitDocRef, {
              sheets: currentSheets.map(stripSheet),
              activeSheetId: activeSheetIdRef.current,
              ts,
              updatedAt: serverTimestamp(),
            }, { merge: true }).catch(console.error);
          } else if (isInitialRoom && seedNodes.length > 0) {
            // Phòng mới hoàn toàn lần đầu mở -> seed dữ liệu mẫu vào Trang 1
            const seededNodes = seedNodes.map((n) => ({
              ...n,
              data: n.type === 'rect' ? { ...n.data, onResize: onResizeRectRef.current, onTextChange: onTextChangeRectRef.current } : n.data,
              style: nodeBoxStyle({ type: n.type, data: n.data }),
              selected: false,
            }));
            const seededWires = [];
            const initialSheet = [{
              id: 'sheet_1',
              name: 'Sheet 1',
              nodes: seededNodes,
              wires: seededWires,
            }];

            lastSentSignature.current = computeSheetsSignature(initialSheet);
            setSheets(initialSheet);
            setActiveSheetId('sheet_1');
            setNodes(seededNodes);
            setWiresRaw(seededWires);

            const ts = Date.now();
            lastReceivedTs.current = ts;

            update(ref(rtdb, `presence/${circuitId}/${user.uid}`), {
              circuitJson: JSON.stringify({
                ts,
                sheets: initialSheet.map(stripSheet),
                updatedSheetId: 'sheet_1',
              }),
            }).catch(console.error);

            setDoc(circuitDocRef, {
              sheets: initialSheet.map(stripSheet),
              activeSheetId: 'sheet_1',
              ts,
              updatedAt: serverTimestamp(),
            }, { merge: true }).catch(console.error);
          }

          setReady(true);
          return;
        }

        // Các cập nhật tiếp theo trong quá trình cùng vẽ giữa các peer:
        if (newestPeerCircuit && newestPeerTs > lastReceivedTs.current) {
          lastReceivedTs.current = newestPeerTs;

          if (newestPeerCircuit.sheets && Array.isArray(newestPeerCircuit.sheets)) {
            const incomingSheets = newestPeerCircuit.sheets.map((s) => ({
              id: s.id,
              name: s.name,
              nodes: (s.nodes || []).map((n) => ({
                ...n,
                data: n.type === 'rect' ? { ...n.data, onResize: onResizeRectRef.current, onTextChange: onTextChangeRectRef.current } : n.data,
                style: nodeBoxStyle({ type: n.type, data: n.data }),
                selected: false,
              })),
              wires: (s.wires || []).map((w) => ({ ...w, selected: false })),
            }));

            setSheets(incomingSheets);

            // Nếu peer sửa đúng trang mà client này đang xem: cập nhật canvas ngay
            if (newestPeerCircuit.updatedSheetId === activeSheetIdRef.current) {
              const updatedSheet = incomingSheets.find((s) => s.id === activeSheetIdRef.current);
              if (updatedSheet) {
                setNodes(updatedSheet.nodes);
                setWiresRaw(updatedSheet.wires);
              }
            }

            lastSentSignature.current = computeSheetsSignature(incomingSheets);
          }
        }
      });
    });

    return () => {
      cancelled = true;
      unsub();
      clearTimeout(sendTimer.current);
      clearTimeout(firestoreSaveTimer.current);
    };
  }, [circuitId, setNodes, setWiresRaw, setSheets, setActiveSheetId]);

  // ---------- GỬI CẬP NHẬT CỦA MÌNH LÊN RTDB VÀ FIRESTORE KHI CÓ THAY ĐỔI ----------
  useEffect(() => {
    if (!ready || isEditingLocally || !myUidRef.current || !canEdit) return;

    // Tổng hợp toàn bộ sheets với sheet hiện tại được cập nhật
    const latestSheets = (sheetsRef.current || []).map((s) =>
      s.id === activeSheetIdRef.current
        ? { ...s, nodes: nodesRef.current, wires: wiresRef.current }
        : s
    );

    const currentSig = computeSheetsSignature(latestSheets);
    if (currentSig === lastSentSignature.current) return;

    // 1. Debounce 60ms cho RTDB (Realtime peer-to-peer mượt mà)
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      if (isEditingLocally || !myUidRef.current || !canEdit) return;

      const currentNodes = nodesRef.current;
      const currentWires = wiresRef.current;
      const currentActiveId = activeSheetIdRef.current;

      const fullSheets = (sheetsRef.current || []).map((s) =>
        s.id === currentActiveId
          ? { ...s, nodes: currentNodes, wires: currentWires }
          : s
      );

      const latestSig = computeSheetsSignature(fullSheets);
      if (latestSig === lastSentSignature.current) return;

      const ts = Date.now();
      lastSentSignature.current = latestSig;
      lastReceivedTs.current = ts;

      const payload = {
        ts,
        sheets: fullSheets.map(stripSheet),
        updatedSheetId: currentActiveId,
      };

      update(ref(rtdb, `presence/${circuitId}/${myUidRef.current}`), {
        circuitJson: JSON.stringify(payload),
      }).catch(console.error);

      try {
        localStorage.setItem(`schem_backup_${circuitId}`, JSON.stringify({
          ...payload,
          activeSheetId: currentActiveId,
        }));
      } catch {}
    }, 60);

    // 2. Debounce 1000ms lưu vào Firestore (Lưu trữ bền vững 1 document duy nhất cho toàn bộ project)
    clearTimeout(firestoreSaveTimer.current);
    firestoreSaveTimer.current = setTimeout(() => {
      if (!canEdit || !circuitId) return;

      const currentNodes = nodesRef.current;
      const currentWires = wiresRef.current;
      const currentActiveId = activeSheetIdRef.current;

      const fullSheets = (sheetsRef.current || []).map((s) =>
        s.id === currentActiveId
          ? { ...s, nodes: currentNodes, wires: currentWires }
          : s
      );

      const ts = Date.now();

      setDoc(doc(db, 'circuits', circuitId), {
        sheets: fullSheets.map(stripSheet),
        activeSheetId: currentActiveId,
        ts,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch((err) => {
        console.warn('[Firestore] Lỗi lưu project vào Firestore:', err);
      });
    }, 1000);

    return () => {
      clearTimeout(sendTimer.current);
      clearTimeout(firestoreSaveTimer.current);
    };
  }, [nodes, wires, sheets, activeSheetId, ready, isEditingLocally, circuitId, canEdit]);
}