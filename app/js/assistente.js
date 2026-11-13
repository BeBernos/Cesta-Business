// Assistente sem custo de API: "Otimizar a lista" com regras e memória, e "perguntar ao Claude" por copiar e colar
// (nota sem QR, categorias, dicas para economizar). Nada é automatizado no claude.ai: a pessoa cola o texto numa
// conversa dela com o Claude e, quando faz sentido, cola a resposta de volta.

import { app } from './ctx.js';
import { h, fmtRS, fmtQ, folha, toast } from './ui.js';
import { lerPares, norm } from './modelo.js';

async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); toast(msg, { tempo: 8000 }); } catch {
    folha([h('h2', null, 'Copie o texto'), h('p', { class: 'sub' }, 'Segure o dedo no texto → Selecionar tudo → Copiar.'),
      h('textarea', { class: 'entrada', style: { minHeight: '220px' }, readonly: true }, texto)]);
  }
}

// O formato da resposta é o mesmo da página da Sefaz: o leitor da nota fiscal lê sem mudar nada
const PROMPT_NOTA = `Vou anexar a foto de um cupom fiscal de supermercado. Transcreva e responda SÓ com o texto abaixo, sem comentários:

NOME DA LOJA
CNPJ: 00.000.000/0000-00
DESCRIÇÃO DO ITEM COMO NO CUPOM (Código: CÓDIGO ) Qtde.:1 UN: UN Vl. Unit.: 0,00 Vl. Total 0,00
(uma linha dessas por item)
Qtd. total de itens:0
Valor total R$:0,00
Descontos R$:0,00
Valor a pagar R$:0,00
Emissão: DD/MM/AAAA HH:MM:SS

Regras: números com vírgula; item por peso com a quantidade em kg (ex.: Qtde.:0,734 UN: KG); se o item não tiver código, use o número da linha; desconto de um item vai em "Descontos R$". Não escreva CPF nem nome do consumidor. Se não conseguir ler algo, avise no fim.`;

export const copiarPromptNota = () => copiar(PROMPT_NOTA, 'Copiado. No app do Claude: cole, anexe a foto do cupom e envie. Depois copie a resposta e cole aqui em “Colar nota”.');

// Fica o produto com mais dados (mais preços, com quantidade); os outros são juntados nele
const comMaisDados = (lista, g) => g.slice().sort((a, b) => app.loja.calcProduto(lista, b.id).pesquisados - app.loja.calcProduto(lista, a.id).pesquisados || !!b.qtd - !!a.qtd || a.nome.length - b.nome.length);
const chaveGrupo = (g) => g.map((p) => p.id).sort().join('|');

