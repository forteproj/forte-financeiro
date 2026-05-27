import {
  carregarPlanoContas, salvarCategoria,
  toggleCategoriaAtiva, deletarCategoria,
} from '../db.js';
import { msgHTML, mostrarMsg, esconderMsg } from '../utils.js';

const GRUPOS = {
  '1': 'Receita',
  '2': 'Retenções / Impostos sobre Receita',
  '3': 'Custos Diretos (CC Cliente / Obras)',
  '4': 'Despesas Administrativas',
  '5': 'Financeiro',
  '6': 'CAPEX — Investimentos',
};

const CC_CLASSES = {
  'CC-CLI-xxx': '',
  'CC-ADM-01-MATRIZ':             'adm',
  'CC-ADM-02-FOLHA DE PAGAMENTO': 'adm2',
  'CC-ADM-03-INVESTIMENTOS':      'adm3',
};

let _plano  = [];
let _perfil = null;

export async function mount(container, perfil) {
  _perfil = perfil;
  container.innerHTML = _html(perfil);
  try {
    _plano = await carregarPlanoContas();
  } catch {
    _plano = [];
  }
  _bindFiltros();
  _bindModal();
  _filtrar();
}

export function destroy() {}

// ── Templates ────────────────────────────────────
function _html(perfil) {
  const podeAdicionar = perfil?.nivel !== 'operacao';
  return `
<div class="page">
  <div class="page-header">
    <div>
      <div class="page-title">Plano de Contas</div>
      <div class="page-sub">Categorias · Centros de Custo · Regras de Lançamento</div>
    </div>
    <div class="header-right">
      <span class="badge-total" id="badge-total">— categorias</span>
      ${podeAdicionar
        ? '<button class="btn-add" id="btn-add-categoria">+ Adicionar Categoria</button>'
        : ''}
    </div>
  </div>

  <div class="busca-wrap">
    <input class="busca-input" type="text" id="busca" placeholder="Buscar por código ou descrição...">
    <select class="filtro-grupo" id="filtro-grupo">
      <option value="">Todos os grupos</option>
      <option value="1">1.x — Receita</option>
      <option value="2">2.x — Retenções</option>
      <option value="3">3.x — Custos Diretos</option>
      <option value="4">4.x — Despesas ADM</option>
      <option value="5">5.x — Financeiro</option>
      <option value="6">6.x — CAPEX</option>
    </select>
    <label style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--mu);cursor:pointer">
      <input type="checkbox" id="mostrar-inativas" style="width:13px;height:13px"> Mostrar inativas
    </label>
  </div>

  <div id="conteudo"></div>

  <div class="regras" id="secao-regras">
    <p class="regras-titulo">Regras de lançamento</p>
    <div class="regras-grid">${_regrasHTML()}</div>
  </div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal-box" style="max-width:520px">
    <div class="modal-header">
      <span class="modal-titulo" id="modal-titulo">Nova Categoria</span>
      <button class="btn-fechar" id="btn-fechar-modal">✕</button>
    </div>
    <div class="modal-body">
      ${msgHTML('msg-modal')}
      <div class="row row-2">
        <div class="campo" style="flex:0.6">
          <label>Código</label>
          <input type="text" id="f-cod" placeholder="ex: 3.1.008">
        </div>
        <div class="campo">
          <label>Grupo</label>
          <select id="f-grupo">
            <option value="1">1.x — Receita</option>
            <option value="2">2.x — Retenções</option>
            <option value="3" selected>3.x — Custos Diretos</option>
            <option value="4">4.x — Despesas ADM</option>
            <option value="5">5.x — Financeiro</option>
            <option value="6">6.x — CAPEX</option>
          </select>
        </div>
      </div>
      <div class="campo">
        <label>Descrição</label>
        <input type="text" id="f-desc" placeholder="Nome da categoria">
      </div>
      <div class="row row-2">
        <div class="campo">
          <label>Centro de Custo padrão</label>
          <select id="f-cc">
            <option value="CC-CLI-xxx">CC-CLI-xxx (obra/cliente)</option>
            <option value="CC-ADM-01-MATRIZ">CC-ADM-01-MATRIZ</option>
            <option value="CC-ADM-02-FOLHA DE PAGAMENTO">CC-ADM-02-FOLHA DE PAGAMENTO</option>
            <option value="CC-ADM-03-INVESTIMENTOS">CC-ADM-03-INVESTIMENTOS</option>
          </select>
        </div>
        <div class="campo">
          <label>Tipo</label>
          <select id="f-tipo">
            <option value="receita">Receita</option>
            <option value="despesa" selected>Despesa</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
      </div>
      <div class="campo">
        <label>Exemplo prático</label>
        <textarea id="f-ex" placeholder="Ex: Compra de tinta para obra em BH"></textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn-add" id="btn-salvar-cat" style="flex:1">✓ Salvar Categoria</button>
        <button class="btn-add" id="btn-cancelar-cat"
          style="background:var(--sf3);color:var(--txs);border-bottom-color:var(--bd2);flex:0.4">
          Cancelar
        </button>
      </div>
    </div>
  </div>
</div>
`;
}

