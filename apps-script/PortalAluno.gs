// ============================================================
// PortalAluno.gs — Liberar acesso ao portal do aluno (Newzenler)
// SAFE Hub
//
// O PROBLEMA
// O cadastro inicial da Zenler aceita UM curso. Aluno de curso pratico
// precisa estar em quatro ou mais, e cada um era liberado a mao, entrando
// de novo no cadastro do aluno. Aqui isso vira um clique.
//
// O QUE FOI MEDIDO CONTRA A API REAL em 2026-08-06 (ver CLAUDE.md):
//   - Senha so de digitos e ACEITA na criacao e no login. Dai o CPF.
//   - A Zenler manda o e-mail de boas-vindas sozinha. Nao mandamos nada.
//   - Matricular duas vezes e inofensivo, mas a recusa vem em HTTP 400
//     com `response_code: 200` no corpo. Decidir pelo status HTTP.
//   - `POST /users` estrangula por rajada (429 ja na primeira chamada);
//     `/enroll` nao (4 seguidos em 2,8s, todos 200).
//
// DECISAO DE DESENHO
// O pacote NAO e um bundle da Zenler, por decisao do Victor: ele vive em
// planilha, aqui, para a operacao editar sem entrar no outro sistema e sem
// depender de deploy. O custo aceito e que a matricula passa a poder dar
// certo pela metade, e e por isso que o estado e gravado POR CURSO.
// ============================================================

var PORTAL_SHEETS = {
  CURSOS:    'PORTAL_CURSOS',
  PACOTES:   'PORTAL_PACOTES',
  LIBERACOES:'PORTAL_LIBERACOES',
  MATRICULAS:'PORTAL_MATRICULAS'
};

var PORTAL_CURSOS_HEADERS = ['ID', 'NOME', 'ATIVO', 'GRUPO', 'ATUALIZADO_EM'];
var PORTAL_MATRICULAS_HEADERS = ['EMAIL', 'NOME', 'CURSO_ID', 'STATUS', 'MATRICULADO_EM'];
var PORTAL_MATRICULAS_PROP = 'PORTAL_MATRICULAS_SINC';
var PORTAL_PACOTES_HEADERS = ['ID', 'NOME', 'CURSOS', 'ATIVO', 'ORDEM'];
var PORTAL_LIBERACOES_HEADERS = [
  'ID', 'DATA', 'AUTOR', 'ALUNO_NOME', 'ALUNO_EMAIL', 'ALUNO_CPF',
  'ZENLER_USER_ID', 'PACOTE', 'CURSO_ID', 'CURSO_NOME', 'STATUS', 'DETALHE'
];

// Semente dos pacotes, definida pelo Victor em 2026-08-06. Serve so para a
// primeira criacao da aba: depois disso a planilha manda, e reescrever daqui
// desfaria a edicao da operacao.
var PORTAL_PACOTES_SEMENTE = [
  ['pp_pratico',  'PP Prático Completo',      '145022,184036,150339,224126',               'SIM', 1],
  ['pc_ifr',      'PC IFR Prático Completo',  '145022,184036,172586,198994,175316,224126', 'SIM', 2],
  ['inva',        'INVA Completo',            '145022,184036,152001,224126',               'SIM', 3]
];

// Cursos que nao devem aparecer na tela. COLT e Cessna porque a escola nao tem
// mais essas aeronaves; as turmas de 2025 porque ja passaram e turma velha na
// tela e onde alguem clica por engano. Vale so na PRIMEIRA criacao da aba: a
// curadoria continua depois na coluna ATIVO.
var PORTAL_CURSOS_OCULTOS_INICIAIS = [
  190029, 192684, 198969, 179942, 179003,      // COLT e Cessna
  192492, 192605, 197040                        // turmas de PP Teorico de 2025
];

// ── Abas ────────────────────────────────────────────────────

/**
 * ⚠️ `criar` e falso na LEITURA, de proposito. Leitura que cria aba e escrita
 * disfarcada: duas cargas de tela simultaneas criariam a aba duas vezes. E a
 * mesma regra do `mapaColunasInstrutores_` das Horas INVA e do catalogo de
 * etiquetas.
 */
function portalAba_(nome, headers, criar) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var aba = ss.getSheetByName(nome);
  if (aba) return aba;
  if (!criar) return null;
  aba = ss.insertSheet(nome);
  aba.appendRow(headers);
  return aba;
}

// ── Cursos: reconciliacao com a Zenler ──────────────────────

/**
 * Traz os cursos da Zenler para a planilha, sem apagar a curadoria.
 *
 * Curso novo entra como ATIVO e o nome e atualizado; a coluna ATIVO nunca e
 * sobrescrita, porque ela e a decisao da operacao, nao um dado da Zenler.
 * Curso que sumiu da Zenler tambem nao e apagado: perder a linha perderia o
 * historico de por que ele estava escondido.
 */
