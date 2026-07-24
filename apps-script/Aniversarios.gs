// ============================================================
// Aniversarios.gs — E-mail de aniversário do aluno
// SAFE Escola de Aviação | SAFE Hub
//
// Le a "Planilha Alunos" (mesma do Cadastro de Aluno / fila S141) e envia,
// uma vez por ano, um e-mail de parabens para quem faz aniversario no dia.
//
// PRINCIPIOS
//  - A data de nascimento e TEXTO dd/mm/aaaa de ponta a ponta. Nunca vira Date.
//    Comparar dia/mes como string elimina qualquer deslocamento de fuso — e um
//    dia de erro aqui significa parabenizar na data errada.
//  - Nunca envia retroativo: so casa com o dia de HOJE.
//  - Idempotente: a coluna ANIVERSARIO_ENVIADO_EM guarda o ano do ultimo envio.
//  - Uma falha de e-mail nunca derruba o lote (try/catch por aluno).
//  - O logo vai EMBUTIDO no e-mail (LogoAsset.gs), sem host externo.
//
// SETUP
//   1) aniversariosSelfTest('voce@voesafe.com')  -> ve o e-mail na sua caixa
//   2) aniversariosPrevia()                      -> quem receberia hoje (nao envia)
//   3) aniversariosInstalarTrigger()             -> LIGA o envio diario
//   4) aniversariosRemoverTrigger()              -> DESLIGA
//
// Enquanto o gatilho nao for instalado, NINGUEM recebe nada.
// ============================================================

var ANIVERSARIOS_TZ_FALLBACK = 'America/Sao_Paulo';
var ANIVERSARIOS_TRIGGER_HANDLER = 'aniversariosRotinaDiaria';
var ANIVERSARIOS_TRIGGER_HORA = 9;
var ANIVERSARIOS_REMETENTE = 'SAFE Escola de Aviação';
var ANIVERSARIOS_ASSUNTO = 'Feliz aniversário, {NOME}!';
var ANIVERSARIOS_LOGO_CID = 'logoSafe';

// URL /exec do deployment de producao. Usada para montar o link de
// descadastro. Sobrescrevivel por propriedade do script (util no clone/teste).
var ANIVERSARIOS_EXEC_URL_FALLBACK =
  'https://script.google.com/macros/s/AKfycbxpOGXgEJ5qBl46iy0JIoli9Ugl8O5-cS-iSxeeLEjsnnB0Pl50fGxSV3H2_DVNie6FsQ/exec';

// ============================================================
// DATA / FUSO
// ============================================================

function aniversariosTimeZone_() {
  try {
    return Session.getScriptTimeZone() || ANIVERSARIOS_TZ_FALLBACK;
  } catch (e) {
    return ANIVERSARIOS_TZ_FALLBACK;
  }
}

/** Hoje no fuso do script, ja formatado. */
function aniversariosHoje_() {
  var tz = aniversariosTimeZone_();
  var agora = new Date();
  return {
    diaMes: Utilities.formatDate(agora, tz, 'dd/MM'),
    ano: Utilities.formatDate(agora, tz, 'yyyy'),
    dia: Utilities.formatDate(agora, tz, 'dd'),
    mes: Utilities.formatDate(agora, tz, 'MM')
  };
}

function aniversariosAnoBissexto_(ano) {
  var a = Number(ano);
  return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
}

/**
 * Dias que contam como "hoje" para efeito de aniversario.
 *
 * Regra do 29/02: em ano nao bissexto, quem nasceu em 29/02 recebe em 28/02.
 * Em ano bissexto o 29/02 existe e cai no proprio dia.
 */
function aniversariosDiasAlvo_(hoje) {
  var alvos = [hoje.diaMes];
  if (hoje.diaMes === '28/02' && !aniversariosAnoBissexto_(hoje.ano)) {
    alvos.push('29/02');
  }
  return alvos;
}

// ============================================================
// SELECAO DE ALUNOS
// ============================================================

function aniversariosEmailValido_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim().toLowerCase());
}

