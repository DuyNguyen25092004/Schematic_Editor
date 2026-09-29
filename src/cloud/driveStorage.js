const DEFAULT_CLIENT_ID = '426478121890-6obqhmmmubaae152h332e75i45s2gd91.apps.googleusercontent.com';
const TOKEN_KEY = 'google_drive_token';

export function getClientId() {
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (envId && typeof envId === 'string' && envId.trim() && !envId.includes('your_client_id_here')) {
    return envId.trim();
  }
  return DEFAULT_CLIENT_ID;
}

// ĐỔI: scope rộng hơn để thấy được file/thư mục người khác share (Editor/Viewer)
const SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email';
const SUFFIX = '.schem.json';

let token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;

export const isLoggedIn = () => !!token;
export const getToken = () => token;

export function driveLogin(providedClientId) {
  return new Promise((resolve, reject) => {
    const clientId = (providedClientId || getClientId() || '').trim();

    if (!clientId) {
      return reject(
        new Error('Thiếu Google Client ID: Vui lòng kiểm tra lại cấu hình.')
      );
    }

    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Chưa nạp được thư viện Google Identity Services. Hãy tải lại trang hoặc kiểm tra kết nối mạng.'));
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (res) => {
          if (res.error) return reject(new Error(res.error_description || res.error));

          // Kiểm tra xem người dùng có tích chọn quyền Google Drive trong popup không
          const hasDriveScope = window.google?.accounts?.oauth2?.hasGrantedAllScopes
            ? window.google.accounts.oauth2.hasGrantedAllScopes(res, 'https://www.googleapis.com/auth/drive')
            : (res.scope && res.scope.includes('https://www.googleapis.com/auth/drive'));

          if (!hasDriveScope) {
            token = null;
            try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
            return reject(
              new Error(
                'Bạn chưa cấp quyền Google Drive! Khi cửa sổ đăng nhập hiện ra, vui lòng TÍCH CHỌN vào ô: "Xem, chỉnh sửa, tạo và xóa tất cả các tệp trên Google Drive của bạn" rồi mới bấm Tiếp tục.'
              )
            );
          }

          token = res.access_token;
          try {
            sessionStorage.setItem(TOKEN_KEY, token);
          } catch {
            // ignore
          }
          resolve(token);
        },
        error_callback: (err) => {
          let msg = 'Đăng nhập bị hủy';
          if (err?.type === 'popup_closed') {
            msg = 'Cửa sổ đăng nhập đã bị đóng.';
          } else if (err?.type === 'popup_blocked') {
            msg = 'Trình duyệt đang chặn popup. Vui lòng cho phép popup để đăng nhập Google.';
          } else if (err?.message) {
            msg = err.message;
          } else if (err?.type) {
            msg = err.type;
          }
          reject(new Error(msg));
        },
      });
      // prompt: 'consent' bắt buộc Google hiển thị màn hình cấp quyền kèm các ô checkbox
      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(err);
    }
  });
}

export function driveLogout() {
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {
      // ignore
    }
  }
  token = null;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function call(url, options = {}) {
  if (!token) {
    throw new Error('Chưa đăng nhập Google. Hãy đăng nhập trước.');
  }
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });

  if (r.status === 401) {
    token = null;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');
  }

  if (!r.ok) {
    let errDetail = '';
    try {
      const j = await r.json();
      if (j?.error?.message) {
        errDetail = `: ${j.error.message}`;
      }
    } catch {
      // ignore
    }

    if (r.status === 403 && (errDetail.toLowerCase().includes('insufficient') || errDetail.toLowerCase().includes('scope'))) {
      token = null;
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // ignore
      }
      throw new Error(
        'Chưa đủ quyền truy cập Drive (Insufficient scopes). Hãy bấm đăng nhập lại và tích chọn ô cấp quyền Google Drive.'
      );
    }

    throw new Error(`Lỗi Drive ${r.status}${errDetail}`);
  }
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