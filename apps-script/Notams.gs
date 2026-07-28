// ============================================================
// Notams.gs — Módulo NOTAMs (bases SAFE: SBSJ e SDAM)
// SAFE Escola de Aviação | SAFE Hub
//
// Consulta os NOTAM das bases via API AISWEB/DECEA (server-side,
// sem CORS), classifica impacto e grava um CACHE na planilha.
// O frontend lê SEMPRE do cache (abre instantâneo) via action=notams.
//
// FONTE: https://aisweb.decea.mil.br/api/?apiKey=..&apiPass=..&area=notam&icaoCode=SBSJ
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
//   notamsSelfTest()  → parseia uma amostra REAL do XML e grava no cache.
//
// ⚠️ UM icaoCode POR REQUISIÇÃO. Medido em 2026-07-28 contra a API real:
// `icaoCode=SBSJ` filtra certo (7 NOTAMs), mas QUALQUER forma de pedir os dois
// (`icaoCode` repetido, vírgula, espaço, pipe) faz o filtro cair SILENCIOSAMENTE
// e a API devolve o Brasil inteiro: 2207 NOTAMs, 4,9 MB. Sem HTTP de erro e sem
// aviso. Por isso: uma chamada por base + rede de segurança por `loc` no parse.
//
// Schema confirmado nos 2207 itens: <cod> é o Q-CODE (Q+4 letras, 100% dos
// casos) e o identificador do NOTAM é <n> (ex.: F3879/26, 100% dos casos).
// Não existe tag <q>.
// ============================================================

// ── Configuração ────────────────────────────────────────────
var NOTAMS_SHEET      = 'NOTAMS';
var NOTAMS_ICAOS      = ['SBSJ', 'SDAM'];          // bases SAFE
var NOTAMS_API_BASE   = 'https://aisweb.decea.mil.br/api/';
var NOTAMS_PROP_KEY   = 'AISWEB_API_KEY';
var NOTAMS_PROP_PASS  = 'AISWEB_API_PASS';
var NOTAMS_PROP_TS    = 'NOTAMS_ATUALIZADO_EM';

// Teto de resposta por base. Uma base sozinha dá ~15 KB; o Brasil inteiro dá
// 4,9 MB. Passar disso significa que o filtro icaoCode caiu: aborta ANTES do
// XmlService.parse, que engasgaria com megabytes, e preserva o cache anterior.
var NOTAMS_MAX_BYTES  = 600000;

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
  var itens = [];
  var vistos = {};

  NOTAMS_ICAOS.forEach(function(icao) {
    notamParseXml_(notamFetchAisweb_(icao)).forEach(function(n) {
      // Rede de segurança: se um dia o filtro da API falhar de novo, jamais
      // gravamos NOTAM de base alheia no cache das bases SAFE.
      if (NOTAMS_ICAOS.indexOf(n.icao) < 0) return;
      var chave = n.icao + '|' + n.cod;
      if (vistos[chave]) return;   // a mesma base pode voltar nas duas respostas
      vistos[chave] = true;
      itens.push(n);
    });
  });

  notamGravarCache_(itens);
  return itens.length;
}

/**
 * Monta a URL e chama a API para UMA base. Ver o aviso no topo do arquivo:
 * pedir duas de uma vez derruba o filtro e traz o país inteiro.
 */
