import { login, redefinirSenha, criarUsuario } from '../auth.js';
import { carregarUsuarios, toggleStatusUsuario } from '../db.js';
import { mostrarMsg, esconderMsg, msgHTML } from '../utils.js';

let _perfil = null;

export async function mount(container, perfil) {
  _perfil = perfil;
  container.innerHTML = _html();
  _bind();
}

export function destroy() {}

// ── Template ────────────────────────────────────
function _html() {
  return `
<div class="wrapper-login">

  <!-- Lado esquerdo -->
  <section class="lado-esq">
    <div class="linha-amb"></div>
    <div class="grade"></div>
    <div class="brilho"></div>
    <div class="brilho2"></div>

    <div class="logo-area">
      <p class="logo-tag">Sistema Financeiro Interno</p>
      <h1 class="logo-nome">FINAN<em>ÇAS</em></h1>
      <p class="logo-sub">Gestão · Contratos · KPIs · Fluxo de Caixa</p>
    </div>

    <p class="niveis-label">Níveis de acesso ao sistema</p>

    <div class="nivel-card adm">
      <div class="nivel-info">
        <h4>Administrador</h4>
        <p>Controle total + gerenciamento de usuários.</p>
        <div class="nivel-badges">
          <span class="badge-p badge-sim">Receitas</span>
          <span class="badge-p badge-sim">Despesas</span>
          <span class="badge-p badge-sim">Contratos</span>
          <span class="badge-p badge-sim">Relatórios</span>
          <span class="badge-p badge-sim">Usuários</span>
        </div>
      </div>
    </div>

    <div class="nivel-card fin">
      <div class="nivel-info">
        <h4>Financeiro</h4>
        <p>Acesso completo às funções financeiras, sem gestão de usuários.</p>
        <div class="nivel-badges">
          <span class="badge-p badge-sim">Receitas</span>
          <span class="badge-p badge-sim">Despesas</span>
          <span class="badge-p badge-sim">Contratos</span>
          <span class="badge-p badge-sim">Relatórios</span>
          <span class="badge-p badge-nao">Usuários</span>
        </div>
      </div>
    </div>

    <div class="nivel-card ope">
      <div class="nivel-info">
        <h4>Operação</h4>
        <p>Lança despesas de qualquer categoria. Sem acesso a relatórios.</p>
        <div class="nivel-badges">
          <span class="badge-p badge-nao">Receitas</span>
          <span class="badge-p badge-sim">Despesas</span>
          <span class="badge-p badge-nao">Contratos</span>
          <span class="badge-p badge-nao">Relatórios</span>
          <span class="badge-p badge-nao">Usuários</span>
        </div>
      </div>
    </div>

    <div class="rodape-esq">
      <span>Forte Sinalização © 2026</span>
      <span>Confidencial</span>
    </div>
  </section>

  <!-- Lado direito -->
  <section class="lado-dir">
    <div class="form-box">
      <h2 class="form-titulo">Entrar no sistema</h2>
      <p class="form-sub">Acesso restrito — use as credenciais cadastradas pelo administrador</p>

      <div class="abas">
        <button class="aba-btn ativo" id="aba-login"   data-aba="login">Já tenho acesso</button>
        <button class="aba-btn"       id="aba-reset"   data-aba="reset">Redefinir senha</button>
      </div>

      ${msgHTML('msg-login')}

      <!-- LOGIN -->
      <div id="form-login">
        <div class="campo">
          <label>E-mail</label>
          <input type="email" id="login-email" placeholder="seu@email.com.br" autocomplete="email">
        </div>
        <div class="campo">
          <label>Senha</label>
          <div class="campo-senha">
            <input type="password" id="login-senha" placeholder="••••••••" autocomplete="current-password">
            <button class="olho" type="button" data-toggle-senha="login-senha">👁</button>
          </div>
        </div>
        <button class="btn-entrar" id="btn-login">
          <div class="spinner" id="spin-login"></div>
          <span id="txt-login">Entrar</span>
        </button>
      </div>

      <!-- RESET SENHA -->
      <div id="form-reset" style="display:none">
        <p style="font-size:11px;color:var(--mu);margin-bottom:14px;font-weight:500">
          Informe seu e-mail cadastrado para receber o link de redefinição de senha.
        </p>
        <div class="campo">
          <label>E-mail cadastrado</label>
          <input type="email" id="reset-email" placeholder="seu@email.com.br">
        </div>
        <button class="btn-entrar" id="btn-reset">
          <div class="spinner" id="spin-reset"></div>
          <span id="txt-reset">Enviar link de redefinição</span>
        </button>
        <div class="esqueci">
          <a id="link-voltar-login">← Voltar ao login</a>
        </div>
      </div>

    </div>
  </section>
</div>

<!-- PAINEL ADMIN -->
<div class="painel-admin" id="painel-admin">
  <div class="admin-box">
    <div class="admin-header">
      <h2>Gerenciar Usuários</h2>
      <button class="btn-fechar" id="btn-fechar-admin">✕</button>
    </div>

    ${msgHTML('msg-admin')}

    <div class="add-form" id="add-form">
      <p class="add-form-titulo">Novo usuário</p>
      <div class="form-row">
        <div class="campo"><label>Nome completo</label><input type="text" id="add-nome" placeholder="Nome"></div>
        <div class="campo"><label>Nível</label>
          <select id="add-nivel">
            <option value="financeiro">Financeiro</option>
            <option value="operacao">Operação</option>
            <option value="administrador">Administrador</option>
          </select>
        </div>
      </div>
      <div class="campo">
        <label>E-mail</label>
        <input type="email" id="add-email" placeholder="email@fortesinalizacao.com.br">
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn-adm-add" id="btn-confirmar-add"
          style="background:var(--verde);border:none;border-bottom:2px solid var(--verde);border-radius:var(--raio);
                 padding:9px 16px;font-family:var(--fonte);font-size:11px;font-weight:800;
                 letter-spacing:.06em;text-transform:uppercase;cursor:pointer;color:#fff;flex:1">
          ✓ Criar usuário
        </button>
        <button id="btn-cancelar-add"
          style="background:var(--sf3);color:var(--txs);border:1px solid var(--bd);border-radius:var(--raio);
                 padding:9px 16px;font-family:var(--fonte);font-size:11px;font-weight:700;
                 letter-spacing:.05em;text-transform:uppercase;cursor:pointer;flex:0.4">
          Cancelar
        </button>
      </div>
    </div>

    <table class="tabela-usuarios">
      <thead>
        <tr><th>Nome</th><th>E-mail</th><th>Nível</th><th>Status</th><th>Ação</th></tr>
      </thead>
      <tbody id="corpo-tabela"></tbody>
    </table>

    <button class="btn-add" id="btn-abrir-add" style="width:100%;margin-top:4px">
      + Adicionar novo usuário
    </button>
  </div>
</div>
`;
}

