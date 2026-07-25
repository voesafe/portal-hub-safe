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
var ANIVERSARIOS_HERO_CID = 'heroSafe';
var ANIVERSARIOS_MARCA_CID = 'marcaSafe';

// Links do rodape. O do WhatsApp fica VAZIO ate ter o numero — vazio, o link
// nao e renderizado. Link quebrado num e-mail e pior que link ausente.
var ANIVERSARIOS_LINK_SITE = 'https://www.voesafe.com.br';
var ANIVERSARIOS_LINK_INSTAGRAM = 'https://www.instagram.com/voesafe/';
var ANIVERSARIOS_LINK_WHATSAPP = '';

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
 * Palavras que aparecem no campo NOME do CAVOK mas nao sao nome de pessoa —
 * marcador de status, cadastro de teste, sujeira. Encontradas na base real em
 * 2026-07-24: "INATIVO" (com Gmail de pessoa real!), "Aluno TESTE" e "teste2".
 */
var ANIVERSARIOS_NOMES_INVALIDOS = [
  'inativo', 'ativo', 'cancelado', 'desistente', 'trancado', 'suspenso',
  'bloqueado', 'duplicado', 'excluir', 'aluno', 'sem nome', 'nao usar',
  'xxx', 'zzz'
];

/**
 * Nome que NAO deve receber e-mail de aniversario.
 *
 * Mandar "Feliz aniversario, Inativo!" para uma pessoa real e o tipo de erro
 * que nao se desfaz. Confiar so na higiene do cadastro nao serve: isto roda
 * sozinho por anos. Compara o PRIMEIRO token (e o nome inteiro), nunca
 * substring, para nao pegar nome legitimo por acidente.
 */
function aniversariosNomeSuspeito_(nome) {
  var t = normalizarTextoCadastroAluno_(nome);
  if (!t || t.length < 2) return true;

  var primeiro = t.split(' ')[0];
  if (/^test(e)?\d*$/.test(primeiro)) return true;
  if (ANIVERSARIOS_NOMES_INVALIDOS.indexOf(primeiro) !== -1) return true;
  if (ANIVERSARIOS_NOMES_INVALIDOS.indexOf(t) !== -1) return true;

  return false;
}

/**
 * Motivo pelo qual um aluno NAO recebe. Devolve '' quando ele e elegivel.
 * Centralizado aqui para a pagina do Hub e o envio usarem o mesmo criterio.
 */
function aniversariosMotivoInelegivel_(aluno, anoAtual) {
  if (aluno.situacao === 'Inativo') return 'inativo';
  if (aluno.semAniversario) return 'descadastrado';
  if (aniversariosNomeSuspeito_(aluno.nome)) return 'nome_invalido';
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

    // Registra mesmo em dia sem aniversariante: é o sinal de que o gatilho
    // rodou. Sem isso, "nenhum e-mail hoje" fica igual a "o gatilho morreu".
    if (!selecionados.length) {
      if (!simular) aniversariosGravarUltimaExecucao_(resultado);
      return resultado;
    }

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
        // Uma falha isolada nunca derruba o lote. Guarda com o rowNumber para a
        // pagina poder apontar o erro no cartao do aluno certo.
        resultado.falhas++;
        resultado.erros.push({
          rowNumber: aluno.rowNumber,
          nome: aluno.nome,
          erro: String(err && err.message ? err.message : err).slice(0, 200)
        });
      }
    });

    if (!simular) aniversariosGravarUltimaExecucao_(resultado);
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// ULTIMA EXECUCAO (para a pagina saber o que aconteceu no lote)
// ============================================================

var ANIVERSARIOS_ULTIMA_EXECUCAO_PROP = 'ANIVERSARIOS_ULTIMA_EXECUCAO';

/**
 * Guarda o resultado do ultimo lote numa propriedade do script.
 *
 * Sem isto, um aluno cujo e-mail FALHOU fica visualmente identico a um que
 * ainda nao foi processado — a coluna ANIVERSARIO_ENVIADO_EM so registra
 * sucesso. E o Google nao avisa nada, porque as falhas sao tratadas por aluno.
 *
 * Limite de ~9 KB por propriedade: guarda no maximo 30 erros.
 */
