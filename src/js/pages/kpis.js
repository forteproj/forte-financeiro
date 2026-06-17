import { carregarLancamentos, carregarKpiManuais, salvarKpiManual } from '../db.js';
import { fmtMfull } from '../utils.js';

const MESES  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const M3     = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const FOLHA_CATS = ['3.2.900','3.2.901','3.2.902','3.2.903'];

// ── Definições dos inputs manuais ──────────────────────────────────────────
const INPUT_DEFS = [
  { key:'saldoCaixa',          label:'Saldo de Caixa fim do mês (R$)',    tipo:'moeda'  },
  { key:'pmr',                 label:'PMR — dias (contas a receber)',       tipo:'numero' },
  { key:'pmp',                 label:'PMP — dias (contas a pagar)',         tipo:'numero' },
  { key:'faturasVencidas',     label:'Faturas Vencidas (R$)',              tipo:'moeda'  },
  { key:'backlog',             label:'Backlog — carteira a executar (R$)', tipo:'moeda'  },
  { key:'receitaMaiorCliente', label:'Receita do Maior Cliente (R$)',       tipo:'moeda'  },
  { key:'forecastReceita',     label:'Forecast de Receita do mês (R$)',    tipo:'moeda'  },
];

// ── Definições dos KPIs calculados ─────────────────────────────────────────
const KPI_DEFS = [
  { key:'margemBruta',      label:'Margem Bruta — (RL−CD)/RB',      metaLbl:'>40%', alertaLbl:'<32%', dir:'high', meta:40,  alerta:32,  fmt:'pct'        },
  { key:'margemLiquida',    label:'Margem Líquida',                   metaLbl:'>28%', alertaLbl:'<20%', dir:'high', meta:28,  alerta:20,  fmt:'pct'        },
  { key:'cargaTrib',        label:'Carga Tributária / Receita',       metaLbl:'<10%', alertaLbl:'>12%', dir:'low',  meta:10,  alerta:12,  fmt:'pct'        },
  { key:'diasCaixa',        label:'Dias de Caixa (base custo fixo)', metaLbl:'>90',  alertaLbl:'<45',  dir:'high', meta:90,  alerta:45,  fmt:'dias'       },
  { key:'pmrKpi',           label:'PMR — Prazo Médio Recebimento',   metaLbl:'≤60',  alertaLbl:'>75',  dir:'low',  meta:60,  alerta:75,  fmt:'dias'       },
  { key:'cicloFin',         label:'Ciclo Financeiro (PMR − PMP)',    metaLbl:'<30',  alertaLbl:'>45',  dir:'low',  meta:30,  alerta:45,  fmt:'dias'       },
  { key:'inadimplencia',    label:'Inadimplência',                    metaLbl:'<5%',  alertaLbl:'>10%', dir:'low',  meta:5,   alerta:10,  fmt:'pct'        },
  { key:'custoFixo',        label:'Custo Fixo / Receita',            metaLbl:'<30%', alertaLbl:'>40%', dir:'low',  meta:30,  alerta:40,  fmt:'pct'        },
  { key:'custoMaterial',    label:'Custo de Material / Receita',     metaLbl:'<25%', alertaLbl:'>32%', dir:'low',  meta:25,  alerta:32,  fmt:'pct'        },
  { key:'coberturaBacklog', label:'Cobertura de Backlog (meses)',     metaLbl:'>18',  alertaLbl:'<10',  dir:'high', meta:18,  alerta:10,  fmt:'meses'      },
  { key:'concentracao',     label:'Concentração — Maior Cliente',    metaLbl:'<25%', alertaLbl:'>40%', dir:'low',  meta:25,  alerta:40,  fmt:'pct'        },
  { key:'desvioForecast',   label:'Desvio Forecast vs Realizado',    metaLbl:'±10%', alertaLbl:'±20%', dir:'range',meta:10,  alerta:20,  fmt:'pct-signed' },
];

let _lancamentos = [];
let _manuais     = {};
let _ano         = new Date().getFullYear();
let _saveTimers  = {};

// ── Mount / Destroy ───────────────────────────────────────────────────────
export async function mount(container) {
  _ano = new Date().getFullYear();
  _saveTimers = {};
  container.innerHTML = _shell();
  document.getElementById('kpi-ano').addEventListener('change', async () => {
    _ano = +document.getElementById('kpi-ano').value;
    document.getElementById('kpi-sub').textContent = `Painel de indicadores · ${_ano}`;
    await _carregar();
  });
  await _carregar();
}

