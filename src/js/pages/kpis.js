import { carregarLancamentos, carregarKpiManuais, salvarKpiManual,
         carregarKpiConfig, salvarKpiConfig, carregarContratos } from '../db.js';
import { fmtMfull } from '../utils.js';

const MESES  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const M3     = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const FOLHA_CATS = ['3.2.900','3.2.901','3.2.902','3.2.903'];

const INPUT_DEFS = [
  { key:'saldoCaixa',          label:'Saldo de Caixa fim do mês (R$)',  tipo:'moeda'  },
  { key:'pmr',                 label:'PMR — dias (contas a receber)',     tipo:'numero' },
  { key:'pmp',                 label:'PMP — dias (contas a pagar)',       tipo:'numero' },
  { key:'faturasVencidas',     label:'Faturas Vencidas (R$)',            tipo:'moeda'  },
  { key:'receitaMaiorCliente', label:'Receita do Maior Cliente (R$)',     tipo:'moeda'  },
  { key:'forecastReceita',     label:'Forecast de Receita do mês (R$)',  tipo:'moeda'  },
];

// dir:'high' = maior é melhor | dir:'low' = menor é melhor | dir:'range' = abs(val) vs meta
const KPI_DEFS = [
  { key:'margemBruta',      label:'Margem Bruta — (RL−CD)/RB',      metaPre:'>',  metaSuf:'%', alertaPre:'<',  alertaSuf:'%', dir:'high', meta:40,  alerta:32,  fmt:'pct'        },
  { key:'margemLiquida',    label:'Margem Líquida',                   metaPre:'>',  metaSuf:'%', alertaPre:'<',  alertaSuf:'%', dir:'high', meta:28,  alerta:20,  fmt:'pct'        },
  { key:'cargaTrib',        label:'Carga Tributária / Receita',       metaPre:'<',  metaSuf:'%', alertaPre:'>',  alertaSuf:'%', dir:'low',  meta:10,  alerta:12,  fmt:'pct'        },
  { key:'diasCaixa',        label:'Dias de Caixa (base custo fixo)', metaPre:'>',  metaSuf:'',  alertaPre:'<',  alertaSuf:'',  dir:'high', meta:90,  alerta:45,  fmt:'dias'       },
  { key:'pmrKpi',           label:'PMR — Prazo Médio Recebimento',   metaPre:'≤',  metaSuf:'',  alertaPre:'>',  alertaSuf:'',  dir:'low',  meta:60,  alerta:75,  fmt:'dias'       },
  { key:'cicloFin',         label:'Ciclo Financeiro (PMR − PMP)',    metaPre:'<',  metaSuf:'',  alertaPre:'>',  alertaSuf:'',  dir:'low',  meta:30,  alerta:45,  fmt:'dias'       },
  { key:'inadimplencia',    label:'Inadimplência',                    metaPre:'<',  metaSuf:'%', alertaPre:'>',  alertaSuf:'%', dir:'low',  meta:5,   alerta:10,  fmt:'pct'        },
  { key:'custoFixo',        label:'Custo Fixo / Receita',            metaPre:'<',  metaSuf:'%', alertaPre:'>',  alertaSuf:'%', dir:'low',  meta:30,  alerta:40,  fmt:'pct'        },
  { key:'custoMaterial',    label:'Custo de Material / Receita',     metaPre:'<',  metaSuf:'%', alertaPre:'>',  alertaSuf:'%', dir:'low',  meta:25,  alerta:32,  fmt:'pct'        },
  { key:'coberturaBacklog', label:'Cobertura de Backlog (meses)',     metaPre:'>',  metaSuf:'',  alertaPre:'<',  alertaSuf:'',  dir:'high', meta:18,  alerta:10,  fmt:'meses'      },
  { key:'concentracao',     label:'Concentração — Maior Cliente',    metaPre:'<',  metaSuf:'%', alertaPre:'>',  alertaSuf:'%', dir:'low',  meta:25,  alerta:40,  fmt:'pct'        },
  { key:'desvioForecast',   label:'Desvio Forecast vs Realizado',    metaPre:'±',  metaSuf:'%', alertaPre:'±',  alertaSuf:'%', dir:'range',meta:10,  alerta:20,  fmt:'pct-signed' },
];

let _lancamentos = [];
let _manuais     = {};
let _config      = {};
let _contratos   = [];
let _ano         = new Date().getFullYear();
let _saveTimers  = {};
let _cfgTimer    = null;

