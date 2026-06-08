// ============================================================
// Auth.gs — Autenticação e gestão de usuários
// SAFE Escola de Aviação | SAFE Hub
// Login por e-mail (coluna D = row[3])
// ============================================================

/**
 * Valida login por e-mail e retorna dados do usuário
 */
function login(email, senha) {
  try {
    var sheet = getSheet(SHEETS.USUARIOS);
    var data = sheet.getDataRange().getValues();
    var hash = hashSenha(senha);
    var identificador = String(email || '').trim().toLowerCase();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowEmail  = String(row[3]).trim().toLowerCase();
      var rowHash   = String(row[4]).trim();
      var rowAtivo  = row[6];

      if (rowEmail === identificador && rowHash === hash && valorBooleano(rowAtivo)) {
        var usuario = {
          id:     row[0],
          nome:   row[1],
          pac:    row[2],
          email:  row[3],
          perfil: row[5]
        };
        usuario.token = criarTokenSessao(usuario);
        return usuario;
      }
    }

    var usuarioCco = autenticarUsuarioCcoPorEmail(identificador, senha);
    if (!usuarioCco) return null;
    usuarioCco.token = criarTokenSessao(usuarioCco);
    return usuarioCco;
  } catch(e) {
    throw new Error('Erro no login: ' + e.message);
  }
}

/**
 * Cria uma sessão assinada no servidor para operações sensíveis.
 * A sessão expira em 12 horas e nunca confia no perfil enviado pelo navegador.
 */
function criarTokenSessao(usuario) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var agora = Date.now();
  var props = PropertiesService.getScriptProperties();
  var sessao = {
    id: String(usuario.id || ''),
    email: String(usuario.email || '').trim().toLowerCase(),
    pac: String(usuario.pac || ''),
    perfil: normalizarPerfil(usuario.perfil),
    criadoEm: agora,
    expiraEm: agora + (12 * 60 * 60 * 1000)
  };

  // Remove sessões vencidas para evitar crescimento indefinido das propriedades.
  var propriedades = props.getProperties();
  Object.keys(propriedades).forEach(function(chave) {
    if (chave.indexOf('SAFE_SESSION_') !== 0) return;
    try {
      var anterior = JSON.parse(propriedades[chave]);
      if (!anterior.expiraEm || Number(anterior.expiraEm) < agora) {
        props.deleteProperty(chave);
      }
    } catch (e) {
      props.deleteProperty(chave);
    }
  });

  props.setProperty('SAFE_SESSION_' + token, JSON.stringify(sessao));

  return token;
}

/**
 * Valida token, expiração e o usuário atual na aba USUARIOS.
 */
function validarTokenSessao(token) {
  if (!token) return null;

  var props = PropertiesService.getScriptProperties();
  var chave = 'SAFE_SESSION_' + String(token);
  var raw = props.getProperty(chave);
  if (!raw) return null;

  var sessao;
  try {
    sessao = JSON.parse(raw);
  } catch (e) {
    props.deleteProperty(chave);
    return null;
  }

  if (!sessao.expiraEm || Number(sessao.expiraEm) < Date.now()) {
    props.deleteProperty(chave);
    return null;
  }

  if (normalizarPerfil(sessao.perfil).indexOf('cco_') === 0) {
    var usuarioCco = buscarUsuarioCco(sessao.pac);
    if (!usuarioCco) return null;
    usuarioCco.token = token;
    return usuarioCco;
  }

  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var mesmoId = String(row[0]) === String(sessao.id);
    var mesmoEmail = String(row[3]).trim().toLowerCase() === String(sessao.email);
    if (!mesmoId && !mesmoEmail) continue;
    if (!valorBooleano(row[6])) return null;

    return {
      id: row[0],
      nome: row[1],
      pac: row[2],
      email: row[3],
      perfil: normalizarPerfil(row[5]),
      token: token
    };
  }

  return null;
}

