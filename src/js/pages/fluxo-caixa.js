import { carregarLancamentos, carregarContratos } from '../db.js';
import { fmtMfull } from '../utils.js';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const FOLHA_CATS = ['3.2.900','3.2.901','3.2.902','3.2.903'];

let _lancamentos = [];
let _contratos   = [];
let _ano = new Date().getFullYear();

export async function mount(container, perfil) {
  _ano = new Date().getFullYear();
  container.innerHTML = _html();
  document.getElementById('fc-ano').addEventListener('change', async () => {
    _ano = +document.getElementById('fc-ano').value;
    await _carregar();
  });
  await _carregar();
}

export function destroy() { _lancamentos = []; _contratos = []; }

function _html() {
  const a = new Date().getFullYear();
  return `
<div class="page" style="max-width:1600px">
  <div class="page-header">
    <div>
      <div class="page-title">Fluxo de Caixa</div>
      <div class="page-sub">Entradas e saídas mensais por origem · ${_ano}</div>
    </div>
    <div class="header-right">
      <select class="filtro-input" id="fc-ano">
        ${[a-1,a,a+1].map(x=>`<option value="${x}" ${x===a?'selected':''}>${x}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="fc-body"></div>
</div>`;
}

async function _carregar() {
  document.getElementById('fc-body').innerHTML =
    '<div class="bd-loading"><div class="spinner" style="display:block;width:20px;height:20px;margin:0 auto 8px"></div><div style="font-size:11px;color:var(--mu);font-weight:600">Carregando...</div></div>';
  try {
    [_lancamentos, _contratos] = await Promise.all([
      carregarLancamentos(_ano),
      carregarContratos(),
    ]);
    _render();
  } catch (err) {
    document.getElementById('fc-body').innerHTML =
      `<div class="msg erro visivel"><span>✕</span><span>Erro: ${err.message}</span></div>`;
  }
}

// Soma por filtro em determinado mês (ou todos se mes=null)
function soma(lancs, pred) {
  return lancs.filter(pred).reduce((s,l) => s + (l.valor||0), 0);
}
function somaAbs(lancs, pred) {
  return lancs.filter(pred).reduce((s,l) => s + Math.abs(l.valor||0), 0);
}

function _render() {
  const contratoMap = {};
  _contratos.forEach(c => { contratoMap[c.ccCodigo] = c.cliente; });

  // CCs clientes com alguma movimentação
  const ccsCli = [...new Set(_lancamentos
    .filter(l => (l.cc||'').startsWith('CC-CLI'))
    .map(l => l.cc))].sort();

  const clienteNome = cc => contratoMap[cc] || cc;

  // Por mês
  const porMes = m => _lancamentos.filter(l => l.mes === m);
  const total  = _lancamentos;

  const fR = v => v ? fmtMfull(v)  : '—';
  const fG = v => v ? `(${fmtMfull(v)})` : '—';

  // Cabeçalho
  const thMeses = MESES.map(m => `<th style="min-width:90px;text-align:right">${m.slice(0,3).toUpperCase()}</th>`).join('') +
                  `<th style="min-width:110px;text-align:right;background:var(--sf2)">TOTAL ANO</th>`;

  // Helpers de linha
  const rowSep = (label, cor='var(--sf2)') =>
    `<tr style="background:${cor}"><td colspan="14" style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--mu);padding:5px 10px">${label}</td></tr>`;

  const rowData = (label, valMes, valTotal, fmtFn, bold=false, isPos=true) =>
    `<tr${bold?' style="background:var(--sf)"':''}>
      <td style="font-size:11px;padding:5px 10px;font-weight:${bold?'800':'400'};padding-left:${bold?'10':'22'}px">${label}</td>
      ${valMes.map(v=>`<td style="text-align:right;font-size:11px;color:${v!==0?(isPos?'var(--verde)':'var(--vermelho)'):'inherit'}">${fmtFn(v)}</td>`).join('')}
      <td style="text-align:right;font-size:11px;font-weight:800;background:var(--sf2);color:${valTotal!==0?(isPos?'var(--verde)':'var(--vermelho)'):'inherit'}">${fmtFn(valTotal)}</td>
    </tr>`;

  const rowPct = (label, numMes, denMes, numTotal, denTotal) =>
    `<tr style="background:var(--sf)">
      <td style="font-size:11px;padding:5px 10px;font-weight:800">${label}</td>
      ${numMes.map((n,i)=>{const pct=denMes[i]>0?n/denMes[i]*100:null; return `<td style="text-align:right;font-size:11px;font-weight:700;color:${pct!=null?(pct>=50?'var(--verde)':pct>=30?'var(--amb)':'var(--vermelho)'):'inherit'}">${pct!=null?pct.toFixed(1).replace('.',',')+' %':'—'}</td>`;}).join('')}
      ${(()=>{const pct=denTotal>0?numTotal/denTotal*100:null; return `<td style="text-align:right;font-size:11px;font-weight:800;background:var(--sf2);color:${pct!=null?(pct>=50?'var(--verde)':pct>=30?'var(--amb)':'var(--vermelho)'):'inherit'}">${pct!=null?pct.toFixed(1).replace('.',',')+' %':'—'}</td>`;})()}
    </tr>`;

  // ── RECEITAS por CC-CLI ──────────────────────────────
  const recRows = ccsCli.map(cc => {
    const vm = MESES.map(m => soma(porMes(m), l => l.tipo==='Receita' && l.cc===cc));
    const vt = soma(total, l => l.tipo==='Receita' && l.cc===cc);
    return rowData(clienteNome(cc), vm, vt, fR, false, true);
  });

  // Receitas financeiras
  const recFinMes = MESES.map(m => soma(porMes(m), l => l.tipo==='Receita' && l.categoria?.startsWith('5.')));
  const recFinTot = soma(total, l => l.tipo==='Receita' && l.categoria?.startsWith('5.'));

  // Totais receita
  const recTotMes = MESES.map(m => soma(porMes(m), l => l.tipo==='Receita'));
  const recTotAno = soma(total, l => l.tipo==='Receita');

  // ── RETENÇÕES ───────────────────────────────────────
  const retDefs = [
    { label:'ISS Retido',      cat:'2.1.001' },
    { label:'INSS Retido',     cat:'2.1.002' },
    { label:'IRRF Retido',     cat:'2.1.003' },
    { label:'PCC/CSRF Retido', cat:'2.1.004' },
  ];
  const retRows = retDefs.map(r => {
    const vm = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat)));
    const vt = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat));
    return rowData(r.label, vm, vt, fG, false, false);
  });
  const retTotMes = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith('2.')));
  const retTotAno = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith('2.'));

  // ── CUSTOS DIRETOS por CC-CLI ────────────────────────
  const cusDirRows = ccsCli.map(cc => {
    const vm = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.cc===cc && l.categoria?.startsWith('3.') && !FOLHA_CATS.some(p=>l.categoria.startsWith(p))));
    const vt = somaAbs(total, l => l.tipo==='Gasto' && l.cc===cc && l.categoria?.startsWith('3.') && !FOLHA_CATS.some(p=>l.categoria.startsWith(p)));
    return rowData(clienteNome(cc), vm, vt, fG, false, false);
  });
  const cusTotMes = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith('3.') && !FOLHA_CATS.some(p=>l.categoria.startsWith(p))));
  const cusTotAno = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith('3.') && !FOLHA_CATS.some(p=>l.categoria.startsWith(p)));

  // ── DESPESAS ADM ─────────────────────────────────────
  const admDefs = [
    { label:'Pessoal ADM (4.1)',          cat:'4.1' },
    { label:'Estrutura / Infra (4.2)',     cat:'4.2' },
    { label:'Serviços Profissionais (4.3)',cat:'4.3' },
    { label:'Comercial / Licitação (4.4)', cat:'4.4' },
    { label:'Material Escritório (4.5)',   cat:'4.5' },
  ];
  const admRows = admDefs.map(r => {
    const vm = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat)));
    const vt = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat));
    return rowData(r.label, vm, vt, fG, false, false);
  });
  const admTotMes = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith('4.')));
  const admTotAno = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith('4.'));

  // ── FOLHA OPERACIONAL ────────────────────────────────
  const folhaDefs = [
    { label:'Folha Bruta (3.2.900)',        cat:'3.2.900' },
    { label:'Encargos INSS/FGTS (3.2.901)',cat:'3.2.901' },
    { label:'Benefícios VA/VT (3.2.902)',   cat:'3.2.902' },
    { label:'Horas Extras (3.2.903)',       cat:'3.2.903' },
  ];
  const folhaRows = folhaDefs.map(r => {
    const vm = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat)));
    const vt = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat));
    return rowData(r.label, vm, vt, fG, false, false);
  });
  const folhaTotMes = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && FOLHA_CATS.some(p=>l.categoria?.startsWith(p))));
  const folhaTotAno = somaAbs(total, l => l.tipo==='Gasto' && FOLHA_CATS.some(p=>l.categoria?.startsWith(p)));

  // ── CAPEX ────────────────────────────────────────────
  const capexMes = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith('6.')));
  const capexAno = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith('6.'));

  // ── FINANCEIRO LÍQUIDO ───────────────────────────────
  const finDefs = [
    { label:'Tarifas Bancárias (5.1.001)', cat:'5.1.001' },
    { label:'Juros / Encargos (5.1.002)',  cat:'5.1.002' },
  ];
  const finRows = finDefs.map(r => {
    const vm = MESES.map(m => somaAbs(porMes(m), l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat)));
    const vt = somaAbs(total, l => l.tipo==='Gasto' && l.categoria?.startsWith(r.cat));
    return rowData(r.label, vm, vt, fG, false, false);
  });
  const finRecMes = MESES.map(m => soma(porMes(m), l => l.tipo==='Receita' && l.categoria?.startsWith('5.')));
  const finRecAno = soma(total, l => l.tipo==='Receita' && l.categoria?.startsWith('5.'));
  const finTotMes = MESES.map((_,i) =>
    somaAbs(_lancamentos.filter(l=>l.mes===MESES[i]), l=>l.tipo==='Gasto'&&l.categoria?.startsWith('5.')) - finRecMes[i]);
  const finTotAno = somaAbs(total, l=>l.tipo==='Gasto'&&l.categoria?.startsWith('5.')) - finRecAno;

  // ── SALDO FINAL ──────────────────────────────────────
  const saldoMes = MESES.map((_,i) =>
    recTotMes[i] - retTotMes[i] - cusTotMes[i] - admTotMes[i] - folhaTotMes[i] - capexMes[i] - finTotMes[i]);
  const saldoAno = recTotAno - retTotAno - cusTotAno - admTotAno - folhaTotAno - capexAno - finTotAno;

  document.getElementById('fc-body').innerHTML = `
    <div class="tbl-wrap"><div class="tbl-scroll" style="min-width:1200px">
      <table>
        <thead><tr>
          <th style="min-width:240px;text-align:left">Linha</th>${thMeses}
        </tr></thead>
        <tbody>
          ${rowSep('Receitas')}
          ${recRows.join('')}
          ${recFinTot > 0 ? rowData('Receitas Financeiras (5.2)', recFinMes, recFinTot, fR, false, true) : ''}
          ${rowData('RECEITA TOTAL', recTotMes, recTotAno, fR, true, true)}

          ${rowSep('(−) Retenções na Fonte')}
          ${retRows.join('')}
          ${rowData('TOTAL RETENÇÕES', retTotMes, retTotAno, fG, true, false)}

          ${rowSep('(−) Custos Diretos (3.x)')}
          ${cusDirRows.join('')}
          ${rowData('TOTAL CUSTOS DIRETOS', cusTotMes, cusTotAno, fG, true, false)}

          ${rowSep('(−) Despesas Administrativas (4.x)')}
          ${admRows.join('')}
          ${rowData('TOTAL ADM', admTotMes, admTotAno, fG, true, false)}

          ${rowSep('(−) Folha Operacional (3.2.9xx)')}
          ${folhaRows.join('')}
          ${rowData('TOTAL FOLHA', folhaTotMes, folhaTotAno, fG, true, false)}

          ${(capexAno > 0) ? rowSep('(−) CAPEX (6.x)') + rowData('Investimentos / Imobilizado', capexMes, capexAno, fG, true, false) : ''}

          ${rowSep('(−) Financeiro (5.1.x)')}
          ${finRows.join('')}
          ${finRecAno !== 0 ? rowData('(+) Receitas Financeiras', finRecMes, finRecAno, fR, false, true) : ''}
          ${rowData('FINANCEIRO LÍQUIDO', finTotMes, finTotAno, v => v>0?fG(v):v<0?fR(-v):'—', true, false)}

          ${rowSep('Resultado', '#1a1a1a')}
          <tr style="background:var(--sf)">
            <td style="font-size:12px;padding:8px 10px;font-weight:800">SALDO DO PERÍODO</td>
            ${saldoMes.map(v=>`<td style="text-align:right;font-size:11px;font-weight:800;color:${v>=0?'var(--verde)':'var(--vermelho)'}">${v>=0?fR(v):fG(-v)}</td>`).join('')}
            <td style="text-align:right;font-size:12px;font-weight:800;background:var(--sf2);color:${saldoAno>=0?'var(--verde)':'var(--vermelho)'}">
              ${saldoAno>=0?fR(saldoAno):fG(-saldoAno)}
            </td>
          </tr>
          ${rowPct('Margem Operacional %', saldoMes, recTotMes, saldoAno, recTotAno)}
        </tbody>
      </table>
    </div></div>`;
}
