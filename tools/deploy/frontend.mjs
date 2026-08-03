// ============================================================
// frontend.mjs: Publica o Hub no GitHub Pages.
//
// O deploy em si sempre foi so `git push` na main. O que faltava era
// as duas pontas:
//   - ANTES: o `?v=` de cada asset, escolhido a mao, que quando e
//     esquecido faz o Pages servir arquivo velho para quem ja visitou.
//     Agora o bump por hash roda sozinho aqui.
//   - DEPOIS: ninguem conferia se o Pages tinha realmente publicado.
//     Agora a funcao busca o site de verdade e espera o hash novo
//     aparecer, entao "publicado" quer dizer publicado.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './alvos.mjs';
import { bumpar, relatarBump } from './bump.mjs';
import {
  Recusa, rodar, rodarOuFalhar, anunciar, titulo, ok, aviso, erro, nota, cinza,
} from './util.mjs';

const SITE = 'https://hub.voesafe.com.br';
const BRANCH = 'main';
/** Arquivo usado como sentinela da publicacao. */
const SENTINELA = { html: 'inicio.html', asset: 'js/core/auth.js' };

const git = (args, opcoes = {}) => rodar('git', args, { cwd: RAIZ, ...opcoes });

async function ramoAtual() {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.saida.trim();
}

async function mudancas() {
  const r = await git(['status', '--porcelain']);
  return r.saida.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Hash com que o asset sentinela ficou depois do bump. */
function hashSentinela() {
  const html = fs.readFileSync(path.join(RAIZ, SENTINELA.html), 'utf8');
  const re = new RegExp(SENTINELA.asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([0-9a-f]+)');
  const m = html.match(re);
  return m ? m[1] : null;
}

/**
 * ⚠️ Espera o GitHub Pages publicar de verdade.
 * O `git push` volta na hora, mas o Pages leva de segundos a alguns
 * minutos. Dizer "publicado" no push e o motivo de alguem conferir a
 * pagina cedo demais, ver o comportamento antigo e achar que o deploy
 * nao funcionou.
 */
async function esperarPages(hashEsperado, limiteSegundos = 240) {
  if (!hashEsperado) {
    aviso('Sem hash sentinela para conferir. Pulei a checagem do Pages.');
    return null;
  }
  const ate = Date.now() + limiteSegundos * 1000;
  let tentativa = 0;
  process.stdout.write(`    ${cinza('aguardando o GitHub Pages')}`);
  while (Date.now() < ate) {
    tentativa += 1;
    try {
      // O parametro aleatorio fura qualquer cache de borda no caminho.
      const r = await fetch(`${SITE}/${SENTINELA.html}?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const txt = await r.text();
      if (txt.includes(`?v=${hashEsperado}`)) {
        process.stdout.write('\n');
        ok(`GitHub Pages publicou (sentinela ${SENTINELA.asset}?v=${hashEsperado}).`);
        return true;
      }
    } catch {
      /* rede oscilando: tenta de novo */
    }
    process.stdout.write(cinza('.'));
    await new Promise((r) => setTimeout(r, tentativa < 5 ? 5000 : 15000));
  }
  process.stdout.write('\n');
  aviso(
    `O Pages ainda nao serviu o hash novo em ${limiteSegundos}s. ` +
      'O push foi feito; costuma ser so demora da publicacao.'
  );
  return false;
}

/**
 * @param {{ msg?: string, seco?: boolean, semEspera?: boolean }} opcoes
 */
export async function publicarFrontend(opcoes = {}) {
  titulo('Frontend do Hub (GitHub Pages)');

  const ramo = await ramoAtual();
  if (ramo !== BRANCH) {
    throw new Recusa(
      `Voce esta no ramo "${ramo}". O Pages publica a "${BRANCH}".\n` +
        'Troque de ramo ou abra um PR.'
    );
  }
  ok(`Ramo ${BRANCH}.`);

  const r = bumpar({ seco: !!opcoes.seco });
  relatarBump(r, !!opcoes.seco);

  const pendentes = await mudancas();
  if (!pendentes.length) {
    ok('Nada a publicar: arvore limpa e cache-bust em dia.');
    return { publicado: false };
  }

  console.log(`    ${cinza('vai commitar:')}`);
  for (const p of pendentes.slice(0, 40)) nota(p);
  if (pendentes.length > 40) nota(`… e mais ${pendentes.length - 40}`);

  if (opcoes.seco) {
    aviso('Ensaio (--seco): nada commitado nem empurrado.');
    return { publicado: false, ensaio: true };
  }

  const msg = opcoes.msg;
  if (!msg) {
    throw new Recusa(
      'Falta a mensagem do commit. Use --msg="feat(x): o que mudou".\n' +
        'Sem mensagem o historico deixa de dizer por que cada deploy aconteceu.'
    );
  }

  anunciar('git', ['add', '-A'], RAIZ);
  await rodarOuFalhar('git', ['add', '-A'], { cwd: RAIZ });

  anunciar('git', ['commit', '-m', msg], RAIZ);
  const rc = await git(['commit', '-m', msg]);
  if (rc.codigo !== 0) throw new Recusa(`git commit falhou:\n${rc.saida || rc.erroSaida}`);
  ok('Commit criado.');

  anunciar('git', ['push', 'origin', BRANCH], RAIZ);
  await rodarOuFalhar('git', ['push', 'origin', BRANCH], { cwd: RAIZ });
  ok('Empurrado para origin/main.');

  const hash = hashSentinela();
  const publicou = opcoes.semEspera ? null : await esperarPages(hash);

  return { publicado: true, hashSentinela: hash, pagesConfirmado: publicou };
}
