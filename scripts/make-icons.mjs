// Gera os ícones do app a partir de um desenho em SVG (visual "Etiqueta", ver DESIGN.md).
// Uso: npm run icons   (usa o Playwright instalado globalmente, como o e2e; ajuste PLAYWRIGHT se precisar)
// Desenho: etiqueta de gôndola em petróleo com furo, a cestinha em traço único e a fita verde do "menor preço".
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../app/icons/', import.meta.url));
const FUNDO = '#121315', PETROLEO = '#6fd8ec', TINTA = '#04212a', VERDE = '#4ade80';

// viewBox 512; escala < 1 encolhe tudo em volta do centro (zona segura do ícone maskable)
function desenho(escala = 1) {
  return `<g transform="translate(256 256) scale(${escala}) translate(-256 -256) rotate(-10 256 256)">
  <path d="M168 150H420V362H168L92 256Z" fill="${PETROLEO}" stroke="${PETROLEO}" stroke-width="28" stroke-linejoin="round"/>
  <circle cx="146" cy="256" r="17" fill="${FUNDO}"/>
  <g transform="translate(276 262) scale(.9)" fill="none" stroke="${TINTA}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round">
    <path d="M-62 -12A62 62 0 0 1 62 -12M-92 -12H92M-78 -12-62 78H62L78 -12M-26 18V50M0 18V50M26 18V50"/>
  </g>
  <path d="M374 136H408V222L391 208 374 222Z" fill="${VERDE}" stroke="${VERDE}" stroke-width="8" stroke-linejoin="round"/>
</g>`;
}

// raio: cantos do fundo (0 = quadrado cheio, para Android maskable e iPhone, que cortam sozinhos)
const svg = ({ raio = 0, escala = 1, fundo = true } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${fundo ? `<rect width="512" height="512" rx="${raio}" fill="${FUNDO}"/>` : ''}${desenho(escala)}</svg>\n`;

const ICONES = [
  ['icon-192.png', 192, { raio: 112 }],
  ['icon-512.png', 512, { raio: 112 }],
  ['maskable-512.png', 512, { escala: 0.8 }],
  ['apple-touch-icon.png', 180, {}],
];

// Favicon da aba do navegador: só a etiqueta, sem fundo, ocupando o quadrado todo
writeFileSync(OUT + 'icone.svg', svg({ fundo: false, escala: 1.26 }));

const raizPw = process.env.PLAYWRIGHT || `${execSync('npm root -g').toString().trim()}/playwright/index.mjs`;
const { chromium } = await import(raizPw);
const navegador = await chromium.launch();
for (const [nome, lado, op] of ICONES) {
  const p = await navegador.newPage({ viewport: { width: lado, height: lado } });
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style>${svg(op)}`);
  await p.screenshot({ path: OUT + nome, omitBackground: true });
  await p.close();
}
await navegador.close();
console.log('ok:', ['icone.svg', ...ICONES.map((i) => i[0])].join(', '));
