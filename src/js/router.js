// ══════════════════════════════════════════════
//  ROUTER HASH-BASED
// ══════════════════════════════════════════════

const ROTAS = {
  login:              () => import('./pages/login.js'),
  contratos:          () => import('./pages/contratos.js'),
  'lancar-contrato':  () => import('./pages/lancar-contrato.js'),
  'plano-contas':     () => import('./pages/plano-contas.js'),
  'lancar-despesa':   () => import('./pages/lancar-despesa.js'),
  'lancar-receita':   () => import('./pages/lancar-receita.js'),
  'base-dados':       () => import('./pages/base-dados.js'),
  'kpis':             () => import('./pages/kpis.js'),
  'fluxo-caixa':      () => import('./pages/fluxo-caixa.js'),
  'dre-comparativo':  () => import('./pages/dre-comparativo.js'),
  'dre-por-cc':       () => import('./pages/dre-por-cc.js'),
  'importar-backup':  () => import('./pages/importar-backup.js'),
};

const PERMISSOES = {
  login:             null,
  contratos:         'financeiro',
  'lancar-contrato': 'financeiro',
  'plano-contas':    'operacao',
  'lancar-despesa':  'operacao',
  'lancar-receita':  'financeiro',
  'base-dados':      'financeiro',
  'kpis':            'financeiro',
  'fluxo-caixa':     'financeiro',
  'dre-comparativo': 'financeiro',
  'dre-por-cc':      'financeiro',
  'importar-backup': 'financeiro',
};

let paginaAtual = null;
let rotaAtual   = null;

export const router = {
  init(app) {
    this._app = app;
    window.addEventListener('hashchange', () => this._processar());
  },

  navegar(rota) {
    if (window.location.hash === '#' + rota) {
      this._processar();
    } else {
      window.location.hash = '#' + rota;
    }
  },

  rotaAtual() { return rotaAtual; },

  async _processar() {
    const hash = window.location.hash.slice(1) || 'login';
    const rota = hash.split('/')[0];

    if (!ROTAS[rota]) {
      this.navegar('login');
      return;
    }

    const perfil = this._app.perfil;

    // Não autenticado → login
    if (!perfil && rota !== 'login') {
      this.navegar('login');
      return;
    }

    // Verificar permissão mínima
    const nivelMinimo = PERMISSOES[rota];
    if (nivelMinimo && perfil) {
      const { temPermissao } = await import('./auth.js');
      if (!temPermissao(perfil, nivelMinimo)) {
        this._renderAcessoNegado();
        return;
      }
    }

    // Destruir página atual
    if (paginaAtual?.destroy) paginaAtual.destroy();

    rotaAtual = rota;

    // Atualizar topbar
    this._app.atualizarTopbar(rota);

    // Carregar e montar nova página
    const container = document.getElementById('app');
    container.innerHTML = '';

    try {
      const modulo = await ROTAS[rota]();
      paginaAtual = modulo;
      await modulo.mount(container, perfil);
    } catch (err) {
      console.error('Erro ao carregar página:', err);
      container.innerHTML = `<div class="page"><div class="msg erro visivel">
        <span>✕</span><span>Erro ao carregar a página. Tente novamente.</span>
      </div></div>`;
    }
  },

  _renderAcessoNegado() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="acesso-negado">
        <div class="acesso-negado-icone">🔒</div>
        <h2>Acesso restrito</h2>
        <p>Seu perfil não tem permissão para esta área.</p>
        <button class="btn-add" style="margin-top:8px"
          onclick="window.app.navigate('lancar-despesa')">
          Ir para Lançar Despesa
        </button>
      </div>`;
  },
};
