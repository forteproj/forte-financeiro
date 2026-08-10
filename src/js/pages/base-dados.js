import { carregarLancamentos, deletarLancamento, atualizarLancamento, atualizarContrato, buscarContratoPorNum, increment } from '../db.js';
import { fmtMfull, fmtData, mesNome } from '../utils.js';

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

const _hoje = new Date().toISOString().split('T')[0];

let _lancamentos  = [];
let _filtrados    = [];
let _perfil       = null;
let _anoAtual     = new Date().getFullYear();
let _ordenacao    = { campo: 'data', asc: false };
let _painelAberto = null;
let _cacheAnos    = new Map(); // ano -> lancamentos[] (evita recarregar anos já buscados)

// 'realizado' | 'pendente' | 'atrasado'
function _calcStatus(l) {
  if (l.confirmadoEm || l.statusPagamento === 'realizado') return 'realizado';
  const dataRef = l.dataRenegociacao || l.data;
  return dataRef < _hoje ? 'atrasado' : 'pendente';
}

export async function mount(container, perfil) {
  _perfil       = perfil;
  _anoAtual     = new Date().getFullYear();
  _ordenacao    = { campo: 'data', asc: false };
  _painelAberto = null;
  _cacheAnos    = new Map();
  container.innerHTML = _html();
  _bindFiltros();
  await _carregar();
}

export function destroy() {
  _lancamentos  = [];
  _filtrados    = [];
  _painelAberto = null;
  _cacheAnos    = new Map();
}