export function destroy() {
  _lancamentos = [];
  _manuais     = {};
  Object.values(_saveTimers).forEach(clearTimeout);
  _saveTimers  = {};
}

// ── Shell HTML (estrutura fixa) ────────────────────────────────────────────
function _shell() {
  const a = new Date().getFullYear();
  return `
<div class="page" style="max-width:1820px">
  <div class="page-header">
    <div>
      <div class="page-title">KPIs Financeiros</div>
      <div class="page-sub" id="kpi-sub">Painel de indicadores · ${a}</div>
    </div>
    <div class="header-right">
      <select class="filtro-input" id="kpi-ano">
        ${[a-2,a-1,a,a+1].map(x=>`<option value="${x}" ${x===a?'selected':''}>${x}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="kpi-body"></div>
</div>`;
}

// ── Carregar dados ─────────────────────────────────────────────────────────
async function _carregar() {
  document.getElementById('kpi-body').innerHTML =
    '<div style="padding:40px;text-align:center;color:var(--ds-tx3);font-size:12px;font-weight:600">Carregando...</div>';
  try {
    [_lancamentos, _manuais] = await Promise.all([
      carregarLancamentos(_ano),
      carregarKpiManuais(_ano),
    ]);
    _render();
  } catch (err) {
    document.getElementById('kpi-body').innerHTML =
      `<div style="padding:20px;color:var(--ds-red);font-size:12px">Erro: ${err.message}</div>`;
  }
}

// ── Cálculo DRE por bloco de lançamentos ──────────────────────────────────
function _dre(lancs) {
  const g = fn => lancs.filter(l => l.tipo === 'Gasto'   && fn(l)).reduce((s,l) => s + Math.abs(l.valor||0), 0);
  const r = fn => lancs.filter(l => l.tipo === 'Receita' && fn(l)).reduce((s,l) => s + (l.valor||0), 0);
  const recBruta   = r(() => true);
  const cusDir     = g(l => l.categoria?.startsWith('3.') && !FOLHA_CATS.some(p => l.categoria?.startsWith(p)));
  const folha      = g(l => FOLHA_CATS.some(p => l.categoria?.startsWith(p)));
  const adm        = g(l => l.categoria?.startsWith('4.'));
  const retencoes  = g(l => l.categoria?.startsWith('2.'));
  const capex      = g(l => l.categoria?.startsWith('6.'));
  const material   = g(l => l.categoria?.startsWith('3.1.'));
  const fin5g      = g(l => l.categoria?.startsWith('5.'));
  const fin5r      = r(l => l.categoria?.startsWith('5.'));
  const financeiro = fin5g - fin5r;
  const resultado  = recBruta - cusDir - folha - adm - retencoes - capex - financeiro;
  return { recBruta, cusDir, folha, adm, retencoes, capex, material, financeiro, resultado };
}

// ── Cálculo de cada KPI ───────────────────────────────────────────────────
function _calc(def, dre, man, recMedia) {
  const m   = man || {};
  const has = v => v != null && v !== '' && Number(v) > 0;
  switch (def.key) {
    case 'margemBruta':      return dre.recBruta > 0 ? (dre.recBruta - dre.cusDir - dre.folha) / dre.recBruta * 100 : null;
    case 'margemLiquida':    return dre.recBruta > 0 ? dre.resultado / dre.recBruta * 100 : null;
    case 'cargaTrib':        return dre.recBruta > 0 ? dre.retencoes / dre.recBruta * 100 : null;
    case 'diasCaixa':        return (has(m.saldoCaixa) && dre.adm > 0) ? m.saldoCaixa / (dre.adm / 30) : null;
    case 'pmrKpi':           return has(m.pmr) ? +m.pmr : null;
    case 'cicloFin':         return (has(m.pmr) && has(m.pmp)) ? +m.pmr - +m.pmp : null;
    case 'inadimplencia':    return (has(m.faturasVencidas) && dre.recBruta > 0) ? m.faturasVencidas / dre.recBruta * 100 : null;
    case 'custoFixo':        return dre.recBruta > 0 ? dre.adm / dre.recBruta * 100 : null;
    case 'custoMaterial':    return dre.recBruta > 0 ? dre.material / dre.recBruta * 100 : null;
    case 'coberturaBacklog': return (has(m.backlog) && recMedia > 0) ? m.backlog / recMedia : null;
    case 'concentracao':     return (has(m.receitaMaiorCliente) && dre.recBruta > 0) ? m.receitaMaiorCliente / dre.recBruta * 100 : null;
    case 'desvioForecast':   return (has(m.forecastReceita) && dre.recBruta > 0) ? (dre.recBruta - m.forecastReceita) / m.forecastReceita * 100 : null;
    default: return null;
  }
}

// ── Formatação ────────────────────────────────────────────────────────────
function _fmt(def, val) {
  if (val === null || val === undefined) return '—';
  if (def.fmt === 'pct')        return val.toFixed(1).replace('.',',') + '%';
  if (def.fmt === 'pct-signed') return (val > 0 ? '+' : '') + val.toFixed(1).replace('.',',') + '%';
  if (def.fmt === 'dias')       return Math.round(val) + ' d';
  if (def.fmt === 'meses')      return val.toFixed(1).replace('.',',') + ' m';
  return String(val);
}

// ── Badge colorido ────────────────────────────────────────────────────────
function _badge(def, val) {
  if (val === null || val === undefined) return '<span style="color:var(--ds-tx3)">—</span>';
  const txt = _fmt(def, val);
  let bg, clr;
  const abs = Math.abs(val);
  if (def.dir === 'high') {
    if (val >= def.meta)       { bg='#E6F4EB'; clr='#2D7D46'; }
    else if (val >= def.alerta){ bg='#FEF3DC'; clr='#B8860B'; }
    else                       { bg='#FDECEA'; clr='#C0392B'; }
  } else if (def.dir === 'low') {
    if (val <= def.meta)       { bg='#E6F4EB'; clr='#2D7D46'; }
    else if (val <= def.alerta){ bg='#FEF3DC'; clr='#B8860B'; }
    else                       { bg='#FDECEA'; clr='#C0392B'; }
  } else {
    if (abs <= def.meta)       { bg='#E6F4EB'; clr='#2D7D46'; }
    else if (abs <= def.alerta){ bg='#FEF3DC'; clr='#B8860B'; }
    else                       { bg='#FDECEA'; clr='#C0392B'; }
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-weight:700;font-size:11px;background:${bg};color:${clr}">${txt}</span>`;
}

