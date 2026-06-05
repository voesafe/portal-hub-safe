// ============================================================
// Auth.gs — Autenticação e gestão de usuários
// SAFE Escola de Aviação | Dashboard Comercial
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

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowEmail  = String(row[3]).trim().toLowerCase();
      var rowHash   = String(row[4]).trim();
      var rowAtivo  = row[6];

      if (rowEmail === email.trim().toLowerCase() && rowHash === hash && valorBooleano(rowAtivo)) {
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
    return null;
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
      criadoEm: row[7]
    });
  }
  return usuarios;
}

/**
 * Cria novo usuário (só admin)
 */
function criarUsuario(dados) {
  var sheet = getSheet(SHEETS.USUARIOS);
  var senhaHash = hashSenha(dados.senha || 'safe@2024');
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

/**
 * Atualiza usuário (só admin)
 */
function atualizarUsuario(id, dados) {
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();

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
