import {
  carregarContratos, atualizarContrato,
  salvarLancamento, carregarLancamentosRecentes, contarLancamentos,
  buscarLancamento, buscarRetencoesDaReceita, deletarLancamento, atualizarLancamento,
  increment,
} from '../db.js';
import {
  formatarValorInput, parseMoeda, fmtMfull, fmtData, mesNome,
  mostrarMsg, esconderMsg, msgHTML,
} from '../utils.js';
import { anexoHTML, bindAnexo, uploadAnexo, showExistingAnexo } from '../upload-helper.js';

let _perfil              = null;
let _contratos           = [];
let _contratoSelecionado = null;
let _editId              = null;
let _retencoesAntigas    = [];
let _anexo               = null;

export async function mount(container, perfil) {
  _perfil = perfil;
  _editId = null;
  _retencoesAntigas = [];
  const hashParts = window.location.hash.slice(1).split('/');
  if (hashParts[1]) _editId = hashParts[1];

  if (perfil?.nivel === 'operacao') {
    container.innerHTML = `
      <div class="acesso-negado">
        <div class="acesso-negado-icone">🔒</div>
        <h2>Acesso restrito</h2>
        <p>Lançamento de receitas disponível apenas para Financeiro e Administrador.</p>
        <button class="btn-add" style="margin-top:8px"
          onclick="window.app.navigate('lancar-despesa')">
          Ir para Lançar Despesa
        </button>
      </div>`;
    return;
  }

  container.innerHTML = _html();
  _setHoje();

  try {
    _contratos = await carregarContratos();
    _preencherContratos(_contratos);
  } catch {
    mostrarMsg('msg-feedback', 'erro', 'Erro ao carregar contratos.');
  }

  _bindEventos();
  _anexo = bindAnexo('rec', (dados) => {
    if (dados.nNF && !document.getElementById('f-doc').value)
      document.getElementById('f-doc').value = dados.nNF;
    if (dados.vNF) {
      const el = document.getElementById('f-valor');
      el.value = dados.vNF.toFixed(2).replace('.', ',');
      formatarValorInput(el);
      _calcularRetencoes();
    }
  });
  _renderHistorico();
  _atualizarContador();
  if (_editId) await _carregarParaEdicao();
}

export function destroy() {
  _editId = null;
  _retencoesAntigas = [];
  _anexo = null;
}

