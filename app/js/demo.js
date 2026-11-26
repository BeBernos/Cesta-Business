// Demonstração pública (GitHub Pages ou ?demo): abre com a lista pronta e preços fictícios gerados no aparelho.
// Nada sai do navegador; "Recomeçar a demonstração" apaga e gera de novo.
import { PRODUTOS_PADRAO } from './padrao.js';
import { mesDeData } from './modelo.js';

export const DEMO = location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('demo');

const MARCAS = ['Ypê 500ml', 'Camil 5kg', 'Italac 1L', 'Sadia 1kg', 'Nestlé 400g', 'Qualy 500g', 'Pilão 500g', 'Liza 900ml', 'Tio João 1kg', 'Piracanjuba 1L'];

/** Gera três meses (os dois anteriores e o atual) com preços em cinco mercados, para o Histórico ter o que mostrar.
 *  Sementes fixas: a demo é sempre parecida. Os preços sobem um pouco a cada mês e alguns itens sobem bem mais. */
export function prepararDemo(loja) {
  const atual = mesDeData();
  const meses = [mesDeData(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)), mesDeData(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)), atual];
  loja.iniciarPadrao(meses[0], PRODUTOS_PADRAO);
  const ms = loja.mercados();
  let s = 11;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const base = loja.produtos(meses[0]).slice(0, 90).map((p, i) => ({ p, i, v: 3 + rnd() * 32, salto: rnd() < 0.12 ? 1.12 : 1 }));
  meses.forEach((mes, n) => {
    if (n) loja.criarMes(mes, { de: meses[n - 1], copiarQtd: true });
    for (const { p, i, v, salto } of base) {
      const fator = (1 + 0.012 * n) * (n === 2 ? salto : 1);
      ms.forEach((m, j) => {
        if (rnd() < 0.18) return; // nem todo mercado tem o produto
        loja.setPreco(mes, p.id, m.id, Math.round(v * fator * (0.86 + rnd() * 0.3) * 100) / 100);
        if (i % 3 === 0) loja.setMarca(mes, p.id, m.id, MARCAS[(i + j) % MARCAS.length]);
      });
      if (!n && i % 2 === 0) loja.setQtd(mes, p.id, 1 + Math.floor(rnd() * 3));
    }
    loja.setValorMes(mes, 2000);
  });
}

/** Selo fixo no topo: deixa claro que tudo é fictício. */
export function seloDemo() {
  const s = document.createElement('div');
  s.className = 'selo-demo';
  s.textContent = 'Demonstração · dados fictícios';
  document.body.append(s);
}
