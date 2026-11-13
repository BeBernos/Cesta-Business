// Nota fiscal: ler o QR, copiar a página da nota no navegador e colar aqui; ligar os itens à lista; conferir.
// A página da Sefaz bloqueia acesso automático, então quem abre a nota é a própria pessoa, no navegador dela.

import { app } from './ctx.js';
import { h, fmtRS, fmtQ, folha, confirmar, toast, fecharTodas } from './ui.js';
import { lerNota, linkDeNota } from './nota.js';
import { norm, mesDe } from './modelo.js';
import { copiarPromptNota } from './assistente.js';

export function conferirNota() {
  const txt = h('textarea', { class: 'entrada', placeholder: 'Ou segure o dedo aqui e toque em “Colar”', style: { minHeight: '90px' } });
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const ler = (texto) => {
    const n = lerNota(texto);
    if (!n.itens.length || !n.chave) {
      erro.textContent = 'Não achei os itens da nota nesse texto. Na página da nota, segure o dedo no texto → “Selecionar tudo” → “Copiar”, e cole de novo.';
      erro.hidden = false;
      return;
    }
    f.fechar();
    setTimeout(() => revisarNota(n), 60);
  };
  const colar = async () => {
    try { const t = await navigator.clipboard.readText(); if (t?.trim()) { txt.value = t; ler(t); return; } } catch { /* sem permissão: cola à mão */ }
    txt.focus();
    toast('Segure o dedo na caixa e toque em “Colar”.');
  };
  const temCamera = 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  const f = folha([
    h('h2', null, '🧾 Conferir nota fiscal'),
    h('ol', { class: 'passos' },
      h('li', null, temCamera ? 'Leia o QR code da nota. A página da nota abre no navegador.' : 'Aponte a câmera do celular para o QR code da nota e abra o link.'),
      h('li', null, 'Na página da nota, segure o dedo no texto → “Selecionar tudo” → “Copiar”.'),
      h('li', null, 'Volte aqui e toque em “Colar nota”.')),
    temCamera ? h('button', { class: 'btn bloco', onclick: lerQr }, '📷 Ler o QR code') : null,
    h('button', { class: 'btn fantasma bloco', onclick: copiarPromptNota }, '📸 Nota sem QR code? Peça ao Claude'),
    h('div', { class: 'form', style: { marginTop: '10px' } }, txt, erro),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn fantasma', onclick: () => (txt.value.trim() ? ler(txt.value) : f.fechar()) }, 'Ler o texto'),
      h('button', { class: 'btn prim', onclick: colar }, '📋 Colar nota')),
  ]);
}

async function lerQr() {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch {
    toast('Não consegui abrir a câmera. Use a câmera do celular e abra o link da nota.');
    return;
  }
  const video = h('video', { class: 'qr-video', autoplay: true, muted: true, playsinline: true });
  video.srcObject = stream;
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  let vivo = true;
  const f = folha([
    h('h2', null, '📷 Aponte para o QR code da nota'), video,
    h('div', { class: 'acoes' }, h('button', { class: 'btn fantasma bloco', onclick: () => f.fechar() }, 'Cancelar')),
  ], { aoFechar: () => { vivo = false; stream.getTracks().forEach((t) => t.stop()); } });
  let avisou = false;
  const procurar = async () => {
    if (!vivo) return;
    try {
      const [c] = await detector.detect(video);
      const url = c && linkDeNota(c.rawValue);
      if (url) {
        f.fechar();
        window.open(url, '_blank', 'noopener');
        toast('Na página da nota: “Selecionar tudo” → “Copiar”. Depois volte e toque em “Colar nota”.', { tempo: 10000 });
        return;
      }
      if (c && !avisou) { avisou = true; toast('Esse QR code não é de uma nota fiscal.'); }
    } catch { /* quadro ainda sem imagem */ }
    setTimeout(procurar, 300);
  };
  video.addEventListener('loadeddata', procurar, { once: true });
}

