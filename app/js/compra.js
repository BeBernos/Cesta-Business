// Modo compra: a lista separada por mercado (onde cada item sai mais barato), com caixinhas para marcar.

import { app } from './ctx.js';
import { h, fmtRS, fmtN, fmtQ, folha, confirmar, toast, vibrar, campoMoeda, icone, precoEtq } from './ui.js';
import { botaoMes } from './lista.js';
import { lerNumero, lerExpr, norm } from './modelo.js';
import { cartoes as cartoesOrcamento } from './orcamento.js';
import { blocoNotas } from './notas.js';

let telaLigada = null;
let buscaCompra = '';
let abrirOpcoes = false;
const recolhidos = new Set();

async function manterTela(ligar) {
  try {
    if (ligar) { telaLigada = await navigator.wakeLock.request('screen'); }
    else { await telaLigada?.release(); telaLigada = null; }
  } catch { telaLigada = null; }
}
export function soltarTela() { if (telaLigada) manterTela(false); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.prefs.telaLigada && app.aba === 'compra') manterTela(true);
});

export function telaCompra(topo, tela) {
  const { loja, mes } = app;
  topo.append(h('div', { class: 'linha-topo' }, botaoMes(), h('div', { class: 'espaco' }), app.seloSinc()));
  if (app.prefs.telaLigada && 'wakeLock' in navigator) manterTela(true);
  const lc = loja.listaCompra(mes);
  const esconder = !!app.prefs.esconderFeitos;

  const pct = lc.itens ? Math.round((lc.feitos / lc.itens) * 100) : 0;
  const o = loja.orcamento(mes);
  const resumo = h('section', { class: 'resumo-compra' },
    h('div', { class: 'rot trilho' }, `${lc.grupos.some((g) => g.itens.some((i) => i.pago)) ? 'Gôndola + pesquisado' : 'Total estimado'} · ${loja.nomeLista(mes)}`),
    h('div', { class: 'val' }, precoEtq(lc.total),
      o.estado !== 'sem' ? h('span', { class: `de-valor num ${o.estado}` }, o.estado === 'passou' ? `passou ${fmtRS(-o.sobra)}` : `de ${fmtRS(o.valor)}`) : null),
    h('div', { class: 'lin' }, h('div', { class: 'barra' }, h('i', { style: { width: `${pct}%` } })),
      h('span', { class: 'num' }, `${lc.feitos} de ${lc.itens} no carrinho`)),
    lc.itens ? h('div', { class: 'etq-base' }, linhaOrcado(lc), linhaValor(o)) : null);
  // Rota e opções: ficam recolhidas para a lista aparecer logo na primeira tela
  const opcoes = h('details', { class: 'opcoes-compra' },
    h('summary', null, icone('sliders'), h('span', null, `Rota e opções · ${lc.todos.length - lc.fora.size} de ${lc.todos.length} mercados`), icone('chevD', 'tri')),
    h('div', { class: 'vou' },
      h('span', { class: 'rot', style: { width: '100%' } }, 'Mercados que vou visitar (toque para tirar da rota):'),
      lc.todos.map((m) => h('button', {
        class: 'chip', 'aria-pressed': String(!lc.fora.has(m.id)),
        onclick: () => { loja.setForaCompra(mes, m.id, !lc.fora.has(m.id)); app.render(); },
      }, icone(lc.fora.has(m.id) ? 'x' : 'check'), m.nome))),
    h('div', { class: 'vou' },
      'wakeLock' in navigator ? h('button', {
        class: 'chip', 'aria-pressed': String(!!app.prefs.telaLigada),
        onclick: () => { app.prefs.telaLigada = !app.prefs.telaLigada; app.salvarPrefs(); manterTela(app.prefs.telaLigada); app.render(); },
      }, icone('bulb'), app.prefs.telaLigada ? 'Tela sempre ligada' : 'Manter tela ligada') : null,
      h('button', { class: 'chip', 'aria-pressed': String(!!app.prefs.perguntarCaixa), onclick: () => { app.prefs.perguntarCaixa = !app.prefs.perguntarCaixa; app.salvarPrefs(); app.render(); } },
        icone('tag'), app.prefs.perguntarCaixa ? 'Perguntando o preço da gôndola ao marcar' : 'Perguntar o preço da gôndola ao marcar'),
      h('button', { class: 'chip', 'aria-pressed': String(esconder), onclick: () => { app.prefs.esconderFeitos = !esconder; app.salvarPrefs(); app.render(); } },
        icone('check'), esconder ? 'Escondendo o que já peguei' : 'Mostrando tudo')),
    o.estado !== 'sem' ? cartoesOrcamento(mes, { compra: true }) : null);
  if (abrirOpcoes) opcoes.open = true;
  opcoes.addEventListener('toggle', () => { abrirOpcoes = opcoes.open; });
  tela.append(resumo, opcoes);

  if (!lc.itens) {
    tela.append(h('div', { class: 'vazio-lista' }, h('div', { class: 'grande' }, icone('cart')),
      h('p', null, 'A lista de compras é feita com os produtos que têm quantidade.'),
      h('p', null, 'Na aba Preços, toque no botão roxo dos itens que você vai comprar.'),
      h('button', { class: 'btn prim', onclick: () => app.irAba('precos') }, 'Ir para Preços')));
    return;
  }

  tela.append(h('p', { class: 'dica-gesto' }, icone('hand'), h('span', null, 'Deslize para a direita: no carrinho. Para a esquerda: não achei. Toque no preço para anotar o da gôndola.')));

  // Busca: esconde o que não bate, sem redesenhar a tela (o teclado continua aberto)
  const semAchar = h('p', { class: 'sub', hidden: true, style: { color: 'var(--suave)', textAlign: 'center' } }, 'Nenhum item da lista com esse nome.');
  const filtrar = (termo) => {
    buscaCompra = termo;
    const t = norm(termo);
    let algum = false;
    for (const gr of tela.querySelectorAll('.grupo')) {
      let visiveis = 0, sep = null, noSep = 0;
      for (const el of gr.querySelectorAll('.grupo-itens > *')) {
        if (el.classList.contains('sep-cat')) { if (sep) sep.hidden = !noSep; sep = el; noSep = 0; continue; }
        if (!el.classList.contains('ic-deslize')) continue;
        const ok = !t || norm(el.dataset.nome).includes(t);
        el.hidden = !ok;
        if (ok) { visiveis++; noSep++; }
      }
      if (sep) sep.hidden = !noSep;
      gr.hidden = !!t && !visiveis;
      if (t && visiveis) gr.classList.remove('recolhida');
      algum = algum || visiveis > 0;
    }
    semAchar.hidden = !t || algum;
  };
  const busca = h('div', { class: 'busca busca-compra' }, h('span', { class: 'lupa' }, icone('search')),
    h('input', { type: 'search', placeholder: 'Achar item na lista…', value: buscaCompra, 'aria-label': 'Achar item na lista', oninput: (e) => filtrar(e.target.value) }));
  tela.append(busca, semAchar);
  for (const g of lc.grupos) {
    if (!g.itens.length) continue;
    tela.append(grupo(g.mercado.id, `No ${g.mercado.nome}`, `${g.itens.length} ${g.itens.length === 1 ? 'item' : 'itens'} · ${g.feitos} no carrinho`, fmtRS(g.total), g.itens, esconder));
  }
  if (lc.semPreco.length) {
    tela.append(grupo('_sem', 'Sem preço pesquisado', `${lc.semPreco.length} ${lc.semPreco.length === 1 ? 'item' : 'itens'} — compre onde achar melhor`, '', lc.semPreco, esconder));
  }
  if (buscaCompra) filtrar(buscaCompra);
  const rota = cartaoRota();
  if (rota) tela.append(rota);
  tela.append(h('div', { class: 'grade2', style: { margin: '6px 0 20px' } },
    h('button', { class: 'btn', onclick: () => compartilhar(lc) }, icone('share'), 'Enviar lista'),
    h('button', { class: 'btn', onclick: async () => {
      if (!lc.feitos && !lc.grupos.concat({ itens: lc.semPreco }).some((g) => g.itens.some((i) => i.faltou.length))) return;
      if (await confirmar('Desmarcar tudo?', 'Todos os itens voltam para a lista, como se a compra fosse começar agora (os “não achei” também são esquecidos).', 'Desmarcar tudo')) {
        const desfazer = loja.limparCompra(mes); app.render();
        toast('Itens desmarcados.', { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
      }
    } }, icone('x'), 'Desmarcar tudo')),
    blocoNotas({ titulo: false }));
}

// Orçado congelado: a foto da lista no primeiro toque do Modo compra, para comparar com o que está saindo
function linhaOrcado(lc) {
  const { loja, mes } = app;
  const oc = loja.orcado(mes);
  if (!oc) return h('div', { class: 'orcado' }, 'O orçado é guardado quando você marcar o primeiro item.');
  const quando = new Date(oc.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fim = lc.feitos === lc.itens;
  const atual = lc.total;
  const dif = Math.round((atual - oc.total) * 100) / 100;
  return h('div', { class: `orcado${dif > 0.004 ? ' mais' : dif < -0.004 ? ' menos' : ''}` },
    h('span', { class: 'num' }, fim ? 'Compra feita: ' : '', `orçado ${fmtRS(oc.total)} (${quando}) · ${fim ? 'gasto' : 'agora'} ${fmtRS(atual)}`,
      Math.abs(dif) > 0.004 ? ` (${dif > 0 ? '+' : '−'}${fmtRS(Math.abs(dif))})` : ' (igual)'),
    h('button', { class: 'btn pequeno fantasma', onclick: async () => {
      if (!(await confirmar('Atualizar o orçado?', 'O orçado passa a ser a lista de agora, com os preços e as quantidades de agora.', 'Atualizar'))) return;
      loja.congelarOrcado(mes, { forcar: true }); app.render(); toast('Orçado atualizado.');
    } }, 'Atualizar'));
}

// Valor do mês na base da etiqueta (sem verde: verde é só "mais barato")
function linhaValor(o) {
  if (o.estado === 'sem') return h('button', { class: 'link-base', onclick: () => app.abrirTotais() }, icone('card'), 'Definir o valor do mês');
  return h('div', { class: `orc-linha ${o.estado}` }, h('span', { class: 'num' }, o.estado === 'passou' ? `Passou ${fmtRS(-o.sobra)} do valor` : `Sobram ${fmtRS(o.sobra)} do valor`),
    o.semPreco ? h('small', null, `${o.semPreco} sem preço fora da conta`) : null);
}

// Rota sugerida: em poucos mercados pagando quase o mesmo (para economizar viagem)
function cartaoRota() {
  const { loja, mes } = app;
  const r = loja.sugerirRota(mes);
  if (!r || r.usados < 2 || !r.opcoes.length) return null;
  const fora = loja.listaCompra(mes).fora;
  const rotaAtual = (o) => loja.mercados().every((m) => o.ids.includes(m.id) !== fora.has(m.id));
  return h('section', { class: 'rota' },
    h('h3', null, icone('route'), 'Rota sugerida'),
    h('p', { class: 'sub' }, `Comprando tudo no mais barato você passa em ${r.usados} mercados e paga ${fmtRS(r.ideal)}. Com menos paradas:`),
    r.opcoes.map((o) => h('div', { class: 'rota-op' },
      h('div', { class: 'tx' }, h('b', null, o.mercados.map((m) => m.nome).join(' + ')),
        h('small', { class: 'num' }, `${fmtRS(o.total)} · `, h('span', { class: `extra${o.extra <= 0.005 ? ' zero' : ''}` }, o.extra <= 0.005 ? 'mesmo valor' : `+${fmtRS(o.extra)}`))),
      rotaAtual(o) ? h('span', { class: 'dir' }, icone('check'), 'em uso') :
        h('button', { class: 'btn pequeno', onclick: () => {
          const desfazer = loja.lote(() => { for (const m of loja.mercados()) loja.setForaCompra(mes, m.id, !o.ids.includes(m.id)); });
          app.render();
          toast(`Rota: ${o.mercados.map((m) => m.nome).join(' + ')}.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
        } }, 'Usar'))),
    r.itens < loja.listaCompra(mes).itens ? h('p', { class: 'sub' }, 'Itens sem preço pesquisado não entram nessa conta.') : null);
}

// Anel de progresso: quantos itens deste mercado já estão no carrinho
function anel(feitos, total) {
  const r = 16, c = 2 * Math.PI * r;
  const t = document.createElement('template');
  t.innerHTML = `<svg class="anel" viewBox="0 0 40 40" role="img" aria-label="${feitos} de ${total} no carrinho"><circle class="fundo" cx="20" cy="20" r="${r}"/><circle class="frente" cx="20" cy="20" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - (total ? feitos / total : 0))}"/><text x="20" y="20">${feitos}/${total}</text></svg>`;
  return t.content.firstChild;
}

function grupo(id, titulo, sub, valor, itens, esconder) {
  const recolhido = recolhidos.has(id);
  const el = h('section', { class: `grupo${recolhido ? ' recolhida' : ''}` });
  const cab = h('button', { class: 'grupo-cab', 'aria-expanded': String(!recolhido), onclick: () => {
    const r = el.classList.toggle('recolhida');
    if (r) recolhidos.add(id); else recolhidos.delete(id);
    cab.setAttribute('aria-expanded', String(!r));
  } }, anel(itens.filter((i) => i.ok).length, itens.length), h('span', { class: 'tit' }, h('b', null, titulo), h('small', null, sub)), h('span', { class: 'val num' }, valor), icone('chevD', 'tri'));
  const lista = h('div', { class: 'grupo-itens' });
  let catAtual = null;
  const visiveis = itens.filter((it) => !(esconder && it.ok));
  for (const it of visiveis) {
    const nomeCat = it.cat?.nome || 'Sem categoria';
    if (nomeCat !== catAtual) { catAtual = nomeCat; lista.append(h('div', { class: 'sep-cat' }, nomeCat)); }
    lista.append(itemCompra(it));
  }
  if (!visiveis.length) lista.append(h('p', { style: { color: 'var(--suave)', padding: '12px 8px', margin: 0 } }, 'Tudo deste mercado já está no carrinho.'));
  el.append(cab, lista);
  return el;
}

function itemCompra(it) {
  const { loja, mes } = app;
  const alternar = () => {
    vibrar(18);
    // Com "perguntar o preço ao marcar", marcar abre o ajuste do caixa
    if (!it.ok && app.prefs.perguntarCaixa) { gondola(it); return; }
    loja.marcarCompra(mes, it.p.id, !it.ok);
    app.render();
  };
  const real = it.nota || it.pago; // vale o mais recente: nota > gôndola
  const detalhe = [h('span', { class: 'q' }, `${fmtQ(real?.qtd ?? it.p.qtd)}×`), it.marca ? ` · ${it.marca}` : '', it.preco != null ? ` · ${fmtRS(real?.preco ?? it.preco)} un.` : ''];
  const dif = real && !it.semEst ? Math.round((it.total - it.totalEst) * 100) / 100 : 0;
  const refUnit = real && !it.semEst ? it.totalEst / it.p.qtd : null;
  const txtOrcado = refUnit === null ? '' : ` · orçado ${fmtRS(refUnit)}${dif ? ` (${dif > 0 ? '+' : '−'}${fmtRS(Math.abs(dif))})` : ' (igual)'}`;
  const frente = h('div', { class: `ic-compra${it.ok ? ' ok' : ''}` },
    h('button', { class: 'marca-cx', role: 'checkbox', 'aria-checked': String(it.ok), 'aria-label': it.p.nome, onclick: alternar }, icone('check')),
    h('button', { class: 'tx', onclick: alternar },
      h('b', null, it.p.nome), h('small', null, detalhe),
      real ? h('div', { class: `gondola ${dif > 0 ? 'mais' : dif < 0 ? 'menos' : ''}` },
        it.nota ? `nota ${fmtRS(it.nota.preco)}${it.pago ? ` · gôndola ${fmtRS(it.pago.preco)}` : ''}${txtOrcado}` : `gôndola ${fmtRS(it.pago.preco)}${txtOrcado}`) : null,
      it.faltou.length ? h('div', { class: 'manual' }, `não achou no ${it.faltou.join(', ')}`) : null,
      it.manual ? h('div', { class: 'manual' }, 'mercado escolhido por você') : null),
    h('button', { class: `vl num${it.pago ? ' tem' : ''}`, 'aria-label': `Preço da gôndola de ${it.p.nome}`, onclick: () => gondola(it) }, it.total != null ? precoEtq(it.total, { cifrao: false }) : '＋ R$'),
    it.ok
      ? h('button', { class: `btn-ic${it.pago ? ' tem' : ''}`, 'aria-label': `Gôndola de ${it.p.nome}`, onclick: () => gondola(it) }, icone('tag'))
      : h('button', { class: 'btn-ic', 'aria-label': `Opções de ${it.p.nome}`, onclick: () => trocarMercado(it) }, '⋯'));
  const el = h('div', { class: 'ic-deslize', dataset: { nome: `${it.p.nome} ${it.marca || ''}` } },
    h('div', { class: 'fundo-deslize', 'aria-hidden': 'true' },
      h('span', { class: 'f-ok' }, icone('check'), it.ok ? 'Tirar do carrinho' : 'No carrinho'),
      it.mid ? h('span', { class: 'f-nao' }, 'Não achei', icone('x')) : h('span')),
    frente);
  deslizar(el, frente, {
    direita: () => { vibrar(18); loja.marcarCompra(mes, it.p.id, !it.ok); app.render(); },
    esquerda: it.mid ? () => {
      vibrar(18);
      const desfazer = loja.lote(() => loja.naoAchei(mes, it.p.id, it.mid));
      app.render();
      const novo = loja.listaCompra(mes).grupos.find((g) => g.itens.some((x) => x.p.id === it.p.id));
      toast(novo ? `${it.p.nome} foi para o ${novo.mercado.nome}.` : `${it.p.nome}: nenhum outro mercado da rota tem preço.`,
        { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
    } : null,
  });
  return el;
}

// Deslizar o item: para a direita põe (ou tira) do carrinho; para a esquerda, "não achei".
// Só vale arrasto na horizontal (rolar a tela continua normal); o toque simples continua funcionando.
function deslizar(el, frente, { direita, esquerda }) {
  const LIMITE = 72;
  let x0 = null, y0 = 0, dx = 0, arrastando = false, id = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; arrastando = false; id = e.pointerId;
  });
  el.addEventListener('pointermove', (e) => {
    if (x0 === null || e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!arrastando) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { x0 = null; return; } // é rolagem
      if (Math.abs(mx) < 10) return;
      arrastando = true; el.classList.add('arrasta'); el.setPointerCapture(id);
    }
    dx = Math.max(esquerda ? -120 : 0, Math.min(120, mx));
    frente.style.transform = `translateX(${dx}px)`;
    el.classList.toggle('pronto-dir', dx > LIMITE);
    el.classList.toggle('pronto-esq', dx < -LIMITE);
  });
  const soltar = () => {
    if (x0 === null) return;
    x0 = null;
    if (!arrastando) return;
    el.classList.remove('arrasta', 'pronto-dir', 'pronto-esq');
    frente.style.transform = '';
    if (dx > LIMITE) direita(); else if (dx < -LIMITE && esquerda) esquerda();
  };
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
  // depois de arrastar, o "clique" que o navegador manda não pode marcar o item de novo
  el.addEventListener('click', (e) => { if (arrastando) { e.stopPropagation(); e.preventDefault(); arrastando = false; } }, true);
}

// Preço e quantidade da gôndola: anotar (com aviso se subiu muito) e, se quiser, já pôr no carrinho
function gondola(it) {
  const { loja, mes } = app;
  const rota = loja.listaCompra(mes).grupos.map((g) => g.mercado);
  const selMerc = it.mid ? null : h('select', { class: 'entrada' }, rota.map((m) => h('option', { value: m.id }, m.nome)));
  const inpQtd = h('input', { class: 'entrada num', inputmode: 'decimal', value: fmtQ(it.pago?.qtd ?? it.p.qtd), enterkeyhint: 'next' });
  const inpPreco = h('input', { class: 'entrada num', inputmode: 'decimal', value: fmtN(it.pago?.preco ?? it.preco), placeholder: 'R$ por unidade', autofocus: true, enterkeyhint: 'done',
    style: { fontSize: '1.25rem', fontWeight: 700 } });
  campoMoeda(inpPreco, () => app.prefs.moeda !== false);
  const chk = h('input', { type: 'checkbox', checked: true });
  const nomeMerc = () => (it.mid ? rota.find((m) => m.id === it.mid)?.nome : rota.find((m) => m.id === selMerc.value)?.nome) || '';
  const rotChk = h('span');
  const conta = h('div', { class: 'aviso', style: { background: 'var(--card2)', borderColor: 'var(--linha)', color: 'var(--texto)' } });
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const pintar = () => {
    const q = lerNumero(inpQtd.value), p = lerExpr(inpPreco.value);
    rotChk.textContent = `Atualizar também o preço do ${nomeMerc()} na pesquisa`;
    alerta.hidden = true;
    if (!q || typeof p !== 'number') { conta.textContent = 'Digite a quantidade e o preço por unidade.'; return; }
    const total = q * p;
    const est = it.pago?.qtd !== undefined && it.semEst ? null : it.totalEst ?? null;
    conta.replaceChildren(h('b', { class: 'num' }, `Total: ${fmtRS(total)}`),
      est != null ? h('span', { class: 'num', style: { color: 'var(--suave)' } }, ` · orçado ${fmtRS(est)}${Math.abs(total - est) > 0.004 ? ` (${total > est ? '+' : '−'}${fmtRS(Math.abs(total - est))})` : ''}`) : null);
    // subiu 10% ou mais e outro mercado da rota tem mais barato: avisa ali mesmo
    const mid = it.mid || selMerc?.value;
    const a = mid ? loja.alertaGondola(mes, it.p.id, mid, p) : null;
    if (a) {
      alerta.replaceChildren(h('span', null, `⚠️ Subiu ${a.pct}% (orçado ${fmtRS(a.ref)}). No ${a.alt.nome} está ${fmtRS(a.alt.preco)}${a.alt.marca ? ` (${a.alt.marca})` : ''}.`),
        h('button', { class: 'btn pequeno', onclick: () => levar(mid, a.alt, p) }, `Deixar para o ${a.alt.nome}`));
      alerta.hidden = false;
    }
  };
  const alerta = h('div', { class: 'aviso alerta-gondola', hidden: true });
  const levar = (mid, alt, p) => {
    const desfazer = loja.levarPara(mes, it.p.id, { mid, para: alt.mid, preco: p, atualizarPesquisa: chk.checked });
    f.fechar();
    app.render();
    toast(`${it.p.nome} vai ser comprado no ${alt.nome}.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
  };
  [inpQtd, inpPreco].forEach((x) => { x.addEventListener('input', pintar); x.addEventListener('focus', () => x.select()); });
  selMerc?.addEventListener('change', pintar);
  const salvar = (pegar = true) => {
    const q = lerNumero(inpQtd.value), p = lerExpr(inpPreco.value);
    if (!q || typeof p !== 'number') { erro.textContent = 'Confira a quantidade e o preço.'; erro.hidden = false; return; }
    const mid = it.mid || selMerc?.value;
    if (!mid) { erro.textContent = 'Nenhum mercado na rota.'; erro.hidden = false; return; }
    const desfazer = loja.pagarNoCaixa(mes, it.p.id, { mid, preco: p, qtd: q, atualizarPesquisa: chk.checked, pegar });
    f.fechar();
    app.render();
    toast(`🏷️ ${it.p.nome}: ${fmtRS(q * p)}${pegar || it.ok ? ' no carrinho' : ' anotado'}.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
  };
  inpPreco.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
  const f = folha([
    h('h2', null, `🏷️ Gôndola · ${it.p.nome}`),
    h('p', { class: 'sub' }, it.mid ? `No ${nomeMerc()}. Digite o preço que está na prateleira (e a quantidade, se mudou).` : 'Este item não tinha preço pesquisado. Diga em que mercado está e o preço da prateleira.'),
    h('div', { class: 'form' },
      selMerc ? h('label', null, 'Mercado', selMerc) : null,
      h('div', { class: 'grade2' }, h('label', null, 'Quantidade', inpQtd), h('label', null, 'Preço por unidade', inpPreco)),
      conta,
      alerta,
      h('label', { class: 'check' }, chk, rotChk),
      erro),
    h('div', { class: 'acoes lado' },
      it.pago ? h('button', { class: 'btn fantasma', onclick: () => { loja.voltarAoPesquisado(mes, it.p.id); f.fechar(); app.render(); } }, 'Usar o orçado')
        : it.ok ? h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar')
          : h('button', { class: 'btn', onclick: () => salvar(false) }, 'Só anotar'),
      h('button', { class: 'btn verde', onclick: () => salvar(true) }, it.ok ? 'Salvar' : '✓ Pegar no carrinho')),
    h('div', { class: 'acoes' }, h('button', { class: 'btn fantasma bloco', style: { color: 'var(--perigo)' }, onclick: () => tirarDaLista(it, f) }, '🗑 Tirar da lista de compras')),
  ]);
  pintar();
}

function tirarDaLista(it, f) {
  const desfazer = app.loja.tirarDaLista(app.mes, it.p.id);
  f.fechar();
  app.render();
  toast(`${it.p.nome} saiu da lista de compras.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
}

function trocarMercado(it) {
  const { loja, mes } = app;
  const c = loja.calcProduto(mes, it.p.id);
  const lc = loja.listaCompra(mes);
  const faltou = new Set(loja.get(`k:${mes}:${it.p.id}`)?.faltou || []);
  const aqui = it.mid ? c.linhas.find((l) => l.mid === it.mid) : null;
  const escolher = (mid) => {
    loja.lote(() => {
      if (faltou.has(mid)) loja.mesclar(`k:${mes}:${it.p.id}`, { faltou: [...faltou].filter((x) => x !== mid) });
      loja.escolherMercadoCompra(mes, it.p.id, c.mercMenor === mid && !faltou.size ? null : mid);
    });
    f.fechar(); app.render();
  };
  const naoAchei = () => {
    const desfazer = loja.lote(() => loja.naoAchei(mes, it.p.id, it.mid));
    f.fechar(); app.render();
    const novo = loja.listaCompra(mes).grupos.find((g) => g.itens.some((x) => x.p.id === it.p.id));
    const x = novo?.itens.find((i) => i.p.id === it.p.id);
    toast(novo ? `${it.p.nome} foi para o ${novo.mercado.nome} (${fmtRS(x.preco)} un.)` : `${it.p.nome}: nenhum outro mercado da rota tem preço. Ficou em “Sem preço”.`,
      { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
  };
  const f = folha([
    h('h2', null, it.p.nome),
    aqui ? h('div', { class: 'acoes', style: { marginTop: '6px' } },
      h('button', { class: 'btn prim bloco', onclick: naoAchei }, `😕 Não achei no ${aqui.nome}`),
      h('p', { class: 'sub', style: { margin: 0, textAlign: 'center' } }, 'O item vai sozinho para o próximo mercado mais barato da rota.')) : null,
    faltou.size ? h('button', { class: 'btn bloco', style: { marginTop: '8px' }, onclick: () => { loja.voltarNaoAchei(mes, it.p.id); f.fechar(); app.render(); } },
      `↺ Considerar de novo: ${lc.todos.filter((m) => faltou.has(m.id)).map((m) => m.nome).join(', ')}`) : null,
    h('p', { class: 'sub', style: { marginTop: '16px' } }, 'Ou escolha em qual mercado comprar:'),
    h('div', { class: 'opcoes' },
      c.linhas.map((l) => h('button', {
        class: `opcao${it.mid === l.mid ? ' atual' : ''}`, disabled: l.preco === null,
        onclick: () => escolher(l.mid),
      }, h('span', { class: 'ic' }, faltou.has(l.mid) ? '😕' : c.baratos.has(l.mid) ? '🟢' : '🏪'),
      h('span', { class: 'tx' }, l.nome, h('small', null, [l.preco === null ? 'sem preço' : `${fmtRS(l.preco)} un.${l.marca ? ` · ${l.marca}` : ''}`,
        faltou.has(l.mid) ? ' · você não achou aqui' : '', lc.fora.has(l.mid) ? ' · fora da rota' : ''].join(''))),
      h('span', { class: 'dir num' }, l.total != null ? fmtRS(l.total) : ''))),
      it.manual ? h('button', { class: 'btn fantasma bloco', onclick: () => { loja.escolherMercadoCompra(mes, it.p.id, null); f.fechar(); app.render(); } }, 'Voltar para o mais barato') : null),
    h('div', { class: 'acoes' },
      h('button', { class: 'btn perigo bloco', onclick: () => tirarDaLista(it, f) }, '🗑 Tirar da lista de compras'),
      h('p', { class: 'sub', style: { margin: 0, textAlign: 'center' } }, 'O produto continua na aba Preços, só sem quantidade.')),
  ]);
}

async function compartilhar(lc) {
  const linhas = [`🛒 ${app.loja.nomeLista(app.mes)}`, ''];
  for (const g of lc.grupos) {
    if (!g.itens.length) continue;
    linhas.push(`*No ${g.mercado.nome}* (${g.itens.length} ${g.itens.length === 1 ? 'item' : 'itens'} · ${fmtRS(g.total)})`);
    for (const it of g.itens) linhas.push(`${it.ok ? '✅' : '⬜'} ${fmtQ(it.pago?.qtd ?? it.p.qtd)}× ${it.p.nome}${it.marca ? ` (${it.marca})` : ''} — ${fmtN(it.pago?.preco ?? it.preco)}${it.pago ? ' 🏷️' : ''}`);
    linhas.push('');
  }
  if (lc.semPreco.length) {
    linhas.push('*Sem preço pesquisado*');
    for (const it of lc.semPreco) linhas.push(`${it.ok ? '✅' : '⬜'} ${fmtQ(it.p.qtd)}× ${it.p.nome}`);
    linhas.push('');
  }
  linhas.push(`Total estimado: ${fmtRS(lc.total)}`);
  const texto = linhas.join('\n');
  try {
    if (navigator.share) { await navigator.share({ text: texto }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(texto); toast('Lista copiada. É só colar no WhatsApp.'); } catch { toast('Não consegui copiar a lista.'); }
}
