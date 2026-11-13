// Worker do app Cesta no Cloudflare.
// - Os arquivos do app (pasta app/) são servidos direto pelo Cloudflare (assets).
// - Este código só atende /api/*: a sincronização entre os celulares da família e a lista da dieta
//   (pedida ao Worker "plano-familia" pela ligação interna DIETA → classe Ponte; não há rota pública lá).
//   Ao trazer a lista da dieta, a Cesta devolve lá o preço por g/ml/un dos itens ligados (custo da dieta na Mesa).
// - Os dados ficam num Durable Object "Dados" (SQLite, plano grátis), um único para a família.
//
// Senha da família: o primeiro celular que liga a sincronização cria a senha. O servidor guarda só
// um hash dela (o app já envia um hash, então a senha em si nunca sai do celular).

const json = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const id = env.DADOS.idFromName('familia');
    return env.DADOS.get(id).fetch(req);
  },
};

async function sha256(txt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const LIMITE = 3000;

export class Dados {
  constructor(ctx, env) {
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS recs (k TEXT PRIMARY KEY, u INTEGER NOT NULL, s INTEGER NOT NULL, v TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS recs_s ON recs(s);
      CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);`);
  }

  meta(chave) { return this.sql.exec('SELECT valor FROM meta WHERE chave = ?', chave).toArray()[0]?.valor ?? null; }
  setMeta(chave, valor) { this.sql.exec('INSERT OR REPLACE INTO meta (chave, valor) VALUES (?, ?)', chave, String(valor)); }

  async autorizado(req) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const hash = this.meta('senha');
    return !!(token && hash && (await sha256(token)) === hash);
  }

  async fetch(req) {
    const caminho = new URL(req.url).pathname.replace(/^\/api\//, '');
    try {
      if (caminho === 'estado') {
        const n = this.sql.exec('SELECT COUNT(*) AS n FROM recs').one().n;
        return json({ configurado: !!this.meta('senha'), registros: n });
      }
      if (caminho === 'entrar' && req.method === 'POST') {
        const { criar } = await req.json();
        const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
        if (!/^[0-9a-f]{64}$/.test(token)) return json({ erro: 'Senha inválida.' }, 400);
        if (!this.meta('senha')) {
          if (!criar) return json({ erro: 'Ainda não há senha da família. Crie uma no primeiro celular.' }, 409);
          this.setMeta('senha', await sha256(token));
          return json({ ok: true, criada: true });
        }
        if (!(await this.autorizado(req))) return json({ erro: 'Senha da família incorreta.' }, 401);
        return json({ ok: true });
      }
      if (caminho === 'sync' && req.method === 'POST') {
        if (!(await this.autorizado(req))) return json({ erro: 'Senha da família incorreta.' }, 401);
        const { desde = 0, recs = [] } = await req.json();
        let seq = Number(this.meta('seq') || 0);
        for (const r of recs) {
          if (typeof r?.k !== 'string' || !Number.isFinite(r.u)) continue;
          const v = JSON.stringify(r.v ?? null);
          const atual = this.sql.exec('SELECT u, v FROM recs WHERE k = ?', r.k).toArray()[0];
          if (atual && !(r.u > atual.u || (r.u === atual.u && v > atual.v))) continue;
          seq++;
          this.sql.exec('INSERT OR REPLACE INTO recs (k, u, s, v) VALUES (?, ?, ?, ?)', r.k, r.u, seq, v);
        }
        this.setMeta('seq', seq);
        const linhas = this.sql.exec('SELECT k, u, s, v FROM recs WHERE s > ? ORDER BY s LIMIT ?', Number(desde) || 0, LIMITE).toArray();
        const mais = linhas.length === LIMITE;
        return json({
          seq: mais ? linhas[linhas.length - 1].s : seq,
          mais,
          recs: linhas.map((l) => ({ k: l.k, u: l.u, v: JSON.parse(l.v) })),
        });
      }
      if (caminho === 'dieta') {
        if (!(await this.autorizado(req))) return json({ erro: 'Senha da família incorreta.' }, 401);
        if (!this.env?.DIETA) return json({ erro: 'A ligação com o app da dieta não está configurada.' }, 503);
        const u = new URL(req.url).searchParams;
        try { return json(await this.env.DIETA.compras(u.get('de'), u.get('ate'))); }
        catch { return json({ erro: 'O app da dieta não respondeu.' }, 502); }
      }
      if (caminho === 'dieta-precos' && req.method === 'POST') {
        // preços por g/ml/un dos itens da dieta → app da dieta (custo da semana). Só nome, unidade e preço.
        if (!(await this.autorizado(req))) return json({ erro: 'Senha da família incorreta.' }, 401);
        if (!this.env?.DIETA) return json({ erro: 'A ligação com o app da dieta não está configurada.' }, 503);
        const { itens } = await req.json();
        try { return json(await this.env.DIETA.precos(Array.isArray(itens) ? itens.slice(0, 500) : [])); }
        catch { return json({ erro: 'O app da dieta não respondeu.' }, 502); }
      }
      return json({ erro: 'Rota desconhecida.' }, 404);
    } catch (e) {
      return json({ erro: String(e?.message || e) }, 500);
    }
  }
}
