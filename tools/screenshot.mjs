#!/usr/bin/env node
/**
 * Captura de tela das páginas do SAFE Hub, para conferência visual.
 *
 * POR QUE ISSO EXISTE
 * Antes as capturas eram feitas com as flags one-shot do Chrome
 * (`--headless --screenshot`). Elas são um recurso de depuração, não uma API
 * de automação, e travavam por três motivos:
 *
 *  1. `--user-data-dir` com perfil novo trava o `--screenshot`. Reproduzido em
 *     página `file://` trivial, dentro e fora do sandbox. Sem essa flag o
 *     Chrome usa o perfil padrão, e aí não dá para rodar duas capturas ao
 *     mesmo tempo nem garantir estado limpo.
 *  2. `--window-size` tem piso de 500px no modo headless e não emula
 *     dispositivo, então a faixa abaixo de 480px do Hub era invisível.
 *  3. `--virtual-time-budget` é um chute de tempo, não uma condição de espera.
 *     Em página pesada ele dispara cedo demais ou fica girando.
 *
 * Aqui o navegador é controlado por CDP (playwright-core), que resolve os três:
 * viewport de verdade com emulação de celular, espera por condição real e
 * encerramento determinístico, sem `pkill`.
 *
 * USO
 *   node tools/screenshot.mjs <pagina.html> [opções]
 *
 *   --out <arquivo>    caminho do PNG (padrão: tools/shots/<pagina>.png)
 *   --w <px> --h <px>  viewport (padrão 1440x900)
 *   --mobile           390x844 com emulação de iPhone (DPR 3, touch)
 *   --menu             abre a sidebar e todas as seções antes de capturar
 *   --full             página inteira, não só a dobra
 *   --dark             modo escuro do Hub (padrão: claro, como no produto)
 *   --usermenu         abre o menu do avatar antes de capturar
 *   --online           deixa o Apps Script responder (padrão: bloqueado)
 *   --base <url>       servidor (padrão http://127.0.0.1:8080)
 *
 * O servidor estático precisa estar de pé:
 *   python3 -m http.server 8080 --bind 127.0.0.1
 *
 * O Apps Script é bloqueado por padrão porque a sessão semeada aqui não tem
 * token válido: o backend responderia "sessão inválida" e a página mandaria
 * para o login. Bloqueado, ela mostra o estado de carregando/erro e o layout
 * fica visível, que é o que interessa numa conferência de UI.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Acha o Chrome for Testing que o Playwright já baixou, sem baixar de novo. */
function acharChrome() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache).filter(d => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    for (const rel of [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-linux/chrome',
    ]) {
      const p = join(cache, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  console.error('uso: node tools/screenshot.mjs <pagina.html> [--out f.png] [--w N] [--h N] [--mobile] [--menu] [--full] [--online]');
  process.exit(1);
}
const pagina = argv[0];
const flag = (nome) => argv.includes(`--${nome}`);
const valor = (nome, padrao) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao;
};

const mobile = flag('mobile');
const largura = Number(valor('w', mobile ? 390 : 1440));
const altura = Number(valor('h', mobile ? 844 : 900));
const base = valor('base', 'http://127.0.0.1:8080').replace(/\/$/, '');
const escuro = flag('dark');
const saida = resolve(valor('out', join(AQUI, 'shots',
  basename(pagina, '.html') + (mobile ? '-mobile' : '') + (escuro ? '-dark' : '') + '.png')));

const executablePath = acharChrome();
if (!executablePath) {
  console.error('Chrome for Testing não encontrado em ~/Library/Caches/ms-playwright.');
  console.error('Rode: npx playwright install chromium');
  process.exit(1);
}

mkdirSync(dirname(saida), { recursive: true });

const navegador = await chromium.launch({ executablePath, headless: true });
const contexto = await navegador.newContext({
  viewport: { width: largura, height: altura },
  deviceScaleFactor: mobile ? 3 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
});

// Aborta o backend em vez de mexer em DNS: falha na hora, sem esperar timeout,
// e sem afetar as fontes do Google, que a página precisa para não trocar a
// tipografia no meio da conferência.
if (!flag('online')) {
  await contexto.route('**://script.google.com/**', r => r.abort());
}

const page = await contexto.newPage();
const erros = [];
page.on('pageerror', e => erros.push(String(e)));

try {
  // Semeia a sessão com o próprio Auth.salvarSessao, para não duplicar aqui a
  // conta de expiração/dia/versão que o app faz (e que muda quando o
  // CONFIG.SESSION_VERSION é bumpado num relogin forçado).
  await page.goto(`${base}/index.html`, { waitUntil: 'load', timeout: 15000 });
  // `Auth` é `const` no topo de auth.js, então NÃO existe em `window`: um
  // `const` de escopo global fica no escopo léxico, fora do objeto global.
  // Referência solta funciona; `window.Auth` dá undefined.
  await page.evaluate(() => {
    Auth.salvarSessao({
      nome: 'Victor Pinho',
      email: 'victor.pinho@voesafe.com',
      perfil: 'master',
      pac: 'SJK',
      grupos: [],
      permissoesEfetivas: [],
      superadmin: true,
    });
  });

  // O tema mora na MESMA chave que a guarda anti-flash do <head> lê. Gravar
  // aqui, antes de navegar, é o que reproduz o caminho real: a guarda carimba
  // o `data-theme` antes da primeira pintura. Forçar o atributo depois do load
  // pularia justamente a parte que a gente quer conferir.
  await page.evaluate((v) => localStorage.setItem('safe-hub-theme', v), escuro ? 'dark' : 'light');

  await page.goto(`${base}/${pagina}`, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Espera a topbar aparecer no DOM: é o sinal de que o auth.js passou e
  // montou o shell. `attached`, não `visible`, porque a Escala CCO mantém a
  // topbar oculta enquanto tenta o SSO, e com o backend bloqueado ela nunca
  // termina. Não falha: avisa e captura assim mesmo, senão uma tela em estado
  // inesperado vira erro em vez de virar imagem, que é justo o que a gente
  // quer olhar.
  const topbarOk = await page
    .waitForSelector('.topbar', { state: 'attached', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!topbarOk) console.warn('aviso: topbar não apareceu no DOM em 10s.');
  if (await page.$('.login-box')) {
    console.warn('aviso: a tela de login está presente. Ou a sessão foi recusada,');
    console.warn('       ou é o login próprio da Escala CCO (use --online para ele passar).');
  }

  // Rede parada é melhor sinal que tempo fixo, mas algumas telas ficam em
  // polling: por isso o catch, a captura acontece de qualquer jeito.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  if (flag('menu')) {
    await page.evaluate(() => {
      document.getElementById('sidebar')?.classList.add('mobile-open');
      document.getElementById('sidebar-overlay')?.classList.add('active');
      document.querySelectorAll('.menu-section').forEach(s => s.classList.add('open'));
    });
    await page.waitForTimeout(400); // deixa a transição da sidebar terminar
  }

  if (flag('usermenu')) {
    await page.click('.user-menu-trigger').catch(() => console.warn('aviso: menu do usuário não encontrado.'));
    await page.waitForTimeout(250);
  }

  await page.screenshot({ path: saida, fullPage: flag('full') });
  console.log(`ok  ${saida}  (${largura}x${altura}${mobile ? ' mobile' : ''})`);
  if (erros.length) {
    console.warn(`erros de JS na página (${erros.length}):`);
    erros.slice(0, 5).forEach(e => console.warn('  ' + e.split('\n')[0]));
  }
} finally {
  await navegador.close();
}
