// ============================================================
// backend.mjs: Publica um backend Apps Script de ponta a ponta.
//
// Substitui a sequencia que era feita a mao e que tinha tres jeitos
// conhecidos de dar errado:
//   - `clasp push` sozinho: mexe so no @HEAD, PRODUCAO NAO MUDA, e a
//     pessoa sai achando que publicou;
//   - push por cima de edicao feita direto no editor do Apps Script:
//     destroi trabalho que nunca esteve no git (ja aconteceu no INVA,
//     que estava tres versoes atras do publicado);
//   - erro de sintaxe em um .gs: derruba o projeto INTEIRO, nao so o
//     recurso novo.
//
// A ordem aqui e: conferir sintaxe → conferir se o remoto nao andou →
// push → deploy versionado → sonda de fumaca na URL de producao.
// ============================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { alvo, alvoDisponivel, CONTAS_CLASP } from './alvos.mjs';
import { verificarFontes } from './verificar-gs.mjs';
import {
  Recusa, rodar, rodarOuFalhar, anunciar, titulo, ok, aviso, erro, nota, cinza, forte,
} from './util.mjs';

/** Confere que o clasp esta logado e na conta certa. */
async function conferirLogin() {
  const r = await rodar('clasp', ['show-authorized-user']);
  if (r.codigo !== 0 || /not logged in|no credentials/i.test(r.saida + r.erroSaida)) {
    throw new Recusa(
      'clasp sem sessao. Rode `clasp login` e tente de novo.\n' +
        `Contas que publicam estes projetos: ${CONTAS_CLASP.join(', ')}.`
    );
  }
  // ⚠️ `\S+` greedy de proposito: o e-mail tem ponto no lado local
  // (victor.pinho@…) e a frase termina em ponto. Um `[^\s.]+` cortaria
  // no primeiro ponto e a conta sairia sempre "(desconhecida)", o que
  // desliga a guarda em silencio.
  const m = r.saida.match(/logged in as (\S+@\S+)\./i);
  const conta = m ? m[1] : '(desconhecida)';
  if (m && !CONTAS_CLASP.includes(conta)) {
    throw new Recusa(
      `clasp logado como ${conta}, mas estes projetos sao de ${CONTAS_CLASP.join(' ou ')}.\n` +
        'Publicar assim ou falha por permissao ou publica no lugar errado.\n' +
        'Rode `clasp login` com a conta certa.'
    );
  }
  ok(`clasp logado como ${conta}.`);
}

/** Baixa o @HEAD remoto para uma pasta temporaria. */
async function baixarHeadRemoto(a) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `safe-head-${a.chave}-`));
  fs.writeFileSync(
    path.join(tmp, '.clasp.json'),
    JSON.stringify(
      {
        scriptId: a.scriptId,
        rootDir: '.',
        // ⚠️ So `.gs` de proposito. Com `.js` na lista o clasp grava
        // `Auth.js`, e comparar `Auth.js` com `Auth.gs` daria diferenca
        // em todo arquivo, transformando a guarda em ruido.
        scriptExtensions: ['.gs'],
        htmlExtensions: ['.html'],
        jsonExtensions: ['.json'],
      },
      null,
      2
    )
  );
  anunciar('clasp', ['-P', tmp, 'pull'], tmp);
  await rodarOuFalhar('clasp', ['-P', tmp, 'pull']);
  return tmp;
}

/** Nome do arquivo sem extensao, para casar Auth.gs com Auth.js. */
const base = (n) => path.basename(n, path.extname(n));

const sha = (txt) => crypto.createHash('sha256').update(txt).digest('hex');

function lerPasta(dir) {
  const m = new Map();
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isFile() || d.name === '.clasp.json') continue;
    if (!/\.(gs|js|json|html)$/.test(d.name)) continue;
    m.set(base(d.name), sha(fs.readFileSync(path.join(dir, d.name), 'utf8')));
  }
  return m;
}

// ── Estado do ultimo push ───────────────────────────────────
//
// ⚠️ Sem isto a guarda de drift nao serve para nada, e foi assim que
// ela nasceu. Comparar o remoto com o LOCAL confunde as duas coisas
// que precisam ser distinguidas: "eu mudei o arquivo aqui" e "alguem
// editou pelo editor do Apps Script" produzem exatamente a mesma
// diferenca. Uma guarda que acusa toda entrega normal vira `--forcar`
// de habito, e aí nao guarda mais nada.
//
// O que separa as duas e a memoria do que ESTE toolkit empurrou por
// ultimo. Remoto diferente do ultimo push = alguem mexeu por fora.

