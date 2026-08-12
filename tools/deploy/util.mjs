// ============================================================
// util.mjs: Encanamento comum do toolkit de deploy.
// ============================================================

import { spawn } from 'node:child_process';

const COR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (codigo) => (txt) => (COR ? `[${codigo}m${txt}[0m` : txt);

export const cinza = c('90');
export const vermelho = c('31');
export const verde = c('32');
export const amarelo = c('33');
export const azul = c('36');
export const forte = c('1');

export function titulo(txt) {
  console.log(`\n${forte(azul('▸ ' + txt))}`);
}
export function ok(txt) {
  console.log(`  ${verde('✓')} ${txt}`);
}
export function aviso(txt) {
  console.log(`  ${amarelo('!')} ${txt}`);
}
export function erro(txt) {
  console.log(`  ${vermelho('✗')} ${txt}`);
}
export function nota(txt) {
  console.log(`    ${cinza(txt)}`);
}

/**
 * Erro que o CLI mostra sem pilha: e recusa esperada, nao defeito.
 */
export class Recusa extends Error {}

/**
 * Poe aspas num argumento de linha de comando do cmd.exe do Windows,
 * so quando precisa (espaco, aspas ou vazio). Aspas interna vira \".
 *
 * ⚠️ NECESSARIO porque `spawn(cmd, args, {shell:true})` no Windows, com
 * `args` em ARRAY, apenas CONCATENA sem escapar (Node emite o aviso
 * DEP0190 avisando disso). `os.tmpdir()`/pastas de projeto no Windows
 * podem ter espaco (o Pedro tem "Safe TI" no caminho do clone), e sem
 * este escape um argumento assim vira DOIS argumentos para o cmd.exe.
 * Sem essa funcao, funcionaria por sorte enquanto nenhum caminho
 * envolvido tivesse espaco, e quebraria em silencio no dia que tivesse.
 */
function quotarArgWin32_(arg) {
  const s = String(arg);
  if (s !== '' && !/[\s"]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

/**
 * Roda um comando e devolve { codigo, saida, erroSaida }.
 * Nao usa shell no POSIX, entao caminho com espaco (e temos varios,
 * "01. Codigo VSCODE SAFE") nao precisa de aspas nem escapa nada.
 *
 * ⚠️ NO WINDOWS, `shell` precisa ser `true`. Binario global instalado
 * pelo npm (clasp, node ali mesmo) e um shim `.cmd`/`.ps1`, nao um
 * executavel direto: sem shell, `spawn('clasp', …)` nunca acha o
 * processo (ENOENT), cai em `p.on('error')`, devolve codigo 127, e
 * `conferirLogin()` interpretava isso como "clasp sem sessao" —
 * mensagem enganosa, porque a sessao estava certa o tempo todo.
 * Medido em 2026-08-12 na maquina do Pedro. `cwd` nao passa pela
 * shell, entao caminho com espaco no POSIX segue intocado.
 */
export function rodar(comando, args, opcoes = {}) {
  const { cwd, mostrar = false, entrada = null } = opcoes;
  const win = process.platform === 'win32';
  // Com shell:true no Windows, `args` some: a linha inteira, ja
  // escapada, vai no primeiro parametro. Sem isso o Node concatena
  // sem aspas (DEP0190) e um caminho com espaco vira dois argumentos.
  const comandoFinal = win ? [comando, ...args].map(quotarArgWin32_).join(' ') : comando;
  const argsFinal = win ? [] : args;
  return new Promise((resolve) => {
    const p = spawn(comandoFinal, argsFinal, {
      cwd,
      shell: win,
      stdio: [entrada === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let saida = '';
    let erroSaida = '';
    p.stdout.on('data', (d) => {
      saida += d;
      if (mostrar) process.stdout.write(cinza(String(d)));
    });
    p.stderr.on('data', (d) => {
      erroSaida += d;
      if (mostrar) process.stderr.write(cinza(String(d)));
    });
    if (entrada !== null) {
      p.stdin.write(entrada);
      p.stdin.end();
    }
    p.on('error', (e) => resolve({ codigo: 127, saida, erroSaida: e.message }));
    p.on('close', (codigo) => resolve({ codigo, saida, erroSaida }));
  });
}

/** Roda e recusa quando o comando falha. */
export async function rodarOuFalhar(comando, args, opcoes = {}) {
  const r = await rodar(comando, args, opcoes);
  if (r.codigo !== 0) {
    throw new Recusa(
      `Comando falhou (${comando} ${args.join(' ')}):\n${(r.erroSaida || r.saida).trim()}`
    );
  }
  return r;
}

/**
 * Mostra o comando exato antes de rodar.
 * Exigencia do CLAUDE.md: nada de build/deploy sem dizer o que vai rodar.
 */
export function anunciar(comando, args, cwd) {
  console.log(`    ${cinza('$')} ${cinza([comando, ...args].join(' '))}`);
  if (cwd) nota(`em ${cwd}`);
}

/** Le argumentos no formato --chave=valor / --flag. */
export function lerArgs(argv) {
  const posicionais = [];
  const opcoes = {};
  for (const bruto of argv) {
    if (!bruto.startsWith('--')) {
      posicionais.push(bruto);
      continue;
    }
    const sem = bruto.slice(2);
    const i = sem.indexOf('=');
    if (i === -1) opcoes[sem] = true;
    else opcoes[sem.slice(0, i)] = sem.slice(i + 1);
  }
  return { posicionais, opcoes };
}
