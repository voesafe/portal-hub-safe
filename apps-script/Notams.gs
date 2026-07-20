// ============================================================
// Notams.gs — Módulo NOTAMs (bases SAFE: SBSJ e SDAM)
// SAFE Escola de Aviação | SAFE Hub
//
// Consulta os NOTAM das bases via API AISWEB/DECEA (server-side,
// sem CORS), classifica impacto e grava um CACHE na planilha.
// O frontend lê SEMPRE do cache (abre instantâneo) via action=notams.
//
// FONTE: https://aisweb.decea.mil.br/api/?apiKey=..&apiPass=..&area=notam&icaoCode=SBSJ&icaoCode=SDAM
// Retorno: XML. Requer chave solicitada ao DECEA.
//
// SETUP (uma vez, quando a chave chegar):
//   1. Projeto → Configurações → Propriedades do script:
//        AISWEB_API_KEY  = <apiKey do e-mail do DECEA>
//        AISWEB_API_PASS = <apiPass do e-mail do DECEA>
//   2. Rodar notamsInstalarTrigger()  → cria o gatilho diário (06:00)
//   3. Rodar notamsDebugRaw()  → loga o XML real p/ conferir o schema
//
// TESTE SEM CHAVE:
//   notamsSelfTest()  → parseia um XML de exemplo e grava no cache.
// ============================================================

// ── Configuração ────────────────────────────────────────────
var NOTAMS_SHEET      = 'NOTAMS';
var NOTAMS_ICAOS      = ['SBSJ', 'SDAM'];          // bases SAFE
var NOTAMS_API_BASE   = 'https://aisweb.decea.mil.br/api/';
var NOTAMS_PROP_KEY   = 'AISWEB_API_KEY';
var NOTAMS_PROP_PASS  = 'AISWEB_API_PASS';
var NOTAMS_PROP_TS    = 'NOTAMS_ATUALIZADO_EM';

var NOTAMS_HEADERS = [
  'ICAO','COD','QCODE','CATEGORIA','SEVERIDADE','ATIVO','FUTURO',
  'INICIO','FIM','ESCOPO','TEXTO_CRU','TEXTO_DECODIFICADO','ATUALIZADO_EM'
];

// Nomes amigáveis das bases (só p/ exibição)
var NOTAMS_AD_INFO = {
  SBSJ: { nome: 'São José dos Campos', sub: 'Prof. Urbano Ernesto Stumpf' },
  SDAM: { nome: 'Campinas / Amarais',  sub: 'Aeroporto dos Amarais' }
};

// ============================================================
//  LEITURA (frontend) — action=notams
// ============================================================
/**
 * Lê o cache de NOTAMs da planilha e devolve estruturado p/ o Hub.
 * Não chama a API (rápido). A API é chamada só pelo gatilho diário.
 */
function listarNotams() {
  var sheet = notamsGetSheet_();
  var valores = sheet.getDataRange().getValues();
  var notams = [];

  for (var i = 1; i < valores.length; i++) {
    var l = valores[i];
    if (!l[0] && !l[1]) continue; // linha vazia
    notams.push({
      icao:     String(l[0] || ''),
      id:       String(l[1] || ''),
      qcode:    String(l[2] || ''),
      cat:      String(l[3] || ''),
      sev:      String(l[4] || 'info'),
      active:   valorBooleano(l[5]),
      future:   valorBooleano(l[6]),
      from:     String(l[7] || ''),
      to:       String(l[8] || ''),
      scope:    String(l[9] || 'Aeródromo'),
      raw:      String(l[10] || ''),
      decoded:  String(l[11] || '')
    });
  }

  var props = PropertiesService.getScriptProperties();
  return {
    atualizadoEm: props.getProperty(NOTAMS_PROP_TS) || '',
    aeroportos:   NOTAMS_ICAOS.map(function(ic) {
      return {
        icao: ic,
        nome: (NOTAMS_AD_INFO[ic] || {}).nome || ic,
        sub:  (NOTAMS_AD_INFO[ic] || {}).sub  || '',
        total: notams.filter(function(n) { return n.icao === ic; }).length
      };
    }),
    resumo: {
      ativosHoje: notams.filter(function(n) { return n.active; }).length,
      impactoPista: notams.filter(function(n) { return n.active && n.sev === 'critico'; }).length,
      auxiliosLuzes: notams.filter(function(n) { return n.active && n.sev === 'atencao'; }).length,
      futuros: notams.filter(function(n) { return n.future; }).length,
      total: notams.length
    },
    notams: notams
  };
}

