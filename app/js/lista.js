// Tela principal: a lista do mês, com preços por mercado e a comparação.

import { app } from './ctx.js';
import { h, fmtRS, fmtN, fmtQ, lerExpr, folha, perguntar, toast, vibrar, campoMoeda } from './ui.js';
import { norm, lerNumero, nomeMes, porUnidade, variacaoPreco, mesDe, nomeDaMarca } from './modelo.js';
import { marcasComuns } from './marcas.js';
import { montarGrade, pintarLinha, telaLarga } from './grade.js';

const filtros = { busca: '', falta: false, cat: null, merc: null, comprar: false };
const abertos = new Set();
let elLista = null, elFiltros = null, elProg = null, mesAnterior = null;

// No computador a aba Preços abre como planilha (dá para voltar aos cartões)
export const vistaGrade = () => telaLarga() && app.prefs.vista !== 'cartoes';
matchMedia('(min-width: 900px)').addEventListener('change', () => { if (app.aba === 'precos') app.render(); });

const curto = (nome) => (nome.length <= 9 ? nome : nome.split(/\s+/)[0].slice(0, 9));

export function telaPrecos(topo, tela) {
  const { loja } = app;
  if (filtros.cat && !loja.categorias().some((c) => c.id === filtros.cat)) filtros.cat = null;
  if (filtros.merc && !loja.mercados().some((m) => m.id === filtros.merc)) filtros.merc = null;

  const busca = h('input', {
    type: 'search', placeholder: 'Buscar produto…', value: filtros.busca, enterkeyhint: 'search', 'aria-label': 'Buscar produto',
    oninput: (e) => { filtros.busca = e.target.value; limpar.hidden = !filtros.busca; clearTimeout(busca._t); busca._t = setTimeout(pintarLista, 120); },
  });
  const limpar = h('button', { 'aria-label': 'Limpar busca', hidden: !filtros.busca, onclick: () => { busca.value = ''; filtros.busca = ''; limpar.hidden = true; pintarLista(); busca.focus(); } }, '✕');
  elFiltros = h('div', { class: 'filtros' });
  elProg = h('div', { class: 'progresso' });
  topo.append(
    h('div', { class: 'linha-topo' }, botaoMes(), h('div', { class: 'espaco' }), app.seloSinc()),
    h('div', { class: 'busca' }, h('span', { class: 'lupa' }, '🔎'), busca, limpar),
    elFiltros, elProg,
  );
  elLista = h('div', { id: 'lista' });
  tela.append(elLista);
  pintarFiltros();
  pintarLista();
}

export function botaoMes() {
  return h('button', { class: 'btn-mes', onclick: () => app.abrirMeses(), 'aria-label': 'Escolher lista' },
    app.loja.nomeLista(app.mes), h('span', { class: 'seta' }, '▼'));
}

function pintarFiltros() {
  const { loja } = app;
  const cat = loja.categorias().find((c) => c.id === filtros.cat);
  const merc = loja.mercados().find((m) => m.id === filtros.merc);
  const chip = (rotulo, ativo, fn) => h('button', { class: 'chip', 'aria-pressed': String(!!ativo), onclick: fn }, rotulo);
  elFiltros.replaceChildren(
    chip(merc ? `🏪 ${merc.nome} ✕` : '🏪 Mercado', merc, () => (merc ? (filtros.merc = null, atualizar()) : escolherMercado())),
    chip('⏳ Falta pesquisar', filtros.falta, () => { filtros.falta = !filtros.falta; atualizar(); }),
    chip(cat ? `🗂️ ${cat.nome} ✕` : '🗂️ Categoria', cat, () => (cat ? (filtros.cat = null, atualizar()) : escolherCategoria())),
    chip('🛒 Vou comprar', filtros.comprar, () => { filtros.comprar = !filtros.comprar; atualizar(); }),
    telaLarga() ? chip(vistaGrade() ? '🧮 Planilha' : '🧮 Ver como planilha', vistaGrade(), () => { app.prefs.vista = vistaGrade() ? 'cartoes' : 'grade'; app.salvarPrefs(); app.render(); }) : null,
  );
  function atualizar() { pintarFiltros(); pintarLista(); scrollTo(0, 0); }
  function escolherCategoria() {
    const f = folha([h('h2', null, 'Mostrar só uma categoria'), h('div', { class: 'opcoes' },
      loja.categorias().map((c) => h('button', { class: 'opcao', onclick: () => { filtros.cat = c.id; f.fechar(); atualizar(); } },
        h('span', { class: 'tx' }, c.nome), h('span', { class: 'dir' }, String(loja.produtos(app.mes).filter((p) => p.cat === c.id).length)))))]);
  }
  function escolherMercado() {
    const f = folha([h('h2', null, 'Pesquisar em um mercado'),
      h('p', { class: 'sub' }, 'Cada produto mostra direto os campos desse mercado — ideal para anotar os preços andando pelo corredor.'),
      h('div', { class: 'opcoes' }, loja.mercados().map((m) => h('button', { class: 'opcao', onclick: () => { filtros.merc = m.id; f.fechar(); atualizar(); } },
        h('span', { class: 'ic' }, '🏪'), h('span', { class: 'tx' }, m.nome))))]);
  }
}