// ── Effective meta / alerta (default do KPI_DEF ou override do usuário) ──
function _em(def) { return _config[def.key]?.meta   ?? def.meta;   }
function _ea(def) { return _config[def.key]?.alerta ?? def.alerta; }

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
  clearTimeout(_cfgTimer);
  _saveTimers = {};
}

function _shell() {
  const a = new Date().getFullYear();
  return `
<div class="page" style="max-width:1820px">
  <div class="page-header">
    <div>
      <div class="page-title">KPIs Financeiros <span style="font-size:10px;color:var(--ds-tx3);font-weight:400">[v3]</span></div>
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

async function _carregar() {
  document.getElementById('kpi-body').innerHTML =
    '<div style="padding:40px;text-align:center;color:var(--ds-tx3);font-size:12px;font-weight:600">Carregando...</div>';
  try {
    [_lancamentos, _manuais, _config, _contratos] = await Promise.all([
      carregarLancamentos(_ano),
      carregarKpiManuais(_ano),
      carregarKpiConfig(),
      carregarContratos(),
    ]);
    _render();
  } catch (err) {
    document.getElementById('kpi-body').innerHTML =
      `<div style="padding:20px;color:var(--ds-red);font-size:12px">Erro: ${err.message}</div>`;
  }
}

// ── DRE por bloco de lançamentos ─────────────────────────────────────────
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

// ── Backlog calculado por mês (saldo dos contratos ativos no fim do mês) ─
function _backlogMes(contratos, lancsAno, ano) {
  const hoje      = new Date();
  const mesAtual  = (ano === hoje.getFullYear()) ? hoje.getMonth() : 11;
  const ativos    = contratos.filter(c => c.status === 'ativo' && (c.valorTotal || 0) > 0);

  // Receitas do ano agrupadas por numContrato e índice do mês
  const recMes = {}; // { numContrato: { mesIdx: valor } }
  lancsAno.filter(l => l.tipo === 'Receita' && l.contrato).forEach(l => {
    const mi = MESES.indexOf(l.mes);
    if (mi < 0) return;
    if (!recMes[l.contrato]) recMes[l.contrato] = {};
    recMes[l.contrato][mi] = (recMes[l.contrato][mi] || 0) + (l.valor || 0);
  });

  return MESES.map((_, mi) => {
    return ativos.reduce((total, c) => {
      // Ignora contratos que ainda não iniciaram neste mês
      if (c.inicio) {
        const iniDate = new Date(c.inicio + 'T00:00:00');
        const fimMes  = new Date(ano, mi + 1, 0);
        if (iniDate > fimMes) return total;
      }
      const saldoAtual = Math.max(0, (c.valorTotal || 0) - (c.valorFaturado || 0));
      if (mi >= mesAtual) {
        // Mês atual ou futuro: usa saldo corrente
        return total + saldoAtual;
      } else {
        // Mês passado: acrescenta receitas que ainda não tinham sido faturadas
        const recApos = Object.entries(recMes[c.numContrato] || {})
          .filter(([idx]) => +idx > mi)
          .reduce((s, [, v]) => s + v, 0);
        return total + Math.max(0, saldoAtual + recApos);
      }
    }, 0);
  });
}

// ── Cálculo de cada KPI ───────────────────────────────────────────────────
function _calc(def, dre, man, recMedia, backlog) {
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
    case 'coberturaBacklog': return (backlog > 0 && recMedia > 0) ? backlog / recMedia : null;
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

// ── Badge colorido (usa effective meta/alerta) ────────────────────────────
function _badge(def, val) {
  if (val === null || val === undefined) return '<span style="color:var(--ds-tx3)">—</span>';
  const em = _em(def), ea = _ea(def);
  const abs = Math.abs(val);
  let bg, clr;
  if (def.dir === 'high') {
    if (val >= em)       { bg='#E6F4EB'; clr='#2D7D46'; }
    else if (val >= ea)  { bg='#FEF3DC'; clr='#B8860B'; }
    else                 { bg='#FDECEA'; clr='#C0392B'; }
  } else if (def.dir === 'low') {
    if (val <= em)       { bg='#E6F4EB'; clr='#2D7D46'; }
    else if (val <= ea)  { bg='#FEF3DC'; clr='#B8860B'; }
    else                 { bg='#FDECEA'; clr='#C0392B'; }
  } else {
    if (abs <= em)       { bg='#E6F4EB'; clr='#2D7D46'; }
    else if (abs <= ea)  { bg='#FEF3DC'; clr='#B8860B'; }
    else                 { bg='#FDECEA'; clr='#C0392B'; }
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-weight:700;font-size:11px;background:${bg};color:${clr}">${_fmt(def, val)}</span>`;
}

