// Aba "Mais": meses, mercados, categorias, Excel, cópias de segurança, sincronização e aparência.

import { app } from './ctx.js';
import { h, fmtRS, folha, perguntar, confirmar, pedirTexto, toast, baixar, escolherArquivo } from './ui.js';
import { norm, nomeMes, proximoMes, mesDeData, mesDe, lerExpr } from './modelo.js';
import { lerPlanilha, aplicarImportacao, exportarPlanilha } from './planilha.js';
import { banco } from './banco.js';
import { mostrarNovidades } from './novidades.js';
import { repetirQuantidades, novoProduto, editarProduto, excluirComPergunta } from './lista.js';
import { blocoNotas } from './notas.js';
import { trazerDieta } from './dieta.js';
import { secaoAssistente } from './assistente.js';

export function telaMais(topo, tela) {
  topo.append(h('div', { class: 'linha-topo' }, h('b', { style: { fontSize: '1.3rem' } }, '⚙️ Mais'), h('div', { class: 'espaco' }), app.seloSinc()));
  tela.append(secaoMeses(), secaoAssistente(), blocoNotas(), secaoMercados(), secaoCategorias(), secaoExcel(), secaoCopias(), secaoSinc(), secaoFeedback(), secaoAparencia(), secaoSobre());
}

// Lembra quais blocos "ver mais" estão abertos (a tela é redesenhada a cada mudança)
const abertosDet = new Set();
const detalhes = (id, resumo, ...conteudo) => {
  const d = h('details', { open: abertosDet.has(id) }, resumo, ...conteudo);
  d.addEventListener('toggle', () => (d.open ? abertosDet.add(id) : abertosDet.delete(id)));
  return d;
};

const linhaEd = (titulo, sub, botoes) => h('div', { class: 'item-ed' }, h('div', { class: 'tx' }, titulo, sub ? h('small', null, sub) : null), botoes);

// ---------- meses ----------
function secaoMeses() {
  const { loja } = app;
  const meses = loja.meses().slice().reverse();
  return h('div', { class: 'secao' },
    h('h3', null, '📅 Meses e listas'),
    h('p', { class: 'sub' }, 'Os preços pesquisados valem para todas as listas do mês; quantidades e compra são de cada lista. Os meses anteriores ficam guardados para o histórico.'),
    app.loja.meses().some((m) => m < mesDe(app.mes)) && mesDe(app.mes) === app.mes ? h('button', { class: 'btn bloco', style: { marginBottom: '8px' }, onclick: () => { app.irAba('precos'); repetirQuantidades(); } },
      `🔁 Repetir em ${loja.nomeLista(app.mes)} as quantidades do mês anterior`) : null,
    h('div', { class: 'grade2' },
      h('button', { class: 'btn prim', onclick: () => criarMes('copiar') }, '📋 Mês novo copiando'),
      h('button', { class: 'btn', onclick: () => criarMes('zero') }, '✨ Mês do zero')),
    h('div', { class: 'lista-ed', style: { marginTop: '10px' } }, meses.map((m) => {
      const o = loja.orcamentoMes(m);
      const sub = `${loja.produtos(m).length} produtos · ${fmtRS(o.planejado)}${o.valor ? ` de ${fmtRS(o.valor)}${o.estado === 'passou' ? ' ⚠️' : ''}` : ''}`;
      return h('div', { class: 'mes-bloco' },
        linhaEd(h('b', null, nomeMes(m)), sub, [
          h('button', { class: 'btn-ic', 'aria-label': `Valor para gastar em ${nomeMes(m)}`, onclick: () => app.abrirValor(m) }, '💳'),
          h('button', { class: 'btn-ic', 'aria-label': `Excluir ${nomeMes(m)}`, onclick: () => excluirMes(m) }, '🗑'),
        ]),
        loja.listas(m).map((id) => linhaEd(h('span', null, '🧾 ', loja.nomeLista(id), id === app.mes ? ' · aberta' : ''),
          `${loja.produtos(id).filter((p) => p.qtd).length} itens · ${fmtRS(loja.calcMes(id).totalGeral)}${loja.valorLista(id) ? ` · limite ${fmtRS(loja.valorLista(id))}` : ''}`, [
            id !== app.mes ? h('button', { class: 'btn pequeno', onclick: () => { app.irMes(id); app.irAba('precos'); } }, 'Abrir') : null,
            h('button', { class: 'btn-ic', 'aria-label': `Limite de ${loja.nomeLista(id)}`, onclick: () => app.abrirValor(id, { lista: true }) }, '🎯'),
            h('button', { class: 'btn-ic', 'aria-label': `Renomear ${loja.nomeLista(id)}`, onclick: () => renomearLista(id) }, '✎'),
            id !== m ? h('button', { class: 'btn-ic', 'aria-label': `Excluir ${loja.nomeLista(id)}`, onclick: () => excluirLista(id) }, '🗑') : null,
          ])),
        h('button', { class: 'btn pequeno fantasma', onclick: () => novaLista(m) }, `＋ Nova lista em ${nomeMes(m).split(' ')[0]}`));
    })));
}

const validarNomeLista = (mes, exceto) => (v) => (app.loja.listas(mes).some((id) => id !== exceto && norm(app.loja.nomeLista(id)) === norm(v)) ? 'Já existe uma lista com esse nome neste mês.' : null);

