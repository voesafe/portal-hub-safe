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
import { comparar } from './conferir.mjs';
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

  // ⚠️ Antes isto terminava com "costuma ser so demora da publicacao", e essa
  // frase custou uma tarde em 2026-08-06: o build estava FALHANDO, o push dizia
  // que deu certo, e a mensagem convidava a esperar em vez de investigar. Agora
  // o deploy vai atras do motivo e o imprime.
  aviso(`O Pages nao serviu o hash novo em ${limiteSegundos}s. Investigando...`);
  try {
    const r = await rodar('node', [path.join(RAIZ, 'tools/deploy/conferir.mjs')], { cwd: RAIZ });
    if (r.saida) process.stdout.write(r.saida.endsWith('\n') ? r.saida : r.saida + '\n');
  } catch {
    nota('(nao consegui rodar a conferencia; rode `node tools/deploy/conferir.mjs` na mao)');
  }
  nota('Se o motivo for instabilidade do GitHub, repita o push. Para acompanhar:');
  nota('  node tools/deploy/conferir.mjs --esperar');
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
    // ⚠️ Arvore limpa NAO quer dizer que producao esta em dia. O caso que
    // faltava aqui: o push deu certo e o BUILD do Pages e que falhou, entao
    // nao ha nada a commitar e este comando nao tinha como repetir a
    // publicacao. Foi o que aconteceu no incidente do GitHub de 2026-08-06,
    // e a saida "Nada a publicar" convidava a concluir que estava tudo certo.
    const cmp = await comparar();
    const defasados = [...cmp.divergentes, ...cmp.ausentes];
    if (!defasados.length) {
      ok('Nada a publicar: arvore limpa e producao em dia.');
      return { publicado: false };
    }

    aviso(`Arvore limpa, mas producao esta ${defasados.length} asset(s) atras.`);
    nota('O codigo ja foi empurrado; quem falhou foi o build do Pages.');
    if (opcoes.seco) {
      aviso('Ensaio (--seco): nao repetiria a publicacao agora.');
      return { publicado: false, ensaio: true };
    }
    // Commit vazio e o unico jeito de pedir um build novo sem direito de
    // admin no repositorio (`gh run rerun` exige admin).
    const msgRepetir = opcoes.msg || 'chore: nova tentativa de publicacao';
    anunciar('git', ['commit', '--allow-empty', '-m', msgRepetir], RAIZ);
    const rcv = await git(['commit', '--allow-empty', '-m', msgRepetir]);
    if (rcv.codigo !== 0) throw new Recusa(`git commit falhou:\n${rcv.saida || rcv.erroSaida}`);
    anunciar('git', ['push', 'origin', BRANCH], RAIZ);
    await rodarOuFalhar('git', ['push', 'origin', BRANCH], { cwd: RAIZ });
    ok('Build novo pedido por commit vazio.');

    const h = hashSentinela();
    const pub = opcoes.semEspera ? null : await esperarPages(h);
    return { publicado: true, repeticao: true, hashSentinela: h, pagesConfirmado: pub };
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
