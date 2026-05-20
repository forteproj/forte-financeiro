import { criarContrato, buscarContratoPorNum } from '../db.js';
import { formatarValorInput, parseMoeda, tipoIconeArquivo, fmtBytes, mostrarMsg, esconderMsg, msgHTML } from '../utils.js';

let _perfil = null;
let _arquivos = [];

export async function mount(container, perfil) {
  _perfil = perfil;
  _arquivos = [];
  container.innerHTML = _html();
  _bindEventos();
}

export function destroy() {
  _arquivos = [];
}

// ── HTML ──────────────────────────────────────────
function _html() {
  return `
<div class="page">
  <div class="page-header">
    <div class="page-title">Lançar Contrato</div>
    <div class="page-sub">Cadastro de novo contrato ativo · Campos com * são obrigatórios</div>
  </div>

  ${msgHTML('msg-feedback')}

  <div class="form-card">

    <!-- SEÇÃO 1: IDENTIFICAÇÃO -->
    <div class="form-section">
      <div class="section-titulo">Identificação do contrato</div>
      <div class="row row-3">
        <div class="campo">
          <label>Cliente / Município <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-cliente" placeholder="Ex: Pref. Belo Horizonte">
        </div>
        <div class="campo">
          <label>Nº Contrato <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-num-contrato" placeholder="Ex: CT-2025/011">
        </div>
        <div class="campo">
          <label>Código CC <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-cc-codigo" placeholder="Ex: BH, POA, CXS..."
            style="text-transform:uppercase">
          <div class="campo-hint">Sigla curta para o centro de custo</div>
        </div>
      </div>
      <div class="cod-preview" id="cod-preview" style="display:none">
        <div class="cod-preview-label">Código que será criado</div>
        <div class="cod-preview-valor" id="cod-preview-valor">—</div>
      </div>
    </div>

    <!-- SEÇÃO 2: VALORES E VIGÊNCIA -->
    <div class="form-section">
      <div class="section-titulo">Valores e vigência</div>
      <div class="row row-4">
        <div class="campo">
          <label>Valor Total (R$) <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-valor-total" placeholder="0,00">
        </div>
        <div class="campo">
          <label>Adiantamento (R$)</label>
          <input type="text" id="f-adiantamento" placeholder="0,00">
          <div class="campo-hint">Ordem de início / mobilização</div>
        </div>
        <div class="campo">
          <label>Vigência Início <span style="color:var(--vermelho)">*</span></label>
          <input type="date" id="f-inicio">
        </div>
        <div class="campo">
          <label>Vigência Fim <span style="color:var(--vermelho)">*</span></label>
          <input type="date" id="f-fim">
        </div>
      </div>
      <div class="row row-3">
        <div class="campo">
          <label>Prazo de Pagamento</label>
          <select id="f-prazo">
            <option value="30">D+30 dias</option>
            <option value="60" selected>D+60 dias (padrão)</option>
            <option value="45">D+45 dias</option>
            <option value="90">D+90 dias</option>
          </select>
        </div>
        <div class="campo">
          <label>Status <span style="color:var(--vermelho)">*</span></label>
          <select id="f-status">
            <option value="ativo">🟢 Ativo</option>
            <option value="pausado">🟡 Pausado</option>
            <option value="encerrado">🔴 Encerrado</option>
            <option value="em_licitacao">🔵 Em licitação</option>
          </select>
        </div>
        <div class="campo">
          <label>Tipo de Contrato</label>
          <select id="f-tipo">
            <option value="municipal">Municipal (Prefeitura)</option>
            <option value="estadual">Estadual (DER/Estado)</option>
            <option value="federal">Federal (DNIT/União)</option>
            <option value="privado">Privado</option>
          </select>
        </div>
      </div>
    </div>

    <!-- SEÇÃO 3: CONTATO FISCAL -->
    <div class="form-section">
      <div class="section-titulo">Contato fiscal / financeiro no cliente</div>
      <div class="row row-2">
        <div class="campo">
          <label>Nome do responsável</label>
          <input type="text" id="f-contato-nome" placeholder="Nome completo">
        </div>
        <div class="campo">
          <label>Cargo / Setor</label>
          <input type="text" id="f-contato-cargo" placeholder="Ex: Setor de Contratos">
        </div>
        <div class="campo">
          <label>E-mail</label>
          <input type="email" id="f-contato-email" placeholder="email@municipio.gov.br">
        </div>
        <div class="campo">
          <label>Telefone</label>
          <input type="text" id="f-contato-tel" placeholder="(00) 00000-0000">
        </div>
      </div>
    </div>

    <!-- SEÇÃO 4: RETENÇÕES -->
    <div class="form-section">
      <div class="section-titulo">Retenções na fonte</div>
      <div class="ret-grid-cont">
        <div class="ret-item">
          <div class="ret-item-label">ISS Retido <span style="font-size:9px;color:var(--bd2);font-weight:600">2.1.001</span></div>
          <div class="ret-row">
            <input class="ret-aliq" type="number" id="f-ret-iss" value="0" min="0" max="10" step="0.0001">
            <span class="ret-sym">%</span>
          </div>
          <div class="ret-hint">Alíquota municipal · Padrão: 2,5% a 5%</div>
        </div>
        <div class="ret-item">
          <div class="ret-item-label">INSS Retido <span style="font-size:9px;color:var(--bd2);font-weight:600">2.1.002</span></div>
          <div class="ret-row">
            <input class="ret-aliq" type="number" id="f-ret-inss" value="0" min="0" max="20" step="0.0001">
            <span class="ret-sym">%</span>
          </div>
          <div class="ret-hint">Art. 31 Lei 8.212 · Padrão: 11%</div>
        </div>
        <div class="ret-item">
          <div class="ret-item-label">IRRF Retido <span style="font-size:9px;color:var(--bd2);font-weight:600">2.1.003</span></div>
          <div class="ret-row">
            <input class="ret-aliq" type="number" id="f-ret-irrf" value="0" min="0" max="10" step="0.0001">
            <span class="ret-sym">%</span>
          </div>
          <div class="ret-hint">IR na fonte · Padrão: 1,5% a 4,8%</div>
        </div>
        <div class="ret-item">
          <div class="ret-item-label">PCC / CSRF <span style="font-size:9px;color:var(--bd2);font-weight:600">2.1.004</span></div>
          <div class="ret-row">
            <input class="ret-aliq" type="number" id="f-ret-pcc" value="0" min="0" max="10" step="0.0001">
            <span class="ret-sym">%</span>
          </div>
          <div class="ret-hint">PIS+COFINS+CSLL · Padrão: 4,65%</div>
        </div>
      </div>
      <div style="background:var(--abg);border:1px solid var(--abdr);border-radius:var(--raio);padding:10px 14px;font-size:11px;color:var(--txs);line-height:1.6;margin-top:12px">
        <strong style="color:var(--amb)">Como funciona:</strong> as alíquotas aqui cadastradas são puxadas automaticamente ao lançar uma receita deste contrato.
        Deixe em <strong>0</strong> para os impostos que não se aplicam.
      </div>
    </div>

    <!-- SEÇÃO 5: OBSERVAÇÕES -->
    <div class="form-section">
      <div class="section-titulo">Observações</div>
      <div class="campo">
        <label>Objeto contratual</label>
        <textarea id="f-objeto" placeholder="Ex: Serviços de sinalização horizontal e vertical em vias urbanas..."></textarea>
      </div>
      <div class="campo">
        <label>Observações internas</label>
        <textarea id="f-obs" placeholder="Notas internas, condições especiais, alertas..."></textarea>
      </div>
    </div>

    <!-- SEÇÃO 6: DOCUMENTOS -->
    <div class="form-section">
      <div class="section-titulo">Documentos anexos</div>
      <div class="upload-area" id="upload-area">
        <input type="file" id="f-arquivos" multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls">
        <div class="upload-icone">📎</div>
        <div class="upload-titulo">Clique ou arraste os arquivos aqui</div>
        <div class="upload-sub">PDF, Word, Excel, Imagens · Máx. 10MB por arquivo</div>
      </div>
      <div id="upload-lista" style="margin-top:12px;display:flex;flex-direction:column;gap:6px"></div>
    </div>

    <!-- FOOTER -->
    <div class="form-footer">
      <button class="btn-salvar" id="btn-salvar">
        <div class="spinner" id="spinner" style="display:none"></div>
        <span id="btn-txt">✓ Salvar Contrato</span>
      </button>
      <button class="btn-limpar" id="btn-limpar">Limpar</button>
      <button class="btn-nav" id="btn-ver-contratos" style="margin-left:auto">
        Ver todos os contratos →
      </button>
    </div>

  </div>
</div>`;
}

