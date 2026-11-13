// Cesta — app de pesquisa e comparação de preços de supermercado.
// Inicialização, navegação entre as abas, rodapé com o total e cópias de segurança automáticas.

import { app } from './ctx.js';
import { Loja, nomeMes, mesDeData } from './modelo.js';
import { banco } from './banco.js';
import { criarSinc } from './sinc.js';
import { h, fmtRS, folha, toast, fecharTodas } from './ui.js';
import { telaPrecos, pintarLista, repintarCards, novoProduto, vistaGrade } from './lista.js';
import { telaCompra } from './compra.js';
import { telaHistorico, abrirHistorico } from './historico.js';
import { telaMais, criarMes, importarExcel, ligarSinc, novaLista } from './ajustes.js';
import { PRODUTOS_PADRAO } from './padrao.js';
import { conferirNovidades, mostrarNovidades, NOVIDADES } from './novidades.js';
import { exportarExcel } from './ajustes.js';
import { soltarTela } from './compra.js';
import { abrirOtimizar } from './assistente.js';
import { cartoes as cartoesOrcamento, barra as barraOrcamento, frase as fraseOrcamento, abrirValor } from './orcamento.js';

app.versao = '1.12.0';

// ---------- preferências deste celular ----------
function lerPrefs() { try { return JSON.parse(localStorage.getItem('cesta.prefs')) || {}; } catch { return {}; } }
app.prefs = lerPrefs();
app.salvarPrefs = () => { try { localStorage.setItem('cesta.prefs', JSON.stringify(app.prefs)); } catch { /* modo privado */ } };
app.aplicarAparencia = () => {
  document.documentElement.dataset.tema = app.prefs.tema || 'escuro';
  document.documentElement.dataset.fonte = app.prefs.fonte || 'normal';
  const claro = app.prefs.tema === 'claro' || (app.prefs.tema === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', claro ? '#f2f3f5' : '#121315');
};
app.aplicarAparencia();

// ---------- dados ----------
const loja = new Loja();
app.loja = loja;
const sujos = new Set();
let timerSalvar = null;

// Grava logo depois de cada mudança (o celular pode fechar o app a qualquer momento)
let salvando = null;
async function salvar() {
  clearTimeout(timerSalvar); timerSalvar = null;
  if (salvando) { await salvando; if (!sujos.size) return; }
  const recs = [...sujos].map((k) => loja.recs.get(k)).filter(Boolean);
  sujos.clear();
  salvando = banco.gravar(recs, { pendentes: [...(app.sinc?.s.pendentes || [])] })
    .catch((e) => { recs.forEach((r) => sujos.add(r.k)); console.error(e); })
    .finally(() => { salvando = null; });
  await salvando;
}
loja.ouvir((chaves, origem) => {
  chaves.forEach((k) => sujos.add(k));
  if (!timerSalvar) timerSalvar = setTimeout(salvar, 0);
  if (origem === 'remoto') remoto(chaves);
});
addEventListener('pagehide', salvar);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvar(); });

app.copiaSeguranca = async (motivo, auto = true) => {
  await salvar();
  if (!loja.recs.size) return;
  await banco.criarCopia(loja.todos(), motivo, auto);
  if (auto) await banco.setMeta('ultimaCopia', Date.now());
};
async function copiaDiaria() {
  const ultima = await banco.meta('ultimaCopia', 0);
  if (Date.now() - ultima > 20 * 3600 * 1000 && loja.meses().length) await app.copiaSeguranca('Cópia automática diária');
}

app.zerarLocal = async () => {
  await salvar();
  await banco.apagarTudo();
  loja.recs.clear();
  loja.ultimoU = 0;
  loja._reindexar();
  app.sinc.s.pendentes.clear();
  app.sinc.s.seq = 0;
};

// Mudanças vindas de outro celular
let renderAdiado = false;
function remoto(chaves) {
  const estrutura = chaves.some((k) => !k.startsWith('r:') && !k.startsWith('p:'));
  if (!loja.existeLista(app.mes)) app.irMes(escolherMes());
  const emEdicao = document.activeElement?.matches?.('#tela input, #tela textarea') || document.querySelector('.veu');
  if (app.aba === 'precos' && !estrutura && document.getElementById('lista')) {
    const novos = chaves.some((k) => k.startsWith('p:') && !document.querySelector(`#lista [data-pid="${k.split(':')[2]}"]`) && loja.get(k));
    if (!novos) { repintarCards(); pintarRodape(); return; }
  }
  if (emEdicao) { renderAdiado = true; return; }
  app.render();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (renderAdiado && !document.activeElement?.matches?.('#tela input, #tela textarea') && !document.querySelector('.veu')) { renderAdiado = false; app.render(); }
}, 300));

