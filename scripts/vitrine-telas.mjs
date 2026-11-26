// Telas da vitrine (docs/images): roda a demonstração no Chromium e tira as telas e o GIF; depois monta capa e painéis.
// Uso (na pasta do Cesta-Business): node scripts/vitrine-telas.mjs   — precisa de Playwright e ffmpeg.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const { chromium } = await import(process.env.PLAYWRIGHT || `${execSync('npm root -g').toString().trim()}/playwright/index.mjs`);

const raiz = process.cwd();
const saida = join(raiz, 'docs/images');
if (!existsSync(join(raiz, 'app/js/demo.js'))) { console.error('Rode na pasta do Cesta-Business.'); process.exit(1); }

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(raiz, 'app', p);
  if (!f.startsWith(join(raiz, 'app')) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const base = `http://127.0.0.1:${srv.address().port}/?demo`;

const browser = await chromium.launch();
const tela = async (largura, altura) => {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'pt-BR' });
  await ctx.clock.install({ time: new Date('2026-11-20T10:00:00-03:00') });
  const p = await ctx.newPage();
  await p.goto(base);
  await p.waitForSelector('nav#abas');
  await p.evaluate(() => document.querySelector('.selo-demo')?.remove()); // nas telas o selo só atrapalha
  return p;
};
const recarregar = async (p) => { await p.reload(); await p.waitForSelector('nav#abas'); await p.evaluate(() => document.querySelector('.selo-demo')?.remove()); };
const foto = (p, nome) => p.screenshot({ path: join(saida, `${nome}.png`) });
const aba = (p, nome) => p.click(`nav#abas button:has-text("${nome}")`);

const p = await tela(412, 915);
const mes = await p.evaluate(() => __cesta.mes);
await foto(p, '01-precos');
await p.locator('.card-nome').first().click();
await p.waitForTimeout(300);
await foto(p, '02-produto');
await p.locator('.card-nome').first().click();

// Compra: alguns itens já no carrinho, um com preço da gôndola
await aba(p, 'Compra'); await p.waitForTimeout(300);
for (let i = 0; i < 4; i++) await p.locator('.marca-cx[aria-checked="false"]').first().click();
await p.waitForTimeout(300);
await foto(p, '03-compra');
await aba(p, 'Histórico'); await p.waitForTimeout(300);
await foto(p, '04-historico');
await aba(p, 'Mais'); await p.waitForTimeout(300);
await foto(p, '05-mais');
await p.click('.mais-linha:has-text("Otimizar a lista")'); await p.waitForTimeout(500);
await foto(p, '06-otimizar');
await recarregar(p); await aba(p, 'Mais');
await p.click('.aj:has-text("Sobre")'); await p.click('button:has-text("Novidades das versões")'); await p.waitForTimeout(500);
await foto(p, '00-novidades');
await recarregar(p);

// Nota fiscal (exemplo anonimizado dos testes): requeijão anotado na gôndola mais barato que o cobrado
await p.evaluate((mes) => {
  const l = __cesta.loja; const sam = l.mercados().find((m) => m.nome === "Sam's Club");
  const req = l.produtos(mes).find((x) => x.nome === 'Requeijão light'), far = l.produtos(mes).find((x) => x.nome === 'Farinha de trigo');
  l.setQtd(mes, req.id, 2); l.setQtd(mes, far.id, 4); l.marcarCompra?.(mes, far.id, true);
  l.pagarNoCaixa(mes, req.id, { mid: sam.id, preco: 16.98, qtd: 2 });
  __cesta.render();
}, mes);
await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
await p.evaluate((t) => navigator.clipboard.writeText(t), readFileSync(join(raiz, 'test/fixtures/nfce-sp.txt'), 'utf8').replace(/2610/g, mes.slice(2, 4) + mes.slice(5, 7)));
await aba(p, 'Compra'); await p.waitForTimeout(300);
await p.click('button:has-text("Conferir nota fiscal")');
await p.click('.folha .btn.prim:has-text("Colar nota")');
await p.waitForSelector('.folha h2:has-text("SUPERMERCADO EXEMPLO")');
await p.locator('.folha .nf-item:has-text("FARINHA CAPUTO")').click();
await p.locator('.folha >> nth=1 >> .opcao:has-text("Farinha de trigo")').click();
await p.waitForTimeout(200);
if (await p.locator('.folha select').count()) await p.selectOption('.folha select', { label: "Sam's Club" });
await p.click('.folha .btn.prim:has-text("Salvar e conferir")');
await p.waitForSelector('.folha .nf-bloco.alerta');
await p.waitForTimeout(4500); // espera o aviso "Nota conferida" sumir
await foto(p, '08-nota');