function portalSincronizarCursos() {
  var aba = portalAba_(PORTAL_SHEETS.CURSOS, PORTAL_CURSOS_HEADERS, true);
  var existentes = aba.getDataRange().getValues();
  var primeiraVez = existentes.length <= 1;

  var daZenler = newzenlerListarCursos();

  var porId = {};
  for (var i = 1; i < existentes.length; i++) {
    if (existentes[i][0] === '' || existentes[i][0] === null) continue;
    porId[String(existentes[i][0])] = i + 1;   // numero da linha
  }

  var novos = 0, atualizados = 0;
  daZenler.forEach(function(c) {
    var id = String(c.id);
    var linha = porId[id];
    if (linha) {
      // So o nome. ATIVO e da operacao.
      if (String(existentes[linha - 1][1]) !== String(c.name || '')) {
        aba.getRange(linha, 2).setValue(c.name || '');
        atualizados++;
      }
      return;
    }
    var oculto = primeiraVez && PORTAL_CURSOS_OCULTOS_INICIAIS.indexOf(Number(id)) !== -1;
    aba.appendRow([id, c.name || '', oculto ? 'NAO' : 'SIM', portalGrupoCurso_(c.name), new Date()]);
    novos++;
  });

  return { novos: novos, atualizados: atualizados, totalZenler: daZenler.length };
}

/** Agrupamento so para a tela ficar legivel. Nao decide nada. */
function portalGrupoCurso_(nome) {
  var n = String(nome || '').toUpperCase();
  if (n.indexOf('APT') === 0)                 return 'APT';
  if (n.indexOf('GROUND SCHOOL') !== -1)      return 'Ground School';
  if (n.indexOf('INSTRUTOR') !== -1 ||
      n.indexOf('CFI') !== -1 ||
      n.indexOf('MENTORES') !== -1)           return 'Formação de instrutor';
  if (n.indexOf('(PRÁTICO)') !== -1 ||
      n.indexOf('(PRATICO)') !== -1)          return 'Prático';
  if (n.indexOf('(TEÓRICO)') !== -1 ||
      n.indexOf('(TEORICO)') !== -1)          return 'Teórico';
  if (n.indexOf('INTEGRAÇÃO') !== -1 ||
      n.indexOf('TREINAMENTO PRE') !== -1 ||
      n.indexOf('INTERNOS') !== -1)           return 'Interno';
  return 'Outros';
}

function portalLerCursos_() {
  var aba = portalAba_(PORTAL_SHEETS.CURSOS, PORTAL_CURSOS_HEADERS, false);
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();
  var fora = [];
  for (var i = 1; i < dados.length; i++) {
    var id = String(dados[i][0] || '').trim();
    if (!id) continue;
    fora.push({
      id: id,
      nome: String(dados[i][1] || ''),
      ativo: String(dados[i][2] || '').toUpperCase() !== 'NAO',
      grupo: String(dados[i][3] || 'Outros')
    });
  }
  return fora;
}

function portalLerPacotes_() {
  var aba = portalAba_(PORTAL_SHEETS.PACOTES, PORTAL_PACOTES_HEADERS, false);
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();
  var fora = [];
  for (var i = 1; i < dados.length; i++) {
    var id = String(dados[i][0] || '').trim();
    if (!id) continue;
    if (String(dados[i][3] || '').toUpperCase() === 'NAO') continue;
    var cursos = String(dados[i][2] || '')
      .split(',')
      .map(function(x) { return String(x).trim(); })
      .filter(function(x) { return x; });
    fora.push({
      id: id,
      nome: String(dados[i][1] || ''),
      cursos: cursos,
      ordem: Number(dados[i][4] || 999)
    });
  }
  return fora.sort(function(a, b) { return a.ordem - b.ordem; });
}

/** Cria as abas e semeia os pacotes. Idempotente. */
function portalInstalar() {
  var cursos = portalSincronizarCursos();

  var abaPac = portalAba_(PORTAL_SHEETS.PACOTES, PORTAL_PACOTES_HEADERS, true);
  var semeados = 0;
  if (abaPac.getLastRow() <= 1) {
    PORTAL_PACOTES_SEMENTE.forEach(function(p) { abaPac.appendRow(p); semeados++; });
  }

  portalAba_(PORTAL_SHEETS.LIBERACOES, PORTAL_LIBERACOES_HEADERS, true);

  return { cursos: cursos, pacotesSemeados: semeados };
}

// ── Cache das matriculas (quem esta em que curso) ───────────
//
// A API NAO tem "cursos deste aluno": /users/{id} devolve so o cadastro e
// /users/{id}/courses responde 301, que engana por parecer que existe. O
// unico caminho e o relatorio de progresso, que EXIGE course_id e ignora do
// segundo em diante. Entao o mapa e montado curso a curso.
//
// ⚠️ O que torna isso barato e o `fetchAll`, nao o numero de chamadas:
// medido em 2026-08-06, 63 requisicoes em duas rodadas paralelas levam 6,6s
// e trazem 2.984 matriculas de 707 alunos. Em sequencia seriam 63 esperas de
// rede, que e de onde veio a nota antiga de que isso nao caberia numa
// execucao. Nao volte para o laco sequencial.

/**
 * Varre todos os cursos e devolve uma linha por matricula.
 *
 * ⚠️ Varre a UNIAO dos cursos publicados com os que estao na planilha: um
 * curso despublicado na Zenler some do /courses, mas os alunos dele
 * continuam matriculados, e sumir da lista faria a tela dizer que o aluno
 * nao tem um acesso que ele tem.
 */
