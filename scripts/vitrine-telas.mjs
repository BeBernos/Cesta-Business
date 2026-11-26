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
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelectorAll('#toast .toast').forEach((e) => e.remove())); // sem o aviso "Nota conferida" na foto
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
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.8', '-t', String(dur - 1.4), '-i', video, '-vf',
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

// Arquitetura (EN/PT): caixas em HTML e setas num SVG por cima
const T = {
  en: { eyebrow: 'ARCHITECTURE', titulo: 'How Cesta works', sub: 'A local-first app where the phone is the database; an optional Durable Object keeps the family\'s phones in step.',
    cols: ['THE PHONE (LOCAL-FIRST)', 'CLOUDFLARE EDGE (OPTIONAL)', 'INTEGRATIONS'],
    pwa: ['PHONE', 'Cesta PWA', ['Plain ES modules, no build, zero deps', 'Model: records {k, u, v}, tombstones', 'Calculations: cheapest, totals, budget, route', 'Receipt reader (NFC-e text) + linking', 'Shelf-tag UI, gestures, local font']],
    idb: ['DATA', 'IndexedDB + .xlsx', ['every record on the device first', '.xlsx read/write by hand (CompressionStream)', 'service worker: fully offline']],
    wk: ['EDGE', 'Worker: app-mercado', ['/api router → one Durable Object', 'family token check (hash of a hash)', '/api/dieta, /api/dieta-precos → Mesa', '/api/mcp/<secret> → Claude connector']],
    dobj: ['DATA', 'Durable Object \'Dados\'', ['SQLite, one per family (free plan)', 'same {k, u, v} rule as the phones', 'sequence numbers for incremental pulls']],
    mesa: ['NUTRITION', 'Mesa Worker', ['diet shopping list in, price per g/ml/un out', 'service binding, no public route']],
    nfe: ['NFC-E', 'Tax authority page', ['user copies the receipt page text', 'never scraped — bot protection respected']],
    mcp: ['MCP', 'Claude connector', ['reads the family\'s ideas and bug reports', 'answers them; replies sync to the phones']],
    cc: ['AI', 'Claude (copy & paste)', ['receipts without QR · categories · tips', 'no paid API']],
    rot: ['optional sync', 'service binding', 'copied text', 'MCP', 'prompts'] },
  pt: { eyebrow: 'ARQUITETURA', titulo: 'Como a Cesta funciona', sub: 'Um app local primeiro, em que o celular é o banco de dados; um Durable Object opcional mantém os celulares da família iguais.',
    cols: ['O CELULAR (LOCAL PRIMEIRO)', 'BORDA DO CLOUDFLARE (OPCIONAL)', 'INTEGRAÇÕES'],
    pwa: ['CELULAR', 'Cesta PWA', ['Módulos ES puros, sem build, zero dependências', 'Modelo: registros {k, u, v}, lápides', 'Cálculos: mais barato, totais, orçamento, rota', 'Leitor de nota (texto da NFC-e) + vínculos', 'Visual etiqueta, gestos, fonte local']],
    idb: ['DADOS', 'IndexedDB + .xlsx', ['todo registro primeiro no aparelho', '.xlsx lido e gerado à mão (CompressionStream)', 'service worker: 100% offline']],
    wk: ['BORDA', 'Worker: app-mercado', ['/api → um Durable Object', 'confere o token da família (hash de hash)', '/api/dieta, /api/dieta-precos → Mesa', '/api/mcp/<secreto> → conector do Claude']],
    dobj: ['DADOS', 'Durable Object \'Dados\'', ['SQLite, um por família (plano grátis)', 'mesma regra {k, u, v} dos celulares', 'números de sequência: baixa só o novo']],
    mesa: ['DIETA', 'Worker da Mesa', ['recebe a lista da dieta, devolve R$ por g/ml/un', 'ligação interna, sem rota pública']],
    nfe: ['NFC-E', 'Página da Sefaz', ['o usuário copia o texto da nota', 'nunca por robô — proteção respeitada']],
    mcp: ['MCP', 'Conector do Claude', ['lê as ideias e problemas da família', 'responde; a resposta chega aos celulares']],
    cc: ['IA', 'Claude (copiar e colar)', ['nota sem QR · categorias · dicas', 'sem API paga']],
    rot: ['sincronização opcional', 'ligação interna', 'texto copiado', 'MCP', 'pedidos'] },
};
const caixa = ([tag, tit, itens], x, y, w, h, destaque) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:14px;padding:16px 18px;
  background:#16171a;border:1px solid ${destaque ? '#6fd8ec' : '#2c3036'}"><div style="display:flex;align-items:center;gap:10px">
  <span style="font-size:10px;font-weight:700;letter-spacing:.1em;color:#6fd8ec;background:#0f3440;border-radius:5px;padding:3px 7px">${tag}</span>
  <b style="font-size:17px;font-weight:700">${tit}</b></div><ul style="margin:10px 0 0;padding-left:30px;color:#c9ced4;font-size:12.5px;line-height:1.65">
  ${itens.map((t) => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`;
const coluna = (rot, x, w) => `<div style="position:absolute;left:${x}px;top:175px;width:${w}px;height:530px;border:1px dashed #2a2e33;border-radius:18px">
  <span style="position:absolute;top:-9px;left:18px;background:#0d0e10;padding:0 8px;color:#a7adb5;font-size:11px;letter-spacing:.14em;font-weight:600">${rot}</span></div>`;
const etiqueta = (t, x, y) => `<span style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);background:#16171a;border:1px solid #3a3e44;border-radius:99px;padding:3px 11px;font-size:11.5px;color:#eef0f2;white-space:nowrap">${t}</span>`;
for (const lado of ['en', 'pt']) {
  const t = T[lado];
  await desenhar(`<div style="position:relative;height:900px;transform:translateY(60px)">
    <div style="position:absolute;left:50px;top:30px"><div style="color:#6fd8ec;font-size:13px;letter-spacing:.16em;font-weight:700">${t.eyebrow}</div>
      <h1 style="font-size:40px;font-weight:800;font-stretch:110%;margin:8px 0 6px">${t.titulo}</h1><p style="color:#a7adb5;font-size:15px">${t.sub}</p></div>
    ${coluna(t.cols[0], 30, 410)}${coluna(t.cols[1], 460, 420)}${coluna(t.cols[2], 900, 670)}
    ${caixa(t.pwa, 50, 200, 360, 185, true)}${caixa(t.idb, 50, 450, 360, 135)}
    ${caixa(t.wk, 480, 200, 380, 150, true)}${caixa(t.dobj, 480, 450, 380, 135)}
    ${caixa(t.mcp, 930, 200, 620, 100, true)}${caixa(t.nfe, 930, 320, 620, 100)}${caixa(t.cc, 930, 440, 620, 100)}${caixa(t.mesa, 930, 560, 620, 100)}
    <svg width="1600" height="900" style="position:absolute;inset:0" fill="none" stroke="#a7adb5" stroke-width="1.4">
      <defs><marker id="m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#a7adb5" stroke="none"/></marker></defs>
      <path d="M410 262 H480" marker-start="url(#m)" marker-end="url(#m)"/>
      <path d="M230 385 V450" marker-end="url(#m)"/>
      <path d="M670 350 V450" marker-end="url(#m)"/>
      <path d="M860 250 H930" marker-start="url(#m)" marker-end="url(#m)"/>
      <path d="M860 540 C895 540 895 610 930 610" marker-start="url(#m)" marker-end="url(#m)"/>
      <path d="M930 360 C760 360 600 380 412 320" stroke-dasharray="6 6" marker-end="url(#m)"/>
      <path d="M930 470 C880 420 700 420 412 360" stroke-dasharray="6 6" marker-end="url(#m)"/>
    </svg>
    ${etiqueta(t.rot[0], 445, 240)}${etiqueta(t.rot[1], 895, 575)}${etiqueta(t.rot[2], 770, 366)}${etiqueta(t.rot[3], 895, 228)}${etiqueta(t.rot[4], 770, 425)}
  </div>`, `architecture-${lado}`, 900);
}

await browser.close();
srv.close();
console.log('ok');
