import { carregarLancamentos } from '../db.js';
import { fmtMfull } from '../utils.js';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let _lancamentos = [];
let _ano = new Date().getFullYear();
let _mes = '';
let _cc  = '';

export async function mount(container, perfil) {
  _ano = new Date().getFullYear();
  _mes = '';
  _cc  = '';
  container.innerHTML = _html();
  document.getElementById('dcc-ano').addEventListener('change', async () => {
    _ano = +document.getElementById('dcc-ano').value;
    await _carregar();
  });
  document.getElementById('dcc-mes').addEventListener('change', () => {
    _mes = document.getElementById('dcc-mes').value;
    _renderIfReady();
  });
  document.getElementById('dcc-cc').addEventListener('change', () => {
    _cc = document.getElementById('dcc-cc').value;
    _renderIfReady();
  });
  await _carregar();
}

export function destroy() { _lancamentos = []; _cc = ''; }

function _html() {
  const a = new Date().getFullYear();
  const mesOpts = `<option value="">ANUAL</option>` +
    MESES.map(m => `<option value="${m}">${m}</option>`).join('');
  return `
<div class="page" style="max-width:900px">
  <div class="page-header">
    <div>
      <div class="page-title">DRE por CC</div>
      <div class="page-sub" id="dcc-sub">Demonstrativo de resultado por centro de custo</div>
    </div>
    <div class="header-right" style="gap:8px">
      <select class="filtro-input" id="dcc-cc" style="min-width:160px">
        <option value="">Selecionar CC…</option>
      </select>
      <select class="filtro-input" id="dcc-mes">${mesOpts}</select>
      <select class="filtro-input" id="dcc-ano">
        ${[a-1,a,a+1].map(x=>`<option value="${x}" ${x===a?'selected':''}>${x}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="dcc-body"></div>
</div>`;
}

async function _carregar() {
  document.getElementById('dcc-body').innerHTML =
    '<div class="bd-loading"><div class="spinner" style="display:block;width:20px;height:20px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--mu);font-weight:600">Carregando...</div></div>';
  try {
    _lancamentos = await carregarLancamentos(_ano);
    _populateCC();
    _renderIfReady();
  } catch (err) {
    document.getElementById('dcc-body').innerHTML =
      `<div class="msg erro visivel"><span>✕</span><span>Erro: ${err.message}</span></div>`;
  }
}

function _populateCC() {
  const ccs = [...new Set(_lancamentos.map(l => l.cc).filter(Boolean))]
    .sort((a, b) => {
      if (a.startsWith('CC-CLI') && !b.startsWith('CC-CLI')) return -1;
      if (!a.startsWith('CC-CLI') && b.startsWith('CC-CLI')) return 1;
      return a.localeCompare(b);
    });
  const sel = document.getElementById('dcc-cc');
  const prev = _cc;
  sel.innerHTML = `<option value="">Selecionar CC…</option>` +
    ccs.map(cc => `<option value="${cc}">${cc}</option>`).join('');
  if (prev && ccs.includes(prev)) {
    sel.value = prev;
    _cc = prev;
  } else {
    _cc = ccs[0] || '';
    sel.value = _cc;
  }
}

function _renderIfReady() {
  if (!_cc) {
    document.getElementById('dcc-body').innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--mu);font-size:13px">Selecione um centro de custo para visualizar o DRE.</div>';
    return;
  }
  _render();
}

function somaR(lancs, pred) {
  return lancs.filter(pred).reduce((s, l) => s + (l.valor || 0), 0);
}
function somaG(lancs, pred) {
  return lancs.filter(pred).reduce((s, l) => s + Math.abs(l.valor || 0), 0);
}

function calcDRE(lancs) {
  const g = fn => somaG(lancs, l => l.tipo === 'Gasto' && fn(l));
  const r = fn => somaR(lancs, l => l.tipo === 'Receita' && fn(l));

  const recBruta   = r(() => true);
  const iss        = g(l => l.categoria?.startsWith('2.1.001'));
  const inss       = g(l => l.categoria?.startsWith('2.1.002'));
  const irrf       = g(l => l.categoria?.startsWith('2.1.003'));
  const pcc        = g(l => l.categoria?.startsWith('2.1.004'));
  const retTotal   = iss + inss + irrf + pcc;
  const recLiq     = recBruta - retTotal;

  const mat        = g(l => l.categoria?.startsWith('3.1'));
  const rateio     = g(l => l.categoria?.startsWith('3.2.001'));
  const frota      = g(l => l.categoria?.startsWith('3.3'));
  const logist     = g(l => l.categoria?.startsWith('3.4'));
  const terceiros  = g(l => l.categoria?.startsWith('3.5'));
  const qualid     = g(l => l.categoria?.startsWith('3.6'));
  const estrutura  = g(l => l.categoria?.startsWith('3.7'));
  const eng        = g(l => l.categoria?.startsWith('3.8'));
  const cusTotal   = mat + rateio + frota + logist + terceiros + qualid + estrutura + eng;

  const margemBruta = recLiq - cusTotal;
  const margemPct   = recBruta > 0 ? margemBruta / recBruta * 100 : null;

  const pes4       = g(l => l.categoria?.startsWith('4.1'));
  const estr4      = g(l => l.categoria?.startsWith('4.2'));
  const srv        = g(l => l.categoria?.startsWith('4.3'));
  const com        = g(l => l.categoria?.startsWith('4.4'));
  const mat4       = g(l => l.categoria?.startsWith('4.5'));
  const admTotal   = pes4 + estr4 + srv + com + mat4;

  const f900       = g(l => l.categoria?.startsWith('3.2.900'));
  const f901       = g(l => l.categoria?.startsWith('3.2.901'));
  const f902       = g(l => l.categoria?.startsWith('3.2.902'));
  const f903       = g(l => l.categoria?.startsWith('3.2.903'));
  const folhaTotal = f900 + f901 + f902 + f903;

  const tar        = g(l => l.categoria?.startsWith('5.1.001'));
  const jur        = g(l => l.categoria?.startsWith('5.1.002'));
  const finRec     = r(l => l.categoria?.startsWith('5.'));
  const finTotal   = tar + jur - finRec;

  const resultado    = margemBruta - admTotal - folhaTotal - finTotal;
  const resultadoPct = recBruta > 0 ? resultado / recBruta * 100 : null;

  return {
    recBruta, iss, inss, irrf, pcc, retTotal, recLiq,
    mat, rateio, frota, logist, terceiros, qualid, estrutura, eng, cusTotal,
    margemBruta, margemPct,
    pes4, estr4, srv, com, mat4, admTotal,
    f900, f901, f902, f903, folhaTotal,
    tar, jur, finTotal,
    resultado, resultadoPct,
  };
}

function _render() {
  const lancs = (_mes ? _lancamentos.filter(l => l.mes === _mes) : _lancamentos)
    .filter(l => l.cc === _cc);

  const d = calcDRE(lancs);
  const periodo = _mes ? `${_mes} ${_ano}` : `Anual ${_ano}`;

  const sub = document.getElementById('dcc-sub');
  if (sub) sub.textContent = `${_cc} · ${periodo}`;

  const fG = v => v > 0 ? `(${fmtMfull(v)})` : v < 0 ? fmtMfull(-v) : '—';
  const fR = v => v > 0 ? fmtMfull(v)         : v < 0 ? `(${fmtMfull(-v)})` : '—';
  const fP = v => v != null ? v.toFixed(1).replace('.', ',') + ' %' : '—';
  const corM = v => v != null ? (v >= 40 ? 'var(--verde)' : v >= 20 ? 'var(--amb)' : 'var(--vermelho)') : 'inherit';
  const corR = v => v != null ? (v >= 15 ? 'var(--verde)' : v >= 5  ? 'var(--amb)' : 'var(--vermelho)') : 'inherit';

  const sep = label => `<tr style="background:var(--sf2)">
    <td colspan="2" style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mu);padding:5px 10px">${label}</td>
  </tr>`;

  const row = (label, value, fmtFn, bold = false, colorFn = null, indent = false) => {
    const v = value; const t = typeof v === 'number';
    const c = colorFn && t ? `color:${colorFn(v)}` : '';
    return `<tr${bold ? ' style="background:var(--sf)"' : ''}>
      <td style="font-size:12px;padding:6px 10px;padding-left:${indent ? '24' : '10'}px;font-weight:${bold ? '800' : '600'}">${label}</td>
      <td style="text-align:right;font-size:12px;font-weight:${bold ? '800' : '600'};${c}">${t ? fmtFn(v) : '—'}</td>
    </tr>`;
  };

  document.getElementById('dcc-body').innerHTML = `
    <div class="tbl-wrap">
      <table style="min-width:420px">
        <thead><tr>
          <th style="min-width:300px;text-align:left">Linha DRE</th>
          <th style="min-width:160px;text-align:right">${_cc}</th>
        </tr></thead>
        <tbody>
          ${sep('Receita Bruta')}
          ${row('RECEITA BRUTA', d.recBruta, fR, true)}

          ${sep('(−) Retenções na Fonte (2.x)')}
          ${row('ISS Retido (2.1.001)',     d.iss,      fG, false, null, true)}
          ${row('INSS Retido (2.1.002)',    d.inss,     fG, false, null, true)}
          ${row('IRRF Retido (2.1.003)',    d.irrf,     fG, false, null, true)}
          ${row('PCC/CSRF Retido (2.1.004)',d.pcc,      fG, false, null, true)}
          ${row('TOTAL RETENÇÕES',          d.retTotal, fG, true)}
          ${row('RECEITA LÍQUIDA',          d.recLiq,   fR, true)}

          ${sep('(−) Custos Diretos (3.x)')}
          ${row('Materiais (3.1)',                   d.mat,       fG, false, null, true)}
          ${row('Rateio Operacional (3.2.001)',       d.rateio,    fG, false, null, true)}
          ${row('Frota / Veículos (3.3)',             d.frota,     fG, false, null, true)}
          ${row('Logística (3.4)',                    d.logist,    fG, false, null, true)}
          ${row('Terceiros / Subcontratados (3.5)',   d.terceiros, fG, false, null, true)}
          ${row('Qualidade (3.6)',                    d.qualid,    fG, false, null, true)}
          ${row('Estrutura Operacional (3.7)',        d.estrutura, fG, false, null, true)}
          ${row('Engenharia (3.8)',                   d.eng,       fG, false, null, true)}
          ${row('TOTAL CUSTOS DIRETOS', d.cusTotal, fG, true)}
          ${row('★ MARGEM BRUTA',  d.margemBruta, v => v >= 0 ? fR(v) : fG(-v), true, v => v >= 0 ? 'var(--verde)' : 'var(--vermelho)')}
          ${row('Margem Bruta %',  d.margemPct,   fP, false, corM, true)}

          ${sep('(−) Despesas Administrativas (4.x)')}
          ${row('Pessoal ADM (4.1)',            d.pes4,  fG, false, null, true)}
          ${row('Estrutura / Infra (4.2)',       d.estr4, fG, false, null, true)}
          ${row('Serviços Profissionais (4.3)',  d.srv,   fG, false, null, true)}
          ${row('Comercial / Licitação (4.4)',   d.com,   fG, false, null, true)}
          ${row('Material Escritório (4.5)',     d.mat4,  fG, false, null, true)}
          ${row('TOTAL ADM', d.admTotal, fG, true)}

          ${sep('(−) Folha Operacional (3.2.9xx)')}
          ${row('Folha Bruta (3.2.900)',         d.f900, fG, false, null, true)}
          ${row('Encargos INSS/FGTS (3.2.901)',  d.f901, fG, false, null, true)}
          ${row('Benefícios VA/VT (3.2.902)',    d.f902, fG, false, null, true)}
          ${row('Horas Extras (3.2.903)',         d.f903, fG, false, null, true)}
          ${row('TOTAL FOLHA', d.folhaTotal, fG, true)}

          ${sep('(−) Financeiro (5.x)')}
          ${row('Tarifas Bancárias (5.1.001)', d.tar, fG, false, null, true)}
          ${row('Juros / Encargos (5.1.002)',  d.jur, fG, false, null, true)}
          ${row('FINANCEIRO LÍQUIDO', d.finTotal, v => v > 0 ? fG(v) : v < 0 ? fR(-v) : '—', true)}

          ${sep('Resultado')}
          ${row('★ RESULTADO OPERACIONAL', d.resultado,    v => v >= 0 ? fR(v) : fG(-v), true, v => v >= 0 ? 'var(--verde)' : 'var(--vermelho)')}
          ${row('Margem Operacional %',    d.resultadoPct, fP, false, corR, true)}
        </tbody>
      </table>
    </div>`;
}
