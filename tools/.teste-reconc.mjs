/**
 * Reconciliação da janela do INVA, contra um Apps Script falso.
 * Foco na parte destrutiva: nada pode ser removido sem o dia ter sido
 * conferido de verdade. Descartável.
 */
import { readFileSync } from 'node:fs';
const CODIGO = readFileSync('/Users/macbookpro/Documents/01. Código VSCODE SAFE/horas-voadas-inva-main/backend/Código.js','utf8');
const res=[]; const ok=(n,c,d='')=>{res.push({n,c});console.log(`${c?'OK  ':'FALHA'}  ${n}${d?'  — '+d:''}`)};

const CAB = ['Instrutor','Data','Horas','CavokId'];

function ambiente({agora, api={}, linhas=[], janelaProp=null, lockLivre=true}) {
  const dados = [ [...CAB], ...linhas.map(l=>[...l]) ];
  const respostas=[]; const fetches=[];
  const aba = {
    getLastRow: ()=>dados.length,
    getRange: (r,c,nr,nc)=>{
      if (nr===undefined) return {
        setValue:v=>{dados[r-1][c-1]=v;}, setNumberFormat:()=>{},
      };
      const bloco = {
        getValues: ()=>{const s=[];for(let i=0;i<nr;i++){const l=[];for(let j=0;j<nc;j++)l.push((dados[r-1+i]||[])[c-1+j]??'');s.push(l);}return s;},
        getDisplayValues: ()=>bloco.getValues().map(l=>l.map(v=>v instanceof Date
          ? `${String(v.getDate()).padStart(2,'0')}/${String(v.getMonth()+1).padStart(2,'0')}/${v.getFullYear()}`
          : String(v??''))),
        setValues: vals=>{ vals.forEach((l,i)=>{ l.forEach((v,j)=>{ dados[r-1+i][c-1+j]=v; }); }); },
        setNumberFormat: ()=>{},
      };
      return bloco;
    },
    appendRow: v=>dados.push([...v]),
    deleteRow: r=>dados.splice(r-1,1),
  };
  const sandbox = {
    console:{log:()=>{},error:()=>{}}, Logger:{log:()=>{}},
    // Nao pode ser `class extends Date`: instancia do pai NAO e instanceof
    // da subclasse, e o teste do ramo Date de invaNormalizarData_ passaria
    // a medir nada. Herdando o prototype do Date real, qualquer Date passa.
    Date: (()=>{ const R=Date; function F(...a){ return a.length ? new R(...a) : new R(agora); }
                 F.prototype = R.prototype; F.now = ()=>new R(agora).getTime(); return F; })(),
    SpreadsheetApp:{ openById:()=>({getSheetByName:()=>aba}), getActiveSpreadsheet:()=>({getSheetByName:()=>aba}), flush:()=>{} },
    LockService:{ getScriptLock:()=>({ tryLock:()=>lockLivre, waitLock:()=>{}, releaseLock:()=>{} }) },
    PropertiesService:{ getScriptProperties:()=>({getProperty:k=>k==='INVA_JANELA_DIAS'?janelaProp:null}) },
    ContentService:{ MimeType:{JSON:'json'}, createTextOutput:s=>{respostas.push(s);const o={setMimeType:()=>o,getContent:()=>s};return o;} },
    Utilities:{ base64Encode:s=>Buffer.from(s).toString('base64'),
      formatDate:(d,tz,f)=>{const t=new Date(d.getTime()-3*3600000);
        return `${t.getUTCFullYear()}-${String(t.getUTCMonth()+1).padStart(2,'0')}-${String(t.getUTCDate()).padStart(2,'0')}`;} },
    UrlFetchApp:{
      fetch:u=>{fetches.push(u);return respostaDe(u);},
      fetchAll:reqs=>reqs.map(r=>{fetches.push(r.url);return respostaDe(r.url);}),
    },
    ScriptApp:{ getProjectTriggers:()=>[], deleteTrigger:()=>{}, newTrigger:()=>({timeBased:()=>({atHour:()=>({nearMinute:()=>({everyDays:()=>({inTimezone:()=>({create:()=>({getUniqueId:()=>'x'})})})})})})}) },
  };
  function respostaDe(url) {
    const data = new URL(url).searchParams.get('data');
    const cfg = api[data];
    if (cfg === undefined) return { getResponseCode:()=>200, getContentText:()=>JSON.stringify({response:[]}) };
    if (cfg && cfg.__http) return { getResponseCode:()=>cfg.__http, getContentText:()=>'erro' };
    if (cfg && cfg.__lixo) return { getResponseCode:()=>200, getContentText:()=>'nao e json' };
    if (cfg && cfg.__forma) return { getResponseCode:()=>200, getContentText:()=>JSON.stringify({response:{}}) };
    return { getResponseCode:()=>200, getContentText:()=>JSON.stringify({response:cfg}) };
  }
  const fn = new Function(...Object.keys(sandbox), `${CODIGO}\n; return {reconciliarVoosInva, invaDatasDaJanela_, invaNormalizarData_, invaJanelaDias, atualizarHorasVoadasInvaDiario};`);
  return { api: fn(...Object.values(sandbox)), dados, fetches,
           ultima:()=>JSON.parse(respostas[respostas.length-1]),
           corpo:()=>dados.slice(1) };
}