// ── HTML ──────────────────────────────────────────
function _html() {
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

  return `
<div class="page" style="max-width:1300px">
  <div class="bd-sticky-top">
    <div class="page-header">
      <div>
        <div class="page-title">Base de Dados</div>
        <div class="page-sub">Todos os lançamentos · Receitas e Despesas · Retenções</div>
      </div>
      <div class="header-right">
        <button class="btn-imprimir" id="bd-btn-imprimir" title="Imprimir relatório com os filtros atuais">🖨 Imprimir</button>
        <span class="badge-total" id="badge-total">— lançamentos</span>
      </div>
    </div>

    <!-- KPI CARDS -->
    <div class="kpi-grid" id="kpi-grid" style="margin-bottom:16px"></div>

    <!-- FILTROS -->
    <div class="bd-filtros">
      <input class="filtro-input" type="text" id="bd-busca"
        placeholder="Buscar por doc, categoria, CC, fornecedor..." style="min-width:200px;flex:1">

      <select class="filtro-input" id="bd-status">
        <option value="">Todos os status</option>
        <option value="atrasado">Atrasados</option>
        <option value="pendente">Pendentes</option>
        <option value="realizado">Realizados</option>
      </select>

      <select class="filtro-input" id="bd-tipo">
        <option value="">Todos os tipos</option>
        <option value="Receita">Receitas</option>
        <option value="Gasto">Gastos</option>
      </select>

      <select class="filtro-input" id="bd-mes">
        <option value="">Todos os meses</option>
        ${MESES.map(m => `<option value="${m}">${m}</option>`).join('')}
      </select>

      <select class="filtro-input" id="bd-ano">
        ${anos.map(a => `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`).join('')}
      </select>

      <span style="font-size:10px;color:var(--mu);font-weight:700">Período:</span>
      <input class="filtro-input" type="date" id="bd-data-de" title="Filtrar a partir desta data" style="max-width:132px">
      <span style="font-size:10px;color:var(--mu);font-weight:700">até</span>
      <input class="filtro-input" type="date" id="bd-data-ate" title="Filtrar até esta data" style="max-width:132px">
      <button id="bd-periodo-limpar" style="display:none;padding:5px 10px;font-size:10px;font-weight:800;border:1px solid var(--bd);background:var(--sf);border-radius:var(--raio);cursor:pointer;color:var(--mu);white-space:nowrap;line-height:1">× Limpar período</button>

      <select class="filtro-input" id="bd-grupo">
        <option value="">Todos os grupos</option>
        ${Object.entries(GRUPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>

      <select class="filtro-input" id="bd-cc">
        <option value="">Todos os CCs</option>
      </select>
    </div>
  </div>

  <!-- RESUMO (visível apenas na impressão) -->
  <div class="bd-print-resumo" id="bd-print-resumo"></div>

  <!-- TABELA -->
  <div class="tbl-wrap">
    <div class="tbl-scroll" style="min-width:900px">
      <table id="bd-table">
        <thead>
          <tr>
            <th data-sort="tipo"      style="width:80px">Tipo</th>
            <th data-sort="data"      style="width:100px">Data</th>
            <th data-sort="categoria" style="min-width:200px">Categoria</th>
            <th data-sort="cc"        style="width:130px">CC</th>
            <th data-sort="formaPgto" style="width:110px">Forma Pgto</th>
            <th data-sort="valor"     style="width:130px;text-align:right">Valor</th>
            <th style="min-width:140px">Info / Fornecedor</th>
            <th data-sort="nrDoc"     style="width:110px">Nº Doc</th>
            <th data-sort="contrato"  style="width:110px">Contrato</th>
            <th style="width:70px"></th>
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
async function _carregarAno(ano) {
  if (!_cacheAnos.has(ano)) {
    _cacheAnos.set(ano, await carregarLancamentos(ano));
  }
  return _cacheAnos.get(ano);
}

// Anos necessários: se houver período (De/Até) definido, cobre todos os anos
// entre as duas datas — permite ex.: última semana de julho + primeira de agosto,
// ou até um período que cruze a virada do ano. Sem período, usa só o ano selecionado.
function _anosNecessarios() {
  const dataDe  = document.getElementById('bd-data-de')?.value  || '';
  const dataAte = document.getElementById('bd-data-ate')?.value || '';
  if (!dataDe && !dataAte) return [_anoAtual];

  const anoIni = dataDe  ? +dataDe.slice(0, 4)  : +dataAte.slice(0, 4);
  const anoFim = dataAte ? +dataAte.slice(0, 4) : +dataDe.slice(0, 4);
  const anos = [];
  for (let a = Math.min(anoIni, anoFim); a <= Math.max(anoIni, anoFim); a++) anos.push(a);
  return anos;
}

async function _carregar() {
  _setLoading(true);
  try {
    const listas = await Promise.all(_anosNecessarios().map(_carregarAno));
    _lancamentos = listas.flat();
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
  ['bd-busca','bd-tipo','bd-grupo','bd-cc','bd-status'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', _filtrar)
  );
  ['bd-tipo','bd-grupo','bd-cc','bd-status'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', _filtrar)
  );

  // Mês é um atalho para "sem período definido" — escolher um mês limpa o período,
  // e vice-versa, pra não misturar os dois modos de filtro de data.
  document.getElementById('bd-mes')?.addEventListener('change', () => _limparPeriodo());

  document.getElementById('bd-data-de')?.addEventListener('change', async () => {
    _sincronizarLimitesPeriodo();
    document.getElementById('bd-mes').value = '';
    _atualizarBotaoLimparPeriodo();
    await _carregar();
  });
  document.getElementById('bd-data-ate')?.addEventListener('change', async () => {
    _sincronizarLimitesPeriodo();
    document.getElementById('bd-mes').value = '';
    _atualizarBotaoLimparPeriodo();
    await _carregar();
  });
  document.getElementById('bd-periodo-limpar')?.addEventListener('click', () => _limparPeriodo());

  document.getElementById('bd-ano')?.addEventListener('change', async () => {
    _anoAtual = +document.getElementById('bd-ano').value;
    await _carregar();
  });

  document.getElementById('bd-btn-imprimir')?.addEventListener('click', () => window.print());

  document.getElementById('bd-table')?.querySelector('thead')?.addEventListener('click', e => {
    const th = e.target.closest('[data-sort]');
    if (th) _ordenar(th.dataset.sort);
  });

  // Delegação para ações dentro do tbody (persiste após re-renders de innerHTML)
  document.getElementById('bd-tbody')?.addEventListener('click', e => {
    const btnConfPag = e.target.closest('.btn-confirmar-pag');
    if (btnConfPag) { _confirmarPagamento(btnConfPag.dataset.id); return; }

    const btnRev = e.target.closest('.btn-reverter-pag');
    if (btnRev) { _reverterPagamento(btnRev.dataset.id); return; }

    const btnAcao = e.target.closest('.btn-acao-atraso');
    if (btnAcao) { _togglePainel(btnAcao.dataset.id, btnAcao.dataset.tipo); return; }

    if (e.target.closest('.btn-fechar-painel')) { _fecharPainel(); return; }

    const btnConf = e.target.closest('.btn-confirmar-painel');
    if (btnConf) { _confirmarPainel(btnConf.dataset.id, btnConf.dataset.tipo); return; }

    const btnDel = e.target.closest('[data-del]');
    if (btnDel) { _deletar(btnDel.dataset.del); return; }

    const btnAnexo = e.target.closest('.btn-anexo-td');
    if (btnAnexo) { window.open(btnAnexo.dataset.url, '_blank', 'noopener'); return; }

    // Clique na linha → modo edição
    const rowTr = e.target.closest('tr[data-id]');
    if (rowTr && !e.target.closest('button')) {
      const id = rowTr.dataset.id;
      const l  = _lancamentos.find(x => x.id === id);
      if (l) window.app.navigate((l.tipo === 'Receita' ? 'lancar-receita' : 'lancar-despesa') + '/' + id);
    }
  });
}

// ── Filtrar ───────────────────────────────────────
function _filtrar() {
  const busca   = (document.getElementById('bd-busca')?.value  || '').toLowerCase();
  const tipo    = document.getElementById('bd-tipo')?.value   || '';
  const mes     = document.getElementById('bd-mes')?.value    || '';
  const dataDe  = document.getElementById('bd-data-de')?.value  || '';
  const dataAte = document.getElementById('bd-data-ate')?.value || '';
  const grupo   = document.getElementById('bd-grupo')?.value  || '';
  const cc      = document.getElementById('bd-cc')?.value     || '';
  const status  = document.getElementById('bd-status')?.value || '';
  const temPeriodo = !!(dataDe || dataAte);

  _filtrados = _lancamentos.filter(l => {
    const dataRef = l.dataRenegociacao || l.data;
    if (tipo    && l.tipo !== tipo) return false;
    if (temPeriodo) {
      if (dataDe  && dataRef < dataDe)  return false;
      if (dataAte && dataRef > dataAte) return false;
    } else if (mes && mesNome(dataRef) !== mes) {
      return false;
    }
    if (cc    && l.cc    !== cc)    return false;
    if (grupo && !(l.categoria || '').startsWith(grupo + '.')) return false;
    if (status && _calcStatus(l) !== status) return false;
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

// ── Período (De / Até) ─────────────────────────────
function _limparPeriodo() {
  document.getElementById('bd-data-de').value  = '';
  document.getElementById('bd-data-ate').value = '';
  document.getElementById('bd-data-de').removeAttribute('max');
  document.getElementById('bd-data-ate').removeAttribute('min');
  _atualizarBotaoLimparPeriodo();
  _carregar();
}

function _sincronizarLimitesPeriodo() {
  const de  = document.getElementById('bd-data-de');
  const ate = document.getElementById('bd-data-ate');
  if (de.value)  ate.min = de.value;  else ate.removeAttribute('min');
  if (ate.value) de.max  = ate.value; else de.removeAttribute('max');
}

function _atualizarBotaoLimparPeriodo() {
  const tem = !!(document.getElementById('bd-data-de')?.value || document.getElementById('bd-data-ate')?.value);
  const btn = document.getElementById('bd-periodo-limpar');
  if (btn) btn.style.display = tem ? '' : 'none';
  // Período, mês e ano são modos alternativos do mesmo filtro de data — mês e ano
  // ficam sem efeito enquanto um período estiver ativo, então desabilita ambos.
  const mesSel = document.getElementById('bd-mes');
  const anoSel = document.getElementById('bd-ano');
  if (mesSel) mesSel.disabled = tem;
  if (anoSel) anoSel.disabled = tem;
}

// Resumo textual dos filtros ativos — usado no cabeçalho impresso
function _resumoFiltros() {
  const dataDe  = document.getElementById('bd-data-de')?.value  || '';
  const dataAte = document.getElementById('bd-data-ate')?.value || '';
  const mesSel    = document.getElementById('bd-mes');
  const tipoSel   = document.getElementById('bd-tipo');
  const statusSel = document.getElementById('bd-status');
  const grupoSel  = document.getElementById('bd-grupo');
  const cc        = document.getElementById('bd-cc')?.value || '';
  const busca     = document.getElementById('bd-busca')?.value || '';

  const bits = [];
  if (dataDe || dataAte) {
    bits.push(`Período: ${dataDe ? fmtData(dataDe) : '—'} até ${dataAte ? fmtData(dataAte) : '—'}`);
  } else if (mesSel?.value) {
    bits.push(`Mês: ${mesSel.value} de ${_anoAtual}`);
  } else {
    bits.push(`Ano: ${_anoAtual}`);
  }
  if (tipoSel?.value)   bits.push(tipoSel.options[tipoSel.selectedIndex].text);
  if (statusSel?.value) bits.push(statusSel.options[statusSel.selectedIndex].text);
  if (grupoSel?.value)  bits.push(grupoSel.options[grupoSel.selectedIndex].text);
  if (cc)    bits.push('CC: ' + cc);
  if (busca) bits.push(`Busca: "${busca}"`);
  return bits.join(' · ');
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
  _painelAberto = null;

  const tbody      = document.getElementById('bd-tbody');
  const tfoot      = document.getElementById('bd-tfoot');
  const badge      = document.getElementById('badge-total');
  const podeApagar = _perfil?.nivel === 'administrador';
  const podeEditar = _perfil?.nivel !== 'operacao';

  badge.textContent = _filtrados.length + ' lançamentos';

  const resumoEl = document.getElementById('bd-print-resumo');
  if (resumoEl) {
    resumoEl.textContent = `FORTE SINALIZAÇÃO — BASE DE DADOS · ${_resumoFiltros()} · ` +
      `${_filtrados.length} lançamento${_filtrados.length === 1 ? '' : 's'} · ` +
      `gerado em ${new Date().toLocaleDateString('pt-BR')}`;
  }

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
    const isReceita = l.tipo === 'Receita';
    const status    = _calcStatus(l);
    const valorAbs  = Math.abs(l.valor || 0);
    const catCurta  = (l.categoriaDesc || l.categoria || '—').replace(/^\d+\.\d+\.\d+\s*—\s*/, '');
    const infoTexto = [l.info, l.fornecedor].filter(Boolean).join(' · ') || '—';

    // Data: realizado com data diferente da prevista → mostra data real + prevista abaixo
    //       atrasado com renegociação → mostra data renegociada + original abaixo
    const dataLinha = (status === 'realizado' && l.dataRecebimento && l.dataRecebimento !== l.data)
      ? `${fmtData(l.dataRecebimento)}<span style="display:block;font-size:9px;color:var(--mu)">prev: ${fmtData(l.data)}</span>`
      : (status === 'atrasado' && l.dataRenegociacao)
        ? `${fmtData(l.dataRenegociacao)}<span style="display:block;font-size:9px;color:var(--mu)">orig: ${fmtData(l.data)}</span>`
        : fmtData(l.data);

    const dataCor   = status === 'atrasado' ? 'color:var(--vermelho)' : status === 'pendente' ? 'color:var(--amb)' : '';

    // Badge de status no tipo
    const dataRef   = l.dataRenegociacao || l.data;
    const isHoje    = dataRef === _hoje;
    const badgeTxt  = status === 'atrasado' ? 'ATRASADO' : isHoje ? 'VENCE HOJE' : 'PENDENTE';
    const statusBadge = status !== 'realizado'
      ? `<div style="font-size:8px;font-weight:800;letter-spacing:.4px;margin-top:2px;color:${status === 'atrasado' ? 'var(--vermelho)' : 'var(--amb)'}">${badgeTxt}</div>`
      : '';

    // Botão confirmar pagamento/recebimento (pendente ou atrasado)
    const btnConfirmar = (status !== 'realizado' && podeEditar)
      ? `<button class="btn-confirmar-pag" data-id="${l.id}"
           style="display:block;width:100%;margin-bottom:4px;padding:3px 4px;font-size:9px;font-weight:800;cursor:pointer;border-radius:2px;border:1px solid var(--verde);background:transparent;color:var(--verde)">
           ✓ ${isReceita ? 'Recebido' : 'Pago'}
         </button>`
      : '';

    // Botão reverter confirmação (apenas realizados)
    const btnReverter = (status === 'realizado' && podeEditar)
      ? `<button class="btn-reverter-pag" data-id="${l.id}"
           style="display:block;width:100%;margin-bottom:4px;padding:3px 4px;font-size:9px;font-weight:800;cursor:pointer;border-radius:2px;border:1px solid var(--mu);background:transparent;color:var(--mu)">
           ↺ Reverter
         </button>`
      : '';

    // Botão reagendar/regularizar (apenas atrasados)
    const btnAcao = (status === 'atrasado' && podeEditar)
      ? `<button class="btn-acao-atraso" data-id="${l.id}" data-tipo="${l.tipo}"
           style="display:block;width:100%;margin-bottom:4px;padding:3px 4px;font-size:9px;font-weight:800;cursor:pointer;border-radius:2px;border:1px solid ${isReceita ? 'var(--verde)' : 'var(--amb)'};background:transparent;color:${isReceita ? 'var(--verde)' : 'var(--amb)'}">
           ${isReceita ? 'Regularizar' : 'Reagendar'}
         </button>`
      : '';

    const rowBg = status === 'atrasado'
      ? 'background:rgba(220,38,38,.04)'
      : status === 'pendente'
        ? 'background:rgba(201,146,0,.04)'
        : '';

    const rowStyle = [rowBg, 'cursor:pointer'].filter(Boolean).join(';');
    return `<tr data-id="${l.id}" style="${rowStyle}" title="Clique para editar">
      <td>
        <span class="bd-tipo-tag ${isReceita ? 'bd-receita' : 'bd-gasto'}">${l.tipo}</span>
        ${statusBadge}
      </td>
      <td class="bd-data" style="${dataCor}">${dataLinha}</td>
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
      <td class="bd-doc">
        ${l.nrDoc || '—'}
        ${l.anexoUrl ? `<button class="btn-anexo-td" data-url="${l.anexoUrl}" title="Ver anexo">📎 Anexo</button>` : ''}
      </td>
      <td class="bd-contrato">${l.contrato || '—'}</td>
      <td style="text-align:center">
        ${btnConfirmar}
        ${btnReverter}
        ${btnAcao}
        ${podeApagar ? `<button class="btn btn-del" data-del="${l.id}" title="Apagar">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  // Totais no rodapé
  const totReceita = _filtrados.filter(l => l.tipo === 'Receita').reduce((s, l) => s + (l.valor || 0), 0);
  const totGasto   = _filtrados.filter(l => l.tipo === 'Gasto').reduce((s, l) => s + Math.abs(l.valor || 0), 0);
  const saldo      = totReceita - totGasto;

  tfoot.innerHTML = `
    <tr class="bd-tfoot-row">
      <td colspan="5" style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mu)">TOTAIS DO FILTRO</td>
      <td style="text-align:right">
        <div style="font-size:10px;color:var(--verde);font-weight:700">↑ ${fmtMfull(totReceita)}</div>
        <div style="font-size:10px;color:var(--vermelho);font-weight:700">↓ ${fmtMfull(totGasto)}</div>
        <div style="font-size:11px;font-weight:800;color:${saldo >= 0 ? 'var(--verde)' : 'var(--vermelho)'};border-top:1px solid var(--bd);padding-top:3px;margin-top:2px">
          = ${saldo >= 0 ? '+' : '−'} ${fmtMfull(Math.abs(saldo))}
        </div>
      </td>
      <td colspan="4"></td>
    </tr>`;
}

// ── Painel inline Regularizar / Reagendar ─────────
function _togglePainel(id, tipo) {
  if (_painelAberto === id) { _fecharPainel(); return; }
  _fecharPainel();

  const l = _lancamentos.find(x => x.id === id);
  if (!l) return;
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;

  _painelAberto = id;
  const panelTr = document.createElement('tr');
  panelTr.id = `painel-row-${id}`;
  const td = document.createElement('td');
  td.colSpan = 10;
  td.style.padding = '0';
  td.innerHTML = _htmlPainel(l, tipo === 'Receita');
  panelTr.appendChild(td);
  row.insertAdjacentElement('afterend', panelTr);
}

function _fecharPainel() {
  if (_painelAberto) {
    document.getElementById(`painel-row-${_painelAberto}`)?.remove();
    _painelAberto = null;
  }
}

function _htmlPainel(l, isReceita) {
  const motivos = isReceita
    ? [['atraso_cliente','Atraso do cliente'],['negociacao','Em negociação'],['contestado','Contestado'],['outro','Outro']]
    : [['negociado_fornecedor','Negociado com fornecedor'],['aprovacao_pendente','Aprovação pendente'],['outro','Outro']];

  // Info sobre data original
  const previsaoOriginal = l.dataPrevistaOriginal
    ? `Previsão original: ${fmtData(l.dataPrevistaOriginal)}`
    : `Previsto originalmente em ${fmtData(l.data)}`;

  const cor = isReceita ? 'var(--verde)' : 'var(--amb)';
  const titulo = isReceita ? 'Regularizar recebimento' : 'Reagendar pagamento';
  const labelData = isReceita ? 'Nova previsão de recebimento' : 'Reagendar para';

  return `
    <div style="background:var(--sf);border-top:2px solid ${cor};padding:14px 18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:12px;font-weight:800;color:var(--tx)">${titulo}</div>
          <div style="font-size:10px;color:var(--mu);font-weight:600;margin-top:3px">${previsaoOriginal}</div>
        </div>
        <button class="btn-fechar-painel"
          style="background:none;border:none;font-size:14px;cursor:pointer;color:var(--mu);padding:2px 6px;line-height:1">✕</button>
      </div>
      <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--mu);margin-bottom:4px">${labelData} *</div>
          <input type="date" class="pan-nova-data" min="${_hoje}"
            style="padding:7px 10px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--raio);font-family:var(--fonte);font-size:12px;color:var(--tx);outline:none">
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--mu);margin-bottom:4px">Motivo *</div>
          <select class="pan-motivo"
            style="padding:7px 10px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--raio);font-family:var(--fonte);font-size:12px;color:var(--tx);outline:none">
            <option value="">Selecione...</option>
            ${motivos.map(([v, m]) => `<option value="${v}">${m}</option>`).join('')}
          </select>
        </div>
        <button class="btn-confirmar-painel" data-id="${l.id}" data-tipo="${l.tipo}"
          style="padding:7px 18px;background:${cor};color:${isReceita ? '#fff' : '#1E1C18'};border:none;border-radius:var(--raio);font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap">
          ✓ Confirmar
        </button>
        <span class="pan-msg" style="font-size:11px;font-weight:600;color:var(--vermelho)"></span>
      </div>
    </div>`;
}

async function _confirmarPainel(id, tipo) {
  const panelRow = document.getElementById(`painel-row-${id}`);
  if (!panelRow) return;

  const novaData = panelRow.querySelector('.pan-nova-data')?.value;
  const motivo   = panelRow.querySelector('.pan-motivo')?.value;
  const msgEl    = panelRow.querySelector('.pan-msg');
  const btnConf  = panelRow.querySelector('.btn-confirmar-painel');

  if (!novaData) { if (msgEl) msgEl.textContent = 'Informe a nova data.'; return; }
  if (!motivo)   { if (msgEl) msgEl.textContent = 'Selecione o motivo.'; return; }

  const l = _lancamentos.find(x => x.id === id);
  if (!l) return;

  const quem  = _perfil?.nome || 'Sistema';
  const agora = new Date().toISOString();
  let dados;

  if (tipo === 'Receita') {
    // Não sobrescreve data original — preserva histórico
    dados = {
      dataRenegociacao:     novaData,
      dataPrevistaOriginal: l.dataPrevistaOriginal || l.data,
      motivoAtraso:         motivo,
      regularizadoPor:      quem,
      regularizadoEm:       agora,
    };
  } else {
    // Sobrescreve data prevista
    const d = new Date(novaData + 'T12:00:00');
    dados = {
      data:          novaData,
      mes:           mesNome(novaData),
      ano:           d.getFullYear(),
      motivoAtraso:  motivo,
      reagendadoPor: quem,
      reagendadoEm:  agora,
    };
  }

  if (btnConf) { btnConf.disabled = true; btnConf.textContent = 'Salvando...'; }

  try {
    await atualizarLancamento(id, dados);
    Object.assign(l, dados);
    _fecharPainel();
    _filtrar();
  } catch (err) {
    if (msgEl) msgEl.textContent = 'Erro: ' + err.message;
    if (btnConf) { btnConf.disabled = false; btnConf.textContent = '✓ Confirmar'; }
  }
}

// ── KPIs ──────────────────────────────────────────
function _renderKPIs() {
  const receitas = _filtrados.filter(l => l.tipo === 'Receita');
  const gastos   = _filtrados.filter(l => l.tipo === 'Gasto');

  // Efetivados (confirmados)
  const recEfet      = receitas.filter(l => _calcStatus(l) === 'realizado');
  const totRecEfet   = recEfet.reduce((s, l) => s + (l.valor || 0), 0);

  // Total de despesas (todos os gastos, independente de status)
  const totDespTotal = gastos.reduce((s, l) => s + Math.abs(l.valor || 0), 0);

  // Previstos (pendente + atrasado)
  const recPrev      = receitas.filter(l => _calcStatus(l) !== 'realizado');
  const despPrev     = gastos.filter(l => _calcStatus(l) !== 'realizado');
  const totRecPrev   = recPrev.reduce((s, l) => s + (l.valor || 0), 0);
  const totDespPrev  = despPrev.reduce((s, l) => s + Math.abs(l.valor || 0), 0);

  const saldo = totRecEfet - totDespTotal;
  const pl = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card destaque">
      <div class="kpi-label">Receita Bruta</div>
      <div class="kpi-valor" style="color:var(--verde)">${fmtMfull(totRecEfet)}</div>
      <div class="kpi-sub">${pl(recEfet.length, 'entrada')} efetivada${recEfet.length === 1 ? '' : 's'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total de Despesas</div>
      <div class="kpi-valor" style="color:var(--vermelho)">${fmtMfull(totDespTotal)}</div>
      <div class="kpi-sub">${pl(gastos.length, 'saída')} no período</div>
    </div>
    <div class="kpi-card" style="${recPrev.length > 0 ? 'border-left:3px solid var(--amb)' : ''}">
      <div class="kpi-label">Receita a Receber</div>
      <div class="kpi-valor" style="color:${recPrev.length > 0 ? 'var(--amb)' : 'var(--mu)'}">
        ${totRecPrev > 0 ? fmtMfull(totRecPrev) : '—'}
      </div>
      <div class="kpi-sub">${pl(recPrev.length, 'lançamento')} pendente${recPrev.length === 1 ? '' : 's'}</div>
    </div>
    <div class="kpi-card" style="${despPrev.length > 0 ? 'border-left:3px solid var(--amb)' : ''}">
      <div class="kpi-label">Despesas a Pagar</div>
      <div class="kpi-valor" style="color:${despPrev.length > 0 ? 'var(--amb)' : 'var(--mu)'}">
        ${totDespPrev > 0 ? fmtMfull(totDespPrev) : '—'}
      </div>
      <div class="kpi-sub">${pl(despPrev.length, 'lançamento')} pendente${despPrev.length === 1 ? '' : 's'}</div>
    </div>
    <div class="kpi-card" style="${saldo < 0 ? 'border-left:3px solid var(--vermelho)' : 'border-left:3px solid var(--verde)'}">
      <div class="kpi-label">Saldo Líquido</div>
      <div class="kpi-valor" style="color:${saldo >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">
        ${saldo >= 0 ? '+' : '−'}${fmtMfull(Math.abs(saldo))}
      </div>
      <div class="kpi-sub">Receita efetivada − Total de despesas</div>
    </div>`;
}

