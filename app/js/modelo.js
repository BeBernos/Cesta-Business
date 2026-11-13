// Modelo de dados do app: um "armazém" de registros chave → valor, com carimbo de tempo.
//
// Tudo o que o app guarda é um registro { k, u, v }:
//   k = chave (texto), u = quando mudou (ms, sempre crescente neste aparelho), v = valor (null = apagado)
// Isso permite sincronizar entre celulares sem conflito: em cada chave vence a mudança mais recente.
//
// Chaves:
//   m:<mid>                 mercado      { nome, ordem, arquivado }
//   c:<cid>                 categoria    { nome, ordem }
//   mes:<AAAA-MM>           mês          { criado }
//   p:<mes>:<pid>           produto      { nome, cat, qtd, obs }      (pid é o mesmo em todos os meses)
//   r:<mes>:<pid>:<mid>     preço        { preco, marca, auto, obs }  (auto = marca copiada de outro mercado)
//   k:<lista>:<pid>         modo compra  { ok, merc, faltou, pagoPreco, pagoQtd, estPreco, atualizou }
//                           (ok = no carrinho, merc = mercado escolhido, pagoPreco/pagoQtd = preço e qtd vistos na gôndola)
//   cm:<mes>                modo compra  { fora: [mid…] }             (mercados que não vou visitar)
//   l:<lista>               lista        { nome, criado, orcamento, dieta }  (listas extras do mês e nome/limite da nº 1; dieta = { de, ate, quando })
//   q:<lista>:<pid>         quantidade   { qtd }                      (só nas listas extras; a nº 1 usa p.qtd)
//   oc:<lista>              orçado       { quando, total, itens: { pid: [preço, mid] } } (foto da lista na 1ª ação do Modo compra)
//   mc:<pid>                marcas       { aceitas: [texto…] }        (vale para todos os meses; sem registro = qualquer marca)
//   nf:<chave>              nota fiscal  { lista, mid, cnpj, loja, emissao, total, desconto, itens: [{ desc, cod, qtd, un, vUnit, vTotal, pid }] }
//   vn:<raiz>:<cod>         vínculo      { pid, desc }                (código do item no mercado → produto; raiz = 8 dígitos do CNPJ)
//   vd:<palavras>           nome aprendido { pid, desc }              (descrição da nota sem tamanhos → produto; vale em qualquer mercado)
//   cn:<raiz>               mercado      { mid }                      (de qual mercado é o CNPJ)
//   fb:<id>                 feedback     { tipo, texto, versao, tela, aparelho, quando, status, resposta }
//
// Listas: a nº 1 de cada mês tem o id do próprio mês ("2026-10"), então os dados antigos valem sem conversão.
// As outras são "2026-10~xxxx". k:, cm:, q: e oc: usam o id da lista; p: e r: (produtos e preços) são do mês.
//
// k: também guarda notaPreco/notaQtd/notaChave (o que a nota fiscal cobrou). Vale o mais recente: nota > gôndola > orçado.
//
// Este arquivo não usa DOM nem IndexedDB: roda igual no navegador e nos testes (Node).

import { raizCnpj } from './nota.js';

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const MERCADOS_PADRAO = ['Atacadão', 'Assaí', "Sam's Club", 'Carrefour', 'COOP'];
export const CATEGORIAS_PADRAO = ['Bazar e limpeza', 'Bebidas', 'Carnes, aves, peixes e ovos',
  'Comidas prontas e congelados', 'Descartáveis', 'Frios, leites e derivados',
  'Frutas, verduras e legumes', 'Higiene, saúde e beleza', 'Mercearia', 'Padarias e sobremesas',
  'Pets', 'Temperos'];

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

export const novoId = () => {
  const a = new Uint8Array(6);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-3);
};

export const mesDe = (id) => String(id ?? '').split('~')[0];

export function nomeMes(id, curto = false) {
  const [a, m] = mesDe(id).split('-').map(Number);
  const n = MESES[m - 1] || id;
  return curto ? `${n.slice(0, 3)}/${String(a).slice(2)}` : `${n} ${a}`;
}

