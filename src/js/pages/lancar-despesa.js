import {
  carregarPlanoContas, carregarContratos,
  salvarLancamento, carregarLancamentosRecentes, contarLancamentos,
  carregarFornecedores, salvarFornecedor,
  buscarLancamento, atualizarLancamento,
} from '../db.js';
import {
  formatarValorInput, parseMoeda, fmtMfull, fmtData, mesNome,
  mostrarMsg, esconderMsg, msgHTML,
} from '../utils.js';
import { anexoHTML, bindAnexo, uploadAnexo, showExistingAnexo } from '../upload-helper.js';

const GRUPOS_DESC = {
  '2': '2.x — Retenções',
  '3': '3.x — Custos Diretos',
  '4': '4.x — ADM',
  '5': '5.x — Financeiro',
  '6': '6.x — CAPEX',
};

const CAT_FORN_LABEL = {
  materiais:   'Materiais',
  servicos:    'Serviços',
  combustivel: 'Combustível',
  locacao:     'Locação',
  maodeobra:   'Mão de obra',
  financeiro:  'Financeiro',
  outro:       'Outro',
};

let _perfil       = null;
let _contratos    = [];
let _fornecedores = [];
let _plano        = [];
let _editId       = null;
let _anexo        = null;

export async function mount(container, perfil) {
  _perfil = perfil;
  _editId = null;
  const hashParts = window.location.hash.slice(1).split('/');
  if (hashParts[1]) _editId = hashParts[1];
  container.innerHTML = _html();
  _setHoje();

  try {
    const [plano, contratos, fornecedores] = await Promise.all([
      carregarPlanoContas(),
      carregarContratos(),
      carregarFornecedores(),
    ]);
    _contratos    = contratos;
    _fornecedores = fornecedores;
    _plano        = plano;
    _preencherCategorias(plano);
    _preencherCCs(contratos);
    _preencherContratos(contratos);
    _preencherFornecedores();
  } catch {
    mostrarMsg('msg-feedback', 'erro', 'Erro ao carregar dados. Recarregue a página.');
  }

  _bindEventos();
  _anexo = bindAnexo('des', (dados) => {
    if (dados.nNF && !document.getElementById('f-doc').value)
      document.getElementById('f-doc').value = dados.nNF;
    if (dados.vNF) {
      const el = document.getElementById('f-valor');
      el.value = dados.vNF.toFixed(2).replace('.', ',');
      formatarValorInput(el);
    }
  });
  _renderHistorico();
  _atualizarContador();
  if (_editId) await _carregarParaEdicao();
}

export function destroy() { _editId = null; _anexo = null; }

