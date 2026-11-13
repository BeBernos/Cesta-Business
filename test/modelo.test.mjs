// Testes do modelo e da planilha (rodam no Node, sem navegador): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Loja, lerExpr, lerNumero, vence, lerTamanho, porUnidade, moedaDeDigitos, variacaoPreco, nomeDaMarca, palavrasNota, lerPares } from '../app/js/modelo.js';
import { marcasComuns } from '../app/js/marcas.js';
import { lerNota, lerChave, linkDeNota, partesDaChave } from '../app/js/nota.js';
import { lerPlanilha, aplicarImportacao, exportarPlanilha } from '../app/js/planilha.js';
import { PRODUTOS_PADRAO } from '../app/js/padrao.js';

const nova = () => { const l = new Loja(); l.iniciarPadrao('2026-10', PRODUTOS_PADRAO); return l; };
const mercado = (l, nome) => l.mercados({ todos: true }).find((m) => m.nome === nome);
const produto = (l, mes, nome) => l.produtos(mes).find((p) => p.nome === nome);

test('lista padrão: 5 mercados, 12 categorias, produtos de outubro', () => {
  const l = nova();
  assert.deepEqual(l.mercados().map((m) => m.nome), ['Atacadão', 'Assaí', "Sam's Club", 'Carrefour', 'COOP']);
  assert.equal(l.categorias().length, 12);
  assert.equal(l.produtos('2026-10').length, PRODUTOS_PADRAO.length);
});

test('números e contas no campo de preço', () => {
  assert.equal(lerNumero('4,79'), 4.79);
  assert.equal(lerNumero('1.234,56'), 1234.56);
  assert.equal(lerNumero(''), null);
  assert.equal(lerExpr('36,98/3'), 12.3267);
  assert.equal(lerExpr('2x7,49'), 14.98);
  assert.equal(lerExpr('R$ 22,90'), 22.9);
  assert.equal(lerExpr('36,98/'), undefined);
  assert.equal(lerExpr('4,'), 4, 'vírgula ainda sem centavos não é erro');
  assert.equal(lerExpr(''), null);
});

test('menor preço, mercado mais barato e totais', () => {
  const l = nova();
  const mes = '2026-10';
  const p = produto(l, mes, 'Detergente de louça');
  const [at, as, , ca] = l.mercados();
  l.setQtd(mes, p.id, 2);
  l.setPreco(mes, p.id, at.id, 22.9); l.setMarca(mes, p.id, at.id, 'Ypê 5L');
  l.setPreco(mes, p.id, as.id, 23.99);
  l.setPreco(mes, p.id, ca.id, 27.55);
  const c = l.calcProduto(mes, p.id);
  assert.equal(c.menor, 22.9);
  assert.equal(c.nomeMercMenor, 'Atacadão');
  assert.equal(c.marcaMenor, 'Ypê 5L');
  assert.equal(c.totalMenor, 45.8);
  const t = l.calcMes(mes);
  assert.equal(t.totalGeral, 45.8);
  assert.equal(t.sub.get(as.id).total, 47.98);
});

test('marca digitada no primeiro mercado é copiada; editar um mercado fixa o valor dele', () => {
  const l = nova();
  const mes = '2026-10';
  const p = produto(l, mes, 'Arroz');
  const [at, as, sam] = l.mercados();
  l.setMarca(mes, p.id, at.id, 'Camil 5kg');
  assert.equal(l.preco(mes, p.id, as.id).marca, 'Camil 5kg');
  assert.equal(l.preco(mes, p.id, as.id).auto, true);
  l.setMarca(mes, p.id, as.id, 'Tio João 5kg');
  l.setMarca(mes, p.id, at.id, 'Camil 1kg');
  assert.equal(l.preco(mes, p.id, as.id).marca, 'Tio João 5kg', 'mercado editado à mão não é sobrescrito');
  assert.equal(l.preco(mes, p.id, sam.id).marca, 'Camil 1kg', 'cópia automática acompanha o primeiro');
});

test('critério 1: criar Novembro copiando Outubro sem trazer preços antigos', () => {
  const l = nova();
  const p = produto(l, '2026-10', 'Arroz');
  const at = l.mercados()[0];
  l.setQtd('2026-10', p.id, 3);
  l.setPreco('2026-10', p.id, at.id, 22.69);
  l.setMarca('2026-10', p.id, at.id, 'Camil 5kg');
  l.setObs('2026-10', p.id, at.id, 'promoção');
  l.criarMes('2026-11', { de: '2026-10' });
  assert.equal(l.produtos('2026-11').length, l.produtos('2026-10').length);
  const p11 = l.produto('2026-11', p.id);
  assert.equal(p11.qtd, null);
  const r = l.preco('2026-11', p.id, at.id);
  assert.equal(r.preco, null);
  assert.equal(r.obs, '');
  assert.equal(r.marca, 'Camil 5kg', 'marca/tamanho é mantida para facilitar');
  assert.equal(l.calcMes('2026-11').totalGeral, 0);
  assert.equal(l.preco('2026-10', p.id, at.id).preco, 22.69, 'outubro continua igual');
});

test('critério 2: mercado novo aparece em todos os produtos e entra na comparação', () => {
  const l = nova();
  const mes = '2026-10';
  const p = produto(l, mes, 'Sal');
  l.setQtd(mes, p.id, 1);
  l.setPreco(mes, p.id, l.mercados()[0].id, 1.99);
  const extra = l.addMercado('Extra');
  assert.equal(l.mercados().at(-1).nome, 'Extra');
  assert.equal(l.calcProduto(mes, p.id).linhas.length, 6);
  assert.equal(l.calcProduto(mes, produto(l, mes, 'Banha').id).linhas.find((x) => x.mid === extra).preco, null);
  l.setPreco(mes, p.id, extra, 1.49);
  assert.equal(l.calcProduto(mes, p.id).nomeMercMenor, 'Extra');
  assert.equal(l.calcMes(mes).totalGeral, 1.49);
});

test('critério 3: arquivar mercado recalcula os totais sem ele e guarda o histórico', () => {
  const l = nova();
  const mes = '2026-10';
  const p = produto(l, mes, 'Sal');
  const [at, as] = l.mercados();
  l.setQtd(mes, p.id, 2);
  l.setPreco(mes, p.id, at.id, 1.99);
  l.setPreco(mes, p.id, as.id, 3.99);
  assert.equal(l.calcMes(mes).totalGeral, 3.98);
  l.arquivarMercado(at.id);
  assert.equal(l.mercados().length, 4);
  assert.equal(l.calcMes(mes).totalGeral, 7.98);
  assert.equal(l.calcProduto(mes, p.id).nomeMercMenor, 'Assaí');
  assert.equal(l.preco(mes, p.id, at.id).preco, 1.99, 'preço guardado');
  assert.ok(l.historico(p.id).series.some((s) => s.mercado.id === at.id));
  l.arquivarMercado(at.id, false);
  assert.equal(l.calcMes(mes).totalGeral, 3.98);
  l.apagarMercado(at.id);
  assert.equal(l.preco(mes, p.id, at.id), null);
  assert.equal(mercado(l, 'Atacadão'), undefined);
});

test('critério 4: incluir Banha em Mercearia (avisa nome repetido) e editar o nome depois', () => {
  const l = nova();
  const mes = '2026-10';
  const merc = l.categorias().find((c) => c.nome === 'Mercearia');
  assert.equal(l.duplicados(mes, ' banha ').length, 1, 'já existe Banha na lista padrão: avisa');
  const pid = l.addProduto(mes, { nome: 'Banha suína', cat: merc.id });
  assert.equal(l.duplicados(mes, 'Banha Suína').length, 1);
  l.editarProduto(mes, pid, { nome: 'Banha de porco' });
  assert.equal(l.produto(mes, pid).nome, 'Banha de porco');
  assert.equal(l.produto(mes, pid).cat, merc.id);
});

test('excluir produto: só este mês ou daqui para frente; meses passados nunca mudam', () => {
  const l = nova();
  l.criarMes('2026-11', { de: '2026-10' });
  l.criarMes('2026-12', { de: '2026-11' });
  const p = produto(l, '2026-11', 'Pilhas');
  l.excluirProduto('2026-11', p.id);
  assert.ok(l.produto('2026-10', p.id));
  assert.equal(l.produto('2026-11', p.id), null);
  assert.ok(l.produto('2026-12', p.id));
  const q = produto(l, '2026-11', 'Sal');
  const desfazer = l.excluirProduto('2026-11', q.id, { futuros: true });
  assert.ok(l.produto('2026-10', q.id));
  assert.equal(l.produto('2026-12', q.id), null);
  desfazer();
  assert.ok(l.produto('2026-12', q.id), 'desfazer volta tudo');
});

