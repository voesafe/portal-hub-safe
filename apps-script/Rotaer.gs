// ============================================================
// Rotaer.gs — Horário de funcionamento das bases SAFE
// SAFE Hub · fonte: API AISWEB/DECEA, area=rotaer
//
// POR QUE ISTO EXISTE, E POR QUE NÃO SUBSTITUI O NOTAM
// O ROTAER é o dado PUBLICADO: ele muda por emenda AIRAC, de 28 em 28 dias.
// Alteração temporária de horário NÃO aparece aqui, aparece por NOTAM. Então
// mostrar só o ROTAER seria pior que não mostrar nada, porque exibiria o
// horário oficial num dia em que ele não vale.
//
// Por isso `rotaerHorariosParaTela_` cruza os dois: devolve o horário oficial
// e, quando existe NOTAM ATIVO que mexe no horário de operação, marca
// `alterado: true` para a tela avisar em vez de afirmar.
//
// ⚠️ ARMADILHA PRINCIPAL: `<workinghour>` VAZIO significa 24 HORAS, não
// "sem informação". É o que a documentação diz e é o que o exemplo real de
// Congonhas mostra (`<workinghour compl=""/>`). Tratar vazio como ausência
// inverteria o sentido do campo no caso mais comum dos aeroportos grandes.
//
// ⚠️ O schema abaixo veio da DOCUMENTAÇÃO, não do dado real. A documentação
// da AISWEB já se provou errada antes (no NOTAM ela levou a três bugs) e a
// própria coleção oficial repete o XML do `rotaer` nos exemplos de `sol` e
// `met`, o que é erro de colagem evidente. Rode `rotaerDebugRaw('SBSJ')` com
// a chave em mãos e confira as listas de candidatos antes de confiar.
// ============================================================

// ── Configuração ────────────────────────────────────────────
var ROTAER_PROP_HORARIOS = 'NOTAMS_HORARIOS';      // cache (JSON) do horário
var ROTAER_PROP_TS       = 'NOTAMS_HORARIOS_EM';   // quando foi buscado

// Teto por aeródromo. O ROTAER de um aeródromo é pequeno (poucos KB); passar
// disso é sinal de que o filtro icaoCode caiu, como já aconteceu com o NOTAM.
var ROTAER_MAX_BYTES = 400000;

/**
 * NOTAM que MEXE no horário de funcionamento do aeródromo.
 * Exige HR e OPR juntos (ou a forma por extenso), senão um "CRANE OPR" ou um
 * "HR" solto em outro contexto marcaria a base como alterada sem motivo.
 */
var ROTAER_RE_NOTAM_HORARIO =
  /\bHR\s+OPR\b|\bOPR\s+HR\b|\bAD\s+OPR\b|HOR[ÁA]RIO\s+DE\s+(FUNCIONAMENTO|OPERA[ÇC][ÃAO]{1,2})/;

// ============================================================
//  BUSCA + PARSE
// ============================================================
/**
 * Chama a AISWEB para UM aeródromo. Mesma credencial e mesma base de URL do
 * NOTAM: o que muda é só `area=rotaer`.
 */
function rotaerFetchAisweb_(icao) {
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
    '&area=rotaer' +
    '&icaoCode=' + encodeURIComponent(icao);

  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, method: 'get' });
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('AISWEB (rotaer) retornou HTTP ' + code + ' para ' + icao +
      ': ' + body.slice(0, 300));
  }
  if (body.length > ROTAER_MAX_BYTES) {
    throw new Error('AISWEB (rotaer) devolveu ' + body.length + ' bytes para ' +
      icao + ': o filtro icaoCode foi ignorado.');
  }
  return body;
}

/**
 * Extrai o horário de funcionamento do XML do ROTAER.
 *
 * ⚠️ A distinção que importa aqui é entre TAG AUSENTE e TAG VAZIA, e é por isso
 * que este parser não reusa o `notamPick_`: aquele devolve string vazia nos
 * dois casos, e aqui os dois casos significam coisas OPOSTAS. Tag vazia é
 * "opera 24 horas"; tag ausente é "não consegui ler", e aí a tela não deve
 * afirmar nada.
 */