// ── HTML ──────────────────────────────────────────
function _html() {
  return `
<div class="page">
  <div class="page-header">
    <div class="page-title verde">Lançar Receita</div>
    <div class="page-sub">Entradas · NFS-e · Medições · Adiantamentos · Receitas financeiras</div>
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
      <div class="row row-2">
        <div class="campo">
          <label>Data de lançamento</label>
          <input type="date" id="f-data-lancamento">
        </div>
        <div class="campo">
          <label>Data prevista do recebimento <span style="color:var(--vermelho)">*</span></label>
          <input type="date" id="f-data">
        </div>
      </div>
      <div class="row row-3" style="margin-top:12px">
        <div class="campo">
          <label>Nº NFS-e / Documento <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-doc" placeholder="NFS-001, NFS-e nº...">
        </div>
        <div class="campo">
          <label>Forma de recebimento <span style="color:var(--vermelho)">*</span></label>
          <select id="f-forma">
            <option value="">Selecione...</option>
            <option>Transferência</option>
            <option>Pix</option>
            <option>Boleto</option>
            <option>Depósito</option>
            <option>Outro</option>
          </select>
        </div>
        <div class="campo">
          <label>Tipo de receita <span style="color:var(--vermelho)">*</span></label>
          <select id="f-tipo-receita">
            <option value="medicao">Medição aprovada</option>
            <option value="adiantamento">Adiantamento / Mobilização</option>
            <option value="financeira">Receita financeira</option>
            <option value="outro">Outro</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 2. CONTRATO -->
    <div class="form-section">
      <div class="section-titulo">Contrato e Centro de Custo</div>
      <div class="row row-2">
        <div class="campo">
          <label>Contrato <span style="color:var(--vermelho)">*</span></label>
          <select id="f-contrato">
            <option value="">Selecione o contrato...</option>
          </select>
        </div>
        <div class="campo">
          <label>Centro de Custo</label>
          <input type="text" id="f-cc" readonly
            style="background:var(--sf2);color:var(--amb);font-weight:700;cursor:default"
            placeholder="Preenchido automaticamente">
        </div>
      </div>

      <div class="contrato-info" id="contrato-info">
        <div class="ci-item">
          <div class="ci-label">Valor total</div>
          <div class="ci-valor" id="ci-total">—</div>
        </div>
        <div class="ci-item">
          <div class="ci-label">Já executado</div>
          <div class="ci-valor" id="ci-executado">—</div>
        </div>
        <div class="ci-item">
          <div class="ci-label">Saldo disponível</div>
          <div class="ci-valor amb" id="ci-saldo">—</div>
        </div>
        <div class="ci-item">
          <div class="ci-label">Vigência fim</div>
          <div class="ci-valor" id="ci-vigencia">—</div>
        </div>
        <div class="ci-item">
          <div class="ci-label">Prazo pagamento</div>
          <div class="ci-valor" id="ci-prazo">—</div>
        </div>
        <div class="ci-item">
          <div class="ci-label">Status</div>
          <div class="ci-valor verde" id="ci-status">—</div>
        </div>
      </div>
    </div>

    <!-- 3. VALOR -->
    <div class="form-section">
      <div class="section-titulo">Valor e referência</div>
      <div class="row row-3">
        <div class="campo">
          <label>Valor bruto (R$) <span style="color:var(--vermelho)">*</span></label>
          <input type="text" id="f-valor" placeholder="0,00">
        </div>
        <div class="campo">
          <label>Referência da medição</label>
          <input type="text" id="f-referencia" placeholder="Ex: Medição Jan/26">
        </div>
        <div class="campo">
          <label>Informações adicionais</label>
          <input type="text" id="f-info" placeholder="Observações">
        </div>
      </div>
    </div>

    <!-- 4. RETENÇÕES -->
    <div class="form-section" id="secao-retencoes">
      <div class="section-titulo">
        Retenções na fonte
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--txs);cursor:pointer;margin-left:8px;letter-spacing:0;text-transform:none">
          <input type="checkbox" id="toggle-retencoes" style="width:13px;height:13px">
          Aplicar retenções
        </label>
      </div>

      <div class="retencoes-box" id="retencoes-box">
        <div class="ret-titulo">
          Alíquotas — preenchidas automaticamente pelo contrato quando configuradas
          <span id="ret-mo-info" style="font-size:10px;font-weight:600;color:var(--amb);display:none">
            · MO-ISS: <span id="ret-mo-iss-pct">100</span>% · MO-INSS: <span id="ret-mo-inss-pct">100</span>%
          </span>
        </div>
        <div class="ret-grid">
          <div class="ret-item-ret">
            <div class="ret-item-label-r">ISS Retido (2.1.001) <span style="font-size:9px;color:var(--mu)">sobre MO</span></div>
            <div class="ret-item-row">
              <input class="ret-aliq-r" type="number" id="aliq-iss" value="0" min="0" max="100" step="0.01">
              <span class="ret-aliq-sym">%</span>
              <span class="ret-valor" id="val-iss">R$ 0,00</span>
            </div>
          </div>
          <div class="ret-item-ret">
            <div class="ret-item-label-r">INSS Retido (2.1.002) <span style="font-size:9px;color:var(--mu)">sobre MO</span></div>
            <div class="ret-item-row">
              <input class="ret-aliq-r" type="number" id="aliq-inss" value="0" min="0" max="100" step="0.01">
              <span class="ret-aliq-sym">%</span>
              <span class="ret-valor" id="val-inss">R$ 0,00</span>
            </div>
          </div>
          <div class="ret-item-ret">
            <div class="ret-item-label-r">IRRF Retido (2.1.003) <span style="font-size:9px;color:var(--mu)">sobre total</span></div>
            <div class="ret-item-row">
              <input class="ret-aliq-r" type="number" id="aliq-irrf" value="0" min="0" max="100" step="0.01">
              <span class="ret-aliq-sym">%</span>
              <span class="ret-valor" id="val-irrf">R$ 0,00</span>
            </div>
          </div>
          <div class="ret-item-ret">
            <div class="ret-item-label-r">PCC/CSRF (2.1.004) <span style="font-size:9px;color:var(--mu)">sobre total</span></div>
            <div class="ret-item-row">
              <input class="ret-aliq-r" type="number" id="aliq-pcc" value="0" min="0" max="100" step="0.01">
              <span class="ret-aliq-sym">%</span>
              <span class="ret-valor" id="val-pcc">R$ 0,00</span>
            </div>
          </div>
          <div class="ret-item-ret">
            <div class="ret-item-label-r">ICMS <span style="font-size:9px;color:var(--mu)">sobre total</span></div>
            <div class="ret-item-row">
              <input class="ret-aliq-r" type="number" id="aliq-icms" value="0" min="0" max="30" step="0.01">
              <span class="ret-aliq-sym">%</span>
              <span class="ret-valor" id="val-icms">R$ 0,00</span>
            </div>
          </div>
        </div>
        <div class="ret-total">
          <div>
            <div class="ret-total-label">Total retido</div>
            <div style="font-size:10px;color:var(--mu);margin-top:2px">Serão gerados lançamentos 2.x automaticamente</div>
          </div>
          <div style="text-align:right">
            <div class="ret-total-valor" id="ret-total">R$ 0,00</div>
            <div class="ret-liquido" id="ret-liquido">Líquido: R$ 0,00</div>
          </div>
        </div>
      </div>
    </div>

    ${anexoHTML('rec')}

    <div class="form-footer">
      <button class="btn-salvar" id="btn-salvar">
        <div class="spinner" id="spinner" style="display:none"></div>
        <span id="btn-txt">✓ Lançar Receita</span>
      </button>
      <button class="btn-limpar" id="btn-limpar">Limpar</button>
      <span id="contador-bd" style="font-size:10px;font-weight:700;color:var(--mu);background:var(--sf2);border:1px solid var(--bd);border-radius:2px;padding:3px 8px">0 receitas</span>
    </div>
  </div>

  <!-- HISTÓRICO -->
  <div class="historico">
    <div class="historico-titulo">Últimos lançamentos — receitas</div>
    <div class="historico-lista" id="historico-lista"></div>
  </div>
</div>`;
}

