/**
 * Verificação descartável da página Horas Voadas INVA Mês.
 * Intercepta o backend do Apps Script com payloads controlados e exercita
 * os quatro pedidos: bases, arraste, flag de 100h e liberação por OPR.
 */
import { chromium, devices } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function acharChrome() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
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

const BASE = 'http://127.0.0.1:8080';
const API = '**/macros/s/AKfycbyThE1**';
const SENHA_CERTA = 'opr-teste-123';

const resultados = [];
function checar(nome, ok, detalhe = '') {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? 'OK  ' : 'FALHA'}  ${nome}${detalhe ? '  — ' + detalhe : ''}`);
}

// Estado servido pelo backend falso, mutado pelas rotas de escrita.
function estadoInicial() {
  return [
    { nome: 'Ana Souza',    tipo: 'CLT',      totalHoras: '132.5', base: 'SJK', liberadoOpr: false, liberadoEm: '', liberadoPor: '' },
    { nome: 'Bruno Lima',   tipo: 'Eventual', totalHoras: '41.0',  base: 'SJK', liberadoOpr: false, liberadoEm: '', liberadoPor: '' },
    { nome: 'Carla "C" Reis', tipo: 'CLT',    totalHoras: '99.9',  base: 'CPQ', liberadoOpr: false, liberadoEm: '', liberadoPor: '' },
    { nome: 'Diego Alves',  tipo: 'Eventual', totalHoras: '12.0',  base: 'CPQ', liberadoOpr: true,  liberadoEm: '20/07/2026 10:00', liberadoPor: 'OPR SJK' },
    { nome: 'Elis Prado',   tipo: 'CLT',      totalHoras: '100.0', base: '',    liberadoOpr: false, liberadoEm: '', liberadoPor: '' },
  ];
}

const chrome = acharChrome();
if (!chrome) { console.error('Chrome for Testing não encontrado.'); process.exit(1); }

const navegador = await chromium.launch({ executablePath: chrome, headless: true });

async function novaPagina({ mobile = false, falharBase = false } = {}) {
  const contexto = await navegador.newContext(
    mobile
      ? { ...devices['iPhone 13'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }
      : { viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' }
  );

  const chamadas = [];
  let dados = estadoInicial();

  await contexto.route(API, async rota => {
    const req = rota.request();
    const json = corpo => rota.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(corpo),
    });

    if (req.method() === 'GET') {
      chamadas.push({ action: new URL(req.url()).searchParams.get('action') });
      return json({ status: 'success', data: dados, meta: { bases: ['SJK', 'CPQ'], metaHoras: 100 } });
    }

    const corpo = JSON.parse(req.postData() || '{}');
    chamadas.push({ action: corpo.action, data: corpo.data });

    if (corpo.action === 'set_instructor_base') {
      if (falharBase) {
        await new Promise(r => setTimeout(r, 700));
        return json({ status: 'error', message: 'Backend indisponível.' });
      }
      const i = dados.find(d => d.nome === corpo.data.nome);
      if (i) i.base = corpo.data.base;
      return json({ status: 'success', data: { nome: corpo.data.nome, base: corpo.data.base } });
    }

    if (corpo.action === 'set_instructor_release') {
      if (corpo.data.senha !== SENHA_CERTA) {
        return json({ status: 'error', message: 'Senha incorreta.' });
      }
      const liberar = corpo.data.liberado !== false;
      const quando = liberar ? '28/07/2026 15:30' : '';
      const i = dados.find(d => d.nome === corpo.data.nome);
      if (i) { i.liberadoOpr = liberar; i.liberadoEm = quando; i.liberadoPor = liberar ? corpo.data.autor : ''; }
      return json({
        status: 'success',
        data: { nome: corpo.data.nome, liberadoOpr: liberar, liberadoEm: quando, liberadoPor: liberar ? corpo.data.autor : '' },
      });
    }
    return json({ status: 'error', message: 'Ação inválida' });
  });

  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/favicon|manifest|\[Liberação OPR\]|\[Base do instrutor\]/i.test(m.text())) return;
    erros.push('console: ' + m.text());
  });

  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => Auth.salvarSessao({
    nome: 'Victor Pinho', email: 'victor.pinho@voesafe.com', perfil: 'master',
    pac: 'SJK', grupos: [], permissoesEfetivas: [], superadmin: true,
  }));
  await page.goto(`${BASE}/horas-voadas-inva.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#hi-lista-SJK .hi-item', { timeout: 15000 });
  return { page, contexto, chamadas, erros, dadosAtuais: () => dados };
}

const nomesDe = (page, base) =>
  page.$$eval(`#hi-lista-${base} .hi-item`, els => els.map(e => e.dataset.nome));