// ── HTML ──────────────────────────────────────────
function _html() {
  return `
<div class="page">
  <div class="page-header">
    <div class="page-title vermelho">Lançar Despesa</div>
    <div class="page-sub">Saídas · Custos diretos · ADM · CAPEX · Retenções</div>
  </div>

  <div id="edit-banner" style="display:none;background:rgba(201,146,0,.12);border:1px solid var(--amb);color:var(--tx);padding:10px 18px;border-radius:var(--raio);margin-bottom:14px;align-items:center;justify-content:space-between">
    <span style="font-size:12px;font-weight:800">✏ Editando lançamento existente</span>
    <button onclick="window.app.navigate('base-dados')" style="background:var(--amb);color:#1E1C18;border:none;border-radius:4px;padding:4px 14px;font-size:11px;font-weight:800;cursor:pointer">← Base de Dados</button>
  </div>

  ${msgHTML('msg-feedback')}

  <div class="form-card">

    <!-- 1. IDENTIFICAÇÃO -->
    <div class="form-section">
      <div class="section-titulo">Identificação</div>
      <div class="row row-4">
        <div class="campo">
          <label>Data de lançamento</label>
          <input type="date" id="f-data-lancamento">
        </div>
        <div class="campo">
          <label>Data prevista do pagamento <span style="color:var(--vermelho)">*</span></label>
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

    <!-- 2. VALOR E FORNECEDOR -->
    <div class="form-section">
      <div class="section-titulo">Valor e fornecedor</div>
      <div class="row row-3">
        <div class="campo">
          <label>Valor total (R$) <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-valor" placeholder="0,00">
        </div>
        <div class="campo">
          <label>Fornecedor / Beneficiário</label>
          <div style="display:flex;gap:6px;align-items:stretch">
            <select id="f-fornecedor" style="flex:1;min-width:0">
              <option value="">— sem fornecedor —</option>
            </select>
            <button type="button" id="btn-novo-forn"
              style="white-space:nowrap;padding:0 12px;background:var(--amb);color:#1E1C18;border:1px solid var(--amb);border-radius:var(--raio);font-size:11px;font-weight:800;cursor:pointer;flex-shrink:0">
              + Novo
            </button>
          </div>
        </div>
        <div class="campo">
          <label>Informações adicionais</label>
          <input type="text" id="f-info" placeholder="Descrição complementar">
        </div>
      </div>
      <div id="juros-row" style="margin-top:10px;display:flex;align-items:center;flex-wrap:wrap;gap:12px">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--txs);cursor:pointer">
          <input type="checkbox" id="toggle-juros" style="width:13px;height:13px">
          Pago com juros / multa
        </label>
        <div id="juros-fields" style="display:none;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="campo" style="max-width:170px;margin:0">
            <label>Valor dos juros (R$)</label>
            <input type="text" id="f-juros-valor" placeholder="0,00">
          </div>
          <span style="font-size:11px;color:var(--mu);padding-top:18px">→ 5.1.002 — Juros / Encargos Financeiros (automático)</span>
        </div>
      </div>
    </div>

    <!-- 3. PARCELAMENTO -->
    <div class="form-section">
      <div class="section-titulo">
        Parcelamento / Recorrência
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--txs);cursor:pointer;margin-left:8px;letter-spacing:0;text-transform:none">
          <input type="checkbox" id="toggle-recorrente" style="width:13px;height:13px">
          Lançamento parcelado
        </label>
      </div>
      <div id="recorrente-box" style="display:none">
        <div style="display:flex;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:14px">
          <div class="campo" style="max-width:160px;margin-bottom:0">
            <label>Número de parcelas</label>
            <input type="number" id="f-num-parcelas" value="2" min="2" max="120"
              style="width:100%;padding:8px 10px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--raio);font-family:var(--fonte);font-size:13px;font-weight:700;color:var(--tx);outline:none">
            <div class="campo-hint">Mín 2 · Máx 120</div>
          </div>
          <div class="campo" style="min-width:200px;margin-bottom:0">
            <label>Frequência</label>
            <select id="f-frequencia"
              style="width:100%;padding:8px 10px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--raio);font-family:var(--fonte);font-size:13px;font-weight:700;color:var(--tx);outline:none">
              <option value="30">Mensal (30 dias)</option>
              <option value="15">Quinzenal (15 dias)</option>
              <option value="7">Semanal (7 dias)</option>
              <option value="0">Manual</option>
            </select>
          </div>
          <div class="campo" id="campo-primeira-data" style="max-width:180px;margin-bottom:0">
            <label>Data da 1ª parcela</label>
            <input type="date" id="f-data-primeira"
              style="width:100%;padding:8px 10px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--raio);font-family:var(--fonte);font-size:13px;font-weight:700;color:var(--tx);outline:none">
          </div>
        </div>
        <div id="datas-parcelas"></div>
      </div>
    </div>

    <!-- 3. CLASSIFICAÇÃO -->
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
        <p>Você selecionou <code>CC-ADM-01-MATRIZ</code>. Confirme: esse gasto é da <strong>sede/escritório central</strong>?<br>
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

    ${anexoHTML('des')}

    <div class="form-footer">
      <button class="btn-salvar" id="btn-salvar">
        <div class="spinner" id="spinner" style="display:none"></div>
        <span id="btn-txt">✓ Lançar Despesa</span>
      </button>
      <button class="btn-limpar" id="btn-limpar">Limpar</button>
      <span id="contador-bd" style="font-size:10px;font-weight:700;color:var(--mu);background:var(--sf2);border:1px solid var(--bd);border-radius:2px;padding:3px 8px">0 despesas</span>
    </div>
  </div>

  <!-- HISTÓRICO -->
  <div class="historico">
    <div class="historico-titulo">Últimos lançamentos — despesas</div>
    <div class="historico-lista" id="historico-lista"></div>
  </div>
</div>

<!-- MODAL FORNECEDOR -->
<div id="forn-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;align-items:center;justify-content:center">
  <div style="background:var(--bg);border:1px solid var(--bd);border-radius:var(--raio);padding:24px;width:400px;max-width:92vw;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.18)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:14px;font-weight:800;color:var(--tx)">Cadastrar Fornecedor</div>
      <button id="btn-fechar-forn" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--mu);line-height:1;padding:2px 6px">✕</button>
    </div>
    <div class="campo" style="margin-bottom:10px">
      <label>Nome / Razão Social <span style="color:var(--vermelho)">*</span></label>
      <input type="text" id="forn-nome" placeholder="Ex: Fornecedora ABC Ltda">
    </div>
    <div class="campo" style="margin-bottom:10px">
      <label>Categoria</label>
      <select id="forn-categoria">
        <option value="">Selecione...</option>
        <option value="materiais">Materiais / Insumos</option>
        <option value="servicos">Serviços</option>
        <option value="combustivel">Combustível</option>
        <option value="locacao">Locação de equipamentos</option>
        <option value="maodeobra">Mão de obra / Subcontrato</option>
        <option value="financeiro">Financeiro / Bancário</option>
        <option value="outro">Outro</option>
      </select>
    </div>
    <div class="campo" style="margin-bottom:10px">
      <label>Contato</label>
      <input type="text" id="forn-contato" placeholder="Nome do responsável">
    </div>
    <div class="campo" style="margin-bottom:20px">
      <label>Telefone</label>
      <input type="text" id="forn-telefone" placeholder="(00) 00000-0000">
    </div>
    <div id="forn-msg" style="margin-bottom:8px;min-height:18px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="btn-cancelar-forn"
        style="padding:8px 18px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--raio);font-size:12px;font-weight:700;cursor:pointer;color:var(--tx)">
        Cancelar
      </button>
      <button id="btn-confirmar-forn"
        style="padding:8px 18px;background:var(--amb);color:#1E1C18;border:1px solid var(--amb);border-radius:var(--raio);font-size:12px;font-weight:800;cursor:pointer">
        ✓ Cadastrar
      </button>
    </div>
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
    { valor: 'CC-ADM-01-MATRIZ',             label: 'CC-ADM-01-MATRIZ' },
    { valor: 'CC-ADM-02-FOLHA DE PAGAMENTO', label: 'CC-ADM-02-FOLHA DE PAGAMENTO' },
    { valor: 'CC-ADM-03-INVESTIMENTOS',      label: 'CC-ADM-03-INVESTIMENTOS' },
    { valor: 'CC-ADM-04-BBC',      label: 'CC-ADM-04-BBC' },
    { valor: 'CC-ADM-05-MSX',      label: 'CC-ADM-05-MSX' },
    { valor: 'CC-ADM-06-ECCOFORTE', label: 'CC-ADM-06-ECCOFORTE' },
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

function _preencherFornecedores() {
  const sel = document.getElementById('f-fornecedor');
  while (sel.options.length > 1) sel.remove(1);
  _fornecedores.forEach(f => {
    const o = document.createElement('option');
    o.value = f.nome;
    o.textContent = f.nome + (f.categoria ? ' · ' + (CAT_FORN_LABEL[f.categoria] || f.categoria) : '');
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

  // Fornecedor modal
  document.getElementById('btn-novo-forn').addEventListener('click', _abrirModalForn);
  document.getElementById('btn-fechar-forn').addEventListener('click', _fecharModalForn);
  document.getElementById('btn-cancelar-forn').addEventListener('click', _fecharModalForn);
  document.getElementById('btn-confirmar-forn').addEventListener('click', _salvarFornecedor);
  document.getElementById('forn-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('forn-overlay')) _fecharModalForn();
  });

  // Juros
  document.getElementById('toggle-juros').addEventListener('change', _onJuros);
  document.getElementById('f-juros-valor').addEventListener('input', e => formatarValorInput(e.target));

  // Parcelamento
  document.getElementById('toggle-recorrente').addEventListener('change', _onRecorrente);
  document.getElementById('f-num-parcelas').addEventListener('input', () => _renderParcelas({ resetValores: true }));
  document.getElementById('f-frequencia').addEventListener('change', _renderParcelas);
  document.getElementById('f-data-primeira').addEventListener('change', _renderParcelas);
  document.getElementById('f-valor').addEventListener('input', () => {
    if (document.getElementById('toggle-recorrente').checked) _renderParcelas({ resetValores: true });
  });
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

  regra.classList.toggle('visivel', cc === 'CC-ADM-01-MATRIZ');

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
    if (['CC-ADM-01-MATRIZ', 'CC-ADM-02-FOLHA DE PAGAMENTO', 'CC-ADM-03-INVESTIMENTOS', 'CC-ADM-04-BBC', 'CC-ADM-05-MSX', 'CC-ADM-06-ECCOFORTE'].includes(cc)) {
      document.getElementById('f-contrato').value = '';
    }
  }
}

// ── Fornecedor modal ──────────────────────────────
function _abrirModalForn() {
  const overlay = document.getElementById('forn-overlay');
  overlay.style.display = 'flex';
  document.getElementById('forn-nome').value      = '';
  document.getElementById('forn-categoria').value = '';
  document.getElementById('forn-contato').value   = '';
  document.getElementById('forn-telefone').value  = '';
  document.getElementById('forn-msg').innerHTML   = '';
  setTimeout(() => document.getElementById('forn-nome').focus(), 50);
}

function _fecharModalForn() {
  document.getElementById('forn-overlay').style.display = 'none';
}

async function _salvarFornecedor() {
  const nome = document.getElementById('forn-nome').value.trim();
  if (!nome) {
    document.getElementById('forn-msg').innerHTML =
      '<span style="color:var(--vermelho);font-size:11px;font-weight:700">O nome é obrigatório.</span>';
    return;
  }
  const dados = {
    nome,
    categoria: document.getElementById('forn-categoria').value,
    contato:   document.getElementById('forn-contato').value.trim(),
    telefone:  document.getElementById('forn-telefone').value.trim(),
  };
  const btn = document.getElementById('btn-confirmar-forn');
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    await salvarFornecedor(dados);
    _fornecedores.push(dados);
    _fornecedores.sort((a, b) => a.nome.localeCompare(b.nome));
    _preencherFornecedores();
    document.getElementById('f-fornecedor').value = nome;
    _fecharModalForn();
  } catch (err) {
    document.getElementById('forn-msg').innerHTML =
      `<span style="color:var(--vermelho);font-size:11px;font-weight:700">Erro: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Cadastrar';
  }
}

