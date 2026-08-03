#!/usr/bin/env node
// ============================================================
// deploy.mjs — Um comando para cada alvo de publicacao do SAFE Hub.
//
//   node tools/deploy/deploy.mjs front --msg="feat(x): ..."
//   node tools/deploy/deploy.mjs hub   --msg="rota nova de manutencao"
//   node tools/deploy/deploy.mjs inva cco
//   node tools/deploy/deploy.mjs tudo  --msg="..."
//   node tools/deploy/deploy.mjs hub   --seco     (ensaio, nao publica)
//
// Nada aqui e novo em capacidade: e a mesma sequencia de `clasp` e de
// `git` que ja era feita a mao. O que muda e que ela para sozinha
// quando alguma das condicoes de seguranca falha, em vez de publicar
// pela metade e a gente descobrir depois.
// ============================================================

import { publicarFrontend } from './frontend.mjs';
import { publicarBackend } from './backend.mjs';
import { ALVOS } from './alvos.mjs';
import { Recusa, lerArgs, titulo, ok, erro, aviso, nota, forte, cinza, verde, vermelho } from './util.mjs';

const AJUDA = `
${forte('deploy.mjs')} — publicacao do SAFE Hub

  ${forte('Alvos')}
    front       frontend do Hub no GitHub Pages (bump + commit + push + confere o Pages)
    hub         backend Apps Script do Hub
    inva        backend Apps Script das Horas Voadas INVA
    cco         backend Apps Script da Escala CCO
    backends    hub + inva + cco
    tudo        backends + front

  ${forte('Opcoes')}
    --msg="..."             mensagem do commit (obrigatoria para "front")
                            e descricao da versao do backend
    --seco                  ensaio: confere tudo e nao publica nada
    --forcar                empurra por cima de edicao feita no editor do Apps Script
    --adotar-remoto         so na 1a publicacao: adota o @HEAD remoto como linha
                            de base quando ele difere do local
    --sem-espera            nao espera o GitHub Pages confirmar
    --permitir-duplicatas   tolera funcao de topo repetida entre .gs

  ${forte('Exemplos')}
    node tools/deploy/deploy.mjs front --msg="fix(vendas): cidade por estado"
    node tools/deploy/deploy.mjs tudo --msg="feat(manutencao): rota de manutencao"
    node tools/deploy/deploy.mjs hub --seco
`;

const GRUPOS = {
  backends: ['hub', 'inva', 'cco'],
  tudo: ['hub', 'inva', 'cco', 'front'],
};

function expandir(posicionais) {
  const fora = [];
  for (const p of posicionais) {
    if (GRUPOS[p]) fora.push(...GRUPOS[p]);
    else fora.push(p);
  }
  return [...new Set(fora)];
}

async function principal() {
  const { posicionais, opcoes } = lerArgs(process.argv.slice(2));

  if (opcoes.help || opcoes.h || posicionais.length === 0) {
    console.log(AJUDA);
    process.exit(posicionais.length === 0 ? 1 : 0);
  }

  const alvos = expandir(posicionais);
  const conhecidos = new Set([...Object.keys(ALVOS), 'front']);
  const desconhecidos = alvos.filter((a) => !conhecidos.has(a));
  if (desconhecidos.length) {
    throw new Recusa(
      `Alvo desconhecido: ${desconhecidos.join(', ')}.\n` +
        `Conhecidos: front, ${Object.keys(ALVOS).join(', ')}, backends, tudo.`
    );
  }

  const comuns = {
    seco: !!opcoes.seco,
    forcar: !!opcoes.forcar,
    adotarRemoto: !!opcoes['adotar-remoto'],
    permitirDuplicatas: !!opcoes['permitir-duplicatas'],
  };

  console.log(
    forte(`\nSAFE Hub · deploy${comuns.seco ? cinza(' (ensaio)') : ''}`) +
      cinza(`  alvos: ${alvos.join(', ')}`)
  );

  const resultados = [];
  for (const chave of alvos) {
    try {
      if (chave === 'front') {
        const r = await publicarFrontend({
          ...comuns,
          msg: opcoes.msg,
          semEspera: !!opcoes['sem-espera'],
        });
        resultados.push({ chave, ...r });
      } else {
        const r = await publicarBackend(chave, {
          ...comuns,
          descricao: opcoes.msg,
        });
        resultados.push({ chave, ...r });
      }
    } catch (e) {
      // ⚠️ Para no primeiro erro de proposito. Continuar publicaria um
      // backend novo contra um frontend antigo, que e exatamente o
      // estado meia-boca que o toolkit existe para evitar.
      titulo('Interrompido');
      erro(e instanceof Recusa ? e.message : (e.stack || e.message));
      if (resultados.length) {
        aviso('Alvos ja concluidos nesta rodada (nao foram desfeitos):');
        for (const r of resultados) nota(`${r.chave}${r.versaoNova ? ` @${r.versaoNova}` : ''}`);
      }
      process.exit(1);
    }
  }

  titulo('Resumo');
  for (const r of resultados) {
    if (r.ensaio) {
      console.log(`  ${cinza('·')} ${r.chave}: ensaio, nada publicado`);
    } else if (!r.publicado) {
      console.log(`  ${cinza('·')} ${r.chave}: nada a publicar`);
    } else if (r.chave === 'front') {
      const sit =
        r.pagesConfirmado === true ? verde('no ar') :
        r.pagesConfirmado === false ? vermelho('push feito, Pages ainda nao confirmou') :
        cinza('push feito');
      console.log(`  ${verde('✓')} front: ${sit}`);
    } else {
      const sit = r.sondaOk ? verde('respondendo') : vermelho('sonda falhou');
      console.log(`  ${verde('✓')} ${r.chave}: @${r.versaoNova ?? '?'} · ${sit}`);
    }
  }
  console.log('');
}

principal().catch((e) => {
  erro(e instanceof Recusa ? e.message : (e.stack || e.message));
  process.exit(1);
});
