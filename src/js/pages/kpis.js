import { carregarLancamentos } from '../db.js';
import { fmtMfull } from '../utils.js';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const FOLHA_CATS = ['3.2.900','3.2.901','3.2.902','3.2.903'];

let _lancamentos = [];
let _ano = new Date().getFullYear();

export async function mount(container, perfil) {
  _ano = new Date().getFullYear();
  container.innerHTML = _html();
  document.getElementById('kpi-ano').addEventListener('change', async () => {
    _ano = +document.getElementById('kpi-ano').value;
    await _carregar();
  });
  await _carregar();
}

export function destroy() { _lancamentos = []; }

function _html() {
  const a = new Date().getFullYear();
  return `
<div class="page" style="max-width:1500px">
  <div class="page-header">
    <div>
      <div class="page-title">KPIs</div>
      <div class="page-sub">Dashboard de indicadores mensais · ${_ano}</div>
    </div>
    <div class="header-right">
      <select class="filtro-input" id="kpi-ano">
        ${[a-1,a,a+1].map(x=>`<option value="${x}" ${x===a?'selected':''}>${x}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="kpi-body"></div>
</div>`;
}

async function _carregar() {
  document.getElementById('kpi-body').innerHTML =
    '<div class="bd-loading"><div class="spinner" style="display:block;width:20px;height:20px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--mu);font-weight:600">Carregando...</div></div>';
  try {
    _lancamentos = await carregarLancamentos(_ano);
    _render();
  } catch (err) {
    document.getElementById('kpi-body').innerHTML =
      `<div class="msg erro visivel"><span>✕</span><span>Erro: ${err.message}</span></div>`;
  }
}

function _calc(lancs) {
  const gasto = (fn) => lancs.filter(l => l.tipo==='Gasto' && fn(l)).reduce((s,l) => s+Math.abs(l.valor||0), 0);
  const rec   = (fn) => lancs.filter(l => l.tipo==='Receita' && fn(l)).reduce((s,l) => s+(l.valor||0), 0);

  const recBruta  = rec(() => true);
  const cusDir    = gasto(l => l.categoria?.startsWith('3.') && !FOLHA_CATS.some(p => l.categoria.startsWith(p)));
  const folha     = gasto(l => FOLHA_CATS.some(p => l.categoria?.startsWith(p)));
  const adm       = gasto(l => l.categoria?.startsWith('4.'));
  const retencoes = gasto(l => l.categoria?.startsWith('2.'));
  const capex     = gasto(l => l.categoria?.startsWith('6.'));
  const fin5g     = gasto(l => l.categoria?.startsWith('5.'));
  const fin5r     = rec(l  => l.categoria?.startsWith('5.'));
  const financeiro = fin5g - fin5r;
  const margemBruta  = recBruta > 0 ? (recBruta - cusDir - folha) / recBruta * 100 : null;
  const resultado    = recBruta - cusDir - folha - adm - retencoes - capex - financeiro;
  const margemOp     = recBruta > 0 ? resultado / recBruta * 100 : null;
  return { recBruta, cusDir, folha, adm, retencoes, capex, financeiro, margemBruta, resultado, margemOp };
}

function _render() {
  const mData = MESES.map(m => _calc(_lancamentos.filter(l => l.mes === m)));
  const tot   = _calc(_lancamentos);

  const fG = v => v ? `(${fmtMfull(v)})` : '—';
  const fR = v => v ? fmtMfull(v) : '—';
  const fP = v => v != null ? v.toFixed(1).replace('.',',') + '%' : '0,0%';
  const cor = (v, thr1=35, thr2=20) => v>=thr1 ? 'var(--verde)' : v>=thr2 ? 'var(--amb)' : 'var(--vermelho)';

  const th = MESES.map(m=>`<th style="min-width:90px;text-align:right">${m.slice(0,3).toUpperCase()}</th>`).join('') +
             `<th style="min-width:110px;text-align:right;background:var(--sf2)">TOTAL</th>`;

  const row = (label, key, fmt, corFn, bold=false) => {
    const cells = mData.map(d => {
      const v = d[key]; const t = typeof v === 'number';
      const c = corFn && t ? `color:${corFn(v)}` : '';
      return `<td style="text-align:right;font-size:11px;${c}">${t ? fmt(v) : '—'}</td>`;
    }).join('');
    const tv = tot[key]; const tc = corFn && typeof tv==='number' ? `color:${corFn(tv)}` : '';
    return `<tr${bold?' style="background:var(--sf)"':''}>
      <td style="font-size:11px;padding:6px 10px;font-weight:${bold?'800':'600'}">${label}</td>
      ${cells}
      <td style="text-align:right;font-size:11px;font-weight:800;background:var(--sf2);${tc}">${typeof tv==='number'?fmt(tv):'—'}</td>
    </tr>`;
  };

  const sep = (label) => `<tr style="background:var(--sf2)">
    <td colspan="14" style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mu);padding:5px 10px">${label}</td>
  </tr>`;

  document.getElementById('kpi-body').innerHTML = `
    <div class="tbl-wrap"><div class="tbl-scroll" style="min-width:1100px">
      <table>
        <thead><tr>
          <th style="min-width:220px;text-align:left">Indicador</th>${th}
        </tr></thead>
        <tbody>
          ${sep('Receita')}
          ${row('★ Receita Bruta', 'recBruta', fR, null, true)}
          ${sep('Custos e Despesas Operacionais')}
          ${row('Custos Diretos (3.x)', 'cusDir', fG)}
          ${row('Folha Operacional (3.2.9xx)', 'folha', fG)}
          ${row('★ Margem Bruta %', 'margemBruta', fP, v=>cor(v,60,40), true)}
          ${row('Despesas ADM (4.x)', 'adm', fG)}
          ${row('Retenções na Fonte (2.x)', 'retencoes', fG)}
          ${row('CAPEX (6.x)', 'capex', fG)}
          ${row('Financeiro líq. (5.x)', 'financeiro', v => v>0?fG(v):v<0?fR(-v):'—')}
          ${sep('Resultado')}
          ${row('Resultado Operacional', 'resultado', v => v>=0?fR(v):fG(-v), v=>v>=0?'var(--verde)':'var(--vermelho)', true)}
          ${row('Margem Operacional %', 'margemOp', fP, v=>cor(v,30,15), true)}
        </tbody>
      </table>
    </div></div>`;
}