// ---------- navegação ----------
function escolherMes() {
  const ms = loja.meses();
  if (app.prefs.mes && loja.existeLista(app.prefs.mes)) return app.prefs.mes;
  const hoje = mesDeData();
  return ms.includes(hoje) ? hoje : ms[ms.length - 1] || null;
}
app.irMes = (m) => { app.mes = m; app.prefs.mes = m; app.salvarPrefs(); app.render(); };
// Voltar do Android: fora da aba Preços, o voltar leva para Preços (em vez de fechar o app)
let abaNoHistorico = false;
app.irAba = (aba, opc = {}) => {
  if (aba === 'historico' && opc.pid) abrirHistorico(opc.pid);
  const antes = app.aba;
  if (antes !== aba) app.telaAnterior = antes; // o feedback conta de que tela a pessoa veio
  app.aba = aba;
  app.prefs.aba = aba; app.salvarPrefs();
  if (aba !== 'precos' && !abaNoHistorico) { history.pushState({ aba: true }, ''); abaNoHistorico = true; }
  if (aba === 'precos' && abaNoHistorico) { abaNoHistorico = false; history.back(); }
  app.render({ topo: antes !== aba });
};
addEventListener('popstate', (e) => {
  if (e.folhaFechada) return; // o voltar fechou uma janela
  if (abaNoHistorico && app.aba !== 'precos') { abaNoHistorico = false; app.aba = 'precos'; app.prefs.aba = 'precos'; app.salvarPrefs(); app.render({ topo: true }); }
  else abaNoHistorico = false;
});
// Mudanças de outro celular que chegaram com uma janela aberta aparecem quando ela fecha
addEventListener('folha-fechada', () => setTimeout(() => {
  if (renderAdiado && !document.querySelector('.veu')) { renderAdiado = false; app.render(); }
}, 50));

const ABAS = [
  ['precos', '🏷️', 'Preços'],
  ['compra', '🛒', 'Compra'],
  ['historico', '📈', 'Histórico'],
  ['mais', '⚙️', 'Mais'],
];

let raiz, topo, tela, rodape;

function montarCasca() {
  raiz = document.getElementById('app');
  topo = h('header', { id: 'topo' });
  tela = h('main', { id: 'tela' });
  raiz.replaceChildren(topo, tela);
  rodape = document.getElementById('rodape');
  if (!rodape) { rodape = h('div', { id: 'rodape' }); document.body.append(rodape); }
  new ResizeObserver(() => document.documentElement.style.setProperty('--topo', `${topo.offsetHeight}px`)).observe(topo);
}

app.render = ({ topo: irAoTopo = false } = {}) => {
  if (!loja.meses().length) { boasVindas(); return; }
  if (app.aba !== 'compra') soltarTela();
  if (!raiz || !document.getElementById('topo')) montarCasca();
  if (!loja.existeLista(app.mes)) app.mes = escolherMes();
  const y = scrollY;
  topo.replaceChildren();
  tela.replaceChildren();
  const fn = { precos: telaPrecos, compra: telaCompra, historico: telaHistorico, mais: telaMais }[app.aba] || telaPrecos;
  fn(topo, tela);
  document.body.classList.toggle('largo', app.aba === 'precos' && vistaGrade());
  pintarRodape();
  requestAnimationFrame(() => scrollTo(0, irAoTopo ? 0 : Math.min(y, document.body.scrollHeight)));
};