function exigirAcessoFinanceiro(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (!perfilPodeAcessarFinanceiro(usuario.perfil, usuario.email)) {
    throw new Error('Acesso financeiro não autorizado.');
  }
  return usuario;
}

function exigirGestaoUsuarios(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (normalizarPerfil(usuario.perfil) !== 'master') {
    throw new Error('A gestão central de usuários é exclusiva do Master TI.');
  }
  return usuario;
}

/**
 * Lista usuários ativos para preencher seletor de PAC nos formulários
 */
function listarUsuariosLogin() {
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var usuarios = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] || !valorBooleano(row[6])) continue;
    usuarios.push({
      nome:   row[1],
      pac:    row[2],
      email:  row[3],
      perfil: row[5]
    });
  }

  usuarios.sort(function(a, b) {
    return String(a.nome || a.pac).localeCompare(String(b.nome || b.pac), 'pt-BR');
  });

  return usuarios;
}

/**
 * Lista todos os usuários (só admin)
 */
function listarUsuarios() {
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var usuarios = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    usuarios.push({
      id:       row[0],
      nome:     row[1],
      pac:      row[2],
      email:    row[3],
      perfil:   row[5],
      ativo:    row[6],
      criadoEm: row[7],
      origem:   'hub',
      modulo:   'Hub / Comercial'
    });
  }
  return usuarios;
}

function listarUsuariosCentralizados() {
  var usuarios = listarUsuarios();
  var aviso = '';

  try {
    usuarios = usuarios.concat(listarUsuariosCco());
  } catch (e) {
    aviso = 'Não foi possível consultar os usuários do CCO: ' + e.message;
  }

  usuarios.sort(function(a, b) {
    return String(a.nome || a.pac).localeCompare(String(b.nome || b.pac), 'pt-BR');
  });

  return { usuarios: usuarios, aviso: aviso };
}

/**
 * Cria novo usuário (só admin)
 */
function criarUsuario(dados) {
  var sheet = getSheet(SHEETS.USUARIOS);
  dados.email = validarEmailUsuario_(dados.email);
  dados.pac = dados.pac || gerarIdentificadorHubUnico_(sheet, dados.email);
  validarSenhaUsuario_(dados.senha, true);
  validarUnicidadeUsuarioHub_(sheet, null, dados.pac, dados.email);
  var senhaHash = hashSenha(dados.senha);
  var id = gerarId();

  sheet.appendRow([
    id,
    dados.nome,
    dados.pac,
    dados.email,
    senhaHash,
    dados.perfil || 'pac',
    dados.hasOwnProperty('ativo') ? valorBooleano(dados.ativo) : true,
    new Date()
  ]);

  return { id: id, nome: dados.nome };
}

function criarUsuarioCentralizado(dados) {
  dados.email = validarEmailUsuario_(dados.email);
  validarUnicidadeEmailCentral_(null, dados.email);
  if (String(dados.origem || 'hub').toLowerCase() === 'cco') {
    return salvarUsuarioCco(dados);
  }
  return criarUsuario(dados);
}

/**
 * Atualiza usuário (só admin)
 */
function atualizarUsuario(id, dados) {
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  dados.email = validarEmailUsuario_(dados.email);
  validarSenhaUsuario_(dados.senha, false);
  validarUnicidadeUsuarioHub_(sheet, id, dados.pac, dados.email);

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var row = i + 1;
      if (dados.nome)   sheet.getRange(row, 2).setValue(dados.nome);
      if (dados.pac)    sheet.getRange(row, 3).setValue(dados.pac);
      if (dados.email)  sheet.getRange(row, 4).setValue(dados.email);
      if (dados.senha)  sheet.getRange(row, 5).setValue(hashSenha(dados.senha));
      if (dados.perfil) sheet.getRange(row, 6).setValue(dados.perfil);
      if (dados.hasOwnProperty('ativo')) sheet.getRange(row, 7).setValue(dados.ativo);
      return true;
    }
  }
  return false;
}

