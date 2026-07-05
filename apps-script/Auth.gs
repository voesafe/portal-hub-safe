// ============================================================
// Auth.gs — Autenticação e gestão de usuários
// SAFE Escola de Aviação | SAFE Hub
// Login por e-mail (coluna D = row[3])
// ============================================================

var SAFE_AUTH_VERSION = '2026.07.04-session-policy';
var SAFE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
var SAFE_SESSION_EPOCH_KEY = 'SAFE_SESSION_EPOCH_MS';
var SAFE_SESSION_TIMEZONE = 'America/Sao_Paulo';

/**
 * Valida login por e-mail e retorna dados do usuário
 */
function login(email, senha) {
  try {
    garantirColunaUsuariosSuperadmin_();
    var sheet = getSheet(SHEETS.USUARIOS);
    var data = sheet.getDataRange().getValues();
    var idx = indiceCabecalho_(sheet);
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
          perfil: row[5],
          superadmin: idx.SUPERADMIN ? valorBooleano(row[idx.SUPERADMIN - 1]) : normalizarPerfil(row[5]) === 'master'
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
    superadmin: valorBooleano(usuario.superadmin),
    criadoEm: agora,
    expiraEm: agora + SAFE_SESSION_TTL_MS,
    diaLogin: dataLocalSessao_(agora),
    versaoAuth: SAFE_AUTH_VERSION
  };

  limparSessoesInvalidas_(props, agora);

  props.setProperty('SAFE_SESSION_' + token, JSON.stringify(sessao));

  return token;
}

function dataLocalSessao_(timestamp) {
  return Utilities.formatDate(
    new Date(Number(timestamp) || Date.now()),
    SAFE_SESSION_TIMEZONE,
    'yyyy-MM-dd'
  );
}

function obterEpochSessao_(props) {
  return Number(props.getProperty(SAFE_SESSION_EPOCH_KEY) || 0);
}

function sessaoInvalidaPorPolitica_(sessao, agora, props) {
  if (!sessao || !sessao.expiraEm || !sessao.criadoEm || !sessao.diaLogin || !sessao.versaoAuth) return true;
  if (Number(sessao.expiraEm) <= agora) return true;
  if (Number(sessao.criadoEm) < obterEpochSessao_(props)) return true;
  if (String(sessao.versaoAuth) !== SAFE_AUTH_VERSION) return true;
  if (String(sessao.diaLogin) !== dataLocalSessao_(agora)) return true;
  return false;
}

function limparSessoesInvalidas_(props, agora) {
  var propriedades = props.getProperties();
  Object.keys(propriedades).forEach(function(chave) {
    if (chave.indexOf('SAFE_SESSION_') !== 0) return;
    try {
      var anterior = JSON.parse(propriedades[chave]);
      if (sessaoInvalidaPorPolitica_(anterior, agora, props)) {
        props.deleteProperty(chave);
      }
    } catch (e) {
      props.deleteProperty(chave);
    }
  });
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

  var agora = Date.now();
  if (sessaoInvalidaPorPolitica_(sessao, agora, props)) {
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
  garantirColunaUsuariosSuperadmin_();
  var idx = indiceCabecalho_(sheet);
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
      superadmin: idx.SUPERADMIN ? valorBooleano(row[idx.SUPERADMIN - 1]) : normalizarPerfil(row[5]) === 'master',
      token: token
    };
  }

  return null;
}

function exigirSessao(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  return usuario;
}

function exigirAcessoFinanceiro(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (!usuarioEhSuperadmin(usuario) && !perfilPodeAcessarFinanceiro(usuario.perfil, usuario.email)) {
    throw new Error('Acesso financeiro não autorizado.');
  }
  return usuario;
}

function exigirEdicaoControleGastos(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (!usuarioEhSuperadmin(usuario) && !perfilPodeEditarControleGastos(usuario.perfil, usuario.email)) {
    throw new Error('Este acesso permite somente visualizar o Controle de Gastos.');
  }
  return usuario;
}

