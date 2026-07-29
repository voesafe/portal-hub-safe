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
// ⚠️⚠️ A DOCUMENTAÇÃO DA AISWEB ESTÁ ERRADA SOBRE O CAMPO PRINCIPAL.
// Ela diz: "<workinghour> sem dados = o aeródromo opera 24 horas sem parar".
// Medido contra o dado real em 2026-07-29: as DUAS bases SAFE devolvem
// `<workinghour compl=""/>` vazio, e SDAM **não é H24**. O horário verdadeiro
// estava numa nota, escondido no fim do XML:
//     <rmkText cod="2.3">AD HR SER H14 - DLY 0900-2300.
//                        Demais HR OPR O/R: 2300-0900.</rmkText>
// Acreditar na documentação teria posto "H24" na tela de um aeródromo que
// fecha às 23:00, que é o pior defeito possível para este módulo.
//
// Por isso a ordem de leitura é: (1) texto dentro de <workinghour>, se houver;
// (2) as notas <rmkText>, que é onde o dado realmente vive; (3) só então, se
// nada disso existir, H24.
//
// ⚠️ E as notas exigem casamento por CÓDIGO OFICIAL, nunca por português
// livre. O mesmo SDAM traz "Centro de Controle Operacional Rede Voa - CCO TEL
// (11) 4040-7280 horário de funcionamento 24 horas 7 dias na semana", que é o
// horário do CALL CENTER da concessionária. Um casamento por "horário de
// funcionamento" leria isso e diria H24 de novo, pela porta dos fundos.
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

/**
 * Nota do ROTAER que fala do horário DO AERÓDROMO.
 *
 * ⚠️ Só códigos oficiais (`AD HR`, `HR OPR`, `AD OPR`), nunca português livre.
 * SDAM tem uma nota dizendo "horário de funcionamento 24 horas 7 dias na
 * semana" que é do CALL CENTER da concessionária, não do aeródromo: casar por
 * texto livre traria de volta o "H24" errado que este módulo existe para
 * evitar.
 */
var ROTAER_RE_NOTA_HORARIO = /\bAD\s+HR\b|\bHR\s+OPR\b|\bAD\s+OPR\b/i;

/** Faixa de horário no formato do ROTAER: 0900-2300. */
var ROTAER_RE_FAIXA = /\b(\d{4})\s*-\s*(\d{4})\b/;

/** Regime de operação: H24, H14, HJ (diurno), HN (noturno). */
var ROTAER_RE_REGIME = /\bH(?:24|\d{1,2}|J|N)\b/i;

/**
 * ⚠️⚠️ O HORÁRIO DO ROTAER ESTÁ EM UTC, NUNCA EM HORA LOCAL.
 * É a convenção da AIP/ICAO, e o campo <utc> do próprio XML existe para
 * converter. Medido nas duas bases em 2026-07-29:
 *   SBSJ  AD HR SER DLY 0830-0230  ->  05:30 às 23:30 local
 *   SDAM  AD HR SER H14 DLY 0900-2300  ->  06:00 às 20:00 local
 * Mostrar o número cru faria a pessoa ler "2300" como 23h e planejar voo
 * três horas depois do aeródromo ter fechado. A confirmação cruzada está no
 * próprio dado: a nota de instrução do SDAM diz DLY 1100-2300, que em UTC dá
 * 08:00-20:00 local e fecha junto com o aeródromo.
 *
 * A tarja mostra o horário LOCAL, porque quem usa o Hub opera em hora de
 * Brasília; o original em UTC fica no `title`, para conferir contra o ROTAER.
 */