function aniversariosGravarUltimaExecucao_(resultado) {
  try {
    var registro = {
      data: resultado.data,
      ano: resultado.ano,
      quando: Utilities.formatDate(new Date(), aniversariosTimeZone_(), 'dd/MM/yyyy HH:mm'),
      elegiveis: resultado.elegiveis,
      enviados: resultado.enviados,
      falhas: resultado.falhas,
      erros: (resultado.erros || []).slice(0, 30)
    };
    PropertiesService.getScriptProperties()
      .setProperty(ANIVERSARIOS_ULTIMA_EXECUCAO_PROP, JSON.stringify(registro));
  } catch (e) {
    // Registro de diagnostico nunca pode derrubar o envio.
  }
}

function aniversariosUltimaExecucao_(hoje) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(ANIVERSARIOS_ULTIMA_EXECUCAO_PROP);
    if (!raw) return null;
    var reg = JSON.parse(raw);
    reg.deHoje = (reg.data === hoje.diaMes && String(reg.ano) === String(hoje.ano));
    return reg;
  } catch (e) {
    return null;
  }
}

/** Remove o erro de um aluno depois de um reenvio manual bem-sucedido. */
function aniversariosLimparErro_(rowNumber) {
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(ANIVERSARIOS_ULTIMA_EXECUCAO_PROP);
    if (!raw) return;
    var reg = JSON.parse(raw);
    var antes = (reg.erros || []).length;
    reg.erros = (reg.erros || []).filter(function(e) {
      return Number(e.rowNumber) !== Number(rowNumber);
    });
    if (reg.erros.length !== antes) {
      reg.falhas = reg.erros.length;
      reg.enviados = Number(reg.enviados || 0) + 1;
      props.setProperty(ANIVERSARIOS_ULTIMA_EXECUCAO_PROP, JSON.stringify(reg));
    }
  } catch (e) {}
}

