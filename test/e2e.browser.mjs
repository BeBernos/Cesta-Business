// Teste ponta a ponta no Chromium (celular simulado), cobrindo os critérios de aceite.
// Uso: com `npx wrangler dev --port 8787` rodando, `node test/e2e.browser.mjs [pasta-para-prints]`
// (Playwright: usa o instalado globalmente; ajuste PLAYWRIGHT se precisar.)
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raizPw = process.env.PLAYWRIGHT || `${execSync('npm root -g').toString().trim()}/playwright/index.mjs`;
const { chromium } = await import(raizPw);
const URL_APP = process.env.URL_APP || 'http://127.0.0.1:8787/';
const PRINTS = process.argv[2] || null;

const b = await chromium.launch();
const celular = { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };
const erros = [];
async function abrir() {
  const ctx = await b.newContext(celular);
  // o teste foi escrito em outubro de 2026 (mês da lista pronta e do plano de exemplo): o relógio começa lá e anda normal
  await ctx.clock.install({ time: new Date('2026-10-15T12:00:00-03:00') });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) erros.push(m.text()); });
  await p.goto(URL_APP);
  await p.waitForSelector('.boas .opcao, #topo');
  return { ctx, p };
}
const print = async (p, nome) => { if (PRINTS) await p.screenshot({ path: `${PRINTS}/${nome}.png` }); };
const total = (p) => p.evaluate(() => __cesta.loja.calcMes(__cesta.mes).totalGeral);
const passo = (t) => console.log(`✓ ${t}`);

// ---------- celular A ----------
const { ctx: ctxA, p: a } = await abrir();
await a.click('text=Começar com a lista pronta');
await a.waitForSelector('.card');
assert.equal(await a.evaluate(() => __cesta.mes), '2026-10');
// Primeira abertura: apresentação com tudo o que o app faz (todas as versões)
await a.waitForSelector('.folha h2:has-text("Veja o que a Cesta faz")');
assert.ok((await a.locator('.folha .nov-versao').count()) >= 6);
await print(a, '00-apresentacao');
await a.click('.folha .btn.prim:has-text("Entendi")');
await a.waitForTimeout(300);
passo('primeira abertura mostra a apresentação');