test('editar produto nos meses seguintes e mover vários de categoria', () => {
  const l = nova();
  l.criarMes('2026-11', { de: '2026-10' });
  l.criarMes('2026-12', { de: '2026-11' });
  const p = produto(l, '2026-11', 'Banha');
  const outras = l.categorias();
  const pets = outras.find((c) => c.nome === 'Pets'), temp = outras.find((c) => c.nome === 'Temperos');
  l.editarProduto('2026-11', p.id, { nome: 'Banha de porco' });
  l.aplicarNosSeguintes('2026-11', p.id, { nome: 'Banha de porco' });
  assert.equal(l.produto('2026-10', p.id).nome, 'Banha', 'mês anterior não muda');
  assert.equal(l.produto('2026-12', p.id).nome, 'Banha de porco');
  const ids = ['Sal', 'Orégano'].map((n) => produto(l, '2026-11', n).id);
  const desfazer = l.moverProdutos('2026-11', ids, pets.id, { futuros: true });
  assert.ok(ids.every((id) => l.produto('2026-11', id).cat === pets.id && l.produto('2026-12', id).cat === pets.id));
  assert.ok(ids.every((id) => l.produto('2026-10', id).cat === temp.id));
  desfazer();
  assert.ok(ids.every((id) => l.produto('2026-12', id).cat === temp.id));
});

test('categoria só é excluída vazia ou movendo os produtos', () => {
  const l = nova();
  const pets = l.categorias().find((c) => c.nome === 'Pets');
  l.excluirCategoria(pets.id);
  assert.equal(l.categorias().length, 11);
  const temp = l.categorias().find((c) => c.nome === 'Temperos');
  const merc = l.categorias().find((c) => c.nome === 'Mercearia');
  assert.throws(() => l.excluirCategoria(temp.id));
  const n = l.produtos('2026-10').filter((p) => p.cat === temp.id).length;
  l.excluirCategoria(temp.id, merc.id);
  assert.equal(l.produtos('2026-10').filter((p) => p.cat === merc.id).length >= n, true);
  assert.equal(l.usoCategoria(temp.id), 0);
});

test('modo compra separa por mercado mais barato e respeita "não vou"', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as] = l.mercados();
  const a = produto(l, mes, 'Arroz'), s = produto(l, mes, 'Sal'), b = produto(l, mes, 'Banha');
  for (const p of [a, s, b]) l.setQtd(mes, p.id, 1);
  l.setPreco(mes, a.id, at.id, 20); l.setPreco(mes, a.id, as.id, 22);
  l.setPreco(mes, s.id, at.id, 3); l.setPreco(mes, s.id, as.id, 2);
  let lc = l.listaCompra(mes);
  assert.deepEqual(lc.grupos.filter((g) => g.itens.length).map((g) => [g.mercado.nome, g.itens.length]), [['Atacadão', 1], ['Assaí', 1]]);
  assert.equal(lc.semPreco.length, 1);
  assert.equal(lc.total, 22);
  l.setForaCompra(mes, as.id, true);
  lc = l.listaCompra(mes);
  assert.equal(lc.grupos.find((g) => g.mercado.id === at.id).itens.length, 2);
  l.marcarCompra(mes, a.id, true);
  assert.equal(l.listaCompra(mes).feitos, 1);
});

test('não achei: item vai para o próximo mais barato; criar mês do zero', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as, sam] = l.mercados();
  const a = produto(l, mes, 'Arroz');
  l.setQtd(mes, a.id, 1);
  l.setPreco(mes, a.id, at.id, 20); l.setPreco(mes, a.id, as.id, 21); l.setPreco(mes, a.id, sam.id, 25);
  const onde = () => l.listaCompra(mes).grupos.find((g) => g.itens.some((i) => i.p.id === a.id))?.mercado.nome;
  assert.equal(onde(), 'Atacadão');
  l.naoAchei(mes, a.id, at.id);
  assert.equal(onde(), 'Assaí');
  l.naoAchei(mes, a.id, as.id);
  assert.equal(onde(), "Sam's Club");
  l.naoAchei(mes, a.id, sam.id);
  assert.equal(onde(), undefined);
  assert.equal(l.listaCompra(mes).semPreco[0].faltou.length, 3);
  l.voltarNaoAchei(mes, a.id);
  assert.equal(onde(), 'Atacadão');
  l.naoAchei(mes, a.id, at.id);
  l.limparCompra(mes);
  assert.equal(onde(), 'Atacadão', 'desmarcar tudo esquece os “não achei”');
  l.criarMes('2026-11');
  assert.equal(l.produtos('2026-11').length, 0);
  assert.ok(l.meses().includes('2026-11'));
});

test('valor do mês: dentro, quase no limite, passou; mês novo herda o valor', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as] = l.mercados();
  const a = produto(l, mes, 'Arroz'), s = produto(l, mes, 'Sal'), b = produto(l, mes, 'Banha');
  l.setQtd(mes, a.id, 10); l.setPreco(mes, a.id, at.id, 50); l.setPreco(mes, a.id, as.id, 60);
  l.setQtd(mes, b.id, 1);
  assert.equal(l.orcamento(mes).estado, 'sem');
  l.setValorMes(mes, 900);
  let o = l.orcamento(mes);
  assert.deepEqual([o.estado, o.planejado, o.sobra, o.semPreco], ['ok', 500, 400, 1]);
  l.setQtd(mes, s.id, 1); l.setPreco(mes, s.id, at.id, 330);
  o = l.orcamento(mes);
  assert.deepEqual([o.estado, o.sobra], ['quase', 70]);
  l.setQtd(mes, a.id, 12);
  o = l.orcamento(mes);
  assert.deepEqual([o.estado, o.sobra], ['passou', -30]);
  assert.equal(o.maiores[0].p.nome, 'Arroz');
  // "não achei" no Atacadão leva o arroz para o Assaí (mais caro) e a conta acompanha
  l.naoAchei(mes, a.id, at.id);
  assert.equal(l.orcamento(mes).planejado, 12 * 60 + 330);
  l.marcarCompra(mes, s.id, true);
  assert.equal(l.orcamento(mes).noCarrinho, 330);
  l.criarMes('2026-11', { de: mes });
  assert.equal(l.valorMes('2026-11'), 900, 'mês copiado herda o valor');
  l.criarMes('2026-12');
  assert.equal(l.valorMes('2026-12'), 900, 'mês do zero herda o valor do mês anterior');
  l.setValorMes('2026-11', 1000, { proximos: true });
  assert.deepEqual([l.valorMes(mes), l.valorMes('2026-11'), l.valorMes('2026-12')], [900, 1000, 1000]);
  l.setValorMes('2026-12', null);
  assert.equal(l.orcamento('2026-12').estado, 'sem');
});

test('preço no caixa: no carrinho soma o pago e a conta do mês usa o real', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as] = l.mercados();
  const a = produto(l, mes, 'Arroz'), s = produto(l, mes, 'Sal'), b = produto(l, mes, 'Banha');
  l.setQtd(mes, a.id, 2); l.setPreco(mes, a.id, at.id, 20); l.setPreco(mes, a.id, as.id, 21);
  l.setQtd(mes, s.id, 1); l.setPreco(mes, s.id, at.id, 3);
  l.setQtd(mes, b.id, 1);
  l.setValorMes(mes, 100);
  assert.equal(l.orcamento(mes).planejado, 43);
  // arroz custou 22,50 no caixa (pesquisado 20) e levou 3 em vez de 2
  l.pagarNoCaixa(mes, a.id, { mid: at.id, preco: 22.5, qtd: 3 });
  let o = l.orcamento(mes);
  assert.equal(o.noCarrinho, 67.5);
  assert.equal(o.planejado, 70.5, 'pago 67,50 + sal estimado 3');
  assert.equal(o.difCaixa, 27.5, '67,50 pago contra 40 pesquisado');
  assert.equal(l.preco(mes, a.id, at.id).preco, 22.5, 'pesquisa atualizada');
  const g = l.listaCompra(mes).grupos.find((x) => x.itens.some((i) => i.p.id === a.id));
  assert.equal(g.mercado.nome, 'Atacadão', 'continua no mercado onde comprou, mesmo ficando mais caro que o Assaí');
  // voltar ao pesquisado desfaz a atualização da pesquisa
  l.voltarAoPesquisado(mes, a.id);
  assert.equal(l.preco(mes, a.id, at.id).preco, 20);
  assert.equal(l.orcamento(mes).noCarrinho, 40);
  // item sem preço pesquisado: diz onde comprou e quanto pagou
  l.pagarNoCaixa(mes, b.id, { mid: as.id, preco: 15, qtd: 1, atualizarPesquisa: false });
  o = l.orcamento(mes);
  assert.equal(o.semPreco, 0);
  assert.equal(o.noCarrinho, 55);
  assert.equal(o.difCaixa, 0, 'sem pesquisado não entra na diferença');
  assert.equal(l.preco(mes, b.id, as.id), null);
  l.limparCompra(mes);
  assert.equal(l.orcamento(mes).noCarrinho, 0);
});