function validarEmailUsuario_(email) {
  var normalizado = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) {
    throw new Error('Informe um e-mail válido para o acesso.');
  }
  return normalizado;
}

function validarSenhaUsuario_(senha, obrigatoria) {
  var valor = String(senha || '');
  if (!valor && !obrigatoria) return;
  if (valor.length < 8) {
    throw new Error('A senha deve ter pelo menos 8 caracteres.');
  }
}

function gerarIdentificadorHub_(email) {
  var base = String(email || '').trim().toLowerCase().split('@')[0];
  return base.replace(/[^a-z0-9._-]/g, '') || gerarId();
}

function gerarIdentificadorHubUnico_(sheet, email) {
  var base = gerarIdentificadorHub_(email);
  var candidato = base;
  var usados = {};
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    usados[String(data[i][2] || '').trim().toLowerCase()] = true;
  }

  var sufixo = 2;
  while (usados[candidato.toLowerCase()]) {
    candidato = base + sufixo;
    sufixo++;
  }
  return candidato;
}

function validarUnicidadeUsuarioHub_(sheet, idIgnorado, pac, email) {
  var data = sheet.getDataRange().getValues();
  var pacNormalizado = String(pac || '').trim().toLowerCase();
  var emailNormalizado = String(email || '').trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idIgnorado || '')) continue;

    var pacExistente = String(data[i][2] || '').trim().toLowerCase();
    var emailExistente = String(data[i][3] || '').trim().toLowerCase();
    if (pacNormalizado && pacExistente === pacNormalizado) {
      throw new Error('Este identificador de login já está cadastrado no Hub.');
    }
    if (emailNormalizado && emailExistente === emailNormalizado) {
      throw new Error('Este e-mail já está cadastrado no Hub.');
    }
  }
}

function atualizarUsuarioCentralizado(id, dados) {
  dados.email = validarEmailUsuario_(dados.email);
  validarUnicidadeEmailCentral_(id, dados.email);
  if (String(dados.origem || '').toLowerCase() === 'cco' ||
      String(id || '').indexOf('cco:') === 0) {
    dados.id = id;
    return salvarUsuarioCco(dados);
  }
  return atualizarUsuario(id, dados);
}

function validarUnicidadeEmailCentral_(idIgnorado, email) {
  var emailNormalizado = String(email || '').trim().toLowerCase();
  var usuarios = listarUsuarios();

  try {
    usuarios = usuarios.concat(listarUsuariosCco());
  } catch (e) {
    throw new Error('Não foi possível validar o e-mail no CCO. Tente novamente.');
  }

  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].id) === String(idIgnorado || '')) continue;
    if (String(usuarios[i].email || '').trim().toLowerCase() === emailNormalizado) {
      throw new Error('Este e-mail já pertence a outro acesso.');
    }
  }
}

/**
 * Altera senha do próprio usuário (busca por e-mail)
 */
function alterarSenha(email, senhaAtual, novaSenha) {
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var hashAtual = hashSenha(senhaAtual);
  var hashNova  = hashSenha(novaSenha);

  for (var i = 1; i < data.length; i++) {
    var rowEmail = String(data[i][3]).trim().toLowerCase();
    var rowHash  = String(data[i][4]).trim();

    if (rowEmail === String(email).trim().toLowerCase() && rowHash === hashAtual) {
      sheet.getRange(i + 1, 5).setValue(hashNova);
      return true;
    }
  }
  return false;
}

function alterarMinhaSenha(token, senhaAtual, novaSenha) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (normalizarPerfil(usuario.perfil).indexOf('cco_') === 0) {
    throw new Error('A senha de usuários CCO deve ser alterada pelo administrador no diretório central.');
  }
  return alterarSenha(usuario.email, senhaAtual, novaSenha);
}
