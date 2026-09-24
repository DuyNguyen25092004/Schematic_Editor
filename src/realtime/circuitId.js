const randomCode = () => Math.random().toString(36).slice(2, 10);

// Giữ chữ hoa + tới 64 ký tự vì phòng có thể là id file Google Drive
export function cleanRoomCode(s) {
  return (s || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

function writeUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('c', id);
  window.history.replaceState(null, '', url);
}

export function getCircuitId() {
  const url = new URL(window.location.href);
  let id = cleanRoomCode(url.searchParams.get('c'));
  if (!id) {
    id = randomCode();
    writeUrl(id);
  }
  return id;
}

export function roomUrl(id) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('c', id);
  return url.toString();
}

export function joinRoom(code) {
  const id = cleanRoomCode(code);
  if (!id) return false;
  window.location.href = roomUrl(id);
  return true;
}

export function newRoom() {
  window.location.href = roomUrl(randomCode());
}

// ---- Đổi phòng TẠI CHỖ (không reload) ----
export function setCircuitId(id) {
  const clean = cleanRoomCode(id);
  writeUrl(clean);
  return clean;
}

export function newCircuitId() {
  return setCircuitId(randomCode());
}