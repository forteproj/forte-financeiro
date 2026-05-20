import {
  carregarPlanoContas, carregarContratos,
  salvarLancamento, carregarLancamentosRecentes, contarLancamentos,
} from '../db.js';
import {
  formatarValorInput, parseMoeda, fmtMfull, fmtData, mesNome,
  mostrarMsg, esconderMsg, msgHTML,
} from '../utils.js';

const GRUPOS_DESC = {
  '2': '2.x — Retenções',
  '3': '3.x — Custos Diretos',
  '4': '4.x — ADM',
  '5': '5.x — Financeiro',
  '6': '6.x — CAPEX',
};

let _perfil    = null;
let _contratos = [];

export async function mount(container, perfil) {
  _perfil = perfil;
  container.innerHTML = _html();
  _setHoje();

  try {
    const [plano, contratos] = await Promise.all([
      carregarPlanoContas(),
      carregarContratos(),
    ]);
    _contratos = contratos;
    _preencherCategorias(plano);
    _preencherCCs(contratos);
    _preencherContratos(contratos);
  } catch {
    mostrarMsg('msg-feedback', 'erro', 'Erro ao carregar dados. Recarregue a página.');
  }

  _bindEventos();
  _renderHistorico();
  _atualizarContador();
}

export function destroy() {}

// ── HTML ──────────────────────────────────────────
function _html() {
  return `
<div class="page">
  <div class="page-header">
    <div class="page-title vermelho">Lançar Despesa</div>
    <div class="page-sub">Saídas · Custos diretos · ADM · CAPEX · Retenções</div>
  </div>

  ${msgHTML('msg-feedback')}

  <div class="form-card">

    <!-- 1. IDENTIFICAÇÃO -->
    <div class="form-section">
      <div class="section-titulo">Identificação</div>
      <div class="row row-3">
        <div class="campo">
          <label>Data do pagamento <span style="color:var(--vermelho)">*</span></label>
          <input type="date" id="f-data">
        </div>
        <div class="campo">
          <label>Nº Documento <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-doc" placeholder="NF-1234, BOL-001, DARF...">
        </div>
        <div class="campo">
          <label>Forma de pagamento <span style="color:var(--vermelho)">*</span></label>
          <select id="f-forma">
            <option value="">Selecione...</option>
            <option>Boleto</option>
            <option>Transferência</option>
            <option>Pix</option>
            <option>Cartão</option>
            <option>Débito Auto</option>
            <option>DARF</option>
            <option>GRU</option>
            <option>Rateio</option>
            <option>Retenção</option>
            <option>Outro</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 2. CLASSIFICAÇÃO -->
    <div class="form-section">
      <div class="section-titulo">Classificação contábil</div>
      <div class="row row-2">
        <div class="campo">
          <label>Categoria — Plano de Contas <span style="color:var(--vermelho)">*</span></label>
          <select id="f-categoria">
            <option value="">Selecione a categoria...</option>
          </select>
        </div>
        <div class="campo">
          <label>Centro de Custo <span style="color:var(--vermelho)">*</span></label>
          <select id="f-cc">
            <option value="">Selecione o CC...</option>
          </select>
        </div>
      </div>

      <div class="cc-info" id="cc-info">
        <div class="cc-info-item">
          <div class="cc-info-label">Contrato</div>
          <div class="cc-info-valor" id="cc-info-contrato">—</div>
        </div>
        <div class="cc-info-item">
          <div class="cc-info-label">Cliente</div>
          <div class="cc-info-valor" id="cc-info-cliente">—</div>
        </div>
        <div class="cc-info-item">
          <div class="cc-info-label">Saldo disponível</div>
          <div class="cc-info-valor" id="cc-info-saldo">—</div>
        </div>
        <div class="cc-info-item">
          <div class="cc-info-label">Vigência</div>
          <div class="cc-info-valor" id="cc-info-vigencia">—</div>
        </div>
      </div>

      <div class="regra-box" id="regra-desempate">
        <div class="regra-box-titulo">⚠ Regra de desempate</div>
        <p>Você selecionou <code>CC-ADM-01</code>. Confirme: esse gasto é da <strong>sede/escritório central</strong>?<br>
        Se for exclusivo de uma obra → altere para o <code>CC-CLI-xxx</code> correspondente.</p>
      </div>

      <div class="campo" style="margin-top:4px">
        <label>Contrato vinculado</label>
        <select id="f-contrato">
          <option value="">— sem vínculo de contrato —</option>
        </select>
        <div class="campo-hint">Obrigatório quando CC for CC-CLI-xxx</div>
      </div>
    </div>

    <!-- 3. VALOR -->
    <div class="form-section">
      <div class="section-titulo">Valor</div>
      <div class="row row-3">
        <div class="campo">
          <label>Valor (R$) <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-valor" placeholder="0,00">
        </div>
        <div class="campo">
          <label>Fornecedor / Beneficiário</label>
          <input type="text" id="f-fornecedor" placeholder="Nome do fornecedor">
        </div>
        <div class="campo">
          <label>Informações adicionais</label>
          <input type="text" id="f-info" placeholder="Descrição complementar">
        </div>
      </div>
    </div>

    <div class="form-footer">
      <button class="btn-salvar" id="btn-salvar">
        <div class="spinner" id="spinner" style="display:none"></div>
        <span id="btn-txt">✓ Lançar Despesa</span>
      </button>
      <button class="btn-limpar" id="btn-limpar">Limpar</button>
      <span id="contador-bd" style="font-size:10px;font-weight:700;color:var(--mu);background:var(--sf2);border:1px solid var(--bd);border-radius:2px;padding:3px 8px">0 despesas</span>
      <button class="btn-nav" id="btn-ir-receita" style="margin-left:auto">Lançar Receita →</button>
    </div>
  </div>

  <!-- HISTÓRICO -->
  <div class="historico">
    <div class="historico-titulo">Últimos lançamentos — despesas</div>
    <div class="historico-lista" id="historico-lista"></div>
  </div>
</div>`;
}