function rotaerParseHorario_(xmlText) {
  var doc = XmlService.parse(xmlText);
  var raiz = doc.getRootElement();

  var el = rotaerAcharElemento_(raiz, ['workinghour', 'working_hour', 'hroper', 'hr_opr']);
  var nome   = rotaerTextoDe_(raiz, ['name', 'aerodromo']);
  var cidade = rotaerTextoDe_(raiz, ['city', 'cidade']);
  var utc    = rotaerTextoDe_(raiz, ['utc']);
  var status = rotaerTextoDe_(raiz, ['status']);

  if (!el) {
    return { lido: false, h24: false, texto: '', nome: nome, cidade: cidade,
             utc: utc, status: status, compl: '' };
  }

  // getValue() traz o texto de todos os descendentes, então funciona tanto para
  // <workinghour>HR OPR 1100-2200</workinghour> quanto para uma variante em que
  // o horário venha dentro de um filho.
  var texto = String(el.getValue() || '').replace(/\s+/g, ' ').trim();
  var compl = '';
  try {
    var a = el.getAttribute('compl');
    if (a) compl = String(a.getValue() || '').trim();
  } catch (e) { /* atributo ausente não é erro */ }

  return {
    lido: true,
    h24: texto === '',        // ⚠️ vazio É a informação: 24 horas
    texto: texto,
    nome: nome,
    cidade: cidade,
    utc: utc,
    status: status,
    // `compl` aponta para uma nota complementar numerada do ROTAER, que vive
    // fora desta tag. Sem o XML real não dá para saber onde: fica capturado
    // para o diagnóstico e para quem for refinar isto depois.
    compl: compl
  };
}

/** Primeiro elemento da árvore cujo nome case (sem diferenciar maiúsculas). */
function rotaerAcharElemento_(el, nomes) {
  var alvo = nomes.map(function(n) { return n.toLowerCase(); });
  var achado = null;
  (function desce(no) {
    if (achado) return;
    var filhos = no.getChildren();
    for (var i = 0; i < filhos.length; i++) {
      if (achado) return;
      var c = filhos[i];
      if (alvo.indexOf(c.getName().toLowerCase()) >= 0) { achado = c; return; }
      desce(c);
    }
  })(el);
  return achado;
}

