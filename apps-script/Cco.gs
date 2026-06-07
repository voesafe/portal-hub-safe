// ============================================================
// Cco.gs - Integração de autenticação com a Escala CCO
// ============================================================

var CCO_API_URL = 'https://script.google.com/macros/s/AKfycbxFyIE_VI_rRcuNnQgYU9l5JXcbbu18vVTfzTKieaVpnL61CvZeuhUJGmdTcozSqBG80g/exec';

function requisitarCco_(action, params) {
  var query = ['action=' + encodeURIComponent(action)];
  Object.keys(params || {}).forEach(function(chave) {
    query.push(encodeURIComponent(chave) + '=' + encodeURIComponent(params[chave]));
  });

  var resposta = UrlFetchApp.fetch(CCO_API_URL + '?' + query.join('&'), {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true
  });

  if (resposta.getResponseCode() < 200 || resposta.getResponseCode() >= 300) {
    throw new Error('Serviço da Escala CCO indisponível.');
  }

  return JSON.parse(resposta.getContentText());
}

function perfilHubCco_(role) {
  var papel = String(role || '').trim().toLowerCase();
  if (papel === 'admin') return 'cco_admin';
  if (papel === 'financeiro') return 'cco_financeiro';
  return 'cco_user';
}

function montarUsuarioHubCco_(username, dados) {
  if (!dados || dados.active === false) return null;

  return {
    id: 'cco:' + username,
    nome: dados.name || username,
    pac: username,
    email: dados.email || '',
    perfil: perfilHubCco_(dados.role)
  };
}

function buscarUsuarioCco(username) {
  var chave = String(username || '').trim().toLowerCase();
  if (!chave) return null;

  try {
    var resposta = requisitarCco_('getUsers', {});
    var usuarios = resposta.users || {};
    return montarUsuarioHubCco_(chave, usuarios[chave]);
  } catch (e) {
    return null;
  }
}

function autenticarUsuarioCco(username, senha) {
  var chave = String(username || '').trim().toLowerCase();
  if (!chave || !senha) return null;

  try {
    var login = requisitarCco_('login', {
      username: chave,
      password: senha
    });
    if (!login.ok) return null;
    return buscarUsuarioCco(chave);
  } catch (e) {
    return null;
  }
}
