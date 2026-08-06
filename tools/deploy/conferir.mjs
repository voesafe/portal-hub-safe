/**
 * conferir.mjs — Producao esta servindo o que esta no repositorio?
 *
 * POR QUE ISTO EXISTE
 * Em 2026-08-06 o GitHub passou a recusar os builds do Pages ANTES de comecarem
 * (`Failed to resolve action download info / Service Unavailable`). O `git push`
 * continuava dizendo que deu certo, a API do Pages so dizia `Page build failed.`
 * sem detalhe, e o site seguia servindo a versao anterior. Passamos a tarde as
 * cegas, e quem entregou a mensagem real foi um e-mail de aviso do GitHub, por
 * acaso.
 *
 * Esta ferramenta responde as duas perguntas que faltaram:
 *   1. Producao esta atualizada? (compara o `?v=` de CADA asset, pagina a pagina)
 *   2. Se nao esta, por que? (estado do build e as ANOTACOES do job, que sao
 *      onde a mensagem de verdade mora)
 *
 * Uso:
 *   node tools/deploy/conferir.mjs                 confere agora e sai
 *   node tools/deploy/conferir.mjs --esperar       insiste ate sincronizar
 *   node tools/deploy/conferir.mjs --esperar=600   com limite proprio, em segundos
 *
 * Codigo de saida 0 = em dia. 1 = defasado ou build com erro.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, aviso, erro, nota, titulo, cinza, rodar } from './util.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = 'https://hub.voesafe.com.br';

/** Todo `href`/`src` local que carrega `?v=`. E o que o cache-bust versiona. */
const RE_ASSET = /(?:href|src)="([^"]+?)\?v=([0-9a-f]+)"/g;

function paginasLocais() {
  return fs
    .readdirSync(RAIZ)
    .filter((f) => f.endsWith('.html'))
    .sort();
}

function assetsDe(html) {
  const fora = new Map();
  for (const m of html.matchAll(RE_ASSET)) fora.set(m[1], m[2]);
  return fora;
}

/**
 * ⚠️ Cache-buster na URL da REQUISICAO, nao no arquivo. Sem ele o CDN do Pages
 * pode devolver a copia velha e a conferencia acusaria defasagem que ja foi
 * resolvida, ou pior, silenciaria uma que existe.
 */