/** Texto do primeiro elemento com um dos nomes. '' quando não existe. */
function rotaerTextoDe_(raiz, nomes) {
  var el = rotaerAcharElemento_(raiz, nomes);
  return el ? String(el.getValue() || '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Frase curta para a tela, a partir do que foi lido.
 * Curta de propósito: isto fica ao lado do nome do aeródromo, não é um campo
 * de formulário. O texto integral do ROTAER continua em `texto`.
 */
function rotaerResumirHorario_(h) {
  if (!h || !h.lido) return '';
  if (h.h24) return 'H24';
  // O ROTAER costuma vir com prefixo ('HR OPR: ...'), que na tela é ruído:
  // o rótulo da interface já diz que aquilo é horário.
  var t = h.texto.replace(/^\s*(HR\s*OPR|HOR[ÁA]RIO\s*(DE\s*)?(OPERA[ÇC][ÃA]O|FUNCIONAMENTO))\s*[:\-]?\s*/i, '');
  return t || h.texto;
}

// ============================================================
//  ATUALIZAÇÃO + CACHE
// ============================================================
/**
 * Busca o horário das duas bases e guarda em Propriedade do script.
 *
 * Propriedade em vez de aba: são DUAS bases e um objeto de poucas centenas de
 * bytes, contra o limite de 9 KB por valor. Criar aba para isso acrescentaria
 * um terceiro escritor disputando a planilha com o gatilho de NOTAM e com o
 * botão Atualizar, que é exatamente a disputa que obrigou a pôr LockService no
 * cache de NOTAM.
 *
 * Falha de uma base NÃO derruba a outra, e NÃO apaga o que já estava: horário
 * antigo é melhor que campo vazio, e o ROTAER muda de 28 em 28 dias, então o
 * valor guardado continua valendo mesmo com a API fora do ar por um tempo.
 */
function atualizarHorariosRotaer() {
  var props = PropertiesService.getScriptProperties();
  var atual = rotaerLerCache_();
  var erros = [];

  NOTAMS_ICAOS.forEach(function(icao) {
    try {
      var h = rotaerParseHorario_(rotaerFetchAisweb_(icao));
      if (!h.lido) {
        erros.push(icao + ': tag de horário ausente na resposta');
        return;   // preserva o que já havia
      }
      atual[icao] = {
        resumo: rotaerResumirHorario_(h),
        h24: h.h24,
        texto: h.texto,
        compl: h.compl,
        em: new Date().toISOString()
      };
    } catch (err) {
      erros.push(icao + ': ' + (err && err.message ? err.message : err));
    }
  });

  props.setProperty(ROTAER_PROP_HORARIOS, JSON.stringify(atual));
  props.setProperty(ROTAER_PROP_TS, new Date().toISOString());

  if (erros.length === NOTAMS_ICAOS.length) {
    throw new Error('Nenhuma base respondeu o ROTAER. ' + erros.join(' | '));
  }
  return { horarios: atual, erros: erros };
}

/** Lê o cache de horários. Objeto vazio quando não há nada ou o JSON quebrou. */
function rotaerLerCache_() {
  var bruto = PropertiesService.getScriptProperties().getProperty(ROTAER_PROP_HORARIOS);
  if (!bruto) return {};
  try {
    var o = JSON.parse(bruto);
    return (o && typeof o === 'object') ? o : {};
  } catch (e) {
    return {};   // valor corrompido não pode derrubar a página inteira
  }
}

/**
 * O que a tela recebe por base: o horário oficial mais o aviso de que existe
 * NOTAM ativo mexendo nele.
 *
 * É esta função que impede o pior defeito possível deste módulo, que seria
 * exibir com confiança o horário publicado justamente no dia em que um NOTAM o
 * alterou. Quando `alterado` é true, a tela manda ler o NOTAM em vez de
 * confiar no número.
 */
function rotaerHorariosParaTela_(notams) {
  var cache = rotaerLerCache_();
  var lista = notams || [];
  var saida = {};

  NOTAMS_ICAOS.forEach(function(icao) {
    var c = cache[icao];
    var alterado = lista.some(function(n) {
      return n && n.icao === icao && n.active &&
             ROTAER_RE_NOTAM_HORARIO.test(String(n.raw || n.decoded || '').toUpperCase());
    });
    saida[icao] = {
      resumo: c ? String(c.resumo || '') : '',
      h24: c ? !!c.h24 : false,
      texto: c ? String(c.texto || '') : '',
      atualizadoEm: c ? String(c.em || '') : '',
      alterado: alterado
    };
  });
  return saida;
}

// ============================================================
//  GATILHO
// ============================================================
/**
 * Gatilho DIÁRIO, não de hora em hora como o do NOTAM.
 * O ROTAER muda por emenda AIRAC, de 28 em 28 dias: consultar a cada hora
 * gastaria 48 requisições por dia para reler o mesmo texto. Uma vez por dia já
 * pega a emenda no dia em que ela entra.
 * Rodar de novo é seguro: apaga o anterior antes de criar.
 */
function rotaerInstalarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'atualizarHorariosRotaer') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('atualizarHorariosRotaer')
    .timeBased().atHour(5).everyDays(1).create();
  return 'Gatilho diário do ROTAER instalado (~05h).';
}

/** Desliga a atualização automática (o horário já guardado continua servindo). */
function rotaerRemoverTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'atualizarHorariosRotaer') {
      ScriptApp.deleteTrigger(t); n++;
    }
  });
  return 'Gatilhos do ROTAER removidos: ' + n;
}