// ── Confirmar pagamento / recebimento ─────────────
async function _confirmarPagamento(id) {
  const l = _lancamentos.find(x => x.id === id);
  if (!l) return;

  const hoje   = new Date().toISOString().split('T')[0];
  const isRec  = l.tipo === 'Receita';
  const titulo = isRec ? 'Confirmar recebimento' : 'Confirmar pagamento';
  const campo  = isRec ? 'Data real do recebimento' : 'Data real do pagamento';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:#fff;border:1px solid var(--bd);border-radius:10px;padding:28px 24px;width:340px;box-shadow:0 12px 40px rgba(0,0,0,.35)">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">${titulo}</div>
      <div style="font-size:12px;color:var(--mu);margin-bottom:18px">${fmtData(l.data)} · ${fmtMfull(Math.abs(l.valor||0))}</div>
      <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mu);display:block;margin-bottom:6px">${campo}</label>
      <input type="date" id="inp-conf-data" value="${hoje}"
        style="width:100%;border:1px solid var(--bd);border-radius:6px;padding:7px 10px;
               font-size:13px;font-family:var(--fonte);background:var(--bg);color:var(--texto);
               outline:none;margin-bottom:20px;box-sizing:border-box">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="btn-conf-cancelar"
          style="border:1px solid var(--bd);background:none;border-radius:6px;padding:7px 16px;font-size:12px;cursor:pointer;color:var(--texto)">
          Cancelar
        </button>
        <button id="btn-conf-ok"
          style="border:none;background:var(--verde);color:#fff;border-radius:6px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer">
          Confirmar
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('btn-conf-cancelar').addEventListener('click', () => overlay.remove());
  document.getElementById('btn-conf-ok').addEventListener('click', async () => {
    const dataRecebimento = document.getElementById('inp-conf-data').value || hoje;
    overlay.remove();

    const dados = {
      statusPagamento: 'realizado',
      confirmadoPor:   _perfil?.nome || 'Sistema',
      confirmadoEm:    new Date().toISOString(),
      dataRecebimento,
      ...(dataRecebimento !== l.data ? {
        mes: mesNome(dataRecebimento),
        ano: new Date(dataRecebimento + 'T12:00:00').getFullYear(),
      } : {}),
    };
    try {
      await atualizarLancamento(id, dados);
      Object.assign(l, dados);

      // Retenções retidas na fonte são pagas junto com a receita — confirma automaticamente
      if (isRec && l.nrDoc) {
        const retencoes = _lancamentos.filter(
          x => x.nrDoc === l.nrDoc && x.formaPgto === 'Retenção' && _calcStatus(x) !== 'realizado'
        );
        for (const r of retencoes) {
          await atualizarLancamento(r.id, dados);
          Object.assign(r, dados);
        }
      }

      // Atualiza valorRecebido no contrato quando receita é confirmada
      if (isRec && l.contrato) {
        try {
          const contrato = await buscarContratoPorNum(l.contrato);
          if (contrato?.id) {
            await atualizarContrato(contrato.id, { valorRecebido: increment(l.valor || 0) });
          }
        } catch {}
      }

      _fecharPainel();
      _filtrar();
    } catch (err) {
      alert('Erro ao confirmar: ' + err.message);
    }
  });
}

