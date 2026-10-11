import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backend = path.resolve(raiz, '../horas-voadas-inva-main/backend');
const chave = 'credencial-de-teste-sem-valor-real-123456789';
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

// Sheets em memoria. Nenhum teste chama Google, CAVOK ou producao.
class Aba {
  constructor(nome, rows = []) { this.nome = nome; this.rows = structuredClone(rows); this.maxCols = 26; this.writes = 0; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(1, ...this.rows.map(r => r.length)); }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(_, n) { this.maxCols += n; this.writes++; }
  setFrozenRows() { return this; }
  appendRow(r) { this.rows.push([...r]); this.writes++; return this; }
  deleteRow(n) { this.rows.splice(n - 1, 1); this.writes++; }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, col, n = 1, width = 1) {
    const aba = this;
    return {
      getValues() { return Array.from({ length: n }, (_, i) => Array.from({ length: width }, (_, j) => aba.rows[row + i - 1]?.[col + j - 1] ?? '')); },
      getDisplayValues() { return this.getValues().map(r => r.map(String)); },
      getValue() { return this.getValues()[0][0]; },
      setValues(values) {
        assert.equal(values.length, n);
        values.forEach((r, i) => {
          assert.equal(r.length, width);
          aba.rows[row + i - 1] ||= [];
          r.forEach((v, j) => { aba.rows[row + i - 1][col + j - 1] = v; });
        });
        aba.writes++; return this;
      },
      setValue(v) { return this.setValues([[v]]); },
      setNumberFormat() { return this; }, setFontWeight() { return this; },
      clearContent() { return this.setValues(Array.from({ length: n }, () => Array(width).fill(''))); }
    };
  }
}

function ambiente() {
  const abas = new Map();
  const add = (nome, rows) => { const a = new Aba(nome, rows); abas.set(nome, a); return a; };
  add('Instrutores', [
    ['Nome', 'Tipo', 'BASE', 'LIBERADO_OPR', 'LIBERADO_EM', 'LIBERADO_POR', 'ETIQUETAS', 'ORDEM_PRIORIDADE', 'APELIDOS_CAVOK', 'INATIVO'],
    ['Ana Antiga', 'CLT', 'SJK', true, '11/10/2026', 'Operacao', 'eventual,mc01', 1, 'ANA CAVOK', false],
    ['Bruno', 'CLT', 'CPQ', false, '', '', 'mc01', 2, '', true]
  ]);
  add('Horas', [['Instrutor', 'Data', 'Horas', 'Id'], ['Ana Antiga', 'SALDO INICIAL', 90, 'SISTEMA'], ['ANA CAVOK', '2026-10-10', 12, '10']]);
  add('Etiquetas', [['ID', 'NOME', 'COR', 'ORDEM'], ['eventual', 'Eventual', 'laranja', 1], ['mc01', 'LIBERADO MC01', 'verde', 2]]);
  add('Comentarios', [['ID', 'INSTRUTOR', 'AUTOR', 'DATA', 'TEXTO', 'ISO'], ['cm1', 'Ana Antiga', 'Operacao', '11/10/2026', 'Comentario interno', '2026-10-11T09:00:00']]);
  add('InstrutoresSolo', [['NOME', 'BASE', 'ETIQUETAS', 'ORDEM_PRIORIDADE', 'INATIVO', 'INATIVO_EM', 'INATIVO_POR', 'INATIVO_MOTIVO'], ['Solo Antigo', 'SJK', 'teorico', 1, false, '', '', '']]);
  add('EtiquetasSolo', [['ID', 'NOME', 'COR', 'ORDEM'], ['teorico', 'Teorico', 'azul', 1]]);
  add('ComentariosSolo', [['ID', 'INSTRUTOR', 'AUTOR', 'DATA', 'TEXTO', 'ISO'], ['cm2', 'Solo Antigo', 'Operacao', '11/10/2026', 'Comentario solo', '2026-10-11T09:00:00']]);
  const ss = { getSheetByName: nome => abas.get(nome) || null, insertSheet: nome => add(nome, []) };
  const props = new Map([['INVA_PARCEIRO_SHA256', sha(chave)]]);
  let held = false;
  const context = vm.createContext({
    console, Date,
    Utilities: { base64Encode: () => 'nao-usado', getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, v) => [...crypto.createHash('sha256').update(String(v)).digest()],
      formatDate: d => new Date(d).toISOString() },
    SpreadsheetApp: { openById: () => ss, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) || null }) },
    LockService: { getScriptLock: () => ({ waitLock() { assert.equal(held, false); held = true; }, releaseLock() { held = false; }, tryLock() { if (held) return false; held = true; return true; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ getContent: () => text, setMimeType() { return this; } }) },
    UrlFetchApp: { fetch() { throw new Error('Rede proibida nos testes'); } }
  });
  for (const f of ['Código.js', 'IntegracaoInstrutores.js']) vm.runInContext(fs.readFileSync(path.join(backend, f), 'utf8'), context, { filename: f });
  const post = p => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(p) } }).getContent());
  const api = p => post({ action: 'integracao_instrutores_v1', chave, ...p });
  const listar = () => api({ operacao: 'listar' }).data.instrutores;
  const writes = () => [...abas.values()].reduce((n, a) => n + a.writes, 0);
  return { context, abas, props, api, post, listar, writes };
}

