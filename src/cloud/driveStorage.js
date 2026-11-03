const DEFAULT_CLIENT_ID = '426478121890-6obqhmmmubaae152h332e75i45s2gd91.apps.googleusercontent.com';
const TOKEN_KEY = 'google_drive_token';
const TOKEN_EXPIRES_KEY = 'google_drive_token_expires_at';

export function getClientId() {
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (envId && typeof envId === 'string' && envId.trim() && !envId.includes('your_client_id_here')) {
    return envId.trim();
  }
  return DEFAULT_CLIENT_ID;
}

// Scope rộng hơn để thấy được file/thư mục người khác share (Editor/Viewer)
const SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email';
const SUFFIX = '.schem.json';

function getInitialToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function getInitialExpiresAt() {
  try {
    const raw = localStorage.getItem(TOKEN_EXPIRES_KEY) || sessionStorage.getItem(TOKEN_EXPIRES_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

let token = typeof window !== 'undefined' ? getInitialToken() : null;
let tokenExpiresAt = typeof window !== 'undefined' ? getInitialExpiresAt() : 0;

function saveToken(t, expiresInSec = 3600) {
  token = t;
  tokenExpiresAt = Date.now() + Math.max(300, expiresInSec) * 1000;
  try {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(TOKEN_EXPIRES_KEY, String(tokenExpiresAt));
    sessionStorage.setItem(TOKEN_KEY, t);
    sessionStorage.setItem(TOKEN_EXPIRES_KEY, String(tokenExpiresAt));
  } catch {
    // ignore
  }
}

function clearSavedToken() {
  token = null;
  tokenExpiresAt = 0;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRES_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRES_KEY);
  } catch {
    // ignore
  }
}

export const isLoggedIn = () => !!token;
export const getToken = () => token;

let tokenClient = null;
let activeTokenPromise = null;
let activeTokenResolve = null;
let activeTokenReject = null;

function ensureTokenClient(providedClientId) {
  if (tokenClient) return tokenClient;
  if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) return null;

  const clientId = (providedClientId || getClientId() || '').trim();
  if (!clientId) return null;

  try {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (res) => {
        if (res.error) {
          if (activeTokenReject) activeTokenReject(new Error(res.error_description || res.error));
          activeTokenPromise = null;
          activeTokenResolve = null;
          activeTokenReject = null;
          return;
        }

        const hasDriveScope = window.google?.accounts?.oauth2?.hasGrantedAllScopes
          ? window.google.accounts.oauth2.hasGrantedAllScopes(res, 'https://www.googleapis.com/auth/drive')
          : (res.scope && res.scope.includes('https://www.googleapis.com/auth/drive'));

        if (!hasDriveScope) {
          clearSavedToken();
          if (activeTokenReject) {
            activeTokenReject(
              new Error(
                'Google Drive permission not granted! When the sign-in popup appears, please CHECK the box: "See, edit, create, and delete all of your Google Drive files" and click Continue.'
              )
            );
          }
          activeTokenPromise = null;
          activeTokenResolve = null;
          activeTokenReject = null;
          return;
        }

        saveToken(res.access_token, res.expires_in || 3600);
        if (activeTokenResolve) activeTokenResolve(token);
        activeTokenPromise = null;
        activeTokenResolve = null;
        activeTokenReject = null;
      },
      error_callback: (err) => {
        let msg = 'Sign-in cancelled';
        if (err?.type === 'popup_closed') {
          msg = 'Sign-in popup was closed.';
        } else if (err?.type === 'popup_blocked') {
          msg = 'Popup blocked by browser. Please allow popups to sign in with Google.';
        } else if (err?.message) {
          msg = err.message;
        } else if (err?.type) {
          msg = err.type;
        }
        if (activeTokenReject) activeTokenReject(new Error(msg));
        activeTokenPromise = null;
        activeTokenResolve = null;
        activeTokenReject = null;
      },
    });
    return tokenClient;
  } catch (err) {
    console.error('Failed to initTokenClient:', err);
    return null;
  }
}

