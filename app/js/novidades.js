// O que mudou em cada versão. Aparece uma vez depois que o app se atualiza (e em Mais → Novidades).
// Ao lançar uma versão: subir app.versao (js/app.js), CACHE (sw.js) e acrescentar a entrada aqui no topo.

import { app } from './ctx.js';
import { h, folha } from './ui.js';

export const NOVIDADES = [
  {
    versao: '1.12.0', titulo: 'Custo da dieta',
    itens: [
      ['🥗', 'Quanto custa a dieta', 'Ao trazer a lista da dieta, a Cesta manda para o app da dieta (Mesa) o preço de cada item que já tem preço anotado. Lá aparece quanto custa a semana, e o Claude pode equilibrar custo e nutrição no próximo plano.'],
      ['🔒', 'Só o necessário', 'Vai só o nome do item, a unidade e o preço por grama, ml ou unidade — nada de mercados, notas ou listas.'],
    ],
  },
  {
    versao: '1.11.0', titulo: 'Assistente',
    itens: [
      ['🪄', 'Otimizar a lista', 'Em Mais → Assistente (ou tocando no total, embaixo): mostra o que vocês costumam comprar e esqueceram, produtos repetidos para juntar, produtos em categoria errada, embalagem maior que compensa e itens sem preço — cada um com um toque para resolver.'],
      ['🗂️', 'Categoria sozinha', 'Ao incluir um produto, a categoria já vem escolhida pelo nome (“Peito de frango” → Carnes). O app aprende com o jeito que vocês organizam.'],
      ['📸', 'Nota sem QR code', 'Em “Conferir nota fiscal” → “Nota sem QR code? Peça ao Claude”: o app copia um pedido pronto; no app do Claude, cole, anexe a foto do cupom e cole a resposta de volta.'],
      ['💡', 'Dicas para economizar', 'No Otimizar, “Pedir dicas para economizar” copia a lista com os preços para você perguntar ao Claude o que trocar ou cortar.'],
      ['🤝', 'Sem custo', 'Nada disso usa serviço pago: as regras rodam no celular, e o Claude é o da conversa de vocês, por copiar e colar.'],
    ],
  },
  {
    versao: '1.10.0', titulo: 'Lista da dieta',
    itens: [
      ['🥗', 'Trazer a lista da dieta', 'Toque no nome da lista, no topo → “＋ Nova lista” → “Da dieta”. O app busca no Plano da Família tudo o que a dieta usa no mês (ou nos próximos 7 ou 14 dias), já somado.'],
      ['📦', 'Em embalagens', 'Os gramas da dieta viram pacotes pela marca anotada: 1,2 kg de frango com “Sadia 1kg” = 2 pacotes. Sem tamanho anotado, vem em kg para conferir.'],
      ['🔗', 'Ligada aos produtos', 'Cada item da dieta é ligado a um produto da lista (o app aprende com você, como na nota fiscal). O que não existir vira produto novo, na categoria certa.'],
      ['🧾', 'Separada ou somada', 'Vira a lista “Dieta · Outubro” (trazer de novo atualiza) ou, se preferir, soma direto na lista da casa.'],
    ],
  },
  {
    versao: '1.9.1', titulo: 'Nota fiscal mais esperta',
    itens: [
      ['🔤', 'Entende as abreviações', 'O app agora reconhece os nomes cortados da nota (“SAB LIQ PROTEX”, “LT DESN”, “QJO MUSS”, “PAP HIG”…) e usa as marcas que vocês já anotaram para tirar a dúvida.'],
      ['🧠', 'Aprende com você', 'Quando você liga um item da nota a um produto, o app guarda. Nas próximas notas — de qualquer mercado — aquele nome liga sozinho, mesmo com outro tamanho ou sabor.'],
      ['💡', '“Talvez…”', 'Item que o app não tem certeza aparece com uma sugestão: é só tocar e confirmar.'],
      ['📈', 'Pagou mais ou menos?', 'A conferência mostra, item a item, o que saiu mais caro e o que saiu mais barato (promoção) do que o esperado: gôndola, orçado ou pesquisa.'],
      ['🔗', 'Nomes aprendidos', 'Em Mais → Notas fiscais → “Nomes aprendidos” dá para ver tudo o que o app aprendeu e esquecer o que estiver errado.'],
    ],
  },
  {
    versao: '1.9.0', titulo: 'Conferir a nota fiscal',
    itens: [
      ['🧾', 'Conferir a nota', 'No Modo compra (ou em Mais), toque em “Conferir nota fiscal” → “Ler o QR code”. A nota abre no navegador: segure o dedo no texto → “Selecionar tudo” → “Copiar”, volte e toque em “Colar nota”.'],
      ['🔗', 'Itens ligados à lista', 'O app liga cada item da nota ao produto da lista. Os que ele não reconhecer, você liga com um toque — e na próxima nota daquele mercado ele já sabe sozinho.'],
      ['⚠️', 'Cobrado acima da gôndola', 'Se o caixa cobrou mais do que o preço anotado na gôndola, o app mostra quanto. Pela lei (10.962/2004), vale o menor preço: dá para pedir a diferença.'],
      ['❓', 'O que não foi cobrado e o que estava fora da lista', 'A conferência mostra o que estava no carrinho e não aparece na nota, e as compras fora da lista com o total.'],
      ['💳', 'Valor do mês com o gasto real', 'Depois da nota, o valor do mês usa o que foi cobrado de verdade — inclusive o que estava fora da lista. A pesquisa daquele mercado também é atualizada.'],
      ['🔒', 'Sem dados pessoais', 'O app guarda só mercado, data, itens e totais. CPF e nome não são guardados.'],
    ],
  },
  {
    versao: '1.8.0', titulo: 'Preço da gôndola, orçado e marcas',
    itens: [
      ['🏷️', 'Preço da gôndola', 'No Modo compra, toque no preço de um item e digite o que está na prateleira — não precisa marcar antes. Dá para só anotar ou já pôr no carrinho. O preço também atualiza a pesquisa daquele mercado.'],
      ['⚠️', 'Subiu muito? O app avisa', 'Se o preço da gôndola estiver 10% ou mais acima do orçado e outro mercado da rota tiver mais barato, aparece o aviso com o botão “Deixar para o …”.'],
      ['📌', 'Orçado guardado', 'Ao marcar o primeiro item, o app guarda o total planejado. No topo do Modo compra aparece “orçado × agora” e, no fim, “orçado × gasto”. “Atualizar” guarda de novo.'],
      ['💡', 'Sugestões de marca', 'No campo marca/tamanho aparecem as marcas que vocês já usaram e as mais comuns no Brasil, já com o tamanho.'],
      ['✅', 'Só as marcas que vocês compram', 'Abra um produto → 🏷️ Marcas e marque as aceitas (ex.: arroz só Camil e Tio João). O mais barato, a lista de compras e a rota passam a ignorar as outras.'],
      ['🧮', 'No computador, vista de planilha', 'Aberta numa tela grande, a aba Preços mostra os mercados lado a lado, como no Excel. Enter desce para o próximo produto.'],
      ['🛠️', 'Correção', '“📤 Enviar lista” do Modo compra voltou a funcionar.'],
    ],
  },
  {
    versao: '1.7.0', titulo: 'Várias listas no mês e espaço para ideias',
    itens: [
      ['🧾', 'Mais de uma lista por mês', 'Toque no nome da lista, no topo (ex.: “Outubro 2026 ▼”) → “＋ Nova lista”. Ótimo para a reposição da quinzena, um churrasco ou o que faltou.'],
      ['🧺', 'Lista com o que faltou', 'Ao criar a lista, escolha “Com o que faltou”: ela já vem só com o que não foi marcado como comprado na outra.'],
      ['🏷️', 'Nome da lista', 'Cada lista tem nome (“Outubro nº 2”, “Churrasco”…). Dá para renomear em Mais → Meses e listas.'],
      ['💲', 'Preços valem para todas', 'A pesquisa de preços é do mês: vale em todas as listas. Quantidades, marcações e compra são de cada lista.'],
      ['💳', 'Valor do mês e limite da lista', 'O valor do mês soma todas as listas. Se quiser, cada lista pode ter o próprio limite (🎯 em Mais → Meses e listas).'],
      ['💬', 'Ideias e problemas', 'Em Mais → Ideias e problemas, conte o que achou estranho ou o que gostaria. Fica guardado para as próximas versões.'],
    ],
  },
  {
    versao: '1.6.0', titulo: 'Produtos dentro das categorias',
    itens: [
      ['🗂️', 'Ver os produtos de cada categoria', 'Em Mais → Categorias e produtos, toque numa categoria: aparecem os produtos dela, com busca.'],
      ['✎', 'Editar e excluir dali mesmo', 'Cada produto tem ✎ (nome, categoria, quantidade, observação) e 🗑. Também dá para incluir um produto novo já na categoria.'],
      ['☑', 'Mover vários de uma vez', 'Toque em “Selecionar vários”, marque os produtos e mova para outra categoria (ou exclua) num toque só. Tem Desfazer.'],
      ['📅', 'Mudança vale para os próximos meses', 'Ao renomear ou trocar a categoria de um produto, dá para aplicar também nos meses seguintes já criados.'],
    ],
  },
  {
    versao: '1.5.0', titulo: 'Mais esperta na hora de pesquisar e comprar',
    itens: [
      ['💰', 'Preço em modo moeda', 'Não precisa mais da vírgula: digite 2290 e aparece 22,90 (como no app do banco). Se preferir o jeito antigo: Mais → Aparência → Digitação do preço.'],
      ['⚖️', 'Preço por kg, litro ou unidade', 'Se a marca/tamanho tiver o tamanho (5kg, 1,5L, c/3, 96un…), o app mostra quanto sai o kg em cada mercado e avisa quando a embalagem maior compensa mais.'],
      ['📈', 'Subiu ou caiu?', 'Ao lado do preço aparece ▲ ou ▼ com a variação em relação ao mês anterior.'],
      ['🔁', 'Repetir as quantidades do mês passado', 'Mês novo sem quantidades? Um toque no aviso do topo da lista copia as quantidades do mês anterior.'],
      ['🗺️', 'Rota sugerida', 'No Modo compra, o app mostra em quais 1, 2 ou 3 mercados dá para comprar tudo pagando quase o mesmo, para economizar viagem. “Usar” aplica a rota.'],
      ['🔎', 'Busca no Modo compra', 'Ache um item da lista sem rolar a tela.'],
      ['🛟', 'Lembrete de cópia', 'Se a sincronização estiver desligada, o app lembra uma vez por mês de baixar a planilha.'],
    ],
  },
  {
    versao: '1.4.0', titulo: 'Tirar da lista e navegação',
    itens: [
      ['🗑', 'Tirar um item da lista de compras', 'No Modo compra, toque em ⋯ ao lado do item → “Tirar da lista de compras”. O produto continua na aba Preços, só sem quantidade. Tem Desfazer.'],
      ['⋯', 'Botão de opções no Modo compra', 'O antigo ⇄ virou ⋯ e reúne: não achei aqui, trocar de mercado e tirar da lista.'],
      ['↩️', 'Botão voltar do celular', 'Nas abas Compra, Histórico e Mais, o voltar leva para Preços em vez de fechar o app.'],
      ['📣', 'Novidades', 'Esta janela: depois de cada atualização o app mostra o que mudou. Dá para rever em Mais → Novidades.'],
      ['🛠️', 'Correções', 'O campo de preço não fica vermelho enquanto você digita a vírgula; trocar de aba volta para o topo; a tela ligada desliga ao sair do Modo compra; mudanças do outro celular aparecem logo que uma janela fecha.'],
    ],
  },
  {
    versao: '1.3.0', titulo: 'Preço no caixa',
    itens: [
      ['🧾', 'Ajustar o que foi pago', 'Depois de marcar um item, toque em 🧾 e coloque o preço e a quantidade do caixa. “No carrinho” e o valor do mês passam a usar o real.'],
      ['🔁', 'Pesquisa atualizada', 'O preço do caixa também fica gravado na pesquisa daquele mercado (dá para desligar). “Usar o pesquisado” desfaz.'],
    ],
  },
  {
    versao: '1.2.0', titulo: 'Valor do mês',
    itens: [
      ['💳', 'Quanto dá para gastar', 'Defina o valor do cartão/VR no rodapé. A barra fica verde dentro do valor, âmbar perto do limite e vermelha quando passa.'],
      ['✂️', 'O que tirar', 'Quando passa, o app mostra os itens que mais pesam na conta.'],
    ],
  },
  {
    versao: '1.1.0', titulo: 'Não achei e mês do zero',
    itens: [
      ['😕', 'Não achei no mercado', 'O item vai sozinho para o próximo mais barato da rota.'],
      ['✨', 'Criar mês do zero', 'Além de copiar o mês anterior, dá para começar uma lista vazia.'],
    ],
  },
  { versao: '1.0.0', titulo: 'Primeira versão', itens: [['🛒', 'A Cesta nasceu', 'Pesquisa de preços, comparação, modo compra, histórico, Excel e cópias de segurança.']] },
];

