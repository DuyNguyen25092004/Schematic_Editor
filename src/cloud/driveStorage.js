const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
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

async function call(url, options = {}) {
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

export async function driveList() {
  const q = encodeURIComponent(`name contains '${SUFFIX}' and trashed=false`);
  const r = await call(
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=50`
  );
  return (await r.json()).files ?? [];
}

export async function driveSave(name, data, fileId = null) {
  const meta = fileId ? {} : { name: name + SUFFIX, mimeType: 'application/json' };
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
  return r.json();
}

export async function driveDelete(fileId) {
  await call(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
}