// ── Preencher selects ─────────────────────────────
function _preencherCategorias(plano) {
  const sel = document.getElementById('f-categoria');
  const categorias = plano.filter(c => c.ativa && c.tipo !== 'receita');
  const porGrupo = {};
  categorias.forEach(c => {
    if (!porGrupo[c.grupo]) porGrupo[c.grupo] = [];
    porGrupo[c.grupo].push(c);
  });
  Object.keys(porGrupo).sort().forEach(g => {
    const og = document.createElement('optgroup');
    og.label = GRUPOS_DESC[g] || g;
    porGrupo[g].forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.id + ' — ' + c.desc;
      o.dataset.cc = c.cc;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
}

function _preencherCCs(contratos) {
  const sel = document.getElementById('f-cc');
  [
    { valor: 'CC-ADM-01', label: 'CC-ADM-01 — Administrativo' },
    { valor: 'CC-ADM-02', label: 'CC-ADM-02 — Folha Operacional' },
    { valor: 'CC-ADM-03', label: 'CC-ADM-03 — CAPEX' },
  ].forEach(f => {
    const o = document.createElement('option');
    o.value = f.valor; o.textContent = f.label;
    sel.appendChild(o);
  });
  const og = document.createElement('optgroup');
  og.label = 'CC Clientes / Obras';
  contratos.filter(c => c.status !== 'encerrado').forEach(c => {
    const o = document.createElement('option');
    o.value = c.ccCodigo;
    o.textContent = c.ccCodigo + ' — ' + c.cliente;
    o.dataset.contratoNum = c.numContrato;
    og.appendChild(o);
  });
  sel.appendChild(og);
}

function _preencherContratos(contratos) {
  const sel = document.getElementById('f-contrato');
  contratos.filter(c => c.status !== 'encerrado').forEach(c => {
    const o = document.createElement('option');
    o.value = c.numContrato;
    o.textContent = c.numContrato + ' — ' + c.cliente;
    o.dataset.ccCodigo = c.ccCodigo;
    sel.appendChild(o);
  });
}

// ── Bind ──────────────────────────────────────────
function _bindEventos() {
  document.getElementById('f-categoria').addEventListener('change', _onCategoria);
  document.getElementById('f-cc').addEventListener('change', _onCC);
  document.getElementById('f-valor').addEventListener('input', e => formatarValorInput(e.target));
  document.getElementById('btn-salvar').addEventListener('click', _salvar);
  document.getElementById('btn-limpar').addEventListener('click', _limpar);
  document.getElementById('btn-ir-receita').addEventListener('click', () => window.app.navigate('lancar-receita'));
}

function _onCategoria() {
  const sel = document.getElementById('f-categoria');
  const opt = sel.options[sel.selectedIndex];
  if (!opt?.value) return;
  const ccPadrao = opt.dataset.cc;
  const ccAtual  = document.getElementById('f-cc').value;
  if (!ccAtual && ccPadrao && ccPadrao !== 'CC-CLI-xxx') {
    document.getElementById('f-cc').value = ccPadrao;
    _onCC();
  }
}

function _onCC() {
  const cc    = document.getElementById('f-cc').value;
  const info  = document.getElementById('cc-info');
  const regra = document.getElementById('regra-desempate');

  regra.classList.toggle('visivel', cc === 'CC-ADM-01');

  if (cc.startsWith('CC-CLI-')) {
    const contrato = _contratos.find(c => c.ccCodigo === cc);
    if (contrato) {
      info.classList.add('visivel');
      document.getElementById('cc-info-contrato').textContent = contrato.numContrato;
      document.getElementById('cc-info-cliente').textContent  = contrato.cliente;
      const saldo = contrato.valorTotal - (contrato.valorExecutado || 0);
      document.getElementById('cc-info-saldo').textContent    = fmtMfull(saldo);
      document.getElementById('cc-info-vigencia').textContent = fmtData(contrato.inicio) + ' → ' + fmtData(contrato.fim);
      document.getElementById('f-contrato').value = contrato.numContrato;
    }
  } else {
    info.classList.remove('visivel');
    if (['CC-ADM-01', 'CC-ADM-02', 'CC-ADM-03'].includes(cc)) {
      document.getElementById('f-contrato').value = '';
    }
  }
}

// ── Salvar ────────────────────────────────────────
async function _salvar() {
  esconderMsg('msg-feedback');
  if (!_validar()) return;
  _setLoading(true);

  try {
    const data  = document.getElementById('f-data').value;
    const d     = new Date(data + 'T12:00:00');
    const selCat = document.getElementById('f-categoria');
    const catDesc = selCat.options[selCat.selectedIndex]?.text || '';

    await salvarLancamento({
      tipo:          'Gasto',
      data,
      mes:           mesNome(data),
      ano:           d.getFullYear(),
      categoria:     document.getElementById('f-categoria').value,
      categoriaDesc: catDesc,
      cc:            document.getElementById('f-cc').value,
      formaPgto:     document.getElementById('f-forma').value,
      valor:         -Math.abs(parseMoeda(document.getElementById('f-valor').value)),
      fornecedor:    document.getElementById('f-fornecedor').value.trim(),
      info:          document.getElementById('f-info').value.trim(),
      nrDoc:         document.getElementById('f-doc').value.trim(),
      contrato:      document.getElementById('f-contrato').value,
      lancadoPor:    _perfil?.nome || 'Sistema',
    });

    mostrarMsg('msg-feedback', 'sucesso',
      `Despesa lançada: ${catDesc.split('—').slice(1).join('—').trim() || catDesc} · ${fmtMfull(parseMoeda(document.getElementById('f-valor').value))} · ${document.getElementById('f-cc').value}`);
    _limpar();
    _renderHistorico();
    _atualizarContador();
  } catch (err) {
    mostrarMsg('msg-feedback', 'erro', 'Erro ao salvar: ' + err.message);
  } finally {
    _setLoading(false);
  }
}

function _validar() {
  const campos = [
    { id: 'f-data',      label: 'Data' },
    { id: 'f-doc',       label: 'Nº Documento' },
    { id: 'f-forma',     label: 'Forma de pagamento' },
    { id: 'f-categoria', label: 'Categoria' },
    { id: 'f-cc',        label: 'Centro de Custo' },
    { id: 'f-valor',     label: 'Valor' },
  ];
  for (const c of campos) {
    const el = document.getElementById(c.id);
    if (!el.value.trim()) {
      el.classList.add('erro');
      setTimeout(() => el.classList.remove('erro'), 2500);
      mostrarMsg('msg-feedback', 'erro', 'Campo obrigatório: ' + c.label);
      el.focus();
      return false;
    }
  }
  const cc = document.getElementById('f-cc').value;
  if (cc.startsWith('CC-CLI-') && !document.getElementById('f-contrato').value) {
    mostrarMsg('msg-feedback', 'erro', 'Selecione o contrato vinculado ao centro de custo ' + cc + '.');
    return false;
  }
  return true;
}

function _setLoading(on) {
  document.getElementById('btn-salvar').disabled = on;
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('btn-txt').textContent = on ? 'Salvando...' : '✓ Lançar Despesa';
}

function _setHoje() {
  const el = document.getElementById('f-data');
  if (el) el.value = new Date().toISOString().split('T')[0];
}

function _limpar() {
  _setHoje();
  ['f-doc', 'f-fornecedor', 'f-info', 'f-valor'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('f-forma').value     = '';
  document.getElementById('f-categoria').value = '';
  document.getElementById('f-cc').value        = '';
  document.getElementById('f-contrato').value  = '';
  document.getElementById('cc-info').classList.remove('visivel');
  document.getElementById('regra-desempate').classList.remove('visivel');
  esconderMsg('msg-feedback');
}

// ── Histórico ─────────────────────────────────────
async function _renderHistorico() {
  const lista = document.getElementById('historico-lista');
  if (!lista) return;
  try {
    const despesas = await carregarLancamentosRecentes('Gasto', 8);
    if (!despesas.length) {
      lista.innerHTML = '<div class="hist-vazio">Nenhuma despesa lançada ainda.</div>';
      return;
    }
    lista.innerHTML = despesas.map(l => `
      <div class="historico-item">
        <span class="hist-data">${fmtData(l.data)}</span>
        <span class="hist-cat">${(l.categoriaDesc || l.categoria).split('—').slice(1).join('—').trim() || l.categoria}</span>
        <span class="hist-cc">${l.cc}</span>
        <span class="hist-valor-d">${fmtMfull(Math.abs(l.valor))}</span>
      </div>`).join('');
  } catch {
    lista.innerHTML = '<div class="hist-vazio">Erro ao carregar histórico.</div>';
  }
}

async function _atualizarContador() {
  try {
    const n = await contarLancamentos('Gasto');
    const el = document.getElementById('contador-bd');
    if (el) el.textContent = n + (n === 1 ? ' despesa' : ' despesas');
  } catch {}
}
