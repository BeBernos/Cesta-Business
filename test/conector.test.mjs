import test from 'node:test';
import assert from 'node:assert/strict';
import { ferramentas, tratar } from '../worker/conector.js';

function banco() {
  const recs = new Map([
    ['fb:a', { tipo: 'problema', texto: 'total não muda', status: 'novo', resposta: '', quando: 2 }],
    ['fb:b', { tipo: 'ideia', texto: 'modo escuro', status: 'resolvido', resposta: 'feito', quando: 1 }],
  ]);
  return { recs, feedbacks: async () => [...recs].map(([k, v]) => ({ id: k.slice(3), v })), gravar: async (k, v) => recs.set(k, v) };
}
const chamar = async (db, name, args) => JSON.parse((await tratar({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ferramentas(db))).result.content[0].text);

test('conector: initialize e lista de ferramentas', async () => {
  const db = banco();
  const ini = await tratar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, ferramentas(db));
  assert.equal(ini.result.protocolVersion, '2025-03-26');
  const l = await tratar({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ferramentas(db));
  assert.deepEqual(l.result.tools.map((t) => t.name), ['feedbacks', 'responder_feedback']);
  assert.equal(await tratar({ jsonrpc: '2.0', method: 'notifications/initialized' }, ferramentas(db)), null);
});

test('conector: feedbacks abertos, todos e responder', async () => {
  const db = banco();
  assert.deepEqual((await chamar(db, 'feedbacks', {})).map((f) => f.id), ['a']);
  assert.deepEqual((await chamar(db, 'feedbacks', { todos: true })).map((f) => f.id), ['a', 'b']);
  const r = await tratar({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'responder_feedback', arguments: { id: 'a', status: 'resolvido', resposta: ' Feito na 1.14 ' } } }, ferramentas(db));
  assert.equal(r.result.isError, false);
  assert.deepEqual(db.recs.get('fb:a'), { tipo: 'problema', texto: 'total não muda', status: 'resolvido', resposta: 'Feito na 1.14', quando: 2 });
  const e = await tratar({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'responder_feedback', arguments: { id: 'x', status: 'resolvido' } } }, ferramentas(db));
  assert.equal(e.result.isError, true);
});