export function proximoMes(id) {
  let [a, m] = id.split('-').map(Number);
  m += 1; if (m > 12) { m = 1; a += 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
}

export function mesDeData(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "4,79" | "4.79" | "1.234,56" | "R$ 4,79" → 4.79 ; vazio/inválido → null
export function lerNumero(txt) {
  if (typeof txt === 'number') return Number.isFinite(txt) ? txt : null;
  let s = String(txt ?? '').replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

// Aceita "4,79", "36,98/3", "2x7,49", "10+2,5" → número (ou null se vazio, undefined se inválido)
export function lerExpr(txt) {
  let s = String(txt ?? '').trim().replace(/R\$\s*/gi, '').replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace(/[x×]/gi, '*').replace(/÷/g, '/');
  if (!/^[\d.,+\-*/()]+$/.test(s)) return undefined;
  s = s.replace(/(\d[\d.]*,\d*|\d[\d.]*)/g, (m) => {
    if (m.includes(',')) return m.replace(/\./g, '').replace(',', '.');
    return /^\d{1,3}(\.\d{3})+$/.test(m) ? m.replace(/\./g, '') : m;
  });
  let i = 0;
  const num = () => {
    if (s[i] === '(') { i++; const v = soma(); if (s[i] !== ')') throw 0; i++; return v; }
    if (s[i] === '-') { i++; return -num(); }
    const m = /^\d+(\.\d*)?|^\.\d+/.exec(s.slice(i)); // "4," (vírgula ainda sem centavos) vale 4
    if (!m) throw 0;
    i += m[0].length; return Number(m[0]);
  };
  const prod = () => { let v = num(); while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const b = num(); v = op === '*' ? v * b : v / b; } return v; };
  const soma = () => { let v = prod(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const b = prod(); v = op === '+' ? v + b : v - b; } return v; };
  try {
    const v = soma();
    if (i !== s.length || !Number.isFinite(v) || v < 0) return undefined;
    return Math.round(v * 10000) / 10000;
  } catch { return undefined; }
}

// Lê o tamanho escrito em marca/tamanho: "Camil 5kg" → 5 kg; "Pepsi 1,5L" → 1,5 L; "Snob c/3" → 3 un;
// "12x350ml" → 4,2 L. Devolve { qtd, base: 'kg' | 'L' | 'un' } ou null quando não dá para saber.
export function lerTamanho(txt) {
  const t = tamanhoBruto(txt);
  return t ? { ...t, qtd: Math.round(t.qtd * 1e6) / 1e6 } : null;
}
function tamanhoBruto(txt) {
  const s = norm(txt).replace(/(\d),(\d)/g, '$1.$2');
  if (!s) return null;
  const pacote = /(?:c\/|com\s)\s*(\d+)\b/.exec(s) || /(?:^|\s)(\d+)\s*x\s*(?=\d)/.exec(s);
  const mult = pacote ? Number(pacote[1]) : 1;
  const m = /(\d+(?:\.\d+)?)\s*(kg|kilos?|quilos?|g|gr|gramas?|l|lt|litros?|ml)\b/.exec(s);
  if (m) {
    const v = Number(m[1]), u = m[2];
    if (!v) return null;
    if (/^(kg|kilo|quilo)/.test(u)) return { qtd: v * mult, base: 'kg' };
    if (/^g/.test(u)) return { qtd: (v / 1000) * mult, base: 'kg' };
    if (u === 'ml') return { qtd: (v / 1000) * mult, base: 'L' };
    return { qtd: v * mult, base: 'L' };
  }
  const un = /(\d+)\s*(un|und|unid|unidades?|rolos?|folhas?|cubos?|saches?|capsulas?|pecas?)\b/.exec(s);
  if (un && Number(un[1])) return { qtd: Number(un[1]) * (pacote && !/c\//.test(pacote[0]) ? mult : 1), base: 'un' };
  if (pacote && mult > 1) return { qtd: mult, base: 'un' };
  return null;
}

// Só o nome da marca, sem o tamanho: "Camil 5kg" → "Camil"; "Snob c/3" → "Snob"; "Pepsi 12x350ml" → "Pepsi"
export function nomeDaMarca(txt) {
  return String(txt ?? '').replace(/(?:c\/|com\s)\s*\d+/gi, ' ').replace(/\d+\s*x\s*(?=\d)/gi, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|kilos?|quilos?|g|gr|gramas?|l|lt|litros?|ml|un|und|unid|unidades?|rolos?|folhas?|m|metros?)(?![a-zà-ú])/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Compara o preço por kg/litro/unidade entre os mercados. Só faz sentido quando os tamanhos são
// diferentes (com o mesmo tamanho, o mais barato por kg é o mais barato e pronto).
export function porUnidade(c) {
  const com = c.linhas.filter((l) => l.preco !== null && l.tam && l.aceita !== false);
  if (com.length < 2) return null;
  const bases = new Set(com.map((l) => l.tam.base));
  if (bases.size !== 1) return null;
  if (new Set(com.map((l) => l.tam.qtd)).size < 2) return null;
  let melhor = null;
  for (const l of com) if (!melhor || l.porUnid < melhor.porUnid) melhor = l;
  return { base: [...bases][0], melhor, difere: !c.baratos.has(melhor.mid), linhas: com };
}

// Modo moeda (como em app de banco): só dígitos → centavos. "2290" → "22,90"; "5" → "0,05".
// Com vírgula, ponto ou conta (+ - x /) devolve null: o texto vale como foi digitado.
export function moedaDeDigitos(txt) {
  const s = String(txt ?? '');
  if (/[+\-*/x×÷()]/i.test(s)) return null;
  const digitos = s.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
  if (!digitos) return '';
  const centavos = digitos.padStart(3, '0');
  const reais = centavos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${reais},${centavos.slice(-2)}`;
}

// Quanto o preço mudou (%) em relação ao mês anterior, comparando o que é comparável:
// mesmo tamanho → preço da embalagem; tamanhos diferentes conhecidos → preço por kg/litro/unidade;
// tamanho desconhecido em um dos meses e marca diferente → não dá para comparar (null).
export function variacaoPreco(atual, anterior) {
  if (typeof atual?.preco !== 'number' || typeof anterior?.preco !== 'number' || !anterior.preco) return null;
  const ta = lerTamanho(atual.marca), tb = lerTamanho(anterior.marca);
  if (ta && tb) {
    if (ta.base !== tb.base) return null;
    return ((atual.preco / ta.qtd) / (anterior.preco / tb.qtd) - 1) * 100;
  }
  if ((ta || tb) && norm(atual.marca) !== norm(anterior.marca)) return null;
  return (atual.preco / anterior.preco - 1) * 100;
}

// Palavras que não ajudam a reconhecer um produto ("Leite de coco" ≈ "LEITE COCO")
const PALAVRAS_VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'sem', 'para', 'p', 'c', 'e', 'em', 'tipo', 'un', 'und', 'unid', 'kg', 'g', 'gr', 'ml', 'l',
  'pct', 'pc', 'cx', 'fd', 'lt1', 'emb', 'gf', 'pet', 'sc']);
// Abreviações de nota que não são começo da palavra ("QJO" ≠ "que…"); as que são começo ("SAB", "DESN", "REFRIG") já batem sozinhas
const ABREVIACOES = { lt: 'leite', lte: 'leite', qjo: 'queijo', qj: 'queijo', fgo: 'frango', frgo: 'frango', frg: 'frango', cr: 'creme',
  sh: 'shampoo', ag: 'agua', muc: 'mussarela', mucarela: 'mussarela', mozarela: 'mussarela', mozz: 'mussarela', mussar: 'mussarela',
  achoc: 'achocolatado', ref: 'refinado', bco: 'branco', choc: 'chocolate', iog: 'iogurte', marg: 'margarina',
  mant: 'manteiga', req: 'requeijao', refri: 'refrigerante', biscoitos: 'biscoito', ovos: 'ovo', bat: 'batata', tom: 'tomate' };

// Palavras que identificam um produto: sem acento, sem números e tamanhos, abreviações por extenso
// Resposta do Claude no formato "Produto => Categoria" (aceita ->, →, : e listas com "- " ou "1.")
export function lerPares(texto) {
  return String(texto ?? '').split('\n').map((l) => /^\s*(?:[-*•]|\d+[.)])?\s*(.+?)\s*(?:=>|->|→|:)\s*(.+?)\s*$/.exec(l))
    .filter(Boolean).map(([, a, b]) => [a.replace(/^["“]|["”]$/g, ''), b.replace(/^["“]|["”]$/g, '').replace(/\.$/, '')]);
}

export function palavrasNota(x) {
  return norm(x).replace(/[^a-z0-9 ]+/g, ' ').split(' ')
    .filter((w) => w.length > 1 && !/\d/.test(w) && !PALAVRAS_VAZIAS.has(w)).map((w) => ABREVIACOES[w] || w);
}
const chaveDesc = (desc) => palavrasNota(desc).join(' ');

// Regras de categoria (sem IA): palavras do produto → palavras do nome da categoria (funciona com categorias renomeadas,
// ex.: "Açougue" ou "Carnes, aves…"). Expressões ("papel higienico") valem antes das palavras soltas; entre as palavras,
// vale a 1ª regra que bate — por isso "congelado" vem antes de "batata", "gelatina" antes de "açúcar" e "molho" antes de "tomate".
const REGRAS_CATEGORIA = [
  [['congelad', 'comidas prontas'], ['congelado', 'congelada', 'sorvete', 'lasanha', 'pizza', 'nuggets', 'empanado', 'hamburguer']],
  [['higiene', 'saude', 'beleza'], ['papel higienico', 'creme dental', 'fio dental', 'agua oxigenada', 'lenco umedecido', 'esponja de banho', 'escova de dente',
    'sabonete', 'shampoo', 'condicionador', 'desodorante', 'absorvente', 'fralda', 'cotonete', 'hastes', 'protetor', 'hidratante', 'enxaguante', 'barbeador', 'algodao']],
  [['descart'], ['saco de lixo', 'cata caca', 'papel', 'guardanapo', 'filme', 'descartavel', 'descartaveis', 'aluminio']],
  [['limpeza', 'bazar'], ['agua sanitaria', 'lava roupas', 'tira manchas', 'lenco de limpeza', 'detergente', 'sabao', 'amaciante', 'desinfetante', 'alvejante', 'esponja',
    'limpador', 'limpa', 'limpeza', 'multiuso', 'inseticida', 'lustra', 'vassoura', 'rodo', 'pastilha', 'perfumador', 'pilha', 'lampada', 'vinagre']],
  [['pet'], ['racao', 'petisco', 'areia']],
  [['bebida'], ['refrigerante', 'refri', 'suco', 'agua', 'cerveja', 'vinho', 'energetico', 'isotonico', 'refresco']],
  [['tempero'], ['sal', 'pimenta', 'oregano', 'caldo', 'tempero', 'canela', 'cominho', 'colorau', 'louro', 'curry', 'paprica', 'chimichurri', 'tomilho', 'alecrim']],
  [['padaria', 'sobremesa'], ['pao', 'bolo', 'torrada', 'gelatina', 'pudim']],
  [['mercearia'], ['creme de leite', 'doce de leite', 'leite condensado', 'coco ralado', 'mistura para bolo', 'mistura para pao',
    'arroz', 'feijao', 'macarrao', 'farinha', 'acucar', 'cafe', 'cha', 'oleo', 'azeite', 'molho', 'extrato', 'biscoito', 'bolacha', 'aveia', 'granola', 'cereal',
    'achocolatado', 'chocolate', 'maionese', 'ketchup', 'mostarda', 'fermento', 'amido', 'fuba', 'polvilho', 'palha', 'mel', 'geleia', 'pasta', 'banha']],
  [['frios', 'laticinio', 'leite'], ['cream cheese', 'peito de peru', 'leite', 'queijo', 'mussarela', 'presunto', 'iogurte', 'requeijao', 'manteiga', 'margarina',
    'nata', 'ricota', 'cottage', 'coalhada', 'kefir', 'danone', 'mortadela']],
  [['carne', 'acougue', 'aves'], ['frango', 'coxa', 'sobrecoxa', 'asa', 'carne', 'patinho', 'acem', 'alcatra', 'picanha', 'costela', 'maminha', 'fraldinha', 'cupim',
    'musculo', 'linguica', 'bacon', 'porco', 'lombo', 'pernil', 'bisteca', 'figado', 'peixe', 'tilapia', 'salmao', 'merluza', 'camarao', 'ovo', 'salsicha', 'salame']],
  [['fruta', 'hortifruti', 'verdura', 'legume'], ['alface', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'banana', 'maca', 'laranja', 'limao', 'mamao', 'melao',
    'melancia', 'uva', 'abacate', 'abobora', 'abobrinha', 'beterraba', 'brocolis', 'couve', 'espinafre', 'rucula', 'pepino', 'pimentao', 'chuchu', 'mandioca',
    'inhame', 'kiwi', 'manga', 'pera', 'abacaxi', 'maracuja', 'salsinha', 'cebolinha', 'gengibre', 'agriao', 'repolho', 'berinjela', 'quiabo', 'vagem', 'morango',
    'mexerica', 'tangerina', 'goiaba', 'ameixa', 'coentro', 'hortela']],
];
// palavra inteira, aceitando o plural simples ("ovos", "pães" não: a regra usa o singular)
const mesmaPalavra = (w, r) => w === r || w === `${r}s` || w === `${r}es`;
const temFrase = (ws, frase) => palavrasNota(frase).every((r) => ws.some((w) => mesmaPalavra(w, r)));
// a palavra do produto aparece na nota inteira ou abreviada ("DESN" → desnatado)
const bate = (nota, w) => nota.some((x) => x === w || (x.length >= 3 && w.startsWith(x)) || (w.length >= 3 && x.startsWith(w)));

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Desempate determinístico quando dois aparelhos gravam a mesma chave no mesmo milissegundo
export const vence = (novo, atual) => !atual || novo.u > atual.u ||
  (novo.u === atual.u && JSON.stringify(novo.v) > JSON.stringify(atual.v));

export class Loja {
  constructor() {
    this.recs = new Map();
    this.ouvintes = new Set();
    this.ultimoU = 0;
    this._lote = null;
    this._reindexar();
  }

  // ---------- registros ----------
  get(k) { const r = this.recs.get(k); return r ? r.v : undefined; }

  carregar(lista) {
    for (const r of lista) {
      this.recs.set(r.k, r);
      if (r.u > this.ultimoU) this.ultimoU = r.u;
    }
    this._reindexar();
  }

  todos() { return [...this.recs.values()]; }

  set(k, v) {
    const atual = this.recs.get(k);
    if (atual && igual(atual.v, v)) return false;
    if (!atual && v === null) return false;
    const u = Math.max(Date.now(), this.ultimoU + 1);
    this.ultimoU = u;
    if (this._lote && !this._lote.antes.has(k)) this._lote.antes.set(k, atual ? atual.v : null);
    this.recs.set(k, { k, u, v });
    this._indexar(k, v);
    this._avisar([k], 'local');
    return true;
  }

  del(k) { return this.set(k, null); }

  mesclar(k, parcial) {
    const atual = this.get(k);
    return this.set(k, { ...(atual || {}), ...parcial });
  }

  // Registros vindos de outro aparelho. Devolve as chaves que mudaram.
  aplicarRemotos(lista) {
    const mudou = [];
    for (const r of lista) {
      if (!vence(r, this.recs.get(r.k))) continue;
      this.recs.set(r.k, { k: r.k, u: r.u, v: r.v });
      if (r.u > this.ultimoU) this.ultimoU = r.u;
      this._indexar(r.k, r.v);
      mudou.push(r.k);
    }
    if (mudou.length) this._avisar(mudou, 'remoto');
    return mudou;
  }

  // Agrupa várias mudanças: um só aviso e um "desfazer" que volta tudo.
  lote(fn) {
    if (this._lote) return fn();
    const lote = { antes: new Map(), avisos: [] };
    this._lote = lote;
    try { fn(); } finally { this._lote = null; }
    const chaves = [...lote.antes.keys()];
    if (chaves.length) for (const f of this.ouvintes) f(chaves, 'local');
    return () => this.lote(() => { for (const [k, v] of lote.antes) this.set(k, v); });
  }

  ouvir(f) { this.ouvintes.add(f); return () => this.ouvintes.delete(f); }

  _avisar(chaves, origem) {
    if (this._lote && origem === 'local') return;
    for (const f of this.ouvintes) f(chaves, origem);
  }

  // ---------- índices em memória ----------
  _reindexar() {
    this.ix = { m: new Map(), c: new Map(), mes: new Map(), p: new Map(), r: new Map(), k: new Map(), cm: new Map(), l: new Map(), q: new Map(), fb: new Map(), oc: new Map(), mc: new Map(), nf: new Map(), vd: new Map() };
    for (const r of this.recs.values()) this._indexar(r.k, r.v);
  }

  _indexar(k, v) {
    const ix = this.ix;
    const partes = k.split(':');
    const t = partes[0];
    const pega = (mapa, chave) => { let x = mapa.get(chave); if (!x) mapa.set(chave, x = new Map()); return x; };
    const poe = (mapa, chave, val) => (val === null || val === undefined ? mapa.delete(chave) : mapa.set(chave, val));
    if (t === 'm' || t === 'c' || t === 'mes' || t === 'cm' || t === 'l' || t === 'fb' || t === 'oc' || t === 'mc' || t === 'nf' || t === 'vd') poe(ix[t], partes[1], v);
    else if (t === 'p' || t === 'k' || t === 'q') poe(pega(ix[t], partes[1]), partes[2], v);
    else if (t === 'r') poe(pega(ix.r, `${partes[1]}:${partes[2]}`), partes[3], v);
  }

  // ---------- consultas ----------
  mercados({ todos = false } = {}) {
    return [...this.ix.m].map(([id, v]) => ({ id, ...v }))
      .filter((m) => todos || !m.arquivado)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt'));
  }

  categorias() {
    return [...this.ix.c].map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt'));
  }

  meses() { return [...this.ix.mes.keys()].sort(); }

  // Produtos são do mês; numa lista extra a quantidade vem da própria lista
  produtos(lista) {
    const mapa = this.ix.p.get(mesDe(lista));
    if (!mapa) return [];
    return [...mapa].map(([id]) => this.produto(lista, id));
  }

  produto(lista, pid) {
    const v = this.ix.p.get(mesDe(lista))?.get(pid);
    if (!v) return null;
    return mesDe(lista) === lista ? { id: pid, ...v } : { id: pid, ...v, qtd: this.ix.q.get(lista)?.get(pid)?.qtd ?? null };
  }

  preco(lista, pid, mid) { return this.ix.r.get(`${mesDe(lista)}:${pid}`)?.get(mid) || null; }

  precosDoProduto(lista, pid) { return this.ix.r.get(`${mesDe(lista)}:${pid}`) || new Map(); }

  // ---------- listas do mês ----------
  listas(mes) {
    mes = mesDe(mes);
    if (!this.ix.mes.has(mes)) return [];
    const extras = [...this.ix.l].filter(([id]) => id !== mes && mesDe(id) === mes)
      .sort((a, b) => (a[1].criado ?? 0) - (b[1].criado ?? 0)).map(([id]) => id);
    return [mes, ...extras];
  }

  existeLista(id) { return !!id && this.ix.mes.has(mesDe(id)) && (mesDe(id) === id || this.ix.l.has(id)); }

  nomeLista(id) {
    const nome = this.ix.l.get(id)?.nome;
    if (nome) return nome;
    const mes = mesDe(id);
    return this.listas(mes).length > 1 ? `${MESES[Number(mes.slice(5)) - 1]} nº 1` : nomeMes(mes);
  }

  // Próximo nome livre: "Outubro nº 2", "Outubro nº 3"…
  proximoNomeLista(mes) {
    const nomes = new Set(this.listas(mes).map((l) => norm(this.nomeLista(l))));
    const base = MESES[Number(mesDe(mes).slice(5)) - 1];
    for (let n = 2; ; n++) if (!nomes.has(norm(`${base} nº ${n}`))) return `${base} nº ${n}`;
  }

  // de: lista de onde copiar; modo 'zero' | 'copiar' (quantidades) | 'faltou' (só o que não foi comprado)
  criarLista(mes, { nome, de = null, modo = 'zero', orcamento = null } = {}) {
    mes = mesDe(mes);
    const id = `${mes}~${novoId()}`;
    this.lote(() => {
      this.set(`l:${id}`, { nome: nome.trim(), criado: Date.now(), ...(orcamento ? { orcamento } : {}) });
      if (!de || modo === 'zero') return;
      for (const p of this.produtos(de)) {
        if (!p.qtd) continue;
        const k = this.ix.k.get(de)?.get(p.id);
        if (modo === 'faltou' && k?.ok) continue;
        this.set(`q:${id}:${p.id}`, { qtd: p.qtd });
      }
    });
    return id;
  }

  renomearLista(id, nome) { this.mesclar(`l:${id}`, { nome: nome.trim() }); }

  excluirLista(id) {
    if (mesDe(id) === id) throw new Error('A lista nº 1 só sai junto com o mês.');
    return this.lote(() => {
      for (const k of [...this.recs.keys()]) {
        const [t, a] = k.split(':');
        if ((t === 'l' || t === 'q' || t === 'k' || t === 'cm' || t === 'oc') && a === id) this.del(k);
        if (t === 'nf' && this.get(k)?.lista === id) this.del(k);
      }
    });
  }

  // Produtos de uma categoria em ordem alfabética (iguais ficam separados, ordenados pela marca)
  ordenar(lista, mes) {
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }) ||
      (this._marcaPrincipal(mes, a.id) || '').localeCompare(this._marcaPrincipal(mes, b.id) || '', 'pt') ||
      a.id.localeCompare(b.id));
  }

  _marcaPrincipal(mes, pid) {
    for (const m of this.mercados()) { const r = this.preco(mes, pid, m.id); if (r?.marca) return r.marca; }
    return '';
  }

  // ---------- cálculos ----------
  // Comparação de um produto entre os mercados ativos (arquivados não entram).
  calcProduto(mes, pid, mercados = this.mercados()) {
    const p = this.produto(mes, pid);
    const qtd = p?.qtd ?? null;
    const linhas = mercados.map((m) => {
      const r = this.preco(mes, pid, m.id) || {};
      const preco = typeof r.preco === 'number' ? r.preco : null;
      const tam = r.marca ? lerTamanho(r.marca) : null;
      return { mid: m.id, nome: m.nome, preco, marca: r.marca || '', auto: !!r.auto, obs: r.obs || '', aceita: this.marcaAceita(pid, r.marca),
        total: preco !== null && qtd ? preco * qtd : null, tam, porUnid: tam && preco !== null ? preco / tam.qtd : null };
    });
    const comPreco = linhas.filter((l) => l.preco !== null);
    // marca que a família não compra não conta como "mais barato"
    const validos = comPreco.filter((l) => l.aceita);
    let menor = null;
    for (const l of validos) if (menor === null || l.preco < menor) menor = l.preco;
    const baratos = new Set(validos.filter((l) => Math.abs(l.preco - menor) < 0.0005).map((l) => l.mid));
    const primeiro = linhas.find((l) => baratos.has(l.mid));
    return {
      qtd, linhas, menor, baratos,
      mercMenor: primeiro?.mid || null,
      nomeMercMenor: primeiro?.nome || '',
      marcaMenor: primeiro?.marca || '',
      totalMenor: menor !== null && qtd ? menor * qtd : null,
      pesquisados: comPreco.length,
      faltam: linhas.length - comPreco.length,
    };
  }

  calcMes(mes) {
    const mercados = this.mercados();
    const sub = new Map(mercados.map((m) => [m.id, { total: 0, itens: 0 }]));
    let totalGeral = 0, comQtd = 0, comPreco = 0, totalItens = 0, completos = 0;
    for (const p of this.produtos(mes)) {
      totalItens++;
      const c = this.calcProduto(mes, p.id, mercados);
      if (c.menor !== null) comPreco++;
      if (c.faltam === 0 && mercados.length) completos++;
      if (!c.qtd) continue;
      comQtd++;
      if (c.totalMenor !== null) totalGeral += c.totalMenor;
      for (const l of c.linhas) if (l.total !== null && l.aceita) { const s = sub.get(l.mid); s.total += l.total; s.itens++; }
    }
    return { totalGeral, sub, comQtd, comPreco, totalItens, completos, mercados };
  }

  // Lista do modo compra: cada item (com quantidade) vai para o mercado mais barato
  // entre os que vou visitar, a não ser que eu tenha escolhido outro à mão.
  listaCompra(mes) {
    const todos = this.mercados();
    const fora = new Set(this.ix.cm.get(mes)?.fora || []);
    const vou = todos.filter((m) => !fora.has(m.id));
    const grupos = new Map(vou.map((m) => [m.id, { mercado: m, itens: [], total: 0, feitos: 0 }]));
    const semPreco = [];
    const cats = new Map(this.categorias().map((c, i) => [c.id, { ...c, i }]));
    const oc = this.ix.oc.get(mes)?.itens || {};
    for (const p of this.produtos(mes)) {
      if (!p.qtd) continue;
      const k = this.ix.k.get(mes)?.get(p.id) || {};
      // "Não achei": o item sai desse mercado e vai para o próximo mais barato
      const faltou = new Set(k.faltou || []);
      const c = this.calcProduto(mes, p.id, vou.filter((m) => !faltou.has(m.id)));
      // Preço da gôndola: vale o que ela viu na prateleira (quantidade e preço), mesmo antes de pôr no carrinho
      const temPago = typeof k.pagoPreco === 'number' || typeof k.pagoQtd === 'number';
      const temNota = typeof k.notaPreco === 'number';
      const real = temPago || temNota;
      const precoEm = (m) => c.linhas.find((l) => l.mid === m)?.preco ?? null;
      const usaEscolhido = k.merc && grupos.has(k.merc) && !faltou.has(k.merc) && (precoEm(k.merc) !== null || (temPago && typeof k.pagoPreco === 'number') || temNota);
      const mid = usaEscolhido ? k.merc : c.mercMenor;
      const item = { p, c, ok: !!k.ok, manual: mid === k.merc && !!k.merc && !real, cat: cats.get(p.cat), orcado: oc[p.id]?.[0] ?? null,
        faltou: todos.filter((m) => faltou.has(m.id)).map((m) => m.nome) };
      if (!mid) { semPreco.push(item); continue; }
      const l = c.linhas.find((x) => x.mid === mid);
      item.mid = mid; item.marca = l.marca || c.marcaMenor;
      item.preco = l.preco ?? k.pagoPreco ?? k.notaPreco;
      item.totalEst = item.preco * p.qtd;
      item.total = item.totalEst;
      // a diferença da gôndola é contra o orçado congelado (ou, sem ele, contra o pesquisado antes da gôndola)
      const ref = typeof item.orcado === 'number' ? item.orcado : k.estPreco;
      if (real && typeof ref === 'number') item.totalEst = ref * p.qtd;
      item.semEst = real && typeof ref !== 'number'; // não tinha preço pesquisado
      if (temPago) {
        item.pago = { preco: k.pagoPreco ?? item.preco, qtd: k.pagoQtd ?? p.qtd };
        item.total = item.pago.preco * item.pago.qtd;
      }
      if (temNota) {
        item.nota = { preco: k.notaPreco, qtd: k.notaQtd ?? p.qtd };
        item.total = item.nota.preco * item.nota.qtd;
      }
      const g = grupos.get(mid);
      g.itens.push(item); g.total += item.total; if (item.ok) g.feitos++;
    }
    const porCat = (a, b) => (a.cat?.i ?? 99) - (b.cat?.i ?? 99) || a.p.nome.localeCompare(b.p.nome, 'pt');
    for (const g of grupos.values()) g.itens.sort(porCat);
    semPreco.sort(porCat);
    const lista = [...grupos.values()];
    return {
      grupos: lista, semPreco, fora, todos,
      total: lista.reduce((s, g) => s + g.total, 0),
      itens: lista.reduce((s, g) => s + g.itens.length, 0) + semPreco.length,
      feitos: lista.reduce((s, g) => s + g.feitos, 0) + semPreco.filter((i) => i.ok).length,
    };
  }

  // ---------- valor para gastar no mês (cartão, VR, débito…) ----------
  valorMes(mes) {
    const v = mes ? this.ix.mes.get(mesDe(mes))?.orcamento : null;
    return typeof v === 'number' && v > 0 ? v : null;
  }

  valorLista(id) {
    const v = this.ix.l.get(id)?.orcamento;
    return typeof v === 'number' && v > 0 ? v : null;
  }

  setValorLista(id, valor) { this.mesclar(`l:${id}`, { orcamento: valor && valor > 0 ? valor : null }); }

  setValorMes(mes, valor, { proximos = false } = {}) {
    mes = mesDe(mes);
    const v = valor && valor > 0 ? valor : null;
    return this.lote(() => {
      for (const m of this.meses()) {
        if (m !== mes && !(proximos && m > mes)) continue;
        this.mesclar(`mes:${m}`, { orcamento: v });
      }
    });
  }

  // Compara a lista de compras (preço no mercado escolhido × quantidade) com o valor.
  // Lista com limite próprio: compara só ela. Sem limite: o valor do mês contra a soma de todas as listas do mês.
  // estado: sem (sem valor definido) | ok | quase (90% ou mais) | passou
  orcamento(lista) {
    if (this.valorLista(lista)) return this.orcamentoLista(lista);
    return this.orcamentoMes(lista);
  }

  orcamentoMes(mes) { return this._orcamento(this.valorMes(mes), this.listas(mes).length ? this.listas(mes) : [mes], 'mes'); }

  orcamentoLista(lista) { return this._orcamento(this.valorLista(lista), [lista], 'lista'); }

  _orcamento(valor, listas, tipo) {
    const lcs = listas.map((id) => ({ id, lc: this.listaCompra(id) }));
    const itens = lcs.flatMap(({ lc }) => lc.grupos.flatMap((g) => g.itens));
    // itens das notas fiscais que não estavam na lista também são gasto do mês
    const foraLista = Math.round(this.notas().filter((n) => listas.includes(n.lista)).flatMap((n) => this.itensForaDaLista(n))
      .reduce((s, i) => s + (i.vTotal || 0), 0) * 100) / 100;
    const planejado = lcs.reduce((s, { lc }) => s + lc.total, 0) + foraLista;
    const lc = { semPreco: lcs.flatMap((x) => x.lc.semPreco), itens: lcs.reduce((s, x) => s + x.lc.itens, 0) };
    const porLista = lcs.length > 1 ? lcs.map(({ id, lc: x }) => ({ id, nome: this.nomeLista(id), total: x.total })) : null;
    const noCarrinho = itens.filter((i) => i.ok).reduce((s, i) => s + i.total, 0);
    const pagos = itens.filter((i) => i.pago || i.nota);
    const difCaixa = Math.round(pagos.filter((i) => !i.semEst).reduce((s, i) => s + i.total - i.totalEst, 0) * 100) / 100;
    const base = { tipo, lista: tipo === 'lista' ? listas[0] : null, porLista, valor, planejado, noCarrinho, foraLista, notas: itens.filter((i) => i.nota).length, pagos: pagos.length, difCaixa, semPreco: lc.semPreco.length, itens: lc.itens,
      maiores: itens.slice().sort((a, b) => b.total - a.total).slice(0, 5) };
    if (!valor) return { ...base, estado: 'sem', sobra: null, pct: null };
    const sobra = Math.round((valor - planejado) * 100) / 100;
    const pct = planejado / valor;
    return { ...base, sobra, pct, estado: sobra < 0 ? 'passou' : pct >= 0.9 ? 'quase' : 'ok' };
  }

  // Preço do produto (mesma "linhagem" pid) em cada mês e mercado — para o gráfico.
  historico(pid) {
    const meses = this.meses();
    const mercs = this.mercados({ todos: true });
    const series = mercs.map((m) => ({
      mercado: m,
      pontos: meses.map((mes) => {
        const r = this.preco(mes, pid, m.id);
        return typeof r?.preco === 'number' && this.produto(mes, pid) ? r.preco : null;
      }),
    })).filter((s) => s.pontos.some((x) => x !== null));
    const menores = meses.map((mes) => (this.produto(mes, pid) ? this.calcProduto(mes, pid).menor : null));
    return { meses, series, menores };
  }

  // Todos os produtos que já existiram (para escolher no histórico)
  linhagens() {
    const mapa = new Map();
    for (const mes of this.meses()) for (const p of this.produtos(mes)) mapa.set(p.id, { id: p.id, nome: p.nome, cat: p.cat, mes });
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  }

  // Categoria pela regra (sem olhar os outros produtos): { cid } ou null
  categoriaPelaRegra(nome) {
    const ws = palavrasNota(nome);
    const cats = this.categorias();
    const achar = (chaves) => cats.find((c) => chaves.some((k) => norm(c.nome).includes(k)))?.id || null;
    for (const frases of [true, false]) {
      for (const [chaves, termos] of REGRAS_CATEGORIA) {
        if (termos.some((t) => t.includes(' ') === frases && temFrase(ws, t))) return achar(chaves);
      }
    }
    return null;
  }

  // Categoria sugerida para um nome: primeiro a memória (um produto parecido que já existe — e as correções que vocês
  // fazem mudam a memória), depois as regras. como = 'memoria' | 'regra'.
  sugerirCategoria(nome, { mes = this.meses().at(-1), exceto = null } = {}) {
    const ws = palavrasNota(nome);
    if (!ws.length) return null;
    const ids = new Set(this.categorias().map((c) => c.id));
    // forte: todas as palavras de um produto que já existe estão no nome ("Banha" → "Banha suína"); fraca: metade delas
    let forte = null, fraca = null;
    for (const p of mes ? this.produtos(mes) : []) {
      if (p.id === exceto || !ids.has(p.cat)) continue;
      const pw = palavrasNota(p.nome);
      if (!pw.length || (!mesmaPalavra(ws[0], pw[0]) && !mesmaPalavra(pw[0], ws[0]))) continue;
      const cob = pw.filter((w) => ws.some((x) => mesmaPalavra(x, w) || mesmaPalavra(w, x))).length / pw.length;
      if (cob === 1 && (!forte || pw.length > forte.n)) forte = { cid: p.cat, n: pw.length };
      else if (cob >= 0.5 && (!fraca || cob > fraca.cob)) fraca = { cid: p.cat, cob };
    }
    if (forte) return { cid: forte.cid, como: 'memoria' };
    const cid = this.categoriaPelaRegra(nome);
    if (cid) return { cid, como: 'regra' };
    return fraca ? { cid: fraca.cid, como: 'memoria' } : null;
  }

  // Otimizar a lista (sem IA): o que costumam comprar e está sem quantidade, repetidos, embalagem maior que compensa,
  // itens sem preço e produtos que parecem estar na categoria errada.
  otimizar(lista) {
    const mes = mesDe(lista);
    const anteriores = this.meses().filter((m) => m < mes).slice(-3);
    const produtos = this.produtos(lista);
    const costuma = [];
    for (const p of produtos) {
      if (p.qtd) continue;
      const qtds = anteriores.map((m) => this.produto(m, p.id)?.qtd).filter(Boolean);
      if (qtds.length >= Math.min(2, anteriores.length) && qtds.length) costuma.push({ p, qtd: qtds.at(-1), meses: qtds.length });
    }
    const porChave = new Map();
    for (const p of produtos) {
      const k = palavrasNota(p.nome).map((w) => w.replace(/s$/, '')).join(' ');
      if (!k) continue;
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k).push(p);
    }
    const repetidos = [...porChave.values()].filter((g) => g.length > 1);
    const embalagem = [], semPreco = [];
    for (const p of produtos) {
      if (!p.qtd) continue;
      const c = this.calcProduto(lista, p.id);
      if (c.menor === null) semPreco.push(p);
      const pu = porUnidade(c);
      if (pu?.difere) embalagem.push({ p, pu, c });
    }
    const categorias = [];
    const nomeCat = new Map(this.categorias().map((c) => [c.id, c.nome]));
    for (const p of produtos) {
      const s = this.sugerirCategoria(p.nome, { mes, exceto: p.id });
      // só quando a regra discorda e nenhum produto parecido confirma a categoria atual
      if (s?.como === 'regra' && s.cid !== p.cat && nomeCat.has(s.cid)) categorias.push({ p, para: s.cid, de: p.cat });
    }
    return { costuma, repetidos, embalagem, semPreco, categorias };
  }

  // Junta dois produtos do mesmo mês: "fica" recebe quantidades (somadas), preços que faltam, marcas aceitas e o que foi
  // aprendido; "sai" é excluído deste mês (os meses anteriores ficam como estão).
  juntarProdutos(mes, fica, sai) {
    mes = mesDe(mes);
    return this.lote(() => {
      for (const l of this.listas(mes)) {
        const qs = this.produto(l, sai)?.qtd;
        if (qs) this.setQtd(l, fica, (this.produto(l, fica)?.qtd || 0) + qs);
      }
      for (const [mid, r] of this.precosDoProduto(mes, sai)) if (!this.preco(mes, fica, mid)?.preco && typeof r.preco === 'number') this.set(`r:${mes}:${fica}:${mid}`, r);
      if (!this.ix.mc.has(fica) && this.ix.mc.has(sai)) this.set(`mc:${fica}`, this.ix.mc.get(sai));
      for (const [k, r] of [...this.recs]) {
        if ((k.startsWith('vd:') || k.startsWith('vn:')) && r.v?.pid === sai) this.set(k, { ...r.v, pid: fica });
        if (k.startsWith('nf:') && mesDe(r.v?.lista) === mes && r.v.itens.some((i) => i.pid === sai)) this.set(k, { ...r.v, itens: r.v.itens.map((i) => (i.pid === sai ? { ...i, pid: fica } : i)) });
      }
      this.excluirProduto(mes, sai);
    });
  }

  duplicados(mes, nome, exceto) {
    const n = norm(nome);
    return this.produtos(mes).filter((p) => p.id !== exceto && norm(p.nome) === n);
  }

  // Rota sugerida: com quais 1, 2 ou 3 mercados dá para comprar tudo pagando quase o mesmo.
  // Só entram itens com quantidade e com preço em algum mercado; considera os "não achei".
  sugerirRota(mes) {
    const mercs = this.mercados();
    const itens = [];
    for (const p of this.produtos(mes)) {
      if (!p.qtd) continue;
      const faltou = new Set(this.ix.k.get(mes)?.get(p.id)?.faltou || []);
      const precos = new Map();
      for (const m of mercs) {
        const r = this.preco(mes, p.id, m.id);
        if (typeof r?.preco === 'number' && !faltou.has(m.id) && this.marcaAceita(p.id, r.marca)) precos.set(m.id, r.preco * p.qtd);
      }
      if (precos.size) itens.push(precos);
    }
    if (!itens.length || mercs.length < 2) return null;
    const custo = (ids) => {
      let total = 0;
      for (const pr of itens) {
        let menor = null;
        for (const id of ids) { const v = pr.get(id); if (v !== undefined && (menor === null || v < menor)) menor = v; }
        if (menor === null) return null; // algum item não tem preço nesses mercados
        total += menor;
      }
      return total;
    };
    const todos = mercs.map((m) => m.id);
    const ideal = custo(todos);
    const usados = new Set(itens.map((pr) => [...pr].sort((a, b) => a[1] - b[1])[0][0])).size;
    const opcoes = [];
    const combinar = (ini, atual, tam) => {
      if (atual.length === tam) {
        const t = custo(atual);
        if (t !== null) opcoes.push({ ids: [...atual], mercados: atual.map((id) => mercs.find((m) => m.id === id)), total: t, extra: Math.round((t - ideal) * 100) / 100 });
        return;
      }
      for (let i = ini; i < todos.length; i++) { atual.push(todos[i]); combinar(i + 1, atual, tam); atual.pop(); }
    };
    for (let tam = 1; tam <= Math.min(3, usados - 1); tam++) combinar(0, [], tam);
    opcoes.sort((a, b) => a.ids.length - b.ids.length || a.total - b.total);
    // a melhor de cada tamanho
    const melhores = [];
    for (const o of opcoes) if (!melhores.some((x) => x.ids.length === o.ids.length)) melhores.push(o);
    return { ideal, usados, itens: itens.length, opcoes: melhores };
  }

  // ---------- operações ----------
  iniciarPadrao(mes = mesDeData(), produtos = []) {
    return this.lote(() => {
      MERCADOS_PADRAO.forEach((nome, i) => this.set(`m:${novoId()}`, { nome, ordem: i, arquivado: false }));
      const cats = CATEGORIAS_PADRAO.map((nome, i) => { const id = novoId(); this.set(`c:${id}`, { nome, ordem: i }); return [nome, id]; });
      const porNome = new Map(cats);
      this.set(`mes:${mes}`, { criado: Date.now() });
      for (const [cat, nome] of produtos) {
        const cid = porNome.get(cat);
        if (cid) this.set(`p:${mes}:${novoId()}`, { nome, cat: cid, qtd: null, obs: '' });
      }
    });
  }

  // O valor para gastar vem do mês copiado (ou do último mês antes deste), já que costuma ser o mesmo
  criarMes(novo, { de = null, copiarQtd = false, copiarMarca = true, orcamento } = {}) {
    if (orcamento === undefined) orcamento = this.valorMes(de || this.meses().filter((m) => m < novo).pop());
    return this.lote(() => {
      this.set(`mes:${novo}`, { criado: Date.now(), ...(orcamento ? { orcamento } : {}) });
      if (!de) return;
      for (const p of this.produtos(de)) {
        if (this.produto(novo, p.id)) continue;
        this.set(`p:${novo}:${p.id}`, { nome: p.nome, cat: p.cat, qtd: copiarQtd ? p.qtd ?? null : null, obs: '' });
        if (!copiarMarca) continue;
        for (const [mid, r] of this.precosDoProduto(de, p.id)) {
          if (r.marca) this.set(`r:${novo}:${p.id}:${mid}`, { preco: null, marca: r.marca, auto: !!r.auto, obs: '' });
        }
      }
    });
  }

  excluirMes(mes) {
    mes = mesDe(mes);
    return this.lote(() => {
      for (const k of [...this.recs.keys()]) {
        const [t, a] = k.split(':');
        if (['mes', 'cm', 'p', 'r', 'k', 'l', 'q', 'oc'].includes(t) && mesDe(a) === mes) this.del(k);
        if (t === 'nf' && mesDe(this.get(k)?.lista) === mes) this.del(k);
      }
    });
  }

  addProduto(lista, { nome, cat, qtd = null, obs = '' }) {
    const pid = novoId();
    this.lote(() => {
      this.set(`p:${mesDe(lista)}:${pid}`, { nome: nome.trim(), cat, qtd: null, obs });
      if (qtd) this.setQtd(lista, pid, qtd);
    });
    return pid;
  }

  // nome/categoria/obs são do mês; qtd é da lista
  editarProduto(lista, pid, campos) {
    const mes = mesDe(lista);
    const p = this.ix.p.get(mes)?.get(pid);
    if (!p) return;
    const { qtd, ...resto } = campos;
    const novo = { ...p, ...resto };
    if ('qtd' in campos) {
      if (lista === mes) novo.qtd = qtd ?? null;
      else if (qtd) this.set(`q:${lista}:${pid}`, { qtd });
      else this.del(`q:${lista}:${pid}`);
    }
    this.set(`p:${mes}:${pid}`, novo);
  }

  // Leva nome/categoria também para os meses seguintes já criados (meses anteriores ficam como estão)
  aplicarNosSeguintes(mes, pid, campos) {
    mes = mesDe(mes);
    return this.lote(() => {
      for (const m of this.meses()) if (m > mes && this.produto(m, pid)) this.editarProduto(m, pid, campos);
    });
  }

  moverProdutos(mes, pids, cat, { futuros = false } = {}) {
    return this.lote(() => {
      for (const pid of pids) {
        this.editarProduto(mes, pid, { cat });
        if (futuros) this.aplicarNosSeguintes(mes, pid, { cat });
      }
    });
  }

  // futuros = true: apaga também dos meses seguintes já criados. Meses anteriores nunca são tocados.
  excluirProduto(lista, pid, { futuros = false } = {}) {
    const mes = mesDe(lista);
    return this.lote(() => {
      for (const m of this.meses()) {
        if (m < mes || (m > mes && !futuros)) continue;
        if (!this.produto(m, pid)) continue;
        this.del(`p:${m}:${pid}`);
        for (const l of this.listas(m)) { this.del(`k:${l}:${pid}`); this.del(`q:${l}:${pid}`); }
        for (const mid of this.precosDoProduto(m, pid).keys()) this.del(`r:${m}:${pid}:${mid}`);
      }
    });
  }

  // Repete as quantidades de outro mês nos produtos que ainda estão sem quantidade
  repetirQuantidades(mes, de) {
    let n = 0;
    const desfazer = this.lote(() => {
      for (const p of this.produtos(mes)) {
        if (p.qtd) continue;
        const q = this.produto(de, p.id)?.qtd;
        if (q) { this.setQtd(mes, p.id, q); n++; }
      }
    });
    return { n, desfazer };
  }

  setQtd(mes, pid, qtd) { this.editarProduto(mes, pid, { qtd: qtd && qtd > 0 ? qtd : null }); }

  _setR(lista, pid, mid, campos) {
    const k = `r:${mesDe(lista)}:${pid}:${mid}`;
    const atual = this.get(k) || { preco: null, marca: '', auto: false, obs: '' };
    const novo = { ...atual, ...campos };
    if (novo.preco === null && !novo.marca && !novo.obs) return this.del(k);
    return this.set(k, novo);
  }

  setPreco(mes, pid, mid, preco) { this._setR(mes, pid, mid, { preco }); }
  setObs(mes, pid, mid, obs) { this._setR(mes, pid, mid, { obs }); }

  // Marca/tamanho digitada no primeiro mercado é copiada para os outros que estão vazios
  // (ou que só têm cópia automática). Digitar num mercado específico fixa aquele valor.
  setMarca(mes, pid, mid, marca) {
    marca = marca.trimStart();
    this.lote(() => {
      this._setR(mes, pid, mid, { marca, auto: false });
      const mercs = this.mercados();
      const fonte = mercs.find((m) => { const r = this.preco(mes, pid, m.id); return r?.marca && !r.auto; });
      const valor = fonte ? this.preco(mes, pid, fonte.id).marca : '';
      for (const m of mercs) {
        if (m.id === mid) continue;
        const r = this.preco(mes, pid, m.id);
        if (!r?.marca || r.auto) this._setR(mes, pid, m.id, { marca: valor, auto: !!valor });
      }
    });
  }

  addMercado(nome) {
    const id = novoId();
    const ordem = Math.max(-1, ...this.mercados({ todos: true }).map((m) => m.ordem ?? 0)) + 1;
    this.set(`m:${id}`, { nome: nome.trim(), ordem, arquivado: false });
    return id;
  }

  renomearMercado(id, nome) { this.mesclar(`m:${id}`, { nome: nome.trim() }); }
  arquivarMercado(id, arquivado = true) { this.mesclar(`m:${id}`, { arquivado }); }

  reordenar(tipo, ids) {
    return this.lote(() => ids.forEach((id, i) => this.mesclar(`${tipo}:${id}`, { ordem: i })));
  }

  apagarMercado(id) {
    return this.lote(() => {
      for (const [k, r] of [...this.recs]) {
        if (r.v === null) continue;
        if (k.startsWith('r:') && k.endsWith(`:${id}`)) this.del(k);
        else if (k.startsWith('k:') && r.v.merc === id) this.set(k, { ...r.v, merc: null });
      }
      this.del(`m:${id}`);
    });
  }

  addCategoria(nome) {
    const id = novoId();
    const ordem = Math.max(-1, ...this.categorias().map((c) => c.ordem ?? 0)) + 1;
    this.set(`c:${id}`, { nome: nome.trim(), ordem });
    return id;
  }

  renomearCategoria(id, nome) { this.mesclar(`c:${id}`, { nome: nome.trim() }); }

  // Quantos produtos usam a categoria (em qualquer mês)
  usoCategoria(id) {
    let n = 0;
    for (const mapa of this.ix.p.values()) for (const p of mapa.values()) if (p.cat === id) n++;
    return n;
  }

  excluirCategoria(id, moverPara = null) {
    if (this.usoCategoria(id) && !moverPara) throw new Error('Categoria com produtos: escolha para onde mover.');
    return this.lote(() => {
      if (moverPara) for (const [mes, mapa] of this.ix.p) for (const [pid, p] of [...mapa]) if (p.cat === id) this.set(`p:${mes}:${pid}`, { ...p, cat: moverPara });
      this.del(`c:${id}`);
    });
  }

  // ---------- modo compra ----------
  marcarCompra(mes, pid, ok) {
    this.lote(() => { if (ok) this.congelarOrcado(mes); this.mesclar(`k:${mes}:${pid}`, { ok }); });
  }
  escolherMercadoCompra(mes, pid, merc) { this.mesclar(`k:${mes}:${pid}`, { merc }); }
  // Não achei o item neste mercado: tira o mercado só para este item
  naoAchei(mes, pid, mid) {
    const k = this.get(`k:${mes}:${pid}`) || {};
    const faltou = [...new Set([...(k.faltou || []), mid])];
    this.set(`k:${mes}:${pid}`, { ...k, ok: false, faltou, merc: k.merc === mid ? null : k.merc ?? null });
  }
  voltarNaoAchei(mes, pid) { this.mesclar(`k:${mes}:${pid}`, { faltou: [] }); }

  // Preço e quantidade vistos na gôndola (pegar = já põe no carrinho). atualizarPesquisa grava o preço também na
  // pesquisa daquele mercado; o item fica preso nesse mercado para não "pular" de grupo.
  pagarNoCaixa(mes, pid, { mid, preco = null, qtd = null, atualizarPesquisa = true, pegar = true }) {
    return this.lote(() => {
      this.congelarOrcado(mes); // antes de mexer na pesquisa
      const k = this.get(`k:${mes}:${pid}`) || {};
      // guarda o preço pesquisado de antes, para mostrar a diferença mesmo depois de atualizar a pesquisa
      const antes = typeof k.estPreco === 'number' && k.merc === mid ? k.estPreco : this.preco(mes, pid, mid)?.preco ?? null;
      this.set(`k:${mes}:${pid}`, { ...k, ok: pegar || !!k.ok, merc: mid, pagoPreco: preco, pagoQtd: qtd, estPreco: antes, atualizou: !!atualizarPesquisa });
      if (atualizarPesquisa && typeof preco === 'number') this.setPreco(mes, pid, mid, preco);
    });
  }

  // Não vou comprar este mês: zera a quantidade (o produto continua na lista de preços)
  tirarDaLista(mes, pid) {
    return this.lote(() => {
      this.setQtd(mes, pid, null);
      this.del(`k:${mes}:${pid}`);
    });
  }

  voltarAoPesquisado(mes, pid) {
    return this.lote(() => {
      const k = this.get(`k:${mes}:${pid}`) || {};
      if (k.atualizou && k.merc) this.setPreco(mes, pid, k.merc, typeof k.estPreco === 'number' ? k.estPreco : null);
      this.set(`k:${mes}:${pid}`, { ...k, pagoPreco: null, pagoQtd: null, estPreco: null, atualizou: false });
    });
  }
  setForaCompra(mes, mid, foraDaRota) {
    const fora = new Set(this.ix.cm.get(mes)?.fora || []);
    if (foraDaRota) fora.add(mid); else fora.delete(mid);
    this.set(`cm:${mes}`, { fora: [...fora] });
  }
  limparCompra(mes) {
    return this.lote(() => { this.del(`oc:${mes}`); for (const [pid, k] of [...(this.ix.k.get(mes) || [])]) if (k.ok || k.faltou?.length || k.pagoPreco != null || k.pagoQtd != null) this.set(`k:${mes}:${pid}`, { ...k, ok: false, faltou: [], pagoPreco: null, pagoQtd: null, estPreco: null, atualizou: false }); });
  }

  // Gôndola cara: anota o preço visto (se quiser) e leva o item para outro mercado da rota
  levarPara(mes, pid, { mid, para, preco = null, atualizarPesquisa = true }) {
    return this.lote(() => {
      this.congelarOrcado(mes);
      if (atualizarPesquisa && typeof preco === 'number') this.setPreco(mes, pid, mid, preco);
      const k = this.get(`k:${mes}:${pid}`) || {};
      this.set(`k:${mes}:${pid}`, { ...k, ok: false, merc: para, pagoPreco: null, pagoQtd: null, estPreco: null, atualizou: false });
    });
  }

  // Gôndola 10% ou mais acima do orçado e outro mercado da rota mais barato que ela: vale avisar na hora.
  // Sem alternativa não adianta avisar (devolve null).
  alertaGondola(mes, pid, mid, preco) {
    if (typeof preco !== 'number') return null;
    const k = this.get(`k:${mes}:${pid}`) || {};
    const congelado = this.ix.oc.get(mes)?.itens?.[pid]?.[0];
    const antes = k.merc === mid && typeof k.estPreco === 'number' ? k.estPreco : this.preco(mes, pid, mid)?.preco;
    const ref = typeof congelado === 'number' ? congelado : antes;
    if (typeof ref !== 'number' || !ref || preco < ref * 1.1 - 0.0005) return null;
    const fora = new Set(this.ix.cm.get(mes)?.fora || []);
    const faltou = new Set(k.faltou || []);
    const outros = this.mercados().filter((m) => m.id !== mid && !fora.has(m.id) && !faltou.has(m.id));
    const c = this.calcProduto(mes, pid, outros);
    if (c.menor === null || c.menor >= preco) return null;
    return { ref, pct: Math.round((preco / ref - 1) * 100), alt: { mid: c.mercMenor, nome: c.nomeMercMenor, preco: c.menor, marca: c.marcaMenor } };
  }

  // ---------- orçado congelado ----------
  // Foto da lista na primeira ação do Modo compra: a pesquisa pode mudar depois, a compra compara com o planejado.
  orcado(lista) { return this.ix.oc.get(lista) || null; }

  congelarOrcado(lista, { forcar = false } = {}) {
    if (!forcar && this.ix.oc.has(lista)) return;
    const itens = {};
    let total = 0;
    for (const it of this.listaCompra(lista).grupos.flatMap((g) => g.itens)) {
      const preco = it.semEst ? null : it.totalEst / it.p.qtd;
      if (typeof preco !== 'number') continue;
      itens[it.p.id] = [Math.round(preco * 10000) / 10000, it.mid];
      total += preco * it.p.qtd;
    }
    this.set(`oc:${lista}`, { quando: Date.now(), total: Math.round(total * 100) / 100, itens });
  }

  // ---------- lista da dieta ----------
  listaDaDieta(mes) { return this.listas(mes).find((id) => this.ix.l.get(id)?.dieta) || null; }

  // Quanto comprar de um item da dieta (g, ml, un): pela embalagem anotada na marca ("Sadia 1kg" → 1.200 g = 2);
  // sem tamanho, g vira kg e ml vira L (preço por kg); aviso = melhor conferir.
  embalagens(lista, pid, qtd, unid) {
    if (typeof qtd !== 'number' || qtd <= 0) return { qtd: 1, aviso: true };
    const c = pid ? this.calcProduto(lista, pid) : null;
    const t = lerTamanho(c?.marcaMenor || c?.linhas.find((l) => l.marca)?.marca || '');
    const base = { g: 'kg', ml: 'L', un: 'un' }[unid];
    const em = unid === 'un' ? qtd : qtd / 1000;
    if (t && t.base === base) return { qtd: Math.max(1, Math.ceil(em / t.qtd - 0.001)), tam: t };
    if (unid === 'un' || !base) return { qtd: Math.ceil(qtd), aviso: !base };
    return { qtd: Math.max(0.1, Math.round(em * 10) / 10), aviso: true };
  }

  // Preço por g, ml ou un de um item da dieta ligado a um produto: o menor preço anotado ÷ o tamanho da marca
  // ("Sadia 1kg" a R$ 20 → R$ 0,02/g). Vai para o app da dieta somar o custo da semana. null sem preço ou sem
  // tamanho que bata com a unidade da dieta (sem tamanho, "un" vale 1 por embalagem).
  precoDaDieta(lista, pid, unid) {
    const base = { g: 'kg', ml: 'L', un: 'un' }[unid];
    const c = pid && base ? this.calcProduto(lista, pid) : null;
    if (!c || c.menor === null) return null;
    const t = lerTamanho(c.marcaMenor || c.linhas.find((l) => l.marca)?.marca || '');
    if (t?.base === base) return c.menor / t.qtd / (base === 'un' ? 1 : 1000);
    return !t && base === 'un' ? c.menor : null;
  }

  // Põe a dieta numa lista: itens = [{ pid, qtd, desc }]. Sem "para", cria (ou substitui) a lista "Dieta · Mês";
  // com "para", soma as quantidades numa lista que já existe. Aprende os nomes ligados (como na nota fiscal).
  aplicarDieta(mes, itens, { de, ate, para = null } = {}) {
    mes = mesDe(mes);
    let id = para;
    const desfazer = this.lote(() => {
      if (!id) {
        id = this.listaDaDieta(mes) || this.criarLista(mes, { nome: `Dieta · ${MESES[Number(mes.slice(5)) - 1]}` });
        this.mesclar(`l:${id}`, { dieta: { de, ate, quando: Date.now() } });
        for (const p of this.produtos(id)) if (p.qtd) this.setQtd(id, p.id, null);
      }
      const soma = new Map();
      for (const i of itens) {
        if (!i.pid || !this.produto(id, i.pid)) continue;
        soma.set(i.pid, (soma.get(i.pid) || 0) + i.qtd);
        const kd = chaveDesc(i.desc || '');
        if (kd && this.ix.vd.get(kd)?.pid !== i.pid) this.set(`vd:${kd}`, { pid: i.pid, desc: i.desc });
      }
      for (const [pid, q] of soma) this.setQtd(id, pid, Math.round(((para ? this.produto(id, pid).qtd || 0 : 0) + q) * 1000) / 1000);
    });
    return { id, desfazer };
  }

  // ---------- marcas ----------
  marcasAceitas(pid) { return this.ix.mc.get(pid)?.aceitas || []; }

  setMarcasAceitas(pid, lista) {
    const aceitas = [...new Map(lista.map((x) => x.trim()).filter(Boolean).map((x) => [norm(x), x])).values()];
    this.set(`mc:${pid}`, aceitas.length ? { aceitas } : null);
  }

  // Sem marcas escolhidas (ou sem marca escrita no mercado) vale qualquer uma
  marcaAceita(pid, marca) {
    const aceitas = this.ix.mc.get(pid)?.aceitas;
    if (!aceitas?.length || !marca) return true;
    const n = norm(marca);
    return aceitas.some((a) => n.includes(norm(a)));
  }

  // Marcas já escritas neste produto (todos os meses e mercados), das mais recentes para as mais antigas
  marcasUsadas(pid) {
    const vistas = new Map();
    for (const mes of this.meses().reverse()) {
      for (const r of this.precosDoProduto(mes, pid).values()) if (r?.marca && !vistas.has(norm(r.marca))) vistas.set(norm(r.marca), r.marca.trim());
    }
    return [...vistas.values()];
  }

  // ---------- nota fiscal ----------
  notas() { return [...this.ix.nf].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => String(b.emissao).localeCompare(String(a.emissao))); }
  nota(chave) { const v = this.ix.nf.get(chave); return v ? { chave, ...v } : null; }
  mercadoDoCnpj(cnpj) { const mid = this.get(`cn:${raizCnpj(cnpj)}`)?.mid; return mid && this.ix.m.has(mid) ? mid : null; }

  // Itens da nota que não são da lista: sem produto ligado, ou produto sem quantidade nesta lista
  itensForaDaLista(n) { return n.itens.filter((i) => !i.pid || !this.produto(n.lista, i.pid)?.qtd); }

  // Produtos do mês parecidos com a descrição da nota, do mais provável para o menos.
  // Compara com o nome do produto e com as descrições já ligadas a ele; a marca já usada no produto ajuda ("CATU" → Catupiry).
  // cabeca = a 1ª palavra do produto é a 1ª da nota (a nota começa pelo tipo: "SAB LIQ…", "LT DESN…").
  sugerirVinculos(lista, desc) {
    const d = palavrasNota(desc);
    const inicio = d.slice(0, 1);
    const aprendidos = new Map();
    for (const v of this.ix.vd.values()) { if (!aprendidos.has(v.pid)) aprendidos.set(v.pid, []); aprendidos.get(v.pid).push(palavrasNota(v.desc)); }
    const medir = (ws) => {
      const n = ws.filter((w) => bate(d, w)).length;
      return ws.length && n ? { n, frac: n / ws.length, cabeca: bate(inicio, ws[0]) } : null;
    };
    return this.produtos(lista).map((p) => {
      const [m] = [medir(palavrasNota(p.nome)), ...(aprendidos.get(p.id) || []).map(medir)].filter(Boolean)
        .sort((a, b) => b.cabeca - a.cabeca || b.frac - a.frac || b.n - a.n);
      if (!m) return null;
      const marca = this.marcasUsadas(p.id).some((x) => palavrasNota(nomeDaMarca(x)).some((w) => w.length >= 3 && bate(d, w)));
      return { p, n: m.n, cabeca: m.cabeca, marca, score: Math.min(1, m.frac + (marca ? 0.34 : 0)) };
    }).filter(Boolean).sort((a, b) => b.cabeca - a.cabeca || b.score - a.score || b.n - a.n || !!b.p.qtd - !!a.p.qtd);
  }

  // Ligação automática: código aprendido neste mercado → descrição aprendida (qualquer mercado) → nome, só quando
  // não há dúvida (tipo do produto no começo da nota, 2/3 das palavras ou mais, sem empate). Senão sugere o mais provável.
  vincularItem(lista, cnpj, item) {
    const ok = (pid) => pid && this.produto(lista, pid);
    const porCodigo = item.cod ? this.get(`vn:${raizCnpj(cnpj)}:${item.cod}`)?.pid : null;
    if (ok(porCodigo)) return { pid: porCodigo, como: 'codigo' };
    const porNome = this.ix.vd.get(chaveDesc(item.desc))?.pid;
    if (ok(porNome)) return { pid: porNome, como: 'aprendido' };
    const [a, b] = this.sugerirVinculos(lista, item.desc);
    const empate = b && b.cabeca === a.cabeca && a.score - b.score < 0.01 && b.n >= a.n;
    if (a?.cabeca && a.score >= 0.66 && !empate) return { pid: a.p.id, como: 'nome' };
    return { pid: null, como: null, sugestao: a && a.score >= 0.34 ? a.p.id : null };
  }

  // Nomes da nota que o app aprendeu (para conferir e corrigir)
  nomesAprendidos() { return [...this.ix.vd].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => a.desc.localeCompare(b.desc, 'pt')); }

  esquecerNome(chave) {
    const v = this.ix.vd.get(chave);
    return this.lote(() => {
      this.del(`vd:${chave}`);
      if (v) for (const [k, r] of this.recs) if (k.startsWith('vn:') && r.v?.pid === v.pid && chaveDesc(r.v.desc) === chave) this.del(k);
    });
  }

  // Grava a nota (itens já com pid ou null), aprende os vínculos e o mercado, marca os itens como comprados
  // com o preço da nota e, se quiser, atualiza a pesquisa daquele mercado.
  salvarNota(nota, { lista, mid, atualizarPesquisa = true }) {
    return this.lote(() => {
      this.congelarOrcado(lista); // o orçado é de antes da compra
      const raiz = raizCnpj(nota.cnpj);
      this.set(`cn:${raiz}`, { mid });
      const oc = this.ix.oc.get(lista)?.itens || {};
      const itens = nota.itens.map(({ desc, cod, qtd, un, vUnit, vTotal, pid, ref, refTipo }) => {
        const i = { desc, cod, qtd, un, vUnit, vTotal, pid: pid || null, ref: ref ?? null, refTipo: refTipo ?? null };
        // o preço esperado, guardado antes da nota mexer na pesquisa: gôndola → orçado → pesquisa
        if (i.pid && i.ref === null) {
          const k = this.get(`k:${lista}:${i.pid}`) || {};
          const opcoes = [['gondola', k.merc === mid ? k.pagoPreco : null], ['orcado', oc[i.pid]?.[0]], ['pesquisa', this.preco(lista, i.pid, mid)?.preco]];
          const achou = opcoes.find(([, v]) => typeof v === 'number');
          if (achou) [i.refTipo, i.ref] = achou;
        }
        return i;
      });
      // aprende (ou desaprende, se ela tirou a ligação) pelo código neste mercado e pela descrição em qualquer mercado
      for (const i of itens) {
        const kv = i.cod ? `vn:${raiz}:${i.cod}` : null, kd = chaveDesc(i.desc) ? `vd:${chaveDesc(i.desc)}` : null;
        for (const k of [kv, kd]) {
          if (!k) continue;
          const atual = this.get(k)?.pid;
          if (i.pid && atual !== i.pid) this.set(k, { pid: i.pid, desc: i.desc });
          else if (!i.pid && atual && this.produto(lista, atual)) this.del(k);
        }
      }
      this.set(`nf:${nota.chave}`, { lista, mid, cnpj: nota.cnpj, loja: nota.loja, emissao: nota.emissao, total: nota.total, desconto: nota.desconto || 0, itens, lida: Date.now() });
      // o mesmo produto pode aparecer em mais de uma linha: soma
      const porPid = new Map();
      for (const i of itens) {
        if (!i.pid || !i.qtd) continue;
        const x = porPid.get(i.pid) || { qtd: 0, total: 0 };
        x.qtd += i.qtd; x.total += i.vTotal ?? i.vUnit * i.qtd;
        porPid.set(i.pid, x);
      }
      for (const [pid, x] of porPid) {
        const preco = Math.round((x.total / x.qtd) * 10000) / 10000;
        if (atualizarPesquisa) this.setPreco(lista, pid, mid, preco);
        if (!this.produto(lista, pid)?.qtd) continue; // fora da lista: só a pesquisa
        const k = this.get(`k:${lista}:${pid}`) || {};
        this.set(`k:${lista}:${pid}`, { ...k, ok: true, merc: mid, notaPreco: preco, notaQtd: Math.round(x.qtd * 1000) / 1000, notaChave: nota.chave });
      }
    });
  }

  excluirNota(chave) {
    const n = this.nota(chave);
    if (!n) return () => {};
    return this.lote(() => {
      this.del(`nf:${chave}`);
      for (const [pid, k] of [...(this.ix.k.get(n.lista) || [])]) {
        if (k.notaChave === chave) this.set(`k:${n.lista}:${pid}`, { ...k, notaPreco: null, notaQtd: null, notaChave: null });
      }
    });
  }

  // Conferência da nota: cobrado acima da gôndola (Lei 10.962/2004: vale o menor preço), fora da lista,
  // marcado no carrinho mas não cobrado, e orçado × gôndola × nota.
  auditarNota(chave) {
    const n = this.nota(chave);
    if (!n) return null;
    const oc = this.ix.oc.get(n.lista)?.itens || {};
    const linhas = n.itens.map((i) => {
      const k = i.pid ? this.get(`k:${n.lista}:${i.pid}`) || {} : {};
      const gondola = typeof k.pagoPreco === 'number' && k.merc === n.mid ? k.pagoPreco : null;
      const orcado = i.pid ? oc[i.pid]?.[0] ?? null : null;
      const unit = i.qtd ? i.vTotal / i.qtd : i.vUnit;
      const acima = gondola !== null && unit > gondola + 0.005 ? Math.round((unit - gondola) * i.qtd * 100) / 100 : 0;
      const ref = i.ref ?? gondola ?? orcado; // notas antigas não guardavam a referência
      const refTipo = i.ref != null ? i.refTipo : gondola !== null ? 'gondola' : orcado !== null ? 'orcado' : null;
      const dif = ref !== null ? Math.round((unit - ref) * i.qtd * 100) / 100 : null;
      return { ...i, nome: i.pid ? this.produto(n.lista, i.pid)?.nome || i.desc : null, gondola, orcado, unit, acima, ref, refTipo, dif };
    });
    const naNota = new Set(n.itens.map((i) => i.pid).filter(Boolean));
    const grupo = this.listaCompra(n.lista).grupos.find((g) => g.mercado.id === n.mid);
    const naoCobrados = (grupo?.itens || []).filter((it) => it.ok && !naNota.has(it.p.id) && !it.nota);
    const fora = this.itensForaDaLista(n);
    const soma = (f) => Math.round(linhas.reduce((s, l) => s + (f(l) ?? 0), 0) * 100) / 100;
    return {
      nota: n, linhas, naoCobrados, fora,
      acimaGondola: linhas.filter((l) => l.acima > 0),
      direito: soma((l) => l.acima),
      totalFora: Math.round(fora.reduce((s, i) => s + i.vTotal, 0) * 100) / 100,
      // pagou mais / menos do que o esperado (fora os já contados como acima da gôndola)
      maisCaro: linhas.filter((l) => l.dif > 0.004 && !l.acima),
      maisBarato: linhas.filter((l) => l.dif !== null && l.dif < -0.004),
      esperado: soma((l) => (l.ref !== null ? l.ref * l.qtd : null)),
      comRef: linhas.filter((l) => l.ref !== null).length,
      notaDosEsperados: soma((l) => (l.ref !== null ? l.vTotal : null)),
    };
  }

  // ---------- feedback ----------
  feedbacks() { return [...this.ix.fb].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.quando - a.quando); }
  addFeedback(campos) { const id = novoId(); this.set(`fb:${id}`, { status: 'novo', resposta: '', quando: Date.now(), ...campos }); return id; }
  editarFeedback(id, campos) { this.mesclar(`fb:${id}`, campos); }

  // ---------- cópia de segurança ----------
  // Deixa os valores iguais aos da cópia, como mudanças novas (assim a restauração também sincroniza).
  restaurar(recsCopia) {
    const alvo = new Map(recsCopia.map((r) => [r.k, r.v]));
    return this.lote(() => {
      for (const k of new Set([...this.recs.keys(), ...alvo.keys()])) {
        const v = alvo.has(k) ? alvo.get(k) : null;
        const atual = this.get(k);
        if (!igual(atual ?? null, v)) this.set(k, v);
      }
    });
  }
}
