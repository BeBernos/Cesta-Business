// Valor para gastar no mês (o limite do cartão, VR ou débito): definir e mostrar se a lista cabe.

import { app } from './ctx.js';
import { h, fmtRS, fmtN, folha, toast, fecharTodas } from './ui.js';
import { lerExpr, nomeMes, mesDe } from './modelo.js';

export const ROTULO = { ok: 'Dentro do valor', quase: 'Quase no limite', passou: 'Passou do valor' };

// Barra de progresso colorida (verde / âmbar / vermelho)
export function barra(o) {
  const pct = o.valor ? Math.min(100, (o.planejado / o.valor) * 100) : 0;
  return h('div', { class: `orc-barra ${o.estado}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(o.valor || 0), 'aria-valuenow': String(o.planejado), 'aria-label': 'Quanto da lista já usa do valor do mês' },
    h('i', { style: { width: `${pct}%` } }));
}

// Frase curta: "Sobram R$ 34,39" / "Passou R$ 120,00"
export function frase(o) {
  if (o.estado === 'sem') return 'Definir valor do mês';
  if (o.estado === 'passou') return `Passou ${fmtRS(-o.sobra)}`;
  return `Sobram ${fmtRS(o.sobra)}`;
}

// Cartão completo (folha de totais e modo compra)
export function cartao(o, { compra = false } = {}) {
  if (o.estado === 'sem') {
    return h('button', { class: 'orc-cartao sem', onclick: () => abrirValor() },
      h('span', { class: 'ic' }, '💳'),
      h('span', { class: 'tx' }, h('b', null, 'Quanto vocês têm para gastar este mês?'),
        h('small', null, 'Defina o valor do cartão/VR e o app avisa se a lista cabe.')));
  }
  const pctTxt = `${Math.round((o.planejado / o.valor) * 100)}%`;
  return h('div', { class: `orc-cartao ${o.estado}` },
    h('div', { class: 'orc-topo' },
      h('span', { class: 'orc-selo' }, o.estado === 'passou' ? '⚠️ ' : o.estado === 'quase' ? '⚡ ' : '✅ ', ROTULO[o.estado]),
      h('button', { class: 'btn pequeno fantasma', onclick: () => (o.lista ? abrirValor(o.lista, { lista: true }) : abrirValor()) }, '✎ Valor')),
    h('div', { class: 'orc-numeros' },
      h('div', null, h('small', null, o.lista ? 'Limite da lista' : 'Valor do mês'), h('b', { class: 'num' }, fmtRS(o.valor))),
      h('div', null, h('small', null, o.porLista ? 'Todas as listas' : 'Lista de compras'), h('b', { class: 'num' }, fmtRS(o.planejado))),
      h('div', { class: 'destaque' }, h('small', null, o.estado === 'passou' ? 'Passou' : 'Sobram'), h('b', { class: 'num' }, fmtRS(Math.abs(o.sobra))))),
    barra(o),
    o.porLista ? h('div', { class: 'orc-rodape num' }, o.porLista.map((x) => `${x.nome}: ${fmtRS(x.total)}`).join(' + ')) : null,
    h('div', { class: 'orc-rodape num' }, `${pctTxt} do valor`, compra ? ` · no carrinho ${fmtRS(o.noCarrinho)}` : ''),
    o.pagos ? h('p', { class: 'orc-nota', style: { color: o.difCaixa > 0 ? 'var(--perigo)' : 'var(--verde)' } },
      `🏷️ ${o.pagos} ${o.pagos === 1 ? 'item' : 'itens'} com preço real (gôndola ou nota): ${o.difCaixa === 0 ? 'igual ao orçado' : `${o.difCaixa > 0 ? '+' : '−'}${fmtRS(Math.abs(o.difCaixa))} em relação ao orçado`}.`) : null,
    o.foraLista ? h('p', { class: 'orc-nota' }, `🧾 Inclui ${fmtRS(o.foraLista)} de itens da nota fiscal que estavam fora da lista.`) : null,
    o.semPreco ? h('p', { class: 'orc-nota' }, `${o.semPreco} ${o.semPreco === 1 ? 'item sem preço não entra' : 'itens sem preço não entram'} na conta — o total real pode ser maior.`) : null,
    o.estado === 'passou' && !compra ? h('div', { class: 'orc-cortar' },
      h('p', null, `Para caber, tire ou diminua itens que somem ${fmtRS(-o.sobra)}. Os que mais pesam:`),
      h('div', { class: 'lista-ed' }, o.maiores.map((i) => h('div', { class: 'item-ed' },
        h('div', { class: 'tx' }, i.p.nome, h('small', null, `${fmtN(i.p.qtd)}× ${fmtRS(i.preco)} · ${app.loja.mercados().find((m) => m.id === i.mid)?.nome || ''}`)),
        h('b', { class: 'num', style: { paddingRight: '10px' } }, fmtRS(i.total)))))) : null);
}

// Limite próprio da lista (se tiver) e o valor do mês, que soma todas as listas
export function cartoes(lista, opc = {}) {
  const { loja } = app;
  const mes = loja.orcamentoMes(mesDe(lista));
  if (!loja.valorLista(lista)) return cartao(mes, opc);
  return h('div', null, cartao(loja.orcamentoLista(lista), opc), mes.estado !== 'sem' ? cartao(mes, opc) : null);
}

// lista: true → limite só desta lista (opcional); senão, o valor do mês
export function abrirValor(id = app.mes, { lista = false } = {}) {
  const { loja } = app;
  const mes = mesDe(id);
  if (lista) return abrirLimiteLista(id);
  return new Promise((ok) => {
    const atual = loja.valorMes(mes);
    const seguintes = loja.meses().filter((m) => m > mes);
    const inp = h('input', { class: 'entrada num', inputmode: 'decimal', value: atual ? fmtN(atual) : '', placeholder: 'Ex.: 900,00', autofocus: true, enterkeyhint: 'done', style: { fontSize: '1.3rem', fontWeight: 700 } });
    const chk = h('input', { type: 'checkbox', checked: true });
    const erro = h('div', { class: 'aviso erro', hidden: true });
    const salvar = () => {
      const v = lerExpr(inp.value);
      if (!v) { erro.textContent = 'Digite um valor, por exemplo 900 ou 900,00.'; erro.hidden = false; inp.focus(); return; }
      loja.setValorMes(mes, v, { proximos: seguintes.length > 0 && chk.checked });
      fecharTodas();
      app.render();
      const o = loja.orcamento(mes);
      toast(o.estado === 'passou' ? `⚠️ A lista passou ${fmtRS(-o.sobra)} do valor de ${fmtRS(v)}.` : `✅ Valor de ${fmtRS(v)} definido. Sobram ${fmtRS(o.sobra)}.`);
      ok(v);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
    const f = folha([
      h('h2', null, `💳 Valor para gastar · ${nomeMes(mes)}`),
      h('p', { class: 'sub' }, 'O quanto tem no cartão (crédito, débito, vale-alimentação…) para a compra do mês. A lista é comparada com esse valor.'),
      h('div', { class: 'form' },
        h('label', null, 'Valor (R$)', inp),
        seguintes.length ? h('label', { class: 'check' }, chk, `Usar também em ${seguintes.map((m) => nomeMes(m)).join(', ')}`) : null,
        h('p', { class: 'sub', style: { margin: 0 } }, 'Os meses novos já começam com o mesmo valor.'),
        erro),
      h('div', { class: 'acoes lado' },
        atual ? h('button', { class: 'btn fantasma', onclick: () => { loja.setValorMes(mes, null); fecharTodas(); app.render(); toast('Valor do mês removido.'); ok(null); } }, 'Remover') :
          h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'),
        h('button', { class: 'btn prim', onclick: salvar }, 'Salvar')),
    ], { aoFechar: () => ok(undefined) });
  });
}

function abrirLimiteLista(id) {
  const { loja } = app;
  return new Promise((ok) => {
    const atual = loja.valorLista(id);
    const inp = h('input', { class: 'entrada num', inputmode: 'decimal', value: atual ? fmtN(atual) : '', placeholder: 'Ex.: 150,00', autofocus: true, style: { fontSize: '1.3rem', fontWeight: 700 } });
    folha([
      h('h2', null, `🎯 Limite · ${loja.nomeLista(id)}`),
      h('p', { class: 'sub' }, 'Opcional: um teto só para esta lista. O valor do mês continua somando todas as listas.'),
      h('div', { class: 'form' }, h('label', null, 'Limite (R$)', inp)),
      h('div', { class: 'acoes lado' },
        h('button', { class: 'btn fantasma', onclick: () => { loja.setValorLista(id, null); fecharTodas(); app.render(); ok(null); } }, atual ? 'Remover' : 'Sem limite'),
        h('button', { class: 'btn prim', onclick: () => { const v = lerExpr(inp.value); if (!v) { inp.focus(); return; } loja.setValorLista(id, v); fecharTodas(); app.render(); toast(`Limite de ${fmtRS(v)} para ${loja.nomeLista(id)}.`); ok(v); } }, 'Salvar')),
    ], { aoFechar: () => ok(undefined) });
  });
}
