// ══════════════════════════════════════════════
//  UTILIDADES COMPARTILHADAS
// ══════════════════════════════════════════════

export function fmtM(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return 'R$ ' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return 'R$ ' + (v / 1_000).toFixed(0) + 'k';
  return 'R$ ' + v.toFixed(0);
}

export function fmtMfull(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function fmtData(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toDate?.()?.toISOString?.() ?? String(d);
  const [y, m, dd] = s.split('T')[0].split('-');
  return `${dd}/${m}/${y}`;
}

export function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function parseMoeda(s) {
  if (!s) return 0;
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

export function formatarValorInput(inp) {
  let v = inp.value.replace(/\D/g, '');
  if (!v) { inp.value = ''; return; }
  inp.value = (parseInt(v) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function mesNome(d) {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
          'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][
    new Date(d + 'T12:00:00').getMonth()
  ];
}

export function fmtBytes(b) {
  if (!b) return '';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

export function tipoIconeArquivo(nome) {
  const ext = (nome || '').split('.').pop().toLowerCase();
  return { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', jpg:'🖼', jpeg:'🖼', png:'🖼' }[ext] || '📎';
}

export function statusLabel(s) {
  return { ativo:'Ativo', pausado:'Pausado', encerrado:'Encerrado', em_licitacao:'Em licitação' }[s] || s;
}

export function tipoContratoLabel(t) {
  return { municipal:'Municipal', estadual:'Estadual', federal:'Federal', privado:'Privado' }[t] || t;
}

export function nivelLabel(n) {
  return {
    administrador: 'Administrador — acesso completo',
    financeiro:    'Financeiro — gestão financeira',
    operacao:      'Operação — lançamento de despesas',
  }[n] || n;
}

// Mostra/esconde mensagem de feedback
export function mostrarMsg(containerId, tipo, texto) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.querySelector('[data-msg-icone]').textContent =
    tipo === 'erro' ? '✕' : tipo === 'sucesso' ? '✓' : '!';
  el.querySelector('[data-msg-texto]').textContent = texto;
  el.className = `msg visivel ${tipo}`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function esconderMsg(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.className = 'msg';
}

// HTML do bloco de mensagem (reutilizável em templates)
export function msgHTML(id) {
  return `<div class="msg" id="${id}">
    <span data-msg-icone></span>
    <span data-msg-texto></span>
  </div>`;
}
