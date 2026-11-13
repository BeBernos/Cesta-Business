// Lista da dieta: busca no app da dieta (Plano da Família) o que comprar no período e monta uma lista separada
// ("Dieta · Outubro") — ou soma numa lista que já existe. Cada item é ligado a um produto (o mesmo vinculador da
// nota fiscal) e as quantidades da dieta (g, ml, un) viram embalagens pela marca/tamanho anotada.
// A busca passa pelo nosso servidor com a senha da família: precisa da sincronização ligada.

import { app } from './ctx.js';
import { h, fmtQ, folha, toast } from './ui.js';
import { norm, nomeMes, mesDe } from './modelo.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ddmm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const fmtDieta = (q, u) => (q == null ? 'sem quantidade' : u === 'g' && q >= 1000 ? `${fmtQ(q / 1000)} kg` : u === 'ml' && q >= 1000 ? `${fmtQ(q / 1000)} L` : `${fmtQ(q)}${u === 'un' ? ' un' : u}`);

// Seções da dieta → categorias do mercado (pelo nome; quem renomeou "Açougue" etc. também acerta)
const SECOES = { 'Açougue': ['acougue', 'carne'], 'Peixaria': ['peix', 'carne'], 'Hortifruti': ['hortifruti', 'fruta', 'verdura'],
  'Laticínios': ['laticinio', 'frios', 'leite'], 'Padaria': ['padaria'], 'Mercearia': ['mercearia'], 'Congelados': ['congelado'],
  'Suplementos': ['suplemento', 'mercearia'], 'Farmácia': ['farmacia', 'higiene', 'saude'] };
function categoriaPara(secao, nome) {
  const cats = app.loja.categorias();
  for (const chave of SECOES[secao] || []) { const c = cats.find((x) => norm(x.nome).includes(chave)); if (c) return c.id; }
  const s = app.loja.sugerirCategoria(nome);
  if (s) return s.cid;
  return cats.find((x) => norm(x.nome).includes('mercearia'))?.id || cats[0]?.id;
}

