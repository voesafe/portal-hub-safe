// ============================================================
// bump.mjs — Cache-bust automatico por hash do conteudo.
//
// O `?v=` era escolhido e colado a mao em cada HTML. Isso falha de
// duas formas, as duas so visiveis em producao (local o servidor do
// Python nao guarda cache):
//   - esquecer de bumpar: o GitHub Pages serve o arquivo velho para
//     quem ja visitou, e o bug "so acontece com uma pessoa";
//   - bumpar so onde voce lembrou: mexeu em `core/` e atualizou 18
//     dos 22 HTML, entao quatro paginas ficam com codigo antigo.
//
// Aqui o `?v=` e os 8 primeiros hex do sha256 do proprio arquivo.
// Mudou o conteudo, muda o `?v=` em TODO HTML que o referencia.
// Nao mudou, nada muda, entao rodar de novo nao suja o diff.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RAIZ } from './alvos.mjs';
import { ok, aviso, nota, titulo } from './util.mjs';

/** Referencias que nunca sao arquivo local versionavel. */
const IGNORAR = /^(https?:)?\/\/|^data:|^mailto:|^tel:|^#|^javascript:/i;

/** So versiona o que o navegador realmente guarda em cache. */
const EXTENSOES_VERSIONAVEIS = new Set([
  '.css', '.js', '.mjs', '.png', '.jpg', '.jpeg', '.svg', '.ico',
  '.webmanifest', '.json', '.woff', '.woff2',
]);

const cacheHash = new Map();

function hashDe(arquivoAbsoluto) {
  if (cacheHash.has(arquivoAbsoluto)) return cacheHash.get(arquivoAbsoluto);
  const buf = fs.readFileSync(arquivoAbsoluto);
  const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  cacheHash.set(arquivoAbsoluto, h);
  return h;
}

function htmlsDaRaiz(raiz) {
  return fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.html'))
    .map((d) => d.name)
    .sort();
}

/**
 * @param {{ seco?: boolean, raiz?: string }} opcoes
 * @returns {{ alterados: string[], trocas: number, semArquivo: string[] }}
 */
export function bumpar(opcoes = {}) {
  const raiz = opcoes.raiz || RAIZ;
  const seco = !!opcoes.seco;

  const alterados = [];
  const semArquivo = new Set();
  let trocas = 0;

  // Captura href="..." e src="..." com aspas duplas ou simples.
  const RE_REF = /\b(href|src)=(["'])([^"']+)\2/g;

  for (const nomeHtml of htmlsDaRaiz(raiz)) {
    const caminhoHtml = path.join(raiz, nomeHtml);
    const original = fs.readFileSync(caminhoHtml, 'utf8');
    let trocasNoArquivo = 0;

    const novo = original.replace(RE_REF, (inteiro, atrib, aspa, valor) => {
      if (IGNORAR.test(valor)) return inteiro;

      // Separa caminho de query e de fragmento, preservando os dois.
      const mFrag = valor.indexOf('#');
      const fragmento = mFrag === -1 ? '' : valor.slice(mFrag);
      const semFrag = mFrag === -1 ? valor : valor.slice(0, mFrag);
      const mQuery = semFrag.indexOf('?');
      const caminho = mQuery === -1 ? semFrag : semFrag.slice(0, mQuery);
      const query = mQuery === -1 ? '' : semFrag.slice(mQuery + 1);

      if (!caminho) return inteiro;
      if (!EXTENSOES_VERSIONAVEIS.has(path.extname(caminho).toLowerCase())) return inteiro;

      const alvo = path.resolve(path.dirname(caminhoHtml), caminho);
      if (!alvo.startsWith(raiz) || !fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) {
        // Referencia que nao casa com arquivo no disco: nao inventa `?v=`,
        // so avisa. Costuma ser link quebrado, e engolir isso o esconderia.
        semArquivo.add(`${nomeHtml} → ${caminho}`);
        return inteiro;
      }

      const v = hashDe(alvo);

      // Preserva qualquer outro parametro que ja exista na query.
      const partes = query ? query.split('&').filter((p) => p && !/^v=/.test(p)) : [];
      partes.push(`v=${v}`);
      const novoValor = `${caminho}?${partes.join('&')}${fragmento}`;

      if (novoValor === semFrag + fragmento) return inteiro;
      trocasNoArquivo += 1;
      return `${atrib}=${aspa}${novoValor}${aspa}`;
    });

    if (trocasNoArquivo > 0) {
      trocas += trocasNoArquivo;
      alterados.push(nomeHtml);
      if (!seco) fs.writeFileSync(caminhoHtml, novo);
    }
  }

  return { alterados, trocas, semArquivo: [...semArquivo] };
}

export function relatarBump(r, seco) {
  if (r.semArquivo.length) {
    aviso(`${r.semArquivo.length} referencia(s) sem arquivo no disco:`);
    for (const s of r.semArquivo) nota(s);
  }
  if (r.trocas === 0) {
    ok('Cache-bust ja em dia: nenhum `?v=` a mudar.');
    return;
  }
  const verbo = seco ? 'mudaria' : 'atualizou';
  ok(`${verbo} ${r.trocas} referencia(s) em ${r.alterados.length} HTML.`);
  for (const a of r.alterados) nota(a);
}

// Uso solto: node bump.mjs [--seco]
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  const seco = process.argv.includes('--seco');
  titulo(seco ? 'Cache-bust (ensaio, nao grava)' : 'Cache-bust');
  relatarBump(bumpar({ seco }), seco);
}
