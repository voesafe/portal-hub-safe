#!/usr/bin/env node
// ============================================================
// manutencao.mjs: Cliente da rota de manutencao dos backends.
//
// Substitui o "abra o editor do Apps Script e clique em Run", que era
// o unico passo que sobrava depois de todo deploy e o motivo de varias
// entregas ficarem meio prontas (gatilho nao instalado, propriedade
// nao criada, cargo sem a permissao nova).
//
//   node tools/deploy/manutencao.mjs catalogo hub
//   node tools/deploy/manutencao.mjs rodar hub notamsInstalarTrigger
//   node tools/deploy/manutencao.mjs rodar inva instalarEtiquetasInva
//   node tools/deploy/manutencao.mjs rodar hub notamsDebugRaw --args='["SBSJ"]'
//   node tools/deploy/manutencao.mjs props hub
//   node tools/deploy/manutencao.mjs set-prop hub AISWEB_API_KEY <valor>
//   node tools/deploy/manutencao.mjs gatilhos hub
//
// ⚠️ O token NAO fica no codigo nem no git. Vive em
// tools/deploy/.segredos.json, que esta no .gitignore, e no lado do
// servidor so em Propriedade do script. Este repositorio e publico.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { alvo, ALVOS } from './alvos.mjs';
import { Recusa, lerArgs, titulo, ok, aviso, erro, nota, cinza, forte } from './util.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_SEGREDOS = path.join(AQUI, '.segredos.json');

/** Alvos que tem rota de manutencao. A CCO nao tem, e nem precisa. */
const COM_MANUTENCAO = new Set(['hub', 'inva']);

// ── Segredos locais ─────────────────────────────────────────

function lerSegredos() {
  if (!fs.existsSync(ARQUIVO_SEGREDOS)) return {};
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_SEGREDOS, 'utf8'));
  } catch {
    throw new Recusa(`${ARQUIVO_SEGREDOS} esta ilegivel. Apague e refaca o bootstrap.`);
  }
}

function gravarSegredos(s) {
  fs.writeFileSync(ARQUIVO_SEGREDOS, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
}

function tokenDe(chave) {
  const t = lerSegredos()[chave];
  if (!t) {
    throw new Recusa(
      `Sem token de manutencao para "${chave}".\n` +
        `Rode:  node tools/deploy/manutencao.mjs bootstrap ${chave}\n` +
        '(so funciona enquanto o backend ainda nao tem token gravado)'
    );
  }
  return t;
}

const novoToken = () => crypto.randomBytes(36).toString('base64url');

// ── Transporte ──────────────────────────────────────────────

/**
 * ⚠️ Sempre POST com o token no CORPO. Em GET ele iria na query
 * string e cairia em log de servidor e no historico do terminal.
 * `Content-Type: text/plain` de proposito: e tipo "simples", nao
 * dispara preflight de CORS, e e o que o resto do Hub ja usa.
 */
async function chamar(chaveAlvo, dados) {
  const a = alvo(chaveAlvo);
  const r = await fetch(a.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'manutencao', dados, data: dados }),
    redirect: 'follow',
  });
  const txt = await r.text();

  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    throw new Recusa(
      'O backend respondeu algo que nao e JSON. Costuma ser erro de ' +
        'compilacao no projeto Apps Script:\n' + txt.slice(0, 400)
    );
  }

  // O Hub responde {ok,data,error}; o INVA responde {status,data,message}.
  const deuCerto = json.ok === true || json.status === 'success';
  if (!deuCerto) {
    const msg = String(json.error || json.message || JSON.stringify(json));

    // ⚠️ Tres diagnosticos diferentes escondidos em mensagens parecidas.
    // Confundi-los manda a pessoa consertar a coisa errada.

    // 1. Acao desconhecida SEM nome depois dos dois pontos: o corpo do
    // POST se perdeu no redirecionamento do Apps Script e o que
    // respondeu foi o doGet pelado. A rota pode existir muito bem.
    if (/(desconhecida|inválida|invalida):\s*$/i.test(msg)) {
      throw new Recusa(
        'O corpo do POST se perdeu no redirecionamento do Apps Script.\n' +
          'A rota pode existir. Tente de novo: e intermitente, nao permanente.'
      );
    }
    // 2. Acao desconhecida COM o nome, ou "Ação inválida" do INVA:
    // backend publicado sem esta entrega.
    if (/desconhecida:\s*manutencao/i.test(msg) || /ação inválida/i.test(msg)) {
      throw new Recusa(
        `O backend de "${chaveAlvo}" nao conhece a rota "manutencao".\n` +
          'E backend publicado sem esta entrega. Publique primeiro:\n' +
          `  node tools/deploy/deploy.mjs ${chaveAlvo} --msg="rota de manutencao"\n` +
          `\nResposta crua: ${msg}`
      );
    }
    // 3. Qualquer outra coisa e erro de negocio da propria rota
    // (token invalido, funcao fora da lista), e o texto ja e o certo.
    throw new Recusa(msg);
  }
  return json.data;
}