// Modo moeda: digitar 2290 vira 22,90; "4" "," "5" vira 4,5
await a.fill('input[type=search]', 'sabão em barra');
await a.waitForTimeout(250);
await a.locator('.card').first().locator('.card-nome').click();
const campoMoeda = a.locator('.card.aberto .lm input.preco').first();
await campoMoeda.click();
await a.keyboard.type('2290');
assert.equal(await campoMoeda.inputValue(), '22,90');
await campoMoeda.press('Backspace');
assert.equal(await campoMoeda.inputValue(), '2,29');
await campoMoeda.fill('');
await campoMoeda.click();
await a.keyboard.type('4,5');
assert.equal(await campoMoeda.inputValue(), '4,5');
await a.locator('.busca input').click();
assert.equal(await campoMoeda.inputValue(), '4,50');
assert.equal(await a.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Sabão em barra'); return l.preco('2026-10', p.id, l.mercados()[0].id).preco; }), 4.5);
await a.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Sabão em barra'); l.setPreco('2026-10', p.id, l.mercados()[0].id, null); __cesta.render(); });
passo('modo moeda: 2290 vira 22,90 sem digitar vírgula');

// preços de outubro digitados pela tela (modo "um mercado")
await a.click('.chip:has-text("Mercado")');
await a.click('.folha .opcao:has-text("Atacadão")');
await a.fill('input[type=search]', 'detergente de lou');
await a.waitForTimeout(250);
const card = a.locator('.card').first();
await card.locator('input.preco').fill('22,90');
await card.locator('input.marca').fill('Ypê 5L');
await card.locator('.qtd button[aria-label=Aumentar]').click();
await a.click('.chip:has-text("Atacadão ✕")');
await card.locator('.card-nome').click();
await card.locator('.lm[data-mid] input.preco').nth(1).fill('23,99');
await card.locator('.lm[data-mid] input.preco').nth(3).fill('55,10/2');
await a.locator('.busca input').click();
assert.equal(await card.locator('.lm[data-mid] input.marca').nth(2).inputValue(), 'Ypê 5L', 'marca copiada para os outros mercados');
assert.equal(await card.locator('.lm[data-mid] input.preco').nth(3).inputValue(), '27,55', 'conta 55,10/2 vira 27,55');
assert.equal(await card.locator('.lm.menor .mn').first().innerText().then((t) => t.split('\n')[0]), 'Atacadão', 'menor preço em verde');
assert.equal(await total(a), 22.9);
await print(a, '01-card-aberto');
passo('preços, marca copiada, conta no preço e menor preço em verde');

// Critério 4: incluir "Banha" em Mercearia (já existe → aviso), salvar e editar o nome
await a.fill('input[type=search]', '');
await a.click('#fab');
await a.fill('.folha input.entrada', 'Banha');
await a.selectOption('.folha select', { label: 'Mercearia' });
await a.click('.folha .btn.prim:has-text("Incluir")');
await a.waitForSelector('.folha h2:has-text("Esse nome já existe")');
await print(a, '02-nome-repetido');
await a.click('.folha .btn:has-text("Salvar mesmo assim")');
await a.waitForTimeout(400);
const banhas = await a.evaluate(() => __cesta.loja.produtos(__cesta.mes).filter((p) => p.nome === 'Banha').map((p) => p.id));
assert.equal(banhas.length, 2);
const pidBanha = await a.evaluate(() => [...document.querySelectorAll('.card.aberto')].map((c) => c.dataset.pid).find((id) => __cesta.loja.produto(__cesta.mes, id)?.nome === 'Banha'));
await a.click(`.card[data-pid="${pidBanha}"] button:has-text("Editar")`);
await a.fill('.folha input.entrada', 'Banha de porco');
await a.click('.folha .btn.prim:has-text("Salvar")');
await a.waitForTimeout(300);
assert.equal(await a.evaluate((id) => __cesta.loja.produto(__cesta.mes, id).nome, pidBanha), 'Banha de porco');
passo('critério 4: Banha incluída em Mercearia (com aviso de nome repetido) e renomeada');

// Critério 2: mercado "Extra" aparece em todos os produtos e entra na comparação
await a.click('nav#abas button:has-text("Mais")');
await a.click('button:has-text("Novo mercado")');
await a.fill('.folha input.entrada', 'Extra');
await a.click('.folha .btn.prim');
await a.click('nav#abas button:has-text("Preços")');
await a.fill('input[type=search]', 'detergente de lou');
await a.waitForTimeout(250);
if (!(await a.locator('.card').first().evaluate((e) => e.classList.contains('aberto')))) await a.locator('.card').first().locator('.card-nome').click();
assert.equal(await a.locator('.card').first().locator('.lm').count(), 6);
await a.locator('.card').first().locator('.lm[data-mid] input.preco').nth(5).fill('19,99');
await a.locator('.busca input').click();
assert.equal(await total(a), 19.99);
assert.equal(await a.locator('.card').first().locator('.lm.menor .mn').first().innerText().then((t) => t.split('\n')[0]), 'Extra');
await print(a, '03-extra');
passo('critério 2: Extra aparece em todos os produtos e já é o mais barato');

// Critério 3: excluir mercado arquivando → totais recalculados
await a.click('nav#abas button:has-text("Mais")');
await a.click('button[aria-label="Excluir Extra"]');
await a.click('.folha .btn:has-text("Arquivar")');
await a.waitForTimeout(300);
assert.equal(await total(a), 22.9);
assert.equal(await a.evaluate(() => __cesta.loja.mercados().length), 5);
assert.ok(await a.locator('details summary:has-text("Arquivados (1)")').count());
passo('critério 3: Extra arquivado, total volta a R$ 22,90 (preço do Extra guardado)');

// Critério 1: criar Novembro copiando Outubro sem trazer preços
await a.click('button:has-text("Mês novo copiando")');
assert.equal(await a.locator('.folha select').first().inputValue(), '2026-11');
await print(a, '04-criar-mes');
await a.click('.folha .btn.prim:has-text("Criar mês")');
await a.waitForTimeout(300);
assert.equal(await a.evaluate(() => __cesta.mes), '2026-11');
const nov = await a.evaluate(() => {
  const l = __cesta.loja;
  const ps = l.produtos('2026-11');
  return { n: ps.length, n10: l.produtos('2026-10').length, precos: ps.filter((p) => l.calcProduto('2026-11', p.id).menor !== null).length, qtd: ps.filter((p) => p.qtd).length, total: l.calcMes('2026-11').totalGeral };
});
assert.deepEqual(nov, { n: nov.n10, n10: nov.n10, precos: 0, qtd: 0, total: 0 });
passo(`critério 1: Novembro criado com ${nov.n} produtos, sem preços nem quantidades`);

// Repetir as quantidades de outubro em novembro (aviso no topo da lista)
await a.waitForSelector('.banner-repetir');
await a.click('.banner-repetir .btn.prim:has-text("Repetir")');
await a.waitForTimeout(300);
assert.equal(await a.evaluate(() => __cesta.loja.produtos('2026-11').filter((p) => p.qtd).length), 1);
assert.equal(await a.locator('.banner-repetir').count(), 0);
passo('repetir as quantidades do mês anterior com um toque');

// Criar mês do zero
await a.click('nav#abas button:has-text("Mais")');
await a.click('button:has-text("Mês do zero")');
assert.equal(await a.locator('.folha select').first().inputValue(), '2026-12');
await a.click('.folha .btn.prim:has-text("Criar mês")');
await a.waitForTimeout(300);
assert.equal(await a.evaluate(() => [__cesta.mes, __cesta.loja.produtos('2026-12').length, __cesta.loja.mercados().length]).then(JSON.stringify), JSON.stringify(['2026-12', 0, 5]));
passo('mês do zero: Dezembro criado vazio, com os mesmos mercados');

// volta para outubro e monta uma compra
await a.evaluate(() => __cesta.irMes('2026-10'));
await a.evaluate(() => {
  const l = __cesta.loja, mes = '2026-10';
  const [at, as, sam] = l.mercados();
  const itens = [['Arroz', 2, [22.69, 21.89, 22.5]], ['Sal', 1, [1.99, 3.99, 3.79]], ['Leite desnatado', 12, [5.65, 5.19, 4.98]], ['Café', 1, []]];
  for (const [nome, q, ps] of itens) {
    let p = l.produtos(mes).find((x) => x.nome === nome);
    if (!p) p = { id: l.addProduto(mes, { nome, cat: l.categorias()[8].id }) };
    l.setQtd(mes, p.id, q);
    [at, as, sam].forEach((m, i) => ps[i] && l.setPreco(mes, p.id, m.id, ps[i]));
  }
  __cesta.render();
});

// Valor do mês: define R$ 150, lista de R$ 128,43 fica "dentro"; aumentar o arroz faz passar
await a.click('nav#abas button:has-text("Preços")');
await a.click('.faixa-total');
await a.click('.folha .orc-cartao.sem');
await a.fill('.folha input.entrada', '150');
await a.click('.folha .btn.prim:has-text("Salvar")');
await a.waitForTimeout(400);
assert.equal((await a.locator('.faixa-total .orc-frase').innerText()).replace(/\s/g, ' '), 'Sobram R$ 21,57');
assert.ok(await a.locator('.faixa-total.orc-ok').count());
await print(a, '04b-valor-ok');
await a.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Arroz'); l.setQtd('2026-10', p.id, 4); __cesta.pintarRodape(); });
assert.equal((await a.locator('.faixa-total .orc-frase').innerText()).replace(/\s/g, ' '), 'Passou R$ 22,21');
assert.ok(await a.locator('.faixa-total.orc-passou').count());
await a.waitForSelector('.toast:has-text("passou")');
await a.click('.faixa-total');
await a.waitForSelector('.folha .orc-cartao.passou .orc-cortar');
await print(a, '04c-valor-passou');
await a.evaluate(() => history.back());
await a.waitForTimeout(300);
await a.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Arroz'); l.setQtd('2026-10', p.id, 2); __cesta.pintarRodape(); });
passo('valor do mês: verde dentro do valor, vermelho e aviso quando passa, sugestão do que tirar');

// Sincronização: A cria a senha da família
await a.click('nav#abas button:has-text("Mais")');
await a.click('button:has-text("Ligar sincronização")');
await a.fill('.folha input.entrada', 'familia-teste-123');
await a.click('.folha .btn.prim');
await a.waitForFunction(() => __cesta.sinc.s.estado === 'ok' && __cesta.sinc.s.pendentes.size === 0, null, { timeout: 15000 });
passo('sincronização ligada no celular A');

// ---------- celular B (o da esposa): entra com a senha e recebe a lista ----------
const { ctx: ctxB, p: bb } = await abrir();
await bb.click('text=Já uso em outro celular');
await bb.fill('.folha input.entrada', 'familia-teste-123');
await bb.click('.folha .btn.prim');
await bb.waitForSelector('.card', { timeout: 15000 });
await bb.waitForSelector('.folha h2:has-text("Veja o que a Cesta faz")');
await bb.click('.folha .btn.prim:has-text("Entendi")');
await bb.waitForTimeout(300);
assert.equal(await bb.evaluate(() => __cesta.loja.produtos('2026-10').length), await a.evaluate(() => __cesta.loja.produtos('2026-10').length));
passo('celular B recebeu a lista pela senha da família');

// Critério 5: modo compra sem internet, marcando itens
await bb.evaluate(() => __cesta.irMes('2026-10'));
await bb.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true));
await bb.reload();
await bb.waitForSelector('#topo');
await ctxB.setOffline(true);
await bb.reload();
await bb.waitForSelector('#topo', { timeout: 10000 });
await bb.click('nav#abas button:has-text("Compra")');
await bb.waitForSelector('.grupo');
const grupos = await bb.locator('.grupo-cab .tit b').allInnerTexts();
assert.deepEqual(grupos, ['No Atacadão', 'No Assaí', "No Sam's Club", 'Sem preço pesquisado']);
await print(bb, '05-compra-offline');
await bb.locator('.ic-compra:has-text("Leite desnatado") .marca-cx').click();
await bb.locator('.ic-compra:has-text("Sal") .marca-cx').click();
assert.equal(await bb.locator('.ic-compra.ok').count(), 2);
// Gôndola: o leite está 5,49 (pesquisado 4,98) → no carrinho e pesquisa atualizados
await bb.locator('.ic-compra:has-text("Leite desnatado") button[aria-label^="Gôndola de"]').click();
await bb.fill('.folha input.entrada >> nth=1', '5,49');
await bb.click('.folha .btn.verde');
await bb.waitForTimeout(300);
assert.ok(await bb.locator('.ic-compra:has-text("Leite desnatado") .gondola.mais').count());
assert.ok(await bb.locator('.resumo-compra .orcado:has-text("orçado")').count(), 'orçado guardado no primeiro item marcado');
assert.equal(await bb.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Leite desnatado'); return [l.orcamento('2026-10').noCarrinho.toFixed(2), l.calcProduto('2026-10', p.id).linhas[2].preco]; }).then(JSON.stringify), JSON.stringify(['67.87', 5.49]));
await print(bb, '05a-caixa');
passo('preço da gôndola: carrinho soma o da prateleira e a pesquisa é atualizada');
// Não achei o arroz no Assaí → vai para o próximo mais barato (Sam's Club, 22,50)
await bb.locator('.grupo:has-text("No Assaí") .ic-compra:has-text("Arroz") button[aria-label^="Opções de"]').click();
await bb.click('.folha .btn.prim:has-text("Não achei no Assaí")');
await bb.waitForTimeout(300);
assert.equal(await bb.locator('.grupo:has-text("No Sam\'s Club") .ic-compra:has-text("Arroz")').count(), 1);
assert.ok(await bb.locator('.ic-compra:has-text("Arroz") .manual:has-text("não achou no Assaí")').count());
await print(bb, '05b-nao-achei');
passo('“Não achei” manda o item para o próximo mais barato');
// Gôndola cara: detergente a 26,00 no Atacadão (orçado 22,90) e o Assaí tem por 23,99 → aviso e "Deixar para o Assaí"
await bb.locator('.grupo:has-text("No Atacadão") .ic-compra:has-text("Detergente de louça") button[aria-label^="Preço da gôndola"]').click();
await bb.fill('.folha input.entrada >> nth=1', '26,00');
await bb.waitForSelector('.folha .alerta-gondola:not([hidden])');
assert.match(await bb.locator('.folha .alerta-gondola').innerText(), /Subiu 14%.*Assaí está R\$\s23,99/s);
await bb.waitForTimeout(300); // fim da animação da folha
await print(bb, '05c-gondola-alerta');
await bb.click('.folha .alerta-gondola button:has-text("Deixar para o Assaí")');
await bb.waitForTimeout(300);
assert.equal(await bb.locator('.grupo:has-text("No Assaí") .ic-compra:has-text("Detergente de louça")').count(), 1);
assert.equal(await bb.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Detergente de louça'); return l.preco('2026-10', p.id, l.mercados()[0].id).preco; }), 26);
// Só anotar: preço da gôndola sem pôr no carrinho
await bb.locator('.ic-compra:has-text("Detergente de louça") button[aria-label^="Preço da gôndola"]').click();
await bb.fill('.folha input.entrada >> nth=1', '23,50');
await bb.click('.folha .btn:has-text("Só anotar")');
await bb.waitForTimeout(300);
assert.ok(await bb.locator('.ic-compra:not(.ok):has-text("Detergente de louça") .gondola.mais').count(), 'anotado (acima dos 22,90 orçados) e fora do carrinho');
passo('gôndola: aviso de 10% com outro mercado mais barato, “Deixar para o Assaí” e “Só anotar”');
// Tirar da lista: o arroz sai da compra (fica sem quantidade) e o Desfazer devolve
await bb.locator('.ic-compra:has-text("Arroz") button[aria-label^="Opções de"]').click();
await bb.click('.folha .btn.perigo:has-text("Tirar da lista")');
await bb.waitForTimeout(300);
assert.equal(await bb.locator('.ic-compra:has-text("Arroz")').count(), 0);
assert.equal(await bb.evaluate(() => __cesta.loja.produtos('2026-10').find((p) => p.nome === 'Arroz').qtd), null);
await bb.locator('.toast:has-text("saiu da lista") button:has-text("Desfazer")').click();
await bb.waitForTimeout(300);
assert.equal(await bb.locator('.ic-compra:has-text("Arroz")').count(), 1);
await bb.locator('.ic-compra:has-text("Arroz") button[aria-label^="Opções de"]').click();
await bb.click('.folha .btn.perigo:has-text("Tirar da lista")');
await bb.waitForTimeout(300);
assert.equal(await bb.locator('.ic-compra:has-text("Arroz")').count(), 0);
passo('tirar item da lista de compras (com desfazer)');
await bb.reload();
await bb.waitForSelector('.grupo');
assert.equal(await bb.locator('.ic-compra.ok').count(), 2, 'marcações continuam depois de reabrir sem internet');
assert.equal(await bb.locator('.selo-sinc').innerText(), 'Offline');
await print(bb, '06-compra-marcada');
passo('critério 5: modo compra abre sem internet, separa por mercado e guarda as marcações');

// volta a internet: A vê os itens marcados por B
await ctxB.setOffline(false);
await bb.evaluate(() => { dispatchEvent(new Event('online')); });
await bb.waitForFunction(() => __cesta.sinc.s.estado === 'ok' && __cesta.sinc.s.pendentes.size === 0, null, { timeout: 15000 });
await a.evaluate(() => __cesta.sinc.sincronizar());
await a.click('nav#abas button:has-text("Compra")');
await a.waitForSelector('.ic-compra.ok', { timeout: 10000 });
assert.equal(await a.locator('.ic-compra.ok').count(), 2);
passo('marcações do celular B chegaram no celular A');

// Segunda lista de outubro "com o que faltou" (só o que não foi marcado na nº 1)
const faltavam = await a.evaluate(() => { const l = __cesta.loja; const lc = l.listaCompra('2026-10'); return [...lc.grupos.flatMap((g) => g.itens), ...lc.semPreco].filter((i) => !i.ok).map((i) => i.p.nome).sort(); });
await a.click('.btn-mes');
await a.click('.folha button:has-text("Nova lista em Outubro")');
await a.waitForSelector('.folha h2:has-text("Nova lista")');
assert.equal(await a.locator('.folha input.entrada').first().inputValue(), 'Outubro nº 2');
await a.click('.folha .opcao:has-text("Com o que faltou")');
await print(a, '11-nova-lista');
await a.click('.folha .btn.prim:has-text("Criar lista")');
await a.waitForTimeout(400);
const nova = await a.evaluate(() => { const l = __cesta.loja; return { id: __cesta.mes, nome: l.nomeLista(__cesta.mes), n1: l.nomeLista('2026-10'), itens: l.produtos(__cesta.mes).filter((p) => p.qtd).map((p) => p.nome).sort() }; });
assert.ok(nova.id.startsWith('2026-10~'));
assert.deepEqual([nova.nome, nova.n1], ['Outubro nº 2', 'Outubro nº 1']);
assert.deepEqual(nova.itens, faltavam);
assert.equal((await a.locator('.btn-mes').innerText()).replace('▼', '').trim(), 'Outubro nº 2');
// o seletor mostra as duas listas de outubro
await a.click('.btn-mes');
assert.ok(await a.locator('.folha .opcao:has-text("Outubro nº 1")').count() && await a.locator('.folha .opcao.atual:has-text("Outubro nº 2")').count());
await a.evaluate(() => history.back());
await a.waitForTimeout(200);
passo(`lista “com o que faltou”: Outubro nº 2 criada com ${nova.itens.length} itens`);

// Feedback: envia, guarda a tela de origem e muda o status
await a.click('nav#abas button:has-text("Mais")');
await a.click('button:has-text("Enviar ideia ou problema")');
await a.click('.folha .chip:has-text("Ideia")');
await a.fill('.folha textarea', 'Ordenar o modo compra pelos corredores do mercado');
await a.click('.folha .btn.prim:has-text("Enviar")');
await a.waitForTimeout(300);
const fb = await a.evaluate(() => __cesta.loja.feedbacks()[0]);
assert.deepEqual([fb.tipo, fb.status, fb.tela, fb.versao, fb.lista], ['ideia', 'novo', 'precos', readFileSync(new URL('../app/js/app.js', import.meta.url), 'utf8').match(/app.versao = '([^']+)'/)[1], 'Outubro nº 2']);
await a.click('.fb-item');
await a.click('.folha .chip:has-text("Resolvido")');
await a.fill('.folha textarea', 'Anotado para a próxima versão');
await a.click('.folha .btn.prim:has-text("Salvar")');
await a.waitForTimeout(300);
assert.equal(await a.evaluate(() => __cesta.loja.feedbacks()[0].status), 'resolvido');
await print(a, '12-feedback');
passo('feedback: enviado com tela e versão, e marcado como resolvido');
await a.evaluate(() => __cesta.irMes('2026-10'));
await a.click('nav#abas button:has-text("Preços")');

// Excel: exportar gera um .xlsx que o próprio app lê
await a.click('nav#abas button:has-text("Mais")');
const [down] = await Promise.all([a.waitForEvent('download'), (async () => { await a.click('button:has-text("Exportar .xlsx")'); await a.click('.folha .btn.prim'); })()]);
const caminho = await down.path();
assert.ok(caminho && down.suggestedFilename().endsWith('.xlsx'));
passo(`exportação gerou ${down.suggestedFilename()}`);

// histórico e tela Mais renderizam
await a.click('nav#abas button:has-text("Histórico")');
await a.fill('.secao input[type=search]', 'arroz');
await a.click('.opcao:has-text("Arroz") >> nth=0');
await a.waitForSelector('svg.grafico');
await print(a, '07-historico');
passo('histórico com gráfico');

// Rota sugerida e busca no modo compra (celular A, outubro)
await a.evaluate(() => __cesta.irMes('2026-10'));
await a.click('nav#abas button:has-text("Compra")');
await a.waitForSelector('.rota .rota-op');
await print(a, '09-rota');
const rotaTxt = await a.locator('.rota .rota-op').first().innerText();
await a.locator('.rota .rota-op').first().locator('button:has-text("Usar")').click();
await a.waitForTimeout(300);
const foraDepois = await a.evaluate(() => __cesta.loja.listaCompra('2026-10').fora.size);
assert.ok(foraDepois >= 1, `rota aplicada (${rotaTxt.replace(/\s+/g, ' ')})`);
await a.click('.toast:has-text("Rota") button:has-text("Desfazer")');
await a.waitForTimeout(300);
await a.fill('.busca-compra input', 'leite');
const vis = await a.locator('.ic-compra:visible').allInnerTexts();
assert.ok(vis.length >= 1 && vis.every((t) => /leite/i.test(t)), 'busca mostra só o que bate');
await a.fill('.busca-compra input', '');
passo('rota sugerida (usar e desfazer) e busca no modo compra');

// Enviar lista (estava quebrado desde a 1.5): copia o texto quando não há "compartilhar"
await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(URL_APP).origin });
await a.evaluate(() => { delete Navigator.prototype.share; });
await a.click('button:has-text("Enviar lista")');
await a.waitForSelector('.toast:has-text("Lista copiada")');
const textoLista = await a.evaluate(() => navigator.clipboard.readText());
assert.ok(textoLista.startsWith('🛒 Outubro nº 1') && /\*No Atacadão\*/.test(textoLista) && textoLista.includes('Total estimado'), textoLista);
passo('enviar lista: texto da compra copiado para colar no WhatsApp');

// Nota fiscal: a Marina copiou a página da nota (Sam's Club) e cola no app
await a.evaluate(() => {
  const l = __cesta.loja; const sam = l.mercados().find((m) => m.nome === "Sam's Club");
  const req = l.produtos('2026-10').find((p) => p.nome === 'Requeijão light'), far = l.produtos('2026-10').find((p) => p.nome === 'Farinha de trigo');
  l.setQtd('2026-10', req.id, 2); l.setQtd('2026-10', far.id, 4);
  l.pagarNoCaixa('2026-10', req.id, { mid: sam.id, preco: 16.98, qtd: 2 }); // gôndola 16,98
  __cesta.render();
});
await a.evaluate((t) => navigator.clipboard.writeText(t), readFileSync(new URL('./fixtures/nfce-sp.txt', import.meta.url), 'utf8'));
await a.click('button:has-text("Conferir nota fiscal")');
await a.click('.folha .btn.prim:has-text("Colar nota")');
await a.waitForSelector('.folha h2:has-text("SUPERMERCADO EXEMPLO")');
assert.equal(await a.locator('.folha .nf-item').count(), 3);
assert.match(await a.locator('.folha .nf-item:has-text("REQUEIJAO") .nf-liga').innerText(), /Requeijão light/);
await a.locator('.folha .nf-item:has-text("FARINHA CAPUTO")').click();
await a.locator('.folha >> nth=1 >> .opcao:has-text("Farinha de trigo")').click();
await a.waitForTimeout(200);
assert.match(await a.locator('.folha .nf-item:has-text("FARINHA CAPUTO") .nf-liga').innerText(), /Farinha de trigo/);
await a.click('.folha .btn.prim:has-text("Salvar e conferir")');
assert.ok(await a.locator('.folha .aviso.erro:has-text("Escolha de qual mercado")').count(), 'pede o mercado na primeira nota do CNPJ');
await a.selectOption('.folha select', { label: "Sam's Club" });
await print(a, '15-nota-revisar');
await a.click('.folha .btn.prim:has-text("Salvar e conferir")');
await a.waitForSelector('.folha .nf-bloco.alerta');
assert.match(await a.locator('.folha .nf-bloco.alerta h3').innerText(), /Cobrado acima da gôndola: R\$\s4,00/);
assert.match(await a.locator('.folha .nf-bloco:has-text("Fora da lista") h3').innerText(), /R\$\s24,98/);
await a.waitForTimeout(300);
await print(a, '16-nota-relatorio');
const depoisNota = await a.evaluate(() => { const l = __cesta.loja; const n = l.notas()[0]; return { notas: l.notas().length, fora: l.orcamento('2026-10').foraLista, json: JSON.stringify(n) }; });
assert.equal(depoisNota.notas, 1);
assert.equal(depoisNota.fora, 24.98);
assert.equal(await a.evaluate(() => __cesta.loja.nomesAprendidos().length), 2, 'requeijão e farinha aprendidos');
assert.doesNotMatch(depoisNota.json, /FULANA|SOCIO/, 'nada do consumidor é guardado');
await a.click('.folha .btn.prim:has-text("Fechar")');
await a.waitForTimeout(300);
assert.ok(await a.locator('.ic-compra:has-text("Requeijão light") .gondola:has-text("nota R$")').count(), 'item mostra o preço da nota');
passo('nota fiscal: colar o texto, ligar os itens, R$ 4,00 acima da gôndola e R$ 24,98 fora da lista');

// Lista da dieta. Com DIETA_URL (o Worker do Plano da Família rodando em outro `wrangler dev`, ligado por dentro),
// publica o plano de exemplo lá e traz as compras de verdade; sem ele, confere a mensagem de "não respondeu".
await a.click('.btn-mes');
await a.click('.folha button:has-text("Nova lista em Outubro")');
await a.click('.folha .opcao:has-text("Da dieta")');
await a.waitForSelector('.folha h2:has-text("Trazer a lista da dieta")');
if (process.env.DIETA_URL) {
  const D = process.env.DIETA_URL;
  const login = await fetch(`${D}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.DIETA_SENHA || 'teste-local-123' }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '); // o app da dieta usa dois cookies (aparelho + sessão)
  const plano = readFileSync(process.env.DIETA_PLANO, 'utf8');
  assert.equal((await fetch(`${D}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ plano }) })).status, 200);
  await a.click('.folha .btn.prim:has-text("Buscar")');
  await a.waitForSelector('.folha h2:has-text("Dieta · 01/10 a 31/10")', { timeout: 15000 });
  assert.ok(await a.locator('.folha .nf-item:has-text("Arroz") .nf-liga:has-text("→ Arroz")').count(), 'arroz da dieta ligado ao Arroz da lista');
  await a.waitForTimeout(300);
  await print(a, '17-dieta');
  // um preço com tamanho conhecido, para o custo da dieta ter o que somar
  await a.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Arroz'); const m = l.mercados()[0].id; l.setPreco('2026-10', p.id, m, 25); l.setMarca('2026-10', p.id, m, 'Camil 5kg'); });
  await a.click('.folha .btn.prim:has-text("Pôr na lista")');
  await a.waitForTimeout(400);
  const d = await a.evaluate(() => { const l = __cesta.loja; return { id: __cesta.mes, nome: l.nomeLista(__cesta.mes), dieta: l.listaDaDieta('2026-10'), n: l.produtos(__cesta.mes).filter((p) => p.qtd).length, casa: l.produto('2026-10', l.produtos('2026-10').find((p) => p.nome === 'Arroz').id).qtd }; });
  assert.equal(d.nome, 'Dieta · Outubro');
  assert.equal(d.dieta, d.id);
  assert.ok(d.n >= 5, `itens da dieta na lista (${d.n})`);
  passo(`lista da dieta: Plano da Família → “Dieta · Outubro” com ${d.n} itens (ligação interna entre os Workers)`);
  // preços dos itens ligados voltam para o app da dieta (custo da semana lá)
  await a.waitForTimeout(800);
  const meta = await (await fetch(`${D}/api/meta`, { headers: { cookie } })).json();
  const arroz = meta.precosCesta?.precos['arroz|g'];
  assert.ok(arroz > 0 && arroz <= 0.005, `preço do arroz por grama chegou no app da dieta (o menor anotado; ${arroz})`);
  passo(`custo da dieta: ${Object.keys(meta.precosCesta.precos).length} preços enviados ao app da dieta`);
} else {
  await a.click('.folha .btn.prim:has-text("Buscar")');
  await a.waitForSelector('.folha .aviso.erro:has-text("O app da dieta não respondeu")');
  await a.evaluate(() => history.back());
  passo('lista da dieta: sem o app da dieta no ar, mensagem clara (rode com DIETA_URL para o teste completo)');
}
await a.evaluate(() => __cesta.irMes('2026-10'));
await a.waitForTimeout(200);