// ============================================================
//  DIAGNÓSTICO
// ============================================================
/**
 * SONDAGEM. Roda no editor, só LÊ e não grava nada.
 * É o passo que falta para confirmar o schema real: a documentação da AISWEB
 * não é confiável no detalhe e no NOTAM ela já custou três bugs.
 * Olhe no Log se `<workinghour>` existe, se tem texto ou vem vazia, e se o
 * atributo `compl` aponta para alguma nota.
 */
function rotaerDebugRaw(icao) {
  var ic = String(icao || NOTAMS_ICAOS[0]).toUpperCase();
  var xml = rotaerFetchAisweb_(ic);
  Logger.log('===== XML CRU DE ' + ic + ' (' + xml.length + ' bytes) =====');
  Logger.log(xml.slice(0, 8000));
  var h = rotaerParseHorario_(xml);
  Logger.log('===== O QUE O PARSER ENTENDEU =====');
  Logger.log(JSON.stringify(h, null, 2));
  Logger.log('resumo para a tela: "' + rotaerResumirHorario_(h) + '"');
  return h;
}

/**
 * Testa o parser SEM chave e SEM rede, nos três casos que importam.
 * O primeiro XML é o exemplo REAL da documentação oficial (Congonhas), que é
 * justamente o caso da tag vazia valendo 24 horas.
 */
function rotaerSelfTest() {
  var casos = [
    { nome: 'tag vazia (exemplo real de SBSP) = H24',
      xml: '<aisweb><status>Active</status><AeroCode>SBSP</AeroCode>' +
           '<name>Congonhas</name><city>São Paulo</city>' +
           '<workinghour compl=""/><type>AD</type><utc>-3</utc></aisweb>',
      esperado: { lido: true, h24: true, resumo: 'H24' } },
    { nome: 'tag com horário',
      xml: '<aisweb><status>Active</status><AeroCode>SDAM</AeroCode>' +
           '<name>Amarais</name><city>Campinas</city>' +
           '<workinghour compl="2">HR OPR: 1100-2200</workinghour>' +
           '<utc>-3</utc></aisweb>',
      esperado: { lido: true, h24: false, resumo: '1100-2200' } },
    { nome: 'tag AUSENTE = não lido (diferente de vazia)',
      xml: '<aisweb><status>Active</status><AeroCode>SBSJ</AeroCode>' +
           '<name>São José</name></aisweb>',
      esperado: { lido: false, h24: false, resumo: '' } }
  ];

  var falhas = 0;
  casos.forEach(function(c) {
    var h = rotaerParseHorario_(c.xml);
    var r = rotaerResumirHorario_(h);
    var ok = h.lido === c.esperado.lido && h.h24 === c.esperado.h24 &&
             r === c.esperado.resumo;
    if (!ok) falhas++;
    Logger.log((ok ? 'ok   ' : 'FALHA') + '  ' + c.nome +
      '  -> lido=' + h.lido + ' h24=' + h.h24 + ' resumo="' + r + '"');
  });

  // O cruzamento com NOTAM: o horário oficial não pode ser afirmado sozinho
  // num dia em que um NOTAM ativo o alterou.
  var casosNotam = [
    { txt: 'AD OPR HR 1100-2200', ativo: true,  esperado: true },
    { txt: 'AD OPR HR 1100-2200', ativo: false, esperado: false },
    { txt: 'RWY 15/33 CLSD DUE MAINT', ativo: true, esperado: false },
    { txt: 'CRANE OPR 800M FM THR', ativo: true, esperado: false }
  ];
  casosNotam.forEach(function(c) {
    var r = rotaerHorariosParaTela_([
      { icao: NOTAMS_ICAOS[0], active: c.ativo, raw: c.txt }
    ]);
    var got = r[NOTAMS_ICAOS[0]].alterado;
    var ok = got === c.esperado;
    if (!ok) falhas++;
    Logger.log((ok ? 'ok   ' : 'FALHA') + '  NOTAM "' + c.txt +
      '" ativo=' + c.ativo + ' -> alterado=' + got);
  });

  Logger.log(falhas ? (falhas + ' FALHA(S)') : 'rotaerSelfTest: tudo passou.');
  return falhas;
}
