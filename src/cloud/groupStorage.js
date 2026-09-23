import {
  doc, setDoc, getDoc, updateDoc, collection, addDoc, serverTimestamp,
  arrayUnion, query, where, getDocs, FieldPath,
} from 'firebase/firestore';
import { db, ensureSignedIn } from '../realtime/firebase';  
import { call as driveCall } from './driveStorage';

// Tạo 1 thư mục Drive mới (dùng token Drive hiện tại của owner) rồi lưu group vào Firestore
export async function createGroup(name, ownerEmail) {
  // 1) Tạo thư mục trên Drive của owner
  const folder = await driveCreateFolder(name);

  // 2) Lưu group vào Firestore
  await ensureSignedIn();
  const ref = await addDoc(collection(db, 'groups'), {
    name,
    folderId: folder.id,
    ownerEmail,
    members: { [ownerEmail]: 'owner' },
    memberEmails: [ownerEmail], // mảng riêng để query (email có dấu chấm nên không dùng làm key trong where)
    createdAt: serverTimestamp(),
  });
  return ref.id; // groupId, dùng cho link ?g=<groupId>
}

export async function driveCreateFolder(name) {
  const r = await driveCall('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return r.json();
}

export async function getGroup(groupId) {
  await ensureSignedIn();
  const snap = await getDoc(doc(db, 'groups', groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// MỚI: tìm tất cả group mà email này là thành viên (owner, edit, hoặc view)
export async function findMyGroups(email) {
  await ensureSignedIn();
  const q = query(collection(db, 'groups'), where('memberEmails', 'array-contains', email));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// role: 'view' | 'edit'
export async function inviteMember(groupId, email, role) {
  const group = await getGroup(groupId);
  if (!group) throw new Error('Không tìm thấy group');

  // 1) Chia sẻ thư mục Drive thật sự cho email này (owner đang đăng nhập là người gọi)
  await driveCall(`https://www.googleapis.com/drive/v3/files/${group.folderId}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'user',
      role: role === 'edit' ? 'writer' : 'reader',
      emailAddress: email,
    }),
  });

  // 2) Ghi quyền + thêm vào memberEmails để tra cứu được
  // LƯU Ý: KHÔNG dùng chuỗi đường dẫn kiểu `members.${email}`, vì Firestore hiểu dấu chấm
  // trong email (vd: "...@gmail.com") là phân tách field lồng nhau, gây lỗi.
  // Dùng FieldPath(['members', email]) để truyền email như 1 đoạn path riêng, không bị tách theo dấu chấm.
  await updateDoc(
    doc(db, 'groups', groupId),
    new FieldPath('members', email), role,
    'memberEmails', arrayUnion(email)
  );
}

export function roleOf(group, email) {
  return group?.members?.[email] ?? null; // null = không có quyền
}