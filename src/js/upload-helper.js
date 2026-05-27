import { storage, storageRef, uploadBytes, getDownloadURL } from './firebase-config.js';

// ── HTML do widget ────────────────────────────────
export function anexoHTML(prefix) {
  return `
  <div class="form-section">
    <div class="section-titulo">Anexo — Nota Fiscal</div>
    <input type="file" id="${prefix}-input" accept=".pdf,.xml,image/jpeg,image/png" style="display:none">
    <div class="anexo-drop-zone" id="${prefix}-drop-zone">
      <span style="font-size:22px;line-height:1">📎</span>
      <div class="anexo-drop-txt">Arraste o arquivo aqui ou <u>clique para selecionar</u></div>
      <div class="anexo-drop-sub">PDF · XML · JPG · PNG — máx. 10 MB</div>
    </div>
    <div class="anexo-preview" id="${prefix}-preview" style="display:none">
      <span class="anexo-tag" id="${prefix}-tag"></span>
      <span class="anexo-nome" id="${prefix}-nome"></span>
      <span class="anexo-size" id="${prefix}-size"></span>
      <button class="btn-anexo-rm" id="${prefix}-rm" type="button">✕ Remover</button>
    </div>
    <div class="anexo-existente" id="${prefix}-link" style="display:none"></div>
  </div>`;
}

// ── Bind de eventos do widget ─────────────────────
export function bindAnexo(prefix, onXMLParsed) {
  let _file = null;

  const input    = document.getElementById(`${prefix}-input`);
  const dropZone = document.getElementById(`${prefix}-drop-zone`);
  const preview  = document.getElementById(`${prefix}-preview`);

  const _showFile = (file) => {
    _file = file;
    const ext = file.name.split('.').pop().toLowerCase();
    const tagEl = document.getElementById(`${prefix}-tag`);
    if (ext === 'xml') {
      tagEl.className = 'anexo-tag anexo-tag-xml';
      tagEl.textContent = 'XML — NF-e';
    } else if (ext === 'pdf') {
      tagEl.className = 'anexo-tag anexo-tag-pdf';
      tagEl.textContent = 'PDF';
    } else {
      tagEl.className = 'anexo-tag anexo-tag-img';
      tagEl.textContent = 'Imagem';
    }
    document.getElementById(`${prefix}-nome`).textContent = file.name;
    document.getElementById(`${prefix}-size`).textContent = _fmtBytes(file.size);
    dropZone.style.display = 'none';
    preview.style.display = 'flex';

    if (ext === 'xml' && onXMLParsed) {
      parseXMLNFe(file).then(dados => { if (dados) onXMLParsed(dados); });
    }
  };

  const clear = () => {
    _file = null;
    input.value = '';
    dropZone.style.display = '';
    preview.style.display = 'none';
  };

  const _check = (file) => {
    if (file.size > 10 * 1024 * 1024) { alert('Arquivo maior que 10 MB não é aceito.'); return false; }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'xml', 'jpg', 'jpeg', 'png'].includes(ext)) {
      alert('Tipo não aceito. Use PDF, XML, JPG ou PNG.');
      return false;
    }
    return true;
  };

  dropZone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => {
    const f = e.target.files[0];
    if (f && _check(f)) _showFile(f);
  });
  document.getElementById(`${prefix}-rm`).addEventListener('click', clear);

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('anexo-drag'); });
  dropZone.addEventListener('dragleave', e => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('anexo-drag');
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('anexo-drag');
    const f = e.dataTransfer.files[0];
    if (f && _check(f)) _showFile(f);
  });

  return { getFile: () => _file, clear };
}

// ── Exibe link de anexo existente (modo edição) ───
export function showExistingAnexo(prefix, url, nome) {
  const el = document.getElementById(`${prefix}-link`);
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = `
    <span>Anexo atual:</span>
    <a href="${url}" target="_blank" rel="noopener" class="anexo-link-btn">📎 ${nome || 'Ver arquivo'}</a>`;
}

// ── Upload para o Firebase Storage ───────────────
export async function uploadAnexo(pasta, ccCodigo, nrDoc, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const safe = (nrDoc || 'sem-doc').replace(/[^a-zA-Z0-9\-]/g, '_');
  const path = `${pasta}/${ccCodigo}/${safe}-${Date.now()}.${ext}`;
  const ref  = storageRef(storage, path);
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

// ── Parse de XML NF-e ────────────────────────────
export async function parseXMLNFe(file) {
  try {
    const text = await file.text();
    const doc  = new DOMParser().parseFromString(text, 'application/xml');
    const nNF  = doc.querySelector('nNF')?.textContent?.trim();
    const vNF  = doc.querySelector('vNF')?.textContent?.trim()
              || doc.querySelector('vDoc')?.textContent?.trim();
    if (!nNF && !vNF) return null;
    return { nNF: nNF || null, vNF: vNF ? parseFloat(vNF) : null };
  } catch { return null; }
}

function _fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