test('autenticacao fecha por padrao; instalacao idempotente; consulta nao escreve', () => {
  const a = ambiente();
  assert.equal(a.api({ chave: 'errada', operacao: 'listar' }).code, 'NAO_AUTORIZADO');
  assert.equal(a.api({ operacao: 'listar' }).code, 'INSTALACAO_PENDENTE');
  assert.equal(a.api({ operacao: 'cadastrar', requestId: 'pendente01', dados: { nome: 'Nao criar', base: 'SJK', modalidade: 'voo' } }).code, 'INSTALACAO_PENDENTE');
  assert.equal(a.abas.get('Instrutores').rows.length, 3);
  a.context.instalarIntegracaoInstrutores();
  const ids = a.listar().map(i => i.id);
  a.context.instalarIntegracaoInstrutores();
  assert.deepEqual(a.listar().map(i => i.id), ids);
  const n = a.writes();
  const itens = a.listar();
  assert.equal(a.writes(), n);
  assert.equal(itens.length, 3);
  assert.equal(itens[0].totalHoras, '90.0');
  assert.equal(itens[0].flagVerde, true);
  assert.equal(itens[0].comentarios[0].texto, 'Comentario interno');
  assert.equal(itens[1].inativo, true);
  a.props.delete('INVA_PARCEIRO_SHA256');
  assert.equal(a.api({ operacao: 'listar' }).code, 'NAO_AUTORIZADO');
});

test('cadastra voo e solo; retry nao duplica; nomes inativos e antigos reservados', () => {
  const a = ambiente(); a.context.instalarIntegracaoInstrutores();
  for (const modalidade of ['voo', 'solo']) {
    const p = { operacao: 'cadastrar', requestId: 'cadastro_'+modalidade, dados: { modalidade, nome: 'Novo '+modalidade, base: 'CPQ' } };
    const r = a.api(p); assert.equal(r.status, 'success');
    assert.equal(r.data.instrutor.modalidade, modalidade);
    assert.equal(r.data.instrutor.base, 'CPQ');
    assert.deepEqual(r.data.instrutor.etiquetas, []);
    assert.equal(r.data.instrutor.inativo, false);
    assert.equal(a.api(p).data.repetida, true);
    assert.equal(a.listar().filter(i => i.nome === p.dados.nome).length, 1);
    assert.equal(a.api({ ...p, dados: { ...p.dados, nome: 'Outro' } }).code, 'REQUEST_ID_REUTILIZADO');
  }
  assert.equal(a.api({ operacao: 'cadastrar', requestId: 'duplicado1', dados: { modalidade: 'voo', nome: 'Bruno', base: 'SJK' } }).code, 'NOME_DUPLICADO');
});

test('renomeacao mantem ID, horas, comentarios, aliases CAVOK e campos protegidos', () => {
  const a = ambiente(); a.context.instalarIntegracaoInstrutores();
  for (const modalidade of ['voo', 'solo']) {
    const original = a.listar().find(i => i.modalidade === modalidade && !i.inativo);
    const p = { operacao: 'editar', requestId: 'renomear_'+modalidade, dados: { id: original.id, versao: original.versao, nome: 'Nome Novo '+modalidade, base: 'CPQ' } };
    const r = a.api(p); assert.equal(r.status, 'success');
    const novo = r.data.instrutor;
    assert.equal(novo.id, original.id); assert.equal(novo.base, 'CPQ');
    assert.equal(novo.comentarios[0].texto, original.comentarios[0].texto);
    assert.deepEqual(novo.etiquetas, original.etiquetas);
    assert.equal(novo.totalHoras, original.totalHoras);
    assert.equal(novo.liberadoOpr, original.liberadoOpr);
    assert.equal(a.api(p).data.repetida, true);
    assert.equal(a.api({ ...p, requestId: 'stale_'+modalidade }).code, 'CONFLITO');
    assert.equal(a.api({ operacao: 'cadastrar', requestId: 'antigo_'+modalidade, dados: { modalidade, nome: original.nome, base: 'SJK' } }).code, 'NOME_DUPLICADO');
    if (modalidade === 'voo') {
      assert.equal(a.context.invaApelidosCavok_()['ANA CAVOK'], novo.nome);
      assert.equal(a.context.invaApelidosCavok_()['ANA ANTIGA'], novo.nome);
    }
  }
});