// ── Preencher selects ─────────────────────────────
function _preencherContratos(contratos) {
  const sel = document.getElementById('f-contrato');
  contratos.filter(c => c.status !== 'encerrado').forEach(c => {
    const o = document.createElement('option');
    o.value = c.numContrato;
    o.textContent = c.numContrato + ' — ' + c.cliente;
    sel.appendChild(o);
  });
}

// ── Bind ──────────────────────────────────────────
function _bindEventos() {
  document.getElementById('f-contrato').addEventListener('change', _onContrato);
  document.getElementById('f-tipo-receita').addEventListener('change', _onTipoReceita);
  document.getElementById('toggle-retencoes').addEventListener('change', _toggleRetencoes);
  document.getElementById('f-valor').addEventListener('input', e => { formatarValorInput(e.target); _calcularRetencoes(); });
  ['aliq-iss', 'aliq-inss', 'aliq-irrf', 'aliq-pcc', 'aliq-icms'].forEach(id =>
    document.getElementById(id).addEventListener('input', _calcularRetencoes)
  );
  document.getElementById('btn-salvar').addEventListener('click', _salvar);
  document.getElementById('btn-limpar').addEventListener('click', _limpar);
}

function _onContrato() {
  const num  = document.getElementById('f-contrato').value;
  const info = document.getElementById('contrato-info');
  if (!num) {
    _contratoSelecionado = null;
    info.classList.remove('visivel');
    document.getElementById('f-cc').value = '';
    return;
  }

  const c = _contratos.find(x => x.numContrato === num);
  if (!c) return;
  _contratoSelecionado = c;

  document.getElementById('f-cc').value = c.ccCodigo;
  const saldo = c.valorTotal - (c.valorExecutado || 0);

  info.classList.add('visivel');
  document.getElementById('ci-total').textContent     = fmtMfull(c.valorTotal);
  document.getElementById('ci-executado').textContent = fmtMfull(c.valorExecutado || 0);
  document.getElementById('ci-saldo').textContent     = fmtMfull(saldo);
  document.getElementById('ci-vigencia').textContent  = fmtData(c.fim);
  document.getElementById('ci-prazo').textContent     = 'D+' + (c.prazo || 60) + ' dias';
  document.getElementById('ci-status').textContent    = c.status === 'ativo' ? 'Ativo' : 'Pausado';

  // Exibe % MO por imposto
  const issPercMO  = c.retencoes?.issPercMO  ?? c.percMO ?? 100;
  const inssPercMO = c.retencoes?.inssPercMO ?? c.percMO ?? 100;
  const moInfo = document.getElementById('ret-mo-info');
  if (moInfo) {
    document.getElementById('ret-mo-iss-pct').textContent  = issPercMO;
    document.getElementById('ret-mo-inss-pct').textContent = inssPercMO;
    moInfo.style.display = '';
  }

  if (c.retencoes) {
    document.getElementById('aliq-iss').value  = c.retencoes.iss  || 0;
    document.getElementById('aliq-inss').value = c.retencoes.inss || 0;
    document.getElementById('aliq-irrf').value = c.retencoes.irrf || 0;
    document.getElementById('aliq-pcc').value  = c.retencoes.pcc  || 0;
    document.getElementById('aliq-icms').value = c.retencoes.icms || 0;
    const temRetencao = Object.values(c.retencoes).some(v => v > 0);
    if (temRetencao) {
      document.getElementById('toggle-retencoes').checked = true;
      _toggleRetencoes();
    }
    _calcularRetencoes();
  }
}

