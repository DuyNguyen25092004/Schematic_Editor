import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

export function usePresence({ circuitId, selectedIds, hasDriveAccess = false, driveEmail = null }) {
  const [others, setOthers] = useState({});
  const [me, setMe] = useState(null);
  const [allRoomUsers, setAllRoomUsers] = useState({});
  const [myApprovedEditors, setMyApprovedEditors] = useState(() => {
    try {
      const s = sessionStorage.getItem(`schem_approved_${circuitId}`);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });
  const [myRejectedEditors, setMyRejectedEditors] = useState({});
  const [myRequestEdit, setMyRequestEdit] = useState(false);

  const myRef = useRef(null);
  const nameRef = useRef(loadName());
  const lastSent = useRef(0);
  const timer = useRef(null);
  const joinedAtRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    ensureSignedIn().then((user) => {
      if (cancelled) return;
      const color = colorFor(user.uid);
      const meRef = ref(rtdb, `presence/${circuitId}/${user.uid}`);
      myRef.current = meRef;

      const myInitialData = {
        name: nameRef.current,
        color,
        hasDriveAccess: !!hasDriveAccess,
        driveEmail: driveEmail || null,
        joinedAt: joinedAtRef.current,
        requestEdit: false,
        approvedEditors: myApprovedEditors,
        rejectedEditors: {},
        x: null, y: null, sel: null,
      };

      setMe({ uid: user.uid, ...myInitialData });

      // Mỗi lần (re)connect: đăng ký tự xóa khi mất kết nối, rồi ghi lại mục của mình
      const offConn = onValue(ref(rtdb, '.info/connected'), (snap) => {
        if (snap.val() !== true) return;
        onDisconnect(meRef).remove();
        set(meRef, {
          name: nameRef.current,
          color,
          hasDriveAccess: !!hasDriveAccess,
          driveEmail: driveEmail || null,
          joinedAt: joinedAtRef.current,
          requestEdit: myRequestEdit,
          approvedEditors: myApprovedEditors,
          rejectedEditors: myRejectedEditors,
          x: null, y: null, sel: null,
        });
      });

      const offAll = onValue(ref(rtdb, `presence/${circuitId}`), (snap) => {
        const v = snap.val() || {};
        setAllRoomUsers(v);
        const peers = { ...v };
        delete peers[user.uid];
        setOthers(peers);
      });

      cleanup = () => { offConn(); offAll(); remove(meRef).catch(() => {}); };
    });

    return () => { cancelled = true; cleanup(); };
  }, [circuitId]);

  // Cập nhật khi quyền Google Drive thay đổi (ví dụ đăng nhập hoặc đăng xuất)
  useEffect(() => {
    if (!myRef.current) return;
    update(myRef.current, {
      hasDriveAccess: !!hasDriveAccess,
      driveEmail: driveEmail || null,
    }).catch(() => {});
  }, [hasDriveAccess, driveEmail]);

  // Xác định Chủ phòng (Host) trong danh sách người dùng hiện tại
  const hostInfo = useMemo(() => {
    const isDriveRoom = Boolean(circuitId && circuitId.length > 15);
    const list = Object.entries(allRoomUsers).map(([uid, u]) => ({
      uid,
      name: u.name,
      joinedAt: u.joinedAt || 0,
      hasDriveAccess: !!u.hasDriveAccess,
      approvedEditors: u.approvedEditors || {},
      rejectedEditors: u.rejectedEditors || {},
    }));

    if (list.length === 0) {
      if (isDriveRoom) {
        return { hostUid: hasDriveAccess ? me?.uid || null : null, isHost: !!hasDriveAccess, hostUser: null };
      }
      return { hostUid: me?.uid || null, isHost: true, hostUser: null };
    }

    const driveUsers = list.filter((u) => u.hasDriveAccess);
    let chosenHost = null;

    if (driveUsers.length > 0) {
      // Ưu tiên người dùng có quyền Google Drive tham gia sớm nhất
      driveUsers.sort((a, b) => a.joinedAt - b.joinedAt);
      chosenHost = driveUsers[0];
    } else if (!isDriveRoom) {
      // Phòng tạm thời (không phải file Drive) -> người tham gia đầu tiên là chủ phòng
      list.sort((a, b) => a.joinedAt - b.joinedAt);
      chosenHost = list[0];
    } else {
      // Phòng Drive nhưng chưa có ai đăng nhập Drive vào phòng -> Chưa có Host
      chosenHost = null;
    }

    const isHost = me && chosenHost ? chosenHost.uid === me.uid : false;
    return { hostUid: chosenHost?.uid || null, isHost, hostUser: chosenHost };
  }, [allRoomUsers, me, circuitId, hasDriveAccess]);

  const { isHost, hostUser, hostUid } = hostInfo;

  // Quyền chỉnh sửa của tôi
  const canEdit = useMemo(() => {
    const isDriveRoom = Boolean(circuitId && circuitId.length > 15);

    // Cách 2: Nếu đã được cấp quyền Drive (hoặc file do mình tạo trên Drive) -> Vào thẳng
    if (hasDriveAccess) return true;

    // Chủ phòng luôn có quyền edit
    if (isHost) return true;

    // Cách 1: Được chủ phòng duyệt
    if (me && hostUser?.approvedEditors?.[me.uid]) return true;

    // Hoặc bất kỳ người dùng Drive nào trong phòng đã duyệt cho tôi
    const anyDriveApproved = Object.values(allRoomUsers).some(
      (u) => u.hasDriveAccess && u.approvedEditors?.[me?.uid]
    );
    if (anyDriveApproved) return true;

    // Nếu là phòng thường (không phải Drive) và chỉ có 1 mình trong phòng
    if (!isDriveRoom && Object.keys(allRoomUsers).length <= 1) return true;

    return false;
  }, [circuitId, hasDriveAccess, isHost, me, hostUser, allRoomUsers]);

  const isPendingApproval = useMemo(() => {
    if (canEdit) return false;
    if (!myRequestEdit) return false;
    if (me && hostUser?.rejectedEditors?.[me.uid]) return false;
    return true;
  }, [canEdit, myRequestEdit, me, hostUser]);

  const isRejected = useMemo(() => {
    if (canEdit) return false;
    return !!(me && hostUser?.rejectedEditors?.[me.uid]);
  }, [canEdit, me, hostUser]);

  // Danh sách yêu cầu đang chờ chủ phòng / người dùng Drive duyệt
  const pendingRequests = useMemo(() => {
    if (!isHost && !hasDriveAccess) return [];
    return Object.entries(others)
      .filter(([uid, u]) => u.requestEdit && !myApprovedEditors[uid] && !myRejectedEditors[uid])
      .map(([uid, u]) => ({ uid, name: u.name, requestTime: u.requestTime }));
  }, [isHost, hasDriveAccess, others, myApprovedEditors, myRejectedEditors]);

  // Hành động: Xin quyền chỉnh sửa
  const requestEditAccess = useCallback(() => {
    if (!myRef.current) return;
    setMyRequestEdit(true);
    update(myRef.current, {
      requestEdit: true,
      requestTime: Date.now(),
    }).catch(console.error);
  }, []);

  // Hành động của chủ phòng: Duyệt cho phép chỉnh sửa
  const approveUser = useCallback((targetUid) => {
    if (!myRef.current || !targetUid) return;
    setMyApprovedEditors((prev) => {
      const next = { ...prev, [targetUid]: true };
      try {
        sessionStorage.setItem(`schem_approved_${circuitId}`, JSON.stringify(next));
      } catch {}
      update(myRef.current, { [`approvedEditors/${targetUid}`]: true }).catch(console.error);
      return next;
    });
  }, [circuitId]);

  // Hành động của chủ phòng: Từ chối yêu cầu
  const rejectUser = useCallback((targetUid) => {
    if (!myRef.current || !targetUid) return;
    setMyRejectedEditors((prev) => {
      const next = { ...prev, [targetUid]: true };
      update(myRef.current, { [`rejectedEditors/${targetUid}`]: true }).catch(console.error);
      return next;
    });
  }, []);

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

  return {
    others,
    me,
    sendCursor,
    rename,
    isHost,
    hostUid,
    hostUser,
    canEdit,
    hasDriveAccess,
    requestEditAccess,
    approveUser,
    rejectUser,
    pendingRequests,
    isPendingApproval,
    isRejected,
  };
}