function pintarRodape() {
  if (!rodape) return;
  const naLista = app.aba === 'precos';
  const nav = h('nav', { id: 'abas' }, ABAS.map(([id, ic, rot]) => h('button', {
    'aria-current': app.aba === id ? 'page' : null, onclick: () => app.irAba(id),
  }, h('span', { class: 'ic' }, ic), rot)));
  const filhos = [];
  if (naLista) {
    const c = loja.calcMes(app.mes);
    const o = loja.orcamento(app.mes);
    avisarSePassou(o);
    // Com mercados fora da rota ou itens "não achei", o total da compra difere do menor preço geral
    const comRota = Math.abs(o.planejado - c.totalGeral) > 0.005;
    filhos.push(
      h('button', { id: 'fab', 'aria-label': 'Incluir produto', onclick: () => novoProduto() }, '＋'),
      h('button', { class: `faixa-total orc-${o.estado}`, onclick: abrirTotais },
        o.estado !== 'sem' ? barraOrcamento(o) : null,
        h('div', null, h('div', { class: 'rot' }, comRota ? 'TOTAL DA COMPRA · sua rota' : 'TOTAL GERAL · no menor preço'),
          h('div', { class: 'val num' }, fmtRS(comRota ? o.planejado : c.totalGeral))),
        o.estado === 'sem'
          ? h('div', { class: 'mais' }, `${c.comQtd} ${c.comQtd === 1 ? 'item' : 'itens'} p/ comprar`, h('br'), h('span', { class: 'definir' }, '💳 Definir valor do mês'))
          : h('div', { class: 'mais' }, h('b', { class: 'orc-frase num' }, fraseOrcamento(o)), h('br'), `de ${fmtRS(o.valor)} · ${c.comQtd} itens ▴`)));
  }
  rodape.replaceChildren(h('div', { class: 'rodape-in', style: { position: 'relative' } }, filhos, nav));
}
app.pintarRodape = pintarRodape;

// Avisa uma vez quando a lista passa do valor do mês (ou volta a caber)
const ultimoEstado = new Map();
function avisarSePassou(o) {
  const antes = ultimoEstado.get(app.mes);
  ultimoEstado.set(app.mes, o.estado);
  if (antes === undefined || antes === o.estado) return;
  if (o.estado === 'passou') { try { navigator.vibrate?.([30, 60, 30]); } catch { /* sem vibração */ } toast(`⚠️ A lista passou ${fmtRS(-o.sobra)} do valor do mês.`); }
  else if (antes === 'passou') toast(`✅ Voltou a caber no valor do mês. Sobram ${fmtRS(o.sobra)}.`);
}

function abrirTotais() {
  const c = loja.calcMes(app.mes);
  const melhores = c.mercados.map((m) => ({ m, ...c.sub.get(m.id) })).sort((a, b) => b.itens - a.itens || a.total - b.total);
  const completos = melhores.filter((x) => x.itens === c.comQtd && c.comQtd > 0).sort((a, b) => a.total - b.total);
  folha([
    h('h2', null, `Totais de ${loja.nomeLista(app.mes)}`),
    h('p', { class: 'sub' }, `${c.comQtd} itens com quantidade · ${c.comPreco} produtos com algum preço`),
    cartoesOrcamento(app.mes),
    h('div', { class: 'resumo-compra' }, h('div', { class: 'rot' }, 'TOTAL GERAL (comprando cada item onde é mais barato)'), h('div', { class: 'val num' }, fmtRS(c.totalGeral))),
    completos.length ? h('div', { class: 'aviso', style: { background: 'var(--verde-bg)', borderColor: 'var(--verde-borda)', color: 'var(--verde)', marginBottom: '12px' } },
      `💡 Comprando cada item no mais barato você economiza ${fmtRS(completos[0].total - c.totalGeral)} em relação a fazer tudo no ${completos[0].m.nome}.`) : null,
    h('button', { class: 'btn bloco', style: { marginBottom: '12px' }, onclick: () => { fecharTodas(); setTimeout(() => abrirOtimizar(app.mes), 80); } }, '🪄 Otimizar a lista'),
    h('h3', { style: { margin: '6px 0 8px', fontSize: '1rem' } }, 'Subtotal por mercado (se comprasse tudo lá)'),
    h('div', { class: 'lista-ed' }, melhores.map((x) => h('div', { class: 'item-ed' },
      h('div', { class: 'tx' }, h('b', null, x.m.nome), h('small', null, x.itens === c.comQtd ? 'todos os itens com preço' : `${x.itens} de ${c.comQtd} itens com preço — faltam ${c.comQtd - x.itens}`)),
      h('b', { class: 'num', style: { paddingRight: '10px' } }, fmtRS(x.total))))),
  ]);
}

