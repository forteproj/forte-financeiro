// ══════════════════════════════════════════════════════
//  FIREBASE CONFIG
//  Credenciais carregadas de firebase-env.js (arquivo gitignorável)
//  Para configurar: copie firebase-env.example.js → firebase-env.js
// ══════════════════════════════════════════════════════
import { firebaseConfig } from './firebase-env.js';
import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getFunctions, httpsCallable,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export const fns  = getFunctions(app, 'southamerica-east1');

// Exporta helpers do Firestore para uso nos módulos
export {
  signInWithEmailAndPassword, fbSignOut, sendPasswordResetEmail, onAuthStateChanged,
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, writeBatch, httpsCallable,
};