function portalVarrerMatriculas_() {
  var headers = newzenlerHeaders_();

  var ids = {}, nomes = {};
  newzenlerListarCursos().forEach(function (c) {
    ids[String(c.id)] = true;
    nomes[String(c.id)] = c.name || '';
  });
  portalLerCursos_().forEach(function (c) {
    ids[c.id] = true;
    if (!nomes[c.id]) nomes[c.id] = c.nome;
  });
  var cursos = Object.keys(ids);

  function url(cursoId, pagina) {
    return NEWZENLER_BASE_URL + '/reports/course-progress/detailed?course_id[]=' +
           encodeURIComponent(cursoId) + '&limit=100&page=' + pagina;
  }
  function pedir(lista) {
    return UrlFetchApp.fetchAll(lista.map(function (x) {
      return { url: url(x.curso, x.page), method: 'get', headers: headers, muteHttpExceptions: true };
    }));
  }

  var linhas = [], falhas = 0;

  function consumir(res, cursoId) {
    if (res.getResponseCode() !== 200) { falhas++; return 1; }
    var j;
    try { j = JSON.parse(res.getContentText()); } catch (e) { falhas++; return 1; }
    var dados = (j && j.data) ? j.data : {};
    portalItensRelatorio_(dados).forEach(function (it) {
      var email = String(it.email || '').trim().toLowerCase();
      if (!email) return;
      linhas.push([
        email,
        String(it.name || '').trim(),
        String(cursoId),
        String(it.status || ''),
        String(it.enrollment_date || '')
      ]);
    });
    // ⚠️ `pagination.total` PARA EM 100, que e o tamanho da pagina, e nao o
    // total do curso. Somar aquele campo subestimou a base pela metade na
    // medicao. Quem diz o tamanho e `total_pages`.
    return Number((dados.pagination || {}).total_pages || 1);
  }

  var primeira = cursos.map(function (c) { return { curso: c, page: 1 }; });
  var extras = [];
  pedir(primeira).forEach(function (res, i) {
    var tp = consumir(res, primeira[i].curso);
    for (var p = 2; p <= tp; p++) extras.push({ curso: primeira[i].curso, page: p });
  });

  if (extras.length) {
    pedir(extras).forEach(function (res, i) { consumir(res, extras[i].curso); });
  }

  return { linhas: linhas, falhas: falhas, cursosVarridos: cursos.length, nomes: nomes };
}

/** Os itens do relatorio vem como objeto indexado, nao array. */
function portalItensRelatorio_(dados) {
  var raw = (dados && dados.items) ? dados.items : {};
  if (Object.prototype.toString.call(raw) === '[object Array]') return raw;
  return Object.keys(raw).map(function (k) { return raw[k]; });
}

/**
 * ⚠️ Sob `LockService`, e a escrita e clearContent + setValues: dois
 * escritores disputam esta faixa (o gatilho diario e o botao Sincronizar).
 * Sem a trava, um clique no segundo exato da rodada automatica deixaria a
 * tela com a lista pela metade. Mesma decisao do `notamGravarCache_`.
 *
 * ⚠️ `setNumberFormats('@')` ANTES do setValues: a coluna MATRICULADO_EM e
 * texto tipo "2025-07-03 18:00:29" e o Sheets a converteria em Date, que
 * volta deslocada na leitura.
 */
function portalGravarMatriculas_(linhas) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) throw new Error('Outra sincronização está em andamento.');
  try {
    var aba = portalAba_(PORTAL_SHEETS.MATRICULAS, PORTAL_MATRICULAS_HEADERS, true);
    var ultima = aba.getLastRow();
    if (ultima > 1) {
      aba.getRange(2, 1, ultima - 1, PORTAL_MATRICULAS_HEADERS.length).clearContent();
    }
    if (!linhas.length) return;

    var formatos = linhas.map(function () { return ['@', '@', '@', '@', '@']; });
    aba.getRange(2, 1, linhas.length, PORTAL_MATRICULAS_HEADERS.length)
       .setNumberFormats(formatos)
       .setValues(linhas);
  } finally {
    trava.releaseLock();
  }
}

/** Roda a varredura e regrava o cache. Serve ao gatilho e ao botao. */
function sincronizarMatriculasPortal() {
  var r = portalVarrerMatriculas_();

  // ⚠️ Varredura que falhou inteira NAO pode apagar o cache: matricula
  // antiga e melhor que tela vazia, e a tela mostra a hora da ultima
  // sincronia para ninguem decidir achando que o dado e de agora.
  if (!r.linhas.length && r.falhas) {
    throw new Error('A Zenler não respondeu em nenhum curso. O cache anterior foi mantido.');
  }

  portalGravarMatriculas_(r.linhas);

  var resumo = {
    quando: new Date().toISOString(),
    matriculas: r.linhas.length,
    cursosVarridos: r.cursosVarridos,
    falhas: r.falhas
  };
  PropertiesService.getScriptProperties()
    .setProperty(PORTAL_MATRICULAS_PROP, JSON.stringify(resumo));
  return resumo;
}