// ── Bind ────────────────────────────────────────
function _bind() {
  // Abas
  document.querySelectorAll('[data-aba]').forEach(btn =>
    btn.addEventListener('click', () => _mostrarAba(btn.dataset.aba))
  );

  // Toggle senha
  document.querySelectorAll('[data-toggle-senha]').forEach(btn =>
    btn.addEventListener('click', () => _toggleSenha(btn))
  );

  // Login
  document.getElementById('btn-login').addEventListener('click', _fazerLogin);
  document.getElementById('login-senha').addEventListener('keydown', e => {
    if (e.key === 'Enter') _fazerLogin();
  });

  // Reset
  document.getElementById('btn-reset').addEventListener('click', _enviarReset);
  document.getElementById('link-voltar-login').addEventListener('click', () => _mostrarAba('login'));

  // Admin panel
  window.addEventListener('abrirAdmin', _abrirAdmin);
  document.getElementById('btn-fechar-admin').addEventListener('click', _fecharAdmin);
  document.getElementById('painel-admin').addEventListener('click', e => {
    if (e.target === document.getElementById('painel-admin')) _fecharAdmin();
  });
  document.getElementById('btn-abrir-add').addEventListener('click', () => {
    document.getElementById('add-form').classList.toggle('visivel');
  });
  document.getElementById('btn-cancelar-add').addEventListener('click', () => {
    document.getElementById('add-form').classList.remove('visivel');
  });
  document.getElementById('btn-confirmar-add').addEventListener('click', _criarUsuario);
}