test('tirar da lista: zera a quantidade e limpa a marcação; desfazer volta', () => {
  const l = nova();
  const mes = '2026-10';
  const a = produto(l, mes, 'Arroz');
  l.setQtd(mes, a.id, 2); l.setPreco(mes, a.id, l.mercados()[0].id, 20);
  l.marcarCompra(mes, a.id, true);
  const desfazer = l.tirarDaLista(mes, a.id);
  assert.equal(l.produto(mes, a.id).qtd, null);
  assert.equal(l.listaCompra(mes).itens, 0);
  assert.ok(l.produto(mes, a.id), 'produto continua na lista de preços');
  desfazer();
  assert.equal(l.produto(mes, a.id).qtd, 2);
  assert.equal(l.listaCompra(mes).feitos, 1);
});

test('modo moeda: dígitos viram centavos; com vírgula ou conta fica como digitado', () => {
  assert.equal(moedaDeDigitos('2290'), '22,90');
  assert.equal(moedaDeDigitos('5'), '0,05');
  assert.equal(moedaDeDigitos('22,905'), '229,05', 'mais um dígito depois de 22,90');
  assert.equal(moedaDeDigitos('2,2'), '0,22', 'apagar um dígito de 22,90');
  assert.equal(moedaDeDigitos('1234567'), '12.345,67');
  assert.equal(moedaDeDigitos(''), '');
  assert.equal(moedaDeDigitos('36,98/3'), null);
  assert.equal(lerExpr(moedaDeDigitos('2290')), 22.9);
});

test('tamanho na marca e preço por kg/litro/unidade', () => {
  assert.deepEqual(lerTamanho('Camil 5kg'), { qtd: 5, base: 'kg' });
  assert.deepEqual(lerTamanho('Pepsi 1,5L'), { qtd: 1.5, base: 'L' });
  assert.deepEqual(lerTamanho('Danubio 300g'), { qtd: 0.3, base: 'kg' });
  assert.deepEqual(lerTamanho('12x350ml'), { qtd: 4.2, base: 'L' });
  assert.deepEqual(lerTamanho('Snob 360 c/3'), { qtd: 3, base: 'un' });
  assert.deepEqual(lerTamanho('Cotonela 150un'), { qtd: 150, base: 'un' });
  assert.equal(lerTamanho('Pratsy 0,45x7,5m'), null);
  assert.equal(lerTamanho('Aviação'), null);
  const l = nova();
  const mes = '2026-10';
  const [at, as, sam] = l.mercados();
  const a = produto(l, mes, 'Arroz');
  l.setPreco(mes, a.id, at.id, 6.5); l.setMarca(mes, a.id, at.id, 'Camil 1kg');
  l.setPreco(mes, a.id, as.id, 24.9); l.setMarca(mes, a.id, as.id, 'Camil 5kg');
  l.setPreco(mes, a.id, sam.id, 7);
  const c = l.calcProduto(mes, a.id);
  assert.equal(c.nomeMercMenor, 'Atacadão', 'menor preço da embalagem');
  const pu = porUnidade(c);
  assert.equal(pu.base, 'kg');
  assert.equal(pu.melhor.nome, 'Assaí');
  assert.equal(pu.melhor.porUnid.toFixed(2), '4.98');
  assert.equal(pu.difere, true);
  // mesmo tamanho em todos: nada a dizer
  const b = produto(l, mes, 'Sal');
  l.setPreco(mes, b.id, at.id, 2); l.setMarca(mes, b.id, at.id, 'Lebre 1kg');
  l.setPreco(mes, b.id, as.id, 3);
  assert.equal(porUnidade(l.calcProduto(mes, b.id)), null);
});

test('variação em relação ao mês anterior compara o que é comparável', () => {
  const r = (preco, marca = '') => ({ preco, marca });
  assert.equal(Math.round(variacaoPreco(r(5.5), r(5))), 10, 'sem tamanho: preço da embalagem');
  assert.equal(Math.round(variacaoPreco(r(4.2, 'Camil 1kg'), r(22.5, 'Camil 5kg'))), -7, '1kg x 5kg: compara por kg');
  assert.equal(variacaoPreco(r(4.2, 'Camil 1kg'), r(22.5, 'Tio João')), null, 'tamanho desconhecido e marca diferente');
  assert.equal(variacaoPreco(r(4.2, 'Camil 1kg'), r(4, 'Camil 1L')), null, 'kg x litro');
  assert.equal(variacaoPreco(r(null), r(5)), null);
});

test('repetir quantidades do mês anterior (só onde está vazio)', () => {
  const l = nova();
  const [a, s] = [produto(l, '2026-10', 'Arroz'), produto(l, '2026-10', 'Sal')];
  l.setQtd('2026-10', a.id, 2); l.setQtd('2026-10', s.id, 1);
  l.criarMes('2026-11', { de: '2026-10' });
  l.setQtd('2026-11', s.id, 5);
  const { n, desfazer } = l.repetirQuantidades('2026-11', '2026-10');
  assert.equal(n, 1);
  assert.equal(l.produto('2026-11', a.id).qtd, 2);
  assert.equal(l.produto('2026-11', s.id).qtd, 5, 'não sobrescreve o que já tinha');
  desfazer();
  assert.equal(l.produto('2026-11', a.id).qtd, null);
});

test('rota sugerida: menos mercados pagando quase o mesmo', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as, sam] = l.mercados();
  const itens = [['Arroz', 20, 21, 30], ['Sal', 3, 2, 5], ['Banha', 10, 11, 9.5], ['Leite desnatado', 5, 5.2, 6]];
  for (const [nome, x, y, z] of itens) {
    const p = produto(l, mes, nome);
    l.setQtd(mes, p.id, 1);
    l.setPreco(mes, p.id, at.id, x); l.setPreco(mes, p.id, as.id, y); l.setPreco(mes, p.id, sam.id, z);
  }
  const r = l.sugerirRota(mes);
  assert.equal(r.usados, 3);
  assert.equal(r.ideal, 20 + 2 + 9.5 + 5);
  const um = r.opcoes.find((o) => o.ids.length === 1);
  assert.deepEqual([um.mercados[0].nome, um.total, um.extra], ['Atacadão', 38, 1.5]);
  const dois = r.opcoes.find((o) => o.ids.length === 2);
  assert.deepEqual([dois.mercados.map((m) => m.nome).join('+'), dois.extra], ['Atacadão+Assaí', 0.5]);
});

test('valor do mês vai para o Excel e volta', async () => {
  const l = nova();
  l.setValorMes('2026-10', 850.5);
  const blob = await exportarPlanilha(l, ['2026-10']);
  const meses = await lerPlanilha(await blob.arrayBuffer(), { anoPadrao: 2026 });
  assert.equal(meses[0].orcamento, 850.5);
  assert.equal(meses[0].itens.length, l.produtos('2026-10').length, 'linhas do valor não viram produto');
  const l2 = new Loja();
  aplicarImportacao(l2, meses);
  assert.equal(l2.valorMes('2026-10'), 850.5);
});