// Assistente: categoria sugerida, Otimizar (repetidos), categorias com o Claude e pedido da nota sem QR
await a.click('nav#abas button:has-text("Preços")');
await a.click('#fab');
await a.fill('.folha input.entrada >> nth=0', 'Peito de frango');
assert.equal(await a.locator('.folha select').evaluate((s) => s.selectedOptions[0].textContent), 'Carnes, aves, peixes e ovos', 'categoria sugerida pelo nome');
assert.ok(await a.locator('.folha .dica-cat:visible').count());
await a.click('.folha .btn.fantasma:has-text("Cancelar")');
await a.waitForTimeout(200);
await a.click('nav#abas button:has-text("Mais")');
await a.click('button:has-text("Otimizar a lista")');
await a.waitForSelector('.folha h2:has-text("Otimizar")');
assert.ok(await a.locator('.folha .nf-bloco:has-text("Parecem repetidos") .item-ed:has-text("Gelatina zero açúcar")').count(), 'a lista padrão tem "Gelatina zero açúcar" duas vezes');
await a.waitForTimeout(300);
await print(a, '18-otimizar');
await a.click('.folha .nf-bloco:has-text("Parecem repetidos") .item-ed:has-text("Gelatina zero açúcar") button:has-text("São diferentes")');
await a.waitForTimeout(300);
assert.equal(await a.locator('.folha .item-ed:has-text("Gelatina zero açúcar + Gelatina")').count(), 0, '“são diferentes” fica lembrado');
await a.click('.folha button:has-text("Revisar as categorias com o Claude")');
await a.waitForSelector('.folha h2:has-text("Categorias com o Claude")');
await a.click('.folha button:has-text("Copiar o pedido")');
assert.match(await a.evaluate(() => navigator.clipboard.readText()), /Produto => Categoria[\s\S]*- Banha \(Mercearia\)/);
await a.fill('.folha textarea', 'Claro! Mudanças:\n- Banha => Carnes, aves, peixes e ovos\n- Coisa que não existe => Bebidas');
await a.click('.folha .btn.prim:has-text("Aplicar")');
await a.waitForSelector('.toast:has-text("1 produto mudou de categoria (1 linhas não reconhecidas)")');
assert.equal(await a.evaluate(() => { const l = __cesta.loja; const b = l.produtos('2026-10').find((p) => p.nome === 'Banha'); return l.categorias().find((c) => c.id === b.cat).nome; }), 'Carnes, aves, peixes e ovos');
await a.click('.toast:has-text("produto mudou") button:has-text("Desfazer")');
await a.waitForTimeout(200);
// nota sem QR: o pedido para o Claude vai para a área de transferência
await a.click('button:has-text("Conferir nota fiscal")');
await a.click('.folha button:has-text("Nota sem QR code")');
assert.match(await a.evaluate(() => navigator.clipboard.readText()), /foto de um cupom fiscal[\s\S]*Vl\. Unit\.: 0,00 Vl\. Total 0,00/);
await a.evaluate(() => history.back());
await a.waitForTimeout(200);
passo('assistente: categoria pelo nome, otimizar (repetidos), categorias com o Claude e pedido da nota sem QR');

