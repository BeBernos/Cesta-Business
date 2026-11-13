// Histórico: preço de um produto ao longo dos meses, por mercado (gráfico + tabela).

import { app } from './ctx.js';
import { h, fmtRS, fmtN } from './ui.js';
import { norm, nomeMes } from './modelo.js';

const CORES = ['#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#22d3ee', '#f87171', '#e879f9', '#facc15', '#94a3b8'];
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...filhos) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const f of filhos) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
};

let escolhido = null;
let termo = '';

export function abrirHistorico(pid) { escolhido = pid; }

export function telaHistorico(topo, tela) {
  const { loja } = app;
  topo.append(h('div', { class: 'linha-topo' }, h('b', { style: { fontSize: '1.3rem' } }, '📈 Histórico'), h('div', { class: 'espaco' }), app.seloSinc()));
  const meses = loja.meses();
  const mercs = loja.mercados({ todos: true });
  const cor = (mid) => CORES[Math.max(0, mercs.findIndex((m) => m.id === mid)) % CORES.length];

  // ---- escolher produto ----
  const linhagens = loja.linhagens();
  const resultados = h('div', { class: 'opcoes' });
  const busca = h('input', { class: 'entrada', type: 'search', placeholder: 'Buscar produto (ex.: leite)', value: termo,
    oninput: (e) => { termo = e.target.value; pintarResultados(); } });
  function pintarResultados() {
    const t = norm(termo);
    if (!t) { resultados.replaceChildren(); return; }
    const achados = linhagens.filter((l) => norm(l.nome).includes(t)).slice(0, 8);
    resultados.replaceChildren(...achados.map((l) => h('button', { class: `opcao${l.id === escolhido ? ' atual' : ''}`, onclick: () => { escolhido = l.id; termo = ''; app.render(); } },
      h('span', { class: 'ic' }, '📦'), h('span', { class: 'tx' }, l.nome, h('small', null, loja.categorias().find((c) => c.id === l.cat)?.nome || '')))));
    if (!achados.length) resultados.replaceChildren(h('p', { class: 'sub' }, 'Nenhum produto com esse nome.'));
  }
  pintarResultados();
  tela.append(h('div', { class: 'secao' }, h('h3', null, '🔎 Preço de um produto'), h('p', { class: 'sub' }, 'Veja como o preço mudou mês a mês em cada mercado.'), busca, h('div', { style: { height: '8px' } }), resultados));

  if (escolhido && linhagens.some((l) => l.id === escolhido)) {
    const l = linhagens.find((x) => x.id === escolhido);
    const hist = loja.historico(escolhido);
    const sec = h('div', { class: 'secao' }, h('h3', null, l.nome));
    if (!hist.series.length) {
      sec.append(h('p', { class: 'sub' }, 'Ainda não há preços deste produto em nenhum mês.'));
    } else {
      const comDados = hist.meses.map((m, i) => i).filter((i) => hist.series.some((se) => se.pontos[i] !== null));
      const ini = comDados[0], fim = comDados[comDados.length - 1];
      const rot = hist.meses.slice(ini, fim + 1);
      const series = hist.series.map((se) => ({ nome: se.mercado.nome + (se.mercado.arquivado ? ' (arquivado)' : ''), cor: cor(se.mercado.id), pontos: se.pontos.slice(ini, fim + 1) }));
      const menores = hist.menores.slice(ini, fim + 1);
      const valid = menores.map((v, i) => [v, i]).filter(([v]) => v !== null);
      if (valid.length >= 2) {
        const [a] = valid[valid.length - 2], [b] = valid[valid.length - 1];
        const pct = ((b - a) / a) * 100;
        sec.append(h('p', { class: 'sub' }, 'Menor preço: ', h('b', { class: 'num' }, fmtRS(b)), ' · ',
          h('span', { class: pct > 0.5 ? 'var-sobe' : pct < -0.5 ? 'var-desce' : '' }, `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct).toFixed(1).replace('.', ',')}% em relação ao mês anterior`)));
      }
      sec.append(graficoLinhas(rot.map((m) => nomeMes(m, true)), series),
        h('div', { class: 'legenda' }, series.map((se) => h('span', null, h('i', { style: { background: se.cor } }), se.nome))));
      const tabela = h('table', { class: 'tabela num' },
        h('thead', null, h('tr', null, h('th', null, 'Mês'), series.map((se) => h('th', null, se.nome.split(' ')[0])))),
        h('tbody', null, rot.map((m, i) => h('tr', null, h('td', null, nomeMes(m, true)),
          series.map((se) => h('td', { class: se.pontos[i] !== null && menores[i] !== null && Math.abs(se.pontos[i] - menores[i]) < 0.0005 ? 'menor' : '' }, se.pontos[i] === null ? '—' : fmtN(se.pontos[i])))))));
      sec.append(h('div', { class: 'rolavel' }, tabela));
    }
    tela.append(sec);
  }

  // ---- gasto por mês ----
  // total do mês = soma das listas do mês
  const totais = meses.map((m) => loja.listas(m).map((l) => loja.calcMes(l))
    .reduce((t, c) => ({ m, totalGeral: t.totalGeral + c.totalGeral, comQtd: t.comQtd + c.comQtd }), { m, totalGeral: 0, comQtd: 0 }))
    .filter((t) => t.totalGeral > 0);
  const sec2 = h('div', { class: 'secao' }, h('h3', null, '🧾 Total do mês no menor preço'),
    h('p', { class: 'sub' }, 'Quanto daria a compra de cada mês comprando cada item onde estava mais barato.'));
  if (totais.length) {
    sec2.append(graficoBarras(totais.map((t) => nomeMes(t.m, true)), totais.map((t) => t.totalGeral)));
    sec2.append(h('div', { class: 'rolavel' }, h('table', { class: 'tabela num' },
      h('thead', null, h('tr', null, h('th', null, 'Mês'), h('th', null, 'Itens'), h('th', null, 'Total'), h('th', null, 'Valor do mês'))),
      h('tbody', null, totais.map((t) => {
        const v = loja.valorMes(t.m);
        return h('tr', null, h('td', null, nomeMes(t.m)), h('td', null, String(t.comQtd)),
          h('td', { class: v && t.totalGeral > v ? 'var-sobe' : '' }, fmtRS(t.totalGeral)), h('td', null, v ? fmtRS(v) : '—'));
      })))));
  } else sec2.append(h('p', { class: 'sub' }, 'Ainda não há meses com preços e quantidades.'));
  tela.append(sec2);
}