const voo=(id,inst,data,min)=>({Id:id,Instrutor:inst,Data:data,Aeronave:'PS-SFE','Tempo total de voo':min});
const HOJE = new Date('2026-07-28T05:00:00-03:00');

// ── 1. Janela e datas ────────────────────────────────────────────────
{
  const a = ambiente({agora:HOJE});
  ok('janela padrao de 3 dias, da mais antiga para a mais recente',
    JSON.stringify(a.api.invaDatasDaJanela_(3))===JSON.stringify(['2026-07-26','2026-07-27','2026-07-28']),
    JSON.stringify(a.api.invaDatasDaJanela_(3)));
  const virada = ambiente({agora:new Date('2026-03-01T05:00:00-03:00')});
  ok('janela atravessa a virada de mes',
    JSON.stringify(virada.api.invaDatasDaJanela_(3))===JSON.stringify(['2026-02-27','2026-02-28','2026-03-01']),
    JSON.stringify(virada.api.invaDatasDaJanela_(3)));
  ok('propriedade valida muda a janela', ambiente({agora:HOJE, janelaProp:'7'}).api.invaJanelaDias()===7);
  ok('propriedade absurda cai no padrao', ambiente({agora:HOJE, janelaProp:'999'}).api.invaJanelaDias()===3);
  ok('propriedade nao numerica cai no padrao', ambiente({agora:HOJE, janelaProp:'abc'}).api.invaJanelaDias()===3);
  ok('data ISO normaliza', a.api.invaNormalizarData_('2026-07-28')==='2026-07-28');
  ok('data BR normaliza', a.api.invaNormalizarData_('28/07/2026')==='2026-07-28');
  ok('Date normaliza', a.api.invaNormalizarData_(new Date('2026-07-28T10:00:00-03:00'))==='2026-07-28');
  ok('lixo devolve vazio', a.api.invaNormalizarData_('sei la')==='');
  ok('SALDO INICIAL devolve vazio', a.api.invaNormalizarData_('SALDO INICIAL')==='');
}

// ── 2. A DOR: voo do dia D lancado depois da execucao de D+1 ─────────
{
  // Dia 26: o instrutor esqueceu. So lancou no dia 28 as 10h.
  // A execucao de 28 (janela 26,27,28) tem que pegar.
  const a = ambiente({agora:HOJE, api:{'2026-07-26':[voo(500,'Ana','2026-07-26',90)],
                                      '2026-07-27':[voo(400,'Ana','2026-07-27',60)]},
    linhas:[['Ana','2026-07-27',1.0,'400']]});
  a.api.reconciliarVoosInva();
  ok('voo lancado com 2 dias de atraso ENTRA na janela',
    a.corpo().some(l=>String(l[3])==='500'), JSON.stringify(a.corpo()));
  ok('mensagem conta 1 voo novo', /1 voo novo/.test(a.ultima().message), a.ultima().message);
  ok('o voo antigo do dia 27 nao foi removido', a.corpo().some(l=>String(l[3])==='400'));
}