test('várias listas no mês: preços compartilhados, quantidades e compra separadas', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as] = l.mercados();
  const a = produto(l, mes, 'Arroz'), s = produto(l, mes, 'Sal'), b = produto(l, mes, 'Banha');
  l.setPreco(mes, a.id, at.id, 20); l.setPreco(mes, s.id, as.id, 3); l.setPreco(mes, b.id, at.id, 10);
  l.setQtd(mes, a.id, 2); l.setQtd(mes, s.id, 1); l.setQtd(mes, b.id, 1);
  l.marcarCompra(mes, a.id, true);
  assert.equal(l.nomeLista(mes), 'Outubro 2026', 'com uma lista só, o nome continua o do mês');
  // "com o que faltou": só sal e banha (o arroz já foi comprado)
  const nome = l.proximoNomeLista(mes);
  assert.equal(nome, 'Outubro nº 2');
  const l2 = l.criarLista(mes, { nome, de: mes, modo: 'faltou' });
  assert.deepEqual(l.listas(mes), [mes, l2]);
  assert.equal(l.nomeLista(mes), 'Outubro nº 1');
  assert.equal(l.produto(l2, a.id).qtd, null);
  assert.equal(l.produto(l2, s.id).qtd, 1);
  // preço é do mês: mudar numa lista vale nas duas
  l.setPreco(l2, s.id, as.id, 2.5);
  assert.equal(l.preco(mes, s.id, as.id).preco, 2.5);
  // quantidade e marcação são de cada lista
  l.setQtd(l2, s.id, 4);
  assert.equal(l.produto(mes, s.id).qtd, 1);
  assert.equal(l.listaCompra(l2).feitos, 0);
  assert.equal(l.listaCompra(mes).feitos, 1);
  // valor do mês soma as listas; lista com limite próprio compara só ela
  l.setValorMes(mes, 100);
  let o = l.orcamento(mes);
  assert.equal(o.planejado, 2 * 20 + 2.5 + 10 + 4 * 2.5 + 10);
  assert.equal(o.porLista.length, 2);
  l.setValorLista(l2, 15);
  o = l.orcamento(l2);
  assert.deepEqual([o.tipo, o.planejado, o.estado], ['lista', 20, 'passou']);
  assert.equal(l.orcamento(mes).tipo, 'mes');
  // renomear e excluir
  l.renomearLista(l2, 'Churrasco');
  assert.equal(l.nomeLista(l2), 'Churrasco');
  assert.throws(() => l.excluirLista(mes));
  const desfazer = l.excluirLista(l2);
  assert.deepEqual(l.listas(mes), [mes]);
  assert.equal(l.existeLista(l2), false);
  desfazer();
  assert.equal(l.produto(l2, s.id).qtd, 4);
  // produto novo numa lista extra: entra no mês, quantidade só na lista
  const pid = l.addProduto(l2, { nome: 'Carvão', cat: l.categorias()[0].id, qtd: 2 });
  assert.equal(l.produto(mes, pid).qtd, null);
  assert.equal(l.produto(l2, pid).qtd, 2);
  // excluir o mês leva as listas junto
  l.excluirMes(mes);
  assert.equal(l.existeLista(l2), false);
  assert.equal(l.recs.get(`q:${l2}:${s.id}`).v, null);
});

test('Excel com várias listas: uma aba por lista e volta como lista', async () => {
  const l = nova();
  const mes = '2026-10';
  const a = produto(l, mes, 'Arroz');
  l.setPreco(mes, a.id, l.mercados()[0].id, 20);
  l.setQtd(mes, a.id, 2);
  const l2 = l.criarLista(mes, { nome: 'Churrasco', orcamento: 300 });
  l.setQtd(l2, a.id, 5);
  const blob = await exportarPlanilha(l, [mes]);
  const abas = await lerPlanilha(await blob.arrayBuffer(), { anoPadrao: 2026 });
  assert.deepEqual(abas.map((x) => [x.aba, x.id]), [['Outubro', mes], ['Churrasco - Outubro', mes]]);
  const n = new Loja();
  aplicarImportacao(n, abas);
  const [principal, extra] = n.listas(mes);
  assert.equal(n.nomeLista(extra), 'Churrasco');
  assert.equal(n.valorLista(extra), 300);
  const arroz = n.produtos(mes).find((p) => p.nome === 'Arroz');
  assert.equal(n.produto(principal, arroz.id).qtd, 2);
  assert.equal(n.produto(extra, arroz.id).qtd, 5);
  assert.equal(n.preco(extra, arroz.id, n.mercados()[0].id).preco, 20);
});

test('feedback: entra como novo e muda de status', () => {
  const l = nova();
  const id = l.addFeedback({ tipo: 'ideia', texto: 'Ordenar por corredor', versao: '1.7.0', tela: 'compra' });
  assert.equal(l.feedbacks()[0].status, 'novo');
  l.editarFeedback(id, { status: 'resolvido', resposta: 'Feito na 1.8' });
  assert.deepEqual([l.feedbacks()[0].status, l.feedbacks()[0].resposta], ['resolvido', 'Feito na 1.8']);
});

test('sincronização: vence a mudança mais recente; restaurar cópia', () => {
  assert.ok(vence({ u: 2, v: 1 }, { u: 1, v: 2 }));
  assert.ok(!vence({ u: 1, v: 1 }, { u: 2, v: 2 }));
  const a = nova();
  const b = new Loja();
  b.aplicarRemotos(a.todos());
  assert.equal(b.produtos('2026-10').length, a.produtos('2026-10').length);
  const copia = a.todos().map((r) => ({ ...r }));
  const p = produto(a, '2026-10', 'Sal');
  a.editarProduto('2026-10', p.id, { nome: 'Sal grosso' });
  a.restaurar(copia);
  assert.equal(a.produto('2026-10', p.id).nome, 'Sal');
});

const PLANILHA = process.env.PLANILHA;
test('planilha real: importa os meses e bate os totais do Excel', { skip: !PLANILHA || !existsSync(PLANILHA) }, async () => {
  const meses = await lerPlanilha(readFileSync(PLANILHA), { anoPadrao: 2026 });
  const l = new Loja();
  aplicarImportacao(l, meses);
  assert.equal(l.calcMes('2026-07').totalGeral.toFixed(2), '976.47');
  assert.equal(l.calcMes('2026-08').totalGeral.toFixed(2), '911.35');
  assert.equal(l.calcMes('2026-09').totalGeral.toFixed(2), '865.61');
  assert.equal(l.categorias().length, 12);
  // ida e volta: exportar e importar de novo dá os mesmos totais
  const blob = await exportarPlanilha(l);
  const de = await lerPlanilha(await blob.arrayBuffer(), { anoPadrao: 2026 });
  const l2 = new Loja();
  aplicarImportacao(l2, de);
  for (const m of l.meses()) assert.equal(l2.calcMes(m).totalGeral.toFixed(2), l.calcMes(m).totalGeral.toFixed(2));
  // mesmo produto em meses diferentes fica ligado (histórico)
  const leite = l.produtos('2026-09').find((p) => p.nome === 'Leite desnatado');
  assert.ok(l.historico(leite.id).series.length >= 3);
});