// Escolher mês e lista: listas agrupadas por mês, com o total de cada uma
app.abrirMeses = () => {
  const ms = loja.meses().slice().reverse();
  const f = folha([
    h('h2', null, 'Escolher lista'),
    h('div', { class: 'opcoes' }, ms.map((m) => [
      h('div', { class: 'sep-mes' }, h('b', null, nomeMes(m)), loja.valorMes(m) ? h('small', { class: 'num' }, `valor ${fmtRS(loja.valorMes(m))}`) : null),
      loja.listas(m).map((id) => h('button', { class: `opcao${id === app.mes ? ' atual' : ''}`, onclick: () => { f.fechar(); app.irMes(id); } },
        h('span', { class: 'ic' }, '🧾'), h('span', { class: 'tx' }, loja.nomeLista(id), h('small', null, `${loja.produtos(id).filter((p) => p.qtd).length} itens para comprar`)),
        h('span', { class: 'dir num' }, fmtRS(loja.calcMes(id).totalGeral)))),
      h('button', { class: 'btn pequeno fantasma', style: { justifySelf: 'start' }, onclick: () => { f.fechar(); setTimeout(() => novaLista(m), 50); } }, `＋ Nova lista em ${nomeMes(m).split(' ')[0]}`),
    ])),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn prim', onclick: () => { f.fechar(); setTimeout(() => criarMes('copiar'), 50); } }, '📋 Mês novo copiando'),
      h('button', { class: 'btn', onclick: () => { f.fechar(); setTimeout(() => criarMes('zero'), 50); } }, '✨ Mês do zero')),
  ]);
};

// ---------- selo de sincronização ----------
const ROTULO_SINC = { ok: 'Sincronizado', sincronizando: 'Sincronizando', offline: 'Offline', senha: 'Senha?', erro: 'Erro', indisponivel: 'Só neste celular' };
app.seloSinc = () => {
  const s = app.sinc?.s;
  const ligado = s?.token;
  const estado = ligado ? s.estado : navigator.onLine ? 'desligada' : 'offline';
  const el = h('button', { class: 'selo-sinc', dataset: { e: estado }, onclick: () => app.irAba('mais') },
    h('span', { class: 'ponto' }), ligado ? ROTULO_SINC[estado] || estado : navigator.onLine ? 'Neste celular' : 'Offline');
  el.id = 'selo';
  return el;
};
function atualizarSelo() { const velho = document.getElementById('selo'); if (velho) velho.replaceWith(app.seloSinc()); }
addEventListener('online', atualizarSelo);
addEventListener('offline', atualizarSelo);

// ---------- boas-vindas ----------
function boasVindas() {
  fecharTodas();
  rodape?.replaceChildren();
  raiz = document.getElementById('app');
  raiz.replaceChildren(h('div', { class: 'boas' },
    h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '' }),
    h('h1', null, 'Bem-vinda à Cesta 🛒'),
    h('p', null, 'Pesquise os preços nos mercados, veja onde cada item sai mais barato e use a lista na hora da compra — mesmo sem internet.'),
    h('div', { class: 'opcoes' },
      h('button', { class: 'opcao', onclick: () => { loja.iniciarPadrao(mesDeData(), PRODUTOS_PADRAO); comecar(); } },
        h('span', { class: 'ic' }, '🧺'), h('span', { class: 'tx' }, h('b', null, 'Começar com a lista pronta'), h('small', null, `${PRODUTOS_PADRAO.length} produtos, 12 categorias e 5 mercados (Atacadão, Assaí, Sam's Club, Carrefour, COOP)`))),
      h('button', { class: 'opcao', onclick: async () => { await importarExcel(); if (loja.meses().length) comecar(); } },
        h('span', { class: 'ic' }, '📊'), h('span', { class: 'tx' }, h('b', null, 'Importar minha planilha (.xlsx)'), h('small', null, 'Traz todos os meses, preços e marcas'))),
      h('button', { class: 'opcao', onclick: async () => { await ligarSinc(); if (loja.meses().length) comecar(); } },
        h('span', { class: 'ic' }, '☁️'), h('span', { class: 'tx' }, h('b', null, 'Já uso em outro celular'), h('small', null, 'Digite a senha da família para trazer a lista'))),
      h('button', { class: 'opcao', onclick: () => { loja.iniciarPadrao(mesDeData(), []); comecar(); } },
        h('span', { class: 'ic' }, '✨'), h('span', { class: 'tx' }, h('b', null, 'Começar do zero'), h('small', null, 'Só os mercados e as categorias, sem produtos'))))));
}

