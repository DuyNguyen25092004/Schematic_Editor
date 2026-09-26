import { useEffect, useRef, useState } from 'react';
import {
  collection, doc, onSnapshot, writeBatch, getDocs, setDoc, deleteDoc,
  runTransaction, serverTimestamp, Timestamp, query, where, limit,
} from 'firebase/firestore';
import { db, ensureSignedIn } from './firebase';

const NODE_STYLE = { width: 160, height: 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' };
const stable = (v) => JSON.stringify(v, (k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.keys(val).sort().reduce((o, key) => { o[key] = val[key]; return o; }, {})
    : val);
const clean = (o) => JSON.parse(JSON.stringify(o));

const stripNode = (n) => clean({ type: n.type, position: n.position, data: n.data });
const stripWire = (w) => clean({
  points: w.points, net: w.net ?? null, name: w.name ?? null, color: w.color ?? null,
});

// ---------- DỌN PHÒNG CŨ (cờ lastActive) ----------
const STALE_MS = 5 * 60 * 1000;     // phòng không ai hoạt động > 30 phút = cũ
const HEARTBEAT_MS = 3 * 60 * 1000;  // khi tab mở, cập nhật cờ mỗi 5 phút

const roomRef = (id) => doc(db, 'circuits', id);
const touch = (id) => setDoc(roomRef(id), { lastActive: serverTimestamp() }, { merge: true });

// Xóa toàn bộ nodes + wires của phòng (chia batch <= 400)
const wipeRoom = async (id) => {
  for (const col of ['nodes', 'wires']) {
    const s = await getDocs(collection(db, 'circuits', id, col));
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = writeBatch(db);
      s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }
};

// Đặt cờ = bây giờ. Trả về true nếu phòng đang cũ VÀ mình là người thắng quyền xóa.
const claimIfStale = (id) => runTransaction(db, async (tx) => {
  const snap = await tx.get(roomRef(id));
  const last = snap.exists() ? snap.data().lastActive : null;
  const stale = !!last && Date.now() - last.toMillis() > STALE_MS;
  tx.set(roomRef(id), { lastActive: serverTimestamp() }, { merge: true });
  return stale;
});

// Dọn giúp tối đa 5 phòng khác đã cũ
const sweepOthers = async (currentId) => {
  const cutoff = Timestamp.fromMillis(Date.now() - STALE_MS);
  const q = query(collection(db, 'circuits'), where('lastActive', '<', cutoff), limit(100));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    if (d.id === currentId) continue;
    if (await claimIfStale(d.id)) {
      await wipeRoom(d.id);
      await deleteDoc(roomRef(d.id));
    }
  }
};

export function useCircuitSync({
  circuitId, nodes, wires, setNodes, setWiresRaw,
  isEditingLocally, seedNodes = [],
  onResizeRect, onTextChangeRect,
}) {
  const [ready, setReady] = useState(false);
  const syncedNodes = useRef(new Map()); // id -> JSON đã đồng bộ
  const syncedWires = useRef(new Map());
  const seeded = useRef(false);
  const firstRoom = useRef(true);
  // ---------- NHẬN ----------
  useEffect(() => {
    let unsubN, unsubW, timer, cancelled = false;
    const isInitialRoom = firstRoom.current;
    firstRoom.current = false;
    syncedNodes.current = new Map();
    syncedWires.current = new Map();
    seeded.current = !isInitialRoom;   // đổi phòng thì KHÔNG seed mockData
    setReady(false);
    let firstNodes = true, firstWires = true;

    const beat = () => touch(circuitId).catch(console.error);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };

    (async () => {
      await ensureSignedIn();
      if (cancelled) return;

      // 1) Vào phòng: nếu phòng đã cũ thì xóa dữ liệu cũ TRƯỚC khi nạp
      try {
        if (await claimIfStale(circuitId)) await wipeRoom(circuitId);
        sweepOthers(circuitId).catch(console.error); // dọn phòng khác, không chờ
      } catch (e) {
        console.error(e);
      }
      if (cancelled) return;

      // 2) Giữ cờ "đang hoạt động"
      timer = setInterval(beat, HEARTBEAT_MS);
      document.addEventListener('visibilitychange', onVisible);

      // 3) Đồng bộ như cũ
      unsubN = onSnapshot(collection(db, 'circuits', circuitId, 'nodes'), (snap) => {
        // Phòng trống lần đầu -> seed từ mockData
        if (!seeded.current && snap.empty && seedNodes.length) {
          seeded.current = true;
          const batch = writeBatch(db);
          seedNodes.forEach((n) => {
            const d = stripNode(n);
            syncedNodes.current.set(n.id, JSON.stringify(d));
            batch.set(doc(db, 'circuits', circuitId, 'nodes', n.id), d);
          });
          batch.commit().catch(console.error);
          setNodes(seedNodes);
          setReady(true);
          return;
        }
        seeded.current = true;

        const replace = !isInitialRoom && firstNodes && !snap.empty;
        firstNodes = false;

        setNodes((ns) => {
          let next = [...ns];
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === 'removed') {
              next = next.filter((n) => n.id !== id);
              syncedNodes.current.delete(id);
              return;
            }
            const { expireAt: _e, ...d } = ch.doc.data(); // bỏ expireAt cũ (nếu còn sót từ lúc thử TTL)
            const json = JSON.stringify(d);
            const old = next.find((n) => n.id === id);
            if (old && syncedNodes.current.get(id) === json) return; // echo của mình
            syncedNodes.current.set(id, json);
            const merged = {
              id, ...d,
              data: d.type === 'rect' ? { ...d.data, onResize: onResizeRect, onTextChange: onTextChangeRect } : d.data,
              style: { ...NODE_STYLE, width: d.data?.width || 160, height: d.data?.height || 100 },
              selected: old?.selected ?? false,
            };
            next = old ? next.map((n) => (n.id === id ? merged : n)) : [...next, merged];
          });
          return next;
        });
        setReady(true);
      });

      unsubW = onSnapshot(collection(db, 'circuits', circuitId, 'wires'), (snap) => {
        const replace = !isInitialRoom && firstWires && !snap.empty;
        firstWires = false;
        setWiresRaw((ws) => {
          let next = replace ? [] : [...ws];   // trước là [...ws]
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === 'removed') {
              next = next.filter((w) => w.id !== id);
              syncedWires.current.delete(id);
              return;
            }
            const { expireAt: _e, ...d } = ch.doc.data();
            const json = JSON.stringify(d);
            const old = next.find((w) => w.id === id);
            if (old && syncedWires.current.get(id) === json) return;
            syncedWires.current.set(id, json);
            const merged = { id, ...d, selected: old?.selected ?? false };
            next = old ? next.map((w) => (w.id === id ? merged : w)) : [...next, merged];
          });
          return next;
        });
      });
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      unsubN?.(); unsubW?.();
    };
  }, [circuitId, setNodes, setWiresRaw]); // seedNodes cố ý không đưa vào deps

  // ---------- GỬI ----------
  useEffect(() => {
    if (!ready || isEditingLocally) return;
    const batch = writeBatch(db);
    let dirty = false;

    const push = (list, store, strip, col) => {
      const seen = new Set();
      list.forEach((item) => {
        seen.add(item.id);
        const data = strip(item);
        const json = JSON.stringify(data);
        if (store.current.get(item.id) !== json) {
          batch.set(doc(db, 'circuits', circuitId, col, item.id), data);
          store.current.set(item.id, json);
          dirty = true;
        }
      });
      for (const id of [...store.current.keys()]) {
        if (!seen.has(id)) {
          batch.delete(doc(db, 'circuits', circuitId, col, id));
          store.current.delete(id);
          dirty = true;
        }
      }
    };

    push(nodes, syncedNodes, stripNode, 'nodes');
    push(wires, syncedWires, stripWire, 'wires');
    if (dirty) batch.commit().catch(console.error);
  }, [nodes, wires, ready, isEditingLocally, circuitId]);
}