// Yêu cầu token âm thầm trong nền (Silent Token Refresh) không hiện popup
export function refreshDriveTokenSilent() {
  if (activeTokenPromise) return activeTokenPromise;

  const client = ensureTokenClient();
  if (!client) {
    return Promise.reject(new Error('Google Identity Services not ready'));
  }

  activeTokenPromise = new Promise((resolve, reject) => {
    activeTokenResolve = resolve;
    activeTokenReject = reject;
    try {
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      activeTokenPromise = null;
      activeTokenResolve = null;
      activeTokenReject = null;
      reject(e);
    }
  });

  return activeTokenPromise;
}

export function driveLogin(providedClientId) {
  const clientId = (providedClientId || getClientId() || '').trim();
  if (!clientId) {
    return Promise.reject(new Error('Missing Google Client ID: Please check configuration.'));
  }

  if (!window.google?.accounts?.oauth2) {
    return Promise.reject(new Error('Google Identity Services library not loaded. Please reload the page or check network connection.'));
  }

  const client = ensureTokenClient(clientId);
  if (!client) {
    return Promise.reject(new Error('Failed to initialize Google Auth Client.'));
  }

  activeTokenPromise = new Promise((resolve, reject) => {
    activeTokenResolve = resolve;
    activeTokenReject = reject;
    client.requestAccessToken({ prompt: 'consent' });
  });

  return activeTokenPromise;
}

export function driveLogout() {
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {
      // ignore
    }
  }
  clearSavedToken();
}

export async function call(url, options = {}, isRetry = false) {
  if (!token) {
    throw new Error('Not signed in to Google. Please sign in first.');
  }

  // Tự động làm mới token trong nền nếu token sắp hết hạn trong vòng 5 phút
  if (tokenExpiresAt && Date.now() > (tokenExpiresAt - 5 * 60 * 1000) && !isRetry) {
    try {
      await refreshDriveTokenSilent();
    } catch {
      // Nếu silent refresh chưa kịp hoàn thành, tiếp tục thử với token hiện có
    }
  }

  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });

  if (r.status === 401) {
    // Nếu token vừa hết hạn, tự động làm mới trong nền 1 lần và thử lại
    if (!isRetry) {
      try {
        await refreshDriveTokenSilent();
        return await call(url, options, true);
      } catch {
        // Silent refresh thất bại (người dùng đã đăng xuất Google hoặc thu hồi quyền)
      }
    }

    clearSavedToken();
    throw new Error('Session expired, please sign in again.');
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
      clearSavedToken();
      throw new Error(
        'Insufficient Drive permissions. Please sign in again and grant Google Drive permissions.'
      );
    }

    throw new Error(`Drive error ${r.status}${errDetail}`);
  }
  return r;
}

// Danh sách file của riêng người đang đăng nhập (tương thích ngược)
export async function driveList() {
  const q = encodeURIComponent(`name contains '${SUFFIX}' and trashed=false`);
  const r = await call(
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,modifiedTime,parents)&orderBy=modifiedTime%20desc&pageSize=50`
  );
  return (await r.json()).files ?? [];
}

// Danh sách file .schem.json trong 1 thư mục cụ thể (cho Group)
export async function driveListFolder(folderId) {
  const parentId = folderId || 'root';
  const q = encodeURIComponent(
    `'${parentId}' in parents and name contains '${SUFFIX}' and trashed=false`
  );
  const r = await call(
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,modifiedTime,parents,size)&orderBy=modifiedTime%20desc&pageSize=100`
  );
  return (await r.json()).files ?? [];
}