test('importar: fórmula compartilhada na marca não vira "0"', async () => {
  const { criarZip } = await import('../app/js/planilha.js');
  const c = (r, v, extra = '') => `<c r="${r}"${extra}>${v}</c>`;
  const is = (r, t) => `<c r="${r}" t="inlineStr"><is><t>${t}</t></is></c>`;
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="4">${is('A4', 'Produto')}${is('B4', 'Qdt.')}${is('C4', 'Atacadão')}${is('F4', 'Assaí')}${is('I4', 'Menor Preço')}</row>
<row r="5">${is('C5', 'Preço')}${is('D5', 'Total')}${is('E5', 'Marca/Tamanho')}${is('F5', 'Preço')}${is('G5', 'Total')}${is('H5', 'Marca/Tamanho')}</row>
<row r="6">${is('A6', '▸ Mercearia')}</row>
<row r="7">${is('A7', 'Arroz')}${c('B7', '<v>1</v>')}${c('C7', '<v>20</v>')}${is('E7', 'Camil')}${c('H7', '<f t="shared" ref="H7:H8" si="0">$E7</f><v>Camil</v>', ' t="str"')}</row>
<row r="8">${is('A8', 'Feijão')}${c('H8', '<f t="shared" si="0"/><v>0</v>')}</row>
</sheetData></worksheet>`;
  const blob = await criarZip([
    { nome: 'xl/workbook.xml', texto: '<workbook xmlns:r="r"><sheets><sheet name="Outubro" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { nome: 'xl/_rels/workbook.xml.rels', texto: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { nome: 'xl/worksheets/sheet1.xml', texto: sheet },
  ]);
  const [m] = await lerPlanilha(await blob.arrayBuffer(), { anoPadrao: 2026 });
  assert.deepEqual(m.itens.find((i) => i.nome === 'Arroz').precos['Assaí'], { preco: null, marca: 'Camil', auto: true });
  assert.deepEqual(m.itens.find((i) => i.nome === 'Feijão').precos, {});
});

test('exportar: abas por mês, colunas por mercado ativo e fórmulas', async () => {
  const l = nova();
  const mes = '2026-10';
  const p = produto(l, mes, 'Sal');
  l.setQtd(mes, p.id, 2);
  l.setPreco(mes, p.id, l.mercados()[1].id, 2.5);
  l.addMercado('Extra');
  const blob = await exportarPlanilha(l, [mes]);
  const meses = await lerPlanilha(await blob.arrayBuffer(), { anoPadrao: 2026 });
  assert.equal(meses[0].aba, 'Outubro');
  assert.deepEqual(meses[0].mercados, ['Atacadão', 'Assaí', "Sam's Club", 'Carrefour', 'COOP', 'Extra']);
  const sal = meses[0].itens.find((i) => i.nome === 'Sal');
  assert.equal(sal.qtd, 2);
  assert.equal(sal.precos['Assaí'].preco, 2.5);
});

test('gôndola: anota sem pôr no carrinho, orçado congela no 1º toque e não muda com a pesquisa', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as] = l.mercados();
  const a = produto(l, mes, 'Arroz'), s = produto(l, mes, 'Sal');
  l.setQtd(mes, a.id, 2); l.setPreco(mes, a.id, at.id, 20); l.setPreco(mes, a.id, as.id, 21.5);
  l.setQtd(mes, s.id, 1); l.setPreco(mes, s.id, at.id, 3);
  assert.equal(l.orcado(mes), null, 'antes de começar a compra não há orçado');
  // primeiro toque: só anotar o preço da gôndola (22 no Atacadão), sem marcar
  l.pagarNoCaixa(mes, a.id, { mid: at.id, preco: 22, qtd: 2, pegar: false });
  const oc = l.orcado(mes);
  assert.equal(oc.total, 43, 'orçado = lista antes da gôndola (20×2 + 3)');
  assert.deepEqual(oc.itens[a.id], [20, at.id]);
  let lc = l.listaCompra(mes);
  const it = lc.grupos.flatMap((g) => g.itens).find((i) => i.p.id === a.id);
  assert.equal(it.ok, false, 'anotado, mas ainda fora do carrinho');
  assert.deepEqual([it.pago.preco, it.total, it.totalEst], [22, 44, 40]);
  assert.equal(lc.total, 47);
  assert.equal(l.preco(mes, a.id, at.id).preco, 22, 'gôndola atualiza a pesquisa');
  // a pesquisa muda depois: o orçado continua o mesmo
  l.setPreco(mes, s.id, at.id, 5);
  assert.equal(l.orcado(mes).total, 43);
  l.marcarCompra(mes, s.id, true);
  assert.equal(l.orcado(mes).total, 43, 'marcar não recongela');
  l.congelarOrcado(mes, { forcar: true });
  assert.equal(l.orcado(mes).total, 45, 'atualizar: arroz fica no orçado antigo (20×2), sal no novo (5)');
  // desmarcar tudo recomeça a compra (orçado sai junto)
  l.limparCompra(mes);
  assert.equal(l.orcado(mes), null);
  l.marcarCompra(mes, s.id, true);
  assert.equal(l.orcado(mes).total, 49, 'novo orçado com a pesquisa atual (22×2 + 5)');
});

test('gôndola 10% acima do orçado com mercado mais barato na rota: avisa e leva para lá', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as, sam] = l.mercados();
  const a = produto(l, mes, 'Arroz');
  l.setQtd(mes, a.id, 1); l.setPreco(mes, a.id, at.id, 20); l.setPreco(mes, a.id, as.id, 21);
  l.marcarCompra(mes, produto(l, mes, 'Arroz').id, false); // ainda não começou: sem orçado, usa a pesquisa
  assert.equal(l.alertaGondola(mes, a.id, at.id, 21.9), null, 'subiu 9,5%: não avisa');
  const al = l.alertaGondola(mes, a.id, at.id, 22);
  assert.deepEqual([al.pct, al.ref, al.alt.nome, al.alt.preco], [10, 20, 'Assaí', 21]);
  assert.equal(l.alertaGondola(mes, a.id, at.id, 20.5 * 1.2 > 21 ? 20.9 : 0), null);
  l.setForaCompra(mes, as.id, true);
  assert.equal(l.alertaGondola(mes, a.id, at.id, 25), null, 'Assaí fora da rota: sem alternativa, sem aviso');
  l.setForaCompra(mes, as.id, false);
  assert.equal(l.alertaGondola(mes, a.id, at.id, 20.5 + 1), null, 'mais caro que o orçado, mas abaixo de 10%');
  // levar para o Assaí: grava a gôndola no Atacadão e o item muda de grupo
  const desfazer = l.levarPara(mes, a.id, { mid: at.id, para: as.id, preco: 24 });
  assert.equal(l.preco(mes, a.id, at.id).preco, 24);
  const g = l.listaCompra(mes).grupos.find((x) => x.itens.some((i) => i.p.id === a.id));
  assert.equal(g.mercado.id, as.id);
  assert.equal(l.orcado(mes).total, 20, 'orçado congelado antes de mexer na pesquisa');
  desfazer();
  assert.equal(l.preco(mes, a.id, at.id).preco, 20);
  assert.equal(l.orcado(mes), null);
  void sam;
});

test('marcas aceitas: o mais barato, a compra e a rota ignoram as outras marcas', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, as, sam] = l.mercados();
  const a = produto(l, mes, 'Arroz');
  l.setQtd(mes, a.id, 1);
  l.setPreco(mes, a.id, at.id, 18); l.setMarca(mes, a.id, at.id, 'Kika 5kg');
  l.setPreco(mes, a.id, as.id, 22); l.setMarca(mes, a.id, as.id, 'Camil 5kg');
  l.setPreco(mes, a.id, sam.id, 23); l.setMarca(mes, a.id, sam.id, 'Tio João 5kg');
  assert.equal(l.calcProduto(mes, a.id).nomeMercMenor, 'Atacadão');
  l.setMarcasAceitas(a.id, ['Camil', 'tio joao', ' ', 'Camil']);
  assert.deepEqual(l.marcasAceitas(a.id), ['Camil', 'tio joao'], 'sem vazios nem repetidas');
  const c = l.calcProduto(mes, a.id);
  assert.deepEqual([c.menor, c.nomeMercMenor, c.pesquisados], [22, 'Assaí', 3]);
  assert.equal(c.linhas[0].aceita, false);
  assert.equal(l.listaCompra(mes).grupos.find((g) => g.itens.length).mercado.nome, 'Assaí');
  assert.equal(l.calcMes(mes).sub.get(at.id).itens, 0, 'subtotal do Atacadão não conta a marca recusada');
  assert.equal(l.sugerirRota(mes).ideal, 22);
  // vale nos outros meses (mesmo pid) e "qualquer marca" desfaz
  l.criarMes('2026-11', { de: mes, copiarQtd: true });
  l.setPreco('2026-11', a.id, at.id, 10);
  l.setPreco('2026-11', a.id, as.id, 22);
  assert.equal(l.calcProduto('2026-11', a.id).menor, 22, 'Kika continua fora em novembro (marca copiada)');
  l.setMarcasAceitas(a.id, []);
  assert.equal(l.calcProduto(mes, a.id).menor, 18);
  assert.equal(l.get(`mc:${a.id}`), null);
  // marca em branco não é recusada (não dá para saber)
  l.setMarcasAceitas(a.id, ['Camil']);
  l.setMarca(mes, a.id, at.id, '');
  assert.equal(l.calcProduto(mes, a.id).menor, 18);
});

test('sugestões de marca: nome sem tamanho, usadas no histórico e comuns no Brasil', () => {
  assert.deepEqual(['Camil 5kg', 'Snob c/3', 'Pepsi 12x350ml', 'Ypê 5L', 'Tio João 5 kg', 'Nescau 2.0 370g'].map(nomeDaMarca),
    ['Camil', 'Snob', 'Pepsi', 'Ypê', 'Tio João', 'Nescau 2.0']);
  assert.equal(marcasComuns('Arroz')[0], 'Camil 5kg');
  assert.equal(marcasComuns('Creme de leite')[0], 'Nestlé 200g', 'não confunde com leite');
  assert.equal(marcasComuns('Pão de queijo congelado')[0], 'Forno de Minas 1kg', 'não confunde com queijo');
  assert.equal(marcasComuns('Salame')[0], 'Sadia', 'sal só como palavra inteira');
  assert.deepEqual(marcasComuns('Alface'), []);
  const l = nova();
  const a = produto(l, '2026-10', 'Arroz');
  const [at, as] = l.mercados();
  l.setMarca('2026-10', a.id, at.id, 'Camil 5kg');
  l.criarMes('2026-11', { de: '2026-10' });
  l.setMarca('2026-11', a.id, as.id, 'Prato Fino 5kg');
  assert.deepEqual(l.marcasUsadas(a.id), ['Camil 5kg', 'Prato Fino 5kg']);
});

test('lista extra: excluir leva junto o orçado congelado', () => {
  const l = nova();
  const id = l.criarLista('2026-10', { nome: 'Churrasco' });
  const a = produto(l, '2026-10', 'Arroz');
  l.setQtd(id, a.id, 1); l.setPreco(id, a.id, l.mercados()[0].id, 20);
  l.marcarCompra(id, a.id, true);
  assert.equal(l.orcado(id).total, 20);
  assert.equal(l.orcado('2026-10'), null, 'o orçado é de cada lista');
  l.excluirLista(id);
  assert.equal(l.get(`oc:${id}`), null);
});

const textoNota = readFileSync(new URL('./fixtures/nfce-sp.txt', import.meta.url), 'utf8');

test('nota fiscal (Sefaz-SP): lê itens, totais, loja e data do texto copiado — e nada do consumidor', () => {
  const n = lerNota(textoNota);
  assert.equal(n.loja, 'SUPERMERCADO EXEMPLO LTDA');
  assert.equal(n.cnpj, '11222333000181');
  assert.equal(n.emissao, '2026-10-21T18:57:27');
  assert.deepEqual(n.itens.map((i) => [i.desc, i.cod, i.qtd, i.un, i.vUnit, i.vTotal]), [
    ['FARINHA CAPUTO 00 DO', 'S153585', 4, 'UNID', 17.98, 71.92],
    ['REQUEIJAO LIGHT CATU', 'S259115', 2, 'UNID', 18.98, 37.96],
    ['BALAS GELATINA HALLO', 'S247989', 1, 'UNID', 24.98, 24.98],
  ]);
  assert.deepEqual([n.qtdItens, n.total, n.desconto, n.completa], [3, 134.86, 0, true]);
  assert.equal(n.chave, '35261011222333000181650130000999991999999999');
  assert.doesNotMatch(JSON.stringify(n), /FULANA|SOCIO|Consumidor|TC 0/);
  // item por peso, desconto e texto incompleto
  const peso = lerNota('Loja X\nCNPJ: 12.345.678/0001-90\nPATINHO MOIDO (Código: 77 )\nQtde.:0,734 UN: KG Vl. Unit.: 49,90 Vl. Total\n36,63\nQtd. total de itens:2\nValor total R$:36,63\nDescontos R$:1,00\nValor a pagar R$:35,63');
  assert.deepEqual([peso.itens[0].qtd, peso.itens[0].un, peso.desconto, peso.total, peso.completa], [0.734, 'KG', 1, 35.63, false]);
  assert.equal(lerNota('qualquer coisa').itens.length, 0);
});

test('QR da nota: chave, CNPJ e só links de site do governo', () => {
  const qr = 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35261011222333000181650130000999991999999999|2|1|2|b9be120e';
  assert.equal(lerChave(qr), '35261011222333000181650130000999991999999999');
  assert.deepEqual(partesDaChave(lerChave(qr)), { uf: '35', aamm: '2610', cnpj: '11222333000181', modelo: '65', numero: 99999 });
  assert.equal(linkDeNota(qr), qr);
  assert.equal(linkDeNota('https://golpe.com/?p=35261011222333000181650130000999991999999999'), null);
  assert.equal(linkDeNota('http://www.nfce.fazenda.sp.gov.br/x?p=35261011222333000181650130000999991999999999'), null);
});

test('nota fiscal: liga itens à lista, aprende o código, audita contra a gôndola e entra no valor do mês', () => {
  const l = nova();
  const mes = '2026-10';
  const sam = mercado(l, "Sam's Club"), at = mercado(l, 'Atacadão');
  const req = produto(l, mes, 'Requeijão light'), far = produto(l, mes, 'Farinha de trigo'), ger = produto(l, mes, 'Sal');
  l.setQtd(mes, req.id, 2); l.setPreco(mes, req.id, sam.id, 17.5); l.setPreco(mes, req.id, at.id, 19);
  l.setQtd(mes, far.id, 4); l.setPreco(mes, far.id, sam.id, 18);
  l.setQtd(mes, ger.id, 1); l.setPreco(mes, ger.id, sam.id, 2);
  l.setValorMes(mes, 200);
  // na loja: gôndola do requeijão 16,98 (nota cobrou 18,98) e o sal foi pro carrinho
  l.pagarNoCaixa(mes, req.id, { mid: sam.id, preco: 16.98, qtd: 2 });
  l.marcarCompra(mes, ger.id, true);
  const n = lerNota(textoNota);
  const v = n.itens.map((i) => l.vincularItem(mes, n.cnpj, i));
  assert.deepEqual(v.map((x) => x.pid), [null, req.id, null], 'requeijão pelo nome; farinha e bala ficam para ela escolher');
  assert.equal(l.sugerirVinculos(mes, 'FARINHA CAPUTO 00 DO')[0].p.nome.startsWith('Farinha'), true);
  n.itens[0].pid = far.id; n.itens[1].pid = req.id; // a bala fica fora da lista
  l.salvarNota(n, { lista: mes, mid: sam.id });
  assert.equal(l.mercadoDoCnpj('11222333000199'), sam.id, 'outra loja da mesma rede');
  assert.equal(l.vincularItem(mes, n.cnpj, n.itens[0]).como, 'codigo', 'na próxima nota a farinha liga sozinha pelo código');
  assert.equal(l.preco(mes, far.id, sam.id).preco, 17.98, 'nota atualiza a pesquisa');
  const lc = l.listaCompra(mes);
  const itReq = lc.grupos.flatMap((g) => g.itens).find((i) => i.p.id === req.id);
  assert.deepEqual([itReq.ok, itReq.nota.preco, itReq.total], [true, 18.98, 37.96], 'vale o da nota (nota > gôndola > orçado)');
  const au = l.auditarNota(n.chave);
  assert.deepEqual(au.acimaGondola.map((x) => [x.nome, x.gondola, x.acima]), [['Requeijão light', 16.98, 4]]);
  assert.equal(au.direito, 4);
  assert.deepEqual(au.fora.map((i) => i.desc), ['BALAS GELATINA HALLO']);
  assert.equal(au.totalFora, 24.98);
  assert.deepEqual(au.naoCobrados.map((i) => i.p.nome), ['Sal'], 'marcado no carrinho do Sam\'s, mas não está na nota');
  assert.deepEqual([au.esperado, au.notaDosEsperados], [105.96, 109.88], 'esperado: farinha no orçado 18×4, requeijão na gôndola 16,98×2');
  assert.deepEqual(au.maisBarato.map((x) => [x.nome, x.refTipo, x.dif]), [['Farinha de trigo', 'orcado', -0.08]], 'farinha saiu 17,98 (orçado 18)');
  assert.deepEqual(au.maisCaro, [], 'o requeijão já aparece como acima da gôndola');
  const o = l.orcamento(mes);
  assert.equal(o.foraLista, 24.98);
  assert.equal(o.planejado, 71.92 + 37.96 + 2 + 24.98, 'valor do mês usa o gasto real, inclusive o que estava fora da lista');
  // ler a mesma nota de novo não duplica; excluir desfaz a marcação da nota
  assert.equal(l.notas().length, 1);
  const desfazer = l.excluirNota(n.chave);
  assert.equal(l.notas().length, 0);
  assert.equal(l.listaCompra(mes).grupos.flatMap((g) => g.itens).find((i) => i.p.id === req.id).nota, undefined);
  desfazer();
  assert.equal(l.auditarNota(n.chave).direito, 4);
  l.excluirMes(mes);
  assert.equal(l.notas().length, 0, 'nota sai junto com o mês');
});

test('nomes abreviados da nota: reconhece sozinho quando não há dúvida, sugere quando há', () => {
  const l = nova();
  const mes = '2026-10';
  const liga = (desc) => { const v = l.vincularItem(mes, '11222333000181', { desc, cod: '' }); return v.pid ? l.produto(mes, v.pid).nome : v.sugestao ? `? ${l.produto(mes, v.sugestao).nome}` : null; };
  assert.deepEqual(palavrasNota('LT DESN ITALAC 1L'), ['leite', 'desn', 'italac']);
  const casos = {
    'SAB LIQ PROTEX 250ML': 'Sabonete líquido p/mãos',
    'LT DESN ITALAC 1L': 'Leite desnatado',
    'QJO MUSS FAT KG': 'Queijo mussarela',
    'PAP HIG NEVE FD 12UN': 'Papel higiênico',
    'REFRIG COCA COLA 2L': 'Refrigerante',
    'IOG NAT DESN BATAVO': 'Iogurte desnatado',
    'MOLHO TOM POMAROLA': 'Molho de tomate',
    'EXT TOMATE ELEFANTE': 'Extrato de tomate',
    'LEITE COND MOCA 395G': 'Leite condensado',
    'AMAC COMFORT 1L': 'Amaciante',
    'ACHOC PO NESCAU 370G': 'Achocolatado',
    'FEIJAO CARIOCA KICALDO 1KG': 'Feijão carioca',
    'OVOS BRANCOS GDE C/30': 'Ovo',
    'ARROZ T1 CAMIL 5KG': 'Arroz',
    'REQUEIJAO LIGHT CATU': 'Requeijão light',
    'SAB BARRA YPE 5X180G': 'Sabão em barra',
  };
  for (const [desc, nome] of Object.entries(casos)) assert.equal(liga(desc), nome, desc);
  // na dúvida, não liga sozinho: só sugere
  assert.equal(liga('SABONETE DOVE 90G'), '? Sabonete adulto', 'adulto, infantil e íntimo empatam');
  assert.equal(liga('FARINHA CAPUTO 00 DO'), '? Farinha de trigo', 'trigo × láctea: na dúvida pergunta');
  assert.equal(liga('BALAS GELATINA HALLO'), '? Gelatina sem sabor', 'gelatina não é o começo da nota');
  assert.equal(liga('SABONETE LEITE DE COCO'), '? Sabonete adulto', 'leite de coco não vira só porque as palavras aparecem');
  // a marca já anotada no produto tira a dúvida
  const far = produto(l, mes, 'Farinha de trigo');
  l.setMarca(mes, far.id, l.mercados()[0].id, 'Caputo 1kg');
  assert.equal(liga('FARINHA CAPUTO 00 DO'), 'Farinha de trigo');
});

test('nomes aprendidos: ligar à mão uma vez vale em qualquer mercado e para variações; dá para esquecer', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, sam] = [mercado(l, 'Atacadão'), mercado(l, "Sam's Club")];
  const sab = produto(l, mes, 'Sabonete adulto');
  l.setQtd(mes, sab.id, 3);
  const nota = (chave, cnpj, desc, cod) => ({ chave, cnpj, loja: 'X', emissao: '2026-10-21T10:00', total: 10, itens: [{ desc, cod, qtd: 3, un: 'UN', vUnit: 3, vTotal: 9 }] });
  // 1ª nota (Sam's): ela liga à mão
  const n1 = nota('1'.repeat(44), '11222333000181', 'SABONETE DOVE ORIGINAL 90G', 'S1');
  n1.itens[0].pid = sab.id;
  l.salvarNota(n1, { lista: mes, mid: sam.id });
  // outra rede, outro código, mesma descrição sem o tamanho → liga sozinho
  assert.deepEqual(l.vincularItem(mes, '75315333000109', { desc: 'SABONETE DOVE ORIGINAL 180G', cod: '9' }), { pid: sab.id, como: 'aprendido' });
  // variação parecida (outra fragrância) → reconhece pelo que aprendeu
  assert.equal(l.vincularItem(mes, '75315333000109', { desc: 'SABONETE DOVE KARITE 90G', cod: '8' }).pid, sab.id);
  assert.equal(l.nomesAprendidos().length, 1);
  // ela muda de ideia: a 2ª nota diz que é fora da lista → desaprende
  const n2 = nota('2'.repeat(44), '11222333000181', 'SABONETE DOVE ORIGINAL 90G', 'S1');
  assert.equal(l.vincularItem(mes, n2.cnpj, n2.itens[0]).como, 'codigo');
  n2.itens[0].pid = null;
  l.salvarNota(n2, { lista: mes, mid: at.id });
  assert.equal(l.vincularItem(mes, n2.cnpj, n2.itens[0]).como, null);
  assert.equal(l.nomesAprendidos().length, 0);
  // esquecer pela tela de nomes aprendidos apaga também o código
  l.salvarNota({ ...n1, chave: '3'.repeat(44) }, { lista: mes, mid: sam.id });
  l.esquecerNome(l.nomesAprendidos()[0].chave);
  assert.equal(l.get('vn:11222333:S1'), null);
  assert.equal(l.nomesAprendidos().length, 0);
});

test('lista da dieta: g/ml/un viram embalagens pela marca; lista separada, substitui ao trazer de novo, ou soma', () => {
  const l = nova();
  const mes = '2026-10';
  const [at] = l.mercados();
  const fr = produto(l, mes, 'Frango'), ov = produto(l, mes, 'Ovo'), le = produto(l, mes, 'Leite desnatado'), ba = produto(l, mes, 'Banana');
  l.setPreco(mes, fr.id, at.id, 20); l.setMarca(mes, fr.id, at.id, 'Sadia 1kg');
  l.setMarca(mes, ov.id, at.id, 'Mantiqueira c/30');
  l.setMarca(mes, le.id, at.id, 'Italac 1L');
  assert.deepEqual(l.embalagens(mes, fr.id, 1200, 'g').qtd, 2, '1.200 g de frango = 2 pacotes de 1 kg');
  assert.equal(l.embalagens(mes, fr.id, 1000, 'g').qtd, 1, 'exato não arredonda para cima');
  assert.equal(l.embalagens(mes, ov.id, 42, 'un').qtd, 2, '42 ovos = 2 cartelas de 30');
  assert.equal(l.embalagens(mes, le.id, 3500, 'ml').qtd, 4);
  assert.deepEqual(l.embalagens(mes, ba.id, 1800, 'g'), { qtd: 1.8, aviso: true }, 'sem tamanho: kg, para conferir');
  assert.deepEqual(l.embalagens(mes, null, 3, 'un'), { qtd: 3, aviso: false });
  assert.deepEqual(l.embalagens(mes, ba.id, null, 'g'), { qtd: 1, aviso: true });
  // lista separada
  l.setQtd(mes, fr.id, 1);
  const { id } = l.aplicarDieta(mes, [{ pid: fr.id, qtd: 2, desc: 'Peito de frango' }, { pid: ov.id, qtd: 2, desc: 'Ovo' }, { pid: fr.id, qtd: 1, desc: 'Sobrecoxa' }], { de: '2026-10-01', ate: '2026-10-31' });
  assert.equal(l.nomeLista(id), 'Dieta · Outubro');
  assert.equal(l.listaDaDieta(mes), id);
  assert.equal(l.produto(id, fr.id).qtd, 3, 'duas linhas da dieta no mesmo produto somam');
  assert.equal(l.produto(mes, fr.id).qtd, 1, 'lista da casa não muda');
  assert.equal(l.vincularItem(mes, '', { desc: 'Peito de frango' }).como, 'aprendido', 'aprende o nome da dieta');
  // trazer de novo substitui (não duplica a lista nem soma)
  const r2 = l.aplicarDieta(mes, [{ pid: ov.id, qtd: 1 }], { de: '2026-10-01', ate: '2026-10-07' });
  assert.equal(r2.id, id);
  assert.deepEqual([l.produto(id, fr.id).qtd, l.produto(id, ov.id).qtd], [null, 1]);
  assert.equal(l.listas(mes).length, 2);
  // somar na lista da casa
  const r3 = l.aplicarDieta(mes, [{ pid: fr.id, qtd: 2 }], { para: mes });
  assert.equal(l.produto(mes, fr.id).qtd, 3);
  r3.desfazer();
  assert.equal(l.produto(mes, fr.id).qtd, 1);
});

test('categorias sem IA: as regras concordam com a lista padrão e acertam nomes novos', () => {
  const l = nova();
  const nomeCat = new Map(l.categorias().map((c) => [c.id, c.nome]));
  let com = 0;
  for (const [cat, nome] of PRODUTOS_PADRAO) {
    const cid = l.categoriaPelaRegra(nome);
    if (cid) { com++; assert.equal(nomeCat.get(cid), cat, nome); }
  }
  assert.ok(com >= 120, `regras cobrem ${com} dos ${PRODUTOS_PADRAO.length} produtos padrão`);
  const sug = (nome) => { const s = l.sugerirCategoria(nome); return s && `${nomeCat.get(s.cid)} (${s.como})`; };
  assert.equal(sug('Peito de frango'), 'Carnes, aves, peixes e ovos (regra)');
  assert.equal(sug('Patinho moído'), 'Carnes, aves, peixes e ovos (regra)');
  assert.equal(sug('Tomates'), 'Frutas, verduras e legumes (memoria)');
  assert.equal(sug('Molho pesto'), 'Mercearia (regra)');
  assert.equal(sug('Fórmula infantil Nan'), 'Mercearia (memoria)', 'sem regra: o produto parecido decide');
  assert.equal(sug('Lasanha congelada'), 'Comidas prontas e congelados (regra)');
  assert.equal(sug('Água com gás'), 'Bebidas (regra)');
  assert.equal(sug('Água sanitária Qboa'), 'Bazar e limpeza (memoria)');
  assert.equal(sug('Xyz'), null);
  // as correções de vocês viram memória: Banha movida para Carnes → "Banha suína" vai para Carnes
  const banha = produto(l, '2026-10', 'Banha');
  const carnes = l.categorias().find((c) => c.nome.startsWith('Carnes')).id;
  l.editarProduto('2026-10', banha.id, { cat: carnes });
  assert.equal(sug('Banha suína'), 'Carnes, aves, peixes e ovos (memoria)');
  // funciona com categorias renomeadas
  l.renomearCategoria(carnes, 'Açougue');
  assert.equal(l.categorias().find((c) => c.id === l.categoriaPelaRegra('Picanha')).nome, 'Açougue');
});

test('otimizar: costuma comprar, repetidos, embalagem maior, sem preço, categoria errada; juntar produtos', () => {
  const l = nova();
  const [at, as] = l.mercados();
  const p = (nome) => produto(l, '2026-10', nome);
  // agosto e setembro com arroz; outubro sem
  l.criarMes('2026-08'); l.criarMes('2026-09');
  for (const m of ['2026-08', '2026-09']) { for (const x of l.produtos('2026-10')) l.set(`p:${m}:${x.id}`, { nome: x.nome, cat: x.cat, qtd: null, obs: '' }); l.setQtd(m, p('Arroz').id, 2); }
  l.setQtd('2026-09', p('Arroz').id, 3);
  // repetidos: "Tomate" e "Tomates"; a lista padrão já tem "Gelatina zero açúcar" duas vezes
  const tom2 = l.addProduto('2026-10', { nome: 'Tomates', cat: p('Tomate').cat, qtd: 2 });
  l.setQtd('2026-10', p('Tomate').id, 1); l.setPreco('2026-10', tom2, at.id, 9);
  // embalagem: sabão 5kg sai mais em conta por kg
  const sab = p('Sabão em barra');
  l.setQtd('2026-10', sab.id, 1);
  l.setPreco('2026-10', sab.id, at.id, 10); l.setMarca('2026-10', sab.id, at.id, 'Ypê 1kg');
  l.setPreco('2026-10', sab.id, as.id, 40); l.setMarca('2026-10', sab.id, as.id, 'Ypê 5kg');
  // categoria errada: "Peito de frango" incluído em Mercearia
  const merc = l.categorias().find((c) => c.nome === 'Mercearia').id;
  const peito = l.addProduto('2026-10', { nome: 'Peito de frango', cat: merc });
  const o = l.otimizar('2026-10');
  assert.deepEqual(o.costuma.map((x) => [x.p.nome, x.qtd, x.meses]), [['Arroz', 3, 2]]);
  assert.deepEqual(o.repetidos.map((g) => g.map((x) => x.nome).sort()).sort(), [['Gelatina zero açúcar', 'Gelatina zero açúcar'], ['Tomate', 'Tomates']]);
  assert.deepEqual(o.embalagem.map((x) => [x.p.nome, x.pu.melhor.nome]), [['Sabão em barra', 'Assaí']]);
  assert.deepEqual(o.semPreco.map((x) => x.nome), ['Tomate']);
  assert.deepEqual(o.categorias.map((x) => [x.p.nome, l.categorias().find((c) => c.id === x.para).nome]), [['Peito de frango', 'Carnes, aves, peixes e ovos']]);
  void peito;
  // juntar "Tomates" em "Tomate": soma a quantidade, traz o preço e o que foi aprendido; meses anteriores não mudam
  l.set('vd:tomates', { pid: tom2, desc: 'TOMATES' });
  const desfazer = l.juntarProdutos('2026-10', p('Tomate').id, tom2);
  assert.equal(l.produto('2026-10', tom2), null);
  assert.equal(p('Tomate').qtd, 3);
  assert.equal(l.preco('2026-10', p('Tomate').id, at.id).preco, 9);
  assert.equal(l.get('vd:tomates').pid, p('Tomate').id);
  desfazer();
  assert.equal(l.produto('2026-10', tom2).nome, 'Tomates');
});

test('perguntar ao Claude (copiar e colar): nota sem QR e categorias', () => {
  // resposta do Claude a partir da foto do cupom, no formato que o prompt pede
  const resposta = `ATACADAO S.A.
CNPJ: 75.315.333/0001-09
ARROZ T1 CAMIL 5KG (Código: 1 ) Qtde.:2 UN: UN Vl. Unit.: 24,90 Vl. Total 49,80
PATINHO MOIDO KG (Código: 2 ) Qtde.:0,734 UN: KG Vl. Unit.: 49,90 Vl. Total 36,63
Qtd. total de itens:2
Valor total R$:86,43
Descontos R$:0,00
Valor a pagar R$:86,43
Emissão: 28/10/2026 17:05:00`;
  const n = lerNota(resposta);
  assert.deepEqual([n.itens.length, n.total, n.completa, n.loja, n.cnpj], [2, 86.43, true, 'ATACADAO S.A.', '75315333000109']);
  assert.equal(n.chave, 'foto75315333000109202610281705008643', 'sem QR: identifica por CNPJ, data e total');
  assert.equal(lerNota(resposta).chave, n.chave, 'a mesma nota colada de novo não duplica');
  assert.equal(lerNota(resposta.replace(/Emissão.*/, '')).chave, null, 'sem data não dá para identificar');
  // categorias: "Produto => Categoria"
  assert.deepEqual(lerPares('Aqui está:\n- Peito de frango => Açougue\n2. "Kiwi" -> Hortifruti.\nWhey → Mercearia\nsem seta'),
    [['Aqui está', ''], ['Peito de frango', 'Açougue'], ['Kiwi', 'Hortifruti'], ['Whey', 'Mercearia']].filter(([, b]) => b));
});

test('preço da dieta por g/ml/un (para o app da dieta calcular o custo da semana)', () => {
  const l = nova();
  const mes = '2026-10';
  const [at, outro] = l.mercados();
  const fr = produto(l, mes, 'Frango'), ov = produto(l, mes, 'Ovo'), le = produto(l, mes, 'Leite desnatado'), ba = produto(l, mes, 'Banana');
  l.setPreco(mes, fr.id, at.id, 20); l.setMarca(mes, fr.id, at.id, 'Sadia 1kg');
  l.setPreco(mes, fr.id, outro.id, 25); l.setMarca(mes, fr.id, outro.id, 'Seara 1kg');
  l.setPreco(mes, ov.id, at.id, 24); l.setMarca(mes, ov.id, at.id, 'Mantiqueira c/30');
  l.setPreco(mes, le.id, at.id, 5); l.setMarca(mes, le.id, at.id, 'Italac 1L');
  assert.equal(l.precoDaDieta(mes, fr.id, 'g'), 0.02, 'menor preço ÷ 1 kg');
  assert.equal(l.precoDaDieta(mes, ov.id, 'un'), 0.8, 'cartela de 30');
  assert.equal(l.precoDaDieta(mes, le.id, 'ml'), 0.005);
  assert.equal(l.precoDaDieta(mes, fr.id, 'un'), null, 'unidade que não bate com o tamanho');
  assert.equal(l.precoDaDieta(mes, ba.id, 'g'), null, 'sem preço');
  l.setPreco(mes, ba.id, at.id, 4);
  assert.equal(l.precoDaDieta(mes, ba.id, 'un'), 4, 'sem tamanho: 1 por embalagem');
  assert.equal(l.precoDaDieta(mes, ba.id, 'g'), null, 'sem tamanho e em gramas: não dá para saber');
});