function validarAcaoPerfilExclusivo_(token, action) {
  if (!token) return;
  var props = PropertiesService.getScriptProperties();
  var chave = 'SAFE_SESSION_' + String(token);
  var raw = props.getProperty(chave);
  if (!raw) return;

  var sessao;
  try {
    sessao = JSON.parse(raw);
  } catch (e) {
    props.deleteProperty(chave);
    return;
  }
  if (sessaoInvalidaPorPolitica_(sessao, Date.now(), props)) {
    props.deleteProperty(chave);
    return;
  }

  var acoesPorPerfilExclusivo = {
    controle_gastos_visualizacao: ['controle-gastos', 'alterar-senha'],
    escala_minions: ['alterar-senha']
  };
  var perfil = normalizarPerfil(sessao.perfil);
  if (valorBooleano(sessao.superadmin)) return;
  var permitidas = acoesPorPerfilExclusivo[perfil];
  if (!permitidas) return;

  if (permitidas.indexOf(String(action || '')) === -1) {
    throw new Error('Este acesso é exclusivo e não permite esta ação no Hub.');
  }
}

function exigirGestaoUsuarios(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (!usuarioEhSuperadmin(usuario)) {
    throw new Error('A gestão central de usuários é exclusiva de superadmins.');
  }
  return usuario;
}

function exigirCadastroAlunos(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (!usuarioEhSuperadmin(usuario)) {
    throw new Error('O Cadastro de Aluno é exclusivo do Master TI.');
  }
  return usuario;
}

function exigirGestaoBases(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessao expirada. Entre novamente.');
  if (!usuarioEhSuperadmin(usuario) && !perfilEhAdminCompleto(usuario.perfil)) {
    throw new Error('A edicao das bases e restrita a administradores.');
  }
  return usuario;
}

