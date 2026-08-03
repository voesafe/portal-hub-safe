// ============================================================
// verificar-gs.mjs: Rede de seguranca antes de qualquer push.
//
// ⚠️ Erro de sintaxe em UM .gs derruba o projeto Apps Script INTEIRO,
// porque todos os arquivos compartilham um escopo so. O modo de falha
// nao e "o recurso novo nao funciona", e "a plataforma inteira sai do
// ar". Conferir aqui custa milissegundos.
//
// Confere tres coisas:
//   1. Sintaxe de cada arquivo, por `new Function()`.
//   2. Par .js/.gs com o mesmo nome. O `clasp pull` grava `Auth.js`
//      AO LADO de `Auth.gs` (por causa do scriptExtensions), e empurrar
//      os dois deixa o projeto com todas as funcoes duplicadas.
//   3. Funcao de topo com nome repetido entre arquivos. No escopo unico
//      do Apps Script a ultima vence, em silencio.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Recusa, ok, erro, nota } from './util.mjs';

const EXTENSOES = ['.gs', '.js'];

function listarFontes(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && EXTENSOES.includes(path.extname(d.name)))
    .map((d) => d.name)
    .sort();
}

/** Nomes de funcao declarados no topo do arquivo (coluna 1). */
function funcoesDeTopo(fonte) {
  const nomes = [];
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(fonte)) !== null) nomes.push(m[1]);
  return nomes;
}

/**
 * @param {string} dir pasta com os .gs
 * @param {{ permitirDuplicatas?: boolean }} opcoes
 */
export function verificarFontes(dir, opcoes = {}) {
  if (!fs.existsSync(dir)) {
    throw new Recusa(`Pasta de fontes nao encontrada: ${dir}`);
  }

  const arquivos = listarFontes(dir);
  if (arquivos.length === 0) {
    throw new Recusa(`Nenhum .gs/.js em ${dir}. Alvo errado?`);
  }

  // 1. Par .js / .gs com o mesmo nome.
  const porBase = new Map();
  for (const nome of arquivos) {
    const base = path.basename(nome, path.extname(nome));
    if (!porBase.has(base)) porBase.set(base, []);
    porBase.get(base).push(nome);
  }
  const pares = [...porBase.values()].filter((v) => v.length > 1);
  if (pares.length) {
    throw new Recusa(
      'Arquivos duplicados por extensao (o `clasp pull` deixa .js ao lado do .gs).\n' +
        'Empurrar assim duplica TODAS as funcoes do projeto. Apague os .js antes.\n' +
        pares.map((p) => '  ' + p.join('  +  ')).join('\n')
    );
  }

  // 2. Sintaxe.
  const quebrados = [];
  const declaracoes = new Map();
  for (const nome of arquivos) {
    const fonte = fs.readFileSync(path.join(dir, nome), 'utf8');
    try {
      // eslint-disable-next-line no-new-func
      new Function(fonte);
    } catch (e) {
      quebrados.push(`  ${nome}: ${e.message}`);
      continue;
    }
    for (const fn of funcoesDeTopo(fonte)) {
      if (!declaracoes.has(fn)) declaracoes.set(fn, []);
      declaracoes.get(fn).push(nome);
    }
  }
  if (quebrados.length) {
    throw new Recusa(
      'Erro de sintaxe. Publicar assim derruba o projeto Apps Script inteiro:\n' +
        quebrados.join('\n')
    );
  }

  // 3. Funcao de topo repetida.
  const repetidas = [...declaracoes.entries()].filter(([, arqs]) => arqs.length > 1);
  if (repetidas.length && !opcoes.permitirDuplicatas) {
    throw new Recusa(
      'Funcao de topo declarada em mais de um arquivo. No escopo unico do\n' +
        'Apps Script a ultima vence, sem aviso nenhum:\n' +
        repetidas.map(([fn, arqs]) => `  ${fn}()  em  ${arqs.join(', ')}`).join('\n') +
        '\nSe for intencional, rode de novo com --permitir-duplicatas.'
    );
  }
  if (repetidas.length) {
    for (const [fn, arqs] of repetidas) {
      nota(`funcao repetida tolerada: ${fn}() em ${arqs.join(', ')}`);
    }
  }

  ok(
    `${arquivos.length} arquivo(s) conferido(s): sintaxe ok, sem par .js/.gs, ` +
      `${declaracoes.size} funcoes de topo.`
  );
  return { arquivos, funcoes: declaracoes.size };
}

// Uso solto: node verificar-gs.mjs <pasta>
// ⚠️ Comparar `import.meta.url` com `file://` + argv nao funciona aqui: o
// caminho tem espaco ("01. Codigo VSCODE SAFE") e a URL vem percent-encoded.
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  try {
    verificarFontes(path.resolve(process.argv[2] || '.'));
  } catch (e) {
    erro(e.message);
    process.exit(1);
  }
}
