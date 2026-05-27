import { carregarLancamentos } from '../db.js';
import { fmtMfull } from '../utils.js';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let _lancamentos = [];
let _ano = new Date().getFullYear();
let _mes = '';

export async function mount(container, perfil) {
  _ano = new Date().getFullYear();
  _mes = '';
  container.innerHTML = _html();
  document.getElementById('drec-ano').addEventListener('change', async () => {
    _ano = +document.getElementById('drec-ano').value;
    await _carregar();
  });
  document.getElementById('drec-mes').addEventListener('change', () => {
    _mes = document.getElementById('drec-mes').value;
    _render();
  });
  await _carregar();
}

export function destroy() { _lancamentos = []; }

function _html() {
  const a = new Date().getFullYear();
  const mesOpts = `<option value="">ANUAL</option>` +
    MESES.map(m => `<option value="${m}">${m}</option>`).join('');
  return `
<div class="page" style="max-width:1900px">
  <div class="page-header">
    <div>
      <div class="page-title">DRE Comparativo</div>
      <div class="page-sub" id="drec-sub">Demonstrativo de resultado por centro de custo</div>
    </div>
    <div class="header-right" style="gap:8px">
      <select class="filtro-input" id="drec-mes">${mesOpts}</select>
      <select class="filtro-input" id="drec-ano">
        ${[a-1,a,a+1].map(x=>`<option value="${x}" ${x===a?'selected':''}>${x}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="drec-body"></div>
</div>`;
}

async function _carregar() {
  document.getElementById('drec-body').innerHTML =
    '<div class="bd-loading"><div class="spinner" style="display:block;width:20px;height:20px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--mu);font-weight:600">Carregando...</div></div>';
  try {
    _lancamentos = await carregarLancamentos(_ano);
    _render();
  } catch (err) {
    document.getElementById('drec-body').innerHTML =
      `<div class="msg erro visivel"><span>✕</span><span>Erro: ${err.message}</span></div>`;
  }
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
  const lancs = _mes ? _lancamentos.filter(l => l.mes === _mes) : _lancamentos;

  const ccs = [...new Set(lancs.map(l => l.cc).filter(Boolean))]
    .sort((a, b) => {
      if (a.startsWith('CC-CLI') && !b.startsWith('CC-CLI')) return -1;
      if (!a.startsWith('CC-CLI') && b.startsWith('CC-CLI')) return 1;
      return a.localeCompare(b);
    });

  const tot   = calcDRE(lancs);
  const byCC  = ccs.map(cc => calcDRE(lancs.filter(l => l.cc === cc)));
  const ncols = ccs.length + 2;

  const fG = v => v > 0 ? `(${fmtMfull(v)})` : v < 0 ? fmtMfull(-v) : '—';
  const fR = v => v > 0 ? fmtMfull(v)         : v < 0 ? `(${fmtMfull(-v)})` : '—';
  const fP = v => v != null ? v.toFixed(1).replace('.', ',') + ' %' : '—';
  const corM = v => v != null ? (v >= 40 ? 'var(--verde)' : v >= 20 ? 'var(--amb)' : 'var(--vermelho)') : 'inherit';
  const corR = v => v != null ? (v >= 15 ? 'var(--verde)' : v >= 5  ? 'var(--amb)' : 'var(--vermelho)') : 'inherit';

  const sub = document.getElementById('drec-sub');
  if (sub) sub.textContent = `Demonstrativo de resultado por centro de custo · ${_mes || 'Anual'} ${_ano}`;

  const thCCs = ccs.map(cc =>
    `<th style="min-width:120px;text-align:right;font-size:10px;padding:6px 8px">${cc}</th>`
  ).join('') + `<th style="min-width:130px;text-align:right;background:var(--sf2)">TOTAL</th>`;

  const sep = label => `<tr style="background:var(--sf2)">
    <td colspan="${ncols}" style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mu);padding:5px 10px">${label}</td>
  </tr>`;

  const row = (label, key, fmtFn, bold = false, colorFn = null, indent = false) => {
    const cells = byCC.map(d => {
      const v = d[key]; const t = typeof v === 'number';
      const c = colorFn && t ? `color:${colorFn(v)}` : '';
      return `<td style="text-align:right;font-size:11px;${c}">${t ? fmtFn(v) : '—'}</td>`;
    }).join('');
    const tv = tot[key]; const tc = colorFn && typeof tv === 'number' ? `color:${colorFn(tv)}` : '';
    return `<tr${bold ? ' style="background:var(--sf)"' : ''}>
      <td style="font-size:11px;padding:5px 10px;padding-left:${indent ? '22' : '10'}px;font-weight:${bold ? '800' : '600'}">${label}</td>
      ${cells}
      <td style="text-align:right;font-size:11px;font-weight:800;background:var(--sf2);${tc}">${typeof tv === 'number' ? fmtFn(tv) : '—'}</td>
    </tr>`;
  };

  if (ccs.length === 0) {
    document.getElementById('drec-body').innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--mu);font-size:13px">Sem lançamentos para o período selecionado.</div>';
    return;
  }

  document.getElementById('drec-body').innerHTML = `
    <div class="tbl-wrap"><div class="tbl-scroll" style="min-width:${Math.max(1000, ccs.length * 125 + 320)}px">
      <table>
        <thead><tr>
          <th style="min-width:260px;text-align:left">Linha DRE</th>${thCCs}
        </tr></thead>
        <tbody>
          ${sep('Receita Bruta')}
          ${row('RECEITA BRUTA', 'recBruta', fR, true)}

          ${sep('(−) Retenções na Fonte (2.x)')}
          ${row('ISS Retido (2.1.001)',    'iss',      fG, false, null, true)}
          ${row('INSS Retido (2.1.002)',   'inss',     fG, false, null, true)}
          ${row('IRRF Retido (2.1.003)',   'irrf',     fG, false, null, true)}
          ${row('PCC/CSRF Retido (2.1.004)','pcc',    fG, false, null, true)}
          ${row('TOTAL RETENÇÕES',          'retTotal', fG, true)}
          ${row('RECEITA LÍQUIDA',          'recLiq',   fR, true)}

          ${sep('(−) Custos Diretos (3.x)')}
          ${row('Materiais (3.1)',                   'mat',       fG, false, null, true)}
          ${row('Rateio Operacional (3.2.001)',       'rateio',    fG, false, null, true)}
          ${row('Frota / Veículos (3.3)',             'frota',     fG, false, null, true)}
          ${row('Logística (3.4)',                    'logist',    fG, false, null, true)}
          ${row('Terceiros / Subcontratados (3.5)',   'terceiros', fG, false, null, true)}
          ${row('Qualidade (3.6)',                    'qualid',    fG, false, null, true)}
          ${row('Estrutura Operacional (3.7)',        'estrutura', fG, false, null, true)}
          ${row('Engenharia (3.8)',                   'eng',       fG, false, null, true)}
          ${row('TOTAL CUSTOS DIRETOS', 'cusTotal', fG, true)}
          ${row('★ MARGEM BRUTA',  'margemBruta', v => v >= 0 ? fR(v) : fG(-v), true, v => v >= 0 ? 'var(--verde)' : 'var(--vermelho)')}
          ${row('Margem Bruta %',  'margemPct',   fP, false, corM, true)}

          ${sep('(−) Despesas Administrativas (4.x)')}
          ${row('Pessoal ADM (4.1)',               'pes4',     fG, false, null, true)}
          ${row('Estrutura / Infra (4.2)',          'estr4',    fG, false, null, true)}
          ${row('Serviços Profissionais (4.3)',     'srv',      fG, false, null, true)}
          ${row('Comercial / Licitação (4.4)',      'com',      fG, false, null, true)}
          ${row('Material Escritório (4.5)',        'mat4',     fG, false, null, true)}
          ${row('TOTAL ADM', 'admTotal', fG, true)}

          ${sep('(−) Folha Operacional (3.2.9xx)')}
          ${row('Folha Bruta (3.2.900)',        'f900', fG, false, null, true)}
          ${row('Encargos INSS/FGTS (3.2.901)','f901', fG, false, null, true)}
          ${row('Benefícios VA/VT (3.2.902)',   'f902', fG, false, null, true)}
          ${row('Horas Extras (3.2.903)',        'f903', fG, false, null, true)}
          ${row('TOTAL FOLHA', 'folhaTotal', fG, true)}

          ${sep('(−) Financeiro (5.x)')}
          ${row('Tarifas Bancárias (5.1.001)', 'tar', fG, false, null, true)}
          ${row('Juros / Encargos (5.1.002)',  'jur', fG, false, null, true)}
          ${row('FINANCEIRO LÍQUIDO', 'finTotal', v => v > 0 ? fG(v) : v < 0 ? fR(-v) : '—', true)}

          ${sep('Resultado')}
          ${row('★ RESULTADO OPERACIONAL', 'resultado',    v => v >= 0 ? fR(v) : fG(-v), true, v => v >= 0 ? 'var(--verde)' : 'var(--vermelho)')}
          ${row('Margem Operacional %',    'resultadoPct', fP, false, corR, true)}
        </tbody>
      </table>
    </div></div>`;
}