// ── Ações ────────────────────────────────────────
function _mostrarAba(aba) {
  document.getElementById('form-login').style.display = aba === 'login' ? 'block' : 'none';
  document.getElementById('form-reset').style.display = aba === 'reset'  ? 'block' : 'none';
  document.getElementById('aba-login').classList.toggle('ativo', aba === 'login');
  document.getElementById('aba-reset').classList.toggle('ativo', aba === 'reset');
  esconderMsg('msg-login');
}

function _toggleSenha(btn) {
  const inp = document.getElementById(btn.dataset.toggleSenha);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
}

async function _fazerLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const senha = document.getElementById('login-senha').value;
  if (!email || !senha) {
    mostrarMsg('msg-login', 'erro', 'Preencha e-mail e senha.');
    return;
  }
  _setLoading('btn-login', 'spin-login', 'txt-login', true, 'Entrar');
  esconderMsg('msg-login');

  try {
    const { perfil } = await login(email, senha);
    window.app.perfil = perfil;
    _mostrarBemVindo(perfil);
  } catch (err) {
    const msgs = {
      'auth/user-not-found':  'E-mail não encontrado.',
      'auth/wrong-password':  'Senha incorreta.',
      'auth/invalid-email':   'E-mail inválido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
    };
    mostrarMsg('msg-login', 'erro', msgs[err.code] || err.message || 'Erro ao fazer login.');
    const inp = document.getElementById('login-senha');
    inp.classList.add('erro');
    setTimeout(() => inp.classList.remove('erro'), 2500);
  } finally {
    _setLoading('btn-login', 'spin-login', 'txt-login', false, 'Entrar');
  }
}

async function _enviarReset() {
  const email = document.getElementById('reset-email').value.trim().toLowerCase();
  if (!email) { mostrarMsg('msg-login', 'erro', 'Informe o e-mail.'); return; }
  _setLoading('btn-reset', 'spin-reset', 'txt-reset', true, 'Enviar link de redefinição');

  try {
    await redefinirSenha(email);
    mostrarMsg('msg-login', 'sucesso',
      'Link enviado! Verifique sua caixa de entrada (e o spam).');
  } catch (err) {
    mostrarMsg('msg-login', 'erro', 'Não foi possível enviar o e-mail. Verifique o endereço.');
  } finally {
    _setLoading('btn-reset', 'spin-reset', 'txt-reset', false, 'Enviar link de redefinição');
  }
}

function _mostrarBemVindo(perfil) {
  const { nivelLabel } = (async () => await import('../utils.js'))();
  const niveis = {
    administrador: 'Administrador — acesso completo',
    financeiro:    'Financeiro — gestão financeira',
    operacao:      'Operação — lançamento de despesas',
  };

  const tela = document.createElement('div');
  tela.className = 'tela-boas-vindas';
  tela.innerHTML = `
    <div class="bv-box">
      <p class="bv-tag">Acesso autorizado</p>
      <h2 class="bv-nome">Olá, ${perfil.nome.split(' ')[0]}!</h2>
      <p class="bv-nivel">${niveis[perfil.nivel] || perfil.nivel}</p>
      <div class="bv-linha"></div>
      <div class="bv-acoes">
        <button class="btn-bv btn-bv-prim" id="bv-acessar">📊 Acessar sistema</button>
        ${perfil.nivel === 'administrador'
          ? '<button class="btn-bv btn-bv-sec" id="bv-usuarios">👥 Usuários</button>'
          : ''}
        <button class="btn-bv btn-bv-sec" id="bv-sair">Sair</button>
      </div>
    </div>`;
  document.body.appendChild(tela);

  tela.querySelector('#bv-acessar').addEventListener('click', () => {
    tela.remove();
    window.app.navigate(
      perfil.nivel !== 'operacao' ? 'contratos' : 'lancar-despesa'
    );
  });
  tela.querySelector('#bv-sair')?.addEventListener('click', () => {
    tela.remove();
    window.app.sair();
  });
  tela.querySelector('#bv-usuarios')?.addEventListener('click', () => {
    tela.remove();
    _abrirAdmin();
  });
}

