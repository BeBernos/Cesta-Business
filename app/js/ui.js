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

export const vibrar = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* sem vibração */ } };