function passa(p, c) {
  if (filtros.busca && !norm(p.nome).includes(norm(filtros.busca)) &&
    !c.linhas.some((l) => l.marca && norm(l.marca).includes(norm(filtros.busca)))) return false;
  if (filtros.cat && p.cat !== filtros.cat) return false;
  if (filtros.comprar && !p.qtd) return false;
  if (filtros.falta) {
    if (filtros.merc) { if (c.linhas.find((l) => l.mid === filtros.merc)?.preco !== null) return false; }
    else if (c.faltam === 0) return false;
  }
  return true;
}

export function pintarLista() {
  if (!elLista) return;
  const { loja, mes } = app;
  const meses = loja.meses();
  mesAnterior = meses.filter((m) => m < mesDe(mes)).pop() || null;
  const mercs = loja.mercados();
  const todos = loja.produtos(mes);
  const cats = loja.categorias();
  const idsCat = new Set(cats.map((c) => c.id));
  const grupos = cats.map((c) => ({ c, lista: todos.filter((p) => p.cat === c.id) }));
  const orfaos = todos.filter((p) => !idsCat.has(p.cat));
  if (orfaos.length) grupos.push({ c: { id: '_', nome: 'Sem categoria' }, lista: orfaos });
  const filtrando = filtros.busca || filtros.falta || filtros.cat || filtros.comprar;
  const recolhidas = new Set(app.prefs.recolhidas || []);
  const frag = [];
  const grade = vistaGrade() ? [] : null;
  let mostrados = 0;
  for (const { c, lista } of grupos) {
    const visiveis = loja.ordenar(lista.filter((p) => passa(p, loja.calcProduto(mes, p.id, mercs))), mes);
    if (!visiveis.length && (filtrando || !lista.length)) continue;
    mostrados += visiveis.length;
    if (grade) { if (visiveis.length) grade.push({ c, lista: visiveis }); continue; }
    const recolhida = recolhidas.has(c.id) && !filtros.busca;
    const sec = h('section', { class: `categoria${recolhida ? ' recolhida' : ''}`, dataset: { cat: c.id } });
    const info = h('span', { class: 'info num' });
    const banda = h('button', {
      class: 'banda', 'aria-expanded': String(!recolhida),
      onclick: () => {
        const r = sec.classList.toggle('recolhida');
        banda.setAttribute('aria-expanded', String(!r));
        const s = new Set(app.prefs.recolhidas || []);
        if (r) s.add(c.id); else s.delete(c.id);
        app.prefs.recolhidas = [...s]; app.salvarPrefs();
        if (!r && !sec.querySelector('.card')) itens.append(...visiveis.map(montarCard));
      },
    }, h('span', { class: 'tri' }, '▼'), h('span', { class: 'nome' }, c.nome), info);
    const itens = h('div', { class: 'itens' });
    if (!recolhida) itens.append(...visiveis.map(montarCard));
    sec._info = info; sec._lista = lista.map((p) => p.id);
    sec.append(banda, itens);
    pintarBanda(sec);
    frag.push(sec);
  }
  if (grade?.length) frag.push(montarGrade(grade, { aoMudar: () => { pintarProgresso(); app.pintarRodape(); }, editar: (pid) => editarProduto(pid) }));
  if (!mostrados) {
    const termo = filtros.busca.trim();
    frag.push(h('div', { class: 'vazio-lista' },
      h('div', { class: 'grande' }, todos.length ? '🔍' : '🧺'),
      h('p', null, todos.length ? (termo ? `Nenhum produto com “${termo}”.` : 'Nada por aqui com esses filtros. 🎉') : 'Este mês ainda não tem produtos.'),
      termo ? h('button', { class: 'btn prim', onclick: () => novoProduto({ nome: termo }) }, `＋ Incluir “${termo}”`) :
        !todos.length ? h('button', { class: 'btn prim', onclick: () => novoProduto() }, '＋ Incluir produto') : null));
  }
  const banner = bannerRepetir(todos);
  elLista.replaceChildren(...(banner ? [banner] : []), ...frag);
  pintarProgresso();
}