// ── Parcelamento ──────────────────────────────────
function _onJuros() {
  const on = document.getElementById('toggle-juros').checked;
  const fields = document.getElementById('juros-fields');
  if (fields) fields.style.display = on ? 'flex' : 'none';
}

function _onRecorrente() {
  const on = document.getElementById('toggle-recorrente').checked;
  document.getElementById('recorrente-box').style.display = on ? '' : 'none';
  const elData = document.getElementById('f-data');
  if (elData) { elData.disabled = on; elData.style.opacity = on ? '0.4' : ''; }
  // juros não se aplica a lançamentos parcelados
  const jurosRow = document.getElementById('juros-row');
  if (jurosRow) jurosRow.style.display = on ? 'none' : '';
  if (on) {
    const togJ = document.getElementById('toggle-juros');
    if (togJ) { togJ.checked = false; _onJuros(); }
  }
  if (on) _renderParcelas({ resetValores: true });
}

function _renderParcelas({ resetValores = false } = {}) {
  const n    = Math.max(2, Math.min(120, parseInt(document.getElementById('f-num-parcelas').value) || 2));
  const freq = parseInt(document.getElementById('f-frequencia')?.value ?? '30');
  const manual = freq === 0;

  const campoPrimeira = document.getElementById('campo-primeira-data');
  if (campoPrimeira) campoPrimeira.style.display = manual ? 'none' : '';

  const container = document.getElementById('datas-parcelas');
  const existing  = Array.from(container.querySelectorAll('input[type=date]')).map(el => el.value);
  const existingV = Array.from(container.querySelectorAll('[data-valor-parcela]')).map(el => el.value);
  container.innerHTML = '';

  const total = parseMoeda(document.getElementById('f-valor').value);
  const vp    = total > 0 ? total / n : 0;
  const fmtVP = vp > 0 ? vp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

  const valorCell = i => (!resetValores && existingV[i]) ? existingV[i] : fmtVP;

  if (!manual) {
    const primeiraData = document.getElementById('f-data-primeira').value;
    if (!primeiraData) {
      container.innerHTML = `<div style="font-size:11px;color:var(--mu);padding:8px 0;font-style:italic">
        Informe a data da 1ª parcela para gerar as datas automaticamente.</div>`;
      return;
    }
    const base = new Date(primeiraData + 'T12:00:00');
    const grid = _criarGridParcelas();
    for (let i = 0; i < n; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + freq * i);
      grid.appendChild(_celulaData(i, n, d.toISOString().split('T')[0], valorCell(i)));
    }
    const wrap = _wrapGrid(grid, n);
    container.appendChild(wrap);
  } else {
    const grid = _criarGridParcelas();
    for (let i = 0; i < n; i++) {
      grid.appendChild(_celulaData(i, n, existing[i] || '', valorCell(i)));
    }
    const wrap = _wrapGrid(grid, n);
    container.appendChild(wrap);
  }
}

