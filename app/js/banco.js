// Armazenamento local (IndexedDB "cesta"). Funciona sem internet.
//   recs     — registros do modelo { k, u, v }
//   meta     — { chave, valor }: 'pendentes' (chaves ainda não enviadas), 'seq' (última sincronização), configurações
//   copias   — cópias de segurança { id, quando, motivo, auto, recs }

const NOME = 'cesta';
let dbp = null;

function abrir() {
  if (dbp) return dbp;
  dbp = new Promise((ok, erro) => {
    const req = indexedDB.open(NOME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('recs', { keyPath: 'k' });
      db.createObjectStore('meta', { keyPath: 'chave' });
      db.createObjectStore('copias', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
  return dbp;
}

const prom = (req) => new Promise((ok, erro) => { req.onsuccess = () => ok(req.result); req.onerror = () => erro(req.error); });

async function tx(lojas, modo, fn) {
  const db = await abrir();
  return new Promise((ok, erro) => {
    const t = db.transaction(lojas, modo);
    let res;
    Promise.resolve(fn(t)).then((r) => { res = r; });
    t.oncomplete = () => ok(res);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error);
  });
}

export const banco = {
  async lerTudo() {
    return tx(['recs'], 'readonly', (t) => prom(t.objectStore('recs').getAll()));
  },
  async gravar(recs, meta = {}) {
    return tx(['recs', 'meta'], 'readwrite', (t) => {
      const s = t.objectStore('recs');
      for (const r of recs) s.put(r);
      const m = t.objectStore('meta');
      for (const [chave, valor] of Object.entries(meta)) m.put({ chave, valor });
    });
  },
  async meta(chave, padrao = null) {
    const r = await tx(['meta'], 'readonly', (t) => prom(t.objectStore('meta').get(chave)));
    return r ? r.valor : padrao;
  },
  async setMeta(chave, valor) {
    return tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ chave, valor }); });
  },
  async apagarTudo() {
    return tx(['recs', 'meta'], 'readwrite', (t) => { t.objectStore('recs').clear(); t.objectStore('meta').clear(); });
  },

  // ----- cópias de segurança -----
  async copias() {
    const lista = await tx(['copias'], 'readonly', (t) => prom(t.objectStore('copias').getAll()));
    return lista.map(({ recs, ...resto }) => ({ ...resto, tamanho: recs.length })).sort((a, b) => b.quando - a.quando);
  },
  async copia(id) { return tx(['copias'], 'readonly', (t) => prom(t.objectStore('copias').get(id))); },
  async criarCopia(recs, motivo, auto = true) {
    const id = await tx(['copias'], 'readwrite', (t) => prom(t.objectStore('copias').add({ quando: Date.now(), motivo, auto, recs })));
    // Mantém as 20 automáticas mais recentes; as feitas à mão ficam até serem apagadas
    const todas = await this.copias();
    const velhas = todas.filter((c) => c.auto).slice(20);
    if (velhas.length) await tx(['copias'], 'readwrite', (t) => velhas.forEach((c) => t.objectStore('copias').delete(c.id)));
    return id;
  },
  async apagarCopia(id) { return tx(['copias'], 'readwrite', (t) => { t.objectStore('copias').delete(id); }); },
};
