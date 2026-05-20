import { carregarLancamentos, deletarLancamento } from '../db.js';
import { fmtMfull, fmtData } from '../utils.js';

const GRUPOS = {
  '1': '1.x — Receita',
  '2': '2.x — Retenções',
  '3': '3.x — Custos Diretos',
  '4': '4.x — Despesas ADM',
  '5': '5.x — Financeiro',
  '6': '6.x — CAPEX',
};

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

let _lancamentos = [];  // todos do ano selecionado
let _filtrados   = [];  // após aplicar filtros
let _perfil      = null;
let _anoAtual    = new Date().getFullYear();
let _ordenacao   = { campo: 'data', asc: false };

export async function mount(container, perfil) {
  _perfil    = perfil;
  _anoAtual  = new Date().getFullYear();
  _ordenacao = { campo: 'data', asc: false };
  container.innerHTML = _html();
  _bindFiltros();
  await _carregar();
}

export function destroy() {
  _lancamentos = [];
  _filtrados   = [];
}

// ── HTML ──────────────────────────────────────────
function _html() {
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

  return `
<div class="page" style="max-width:1300px">
  <div class="page-header">
    <div>
      <div class="page-title">Base de Dados</div>
      <div class="page-sub">Todos os lançamentos · Receitas e Despesas · Retenções</div>
    </div>
    <div class="header-right">
      <span class="badge-total" id="badge-total">— lançamentos</span>
    </div>
  </div>

  <!-- KPI CARDS -->
  <div class="kpi-grid" id="kpi-grid" style="margin-bottom:16px"></div>

  <!-- FILTROS -->
  <div class="bd-filtros">
    <input class="filtro-input" type="text" id="bd-busca"
      placeholder="Buscar por doc, categoria, CC, fornecedor..." style="min-width:240px;flex:1">

    <select class="filtro-input" id="bd-tipo">
      <option value="">Todos os tipos</option>
      <option value="Receita">Receitas</option>
      <option value="Gasto">Gastos</option>
    </select>

    <select class="filtro-input" id="bd-mes">
      <option value="">Todos os meses</option>
      ${MESES.map((m, i) => `<option value="${m}">${m}</option>`).join('')}
    </select>

    <select class="filtro-input" id="bd-ano">
      ${anos.map(a => `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`).join('')}
    </select>

    <select class="filtro-input" id="bd-grupo">
      <option value="">Todos os grupos</option>
      ${Object.entries(GRUPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
    </select>

    <select class="filtro-input" id="bd-cc">
      <option value="">Todos os CCs</option>
    </select>
  </div>

  <!-- TABELA -->
  <div class="tbl-wrap">
    <div class="tbl-scroll" style="min-width:900px">
      <table id="bd-table">
        <thead>
          <tr>
            <th data-sort="tipo"     style="width:80px">Tipo</th>
            <th data-sort="data"     style="width:90px">Data</th>
            <th data-sort="categoria" style="min-width:200px">Categoria</th>
            <th data-sort="cc"        style="width:130px">CC</th>
            <th data-sort="formaPgto" style="width:110px">Forma Pgto</th>
            <th data-sort="valor"     style="width:130px;text-align:right">Valor</th>
            <th style="min-width:140px">Info / Fornecedor</th>
            <th data-sort="nrDoc"    style="width:110px">Nº Doc</th>
            <th data-sort="contrato" style="width:110px">Contrato</th>
            <th style="width:44px"></th>
          </tr>
        </thead>
        <tbody id="bd-tbody"></tbody>
        <tfoot id="bd-tfoot"></tfoot>
      </table>
    </div>
  </div>

  <!-- LOADING / VAZIO -->
  <div id="bd-loading" class="bd-loading">
    <div class="spinner" style="display:block;width:20px;height:20px;margin:0 auto 8px"></div>
    <div style="font-size:11px;color:var(--mu);font-weight:600">Carregando lançamentos...</div>
  </div>
</div>`;
}

// ── Carregar ──────────────────────────────────────
async function _carregar() {
  _setLoading(true);
  try {
    _lancamentos = await carregarLancamentos(_anoAtual);
    _populaCCFiltro();
    _filtrar();
  } catch (err) {
    _setLoading(false);
    document.getElementById('bd-tbody').innerHTML = `
      <tr><td colspan="10" style="text-align:center;padding:24px;color:var(--vermelho);font-size:11px;font-weight:600">
        Erro ao carregar dados: ${err.message}
      </td></tr>`;
  }
}

function _populaCCFiltro() {
  const ccs   = [...new Set(_lancamentos.map(l => l.cc).filter(Boolean))].sort();
  const sel   = document.getElementById('bd-cc');
  const atual = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  ccs.forEach(cc => {
    const o = document.createElement('option');
    o.value = cc; o.textContent = cc;
    sel.appendChild(o);
  });
  if (atual) sel.value = atual;
}