const pc = await tela(1440, 900);
await foto(pc, '07-computador');

// GIF: Preços → abrir um produto → Compra (deslizar para o carrinho) → Histórico
const ctxV = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'pt-BR',
  recordVideo: { dir: join(saida, '.video'), size: { width: 412, height: 915 } } });
await ctxV.clock.install({ time: new Date('2026-11-20T10:00:00-03:00') });
const v = await ctxV.newPage();
await v.goto(base); await v.waitForSelector('nav#abas');
await v.evaluate(() => document.querySelector('.selo-demo')?.remove());
await v.waitForTimeout(1200);
await v.mouse.wheel(0, 500); await v.waitForTimeout(900);
await v.locator('.card-nome').nth(2).click(); await v.waitForTimeout(1600);
await v.locator('.card-nome').nth(2).click(); await v.waitForTimeout(500);
await aba(v, 'Compra'); await v.waitForTimeout(1200);
for (let i = 0; i < 3; i++) {
  const b = await v.locator('.ic-deslize').nth(i).boundingBox();
  await v.mouse.move(b.x + 40, b.y + b.height / 2); await v.mouse.down();
  for (let x = 40; x <= 260; x += 20) { await v.mouse.move(b.x + x, b.y + b.height / 2); await v.waitForTimeout(16); }
  await v.mouse.up(); await v.waitForTimeout(700);
}
await aba(v, 'Histórico'); await v.waitForTimeout(1800);
const video = await v.video().path();
await ctxV.close();
const gif = join(saida, 'demo.gif');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.8', '-i', video, '-vf',
  'fps=12,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
rmSync(join(saida, '.video'), { recursive: true, force: true });

// Capa e painéis (EN/PT): HTML desenhado aqui, com as telas acima dentro de molduras de celular
const img = (n) => `data:image/png;base64,${readFileSync(join(saida, `${n}.png`)).toString('base64')}`;
const fonte = `data:font/woff2;base64,${readFileSync(join(raiz, 'app/fonts/archivo.woff2')).toString('base64')}`;
const icone = `data:image/png;base64,${readFileSync(join(raiz, 'app/icons/icon-512.png')).toString('base64')}`;
const CSS = `@font-face { font-family: Archivo; src: url(${fonte}) format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
  * { box-sizing: border-box; margin: 0; } body { width: 1600px; background: #0d0e10; color: #eef0f2; font-family: Archivo, system-ui, sans-serif; overflow: hidden; }
  .fundo { position: absolute; inset: 0; background: radial-gradient(900px 500px at 85% -10%, #0f3440 0%, transparent 70%), radial-gradient(700px 400px at -5% 110%, #0f3440aa 0%, transparent 70%); }
  .cel { width: 100%; aspect-ratio: 412 / 915; border-radius: 34px; padding: 7px; background: #1a1c1f; box-shadow: 0 0 0 1.5px #3a3e44, 0 30px 60px -20px #000c; }
  .cel img { width: 100%; height: 100%; border-radius: 28px; display: block; }`;