const COMO = { codigo: ' (pelo código)', aprendido: ' (aprendido)', antes: '' };
const REF = { gondola: 'gôndola', orcado: 'orçado', pesquisa: 'pesquisa' };

// Ligar cada item da nota a um produto da lista e dizer de qual mercado é a nota
function revisarNota(n) {
  const { loja } = app;
  const lista = app.mes;
  const ja = loja.nota(n.chave);
  const itens = n.itens.map((i) => {
    const antes = ja?.itens.find((x) => x.cod === i.cod && x.desc === i.desc);
    return antes ? { ...i, pid: antes.pid, como: antes.pid ? 'antes' : null, ref: antes.ref, refTipo: antes.refTipo } : { ...i, ...loja.vincularItem(lista, n.cnpj, i) };
  });
  const midSugerido = ja?.mid || loja.mercadoDoCnpj(n.cnpj);
  const selMerc = h('select', { class: 'entrada' }, h('option', { value: '' }, 'Escolha o mercado…'),
    loja.mercados().map((m) => h('option', { value: m.id, selected: m.id === midSugerido }, m.nome)));
  const chk = h('input', { type: 'checkbox', checked: true });
  const resumo = h('p', { class: 'sub' });
  const corpo = h('div', { class: 'lista-ed' });
  const erro = h('div', { class: 'aviso erro', hidden: true });
  const pintar = () => {
    const ligados = itens.filter((i) => i.pid).length;
    resumo.textContent = `${ligados} de ${itens.length} itens ligados a produtos da lista. Toque num item para ligar ou trocar — o app aprende para as próximas notas.`;
    corpo.replaceChildren(...itens.map((i) => h('button', { class: `item-ed nf-item${i.pid ? ' ligado' : ''}`, onclick: () => escolherProduto(i, pintar) },
      h('div', { class: 'tx' }, h('b', null, i.desc),
        h('small', { class: 'num' }, `${fmtQ(i.qtd)} ${i.un.toLowerCase()} × ${fmtRS(i.vUnit)} = ${fmtRS(i.vTotal)}`),
        h('small', { class: i.pid ? 'nf-liga' : 'nf-fora' }, i.pid ? `→ ${loja.produto(lista, i.pid)?.nome || '?'}${COMO[i.como] || ''}`
          : i.sugestao ? `talvez “${loja.produto(lista, i.sugestao)?.nome}”? toque para escolher` : 'fora da lista · toque para ligar')))));
  };
  pintar();
  const salvar = () => {
    if (!selMerc.value) { erro.textContent = 'Escolha de qual mercado é a nota.'; erro.hidden = false; selMerc.focus(); return; }
    const desfazer = loja.lote(() => {
      if (ja) loja.excluirNota(n.chave);
      loja.salvarNota({ ...n, itens }, { lista, mid: selMerc.value, atualizarPesquisa: chk.checked });
    });
    f.fechar();
    app.render();
    toast('Nota conferida.', { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
    setTimeout(() => abrirRelatorio(n.chave), 80);
  };
  const quando = n.emissao ? new Date(n.emissao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const f = folha([
    h('h2', null, `🧾 ${n.loja || 'Nota fiscal'}`),
    h('p', { class: 'sub num' }, `${quando} · ${n.itens.length} itens · total ${fmtRS(n.total)}${n.desconto ? ` · desconto ${fmtRS(n.desconto)}` : ''}`),
    ja ? h('div', { class: 'aviso' }, 'Esta nota já foi conferida. Salvar de novo substitui a conferência anterior.') : null,
    n.completa ? null : h('div', { class: 'aviso' }, 'A soma dos itens não bate com o total da nota: pode ter faltado um pedaço na cópia. Dá para seguir, mas confira.'),
    h('div', { class: 'form' },
      h('label', null, `Mercado (lista: ${loja.nomeLista(lista)})`, selMerc),
      h('label', { class: 'check' }, chk, 'Atualizar a pesquisa deste mercado com os preços da nota')),
    resumo, corpo, erro,
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn fantasma', onclick: () => f.fechar() }, 'Cancelar'),
      h('button', { class: 'btn prim', onclick: salvar }, 'Salvar e conferir')),
  ]);
}

function escolherProduto(i, depois) {
  const { loja } = app;
  const busca = h('input', { type: 'search', class: 'entrada', placeholder: 'Buscar produto…', 'aria-label': 'Buscar produto' });
  const ops = h('div', { class: 'opcoes', style: { marginTop: '10px' } });
  const sugeridos = loja.sugerirVinculos(app.mes, i.desc).slice(0, 6).map((x) => x.p);
  const escolher = (pid) => { i.pid = pid; i.como = pid ? 'voce' : null; i.sugestao = null; f.fechar(); depois(); };
  const pintarOps = () => {
    const t = norm(busca.value);
    const lista = t ? loja.produtos(app.mes).filter((p) => norm(p.nome).includes(t)).slice(0, 30) : sugeridos;
    ops.replaceChildren(...lista.map((p) => h('button', { class: `opcao${p.id === i.pid ? ' atual' : ''}`, onclick: () => escolher(p.id) },
      h('span', { class: 'tx' }, p.nome, h('small', null, p.qtd ? `na lista: ${fmtQ(p.qtd)}` : 'sem quantidade nesta lista')))),
    lista.length ? '' : h('p', { class: 'sub' }, t ? 'Nenhum produto com esse nome.' : 'Busque o produto pelo nome.'));
  };
  busca.addEventListener('input', pintarOps);
  const f = folha([
    h('h2', null, i.desc),
    h('p', { class: 'sub' }, 'Qual produto é este item da nota? O app aprende: nas próximas notas, de qualquer mercado, este nome liga sozinho.'),
    busca, ops,
    h('div', { class: 'acoes' }, h('button', { class: 'btn fantasma bloco', onclick: () => escolher(null) }, '🛍️ Fora da lista (não ligar)')),
  ]);
  pintarOps();
}

// Conferência: cobrado acima da gôndola, não cobrado, fora da lista e orçado × nota
export function abrirRelatorio(chave) {
  const { loja } = app;
  const a = loja.auditarNota(chave);
  if (!a) return;
  const n = a.nota;
  const merc = loja.mercados({ todos: true }).find((m) => m.id === n.mid)?.nome || n.loja;
  const quando = n.emissao ? new Date(n.emissao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const linha = (tx, sub, val) => h('div', { class: 'item-ed' }, h('div', { class: 'tx' }, tx, sub ? h('small', null, sub) : null),
    val ? h('b', { class: 'num', style: { paddingRight: '10px' } }, val) : null);
  const difEsp = Math.round((a.notaDosEsperados - a.esperado) * 100) / 100;
  const esperado = (l) => `${REF[l.refTipo] || 'esperado'} ${fmtRS(l.ref)} · nota ${fmtRS(l.unit)} · ${fmtQ(l.qtd)} ${l.un.toLowerCase()}`;
  const sinal = (v) => `${v > 0 ? '+' : '−'}${fmtRS(Math.abs(v))}`;
  const f = folha([
    h('h2', null, `🧾 ${merc} · ${quando}`),
    h('p', { class: 'sub num' }, `${n.itens.length} itens · total pago ${fmtRS(n.total)}${n.desconto ? ` · desconto ${fmtRS(n.desconto)}` : ''}`),
    a.acimaGondola.length
      ? h('div', { class: 'nf-bloco alerta' }, h('h3', null, `⚠️ Cobrado acima da gôndola: ${fmtRS(a.direito)}`),
        h('div', { class: 'lista-ed' }, a.acimaGondola.map((l) => linha(l.nome, `gôndola ${fmtRS(l.gondola)} · nota ${fmtRS(l.unit)} · ${fmtQ(l.qtd)} ${l.un.toLowerCase()}`, `+${fmtRS(l.acima)}`))),
        h('p', { class: 'sub' }, 'Pela Lei 10.962/2004, quando o preço da prateleira e o do caixa são diferentes, vale o menor. Mostre a nota e o preço da gôndola no atendimento e peça a diferença.'),
        n.desconto ? h('p', { class: 'sub' }, `A nota teve ${fmtRS(n.desconto)} de desconto no total: confira se ele já cobre essa diferença.`) : null)
      : h('div', { class: 'nf-bloco ok' }, a.linhas.some((l) => l.gondola !== null) ? '✅ Nada cobrado acima do preço da gôndola.' : 'Nenhum preço da gôndola anotado neste mercado para comparar com a nota.'),
    a.naoCobrados.length ? h('div', { class: 'nf-bloco' }, h('h3', null, `❓ No carrinho, mas não estão na nota (${a.naoCobrados.length})`),
      h('p', { class: 'sub' }, 'Ficou no caixa? Não foi cobrado? Ou veio em outra nota.'),
      h('div', { class: 'lista-ed' }, a.naoCobrados.map((it) => linha(it.p.nome, `${fmtQ(it.p.qtd)}× na lista`)))) : null,
    a.fora.length ? h('div', { class: 'nf-bloco' }, h('h3', null, `🛍️ Fora da lista: ${fmtRS(a.totalFora)}`),
      h('div', { class: 'lista-ed' }, a.fora.map((i) => linha(i.desc, `${fmtQ(i.qtd)} × ${fmtRS(i.vUnit)}`, fmtRS(i.vTotal))))) : null,
    a.maisCaro.length ? h('div', { class: 'nf-bloco' }, h('h3', null, `📈 Pagou mais que o esperado (${a.maisCaro.length})`),
      h('div', { class: 'lista-ed' }, a.maisCaro.map((l) => linha(l.nome, esperado(l), sinal(l.dif))))) : null,
    a.maisBarato.length || n.desconto ? h('div', { class: 'nf-bloco bom' }, h('h3', null, `💚 Pagou menos (promoção ou preço baixou)`),
      a.maisBarato.length ? h('div', { class: 'lista-ed' }, a.maisBarato.map((l) => linha(l.nome, esperado(l), sinal(l.dif)))) : null,
      n.desconto ? h('p', { class: 'sub' }, `Desconto na nota: ${fmtRS(n.desconto)}.`) : null) : null,
    a.comRef ? h('div', { class: 'nf-bloco' }, h('h3', null, '📌 Esperado × nota'),
      h('p', { class: 'sub num', style: { margin: 0 } }, `${a.comRef === 1 ? 'No item' : `Nos ${a.comRef} itens`} com preço esperado (gôndola, orçado ou pesquisa): esperado ${fmtRS(a.esperado)} · nota ${fmtRS(a.notaDosEsperados)} (${difEsp === 0 ? 'igual' : sinal(difEsp)})`)) : null,
    h('details', { class: 'nf-bloco' }, h('summary', null, `Todos os itens (${n.itens.length})`),
      h('div', { class: 'lista-ed' }, a.linhas.map((l) => linha(l.nome || l.desc,
        [l.nome ? l.desc : 'fora da lista', `${fmtQ(l.qtd)} × ${fmtRS(l.unit)}`, l.ref !== null ? `${REF[l.refTipo] || 'esperado'} ${fmtRS(l.ref)}` : ''].filter(Boolean).join(' · '),
        fmtRS(l.vTotal))))),
    h('div', { class: 'acoes lado' },
      h('button', { class: 'btn perigo', onclick: async () => {
        if (!(await confirmar('Excluir esta nota?', 'Os itens voltam a usar o preço da gôndola ou o orçado. Os preços que a nota gravou na pesquisa continuam.', 'Excluir', 'perigo'))) return;
        const desfazer = loja.excluirNota(chave);
        fecharTodas();
        app.render();
        toast('Nota excluída.', { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); app.render(); } } });
      } }, '🗑 Excluir'),
      h('button', { class: 'btn prim', onclick: () => f.fechar() }, 'Fechar')),
  ]);
}