// ── Admin ────────────────────────────────────────
async function _abrirAdmin() {
  if (!window.app.perfil || window.app.perfil.nivel !== 'administrador') return;
  await _renderTabelaUsuarios();
  document.getElementById('painel-admin').classList.add('aberto');
}

function _fecharAdmin() {
  document.getElementById('painel-admin').classList.remove('aberto');
  document.getElementById('add-form').classList.remove('visivel');
}

async function _renderTabelaUsuarios() {
  const tbody = document.getElementById('corpo-tabela');
  tbody.innerHTML = '<tr><td colspan="5" style="padding:16px;color:var(--mu);text-align:center">Carregando...</td></tr>';
  try {
    const usuarios = await carregarUsuarios();
    tbody.innerHTML = usuarios.map(u => {
      const cls = u.nivel === 'administrador' ? 'adm' : u.nivel === 'financeiro' ? 'fin' : 'ope';
      return `<tr>
        <td style="color:var(--tx);font-weight:600">${u.nome}</td>
        <td style="font-size:11px">${u.email}</td>
        <td><span class="nivel-tag nivel-${cls}">${u.nivel}</span></td>
        <td><span class="status-dot ${u.status}"></span>${u.status === 'ativo' ? 'Ativo' : 'Inativo'}</td>
        <td>
          <button class="btn-sm ${u.status === 'ativo' ? 'btn-desativar' : 'btn-ativar'}"
            data-uid="${u.uid}" data-status="${u.status}">
            ${u.status === 'ativo' ? 'Desativar' : 'Ativar'}
          </button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" style="padding:16px;color:var(--mu);text-align:center">Nenhum usuário cadastrado.</td></tr>';

    tbody.querySelectorAll('[data-uid]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const novoStatus = btn.dataset.status === 'ativo' ? 'inativo' : 'ativo';
        await toggleStatusUsuario(btn.dataset.uid, novoStatus);
        await _renderTabelaUsuarios();
      })
    );
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar usuários.</td></tr>';
  }
}

async function _criarUsuario() {
  const nome  = document.getElementById('add-nome').value.trim();
  const email = document.getElementById('add-email').value.trim().toLowerCase();
  const nivel = document.getElementById('add-nivel').value;
  if (!nome || !email) { mostrarMsg('msg-admin', 'erro', 'Preencha nome e e-mail.'); return; }

  const btn = document.getElementById('btn-confirmar-add');
  btn.disabled = true; btn.textContent = 'Criando...';

  try {
    await criarUsuario({ nome, email, nivel });
    mostrarMsg('msg-admin', 'sucesso',
      `${nome} criado! Um e-mail de configuração de senha foi enviado.`);
    document.getElementById('add-nome').value  = '';
    document.getElementById('add-email').value = '';
    document.getElementById('add-form').classList.remove('visivel');
    await _renderTabelaUsuarios();
  } catch (err) {
    mostrarMsg('msg-admin', 'erro', err.message || 'Erro ao criar usuário.');
  } finally {
    btn.disabled = false; btn.textContent = '✓ Criar usuário';
  }
}

function _setLoading(btnId, spinId, txtId, on, labelOff) {
  document.getElementById(btnId).disabled = on;
  document.getElementById(spinId).style.display = on ? 'block' : 'none';
  document.getElementById(txtId).textContent    = on ? 'Aguarde...' : labelOff;
}
