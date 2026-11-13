// Importar e exportar Excel (.xlsx) no formato da planilha "Lista de Compras — Pesquisa de Preços".
// Sem bibliotecas: o .xlsx é um .zip de XMLs; o navegador comprime/descomprime (CompressionStream).
// Funciona igual no navegador e no Node (testes).

import { MESES, norm, lerNumero, nomeMes, novoId, mesDe } from './modelo.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

// ======================= ZIP =======================
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

async function passar(u8, stream) {
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function lerZip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let i = u8.length - 22;
  while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
  if (i < 0) throw new Error('Este arquivo não é um .xlsx válido.');
  const n = dv.getUint16(i + 10, true);
  let off = dv.getUint32(i + 16, true);
  const itens = new Map();
  for (let j = 0; j < n; j++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(off + 10, true);
    const tam = dv.getUint32(off + 20, true);
    const nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const nome = dec.decode(u8.subarray(off + 46, off + 46 + nl));
    off += 46 + nl + el + cl;
    const ini = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    itens.set(nome, { metodo, dados: u8.subarray(ini, ini + tam) });
  }
  return {
    nomes: [...itens.keys()],
    async texto(nome) {
      const it = itens.get(nome);
      if (!it) return null;
      const bruto = it.metodo === 8 ? await passar(it.dados, new DecompressionStream('deflate-raw')) : it.dados;
      return dec.decode(bruto);
    },
  };
}