// ── Célula editável de meta ou alerta ─────────────────────────────────────
function _cfgCell(def, tipo) {
  const isM  = tipo === 'meta';
  const val  = isM ? _em(def) : _ea(def);
  const pre  = isM ? def.metaPre  : def.alertaPre;
  const suf  = isM ? def.metaSuf  : def.alertaSuf;
  const clr  = isM ? '#2D7D46' : '#C0392B';
  const bg   = isM ? '#E6F4EB' : '#FDECEA';
  return `<td style="text-align:center;padding:3px 5px;vertical-align:middle">
    <div style="display:inline-flex;align-items:center;gap:1px;font-size:11px;font-weight:700;color:${clr}">
      <span style="display:inline-block;width:14px;text-align:right">${pre}</span>
      <input type="number" class="kpi-cfg"
        data-key="${def.key}" data-tipo="${tipo}" value="${val}"
        title="Editar valor"
        style="width:42px;text-align:center;padding:3px 4px;
               border:1px solid ${clr};border-radius:4px;
               background:${bg};color:${clr};font-weight:700;font-size:11px;
               font-family:var(--ds-font);outline:none;
               appearance:textfield;-moz-appearance:textfield;-webkit-appearance:textfield;" />
      <span style="display:inline-block;width:12px;text-align:left">${suf}</span>
    </div>
  </td>`;
}

// ── Render principal ──────────────────────────────────────────────────────
function _render() {
  const dreMes   = MESES.map(m => _dre(_lancamentos.filter(l => l.mes === m)));
  const comRec   = dreMes.filter(d => d.recBruta > 0);
  const recMedia = comRec.length > 0 ? comRec.reduce((s,d) => s + d.recBruta, 0) / comRec.length : 0;
  const manMes   = MESES.map((_, i) => _manuais[`${_ano}-${String(i+1).padStart(2,'0')}`] || {});
  const backlogMes = _backlogMes(_contratos, _lancamentos, _ano);

  document.getElementById('kpi-body').innerHTML =
    _inputsHtml(manMes, backlogMes) + _kpisHtml(dreMes, manMes, recMedia, backlogMes);

  _bindInputs(dreMes, manMes, recMedia, backlogMes);
  _bindCfgInputs(dreMes, manMes, recMedia, backlogMes);
}