export function abrirOtimizar(lista = app.mes) {
  const { loja } = app;
  const o = loja.otimizar(lista);
  const nomeCat = new Map(loja.categorias().map((c) => [c.id, c.nome]));
  const separados = new Set(app.prefs.repetidosOk || []);
  const repetidos = o.repetidos.filter((g) => !separados.has(chaveGrupo(g)));
  const refazer = () => { f.fechar(); app.render(); setTimeout(() => abrirOtimizar(lista), 80); };
  const feito = (desfazer, msg) => { refazer(); toast(msg, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } }); };
  const bloco = (titulo, sub, ...filhos) => h('div', { class: 'nf-bloco' }, h('h3', null, titulo), sub ? h('p', { class: 'sub', style: { margin: '0 0 8px' } }, sub) : null, ...filhos);
  const linha = (tx, sub, acao) => h('div', { class: 'item-ed' }, h('div', { class: 'tx' }, tx, sub ? h('small', null, sub) : null), acao);
  const nada = !o.costuma.length && !repetidos.length && !o.embalagem.length && !o.semPreco.length && !o.categorias.length;
  const f = folha([
    h('h2', null, `🪄 Otimizar · ${loja.nomeLista(lista)}`),
    nada ? h('div', { class: 'nf-bloco ok' }, '✅ Nada a ajustar: a lista está redonda.') : null,
    o.costuma.length ? bloco(`🔁 Vocês costumam comprar (${o.costuma.length})`, 'Estavam nas últimas compras e estão sem quantidade agora.',
      h('div', { class: 'lista-ed' }, o.costuma.map((x) => linha(x.p.nome, `em ${x.meses} dos últimos meses · da última vez ${fmtQ(x.qtd)}`,
        h('button', { class: 'btn pequeno', onclick: () => feito(loja.lote(() => loja.setQtd(lista, x.p.id, x.qtd)), `${x.p.nome}: ${fmtQ(x.qtd)} na lista.`) }, `＋ ${fmtQ(x.qtd)}`)))),
      o.costuma.length > 1 ? h('button', { class: 'btn bloco', style: { marginTop: '8px' },
        onclick: () => feito(loja.lote(() => o.costuma.forEach((x) => loja.setQtd(lista, x.p.id, x.qtd))), `${o.costuma.length} itens voltaram para a lista.`) }, 'Incluir todos') : null) : null,
    repetidos.length ? bloco(`👯 Parecem repetidos (${repetidos.length})`, 'Juntar soma as quantidades e guarda os preços num só. Se forem coisas diferentes (outro sabor, outro tamanho), toque em “São diferentes”.',
      h('div', { class: 'lista-ed' }, repetidos.map((g) => {
        const [fica, ...saem] = comMaisDados(lista, g);
        return h('div', { class: 'item-ed', style: { flexWrap: 'wrap', paddingBottom: '8px' } }, h('div', { class: 'tx', style: { flexBasis: '100%', padding: '6px 0' } }, g.map((p) => p.nome).join(' + '), h('small', null, `fica “${fica.nome}”`)),
          h('button', { class: 'btn pequeno', onclick: () => feito(loja.lote(() => saem.forEach((s) => loja.juntarProdutos(lista, fica.id, s.id))), `Juntados em ${fica.nome}.`) }, 'Juntar'),
          h('button', { class: 'btn pequeno fantasma', onclick: () => { app.prefs.repetidosOk = [...separados, chaveGrupo(g)]; app.salvarPrefs(); refazer(); } }, 'São diferentes'));
      }))) : null,
    o.categorias.length ? bloco(`🗂️ Categoria (${o.categorias.length})`, 'Estes produtos parecem estar na categoria errada.',
      h('div', { class: 'lista-ed' }, o.categorias.map((x) => linha(x.p.nome, `${nomeCat.get(x.de) || 'sem categoria'} → ${nomeCat.get(x.para)}`,
        h('button', { class: 'btn pequeno', onclick: () => feito(loja.moverProdutos(lista, [x.p.id], x.para), `${x.p.nome} → ${nomeCat.get(x.para)}.`) }, 'Mover'))))) : null,
    o.embalagem.length ? bloco('📦 Embalagem maior compensa', 'Pelo preço por kg, litro ou unidade:',
      h('div', { class: 'lista-ed' }, o.embalagem.map(({ p, pu }) => linha(p.nome, `no ${pu.melhor.nome}: ${fmtRS(pu.melhor.porUnid)}/${pu.base} (${pu.melhor.marca})`)))) : null,
    o.semPreco.length ? bloco(`❓ Sem preço em nenhum mercado (${o.semPreco.length})`, o.semPreco.map((p) => p.nome).join(', ')) : null,
    bloco('🤖 Perguntar ao Claude', 'Sem custo extra: o app copia um texto pronto, você cola numa conversa com o Claude e lê (ou cola de volta) a resposta.',
      h('div', { class: 'acoes', style: { marginTop: 0 } },
        h('button', { class: 'btn bloco', onclick: () => copiarDicas(lista) }, '💡 Pedir dicas para economizar'),
        h('button', { class: 'btn bloco', onclick: () => { f.fechar(); setTimeout(() => categoriasComClaude(lista), 80); } }, '🗂️ Revisar as categorias com o Claude'))),
  ]);
}

