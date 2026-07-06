// ============================================================
// Cco.gs - Integração de autenticação com a Escala CCO
// ============================================================

var CCO_API_URL = 'https://script.google.com/macros/s/AKfycbyeoa-8Vv2lze3okfNxSA20hOtwOo0dvB_wIaWBJujG0XbxgrXOkswON4fPrEHdeBAa/exec';
var CCO_USERS_CACHE_KEY = 'CCO_USERS_CACHE_V1';
var CCO_USERS_CACHE_SECONDS = 300;

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

function buscarUsuarioCcoPorEmail(email) {
  var emailNormalizado = String(email || '').trim().toLowerCase();
  if (!emailNormalizado) return null;

  var usuarios = listarUsuariosCco();
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].email || '').trim().toLowerCase() === emailNormalizado) {
      return usuarios[i];
    }
  }
  return null;
}

function invalidarCacheUsuariosCco_() {
  try {
    CacheService.getScriptCache().remove(CCO_USERS_CACHE_KEY);
  } catch (e) {}
}

function listarUsuariosCco(usarCache) {
  usarCache = usarCache !== false;
  if (usarCache) {
    try {
      var cached = CacheService.getScriptCache().get(CCO_USERS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  }

  var resposta = requisitarCco_('getUsers', {});
  var usuarios = resposta.users || {};

  var lista = Object.keys(usuarios).map(function(username) {
    var dados = usuarios[username] || {};
    return {
      id: 'cco:' + username,
      nome: dados.name || username,
      pac: username,
      email: dados.email || '',
      perfil: perfilHubCco_(dados.role),
      ativo: dados.active !== false,
      origem: 'cco',
      modulo: 'Escala CCO',
      roleOrigem: dados.role || 'user',
      initials: dados.initials || '',
      cpf: dados.cpf || '',
      birthdate: dados.birthdate || '',
      phone: dados.phone || '',
      color: dados.color || '#5BAEE2',
      scheduleVisible: dados.scheduleVisible !== false,
      financeiroExclude: dados.financeiroExclude === true,
      ifoodExclude: dados.ifoodExclude === true
    };
  });

  try {
    CacheService.getScriptCache().put(CCO_USERS_CACHE_KEY, JSON.stringify(lista), CCO_USERS_CACHE_SECONDS);
  } catch (e) {}

  return lista;
}

function salvarUsuarioCco(dados) {
  dados.email = validarEmailUsuario_(dados.email);
  var identificadorInformado = dados.pac || dados.username;
  var username = String(
    identificadorInformado || gerarIdentificadorCco_(dados.email)
  ).trim().toLowerCase();
  if (!username) throw new Error('Usuário CCO obrigatório.');

  var existente = null;
  var todosUsuarios = listarUsuariosCco();
  if (dados.id) {
    for (var i = 0; i < todosUsuarios.length; i++) {
      if (todosUsuarios[i].id === dados.id) {
        existente = todosUsuarios[i];
        break;
      }
    }
  }

  var isNew = !existente;
  if (isNew && !identificadorInformado) {
    username = gerarIdentificadorCcoUnico_(todosUsuarios, dados.email);
  }
  validarSenhaUsuario_(dados.senha, isNew);
  if (isNew) {
    for (var j = 0; j < todosUsuarios.length; j++) {
      if (String(todosUsuarios[j].pac).toLowerCase() === username) {
        throw new Error('Este usuário já está cadastrado no CCO.');
      }
      if (dados.email && String(todosUsuarios[j].email).trim().toLowerCase() ===
          String(dados.email).trim().toLowerCase()) {
        throw new Error('Este e-mail já está cadastrado no CCO.');
      }
    }
  }

  var params = {
    isNew: isNew ? 'true' : 'false',
    username: username,
    name: dados.nome || (existente && existente.nome) || username,
    initials: dados.initials || (existente && existente.initials) || '',
    cpf: dados.cpf || (existente && existente.cpf) || '',
    birthdate: dados.birthdate || (existente && existente.birthdate) || '',
    phone: dados.phone || (existente && existente.phone) || '',
    email: dados.email || (existente && existente.email) || '',
    color: dados.color || (existente && existente.color) || '#5BAEE2',
    role: dados.roleOrigem || (existente && existente.roleOrigem) || 'user',
    scheduleVisible: String(dados.hasOwnProperty('scheduleVisible')
      ? valorBooleano(dados.scheduleVisible)
      : (!existente || existente.scheduleVisible)),
    financeiroExclude: String(dados.hasOwnProperty('financeiroExclude')
      ? valorBooleano(dados.financeiroExclude)
      : !!(existente && existente.financeiroExclude)),
    ifoodExclude: String(dados.hasOwnProperty('ifoodExclude')
      ? valorBooleano(dados.ifoodExclude)
      : !!(existente && existente.ifoodExclude)),
    active: String(dados.hasOwnProperty('ativo')
      ? valorBooleano(dados.ativo)
      : (!existente || existente.ativo))
  };

  if (dados.senha) params.password = dados.senha;

  var resposta = requisitarCco_('saveUser', params);
  if (!resposta.ok && resposta.error) throw new Error(resposta.error);
  invalidarCacheUsuariosCco_();

  if (!isNew && dados.hasOwnProperty('ativo') &&
      valorBooleano(dados.ativo) !== existente.ativo) {
    var status = requisitarCco_('toggleUserActive', {
      username: username,
      active: String(valorBooleano(dados.ativo))
    });
    if (!status.ok && status.error) throw new Error(status.error);
    invalidarCacheUsuariosCco_();
  }

  return { id: 'cco:' + username, nome: params.name, origem: 'cco' };
}

function gerarIdentificadorCco_(email) {
  var base = String(email || '').trim().toLowerCase().split('@')[0];
  return base.replace(/[^a-z0-9._-]/g, '');
}

function gerarIdentificadorCcoUnico_(usuarios, email) {
  var base = gerarIdentificadorCco_(email);
  var candidato = base;
  var usados = {};

  usuarios.forEach(function(usuario) {
    usados[String(usuario.pac || '').trim().toLowerCase()] = true;
  });

  var sufixo = 2;
  while (usados[candidato.toLowerCase()]) {
    candidato = base + sufixo;
    sufixo++;
  }
  return candidato;
}

function autenticarUsuarioCcoPorEmail(email, senha) {
  var usuario = buscarUsuarioCcoPorEmail(email);
  if (!usuario || !senha) return null;

  try {
    var login = requisitarCco_('login', {
      username: usuario.pac,
      password: senha
    });
    if (!login.ok) return null;
    return montarUsuarioHubCco_(usuario.pac, {
      name: usuario.nome,
      email: usuario.email,
      role: usuario.roleOrigem,
      active: usuario.ativo
    });
  } catch (e) {
    return null;
  }
}
