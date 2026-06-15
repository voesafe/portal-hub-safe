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

function newzenlerRequest_(path, params) {
  var url = NEWZENLER_BASE_URL + path;
  var parts = [];
  params = params || {};

  Object.keys(params).forEach(function(k) {
    var v = params[k];
    if (v === null || v === undefined || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });

  if (parts.length) url += '?' + parts.join('&');

  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-API-Key':      newzenlerApiKey_(),
      'X-Account-Name': NEWZENLER_ACCOUNT
    },
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
  if (params.courseId)  p['course_id[]']   = params.courseId;
  if (params.nameLike)  p['name_like[]']   = params.nameLike;
  if (params.emailLike) p['email_like[]']  = params.emailLike;

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
