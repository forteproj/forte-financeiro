import { carregarContratos, atualizarContrato, deletarContrato } from '../db.js';
import { fmtM, fmtMfull, fmtData, tipoIconeArquivo, statusLabel } from '../utils.js';

let _contratos = [];
let _contratoAberto = null;
let _ordenacao = { campo: 'cliente', asc: true };
let _perfil = null;

export async function mount(container, perfil) {
  _perfil = perfil;
  _ordenacao = { campo: 'cliente', asc: true };
  container.innerHTML = _html(perfil);
  try {
    _contratos = await carregarContratos();
  } catch {
    _contratos = [];
  }
  _bindFiltros();
  _bindModal();
  _renderKPIs();
  _renderBanner();
  _renderTabela();
}

export function destroy() {
  _contratoAberto = null;
}

// ── HTML ─────────────────────────────────────────
function _html(perfil) {
  const podeEditar = perfil?.nivel !== 'operacao';
  return `
<div class="page">
  <div class="page-header">
    <div>
      <div class="page-title">Contratos</div>
      <div class="page-sub">Painel de acompanhamento · Semáforo · Execução · Margens</div>
    </div>
    <div class="header-right">
      ${podeEditar ? '<button class="btn-add" id="btn-novo-contrato">+ Novo Contrato</button>' : ''}
    </div>
  </div>

  <div class="kpi-grid" id="kpi-grid"></div>

  <div class="banner-alertas" id="banner-alertas">
    <div class="banner-titulo">
      ⚠ Contratos com execução elevada
      <span class="banner-count" id="banner-count">0</span>
    </div>
    <div class="banner-lista" id="banner-lista"></div>
  </div>

  <div class="filtros">
    <input class="filtro-input" type="text" id="f-busca"
      placeholder="Buscar cliente ou nº contrato..." style="min-width:220px">
    <select class="filtro-input" id="f-status">
      <option value="">Todos os status</option>
      <option value="ativo">Ativo</option>
      <option value="encerrado">Encerrado</option>
    </select>
    <div class="semaforo-leg">
      <span class="sem-item"><span class="sem sem-verde"></span>Em dia</span>
      <span class="sem-item"><span class="sem sem-amarelo"></span>Atenção</span>
      <span class="sem-item"><span class="sem sem-vermelho"></span>Crítico</span>
    </div>
  </div>

  <div class="tbl-wrap">
    <div class="tbl-scroll">
      <table>
        <thead>
          <tr>
            <th style="width:16px"></th>
            <th data-sort="cliente" style="cursor:pointer">Cliente</th>
            <th data-sort="numContrato" style="cursor:pointer">Nº Contrato</th>
            <th data-sort="ccCodigo" style="cursor:pointer">CC</th>
            <th data-sort="valorTotal" style="cursor:pointer">Valor Total</th>
            <th data-sort="valorExecutado" style="cursor:pointer">Executado</th>
            <th data-sort="saldo" style="cursor:pointer">Saldo</th>
            <th>Execução</th>
            <th data-sort="margem" style="cursor:pointer">Margem</th>
            <th data-sort="fim" style="cursor:pointer">Vigência</th>
            <th data-sort="status" style="cursor:pointer">Status</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- MODAL DETALHE -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal-box" style="max-width:700px">
    <div class="modal-header">
      <div>
        <div class="modal-titulo" id="m-titulo">—</div>
        <div style="font-size:11px;color:var(--mu);margin-top:2px;font-weight:600" id="m-subtitulo">—</div>
      </div>
      <button class="btn-fechar" id="btn-fechar-modal">✕</button>
    </div>
    <div class="modal-body">
      <div class="progresso-wrap">
        <div class="progresso-titulo">Execução financeira</div>
        <div class="progresso-linha">
          <span class="progresso-nome">Valor total</span>
          <span class="progresso-val" id="m-valor-total">—</span>
        </div>
        <div class="progresso-linha">
          <span class="progresso-nome">Executado / medido</span>
          <span class="progresso-val" id="m-executado">—</span>
        </div>
        <div class="progresso-linha">
          <span class="progresso-nome">Faturado (NFS-e emitidas)</span>
          <span class="progresso-val" id="m-faturado">—</span>
        </div>
        <div class="progresso-linha">
          <span class="progresso-nome">Recebido</span>
          <span class="progresso-val" id="m-recebido" style="color:var(--verde)">—</span>
        </div>
        <div class="progresso-linha">
          <span class="progresso-nome">Saldo disponível</span>
          <span class="progresso-val" id="m-saldo" style="color:var(--amb)">—</span>
        </div>
        <div class="barra-grande">
          <div class="barra-grande-fill" id="m-barra" style="width:0%"></div>
        </div>
        <div class="progresso-linha">
          <span class="progresso-nome">Custos diretos lançados</span>
          <span class="progresso-val" id="m-custos">—</span>
        </div>
        <div class="progresso-linha">
          <span class="progresso-nome" style="font-weight:800;color:var(--tx)">Margem bruta</span>
          <span class="progresso-val" id="m-margem" style="font-size:14px;color:var(--verde)">—</span>
        </div>
      </div>
      <div class="detalhe-grid">
        <div class="detalhe-item">
          <div class="detalhe-label">Centro de Custo</div>
          <div class="detalhe-valor destaque" id="m-cc">—</div>
        </div>
        <div class="detalhe-item">
          <div class="detalhe-label">Nº Contrato</div>
          <div class="detalhe-valor" id="m-num">—</div>
        </div>
        <div class="detalhe-item">
          <div class="detalhe-label">Vigência</div>
          <div class="detalhe-valor" id="m-vigencia">—</div>
        </div>
        <div class="detalhe-item">
          <div class="detalhe-label">Prazo de Pagamento</div>
          <div class="detalhe-valor" id="m-prazo">—</div>
        </div>
        <div class="detalhe-item">
          <div class="detalhe-label">Tipo</div>
          <div class="detalhe-valor" id="m-tipo">—</div>
        </div>
        <div class="detalhe-item">
          <div class="detalhe-label">Cadastrado por</div>
          <div class="detalhe-valor" id="m-cad">—</div>
        </div>
      </div>
      <!-- RETENÇÕES -->
      <div class="detalhe-item" style="margin-bottom:12px">
        <div class="detalhe-label" style="margin-bottom:6px">Retenções na fonte cadastradas</div>
        <div id="m-retencoes" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>

      <div class="detalhe-item" style="margin-bottom:12px">
        <div class="detalhe-label">Contato fiscal / financeiro</div>
        <div class="detalhe-valor" id="m-contato" style="font-size:12px;font-weight:600">—</div>
      </div>
      <div class="detalhe-item" style="margin-bottom:12px">
        <div class="detalhe-label">Objeto contratual</div>
        <div class="detalhe-valor" id="m-objeto" style="font-size:11px;font-weight:500;line-height:1.5;color:var(--txs)">—</div>
      </div>
      <div>
        <div class="detalhe-label" style="margin-bottom:4px">Documentos anexados</div>
        <div id="m-docs"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-encerrar" id="btn-encerrar" style="display:none">Encerrar contrato</button>
      <button class="btn-encerrar" id="btn-editar"   style="display:none;background:var(--azul);color:#fff;border-color:var(--azul)">Editar</button>
      <button class="btn-encerrar" id="btn-excluir"  style="display:none;background:var(--vermelho);color:#fff;border-color:var(--vermelho)">Excluir</button>
      <span style="margin-left:auto;font-size:10px;font-weight:700;color:var(--mu)" id="m-id">—</span>
    </div>
  </div>
</div>`;
}

