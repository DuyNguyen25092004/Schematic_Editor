import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDPvMOW_yHpWhdvsYenSrJiQBGZeKWb_ow",
  authDomain: "schematiceditor.firebaseapp.com",
  projectId: "schematiceditor",
  storageBucket: "schematiceditor.firebasestorage.app",
  messagingSenderId: "426478121890",
  appId: "1:426478121890:web:a4e4a7ab31600edd1df8fb"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Trả về user khi đã đăng nhập (ẩn danh) xong
export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (user) => {
      if (user) { off(); resolve(user); }
      else signInAnonymously(auth).catch(reject);
    });
  });
}