function enviarEmailAniversario_(aluno, ano) {
  var email = String(aluno.email || '').trim();
  if (!aniversariosEmailValido_(email)) throw new Error('E-mail inválido.');
  // Ultima linha de defesa: nem o lote diario nem o reenvio manual chegam aqui
  // com nome suspeito, mas quem chamar esta funcao no futuro tambem nao passa.
  if (aniversariosNomeSuspeito_(aluno.nome)) throw new Error('Nome inválido para envio: "' + aluno.nome + '".');

  var primeiroNome = aniversariosPrimeiroNome_(aluno.nome);
  var link = linkDescadastroAniversario_(aluno.cpf);
  // Substituicao por funcao de proposito: com string, um '$&' ou '$1' no nome
  // seria interpretado como padrao pelo replace e sairia texto errado no assunto.
  var assunto = ANIVERSARIOS_ASSUNTO.replace('{NOME}', function() { return primeiroNome; });

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
    payload.inlineImages[ANIVERSARIOS_HERO_CID] = safeHeroBlob_();
    payload.inlineImages[ANIVERSARIOS_LOGO_CID] = safeLogoBlob_();
    payload.inlineImages[ANIVERSARIOS_MARCA_CID] = safeMarcaBlob_();
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

  // Links do rodapé. O do WhatsApp só aparece se estiver preenchido — link
  // quebrado num e-mail é pior que link ausente.
  var linkWhats = ANIVERSARIOS_LINK_WHATSAPP
    ? '<a href="' + escapeHtmlEmail_(ANIVERSARIOS_LINK_WHATSAPP) + '" style="color:#9fb2cc;text-decoration:none;">WhatsApp</a>'
    : '';
  var sep = '<span style="color:#3c4a63;padding:0 10px;">&middot;</span>';

  return ''
    + '<!doctype html><html lang="pt-BR"><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="x-apple-disable-message-reformatting" content="">'
    + '<meta http-equiv="x-ua-compatible" content="ie=edge">'
    // Declara que o e-mail nao quer o modo escuro automatico do cliente.
    // Apple Mail e Outlook respeitam; o app do Gmail respeita em parte.
    + '<meta name="color-scheme" content="light only">'
    + '<meta name="supported-color-schemes" content="light only">'
    + '<title>Feliz aniversário, ' + nome + '!</title>'
    + '<style>'
    + ':root{color-scheme:light only;supported-color-schemes:light only;}'
    + 'html,body{width:100%!important;margin:0!important;padding:0!important;background-color:#eef2f7;}'
    + 'table,td{border-collapse:collapse!important;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;}'
    + 'table{border-spacing:0!important;}'
    + 'img{display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}'
    + 'a{text-decoration:none;}'
    + '*{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}'
    + '.preheader{display:none!important;visibility:hidden;opacity:0;overflow:hidden;width:0;height:0;color:transparent;mso-hide:all;}'
    + '@media screen and (max-width:640px){'
    + '.wrap{padding:0!important;}'
    + '.box{width:100%!important;max-width:100%!important;border-radius:0!important;}'
    + '.pad{padding-left:26px!important;padding-right:26px!important;}'
    + '.hero-pad{padding:30px 26px 26px!important;}'
    + '.h1{font-size:32px!important;line-height:38px!important;letter-spacing:-.6px!important;}'
    + '.body-t{font-size:16px!important;line-height:27px!important;}'
    + '.quote-t{font-size:20px!important;line-height:31px!important;}'
    + '.quote-pad{padding:28px 24px!important;}.marca-cel{display:none!important;width:0!important;padding:0!important;}'
    + '.foot-pad{padding:24px 24px 26px!important;}'
    + '}'
    + '@media (prefers-color-scheme:dark){'
    + 'body,.bg{background-color:#eef2f7!important;}'
    + '.fw{background-color:#ffffff!important;}'
    + '.fn{background-color:#071126!important;}'
    + '.fdark{color:#15213f!important;}'
    + '.fbody{color:#4b5772!important;}'
    + '.fwhite{color:#ffffff!important;}'
    + '.fteal{color:#60c0bf!important;}'
    + '.fmuted{color:#7f8ea6!important;}'
    + '}'
    // O app do Gmail marca com data-ogsc (cor) e data-ogsb (fundo) o que ele
    // inverteu no modo escuro. Reafirmar por esses seletores e a unica forma de
    // recuperar o navy — foi o que deixava o cabecalho azul claro no iPhone.
    + '[data-ogsc] .bg,[data-ogsb] .bg{background-color:#eef2f7!important;}'
    + '[data-ogsc] .fw,[data-ogsb] .fw{background-color:#ffffff!important;}'
    + '[data-ogsc] .fn,[data-ogsb] .fn{background-color:#071126!important;}'
    + '[data-ogsc] .fdark{color:#15213f!important;}'
    + '[data-ogsc] .fbody{color:#4b5772!important;}'
    + '[data-ogsc] .fwhite{color:#ffffff!important;}'
    + '[data-ogsc] .fteal{color:#60c0bf!important;}'
    + '[data-ogsc] .fmuted{color:#7f8ea6!important;}'
    + '</style></head>'
    + '<body style="margin:0;padding:0;background-color:#eef2f7;">'

    + '<div class="preheader">Hoje é o seu dia — e toda a equipe da SAFE quer comemorar com você.</div>'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">'
    + '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>'

    + '<center role="article" aria-roledescription="email" lang="pt-BR" class="bg" style="width:100%;background-color:#eef2f7;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr><td align="center" class="wrap" style="padding:40px 14px;">'

    + '<!--[if mso | IE]><table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td width="640"><![endif]-->'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" style="width:100%;max-width:640px;margin:0 auto;overflow:hidden;background-color:#ffffff;border-radius:22px;box-shadow:0 20px 60px rgba(7,17,38,.14);">'

    // ── FOTO: bloco de largura inteira. Fica fora de qualquer sobreposição de
    //    texto de propósito — background-image em célula não renderiza no
    //    Outlook, e o nome do aluno precisa ser HTML de verdade. ──
    + '<tr><td class="fn" bgcolor="#071126" style="padding:0;font-size:0;line-height:0;background-color:#071126;">'
    + '<img src="cid:' + ANIVERSARIOS_HERO_CID + '" width="640" alt="Equipe da SAFE comemorando um aniversário"'
    + ' style="width:100%;max-width:640px;height:auto;display:block;border:0;">'
    + '</td></tr>'

    // ── Faixa de identidade (azul + turquesa) ──
    + '<tr><td style="padding:0;font-size:0;line-height:0;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td width="50%" bgcolor="#5baee2" style="height:5px;background-color:#5baee2;font-size:0;line-height:0;">&nbsp;</td>'
    + '<td width="50%" bgcolor="#60c0bf" style="height:5px;background-color:#60c0bf;font-size:0;line-height:0;">&nbsp;</td>'
    + '</tr></table></td></tr>'

    // ── Saudação em navy, com o nome dinâmico ──
    + '<tr><td class="fn hero-pad" bgcolor="#071126" style="padding:34px 46px 30px;background-color:#071126;">'
    + '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#60c0bf;" class="fteal">Hoje é o seu dia</div>'
    + '<h1 class="h1 fwhite" style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:40px;line-height:46px;font-weight:700;letter-spacing:-1px;color:#ffffff;">'
    + 'Feliz aniversário,<br>' + nome + '!</h1>'
    + '</td></tr>'

    // ── Corpo ──
    + '<tr><td class="fw pad" bgcolor="#ffffff" style="padding:34px 46px 6px;background-color:#ffffff;">'
    + '<p class="body-t fbody" style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:17px;line-height:30px;color:#4b5772;">'
    + 'Hoje não comemoramos apenas uma data. Celebramos cada decisão que trouxe você até aqui, '
    + 'cada desafio superado e cada passo dado em direção ao seu sonho de voar.</p>'
    + '<p class="body-t fbody" style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:17px;line-height:30px;color:#4b5772;">'
    + 'Ter você com a gente nessa jornada é motivo de orgulho para toda a equipe da SAFE.</p>'
    + '<p class="body-t fbody" style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:17px;line-height:30px;color:#4b5772;">'
    + 'Que este novo ciclo traga saúde, conquistas e boas histórias — e que nunca falte coragem '
    + 'para decolar cada vez mais alto.</p>'
    + '</td></tr>'

    // ── Citação em serifada, sobre navy. É o momento de respiro do e-mail. ──
    + '<tr><td bgcolor="#ffffff" style="padding:28px 46px 0;background-color:#ffffff;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="fn" bgcolor="#071126" style="background-color:#071126;border-radius:16px;overflow:hidden;">'
    + '<tr>'
    + '<td class="quote-pad" style="padding:30px 32px;">'
    + '<p class="quote-t fwhite" style="margin:0;font-family:Georgia,\'Times New Roman\',serif;font-size:22px;line-height:34px;'
    + 'font-style:italic;color:#ffffff;">'
    + '&ldquo;Que nunca faltem novos destinos, grandes sonhos e c&eacute;us abertos.&rdquo;</p>'
    + '</td>'
    + '<td width="86" valign="middle" align="right" class="marca-cel" style="width:86px;padding:0 30px 0 0;">'
    + '<img src="cid:' + ANIVERSARIOS_MARCA_CID + '" width="52" alt=""'
    + ' style="width:52px;height:auto;display:block;border:0;opacity:.9;">'
    + '</td>'
    + '</tr></table></td></tr>'

    // ── Despedida ──
    + '<tr><td class="fw pad" bgcolor="#ffffff" style="padding:30px 46px 32px;background-color:#ffffff;">'
    + '<p class="body-t fbody" style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:17px;line-height:30px;color:#4b5772;">'
    + 'Obrigado por confiar seu sonho à SAFE. Nos vemos nos próximos voos.</p>'
    + '<p class="fdark" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:17px;line-height:28px;color:#15213f;">Um abraço,<br>'
    + '<strong style="color:#15213f;">Equipe SAFE</strong></p>'
    + '</td></tr>'

    // ── Rodapé: compacto de propósito. O aviso de mensagem automática e o
    //    descadastro foram unidos num bloco só — eram duas linhas separadas por
    //    um vão, e juntas ocupam metade da altura sem perder clareza. ──
    + '<tr><td class="fn foot-pad" bgcolor="#071126" style="padding:26px 46px 28px;background-color:#071126;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'

    + '<tr><td align="center" style="padding-bottom:14px;">'
    + '<img src="cid:' + ANIVERSARIOS_LOGO_CID + '" width="124" alt="SAFE Escola de Aviação"'
    + ' style="width:124px;height:auto;margin:0 auto;display:block;border:0;'
    + 'color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;letter-spacing:1px;">'
    + '</td></tr>'

    + '<tr><td align="center" style="padding-bottom:14px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:13px;line-height:16px;">'
    + '<a href="' + escapeHtmlEmail_(ANIVERSARIOS_LINK_SITE) + '" style="color:#9fb2cc;text-decoration:none;">Site</a>'
    + sep
    + '<a href="' + escapeHtmlEmail_(ANIVERSARIOS_LINK_INSTAGRAM) + '" style="color:#9fb2cc;text-decoration:none;">Instagram</a>'
    + (linkWhats ? sep + linkWhats : '')
    + '</td></tr>'

    + '<tr><td style="padding-bottom:13px;font-size:0;line-height:0;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td bgcolor="#22304a" style="height:1px;background-color:#22304a;font-size:0;line-height:0;">&nbsp;</td>'
    + '</tr></table></td></tr>'

    + '<tr><td align="center" style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:12px;line-height:19px;color:#7f8ea6;" class="fmuted">'
    + 'Mensagem automática em comemoração ao seu aniversário. Não quer mais recebê-las? '
    + '<a href="' + link + '" style="color:#8fc9ea;text-decoration:underline;white-space:nowrap;">Cancelar o recebimento</a>.'
    + '</td></tr>'

    + '<tr><td align="center" style="padding-top:11px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;'
    + 'font-size:11px;line-height:17px;color:#5b6a83;">'
    + '&copy; ' + anoTxt + ' SAFE Escola de Aviação &middot; São José dos Campos e Campinas</td></tr>'

    + '</table></td></tr>'

    + '</table>'
    + '<!--[if mso | IE]></td></tr></table><![endif]-->'
    + '</td></tr></table></center></body></html>';
}