// Marcas: sugestões no campo e "só as marcas aceitas" (Limpol: nenhum mercado tem → sem mais barato)
await a.click('nav#abas button:has-text("Preços")');
await a.fill('input[type=search]', 'detergente de lou');
await a.waitForTimeout(250);
if (!(await a.locator('.card.aberto').count())) await a.locator('.card').first().locator('.card-nome').click(); // pode ter ficado aberto do começo
const sugestoes = await a.locator('.card.aberto datalist option').evaluateAll((os) => os.map((o) => o.value));
assert.ok(sugestoes[0] === 'Ypê 5L' && sugestoes.includes('Limpol 500ml'), sugestoes.join(' | '));
assert.equal(await a.locator('.card.aberto input.marca').first().getAttribute('list'), await a.locator('.card.aberto datalist').getAttribute('id'));
await a.click('.card.aberto button:has-text("Marcas")');
await a.click('.folha .chip:has-text("Limpol")');
await print(a, '13-marcas');
await a.click('.folha .btn.prim:has-text("Salvar")');
await a.waitForTimeout(300);
assert.ok(await a.locator('.card.aberto .resumo:has-text("Nenhum preço das marcas")').count(), await a.evaluate(() => { const l = __cesta.loja; const p = l.produtos('2026-10').find((x) => x.nome === 'Detergente de louça'); return JSON.stringify([l.marcasAceitas(p.id), l.calcProduto('2026-10', p.id).linhas.map((x) => [x.nome, x.preco, x.marca, x.aceita]), document.querySelector('.card.aberto .resumo')?.innerText]); }));
assert.equal(await a.locator('.card.aberto .lm.fora-marca').count(), 5);
await a.click('.card.aberto button:has-text("Marcas")');
await a.click('.folha .btn.fantasma:has-text("Qualquer marca")');
await a.waitForTimeout(300);
assert.equal(await a.locator('.card.aberto .lm.fora-marca').count(), 0);
passo('marcas: sugestões no campo e só as marcas aceitas entram no mais barato');