// Nova lista no mês: do zero, copiando as quantidades de outra lista, ou só com o que faltou comprar
export function novaLista(mes = mesDe(app.mes)) {
  const { loja } = app;
  const listas = loja.listas(mes);
  const inpNome = h('input', { class: 'entrada', value: loja.proximoNomeLista(mes), autocapitalize: 'sentences' });
  const selDe = h('select', { class: 'entrada' }, listas.map((id) => h('option', { value: id, selected: id === app.mes }, loja.nomeLista(id))));
  const inpLimite = h('input', { class: 'entrada num', inputmode: 'decimal', placeholder: 'Opcional' });
  let modo = 'zero';
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const opcao = (id, ic, titulo, sub) => h('button', { class: 'opcao', dataset: { modo: id }, onclick: () => { modo = id; pintar(); } },
    h('span', { class: 'ic' }, ic), h('span', { class: 'tx' }, h('b', null, titulo), h('small', null, sub)));
  const escolhas = h('div', { class: 'opcoes' },
    opcao('zero', '✨', 'Do zero', 'Sem quantidades; você escolhe o que comprar'),
    opcao('copiar', '📋', 'Copiar quantidades', 'Mesmas quantidades de outra lista'),
    opcao('faltou', '🧺', 'Com o que faltou', 'Só o que não foi marcado como comprado'),
    h('button', { class: 'opcao', onclick: () => { f.fechar(); setTimeout(() => trazerDieta(mes), 60); } },
      h('span', { class: 'ic' }, '🥗'), h('span', { class: 'tx' }, h('b', null, 'Da dieta'), h('small', null, 'O que o app Plano da Família usa no período, já em embalagens'))));
  const blocoDe = h('label', null, 'De qual lista', selDe);
  function pintar() {
    for (const b of escolhas.children) b.classList.toggle('atual', b.dataset.modo === modo);
    blocoDe.hidden = modo === 'zero';
  }
  const criar = () => {
    const nome = inpNome.value.trim();
    const msg = !nome ? 'Dê um nome para a lista.' : validarNomeLista(mes)(nome);
    if (msg) { erro.textContent = msg; erro.hidden = false; return; }
    const limite = lerExpr(inpLimite.value) || null;
    const id = loja.criarLista(mes, { nome, de: modo === 'zero' ? null : selDe.value, modo, orcamento: limite });
    f.fechar();
    app.irMes(id);
    app.irAba('precos');
    const n = loja.produtos(id).filter((p) => p.qtd).length;
    toast(modo === 'zero' ? `${nome} criada. Coloque as quantidades do que vai comprar.` : `${nome} criada com ${n} ${n === 1 ? 'item' : 'itens'}.`);
  };
  const f = folha([
    h('h2', null, `Nova lista · ${nomeMes(mes)}`),
    h('p', { class: 'sub' }, 'Usa os mesmos produtos e preços do mês. Quantidades, marcações e compra ficam separadas.'),
    h('div', { class: 'form' }, h('label', null, 'Nome', inpNome), escolhas, blocoDe, h('label', null, 'Limite só desta lista (R$)', inpLimite), erro),
    h('div', { class: 'acoes lado' }, h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'), h('button', { class: 'btn prim', onclick: criar }, 'Criar lista')),
  ]);
  pintar();
}

async function renomearLista(id) {
  const { loja } = app;
  const nome = await pedirTexto({ titulo: 'Renomear lista', rotulo: 'Nome', valor: loja.nomeLista(id), validar: validarNomeLista(mesDe(id), id) });
  if (!nome) return;
  loja.renomearLista(id, nome);
  app.render();
}

async function excluirLista(id) {
  const { loja } = app;
  const nome = loja.nomeLista(id);
  if (!(await confirmar(`Excluir ${nome}?`, 'Apaga as quantidades e a compra desta lista. Os produtos e os preços do mês continuam. Uma cópia de segurança é feita antes.', 'Excluir lista', 'perigo'))) return;
  await app.copiaSeguranca(`Antes de excluir a lista ${nome}`);
  const desfazer = loja.excluirLista(id);
  if (app.mes === id) app.irMes(mesDe(id));
  app.render();
  toast(`${nome} excluída.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
}

export function criarMes(modoInicial = 'copiar') {
  const { loja } = app;
  const meses = loja.meses();
  const ultimo = meses[meses.length - 1] || mesDeData();
  const opcoes = [];
  let m = meses.length ? proximoMes(ultimo) : mesDeData();
  for (let i = 0; i < 12; i++) { opcoes.push(m); m = proximoMes(m); }
  const faltando = [];
  if (meses.length) for (let x = meses[0]; x < ultimo; x = proximoMes(x)) if (!meses.includes(x)) faltando.push(x);
  let modo = meses.length ? modoInicial : 'zero';
  const selNovo = h('select', { class: 'entrada' }, [...opcoes, ...faltando].map((x) => h('option', { value: x }, nomeMes(x))));
  const selDe = h('select', { class: 'entrada' }, meses.slice().reverse().map((x) => h('option', { value: x }, `${nomeMes(x)} (${loja.produtos(x).length} produtos)`)));
  const chkMarca = h('input', { type: 'checkbox', checked: true });
  const chkQtd = h('input', { type: 'checkbox' });
  const blocoCopia = h('div', { class: 'form' },
    h('label', null, 'Copiar a lista de', selDe),
    h('label', { class: 'check' }, chkMarca, 'Trazer marca/tamanho de cada mercado'),
    h('label', { class: 'check' }, chkQtd, 'Trazer também as quantidades'),
    h('p', { class: 'sub', style: { margin: 0 } }, 'Preços e observações começam em branco.'));
  const blocoZero = h('p', { class: 'sub', style: { margin: 0 } }, 'O mês começa sem nenhum produto. Os mercados e as categorias continuam os mesmos. Inclua os produtos pelo botão ＋.');
  const opcao = (id, ic, titulo, sub) => h('button', { class: 'opcao', dataset: { modo: id }, onclick: () => { modo = id; pintar(); } },
    h('span', { class: 'ic' }, ic), h('span', { class: 'tx' }, h('b', null, titulo), h('small', null, sub)));
  const escolhas = h('div', { class: 'opcoes' },
    meses.length ? opcao('copiar', '📋', 'Copiar um mês', 'Mesmos produtos, preços em branco') : null,
    opcao('zero', '✨', 'Começar do zero', 'Lista vazia'));
  const btnCriar = h('button', { class: 'btn prim' }, 'Criar mês');
  function pintar() {
    for (const b of escolhas.children) b.classList.toggle('atual', b.dataset.modo === modo);
    blocoCopia.hidden = modo !== 'copiar';
    blocoZero.hidden = modo !== 'zero';
  }
  btnCriar.addEventListener('click', () => {
    const novo = selNovo.value;
    loja.criarMes(novo, modo === 'copiar' ? { de: selDe.value, copiarMarca: chkMarca.checked, copiarQtd: chkQtd.checked } : {});
    f.fechar();
    app.irMes(novo);
    app.irAba('precos');
    const n = loja.produtos(novo).length;
    toast(modo === 'copiar' ? `${nomeMes(novo)} criado com ${n} produtos. Preços em branco.` : `${nomeMes(novo)} criado, vazio. Toque em ＋ para incluir produtos.`);
  });
  const f = folha([
    h('h2', null, 'Criar novo mês'),
    h('div', { class: 'form' }, h('label', null, 'Mês novo', selNovo), escolhas, blocoCopia, blocoZero),
    h('div', { class: 'acoes lado' }, h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'), btnCriar),
  ]);
  pintar();
}

async function excluirMes(m) {
  const { loja } = app;
  if (!(await confirmar(`Excluir ${nomeMes(m)}?`, `Apaga a lista e os preços de ${nomeMes(m)}. Uma cópia de segurança é feita antes.`, 'Excluir mês', 'perigo'))) return;
  await app.copiaSeguranca(`Antes de excluir ${nomeMes(m)}`);
  const desfazer = loja.excluirMes(m);
  if (mesDe(app.mes) === m) { const r = loja.meses(); app.irMes(r[r.length - 1] || null); }
  app.render();
  toast(`${nomeMes(m)} excluído.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
}

// ---------- mercados ----------
function secaoMercados() {
  const { loja } = app;
  const ativos = loja.mercados();
  const arquivados = loja.mercados({ todos: true }).filter((m) => m.arquivado);
  const mover = (i, d) => { const ids = ativos.map((m) => m.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; loja.reordenar('m', ids); app.render(); };
  return h('div', { class: 'secao' },
    h('h3', null, '🏪 Mercados'),
    h('p', { class: 'sub' }, 'A ordem aqui é a ordem em que aparecem nos produtos. Só os mercados ativos entram na comparação e nos totais.'),
    h('div', { class: 'lista-ed' }, ativos.map((m, i) => linhaEd(m.nome, null, [
      h('button', { class: 'btn-ic', 'aria-label': 'Subir', disabled: i === 0, onclick: () => mover(i, -1) }, '↑'),
      h('button', { class: 'btn-ic', 'aria-label': 'Descer', disabled: i === ativos.length - 1, onclick: () => mover(i, 1) }, '↓'),
      h('button', { class: 'btn-ic', 'aria-label': `Renomear ${m.nome}`, onclick: () => renomearMercado(m) }, '✎'),
      h('button', { class: 'btn-ic', 'aria-label': `Excluir ${m.nome}`, onclick: () => excluirMercado(m) }, '🗑'),
    ]))),
    h('button', { class: 'btn bloco', style: { marginTop: '10px' }, onclick: novoMercado }, '＋ Novo mercado'),
    arquivados.length ? detalhes('arq', h('summary', { style: { color: 'var(--suave)', minHeight: '40px', cursor: 'pointer' } }, `Arquivados (${arquivados.length})`),
      h('div', { class: 'lista-ed', style: { marginTop: '6px' } }, arquivados.map((m) => linhaEd(m.nome, 'Fora das telas e dos cálculos; o histórico está guardado.', [
        h('button', { class: 'btn pequeno', onclick: () => { loja.arquivarMercado(m.id, false); app.render(); toast(`${m.nome} voltou para a comparação.`); } }, 'Reativar'),
        h('button', { class: 'btn-ic', 'aria-label': `Apagar ${m.nome} de vez`, onclick: () => apagarMercado(m) }, '🗑'),
      ])))) : null);
}

const validarNomeMercado = (exceto) => (v) => (app.loja.mercados({ todos: true }).some((m) => m.id !== exceto && norm(m.nome) === norm(v)) ? 'Já existe um mercado com esse nome.' : null);

async function novoMercado() {
  const nome = await pedirTexto({ titulo: 'Novo mercado', rotulo: 'Nome', dica: 'Ex.: Extra', botao: 'Incluir', validar: validarNomeMercado() });
  if (!nome) return;
  app.loja.addMercado(nome);
  app.render();
  toast(`${nome} incluído. Ele já aparece em todos os produtos, com os campos em branco.`);
}

async function renomearMercado(m) {
  const nome = await pedirTexto({ titulo: 'Renomear mercado', rotulo: 'Nome', valor: m.nome, validar: validarNomeMercado(m.id) });
  if (!nome || nome === m.nome) return;
  app.loja.renomearMercado(m.id, nome);
  app.render();
}

async function excluirMercado(m) {
  const escolha = await perguntar({
    titulo: `Excluir ${m.nome}?`,
    texto: 'Arquivar tira o mercado das telas e dos cálculos, mas guarda os preços para o histórico (dá para reativar). Apagar de vez remove todos os preços dele, em todos os meses.',
    botoes: [
      { rotulo: '📦 Arquivar (recomendado)', valor: 'arquivar', estilo: 'prim' },
      { rotulo: 'Apagar de vez', valor: 'apagar', estilo: 'perigo' },
      { rotulo: 'Cancelar', valor: null, estilo: 'fantasma' },
    ],
  });
  if (escolha === 'arquivar') {
    app.loja.arquivarMercado(m.id, true);
    app.render();
    toast(`${m.nome} arquivado. Os totais já foram recalculados sem ele.`, { acao: { rotulo: 'Desfazer', fn: () => { app.loja.arquivarMercado(m.id, false); app.render(); } } });
  } else if (escolha === 'apagar') await apagarMercado(m);
}

async function apagarMercado(m) {
  if (!(await confirmar(`Apagar ${m.nome} de vez?`, 'Todos os preços dele, em todos os meses, serão apagados. Uma cópia de segurança é feita antes.', 'Apagar de vez', 'perigo'))) return;
  await app.copiaSeguranca(`Antes de apagar o mercado ${m.nome}`);
  const desfazer = app.loja.apagarMercado(m.id);
  app.render();
  toast(`${m.nome} apagado.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
}

// ---------- categorias ----------
function secaoCategorias() {
  const { loja } = app;
  const cats = loja.categorias();
  const mover = (i, d) => { const ids = cats.map((c) => c.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; loja.reordenar('c', ids); app.render(); };
  return h('div', { class: 'secao' },
    h('h3', null, '🗂️ Categorias e produtos'),
    h('p', { class: 'sub' }, 'Toque numa categoria para ver, editar, mover ou excluir os produtos dela. A ordem aqui é a ordem das faixas azuis.'),
    detalhes('cats', h('summary', { style: { minHeight: '44px', cursor: 'pointer', color: 'var(--petroleo)', fontWeight: 650 } }, `Ver e editar as ${cats.length} categorias`),
      h('div', { class: 'lista-ed', style: { marginTop: '6px' } }, cats.map((c, i) => h('div', { class: 'item-ed' },
        h('button', { class: 'tx tx-botao', 'aria-label': `Produtos de ${c.nome}`, onclick: () => produtosDaCategoria(c.id) },
          h('b', null, c.nome), h('small', null, `${loja.produtos(app.mes).filter((p) => p.cat === c.id).length} produtos em ${nomeMes(app.mes)} · ver ›`)), [
        h('button', { class: 'btn-ic', 'aria-label': 'Subir', disabled: i === 0, onclick: () => mover(i, -1) }, '↑'),
        h('button', { class: 'btn-ic', 'aria-label': 'Descer', disabled: i === cats.length - 1, onclick: () => mover(i, 1) }, '↓'),
        h('button', { class: 'btn-ic', 'aria-label': `Renomear ${c.nome}`, onclick: () => renomearCategoria(c) }, '✎'),
        h('button', { class: 'btn-ic', 'aria-label': `Excluir ${c.nome}`, onclick: () => excluirCategoria(c) }, '🗑'),
      ]))),
      h('button', { class: 'btn bloco', style: { marginTop: '10px' }, onclick: novaCategoria }, '＋ Nova categoria')));
}

const validarNomeCat = (exceto) => (v) => (app.loja.categorias().some((c) => c.id !== exceto && norm(c.nome) === norm(v)) ? 'Já existe uma categoria com esse nome.' : null);

async function novaCategoria() {
  const nome = await pedirTexto({ titulo: 'Nova categoria', rotulo: 'Nome', dica: 'Ex.: Bebê', botao: 'Incluir', validar: validarNomeCat() });
  if (!nome) return;
  app.loja.addCategoria(nome);
  app.render();
}

// Produtos de uma categoria (no mês aberto): editar, excluir, incluir e mover vários de uma vez
export function produtosDaCategoria(cid) {
  const { loja } = app;
  const mes = app.mes;
  let termo = '', selecionando = false;
  const marcados = new Set();
  const titulo = h('h2');
  const sub = h('p', { class: 'sub' });
  const lista = h('div', { class: 'lista-ed' });
  const barra = h('div', { class: 'barra-sel', hidden: true });
  const busca = h('input', { class: 'entrada', type: 'search', placeholder: 'Buscar nesta categoria', oninput: (e) => { termo = e.target.value; pintar(); } });
  const btnSel = h('button', { class: 'btn', onclick: () => { selecionando = !selecionando; marcados.clear(); pintar(); } });
  const pintar = () => {
    const cat = loja.categorias().find((c) => c.id === cid);
    if (!cat) { f.fechar(); return; }
    const todos = loja.ordenar(loja.produtos(mes).filter((p) => p.cat === cid), mes);
    const t = norm(termo);
    const vis = todos.filter((p) => !t || norm(p.nome).includes(t));
    titulo.textContent = `🗂️ ${cat.nome}`;
    sub.textContent = `${todos.length} ${todos.length === 1 ? 'produto' : 'produtos'} em ${nomeMes(mes)}${selecionando ? ' · toque para marcar' : ''}`;
    btnSel.textContent = selecionando ? '✕ Parar de selecionar' : '☑ Selecionar vários';
    lista.replaceChildren(...(vis.length ? vis.map((p) => {
      const c = loja.calcProduto(mes, p.id);
      const info = [p.qtd ? `${String(p.qtd).replace('.', ',')}× para comprar` : 'sem quantidade', c.marcaMenor || c.linhas.find((l) => l.marca)?.marca, c.menor !== null ? `menor ${fmtRS(c.menor)}` : null].filter(Boolean).join(' · ');
      if (selecionando) {
        const chk = h('input', { type: 'checkbox', checked: marcados.has(p.id), 'aria-label': p.nome, onchange: (e) => { if (e.target.checked) marcados.add(p.id); else marcados.delete(p.id); pintarBarra(); } });
        return h('label', { class: 'item-ed sel' }, chk, h('div', { class: 'tx' }, p.nome, h('small', null, info)));
      }
      return linhaEd(p.nome, info, [
        h('button', { class: 'btn-ic', 'aria-label': `Editar ${p.nome}`, onclick: () => editarProduto(p.id, { aoSalvar: pintar }) }, '✎'),
        h('button', { class: 'btn-ic', 'aria-label': `Excluir ${p.nome}`, onclick: async () => { if (await excluirComPergunta(p.id, mes)) { pintar(); app.render(); } } }, '🗑'),
      ]);
    }) : [h('p', { class: 'sub' }, todos.length ? 'Nenhum produto com esse nome.' : 'Categoria vazia.')]));
    pintarBarra();
  };
  const selDestino = h('select', { class: 'entrada' });
  const chkSeg = h('input', { type: 'checkbox', checked: true });
  const pintarBarra = () => {
    barra.hidden = !selecionando;
    if (!selecionando) return;
    const seguintes = loja.meses().filter((m) => m > mes);
    selDestino.replaceChildren(...loja.categorias().filter((c) => c.id !== cid).map((c) => h('option', { value: c.id }, c.nome)));
    barra.replaceChildren(
      h('b', null, `${marcados.size} ${marcados.size === 1 ? 'selecionado' : 'selecionados'}`),
      h('label', null, 'Mover para', selDestino),
      seguintes.length ? h('label', { class: 'check' }, chkSeg, 'Também nos meses seguintes') : null,
      h('div', { class: 'grade2' },
        h('button', { class: 'btn prim', disabled: !marcados.size, onclick: () => {
          const destino = loja.categorias().find((c) => c.id === selDestino.value);
          const n = marcados.size;
          const desfazer = loja.moverProdutos(mes, [...marcados], selDestino.value, { futuros: seguintes.length > 0 && chkSeg.checked });
          marcados.clear(); selecionando = false; pintar(); app.render();
          toast(`${n} ${n === 1 ? 'produto movido' : 'produtos movidos'} para ${destino?.nome}.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); pintar(); app.render(); } } });
        } }, '↪ Mover'),
        h('button', { class: 'btn perigo', disabled: !marcados.size, onclick: async () => {
          const n = marcados.size;
          const escolha = await perguntar({
            titulo: `Excluir ${n} ${n === 1 ? 'produto' : 'produtos'}?`,
            texto: 'Os meses anteriores continuam com os dados.',
            botoes: [{ rotulo: `Só de ${nomeMes(mes)}`, valor: 'mes', estilo: 'perigo' }, { rotulo: `De ${nomeMes(mes)} e dos meses seguintes`, valor: 'futuros', estilo: 'perigo' }, { rotulo: 'Cancelar', valor: null, estilo: 'fantasma' }],
          });
          if (!escolha) return;
          const ids = [...marcados];
          const desfazer = loja.lote(() => ids.forEach((pid) => loja.excluirProduto(mes, pid, { futuros: escolha === 'futuros' })));
          marcados.clear(); selecionando = false; pintar(); app.render();
          toast(`${n} ${n === 1 ? 'produto excluído' : 'produtos excluídos'}.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); pintar(); app.render(); } } });
        } }, '🗑 Excluir')));
  };
  const f = folha([
    titulo, sub,
    h('div', { class: 'grade2', style: { marginBottom: '10px' } },
      h('button', { class: 'btn prim', onclick: () => novoProduto({ cat: cid, aoSalvar: () => { pintar(); app.render(); } }) }, '＋ Novo produto'),
      btnSel),
    busca, h('div', { style: { height: '8px' } }), lista, barra,
  ]);
  pintar();
}

async function renomearCategoria(c) {
  const nome = await pedirTexto({ titulo: 'Renomear categoria', rotulo: 'Nome', valor: c.nome, validar: validarNomeCat(c.id) });
  if (!nome || nome === c.nome) return;
  app.loja.renomearCategoria(c.id, nome);
  app.render();
}

async function excluirCategoria(c) {
  const { loja } = app;
  const uso = loja.usoCategoria(c.id);
  if (!uso) {
    if (!(await confirmar(`Excluir “${c.nome}”?`, 'A categoria está vazia.', 'Excluir', 'perigo'))) return;
    loja.excluirCategoria(c.id);
    app.render();
    return;
  }
  const outras = loja.categorias().filter((x) => x.id !== c.id);
  const sel = h('select', { class: 'entrada' }, outras.map((x) => h('option', { value: x.id }, x.nome)));
  const destino = await perguntar({
    titulo: `Excluir “${c.nome}”?`,
    texto: `Ela tem ${uso} ${uso === 1 ? 'produto' : 'produtos'} (somando todos os meses). Para excluir, escolha para onde eles vão:`,
    extra: h('div', { class: 'form' }, h('label', null, 'Mover os produtos para', sel)),
    botoes: [{ rotulo: 'Mover e excluir', valor: 'ok', estilo: 'perigo' }, { rotulo: 'Cancelar', valor: null, estilo: 'fantasma' }],
  });
  if (!destino) return;
  const desfazer = loja.excluirCategoria(c.id, sel.value);
  app.render();
  toast(`Produtos movidos e “${c.nome}” excluída.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
}

// ---------- Excel ----------
function secaoExcel() {
  return h('div', { class: 'secao' },
    h('h3', null, '📊 Excel'),
    h('p', { class: 'sub' }, 'Mesmo formato da sua planilha: uma aba por mês, cores, fórmulas e totais.'),
    h('div', { class: 'grade2' },
      h('button', { class: 'btn', onclick: importarExcel }, '📥 Importar .xlsx'),
      h('button', { class: 'btn', onclick: exportarExcel }, '📤 Exportar .xlsx')));
}

export async function importarExcel() {
  const arq = await escolherArquivo('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!arq) return;
  let meses;
  try { meses = await lerPlanilha(await arq.arrayBuffer()); }
  catch (e) { toast(e.message || 'Não consegui ler a planilha.'); return; }
  const anoAtual = new Date().getFullYear();
  const selAno = h('select', { class: 'entrada' }, [anoAtual - 1, anoAtual, anoAtual + 1].map((a) => h('option', { value: a, selected: a === anoAtual }, String(a))));
  const existentes = new Set(app.loja.meses());
  const lista = h('div', { class: 'lista-ed' });
  const pintarLista = () => lista.replaceChildren(...meses.map((m) => {
    const id = m.id?.replace(/^\d{4}/, (a) => (/\d{4}/.test(m.aba) ? a : selAno.value));
    const comPreco = m.itens.filter((i) => Object.values(i.precos).some((p) => p.preco !== null)).length;
    return linhaEd(h('b', null, m.aba, id ? ` → ${nomeMes(id)}` : ''), `${m.itens.length} produtos · ${comPreco} com preço · ${m.mercados.length} mercados${id && existentes.has(id) ? ' · substitui o mês atual' : ''}`, id ? null : h('span', { class: 'dir' }, 'ignorada'));
  }));
  selAno.addEventListener('change', pintarLista);
  pintarLista();
  const ok = await perguntar({
    titulo: 'Importar planilha',
    texto: `${arq.name}: encontrei ${meses.length} ${meses.length === 1 ? 'mês' : 'meses'}. Meses que já existem no app serão substituídos pelos da planilha (é feita uma cópia de segurança antes).`,
    extra: h('div', { class: 'form' }, h('label', null, 'Ano das abas sem ano no nome', selAno), lista),
    botoes: [{ rotulo: 'Importar', valor: true, estilo: 'prim' }, { rotulo: 'Cancelar', valor: false, estilo: 'fantasma' }],
  });
  if (!ok) return;
  for (const m of meses) if (m.id && !/\d{4}/.test(m.aba)) m.id = m.id.replace(/^\d{4}/, selAno.value);
  if (app.loja.meses().length) await app.copiaSeguranca('Antes de importar planilha');
  const r = aplicarImportacao(app.loja, meses);
  const ms = app.loja.meses();
  const hoje = mesDeData();
  app.irMes(ms.includes(hoje) ? hoje : ms[ms.length - 1]);
  app.irAba('precos');
  toast(`Importado: ${r.meses} meses, ${r.produtos} produtos, ${r.precos} preços.`);
}

export async function exportarExcel() {
  const { loja } = app;
  const meses = loja.meses();
  if (!meses.length) return;
  const escolha = await perguntar({
    titulo: 'Exportar para Excel',
    texto: 'Gera um .xlsx no formato da sua planilha. Só os mercados ativos entram (os arquivados ficam de fora).',
    botoes: [{ rotulo: `Todos os meses (${meses.length})`, valor: 'todos', estilo: 'prim' }, { rotulo: `Só ${nomeMes(app.mes)}`, valor: 'um' }, { rotulo: 'Cancelar', valor: null, estilo: 'fantasma' }],
  });
  if (!escolha) return;
  const blob = await exportarPlanilha(loja, escolha === 'todos' ? meses : [mesDe(app.mes)]);
  baixar(blob, `Mercado-${escolha === 'todos' ? 'todos-os-meses' : mesDe(app.mes)}.xlsx`);
  app.prefs.ultimaCopiaFora = Date.now(); app.salvarPrefs();
  toast('Planilha gerada. Veja em Downloads.');
}

// ---------- cópias de segurança ----------
function secaoCopias() {
  const lista = h('div', { class: 'lista-ed' }, h('p', { class: 'sub' }, 'Carregando…'));
  banco.copias().then((cs) => {
    lista.replaceChildren(...(cs.length ? cs.slice(0, 12).map((c) => linhaEd(
      h('b', null, new Date(c.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })), c.motivo,
      [h('button', { class: 'btn pequeno', onclick: () => restaurarCopia(c) }, 'Restaurar'),
        h('button', { class: 'btn-ic', 'aria-label': 'Baixar esta cópia', onclick: async () => { const x = await banco.copia(c.id); baixarJson(x.recs, x.quando); } }, '⤓')])) :
      [h('p', { class: 'sub' }, 'Nenhuma cópia ainda.')]));
  });
  return h('div', { class: 'secao' },
    h('h3', null, '🛟 Cópias de segurança'),
    h('p', { class: 'sub' }, 'Automáticas: uma por dia e antes de importar, restaurar ou apagar algo. Ficam neste celular — baixe uma de vez em quando para guardar fora dele.'),
    h('div', { class: 'grade2', style: { marginBottom: '10px' } },
      h('button', { class: 'btn', onclick: async () => { await app.copiaSeguranca('Feita por você', false); app.render(); toast('Cópia feita.'); } }, '💾 Fazer agora'),
      h('button', { class: 'btn', onclick: () => baixarJson(app.loja.todos(), Date.now()) }, '⤓ Baixar (.json)')),
    lista,
    h('button', { class: 'btn fantasma bloco', style: { marginTop: '8px' }, onclick: restaurarArquivo }, '📂 Restaurar de um arquivo .json'));
}

function baixarJson(recs, quando) {
  app.prefs.ultimaCopiaFora = Date.now(); app.salvarPrefs();
  const d = new Date(quando);
  const nome = `cesta-copia-${d.toISOString().slice(0, 16).replace(/[T:]/g, '-')}.json`;
  baixar(new Blob([JSON.stringify({ app: 'cesta', versao: 1, quando, recs })], { type: 'application/json' }), nome);
}

async function restaurarCopia(c) {
  const quando = new Date(c.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  if (!(await confirmar('Restaurar esta cópia?', `Tudo volta a ser como estava em ${quando}. Antes, é feita uma cópia do estado atual (dá para voltar).`, 'Restaurar'))) return;
  const x = await banco.copia(c.id);
  await restaurar(x.recs);
}

async function restaurarArquivo() {
  const arq = await escolherArquivo('.json,application/json');
  if (!arq) return;
  try {
    const dados = JSON.parse(await arq.text());
    if (dados.app !== 'cesta' || !Array.isArray(dados.recs)) throw new Error();
    if (!(await confirmar('Restaurar do arquivo?', `Cópia de ${new Date(dados.quando).toLocaleString('pt-BR')}. Antes, é feita uma cópia do estado atual.`, 'Restaurar'))) return;
    await restaurar(dados.recs);
  } catch { toast('Esse arquivo não é uma cópia de segurança do app.'); }
}

async function restaurar(recs) {
  await app.copiaSeguranca('Antes de restaurar uma cópia');
  app.loja.restaurar(recs);
  const ms = app.loja.meses();
  app.irMes(app.loja.existeLista(app.mes) ? app.mes : ms[ms.length - 1] || null);
  app.render();
  toast('Cópia restaurada.');
}

// ---------- sincronização ----------
const ESTADOS = {
  desligada: 'Desligada — os dados ficam só neste celular.', ok: 'Ligada. Tudo sincronizado.', sincronizando: 'Sincronizando…',
  offline: 'Sem internet. As mudanças são enviadas quando a conexão voltar.', senha: 'A senha da família mudou ou está errada.',
  indisponivel: 'O servidor de sincronização não está disponível neste endereço.', erro: 'Erro ao sincronizar. Tentando de novo…',
};

function secaoSinc() {
  const { sinc } = app;
  const st = sinc.s;
  const quando = st.ultima ? new Date(st.ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  return h('div', { class: 'secao' },
    h('h3', null, '☁️ Sincronizar celulares'),
    h('p', { class: 'sub' }, 'Use a mesma lista em mais de um celular da família. Funciona offline: sincroniza quando a internet voltar. Também serve como cópia de segurança na nuvem.'),
    h('div', { class: st.estado === 'ok' ? 'aviso' : st.estado === 'desligada' ? '' : 'aviso erro', style: st.estado === 'ok' ? { background: 'var(--verde-bg)', borderColor: 'var(--verde-borda)', color: 'var(--verde)' } : {} },
      ESTADOS[st.estado] || st.estado, quando ? ` Última: ${quando}.` : '', st.pendentes.size && st.token ? ` (${st.pendentes.size} mudanças a enviar)` : ''),
    h('div', { class: 'grade2', style: { marginTop: '10px' } },
      st.token ? [
        h('button', { class: 'btn', onclick: () => { sinc.sincronizar().then(() => app.render()); } }, '🔄 Sincronizar'),
        h('button', { class: 'btn fantasma', onclick: async () => { if (await confirmar('Desligar a sincronização?', 'Os dados continuam neste celular. Para religar, é só digitar a senha da família de novo.', 'Desligar')) { await sinc.desligar(); app.render(); } } }, 'Desligar'),
        st.estado === 'senha' ? h('button', { class: 'btn prim', style: { gridColumn: '1 / -1' }, onclick: ligarSinc }, 'Digitar a senha de novo') : null,
      ] : h('button', { class: 'btn prim', style: { gridColumn: '1 / -1' }, onclick: ligarSinc }, 'Ligar sincronização')));
}

export async function ligarSinc() {
  const { sinc, loja } = app;
  let info;
  try { info = await sinc.consultar(); }
  catch (e) {
    toast(e.codigo === 'indisponivel' ? 'A sincronização só funciona com o app publicado no Cloudflare.' : 'Sem conexão com o servidor. Tente com internet.');
    return;
  }
  const criar = !info.configurado;
  const senha = await pedirTexto({
    titulo: criar ? 'Criar a senha da família' : 'Senha da família',
    rotulo: criar ? 'Crie uma senha (no outro celular você digita a mesma)' : 'Digite a senha criada no primeiro celular',
    dica: 'Ex.: uma frase que vocês lembrem', botao: criar ? 'Criar e ligar' : 'Entrar',
    validar: (v) => (v.length < 6 ? 'Use pelo menos 6 caracteres.' : null),
  });
  if (!senha) return;
  const temLocal = loja.meses().length > 0;
  if (!criar && info.registros > 0 && temLocal) {
    const escolha = await perguntar({
      titulo: 'Já há uma lista na nuvem',
      texto: 'Este celular também tem uma lista. Se as duas foram feitas separadas, juntar pode duplicar mercados e produtos.',
      botoes: [
        { rotulo: 'Usar a lista da nuvem (recomendado)', valor: 'nuvem', estilo: 'prim' },
        { rotulo: 'Juntar as duas', valor: 'juntar' },
        { rotulo: 'Cancelar', valor: null, estilo: 'fantasma' },
      ],
    });
    if (!escolha) return;
    if (escolha === 'nuvem') {
      await app.copiaSeguranca('Antes de trocar pela lista da nuvem');
      await app.zerarLocal();
    }
  }
  try {
    await sinc.ligar(senha, { criar });
    const ms = loja.meses();
    if (!loja.existeLista(app.mes)) app.irMes(ms.includes(mesDeData()) ? mesDeData() : ms[ms.length - 1] || null);
    app.render();
    toast(criar ? 'Senha criada. No outro celular, digite a mesma senha.' : 'Sincronização ligada!');
  } catch (e) {
    toast(e.codigo === 'senha' ? 'Senha incorreta.' : e.message || 'Não deu certo. Tente de novo.');
  }
}

// ---------- feedback (ideias e problemas da família) ----------
const TIPOS_FB = { problema: '🐞 Problema', ideia: '💡 Ideia', elogio: '❤️ Elogio' };
const STATUS_FB = { novo: 'Novo', andamento: 'Em andamento', resolvido: 'Resolvido' };
const TELAS = { precos: 'Preços', compra: 'Compra', historico: 'Histórico', mais: 'Mais' };

function secaoFeedback() {
  const fbs = app.loja.feedbacks();
  const abertos = fbs.filter((f) => f.status !== 'resolvido');
  return h('div', { class: 'secao' },
    h('h3', null, '💬 Ideias e problemas'),
    h('p', { class: 'sub' }, 'Achou algo estranho ou teve uma ideia? Conte aqui. Fica salvo (e sincroniza com o outro celular) para ser corrigido nas próximas versões.'),
    h('button', { class: 'btn prim bloco', onclick: enviarFeedback }, '💬 Enviar ideia ou problema'),
    fbs.length ? h('div', { class: 'lista-ed', style: { marginTop: '10px' } }, fbs.map((f) => h('button', { class: 'item-ed fb-item', onclick: () => tratarFeedback(f) },
      h('div', { class: 'tx' }, h('b', null, TIPOS_FB[f.tipo] || f.tipo, ' · ', h('span', { class: `fb-status ${f.status}` }, STATUS_FB[f.status] || f.status)),
        h('small', null, f.texto.length > 90 ? `${f.texto.slice(0, 90)}…` : f.texto),
        f.resposta ? h('small', { class: 'fb-resposta' }, `↳ ${f.resposta}`) : null,
        h('small', null, `${new Date(f.quando).toLocaleDateString('pt-BR')} · versão ${f.versao}${f.tela ? ` · ${TELAS[f.tela] || f.tela}` : ''}`))))) : null,
    abertos.length ? h('button', { class: 'btn fantasma bloco', style: { marginTop: '8px' }, onclick: () => copiarParaClaude(abertos) }, `📋 Copiar os ${abertos.length} abertos para o Claude`) : null);
}

function enviarFeedback() {
  let tipo = 'problema';
  const chips = h('div', { class: 'filtros', style: { flexWrap: 'wrap', paddingTop: 0 } });
  const pintar = () => chips.replaceChildren(...Object.entries(TIPOS_FB).map(([id, rot]) => h('button', { class: 'chip', 'aria-pressed': String(tipo === id), onclick: () => { tipo = id; pintar(); } }, rot)));
  pintar();
  const txt = h('textarea', { class: 'entrada', autofocus: true, placeholder: 'Ex.: no Modo compra, quando eu marco o arroz, o total não muda…', style: { minHeight: '120px' } });
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const f = folha([
    h('h2', null, '💬 Ideia ou problema'),
    h('p', { class: 'sub' }, 'Escreva do seu jeito. O app junta sozinho a versão, a tela e o celular.'),
    h('div', { class: 'form' }, chips, txt, erro),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'),
      h('button', { class: 'btn prim', onclick: () => {
        const texto = txt.value.trim();
        if (!texto) { erro.textContent = 'Escreva o que aconteceu ou a sua ideia.'; erro.hidden = false; txt.focus(); return; }
        const ua = /\(([^)]+)\)/.exec(navigator.userAgent)?.[1] || navigator.userAgent;
        app.loja.addFeedback({ tipo, texto: texto.slice(0, 2000), versao: app.versao, tela: app.telaAnterior || app.aba, lista: app.loja.nomeLista(app.mes), aparelho: ua.slice(0, 80) });
        f.fechar();
        app.render();
        toast('Obrigado! Feedback salvo. 💚');
      } }, 'Enviar')),
  ]);
}

function tratarFeedback(fb) {
  let status = fb.status;
  const chips = h('div', { class: 'filtros', style: { flexWrap: 'wrap', paddingTop: 0 } });
  const pintar = () => chips.replaceChildren(...Object.entries(STATUS_FB).map(([id, rot]) => h('button', { class: 'chip', 'aria-pressed': String(status === id), onclick: () => { status = id; pintar(); } }, rot)));
  pintar();
  const resp = h('textarea', { class: 'entrada', placeholder: 'Resposta curta (opcional), ex.: “corrigido na versão 1.8”' }, fb.resposta || '');
  const f = folha([
    h('h2', null, TIPOS_FB[fb.tipo] || 'Feedback'),
    h('p', { class: 'sub', style: { whiteSpace: 'pre-wrap', color: 'var(--texto)' } }, fb.texto),
    h('p', { class: 'sub' }, `${new Date(fb.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · versão ${fb.versao} · ${TELAS[fb.tela] || fb.tela || ''}${fb.lista ? ` · ${fb.lista}` : ''}${fb.aparelho ? ` · ${fb.aparelho}` : ''}`),
    // botões dentro de <label> recebem o clique do rótulo: por isso a situação fica numa div
    h('div', { class: 'form' }, h('div', { class: 'rotulo-campo' }, 'Situação', chips), h('label', null, 'Resposta', resp)),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn perigo', onclick: async () => {
        if (!(await confirmar('Apagar este feedback?', 'Ele some dos dois celulares.', 'Apagar', 'perigo'))) return;
        app.loja.del(`fb:${fb.id}`); f.fechar(); app.render();
      } }, '🗑 Apagar'),
      h('button', { class: 'btn prim', onclick: () => { app.loja.editarFeedback(fb.id, { status, resposta: resp.value.trim() }); f.fechar(); app.render(); } }, 'Salvar')),
  ]);
}