const ARQUIVO_ESTADO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'estado-backends.json');

function lerEstado() {
  if (!fs.existsSync(ARQUIVO_ESTADO)) return {};
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_ESTADO, 'utf8'));
  } catch {
    aviso('estado-backends.json ilegivel. Tratando como primeira publicacao.');
    return {};
  }
}

function gravarEstado(chave, arquivos) {
  const estado = lerEstado();
  estado[chave] = {
    empurradoEm: new Date().toISOString(),
    arquivos: Object.fromEntries(arquivos),
  };
  fs.writeFileSync(ARQUIVO_ESTADO, JSON.stringify(estado, null, 2) + '\n');
}

function comparar(referencia, remoto) {
  const fora = [];
  for (const [nome, hash] of remoto) {
    if (!referencia.has(nome)) fora.push(`${nome}: apareceu no remoto`);
    else if (referencia.get(nome) !== hash) fora.push(`${nome}: conteudo mudou no remoto`);
  }
  for (const nome of referencia.keys()) {
    if (!remoto.has(nome)) fora.push(`${nome}: sumiu do remoto`);
  }
  return fora;
}

/**
 * Confere se alguem editou o projeto pelo editor do Apps Script desde
 * o ultimo push feito daqui. Recusa em vez de perguntar: a resposta
 * certa quase sempre e "pare e olhe o diff", nao "sim, continue".
 */
async function conferirDrift(a, opcoes) {
  const tmp = await baixarHeadRemoto(a);
  const limpar = () => fs.rmSync(tmp, { recursive: true, force: true });

  try {
    const remoto = lerPasta(tmp);
    const local = lerPasta(a.dirFontes);
    const estado = lerEstado()[a.chave];

    if (!estado) {
      // Primeira vez: nao ha memoria de push nenhum, entao o unico
      // parametro possivel e o local. Se bate, adota como linha de base
      // em silencio. Se nao bate, nao da para saber se a diferenca e
      // trabalho local ou edicao alheia, e ai quem decide e a pessoa.
      const dif = comparar(local, remoto);
      if (dif.length && !opcoes.adotarRemoto && !opcoes.forcar) {
        limpar();
        throw new Recusa(
          `Primeira publicacao de "${a.nome}" por este toolkit, e o remoto\n` +
            'nao bate com o local. Sem memoria de push anterior nao da para\n' +
            'saber se a diferenca e trabalho seu ainda nao publicado ou\n' +
            'edicao feita direto no editor do Apps Script.\n\n' +
            dif.map((d) => '  ' + d).join('\n') +
            '\n\n  --adotar-remoto  se o remoto e o esperado e a diferenca e\n' +
            '                   trabalho local a publicar (o caso comum)\n' +
            '  --forcar         se voce ja conferiu e quer sobrescrever'
        );
      }
      ok(
        dif.length
          ? 'Primeira publicacao: adotando o @HEAD remoto como linha de base.'
          : 'Primeira publicacao: remoto igual ao local.'
      );
      // ⚠️ Ensaio nao grava a linha de base. O carimbo diz "empurrado em",
      // e um ensaio nao empurrou nada: a rodada seguinte acharia que tem
      // memoria de um push que nunca existiu.
      if (!opcoes.seco) gravarEstado(a.chave, remoto);
      limpar();
      return { mudou: comparar(remoto, local).length > 0, local };
    }

    const referencia = new Map(Object.entries(estado.arquivos));
    const alheias = comparar(referencia, remoto);

    if (alheias.length && !opcoes.forcar) {
      throw new Recusa(
        `O @HEAD de "${a.nome}" mudou desde o ultimo push daqui ` +
          `(${estado.empurradoEm}).\n` +
          'Isso e edicao feita direto no editor do Apps Script, e empurrar\n' +
          'agora APAGA esse trabalho, que nunca esteve no git.\n\n' +
          alheias.map((d) => '  ' + d).join('\n') +
          `\n\nPara ver o que mudou:\n  diff -ru "${a.dirFontes}" "${tmp}"\n` +
          '(a pasta temporaria acima nao foi apagada de proposito)\n\n' +
          'Se a edicao do editor pode ser descartada, repita com --forcar.'
      );
    }
    if (alheias.length) {
      aviso(`${alheias.length} edicao(oes) feitas no editor serao sobrescritas por --forcar:`);
      for (const d of alheias) nota(d);
    } else {
      ok('Remoto intacto desde o ultimo push daqui.');
    }

    const meu = comparar(remoto, local);
    if (meu.length) ok(`${meu.length} arquivo(s) com mudanca local a publicar.`);
    else nota('Nenhuma mudanca local: a versao de producao sera recriada igual.');

    limpar();
    return { mudou: meu.length > 0, local };
  } catch (e) {
    // Em recusa a pasta fica, e o texto acima manda olhar o diff nela.
    if (!(e instanceof Recusa)) limpar();
    throw e;
  }
}