// ── 3. A OUTRA DOR: voo lancado errado e corrigido depois ────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(600,'Ana','2026-07-27',150)]},
    linhas:[['Ana','2026-07-27',1.0,'600']]});   // planilha tem 1,0h, CAVOK diz 2,5h
  a.api.reconciliarVoosInva();
  const linha = a.corpo().find(l=>String(l[3])==='600');
  ok('horas corrigidas NA PROPRIA linha', Number(linha[2])===2.5, JSON.stringify(linha));
  ok('nao duplicou a linha', a.corpo().filter(l=>String(l[3])==='600').length===1);
  ok('relatorio informa a correcao', a.ultima().data.atualizados===1 &&
     a.ultima().data.correcoes[0].de===1 && a.ultima().data.correcoes[0].para===2.5,
     JSON.stringify(a.ultima().data.correcoes));
  ok('mensagem cita corrigido', /1 corrigido/.test(a.ultima().message), a.ultima().message);
}
{
  // troca de instrutor no lancamento
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(601,'Bruno','2026-07-27',60)]},
    linhas:[['Ana','2026-07-27',1.0,'601']]});
  a.api.reconciliarVoosInva();
  ok('instrutor trocado no CAVOK corrige a linha', a.corpo().find(l=>String(l[3])==='601')[0]==='Bruno');
}
{
  // so muda a caixa do nome: nao pode ficar reescrevendo toda madrugada
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(602,'  ANA  ','2026-07-27',60)]},
    linhas:[['Ana','2026-07-27',1.0,'602']]});
  a.api.reconciliarVoosInva();
  ok('so diferenca de caixa/espaco NAO conta como correcao', a.ultima().data.atualizados===0);
}

// ── 4. Voo apagado no CAVOK e refeito com outro Id ───────────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(701,'Ana','2026-07-27',120)]},
    linhas:[['Ana','2026-07-27',1.0,'700']]});   // 700 foi excluido, virou 701
  a.api.reconciliarVoosInva();
  ok('o Id que sumiu do CAVOK e removido', !a.corpo().some(l=>String(l[3])==='700'), JSON.stringify(a.corpo()));
  ok('o Id novo entra', a.corpo().some(l=>String(l[3])==='701'));
  ok('total do instrutor fica com 2,0h e nao 3,0h',
    a.corpo().filter(l=>l[0]==='Ana').reduce((s,l)=>s+Number(l[2]),0)===2, JSON.stringify(a.corpo()));
}

// ── 5. TRAVA DE SEGURANCA: API falhando nao pode apagar nada ─────────
{
  for (const [rotulo, cfg] of [['HTTP 500',{__http:500}], ['resposta ilegivel',{__lixo:true}], ['formato inesperado',{__forma:true}]]) {
    const a = ambiente({agora:HOJE, api:{'2026-07-27':cfg, '2026-07-28':[]},
      linhas:[['Ana','2026-07-27',1.0,'800']]});
    a.api.reconciliarVoosInva();
    ok(`${rotulo} no dia 27 NAO remove o voo do dia 27`,
      a.corpo().some(l=>String(l[3])==='800'), JSON.stringify(a.corpo()));
    ok(`${rotulo} e reportado na mensagem`, /não foi possível conferir/i.test(a.ultima().message), a.ultima().message);
  }
}
{
  // dia respondendo VAZIO (sem falha) e diferente: aí sim remove
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[]},
    linhas:[['Ana','2026-07-27',1.0,'801']]});
  a.api.reconciliarVoosInva();
  ok('dia conferido e realmente vazio REMOVE o voo orfao', !a.corpo().some(l=>String(l[3])==='801'));
}
{
  // todos os dias falhando: erro e nada tocado
  const a = ambiente({agora:HOJE, api:{'2026-07-26':{__http:503},'2026-07-27':{__http:503},'2026-07-28':{__http:503}},
    linhas:[['Ana','2026-07-27',1.0,'802'],['Bruno','2026-07-28',2.0,'803']]});
  a.api.reconciliarVoosInva();
  ok('CAVOK todo fora: status error', a.ultima().status==='error', a.ultima().message);
  ok('CAVOK todo fora: planilha INTOCADA', a.corpo().length===2, JSON.stringify(a.corpo()));
}