// ── Bind ──────────────────────────────────────────
function _bindEventos() {
  document.getElementById('f-cc-codigo').addEventListener('input', _atualizarPreview);
  document.getElementById('f-valor-total').addEventListener('input', e => formatarValorInput(e.target));
  document.getElementById('f-adiantamento').addEventListener('input', e => formatarValorInput(e.target));
  document.getElementById('f-arquivos').addEventListener('change', e => _adicionarArquivos(e.target.files));
  document.getElementById('btn-salvar').addEventListener('click', _salvar);
  document.getElementById('btn-limpar').addEventListener('click', _limpar);
  document.getElementById('btn-ver-contratos').addEventListener('click', () => window.app.navigate('contratos'));

  const area = document.getElementById('upload-area');
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('dragover'); _adicionarArquivos(e.dataTransfer.files); });
}

function _atualizarPreview() {
  const sig     = document.getElementById('f-cc-codigo').value.trim().toUpperCase();
  const preview = document.getElementById('cod-preview');
  const valor   = document.getElementById('cod-preview-valor');
  if (sig.length >= 2) {
    preview.style.display = 'block';
    valor.textContent = `CC-CLI-${sig}   ·   Dropdown de CC: "CC-CLI-${sig}"`;
  } else {
    preview.style.display = 'none';
  }
}

