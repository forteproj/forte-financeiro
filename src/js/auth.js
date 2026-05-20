import {
  auth, db, fns,
  signInWithEmailAndPassword, fbSignOut, sendPasswordResetEmail,
  onAuthStateChanged, doc, getDoc, updateDoc, serverTimestamp,
  httpsCallable,
} from './firebase-config.js';

// ── Login ──────────────────────────────────────────────
export async function login(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  const perfil = await carregarPerfil(cred.user.uid);
  if (!perfil) throw new Error('Usuário não encontrado no sistema.');
  if (perfil.status !== 'ativo') throw new Error('Usuário inativo. Contate o administrador.');
  await updateDoc(doc(db, 'users', cred.user.uid), {
    ultimoAcesso: serverTimestamp(),
  });
  return { user: cred.user, perfil };
}

// ── Logout ─────────────────────────────────────────────
export async function sair() {
  await fbSignOut(auth);
}

// ── Redefinir senha ────────────────────────────────────
export async function redefinirSenha(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Perfil do usuário no Firestore ─────────────────────
export async function carregarPerfil(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

// ── Escutar mudanças de auth ────────────────────────────
export function escutarAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Criar usuário via Cloud Function (admin only) ──────
export async function criarUsuario(dados) {
  const fn = httpsCallable(fns, 'criarUsuario');
  return fn(dados);
}

// ── Verificar permissão mínima ─────────────────────────
export function temPermissao(perfil, nivelMinimo) {
  if (!perfil || perfil.status !== 'ativo') return false;
  const ordem = { operacao: 1, financeiro: 2, administrador: 3 };
  return (ordem[perfil.nivel] || 0) >= (ordem[nivelMinimo] || 0);
}