test('rejeita campos protegidos, operacoes extras, formulas e base invalida sem gravar', () => {
  const a = ambiente(); a.context.instalarIntegracaoInstrutores();
  const original = a.listar()[0]; const n = a.writes();
  for (const campo of ['totalHoras', 'etiquetas', 'ordem', 'liberadoOpr', 'inativo', 'comentarios', 'tipo', 'modalidade']) {
    assert.equal(a.api({ operacao: 'editar', requestId: 'negado_'+campo, dados: { id: original.id, versao: original.versao, nome: 'Novo', [campo]: true } }).code, 'CAMPO_PROIBIDO');
  }
  for (const operacao of ['excluir', 'inativar', 'sync_cavok', 'salvarEtiqueta']) assert.equal(a.api({ operacao }).code, 'OPERACAO_PROIBIDA');
  for (const [nome, base] of [['=IMPORTXML(1)', 'SJK'], ['Normal', 'XYZ'], ['', 'SJK']]) {
    assert.equal(a.api({ operacao: 'cadastrar', requestId: 'invalido01', dados: { modalidade: 'voo', nome, base } }).code, 'DADOS_INVALIDOS');
  }
  assert.equal(a.writes(), n);
});

test('retry apos falha de log recupera a gravacao sem criar duplicata', () => {
  const a = ambiente(); a.context.instalarIntegracaoInstrutores();
  const p = { operacao: 'cadastrar', requestId: 'perda_log_01', dados: { modalidade: 'solo', nome: 'Teste retry', base: 'CPQ' } };
  const log = new Aba('INTEGRACAO_INSTRUTORES_LOG', [['REQUEST_ID','HASH','INSTRUTOR_ID','MODALIDADE','OPERACAO','ANTES','DEPOIS','AUTOR','DATA']]);
  a.abas.set(log.nome, log);
  const original = log.getRange;
  log.getRange = function (...args) {
    const range = original.apply(this, args);
    if (args[0] > 1) range.setValues = () => { throw new Error('Falha simulada'); };
    return range;
  };
  assert.equal(a.api(p).status, 'error');
  log.getRange = original;
  assert.equal(a.api(p).data.repetida, true);
  assert.equal(a.listar().filter(i => i.nome === 'Teste retry').length, 1);
  assert.equal(log.rows.length, 2);
  assert.equal(log.rows[1][4], 'cadastrar');
  assert.equal(log.rows[1].some(v => String(v).includes(chave)), false);
});

test('nova edicao recupera log pendente e preserva replay anterior', () => {
  const a = ambiente(); a.context.instalarIntegracaoInstrutores();
  const r = a.api({ operacao: 'cadastrar', requestId: 'primeiro_req', dados: { modalidade: 'solo', nome: 'Primeiro', base: 'SJK' } });
  const log = a.abas.get('INTEGRACAO_INSTRUTORES_LOG');
  log.rows.splice(1); // Simula perda somente do log, mantendo o comprovante da linha.
  const item = r.data.instrutor;
  assert.equal(a.api({ operacao: 'editar', requestId: 'segundo_req', dados: { id: item.id, versao: item.versao, nome: 'Segundo' } }).status, 'success');
  assert.equal(log.rows.length, 3);
  const repetida = a.api({ operacao: 'cadastrar', requestId: 'primeiro_req', dados: { modalidade: 'solo', nome: 'Primeiro', base: 'SJK' } });
  assert.equal(repetida.data.repetida, true);
  assert.equal(repetida.data.instrutor.nome, 'Segundo');
});

test('cadastro legado do Hub tambem recebe ID; nao reutiliza nomes anteriores', () => {
  const a = ambiente(); a.context.instalarIntegracaoInstrutores();
  a.context.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, data: { autorizado: true } }) });
  for (const action of ['add_instructor', 'add_instructor_solo']) {
    const r = a.post({ action, token: 'token-hub', data: { nome: action, base: 'SJK', etiquetas: [], saldoInicial: 0 } });
    assert.equal(r.status, 'success');
    assert.ok(a.listar().find(i => i.nome === action).id);
  }
  const item = a.listar().find(i => i.nome === 'Ana Antiga');
  assert.equal(a.api({ operacao: 'editar', requestId: 'nome_reservado', dados: { id: item.id, versao: item.versao, nome: 'Ana Nova' } }).status, 'success');
  assert.equal(a.post({ action: 'add_instructor', token: 'token-hub', data: { nome: 'Ana Antiga', base: 'SJK' } }).status, 'error');
});