// Mês sem nenhuma quantidade e mês anterior com quantidades: oferece repetir com um toque
const repetirDispensado = new Set();
function bannerRepetir(todos) {
  const { loja, mes } = app;
  // só na lista nº 1: as listas extras nascem do jeito que a pessoa escolheu
  if (!mesAnterior || mesDe(mes) !== mes || repetirDispensado.has(mes) || todos.some((p) => p.qtd)) return null;
  const n = todos.filter((p) => loja.produto(mesAnterior, p.id)?.qtd).length;
  if (!n) return null;
  return h('div', { class: 'banner-repetir' },
    h('div', null, h('b', null, `🔁 Repetir as quantidades de ${nomeMes(mesAnterior)}?`),
      h('small', null, `${n} ${n === 1 ? 'item tinha' : 'itens tinham'} quantidade lá. Depois é só ajustar.`)),
    h('div', { class: 'grade2' },
      h('button', { class: 'btn prim', onclick: () => repetirQuantidades() }, 'Repetir'),
      h('button', { class: 'btn fantasma', onclick: () => { repetirDispensado.add(mes); pintarLista(); } }, 'Agora não')));
}

export function repetirQuantidades(de = mesAnterior) {
  const { loja, mes } = app;
  if (!de) return;
  const { n, desfazer } = loja.repetirQuantidades(mes, de);
  app.render();
  toast(n ? `${n} quantidades copiadas de ${nomeMes(de)}.` : 'Nenhuma quantidade para copiar.', n ? { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } } : {});
}

function pintarBanda(sec) {
  if (!sec?._info) return;
  const { loja, mes } = app;
  let comprar = 0, total = 0, n = 0;
  for (const pid of sec._lista) {
    const p = loja.produto(mes, pid);
    if (!p) continue;
    n++;
    if (p.qtd) { comprar++; total += loja.calcProduto(mes, pid).totalMenor || 0; }
  }
  sec._info.replaceChildren(...[`${n} ${n === 1 ? 'item' : 'itens'}`, comprar ? h('br') : null, comprar ? `${comprar} p/ comprar · ${fmtRS(total)}` : null].filter(Boolean));
}

function pintarProgresso() {
  if (!elProg) return;
  const { loja, mes } = app;
  const todos = loja.produtos(mes);
  let feitos, rotulo;
  if (filtros.merc) {
    const m = loja.mercados().find((x) => x.id === filtros.merc);
    feitos = todos.filter((p) => typeof loja.preco(mes, p.id, filtros.merc)?.preco === 'number').length;
    rotulo = `${m?.nome}: ${feitos} de ${todos.length} pesquisados`;
  } else {
    const calc = loja.calcMes(mes);
    feitos = calc.comPreco;
    rotulo = `${feitos} de ${todos.length} com preço · ${calc.comQtd} p/ comprar`;
  }
  const pct = todos.length ? Math.round((feitos / todos.length) * 100) : 0;
  elProg.replaceChildren(h('div', { class: 'barra' }, h('i', { style: { width: `${pct}%` } })), h('span', { class: 'num' }, rotulo));
}

// ---------- card do produto ----------
function montarCard(p) {
  const card = h('article', { class: 'card', dataset: { pid: p.id } });
  card._pid = p.id;
  construir(card);
  return card;
}