// ── Operacoes ───────────────────────────────────────────────

async function opBootstrap(chaveAlvo) {
  const segredos = lerSegredos();
  if (segredos[chaveAlvo]) {
    throw new Recusa(
      `Ja existe token local para "${chaveAlvo}".\n` +
        'Para trocar, use "rotacionar" (que exige o token atual).'
    );
  }
  const token = novoToken();
  // Grava ANTES de chamar. Se a rede cair depois de o servidor gravar,
  // um token so no servidor deixaria a rota inalcancavel para sempre.
  gravarSegredos({ ...segredos, [chaveAlvo]: token });
  try {
    await chamar(chaveAlvo, { op: 'bootstrap', chave: token });
  } catch (e) {
    const s = lerSegredos();
    delete s[chaveAlvo];
    gravarSegredos(s);
    throw e;
  }
  ok(`Manutencao ativada em "${chaveAlvo}". Token guardado em .segredos.json.`);
  nota('O dono do script recebeu um e-mail avisando da ativacao.');
}

async function opRotacionar(chaveAlvo) {
  const atual = tokenDe(chaveAlvo);
  const novo = novoToken();
  await chamar(chaveAlvo, { op: 'rotacionar-token', chave: atual, novoToken: novo });
  gravarSegredos({ ...lerSegredos(), [chaveAlvo]: novo });
  ok(`Token de "${chaveAlvo}" rotacionado.`);
}

async function opCatalogo(chaveAlvo) {
  const d = await chamar(chaveAlvo, { op: 'catalogo', chave: tokenDe(chaveAlvo) });
  const faltando = d.funcoes.filter((f) => !f.existe);
  for (const f of d.funcoes) {
    const marca = f.existe ? ' ' : '!';
    console.log(`  ${marca} ${forte(f.funcao.padEnd(30))} ${cinza(f.descricao)}`);
  }
  if (faltando.length) {
    aviso(
      `${faltando.length} funcao(oes) na lista nao existem no projeto publicado. ` +
        'Backend desatualizado ou funcao renomeada.'
    );
  }
}

async function opRodar(chaveAlvo, funcao, argsJson) {
  if (!funcao) throw new Recusa('Falta o nome da funcao. Veja: manutencao.mjs catalogo ' + chaveAlvo);
  let args = [];
  if (argsJson) {
    try {
      args = JSON.parse(argsJson);
    } catch {
      throw new Recusa(`--args precisa ser JSON de array. Recebi: ${argsJson}`);
    }
    if (!Array.isArray(args)) throw new Recusa('--args precisa ser um array JSON.');
  }
  nota(`chamando ${funcao}(${args.map((a) => JSON.stringify(a)).join(', ')}) em ${chaveAlvo}…`);
  const d = await chamar(chaveAlvo, {
    op: 'chamar',
    chave: tokenDe(chaveAlvo),
    funcao,
    args,
  });
  ok(`${d.funcao} rodou em ${d.duracaoMs}ms.`);
  console.log(cinza(JSON.stringify(d.retorno, null, 2)));
}