// ── 6. Nada fora da janela pode ser tocado ───────────────────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-28':[voo(900,'Ana','2026-07-28',60)]},
    linhas:[
      ['Ana','2026-01-15',3.0,'100'],       // meses atras
      ['Bruno','2026-07-20',2.0,'200'],     // 8 dias atras, fora da janela
      ['Ana','SALDO INICIAL','',''],        // sem id
      ['Carla','SALDO INICIAL',120,'SISTEMA'],
      ['Dani','sei la que data',1.5,'300'], // data ilegivel
    ]});
  a.api.reconciliarVoosInva();
  const ids = a.corpo().map(l=>String(l[3]));
  ok('linha de meses atras intocada', ids.includes('100'));
  ok('linha fora da janela intocada', ids.includes('200'));
  ok('SALDO INICIAL sem id intocado', a.corpo().some(l=>l[1]==='SALDO INICIAL'&&l[0]==='Ana'));
  ok('SALDO INICIAL do SISTEMA intocado', a.corpo().some(l=>String(l[3])==='SISTEMA'));
  ok('linha com data ILEGIVEL nunca e removida', ids.includes('300'));
  ok('o voo novo do dia entra', ids.includes('900'));
  ok('nada foi removido', a.ultima().data.removidos===0, JSON.stringify(a.ultima().data));
}

// ── 7. Duplicatas e aeronave excluida ────────────────────────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(950,'Ana','2026-07-27',60)]},
    linhas:[['Ana','2026-07-27',1.0,'950'],['Ana','2026-07-27',1.0,'950'],['Ana','2026-07-27',1.0,'950']]});
  a.api.reconciliarVoosInva();
  ok('tres linhas do mesmo voo viram uma', a.corpo().filter(l=>String(l[3])==='950').length===1, JSON.stringify(a.corpo()));
  ok('relatorio conta as duplicatas', a.ultima().data.duplicatasRemovidas===2, String(a.ultima().data.duplicatasRemovidas));
}
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[
    {Id:960,Instrutor:'Ana',Data:'2026-07-27',Aeronave:'SM-SJK','Tempo total de voo':60},
    voo(961,'Ana','2026-07-27',60)]}});
  a.api.reconciliarVoosInva();
  ok('aeronave excluida nao entra', !a.corpo().some(l=>String(l[3])==='960'), JSON.stringify(a.corpo()));
  ok('a outra entra normalmente', a.corpo().some(l=>String(l[3])==='961'));
}

// ── 8. Idempotencia: rodar de novo nao muda mais nada ────────────────
{
  const conf = {agora:HOJE, api:{'2026-07-26':[voo(1,'Ana','2026-07-26',60)],
                                 '2026-07-27':[voo(2,'Bruno','2026-07-27',90)],
                                 '2026-07-28':[voo(3,'Ana','2026-07-28',30)]}};
  const a = ambiente(conf);
  a.api.reconciliarVoosInva();
  const depois1 = JSON.stringify(a.corpo());
  ok('primeira rodada insere os 3', a.corpo().length===3, String(a.corpo().length));
  a.api.reconciliarVoosInva();
  ok('segunda rodada nao muda NADA', JSON.stringify(a.corpo())===depois1, JSON.stringify(a.corpo()));
  ok('e reporta zero em tudo',
    a.ultima().data.inseridos===0 && a.ultima().data.atualizados===0 && a.ultima().data.removidos===0,
    JSON.stringify(a.ultima().data));
}