// Computador: a aba Preços vira planilha; Enter desce para o próximo produto na mesma coluna
await a.fill('input[type=search]', '');
await a.setViewportSize({ width: 1280, height: 800 });
await a.waitForSelector('table.grade');
assert.ok(await a.evaluate(() => document.body.classList.contains('largo')));
const cols = await a.locator('table.grade thead tr:first-child th').allInnerTexts();
assert.ok(cols.includes('Atacadão') && cols.includes('Menor preço'), cols.join(' | '));
const linhaSal = a.locator('table.grade tr[data-pid]').filter({ has: a.getByRole('button', { name: 'Sal', exact: true }) });
const coopSal = linhaSal.locator('input.g-preco').nth(4);
await coopSal.click();
await a.keyboard.type('150');
assert.equal(await coopSal.inputValue(), '1,50');
await a.keyboard.press('Enter');
const foco = await a.evaluate(() => [document.activeElement.dataset.col, document.activeElement.closest('tr').dataset.pid]);
const pidSal = await linhaSal.getAttribute('data-pid');
assert.equal(foco[0], await coopSal.getAttribute('data-col'));
assert.notEqual(foco[1], pidSal);
const calcSal = await a.evaluate((pid) => { const l = __cesta.loja; return [l.preco('2026-10', pid, l.mercados()[4].id).preco, l.calcProduto('2026-10', pid).menor]; }, pidSal);
assert.equal(calcSal[0], 1.5);
assert.equal(await linhaSal.locator('.g-menor').innerText(), calcSal[1].toFixed(2).replace('.', ','));
await print(a, '14-planilha');
await a.click('.chip:has-text("Planilha")');
await a.waitForSelector('.card');
assert.equal(await a.locator('table.grade').count(), 0, 'dá para voltar aos cartões');
await a.click('.chip:has-text("Ver como planilha")');
await a.waitForSelector('table.grade');
await a.setViewportSize(celular.viewport);
await a.waitForSelector('.card');
passo('computador: vista de planilha com Enter descendo a coluna, e volta aos cartões');