// Notas do mês (Modo compra e Mais)
export function blocoNotas({ titulo = true } = {}) {
  const { loja } = app;
  const notas = loja.notas().filter((n) => mesDe(n.lista) === mesDe(app.mes));
  const nomeMerc = (mid) => loja.mercados({ todos: true }).find((m) => m.id === mid)?.nome || '';
  return h('div', { class: titulo ? 'secao' : 'nf-notas' },
    titulo ? h('h3', null, '🧾 Notas fiscais') : null,
    titulo ? h('p', { class: 'sub' }, 'Confira a nota da compra: o app mostra o que foi cobrado acima da gôndola, o que não foi cobrado e o que estava fora da lista.') : null,
    h('button', { class: `btn bloco${titulo ? ' prim' : ''}`, onclick: conferirNota }, '🧾 Conferir nota fiscal'),
    titulo && loja.nomesAprendidos().length ? h('button', { class: 'btn fantasma bloco', style: { marginTop: '8px' }, onclick: nomesAprendidos }, `🔗 Nomes aprendidos — nota e dieta (${loja.nomesAprendidos().length})`) : null,
    notas.length ? h('div', { class: 'lista-ed', style: { marginTop: '8px' } }, notas.map((n) => {
      const au = loja.auditarNota(n.chave);
      return h('button', { class: 'item-ed', onclick: () => abrirRelatorio(n.chave) },
        h('div', { class: 'tx' }, h('b', null, `${nomeMerc(n.mid)} · ${n.emissao ? new Date(n.emissao).toLocaleDateString('pt-BR') : ''}`),
          h('small', null, `${loja.nomeLista(n.lista)} · ${n.itens.length} itens${au.direito ? ` · ⚠️ ${fmtRS(au.direito)} acima da gôndola` : ''}`)),
        h('b', { class: 'num', style: { paddingRight: '10px' } }, fmtRS(n.total)));
    })) : null);
}