async function buscar(pagina) {
  const url = `${SITE}/${pagina}?conferir=${Date.now()}${Math.random()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return { erro: `HTTP ${res.status}` };
  return { html: await res.text() };
}

async function comparar() {
  const paginas = paginasLocais();
  const divergentes = [];
  const ausentes = [];
  let assetsConferidos = 0;

  await Promise.all(
    paginas.map(async (pagina) => {
      const local = assetsDe(fs.readFileSync(path.join(RAIZ, pagina), 'utf8'));
      const r = await buscar(pagina);
      if (r.erro) {
        // Pagina nova ainda nao publicada cai aqui, e e uma divergencia
        // legitima: ela existe no repositorio e nao existe no ar.
        ausentes.push({ pagina, motivo: r.erro });
        return;
      }
      const remoto = assetsDe(r.html);
      for (const [asset, hashLocal] of local) {
        assetsConferidos++;
        const hashRemoto = remoto.get(asset);
        if (hashRemoto !== hashLocal) {
          divergentes.push({ pagina, asset, local: hashLocal, remoto: hashRemoto || '(ausente)' });
        }
      }
    })
  );

  return { paginas: paginas.length, assetsConferidos, divergentes, ausentes };
}

/** Estado do ultimo build e, se falhou, a mensagem que a API nao mostra. */
async function diagnosticoPages() {
  const gh = async (args) => {
    const r = await rodar('gh', args, { cwd: RAIZ });
    return r.codigo === 0 ? r.saida.trim() : null;
  };

  const estado = await gh(['api', 'repos/:owner/:repo/pages/builds/latest', '--jq', '.status']);
  if (!estado) return { estado: '(nao consegui consultar; gh autenticado?)' };

  if (estado !== 'errored') return { estado };

  // ⚠️ A mensagem util NAO esta na API de builds (ela so diz "Page build
  // failed."). Ela esta nas ANOTACOES do check-run do job, que e o que o
  // e-mail de aviso do GitHub mostra.
  const runsJson = await gh([
    'api', 'repos/:owner/:repo/actions/runs?per_page=10',
    '--jq', '[.workflow_runs[] | select(.name=="pages build and deployment")][0].id',
  ]);
  if (!runsJson) return { estado, anotacoes: [] };

  const jobsJson = await gh([
    'api', `repos/:owner/:repo/actions/runs/${runsJson}/jobs`, '--jq', '.jobs[].id',
  ]);
  const anotacoes = [];
  for (const jid of (jobsJson || '').split('\n').filter(Boolean)) {
    const a = await gh([
      'api', `repos/:owner/:repo/check-runs/${jid}/annotations`,
      '--jq', '.[] | "\\(.annotation_level): \\(.message)"',
    ]);
    if (a) anotacoes.push(...a.split('\n').filter(Boolean));
  }
  return { estado, anotacoes };
}

function relatar(r) {
  if (!r.divergentes.length && !r.ausentes.length) {
    ok(`Producao em dia: ${r.assetsConferidos} assets conferidos em ${r.paginas} paginas.`);
    return true;
  }

  erro('Producao esta DEFASADA em relacao ao repositorio.');

  if (r.ausentes.length) {
    nota('paginas que nao existem no ar:');
    for (const a of r.ausentes) nota(`  ${a.pagina} (${a.motivo})`);
  }

  if (r.divergentes.length) {
    // Agrupa por asset: um arquivo de `core/` diverge em 22 paginas e listar
    // as 22 linhas so esconderia quantos arquivos de fato estao para tras.
    const porAsset = new Map();
    for (const d of r.divergentes) {
      if (!porAsset.has(d.asset)) porAsset.set(d.asset, { ...d, paginas: 0 });
      porAsset.get(d.asset).paginas++;
    }
    nota(`${porAsset.size} asset(s) para tras:`);
    for (const [asset, d] of porAsset) {
      nota(`  ${asset}  repo=${d.local}  no ar=${d.remoto}  (${d.paginas} pagina(s))`);
    }
  }
  return false;
}

// ── Execucao ────────────────────────────────────────────────

const args = process.argv.slice(2);
const flagEsperar = args.find((a) => a.startsWith('--esperar'));
const limite = flagEsperar
  ? Number((flagEsperar.split('=')[1] || '600'))
  : 0;

titulo('SAFE Hub · conferencia da publicacao');

let emDia = relatar(await comparar());

if (!emDia && limite > 0) {
  nota(`insistindo por ate ${limite}s...`);
  const ate = Date.now() + limite * 1000;
  while (!emDia && Date.now() < ate) {
    await new Promise((r) => setTimeout(r, 20000));
    const r = await comparar();
    if (!r.divergentes.length && !r.ausentes.length) {
      ok('Producao sincronizou.');
      emDia = true;
      break;
    }
    // Build que ERROU nao vai sincronizar sozinho: avisa e para de esperar.
    const d = await diagnosticoPages();
    if (d.estado === 'errored') {
      erro('O build do Pages FALHOU. Esperar nao resolve.');
      if (d.anotacoes?.length) {
        nota('motivo (anotacoes do job):');
        for (const a of d.anotacoes) nota(`  ${a}`);
      }
      break;
    }
    process.stdout.write(cinza(`    build=${d.estado}\n`));
  }
}

if (!emDia) {
  const d = await diagnosticoPages();
  nota(`estado do ultimo build: ${d.estado}`);
  if (d.anotacoes?.length) {
    nota('motivo (anotacoes do job):');
    for (const a of d.anotacoes) nota(`  ${a}`);
  }
  aviso('Se o motivo for "Service Unavailable" ou "Failed to resolve action download info",');
  aviso('e instabilidade do GitHub: nao ha correcao do nosso lado, o tratamento e repetir.');
}

process.exit(emDia ? 0 : 1);