// ── Bind ─────────────────────────────────────────
function _bindFiltros() {
  document.getElementById('f-busca')?.addEventListener('input', _renderTabela);
  document.getElementById('f-status')?.addEventListener('change', _renderTabela);
  document.getElementById('btn-novo-contrato')?.addEventListener('click',
    () => window.app.navigate('lancar-contrato'));

  document.querySelectorAll('thead th[data-sort]').forEach(th =>
    th.addEventListener('click', () => _ordenar(th.dataset.sort))
  );
}

function _bindModal() {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('btn-fechar-modal')?.addEventListener('click', _fecharModal);
  document.getElementById('btn-encerrar')?.addEventListener('click', _encerrarContrato);
  document.getElementById('btn-editar')?.addEventListener('click', _editarContrato);
  document.getElementById('btn-excluir')?.addEventListener('click', _excluirContrato);
  overlay?.addEventListener('click', e => { if (e.target === overlay) _fecharModal(); });
}

// ── KPIs ─────────────────────────────────────────
function _renderKPIs() {
  const ativos = _contratos.filter(c => c.status === 'ativo');
  const carteira  = _contratos.reduce((s, c) => s + c.valorTotal, 0);
  const executado = _contratos.reduce((s, c) => s + (c.valorExecutado || 0), 0);
  const saldo     = carteira - executado;
  const recebido  = _contratos.reduce((s, c) => s + (c.valorRecebido || 0), 0);
  const custos    = _contratos.reduce((s, c) => s + (c.custosDiretos || 0), 0);
  const margem    = executado > 0 ? (executado - custos) / executado * 100 : 0;

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card destaque">
      <div class="kpi-label">Carteira total</div>
      <div class="kpi-valor">${fmtM(carteira)}</div>
      <div class="kpi-sub">${_contratos.length} contratos · ${ativos.length} ativos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Saldo a executar</div>
      <div class="kpi-valor">${fmtM(saldo)}</div>
      <div class="kpi-sub">${carteira > 0 ? ((saldo / carteira) * 100).toFixed(1) : 0}% do total</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Receita acumulada</div>
      <div class="kpi-valor" style="color:var(--verde)">${fmtM(executado)}</div>
      <div class="kpi-sub">Recebido: ${fmtM(recebido)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Margem bruta média</div>
      <div class="kpi-valor" style="color:${margem >= 35 ? 'var(--verde)' : margem >= 20 ? 'var(--ambm)' : 'var(--vermelho)'}">${margem.toFixed(1)}%</div>
      <div class="kpi-sub">Meta: &gt;35%</div>
    </div>`;
}

// ── Banner ────────────────────────────────────────
function _renderBanner() {
  const alertas = _contratos
    .filter(c => c.status === 'ativo' && c.valorTotal > 0)
    .map(c => ({ ...c, pct: (c.valorExecutado || 0) / c.valorTotal * 100, saldo: c.valorTotal - (c.valorExecutado || 0) }))
    .filter(c => c.pct >= 75)
    .sort((a, b) => b.pct - a.pct);

  const banner = document.getElementById('banner-alertas');
  if (!alertas.length) { banner.classList.remove('visivel'); return; }

  banner.classList.add('visivel');
  document.getElementById('banner-count').textContent = alertas.length;
  document.getElementById('banner-lista').innerHTML = alertas.map(c => {
    const critico = c.pct >= 90;
    return `<div class="banner-item ${critico ? 'critico' : ''}" data-open-id="${c.id}">
      <span class="banner-icon">${critico ? '🔴' : '🟡'}</span>
      <span class="banner-nome">${c.cliente}</span>
      <span class="banner-num">${c.numContrato}</span>
      <span class="banner-pct ${critico ? 'critico' : 'alerta'}">${c.pct.toFixed(1)}% executado</span>
      <span class="banner-saldo">Saldo: ${fmtMfull(c.saldo)}</span>
    </div>`;
  }).join('');

  document.querySelectorAll('[data-open-id]').forEach(el =>
    el.addEventListener('click', () => _abrirModal(el.dataset.openId))
  );
}

// ── Tabela ────────────────────────────────────────
function _renderTabela() {
  const busca  = (document.getElementById('f-busca')?.value || '').toLowerCase();
  const status = document.getElementById('f-status')?.value || '';

  let lista = _contratos.filter(c => {
    if (status && c.status !== status) return false;
    if (busca) return c.cliente.toLowerCase().includes(busca) || c.numContrato.toLowerCase().includes(busca);
    return true;
  });

  lista.sort((a, b) => {
    let va = a[_ordenacao.campo] ?? '';
    let vb = b[_ordenacao.campo] ?? '';
    if (_ordenacao.campo === 'saldo') { va = a.valorTotal - (a.valorExecutado || 0); vb = b.valorTotal - (b.valorExecutado || 0); }
    if (_ordenacao.campo === 'margem') {
      va = a.valorExecutado > 0 ? (a.valorExecutado - (a.custosDiretos || 0)) / a.valorExecutado : 0;
      vb = b.valorExecutado > 0 ? (b.valorExecutado - (b.custosDiretos || 0)) / b.valorExecutado : 0;
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return _ordenacao.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const tbody = document.getElementById('tbody');
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">Nenhum contrato encontrado</div>
      <div style="font-size:12px">Ajuste os filtros ou cadastre um novo contrato</div>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(c => {
    const sem    = _calcSemaforo(c);
    const saldo  = c.valorTotal - (c.valorExecutado || 0);
    const pct    = c.valorTotal > 0 ? (c.valorExecutado || 0) / c.valorTotal * 100 : 0;
    const custos = c.custosDiretos || 0;
    const margem = c.valorExecutado > 0 ? (c.valorExecutado - custos) / c.valorExecutado * 100 : null;
    const fillCls = pct < 50 ? 'baixo' : pct < 80 ? 'medio' : 'alto';
    const hoje = new Date();
    const fim  = new Date(c.fim);
    const diasFim = Math.floor((fim - hoje) / 86400000);
    const fimCor = diasFim < 30 ? 'color:var(--vermelho)' : diasFim < 90 ? 'color:var(--amarelo)' : '';
    const linhaCls = pct >= 90 ? 'linha-critico' : pct >= 75 ? 'linha-alerta' : '';
    const avisoIcon = pct >= 90
      ? ' <span style="color:var(--vermelho);font-size:11px" title="Execução crítica ≥ 90%">⚠</span>'
      : pct >= 75
        ? ' <span style="color:var(--amarelo);font-size:11px" title="Execução ≥ 75%">⚠</span>'
        : '';

    return `<tr class="${linhaCls}" data-open-id="${c.id}" style="cursor:pointer">
      <td><span class="sem sem-${sem}"></span></td>
      <td class="td-cliente">${c.cliente}${avisoIcon}</td>
      <td class="td-num">${c.numContrato}</td>
      <td><span class="td-cc">${c.ccCodigo}</span></td>
      <td class="td-valor">${fmtM(c.valorTotal)}</td>
      <td class="td-valor receita">${fmtM(c.valorExecutado || 0)}</td>
      <td class="td-valor">${fmtM(saldo)}</td>
      <td>
        <div class="exec-wrap">
          <div class="exec-bar"><div class="exec-fill ${fillCls}" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>
          <span class="exec-pct">${pct.toFixed(1)}%</span>
        </div>
      </td>
      <td class="td-pct" style="color:${margem === null ? 'var(--mu)' : margem >= 35 ? 'var(--verde)' : margem >= 20 ? 'var(--ambm)' : 'var(--vermelho)'}">
        ${margem === null ? '—' : margem.toFixed(1) + '%'}
      </td>
      <td style="font-size:11px;${fimCor}">${fmtData(c.fim)}</td>
      <td><span class="tag-status tag-${c.status}">${statusLabel(c.status)}</span></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-open-id]').forEach(tr =>
    tr.addEventListener('click', () => _abrirModal(tr.dataset.openId))
  );
}