// ── 1. Separação por base, com base vazia caindo em SJK ──────────────
{
  const { page, contexto, erros } = await novaPagina();
  const sjk = await nomesDe(page, 'SJK');
  const cpq = await nomesDe(page, 'CPQ');
  checar('SJK tem Ana, Bruno e a Elis sem base gravada',
    JSON.stringify(sjk) === JSON.stringify(['Ana Souza', 'Bruno Lima', 'Elis Prado']), sjk.join(', '));
  checar('CPQ tem Carla e Diego',
    JSON.stringify(cpq) === JSON.stringify(['Carla "C" Reis', 'Diego Alves']), cpq.join(', '));
  checar('nome com aspas nao quebra o atributo data-nome',
    cpq[0] === 'Carla "C" Reis', cpq[0]);

  const contador = await page.textContent('#hi-contador-SJK');
  const total = await page.textContent('#hi-total-SJK');
  checar('contador e total por base', contador === '3 instrutores' && total === '273,5h', `${contador} / ${total}`);

  // ── 2. Flag verde ──
  const flags = await page.$$eval('.hi-item', els => els.map(e => ({
    nome: e.dataset.nome, verde: !!e.querySelector('.hi-flag'),
  })));
  const verde = n => flags.find(f => f.nome === n)?.verde;
  checar('132,5h -> flag verde', verde('Ana Souza') === true);
  checar('41h -> sem flag', verde('Bruno Lima') === false);
  checar('99,9h -> sem flag (limite fechado em 100)', verde('Carla "C" Reis') === false);
  checar('exatamente 100h -> flag verde', verde('Elis Prado') === true);
  checar('12h porem liberado por OPR -> flag verde', verde('Diego Alves') === true);

  const kpi = await page.textContent('#kpi-liberados');
  checar('KPI de liberados conta 3', kpi === '3', kpi);

  const titulo = await page.getAttribute('.hi-item[data-nome="Diego Alves"] .hi-flag', 'title');
  checar('tooltip da flag explica o motivo',
    titulo.includes('liberado por OPR') && titulo.includes('20/07/2026'), titulo);

  const rotulo = await page.textContent('.hi-item[data-nome="Diego Alves"] .hi-liberar');
  checar('quem ja esta liberado ganha "Remover liberacao"', rotulo.trim() === 'Remover liberação', rotulo.trim());

  checar('sem erro de JS na carga', erros.length === 0, erros.join(' | '));
  await contexto.close();
}

