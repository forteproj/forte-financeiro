// ══════════════════════════════════════════════
//  PONTO DE ENTRADA DA SPA
// ══════════════════════════════════════════════
import { escutarAuth, carregarPerfil, sair, temPermissao } from './auth.js';
import { router } from './router.js';

const NAV_ITEMS = [
  { rota: 'lancar-despesa',  label: 'Lançar Despesa',   nivel: 'operacao'   },
  { rota: 'lancar-receita',  label: 'Lançar Receita',   nivel: 'financeiro' },
  { rota: 'contratos',       label: 'Contratos',         nivel: 'financeiro' },
  { rota: 'lancar-contrato', label: 'Novo Contrato',     nivel: 'financeiro' },
  { rota: 'base-dados',      label: 'Base de Dados',     nivel: 'financeiro' },
  { rota: 'kpis',            label: 'KPIs',              nivel: 'financeiro' },
  { rota: 'fluxo-caixa',     label: 'Fluxo de Caixa',   nivel: 'financeiro' },
  { rota: 'dre-comparativo', label: 'DRE Comparativo',   nivel: 'financeiro' },
  { rota: 'dre-por-cc',      label: 'DRE por CC',        nivel: 'financeiro' },
  { rota: 'plano-contas',    label: 'Plano de Contas',   nivel: 'operacao'   },
];

window.app = {
  perfil: null,

  navigate(rota) { router.navegar(rota); },

  async sair() {
    await sair();
    this.perfil = null;
    _ocultarTopbar();
    router.navegar('login');
  },

  atualizarTopbar(rotaAtiva) {
    if (!this.perfil) { _ocultarTopbar(); return; }
    _mostrarTopbar();
    _renderNav(this.perfil, rotaAtiva);
    document.getElementById('topbar-user').textContent =
      this.perfil.nome.split(' ')[0] + ' · ' + this.perfil.nivel;
    const btnAdmin = document.getElementById('btn-topbar-admin');
    btnAdmin.style.display = this.perfil.nivel === 'administrador' ? '' : 'none';
  },
};

// ── Botões fixos do topbar ────────────────────
document.getElementById('btn-topbar-sair').addEventListener('click', () => window.app.sair());
document.getElementById('btn-topbar-admin').addEventListener('click', () => {
  // Abre o painel admin (implementado na página de login/usuários)
  const ev = new CustomEvent('abrirAdmin');
  window.dispatchEvent(ev);
});

// ── Delegação de cliques no topbar-nav ────────
document.getElementById('topbar-nav').addEventListener('click', e => {
  const btn = e.target.closest('[data-route]');
  if (btn) window.app.navigate(btn.dataset.route);
});

// ── Auth listener principal ──────────────────
escutarAuth(async fbUser => {
  const loading = document.getElementById('loading-screen');

  if (fbUser) {
    try {
      const perfil = await carregarPerfil(fbUser.uid);
      if (!perfil || perfil.status !== 'ativo') {
        await sair();
        router.navegar('login');
      } else {
        window.app.perfil = perfil;
        router.init(window.app);
        const rota = window.location.hash.slice(1) || 'contratos';
        router.navegar(temPermissao(perfil, 'financeiro') ? rota : 'lancar-despesa');
      }
    } catch (err) {
      console.error('Erro ao carregar perfil:', err);
      router.navegar('login');
    }
  } else {
    window.app.perfil = null;
    _ocultarTopbar();
    router.init(window.app);
    router.navegar('login');
  }

  // Remove loading screen
  setTimeout(() => {
    loading.classList.add('oculto');
    setTimeout(() => loading.remove(), 350);
  }, 200);
});

// ── Helpers ────────────────────────────────────
function _mostrarTopbar() {
  document.getElementById('topbar').style.display = '';
}
function _ocultarTopbar() {
  document.getElementById('topbar').style.display = 'none';
}
function _renderNav(perfil, rotaAtiva) {
  const nav = document.getElementById('topbar-nav');
  nav.innerHTML = NAV_ITEMS
    .filter(item => temPermissao(perfil, item.nivel))
    .map(item => `
      <button class="tnav-a ${item.rota === rotaAtiva ? 'ativo' : ''}"
        data-route="${item.rota}">
        ${item.label}
      </button>`)
    .join('');
}