function portalUltimaSincronia_() {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(PORTAL_MATRICULAS_PROP);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

/** Le o cache e agrupa por aluno. Nunca cria a aba (leitura nao escreve). */
function portalLerMatriculas_() {
  var aba = portalAba_(PORTAL_SHEETS.MATRICULAS, PORTAL_MATRICULAS_HEADERS, false);
  if (!aba) return [];
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];

  var dados = aba.getRange(2, 1, ultima - 1, PORTAL_MATRICULAS_HEADERS.length).getDisplayValues();

  var porEmail = {}, ordem = [];
  for (var i = 0; i < dados.length; i++) {
    var email = String(dados[i][0] || '').trim().toLowerCase();
    var curso = String(dados[i][2] || '').trim();
    if (!email || !curso) continue;
    if (!porEmail[email]) {
      porEmail[email] = { e: email, n: String(dados[i][1] || ''), c: [] };
      ordem.push(email);
    }
    // Nome vazio numa linha nao apaga o que outra linha trouxe.
    if (!porEmail[email].n && dados[i][1]) porEmail[email].n = String(dados[i][1]);
    porEmail[email].c.push([curso, String(dados[i][3] || ''), String(dados[i][4] || '')]);
  }

  return ordem.map(function (e) { return porEmail[e]; })
    .sort(function (a, b) { return String(a.n).localeCompare(String(b.n), 'pt-BR'); });
}

// ── Cache incremental ───────────────────────────────────────
//
// Depois de liberar ou remover pelo Hub, sabemos exatamente o que mudou.
// Varrer os 41 cursos de novo custaria 7 segundos para descobrir o que ja
// esta na mao, e deixaria a tela mentindo nesse intervalo.

function portalCacheAcrescentar_(email, nome, cursos) {
  if (!cursos.length) return;
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return;   // cache desatualizado nao justifica derrubar a operacao
  try {
    var aba = portalAba_(PORTAL_SHEETS.MATRICULAS, PORTAL_MATRICULAS_HEADERS, false);
    if (!aba) return;                  // sem cache ainda: a proxima sincronia resolve

    var jaTem = {};
    var ultima = aba.getLastRow();
    if (ultima > 1) {
      var dados = aba.getRange(2, 1, ultima - 1, 3).getDisplayValues();
      dados.forEach(function (l) {
        jaTem[String(l[0]).trim().toLowerCase() + '|' + String(l[2]).trim()] = true;
      });
    }

    var novas = [];
    var agora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    cursos.forEach(function (cursoId) {
      var chave = email + '|' + String(cursoId);
      if (jaTem[chave]) return;
      novas.push([email, nome, String(cursoId), 'Not Started', agora]);
    });
    if (!novas.length) return;

    var inicio = aba.getLastRow() + 1;
    aba.getRange(inicio, 1, novas.length, PORTAL_MATRICULAS_HEADERS.length)
       .setNumberFormats(novas.map(function () { return ['@', '@', '@', '@', '@']; }))
       .setValues(novas);
  } finally {
    trava.releaseLock();
  }
}

/** ⚠️ Apaga de baixo para cima: deletar linha desloca as de baixo. */
function portalCacheRemover_(email, cursoId) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return;
  try {
    var aba = portalAba_(PORTAL_SHEETS.MATRICULAS, PORTAL_MATRICULAS_HEADERS, false);
    if (!aba) return;
    var ultima = aba.getLastRow();
    if (ultima < 2) return;

    var dados = aba.getRange(2, 1, ultima - 1, 3).getDisplayValues();
    var alvo = String(email).trim().toLowerCase();
    var curso = String(cursoId).trim();
    var apagar = [];
    for (var i = 0; i < dados.length; i++) {
      if (String(dados[i][0]).trim().toLowerCase() === alvo &&
          String(dados[i][2]).trim() === curso) apagar.push(i + 2);
    }
    for (var k = apagar.length - 1; k >= 0; k--) aba.deleteRow(apagar[k]);
  } finally {
    trava.releaseLock();
  }
}

// ── Gatilho diario da sincronia ─────────────────────────────

/**
 * Diario, nao de hora em hora: matricula muda quando alguem libera acesso,
 * e quem libera pelo Hub ja atualiza o cache na hora. O gatilho existe para
 * pegar o que foi feito direto na Zenler.
 */
function portalInstalarTriggerMatriculas() {
  portalRemoverTriggerMatriculas();
  ScriptApp.newTrigger('sincronizarMatriculasPortal').timeBased().atHour(4).everyDays(1).create();
  return { instalado: true, hora: 4 };
}

function portalRemoverTriggerMatriculas() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarMatriculasPortal') {
      ScriptApp.deleteTrigger(t); n++;
    }
  });
  return { removidos: n };
}

// ── Leitura para a tela ─────────────────────────────────────

function listarPortalAluno() {
  var cursos  = portalLerCursos_();
  var pacotes = portalLerPacotes_();

  var porId = {};
  cursos.forEach(function(c) { porId[c.id] = c; });

  // O pacote leva o nome de cada curso junto, porque a tela mostra exatamente
  // no que o aluno vai ser matriculado ANTES de confirmar. Curso que saiu da
  // planilha aparece marcado, e nao some em silencio: sumir faria o pacote
  // liberar menos do que promete sem ninguem notar.
  var pacotesFora = pacotes.map(function(p) {
    return {
      id: p.id,
      nome: p.nome,
      cursos: p.cursos.map(function(id) {
        var c = porId[id];
        return { id: id, nome: c ? c.nome : '(curso ' + id + ' não encontrado)', existe: !!c };
      })
    };
  });

  // O mapa de nomes cobre TODOS os cursos, nao so os avulsos liberaveis: o
  // aluno pode estar matriculado num curso que a operacao tirou da tela, e
  // mostrar "curso 190029" em vez do nome nao ajuda ninguem.
  var nomesCursos = {};
  cursos.forEach(function(c) { nomesCursos[c.id] = c.nome; });

  return {
    pacotes: pacotesFora,
    cursos: cursos.filter(function(c) { return c.ativo; }),
    nomesCursos: nomesCursos,
    liberacoes: portalUltimasLiberacoes_(50),
    // A base inteira numa resposta so. O Apps Script leva segundos por
    // chamada, entao buscar os cursos do aluno ao clicar nele custaria uma
    // espera visivel a cada clique. Mesma decisao do modulo de Marketing.
    alunos: portalLerMatriculas_(),
    sincronia: portalUltimaSincronia_()
  };
}