function construir(card) {
  const { loja, mes } = app;
  const pid = card._pid;
  const p = loja.produto(mes, pid);
  if (!p) { card.remove(); return; }
  const aberto = abertos.has(pid);
  card.classList.toggle('aberto', aberto);
  const qtdInp = h('input', {
    class: 'num', inputmode: 'decimal', value: fmtQ(p.qtd), placeholder: '0', 'aria-label': `Quantidade de ${p.nome}`,
    onfocus: (e) => e.target.select(),
    oninput: (e) => { const v = lerNumero(e.target.value); if (v === null && e.target.value.trim()) return; loja.setQtd(mes, pid, v); depois(card); },
    onblur: (e) => { e.target.value = fmtQ(loja.produto(mes, pid)?.qtd); },
  });
  const passo = (d) => () => {
    vibrar();
    const atual = loja.produto(mes, pid)?.qtd || 0;
    const novo = Math.max(0, Math.round((atual + d) * 1000) / 1000);
    loja.setQtd(mes, pid, novo || null);
    depois(card);
  };
  const sub = h('small');
  card._sub = sub; card._qtd = qtdInp;
  const topo = h('div', { class: 'card-topo' },
    h('button', { class: 'card-nome', 'aria-expanded': String(aberto), onclick: () => alternar(card) }, h('b', null, p.nome), sub),
    h('div', { class: `qtd${p.qtd ? '' : ' vazia'}` },
      h('button', { 'aria-label': 'Diminuir', onclick: passo(-1) }, '−'), qtdInp, h('button', { 'aria-label': 'Aumentar', onclick: passo(1) }, '+')));
  card._chips = h('div', { class: 'chips-precos', onclick: () => alternar(card) });
  card._resumo = h('div', { class: 'resumo', onclick: () => alternar(card) });
  const filhos = [topo];
  const mercs = loja.mercados();
  const linhasMerc = aberto ? mercs : filtros.merc ? mercs.filter((m) => m.id === filtros.merc) : [];
  if (!aberto) filhos.push(card._chips);
  if (linhasMerc.length) {
    const dl = h('datalist', { id: `marcas-${pid}` }, sugestoesMarca(pid, p.nome).map((m) => h('option', { value: m })));
    filhos.push(dl, h('div', { class: 'painel' }, linhasMerc.map((m) => linhaMercado(card, m, dl.id))));
  }
  filhos.push(card._resumo);
  if (aberto) {
    filhos.push(h('div', { class: 'acoes-card' },
      h('button', { class: 'btn pequeno', onclick: () => editarProduto(pid) }, '✎ Editar'),
      h('button', { class: 'btn pequeno', onclick: () => abrirMarcas(pid) }, '🏷️ Marcas'),
      h('button', { class: 'btn pequeno', onclick: () => app.irAba('historico', { pid }) }, '📈 Histórico'),
      h('button', { class: 'btn pequeno fantasma', onclick: () => alternar(card) }, '▲ Fechar')));
  }
  card.replaceChildren(...filhos);
  pintar(card);
}

function alternar(card) {
  if (abertos.has(card._pid)) abertos.delete(card._pid); else abertos.add(card._pid);
  construir(card);
  if (abertos.has(card._pid)) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Sugestões no campo marca/tamanho: primeiro as que a família já usou, depois as comuns no Brasil
function sugestoesMarca(pid, nome) {
  const vistas = new Map();
  for (const m of [...app.loja.marcasUsadas(pid), ...marcasComuns(nome)]) if (!vistas.has(norm(m))) vistas.set(norm(m), m);
  return [...vistas.values()];
}

function linhaMercado(card, m, listaMarcas) {
  const { loja, mes } = app;
  const pid = card._pid;
  const r = loja.preco(mes, pid, m.id) || {};
  const ant = mesAnterior ? loja.preco(mesAnterior, pid, m.id)?.preco : null;
  const tot = h('small', { class: 'num' });
  const info = h('small', { class: 'num info-lm' });
  const preco = h('input', {
    class: 'campo preco', inputmode: 'decimal', enterkeyhint: 'next', value: fmtN(r.preco),
    placeholder: typeof ant === 'number' ? `ant. ${fmtN(ant)}` : 'R$', 'aria-label': `Preço no ${m.nome}`,
    onfocus: (e) => e.target.select(),
    oninput: (e) => {
      const v = lerExpr(e.target.value);
      // conta pela metade ("36,98/") ainda não é erro: só não grava
      const incompleta = /[+\-*/x×÷(]$/i.test(e.target.value.trim());
      e.target.style.borderColor = v === undefined && !incompleta ? 'var(--perigo)' : '';
      if (v === undefined) return;
      loja.setPreco(mes, pid, m.id, v);
      depois(card);
    },
    onblur: (e) => {
      if (lerExpr(e.target.value) === undefined) toast(`Não entendi o preço “${e.target.value}”. Ficou o anterior.`);
      e.target.style.borderColor = '';
      e.target.value = fmtN(loja.preco(mes, pid, m.id)?.preco);
    },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); proximoCampo(e.target); } },
  });
  campoMoeda(preco, () => app.prefs.moeda !== false);
  const marca = h('input', {
    class: `campo marca${r.auto ? ' auto' : ''}`, value: r.marca || '', placeholder: 'marca/tam.', enterkeyhint: 'next', list: listaMarcas,
    autocapitalize: 'sentences', 'aria-label': `Marca e tamanho no ${m.nome}`,
    oninput: (e) => { loja.setMarca(mes, pid, m.id, e.target.value); e.target.classList.remove('auto'); depois(card); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); proximoCampo(e.target); } },
  });
  const btnObs = h('button', { class: `btn-ic${r.obs ? ' tem' : ''}`, 'aria-label': `Observação no ${m.nome}`, onclick: async () => {
    const atual = loja.preco(mes, pid, m.id)?.obs || '';
    const v = await pedirTextoOpcional(`Observação · ${m.nome}`, atual);
    if (v === null) return;
    loja.setObs(mes, pid, m.id, v);
    construir(card);
  } }, '💬');
  const linha = h('div', { class: 'lm', dataset: { mid: m.id } },
    h('div', { class: 'mn' }, m.nome, tot, info), preco, marca, btnObs,
    r.obs ? h('div', { class: 'obs-linha' }, `💬 ${r.obs}`) : null);
  linha._tot = tot; linha._preco = preco; linha._marca = marca; linha._info = info; linha._antR = mesAnterior ? loja.preco(mesAnterior, pid, m.id) : null;
  return linha;
}