function comecar() {
  app.mes = escolherMes();
  app.aba = 'precos';
  raiz = null;
  app.render();
  copiaDiaria();
  // Primeira vez: mostra tudo o que o app faz (todas as versões)
  if (!app.prefs.apresentado) {
    app.prefs.apresentado = true; app.salvarPrefs();
    setTimeout(() => mostrarNovidades(NOVIDADES, 'Pronto! Veja o que a Cesta faz'), 400);
  }
}

// Sem sincronização, os dados existem só neste celular: lembra uma vez por mês de guardar uma cópia fora dele
function lembrarCopia() {
  if (app.sinc?.s.token || !loja.meses().length || document.querySelector('.veu')) return;
  const agora = Date.now();
  if (!app.prefs.instalado) { app.prefs.instalado = agora; app.salvarPrefs(); return; }
  const ultima = Math.max(app.prefs.ultimaCopiaFora || 0, app.prefs.instalado);
  if (agora < (app.prefs.lembreteAte || 0) || agora - ultima < 30 * 86400000) return;
  const dias = Math.round((agora - ultima) / 86400000);
  const f = folha([
    h('h2', null, '🛟 Guardar uma cópia fora do celular'),
    h('p', { class: 'sub' }, `Faz ${dias} dias que a lista só existe neste celular. Se ele quebrar ou for trocado, os preços e o histórico se perdem.`),
    h('div', { class: 'acoes' },
      h('button', { class: 'btn prim bloco', onclick: () => { f.fechar(); setTimeout(() => exportarExcel(), 60); } }, '📤 Baixar a planilha agora'),
      h('button', { class: 'btn bloco', onclick: () => { f.fechar(); app.irAba('mais'); } }, '☁️ Ligar a sincronização'),
      h('button', { class: 'btn fantasma bloco', onclick: () => { app.prefs.lembreteAte = agora + 7 * 86400000; app.salvarPrefs(); f.fechar(); } }, 'Lembrar daqui a uma semana')),
  ]);
}

// ---------- instalar ----------
let pedidoInstalar = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; });
app.podeInstalar = () => !!pedidoInstalar;
app.instalar = async () => { if (!pedidoInstalar) return; pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; app.render(); };

// ---------- início ----------
async function iniciar() {
  try {
    loja.carregar(await banco.lerTudo());
  } catch (e) {
    console.error(e);
    toast('Não consegui abrir os dados deste celular.');
  }
  let ultimoEstado = null;
  app.sinc = criarSinc(loja, { salvarAgora: salvar, aoMudar: (s) => {
    atualizarSelo();
    if (s.estado === 'sincronizando' || s.estado === ultimoEstado) return;
    ultimoEstado = s.estado;
    if (app.aba === 'mais' && !document.querySelector('.veu')) app.render();
  } });
  await app.sinc.iniciar();
  const pedida = new URLSearchParams(location.search).get('aba');
  app.aba = ['precos', 'compra', 'historico', 'mais'].includes(pedida) ? pedida : app.prefs.aba || 'precos';
  if (app.aba !== 'precos') { history.pushState({ aba: true }, ''); abaNoHistorico = true; }
  app.mes = escolherMes();
  app.render();
  copiaDiaria();
  const temDados = loja.meses().length > 0;
  if (temDados && !app.prefs.apresentado) app.prefs.apresentado = true; // quem já usava não vê a apresentação
  const mostrou = conferirNovidades({ temDados });
  if (!mostrou) setTimeout(lembrarCopia, 800);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    let jaTinha = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (jaTinha) toast('Nova versão da Cesta pronta.', { acao: { rotulo: 'Ver novidades', fn: () => location.reload() }, tempo: 15000 });
      jaTinha = true;
    });
  }
  app.abrirValor = abrirValor;
  window.__cesta = app; // para diagnóstico e testes
}

iniciar();
export { pintarLista };