// ── Reverter confirmação de pagamento / recebimento ───────────────────────
async function _reverterPagamento(id) {
  const l = _lancamentos.find(x => x.id === id);
  if (!l) return;

  const isRec = l.tipo === 'Receita';
  if (!confirm(`Reverter confirmação?\n\n${l.tipo} · ${fmtData(l.data)} · ${fmtMfull(Math.abs(l.valor || 0))}\n\nO status voltará para pendente.`)) return;

  const dados = {
    statusPagamento: 'pendente',
    confirmadoPor:   null,
    confirmadoEm:    null,
    ...(isRec ? { dataRecebimento: null } : {}),
  };

  try {
    await atualizarLancamento(id, dados);
    Object.assign(l, dados);

    // Reverte retenções vinculadas à mesma NF
    if (isRec && l.nrDoc) {
      const retencoes = _lancamentos.filter(
        x => x.nrDoc === l.nrDoc && x.formaPgto === 'Retenção' && _calcStatus(x) === 'realizado'
      );
      for (const r of retencoes) {
        await atualizarLancamento(r.id, dados);
        Object.assign(r, dados);
      }
    }

    // Desconta do valorRecebido no contrato
    if (isRec && l.contrato) {
      try {
        const contrato = await buscarContratoPorNum(l.contrato);
        if (contrato?.id) {
          await atualizarContrato(contrato.id, { valorRecebido: increment(-(l.valor || 0)) });
        }
      } catch {}
    }

    _filtrar();
  } catch (err) {
    alert('Erro ao reverter: ' + err.message);
  }
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