// O que o app aprendeu ("SAB LIQ PROTEX" → Sabonete líquido): conferir e esquecer o que estiver errado
function nomesAprendidos() {
  const { loja } = app;
  const nomes = new Map(loja.linhagens().map((p) => [p.id, p.nome]));
  const corpo = h('div', { class: 'lista-ed' });
  const pintar = () => {
    const todos = loja.nomesAprendidos();
    corpo.replaceChildren(...todos.map((v) => h('div', { class: 'item-ed' },
      h('div', { class: 'tx' }, h('b', null, v.desc), h('small', null, `→ ${nomes.get(v.pid) || 'produto apagado'}`)),
      h('button', { class: 'btn-ic', 'aria-label': `Esquecer ${v.desc}`, onclick: () => {
        const desfazer = loja.esquecerNome(v.chave);
        pintar();
        toast(`Esquecido: ${v.desc}.`, { acao: { rotulo: 'Desfazer', fn: () => { desfazer(); pintar(); } } });
      } }, '✕'))));
    if (!todos.length) corpo.append(h('p', { class: 'sub' }, 'Nada aprendido ainda.'));
  };
  pintar();
  folha([
    h('h2', null, '🔗 Nomes aprendidos'),
    h('p', { class: 'sub' }, 'Cada item da nota fiscal ou da dieta que você liga a um produto fica aqui, e da próxima vez (em qualquer mercado) ele liga sozinho. Errou? Toque em ✕ para esquecer.'),
    corpo,
  ], { aoFechar: () => app.render() });
}