// ============================================================
//  ATUALIZAÇÃO (gatilho diário) — chama a API AISWEB
// ============================================================
/**
 * Ponto de entrada do gatilho: busca na AISWEB, parseia, classifica e
 * grava o cache. Se faltar chave, lança erro claro (não quebra silencioso).
 */
function atualizarNotamsAisweb() {
  var xml = notamFetchAisweb_(NOTAMS_ICAOS);
  var itens = notamParseXml_(xml);
  notamGravarCache_(itens);
  return itens.length;
}

/**
 * Monta a URL e chama a API. icaoCode aceita múltiplos (um por base).
 */
function notamFetchAisweb_(icaos) {
  var props = PropertiesService.getScriptProperties();
  var key  = props.getProperty(NOTAMS_PROP_KEY);
  var pass = props.getProperty(NOTAMS_PROP_PASS);
  if (!key || !pass) {
    throw new Error('Chave AISWEB não configurada. Defina ' + NOTAMS_PROP_KEY +
      ' e ' + NOTAMS_PROP_PASS + ' nas Propriedades do script.');
  }

  var url = NOTAMS_API_BASE +
    '?apiKey=' + encodeURIComponent(key) +
    '&apiPass=' + encodeURIComponent(pass) +
    '&area=notam';
  (icaos || NOTAMS_ICAOS).forEach(function(ic) {
    url += '&icaoCode=' + encodeURIComponent(ic);
  });

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, method: 'get' });
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('AISWEB retornou HTTP ' + code + ': ' + body.slice(0, 300));
  }
  return body;
}

/**
 * Parser DEFENSIVO do XML.
 * A estrutura exata de tags do AISWEB só é confirmada com a chave em mãos
 * (rode notamsDebugRaw() e ajuste as listas de candidatos abaixo).
 * Estratégia: achatar cada <item>/<notam> em um mapa nome→texto e escolher
 * campos por vários nomes possíveis.
 */
function notamParseXml_(xmlText) {
  var doc = XmlService.parse(xmlText);
  var root = doc.getRootElement();

  // Coleta recursiva de elementos "folha de NOTAM": aqueles que têm um
  // filho que pareça o código do NOTAM (cod/id/numero).
  var itens = [];
  notamColetarItens_(root, itens);

  return itens.map(function(campos) {
    var icao  = notamPick_(campos, ['loc','ad','icao','icaocode','aerodromo']);
    var cod   = notamPick_(campos, ['cod','id','numero','number','notam']);
    var qcode = notamPick_(campos, ['q','qcode','codq']);
    var ini   = notamPick_(campos, ['b','dt_i','inicio','validfrom','from','ib']);
    var fim   = notamPick_(campos, ['c','dt_f','fim','validto','to','ic']);
    var texto = notamPick_(campos, ['e','txt','texto','text','descricao','ie']);

    var dtIni = notamParseData_(ini);
    var dtFim = notamParseData_(fim);
    var classe = notamClassificar_(qcode, texto, dtIni, dtFim);

    return {
      icao:    (icao || '').toUpperCase(),
      cod:     cod,
      qcode:   qcode,
      cat:     classe.cat,
      sev:     classe.sev,
      active:  classe.active,
      future:  classe.future,
      from:    notamFormatarData_(dtIni, ini),
      to:      notamFormatarData_(dtFim, fim),
      scope:   'Aeródromo',
      raw:     notamMontarCru_(cod, icao, ini, fim, texto),
      decoded: notamDecodificar_(texto)
    };
  }).filter(function(n) { return n.cod || n.raw; });
}

/** Percorre a árvore XML juntando "itens de NOTAM" achatados. */
function notamColetarItens_(el, out) {
  var filhos = el.getChildren();
  // Um "item" é um elemento cujos filhos incluem um provável código de NOTAM.
  var mapa = {};
  var temCod = false;
  filhos.forEach(function(c) {
    var nome = c.getName().toLowerCase();
    var val = c.getText();
    if (c.getChildren().length === 0) {
      mapa[nome] = val;
      if (['cod','id','numero','number','notam'].indexOf(nome) >= 0 && val) temCod = true;
    }
  });
  if (temCod) out.push(mapa);
  // Continua descendo (listas <notam><item>...)
  filhos.forEach(function(c) {
    if (c.getChildren().length > 0) notamColetarItens_(c, out);
  });
}

/** Escolhe o primeiro campo presente entre vários nomes possíveis. */
function notamPick_(mapa, nomes) {
  for (var i = 0; i < nomes.length; i++) {
    if (mapa[nomes[i]] != null && String(mapa[nomes[i]]).trim() !== '') {
      return String(mapa[nomes[i]]).trim();
    }
  }
  return '';
}