const comparar = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

function lista(versoes) {
  return versoes.map((v) => h('div', { class: 'novidade' },
    h('div', { class: 'nov-cab' }, h('b', null, v.titulo), h('span', { class: 'nov-versao' }, `versão ${v.versao}`)),
    h('div', { class: 'nov-itens' }, v.itens.map(([ic, tit, txt]) => h('div', { class: 'nov-item' },
      h('span', { class: 'ic' }, ic), h('div', null, h('b', null, tit), h('p', null, txt)))))));
}

export function mostrarNovidades(versoes = NOVIDADES, titulo = 'Novidades da Cesta') {
  const f = folha([
    h('h2', null, `📣 ${titulo}`),
    h('div', { class: 'novidades' }, lista(versoes)),
    h('div', { class: 'acoes' }, h('button', { class: 'btn prim bloco', onclick: () => f.fechar() }, 'Entendi')),
  ]);
}

// Chamado na abertura: se a versão mudou desde a última vez, mostra só o que é novo para este celular.
export function conferirNovidades({ temDados }) {
  const atual = app.versao;
  let vista = app.prefs.versaoVista;
  if (!vista) vista = temDados ? '1.0.0' : atual; // instalação nova: nada para mostrar
  app.prefs.versaoVista = atual;
  app.salvarPrefs();
  const novas = NOVIDADES.filter((v) => comparar(v.versao, vista) > 0 && comparar(v.versao, atual) <= 0);
  if (novas.length) mostrarNovidades(novas, `O app foi atualizado para a versão ${atual}`);
  return novas.length;
}