async function opProps(chaveAlvo, revelar) {
  const d = await chamar(chaveAlvo, {
    op: 'propriedades',
    chave: tokenDe(chaveAlvo),
    revelar: revelar || '',
  });
  for (const [k, v] of Object.entries(d.propriedades).sort()) {
    console.log(`  ${forte(k.padEnd(32))} ${cinza(String(v))}`);
  }
  if (d.sessoesOmitidas) nota('sessoes (SAFE_SESSION_*) omitidas de proposito');
}

async function opSetProp(chaveAlvo, propriedade, valor) {
  if (!propriedade) throw new Recusa('Falta o nome da propriedade.');
  const d = await chamar(chaveAlvo, {
    op: 'definir-propriedade',
    chave: tokenDe(chaveAlvo),
    // O Hub le em `chave`… mas `chave` ja e o token. Os dois backends
    // aceitam `propriedade`, que e o campo sem ambiguidade.
    propriedade,
    valor: valor === undefined ? '' : valor,
  });
  ok(`Propriedade ${d.chave} ${d.acao}.`);
}

async function opGatilhos(chaveAlvo) {
  const d = await chamar(chaveAlvo, { op: 'gatilhos', chave: tokenDe(chaveAlvo) });
  if (!d.length) {
    aviso('Nenhum gatilho instalado neste projeto.');
    return;
  }
  for (const g of d) console.log(`  ${forte(g.funcao.padEnd(34))} ${cinza(g.tipo)}`);
}

// ── CLI ─────────────────────────────────────────────────────

const AJUDA = `
${forte('manutencao.mjs')}: roda manutencao nos backends sem abrir o editor

  ${forte('Comandos')}
    bootstrap <alvo>                     ativa a rota e cria o token (uma vez so)
    rotacionar <alvo>                    troca o token
    catalogo <alvo>                      o que da para rodar
    rodar <alvo> <funcao> [--args=JSON]  executa uma funcao da lista
    props <alvo> [--revelar=CHAVE]       propriedades do script (mascaradas)
    set-prop <alvo> <CHAVE> <valor>      grava propriedade do script
    gatilhos <alvo>                      gatilhos instalados

  ${forte('Alvos')}  ${[...COM_MANUTENCAO].join(', ')}
    (a Escala CCO nao tem rota de manutencao: nao tem gatilho nem
     propriedade de script, entao nao havia o que rodar)
`;

async function principal() {
  const { posicionais, opcoes } = lerArgs(process.argv.slice(2));
  const [comando, chaveAlvo, ...resto] = posicionais;

  if (!comando || opcoes.help || opcoes.h) {
    console.log(AJUDA);
    process.exit(comando ? 0 : 1);
  }
  if (!chaveAlvo) throw new Recusa(`Falta o alvo. Conhecidos: ${[...COM_MANUTENCAO].join(', ')}.`);
  if (!ALVOS[chaveAlvo]) throw new Recusa(`Alvo desconhecido: "${chaveAlvo}".`);
  if (!COM_MANUTENCAO.has(chaveAlvo)) {
    throw new Recusa(
      `"${chaveAlvo}" nao tem rota de manutencao.\n` +
        'A Escala CCO nao tem gatilho nem propriedade de script, entao a rota\n' +
        'seria superficie exposta sem uso nenhum.'
    );
  }

  titulo(`Manutencao · ${alvo(chaveAlvo).nome}`);

  switch (comando) {
    case 'bootstrap':   return opBootstrap(chaveAlvo);
    case 'rotacionar':  return opRotacionar(chaveAlvo);
    case 'catalogo':    return opCatalogo(chaveAlvo);
    case 'rodar':       return opRodar(chaveAlvo, resto[0], opcoes.args);
    case 'props':       return opProps(chaveAlvo, opcoes.revelar);
    case 'set-prop':    return opSetProp(chaveAlvo, resto[0], resto.slice(1).join(' '));
    case 'gatilhos':    return opGatilhos(chaveAlvo);
    default:
      throw new Recusa(`Comando desconhecido: "${comando}".${AJUDA}`);
  }
}

principal().catch((e) => {
  erro(e instanceof Recusa ? e.message : (e.stack || e.message));
  process.exit(1);
});