function forcarLogoutGlobal(token) {
  exigirGestaoUsuarios(token);
  var props = PropertiesService.getScriptProperties();
  props.setProperty(SAFE_SESSION_EPOCH_KEY, String(Date.now()));

  Object.keys(props.getProperties()).forEach(function(chave) {
    if (chave.indexOf('SAFE_SESSION_') === 0) props.deleteProperty(chave);
  });

  return {
    mensagem: 'Todas as sessões ativas foram encerradas.'
  };
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
  garantirEstruturaControleAcesso_();
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var idx = indiceCabecalho_(sheet);
  var acessos = carregarAcessosUsuarios_();
  var usuarios = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var userId = String(row[0]);
    usuarios.push({
      id:       userId,
      nome:     row[1],
      pac:      row[2],
      email:    row[3],
      perfil:   row[5],
      ativo:    row[6],
      criadoEm: row[7],
      superadmin: idx.SUPERADMIN ? valorBooleano(row[idx.SUPERADMIN - 1]) : normalizarPerfil(row[5]) === 'master',
      grupos: acessos.gruposPorUsuario[userId] || [],
      permissoesAvulsas: acessos.permissoesPorUsuario[userId] || [],
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
  garantirEstruturaControleAcesso_();
  var sheet = getSheet(SHEETS.USUARIOS);
  var idx = indiceCabecalho_(sheet);
  dados.email = validarEmailUsuario_(dados.email);
  dados.pac = dados.pac || gerarIdentificadorHubUnico_(sheet, dados.email);
  validarSenhaUsuario_(dados.senha, true);
  validarUnicidadeUsuarioHub_(sheet, null, dados.pac, dados.email);
  dados.perfil = validarPerfilHub_(dados.perfil || 'pac');
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
  if (idx.SUPERADMIN) {
    sheet.getRange(sheet.getLastRow(), idx.SUPERADMIN).setValue(valorBooleano(dados.superadmin));
  }
  if (Array.isArray(dados.grupos) || Array.isArray(dados.permissoesAvulsas)) {
    salvarAcessosUsuario_(id, dados.grupos || [], dados.permissoesAvulsas || [], dados.atualizadoPor);
  }

  return { id: id, nome: dados.nome };
}

function criarUsuarioCentralizado(dados) {
  dados.email = validarEmailUsuario_(dados.email);
  validarUnicidadeEmailCentral_(null, dados.email);
  var resultado;
  if (String(dados.origem || 'hub').toLowerCase() === 'cco') {
    resultado = salvarUsuarioCco(dados);
  } else {
    resultado = criarUsuario(dados);
  }
  if (dados.enviarBoasVindas !== false) {
    try {
      enviarEmailBoasVindasUsuario_(dados, resultado);
      resultado.emailBoasVindasEnviado = true;
    } catch (e) {
      resultado.emailBoasVindasErro = e.message;
    }
  }
  return resultado;
}

function reenviarEmailBoasVindasUsuarioCentralizado(id, dados) {
  validarSenhaUsuario_(dados.senha, true);
  var atualizado = atualizarUsuarioCentralizado(id, dados);
  if (!atualizado) throw new Error('Usuário não encontrado.');

  enviarEmailBoasVindasUsuario_(dados, {
    id: id,
    nome: dados.nome,
    origem: dados.origem
  });

  return { emailBoasVindasEnviado: true };
}

function enviarEmailBoasVindasUsuario_(dados, resultado) {
  var email = validarEmailUsuario_(dados.email);
  var nome = String(dados.nome || resultado.nome || 'colaborador').trim();
  var primeiroNome = nome.split(/\s+/)[0] || 'olá';
  var senha = String(dados.senha || '').trim();
  if (!senha) throw new Error('senha temporária não informada.');

  var assunto = 'Bem-vindo ao SAFE Hub';
  var loginUrl = 'https://hub.voesafe.com.br/';
  var sistema = String(dados.origem || 'hub').toLowerCase() === 'cco'
    ? 'SAFE Hub e rotinas CCO'
    : 'SAFE Hub';
  var html = templateEmailBoasVindas_(primeiroNome, nome, email, senha, loginUrl, sistema);
  var texto = [
    'Olá, ' + primeiroNome + '!',
    '',
    'Seu acesso ao ' + sistema + ' foi criado.',
    'Acesse: ' + loginUrl,
    'E-mail: ' + email,
    'Senha temporária: ' + senha,
    '',
    'Após entrar, altere sua senha em Usuários > Alterar minha senha.',
    '',
    'SAFE Escola de Aviação'
  ].join('\n');

  MailApp.sendEmail({
    to: email,
    subject: assunto,
    body: texto,
    htmlBody: html,
    name: 'SAFE Hub'
  });
}

function templateEmailBoasVindas_(primeiroNome, nome, email, senha, loginUrl, sistema) {
  var escNome = escapeHtmlEmail_(nome);
  var escPrimeiroNome = escapeHtmlEmail_(primeiroNome);
  var escEmail = escapeHtmlEmail_(email);
  var escSenha = escapeHtmlEmail_(senha);
  var escSistema = escapeHtmlEmail_(sistema);
  return ''
    + '<div style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#19213f;">'
    + '  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f6fb;padding:32px 0;">'
    + '    <tr><td align="center" style="padding:32px 16px;">'
    + '      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe7f3;">'
    + '        <tr><td style="padding:28px 32px;background:#19213f;color:#ffffff;">'
    + '          <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8fd4ff;">SAFE Hub</div>'
    + '          <h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;color:#ffffff;">Bem-vindo, ' + escPrimeiroNome + '.</h1>'
    + '          <p style="margin:8px 0 0;color:#d9e4f2;font-size:15px;line-height:1.5;">Seu acesso ao ' + escSistema + ' foi criado com sucesso.</p>'
    + '        </td></tr>'
    + '        <tr><td style="padding:30px 32px;">'
    + '          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#44516f;">Olá, <strong>' + escNome + '</strong>. A partir de agora você pode acessar o ambiente operacional da SAFE usando as credenciais abaixo.</p>'
    + '          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 22px;background:#f7faff;border:1px solid #dfe7f3;border-radius:10px;">'
    + '            <tr><td style="padding:16px 18px;border-bottom:1px solid #dfe7f3;color:#7482a0;font-size:12px;font-weight:700;text-transform:uppercase;">E-mail de acesso</td></tr>'
    + '            <tr><td style="padding:0 18px 16px;color:#19213f;font-size:16px;font-weight:700;">' + escEmail + '</td></tr>'
    + '            <tr><td style="padding:16px 18px;border-top:1px solid #dfe7f3;border-bottom:1px solid #dfe7f3;color:#7482a0;font-size:12px;font-weight:700;text-transform:uppercase;">Senha temporária</td></tr>'
    + '            <tr><td style="padding:0 18px 18px;color:#19213f;font-size:18px;font-weight:800;letter-spacing:.04em;">' + escSenha + '</td></tr>'
    + '          </table>'
    + '          <div style="text-align:center;margin:24px 0 22px;">'
    + '            <a href="' + loginUrl + '" style="display:inline-block;padding:13px 22px;border-radius:9px;background:#2f9ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">Acessar SAFE Hub</a>'
    + '          </div>'
    + '          <div style="padding:16px 18px;border-radius:10px;background:#fff8e8;border:1px solid #f1d7a7;color:#6f5521;font-size:13px;line-height:1.55;">'
    + '            <strong>Recomendação de segurança:</strong> no primeiro acesso, vá em <strong>Usuários &gt; Alterar minha senha</strong> e substitua a senha temporária por uma senha pessoal.'
    + '          </div>'
    + '          <p style="margin:22px 0 0;color:#7482a0;font-size:13px;line-height:1.5;">Se você não esperava este acesso, avise o responsável administrativo da SAFE.</p>'
    + '        </td></tr>'
    + '        <tr><td style="padding:18px 32px;background:#f7faff;color:#7482a0;font-size:12px;line-height:1.5;">SAFE Escola de Aviação<br>Este é um e-mail automático do SAFE Hub.</td></tr>'
    + '      </table>'
    + '    </td></tr>'
    + '  </table>'
    + '</div>';
}

function escapeHtmlEmail_(valor) {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Atualiza usuário (só admin)
 */
function atualizarUsuario(id, dados) {
  garantirEstruturaControleAcesso_();
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var idx = indiceCabecalho_(sheet);
  dados.email = validarEmailUsuario_(dados.email);
  validarSenhaUsuario_(dados.senha, false);
  validarUnicidadeUsuarioHub_(sheet, id, dados.pac, dados.email);
  if (dados.perfil) dados.perfil = validarPerfilHub_(dados.perfil);

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var row = i + 1;
      if (dados.nome)   sheet.getRange(row, 2).setValue(dados.nome);
      if (dados.pac)    sheet.getRange(row, 3).setValue(dados.pac);
      if (dados.email)  sheet.getRange(row, 4).setValue(dados.email);
      if (dados.senha)  sheet.getRange(row, 5).setValue(hashSenha(dados.senha));
      if (dados.perfil) sheet.getRange(row, 6).setValue(dados.perfil);
      if (dados.hasOwnProperty('ativo')) sheet.getRange(row, 7).setValue(dados.ativo);
      if (dados.hasOwnProperty('superadmin') && idx.SUPERADMIN) {
        sheet.getRange(row, idx.SUPERADMIN).setValue(valorBooleano(dados.superadmin));
      }
      if (idx.ATUALIZADO_EM) sheet.getRange(row, idx.ATUALIZADO_EM).setValue(new Date());
      if (idx.ATUALIZADO_POR && dados.atualizadoPor) {
        sheet.getRange(row, idx.ATUALIZADO_POR).setValue(dados.atualizadoPor);
      }
      if (Array.isArray(dados.grupos) || Array.isArray(dados.permissoesAvulsas)) {
        salvarAcessosUsuario_(id, dados.grupos || [], dados.permissoesAvulsas || [], dados.atualizadoPor);
      }
      return true;
    }
  }
  return false;
}

function validarPerfilHub_(perfil) {
  var normalizado = normalizarPerfil(perfil || 'pac');
  var permitidos = [
    'pac', 'admin', 'master', 'admin_readonly',
    'admin_visualizacao', 'financeiro', 'controle_gastos_visualizacao',
    'escala_minions'
  ];
  if (permitidos.indexOf(normalizado) === -1) {
    throw new Error('Tipo de acesso inválido.');
  }
  return normalizado;
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

function alterarStatusUsuarioCentralizado(id, dados) {
  if (String(dados.origem || '').toLowerCase() === 'cco' ||
      String(id || '').indexOf('cco:') === 0) {
    return alterarStatusUsuarioCco_(id, dados.ativo);
  }
  return alterarStatusUsuarioHub_(id, dados.ativo, dados.atualizadoPor);
}

function alterarStatusUsuarioHub_(id, ativo, atualizadoPor) {
  garantirEstruturaControleAcesso_();
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var idx = indiceCabecalho_(sheet);

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var row = i + 1;
      sheet.getRange(row, 7).setValue(valorBooleano(ativo));
      if (idx.ATUALIZADO_EM) sheet.getRange(row, idx.ATUALIZADO_EM).setValue(new Date());
      if (idx.ATUALIZADO_POR && atualizadoPor) {
        sheet.getRange(row, idx.ATUALIZADO_POR).setValue(atualizadoPor);
      }
      return true;
    }
  }
  return false;
}

function alterarStatusUsuarioCco_(id, ativo) {
  var username = String(id || '').replace(/^cco:/, '').trim().toLowerCase();
  if (!username) return false;
  var resposta = requisitarCco_('toggleUserActive', {
    username: username,
    active: String(valorBooleano(ativo))
  });
  if (!resposta.ok && resposta.error) throw new Error(resposta.error);
  return true;
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