// Excluir produto pela aba Preços (Editar → Excluir → só deste mês)
await a.click('nav#abas button:has-text("Preços")');
await a.fill('input[type=search]', 'alvejante');
await a.waitForTimeout(250);
await a.locator('.card').first().locator('.card-nome').click();
await a.click('.card.aberto button:has-text("Editar")');
await a.click('.folha .btn.perigo:has-text("Excluir produto")');
await a.click('.folha .btn.perigo:has-text("Só de Outubro 2026")');
await a.waitForTimeout(400);
assert.equal(await a.evaluate(() => __cesta.loja.produtos('2026-10').some((p) => p.nome === 'Alvejante')), false);
assert.equal(await a.evaluate(() => __cesta.loja.produtos('2026-11').some((p) => p.nome === 'Alvejante')), true, 'novembro mantém');
assert.equal(await a.locator('.veu').count(), 0, 'nenhuma janela presa aberta');
passo('excluir produto pela aba Preços (só deste mês)');

// Produtos dentro da categoria (Mais → Categorias e produtos → Mercearia)
await a.fill('input[type=search]', '');
await a.click('nav#abas button:has-text("Mais")');
await a.click('summary:has-text("Ver e editar as")');
await a.click('button[aria-label="Produtos de Mercearia"]');
await a.waitForSelector('.folha h2:has-text("Mercearia")');
await a.fill('.folha input[type=search]', 'açúcar mascavo');
await a.click('.folha button[aria-label="Editar Açúcar mascavo"]');
await a.fill('.folha >> nth=1 >> input.entrada >> nth=0', 'Açúcar demerara');
await a.click('.folha >> nth=1 >> .btn.prim:has-text("Salvar")');
await a.waitForTimeout(300);
await a.fill('.folha input[type=search]', 'açúcar');
assert.ok(await a.locator('.folha .item-ed:has-text("Açúcar demerara")').count(), 'lista da categoria atualizada');
assert.equal(await a.evaluate(() => __cesta.loja.produtos('2026-11').some((p) => p.nome === 'Açúcar demerara')), true, 'nome também em novembro');
await a.fill('.folha input[type=search]', 'farinha');
await a.click('.folha button:has-text("Selecionar vários")');
const farinhas = await a.locator('.folha .item-ed.sel input').count();
for (let i = 0; i < farinhas; i++) await a.locator('.folha .item-ed.sel input').nth(i).check();
await a.selectOption('.folha .barra-sel select', { label: 'Padarias e sobremesas' });
await print(a, '10-mover-varios');
await a.click('.folha .barra-sel .btn.prim:has-text("Mover")');
await a.waitForTimeout(300);
const movidas = await a.evaluate(() => { const l = __cesta.loja; const pad = l.categorias().find((c) => c.nome === 'Padarias e sobremesas').id; return l.produtos('2026-10').filter((p) => /farinha/i.test(p.nome) && p.cat === pad).length; });
assert.equal(movidas, farinhas);
await a.click('.folha button:has-text("Novo produto")');
await a.fill('.folha >> nth=1 >> input.entrada >> nth=0', 'Polvilho doce');
await a.click('.folha >> nth=1 >> .btn.prim:has-text("Incluir")');
await a.waitForTimeout(300);
await a.fill('.folha input[type=search]', 'polvilho');
assert.ok(await a.locator('.folha .item-ed:has-text("Polvilho doce")').count());
await a.evaluate(() => history.back());
await a.waitForTimeout(300);
passo(`produtos dentro da categoria: editar (também nos meses seguintes), mover ${farinhas} de uma vez e incluir`);