// ── Bind ──────────────────────────────────────────
function _bindFiltros() {
  ['bd-busca','bd-tipo','bd-mes','bd-grupo','bd-cc'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', _filtrar)
  );
  ['bd-tipo','bd-mes','bd-grupo','bd-cc'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', _filtrar)
  );
  document.getElementById('bd-ano')?.addEventListener('change', async () => {
    _anoAtual = +document.getElementById('bd-ano').value;
    await _carregar();
  });

  document.getElementById('bd-table')?.querySelector('thead')?.addEventListener('click', e => {
    const th = e.target.closest('[data-sort]');
    if (th) _ordenar(th.dataset.sort);
  });
}

// ── Filtrar ───────────────────────────────────────
function _filtrar() {
  const busca  = (document.getElementById('bd-busca')?.value  || '').toLowerCase();
  const tipo   = document.getElementById('bd-tipo')?.value  || '';
  const mes    = document.getElementById('bd-mes')?.value   || '';
  const grupo  = document.getElementById('bd-grupo')?.value || '';
  const cc     = document.getElementById('bd-cc')?.value    || '';

  _filtrados = _lancamentos.filter(l => {
    if (tipo  && l.tipo  !== tipo)  return false;
    if (mes   && l.mes   !== mes)   return false;
    if (cc    && l.cc    !== cc)    return false;
    if (grupo && !(l.categoria || '').startsWith(grupo + '.')) return false;
    if (busca) {
      const campos = [l.nrDoc, l.categoria, l.categoriaDesc, l.cc,
                      l.contrato, l.formaPgto, l.info, l.fornecedor].join(' ').toLowerCase();
      if (!campos.includes(busca)) return false;
    }
    return true;
  });

  _ordenarLista();
  _renderTabela();
  _renderKPIs();
}

// ── Ordenação ─────────────────────────────────────
function _ordenar(campo) {
  if (_ordenacao.campo === campo) _ordenacao.asc = !_ordenacao.asc;
  else { _ordenacao.campo = campo; _ordenacao.asc = campo !== 'data'; }
  _ordenarLista();
  _renderTabela();
  _renderKPIs();
}

function _ordenarLista() {
  const { campo, asc } = _ordenacao;
  _filtrados.sort((a, b) => {
    let va = a[campo] ?? '';
    let vb = b[campo] ?? '';
    if (campo === 'valor') { va = a.valor ?? 0; vb = b.valor ?? 0; }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });
}

// ── Render Tabela ─────────────────────────────────
function _renderTabela() {
  _setLoading(false);

  const tbody  = document.getElementById('bd-tbody');
  const tfoot  = document.getElementById('bd-tfoot');
  const badge  = document.getElementById('badge-total');
  const podeApagar = _perfil?.nivel === 'administrador';

  badge.textContent = _filtrados.length + ' lançamentos';

  if (!_filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="10">
      <div class="empty" style="padding:32px">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">Nenhum lançamento encontrado</div>
        <div style="font-size:11px">Ajuste os filtros ou selecione outro período</div>
      </div>
    </td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = _filtrados.map(l => {
    const isReceita  = l.tipo === 'Receita';
    const valorAbs   = Math.abs(l.valor || 0);
    const catCurta   = (l.categoriaDesc || l.categoria || '—').replace(/^\d+\.\d+\.\d+\s*—\s*/, '');
    const infoTexto  = [l.info, l.fornecedor].filter(Boolean).join(' · ') || '—';

    return `<tr>
      <td><span class="bd-tipo-tag ${isReceita ? 'bd-receita' : 'bd-gasto'}">${l.tipo}</span></td>
      <td class="bd-data">${fmtData(l.data)}</td>
      <td class="bd-categoria" title="${l.categoriaDesc || ''}">
        <span class="bd-cat-cod">${l.categoria || '—'}</span>
        <span class="bd-cat-desc">${catCurta}</span>
      </td>
      <td><span class="td-cc">${l.cc || '—'}</span></td>
      <td class="bd-forma">${l.formaPgto || '—'}</td>
      <td class="bd-valor ${isReceita ? 'bd-valor-r' : 'bd-valor-d'}" style="text-align:right">
        ${isReceita ? '+' : '−'} ${fmtMfull(valorAbs)}
      </td>
      <td class="bd-info" title="${infoTexto}">${infoTexto}</td>
      <td class="bd-doc">${l.nrDoc || '—'}</td>
      <td class="bd-contrato">${l.contrato || '—'}</td>
      <td style="text-align:center">
        ${podeApagar
          ? `<button class="btn btn-del" data-del="${l.id}" title="Apagar lançamento">✕</button>`
          : ''}
      </td>
    </tr>`;
  }).join('');

  // Totais no rodapé
  const totReceita = _filtrados.filter(l => l.tipo === 'Receita').reduce((s, l) => s + (l.valor || 0), 0);
  const totGasto   = _filtrados.filter(l => l.tipo === 'Gasto').reduce((s, l) => s + Math.abs(l.valor || 0), 0);
  const saldo      = totReceita - totGasto;

  tfoot.innerHTML = `
    <tr class="bd-tfoot-row">
      <td colspan="5" style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mu)">
        TOTAIS DO FILTRO
      </td>
      <td style="text-align:right">
        <div style="font-size:10px;color:var(--verde);font-weight:700">↑ ${fmtMfull(totReceita)}</div>
        <div style="font-size:10px;color:var(--vermelho);font-weight:700">↓ ${fmtMfull(totGasto)}</div>
        <div style="font-size:11px;font-weight:800;color:${saldo >= 0 ? 'var(--verde)' : 'var(--vermelho)'};border-top:1px solid var(--bd);padding-top:3px;margin-top:2px">
          = ${saldo >= 0 ? '+' : '−'} ${fmtMfull(Math.abs(saldo))}
        </div>
      </td>
      <td colspan="4"></td>
    </tr>`;

  // Bind delete buttons
  tbody.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => _deletar(btn.dataset.del))
  );
}