// ── HTML: inputs manuais ──────────────────────────────────────────────────
function _inputsHtml(manMes, backlogMes) {
  const ths = M3.map(m =>
    `<th style="min-width:108px;text-align:right;padding:5px 6px">${m}</th>`
  ).join('');

  const rows = INPUT_DEFS.map(def => {
    const cells = manMes.map((man, i) => {
      const v = man[def.key] ?? '';
      return `<td style="padding:2px 3px">
        <input type="number" class="kpi-inp"
          data-campo="${def.key}" data-mes="${i}" value="${v}"
          style="width:100%;text-align:right;border:1px solid #D4A017;border-radius:5px;
                 padding:4px 6px;font-size:11px;font-family:var(--ds-font);
                 background:#FFFBF0;color:var(--ds-tx);outline:none;-moz-appearance:textfield" />
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
      <tbody>
        ${rows}
        <tr style="background:var(--ds-bg2)">
          <td style="font-size:11px;padding:5px 10px;font-weight:600;color:var(--ds-tx2);white-space:nowrap">
            Backlog — carteira a executar (R$)
            <span style="font-size:9px;font-weight:400;color:var(--ds-tx3);margin-left:6px">calculado automaticamente</span>
          </td>
          ${backlogMes.map(v => `<td style="text-align:right;font-size:11px;font-weight:600;padding:5px 6px;color:var(--ds-blu)">${v > 0 ? fmtMfull(v) : '—'}</td>`).join('')}
          <td style="text-align:right;font-size:11px;font-weight:700;padding:5px 10px;background:var(--ds-bg3)">
            ${(()=>{ const s=backlogMes.filter(v=>v>0); return s.length ? fmtMfull(s.reduce((a,b)=>a+b,0)/s.length) : '—'; })()}
          </td>
        </tr>
      </tbody>
    </table>
  </div></div>
</div>`;
}

// ── HTML: KPIs calculados ─────────────────────────────────────────────────
function _kpisHtml(dreMes, manMes, recMedia, backlogMes) {
  const ths = M3.map(m =>
    `<th style="min-width:90px;text-align:right;padding:5px 6px">${m}</th>`
  ).join('');

  return `
<div>
  <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:2px solid var(--ds-or);margin-bottom:10px">
    <span style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--ds-tx3)">KPIs — calculados automaticamente</span>
    <span style="font-size:11px;color:var(--ds-tx3);margin-left:auto">Meta e Alerta editáveis — salvo automaticamente</span>
  </div>
  <div class="tbl-wrap"><div class="tbl-scroll" style="min-width:1250px">
    <table>
      <thead><tr>
        <th style="min-width:270px;text-align:left;padding:5px 10px">Indicador</th>
        <th style="min-width:80px;text-align:center;padding:5px 6px;color:#2D7D46">
          Meta<br><span style="font-size:9px;font-weight:400;color:var(--ds-tx3)">editável</span></th>
        <th style="min-width:80px;text-align:center;padding:5px 6px;color:#C0392B">
          Alerta<br><span style="font-size:9px;font-weight:400;color:var(--ds-tx3)">editável</span></th>
        ${ths}
        <th style="min-width:100px;text-align:right;background:var(--ds-bg2);padding:5px 10px">Média</th>
      </tr></thead>
      <tbody id="kpi-tbody">${_kpiRows(dreMes, manMes, recMedia, backlogMes)}</tbody>
    </table>
  </div></div>
</div>`;
}

function _kpiRows(dreMes, manMes, recMedia, backlogMes) {
  return KPI_DEFS.map(def => {
    const vals  = dreMes.map((dre, i) => _calc(def, dre, manMes[i], recMedia, backlogMes[i]));
    const cells = vals.map(v =>
      `<td style="text-align:right;padding:4px 6px">${_badge(def, v)}</td>`
    ).join('');
    const nums  = vals.filter(v => v !== null);
    const media = nums.length > 0 ? nums.reduce((s,v) => s + v, 0) / nums.length : null;

    return `<tr>
      <td style="font-size:11px;padding:6px 10px;font-weight:700;white-space:nowrap">${def.label}</td>
      ${_cfgCell(def, 'meta')}
      ${_cfgCell(def, 'alerta')}
      ${cells}
      <td style="text-align:right;padding:5px 10px;background:var(--ds-bg2)">${_badge(def, media)}</td>
    </tr>`;
  }).join('');
}

// ── Bind: inputs manuais ──────────────────────────────────────────────────
function _bindInputs(dreMes, manMes, recMedia, backlogMes) {
  document.querySelectorAll('.kpi-inp').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = +inp.dataset.mes;
      clearTimeout(_saveTimers[idx]);
      _saveTimers[idx] = setTimeout(() => _salvarManual(idx, dreMes, manMes, recMedia, backlogMes), 900);
    });
  });
}

async function _salvarManual(mesIdx, dreMes, manMes, recMedia, backlogMes) {
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
    if (tbody) { tbody.innerHTML = _kpiRows(dreMes, manMes, recMedia, backlogMes); _bindCfgInputs(dreMes, manMes, recMedia, backlogMes); }
    if (statusEl) { statusEl.textContent = `✓ ${MESES[mesIdx]} salvo`; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000); }
  } catch (err) {
    if (statusEl) statusEl.textContent = '✕ Erro ao salvar';
  }
}

// ── Bind: células de meta/alerta editáveis ────────────────────────────────
function _bindCfgInputs(dreMes, manMes, recMedia, backlogMes) {
  document.querySelectorAll('.kpi-cfg').forEach(inp => {
    inp.addEventListener('change', () => {
      const key  = inp.dataset.key;
      const tipo = inp.dataset.tipo;
      if (!_config[key]) _config[key] = {};
      _config[key][tipo] = Number(inp.value);

      const tbody = document.getElementById('kpi-tbody');
      if (tbody) { tbody.innerHTML = _kpiRows(dreMes, manMes, recMedia, backlogMes); _bindCfgInputs(dreMes, manMes, recMedia, backlogMes); }

      clearTimeout(_cfgTimer);
      _cfgTimer = setTimeout(async () => {
        try { await salvarKpiConfig(_config); }
        catch (e) { console.error('Erro ao salvar config KPI:', e); }
      }, 1200);
    });
  });
}