export async function criarZip(arquivos) {
  const partes = [], central = [];
  let off = 0;
  for (const { nome, texto } of arquivos) {
    const bruto = enc.encode(texto);
    const comp = await passar(bruto, new CompressionStream('deflate-raw'));
    const nb = enc.encode(nome);
    const crc = crc32(bruto);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
    loc.setUint16(8, 8, true); loc.setUint16(10, 0, true); loc.setUint16(12, 33, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, comp.length, true); loc.setUint32(22, bruto.length, true);
    loc.setUint16(26, nb.length, true); loc.setUint16(28, 0, true);
    partes.push(new Uint8Array(loc.buffer), nb, comp);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 8, true); cen.setUint16(12, 0, true); cen.setUint16(14, 33, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, comp.length, true); cen.setUint32(24, bruto.length, true);
    cen.setUint16(28, nb.length, true); cen.setUint32(42, off, true);
    central.push(new Uint8Array(cen.buffer), nb);
    off += 30 + nb.length + comp.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ======================= XML =======================
const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xdes = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
const attr = (txt, nome) => { const m = new RegExp(`\\b${nome}="([^"]*)"`).exec(txt); return m ? xdes(m[1]) : null; };
const textos = (xml) => { let s = ''; for (const m of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += xdes(m[1]); return s; };

export const colNum = (letras) => [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
export const colLetra = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function lerAba(xml, compartilhadas) {
  const linhas = new Map();
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = m[1], dentro = m[2] || '';
    const ref = attr(a, 'r');
    if (!ref) continue;
    const [, letras, num] = /^([A-Z]+)(\d+)$/.exec(ref) || [];
    if (!letras) continue;
    const t = attr(a, 't');
    let val = null;
    const v = /<v>([\s\S]*?)<\/v>/.exec(dentro);
    if (t === 's' && v) val = compartilhadas[+v[1]] ?? '';
    else if (t === 'inlineStr') val = textos(dentro);
    else if (t === 'str' || t === 'e') val = v ? xdes(v[1]) : '';
    else if (t === 'b') val = v ? v[1] === '1' : null;
    else if (v) val = Number(v[1]);
    // Fórmula com texto (<f>$E14</f>) ou compartilhada sem texto (<f t="shared" si="0"/>): f vira ''
    const fm = /<f\b[^>]*?(?:\/>|>([\s\S]*?)<\/f>)/.exec(dentro);
    const f = fm ? fm[1] ?? '' : undefined;
    if ((val === null || val === '') && f === undefined) continue;
    const linha = +num;
    if (!linhas.has(linha)) linhas.set(linha, new Map());
    linhas.get(linha).set(colNum(letras), f !== undefined ? { v: val, f: xdes(f) } : val);
  }
  return linhas;
}

export function mesDaAba(nome, anoPadrao) {
  const n = norm(nome);
  const i = MESES.findIndex((m) => n.includes(norm(m)));
  if (i < 0) return null;
  const ano = /(\d{4})/.exec(nome)?.[1] || anoPadrao;
  return `${ano}-${String(i + 1).padStart(2, '0')}`;
}

// Lê o .xlsx e devolve os meses encontrados (ainda sem gravar nada).
export async function lerPlanilha(buf, { anoPadrao = new Date().getFullYear() } = {}) {
  const zip = await lerZip(buf);
  const wb = await zip.texto('xl/workbook.xml');
  if (!wb) throw new Error('Este arquivo não parece ser uma planilha do Excel.');
  const rels = (await zip.texto('xl/_rels/workbook.xml.rels')) || '';
  const alvo = new Map([...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [attr(m[1], 'Id'), attr(m[1], 'Target')]));
  const ss = (await zip.texto('xl/sharedStrings.xml')) || '';
  const compartilhadas = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const meses = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const nomeAba = attr(m[1], 'name');
    const rid = attr(m[1], 'r:id');
    let caminho = alvo.get(rid) || '';
    caminho = caminho.startsWith('/') ? caminho.slice(1) : `xl/${caminho.replace(/^\.\//, '')}`;
    const xml = await zip.texto(caminho);
    if (!xml) continue;
    const mes = lerMes(lerAba(xml, compartilhadas));
    if (!mes) continue;
    meses.push({ ...mes, aba: nomeAba, id: mesDaAba(nomeAba, anoPadrao) });
  }
  if (!meses.length) throw new Error('Não encontrei nenhuma aba no formato da lista (cabeçalho "Produto", "Qdt.", mercados…).');
  return meses;
}

// Célula com fórmula vira { v (valor calculado), f (fórmula) }
const valor = (c) => (c && typeof c === 'object' ? c.v : c);
const texto = (c) => (c === undefined || c === null || typeof c === 'object' ? '' : String(c).trim());

function lerMes(brutas) {
  // Para nomes e textos só vale o que foi digitado; números calculados (ex.: =36,98/3) valem
  const linhas = new Map([...brutas].map(([n, l]) => [n, new Map([...l].map(([c, v]) => [c, v]))]));
  const nums = [...linhas.keys()].sort((a, b) => a - b);
  const h = nums.find((n) => norm(texto(linhas.get(n).get(1))) === 'produto');
  if (!h) return null;
  const cab = linhas.get(h), sub = linhas.get(h + 1) || new Map();
  const ignorar = new Set(['menor preco', 'marca/tamanho', 'total no menor preco', 'mercado mais barato']);
  let colQtd = 2, colObs = null;
  const mercados = [];
  for (const [col, cel] of [...cab].sort((a, b) => a[0] - b[0])) {
    const val = texto(cel);
    const n = norm(val);
    if (!n) continue;
    if (col === 1 || ignorar.has(n)) continue;
    if (/^(qdt|qtd|quant)/.test(n)) { colQtd = col; continue; }
    if (n.startsWith('observ')) { colObs = col; continue; }
    let colPreco = col, colMarca = col + 2;
    for (let c = col; c < col + 3; c++) {
      const s = norm(texto(sub.get(c)));
      if (s.startsWith('preco')) colPreco = c;
      if (s.startsWith('marca')) colMarca = c;
    }
    mercados.push({ nome: String(val).trim(), colPreco, colMarca });
  }
  const itens = [], categorias = [];
  let cat = null, fim = false, orcamento = null;
  for (const n of nums) {
    if (n <= h + 1) continue;
    const l = linhas.get(n);
    const t = texto(l.get(1));
    if (!t) continue;
    if (/^[▸►▶]/.test(t)) { cat = t.replace(/^[▸►▶]\s*/, '').trim(); categorias.push(cat); continue; }
    if (/^valor para gastar/.test(norm(t))) {
      const n = [...l.values()].map(valor).find((v) => typeof v === 'number' && v > 0);
      if (n) orcamento = n;
      continue;
    }
    if (/^(total geral|subtotal|sobra)/.test(norm(t))) { fim = true; continue; }
    if (fim) continue;
    const qtd = lerNumero(valor(l.get(colQtd)));
    const precos = {};
    for (const m of mercados) {
      const preco = lerNumero(valor(l.get(m.colPreco)));
      const cel = l.get(m.colMarca);
      let marca = texto(cel), auto = false;
      // Marca copiada por fórmula (ex.: =$E14): vira cópia automática, como no app
      const ref = typeof cel === 'object' ? /^\$?([A-Z]+)\$?(\d+)$/.exec(cel.f.trim()) : null;
      if (ref && +ref[2] === n) { marca = texto(l.get(colNum(ref[1]))); auto = !!marca; }
      // fórmula compartilhada (sem texto): vale o valor calculado, se for um texto de verdade
      else if (typeof cel === 'object' && cel.f === '' && typeof cel.v === 'string' && cel.v.trim()) { marca = cel.v.trim(); auto = true; }
      if (preco !== null || marca) precos[m.nome] = { preco, marca, auto };
    }
    itens.push({ cat: cat || 'Sem categoria', nome: t, qtd: qtd || null, obs: colObs ? texto(l.get(colObs)) : '', precos });
  }
  return { mercados: mercados.map((m) => m.nome), categorias, itens, orcamento };
}

// Grava os meses lidos. Mês que já existe é substituído pelo da planilha.
export function aplicarImportacao(loja, meses) {
  const resumo = { meses: 0, produtos: 0, precos: 0, mercadosNovos: [], categoriasNovas: [] };
  loja.lote(() => {
    const mercPorNome = new Map(loja.mercados({ todos: true }).map((m) => [norm(m.nome), m.id]));
    const catPorNome = new Map(loja.categorias().map((c) => [norm(c.nome), c.id]));
    // Mesmo produto em meses diferentes recebe o mesmo id (é assim que o histórico liga os meses)
    const linhagem = new Map();
    const chaveL = (catId, nome, i) => `${catId}|${norm(nome)}|${i}`;
    for (const mes of loja.meses()) {
      const cont = new Map();
      for (const p of loja.ordenar(loja.produtos(mes), mes)) {
        const base = `${p.cat}|${norm(p.nome)}`;
        const i = cont.get(base) || 0; cont.set(base, i + 1);
        if (!linhagem.has(chaveL(p.cat, p.nome, i))) linhagem.set(chaveL(p.cat, p.nome, i), p.id);
      }
    }
    const vistos = new Set();
    for (const mes of meses) {
      if (!mes.id) continue;
      const extra = vistos.has(mes.id);
      vistos.add(mes.id);
      for (const nome of mes.mercados) {
        if (!mercPorNome.has(norm(nome))) { mercPorNome.set(norm(nome), loja.addMercado(nome)); resumo.mercadosNovos.push(nome); }
      }
      for (const nome of mes.categorias || []) {
        if (!catPorNome.has(norm(nome))) { catPorNome.set(norm(nome), loja.addCategoria(nome)); resumo.categoriasNovas.push(nome); }
      }
      // Outra aba do mesmo mês: vira uma lista extra (quantidades dela; preços só onde o mês ainda não tem)
      const nomeLista = mes.aba.replace(new RegExp(`\\s*-\\s*${MESES[Number(mes.id.slice(5)) - 1]}.*$`, 'i'), '').trim() || mes.aba;
      const lista = extra ? loja.criarLista(mes.id, { nome: nomeLista, orcamento: mes.orcamento || null }) : mes.id;
      if (!extra) {
        const orcamento = mes.orcamento || loja.valorMes(mes.id);
        if (loja.get(`mes:${mes.id}`)) loja.excluirMes(mes.id);
        loja.set(`mes:${mes.id}`, { criado: Date.now(), ...(orcamento ? { orcamento } : {}) });
        resumo.meses++;
      }
      const cont = new Map();
      for (const it of mes.itens) {
        if (!catPorNome.has(norm(it.cat))) { catPorNome.set(norm(it.cat), loja.addCategoria(it.cat)); resumo.categoriasNovas.push(it.cat); }
        const cid = catPorNome.get(norm(it.cat));
        const base = `${cid}|${norm(it.nome)}`;
        const i = cont.get(base) || 0; cont.set(base, i + 1);
        let pid = linhagem.get(chaveL(cid, it.nome, i));
        if (!pid) { pid = novoId(); linhagem.set(chaveL(cid, it.nome, i), pid); }
        if (extra) {
          if (!loja.produto(mes.id, pid)) loja.set(`p:${mes.id}:${pid}`, { nome: it.nome, cat: cid, qtd: null, obs: it.obs || '' });
          loja.setQtd(lista, pid, it.qtd);
        } else {
          loja.set(`p:${mes.id}:${pid}`, { nome: it.nome, cat: cid, qtd: it.qtd, obs: it.obs || '' });
          resumo.produtos++;
        }
        for (const [nomeM, r] of Object.entries(it.precos)) {
          const k = `r:${mes.id}:${pid}:${mercPorNome.get(norm(nomeM))}`;
          if (extra && loja.get(k)) continue;
          loja.set(k, { preco: r.preco, marca: r.marca || '', auto: !!r.auto, obs: '' });
          if (r.preco !== null) resumo.precos++;
        }
      }
    }
  });
  return resumo;
}

// ======================= EXPORTAR =======================
const COR = {
  fundo: '1E1E1E', verde: '4FD1A5', cinza: '9AA0A6', claro: 'E8F5EE', texto: 'E8EAED', cabVerde: '123C31',
  cabRoxo: '4A2F63', cabAzul: '1E4D63', cat: '2D5B8A', qtdF: '3B2A4A', qtdT: 'D8B4FE', inF: '3A2F0D', inT: 'FFD666',
  resF: '1A3A4A', resT: '7DD3FC', obsF: '2A2A38', obsT: 'C9C9D6', totF: '26332E', totT: 'F1F3F4', borda: '333333',
};
const FONTES = [
  [10, COR.texto], [14, COR.verde, 1], [10, COR.cinza], [10, COR.claro, 1], [10, COR.verde, 1], [11, 'FFFFFF', 1],
  [10, COR.qtdT], [10, COR.inT], [10, COR.resT, 1], [10, COR.resT], [9, COR.obsT], [10, COR.totT, 1], [12, COR.verde, 1], [9, COR.cinza],
];
const FUNDOS = [COR.fundo, COR.cabVerde, COR.cabRoxo, COR.cabAzul, COR.cat, COR.qtdF, COR.inF, COR.resF, COR.obsF, COR.totF];
const FMT_RS = 164;
// [fonte, fundo(índice em FUNDOS), formato, alinhamento, borda]
const ESTILOS = {
  base: [0, 0, 0, '', 0], titulo: [1, 0, 0, '', 0], sub: [2, 0, 0, '', 0],
  cab: [3, 1, 0, 'center', 1], cabQtd: [3, 2, 0, 'center', 1], cabMerc: [4, 1, 0, 'center', 1], cabRes: [3, 3, 0, 'center', 1],
  cat: [5, 4, 0, 'left', 1], nome: [0, 0, 0, '', 1], qtd: [6, 5, 0, 'center', 1], preco: [7, 6, FMT_RS, '', 1], marca: [7, 6, 0, '', 1],
  total: [0, 0, FMT_RS, '', 1], resRS: [8, 7, FMT_RS, '', 1], resTxt: [9, 7, 0, '', 1], obs: [10, 8, 0, 'left', 1],
  totLbl: [11, 9, 0, '', 0], totVal: [12, 9, FMT_RS, '', 0], subLbl: [13, 0, 0, '', 0], subVal: [13, 0, FMT_RS, '', 0],
};
const ID_ESTILO = Object.fromEntries(Object.keys(ESTILOS).map((k, i) => [k, i]));

function stylesXml() {
  const fonts = FONTES.map(([sz, cor, b]) => `<font>${b ? '<b/>' : ''}<sz val="${sz}"/><color rgb="FF${cor}"/><name val="Arial"/><family val="2"/></font>`).join('');
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    ...FUNDOS.map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)].join('');
  const lado = (l) => `<${l} style="thin"><color rgb="FF${COR.borda}"/></${l}>`;
  const borders = `<border><left/><right/><top/><bottom/><diagonal/></border><border>${['left', 'right', 'top', 'bottom'].map(lado).join('')}<diagonal/></border>`;
  const xfs = Object.values(ESTILOS).map(([f, fu, fmt, al, b]) =>
    `<xf numFmtId="${fmt}" fontId="${f}" fillId="${fu + 2}" borderId="${b}" xfId="0" applyFont="1" applyFill="1"${fmt ? ' applyNumberFormat="1"' : ''}${b ? ' applyBorder="1"' : ''}${al ? ` applyAlignment="1"><alignment horizontal="${al}" vertical="center" wrapText="${al === 'center' ? 1 : 0}"/></xf>` : '/>'}`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="${FMT_RS}" formatCode="${xesc('"R$"#,##0.00;"-R$"#,##0.00;;')}"/></numFmts>
<fonts count="${FONTES.length}">${fonts}</fonts>
<fills count="${FUNDOS.length + 2}">${fills}</fills>
<borders count="2">${borders}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${Object.keys(ESTILOS).length}">${xfs}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="1"><dxf><font><b/><color rgb="FF86EFAC"/></font><fill><patternFill><bgColor rgb="FF14532D"/></patternFill></fill></dxf></dxfs>
</styleSheet>`;
}

function abaXml(loja, mes) {
  const mercs = loja.mercados();
  const cats = loja.categorias();
  const nM = mercs.length;
  const cP = (i) => 3 + i * 3; // coluna do preço do mercado i
  const cMenor = 3 + nM * 3, cMarcaM = cMenor + 1, cTotM = cMenor + 2, cMerc = cMenor + 3, cObs = cMenor + 4;
  const L = colLetra;
  const ultima = cObs;
  const linhas = [];
  const merges = [];
  const cel = (c, r, estilo, conteudo) => `<c r="${L(c)}${r}" s="${ID_ESTILO[estilo]}"${conteudo || ''}`;
  const txt = (c, r, estilo, t) => (t === '' || t === null || t === undefined ? `${cel(c, r, estilo)}/>` : `${cel(c, r, estilo, ' t="inlineStr"')}><is><t xml:space="preserve">${xesc(t)}</t></is></c>`);
  const num = (c, r, estilo, n) => (n === null || n === undefined ? `${cel(c, r, estilo)}/>` : `${cel(c, r, estilo)}><v>${+n.toFixed(4)}</v></c>`);
  const form = (c, r, estilo, f, v) => {
    if (typeof v === 'number') return `${cel(c, r, estilo)}><f>${xesc(f)}</f><v>${+v.toFixed(4)}</v></c>`;
    return `${cel(c, r, estilo, ' t="str"')}><f>${xesc(f)}</f><v>${xesc(v ?? '')}</v></c>`;
  };
  const linha = (r, cels, alt) => linhas.push(`<row r="${r}"${alt ? ` ht="${alt}" customHeight="1"` : ''}>${cels.join('')}</row>`);
  const vazias = (r, de, ate, estilo) => { const a = []; for (let c = de; c <= ate; c++) a.push(`${cel(c, r, estilo)}/>`); return a; };

  linha(1, [txt(1, 1, 'titulo', 'Lista de Compras — Pesquisa de Preços'), ...vazias(1, 2, ultima, 'base')], 18);
  linha(2, [txt(1, 2, 'sub', 'Preencha Preço, Marca/Tamanho e Observação. Deixe em branco o que não pesquisou. Total e comparação calculam sozinhos.'), ...vazias(2, 2, ultima, 'base')]);
  linha(3, vazias(3, 1, ultima, 'base'));
  const c4 = [txt(1, 4, 'cab', 'Produto'), txt(2, 4, 'cabQtd', 'Qdt.')];
  const c5 = [txt(1, 5, 'cab', ''), txt(2, 5, 'cabQtd', '')];
  merges.push('A4:A5', 'B4:B5');
  mercs.forEach((m, i) => {
    c4.push(txt(cP(i), 4, 'cabMerc', m.nome), txt(cP(i) + 1, 4, 'cabMerc', ''), txt(cP(i) + 2, 4, 'cabMerc', ''));
    c5.push(txt(cP(i), 5, 'cab', 'Preço'), txt(cP(i) + 1, 5, 'cab', 'Total'), txt(cP(i) + 2, 5, 'cab', 'Marca/Tamanho'));
    merges.push(`${L(cP(i))}4:${L(cP(i) + 2)}4`);
  });
  [['Menor Preço', cMenor], ['Marca/Tamanho', cMarcaM], ['Total no Menor Preço', cTotM], ['Mercado Mais Barato', cMerc]].forEach(([t, c]) => {
    c4.push(txt(c, 4, 'cabRes', t)); c5.push(txt(c, 5, 'cabRes', '')); merges.push(`${L(c)}4:${L(c)}5`);
  });
  c4.push(txt(cObs, 4, 'cab', 'Observação')); c5.push(txt(cObs, 5, 'cab', '')); merges.push(`${L(cObs)}4:${L(cObs)}5`);
  linha(4, c4, 19.5); linha(5, c5, 30);

  let r = 6;
  const primeira = 6;
  const produtos = loja.produtos(mes);
  const semCat = produtos.filter((p) => !cats.some((c) => c.id === p.cat));
  const grupos = cats.map((c) => [c.nome, produtos.filter((p) => p.cat === c.id)]);
  if (semCat.length) grupos.push(['Sem categoria', semCat]);
  const linhasProduto = [];
  for (const [nomeCat, lista] of grupos) {
    linha(r, [txt(1, r, 'cat', `▸ ${nomeCat}`), ...vazias(r, 2, ultima, 'cat')], 19.5);
    merges.push(`A${r}:${L(ultima)}${r}`);
    r++;
    for (const p of loja.ordenar(lista, mes)) {
      const c = loja.calcProduto(mes, p.id, mercs);
      const cels = [txt(1, r, 'nome', p.nome), num(2, r, 'qtd', c.qtd)];
      const obs = [p.obs, ...c.linhas.filter((l) => l.obs).map((l) => `${l.nome}: ${l.obs}`)].filter(Boolean).join(' | ');
      const refsP = mercs.map((_, i) => `${L(cP(i))}${r}`);
      c.linhas.forEach((l, i) => {
        const P = refsP[i];
        cels.push(num(cP(i), r, 'preco', l.preco),
          form(cP(i) + 1, r, 'total', `IF(OR($B${r}="",${P}=""),"",$B${r}*${P})`, l.total ?? ''),
          txt(cP(i) + 2, r, 'marca', l.marca));
      });
      const R = `$${L(cMenor)}${r}`;
      const aninhado = (vals) => vals.reduceRight((acc, [ref, v]) => `IF(${R}=${ref},${v},${acc})`, '""');
      cels.push(
        form(cMenor, r, 'resRS', nM ? `IF(COUNT(${refsP.join(',')})=0,"",MIN(${refsP.join(',')}))` : '""', c.menor ?? ''),
        form(cMarcaM, r, 'resTxt', `IF(${R}="","",${aninhado(mercs.map((_, i) => [refsP[i], `${L(cP(i) + 2)}${r}`]))})`, c.marcaMenor),
        form(cTotM, r, 'resRS', `IF(OR($B${r}="",${R}=""),"",$B${r}*${R})`, c.totalMenor ?? ''),
        form(cMerc, r, 'resTxt', `IF(${R}="","",${aninhado(mercs.map((m, i) => [refsP[i], `"${m.nome.replace(/"/g, '""')}"`]))})`, c.menor !== null ? c.nomeMercMenor : ''),
        txt(cObs, r, 'obs', obs),
      );
      linha(r, cels);
      linhasProduto.push(r);
      r++;
    }
  }
  const ult = r - 1;
  const calc = loja.calcMes(mes);
  r++;
  linha(r, [txt(1, r, 'totLbl', 'TOTAL GERAL (comprando cada item onde é mais barato)'), ...vazias(r, 2, cTotM - 1, 'totLbl'),
    form(cTotM, r, 'totVal', `SUM(${L(cTotM)}${primeira}:${L(cTotM)}${ult})`, calc.totalGeral)]);
  r++;
  const subt = [txt(1, r, 'subLbl', 'Subtotal por mercado (se comprasse tudo lá)')];
  mercs.forEach((m, i) => subt.push(form(cP(i) + 1, r, 'subVal', `SUM(${L(cP(i) + 1)}${primeira}:${L(cP(i) + 1)}${ult})`, calc.sub.get(m.id).total)));
  linha(r, subt);
  // Aba de lista extra leva o limite dela; a nº 1 leva o valor do mês (a sobra só faz sentido se o mês tem uma lista)
  const principal = mesDe(mes) === mes;
  const valorMes = loja.valorLista(mes) || (principal ? loja.valorMes(mes) : null);
  if (valorMes) {
    const rTot = r - 1;
    r += 2;
    linha(r, [txt(1, r, 'totLbl', principal && !loja.valorLista(mes) ? 'Valor para gastar no mês (cartão)' : 'Valor para gastar nesta lista'), ...vazias(r, 2, cTotM - 1, 'totLbl'), num(cTotM, r, 'totVal', valorMes)]);
    if (loja.valorLista(mes) || loja.listas(mes).length === 1) {
      r++;
      linha(r, [txt(1, r, 'subLbl', 'Sobra (+) ou passou (−)'), form(cTotM, r, 'totVal', `${L(cTotM)}${r - 1}-${L(cTotM)}${rTot}`, valorMes - calc.totalGeral)]);
    }
  }

  const larguras = [28, 7, ...mercs.flatMap(() => [10, 13, 20]), 10, 20, 12, 16, 24];
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const cond = linhasProduto.length ? mercs.map((_, i) => {
    const P = L(cP(i));
    return `<conditionalFormatting sqref="${P}${primeira}:${P}${ult}"><cfRule type="expression" dxfId="0" priority="${i + 1}"><formula>${xesc(`AND(${P}${primeira}<>"",${P}${primeira}=$${L(cMenor)}${primeira})`)}</formula></cfRule></conditionalFormatting>`;
  }).join('') : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${L(ultima)}${r}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="2" ySplit="5" topLeftCell="C6" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="C6" sqref="C6"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${linhas.join('')}</sheetData>
<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>
${cond}
<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
</worksheet>`;
}