// Voltar do Android: em Mais, o voltar leva para Preços
await a.click('nav#abas button:has-text("Preços")');
await a.waitForTimeout(300);
await a.click('nav#abas button:has-text("Mais")');
await a.goBack();
await a.waitForTimeout(300);
assert.equal(await a.evaluate(() => __cesta.aba), 'precos');
passo('voltar do celular leva para Preços');

// Novidades: simula um celular que estava na 1.2.0 e reabre o app atualizado
await a.evaluate(() => { const p = JSON.parse(localStorage.getItem('cesta.prefs')); p.versaoVista = '1.2.0'; localStorage.setItem('cesta.prefs', JSON.stringify(p)); });
await a.reload();
await a.waitForSelector('.folha h2:has-text("O app foi atualizado")');
const versoes = await a.locator('.folha .nov-versao').allInnerTexts();
const todas = [...readFileSync(new URL('../app/js/novidades.js', import.meta.url), 'utf8').matchAll(/versao: '([\d.]+)'/g)].map((m) => m[1]);
assert.deepEqual(versoes, todas.slice(0, todas.indexOf('1.2.0')).map((v) => `versão ${v}`), 'mostra as versões depois da 1.2.0, a mais nova primeiro');
await print(a, '08-novidades');
await a.click('.folha .btn.prim:has-text("Entendi")');
await a.reload();
await a.waitForSelector('#topo');
await a.waitForTimeout(400);
assert.equal(await a.locator('.folha').count(), 0, 'novidades aparecem uma vez só');
passo('novidades da versão aparecem uma vez depois de atualizar');

assert.deepEqual(erros, [], `erros no console: ${erros.join(' | ')}`);
await b.close();
console.log('\nTudo certo ✅');
