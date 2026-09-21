// Lấy ?c=xxx; nếu chưa có thì tạo mới và ghi vào URL để chia sẻ link
export function getCircuitId() {
  const url = new URL(window.location.href);
  let id = url.searchParams.get('c');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    url.searchParams.set('c', id);
    window.history.replaceState(null, '', url);
  }
  return id;
}