function _ordenar(campo) {
  if (_ordenacao.campo === campo) _ordenacao.asc = !_ordenacao.asc;
  else { _ordenacao.campo = campo; _ordenacao.asc = true; }
  _renderTabela();
}

// ── Semáforo ──────────────────────────────────────
function _calcSemaforo(c) {
  if (c.status !== 'ativo') return 'azul';
  const hoje    = new Date();
  const fim     = new Date(c.fim);
  const diasFim = Math.floor((fim - hoje) / 86400000);
  const pct     = c.valorTotal > 0 ? (c.valorExecutado || 0) / c.valorTotal * 100 : 0;
  if (c.valorFaturado > 0 && (c.valorRecebido || 0) < c.valorFaturado * 0.5) return 'vermelho';
  if (pct >= 90) return 'vermelho';
  if (pct >= 75) return 'amarelo';
  if (diasFim < 30) return 'amarelo';
  return 'verde';
}

// ── Modal ─────────────────────────────────────────
function _abrirModal(id) {
  const c = _contratos.find(x => x.id === id);
  if (!c) return;
  _contratoAberto = c;

  const custos = c.custosDiretos || 0;
  const margem = c.valorExecutado > 0 ? (c.valorExecutado - custos) / c.valorExecutado * 100 : 0;
  const pct    = c.valorTotal > 0 ? Math.min((c.valorExecutado || 0) / c.valorTotal * 100, 100) : 0;
  const saldo  = c.valorTotal - (c.valorExecutado || 0);

  document.getElementById('m-titulo').textContent    = c.cliente;
  document.getElementById('m-subtitulo').textContent = c.numContrato + ' · ' + c.ccCodigo;
  document.getElementById('m-valor-total').textContent = fmtMfull(c.valorTotal);
  document.getElementById('m-executado').textContent   = fmtMfull(c.valorExecutado || 0);
  document.getElementById('m-faturado').textContent    = fmtMfull(c.valorFaturado || 0);
  document.getElementById('m-recebido').textContent    = fmtMfull(c.valorRecebido || 0);
  document.getElementById('m-saldo').textContent       = fmtMfull(saldo);
  document.getElementById('m-custos').textContent      = fmtMfull(custos);

  const barra = document.getElementById('m-barra');
  barra.style.width      = pct.toFixed(1) + '%';
  barra.style.background = pct < 50 ? 'var(--verde)' : pct < 80 ? 'var(--ambm)' : 'var(--vermelho)';

  document.getElementById('m-margem').textContent = margem.toFixed(1) + '%';
  document.getElementById('m-margem').style.color = margem >= 35 ? 'var(--verde)' : margem >= 20 ? 'var(--ambm)' : 'var(--vermelho)';
  document.getElementById('m-cc').textContent       = c.ccCodigo;
  document.getElementById('m-num').textContent      = c.numContrato;
  document.getElementById('m-vigencia').textContent = fmtData(c.inicio) + ' → ' + fmtData(c.fim);
  document.getElementById('m-prazo').textContent    = 'D+' + (c.prazo || 60) + ' dias';
  document.getElementById('m-tipo').textContent     = _tipoLabel(c.tipo);

  const cadEm = c.cadastradoEm?.toDate ? fmtData(c.cadastradoEm.toDate().toISOString().split('T')[0]) : fmtData((c.cadastradoEm || '').split('T')[0]);
  document.getElementById('m-cad').textContent = (c.cadastradoPor || '—') + ' · ' + cadEm;

  const cont = c.contato;
  document.getElementById('m-contato').innerHTML = cont?.nome
    ? `${cont.nome} · ${cont.cargo}<br><span style="color:var(--amb)">${cont.email}</span> · ${cont.tel}`
    : '—';

  document.getElementById('m-objeto').textContent = c.objeto || '—';

  const docs = c.documentos || [];
  document.getElementById('m-docs').innerHTML = docs.length
    ? `<div style="display:flex;flex-direction:column;gap:5px;margin-top:8px">${docs.map(d => `
        <div style="display:flex;align-items:center;gap:8px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--raio);padding:7px 10px;font-size:11px">
          <span>${tipoIconeArquivo(d.nome)}</span>
          <span style="flex:1;font-weight:600">${d.nome}</span>
          <span style="color:var(--mu)">${d.size ? (d.size / 1024).toFixed(0) + ' KB' : ''}</span>
        </div>`).join('')}</div>`
    : '<div style="font-size:11px;color:var(--mu);font-style:italic;padding:8px 0">Nenhum documento anexado</div>';

  document.getElementById('m-id').textContent = 'ID: ' + c.id;

  // Retenções
  const ret        = c.retencoes || {};
  const issPercMO  = ret.issPercMO  ?? c.percMO ?? 100;
  const inssPercMO = ret.inssPercMO ?? c.percMO ?? 100;
  const retTags = [
    { label: 'ISS',      val: ret.iss,    cor: 'var(--vermelho)', sufixo: '%' },
    ...(ret.iss  > 0 ? [{ label: 'MO-ISS',  val: issPercMO,  cor: 'var(--amb)', sufixo: '%' }] : []),
    { label: 'INSS',     val: ret.inss,   cor: 'var(--vermelho)', sufixo: '%' },
    ...(ret.inss > 0 ? [{ label: 'MO-INSS', val: inssPercMO, cor: 'var(--amb)', sufixo: '%' }] : []),
    { label: 'IRRF',     val: ret.irrf,   cor: 'var(--vermelho)', sufixo: '%' },
    { label: 'PCC',      val: ret.pcc,    cor: 'var(--vermelho)', sufixo: '%' },
    { label: 'ICMS',     val: ret.icms,   cor: 'var(--vermelho)', sufixo: '%' },
  ];
  document.getElementById('m-retencoes').innerHTML = retTags.map(t => {
    const v = parseFloat(t.val) || 0;
    return `<span style="
      display:inline-flex;align-items:center;gap:4px;
      background:var(--sf2);border:1px solid var(--bd);
      border-radius:3px;padding:3px 8px;font-size:10px;font-weight:700">
      <span style="color:var(--mu)">${t.label}</span>
      <span style="color:${v > 0 ? t.cor : 'var(--mu)'}">${v > 0 ? v + t.sufixo : '—'}</span>
    </span>`;
  }).join('');

  const isAdmin    = _perfil?.nivel === 'administrador';
  const podeEditar = _perfil?.nivel !== 'operacao';
  document.getElementById('btn-encerrar').style.display = podeEditar && c.status === 'ativo' ? '' : 'none';
  document.getElementById('btn-editar').style.display   = isAdmin ? '' : 'none';
  document.getElementById('btn-excluir').style.display  = isAdmin ? '' : 'none';

  document.getElementById('modal-overlay').classList.add('aberto');
}