function pedirTextoOpcional(titulo, valor) {
  return new Promise((ok) => {
    let res = null;
    const inp = h('textarea', { class: 'entrada', autofocus: true, placeholder: 'Ex.: promoção até sexta, leve 3 pague 2…' }, valor);
    const f = folha([h('h2', null, titulo), inp, h('div', { class: 'acoes lado' },
      h('button', { class: 'btn fantasma', onclick: () => { res = ''; f.fechar(); } }, 'Apagar'),
      h('button', { class: 'btn prim', onclick: () => { res = inp.value.trim(); f.fechar(); } }, 'Salvar'))], { aoFechar: () => ok(res) });
  });
}

function proximoCampo(atual) {
  const campos = [...document.querySelectorAll('#lista input.campo.preco')].filter((c) => c.offsetParent);
  const pos = atual.compareDocumentPosition.bind(atual);
  const prox = campos.find((c) => pos(c) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (prox) { prox.focus(); prox.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else atual.blur();
}

// Depois de uma mudança local: atualiza o card, a faixa da categoria, o progresso e o rodapé
function depois(card) {
  pintar(card);
  pintarBanda(card.closest('.categoria'));
  pintarProgresso();
  app.pintarRodape();
}

function pintar(card) {
  const { loja, mes } = app;
  const pid = card._pid;
  const p = loja.produto(mes, pid);
  if (!p) { card.remove(); return; }
  const c = loja.calcProduto(mes, pid);
  const ativo = document.activeElement;
  if (ativo !== card._qtd) card._qtd.value = fmtQ(p.qtd);
  card._qtd.parentElement.classList.toggle('vazia', !p.qtd);
  const marcaPrinc = c.marcaMenor || c.linhas.find((l) => l.marca)?.marca || '';
  const aceitas = loja.marcasAceitas(pid);
  card._sub.textContent = [marcaPrinc, aceitas.length ? `só ${aceitas.join(', ')}` : '', p.obs].filter(Boolean).join(' · ');
  card._sub.hidden = !card._sub.textContent;
  card._chips.hidden = c.pesquisados === 0;
  card._chips.replaceChildren(...c.linhas.map((l) => h('span', { class: `cp${c.baratos.has(l.mid) ? ' menor' : ''}${l.preco === null ? ' vazio' : ''}${l.aceita ? '' : ' fora'}` },
    curto(l.nome), h('b', { class: 'num' }, l.preco === null ? '—' : fmtN(l.preco)))));
  if (c.menor !== null) {
    card._resumo.className = 'resumo';
    card._resumo.replaceChildren(...[
      h('span', null, '✓ ', h('b', { class: 'num' }, fmtRS(c.menor)), ' no ', h('b', null, c.nomeMercMenor), c.baratos.size > 1 ? ` (+${c.baratos.size - 1})` : ''),
      c.marcaMenor ? h('span', null, c.marcaMenor) : null,
      h('span', { class: 'tot num' }, c.totalMenor !== null ? `Total ${fmtRS(c.totalMenor)}` : 'sem qtd.')].filter(Boolean));
    const pu = porUnidade(c);
    if (pu?.difere) {
      card._resumo.append(h('span', { class: 'dica-unid' },
        `💡 Por ${pu.base === 'un' ? 'unidade' : pu.base}, o ${pu.melhor.nome} sai mais em conta: ${fmtRS(pu.melhor.porUnid)}/${pu.base} (${pu.melhor.marca})`));
    }
  } else {
    card._resumo.className = 'resumo nada';
    card._resumo.replaceChildren(h('span', null, c.pesquisados ? 'Nenhum preço das marcas que vocês compram (🏷️ Marcas)' :
      filtros.merc || abertos.has(pid) ? 'Digite o preço para comparar' : 'Sem preço ainda — toque para pesquisar'));
  }
  for (const linha of card.querySelectorAll('.lm')) {
    const l = c.linhas.find((x) => x.mid === linha.dataset.mid);
    if (!l) continue;
    linha.classList.toggle('menor', c.baratos.has(l.mid));
    linha.classList.toggle('fora-marca', !l.aceita);
    linha._tot.textContent = l.total !== null ? `= ${fmtRS(l.total)}` : '';
    // Preço por kg/litro e quanto mudou em relação ao mês anterior
    const partes = [];
    if (!l.aceita) partes.push(h('span', { class: 'marca-nao' }, 'marca não aceita'));
    if (l.porUnid !== null) partes.push(h('span', null, `${fmtRS(l.porUnid)}/${l.tam.base}`));
    const pct = variacaoPreco(l, linha._antR);
    if (pct !== null && Math.abs(pct) >= 3) {
      partes.push(h('span', { class: pct > 0 ? 'var-sobe' : 'var-desce', title: `mês anterior: ${fmtRS(linha._antR.preco)} (${linha._antR.marca || 'sem marca'})` },
        `${pct > 0 ? '▲' : '▼'}${Math.round(Math.abs(pct))}%`));
    }
    linha._info.replaceChildren(...partes.flatMap((x, i) => (i ? [' ', x] : [x])));
    if (ativo !== linha._preco && lerExpr(linha._preco.value) !== l.preco) linha._preco.value = fmtN(l.preco);
    if (ativo !== linha._marca) { linha._marca.value = l.marca; linha._marca.classList.toggle('auto', l.auto); }
  }
}

// Atualização vinda de outro celular: repinta só os cards (sem perder o campo em edição)
export function repintarCards() {
  if (!elLista) return;
  for (const card of elLista.querySelectorAll('.card')) pintar(card);
  for (const tr of elLista.querySelectorAll('tr[data-pid]')) pintarLinha(tr);
  for (const sec of elLista.querySelectorAll('.categoria')) pintarBanda(sec);
  pintarProgresso();
}

// ---------- incluir / editar / excluir ----------
function campoCategoria(valor) {
  return h('select', { class: 'entrada' }, app.loja.categorias().map((c) => h('option', { value: c.id, selected: c.id === valor }, c.nome)));
}

async function checarDuplicado(nome, catId, exceto) {
  const { loja, mes } = app;
  const iguais = loja.duplicados(mes, nome, exceto);
  if (!iguais.length) return true;
  const cats = new Map(loja.categorias().map((c) => [c.id, c.nome]));
  const onde = iguais.map((p) => cats.get(p.cat) || 'sem categoria').join(', ');
  return perguntar({
    titulo: 'Esse nome já existe',
    texto: `Já tem “${iguais[0].nome}” neste mês (em ${onde}). Se for outro item — por exemplo, outro sabor ou tamanho — pode salvar mesmo assim que eles aparecem separados.`,
    botoes: [{ rotulo: 'Salvar mesmo assim', valor: true, estilo: 'prim' }, { rotulo: 'Voltar e mudar o nome', valor: false, estilo: 'fantasma' }],
  });
}

export function novoProduto({ nome = '', cat = null, aoSalvar = null } = {}) {
  const { loja } = app;
  const futuros = loja.meses().filter((m) => m > mesDe(app.mes));
  const inpNome = h('input', { class: 'entrada', value: nome, placeholder: 'Ex.: Banha', autofocus: true, autocapitalize: 'sentences', enterkeyhint: 'next' });
  const selCat = campoCategoria(cat || filtros.cat || app.prefs.ultimaCat || loja.categorias()[0]?.id);
  // categoria sugerida enquanto digita o nome (até a pessoa escolher outra à mão)
  const dicaCat = h('small', { class: 'dica-cat', hidden: true }, '🪄 categoria sugerida pelo nome');
  let catAMao = !!cat;
  selCat.addEventListener('change', () => { catAMao = true; dicaCat.hidden = true; });
  inpNome.addEventListener('input', () => {
    if (catAMao) return;
    const s = loja.sugerirCategoria(inpNome.value, { mes: mesDe(app.mes) });
    if (s) selCat.value = s.cid;
    dicaCat.hidden = !s;
  });
  const inpQtd = h('input', { class: 'entrada', inputmode: 'decimal', placeholder: 'Opcional' });
  const chkFut = h('input', { type: 'checkbox' });
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const salvar = async () => {
    const n = inpNome.value.trim();
    if (!n) { erro.textContent = 'Digite o nome do produto.'; erro.hidden = false; inpNome.focus(); return; }
    if (!(await checarDuplicado(n, selCat.value))) { inpNome.focus(); return; }
    const qtd = lerNumero(inpQtd.value);
    const pid = loja.addProduto(app.mes, { nome: n, cat: selCat.value, qtd });
    if (chkFut.checked) for (const m of futuros) loja.set(`p:${m}:${pid}`, { nome: n, cat: selCat.value, qtd: null, obs: '' });
    app.prefs.ultimaCat = selCat.value; app.salvarPrefs();
    f.fechar();
    if (aoSalvar) { aoSalvar(pid); toast(`“${n}” incluído.`); return; }
    abertos.add(pid);
    const s = new Set(app.prefs.recolhidas || []); s.delete(selCat.value); app.prefs.recolhidas = [...s];
    filtros.busca = ''; filtros.falta = false; filtros.comprar = false;
    if (filtros.cat && filtros.cat !== selCat.value) filtros.cat = null;
    app.render();
    const card = document.querySelector(`.card[data-pid="${pid}"]`);
    card?.scrollIntoView({ block: 'center' });
    setTimeout(() => card?.querySelector('input.preco')?.focus({ preventScroll: true }), 250);
    const nomeCat = loja.categorias().find((c) => c.id === selCat.value)?.nome;
    toast(`“${n}” incluído em ${nomeCat}.`);
  };
  inpNome.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
  const f = folha([
    h('h2', null, 'Novo produto'),
    h('p', { class: 'sub' }, `Entra em ${nomeMes(app.mes)}, com os preços em branco em todos os mercados.`),
    h('div', { class: 'form' },
      h('label', null, 'Nome', inpNome),
      h('label', null, 'Categoria', selCat, dicaCat),
      h('label', null, 'Quantidade a comprar', inpQtd),
      futuros.length ? h('label', { class: 'check' }, chkFut, `Incluir também em ${futuros.map((m) => nomeMes(m)).join(', ')}`) : null,
      erro),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'),
      h('button', { class: 'btn prim', onclick: salvar }, 'Incluir')),
  ]);
}

// Pergunta e exclui (só deste mês ou daqui para frente). Devolve true se excluiu.
export async function excluirComPergunta(pid, mes = app.mes) {
  const { loja } = app;
  const p = loja.produto(mes, pid);
  if (!p) return false;
  const futuros = loja.meses().filter((m) => m > mes && loja.produto(m, pid));
  const escolha = await perguntar({
    titulo: `Excluir “${p.nome}”?`,
    texto: 'Os meses anteriores continuam com os dados deste produto.',
    botoes: [
      { rotulo: `Só de ${nomeMes(mes)}`, valor: 'mes', estilo: 'perigo' },
      { rotulo: futuros.length ? `De ${nomeMes(mes)} e dos meses seguintes (${futuros.length})` : `De ${nomeMes(mes)} e dos próximos meses`, valor: 'futuros', estilo: 'perigo' },
      { rotulo: 'Cancelar', valor: null, estilo: 'fantasma' },
    ],
  });
  if (!escolha) return false;
  const desfazer = loja.excluirProduto(mes, pid, { futuros: escolha === 'futuros' });
  abertos.delete(pid);
  toast(`“${p.nome}” excluído.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
  return true;
}

export function editarProduto(pid, { aoSalvar = null } = {}) {
  const { loja } = app;
  const mes = app.mes;
  const p = loja.produto(mes, pid);
  if (!p) return;
  const seguintes = loja.meses().filter((m) => m > mes && loja.produto(m, pid));
  const inpNome = h('input', { class: 'entrada', value: p.nome, autocapitalize: 'sentences' });
  const selCat = campoCategoria(p.cat);
  const inpQtd = h('input', { class: 'entrada', inputmode: 'decimal', value: fmtQ(p.qtd), placeholder: 'Nenhuma' });
  const inpObs = h('textarea', { class: 'entrada', placeholder: 'Opcional' }, p.obs || '');
  const chkSeg = h('input', { type: 'checkbox', checked: true });
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const depoisDe = () => { if (aoSalvar) aoSalvar(); app.render(); };
  const salvar = async () => {
    const n = inpNome.value.trim();
    if (!n) { erro.textContent = 'O nome não pode ficar vazio.'; erro.hidden = false; return; }
    if (norm(n) !== norm(p.nome) && !(await checarDuplicado(n, selCat.value, pid))) return;
    loja.lote(() => {
      loja.editarProduto(mes, pid, { nome: n, cat: selCat.value, qtd: lerNumero(inpQtd.value), obs: inpObs.value.trim() });
      if (seguintes.length && chkSeg.checked && (n !== p.nome || selCat.value !== p.cat)) loja.aplicarNosSeguintes(mes, pid, { nome: n, cat: selCat.value });
    });
    f.fechar();
    depoisDe();
    toast('Produto atualizado.');
  };
  const excluir = async () => {
    if (!(await excluirComPergunta(pid, mes))) return;
    f.fechar();
    depoisDe();
  };
  const f = folha([
    h('h2', null, 'Editar produto'),
    h('p', { class: 'sub' }, `As mudanças valem para ${nomeMes(mes)}.`),
    h('div', { class: 'form' },
      h('label', null, 'Nome', inpNome),
      h('label', null, 'Categoria', selCat),
      h('label', null, 'Quantidade a comprar', inpQtd),
      h('label', null, 'Observação do produto', inpObs),
      seguintes.length ? h('label', { class: 'check' }, chkSeg, `Nome e categoria também em ${seguintes.map((m) => nomeMes(m)).join(', ')}`) : null,
      erro),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'),
      h('button', { class: 'btn prim', onclick: salvar }, 'Salvar')),
    h('div', { class: 'acoes' }, h('button', { class: 'btn perigo bloco', onclick: excluir }, '🗑 Excluir produto')),
  ]);
}

// Marcas aceitas do produto (valem em todos os meses): o mais barato, a compra e a rota só consideram essas
export function abrirMarcas(pid) {
  const { loja, mes } = app;
  const p = loja.produto(mes, pid);
  if (!p) return;
  const sel = new Map(loja.marcasAceitas(pid).map((x) => [norm(x), x]));
  const opcoes = new Map();
  for (const m of [...loja.marcasAceitas(pid), ...loja.marcasUsadas(pid), ...marcasComuns(p.nome)]) {
    const n = nomeDaMarca(m);
    if (n && !opcoes.has(norm(n))) opcoes.set(norm(n), n);
  }
  const chips = h('div', { class: 'chips-marcas' });
  const pintarChips = () => chips.replaceChildren(...[...opcoes].map(([n, nome]) => h('button', {
    class: 'chip', 'aria-pressed': String(sel.has(n)), onclick: () => { if (sel.has(n)) sel.delete(n); else sel.set(n, nome); pintarChips(); },
  }, sel.has(n) ? `✓ ${nome}` : nome)));
  const inp = h('input', { class: 'entrada', placeholder: 'Outra marca', autocapitalize: 'words', enterkeyhint: 'done', 'aria-label': 'Outra marca' });
  const incluir = () => {
    const v = nomeDaMarca(inp.value) || inp.value.trim();
    if (!v) return;
    opcoes.set(norm(v), v); sel.set(norm(v), v); inp.value = ''; pintarChips();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(); } });
  const salvar = (lista) => {
    loja.setMarcasAceitas(pid, lista);
    f.fechar();
    app.render();
    toast(lista.length ? `${p.nome}: só ${lista.join(', ')}.` : `${p.nome}: qualquer marca.`);
  };
  const f = folha([
    h('h2', null, `🏷️ Marcas · ${p.nome}`),
    h('p', { class: 'sub' }, 'Marque as marcas que vocês compram. O mais barato, a lista de compras e a rota passam a considerar só essas, em todos os meses. Sem nenhuma marcada, vale qualquer marca.'),
    chips,
    h('div', { class: 'linha-add' }, inp, h('button', { class: 'btn', onclick: incluir, 'aria-label': 'Incluir marca' }, '＋')),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn fantasma', onclick: () => salvar([]) }, 'Qualquer marca'),
      h('button', { class: 'btn prim', onclick: () => salvar([...sel.values()]) }, 'Salvar')),
  ]);
  pintarChips();
}

export function rolarParaProduto(pid) {
  abertos.add(pid);
  const card = document.querySelector(`.card[data-pid="${pid}"]`);
  if (card) { construir(card); card.scrollIntoView({ block: 'center' }); }
}

export const filtrosLista = filtros;