function rotaerHoraLocal_(hhmm, offsetHoras) {
  var h = parseInt(String(hhmm).slice(0, 2), 10);
  var m = parseInt(String(hhmm).slice(2, 4), 10);
  if (isNaN(h) || isNaN(m)) return '';
  var total = (h * 60 + m) + Math.round(offsetHoras * 60);
  total = ((total % 1440) + 1440) % 1440;   // vira o dia nos dois sentidos
  var hh = Math.floor(total / 60), mm = total % 60;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

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

  // A nota é lida SEMPRE, porque na prática é ela que carrega o horário: nas
  // duas bases SAFE a tag veio vazia e só a nota sabia que SDAM é H14.
  var nota = rotaerHorarioNasNotas_(raiz);

  var base = { nome: nome, cidade: cidade, utc: utc, status: status,
               nota: nota, compl: '' };

  if (!el && !nota) {
    return Object.assign({ lido: false, h24: false, texto: '', origem: 'nenhuma' }, base);
  }

  // getValue() traz o texto de todos os descendentes, então funciona tanto para
  // <workinghour>HR OPR 1100-2200</workinghour> quanto para uma variante em que
  // o horário venha dentro de um filho.
  var texto = el ? String(el.getValue() || '').replace(/\s+/g, ' ').trim() : '';
  if (el) {
    try {
      var a = el.getAttribute('compl');
      if (a) base.compl = String(a.getValue() || '').trim();
    } catch (e) { /* atributo ausente não é erro */ }
  }

  // ⚠️ ORDEM IMPORTA, e é o oposto do que a documentação sugere.
  // 1) A tag, quando tem texto, é o dado mais direto.
  if (texto) {
    return Object.assign({ lido: true, h24: false, texto: texto, origem: 'tag' }, base);
  }
  // 2) A nota. É aqui que o horário mora de verdade nas bases SAFE.
  if (nota) {
    return Object.assign({ lido: true, h24: /\bH24\b/i.test(nota), texto: nota,
                           origem: 'nota' }, base);
  }
  // 3) Só agora, sem tag e sem nota, vale a regra da documentação.
  return Object.assign({ lido: true, h24: true, texto: '', origem: 'vazio' }, base);
}

/**
 * Procura, entre as notas do ROTAER, aquela que fala do horário do aeródromo.
 * Devolve o texto inteiro da nota (a tela mostra um resumo e guarda isto no
 * title, porque a nota costuma trazer a condição, como o "O/R" do SDAM).
 */
