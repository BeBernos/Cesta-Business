// Conector do Claude (claude.ai → Configurações → Conectores → Adicionar conector personalizado), no modelo do Pulse e da Mesa:
// endereço secreto (/api/mcp/<token>; o servidor guarda só o sha256), transporte "Streamable HTTP" simples
// (cada POST = uma mensagem JSON-RPC, resposta JSON, sem SSE nem sessão).
// O Claude lê as ideias e problemas que a família manda em Mais → Ideias e marca o que foi feito (a resposta aparece no app).

const VERSOES = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCOES = `Este conector é a Cesta, o app de pesquisa de preços de supermercado da família.
1. feedbacks traz as ideias e problemas que a família mandou em Mais → Ideias (os abertos, ou todos com todos=true).
2. Depois que uma mudança for publicada, marque com responder_feedback (status "resolvido" e uma resposta curta e simples, ex.: "feito na versão 1.14"). A resposta aparece no celular na próxima sincronização.
Fale em português, com linguagem simples.`;

const STATUS = ['novo', 'andamento', 'resolvido'];
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const erro = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const hora = (t) => new Date(t - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' '); // horário de São Paulo

// db: { feedbacks() → [{ id, v }], gravar(k, v) } — implementado pelo Durable Object (worker/index.js)
export function ferramentas(db) {
  return [
    {
      name: 'feedbacks',
      title: 'Ideias e problemas',
      description: 'Ideias, problemas e elogios que a família mandou em Mais → Ideias, do mais novo ao mais antigo. Sem argumentos: só os abertos (novo e em andamento).',
      inputSchema: { type: 'object', properties: { todos: { type: 'boolean', description: 'true = inclui os resolvidos.' } } },
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const lista = (await db.feedbacks())
          .filter(({ v }) => a.todos === true || v.status !== 'resolvido')
          .sort((x, y) => (y.v.quando || 0) - (x.v.quando || 0))
          .map(({ id, v }) => ({ id, tipo: v.tipo, status: v.status, texto: v.texto, resposta: v.resposta || '', quando: v.quando ? hora(v.quando) : null,
            versao: v.versao, tela: v.tela, lista: v.lista, aparelho: v.aparelho }));
        return lista.length ? lista : 'Nenhum feedback aberto.';
      },
    },
    {
      name: 'responder_feedback',
      title: 'Responder feedback',
      description: 'Muda a situação de um feedback (novo, andamento, resolvido) e grava uma resposta curta que a família vê no app. Use depois que a mudança for publicada.',
      inputSchema: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string', description: 'O id que veio em feedbacks.' },
          status: { type: 'string', enum: STATUS },
          resposta: { type: 'string', description: 'Resposta curta em linguagem simples, ex.: "Feito na versão 1.14".' },
        },
      },
      annotations: { destructiveHint: false, idempotentHint: true },
      run: async (a) => {
        if (!STATUS.includes(a.status)) throw new Error(`status deve ser ${STATUS.join(', ')}.`);
        const atual = (await db.feedbacks()).find((f) => f.id === a.id);
        if (!atual) throw new Error(`Feedback ${a.id} não encontrado (ou foi apagado).`);
        const v = { ...atual.v, status: a.status, ...(typeof a.resposta === 'string' ? { resposta: a.resposta.trim().slice(0, 500) } : {}) };
        await db.gravar(`fb:${a.id}`, v);
        return `Feedback ${a.id} marcado como "${a.status}". Aparece nos celulares na próxima sincronização.`;
      },
    },
  ];
}

export async function tratar(m, fs) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return erro(m?.id ?? null, -32600, 'Requisição inválida');
  if (m.id === undefined || m.id === null) return null; // notificação: sem resposta
  switch (m.method) {
    case 'initialize':
      return ok(m.id, {
        protocolVersion: VERSOES.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'cesta', title: 'Cesta', version: '1.0.0' },
        instructions: INSTRUCOES,
      });
    case 'ping':
      return ok(m.id, {});
    case 'tools/list':
      return ok(m.id, { tools: fs.map(({ run, ...t }) => t) });
    case 'tools/call': {
      const f = fs.find((t) => t.name === m.params?.name);
      if (!f) return erro(m.id, -32602, `Ferramenta desconhecida: ${m.params?.name}`);
      try {
        const r = await f.run(m.params.arguments || {});
        return ok(m.id, { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 1) }], isError: false });
      } catch (e) {
        return ok(m.id, { content: [{ type: 'text', text: e.message }], isError: true });
      }
    }
    default:
      return erro(m.id, -32601, `Método não suportado: ${m.method}`);
  }
}

// POST /api/mcp/<token> já autorizado: uma mensagem ou um lote JSON-RPC
export async function responder(req, db) {
  if (req.method === 'DELETE') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return new Response('Conector da Cesta para o Claude: use POST.', { status: 405, headers: { allow: 'POST, DELETE' } });
  let msg;
  try { msg = await req.json(); } catch { return Response.json(erro(null, -32700, 'JSON inválido'), { status: 400 }); }
  const fs = ferramentas(db);
  const lote = Array.isArray(msg);
  const respostas = [];
  for (const um of lote ? msg : [msg]) { const r = await tratar(um, fs); if (r) respostas.push(r); }
  if (!respostas.length) return new Response(null, { status: 202 });
  return Response.json(lote ? respostas : respostas[0], { headers: { 'cache-control': 'no-store' } });
}
