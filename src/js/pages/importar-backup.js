import { importarLancamentosCSV } from '../db.js';

let _container = null;

export async function mount(container) {
  _container = container;
  container.innerHTML = _html();
  _bind();
}

export function destroy() {
  _container = null;
}

function _html() {
  return `
<div class="page estreita">
  <div class="page-header">
    <div>
      <div class="page-title">Importar Backup CSV</div>
      <div class="page-sub">Restaure lançamentos a partir de um backup exportado do Google Sheets</div>
    </div>
  </div>

  <div style="background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:24px;margin-bottom:20px">
    <p style="font-size:13px;color:var(--texto);line-height:1.7;margin-bottom:20px">
      <strong>1.</strong> Abra a planilha <strong>forte-financeiro-backup</strong><br>
      <strong>2.</strong> Na aba <strong>Lançamentos</strong>, vá em
        <strong>Arquivo → Fazer download → Valores separados por vírgula (.csv)</strong><br>
      <strong>3.</strong> Selecione o arquivo abaixo — somente linhas com Status <strong>Ativo</strong> serão importadas
    </p>

    <label style="display:block;margin-bottom:16px">
      <span style="font-size:11px;font-weight:700;letter-spacing:.05em;
                   text-transform:uppercase;color:var(--mu);display:block;margin-bottom:6px">
        Arquivo CSV
      </span>
      <input type="file" id="inp-csv" accept=".csv"
        style="font-family:var(--fonte);font-size:13px;color:var(--texto)">
    </label>

    <div id="preview" style="display:none;margin-bottom:16px;padding:12px;
         background:var(--bg);border-radius:6px;border:1px solid var(--borda);font-size:13px">
    </div>

    <button id="btn-importar" class="btn-add" disabled style="opacity:.5">
      Importar Lançamentos
    </button>
  </div>

  <div id="resultado" style="display:none"></div>
</div>`;
}

function _bind() {
  const inp  = document.getElementById('inp-csv');
  const btn  = document.getElementById('btn-importar');
  const prev = document.getElementById('preview');
  const res  = document.getElementById('resultado');
  let _rows  = [];

  inp.addEventListener('change', () => {
    const file = inp.files[0];
    if (!file) { btn.disabled = true; btn.style.opacity = '.5'; prev.style.display = 'none'; return; }

    const reader = new FileReader();
    reader.onload = e => {
      _rows = _parseCSV(e.target.result);
      if (_rows.length === 0) {
        prev.innerHTML = '<span style="color:var(--vermelho)">Nenhuma linha válida ou todas marcadas como Excluído.</span>';
        btn.disabled = true;
        btn.style.opacity = '.5';
      } else {
        const rec  = _rows.filter(r => r.tipo === 'Receita').length;
        const desp = _rows.filter(r => r.tipo === 'Despesa').length;
        prev.innerHTML =
          `<strong>${_rows.length}</strong> lançamento(s) para importar — ` +
          `<span style="color:var(--verde)">${rec} receita(s)</span>, ` +
          `<span style="color:var(--vermelho)">${desp} despesa(s)</span>`;
        btn.disabled = false;
        btn.style.opacity = '1';
      }
      prev.style.display = 'block';
    };
    reader.readAsText(file, 'UTF-8');
  });

  btn.addEventListener('click', async () => {
    if (!_rows.length) return;
    btn.disabled = true;
    btn.style.opacity = '.5';
    btn.textContent = 'Importando…';
    res.style.display = 'none';

    try {
      const total = await importarLancamentosCSV(_rows);
      res.innerHTML = `
        <div class="msg ok visivel">
          <span>✓</span>
          <span>${total} lançamento(s) importado(s) com sucesso.</span>
        </div>`;
    } catch (err) {
      res.innerHTML = `
        <div class="msg erro visivel">
          <span>✕</span>
          <span>Erro ao importar: ${err.message}</span>
        </div>`;
    }

    res.style.display = 'block';
    btn.textContent = 'Importar Lançamentos';
    btn.disabled = false;
    btn.style.opacity = '1';
    _rows = [];
    inp.value = '';
    prev.style.display = 'none';
  });
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
function _parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // remove UTF-8 BOM
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = _parseLine(lines[i]);
    if (cols.length < 15) continue;
    const status = (cols[15] || '').trim();
    if (status === 'Excluído') continue;

    const row = {
      data:          (cols[0]  || '').trim(),
      mes:           Number(cols[1]) || 0,
      ano:           Number(cols[2]) || 0,
      tipo:          (cols[3]  || '').trim(),
      categoria:     (cols[4]  || '').trim(),
      categoriaDesc: (cols[5]  || '').trim(),
      cc:            (cols[6]  || '').trim(),
      valor:         parseFloat((cols[7] || '0').replace(',', '.')) || 0,
      formaPgto:     (cols[8]  || '').trim(),
      fornecedor:    (cols[9]  || '').trim(),
      info:          (cols[10] || '').trim(),
      nrDoc:         (cols[11] || '').trim(),
      contrato:      (cols[12] || '').trim(),
      lancadoPor:    (cols[13] || '').trim(),
      id:            cols.length > 16 ? (cols[16] || '').trim() : '',
    };

    if (row.data && row.tipo) result.push(row);
  }
  return result;
}

function _parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
