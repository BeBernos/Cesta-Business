// Demonstração pública (GitHub Pages ou ?demo): abre com a lista pronta e preços fictícios gerados no aparelho.
// Nada sai do navegador; "Recomeçar a demonstração" apaga e gera de novo.
import { PRODUTOS_PADRAO } from './padrao.js';
import { mesDeData } from './modelo.js';

export const DEMO = location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('demo');

const MARCAS = ['Ypê 500ml', 'Camil 5kg', 'Italac 1L', 'Sadia 1kg', 'Nestlé 400g', 'Qualy 500g', 'Pilão 500g', 'Liza 900ml', 'Tio João 1kg', 'Piracanjuba 1L'];

/** Gera a lista do mês com preços em cinco mercados (sementes fixas: a demo é sempre parecida). */
export function prepararDemo(loja) {
  const mes = mesDeData();
  loja.iniciarPadrao(mes, PRODUTOS_PADRAO);
  const ms = loja.mercados();
  let s = 11;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  loja.produtos(mes).slice(0, 90).forEach((p, i) => {
    const base = 3 + rnd() * 32;
    ms.forEach((m, j) => {
      if (rnd() < 0.18) return; // nem todo mercado tem o produto
      loja.setPreco(mes, p.id, m.id, Math.round(base * (0.86 + rnd() * 0.3) * 100) / 100);
      if (i % 3 === 0) loja.setMarca(mes, p.id, m.id, MARCAS[(i + j) % MARCAS.length]);
    });
    if (i % 2 === 0) loja.setQtd(mes, p.id, 1 + Math.floor(rnd() * 3));
  });
  loja.setValorMes(mes, 1800);
}

/** Selo fixo no topo: deixa claro que tudo é fictício. */
export function seloDemo() {
  const s = document.createElement('div');
  s.className = 'selo-demo';
  s.textContent = 'Demonstração · dados fictícios';
  document.body.append(s);
}
