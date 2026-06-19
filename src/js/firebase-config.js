// ══════════════════════════════════════════════════════
//  FIREBASE CONFIG
// ══════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyDsB92rumYOJV0vLo3jUaQsg91h2uT3fgg",
  authDomain:        "forte-financeiro.firebaseapp.com",
  projectId:         "forte-financeiro",
  storageBucket:     "forte-financeiro.firebasestorage.app",
  messagingSenderId: "76950285425",
  appId:             "1:76950285425:web:25f88f6bcb76f5e4c9bfd0",
};
import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore, memoryLocalCache,
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, writeBatch, increment,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getFunctions, httpsCallable,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = initializeFirestore(app, { localCache: memoryLocalCache() });
export const fns     = getFunctions(app, 'southamerica-east1');
export const storage = getStorage(app);

// Exporta helpers do Firestore para uso nos módulos
export {
  signInWithEmailAndPassword, fbSignOut, sendPasswordResetEmail, onAuthStateChanged,
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, writeBatch, increment, httpsCallable,
  storageRef, uploadBytes, getDownloadURL,
};