/** Versao de producao antes do deploy, para o comando de rollback. */
async function versaoAtual(a) {
  const r = await rodar('clasp', ['list-deployments'], { cwd: a.dirClasp });
  const linha = r.saida.split('\n').find((l) => l.includes(a.implantacaoProducao));
  const m = linha && linha.match(/@(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Sonda de fumaca: a implantacao de producao responde JSON? */
async function sondar(a) {
  const url = `${a.url}?action=${encodeURIComponent(a.sondaAcao)}`;
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const txt = await r.text();
    try {
      JSON.parse(txt);
    } catch {
      throw new Error(
        'a implantacao respondeu algo que nao e JSON. ' +
          'Costuma ser erro de compilacao no projeto:\n' +
          txt.slice(0, 300)
      );
    }
    ok('Sonda de fumaca: producao respondendo JSON.');
    return true;
  } catch (e) {
    erro(`Sonda de fumaca falhou: ${e.message}`);
    return false;
  }
}

/**
 * @param {string} chave hub | inva | cco
 * @param {{ descricao?: string, forcar?: boolean, seco?: boolean, permitirDuplicatas?: boolean }} opcoes
 */
export async function publicarBackend(chave, opcoes = {}) {
  const a = alvo(chave);
  titulo(`${a.nome}`);

  if (!alvoDisponivel(a)) {
    throw new Recusa(
      `Pasta do alvo nao encontrada nesta maquina:\n  ${a.dirClasp}\n` +
        'Este backend vive fora do repositorio do Hub.'
    );
  }

  await conferirLogin();
  verificarFontes(a.dirFontes, { permitirDuplicatas: !!opcoes.permitirDuplicatas });
  const { mudou, local } = await conferirDrift(a, {
    forcar: !!opcoes.forcar,
    adotarRemoto: !!opcoes.adotarRemoto,
    seco: !!opcoes.seco,
  });

  if (opcoes.seco) {
    aviso('Ensaio (--seco): nada foi empurrado nem publicado.');
    return { publicado: false, ensaio: true };
  }

  const antes = await versaoAtual(a);

  anunciar('clasp', ['push', '-f'], a.dirClasp);
  await rodarOuFalhar('clasp', ['push', '-f'], { cwd: a.dirClasp });
  ok('Codigo empurrado para o @HEAD.');

  // Memoria do que foi empurrado, que e o que faz a guarda de drift da
  // proxima vez conseguir distinguir trabalho local de edicao alheia.
  gravarEstado(a.chave, local);

  const descricao = (opcoes.descricao || 'deploy automatico').slice(0, 200);
  anunciar(
    'clasp',
    ['create-deployment', '-i', a.implantacaoProducao, '-d', descricao],
    a.dirClasp
  );
  const r = await rodarOuFalhar(
    'clasp',
    ['create-deployment', '-i', a.implantacaoProducao, '-d', descricao],
    { cwd: a.dirClasp }
  );

  const mVersao = (r.saida + r.erroSaida).match(/@(\d+)/);
  const nova = mVersao ? Number(mVersao[1]) : null;
  ok(`Producao publicada${nova ? ` no @${nova}` : ''}.`);

  const sondaOk = await sondar(a);

  if (antes) {
    console.log(
      `    ${cinza('rollback:')} ${forte(
        `clasp redeploy ${a.implantacaoProducao} -V ${antes}`
      )} ${cinza(`(em ${a.dirClasp})`)}`
    );
  }
  if (!mudou) nota('Nenhum arquivo mudou, mas a versao de producao foi recriada mesmo assim.');

  return { publicado: true, versaoAnterior: antes, versaoNova: nova, sondaOk };
}
