import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, ensureSignedIn } from './firebase';

const NODE_STYLE = { width: 160, height: 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' };

const stripNode = (n) => ({ type: n.type, position: n.position, data: n.data });
const stripWire = (w) => ({ points: w.points, net: w.net ?? null });

export function useCircuitSync({
  circuitId, nodes, wires, setNodes, setWiresRaw,
  isEditingLocally, seedNodes = [],
}) {
  const [ready, setReady] = useState(false);
  const syncedNodes = useRef(new Map()); // id -> JSON đã đồng bộ
  const syncedWires = useRef(new Map());
  const seeded = useRef(false);

  // ---------- NHẬN ----------
  useEffect(() => {
    let unsubN, unsubW, cancelled = false;

    ensureSignedIn().then(() => {
      if (cancelled) return;

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

        setNodes((ns) => {
          let next = [...ns];
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === 'removed') {
              next = next.filter((n) => n.id !== id);
              syncedNodes.current.delete(id);
              return;
            }
            const d = ch.doc.data();
            const json = JSON.stringify(d);
            const old = next.find((n) => n.id === id);
            if (old && syncedNodes.current.get(id) === json) return; // echo của mình
            syncedNodes.current.set(id, json);
            const merged = { id, ...d, style: NODE_STYLE, selected: old?.selected ?? false };
            next = old ? next.map((n) => (n.id === id ? merged : n)) : [...next, merged];
          });
          return next;
        });
        setReady(true);
      });

      unsubW = onSnapshot(collection(db, 'circuits', circuitId, 'wires'), (snap) => {
        setWiresRaw((ws) => { // RAW: không qua mergeTouchingWires
          let next = [...ws];
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === 'removed') {
              next = next.filter((w) => w.id !== id);
              syncedWires.current.delete(id);
              return;
            }
            const d = ch.doc.data();
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
    });

    return () => { cancelled = true; unsubN?.(); unsubW?.(); };
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