function portalUltimasLiberacoes_(limite) {
  var aba = portalAba_(PORTAL_SHEETS.LIBERACOES, PORTAL_LIBERACOES_HEADERS, false);
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();

  // Agrupa as linhas (uma por curso) numa liberacao so, que e como a tela le.
  var porLiberacao = {};
  var ordem = [];
  for (var i = 1; i < dados.length; i++) {
    var id = String(dados[i][0] || '').trim();
    if (!id) continue;
    if (!porLiberacao[id]) {
      porLiberacao[id] = {
        id: id,
        data: portalDataIso_(dados[i][1]),
        autor: String(dados[i][2] || ''),
        nome: String(dados[i][3] || ''),
        email: String(dados[i][4] || ''),
        pacote: String(dados[i][7] || ''),
        cursos: []
      };
      ordem.push(id);
    }
    porLiberacao[id].cursos.push({
      id: String(dados[i][8] || ''),
      nome: String(dados[i][9] || ''),
      status: String(dados[i][10] || ''),
      detalhe: String(dados[i][11] || '')
    });
  }

  var lista = ordem.map(function(id) {
    var l = porLiberacao[id];
    l.ok = l.cursos.filter(function(c) { return c.status === 'OK'; }).length;
    l.total = l.cursos.length;
    return l;
  });

  return lista.reverse().slice(0, limite || 50);
}

function portalDataIso_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v || '');
}

// ── Liberacao ───────────────────────────────────────────────

/**
 * Cria o aluno na Zenler (se nao existir) e matricula na lista de cursos.
 *
 * Devolve o resultado POR CURSO, que e o que permite refazer so o que faltou.
 * ⚠️ "Ja matriculado" conta como SUCESSO: o objetivo e o aluno ter o acesso,
 * e nao esta operacao ter sido quem deu. Tratar como falha faria a tela pedir
 * para refazer algo que ja esta certo, para sempre.
 */
function liberarAcessoPortal(dados, autor) {
  var email = String((dados && dados.email) || '').trim().toLowerCase();
  var nome  = String((dados && dados.nome) || '').trim();
  var cpf   = cpfSoDigitosVenda_((dados && dados.cpf) || '');
  var cursos = (dados && dados.cursos) || [];

  if (!email) throw new Error('E-mail do aluno é obrigatório.');
  if (!nome)  throw new Error('Nome do aluno é obrigatório.');
  if (!cursos.length) throw new Error('Escolha ao menos um curso.');
  // ⚠️ O CPF e a senha do PRIMEIRO acesso, entao ele so e obrigatorio quando
  // o aluno precisa ser criado. Exigi-lo para quem ja existe na Zenler seria
  // burocracia sem funcao no fluxo de "acrescentar um curso a quem ja esta
  // la", que e o caminho mais comum depois da lista de alunos. Quem cobra e
  // o `portalAcharOuCriarAluno_`, que sabe se vai criar ou nao.

  // ⚠️ Trava: sem ela, dois cliques no botao criariam DOIS alunos com o mesmo
  // e-mail antes de qualquer um dos dois enxergar o outro, e a Zenler manda o
  // e-mail de boas-vindas em cada criacao.
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(25000)) {
    throw new Error('Outra liberação está em andamento. Tente de novo em alguns segundos.');
  }

  try {
    var usuario = portalAcharOuCriarAluno_(nome, email, cpf);

    var resultados = [];
    var mapaCursos = {};
    portalLerCursos_().forEach(function(c) { mapaCursos[c.id] = c.nome; });

    cursos.forEach(function(cursoId) {
      var r = portalMatricular_(usuario.id, cursoId);
      resultados.push({
        id: String(cursoId),
        nome: mapaCursos[String(cursoId)] || ('curso ' + cursoId),
        status: r.ok ? 'OK' : 'ERRO',
        detalhe: r.detalhe
      });
    });

    portalGravarLiberacao_({
      autor: autor || '',
      nome: nome,
      email: email,
      cpf: cpf,
      usuarioId: usuario.id,
      pacote: String((dados && dados.pacote) || ''),
      resultados: resultados
    });

    // O cache sabe o que acabou de mudar, entao nao ha por que varrer os 41
    // cursos de novo. ⚠️ Dentro de try/catch: o aluno JA foi matriculado, e
    // uma falha ao anotar isso na planilha nao pode virar erro na tela e
    // fazer alguem repetir a operacao.
    try {
      portalCacheAcrescentar_(email, nome, resultados
        .filter(function(r) { return r.status === 'OK'; })
        .map(function(r) { return r.id; }));
    } catch (e) {}

    return {
      alunoCriado: usuario.criado,
      zenlerUserId: usuario.id,
      senhaInicial: usuario.criado ? cpf : '',
      cursos: resultados,
      ok: resultados.filter(function(r) { return r.status === 'OK'; }).length,
      total: resultados.length
    };
  } finally {
    trava.releaseLock();
  }
}