function textoEmailAniversario_(primeiroNome, linkDescadastro) {
  return [
    'HOJE E O SEU DIA',
    '',
    'Feliz aniversario, ' + primeiroNome + '!',
    '',
    'Hoje nao comemoramos apenas uma data. Celebramos cada decisao que trouxe',
    'voce ate aqui, cada desafio superado e cada passo dado em direcao ao seu',
    'sonho de voar.',
    '',
    'Ter voce com a gente nessa jornada e motivo de orgulho para toda a equipe',
    'da SAFE.',
    '',
    'Que este novo ciclo traga saude, conquistas e boas historias - e que nunca',
    'falte coragem para decolar cada vez mais alto.',
    '',
    '   "Que nunca faltem novos destinos, grandes sonhos e ceus abertos."',
    '',
    'Obrigado por confiar seu sonho a SAFE. Nos vemos nos proximos voos.',
    '',
    'Um abraco,',
    'Equipe SAFE - Escola de Aviacao',
    '',
    ANIVERSARIOS_LINK_SITE,
    ANIVERSARIOS_LINK_INSTAGRAM,
    '',
    '---',
    'Mensagem automatica em comemoracao ao seu aniversario.',
    'Para nao receber mais mensagens de aniversario, acesse:',
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

  // Erros do ultimo lote, indexados por linha, para apontar no cartao certo.
  var ultima = aniversariosUltimaExecucao_(hoje);
  var errosPorLinha = {};
  if (ultima && ultima.deHoje) {
    (ultima.erros || []).forEach(function(e) { errosPorLinha[Number(e.rowNumber)] = e.erro; });
  }

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

    // Aluno inativo nao recebe e-mail (aniversariosMotivoInelegivel_ barra por
    // situacao), entao tambem nao entra nas listas — so poluiria a tela. Ele
    // continua contado no resumo e volta a aparecer se for reativado.
    if (!ativo) return;

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
      registro.erroEnvio = errosPorLinha[Number(aluno.rowNumber)] || '';
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
    ultimaExecucao: ultima,
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

  if (aluno.situacao === 'Inativo') throw new Error('Aluno inativo não recebe e-mail de aniversário. Reative o cadastro primeiro.');
  if (aluno.semAniversario) throw new Error('Este aluno cancelou o recebimento de mensagens de aniversário.');
  if (aniversariosNomeSuspeito_(aluno.nome)) throw new Error('O nome cadastrado ("' + aluno.nome + '") não parece um nome de pessoa. Corrija no CAVOK antes de enviar.');
  if (!aniversariosEmailValido_(aluno.email)) throw new Error('Aluno sem e-mail válido cadastrado.');

  enviarEmailAniversario_(aluno, hoje.ano);
  marcarAniversarioEnviado_(contexto.sheet, aluno.rowNumber, contexto.indices, hoje.ano);
  aniversariosLimparErro_(aluno.rowNumber);

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

/** CPF valido a partir de uma semente — para os alunos de teste. */
function aniversariosCpfTeste_(semente) {
  var base = String(semente).replace(/\D/g, '');
  while (base.length < 9) base = '1' + base;
  base = base.slice(-9);
  if (/^(\d)\1+$/.test(base)) base = '123456' + base.slice(-3);

  var soma = 0, i;
  for (i = 0; i < 9; i++) soma += Number(base.charAt(i)) * (10 - i);
  var d1 = 11 - (soma % 11); if (d1 >= 10) d1 = 0;

  var b2 = base + d1;
  soma = 0;
  for (i = 0; i < 10; i++) soma += Number(b2.charAt(i)) * (11 - i);
  var d2 = 11 - (soma % 11); if (d2 >= 10) d2 = 0;

  return base + d1 + d2;
}

/** Linha no formato EXATO do XLS do CAVOK (15 colunas). */
function aniversariosLinhaTeste_(matricula, nome, cpf, nascimento, curso) {
  return {
    'Matrícula': matricula, 'Nome': nome, 'CPF': cpf,
    'E-mail': 'teste.' + matricula.toLowerCase() + '@exemplo.com',
    'Segundo E-mail': '', 'Telefone': '',
    'Data Nascimento': nascimento,
    'Celular': '', 'Cliente': '',
    'Base': 'SDAM - SDAM', 'Curso': curso, 'Contrato': '',
    'Termo de Ciência': '', 'Sexo': '', 'Data matrícula': '24/07/2026'
  };
}

/** Le de volta o que ficou gravado nas linhas de teste. */
function aniversariosLerTeste_(cpfs) {
  var contexto = carregarContextoCadastroAlunos_();
  var achados = {};

  contexto.linhas.forEach(function(item) {
    var a = linhaParaCadastroAluno_(item.row, item.rowNumber, contexto.indices);
    var pos = cpfs.indexOf(a.cpf);
    if (pos === -1) return;
    var dm = diaMesNascimentoCadastroAluno_(a.nascimento);
    achados[pos] = {
      matricula: a.matricula,
      nascimentoGravado: a.nascimento || '(vazio)',
      diaMes: dm ? dm.dia + '/' + dm.mes : '(nenhum)',
      formatoDaCelula: contexto.indices.nascimento
        ? contexto.sheet.getRange(a.rowNumber, contexto.indices.nascimento).getNumberFormat()
        : '(sem coluna)',
      idadeEm2026: aniversariosIdadeQueFaz_(a.nascimento, '2026') || '(n/a)'
    };
  });

  return {
    colunaNascimentoExiste: !!contexto.indices.nascimento,
    linhas: [achados[0] || null, achados[1] || null, achados[2] || null]
  };
}

/**
 * Testa a IMPORTACAO de ponta a ponta contra uma COPIA da planilha, sem
 * precisar do frontend. Usa o caminho real (importarCadastroAlunos).
 *
 * Exercita os DOIS caminhos de escrita, que sao diferentes no codigo:
 *   FASE 1 — aluno novo   -> appendCadastroAluno_    (appendRow + formato)
 *   FASE 2 — aluno existe -> atualizarLinhaCadastroAluno_ (setValue)
 *
 * Usa CPF novo a cada execucao, senao a 2a rodada nunca testaria o append.
 *
 * ⚠️ Recusa rodar se o script estiver apontado para a planilha de PRODUCAO.
 * Antes de rodar: Configuracoes do projeto -> Propriedades do script ->
 * CADASTRO_ALUNOS_SHEET_ID = ID da copia.
 */
function aniversariosTesteImportacao() {
  var idAtual = obterCadastroAlunosSheetId_();
  if (idAtual === CADASTRO_ALUNOS_SHEET_ID) {
    throw new Error(
      'BLOQUEADO: o script está apontado para a planilha de PRODUÇÃO (' + idAtual + ').\n' +
      'Defina a propriedade CADASTRO_ALUNOS_SHEET_ID com o ID de uma CÓPIA antes de rodar este teste.\n' +
      'Configurações do projeto → Propriedades do script.'
    );
  }

  var selo = String(Date.now()).slice(-6);
  var cpfs = [
    aniversariosCpfTeste_(Date.now()),
    aniversariosCpfTeste_(Date.now() + 137),
    aniversariosCpfTeste_(Date.now() + 911)
  ];

  var out = { planilha: idAtual, selo: selo, cpfs: cpfs, falhas: [] };

  // ── FASE 1: alunos NOVOS (caminho appendCadastroAluno_) ──
  importarCadastroAlunos([
    aniversariosLinhaTeste_('T' + selo + '-A', 'Aluno Teste Nascimento', cpfs[0], '10/07/1995', 'PPA - Pratico (PP)'),
    aniversariosLinhaTeste_('T' + selo + '-B', 'Aluno Teste Sem Data',   cpfs[1], '',           'INVA (Prático)'),
    aniversariosLinhaTeste_('T' + selo + '-C', 'Aluno Teste 29 Fev',     cpfs[2], '29/02/2000', 'PC/IFRA (Prático)')
  ], { email: 'teste-importacao' });

  var f1 = aniversariosLerTeste_(cpfs);
  out.colunaNascimentoExiste = f1.colunaNascimentoExiste;
  out.fase1_alunoNovo = f1.linhas;

  if (!f1.colunaNascimentoExiste) out.falhas.push('coluna de nascimento não existe');
  if (!f1.linhas[0]) out.falhas.push('fase 1: aluno A não foi encontrado');
  else {
    if (f1.linhas[0].nascimentoGravado !== '10/07/1995') out.falhas.push('fase 1: nascimento não gravado no append');
    if (f1.linhas[0].formatoDaCelula !== '@') out.falhas.push('fase 1: célula não está em formato TEXTO (@)');
    if (f1.linhas[0].diaMes !== '10/07') out.falhas.push('fase 1: dia/mês incorreto');
  }
  if (f1.linhas[2] && f1.linhas[2].diaMes !== '29/02') out.falhas.push('fase 1: 29/02 não preservado');
  if (f1.linhas[1] && f1.linhas[1].nascimentoGravado !== '(vazio)') out.falhas.push('fase 1: aluno sem data ganhou data');

  // ── FASE 2: MESMOS CPFs, data trocada (caminho atualizarLinha) ──
  importarCadastroAlunos([
    aniversariosLinhaTeste_('T' + selo + '-A', 'Aluno Teste Nascimento', cpfs[0], '05/12/1988', 'PPA - Pratico (PP)'),
    aniversariosLinhaTeste_('T' + selo + '-B', 'Aluno Teste Sem Data',   cpfs[1], '',           'INVA (Prático)')
  ], { email: 'teste-importacao' });

  var f2 = aniversariosLerTeste_(cpfs);
  out.fase2_alunoExistente = f2.linhas;

  if (!f2.linhas[0]) out.falhas.push('fase 2: aluno A desapareceu');
  else {
    if (f2.linhas[0].nascimentoGravado !== '05/12/1988') out.falhas.push('fase 2: data não foi atualizada');
    if (f2.linhas[0].formatoDaCelula !== '@') out.falhas.push('fase 2: célula saiu do formato TEXTO');
  }
  // Regra: import sem a data NAO pode apagar nascimento ja existente.
  if (f2.linhas[2] && f2.linhas[2].nascimentoGravado !== '29/02/2000') {
    out.falhas.push('fase 2: aluno fora do lote teve o nascimento alterado');
  }

  out.veredito = out.falhas.length === 0
    ? 'OK — append e update gravam dd/mm/aaaa como TEXTO, 29/02 preservado, aluno sem data intacto.'
    : 'FALHOU — ' + out.falhas.join(' | ');

  Logger.log(JSON.stringify(out, null, 2));
  return out;
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
