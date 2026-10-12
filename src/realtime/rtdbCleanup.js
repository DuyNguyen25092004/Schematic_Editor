import { ref, get, remove } from 'firebase/database';
import { rtdb } from './firebase';

const STALE_USER_THRESHOLD = 3 * 60 * 1000;   // 3 phút không có heartbeat -> coi như đã ngắt kết nối
const STALE_ROOM_THRESHOLD = 60 * 60 * 1000;  // 1 tiếng không có ai hoạt động -> xóa toàn bộ phòng rác

/**
 * Quét dọn các phòng cũ và user mồ côi trên Firebase Realtime Database.
 * Chạy nền một cách an toàn và nhẹ nhàng (throttle 15 phút một lần mỗi client).
 */
export async function cleanStaleRtdbRooms() {
  try {
    const lastClean = Number(localStorage.getItem('schem_last_rtdb_clean') || 0);
    const now = Date.now();
    // Throttle: chỉ chạy tối đa 1 lần mỗi 15 phút trên mỗi trình duyệt
    if (now - lastClean < 15 * 60 * 1000) return;
    localStorage.setItem('schem_last_rtdb_clean', String(now));

    const snap = await get(ref(rtdb, 'presence'));
    if (!snap.exists()) return;

    const allRooms = snap.val() || {};
    let cleanedRooms = 0;
    let cleanedUsers = 0;

    for (const [roomId, roomVal] of Object.entries(allRooms)) {
      if (!roomVal || typeof roomVal !== 'object' || Object.keys(roomVal).length === 0) {
        // Phòng hoàn toàn rỗng -> dọn dẹp
        await remove(ref(rtdb, `presence/${roomId}`)).catch(() => {});
        cleanedRooms++;
        continue;
      }

      let roomHasActiveUser = false;
      let newestActivity = 0;

      for (const [uid, userVal] of Object.entries(roomVal)) {
        const lastActive = userVal?.lastSeen || userVal?.joinedAt || 0;
        if (lastActive > newestActivity) newestActivity = lastActive;

        // Nếu user này đã ngưng hoạt động quá ngưỡng stale user
        if (now - lastActive > STALE_USER_THRESHOLD) {
          await remove(ref(rtdb, `presence/${roomId}/${uid}`)).catch(() => {});
          cleanedUsers++;
        } else {
          roomHasActiveUser = true;
        }
      }

      // Nếu phòng không còn ai online và hoạt động gần nhất đã quá 1 tiếng -> xóa luôn phòng
      if (!roomHasActiveUser && (now - newestActivity > STALE_ROOM_THRESHOLD || newestActivity === 0)) {
        await remove(ref(rtdb, `presence/${roomId}`)).catch(() => {});
        cleanedRooms++;
      }
    }

    if (cleanedRooms > 0 || cleanedUsers > 0) {
      console.log(`[RTDB Cleanup] Đã tự động dọn dẹp ${cleanedRooms} phòng cũ và ${cleanedUsers} kết nối mồ côi trên RTDB.`);
    }
  } catch (err) {
    console.warn('[RTDB Cleanup] Bỏ qua lỗi dọn dẹp RTDB:', err);
  }
}

/**
 * Kiểm tra và dọn dẹp các peer mồ côi trong 1 phòng cụ thể
 */
export async function cleanDeadPeersInRoom(circuitId, peers, currentUid) {
  if (!circuitId || !peers) return;
  const now = Date.now();
  for (const [peerId, peerVal] of Object.entries(peers)) {
    if (peerId !== currentUid) {
      const lastActive = peerVal?.lastSeen || peerVal?.joinedAt || 0;
      if (now - lastActive > STALE_USER_THRESHOLD) {
        remove(ref(rtdb, `presence/${circuitId}/${peerId}`)).catch(() => {});
      }
    }
  }
}