function _regrasHTML() {
  const regras = [
    { cor:'',      tag:'⚠ Regra CAPEX',       titulo:'Limite de capitalização',
      texto:`Compras <strong>abaixo de R$ 2.500</strong> → lançar como despesa direta (<code>3.x</code> ou <code>4.x</code>).<br><br>Compras <strong>acima de R$ 2.500</strong> → lançar como ativo imobilizado: categoria <code>6.1.001</code> no centro <code>CC-ADM-03-INVESTIMENTOS</code>.` },
    { cor:'verde', tag:'⚠ Regra de Desempate', titulo:'Escritório vs Obra',
      texto:`Pergunta-chave: <strong>"esse gasto existe por causa de uma obra específica?"</strong><br><br><strong>Sim</strong> → <code>CC-CLI-xxx</code> da obra.<br><strong>Não</strong> → <code>CC-ADM-01-MATRIZ</code> (escritório central).` },
    { cor:'azul',  tag:'⚠ Rateio de Folha',   titulo:'Critério fixo mensal',
      texto:`Folha acumula em <code>CC-ADM-02-FOLHA DE PAGAMENTO</code> durante o mês.<br><br>No fechamento: ratear por <strong>dias-equipe alocados</strong> por cliente.<br>Fórmula: <code>Total ADM-02 × (dias cliente ÷ total dias)</code>.<br>Lançar como <code>3.2.001</code> em cada <code>CC-CLI</code>.` },
    { cor:'roxo',  tag:'⚠ Seguro Garantia',   titulo:'Apólice, não caução',
      texto:`A Forte usa <strong>seguro garantia (apólice)</strong> — não retenção em dinheiro.<br><br>Prêmio da apólice → categoria <code>3.8.002</code> no <code>CC-CLI</code> do contrato vinculado.` },
    { cor:'verde', tag:'⚠ Todo Lançamento',   titulo:'Campos obrigatórios',
      texto:`Todo lançamento precisa ter:<br><strong>1.</strong> Categoria (código do plano de contas)<br><strong>2.</strong> Centro de Custo correto<br><strong>3.</strong> Documento anexo (NF, boleto, RPA…)<br><br><strong>Sem CC correto → não paga.</strong>` },
    { cor:'',      tag:'⚠ CC-ADM-02',        titulo:'Folha operacional',
      texto:`Salários, encargos, VA/VT e horas extras das equipes de campo acumulam em <code>CC-ADM-02-FOLHA DE PAGAMENTO</code>.<br><br>Ao final do mês este CC deve <strong>fechar zerado</strong> após o rateio para os clientes.` },
  ];
  return regras.map(r => `
    <div class="regra-card ${r.cor}">
      <div class="regra-tag">${r.tag}</div>
      <div class="regra-titulo">${r.titulo}</div>
      <div class="regra-texto">${r.texto}</div>
    </div>`).join('');
}

// ── Bind ────────────────────────────────────────
function _bindFiltros() {
  document.getElementById('busca').addEventListener('input', _filtrar);
  document.getElementById('filtro-grupo').addEventListener('change', _filtrar);
  document.getElementById('mostrar-inativas').addEventListener('change', _filtrar);
}

function _bindModal() {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('btn-add-categoria')
    ?.addEventListener('click', _abrirModal);
  document.getElementById('btn-fechar-modal')
    ?.addEventListener('click', _fecharModal);
  document.getElementById('btn-cancelar-cat')
    ?.addEventListener('click', _fecharModal);
  document.getElementById('btn-salvar-cat')
    ?.addEventListener('click', _salvarCategoria);
  overlay?.addEventListener('click', e => { if (e.target === overlay) _fecharModal(); });
}

// ── Filtrar + Render ─────────────────────────────
function _filtrar() {
  const busca         = (document.getElementById('busca')?.value || '').toLowerCase();
  const grupo         = document.getElementById('filtro-grupo')?.value || '';
  const mostrarInativas = document.getElementById('mostrar-inativas')?.checked;

  const lista = _plano.filter(c => {
    if (!mostrarInativas && !c.ativa) return false;
    if (grupo && c.grupo !== grupo) return false;
    if (busca) return (
      c.id.toLowerCase().includes(busca) ||
      c.desc.toLowerCase().includes(busca) ||
      (c.ex || '').toLowerCase().includes(busca)
    );
    return true;
  });

  const ativas = _plano.filter(c => c.ativa).length;
  document.getElementById('badge-total').textContent = ativas + ' categorias ativas';
  _render(lista);
}