test('credencial de parceiro nao contorna rotas legadas de escrita ou sincronia', () => {
  const a = ambiente(); const n = a.writes();
  assert.equal(a.post({ action: 'set_instructor_active', chave, data: { nome: 'Ana Antiga', inativo: true } }).status, 'error');
  const r = JSON.parse(a.context.doGet({ parameter: { action: 'sync_cavok', chave } }).getContent());
  assert.equal(r.status, 'error'); assert.equal(a.writes(), n);
  a.context.UrlFetchApp.fetch = (_, req) => {
    assert.equal(JSON.parse(req.payload).token, 'token-hub');
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, data: { autorizado: true } }) };
  };
  a.context.handleSetInstructorActive = () => a.context.createJsonResponse({ status: 'success' });
  assert.equal(a.post({ action: 'set_instructor_active', token: 'token-hub', data: {} }).status, 'success');
});

test('limpeza administrativa remove somente fixtures sem dados operacionais', () => {
  const a = ambiente(); a.context.instalarIntegracaoInstrutores();
  const pessoa = a.listar()[0];
  assert.throws(() => a.context.limparTesteIntegracaoInstrutores([pessoa.id]));
  const r = a.api({ operacao: 'cadastrar', requestId: 'teste_limpeza', dados: { modalidade: 'solo', nome: 'TESTE API INSTRUTORES FIXTURE', base: 'SJK' } });
  assert.equal(r.status, 'success');
  assert.equal(a.context.limparTesteIntegracaoInstrutores([r.data.instrutor.id]).removidos, 1);
  assert.equal(a.listar().length, 3);
  assert.equal(a.api({ operacao: 'limpar_teste' }).code, 'OPERACAO_PROIBIDA');
});

test('guard do Hub usa sessao e permissoes; nomes antigos preservam vinculos internos', () => {
  const ctx = vm.createContext({});
  for (const f of ['InvaIntegracao.gs', 'FechamentoHorasInstrutores.gs']) vm.runInContext(fs.readFileSync(path.join(raiz, 'apps-script', f), 'utf8'), ctx);
  ctx.exigirSessao = () => ({ id: 'usuario', permissoesEfetivas: ['horas_inva.cadastrar_instrutor'] });
  ctx.usuarioTemPermissao = (u, p) => u.permissoesEfetivas.includes(p);
  assert.equal(ctx.autorizarEscritaInva('token', 'add_instructor').autorizado, true);
  assert.throws(() => ctx.autorizarEscritaInva('token', 'sync_cavok'));
  assert.throws(() => ctx.autorizarEscritaInva('token', 'manutencao'));
  const nomes = ctx.fhiParseInstrutoresEventuais_(JSON.stringify({ status: 'success', data: [{ nome: 'Nome Novo', etiquetas: ['eventual'], nomesAnteriores: ['Nome Antigo'] }] }));
  const h = ctx.fhiResolverNomesAnteriores_([{ instrutorChave: 'NOME ANTIGO', categoria: 'VFR', valor: 80, vigenteDesde: '2026-10-01' }], nomes);
  assert.equal(h[0].instrutorChave, 'NOME NOVO'); assert.equal(h[0].valor, 80);
  // Backend anterior sem nomesAnteriores continua compativel.
  assert.equal(ctx.fhiParseInstrutoresEventuais_(JSON.stringify({ status: 'success', data: [{ nome: 'Legado', etiquetas: ['eventual'] }] }))[0], 'Legado');
});

test('frontend envia sessao Hub nas consultas e gravacoes, sem credencial do parceiro', async () => {
  let req;
  const ctx = vm.createContext({ URLSearchParams, CONFIG: { HORAS_VOADAS_INVA_API_URL: 'https://example.test' }, Auth: { getSessao: () => ({ token: 'token-hub' }) }, fetch: async (url, opts) => { req = { url, opts }; return { ok: true, json: async () => ({ status: 'success' }) }; } });
  const source = fs.readFileSync(path.join(raiz, 'js/pages/horas-voadas-inva.js'), 'utf8').replace(/HorasVoadasInva\.iniciar\(\);\s*$/, '');
  vm.runInContext(source + '\nglobalThis.pagina = HorasVoadasInva;', ctx);
  await ctx.pagina.requisitar('sync_cavok');
  assert.equal(new URL(req.url).searchParams.get('token'), 'token-hub');
  await ctx.pagina.enviar('add_instructor', { nome: 'Teste', base: 'SJK' });
  assert.equal(JSON.parse(req.opts.body).token, 'token-hub');
  assert.equal(JSON.parse(req.opts.body).chave, undefined);
});