function aniversariosPrimeiroNome_(nome) {
  var partes = String(nome || '').trim().split(/\s+/);
  if (!partes[0]) return 'aluno';
  var p = partes[0];
  // Nomes vem em caixa variada do CAVOK — normaliza para "Fulano".
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/**
 * Motivo pelo qual um aluno NAO recebe. Devolve '' quando ele e elegivel.
 * Centralizado aqui para a pagina do Hub e o envio usarem o mesmo criterio.
 */
function aniversariosMotivoInelegivel_(aluno, anoAtual) {
  if (aluno.situacao === 'Inativo') return 'inativo';
  if (aluno.semAniversario) return 'descadastrado';
  if (!aluno.nascimento) return 'sem_data';
  if (!aniversariosEmailValido_(aluno.email)) return 'sem_email';
  if (anoAtual && String(aluno.aniversarioEnviadoEm || '') === String(anoAtual)) return 'ja_enviado';
  return '';
}

/** Alunos que devem receber hoje. */
function aniversariosSelecionarDoDia_(contexto, hoje) {
  var alvos = aniversariosDiasAlvo_(hoje);
  var selecionados = [];

  contexto.linhas.forEach(function(item) {
    var aluno = linhaParaCadastroAluno_(item.row, item.rowNumber, contexto.indices);
    var dm = diaMesNascimentoCadastroAluno_(aluno.nascimento);
    if (!dm) return;
    if (alvos.indexOf(dm.dia + '/' + dm.mes) === -1) return;
    if (aniversariosMotivoInelegivel_(aluno, hoje.ano)) return;
    selecionados.push(aluno);
  });

  return selecionados;
}

// ============================================================
// ENVIO
// ============================================================

/** Handler do gatilho diario. Nao recebe parametro. */
function aniversariosRotinaDiaria() {
  var res = enviarAniversariosDoDia({});
  Logger.log(JSON.stringify(res));
  return res;
}

/**
 * Varre a planilha e envia os aniversarios de hoje.
 *
 * @param {Object} opcoes  { simular: true } apenas lista, sem enviar nada.
 */
function enviarAniversariosDoDia(opcoes) {
  opcoes = opcoes || {};
  var simular = !!opcoes.simular;
  var hoje = aniversariosHoje_();

  var lock = LockService.getScriptLock();
  // Sem lock, duas execucoes simultaneas (gatilho + clique manual) poderiam
  // enviar o mesmo e-mail duas vezes antes de qualquer uma marcar a planilha.
  if (!lock.tryLock(30000)) {
    return { ok: false, erro: 'Outra execução de aniversários está em andamento.' };
  }

  try {
    var contexto = carregarContextoCadastroAlunos_();
    var selecionados = aniversariosSelecionarDoDia_(contexto, hoje);

    var resultado = {
      data: hoje.diaMes,
      ano: hoje.ano,
      simulacao: simular,
      elegiveis: selecionados.length,
      enviados: 0,
      falhas: 0,
      alunos: [],
      erros: []
    };

    if (!selecionados.length) return resultado;

    var quota = 0;
    try {
      quota = MailApp.getRemainingDailyQuota();
    } catch (e) {
      quota = selecionados.length;
    }
    resultado.quotaRestante = quota;

    selecionados.forEach(function(aluno) {
      if (simular) {
        resultado.alunos.push({ nome: aluno.nome, email: aluno.email, rowNumber: aluno.rowNumber });
        return;
      }
      if (quota <= 0) {
        resultado.falhas++;
        resultado.erros.push(aluno.nome + ': cota diária de e-mails esgotada.');
        return;
      }
      try {
        enviarEmailAniversario_(aluno, hoje.ano);
        marcarAniversarioEnviado_(contexto.sheet, aluno.rowNumber, contexto.indices, hoje.ano);
        quota--;
        resultado.enviados++;
        resultado.alunos.push({ nome: aluno.nome, email: aluno.email, rowNumber: aluno.rowNumber });
      } catch (err) {
        // Uma falha isolada nunca derruba o lote.
        resultado.falhas++;
        resultado.erros.push(aluno.nome + ': ' + (err && err.message ? err.message : err));
      }
    });

    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function enviarEmailAniversario_(aluno, ano) {
  var email = String(aluno.email || '').trim();
  if (!aniversariosEmailValido_(email)) throw new Error('E-mail inválido.');

  var primeiroNome = aniversariosPrimeiroNome_(aluno.nome);
  var link = linkDescadastroAniversario_(aluno.cpf);
  var assunto = ANIVERSARIOS_ASSUNTO.replace('{NOME}', primeiroNome);

  var payload = {
    to: email,
    subject: assunto,
    name: ANIVERSARIOS_REMETENTE,
    htmlBody: templateEmailAniversario_(primeiroNome, link, ano),
    body: textoEmailAniversario_(primeiroNome, link)
  };

  // Logo embutido no proprio MIME: sem host externo e sem bloqueio de imagem
  // remota. Se o asset falhar, manda mesmo assim — o alt estilizado cobre.
  try {
    payload.inlineImages = {};
    payload.inlineImages[ANIVERSARIOS_LOGO_CID] = safeLogoBlob_();
  } catch (e) {
    delete payload.inlineImages;
  }

  MailApp.sendEmail(payload);
}

function marcarAniversarioEnviado_(sheet, rowNumber, indices, ano) {
  setCadastroAlunoValor_(sheet, rowNumber, indices, 'aniversarioEnviadoEm', String(ano));
}

// ============================================================
// TEMPLATE DO E-MAIL
// ============================================================

function templateEmailAniversario_(primeiroNome, linkDescadastro, ano) {
  var nome = escapeHtmlEmail_(primeiroNome);
  var link = escapeHtmlEmail_(linkDescadastro);
  var anoTxt = escapeHtmlEmail_(ano || aniversariosHoje_().ano);

  return ''
    + '<!doctype html><html lang="pt-BR"><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="x-apple-disable-message-reformatting" content="">'
    + '<meta http-equiv="x-ua-compatible" content="ie=edge">'
    + '<title>Feliz aniversário, ' + nome + '!</title>'
    + '<style>'
    + 'html,body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;background-color:#eef2f7;}'
    + 'table,td{border-collapse:collapse!important;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;}'
    + 'table{border-spacing:0!important;}'
    + 'img{display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}'
    + 'a{text-decoration:none;}'
    + '*{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}'
    + '.preheader{display:none!important;visibility:hidden;opacity:0;overflow:hidden;width:0;height:0;color:transparent;mso-hide:all;}'
    + '@media screen and (max-width:640px){'
    + '.email-wrapper{padding:0!important;}'
    + '.email-container{width:100%!important;max-width:100%!important;border-radius:0!important;}'
    + '.mobile-padding{padding-right:24px!important;padding-left:24px!important;}'
    + '.header-padding{padding:28px 24px 24px!important;}'
    + '.hero-padding{padding-top:38px!important;padding-bottom:18px!important;}'
    + '.hero-title{font-size:34px!important;line-height:40px!important;letter-spacing:-0.7px!important;}'
    + '.body-text{font-size:16px!important;line-height:26px!important;}'
    + '.highlight-text{font-size:17px!important;line-height:27px!important;}'
    + '.logo{width:235px!important;max-width:235px!important;}'
    + '.footer-padding{padding:30px 24px 34px!important;}'
    + '}'
    + '@media (prefers-color-scheme:dark){'
    + 'body,.email-background{background-color:#eef2f7!important;}'
    + '.force-white{background-color:#ffffff!important;}'
    + '.force-navy{background-color:#16213f!important;}'
    + '.force-dark-text{color:#16213f!important;}'
    + '.force-body-text{color:#667085!important;}'
    + '.force-light-block{background-color:#f6f9fc!important;}'
    + '}'
    + '</style></head>'
    + '<body style="margin:0;padding:0;background-color:#eef2f7;">'

    + '<div class="preheader">Hoje é um dia especial. A SAFE deseja a você um novo ciclo cheio de conquistas e novos voos.</div>'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">'
    + '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>'

    + '<center role="article" aria-roledescription="email" lang="pt-BR" class="email-background" style="width:100%;background-color:#eef2f7;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr><td align="center" class="email-wrapper" style="padding:38px 14px;">'

    + '<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:620px;max-width:620px;overflow:hidden;background-color:#ffffff;border:1px solid #e4eaf1;border-radius:26px;box-shadow:0 18px 55px rgba(21,35,65,0.12);">'

    // Cabecalho — logo embutido. O style no <img> vira o visual do alt quando
    // o cliente suprime imagens: o topo nunca fica vazio.
    + '<tr><td align="center" class="force-navy header-padding" style="padding:34px 40px 30px;background-color:#16213f;">'
    + '<img src="cid:' + ANIVERSARIOS_LOGO_CID + '" width="310" alt="SAFE Escola de Aviação" class="logo"'
    + ' style="width:310px;max-width:310px;height:auto;margin:0 auto;display:block;border:0;'
    + 'color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:1px;">'
    + '</td></tr>'

    + '<tr><td style="height:7px;font-size:0;line-height:0;background-color:#5baee2;">&nbsp;</td></tr>'

    + '<tr><td class="force-white mobile-padding hero-padding" style="padding:48px 54px 20px;background-color:#ffffff;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'

    + '<tr><td align="center" style="padding-bottom:18px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td align="center" style="padding:8px 16px;background-color:#eef8fb;border:1px solid #d8eef5;border-radius:999px;color:#2878a9;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:16px;letter-spacing:1.3px;text-transform:uppercase;">Um dia especial para celebrar</td>'
    + '</tr></table></td></tr>'

    + '<tr><td align="center" class="hero-title force-dark-text" style="padding:0 0 18px;color:#16213f;font-family:Arial,Helvetica,sans-serif;font-size:43px;font-weight:700;line-height:49px;letter-spacing:-1.2px;">'
    + 'Feliz aniversário,<br>' + nome + '!</td></tr>'

    + '<tr><td align="center" style="padding-bottom:28px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="width:46px;height:4px;background-color:#5baee2;border-radius:4px 0 0 4px;font-size:0;line-height:0;">&nbsp;</td>'
    + '<td style="width:46px;height:4px;background-color:#60c0bf;border-radius:0 4px 4px 0;font-size:0;line-height:0;">&nbsp;</td>'
    + '</tr></table></td></tr>'

    + '<tr><td align="center" class="body-text force-body-text" style="padding:0 0 18px;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:29px;">'
    + 'Hoje celebramos mais um capítulo da sua história e desejamos que este novo ciclo seja repleto de realizações, aprendizados e momentos inesquecíveis.</td></tr>'

    + '<tr><td align="center" class="body-text force-body-text" style="padding:0 0 32px;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:29px;">'
    + 'Que você continue voando cada vez mais alto, conquistando novos horizontes e transformando seus sonhos em grandes jornadas.</td></tr>'

    + '<tr><td style="padding:0 0 34px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="force-light-block" style="overflow:hidden;background-color:#f6f9fc;border:1px solid #e3eaf2;border-radius:18px;"><tr>'
    + '<td width="7" style="width:7px;background-color:#60c0bf;font-size:0;line-height:0;">&nbsp;</td>'
    + '<td align="center" class="highlight-text force-dark-text" style="padding:25px 28px;color:#16213f;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:600;line-height:29px;">'
    + 'Que nunca faltem motivos para sonhar,<br>coragem para decolar e determinação para chegar ainda mais longe.</td>'
    + '</tr></table></td></tr>'

    + '<tr><td align="center" class="body-text force-body-text" style="padding:0 0 30px;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:27px;">'
    + 'É uma alegria ter você fazendo parte da nossa história e da família SAFE.</td></tr>'

    + '<tr><td align="center" class="force-dark-text" style="padding:2px 0 4px;color:#16213f;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;">'
    + 'Com carinho,<br><strong>Equipe SAFE Escola de Aviação</strong></td></tr>'

    + '</table></td></tr>'

    // Rodape
    + '<tr><td class="force-navy footer-padding" style="padding:30px 52px 34px;background-color:#16213f;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'

    + '<tr><td align="center" style="padding-bottom:14px;">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="width:32px;height:3px;background-color:#5baee2;font-size:0;line-height:0;">&nbsp;</td>'
    + '<td style="width:32px;height:3px;background-color:#60c0bf;font-size:0;line-height:0;">&nbsp;</td>'
    + '</tr></table></td></tr>'

    + '<tr><td align="center" style="color:#d5dbea;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;">'
    + 'Esta é uma mensagem automática enviada pela SAFE em comemoração ao seu aniversário.</td></tr>'

    + '<tr><td align="center" style="padding-top:10px;color:#99a5bf;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;">'
    + 'Não deseja mais receber mensagens de aniversário?<br>'
    + '<a href="' + link + '" style="color:#8fc9ea;text-decoration:underline;">Cancelar o recebimento</a>.</td></tr>'

    + '<tr><td align="center" style="padding-top:12px;color:#99a5bf;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;">'
    + '© ' + anoTxt + ' SAFE Escola de Aviação.<br>Todos os direitos reservados.</td></tr>'

    + '</table></td></tr>'

    + '</table>'
    + '</td></tr></table></center></body></html>';
}

function textoEmailAniversario_(primeiroNome, linkDescadastro) {
  return [
    'Feliz aniversário, ' + primeiroNome + '!',
    'Mais um capítulo da sua história.',
    '',
    'Hoje celebramos mais um capítulo da sua história e desejamos que este novo',
    'ciclo seja repleto de realizações, aprendizados e momentos inesquecíveis.',
    '',
    'Que você continue voando cada vez mais alto, conquistando novos horizontes',
    'e transformando seus sonhos em grandes jornadas.',
    '',
    'Que nunca faltem motivos para sonhar, coragem para decolar e determinação',
    'para chegar ainda mais longe.',
    '',
    'É uma alegria ter você fazendo parte da nossa história e da família SAFE.',
    '',
    'Com carinho,',
    'Equipe SAFE Escola de Aviação',
    '',
    '---',
    'Esta é uma mensagem automática enviada em comemoração ao seu aniversário.',
    'Para não receber mais mensagens de aniversário, acesse:',
    linkDescadastro
  ].join('\n');
}

// ============================================================
// DESCADASTRO (opt-out)
// ============================================================

/**
 * Segredo do HMAC do link de descadastro. Criado sozinho no primeiro uso —
 * nao ha passo manual de configuracao.
 */
function aniversariosSegredo_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('ANIVERSARIOS_SECRET');
  if (!s) {
    s = Utilities.getUuid() + '-' + Utilities.getUuid();
    props.setProperty('ANIVERSARIOS_SECRET', s);
  }
  return s;
}

/**
 * Token opaco do aluno. E um HMAC do CPF — o CPF nunca vai na URL e o token
 * nao pode ser forjado para descadastrar outra pessoa.
 */
function tokenDescadastroAniversario_(cpf) {
  var bytes = Utilities.computeHmacSha256Signature(String(cpf || ''), aniversariosSegredo_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function aniversariosExecUrl_() {
  return PropertiesService.getScriptProperties().getProperty('ANIVERSARIOS_EXEC_URL') ||
    ANIVERSARIOS_EXEC_URL_FALLBACK;
}

function linkDescadastroAniversario_(cpf) {
  return aniversariosExecUrl_() +
    '?action=aniversario-descadastro&t=' + encodeURIComponent(tokenDescadastroAniversario_(cpf));
}

/**
 * Processa o clique no link. Sem login: quem recebeu o e-mail ja provou ter
 * acesso a caixa, e exigir senha aqui empurra a pessoa para o botao de spam.
 * Devolve HTML (nao JSON) — e uma pagina de verdade, aberta no navegador.
 */
function processarDescadastroAniversario(tokenAluno) {
  var token = String(tokenAluno || '').trim();
  if (!token) {
    return paginaDescadastroAniversario_(false, 'Link inválido',
      'Esse link de cancelamento não é válido. Se você continuar recebendo mensagens, responda a este e-mail.');
  }

  try {
    var contexto = carregarContextoCadastroAlunos_();
    var alvo = null;

    for (var i = 0; i < contexto.linhas.length; i++) {
      var item = contexto.linhas[i];
      var aluno = linhaParaCadastroAluno_(item.row, item.rowNumber, contexto.indices);
      if (!aluno.cpf) continue;
      if (tokenDescadastroAniversario_(aluno.cpf) === token) {
        alvo = aluno;
        break;
      }
    }

    if (!alvo) {
      return paginaDescadastroAniversario_(false, 'Link inválido',
        'Não encontramos esse cadastro. Se você continuar recebendo mensagens, responda a este e-mail.');
    }

    if (!contexto.indices.semAniversario) {
      return paginaDescadastroAniversario_(false, 'Não foi possível concluir',
        'Houve um problema ao registrar o cancelamento. Responda a este e-mail que resolvemos para você.');
    }

    setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'semAniversario', true);

    return paginaDescadastroAniversario_(true, 'Tudo certo',
      'Você não vai mais receber mensagens de aniversário da SAFE. ' +
      'Os e-mails sobre seu acesso e sua rotina de aluno continuam normalmente.');

  } catch (e) {
    return paginaDescadastroAniversario_(false, 'Não foi possível concluir',
      'Houve um problema ao registrar o cancelamento. Responda a este e-mail que resolvemos para você.');
  }
}

function paginaDescadastroAniversario_(ok, titulo, mensagem) {
  var cor = ok ? '#2f7d63' : '#b4522c';
  var html = ''
    + '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + escapeHtmlEmail_(titulo) + ' — SAFE</title></head>'
    + '<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
    + '<tr><td align="center" style="padding:60px 16px;">'
    + '<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:100%;background:#ffffff;border:1px solid #e4eaf1;border-radius:20px;overflow:hidden;">'
    + '<tr><td align="center" style="padding:30px 32px;background:#16213f;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:1px;">SAFE Escola de Aviação</td></tr>'
    + '<tr><td style="height:6px;font-size:0;line-height:0;background:#5baee2;">&nbsp;</td></tr>'
    + '<tr><td align="center" style="padding:38px 34px 34px;">'
    + '<div style="color:' + cor + ';font-size:22px;font-weight:700;margin-bottom:14px;">' + escapeHtmlEmail_(titulo) + '</div>'
    + '<div style="color:#667085;font-size:16px;line-height:27px;">' + escapeHtmlEmail_(mensagem) + '</div>'
    + '</td></tr></table></td></tr></table></body></html>';

  return HtmlService.createHtmlOutput(html)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle(titulo + ' — SAFE');
}

// ============================================================
// LEITURA PARA A PAGINA DO HUB
// ============================================================

/**
 * Painel de aniversarios: hoje, proximos dias, mes atual e cobertura da base.
 */
function listarAniversarios(usuario, mesSolicitado) {
  var hoje = aniversariosHoje_();
  var contexto = carregarContextoCadastroAlunos_();
  var mesAlvo = mesSolicitado ? padZeroCadastroAluno_(mesSolicitado) : hoje.mes;

  var proximos = aniversariosProximosDiaMes_(7);
  var indiceProximos = {};
  proximos.forEach(function(p, i) { if (i > 0) indiceProximos[p] = i; });

  // Calculado uma vez, fora do laco — sao milhares de linhas.
  var diasAlvo = aniversariosDiasAlvo_(hoje);

  var resumo = {
    total: 0, ativos: 0, comData: 0, semData: 0,
    descadastrados: 0, semEmail: 0, enviadosNoAno: 0
  };
  var listaHoje = [], listaProximos = [], listaMes = [];

  contexto.linhas.forEach(function(item) {
    var aluno = linhaParaCadastroAluno_(item.row, item.rowNumber, contexto.indices);
    if (!aluno.nome && !aluno.cpf) return;

    resumo.total++;
    var ativo = aluno.situacao !== 'Inativo';
    if (ativo) resumo.ativos++;
    if (aluno.semAniversario) resumo.descadastrados++;
    if (String(aluno.aniversarioEnviadoEm || '') === hoje.ano) resumo.enviadosNoAno++;

    var dm = diaMesNascimentoCadastroAluno_(aluno.nascimento);
    if (!dm) {
      if (ativo) resumo.semData++;
      return;
    }
    if (ativo) {
      resumo.comData++;
      if (!aniversariosEmailValido_(aluno.email)) resumo.semEmail++;
    }

    var diaMes = dm.dia + '/' + dm.mes;
    var registro = {
      id: aluno.id,
      rowNumber: aluno.rowNumber,
      nome: aluno.nome,
      email: aluno.email,
      curso: aluno.curso,
      cursoOperacional: aluno.cursoOperacional,
      base: aluno.base,
      situacao: aluno.situacao,
      nascimento: aluno.nascimento,
      diaMes: diaMes,
      dia: dm.dia,
      mes: dm.mes,
      idade: aniversariosIdadeQueFaz_(aluno.nascimento, hoje.ano),
      semAniversario: aluno.semAniversario,
      aniversarioEnviadoEm: aluno.aniversarioEnviadoEm,
      motivo: aniversariosMotivoInelegivel_(aluno, hoje.ano)
    };

    if (diasAlvo.indexOf(diaMes) !== -1) {
      registro.enviadoHoje = String(aluno.aniversarioEnviadoEm || '') === hoje.ano;
      listaHoje.push(registro);
    } else if (indiceProximos[diaMes] !== undefined) {
      registro.emDias = indiceProximos[diaMes];
      listaProximos.push(registro);
    }

    if (dm.mes === mesAlvo) listaMes.push(registro);
  });

  var porDia = function(a, b) { return Number(a.dia) - Number(b.dia); };
  listaMes.sort(porDia);
  listaProximos.sort(function(a, b) { return a.emDias - b.emDias; });
  listaHoje.sort(function(a, b) { return String(a.nome).localeCompare(String(b.nome)); });

  resumo.coberturaPct = resumo.ativos
    ? Math.round((resumo.comData / resumo.ativos) * 100)
    : 0;

  return {
    hoje: listaHoje,
    proximos: listaProximos,
    mes: listaMes,
    mesAlvo: mesAlvo,
    resumo: resumo,
    hojeLabel: hoje.diaMes,
    ano: hoje.ano,
    gatilhoAtivo: aniversariosTriggerAtivo_(),
    usuario: String(usuario && (usuario.email || usuario.nome) || '')
  };
}

function aniversariosProximosDiaMes_(qtd) {
  var tz = aniversariosTimeZone_();
  var base = new Date();
  base.setHours(12, 0, 0, 0); // meio-dia evita qualquer borda de horario
  var lista = [];
  for (var i = 0; i <= qtd; i++) {
    var d = new Date(base.getTime() + i * 86400000);
    lista.push(Utilities.formatDate(d, tz, 'dd/MM'));
  }
  return lista;
}

/** Idade que o aluno completa no ano informado. '' se nao der para calcular. */
function aniversariosIdadeQueFaz_(nascimento, ano) {
  var m = String(nascimento || '').match(/^\d{2}\/\d{2}\/(\d{4})$/);
  if (!m) return '';
  var idade = Number(ano) - Number(m[1]);
  return (idade > 0 && idade < 130) ? idade : '';
}

/**
 * Reenvio manual de um aniversario (botao da pagina). Ignora a marca de "ja
 * enviado" de proposito — e uma acao consciente de quem esta olhando a tela.
 */
function reenviarAniversario(id, usuario) {
  var contexto = carregarContextoCadastroAlunos_();
  var alvo = buscarLinhaCadastroAluno_(contexto, id);
  if (!alvo) throw new Error('Aluno não encontrado.');

  var aluno = linhaParaCadastroAluno_(alvo.row, alvo.rowNumber, contexto.indices);
  var hoje = aniversariosHoje_();

  if (aluno.semAniversario) throw new Error('Este aluno cancelou o recebimento de mensagens de aniversário.');
  if (!aniversariosEmailValido_(aluno.email)) throw new Error('Aluno sem e-mail válido cadastrado.');

  enviarEmailAniversario_(aluno, hoje.ano);
  marcarAniversarioEnviado_(contexto.sheet, aluno.rowNumber, contexto.indices, hoje.ano);

  return listarAniversarios(usuario);
}

// ============================================================
// GATILHO
// ============================================================

function aniversariosTriggerAtivo_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === ANIVERSARIOS_TRIGGER_HANDLER) return true;
    }
  } catch (e) {}
  return false;
}