function _fecharModal() {
  document.getElementById('modal-overlay').classList.remove('aberto');
  _contratoAberto = null;
}

async function _encerrarContrato() {
  if (!_contratoAberto || _perfil?.nivel === 'operacao') return;
  if (!confirm('Encerrar o contrato ' + _contratoAberto.numContrato + '?')) return;
  const hoje       = new Date();
  const encerradoEm = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  await atualizarContrato(_contratoAberto.id, { status: 'encerrado', encerradoEm });
  const idx = _contratos.findIndex(c => c.id === _contratoAberto.id);
  if (idx >= 0) { _contratos[idx].status = 'encerrado'; _contratos[idx].encerradoEm = encerradoEm; }
  _fecharModal();
  _renderKPIs();
  _renderBanner();
  _renderTabela();
}

function _editarContrato() {
  if (!_contratoAberto || _perfil?.nivel !== 'administrador') return;
  const id = _contratoAberto.id;
  _fecharModal();
  window.app.navigate('lancar-contrato/' + id);
}

async function _excluirContrato() {
  if (!_contratoAberto || _perfil?.nivel !== 'administrador') return;
  const c = _contratoAberto;
  if (!confirm(
    `Excluir permanentemente o contrato?\n\n${c.numContrato} — ${c.cliente}\n\nEsta ação não pode ser desfeita.`
  )) return;
  try {
    await deletarContrato(c.id);
    _contratos = _contratos.filter(x => x.id !== c.id);
    _fecharModal();
    _renderKPIs();
    _renderBanner();
    _renderTabela();
  } catch (err) {
    alert('Erro ao excluir: ' + err.message);
  }
}

function _tipoLabel(t) {
  return { municipal: 'Municipal', estadual: 'Estadual', federal: 'Federal', privado: 'Privado' }[t] || t || '—';
}