function _criarGridParcelas() {
  const g = document.createElement('div');
  g.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:5px';
  return g;
}

function _wrapGrid(grid, n) {
  if (n <= 24) return grid;
  const w = document.createElement('div');
  w.style.cssText = 'max-height:340px;overflow-y:auto;border:1px solid var(--bd);border-radius:var(--raio);padding:8px;margin-top:4px';
  w.appendChild(grid);
  return w;
}

function _celulaData(i, n, datVal, valorFmt) {
  const cell = document.createElement('div');
  cell.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--raio);padding:5px 8px';
  cell.innerHTML = `
    <span style="font-size:9px;font-weight:800;color:var(--mu);min-width:30px;flex-shrink:0">${i + 1}/${n}</span>
    <input type="date" data-parcela="${i}" value="${datVal}"
      style="border:none;background:transparent;font-family:var(--fonte);font-size:11px;font-weight:700;color:var(--tx);outline:none;flex:1;min-width:0;cursor:pointer">
    <input type="text" data-valor-parcela="${i}" value="${valorFmt}" placeholder="0,00"
      style="border:none;background:transparent;font-family:var(--fonte);font-size:11px;font-weight:700;color:var(--tx);outline:none;width:82px;text-align:right;cursor:text">
  `;
  cell.querySelector('[data-valor-parcela]').addEventListener('input', e => formatarValorInput(e.target));
  return cell;
}

