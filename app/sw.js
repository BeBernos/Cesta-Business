// Service worker: guarda o app no celular para abrir sem internet.
// Ao mudar qualquer arquivo do app, suba a versão em CACHE (e VERSAO em js/app.js).
const CACHE = 'cesta-v14';
const ARQUIVOS = [
  './', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/ctx.js', 'js/modelo.js', 'js/banco.js', 'js/sinc.js', 'js/ui.js', 'js/lista.js',
  'js/compra.js', 'js/orcamento.js', 'js/historico.js', 'js/ajustes.js', 'js/planilha.js', 'js/padrao.js', 'js/novidades.js',
  'js/marcas.js', 'js/grade.js', 'js/nota.js', 'js/notas.js', 'js/dieta.js', 'js/assistente.js', 'js/demo.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

// O Cloudflare redireciona /index.html → /; resposta "redirecionada" no cache quebra a abertura offline.
async function limpa(resp) {
  if (!resp.redirected) return resp;
  const corpo = await resp.blob();
  return new Response(corpo, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ARQUIVOS.map(async (u) => c.put(u, await limpa(await fetch(u, { cache: 'reload' })))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    // Página: tenta a rede (pega atualização), cai no cache se estiver offline
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await limpa(await fetch(req));
        if (r.ok) c.put('./', r.clone());
        return r;
      } catch {
        return (await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  // Demais arquivos: do cache (abre rápido e sem internet). Atualizam quando CACHE muda de versão.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const achado = await c.match(req, { ignoreSearch: true });
    if (achado) return achado;
    try {
      const r = await limpa(await fetch(req));
      if (r.ok) await c.put(req, r.clone());
      return r;
    } catch {
      return Response.error();
    }
  })());
});