function notamFetchAisweb_(icao) {
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
    '&area=notam' +
    '&icaoCode=' + encodeURIComponent(icao);

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, method: 'get' });
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('AISWEB retornou HTTP ' + code + ' para ' + icao + ': ' +
      body.slice(0, 300));
  }
  if (body.length > NOTAMS_MAX_BYTES) {
    throw new Error('AISWEB devolveu ' + body.length + ' bytes para ' + icao +
      ': o filtro icaoCode foi ignorado. Cache anterior preservado.');
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
    var icao  = notamPick_(campos, ['loc','icaoairport_id','ad','icao','icaocode','aerodromo']);
    // O identificador é <n> ('F3879/26'). NÃO usar <cod>: lá mora o Q-code.
    var cod   = notamPick_(campos, ['n','notam','numero','number','id']);
    var qcode = notamQcode_(campos);
    var ini   = notamPick_(campos, ['b','dt_i','inicio','validfrom','from','ib']);
    var fim   = notamPick_(campos, ['c','dt_f','fim','validto','to','ic']);
    var texto = notamPick_(campos, ['e','txt','texto','text','descricao','ie']);
    // Campo D) do NOTAM: a janela em que ele vale de fato ('DAILY 1200-2100').
    var horario = notamPick_(campos, ['d','dt_d','horario','schedule']);
    var tipo    = notamPick_(campos, ['tp','tipo','type']);

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
      scope:   notamEscopo_(notamPick_(campos, ['scope','escopo'])),
      raw:     notamMontarCru_(cod, tipo, qcode, icao, ini, fim, horario, texto),
      decoded: notamDecodificar_(texto, horario)
    };
  }).filter(function(n) { return n.cod || n.raw; });
}

/**
 * Extrai o Q-code validando a FORMA (Q + 4 letras), não só o nome da tag.
 * No AISWEB ele vem em <cod>, que o nome sugere ser o identificador. A checagem
 * por formato torna a escolha correta nas duas hipóteses de schema: bateu com
 * Q+4 letras, é Q-code; não bateu, é outra coisa e não polui a classificação.
 * Medido: 2207 de 2207 <cod> casam com /^Q[A-Z]{4}$/.
 */
function notamQcode_(campos) {
  var cands = ['cod','q','qcode','codq'];
  for (var i = 0; i < cands.length; i++) {
    var v = String(campos[cands[i]] || '').trim().toUpperCase();
    if (/^Q[A-Z]{4}$/.test(v)) return v;
  }
  return '';
}