function _adicionarArquivos(files) {
  Array.from(files).forEach(f => {
    if (f.size > 10 * 1024 * 1024) { mostrarMsg('msg-feedback', 'erro', f.name + ' excede 10MB.'); return; }
    if (_arquivos.find(a => a.name === f.name && a.size === f.size)) return;
    _arquivos.push(f);
  });
  _renderArquivos();
}

function _renderArquivos() {
  document.getElementById('upload-lista').innerHTML = _arquivos.map((f, i) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--raio);padding:8px 12px">
      <span>${tipoIconeArquivo(f.name)}</span>
      <span style="flex:1;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</span>
      <span style="font-size:10px;color:var(--mu);white-space:nowrap">${fmtBytes(f.size)}</span>
      <button data-del="${i}" style="background:none;border:none;cursor:pointer;color:var(--bd2);font-size:14px;padding:2px 4px">✕</button>
    </div>`).join('');

  document.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => { _arquivos.splice(+btn.dataset.del, 1); _renderArquivos(); })
  );
}

// ── Salvar ────────────────────────────────────────
async function _salvar() {
  esconderMsg('msg-feedback');
  if (!_validar()) return;

  _setLoading(true);
  try {
    const sig = document.getElementById('f-cc-codigo').value.trim().toUpperCase();
    const contrato = {
      cliente:      document.getElementById('f-cliente').value.trim(),
      numContrato:  document.getElementById('f-num-contrato').value.trim(),
      ccCodigo:     'CC-CLI-' + sig,
      valorTotal:   parseMoeda(document.getElementById('f-valor-total').value),
      adiantamento: parseMoeda(document.getElementById('f-adiantamento').value),
      inicio:       document.getElementById('f-inicio').value,
      fim:          document.getElementById('f-fim').value,
      prazo:        document.getElementById('f-prazo').value,
      status:       document.getElementById('f-status').value,
      tipo:         document.getElementById('f-tipo').value,
      contato: {
        nome:  document.getElementById('f-contato-nome').value.trim(),
        cargo: document.getElementById('f-contato-cargo').value.trim(),
        email: document.getElementById('f-contato-email').value.trim(),
        tel:   document.getElementById('f-contato-tel').value.trim(),
      },
      objeto:        document.getElementById('f-objeto').value.trim(),
      obs:           document.getElementById('f-obs').value.trim(),
      retencoes: {
        iss:  parseFloat(document.getElementById('f-ret-iss').value)  || 0,
        inss: parseFloat(document.getElementById('f-ret-inss').value) || 0,
        irrf: parseFloat(document.getElementById('f-ret-irrf').value) || 0,
        pcc:  parseFloat(document.getElementById('f-ret-pcc').value)  || 0,
      },
      documentos:     _arquivos.map(f => ({ nome: f.name, size: f.size, tipo: f.type })),
      valorExecutado: 0,
      valorFaturado:  0,
      valorRecebido:  0,
      custosDiretos:  0,
      cadastradoPor:  _perfil?.nome || 'Sistema',
    };

    const id = await criarContrato(contrato);
    mostrarMsg('msg-feedback', 'sucesso',
      `Contrato ${contrato.numContrato} — ${contrato.cliente} cadastrado com sucesso! CC: ${contrato.ccCodigo}`);
    _limpar();
  } catch (err) {
    mostrarMsg('msg-feedback', 'erro', 'Erro ao salvar: ' + err.message);
  } finally {
    _setLoading(false);
  }
}

function _validar() {
  const obrigatorios = [
    { id: 'f-cliente',      label: 'Cliente / Município' },
    { id: 'f-num-contrato', label: 'Nº Contrato' },
    { id: 'f-cc-codigo',    label: 'Código CC' },
    { id: 'f-valor-total',  label: 'Valor Total' },
    { id: 'f-inicio',       label: 'Vigência Início' },
    { id: 'f-fim',          label: 'Vigência Fim' },
  ];
  for (const c of obrigatorios) {
    const el = document.getElementById(c.id);
    if (!el.value.trim()) {
      el.classList.add('erro');
      setTimeout(() => el.classList.remove('erro'), 2500);
      mostrarMsg('msg-feedback', 'erro', 'Campo obrigatório: ' + c.label);
      el.focus();
      return false;
    }
  }
  const inicio = new Date(document.getElementById('f-inicio').value);
  const fim    = new Date(document.getElementById('f-fim').value);
  if (fim <= inicio) {
    mostrarMsg('msg-feedback', 'erro', 'Vigência Fim deve ser posterior à Vigência Início.');
    return false;
  }
  return true;
}

function _setLoading(on) {
  document.getElementById('btn-salvar').disabled = on;
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('btn-txt').textContent = on ? 'Salvando...' : '✓ Salvar Contrato';
}

function _limpar() {
  ['f-cliente', 'f-num-contrato', 'f-cc-codigo', 'f-valor-total', 'f-adiantamento',
   'f-inicio', 'f-fim', 'f-contato-nome', 'f-contato-cargo', 'f-contato-email',
   'f-contato-tel', 'f-objeto', 'f-obs'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-prazo').value  = '60';
  document.getElementById('f-status').value = 'ativo';
  document.getElementById('f-tipo').value   = 'municipal';
  ['f-ret-iss', 'f-ret-inss', 'f-ret-irrf', 'f-ret-pcc'].forEach(id => {
    document.getElementById(id).value = 0;
  });
  document.getElementById('cod-preview').style.display = 'none';
  _arquivos = [];
  _renderArquivos();
  esconderMsg('msg-feedback');
}