export function trazerDieta(mes = mesDe(app.mes)) {
  const { loja } = app;
  if (!app.sinc?.s.token) {
    const f = folha([
      h('h2', null, '🥗 Lista da dieta'),
      h('p', { class: 'sub' }, 'A lista da dieta vem do app Plano da Família pela internet, com a senha da família. Ligue a sincronização para usar.'),
      h('div', { class: 'acoes' }, h('button', { class: 'btn prim bloco', onclick: () => { f.fechar(); app.irAba('mais'); } }, '☁️ Ir para Sincronizar celulares')),
    ]);
    return;
  }
  const [a, m] = mes.split('-').map(Number);
  const inicioMes = `${mes}-01`, fimMes = iso(new Date(a, m, 0));
  const hoje = iso(new Date());
  const desde = hoje > inicioMes && hoje <= fimMes ? hoje : inicioMes;
  const somar = (s, n) => { const d = new Date(`${s}T12:00`); d.setDate(d.getDate() + n); return iso(d); };
  const periodos = [
    [`${nomeMes(mes).split(' ')[0]} inteiro`, inicioMes, fimMes],
    ['Próximos 7 dias', desde, somar(desde, 6)],
    ['Próximos 14 dias', desde, somar(desde, 13)],
  ];
  let escolha = 0;
  const chips = h('div', { class: 'opcoes' });
  const pintar = () => chips.replaceChildren(...periodos.map(([rot, de, ate], i) => h('button', { class: `opcao${i === escolha ? ' atual' : ''}`, onclick: () => { escolha = i; pintar(); } },
    h('span', { class: 'tx' }, h('b', null, rot), h('small', null, `${ddmm(de)} a ${ddmm(ate)}`)))));
  pintar();
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const buscar = async (botao) => {
    const [, de, ate] = periodos[escolha];
    botao.disabled = true; botao.textContent = 'Buscando…'; erro.hidden = true;
    try {
      const r = await app.sinc.chamar(`dieta?de=${de}&ate=${ate}`);
      if (r.erro) throw new Error(r.erro);
      if (!r.itens?.length) throw new Error('Nenhum plano da dieta cobre esse período.');
      f.fechar();
      setTimeout(() => revisar(mes, r), 60);
    } catch (e) {
      erro.textContent = !navigator.onLine ? 'Sem internet. Tente de novo quando conectar.'
        : e.codigo === 'senha' ? 'A senha da família não confere. Confira em Mais → Sincronizar celulares.'
          : e.codigo === 'indisponivel' ? 'O servidor da Cesta não respondeu. Tente de novo em instantes.' : e.message;
      erro.hidden = false;
      botao.disabled = false; botao.textContent = 'Buscar';
    }
  };
  const btn = h('button', { class: 'btn prim', onclick: () => buscar(btn) }, 'Buscar');
  const existe = loja.listaDaDieta(mes);
  const f = folha([
    h('h2', null, '🥗 Trazer a lista da dieta'),
    h('p', { class: 'sub' }, `Busca no app Plano da Família tudo o que a dieta usa no período, já somado. ${existe ? `Substitui as quantidades de “${loja.nomeLista(existe)}”.` : `Vira uma lista separada, “Dieta · ${nomeMes(mes).split(' ')[0]}”.`}`),
    chips, erro,
    h('div', { class: 'acoes lado' }, h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'), btn),
  ]);
}

// Revisar: cada item da dieta ligado a um produto (ou produto novo, ou não comprar) e a quantidade em embalagens
function revisar(mes, r) {
  const { loja } = app;
  const itens = r.itens.map((i) => {
    // a dieta escreve por extenso ("Peito de frango"): a sugestão já é um bom palpite e evita produto repetido
    const v = loja.vincularItem(mes, '', { desc: i.nome, cod: '' });
    const pid = v.pid || v.sugestao;
    return { ...i, pid, como: pid ? 'liga' : 'novo', palpite: !v.pid && !!pid };
  });
  const listas = loja.listas(mes);
  const dieta = loja.listaDaDieta(mes);
  const selDestino = h('select', { class: 'entrada' },
    h('option', { value: '' }, dieta ? `${loja.nomeLista(dieta)} (substituir)` : `Lista separada: Dieta · ${nomeMes(mes).split(' ')[0]}`),
    listas.filter((id) => id !== dieta).map((id) => h('option', { value: id }, `Somar em ${loja.nomeLista(id)}`)));
  const corpo = h('div', { class: 'lista-ed' });
  const resumo = h('p', { class: 'sub' });
  const qtdDe = (i) => loja.embalagens(mes, i.pid, i.qtd, i.unid);
  const pintar = () => {
    const n = { liga: 0, novo: 0, nao: 0 };
    for (const i of itens) n[i.como]++;
    resumo.textContent = `${n.liga} ligados a produtos · ${n.novo} produtos novos · ${n.nao} fora. Toque num item para mudar.`;
    let secao = null;
    corpo.replaceChildren(...itens.flatMap((i) => {
      const e = qtdDe(i);
      const quanto = `${fmtQ(e.qtd)}${e.tam ? ` × ${fmtQ(e.tam.qtd)} ${e.tam.base}` : ` ${{ g: 'kg', ml: 'L' }[i.unid] || 'un'}`}${e.aviso ? ' (confira)' : ''}`;
      const destino = i.como === 'liga' ? `→ ${loja.produto(mes, i.pid)?.nome}${i.palpite ? '?' : ''} · ${quanto}`
        : i.como === 'novo' ? `＋ produto novo · ${quanto}` : 'não comprar';
      const linha = h('button', { class: `item-ed nf-item${i.como === 'liga' ? ' ligado' : ''}`, onclick: () => escolher(i) },
        h('div', { class: 'tx' }, h('b', null, i.nome), h('small', { class: 'num' }, fmtDieta(i.qtd, i.unid)),
          h('small', { class: i.como === 'liga' ? 'nf-liga' : i.como === 'novo' ? 'nf-fora' : '' }, destino)));
      if (i.categoria === secao) return [linha];
      secao = i.categoria;
      return [h('div', { class: 'sep-cat' }, secao), linha];
    }));
  };
  const escolher = (i) => {
    const busca = h('input', { type: 'search', class: 'entrada', placeholder: 'Buscar produto…', 'aria-label': 'Buscar produto' });
    const ops = h('div', { class: 'opcoes', style: { marginTop: '10px' } });
    const sugeridos = loja.sugerirVinculos(mes, i.nome).slice(0, 6).map((x) => x.p);
    const ok = (como, pid = null) => { i.como = como; i.pid = pid; i.palpite = false; g.fechar(); pintar(); };
    const pintarOps = () => {
      const t = norm(busca.value);
      const lista = t ? loja.produtos(mes).filter((p) => norm(p.nome).includes(t)).slice(0, 30) : sugeridos;
      ops.replaceChildren(...lista.map((p) => h('button', { class: `opcao${p.id === i.pid ? ' atual' : ''}`, onclick: () => ok('liga', p.id) }, h('span', { class: 'tx' }, p.nome))));
    };
    busca.addEventListener('input', pintarOps);
    const g = folha([
      h('h2', null, i.nome), h('p', { class: 'sub num' }, `Na dieta: ${fmtDieta(i.qtd, i.unid)}. Qual produto da lista é este? O app aprende para os próximos meses.`),
      busca, ops,
      h('div', { class: 'acoes' },
        h('button', { class: 'btn bloco', onclick: () => ok('novo') }, `＋ Criar o produto “${i.nome}”`),
        h('button', { class: 'btn fantasma bloco', onclick: () => ok('nao') }, 'Não comprar')),
    ]);
    pintarOps();
  };
  pintar();
  const aplicar = () => {
    const para = selDestino.value || null;
    let novos = 0, destino = null;
    const desfazerTudo = loja.lote(() => {
      for (const i of itens) {
        if (i.como !== 'novo') continue;
        const nome = i.nome.charAt(0).toUpperCase() + i.nome.slice(1);
        i.pid = loja.duplicados(mes, nome)[0]?.id || loja.addProduto(mes, { nome, cat: categoriaPara(i.categoria, nome) });
        novos++;
      }
      const usados = itens.filter((i) => i.como !== 'nao' && i.pid).map((i) => ({ pid: i.pid, qtd: qtdDe(i).qtd, desc: i.nome }));
      destino = loja.aplicarDieta(mes, usados, { de: r.de, ate: r.ate, para }).id;
    });
    // preços para o app da dieta calcular quanto custa a semana (sem preço anotado, o item só fica de fora da conta)
    const precos = itens.filter((i) => i.como !== 'nao' && i.pid).map((i) => ({ nome: i.nome, unid: i.unid, preco: loja.precoDaDieta(mes, i.pid, i.unid) })).filter((x) => x.preco > 0);
    if (precos.length) app.sinc.chamar('dieta-precos', { itens: precos }).catch(() => {});
    f.fechar();
    app.irMes(destino);
    app.irAba('precos');
    toast(`🥗 ${loja.nomeLista(destino)}: ${itens.filter((i) => i.como !== 'nao').length} itens da dieta${novos ? ` (${novos} produtos novos)` : ''}.`,
      { acao: { rotulo: 'Desfazer', fn: () => { desfazerTudo(); app.render(); } } });
  };
  const f = folha([
    h('h2', null, `🥗 Dieta · ${ddmm(r.de)} a ${ddmm(r.ate)}`),
    h('p', { class: 'sub' }, `${r.planos.join(', ')}${r.semPlano ? ` · ${r.semPlano} dias sem plano da dieta` : ''}`),
    h('div', { class: 'form' }, h('label', null, 'Para onde', selDestino)),
    resumo, corpo,
    h('div', { class: 'acoes lado' }, h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'), h('button', { class: 'btn prim', onclick: aplicar }, 'Pôr na lista')),
  ]);
}