// ============================================================
//  CLASSIFICAÇÃO DE IMPACTO (Fase 1 — refinada na Fase 3/glossário)
// ============================================================
/**
 * Deriva categoria + severidade + ativo/futuro.
 * Tenta o Q-code (Q + assunto(2) + condição(2)); se ausente, cai p/
 * varredura de palavras-chave no texto E.
 * severidade: 'critico' (pista) | 'atencao' (táxi/luzes/nav) | 'info'
 */
function notamClassificar_(qcode, texto, dtIni, dtFim) {
  var t = String(texto || '').toUpperCase();
  var q = String(qcode || '').toUpperCase().replace(/^Q/, ''); // remove o Q inicial
  var assunto = q.slice(0, 2);   // ex: MR, MX, LP, NV, OB, FA
  var cat = 'Geral', sev = 'info';

  if (assunto === 'MR' || /\bRWY\b|\bPISTA\b/.test(t)) {
    cat = 'Pista (RWY)';
    sev = /CLSD|CLOSED|FECH|U\/S|UNSERVICEABLE|LIMIT|RESTR/.test(t) ? 'critico' : 'atencao';
  } else if (assunto === 'MX' || /\bTWY\b|TAXIWAY|T[ÁA]XI/.test(t)) {
    cat = 'Táxi (TWY)'; sev = 'atencao';
  } else if (assunto.charAt(0) === 'L' || /\bPAPI\b|\bVASIS\b|\bBALIZ|\bLGT|LIGHT|LUZ/.test(t)) {
    cat = 'Auxílios luminosos'; sev = 'atencao';
  } else if (assunto.charAt(0) === 'I' || assunto.charAt(0) === 'N' ||
             /\bVOR\b|\bNDB\b|\bDME\b|\bILS\b|\bGP\b|\bLOC\b/.test(t)) {
    cat = 'Aux. navegação'; sev = 'atencao';
  } else if (assunto === 'OB' || assunto === 'OL' || /CRANE|GUINDASTE|OBST/.test(t)) {
    cat = 'Obstáculo'; sev = 'info';
  } else if (assunto === 'FA' || /\bAD\b|AERODROMO|AER[ÓO]DROMO|OPR HR|HORARIO|HOR[ÁA]RIO/.test(t)) {
    cat = 'Aeródromo'; sev = 'info';
  }

  var agora = new Date();
  var active = false, future = false;
  if (dtIni && dtFim) {
    active = (dtIni <= agora && agora <= dtFim);
    future = (dtIni > agora);
  } else if (dtIni) {
    future = (dtIni > agora);
    active = !future;
  }

  return { cat: cat, sev: sev, active: active, future: future };
}

// ============================================================
//  DECODIFICAÇÃO (Fase 1 — glossário mínimo; expande na Fase 3)
// ============================================================
var NOTAMS_GLOSSARIO = {
  'CLSD': 'fechado(a)', 'CLOSED': 'fechado(a)', 'RWY': 'pista', 'TWY': 'pista de táxi',
  'U/S': 'inoperante', 'UNSERVICEABLE': 'inoperante', 'WIP': 'obras em andamento',
  'DUE': 'devido a', 'MAINT': 'manutenção', 'PAPI': 'indicador de rampa (PAPI)',
  'VOR': 'auxílio VOR', 'NDB': 'auxílio NDB', 'DME': 'auxílio DME', 'ILS': 'sistema ILS',
  'AVBL': 'disponível', 'OPR': 'operação', 'HR': 'horário', 'LGTD': 'balizado',
  'AGL': 'acima do solo (AGL)', 'PSN': 'posição', 'AD': 'aeródromo', 'LT': 'horário local'
};
/**
 * Decodificação leve: expande abreviações comuns. NÃO substitui o texto
 * cru (que fica sempre preservado). Versão completa na Fase 3.
 */
function notamDecodificar_(texto) {
  if (!texto) return '';
  var out = String(texto);
  Object.keys(NOTAMS_GLOSSARIO).forEach(function(abbr) {
    out = out.replace(new RegExp('\\b' + abbr.replace('/', '\\/') + '\\b', 'g'),
      NOTAMS_GLOSSARIO[abbr]);
  });
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// ============================================================
//  DATAS
// ============================================================
/**
 * Parseia a validade do NOTAM. Aceita:
 *  - 'yyMMddHHmm' (10 dígitos, formato ICAO padrão, UTC)
 *  - ISO parcial 'yyyy-MM-dd HH:mm' / 'yyyy-MM-ddTHH:mm'
 *  - 'PERM' → retorna data muito futura
 * Retorna Date (UTC) ou null.
 */
function notamParseData_(s) {
  s = String(s || '').trim();
  if (!s) return null;
  if (/^PERM/i.test(s)) return new Date(Date.UTC(2099, 11, 31));

  var m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/); // yyMMddHHmm
  if (m) {
    return new Date(Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5])));
  }
  var iso = s.replace(' ', 'T');
  var d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Formata a data p/ exibição (dd MMM yyyy · HH:mm UTC). Fallback: texto cru. */