// ── Salvar ────────────────────────────────────────
async function _salvar() {
  esconderMsg('msg-feedback');
  if (!_validar()) return;

  const isParcelado = document.getElementById('toggle-recorrente').checked;
  let datas = [];

  if (isParcelado) {
    const inputs = document.querySelectorAll('#datas-parcelas input[type=date]');
    datas = Array.from(inputs).map(el => el.value);
    if (datas.some(d => !d)) {
      mostrarMsg('msg-feedback', 'erro', 'Preencha a data de todas as parcelas.');
      return;
    }
  } else {
    datas = [document.getElementById('f-data').value];
  }

  // Captura antes de _limpar
  const dataLancamento = document.getElementById('f-data-lancamento').value || new Date().toISOString().split('T')[0];
  const selCat    = document.getElementById('f-categoria');
  const catDesc   = selCat.options[selCat.selectedIndex]?.text || '';
  const catId     = document.getElementById('f-categoria').value;
  const valorStr  = document.getElementById('f-valor').value;
  const ccVal     = document.getElementById('f-cc').value;
  const forma     = document.getElementById('f-forma').value;
  const nrDocBase = document.getElementById('f-doc').value.trim();
  const fornecedor= document.getElementById('f-fornecedor').value;
  const infoBase  = document.getElementById('f-info').value.trim();
  const contrato  = document.getElementById('f-contrato').value;
  const valorTotal = Math.abs(parseMoeda(valorStr));
  const n          = datas.length;

  _setLoading(true);
  try {
    if (_editId) {
      const data = datas[0];
      const d    = new Date(data + 'T12:00:00');
      await atualizarLancamento(_editId, {
        data, mes: mesNome(data), ano: d.getFullYear(),
        dataLancamento,
        categoria: catId, categoriaDesc: catDesc,
        cc: ccVal, formaPgto: forma,
        valor: -valorTotal, fornecedor, info: infoBase, nrDoc: nrDocBase, contrato,
        statusPagamento: 'pendente',
        editadoPor: _perfil?.nome || 'Sistema',
        editadoEm:  new Date().toISOString(),
      });
      mostrarMsg('msg-feedback', 'sucesso', 'Lançamento atualizado com sucesso!');
      setTimeout(() => window.app.navigate('base-dados'), 1200);
      return;
    }

    // Upload do anexo uma vez (aplicado a todas as parcelas)
    let anexoUrl = null, anexoNome = null;
    const anexoFile = _anexo?.getFile();
    if (anexoFile) {
      try {
        anexoUrl  = await uploadAnexo('despesas', ccVal, nrDocBase, anexoFile);
        anexoNome = anexoFile.name;
      } catch (err) {
        mostrarMsg('msg-feedback', 'erro', 'Erro ao enviar anexo: ' + err.message);
        _setLoading(false);
        return;
      }
    }

    for (let i = 0; i < n; i++) {
      const data  = datas[i];
      const d     = new Date(data + 'T12:00:00');
      const info  = isParcelado
        ? (infoBase ? infoBase + ' · ' : '') + `Parcela ${i + 1}/${n}`
        : infoBase;
      const nrDoc = isParcelado ? `${nrDocBase}-P${i + 1}` : nrDocBase;
      let valor;
      if (isParcelado) {
        const vEl = document.querySelectorAll('#datas-parcelas [data-valor-parcela]')[i];
        valor = -(vEl ? Math.abs(parseMoeda(vEl.value)) || valorTotal / n : valorTotal / n);
      } else {
        valor = -valorTotal;
      }

      await salvarLancamento({
        tipo:          'Gasto',
        data,
        mes:           mesNome(data),
        ano:           d.getFullYear(),
        dataLancamento,
        categoria:     catId,
        categoriaDesc: catDesc,
        cc:            ccVal,
        formaPgto:     forma,
        valor,
        fornecedor,
        info,
        nrDoc,
        contrato,
        statusPagamento: 'pendente',
        lancadoPor:    _perfil?.nome || 'Sistema',
        ...(anexoUrl ? { anexoUrl, anexoNome } : {}),
      });
    }

    // Lançamento de juros (somente para não-parcelado)
    let jurosValor = 0;
    if (!isParcelado && document.getElementById('toggle-juros')?.checked) {
      jurosValor = Math.abs(parseMoeda(document.getElementById('f-juros-valor').value));
      if (jurosValor > 0) {
        const jCat     = _plano.find(c => c.id === '5.1.002');
        const jCatId   = jCat?.id   || '5.1.002';
        const jCatDesc = jCat ? (jCat.id + ' — ' + jCat.desc) : '5.1.002 — Juros / Encargos Financeiros';
        try {
          await salvarLancamento({
            tipo: 'Gasto', data: datas[0],
            mes: mesNome(datas[0]), ano: new Date(datas[0] + 'T12:00:00').getFullYear(),
            dataLancamento, categoria: jCatId, categoriaDesc: jCatDesc,
            cc: 'CC-ADM-01-MATRIZ', formaPgto: forma,
            valor: -jurosValor, fornecedor,
            info: `Juros/multa ref. ${nrDocBase}`,
            nrDoc: nrDocBase, contrato,
            statusPagamento: 'pendente',
            lancadoPor: _perfil?.nome || 'Sistema',
          });
        } catch (jErr) {
          mostrarMsg('msg-feedback', 'erro', `Despesa principal salva, mas falha ao salvar juros: ${jErr.message}`);
          _limpar();
          _renderHistorico();
          _atualizarContador();
          return;
        }
      }
    }

    mostrarMsg('msg-feedback', 'sucesso', isParcelado
      ? `${n} parcelas lançadas · total ${fmtMfull(valorTotal)} · ${ccVal}`
      : jurosValor > 0
        ? `Despesa lançada · ${fmtMfull(valorTotal)} em ${ccVal} + juros ${fmtMfull(jurosValor)} → 5.1.002 em CC-ADM-01-MATRIZ`
        : `Despesa lançada: ${catDesc.split('—').slice(1).join('—').trim() || catDesc} · ${fmtMfull(valorTotal)} · ${ccVal}`
    );
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
  const isParcelado = document.getElementById('toggle-recorrente').checked;
  const campos = [
    ...(!isParcelado ? [{ id: 'f-data', label: 'Data' }] : []),
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
  if (document.getElementById('toggle-juros')?.checked) {
    if (!parseMoeda(document.getElementById('f-juros-valor').value)) {
      mostrarMsg('msg-feedback', 'erro', 'Informe o valor dos juros / multa.');
      document.getElementById('f-juros-valor').focus();
      return false;
    }
  }
  return true;
}

function _setLoading(on) {
  document.getElementById('btn-salvar').disabled = on;
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('btn-txt').textContent = on ? 'Salvando...' : (_editId ? '✓ Salvar Alterações' : '✓ Lançar Despesa');
}

function _setHoje() {
  const hoje = new Date().toISOString().split('T')[0];
  const elData = document.getElementById('f-data');
  if (elData) elData.value = hoje;
  const elLanc = document.getElementById('f-data-lancamento');
  if (elLanc) elLanc.value = hoje;
}

function _limpar() {
  if (_editId) { window.app.navigate('base-dados'); return; }
  _setHoje();
  ['f-doc', 'f-info', 'f-valor'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('f-fornecedor').value  = '';
  document.getElementById('f-forma').value       = '';
  document.getElementById('f-categoria').value   = '';
  document.getElementById('f-cc').value          = '';
  document.getElementById('f-contrato').value    = '';
  document.getElementById('cc-info').classList.remove('visivel');
  document.getElementById('regra-desempate').classList.remove('visivel');
  document.getElementById('toggle-recorrente').checked    = false;
  document.getElementById('recorrente-box').style.display  = 'none';
  const elDataL = document.getElementById('f-data');
  if (elDataL) { elDataL.disabled = false; elDataL.style.opacity = ''; }
  const togJ = document.getElementById('toggle-juros');
  if (togJ) { togJ.checked = false; _onJuros(); }
  const fJuros = document.getElementById('f-juros-valor');
  if (fJuros) fJuros.value = '';
  const jurosRow = document.getElementById('juros-row');
  if (jurosRow) jurosRow.style.display = '';
  document.getElementById('f-num-parcelas').value          = '2';
  document.getElementById('f-frequencia').value            = '30';
  document.getElementById('f-data-primeira').value         = '';
  const cp = document.getElementById('campo-primeira-data');
  if (cp) cp.style.display = '';
  document.getElementById('datas-parcelas').innerHTML      = '';
  _anexo?.clear();
  esconderMsg('msg-feedback');
}

// ── Modo edição ───────────────────────────────────
async function _carregarParaEdicao() {
  try {
    const l = await buscarLancamento(_editId);
    if (!l) { mostrarMsg('msg-feedback', 'erro', 'Lançamento não encontrado.'); return; }

    document.getElementById('edit-banner').style.display = 'flex';
    document.getElementById('f-data-lancamento').value = l.dataLancamento || new Date().toISOString().split('T')[0];
    document.getElementById('f-data').value      = l.data || '';
    document.getElementById('f-doc').value       = l.nrDoc || '';
    document.getElementById('f-forma').value     = l.formaPgto || '';
    document.getElementById('f-categoria').value = l.categoria || '';
    document.getElementById('f-cc').value        = l.cc || '';
    document.getElementById('f-info').value      = l.info || '';

    const valorEl = document.getElementById('f-valor');
    valorEl.value = Math.abs(l.valor || 0).toFixed(2).replace('.', ',');
    formatarValorInput(valorEl);

    if (l.fornecedor) {
      const sel = document.getElementById('f-fornecedor');
      if (!Array.from(sel.options).find(o => o.value === l.fornecedor)) {
        const o = document.createElement('option');
        o.value = l.fornecedor; o.textContent = l.fornecedor;
        sel.appendChild(o);
      }
      sel.value = l.fornecedor;
    }

    _onCC();
    document.getElementById('f-contrato').value = l.contrato || '';

    if (l.anexoUrl) showExistingAnexo('des', l.anexoUrl, l.anexoNome);
    // Oculta parcelamento — não editável
    document.getElementById('toggle-recorrente').closest('.form-section').style.display = 'none';

    document.getElementById('btn-txt').textContent = '✓ Salvar Alterações';
    document.getElementById('btn-limpar').textContent = '← Cancelar';
  } catch (err) {
    mostrarMsg('msg-feedback', 'erro', 'Erro ao carregar lançamento: ' + err.message);
  }
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