function escala(min, max) {
  if (min === max) { min = min * 0.9; max = max * 1.1 || 1; }
  const pad = (max - min) * 0.12;
  return [Math.max(0, min - pad), max + pad];
}

function graficoLinhas(rotulos, series) {
  const W = 360, H = 220, L = 46, R = 24, T = 12, B = 26;
  const vals = series.flatMap((se) => se.pontos.filter((v) => v !== null));
  const [y0, y1] = escala(Math.min(...vals), Math.max(...vals));
  const n = rotulos.length;
  const x = (i) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico', role: 'img', 'aria-label': 'Gráfico do preço por mês' });
  for (let k = 0; k <= 4; k++) {
    const v = y0 + ((y1 - y0) * k) / 4;
    svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grade' }), s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmtN(v)));
  }
  rotulos.forEach((r, i) => svg.append(s('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }, r)));
  for (const se of series) {
    let d = '';
    se.pontos.forEach((v, i) => { if (v === null) return; d += `${d && se.pontos[i - 1] !== null && i > 0 ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
    svg.append(s('path', { d, fill: 'none', stroke: se.cor, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    se.pontos.forEach((v, i) => { if (v !== null) svg.append(s('circle', { cx: x(i), cy: y(v), r: 4, fill: se.cor }, s('title', {}, `${se.nome} · ${rotulos[i]}: ${fmtRS(v)}`))); });
  }
  return svg;
}

function graficoBarras(rotulos, valores) {
  const W = 360, H = 200, L = 52, R = 10, T = 18, B = 26;
  const max = Math.max(...valores) * 1.12;
  const n = valores.length;
  const passo = (W - L - R) / n;
  const bw = Math.min(42, passo * 0.62);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafico', role: 'img', 'aria-label': 'Total por mês' });
  for (let k = 0; k <= 3; k++) {
    const v = (max * k) / 3;
    svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grade' }), s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, Math.round(v)));
  }
  valores.forEach((v, i) => {
    const cx = L + passo * i + passo / 2;
    svg.append(s('rect', { x: cx - bw / 2, y: y(v), width: bw, height: y(0) - y(v), rx: 6, fill: 'var(--petroleo)' }, s('title', {}, `${rotulos[i]}: ${fmtRS(v)}`)),
      s('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, rotulos[i]),
      s('text', { x: cx, y: y(v) - 5, 'text-anchor': 'middle', style: 'fill: var(--texto); font-weight: 700; font-size: 10px' }, Math.round(v)));
  });
  return svg;
}