// Nome da aba: o mês ("Outubro", ou "Outubro 2026" com mais de um ano). Lista extra: o nome dela,
// com o mês junto quando o nome não tem (a importação usa o mês para saber onde a lista entra).
export function nomeAbas(meses, loja = null) {
  const anos = new Set(meses.map((m) => m.slice(0, 4)));
  const usados = new Set();
  return meses.map((m) => {
    const mes = nomeMes(m).split(' ')[0];
    let n = anos.size > 1 ? nomeMes(m) : mes;
    if (loja && mesDe(m) !== m) {
      const nome = loja.nomeLista(m);
      n = norm(nome).includes(norm(mes)) ? nome : `${nome} - ${mes}`;
      if (anos.size > 1) n += ` ${m.slice(0, 4)}`;
    } else if (loja && loja.listas(m).length > 1 && loja.get(`l:${m}`)?.nome) n = `${loja.nomeLista(m)} - ${n}`;
    n = n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
    for (let i = 2, base = n; usados.has(norm(n)); i++) n = `${base.slice(0, 28)} ${i}`;
    usados.add(norm(n));
    return n;
  });
}

// Uma aba por lista: a nº 1 de cada mês e, logo depois, as listas extras dela
export async function exportarPlanilha(loja, meses = loja.meses()) {
  meses = meses.flatMap((m) => loja.listas(m));
  const abas = nomeAbas(meses, loja);
  const arquivos = [
    { nome: '[Content_Types].xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${meses.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { nome: '_rels/.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nome: 'xl/workbook.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${Math.max(0, meses.length - 1)}"/></bookViews><sheets>${abas.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { nome: 'xl/_rels/workbook.xml.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${meses.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${meses.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nome: 'xl/styles.xml', texto: stylesXml() },
    ...meses.map((m, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto: abaXml(loja, m) })),
  ];
  return criarZip(arquivos);
}