const PAINEIS = {
  1: [['01-precos', ['Every product is a shelf tag', 'The cheapest price up front, price per kg below and a ribbon when stores were compared.'], ['Cada produto é uma etiqueta', 'O menor preço em destaque, o preço por kg embaixo e a fita quando os mercados foram comparados.']],
    ['02-produto', ['Prices in five stores', 'Price, brand and size per store; what\'s missing is easy to spot.'], ['Preços em cinco mercados', 'Preço, marca e tamanho por mercado; o que falta pesquisar salta aos olhos.']],
    ['03-compra', ['Shop with a swipe', 'Swipe right to the cart, left for "not here"; a progress ring per store.'], ['Compra com um gesto', 'Deslize para a direita para o carrinho e para a esquerda para "não achei"; um anel por mercado.']],
    ['04-historico', ['The month in numbers', 'Savings this month and year, your basket\'s inflation and what changed the most.'], ['O mês em números', 'Economia no mês e no ano, a inflação do seu carrinho e o que mais mudou de preço.']]],
  2: [['05-mais', ['Lists, receipts, sync', 'Extra lists, the receipt reader, the diet list and family sync in one place.'], ['Listas, notas, sincronização', 'Listas extras, a nota fiscal, a lista da dieta e a sincronização num lugar só.']],
    ['06-otimizar', ['Optimize the list', 'Duplicates, wrong categories, bigger packages that pay off — one tap each.'], ['Otimize a lista', 'Repetidos, categoria errada, embalagem maior que compensa — um toque em cada.']],
    ['00-novidades', ['Explains itself', 'A first-run tour and a what\'s-new sheet at every release.'], ['Se explica sozinho', 'Uma apresentação na primeira vez e as novidades a cada versão.']],
    ['08-nota', ['Audit the receipt', 'Charged above the shelf price, missing from the receipt, off the list — at a glance.'], ['Confira a nota', 'Cobrado acima da gôndola, faltando na nota, fora da lista — num relance.']]],
};
const pag = await (await browser.newContext({ viewport: { width: 1600, height: 1040 }, deviceScaleFactor: 2 })).newPage();
const desenhar = async (html, nome, altura) => {
  await pag.setViewportSize({ width: 1600, height: altura });
  await pag.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="fundo"></div>${html}`);
  await pag.evaluate(() => document.fonts.ready);
  await pag.screenshot({ path: join(saida, `${nome}.png`) });
};
for (const [n, cols] of Object.entries(PAINEIS)) for (const [lado, li] of [['en', 1], ['pt', 2]]) {
  await desenhar(`<div style="position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:56px;padding:48px 56px 0">${cols.map((c, i) => `
    <div><div style="color:#6fd8ec;font-weight:700;letter-spacing:.12em;font-size:15px">0${(n - 1) * 4 + i + 1}</div>
    <h2 style="font-size:31px;font-weight:800;font-stretch:110%;line-height:1.1;margin:12px 0 16px;min-height:68px">${c[li][0]}</h2>
    <p style="color:#a7adb5;font-size:18px;line-height:1.45;min-height:80px">${c[li][1]}</p>
    <div style="margin-top:28px" class="cel"><img src="${img(c[0])}"></div></div>`).join('')}</div>`, `features-${n}-${lado}`, 1040);
}
await desenhar(`<div style="position:relative;height:800px">
  <div style="position:absolute;left:90px;top:170px;width:620px">
    <img src="${icone}" style="width:96px;height:96px;border-radius:22px;box-shadow:0 12px 30px -10px #000">
    <h1 style="font-size:116px;font-weight:900;font-stretch:115%;letter-spacing:-.03em;margin:44px 0 20px;line-height:1">Cesta</h1>
    <p style="font-size:30px;line-height:1.38;color:#c9ced4">Grocery price research that pays for itself — compare stores, shop the cheapest route, audit the receipt.</p>
    <div style="display:inline-block;margin-top:44px;padding:14px 22px;border-radius:12px;background:#0f3440;color:#6fd8ec;font-size:21px;font-weight:600">Offline-first PWA · Zero dependencies · Durable Objects</div>
  </div>
  <div style="position:absolute;left:790px;top:180px;width:270px;transform:rotate(-8deg)"><div class="cel"><img src="${img('03-compra')}"></div></div>
  <div style="position:absolute;left:1340px;top:180px;width:270px;transform:rotate(8deg)"><div class="cel"><img src="${img('04-historico')}"></div></div>
  <div style="position:absolute;left:1035px;top:70px;width:330px"><div class="cel"><img src="${img('01-precos')}"></div></div>
</div>`, 'capa', 800);

await browser.close();
srv.close();
console.log('ok');