/**
 * ⚠️ A busca da Zenler e PARCIAL: `search` casa pedaco de nome e de e-mail.
 * Matricular a pessoa errada por casar aproximado e o pior defeito possivel
 * aqui, entao a comparacao e exata, no nosso lado.
 */
function portalAcharOuCriarAluno_(nome, email, cpf) {
  var achado = portalBuscarPorEmail_(email);
  if (achado) return { id: achado.id, criado: false };

  if (String(cpf || '').length !== 11) {
    throw new Error('Este aluno ainda não existe na Zenler, e criar exige o CPF, que vira a senha do primeiro acesso.');
  }

  var partes = nome.split(/\s+/);
  var primeiro = partes.shift() || nome;
  var resto = partes.join(' ') || '.';

  var res = portalFetch_('post', '/users', {
    first_name: primeiro,
    last_name:  resto,
    email:      email,
    password:   cpf,
    commission: 0,
    roles:      [4]   // 4 = Student
  });

  if (res.status < 200 || res.status >= 300) {
    // O e-mail pode ter nascido entre a busca e a criacao, ou existir com
    // outro papel. Reconsultar antes de desistir evita erro em caso legitimo.
    var denovo = portalBuscarPorEmail_(email);
    if (denovo) return { id: denovo.id, criado: false };
    throw new Error('Não foi possível criar o aluno na Zenler: ' + portalMensagem_(res));
  }

  var corpo = res.corpo || {};
  var id = (corpo.data && corpo.data.id) || corpo.id || '';
  if (!id) throw new Error('A Zenler criou o aluno mas não devolveu o id.');
  return { id: String(id), criado: true };
}

function portalBuscarPorEmail_(email) {
  var r = newzenlerRequest_('/users', { search: email, role: 4, limit: 30, page: 1 });
  var itens = (r.data && r.data.items) ? r.data.items : [];
  var alvo = null;
  itens.forEach(function(u) {
    if (String(u.email || '').trim().toLowerCase() === email) alvo = u;
  });
  return alvo;
}

/**
 * ⚠️ A recusa por "ja matriculado" vem em HTTP 400 com `response_code: 200`
 * no corpo. Quem confiar no campo do corpo le recusa como sucesso, e quem
 * tratar todo 400 como falha vai pedir para refazer o que ja esta certo.
 */
function portalMatricular_(userId, cursoId) {
  var res = portalFetch_('post', '/users/' + userId + '/enroll', { course_id: Number(cursoId) });

  if (res.status >= 200 && res.status < 300) {
    return { ok: true, detalhe: 'matriculado' };
  }

  var texto = portalMensagem_(res);
  if (/already enrolled/i.test(texto)) {
    return { ok: true, detalhe: 'já estava matriculado' };
  }
  return { ok: false, detalhe: texto };
}

// ── Remocao de matricula ────────────────────────────────────

/**
 * Tira o aluno de UM curso na Zenler.
 *
 * ⚠️⚠️ A REGRA DO ENROLL NAO VALE AQUI. Medido em 2026-08-06: com um
 * `course_id` que nao existe, esta rota devolve **HTTP 200 com uma pagina
 * HTML de erro** ("Oops...Something went wrong!"), enquanto o `/enroll`, no
 * mesmo argumento ruim, devolve JSON limpo. Decidir pelo status HTTP, que e
 * a regra escrita para matricular, leria esse fracasso como sucesso e a tela
 * diria que o acesso foi tirado com o aluno ainda dentro do curso.
 * Por isso o sucesso exige corpo JSON com `message: "success"`.
 *
 * ⚠️ O caso nao e teorico: curso apagado na Zenler cai exatamente nele.
 */
function portalDesmatricular_(userId, cursoId) {
  var res = portalFetch_('post', '/users/' + userId + '/unenroll', { course_id: Number(cursoId) });

  var corpo = res.corpo;
  var ehObjeto = corpo && typeof corpo === 'object';

  if (res.status >= 200 && res.status < 300) {
    if (ehObjeto && String(corpo.message).toLowerCase() === 'success') {
      return { ok: true, detalhe: 'matrícula removida' };
    }
    // 200 que nao e JSON de sucesso: a Zenler engasgou e nada foi removido.
    return { ok: false, detalhe: 'A Zenler respondeu com uma página de erro. A matrícula não foi removida.' };
  }

  var texto = portalMensagem_(res);
  // O objetivo e o aluno NAO ter o acesso. Se ele ja nao tinha, o objetivo
  // esta cumprido, e tratar como falha faria a tela pedir para repetir algo
  // que ja esta certo. Mesma logica do "ja estava matriculado" no enroll.
  if (/not enrolled/i.test(texto)) {
    return { ok: true, detalhe: 'já não estava matriculado' };
  }
  return { ok: false, detalhe: texto };
}

/**
 * ⚠️ Desmatricular DESTROI o registro, nao o esconde: medido que a
 * `enrollment_date` reinicia ao rematricular, ou seja, o progresso do aluno
 * naquele curso vai junto e nao volta. Quem avisa a pessoa disso e a tela,
 * antes de confirmar.
 */