// ── KPIs ──────────────────────────────────────────
function _renderKPIs() {
  const receitas = _filtrados.filter(l => l.tipo === 'Receita');
  const gastos   = _filtrados.filter(l => l.tipo === 'Gasto');

  const totReceita = receitas.reduce((s, l) => s + (l.valor || 0), 0);
  const totGasto   = gastos.reduce((s, l) => s + Math.abs(l.valor || 0), 0);
  const saldo      = totReceita - totGasto;

  // Detalhamento por grupo de gastos
  const custosDiretos = gastos.filter(l => (l.categoria || '').startsWith('3.')).reduce((s, l) => s + Math.abs(l.valor || 0), 0);
  const despesasAdm   = gastos.filter(l => (l.categoria || '').startsWith('4.')).reduce((s, l) => s + Math.abs(l.valor || 0), 0);
  const retencoes     = gastos.filter(l => (l.categoria || '').startsWith('2.')).reduce((s, l) => s + Math.abs(l.valor || 0), 0);
  const margem        = totReceita > 0 ? (totReceita - custosDiretos) / totReceita * 100 : 0;

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card destaque">
      <div class="kpi-label">Receita bruta</div>
      <div class="kpi-valor" style="color:var(--verde)">${fmtMfull(totReceita)}</div>
      <div class="kpi-sub">${receitas.length} lançamentos de entrada</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total de gastos</div>
      <div class="kpi-valor" style="color:var(--vermelho)">${fmtMfull(totGasto)}</div>
      <div class="kpi-sub">${gastos.length} lançamentos de saída</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Saldo líquido</div>
      <div class="kpi-valor" style="color:${saldo >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">
        ${saldo >= 0 ? '+' : ''}${fmtMfull(saldo)}
      </div>
      <div class="kpi-sub">Receita − Gastos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Custos diretos (3.x)</div>
      <div class="kpi-valor" style="font-size:16px">${fmtMfull(custosDiretos)}</div>
      <div class="kpi-sub">ADM: ${fmtMfull(despesasAdm)} · Ret: ${fmtMfull(retencoes)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Margem bruta estimada</div>
      <div class="kpi-valor" style="color:${margem >= 35 ? 'var(--verde)' : margem >= 20 ? 'var(--ambm)' : 'var(--vermelho)'}">
        ${totReceita > 0 ? margem.toFixed(1) + '%' : '—'}
      </div>
      <div class="kpi-sub">Meta: &gt;35% por contrato</div>
    </div>`;
}

// ── Deletar ───────────────────────────────────────
async function _deletar(id) {
  if (_perfil?.nivel !== 'administrador') return;
  const lanc = _lancamentos.find(l => l.id === id);
  const desc = lanc ? `${lanc.tipo} · ${fmtData(lanc.data)} · ${fmtMfull(Math.abs(lanc.valor || 0))}` : id;
  if (!confirm(`Apagar lançamento?\n\n${desc}\n\nEsta ação não pode ser desfeita.`)) return;

  try {
    await deletarLancamento(id);
    _lancamentos = _lancamentos.filter(l => l.id !== id);
    _filtrar();
  } catch (err) {
    alert('Erro ao apagar: ' + err.message);
  }
}

// ── Helpers ───────────────────────────────────────
function _setLoading(on) {
  const loading = document.getElementById('bd-loading');
  const wrap    = document.querySelector('.tbl-wrap');
  if (loading) loading.style.display = on ? 'block' : 'none';
  if (wrap)    wrap.style.display    = on ? 'none'  : '';
}