function _render(lista) {
  const container = document.getElementById('conteudo');
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = '<div class="nenhum">Nenhuma categoria encontrada para este filtro.</div>';
    return;
  }

  const podeAdicionar = _perfil?.nivel !== 'operacao';
  const podeApagar    = _perfil?.nivel === 'administrador';

  const porGrupo = {};
  lista.forEach(c => {
    if (!porGrupo[c.grupo]) porGrupo[c.grupo] = [];
    porGrupo[c.grupo].push(c);
  });

  container.innerHTML = Object.keys(porGrupo).sort().map(g => {
    const cats = porGrupo[g];
    return `
    <div class="grupo">
      <div class="grupo-header" data-toggle-grupo="${g}">
        <span class="grupo-tog" id="tog-${g}">▼</span>
        <span class="grupo-cod">${g}.x</span>
        <span class="grupo-nome">${GRUPOS[g] || g}</span>
        <span class="grupo-count">${cats.length}</span>
      </div>
      <div class="grupo-body" id="body-${g}">
        <div class="tbl-wrap">
          <table>
            <thead><tr>
              <th style="width:90px">Código</th>
              <th>Descrição</th>
              <th style="width:130px">Centro de Custo</th>
              <th style="width:200px">Exemplo prático</th>
              <th style="width:70px">Status</th>
              ${podeAdicionar ? '<th style="width:100px">Ações</th>' : ''}
            </tr></thead>
            <tbody>
              ${cats.map(c => _linhaHTML(c, podeAdicionar, podeApagar)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join('');

  // Delegação de eventos
  container.querySelectorAll('[data-toggle-grupo]').forEach(h =>
    h.addEventListener('click', () => _toggleGrupo(h.dataset.toggleGrupo))
  );
  container.querySelectorAll('[data-toggle-ativa]').forEach(btn =>
    btn.addEventListener('click', () => _toggleAtiva(btn.dataset.toggleAtiva))
  );
  container.querySelectorAll('[data-apagar]').forEach(btn =>
    btn.addEventListener('click', () => _apagar(btn.dataset.apagar))
  );
}

function _linhaHTML(c, podeAdicionar, podeApagar) {
  const ccCls = CC_CLASSES[c.cc] || '';
  const acoes = podeAdicionar ? `<td>
    <div class="td-acoes">
      ${podeApagar ? `<button class="btn btn-del" data-apagar="${c.id}" title="Apagar">✕</button>` : ''}
      <button class="btn btn-tog" data-toggle-ativa="${c.id}" title="${c.ativa ? 'Desativar' : 'Ativar'}">
        ${c.ativa ? '⊘' : '✓'}
      </button>
    </div>
  </td>` : '';

  return `<tr class="${c.ativa ? '' : 'inativa'}">
    <td class="td-cod">${c.id}</td>
    <td class="td-desc">${c.desc}</td>
    <td><span class="td-cc ${ccCls}">${c.cc}</span></td>
    <td class="td-ex">${c.ex || '—'}</td>
    <td><span class="${c.ativa ? 'tag-ativa' : 'tag-inativa'}">${c.ativa ? 'Ativa' : 'Inativa'}</span></td>
    ${acoes}
  </tr>`;
}

function _toggleGrupo(g) {
  const body = document.getElementById('body-' + g);
  const tog  = document.getElementById('tog-' + g);
  if (!body) return;
  const aberto = body.style.display !== 'none';
  body.style.display = aberto ? 'none' : 'block';
  tog?.classList.toggle('fechado', aberto);
}

async function _toggleAtiva(id) {
  const cat = _plano.find(c => c.id === id);
  if (!cat) return;
  await toggleCategoriaAtiva(id, !cat.ativa);
  cat.ativa = !cat.ativa;
  _filtrar();
}

async function _apagar(id) {
  if (_perfil?.nivel !== 'administrador') return;
  if (!confirm(`Apagar a categoria ${id}?\n\nEsta ação não pode ser desfeita.`)) return;
  await deletarCategoria(id);
  _plano = _plano.filter(c => c.id !== id);
  _filtrar();
}

// ── Modal ────────────────────────────────────────
function _abrirModal() {
  ['f-cod','f-desc','f-ex'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('f-cc').value    = 'CC-CLI-xxx';
  document.getElementById('f-grupo').value = '3';
  document.getElementById('f-tipo').value  = 'despesa';
  esconderMsg('msg-modal');
  document.getElementById('modal-overlay').classList.add('aberto');
}

function _fecharModal() {
  document.getElementById('modal-overlay').classList.remove('aberto');
}

async function _salvarCategoria() {
  const cod  = document.getElementById('f-cod').value.trim().toLowerCase();
  const desc = document.getElementById('f-desc').value.trim();
  const cc   = document.getElementById('f-cc').value;
  const grupo= document.getElementById('f-grupo').value;
  const tipo = document.getElementById('f-tipo').value;
  const ex   = document.getElementById('f-ex').value.trim();

  if (!cod || !desc) {
    mostrarMsg('msg-modal', 'erro', 'Preencha código e descrição.');
    return;
  }
  if (_plano.find(c => c.id === cod)) {
    mostrarMsg('msg-modal', 'erro', `Código ${cod} já existe no plano de contas.`);
    return;
  }

  const nova = { id: cod, grupo, desc, cc, tipo, ex, ativa: true };
  try {
    await salvarCategoria(nova);
    _plano.push(nova);
    _plano.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    _fecharModal();
    _filtrar();
  } catch (err) {
    mostrarMsg('msg-modal', 'erro', 'Erro ao salvar: ' + err.message);
  }
}