function removerMatriculaPortal(dados, autor) {
  var email = String((dados && dados.email) || '').trim().toLowerCase();
  var cursoId = String((dados && dados.cursoId) || '').trim();
  if (!email) throw new Error('E-mail do aluno é obrigatório.');
  if (!cursoId) throw new Error('Curso é obrigatório.');

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(25000)) {
    throw new Error('Outra operação está em andamento. Tente de novo em alguns segundos.');
  }

  try {
    // Busca exata, no nosso lado: o `search` da Zenler casa pedaco de e-mail,
    // e tirar o acesso da pessoa errada e o pior defeito possivel aqui.
    var usuario = portalBuscarPorEmail_(email);
    if (!usuario) throw new Error('Esse e-mail não existe na Zenler.');

    var mapaCursos = {};
    portalLerCursos_().forEach(function (c) { mapaCursos[c.id] = c.nome; });
    var nomeCurso = mapaCursos[cursoId] || ('curso ' + cursoId);

    var r = portalDesmatricular_(usuario.id, cursoId);

    if (r.ok) {
      try { portalCacheRemover_(email, cursoId); } catch (e) {}
    }

    portalGravarLiberacao_({
      autor: autor || '',
      nome: String((dados && dados.nome) || ''),
      email: email,
      cpf: '',
      usuarioId: usuario.id,
      pacote: 'REMOÇÃO',
      resultados: [{
        id: cursoId,
        nome: nomeCurso,
        status: r.ok ? 'REMOVIDO' : 'ERRO',
        detalhe: r.detalhe
      }]
    });

    if (!r.ok) throw new Error(r.detalhe);

    return { email: email, cursoId: cursoId, cursoNome: nomeCurso, detalhe: r.detalhe };
  } finally {
    trava.releaseLock();
  }
}

function portalMensagem_(res) {
  var c = res.corpo;
  if (c && typeof c === 'object') {
    return String(c.data || c.message || JSON.stringify(c)).slice(0, 300);
  }
  return String(c || ('HTTP ' + res.status)).slice(0, 300);
}

/**
 * ⚠️ `followRedirects: false`: um 302 seguido automaticamente converteria o
 * POST em GET e o corpo sumiria em silencio. Medido em 2026-08-06 que a Zenler
 * NAO redireciona, mas isto e barato e o modo de falha e invisivel.
 *
 * ⚠️ O recuo existe porque o `POST /users` devolveu 429 com `retry_after` ja
 * na PRIMEIRA chamada, apesar do limite anunciado de 1000 por minuto. O
 * `/enroll` nao estrangula, mas passa pelo mesmo caminho sem custo.
 */
function portalFetch_(metodo, caminho, payload) {
  var opcoes = {
    method: metodo,
    contentType: 'application/json',
    headers: {
      'X-API-Key':      newzenlerApiKey_(),
      'X-Account-Name': NEWZENLER_ACCOUNT,
      'Accept':         'application/json'
    },
    muteHttpExceptions: true,
    followRedirects: false
  };
  if (payload) opcoes.payload = JSON.stringify(payload);

  var res, status, texto;
  for (var t = 0; t < 4; t++) {
    res    = UrlFetchApp.fetch(NEWZENLER_BASE_URL + caminho, opcoes);
    status = res.getResponseCode();
    texto  = res.getContentText();
    if (status !== 429) break;
    var espera = 6000;
    try {
      var j = JSON.parse(texto);
      if (j && j.retry_after) espera = (Number(j.retry_after) + 2) * 1000;
    } catch (e) {}
    Utilities.sleep(espera);
  }

  var corpo;
  try { corpo = JSON.parse(texto); } catch (e) { corpo = String(texto).slice(0, 300); }
  return { status: status, corpo: corpo };
}

/**
 * Uma linha POR CURSO. E o que permite refazer so o que faltou e responder
 * "em que esse aluno foi matriculado, quando e por quem".
 *
 * ⚠️ CPF gravado como TEXTO, com o formato antes do valor: so digitos, o
 * Sheets le como numero e come o zero da frente. Mesma armadilha da coluna Q
 * da aba VENDAS.
 */
function portalGravarLiberacao_(reg) {
  var aba = portalAba_(PORTAL_SHEETS.LIBERACOES, PORTAL_LIBERACOES_HEADERS, true);
  var id = gerarId();
  var agora = new Date();

  var linhas = reg.resultados.map(function(r) {
    return [id, agora, reg.autor, reg.nome, reg.email, reg.cpf,
            reg.usuarioId, reg.pacote, r.id, r.nome, r.status, r.detalhe];
  });
  if (!linhas.length) return;

  var inicio = aba.getLastRow() + 1;
  aba.getRange(inicio, 1, linhas.length, PORTAL_LIBERACOES_HEADERS.length)
     .setNumberFormats(linhas.map(function() {
       return ['@', 'dd/mm/yyyy hh:mm', '@', '@', '@', '@', '@', '@', '@', '@', '@', '@'];
     }))
     .setValues(linhas);
}

// ── Guardas ─────────────────────────────────────────────────

/**
 * ⚠️ Esconder o item no menu nao impede ninguem de chamar a rota na mao, entao
 * e este guarda que vale de verdade. Mesmo padrao do exigirMarketing.
 */
