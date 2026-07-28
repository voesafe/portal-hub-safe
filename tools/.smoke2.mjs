import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs'; import { join } from 'node:path'; import { homedir } from 'node:os';
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const d = readdirSync(cache).filter(x=>x.startsWith('chromium-')).sort().reverse()[0];
const exe = join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const res=[]; const ok=(n,c,dt='')=>{res.push({n,c});console.log(`${c?'OK  ':'FALHA'}  ${n}${dt?'  — '+dt:''}`)};
const b = await chromium.launch({executablePath:exe,headless:true});

async function cenario(respostaSync) {
  const c = await b.newContext({viewport:{width:1440,height:900}, locale:'pt-BR'});
  const chamadas=[];
  await c.route('**/macros/s/AKfycbyThE1**', r => {
    const u = new URL(r.request().url());
    const acao = u.searchParams.get('action');
    chamadas.push({acao, params: Object.fromEntries(u.searchParams)});
    const corpo = acao==='sync_cavok' ? respostaSync
      : {status:'success',meta:{metaHoras:100},data:[{nome:'Ana',tipo:'CLT',totalHoras:'132.5',base:'SJK',liberadoOpr:false}]};
    return r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(corpo)});
  });
  const p = await c.newPage(); const erros=[]; p.on('pageerror',e=>erros.push(String(e)));
  await p.goto('http://127.0.0.1:8080/index.html');
  await p.evaluate(()=>Auth.salvarSessao({nome:'V',email:'v@voesafe.com',perfil:'master',pac:'SJK',grupos:[],permissoesEfetivas:[],superadmin:true}));
  await p.goto('http://127.0.0.1:8080/horas-voadas-inva.html');
  await p.waitForSelector('#hi-lista-SJK .hi-item');
  return {p,c,chamadas,erros};
}

{
  const {p,c,chamadas,erros} = await cenario({status:'success',
    message:'Janela de 3 dias conferida: 2 voos novos, 1 corrigido, 1 removido.',
    data:{janela:['2026-07-26','2026-07-27','2026-07-28'],inseridos:2,atualizados:1,removidos:1,falhas:[]}});
  await p.click('#btn-sincronizar');
  await p.waitForTimeout(800);
  const sync = chamadas.find(x=>x.acao==='sync_cavok');
  ok('o botao chama sync_cavok', !!sync);
  ok('e NAO manda mais o parametro date', !('date' in sync.params), JSON.stringify(sync.params));
  const t = await p.textContent('.toast-container');
  ok('toast mostra o resumo da janela', /2 voos novos, 1 corrigido, 1 removido/.test(t), t.trim().slice(0,80));
  ok('recarrega os dados depois', chamadas.filter(x=>x.acao==='get_data').length>=2);
  ok('sem erro de JS', erros.length===0, erros.join(' | '));
  await c.close();
}
{
  const {p,c,erros} = await cenario({status:'success',
    message:'Janela de 3 dias conferida: 0 voos novos. Não foi possível conferir 2026-07-27 (HTTP 500), e nada foi removido nesses dias.',
    data:{inseridos:0,atualizados:0,removidos:0,falhas:['2026-07-27 (HTTP 500)']}});
  await p.click('#btn-sincronizar');
  await p.waitForTimeout(800);
  const t = await p.textContent('.toast-container');
  ok('dia nao conferido vira aviso visivel', /não foram conferidos/i.test(t), t.trim().slice(0,140));
  ok('sem erro de JS no aviso', erros.length===0, erros.join(' | '));
  await c.close();
}
{
  const {p,c,erros} = await cenario({status:'error', message:'O CAVOK não respondeu para nenhum dia da janela. Nada foi alterado.'});
  await p.click('#btn-sincronizar');
  await p.waitForTimeout(800);
  const t = await p.textContent('.toast-container');
  ok('falha total vira erro na tela', /Nada foi alterado/.test(t), t.trim().slice(0,90));
  ok('o botao volta a funcionar', !(await p.$eval('#btn-sincronizar', e=>e.disabled)));
  ok('sem erro de JS na falha', erros.length===0, erros.join(' | '));
  await c.close();
}
await b.close();
const f=res.filter(r=>!r.c);
console.log(`\n=== ${res.length-f.length}/${res.length} verificações passaram ===`);
if(f.length) process.exit(1);