function copiarDicas(lista) {
  const { loja } = app;
  const lc = loja.listaCompra(lista);
  const o = loja.orcamento(lista);
  const linhas = [`Faço a compra do mês da família em São Paulo. Esta é a lista “${loja.nomeLista(lista)}”, com o mercado mais barato que pesquisei para cada item (e os outros preços):`, ''];
  for (const g of lc.grupos) {
    for (const it of g.itens) {
      const outros = it.c.linhas.filter((l) => l.preco !== null && l.mid !== it.mid).map((l) => `${l.nome} ${fmtRS(l.preco)}`).join(', ');
      linhas.push(`- ${fmtQ(it.p.qtd)}× ${it.p.nome}${it.marca ? ` (${it.marca})` : ''}: ${fmtRS(it.preco)} no ${g.mercado.nome}${outros ? ` — ${outros}` : ''}`);
    }
  }
  for (const it of lc.semPreco) linhas.push(`- ${fmtQ(it.p.qtd)}× ${it.p.nome}: sem preço pesquisado`);
  linhas.push('', `Total estimado: ${fmtRS(lc.total)}.${o.valor ? ` Valor para gastar: ${fmtRS(o.valor)}.` : ''}`,
    'Me dê dicas curtas e práticas para economizar: trocas por marca ou tamanho mais baratos, o que dá para reduzir ou cortar' + (o.valor ? ' para caber no valor' : '') + ', e se vale concentrar a compra em menos mercados. Responda em tópicos.');
  copiar(linhas.join('\n'), 'Copiado. Cole numa conversa com o Claude e leia as dicas.');
}

// Categorias com o Claude: copia os produtos e as categorias; a resposta "Produto => Categoria" é colada de volta
function categoriasComClaude(lista) {
  const { loja } = app;
  const cats = loja.categorias();
  const nomeCat = new Map(cats.map((c) => [c.id, c.nome]));
  const produtos = loja.produtos(lista);
  const pedido = ['Organize estes produtos de supermercado nas categorias abaixo. Responda SÓ com os produtos que estão na categoria errada, um por linha, exatamente assim:',
    'Produto => Categoria', '', `Categorias: ${cats.map((c) => c.nome).join('; ')}`, '', 'Produtos (categoria atual):',
    ...produtos.map((p) => `- ${p.nome} (${nomeCat.get(p.cat) || 'sem categoria'})`)].join('\n');
  const txt = h('textarea', { class: 'entrada', placeholder: 'Cole aqui a resposta do Claude', style: { minHeight: '120px' } });
  const aviso = h('div', { class: 'aviso', hidden: true });
  const aplicar = () => {
    const porNome = new Map(produtos.map((p) => [norm(p.nome), p]));
    const acharCat = (n) => cats.find((c) => norm(c.nome) === norm(n)) || cats.find((c) => norm(c.nome).includes(norm(n)) || norm(n).includes(norm(c.nome)));
    const mover = [], naoEntendi = [];
    for (const [a, b] of lerPares(txt.value)) {
      const p = porNome.get(norm(a)), c = acharCat(b);
      if (p && c) { if (c.id !== p.cat) mover.push([p, c]); } else naoEntendi.push(a);
    }
    if (!mover.length) { aviso.textContent = naoEntendi.length ? `Não reconheci: ${naoEntendi.join(', ')}.` : 'Nada para mudar nessa resposta.'; aviso.hidden = false; return; }
    const desfazer = loja.lote(() => { for (const [p, c] of mover) loja.moverProdutos(lista, [p.id], c.id); });
    f.fechar();
    app.render();
    toast(`${mover.length} ${mover.length === 1 ? 'produto mudou' : 'produtos mudaram'} de categoria${naoEntendi.length ? ` (${naoEntendi.length} linhas não reconhecidas)` : ''}.`,
      { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
  };
  const f = folha([
    h('h2', null, '🗂️ Categorias com o Claude'),
    h('ol', { class: 'passos' }, h('li', null, 'Toque em “Copiar o pedido”.'), h('li', null, 'Cole numa conversa com o Claude e envie.'),
      h('li', null, 'Copie a resposta dele, cole abaixo e toque em “Aplicar”.')),
    h('button', { class: 'btn bloco', onclick: () => copiar(pedido, 'Copiado. Cole numa conversa com o Claude.') }, '📋 Copiar o pedido'),
    h('div', { class: 'form', style: { marginTop: '10px' } }, txt, aviso),
    h('div', { class: 'acoes lado' }, h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Fechar'), h('button', { class: 'btn prim', onclick: aplicar }, 'Aplicar')),
  ]);
}

// Bloco da aba Mais
export function secaoAssistente() {
  return h('div', { class: 'secao' },
    h('h3', null, '🪄 Assistente'),
    h('p', { class: 'sub' }, 'Arruma a lista sem custo: o que vocês costumam comprar, repetidos, categorias e embalagens. Para o resto, um texto pronto para perguntar ao Claude.'),
    h('button', { class: 'btn prim bloco', onclick: () => abrirOtimizar() }, '🪄 Otimizar a lista'));
}
