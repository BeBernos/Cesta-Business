// Leitura da NFC-e (nota fiscal do consumidor) a partir do texto copiado da página da Sefaz-SP
// ("Selecionar tudo" → "Copiar") e da chave de acesso (QR code). Não usa DOM: roda nos testes.
// Guarda só loja, CNPJ, data, itens e totais — nada do consumidor (CPF, nome, nº de sócio).

import { lerNumero } from './modelo.js';

// Chave de 44 dígitos: do link do QR (p=CHAVE|2|1|…) ou do texto "Chave de acesso: 3526 1000 …"
export function lerChave(txt) {
  const s = String(txt ?? '');
  const doLink = /[?&]p=(\d{44})/.exec(s);
  if (doLink) return doLink[1];
  const doTexto = /Chave de acesso:?\s*((?:\d\s*){44})/i.exec(s);
  return doTexto ? doTexto[1].replace(/\s/g, '') : null;
}

// Partes da chave: UF (2), AAMM (4), CNPJ (14), modelo (2), série (3), número (9)…
export function partesDaChave(chave) {
  if (!/^\d{44}$/.test(chave || '')) return null;
  return { uf: chave.slice(0, 2), aamm: chave.slice(2, 6), cnpj: chave.slice(6, 20), modelo: chave.slice(20, 22), numero: Number(chave.slice(25, 34)) };
}

// A raiz do CNPJ (8 dígitos) é a empresa: vale para todas as lojas da rede
export const raizCnpj = (cnpj) => String(cnpj ?? '').replace(/\D/g, '').slice(0, 8);

// Só links de nota em site do governo (o QR poderia ter qualquer coisa)
export function linkDeNota(txt) {
  try {
    const u = new URL(String(txt).trim());
    return u.protocol === 'https:' && u.hostname.endsWith('.gov.br') && lerChave(u.href) ? u.href : null;
  } catch { return null; }
}

const ITEM = /([^\n]+?)\s*\(C[óo]digo:\s*([^)]*?)\s*\)\s*Qtde\.?:\s*([\d.,]+)\s*UN:\s*(\S+)\s*Vl\.\s*Unit\.?:\s*([\d.,]+)\s*Vl\.\s*Total\s*([\d.,]+)/gi;
const num = (re, s) => { const m = re.exec(s); return m ? lerNumero(m[1]) : null; };

export function lerNota(texto) {
  const s = String(texto ?? '').replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ');
  const itens = [];
  for (const m of s.matchAll(ITEM)) {
    itens.push({ desc: m[1].trim(), cod: m[2].trim(), qtd: lerNumero(m[3]), un: m[4].trim().toUpperCase(), vUnit: lerNumero(m[5]), vTotal: lerNumero(m[6]) });
  }
  const chave0 = lerChave(s);
  const cnpj = (/CNPJ:\s*([\d./-]{14,18})/i.exec(s)?.[1] || partesDaChave(chave0)?.cnpj || '').replace(/\D/g, '');
  // nome da loja: a linha logo antes do CNPJ
  const linhas = s.split('\n').map((x) => x.trim()).filter(Boolean);
  const iCnpj = linhas.findIndex((x) => /^CNPJ:/i.test(x));
  const loja = iCnpj > 0 ? linhas[iCnpj - 1] : '';
  const em = /Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})(?::(\d{2}))?/i.exec(s);
  const emissao = em ? `${em[3]}-${em[2]}-${em[1]}T${em[4]}:${em[5] || '00'}` : null;
  const soma = Math.round(itens.reduce((t, i) => t + (i.vTotal || 0), 0) * 100) / 100;
  // nota sem QR (lida pelo Claude a partir da foto): identifica pela loja, data e total
  const chave = chave0 || (itens.length && cnpj && emissao ? `foto${cnpj}${emissao.replace(/\D/g, '')}${Math.round((num(/Valor a pagar R\$:?\s*([\d.,]+)/i, s) ?? soma) * 100)}` : null);
  const nota = {
    chave, cnpj, loja, emissao, itens,
    qtdItens: num(/Qtd\.? total de itens:\s*([\d.,]+)/i, s),
    valorTotal: num(/Valor total R\$:?\s*([\d.,]+)/i, s) ?? soma,
    desconto: num(/Descontos? R\$:?\s*([\d.,]+)/i, s) || 0,
    total: num(/Valor a pagar R\$:?\s*([\d.,]+)/i, s) ?? soma,
  };
  // conferência: todos os itens lidos e a soma bate com o total da nota
  nota.completa = itens.length > 0 && (nota.qtdItens === null || nota.qtdItens === itens.length) && Math.abs(soma - nota.valorTotal) < 0.02;
  return nota;
}