// ── Render principal ──────────────────────────────────────────────────────
function _render() {
  const dreMes = MESES.map(m => _dre(_lancamentos.filter(l => l.mes === m)));
  const comRec = dreMes.filter(d => d.recBruta > 0);
  const recMedia = comRec.length > 0 ? comRec.reduce((s,d) => s + d.recBruta, 0) / comRec.length : 0;
  const manMes = MESES.map((_, i) => _manuais[`${_ano}-${String(i+1).padStart(2,'0')}`] || {});

  document.getElementById('kpi-body').innerHTML =
    _inputsHtml(manMes) + _kpisHtml(dreMes, manMes, recMedia);

  _bindInputs(dreMes, manMes, recMedia);
}

// ── HTML: inputs manuais ──────────────────────────────────────────────────
function _inputsHtml(manMes) {
  const ths = M3.map(m =>
    `<th style="min-width:108px;text-align:right;padding:5px 6px">${m}</th>`
  ).join('');

  const rows = INPUT_DEFS.map(def => {
    const cells = manMes.map((man, i) => {
      const v = man[def.key] ?? '';
      return `<td style="padding:2px 3px">
        <input type="number" class="kpi-inp"
          data-campo="${def.key}" data-mes="${i}" value="${v}"
          style="width:100%;text-align:right;border:1px solid #D4A017;border-radius:5px;padding:4px 6px;
                 font-size:11px;font-family:var(--ds-font);background:#FFFBF0;color:var(--ds-tx);outline:none;
                 -moz-appearance:textfield" />
      </td>`;
    }).join('');

    const nums  = manMes.map(m => m[def.key]).filter(v => v != null && v !== '' && !isNaN(v));
    const media = nums.length > 0 ? nums.reduce((s,v) => s + Number(v), 0) / nums.length : null;
    const mStr  = media !== null
      ? (def.tipo === 'moeda' ? fmtMfull(media) : Math.round(media).toLocaleString('pt-BR'))
      : '—';

    return `<tr>
      <td style="font-size:11px;padding:5px 10px;font-weight:600;white-space:nowrap;color:var(--ds-tx2)">${def.label}</td>
      ${cells}
      <td style="text-align:right;font-size:11px;font-weight:700;padding:5px 10px;background:var(--ds-bg2)">${mStr}</td>
    </tr>`;
  }).join('');

  return `
<div style="margin-bottom:24px">
  <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:2px solid var(--ds-ylw);margin-bottom:10px">
    <span style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--ds-tx3)">INPUTS MANUAIS</span>
    <span style="font-size:11px;color:var(--ds-tx3)">— preencher todo dia 05 (células amarelas)</span>
    <span id="kpi-status" style="font-size:11px;color:var(--ds-grn);margin-left:auto;font-weight:600"></span>
  </div>
  <div class="tbl-wrap"><div class="tbl-scroll" style="min-width:1100px">
    <table>
      <thead><tr>
        <th style="min-width:260px;text-align:left;padding:5px 10px">Campo</th>
        ${ths}
        <th style="min-width:110px;text-align:right;background:var(--ds-bg2);padding:5px 10px">Média</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div></div>
</div>`;
}