function exigirPortalAlunoVer(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'portal_aluno.visualizar')) return usuario;
  throw new Error('Sem permissão para ver o Portal do Aluno.');
}

/**
 * Liberar acesso e permissao SEPARADA de ver, de proposito: criar aluno na
 * Zenler dispara o e-mail de boas-vindas, e e-mail enviado nao volta. Ver quem
 * ja tem acesso e consulta; liberar e uma acao com efeito fora do Hub.
 */
function exigirPortalAlunoLiberar(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'portal_aluno.liberar')) return usuario;
  throw new Error('Sem permissão para liberar acesso ao portal do aluno.');
}

/**
 * Remover e permissao SEPARADA de liberar, por decisao do Victor em
 * 2026-08-06: desmatricular apaga o progresso do aluno naquele curso, sem
 * volta. O consultor libera acesso; tirar acesso e do Gerente Comercial.
 */
function exigirPortalAlunoRemover(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'portal_aluno.remover')) return usuario;
  throw new Error('Sem permissão para remover matrícula do portal do aluno.');
}

/**
 * Confere se cada curso dos pacotes existe na planilha e esta ativo.
 *
 * ⚠️ Existe porque `newzenlerListarCursos` filtra `status: 1` (so publicados):
 * medido em 2026-08-06, a Zenler tem 54 cursos e so 41 publicados. Curso de
 * pacote que nao esteja publicado nao entra na planilha, e o pacote passaria a
 * liberar menos do que o nome dele promete. So le.
 */
function portalDiagnostico() {
  var cursos = portalLerCursos_();
  var porId = {};
  cursos.forEach(function(c) { porId[c.id] = c; });

  var fora = { totalNaPlanilha: cursos.length, pacotes: [] };
  portalLerPacotes_().forEach(function(p) {
    var faltando = [], inativos = [], ok = [];
    p.cursos.forEach(function(id) {
      var c = porId[id];
      if (!c) faltando.push(id);
      else if (!c.ativo) inativos.push(id + ' :: ' + c.nome);
      else ok.push(id + ' :: ' + c.nome);
    });
    fora.pacotes.push({
      pacote: p.nome, ok: ok, faltando: faltando, inativos: inativos,
      veredito: (faltando.length || inativos.length) ? 'PROBLEMA' : 'ok'
    });
  });
  return fora;
}

// ── Curadoria dos avulsos ───────────────────────────────────

/**
 * Lista dos cursos que podem ser liberados AVULSOS, definida pelo Victor em
 * 2026-08-06. Tudo que nao estiver aqui fica com ATIVO = NAO.
 *
 * ⚠️ Isto e a semente de uma DECISAO, nao a decisao em si: depois de aplicada,
 * quem manda e a coluna ATIVO da aba. Rodar `portalAplicarAvulsos` de novo
 * REESCREVE a curadoria inteira e desfaz o que tiver sido ajustado na planilha,
 * entao so rode ao redefinir a lista de proposito.
 */
var PORTAL_AVULSOS_OFICIAIS = [
  229580,  // Preparatório Azul Internos
  224126,  // Loja SAFE
  145022,  // Guia do Aluno
  184036,  // Ground School MC01
  172586,  // Ground School P-Mentor
  150339,  // Piloto Privado (Prático) - MC01
  198994,  // Piloto Comercial (Prático) - MC01
  175316,  // IFR (Prático)
  152001,  // INVA (Prático) - MC01
  170035,  // APT - Jeppesen
  170178   // APT - Performance Weight and Balance
];

/**
 * Marca ATIVO = SIM so nos cursos da lista oficial e NAO em todos os outros.
 * Devolve o que ligou, o que desligou e o que da lista nao foi encontrado.
 */
function portalAplicarAvulsos() {
  var aba = portalAba_(PORTAL_SHEETS.CURSOS, PORTAL_CURSOS_HEADERS, false);
  if (!aba) throw new Error('Aba PORTAL_CURSOS não existe. Rode portalInstalar() antes.');

  var dados = aba.getDataRange().getValues();
  var oficiais = {};
  PORTAL_AVULSOS_OFICIAIS.forEach(function(id) { oficiais[String(id)] = true; });

  var vistos = {}, ligados = [], desligados = [], valores = [];
  for (var i = 1; i < dados.length; i++) {
    var id = String(dados[i][0] || '').trim();
    var atualAtivo = String(dados[i][2] || '').toUpperCase() !== 'NAO';
    var deveFicar = !!oficiais[id];
    if (id) vistos[id] = true;

    if (id && deveFicar && !atualAtivo)      ligados.push(id + ' :: ' + dados[i][1]);
    if (id && !deveFicar && atualAtivo)      desligados.push(id + ' :: ' + dados[i][1]);

    valores.push([id && deveFicar ? 'SIM' : 'NAO']);
  }

  if (valores.length) aba.getRange(2, 3, valores.length, 1).setValues(valores);

  var naoAchados = PORTAL_AVULSOS_OFICIAIS
    .filter(function(id) { return !vistos[String(id)]; })
    .map(String);

  return {
    ativosAgora: PORTAL_AVULSOS_OFICIAIS.length - naoAchados.length,
    ligados: ligados,
    desligados: desligados,
    naoEncontrados: naoAchados
  };
}