async function copiarParaClaude(fbs) {
  const linhas = ['Feedbacks abertos do app Cesta (App-Mercado). Corrija ou implemente:', ''];
  fbs.forEach((f, i) => linhas.push(`${i + 1}. [${(TIPOS_FB[f.tipo] || f.tipo).replace(/^\S+ /, '')}] ${f.texto}`,
    `   (versão ${f.versao}, tela ${TELAS[f.tela] || f.tela || '?'}${f.lista ? `, lista ${f.lista}` : ''}, ${new Date(f.quando).toLocaleDateString('pt-BR')}, id ${f.id})`));
  const texto = linhas.join('\n');
  try { await navigator.clipboard.writeText(texto); toast('Copiado. Cole numa conversa com o Claude.'); }
  catch { pedirTexto({ titulo: 'Copie o texto', rotulo: 'Selecione e copie', valor: texto, botao: 'Fechar' }); }
}

// ---------- aparência ----------
function secaoAparencia() {
  const { prefs } = app;
  const op = (rot, chave, valor) => h('button', { class: 'chip', 'aria-pressed': String((prefs[chave] || (chave === 'tema' ? 'escuro' : 'normal')) === valor), onclick: () => { prefs[chave] = valor; app.salvarPrefs(); app.aplicarAparencia(); app.render(); } }, rot);
  return h('div', { class: 'secao' },
    h('h3', null, '🎨 Aparência'),
    h('p', { class: 'sub' }, 'Tema'),
    h('div', { class: 'filtros', style: { flexWrap: 'wrap', paddingTop: 0 } }, op('🌙 Escuro', 'tema', 'escuro'), op('☀️ Claro', 'tema', 'claro'), op('🌓 Igual ao celular', 'tema', 'auto')),
    h('p', { class: 'sub', style: { marginTop: '12px' } }, 'Digitação do preço'),
    h('div', { class: 'filtros', style: { flexWrap: 'wrap', paddingTop: 0 } },
      h('button', { class: 'chip', 'aria-pressed': String(prefs.moeda !== false), onclick: () => { prefs.moeda = true; app.salvarPrefs(); app.render(); } }, '💰 Moeda: 2290 vira 22,90'),
      h('button', { class: 'chip', 'aria-pressed': String(prefs.moeda === false), onclick: () => { prefs.moeda = false; app.salvarPrefs(); app.render(); } }, '✍️ Livre: eu ponho a vírgula')),
    h('p', { class: 'sub', style: { marginTop: '12px' } }, 'Tamanho das letras'),
    h('div', { class: 'filtros', style: { flexWrap: 'wrap', paddingTop: 0 } }, op('Normal', 'fonte', 'normal'), op('Grande', 'fonte', 'grande')));
}

function secaoSobre() {
  return h('div', { class: 'secao' },
    h('h3', null, 'ℹ️ Sobre'),
    app.podeInstalar() ? h('button', { class: 'btn prim bloco', style: { marginBottom: '10px' }, onclick: () => app.instalar() }, '📲 Instalar o app na tela inicial') : null,
    h('p', { class: 'sub' }, 'Dicas: no campo de preço dá para digitar contas, como 36,98/3 (preço do pacote ÷ unidades). A marca digitada no primeiro mercado é copiada para os outros (em itálico) — é só sobrescrever.'),
    h('button', { class: 'btn bloco', style: { marginBottom: '10px' }, onclick: () => mostrarNovidades() }, '📣 Novidades das versões'),
    h('p', { class: 'sub', style: { margin: 0 } }, `Cesta · versão ${app.versao} · funciona sem internet`));
}
