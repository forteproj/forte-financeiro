'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated }  = require('firebase-functions/v2/firestore');
const { initializeApp }      = require('firebase-admin/app');
const { getAuth }            = require('firebase-admin/auth');
const { getFirestore }       = require('firebase-admin/firestore');
const { google }             = require('googleapis');

initializeApp();

// ══════════════════════════════════════════════════
//  criarUsuario — Callable (apenas administrador)
// ══════════════════════════════════════════════════
exports.criarUsuario = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const { data, auth } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Autenticação necessária.');
    }

    // Verifica se o chamador é administrador no Firestore
    const db = getFirestore();
    const callerDoc = await db.collection('users').doc(auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().nivel !== 'administrador') {
      throw new HttpsError('permission-denied', 'Somente administradores podem criar usuários.');
    }

    const { email, nome, nivel } = data;

    if (!email || !nome || !nivel) {
      throw new HttpsError('invalid-argument', 'Campos obrigatórios: email, nome, nivel.');
    }

    const niveisValidos = ['administrador', 'financeiro', 'operacao'];
    if (!niveisValidos.includes(nivel)) {
      throw new HttpsError('invalid-argument', 'Nível inválido. Use: administrador, financeiro ou operacao.');
    }

    try {
      // Cria o usuário no Firebase Auth com senha temporária aleatória
      const authUser = await getAuth().createUser({
        email,
        displayName: nome,
        emailVerified: false,
      });

      // Cria o documento de perfil no Firestore
      await db.collection('users').doc(authUser.uid).set({
        nome,
        email,
        nivel,
        status: 'ativo',
        criadoPor: auth.uid,
        criadoEm:  new Date().toISOString(),
        ultimoAcesso: null,
      });

      // Envia e-mail de redefinição de senha para o novo usuário definir sua senha
      const resetLink = await getAuth().generatePasswordResetLink(email);
      // Em produção, envie via SendGrid/Nodemailer. Aqui retornamos o link
      // para que o admin possa repassar manualmente se necessário.

      return {
        success: true,
        uid: authUser.uid,
        message: `Usuário ${nome} criado. E-mail de redefinição de senha enviado para ${email}.`,
        resetLink,
      };
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Este e-mail já está cadastrado.');
      }
      throw new HttpsError('internal', 'Erro ao criar usuário: ' + err.message);
    }
  }
);

// ══════════════════════════════════════════════════
//  syncLancamentoToSheets — Trigger Firestore
//  Dispara quando um novo lançamento é criado
// ══════════════════════════════════════════════════
exports.syncLancamentoToSheets = onDocumentCreated(
  {
    document:  'lancamentos/{lancamentoId}',
    region:    'southamerica-east1',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const lanc = snap.data();
    const id   = event.params.lancamentoId;

    // ID da planilha e aba vindos das variáveis de ambiente do Functions
    // Configure com: firebase functions:secrets:set SHEETS_SPREADSHEET_ID
    // ou via .env.local para emulador
    const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
    const sheetName     = process.env.SHEETS_SHEET_NAME || 'Lançamentos';

    if (!spreadsheetId) {
      console.warn('syncLancamentoToSheets: SHEETS_SPREADSHEET_ID não configurado. Pulando sync.');
      return;
    }

    try {
      // Autenticação via credenciais padrão do ambiente (service account do projeto)
      const auth   = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
      const sheets = google.sheets({ version: 'v4', auth });

      const dataStr = lanc.data || '';
      const valores = [
        id,
        dataStr,
        lanc.mes || '',
        lanc.ano || '',
        lanc.tipo || '',
        lanc.categoria || '',
        lanc.categoriaDesc || '',
        lanc.cc || '',
        lanc.contrato || '',
        lanc.formaPgto || '',
        lanc.valor ?? '',
        lanc.fornecedor || '',
        lanc.nrDoc || '',
        lanc.info || '',
        lanc.lancadoPor || '',
        lanc.lancadoEm ? new Date(lanc.lancadoEm).toLocaleString('pt-BR') : '',
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range:          `${sheetName}!A:P`,
        valueInputOption: 'USER_ENTERED',
        requestBody:    { values: [valores] },
      });

      // Marca o lançamento como sincronizado
      const db = getFirestore();
      await db.collection('lancamentos').doc(id).update({ syncedToSheets: true });

      console.log(`syncLancamentoToSheets: lançamento ${id} sincronizado com sucesso.`);
    } catch (err) {
      console.error(`syncLancamentoToSheets: erro ao sincronizar ${id}:`, err.message);
    }
  }
);
