// ============================================================
// alvos.mjs: Registro unico dos alvos de deploy do SAFE Hub.
//
// Fonte de verdade dos scriptId e das implantacoes de PRODUCAO.
// Antes disso os ids viviam so no CLAUDE.md e eram colados a mao
// em cada `clasp deploy`, que e como se publica no lugar errado.
//
// ⚠️ Os backends do INVA e da Escala CCO ficam FORA deste repositorio.
// Os caminhos abaixo sao relativos a pasta que contem o repo, e o
// toolkit avisa quando um deles nao esta no disco em vez de quebrar.
// ============================================================

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositorio (…/portal-hub-safe). */
export const RAIZ = path.resolve(AQUI, '..', '..');

/** Pasta que contem o repo, onde moram os outros backends. */
const VIZINHANCA = path.resolve(RAIZ, '..');

export const ALVOS = {
  hub: {
    chave: 'hub',
    nome: 'Backend do Hub',
    // Onde vive o .clasp.json. Para o Hub e a propria raiz do repo.
    dirClasp: RAIZ,
    // Onde vivem os .gs (o rootDir do .clasp.json).
    dirFontes: path.join(RAIZ, 'apps-script'),
    scriptId: '1HOHmaXOroycbnZ3Mp_D2_NhKjoJNM-ukkSjfPvt82mlbhc5zPkZzZFhN',
    implantacaoProducao: 'AKfycbxpOGXgEJ5qBl46iy0JIoli9Ugl8O5-cS-iSxeeLEjsnnB0Pl50fGxSV3H2_DVNie6FsQ',
    url: 'https://script.google.com/macros/s/AKfycbxpOGXgEJ5qBl46iy0JIoli9Ugl8O5-cS-iSxeeLEjsnnB0Pl50fGxSV3H2_DVNie6FsQ/exec',
    // Rota inexistente usada como sonda de fumaca: tem que voltar
    // `Acao desconhecida: <nome>` COM o nome. Sem o nome, o corpo do
    // POST se perdeu no redirecionamento e o teste nao provou nada.
    sondaAcao: '__sonda_deploy__',
    noRepo: true,
  },

  inva: {
    chave: 'inva',
    nome: 'Backend das Horas Voadas INVA',
    dirClasp: path.join(VIZINHANCA, 'horas-voadas-inva-main', 'backend'),
    dirFontes: path.join(VIZINHANCA, 'horas-voadas-inva-main', 'backend'),
    scriptId: '1EWtRjpU0-fwhWBVaWAG2ObykdVLcuMT2icu8SxziYpGSDjuEf9cF8hwy',
    implantacaoProducao: 'AKfycbyThE1-1S77CJFfrSsWVVYak4tu-V37xsXH1VZFckKf1CJulgueWhqpKx70NWg9ifA9',
    url: 'https://script.google.com/macros/s/AKfycbyThE1-1S77CJFfrSsWVVYak4tu-V37xsXH1VZFckKf1CJulgueWhqpKx70NWg9ifA9/exec',
    sondaAcao: '__sonda_deploy__',
    noRepo: false,
  },

  cco: {
    chave: 'cco',
    nome: 'Backend da Escala CCO',
    dirClasp: path.join(VIZINHANCA, 'Escala CCO SAFE', 'backend'),
    dirFontes: path.join(VIZINHANCA, 'Escala CCO SAFE', 'backend'),
    scriptId: '1i5Y7hRzwCVnwKUukWenluQPmRd3WR3M_8r_je-6bDrAw41GHoi9QI90B',
    implantacaoProducao: 'AKfycbyeoa-8Vv2lze3okfNxSA20hOtwOo0dvB_wIaWBJujG0XbxgrXOkswON4fPrEHdeBAa',
    url: 'https://script.google.com/macros/s/AKfycbyeoa-8Vv2lze3okfNxSA20hOtwOo0dvB_wIaWBJujG0XbxgrXOkswON4fPrEHdeBAa/exec',
    // A CCO roteia por `action` na query string, sem doPost com corpo JSON.
    sondaAcao: '__sonda_deploy__',
    noRepo: false,
  },
};

/** Conta com que o clasp precisa estar logado para publicar. */
export const CONTA_CLASP = 'victor.pinho@voesafe.com';

export function alvo(chave) {
  const a = ALVOS[chave];
  if (!a) {
    throw new Error(
      `Alvo desconhecido: "${chave}". Conhecidos: ${Object.keys(ALVOS).join(', ')}.`
    );
  }
  return a;
}

/** True quando a pasta do alvo existe nesta maquina. */
export function alvoDisponivel(a) {
  return fs.existsSync(path.join(a.dirClasp, '.clasp.json'));
}