// Lấy danh sách thư mục con và các file .schem.json trong 1 thư mục (hỗ trợ cả "sharedWithMe" và lối tắt Shortcut)
export async function driveListFolderContents(folderId = 'root') {
  let q;
  if (folderId === 'sharedWithMe') {
    q = encodeURIComponent(
      `sharedWithMe=true and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType='application/vnd.google-apps.shortcut' or name contains '${SUFFIX}')`
    );
  } else {
    const parentId = folderId || 'root';
    q = encodeURIComponent(
      `'${parentId}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType='application/vnd.google-apps.shortcut' or name contains '${SUFFIX}')`
    );
  }

  const r = await call(
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,mimeType,modifiedTime,size,parents,shortcutDetails)&orderBy=folder,name&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`
  );
  const items = (await r.json()).files ?? [];

  const folders = [];
  const files = [];

  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      folders.push(item);
    } else if (item.mimeType === 'application/vnd.google-apps.shortcut') {
      const targetMime = item.shortcutDetails?.targetMimeType;
      const targetId = item.shortcutDetails?.targetId;
      if (targetMime === 'application/vnd.google-apps.folder') {
        folders.push({
          ...item,
          id: targetId || item.id,
          isShortcut: true,
        });
      } else if (item.name?.includes(SUFFIX)) {
        files.push({
          ...item,
          id: targetId || item.id,
          isShortcut: true,
        });
      }
    } else {
      files.push(item);
    }
  }

  return { folders, files };
}

// Tạo thư mục mới trên Drive
export async function driveCreateFolder(name, parentId = 'root') {
  const targetParent = parentId && parentId !== 'root' && parentId !== 'sharedWithMe' ? parentId : 'root';
  const body = {
    name: (name || 'New Folder').trim(),
    mimeType: 'application/vnd.google-apps.folder',
    parents: [targetParent],
  };
  const r = await call('https://www.googleapis.com/drive/v3/files?fields=id,name,parents&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Lấy thông tin thư mục
export async function driveGetFolderMeta(folderId) {
  if (!folderId || folderId === 'root') {
    return { id: 'root', name: 'My Drive' };
  }
  if (folderId === 'sharedWithMe') {
    return { id: 'sharedWithMe', name: 'Shared with me' };
  }
  try {
    const r = await call(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents,shortcutDetails&supportsAllDrives=true`);
    const d = await r.json();
    return { id: d.id, name: d.name || 'Drive Folder' };
  } catch {
    return { id: folderId, name: 'Drive Folder' };
  }
}

// Lấy metadata của 1 file
export async function driveGetFileMeta(fileId) {
  const r = await call(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents,modifiedTime,capabilities(canEdit)&supportsAllDrives=true`);
  return r.json();
}

// Kiểm tra xem người dùng hiện tại có quyền truy cập / chỉnh sửa file Drive này hay không
export async function verifyDriveAccess(fileId) {
  if (!isLoggedIn() || !fileId || fileId.length < 15) return false;
  try {
    const meta = await driveGetFileMeta(fileId);
    if (!meta || !meta.id) return false;
    if (meta.capabilities && meta.capabilities.canEdit === false) {
      return false; // Chỉ có quyền xem trên Drive
    }
    return true; // Có quyền chỉnh sửa trên Drive
  } catch {
    return false;
  }
}

// Helper trích xuất Folder ID từ link Google Drive hoặc mã ID trực tiếp
export function parseFolderIdFromUrl(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

// fileId = null -> tạo file mới trong folderId; có fileId -> ghi đè trực tiếp vào file đó
export async function driveSave(name, data, fileId = null, folderId = null) {
  const rawName = (name || 'So do moi').trim();
  const cleanName = rawName.endsWith(SUFFIX) ? rawName : rawName + SUFFIX;

  const targetFolder = (folderId && folderId !== 'root' && folderId !== 'sharedWithMe') ? folderId : 'root';
  const meta = fileId
    ? { name: cleanName }
    : {
        name: cleanName,
        mimeType: 'application/json',
        parents: [targetFolder],
      };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  body.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,modifiedTime`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,modifiedTime`;

  const r = await call(url, { method: fileId ? 'PATCH' : 'POST', body });
  return r.json();
}

export async function driveLoad(fileId) {
  const r = await call(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  return r.json(); // { nodes, wires, sheets, activeSheetId }
}

export async function driveGetEmail() {
  const r = await call('https://www.googleapis.com/oauth2/v3/userinfo');
  const d = await r.json();
  return d.email;
}

export async function driveDelete(fileId) {
  await call(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { method: 'DELETE' });
}