function _onTipoReceita() {
  // Seção de retenções sempre visível — usuário decide se aplica via toggle
}

function _toggleRetencoes() {
  const on = document.getElementById('toggle-retencoes').checked;
  document.getElementById('retencoes-box').classList.toggle('visivel', on);
  if (on) _calcularRetencoes();
}

function _calcularRetencoes() {
  const bruto      = parseMoeda(document.getElementById('f-valor').value);
  const c          = _contratoSelecionado;
  const percMOiss  = (c?.retencoes?.issPercMO  ?? c?.percMO ?? 100) / 100;
  const percMOinss = (c?.retencoes?.inssPercMO ?? c?.percMO ?? 100) / 100;

  const aliqISS  = parseFloat(document.getElementById('aliq-iss').value)  || 0;
  const aliqINSS = parseFloat(document.getElementById('aliq-inss').value) || 0;
  const aliqIRRF = parseFloat(document.getElementById('aliq-irrf').value) || 0;
  const aliqPCC  = parseFloat(document.getElementById('aliq-pcc').value)  || 0;
  const aliqICMS = parseFloat(document.getElementById('aliq-icms').value) || 0;

  // ISS e INSS incidem sobre suas respectivas bases de Mão de Obra
  const valISS  = bruto * percMOiss  * aliqISS  / 100;
  const valINSS = bruto * percMOinss * aliqINSS / 100;
  // IRRF, PCC e ICMS incidem sobre o valor total
  const valIRRF = bruto  * aliqIRRF / 100;
  const valPCC  = bruto  * aliqPCC  / 100;
  const valICMS = bruto  * aliqICMS / 100;
  const total   = valISS + valINSS + valIRRF + valPCC + valICMS;
  const liquido = bruto - total;

  document.getElementById('val-iss').textContent  = fmtMfull(valISS);
  document.getElementById('val-inss').textContent = fmtMfull(valINSS);
  document.getElementById('val-irrf').textContent = fmtMfull(valIRRF);
  document.getElementById('val-pcc').textContent  = fmtMfull(valPCC);
  document.getElementById('val-icms').textContent = fmtMfull(valICMS);
  document.getElementById('ret-total').textContent   = fmtMfull(total);
  document.getElementById('ret-liquido').textContent = 'Líquido: ' + fmtMfull(liquido);
}