/** Traduz o campo <scope> do AISWEB. Valores reais: A, W, AE, E. */
function notamEscopo_(s) {
  var mapa = {
    A:  'Aeródromo',
    E:  'Em rota',
    W:  'Aviso de navegação',
    AE: 'Aeródromo e rota',
    AW: 'Aeródromo e aviso',
    K:  'Checklist'
  };
  return mapa[String(s || '').trim().toUpperCase()] || 'Aeródromo';
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
  var assunto = q.slice(0, 2);   // ex: MR, MX, LP, NM, OB, FA

  // O Q-code é o dado oficial e MANDA. A varredura por palavra-chave só entra
  // quando ele falta. Ordem invertida foi um bug real: 'ILS GP RWY 16 U/S'
  // contém RWY e virava 'Pista (RWY) / crítico' numa falha de ILS, ou seja,
  // alarme de pista fechada onde a pista está aberta.
  var r = assunto ? notamCatPorQcode_(assunto, t) : notamCatPorTexto_(t);
  var cat = r.cat, sev = r.sev;

  // Regra própria da SAFE: proibição ou suspensão de voo de instrução e de
  // cheque para em pé a operação de uma escola. Não é informativo.
  if (/TREINAMENTO|INSTRU[ÇC]|CHECK ANAC|CHEQUE ANAC/.test(t) &&
      /\bPRB\b|PROIB|\bCLSD\b|SUSP|\bNEG\b/.test(t)) {
    cat = 'Voo de instrução';
    sev = 'critico';
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

/**
 * Categoria + severidade a partir do assunto do Q-code (2 letras após o Q).
 * Assuntos vistos na base real: WU RT WP XX FA OB WL WE MR RR WM PI WG MX NM.
 * A primeira letra é a família ICAO: M área de manobras, L luzes, I/N/G
 * auxílios, P procedimentos, R restrição de espaço aéreo, W avisos,
 * F instalações e serviços, O outras informações, C/S comunicações e ATS.
 */
function notamCatPorQcode_(assunto, t) {
  var fam = assunto.charAt(0);
  var fechado = /\bCLSD\b|CLOSED|\bFECH|U\/S|UNSERVICEABLE|LIMIT|RESTR|\bPRB\b|PROIB/.test(t);

  if (assunto === 'MR') return { cat: 'Pista (RWY)', sev: fechado ? 'critico' : 'atencao' };
  if (assunto === 'MX') return { cat: 'Táxi (TWY)', sev: 'atencao' };
  if (fam === 'M')      return { cat: 'Área de manobras', sev: 'atencao' };
  if (fam === 'L')      return { cat: 'Auxílios luminosos', sev: 'atencao' };
  if (fam === 'I' || fam === 'N' || fam === 'G') return { cat: 'Aux. navegação', sev: 'atencao' };
  if (fam === 'P')      return { cat: 'Procedimentos', sev: 'atencao' };
  if (fam === 'R')      return { cat: 'Restrição de espaço aéreo', sev: 'atencao' };
  if (fam === 'W')      return { cat: 'Aviso de navegação', sev: 'info' };
  if (assunto === 'OB' || assunto === 'OL') return { cat: 'Obstáculo', sev: 'info' };
  if (fam === 'O')      return { cat: 'Informação aeronáutica', sev: 'info' };
  // FA é o aeródromo em si: fechado ou proibido é impacto máximo.
  if (assunto === 'FA') return { cat: 'Aeródromo', sev: fechado ? 'critico' : 'info' };
  if (fam === 'F')      return { cat: 'Serviços do aeródromo', sev: 'info' };
  if (fam === 'C' || fam === 'S') return { cat: 'Comunicações e ATS', sev: 'atencao' };
  if (fam === 'A')      return { cat: 'Espaço aéreo', sev: 'info' };
  return { cat: 'Geral', sev: 'info' };
}

/** Fallback por palavra-chave. Só roda quando o NOTAM vem SEM Q-code. */
function notamCatPorTexto_(t) {
  if (/\bILS\b|\bVOR\b|\bNDB\b|\bDME\b|\bGP\b|\bLOC\b/.test(t)) {
    return { cat: 'Aux. navegação', sev: 'atencao' };
  }
  if (/\bRWY\b|\bPISTA\b/.test(t)) {
    return {
      cat: 'Pista (RWY)',
      sev: /CLSD|CLOSED|FECH|U\/S|UNSERVICEABLE|LIMIT|RESTR/.test(t) ? 'critico' : 'atencao'
    };
  }
  if (/\bTWY\b|TAXIWAY|T[ÁA]XI/.test(t)) return { cat: 'Táxi (TWY)', sev: 'atencao' };
  if (/\bPAPI\b|\bVASIS\b|\bBALIZ|\bLGT|LIGHT|LUZ/.test(t)) {
    return { cat: 'Auxílios luminosos', sev: 'atencao' };
  }
  if (/CRANE|GUINDASTE|OBST/.test(t)) return { cat: 'Obstáculo', sev: 'info' };
  if (/\bAD\b|AERODROMO|AER[ÓO]DROMO|OPR HR|HORARIO|HOR[ÁA]RIO/.test(t)) {
    return { cat: 'Aeródromo', sev: 'info' };
  }
  return { cat: 'Geral', sev: 'info' };
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
function notamDecodificar_(texto, horario) {
  if (!texto) return '';
  var out = String(texto);
  Object.keys(NOTAMS_GLOSSARIO).forEach(function(abbr) {
    out = out.replace(new RegExp('\\b' + abbr.replace('/', '\\/') + '\\b', 'g'),
      NOTAMS_GLOSSARIO[abbr]);
  });
  out = out.charAt(0).toUpperCase() + out.slice(1);
  // O campo D) restringe a validade dentro do período B)–C). Sem ele, um NOTAM
  // que só vale das 12h às 21h aparece como se valesse o dia inteiro. Vai
  // inline porque .notam-decoded não preserva quebra de linha (só .notam-raw).
  if (horario) out += '  ·  Válido em: ' + String(horario).trim();
  return out;
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

/**
 * Reconstrói o "NOTAM cru" no formato ICAO. A API entrega os campos separados,
 * não o bloco inteiro, então remontamos: cabeçalho, Q), A)B)C)D) e E).
 */
function notamMontarCru_(cod, tipo, qcode, icao, ini, fim, horario, texto) {
  var linhas = [];
  if (cod) linhas.push(cod + ' ' + (tipo || 'NOTAMN'));
  if (qcode) linhas.push('Q) ' + qcode);
  linhas.push('A) ' + (icao || '') + (ini ? '  B) ' + ini : '') + (fim ? '  C) ' + fim : ''));
  if (horario) linhas.push('D) ' + horario);
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
/** Loga o XML cru da API p/ uma base (padrão SBSJ), p/ conferir o schema. */
function notamsDebugRaw(icao) {
  var xml = notamFetchAisweb_(icao || NOTAMS_ICAOS[0]);
  Logger.log(xml.slice(0, 5000));
  return xml.slice(0, 500);
}

/**
 * Testa o pipeline SEM chave e SEM rede: parseia uma amostra REAL do XML da
 * AISWEB (capturada em 2026-07-28 de SBSJ e SDAM), classifica e grava no cache.
 * As tags abaixo são o schema verdadeiro, não uma hipótese: <cod> é o Q-code e
 * <n> é o identificador. Rode e confira listarNotams().
 *
 * Esperado: 3 itens; F3879/26 sai como 'Aux. navegação' (e NÃO como pista
 * crítica, que era o bug), e F3883/26 sai como 'Voo de instrução' / crítico.
 */
function notamsSelfTest() {
  var exemplo =
    '<aisweb><notam total="3" updatedat="2026-07-28 19:17:00">' +
      '<item id="12417531"><id>12417531</id><icaoairport_id>SBSJ</icaoairport_id>' +
        '<cod>QIGAS</cod><status>ACTIVE</status><cat>CNS</cat><tp>NOTAMN</tp>' +
        '<n>F3879/26</n><number>3879</number><loc>SBSJ</loc>' +
        '<b>2610261200</b><c>2610302100</c><d>DAILY 1200-2100</d>' +
        '<e>ILS GP RWY 16 U/S</e><scope>A</scope></item>' +
      '<item id="12417532"><id>12417532</id><icaoairport_id>SBSJ</icaoairport_id>' +
        '<cod>QFAXX</cod><status>ACTIVE</status><cat>AGA</cat><tp>NOTAMR</tp>' +
        '<n>F3883/26</n><number>3883</number><loc>SBSJ</loc>' +
        '<b>2608221100</b><c>2610302100</c>' +
        '<d>AUG 22 1100-1800 OCT 05-09 12-16 19-23 26-30 1200-2100</d>' +
        '<e>AD PRB VOOS DE TREINAMENTO E CHECK ANAC</e><scope>A</scope></item>' +
      '<item id="12417533"><id>12417533</id><icaoairport_id>SDAM</icaoairport_id>' +
        '<cod>QLYAS</cod><status>ACTIVE</status><cat>AGA</cat><tp>NOTAMN</tp>' +
        '<n>F3429/26</n><number>3429</number><loc>SDAM</loc>' +
        '<b>2606241412</b><c>2609181400</c><d/>' +
        '<e>LGT LATERAL TWY (TODAS) U/S</e><scope>A</scope></item>' +
    '</notam></aisweb>';
  var itens = notamParseXml_(exemplo);
  notamGravarCache_(itens);
  Logger.log('Self-test: ' + itens.length + ' NOTAMs parseados e gravados.');
  Logger.log(JSON.stringify(listarNotams(), null, 2));
  return itens.length;
}