// ── 3. Arraste SJK -> CPQ ────────────────────────────────────────────
{
  const { page, contexto, chamadas, erros } = await novaPagina();
  await page.$eval('#hi-bases', e => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const punho = await page.$('.hi-item[data-nome="Bruno Lima"] .hi-punho');
  const cx = await punho.boundingBox();
  const destino = await (await page.$('.hi-base[data-drop-base="CPQ"]')).boundingBox();

  await page.mouse.move(cx.x + cx.width / 2, cx.y + cx.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx.x + 40, cx.y + 20, { steps: 5 });
  const ghost = await page.$('.hi-ghost');
  checar('ghost aparece durante o arraste', !!ghost);
  await page.mouse.move(destino.x + destino.width / 2, destino.y + destino.height / 2, { steps: 10 });
  const realce = await page.$eval('.hi-base[data-drop-base="CPQ"]', e => e.classList.contains('is-drop'));
  checar('base de destino fica realcada', realce === true);
  await page.mouse.up();

  await page.waitForTimeout(300);
  checar('ghost some ao soltar', (await page.$('.hi-ghost')) === null);
  const cpq = await nomesDe(page, 'CPQ');
  checar('Bruno passou para CPQ', cpq.includes('Bruno Lima'), cpq.join(', '));
  checar('Bruno saiu de SJK', !(await nomesDe(page, 'SJK')).includes('Bruno Lima'));

  const chamada = chamadas.find(c => c.action === 'set_instructor_base');
  checar('chamou set_instructor_base com nome e base certos',
    chamada?.data?.nome === 'Bruno Lima' && chamada?.data?.base === 'CPQ', JSON.stringify(chamada?.data));
  checar('sem erro de JS no arraste', erros.length === 0, erros.join(' | '));
  await contexto.close();
}

// ── 4. Clique no punho move para a outra base (toque no celular) ─────
{
  const { page, contexto, chamadas } = await novaPagina();
  await page.click('.hi-item[data-nome="Ana Souza"] .hi-punho');
  await page.waitForTimeout(300);
  checar('clique no punho move para a outra base',
    (await nomesDe(page, 'CPQ')).includes('Ana Souza'));
  const nBase = chamadas.filter(c => c.action === 'set_instructor_base').length;
  checar('o clique gera UMA chamada, nao duas', nBase === 1, `chamadas=${nBase}`);
  await contexto.close();
}

// ── 5. Rollback quando o backend recusa ──────────────────────────────
{
  const { page, contexto } = await novaPagina({ falharBase: true });
  await page.click('.hi-item[data-nome="Ana Souza"] .hi-punho');
  await page.waitForTimeout(120);
  const durante = (await nomesDe(page, 'CPQ')).includes('Ana Souza');
  await page.waitForTimeout(1200);
  const depois = (await nomesDe(page, 'SJK')).includes('Ana Souza');
  checar('otimista: move na hora', durante === true);
  checar('rollback: volta para SJK quando o servidor recusa', depois === true);
  const toastErro = await page.textContent('.toast-container').catch(() => '');
  checar('toast de erro aparece', /indispon/i.test(toastErro), toastErro.trim().slice(0, 60));
  await contexto.close();
}

// ── 6. Liberação por OPR com senha ───────────────────────────────────
{
  const { page, contexto, chamadas, erros } = await novaPagina();
  await page.click('.hi-item[data-nome="Bruno Lima"] .hi-liberar');
  await page.waitForSelector('#modal-liberacao.open');
  checar('modal mostra o instrutor', (await page.textContent('#liberacao-instrutor')) === 'Bruno Lima');
  checar('campo da senha e type=password',
    (await page.getAttribute('#liberacao-senha', 'type')) === 'password');

  // senha errada
  await page.fill('#liberacao-senha', 'errada');
  await page.click('#liberacao-confirmar');
  await page.waitForTimeout(500);
  const aindaSemFlag = await page.$('.hi-item[data-nome="Bruno Lima"] .hi-flag');
  checar('senha errada NAO pinta a flag verde', aindaSemFlag === null);
  checar('modal continua aberto na senha errada',
    await page.$eval('#modal-liberacao', e => e.classList.contains('open')));
  const t = await page.textContent('.toast-container');
  checar('toast diz senha incorreta', /senha incorreta/i.test(t), t.trim().slice(0, 40));

  // senha certa
  await page.fill('#liberacao-senha', SENHA_CERTA);
  await page.click('#liberacao-confirmar');
  await page.waitForTimeout(600);
  checar('senha certa pinta a flag verde',
    (await page.$('.hi-item[data-nome="Bruno Lima"] .hi-flag')) !== null);
  checar('modal fecha depois de liberar',
    !(await page.$eval('#modal-liberacao', e => e.classList.contains('open'))));
  const lib = chamadas.filter(c => c.action === 'set_instructor_release').pop();
  checar('manda o autor da sessao junto', lib?.data?.autor === 'Victor Pinho', String(lib?.data?.autor));
  checar('a senha vai no corpo do POST, nunca na URL',
    !chamadas.some(c => String(c.action).includes(SENHA_CERTA)));
  const kpi = await page.textContent('#kpi-liberados');
  checar('KPI sobe para 4 depois da liberacao', kpi === '4', kpi);

  // remover liberação
  await page.click('.hi-item[data-nome="Bruno Lima"] .hi-liberar');
  await page.waitForSelector('#modal-liberacao.open');
  await page.fill('#liberacao-senha', SENHA_CERTA);
  await page.click('#liberacao-confirmar');
  await page.waitForTimeout(600);
  checar('remover liberacao apaga a flag',
    (await page.$('.hi-item[data-nome="Bruno Lima"] .hi-flag')) === null);
  checar('sem erro de JS na liberacao', erros.length === 0, erros.join(' | '));
  await contexto.close();
}

// ── 7. Busca filtra as duas bases sem alterar contadores ─────────────
{
  const { page, contexto } = await novaPagina();
  await page.fill('#busca-instrutor', 'ana');
  await page.waitForTimeout(200);
  checar('busca filtra SJK', JSON.stringify(await nomesDe(page, 'SJK')) === JSON.stringify(['Ana Souza']));
  checar('busca esvazia CPQ', (await nomesDe(page, 'CPQ')).length === 0);
  const contador = await page.textContent('#hi-contador-CPQ');
  checar('contador da base NAO muda com a busca', contador === '2 instrutores', contador);
  await contexto.close();
}

// ── 8. Celular a 390px ───────────────────────────────────────────────
{
  const { page, contexto, chamadas, erros } = await novaPagina({ mobile: true });
  const estouro = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  checar('sem rolagem horizontal no celular', estouro <= 0, `sobra ${estouro}px`);
  const touchAction = await page.$eval('.hi-punho', e => getComputedStyle(e).touchAction);
  checar('punho com touch-action:none (arraste no toque)', touchAction === 'none', touchAction);
  await page.tap('.hi-item[data-nome="Ana Souza"] .hi-punho');
  await page.waitForTimeout(400);
  checar('toque no punho move de base no celular',
    (await nomesDe(page, 'CPQ')).includes('Ana Souza'));
  checar('o toque gera UMA chamada',
    chamadas.filter(c => c.action === 'set_instructor_base').length === 1);
  checar('sem erro de JS no celular', erros.length === 0, erros.join(' | '));
  await contexto.close();
}

await navegador.close();

const falhas = resultados.filter(r => !r.ok);
console.log(`\n=== ${resultados.length - falhas.length}/${resultados.length} verificações passaram ===`);
if (falhas.length) {
  falhas.forEach(f => console.log(`  FALHA: ${f.nome} ${f.detalhe}`));
  process.exit(1);
}