function notamFormatarData_(d, bruto) {
  if (!d) return String(bruto || '');
  if (d.getUTCFullYear() >= 2099) return 'Permanente';
  var meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  return p2(d.getUTCDate()) + ' ' + meses[d.getUTCMonth()] + ' ' + d.getUTCFullYear() +
    ' · ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ' UTC';
}

/** Reconstrói o "NOTAM cru" p/ exibição quando a API não dá o bloco inteiro. */
function notamMontarCru_(cod, icao, ini, fim, texto) {
  var linhas = [];
  if (cod) linhas.push(cod + ' NOTAMN');
  linhas.push('A) ' + (icao || '') + (ini ? '  B) ' + ini : '') + (fim ? '  C) ' + fim : ''));
  if (texto) linhas.push('E) ' + texto);
  return linhas.join('\n');
}

// ============================================================
//  CACHE (planilha)
// ============================================================
function notamsGetSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(NOTAMS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NOTAMS_SHEET);
    sheet.getRange(1, 1, 1, NOTAMS_HEADERS.length).setValues([NOTAMS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function notamGravarCache_(itens) {
  var sheet = notamsGetSheet_();
  var ts = new Date().toISOString();

  // Ordena: ativos primeiro, depois por severidade (critico>atencao>info)
  var ordemSev = { critico: 0, atencao: 1, info: 2 };
  itens.sort(function(a, b) {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (ordemSev[a.sev] || 3) - (ordemSev[b.sev] || 3);
  });

  var linhas = itens.map(function(n) {
    return [n.icao, n.cod, n.qcode, n.cat, n.sev, n.active, n.future,
            n.from, n.to, n.scope, n.raw, n.decoded, ts];
  });

  // Limpa o corpo e regrava (cache é substituído por completo)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, NOTAMS_HEADERS.length).clearContent();
  if (linhas.length) {
    sheet.getRange(2, 1, linhas.length, NOTAMS_HEADERS.length).setValues(linhas);
  }
  PropertiesService.getScriptProperties().setProperty(NOTAMS_PROP_TS, ts);
  return linhas.length;
}

// ============================================================
//  GATILHO
// ============================================================
/** Instala (ou reinstala) o gatilho diário às ~06:00. */
function notamsInstalarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'atualizarNotamsAisweb') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('atualizarNotamsAisweb')
    .timeBased().everyDays(1).atHour(6).create();
  return 'Gatilho diário instalado (06:00).';
}

// ============================================================
//  DIAGNÓSTICO
// ============================================================
/** Loga o XML cru da API (rodar 1x quando a chave chegar p/ conferir tags). */
function notamsDebugRaw() {
  var xml = notamFetchAisweb_(NOTAMS_ICAOS);
  Logger.log(xml.slice(0, 5000));
  return xml.slice(0, 500);
}

/**
 * Testa o pipeline SEM chave: parseia um XML de exemplo, classifica e grava
 * no cache. Rode e depois chame listarNotams() p/ ver o resultado.
 * NB: as tags deste exemplo são uma HIPÓTESE do schema AISWEB — o parser é
 * defensivo, mas o mapeamento final se confirma com notamsDebugRaw().
 */
function notamsSelfTest() {
  var exemplo =
    '<aisweb><notam total="3">' +
      '<item><loc>SBSJ</loc><cod>A2145/26</cod><q>QMRLC</q>' +
        '<b>2607170900</b><c>2607171700</c>' +
        '<e>RWY 15/33 CLSD DUE WIP</e></item>' +
      '<item><loc>SBSJ</loc><cod>A2160/26</cod><q>QLPAS</q>' +
        '<b>2607120000</b><c>2607312359</c>' +
        '<e>PAPI RWY 15 U/S DUE MAINT</e></item>' +
      '<item><loc>SDAM</loc><cod>B0455/26</cod><q>QMRLC</q>' +
        '<b>2607220600</b><c>2607221200</c>' +
        '<e>RWY 17/35 CLSD DUE MAINT</e></item>' +
    '</notam></aisweb>';
  var itens = notamParseXml_(exemplo);
  notamGravarCache_(itens);
  Logger.log('Self-test: ' + itens.length + ' NOTAMs parseados e gravados.');
  Logger.log(JSON.stringify(listarNotams(), null, 2));
  return itens.length;
}
