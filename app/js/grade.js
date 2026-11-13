// Vista de planilha (computador): os mercados lado a lado, como no Excel. Mesmos dados e filtros da aba Preços.
// Enter desce para a mesma coluna do próximo produto; Tab anda para a direita.

import { app } from './ctx.js';
import { h, fmtRS, fmtN, fmtQ, lerExpr, campoMoeda, toast } from './ui.js';
import { lerNumero } from './modelo.js';

export const telaLarga = () => matchMedia('(min-width: 900px)').matches;

// grupos: [{ c: categoria, lista: produtos }]
export function montarGrade(grupos, { aoMudar, editar }) {
  const mercs = app.loja.mercados();
  const cab = h('thead', null,
    h('tr', null, h('th', { rowspan: 2, class: 'g-prod' }, 'Produto'), h('th', { rowspan: 2 }, 'Qtd.'),
      mercs.map((m) => h('th', { colspan: 2, class: 'g-merc' }, m.nome)),
      h('th', { rowspan: 2 }, 'Menor preço'), h('th', { rowspan: 2 }, 'Mais barato'), h('th', { rowspan: 2 }, 'Total')),
    h('tr', null, mercs.map(() => [h('th', { class: 'g-sub' }, 'Preço'), h('th', { class: 'g-sub' }, 'Marca/tam.')])));
  const corpo = h('tbody');
  for (const { c, lista } of grupos) {
    corpo.append(h('tr', { class: 'g-cat' }, h('td', { colspan: 5 + mercs.length * 2 }, `▸ ${c.nome}`)));
    for (const p of lista) corpo.append(linha(p, mercs, aoMudar, editar));
  }
  return h('div', { class: 'grade-env' }, h('table', { class: 'grade' }, cab, corpo));
}

function linha(p, mercs, aoMudar, editar) {
  const { loja, mes } = app;
  const tr = h('tr', { dataset: { pid: p.id } });
  const mudou = () => { pintarLinha(tr); aoMudar(); };
  // Enter: mesma coluna, próximo produto (como no Excel)
  const descer = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const coluna = [...tr.parentElement.querySelectorAll(`input[data-col="${e.target.dataset.col}"]`)];
    coluna[coluna.indexOf(e.target) + 1]?.focus();
  };
  const qtd = h('input', {
    class: 'g-in g-qtd num', inputmode: 'decimal', placeholder: '0', dataset: { col: 'q' }, 'aria-label': `Quantidade de ${p.nome}`,
    onfocus: (e) => e.target.select(), onkeydown: descer,
    oninput: (e) => { const v = lerNumero(e.target.value); if (v === null && e.target.value.trim()) return; loja.setQtd(mes, p.id, v); mudou(); },
    onblur: (e) => { e.target.value = fmtQ(loja.produto(mes, p.id)?.qtd); },
  });
  tr._qtd = qtd;
  tr._cel = new Map();
  const tds = [h('td', { class: 'g-prod' }, h('button', { class: 'g-nome', title: 'Editar produto', onclick: () => editar(p.id) }, p.nome)), h('td', null, qtd)];
  for (const m of mercs) {
    const preco = h('input', {
      class: 'g-in g-preco num', inputmode: 'decimal', dataset: { col: `p:${m.id}` }, 'aria-label': `Preço de ${p.nome} no ${m.nome}`,
      onfocus: (e) => e.target.select(), onkeydown: descer,
      oninput: (e) => { const v = lerExpr(e.target.value); if (v === undefined) return; loja.setPreco(mes, p.id, m.id, v); mudou(); },
      onblur: (e) => {
        if (lerExpr(e.target.value) === undefined) toast(`Não entendi o preço “${e.target.value}”. Ficou o anterior.`);
        e.target.value = fmtN(loja.preco(mes, p.id, m.id)?.preco);
      },
    });
    campoMoeda(preco, () => app.prefs.moeda !== false);
    const marca = h('input', {
      class: 'g-in g-marca', dataset: { col: `m:${m.id}` }, 'aria-label': `Marca e tamanho de ${p.nome} no ${m.nome}`, onkeydown: descer,
      oninput: (e) => { loja.setMarca(mes, p.id, m.id, e.target.value); e.target.classList.remove('auto'); mudou(); },
    });
    const cel = { preco, marca, td: h('td', { class: 'g-p' }, preco) };
    tr._cel.set(m.id, cel);
    tds.push(cel.td, h('td', { class: 'g-m' }, marca));
  }
  tr._menor = h('td', { class: 'num g-menor' });
  tr._onde = h('td', { class: 'g-onde' });
  tr._tot = h('td', { class: 'num g-tot' });
  tr.append(...tds, tr._menor, tr._onde, tr._tot);
  pintarLinha(tr);
  return tr;
}

// Recalcula a linha (sem mexer no campo em que a pessoa está digitando)
export function pintarLinha(tr) {
  const { loja, mes } = app;
  const pid = tr.dataset.pid;
  const p = loja.produto(mes, pid);
  if (!p) { tr.remove(); return; }
  const c = loja.calcProduto(mes, pid);
  const ativo = document.activeElement;
  if (ativo !== tr._qtd) tr._qtd.value = fmtQ(p.qtd);
  tr._qtd.classList.toggle('vazia', !p.qtd);
  for (const l of c.linhas) {
    const cel = tr._cel.get(l.mid);
    if (!cel) continue;
    if (ativo !== cel.preco && lerExpr(cel.preco.value) !== l.preco) cel.preco.value = fmtN(l.preco);
    if (ativo !== cel.marca) { cel.marca.value = l.marca; cel.marca.classList.toggle('auto', l.auto); }
    cel.td.classList.toggle('menor', c.baratos.has(l.mid));
    cel.td.classList.toggle('fora-marca', !l.aceita);
    cel.td.title = l.aceita ? '' : 'Marca que vocês não compram (não entra no menor preço)';
  }
  tr._menor.textContent = c.menor !== null ? fmtN(c.menor) : '';
  tr._onde.textContent = c.menor !== null ? `${c.nomeMercMenor}${c.baratos.size > 1 ? ` (+${c.baratos.size - 1})` : ''}` : '';
  tr._tot.textContent = c.totalMenor !== null ? fmtRS(c.totalMenor) : '';
}
