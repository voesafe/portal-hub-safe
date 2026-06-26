// ============================================================
// Newzenler.gs — Integração com a API pública do Newzenler
// SAFE Hub
//
// SETUP: No Apps Script, acesse Projeto → Configurações → Propriedades do script
//        e adicione a propriedade NEWZENLER_API_KEY com a chave gerada em
//        portaldoaluno.voesafe.com.br → Site → Developers → API Key
// ============================================================

var NEWZENLER_ACCOUNT  = 'safe';
var NEWZENLER_BASE_URL = 'https://safe.newzenler.com/api/v1';

function newzenlerApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('NEWZENLER_API_KEY');
  if (!key) throw new Error('Chave da API Newzenler não configurada. Adicione NEWZENLER_API_KEY nas propriedades do script.');
  return key;
}

function newzenlerHeaders_() {
  return {
    'X-API-Key':      newzenlerApiKey_(),
    'X-Account-Name': NEWZENLER_ACCOUNT
  };
}

function newzenlerRequest_(path, params) {
  var url = NEWZENLER_BASE_URL + path;
  var parts = [];
  params = params || {};

  Object.keys(params).forEach(function(k) {
    var v = params[k];
    if (v === null || v === undefined || v === '') return;
    // não encoda a chave para preservar colchetes ex: name_like[]
    parts.push(k + '=' + encodeURIComponent(v));
  });

  if (parts.length) url += '?' + parts.join('&');

  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: newzenlerHeaders_(),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var json;
  try {
    json = JSON.parse(res.getContentText());
  } catch(e) {
    throw new Error('Resposta inválida da API Newzenler (HTTP ' + code + ')');
  }

  if (code !== 200) {
    throw new Error((json && json.message) || 'Erro na API Newzenler (HTTP ' + code + ')');
  }
  return json;
}

function newzenlerListarCursos() {
  var cursos = [];
  var page = 1;
  var totalPages;

  do {
    var r = newzenlerRequest_('/courses', { limit: 100, page: page, status: 1 });
    var items = (r.data && r.data.items) ? r.data.items : [];
    cursos = cursos.concat(items);
    totalPages = (r.data && r.data.pagination) ? Number(r.data.pagination.total_pages) : 1;
    page++;
  } while (page <= totalPages && page <= 10);

  return cursos.sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  });
}

function newzenlerProgressoDetalhado(params) {
  var p = {
    limit: params.limit || 50,
    page:  params.page  || 1
  };
  if (params.courseId)  p['course_id[]']  = params.courseId;
  if (params.nameLike)  { p['name_like[]']  = params.nameLike;  p['af_v'] = 1; }
  if (params.emailLike) { p['email_like[]'] = params.emailLike; p['af_v'] = 1; }

  var r = newzenlerRequest_('/reports/course-progress/detailed', p);

  var items = [];
  if (r.data && r.data.items) {
    var raw = r.data.items;
    Object.keys(raw).forEach(function(k) { items.push(raw[k]); });
  }

  return {
    items:      items,
    pagination: (r.data && r.data.pagination) ? r.data.pagination : {}
  };
}

// ── Busca alunos por nome ou e-mail ──────────────────────────
function newzenlerBuscarAlunos(query) {
  var r = newzenlerRequest_('/users', {
    search: query,
    role:   4,    // 4 = Student
    limit:  30,
    page:   1
  });

  var items = (r.data && r.data.items) ? r.data.items : [];

  return items.map(function(u) {
    return {
      id:         u.id,
      firstName:  u.first_name  || '',
      lastName:   u.last_name   || '',
      name:       ((u.first_name || '') + ' ' + (u.last_name || '')).trim(),
      email:      u.email       || '',
      phone:      u.phone       || ''
    };
  });
}

