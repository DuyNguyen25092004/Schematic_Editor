const randomCode = () => Math.random().toString(36).slice(2, 10);

// Chỉ giữ chữ thường, số, gạch ngang, gạch dưới (an toàn cho đường dẫn Firestore/RTDB)
export function cleanRoomCode(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

// Lấy ?c=xxx; nếu chưa có thì tạo mới và ghi vào URL
export function getCircuitId() {
  const url = new URL(window.location.href);
  let id = cleanRoomCode(url.searchParams.get('c'));
  if (!id) {
    id = randomCode();
    url.searchParams.set('c', id);
    window.history.replaceState(null, '', url);
  }
  return id;
}

// Link đầy đủ của một phòng (giữ nguyên domain + tên repo hiện tại)
export function roomUrl(id) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('c', id);
  return url.toString();
}

// Vào phòng theo mã. Tải lại trang để mọi trạng thái được khởi tạo sạch cho phòng mới
export function joinRoom(code) {
  const id = cleanRoomCode(code);
  if (!id) return false;
  window.location.href = roomUrl(id);
  return true;
}

export function newRoom() {
  window.location.href = roomUrl(randomCode());
}