function rotaerHorarioNasNotas_(raiz) {
  var achado = '';
  (function desce(no) {
    no.getChildren().forEach(function(c) {
      if (achado) return;
      if (c.getName().toLowerCase() === 'rmktext') {
        var t = String(c.getValue() || '').replace(/\s+/g, ' ').trim();
        if (t && ROTAER_RE_NOTA_HORARIO.test(t)) { achado = t; return; }
      }
      desce(c);
    });
  })(raiz);
  return achado;
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

  var t = String(h.texto || '');
  var offset = parseFloat(h.utc);
  var temOffset = !isNaN(offset);

  // A faixa de horas é o que a pessoa precisa ler de relance.
  var faixa = t.match(ROTAER_RE_FAIXA);
  if (faixa) {
    // ⚠️ O "O/R" (on request) muda a natureza do que está escrito: fora da
    // faixa o aeródromo não está fechado, está sob solicitação. Omitir isso na
    // tarja faria a pessoa achar que não há o que negociar.
    var sufixo = /\bO\/R\b/i.test(t) ? ' · demais O/R' : '';
    if (temOffset) {
      var ini = rotaerHoraLocal_(faixa[1], offset);
      var fim = rotaerHoraLocal_(faixa[2], offset);
      if (ini && fim) return ini + '-' + fim + sufixo;
    }
    // Sem o <utc> não dá para converter, e mostrar número cru sem dizer que é
    // UTC seria a armadilha de novo. Aqui o rótulo é obrigatório.
    return faixa[1] + '-' + faixa[2] + ' UTC' + sufixo;
  }

  // Sem faixa, o regime é o que sobra ("HJ", "H14"). Não precisa de conversão.
  var reg = t.match(ROTAER_RE_REGIME);
  if (reg) return reg[0].toUpperCase();

  // Sem formato reconhecido, mostra o texto sem o prefixo burocrático.
  var limpo = t.replace(/^\s*(AD\s+HR\s+SER|HR\s*OPR|AD\s+HR|HOR[ÁA]RIO\s*(DE\s*)?(OPERA[ÇC][ÃA]O|FUNCIONAMENTO))\s*[:\-]?\s*/i, '');
  return (limpo || t).slice(0, 40);
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
        texto: h.texto,     // original, em UTC, para o title da tela
        utc: h.utc,
        origem: h.origem,
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
      utc: c ? String(c.utc || '') : '',
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
 * SONDAGEM DAS DUAS BASES, de um clique só.
 *
 * Existe porque o botão Run do editor não passa argumento: rodar
 * `rotaerDebugRaw` direto sondaria só a primeira base, e a segunda exigiria
 * editar o código à mão. Aqui as duas saem no mesmo Log, na ordem.
 *
 * Só LÊ. Não grava no cache, não instala gatilho, não toca na planilha.
 * Uma requisição por base, nunca as duas juntas: pedir duas de uma vez foi o
 * que derrubou o filtro no NOTAM e trouxe o Brasil inteiro.
 */
function rotaerDiagnostico() {
  var relatorio = {};
  NOTAMS_ICAOS.forEach(function(icao) {
    Logger.log('\n\n############ ' + icao + ' ############');
    try {
      var xml = rotaerFetchAisweb_(icao);
      Logger.log('bytes: ' + xml.length);

      // ⚠️ Logar o XML inteiro NÃO serve: SBSJ tem 18 KB e o corte em 8000
      // escondeu justamente as notas, que é onde o horário mora de verdade.
      // Aqui saem TODAS as notas, que é o pedaço pequeno e decisivo.
      Logger.log('--- TODAS AS NOTAS (rmkText) ---');
      var notas = xml.match(/<rmkText[^>]*>[\s\S]*?<\/rmkText>/g) || [];
      if (!notas.length) Logger.log('(nenhuma nota neste aeródromo)');
      notas.forEach(function(n, i) {
        var limpo = n.replace(/<\/?rmkText[^>]*>/g, '')
                     .replace(/<!\[CDATA\[|\]\]>/g, '')
                     .replace(/\s+/g, ' ').trim();
        var cod = (n.match(/cod="([^"]*)"/) || [])[1] || '?';
        var marca = ROTAER_RE_NOTA_HORARIO.test(limpo) ? '  <<< HORÁRIO DO AD' : '';
        Logger.log('[' + (i + 1) + '] cod=' + cod + marca + '\n    ' + limpo);
      });

      Logger.log('--- TRECHO DO XML EM VOLTA DO <workinghour> ---');
      var pos = xml.indexOf('workinghour');
      Logger.log(pos < 0 ? '(tag workinghour não existe)'
                         : xml.slice(Math.max(0, pos - 300), pos + 300));

      var h = rotaerParseHorario_(xml);
      var resumo = rotaerResumirHorario_(h);
      Logger.log('--- O QUE O PARSER ENTENDEU ---');
      Logger.log(JSON.stringify(h, null, 2));
      Logger.log('--- O QUE APARECERIA NA TELA: "' + resumo + '"');
      if (!h.lido) {
        Logger.log('>>> ATENÇÃO: tag de horário NÃO encontrada. A tela não vai ' +
                   'mostrar nada para esta base. Procure no XML acima como o ' +
                   'campo se chama de verdade.');
      }
      if (h.origem === 'vazio') {
        Logger.log('>>> Sem texto na tag e sem nota de horário: caiu na regra ' +
                   'da documentação (H24). Confira nas notas acima se alguma ' +
                   'fala do horário sem usar AD HR / HR OPR / AD OPR.');
      }
      relatorio[icao] = { lido: h.lido, h24: h.h24, origem: h.origem,
                          texto: h.texto, compl: h.compl, resumo: resumo,
                          bytes: xml.length, notas: (xml.match(/<rmkText/g) || []).length };
    } catch (err) {
      Logger.log('>>> ERRO em ' + icao + ': ' + (err && err.message ? err.message : err));
      relatorio[icao] = { erro: String(err && err.message ? err.message : err) };
    }
  });
  Logger.log('\n\n############ RESUMO ############');
  Logger.log(JSON.stringify(relatorio, null, 2));
  return relatorio;
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