// ── Progresso de um aluno em todos os cursos ──────────────────
function newzenlerProgressoAluno(email) {
  var headers   = newzenlerHeaders_();
  var emailNorm = String(email).trim().toLowerCase();

  // === Tentativa 1: single-call com email_is[] sem course_id ===
  // af_v=1 ativa filtros avançados de usuário; se suportado, retorna
  // apenas as matrículas deste aluno em todos os cursos de uma vez.
  try {
    var qs1  = 'email_is[]=' + encodeURIComponent(email) + '&af_v=1&limit=100&page=1';
    var res1 = UrlFetchApp.fetch(
      NEWZENLER_BASE_URL + '/reports/course-progress/detailed?' + qs1,
      { method: 'get', headers: headers, muteHttpExceptions: true }
    );
    if (res1.getResponseCode() === 200) {
      var j1   = JSON.parse(res1.getContentText());
      var raw1 = (j1.data && j1.data.items) ? j1.data.items : {};
      var hits1 = Object.keys(raw1).filter(function(k) {
        return String(raw1[k].email || '').trim().toLowerCase() === emailNorm;
      });
      if (hits1.length > 0) {
        return _ordenarProgressoAluno_(hits1.map(function(k) {
          var p = raw1[k];
          return _montarItemProgresso_(p, p.course_id || '', p.course_name || p.course_title || '');
        }));
      }
    }
  } catch(e) {}

  // === Tentativa 2: paginação iterativa por curso ===
  // Busca página 1 de todos os cursos em paralelo.
  // Se a página veio cheia (LIMIT resultados) e o aluno não foi encontrado,
  // adiciona à fila da próxima iteração — evita requests desnecessários.
  var cursos  = newzenlerListarCursos();
  var LIMIT   = 100;
  var MAX_IT  = 8; // até 800 alunos por curso

  // pendente: lista de { ci (índice do curso), page }
  var pendente = cursos.map(function(_, ci) { return { ci: ci, page: 1 }; });
  var encontrados = {}; // ci -> objeto de progresso do aluno

  for (var it = 0; it < MAX_IT && pendente.length > 0; it++) {
    var reqs = pendente.map(function(p) {
      var qs = 'course_id[]=' + encodeURIComponent(cursos[p.ci].id) +
               '&limit=' + LIMIT + '&page=' + p.page;
      return { url: NEWZENLER_BASE_URL + '/reports/course-progress/detailed?' + qs,
               method: 'get', headers: headers, muteHttpExceptions: true };
    });

    var resps    = UrlFetchApp.fetchAll(reqs);
    var proxima  = [];

    resps.forEach(function(res, ri) {
      var meta = pendente[ri];
      if (res.getResponseCode() !== 200) return;
      try {
        var json  = JSON.parse(res.getContentText());
        var items = (json.data && json.data.items) ? json.data.items : {};
        var keys  = Object.keys(items);

        // Procura o email exato nesta página
        for (var k = 0; k < keys.length; k++) {
          var item = items[keys[k]];
          if (String(item.email || '').trim().toLowerCase() === emailNorm) {
            encontrados[meta.ci] = item;
            return; // achou — não precisa de mais páginas para este curso
          }
        }

        // Não achou — se a página veio cheia, pode haver mais alunos
        if (keys.length === LIMIT) {
          proxima.push({ ci: meta.ci, page: meta.page + 1 });
        }
      } catch(e) {}
    });

    pendente = proxima;
  }

  var resultado = [];
  Object.keys(encontrados).forEach(function(ci) {
    var prog  = encontrados[Number(ci)];
    var curso = cursos[Number(ci)];
    resultado.push(_montarItemProgresso_(prog, curso.id, curso.name, curso.thumbnail));
  });

  return _ordenarProgressoAluno_(resultado);
}

function _montarItemProgresso_(prog, courseId, courseName, thumbnail) {
  return {
    courseId:       courseId,
    courseName:     courseName,
    thumbnail:      thumbnail || '',
    status:         prog.status              || 'Not Started',
    completion:     Number(prog.completion_percentage || 0),
    enrollmentDate: prog.enrollment_date     || '-',
    startDate:      prog.start_date          || '-',
    lastAttended:   prog.last_attended       || '-',
    completedDate:  prog.completed_date      || '-'
  };
}

function _ordenarProgressoAluno_(lista) {
  var ordem = { 'In Progress': 0, 'Not Started': 1, 'Completed': 2 };
  return lista.sort(function(a, b) {
    return (ordem[a.status] !== undefined ? ordem[a.status] : 1) -
           (ordem[b.status] !== undefined ? ordem[b.status] : 1);
  });
}

// ── Diagnóstico para o suporte Newzenler ─────────────────────
// Captura o item CRU de progresso de um aluno num curso específico,
// para colar no ticket (eles pediram "sample student details / API
// response examples"). Mostra a request (chave redigida), o HTTP code
// e o objeto exato retornado — onde completion_percentage vem 0 mesmo
// com o Course Player exibindo outra %.
//
// Uso: editar EMAIL e COURSE_ID abaixo e rodar newzenlerDiagnosticoAluno().
// O resultado sai em Apps Script → Execuções → Logs (Logger.log).
function newzenlerDiagnosticoAluno() {
  var EMAIL     = 'aluno@exemplo.com';   // <-- e-mail do aluno "In Progress"
  var COURSE_ID = '';                    // <-- id do curso (newzenlerListarCursos)
  var LIMIT     = 100;
  var MAX_PAGES = 8;

  var emailNorm = String(EMAIL).trim().toLowerCase();
  var headers   = newzenlerHeaders_();
  var achado    = null;
  var reqUrlRedigida = '';

  for (var page = 1; page <= MAX_PAGES && !achado; page++) {
    var qs  = 'course_id[]=' + encodeURIComponent(COURSE_ID) +
              '&limit=' + LIMIT + '&page=' + page;
    var url = NEWZENLER_BASE_URL + '/reports/course-progress/detailed?' + qs;
    reqUrlRedigida = url;

    var res  = UrlFetchApp.fetch(url, { method: 'get', headers: headers, muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log('HTTP ' + code + ' — ' + res.getContentText());
      return;
    }

    var json  = JSON.parse(res.getContentText());
    var items = (json.data && json.data.items) ? json.data.items : {};
    var keys  = Object.keys(items);

    for (var k = 0; k < keys.length; k++) {
      if (String(items[keys[k]].email || '').trim().toLowerCase() === emailNorm) {
        achado = items[keys[k]];
        break;
      }
    }
    if (keys.length < LIMIT) break; // última página
  }

  Logger.log('=== DIAGNÓSTICO NEWZENLER (para suporte) ===');
  Logger.log('Request : GET ' + reqUrlRedigida);
  Logger.log('Headers : X-API-Key: <redigida>, X-Account-Name: ' + NEWZENLER_ACCOUNT);
  if (!achado) {
    Logger.log('Aluno NAO encontrado nas primeiras ' + (MAX_PAGES * LIMIT) + ' linhas do curso.');
    return;
  }
  Logger.log('Item cru do aluno:');
  Logger.log(JSON.stringify(achado, null, 2));
  Logger.log('--> completion_percentage retornado = ' + achado.completion_percentage +
             ' (status: ' + achado.status + ')');
}