/** LIGA o envio diario. Ate rodar isto, ninguem recebe nada. */
function aniversariosInstalarTrigger() {
  aniversariosRemoverTrigger();
  ScriptApp.newTrigger(ANIVERSARIOS_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(ANIVERSARIOS_TRIGGER_HORA)
    .create();
  return 'Gatilho diário instalado (~' + ANIVERSARIOS_TRIGGER_HORA + 'h).';
}

/** DESLIGA o envio diario. */
function aniversariosRemoverTrigger() {
  var removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === ANIVERSARIOS_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  });
  return 'Gatilhos removidos: ' + removidos;
}

// ============================================================
// TESTES (rodar no editor do Apps Script)
// ============================================================

/**
 * Manda o e-mail de aniversario SO para o endereco informado, com dados de
 * exemplo. Nao toca na planilha e nao marca ninguem como enviado.
 *
 * O botao "Executar" do editor NAO passa argumento, e Session.getActiveUser()
 * exigiria o escopo userinfo.email (fora da lista do appsscript.json). Por isso
 * o destino sai da propriedade de script ANIVERSARIOS_TEST_EMAIL quando a
 * funcao e chamada sem parametro.
 */
function aniversariosSelfTest(emailDestino) {
  var destino = String(
    emailDestino ||
    PropertiesService.getScriptProperties().getProperty('ANIVERSARIOS_TEST_EMAIL') ||
    ''
  ).trim();

  if (!aniversariosEmailValido_(destino)) {
    throw new Error(
      'Defina para onde mandar o teste: Configurações do projeto → Propriedades do script → ' +
      'ANIVERSARIOS_TEST_EMAIL = seu@email.com  (ou chame aniversariosSelfTest("seu@email.com")).'
    );
  }

  enviarEmailAniversario_({
    nome: 'Mariana Costa',
    email: destino,
    cpf: '00000000000'
  }, aniversariosHoje_().ano);

  return 'E-mail de teste enviado para ' + destino + '. Nada foi gravado na planilha.';
}

/** Quem receberia hoje, SEM enviar nada. */
function aniversariosPrevia() {
  var res = enviarAniversariosDoDia({ simular: true });
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/** Diagnostico rapido: cobertura da base e estado do gatilho. */
function aniversariosDiagnostico() {
  var res = listarAniversarios({ email: 'diagnostico' });
  var out = {
    hoje: res.hojeLabel,
    aniversariantesHoje: res.hoje.length,
    proximos7dias: res.proximos.length,
    resumo: res.resumo,
    gatilhoAtivo: res.gatilhoAtivo,
    cotaEmailRestante: MailApp.getRemainingDailyQuota(),
    planilha: obterCadastroAlunosSheetId_()
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// ============================================================
// GUARDA DE ACESSO
// ============================================================

/**
 * Superadmin/Master sempre passam. A permissao `aniversarios.visualizar` e
 * aditiva: hoje nenhum cargo padrao a tem, mas conceder no Controle de Acesso
 * passa a funcionar sem mexer em codigo.
 */
function exigirAniversarios(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'aniversarios.visualizar')) return usuario;
  throw new Error('Sem permissão para ver os aniversários.');
}