// ── HTML: KPIs calculados ─────────────────────────────────────────────────
function _kpisHtml(dreMes, manMes, recMedia) {
  const ths = M3.map(m =>
    `<th style="min-width:90px;text-align:right;padding:5px 6px">${m}</th>`
  ).join('');

  const rows = _kpiRows(dreMes, manMes, recMedia);

  return `
<div>
  <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:2px solid var(--ds-or);margin-bottom:10px">
    <span style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--ds-tx3)">KPIs — calculados automaticamente</span>
  </div>
  <div class="tbl-wrap"><div class="tbl-scroll" style="min-width:1250px">
    <table>
      <thead><tr>
        <th style="min-width:270px;text-align:left;padding:5px 10px">Indicador</th>
        <th style="min-width:55px;text-align:center;padding:5px 6px;color:var(--ds-grn)">Meta</th>
        <th style="min-width:55px;text-align:center;padding:5px 6px;color:var(--ds-red)">Alerta</th>
        ${ths}
        <th style="min-width:100px;text-align:right;background:var(--ds-bg2);padding:5px 10px">Média</th>
      </tr></thead>
      <tbody id="kpi-tbody">${rows}</tbody>
    </table>
  </div></div>
</div>`;
}

function _kpiRows(dreMes, manMes, recMedia) {
  return KPI_DEFS.map(def => {
    const vals  = dreMes.map((dre, i) => _calc(def, dre, manMes[i], recMedia));
    const cells = vals.map(v =>
      `<td style="text-align:right;padding:4px 6px">${_badge(def, v)}</td>`
    ).join('');
    const nums  = vals.filter(v => v !== null);
    const media = nums.length > 0 ? nums.reduce((s,v) => s + v, 0) / nums.length : null;

    return `<tr>
      <td style="font-size:11px;padding:6px 10px;font-weight:700;white-space:nowrap">${def.label}</td>
      <td style="text-align:center;padding:5px 6px">
        <span style="font-size:11px;font-weight:700;color:var(--ds-grn)">${def.metaLbl}</span></td>
      <td style="text-align:center;padding:5px 6px">
        <span style="font-size:11px;font-weight:700;color:var(--ds-red)">${def.alertaLbl}</span></td>
      ${cells}
      <td style="text-align:right;padding:5px 10px;background:var(--ds-bg2)">${_badge(def, media)}</td>
    </tr>`;
  }).join('');
}

// ── Bind inputs ───────────────────────────────────────────────────────────
function _bindInputs(dreMes, manMes, recMedia) {
  document.querySelectorAll('.kpi-inp').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = +inp.dataset.mes;
      clearTimeout(_saveTimers[idx]);
      _saveTimers[idx] = setTimeout(() => _salvar(idx, dreMes, manMes, recMedia), 900);
    });
  });
}

async function _salvar(mesIdx, dreMes, manMes, recMedia) {
  const statusEl = document.getElementById('kpi-status');
  const docId    = `${_ano}-${String(mesIdx+1).padStart(2,'0')}`;
  const dados    = { ano: _ano, mes: MESES[mesIdx] };

  INPUT_DEFS.forEach(def => {
    const el = document.querySelector(`.kpi-inp[data-campo="${def.key}"][data-mes="${mesIdx}"]`);
    const v  = el?.value.trim();
    dados[def.key] = (v !== '' && v != null) ? Number(v) : null;
  });

  if (statusEl) statusEl.textContent = `Salvando ${MESES[mesIdx]}...`;
  try {
    await salvarKpiManual(docId, dados);
    _manuais[docId] = { id: docId, ...dados };
    manMes[mesIdx]  = dados;

    const tbody = document.getElementById('kpi-tbody');
    if (tbody) tbody.innerHTML = _kpiRows(dreMes, manMes, recMedia);

    if (statusEl) {
      statusEl.textContent = `✓ ${MESES[mesIdx]} salvo`;
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = '✕ Erro ao salvar';
  }
}
