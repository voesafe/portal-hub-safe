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

// ── Progresso de um aluno em todos os cursos (fetchAll paralelo) ──
function newzenlerProgressoAluno(email) {
  var cursos  = newzenlerListarCursos();
  var headers = newzenlerHeaders_();

  var emailNorm = String(email).trim().toLowerCase();

  // Monta uma request por curso em paralelo
  // limit=50 para que, mesmo que email_is[] não filtre, o aluno esteja nos resultados
  var requests = cursos.map(function(curso) {
    var qs = 'course_id[]=' + encodeURIComponent(curso.id) +
             '&email_is[]=' + encodeURIComponent(email) +
             '&limit=50&page=1';
    return {
      url:              NEWZENLER_BASE_URL + '/reports/course-progress/detailed?' + qs,
      method:           'get',
      headers:          headers,
      muteHttpExceptions: true
    };
  });

  var responses = UrlFetchApp.fetchAll(requests);
  var resultado = [];

  responses.forEach(function(res, i) {
    if (res.getResponseCode() !== 200) return;
    try {
      var json  = JSON.parse(res.getContentText());
      if (!json.data || !json.data.items) return;
      var keys  = Object.keys(json.data.items);
      if (keys.length === 0) return;

      // Busca o aluno pelo email exato entre os resultados retornados
      var prog = null;
      for (var k = 0; k < keys.length; k++) {
        var item = json.data.items[keys[k]];
        if (String(item.email || '').trim().toLowerCase() === emailNorm) {
          prog = item;
          break;
        }
      }
      if (!prog) return; // aluno não está matriculado neste curso

      var curso = cursos[i];
      resultado.push({
        courseId:       curso.id,
        courseName:     curso.name,
        thumbnail:      curso.thumbnail || '',
        status:         prog.status               || 'Not Started',
        completion:     Number(prog.completion_percentage || 0),
        enrollmentDate: prog.enrollment_date      || '-',
        startDate:      prog.start_date           || '-',
        lastAttended:   prog.last_attended        || '-',
        completedDate:  prog.completed_date       || '-'
      });
    } catch(e) {}
  });

  // Ordena: Em andamento → Não iniciado → Concluído
  var ordem = { 'In Progress': 0, 'Not Started': 1, 'Completed': 2 };
  resultado.sort(function(a, b) {
    return (ordem[a.status] !== undefined ? ordem[a.status] : 1) -
           (ordem[b.status] !== undefined ? ordem[b.status] : 1);
  });

  return resultado;
}