// ── Salvar ────────────────────────────────────────
async function _salvar() {
  esconderMsg('msg-feedback');
  if (!_validar()) return;
  _setLoading(true);

  try {
    const data           = document.getElementById('f-data').value;
    const dataLancamento = document.getElementById('f-data-lancamento').value || new Date().toISOString().split('T')[0];
    const d              = new Date(data + 'T12:00:00');
    const bruto   = parseMoeda(document.getElementById('f-valor').value);
    const cc      = document.getElementById('f-cc').value;
    const contrato = document.getElementById('f-contrato').value;
    const nrDoc   = document.getElementById('f-doc').value.trim();

    // Modo edição
    if (_editId) {
      await atualizarLancamento(_editId, {
        tipo: 'Receita',
        data, mes: mesNome(data), ano: d.getFullYear(),
        dataLancamento,
        categoria:     '1.1.001',
        categoriaDesc: '1.1.001 — Receita de Serviços (NFS-e)',
        cc, formaPgto: document.getElementById('f-forma').value,
        valor: bruto,
        info: document.getElementById('f-referencia').value.trim() || document.getElementById('f-info').value.trim(),
        nrDoc, contrato,
        statusPagamento: 'pendente',
        editadoPor: _perfil?.nome || 'Sistema',
        editadoEm:  new Date().toISOString(),
      });

      // Deleta retenções antigas e recria conforme aliquotas atuais
      for (const r of _retencoesAntigas) await deletarLancamento(r.id);
      _retencoesAntigas = [];

      const comRetEdit = document.getElementById('toggle-retencoes').checked;
      if (comRetEdit) {
        const ce = _contratoSelecionado;
        const percMOissE  = (ce?.retencoes?.issPercMO  ?? ce?.percMO ?? 100) / 100;
        const percMOinssE = (ce?.retencoes?.inssPercMO ?? ce?.percMO ?? 100) / 100;
        const retDefsEdit = [
          { id: '2.1.001', desc: 'ISS Retido',      aliqId: 'aliq-iss',  base: bruto * percMOissE  },
          { id: '2.1.002', desc: 'INSS Retido',     aliqId: 'aliq-inss', base: bruto * percMOinssE },
          { id: '2.1.003', desc: 'IRRF Retido',     aliqId: 'aliq-irrf', base: bruto               },
          { id: '2.1.004', desc: 'PCC/CSRF Retido', aliqId: 'aliq-pcc',  base: bruto               },
          { id: '2.1.005', desc: 'ICMS Retido',     aliqId: 'aliq-icms', base: bruto               },
        ];
        for (const r of retDefsEdit) {
          const aliq = parseFloat(document.getElementById(r.aliqId).value) || 0;
          if (aliq <= 0) continue;
          const valor = -(r.base * aliq / 100);
          await salvarLancamento({
            tipo: 'Gasto', data, mes: mesNome(data), ano: d.getFullYear(),
            categoria: r.id, categoriaDesc: r.id + ' — ' + r.desc,
            cc, formaPgto: 'Retenção',
            valor, aliq,
            info: 'Retenção automática — NFS-e: ' + nrDoc,
            nrDoc, contrato,
            lancadoPor: _perfil?.nome || 'Sistema',
          });
        }
      }

      mostrarMsg('msg-feedback', 'sucesso', 'Receita atualizada com sucesso!');
      setTimeout(() => window.app.navigate('base-dados'), 1200);
      return;
    }

    // Upload do anexo (se houver)
    let anexoUrl = null, anexoNome = null;
    const anexoFile = _anexo?.getFile();
    if (anexoFile) {
      try {
        anexoUrl  = await uploadAnexo('receitas', cc, nrDoc, anexoFile);
        anexoNome = anexoFile.name;
      } catch (err) {
        mostrarMsg('msg-feedback', 'erro', 'Erro ao enviar anexo: ' + err.message);
        _setLoading(false);
        return;
      }
    }

    // Lançamento principal — receita
    await salvarLancamento({
      tipo:          'Receita',
      data, mes: mesNome(data), ano: d.getFullYear(),
      dataLancamento,
      categoria:      '1.1.001',
      categoriaDesc:  '1.1.001 — Receita de Serviços (NFS-e)',
      cc, formaPgto: document.getElementById('f-forma').value,
      valor: bruto,
      info:  document.getElementById('f-referencia').value.trim() || document.getElementById('f-info').value.trim(),
      nrDoc, contrato,
      statusPagamento: 'pendente',
      lancadoPor: _perfil?.nome || 'Sistema',
      ...(anexoUrl ? { anexoUrl, anexoNome } : {}),
    });

    // Atualiza saldo do contrato
    if (_contratoSelecionado?.id) {
      await atualizarContrato(_contratoSelecionado.id, {
        valorFaturado:  increment(bruto),
        valorExecutado: increment(bruto),
      });
    }

    // Lançamentos de retenção automáticos
    const comRetencoes = document.getElementById('toggle-retencoes').checked;
    let totalRetido = 0;

    if (comRetencoes) {
      const cn = _contratoSelecionado;
      const percMOissN  = (cn?.retencoes?.issPercMO  ?? cn?.percMO ?? 100) / 100;
      const percMOinssN = (cn?.retencoes?.inssPercMO ?? cn?.percMO ?? 100) / 100;
      const retDefs = [
        { id: '2.1.001', desc: 'ISS Retido',      aliq: 'aliq-iss',  base: bruto * percMOissN  },
        { id: '2.1.002', desc: 'INSS Retido',     aliq: 'aliq-inss', base: bruto * percMOinssN },
        { id: '2.1.003', desc: 'IRRF Retido',     aliq: 'aliq-irrf', base: bruto               },
        { id: '2.1.004', desc: 'PCC/CSRF Retido', aliq: 'aliq-pcc',  base: bruto               },
        { id: '2.1.005', desc: 'ICMS Retido',     aliq: 'aliq-icms', base: bruto               },
      ];
      for (const r of retDefs) {
        const aliq = parseFloat(document.getElementById(r.aliq).value) || 0;
        if (aliq <= 0) continue;
        const valor = -(r.base * aliq / 100);
        totalRetido += Math.abs(valor);
        await salvarLancamento({
          tipo: 'Gasto', data, mes: mesNome(data), ano: d.getFullYear(),
          categoria: r.id, categoriaDesc: r.id + ' — ' + r.desc,
          cc, formaPgto: 'Retenção',
          valor, aliq,
          info: 'Retenção automática — NFS-e: ' + nrDoc,
          nrDoc, contrato,
          lancadoPor: _perfil?.nome || 'Sistema',
        });
      }
    }

    const msgTexto = comRetencoes && totalRetido > 0
      ? `Receita lançada: ${fmtMfull(bruto)} | Retenções: ${fmtMfull(totalRetido)} | Líquido: ${fmtMfull(bruto - totalRetido)}`
      : `Receita lançada: ${fmtMfull(bruto)} · ${cc} · ${contrato}`;
    mostrarMsg('msg-feedback', 'sucesso', msgTexto);
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
    { id: 'f-data',     label: 'Data' },
    { id: 'f-doc',      label: 'Nº Documento' },
    { id: 'f-forma',    label: 'Forma de recebimento' },
    { id: 'f-contrato', label: 'Contrato' },
    { id: 'f-valor',    label: 'Valor' },
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
  return true;
}

function _setLoading(on) {
  document.getElementById('btn-salvar').disabled = on;
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('btn-txt').textContent = on ? 'Salvando...' : (_editId ? '✓ Salvar Alterações' : '✓ Lançar Receita');
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
  ['f-doc', 'f-referencia', 'f-info', 'f-valor'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('f-forma').value        = '';
  document.getElementById('f-tipo-receita').value = 'medicao';
  document.getElementById('f-contrato').value     = '';
  document.getElementById('f-cc').value           = '';
  document.getElementById('contrato-info').classList.remove('visivel');
  _contratoSelecionado = null;
  document.getElementById('toggle-retencoes').checked = false;
  document.getElementById('retencoes-box').classList.remove('visivel');
  const moInfo = document.getElementById('ret-mo-info');
  if (moInfo) moInfo.style.display = 'none';
  ['aliq-iss', 'aliq-inss', 'aliq-irrf', 'aliq-pcc', 'aliq-icms'].forEach(id => { document.getElementById(id).value = 0; });
  ['val-iss', 'val-inss', 'val-irrf', 'val-pcc', 'val-icms', 'ret-total'].forEach(id => { document.getElementById(id).textContent = 'R$ 0,00'; });
  document.getElementById('ret-liquido').textContent = 'Líquido: R$ 0,00';
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
    document.getElementById('f-data').value        = l.data || '';
    document.getElementById('f-doc').value         = l.nrDoc || '';
    document.getElementById('f-forma').value       = l.formaPgto || '';
    document.getElementById('f-referencia').value  = l.info || '';

    const valorEl = document.getElementById('f-valor');
    valorEl.value = Math.abs(l.valor || 0).toFixed(2).replace('.', ',');
    formatarValorInput(valorEl);

    if (l.contrato) {
      document.getElementById('f-contrato').value = l.contrato;
      _onContrato();
    }

    // Retenções
    if (l.nrDoc) {
      const rets = await buscarRetencoesDaReceita(l.nrDoc);
      _retencoesAntigas = rets;
      if (rets.length > 0) {
        document.getElementById('toggle-retencoes').checked = true;
        _toggleRetencoes();
        const aliqMap = { '2.1.001': 'aliq-iss', '2.1.002': 'aliq-inss', '2.1.003': 'aliq-irrf', '2.1.004': 'aliq-pcc', '2.1.005': 'aliq-icms' };
        rets.forEach(r => {
          const inputId = aliqMap[r.categoria];
          if (inputId && r.aliq != null) document.getElementById(inputId).value = r.aliq;
        });
        _calcularRetencoes();
      }
    }

    if (l.anexoUrl) showExistingAnexo('rec', l.anexoUrl, l.anexoNome);
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
    const receitas = await carregarLancamentosRecentes('Receita', 8);
    if (!receitas.length) {
      lista.innerHTML = '<div class="hist-vazio">Nenhuma receita lançada ainda.</div>';
      return;
    }
    lista.innerHTML = receitas.map(l => `
      <div class="historico-item">
        <span class="hist-data">${fmtData(l.data)}</span>
        <span class="hist-cat">${l.contrato || '—'} · ${l.info || ''}</span>
        <span class="hist-cc">${l.cc}</span>
        <span class="hist-valor-r">${fmtMfull(l.valor)}</span>
      </div>`).join('');
  } catch {
    lista.innerHTML = '<div class="hist-vazio">Erro ao carregar histórico.</div>';
  }
}

async function _atualizarContador() {
  try {
    const n = await contarLancamentos('Receita');
    const el = document.getElementById('contador-bd');
    if (el) el.textContent = n + (n === 1 ? ' receita' : ' receitas');
  } catch {}
}