// ── 9. Ensaio nao grava ──────────────────────────────────────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(1100,'Ana','2026-07-27',60)]},
    linhas:[['Ana','2026-07-27',1.0,'1099']]});
  a.api.reconciliarVoosInva(0, null, true);
  ok('ensaio: planilha nao muda', JSON.stringify(a.corpo())===JSON.stringify([['Ana','2026-07-27',1,'1099']]),
     JSON.stringify(a.corpo()));
  ok('ensaio: relatorio mostra o que faria',
    a.ultima().data.inseridos===1 && a.ultima().data.removidos===1, JSON.stringify(a.ultima().data));
  ok('ensaio: mensagem avisa que nada foi gravado', /ENSAIO/.test(a.ultima().message), a.ultima().message);
}

// ── 10. Trava contra execucao simultanea ─────────────────────────────
{
  const a = ambiente({agora:HOJE, lockLivre:false, api:{'2026-07-27':[voo(1200,'Ana','2026-07-27',60)]}});
  a.api.reconciliarVoosInva();
  ok('sem trava: recusa', /já está em andamento/.test(a.ultima().message));
  ok('sem trava: nem chama o CAVOK', a.fetches.length===0);
  ok('sem trava: planilha intocada', a.corpo().length===0);
}

// ── 11. Remocao em lote nao desalinha as linhas ──────────────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(2,'B','2026-07-27',60),voo(4,'D','2026-07-27',60)]},
    linhas:[['A','2026-07-27',1,'1'],['B','2026-07-27',1,'2'],['C','2026-07-27',1,'3'],
            ['D','2026-07-27',1,'4'],['E','2026-07-27',1,'5']]});
  a.api.reconciliarVoosInva();
  ok('remove 1, 3 e 5 e MANTEM exatamente 2 e 4',
    JSON.stringify(a.corpo().map(l=>String(l[3])))===JSON.stringify(['2','4']), JSON.stringify(a.corpo()));
  ok('os que ficaram mantiveram o instrutor certo',
    a.corpo()[0][0]==='B' && a.corpo()[1][0]==='D', JSON.stringify(a.corpo()));
}

// ── 12. Correcao e remocao na MESMA rodada, sem embaralhar linha ─────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[voo(11,'A','2026-07-27',180)]},
    linhas:[['A','2026-07-27',1,'11'],['B','2026-07-27',1,'12'],['C','2026-07-27',1,'13']]});
  a.api.reconciliarVoosInva();
  ok('corrige a linha 1 e remove 12 e 13 sem trocar valores',
    JSON.stringify(a.corpo())===JSON.stringify([['A','2026-07-27',3,'11']]), JSON.stringify(a.corpo()));
}

// ── 13. Data em Date e em formato BR na planilha ─────────────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-27':[]},
    linhas:[['A',new Date('2026-07-27T12:00:00-03:00'),1,'20'],['B','27/07/2026',1,'21']]});
  a.api.reconciliarVoosInva();
  ok('linha com Date na coluna Data e reconhecida e removida', !a.corpo().some(l=>String(l[3])==='20'), JSON.stringify(a.corpo()));
  ok('linha com data BR e reconhecida e removida', !a.corpo().some(l=>String(l[3])==='21'));
}

// ── 14. O gatilho diario chama a reconciliacao ───────────────────────
{
  const a = ambiente({agora:HOJE, api:{'2026-07-26':[],'2026-07-27':[],'2026-07-28':[voo(1300,'A','2026-07-28',60)]}});
  a.api.atualizarHorasVoadasInvaDiario();
  ok('gatilho diario reconcilia a janela de 3 dias', a.fetches.length===3, String(a.fetches.length));
  ok('e insere o voo do dia', a.corpo().some(l=>String(l[3])==='1300'));
}

const f=res.filter(r=>!r.c);
console.log(`\n=== ${res.length-f.length}/${res.length} verificações passaram ===`);
if(f.length){ f.forEach(x=>console.log('  FALHA:', x.n)); process.exit(1); }
