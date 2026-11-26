// Pequenos utilitários de interface: criar elementos, folhas (janelas que sobem de baixo), avisos.

export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  anexar(el, filhos);
  return el;
}

function anexar(el, filhos) {
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    if (Array.isArray(f)) anexar(el, f);
    else el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

const rs = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const n2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nq = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
export const fmtRS = (n) => (n === null || n === undefined ? '—' : rs.format(n));
export const fmtN = (n) => (n === null || n === undefined ? '' : n2.format(n));
export const fmtQ = (n) => (n === null || n === undefined ? '' : nq.format(n));

export { lerExpr } from './modelo.js';
import { moedaDeDigitos } from './modelo.js';

// Campo de preço em modo moeda: os dígitos entram pela direita (2290 → 22,90).
// Roda antes dos outros "input" do campo (captura). Se a pessoa digitar uma conta, o campo fica livre.
export function campoMoeda(inp, ligado = () => true) {
  let livre = false, brutos = '';
  inp.addEventListener('focus', () => { livre = false; brutos = ''; });
  inp.addEventListener('input', (e) => {
    if (!ligado() || livre) return;
    if (e.inputType === 'insertFromPaste') { livre = true; return; }
    // vírgula ou ponto digitado: a pessoa quer escrever o número do jeito dela ("4" + "," → "4,")
    if (e.data === ',' || e.data === '.') { livre = true; inp.value = `${brutos || '0'},`; return; }
    brutos = inp.value.replace(/\D/g, '').replace(/^0+/, '');
    const novo = moedaDeDigitos(inp.value);
    if (novo === null) { livre = true; return; }
    inp.value = novo;
    try { inp.setSelectionRange(novo.length, novo.length); } catch { /* alguns teclados não deixam */ }
  }, { capture: true });
  return inp;
}

// ---------- folhas ----------
const pilha = [];
addEventListener('popstate', (e) => {
  const topo = pilha.pop();
  if (topo) { e.folhaFechada = true; topo._fechar(); }
});

export function folha(conteudo, { aoFechar } = {}) {
  const corpo = h('div', { class: 'folha', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'alca' }), conteudo);
  const veu = h('div', { class: 'veu' }, corpo);
  veu.addEventListener('click', (e) => { if (e.target === veu) api.fechar(); });
  const api = {
    el: corpo,
    aberta: true,
    _fechar() {
      if (!api.aberta) return;
      api.aberta = false;
      veu.remove();
      aoFechar?.();
      dispatchEvent(new Event('folha-fechada'));
    },
    fechar() {
      if (!api.aberta) return;
      const i = pilha.indexOf(api);
      if (i === pilha.length - 1) history.back(); // o popstate fecha
      else { if (i >= 0) pilha.splice(i, 1); api._fechar(); }
    },
  };
  pilha.push(api);
  history.pushState({ folha: pilha.length }, '');
  document.body.append(veu);
  const foco = corpo.querySelector('[autofocus]');
  if (foco) setTimeout(() => foco.focus(), 60);
  return api;
}

export function fecharTodas() {
  const n = pilha.length;
  while (pilha.length) pilha.pop()._fechar();
  if (n) history.go(-n);
}

// Pergunta com botões. Resolve com o valor do botão (ou null se fechar).
export function perguntar({ titulo, texto, botoes, extra }) {
  return new Promise((ok) => {
    let valor = null;
    const f = folha([
      h('h2', null, titulo),
      texto ? h('p', { class: 'sub' }, texto) : null,
      extra || null,
      h('div', { class: 'acoes' }, botoes.map((b) => h('button', {
        class: `btn bloco ${b.estilo || ''}`,
        onclick: () => { valor = b.valor; f.fechar(); },
      }, b.rotulo))),
    ], { aoFechar: () => ok(valor) });
  });
}

export const confirmar = (titulo, texto, rotulo = 'Confirmar', estilo = 'prim') =>
  perguntar({ titulo, texto, botoes: [{ rotulo, valor: true, estilo }, { rotulo: 'Cancelar', valor: false, estilo: 'fantasma' }] });

export function pedirTexto({ titulo, rotulo, valor = '', dica = '', botao = 'Salvar', validar }) {
  return new Promise((ok) => {
    let res = null;
    const inp = h('input', { class: 'entrada', value: valor, placeholder: dica, autofocus: true, enterkeyhint: 'done' });
    const erro = h('div', { class: 'aviso erro', hidden: true });
    const enviar = async () => {
      const v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      const msg = validar ? await validar(v) : null;
      if (msg) { erro.textContent = msg; erro.hidden = false; return; }
      res = v; f.fechar();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
    const f = folha([
      h('h2', null, titulo),
      h('div', { class: 'form' }, h('label', null, rotulo, inp), erro),
      h('div', { class: 'acoes lado' },
        h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'),
        h('button', { class: 'btn prim', onclick: enviar }, botao)),
    ], { aoFechar: () => ok(res) });
  });
}

// ---------- avisos rápidos ----------
export function toast(msg, { acao, tempo = 3500 } = {}) {
  const raiz = document.getElementById('toast');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, msg),
    acao ? h('button', { onclick: () => { acao.fn(); el.remove(); } }, acao.rotulo) : null);
  raiz.append(el);
  while (raiz.children.length > 2) raiz.firstElementChild.remove(); // no máximo 2 avisos na tela
  setTimeout(() => el.remove(), acao ? Math.max(tempo, 6000) : tempo);
}

export function baixar(blob, nome) {
  const a = h('a', { href: URL.createObjectURL(blob), download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function escolherArquivo(accept) {
  return new Promise((ok) => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { ok(inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

// Ícones desenhados (traço único), no lugar dos emojis nas telas principais
const IC = {
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  chart: '<path d="M3 20h18M6 17v-5M11 17V6M16 17v-3M20 17V9"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  chevU: '<path d="m6 15 6-6 6 6"/>',
  up: '<path d="M7 17 17 7M9 7h8v8"/>',
  down: '<path d="M7 7l10 10M17 9v8H9"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5"/>',
  wand: '<path d="m4 20 11-11M15 4l.8 1.7L17.5 6.5l-1.7.8L15 9l-.8-1.7L12.5 6.5l1.7-.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l7-7"/>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM9.5 20v-5.5h5V20"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  sheet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.1 9.2 4.4 4.4 0 0 0 7 18z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  route: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.4 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.6-2.5L4 15.4a1.5 1.5 0 0 1 2.4-1.8L8 15.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.1"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10.5h18M7 15h4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  nota: '<path d="M5 5h14v10H10l-5 4z"/><path d="M9 9h6M9 12h4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
};
export function icone(nome, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icone ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${IC[nome] || ''}</svg>`;
  return t.content.firstChild;
}

// Preço como na etiqueta de gôndola: centavos pequenos no alto ("R$ 23,⁹⁸")
export function precoEtq(n, { cifrao = true } = {}) {
  if (n === null || n === undefined) return h('span', { class: 'preco-etq vazio num', 'aria-label': 'sem preço' }, cifrao ? h('span', { class: 'cifrao' }, 'R$') : null, '—');
  const [i, c] = n2.format(n).split(',');
  return h('span', { class: 'preco-etq num' }, cifrao ? h('span', { class: 'cifrao' }, 'R$') : null, i, h('sup', null, `,${c}`));
}

export const vibrar = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* sem vibração */ } };
