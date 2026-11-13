// Sincronização entre celulares (opcional). O app funciona 100% sem ela.
// Cada celular envia o que mudou e recebe o que os outros mudaram (Worker em worker/index.js).
// Em cada registro vence a mudança mais recente, então dá para editar offline nos dois aparelhos.

import { banco } from './banco.js';

export async function tokenDaSenha(senha) {
  const bytes = new TextEncoder().encode(`cesta:${senha}`);
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function criarSinc(loja, { aoMudar = () => {}, salvarAgora = async () => {}, base = './api' } = {}) {
  const s = {
    estado: 'desligada', // desligada | ok | sincronizando | offline | senha | indisponivel | erro
    ultima: null,
    pendentes: new Set(),
    token: null,
    seq: 0,
  };
  let timer = null, rodando = false, denovo = false;

  const muda = (estado, extra = {}) => { Object.assign(s, { estado }, extra); aoMudar(s); };

  async function iniciar() {
    s.pendentes = new Set(await banco.meta('pendentes', []));
    s.seq = await banco.meta('seq', 0);
    const cfg = await banco.meta('sinc', null);
    s.token = cfg?.token || null;
    s.ultima = cfg?.ultima || null;
    loja.ouvir((chaves, origem) => {
      if (origem !== 'local') return;
      for (const k of chaves) s.pendentes.add(k);
      if (s.token) agendar(1500);
    });
    if (s.token) { muda(navigator.onLine ? 'ok' : 'offline'); agendar(300); }
    addEventListener('online', () => agendar(300));
    addEventListener('offline', () => { if (s.token) muda('offline'); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendar(300); });
    setInterval(() => { if (document.visibilityState === 'visible') agendar(0); }, 30000);
  }

  function agendar(ms) {
    if (!s.token) return;
    clearTimeout(timer);
    timer = setTimeout(sincronizar, ms);
  }

  async function chamar(caminho, corpo, token = s.token, extra = {}) {
    const r = await fetch(`${base}/${caminho}`, {
      method: corpo ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    });
    const tipo = r.headers.get('content-type') || '';
    if (r.status === 404 || !tipo.includes('json')) { const e = new Error('indisponivel'); e.codigo = 'indisponivel'; throw e; }
    const dados = await r.json();
    if (r.status === 401) { const e = new Error('senha'); e.codigo = 'senha'; throw e; }
    if (!r.ok) { const e = new Error(dados.erro || `Erro ${r.status}`); e.codigo = 'erro'; throw e; }
    return dados;
  }

  async function sincronizar() {
    if (!s.token) return;
    if (rodando) { denovo = true; return; }
    if (!navigator.onLine) { muda('offline'); return; }
    rodando = true;
    muda('sincronizando');
    try {
      let envio = [...s.pendentes].map((k) => loja.recs.get(k)).filter(Boolean);
      let mais = true;
      while (mais) {
        const resp = await chamar('sync', { desde: s.seq, recs: envio });
        if (resp.recs.length) loja.aplicarRemotos(resp.recs);
        await salvarAgora();
        for (const r of envio) if (loja.recs.get(r.k)?.u === r.u) s.pendentes.delete(r.k);
        envio = [];
        s.seq = resp.seq;
        mais = resp.mais;
      }
      s.ultima = Date.now();
      await banco.gravar([], { pendentes: [...s.pendentes], seq: s.seq, sinc: { token: s.token, ultima: s.ultima } });
      muda('ok');
    } catch (e) {
      muda(e.codigo === 'senha' ? 'senha' : e.codigo === 'indisponivel' ? 'indisponivel' : navigator.onLine ? 'erro' : 'offline', { erro: e.message });
    } finally {
      rodando = false;
      if (denovo) { denovo = false; agendar(500); }
    }
  }

  // Consulta o servidor antes de ligar: { configurado, registros }
  async function consultar() { return chamar('estado', null, null); }

  async function ligar(senha, { criar = false } = {}) {
    const token = await tokenDaSenha(senha);
    await chamar('entrar', { criar }, token);
    s.token = token;
    // Envia tudo o que este celular já tem (a nuvem fica com a versão mais recente de cada item)
    for (const k of loja.recs.keys()) s.pendentes.add(k);
    s.seq = 0;
    await banco.gravar([], { sinc: { token, ultima: null }, seq: 0, pendentes: [...s.pendentes] });
    muda('ok');
    await sincronizar();
  }

  async function desligar() {
    s.token = null;
    await banco.setMeta('sinc', null);
    muda('desligada');
  }

  return { s, iniciar, sincronizar, agendar, consultar, ligar, desligar, chamar };
}
