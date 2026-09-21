import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, onValue, set, update, remove, onDisconnect } from 'firebase/database';
import { rtdb, ensureSignedIn } from './firebase';

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#f032e6', '#9a6324'];
const colorFor = (uid) => {
  let h = 0;
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

function loadName() {
  try {
    let n = localStorage.getItem('presenceName');
    if (!n) {
      n = 'Khách ' + Math.floor(100 + Math.random() * 900);
      localStorage.setItem('presenceName', n);
    }
    return n;
  } catch { return 'Khách ' + Math.floor(100 + Math.random() * 900); }
}

export function usePresence({ circuitId, selectedIds }) {
  const [others, setOthers] = useState({});
  const [me, setMe] = useState(null);
  const myRef = useRef(null);
  const nameRef = useRef(loadName());
  const lastSent = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    ensureSignedIn().then((user) => {
      if (cancelled) return;
      const color = colorFor(user.uid);
      const meRef = ref(rtdb, `presence/${circuitId}/${user.uid}`);
      myRef.current = meRef;
      setMe({ uid: user.uid, name: nameRef.current, color });

      // Mỗi lần (re)connect: đăng ký tự xóa khi mất kết nối, rồi ghi lại mục của mình
      const offConn = onValue(ref(rtdb, '.info/connected'), (snap) => {
        if (snap.val() !== true) return;
        onDisconnect(meRef).remove();
        set(meRef, { name: nameRef.current, color, x: null, y: null, sel: null });
      });

      const offAll = onValue(ref(rtdb, `presence/${circuitId}`), (snap) => {
        const v = snap.val() || {};
        delete v[user.uid];
        setOthers(v);
      });

      cleanup = () => { offConn(); offAll(); remove(meRef).catch(() => {}); };
    });

    return () => { cancelled = true; cleanup(); };
  }, [circuitId]);

  // Gửi vị trí con trỏ (toạ độ flow), giới hạn ~16 lần/giây
  const sendCursor = useCallback((x, y) => {
    if (!myRef.current) return;
    const fire = () => {
      lastSent.current = Date.now();
      update(myRef.current, { x: Math.round(x), y: Math.round(y) }).catch(() => {});
    };
    clearTimeout(timer.current);
    if (Date.now() - lastSent.current >= 60) fire();
    else timer.current = setTimeout(fire, 60);
  }, []);

  // Gửi danh sách phần tử đang chọn
  const selKey = selectedIds.join(',');
  useEffect(() => {
    if (!me || !myRef.current) return;
    update(myRef.current, { sel: selKey || null }).catch(() => {});
  }, [selKey, me]);

  const rename = useCallback((name) => {
    const n = (name || '').trim().slice(0, 20);
    if (!n) return;
    nameRef.current = n;
    try { localStorage.setItem('presenceName', n); } catch {}
    setMe((m) => (m ? { ...m, name: n } : m));
    if (myRef.current) update(myRef.current, { name: n }).catch(() => {});
  }, []);

  return { others, me, sendCursor, rename };
}