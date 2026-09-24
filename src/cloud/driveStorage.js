const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// ĐỔI: scope rộng hơn để thấy được file/thư mục người khác share (Editor/Viewer)
const SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email';
const SUFFIX = '.schem.json';
let token = null;

export const isLoggedIn = () => !!token;

export function driveLogin() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Chưa nạp được thư viện Google. Hãy tải lại trang.'));
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error) return reject(new Error(res.error));
        token = res.access_token;
        resolve(token);
      },
      error_callback: (err) => reject(new Error(err.type || 'Đăng nhập bị hủy')),
    });
    client.requestAccessToken();
  });
}

export function driveLogout() {
  if (token) window.google?.accounts?.oauth2?.revoke(token);
  token = null;
}

export async function call(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (r.status === 401) {
    token = null;
    throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');
  }
  if (!r.ok) throw new Error(`Lỗi Drive ${r.status}`);
  return r;
}

// Danh sách file của riêng người đang đăng nhập (giữ để tương thích tính năng cũ, không dùng cho group)
export async function driveList() {
  const q = encodeURIComponent(`name contains '${SUFFIX}' and trashed=false`);
  const r = await call(
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=50`
  );
  return (await r.json()).files ?? [];
}

// MỚI: danh sách file .schem.json trong 1 thư mục cụ thể (thư mục group đã được share)
export async function driveListFolder(folderId) {
  const q = encodeURIComponent(
    `'${folderId}' in parents and name contains '${SUFFIX}' and trashed=false`
  );
  const r = await call(
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=100`
  );
  return (await r.json()).files ?? [];
}

// fileId = null -> tạo file mới; có fileId -> ghi đè nội dung
// folderId (tùy chọn) -> khi tạo file mới, đặt vào đúng thư mục group
export async function driveSave(name, data, fileId = null, folderId = null) {
  const meta = fileId
    ? {}
    : { name: name + SUFFIX, mimeType: 'application/json', ...(folderId ? { parents: [folderId] } : {}) };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  body.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`;

  const r = await call(url, { method: fileId ? 'PATCH' : 'POST', body });
  return r.json();
}

export async function driveLoad(fileId) {
  const r = await call(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return r.json(); // { nodes, wires }
}

export async function driveGetEmail() {
  const r = await call('https://www.googleapis.com/oauth2/v3/userinfo');
  const d = await r.json();
  return d.email;
}

export async function driveDelete(fileId) {
  await call(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
}