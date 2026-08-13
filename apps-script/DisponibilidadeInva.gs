// ============================================================
// DisponibilidadeInva.gs — Disponibilidade (Eventual) e pedidos de folga
// (CLT) dos instrutores de INVA
// SAFE Hub
//
// O PROBLEMA
// Instrutores de INVA não são usuários do Hub. O CCO precisa que cada um
// informe a própria disponibilidade (Eventual, por turno) ou pedido de
// folga (CLT, por mês de referência), sem enxergar nem mexer em mais nada
// no Hub.
//
// ⚠️ REGRA RÍGIDA, a mais importante deste módulo: nenhuma função aqui
// aceita um identificador de instrutor vindo do cliente. Leitura e escrita
// resolvem "de quem é o dado" SÓ a partir do `usuario` devolvido pelo guard
// (usuario.id) — nunca de um campo do payload. É a única forma de garantir
// que um instrutor não veja nem altere o de outro.
//
// O bloqueio de ROTA (instrutor só pode chamar as ações deste módulo, mais
// as universais) fica em validarAcaoPerfilExclusivo_ (Auth.gs). Aqui só
// mora o dado e a regra de prazo.
//
// Eventual vs CLT NÃO é permissão RBAC — é o atributo TIPO_INSTRUTOR da
// aba USUARIOS (Auth.gs), lido da sessão em tempo de execução.
// ============================================================

var DISPONIBILIDADE_INVA_SHEETS = {
  DADOS: 'DISPONIBILIDADE_INVA',
  LOG: 'DISPONIBILIDADE_INVA_LOG'
};

var DISPONIBILIDADE_INVA_HEADERS = [
  'ID', 'USER_ID', 'DATA', 'TIPO_REGISTRO', 'TURNO',
  'CRIADO_EM', 'CRIADO_POR', 'ATUALIZADO_EM', 'ATUALIZADO_POR'
];

var DISPONIBILIDADE_INVA_LOG_HEADERS = [
  'ID', 'DATA_HORA', 'AUTOR_ID', 'AUTOR_NOME', 'ACAO', 'DATA_ALVO', 'ANTES', 'DEPOIS'
];

var DISPONIBILIDADE_INVA_TURNOS = ['manha', 'tarde', 'dia_inteiro'];

// Eventual: editável a partir de hoje+N dias (inclusive). Exemplo do
// enunciado: hoje=12 -> primeiro dia editável=16.
var DISPONIBILIDADE_INVA_DIAS_ANTECEDENCIA_EVENTUAL = 4;

// CLT: bloqueio é do MÊS DE REFERÊNCIA inteiro, quando a distância até o
// primeiro dia do mês cai a N dias ou menos. Exemplo do enunciado: mês de
// referência novembro, hoje=16/10 -> editável (16 dias de distância);
// hoje=17/10 -> bloqueado (15 dias de distância).
var DISPONIBILIDADE_INVA_DIAS_ANTECEDENCIA_CLT = 15;

// ── Aba ──────────────────────────────────────────────────────

/**
 * ⚠️ `criar` é falso na LEITURA, de propósito. Leitura que cria aba é
 * escrita disfarçada: duas cargas de tela simultâneas criariam a aba duas
 * vezes. Mesma regra do `portalAba_` (PortalAluno.gs).
 */
function disponibilidadeInvaAba_(nome, headers, criar) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var aba = ss.getSheetByName(nome);
  if (aba) return aba;
  if (!criar) return null;
  aba = ss.insertSheet(nome);
  aba.appendRow(headers);
  return aba;
}

// ── Guards ───────────────────────────────────────────────────

function exigirDisponibilidadeInvaVer_(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'disponibilidade_inva.visualizar_propria')) return usuario;
  throw new Error('Sem permissão para ver a disponibilidade de INVA.');
}

function exigirDisponibilidadeInvaEditar_(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'disponibilidade_inva.editar_propria')) return usuario;
  throw new Error('Sem permissão para editar a disponibilidade de INVA.');
}

// Leitura consolidada (CCO/gestão): permissão SEPARADA da de "própria" — um
// instrutor nunca tem esta, e quem gerencia não precisa da outra. Não há
// bypass por `instrutor_inva`: esse perfil está fora da allowlist desta
// ação em validarAcaoPerfilExclusivo_ (Auth.gs), então mesmo que alguém
// tentasse conceder a permissão a um instrutor por engano, a ação nem
// chegaria a ser roteada para essa conta.
function exigirDisponibilidadeInvaVerTodos_(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'disponibilidade_inva.visualizar_todos')) return usuario;
  throw new Error('Sem permissão para ver a disponibilidade de todos os instrutores.');
}

// ── Datas ────────────────────────────────────────────────────
// Tudo aqui usa a data do SERVIDOR (new Date() no Apps Script), nunca uma
// data mandada pelo cliente — mesmo motivo pelo qual nenhuma outra rota de
// prazo deste projeto confia em relógio de navegador para decidir limite.

/** 'aaaa-mm-dd' -> Date ao meio-dia UTC (evita deslocar por horário de verão
 * na subtração de datas, mesma armadilha do lembrete de template dos
 * Aniversários). */
function disponibilidadeInvaParseData_(textoAaaaMmDd) {
  var partes = String(textoAaaaMmDd || '').split('-');
  if (partes.length !== 3) throw new Error('Data inválida: ' + textoAaaaMmDd);
  return new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12));
}

function disponibilidadeInvaHojeTexto_() {
  return Utilities.formatDate(new Date(), SAFE_SESSION_TIMEZONE, 'yyyy-MM-dd');
}

function disponibilidadeInvaDiferencaDias_(dataAlvo, dataBase) {
  var MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((dataAlvo.getTime() - dataBase.getTime()) / MS_DIA);
}

/** Valida o formato e recusa data de calendário inexistente (ex.: 31/02),
 * por round-trip: 'Date.UTC' rola o mês sozinho quando o dia não existe, e
 * aí o texto formatado de volta não bate com o texto original. */
function disponibilidadeInvaValidarDataTexto_(texto) {
  var valor = String(texto || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error('Data inválida.');
  }
  var data = disponibilidadeInvaParseData_(valor);
  if (Utilities.formatDate(data, 'UTC', 'yyyy-MM-dd') !== valor) {
    throw new Error('Data inválida: ' + texto);
  }
  return valor;
}

/** Eventual: editável a partir de hoje+4 dias (inclusive). */
function disponibilidadeInvaDiaEditavelEventual_(dataAlvoTexto, hojeTexto) {
  var alvo = disponibilidadeInvaParseData_(dataAlvoTexto);
  var hoje = disponibilidadeInvaParseData_(hojeTexto || disponibilidadeInvaHojeTexto_());
  return disponibilidadeInvaDiferencaDias_(alvo, hoje) >= DISPONIBILIDADE_INVA_DIAS_ANTECEDENCIA_EVENTUAL;
}

/** CLT: bloqueio é do mês de referência inteiro — deriva o primeiro dia do
 * mês a partir do dia-alvo e checa a distância até ele, não a distância até
 * o próprio dia-alvo (dois dias do mesmo mês de novembro têm o MESMO
 * limite, 16/10, não um limite por dia). */
function disponibilidadeInvaDiaEditavelClt_(dataAlvoTexto, hojeTexto) {
  var partes = String(dataAlvoTexto || '').split('-');
  if (partes.length !== 3) throw new Error('Data inválida: ' + dataAlvoTexto);
  var primeiroDiaMes = partes[0] + '-' + partes[1] + '-01';
  var mesRef = disponibilidadeInvaParseData_(primeiroDiaMes);
  var hoje = disponibilidadeInvaParseData_(hojeTexto || disponibilidadeInvaHojeTexto_());
  return disponibilidadeInvaDiferencaDias_(mesRef, hoje) > DISPONIBILIDADE_INVA_DIAS_ANTECEDENCIA_CLT;
}

function disponibilidadeInvaTipoValido_(tipoInstrutor) {
  var normalizado = String(tipoInstrutor || '').trim().toLowerCase();
  if (['eventual', 'clt'].indexOf(normalizado) === -1) {
    throw new Error('Este usuário não tem tipo de instrutor definido (Eventual ou CLT). Peça para o administrador configurar o cadastro.');
  }
  return normalizado;
}

// ── Auditoria ────────────────────────────────────────────────
// Defensivo em try/catch de propósito — auditoria nunca bloqueia a operação
// principal, mesmo padrão do `logAudit_` da Escala CCO.
function disponibilidadeInvaRegistrarLog_(usuario, acao, dataAlvo, antes, depois) {
  try {
    var aba = disponibilidadeInvaAba_(DISPONIBILIDADE_INVA_SHEETS.LOG, DISPONIBILIDADE_INVA_LOG_HEADERS, true);
    var linha = aba.getLastRow() + 1;
    aba.getRange(linha, 6).setNumberFormat('@'); // DATA_ALVO como texto, antes do valor
    aba.getRange(linha, 1, 1, DISPONIBILIDADE_INVA_LOG_HEADERS.length).setValues([[
      gerarId(),
      new Date(),
      usuario.id,
      usuario.nome || '',
      acao,
      dataAlvo,
      antes ? JSON.stringify(antes) : '',
      depois ? JSON.stringify(depois) : ''
    ]]);
  } catch (e) {
    // silencioso de propósito
  }
}

// ── Leitura ──────────────────────────────────────────────────

/**
 * Devolve só os registros do próprio `usuario` (nunca aceita um id vindo do
 * cliente), mais os limiares de prazo já calculados no servidor: o
 * frontend usa `hoje` + os dois limiares para desenhar o calendário como
 * editável/bloqueado célula a célula sem precisar de uma chamada por mês
 * navegado — mas quem decide de verdade se pode salvar/excluir continua
 * sendo o servidor, em `salvarDisponibilidadeInva`/`excluirDisponibilidadeInva`.
 */
function listarDisponibilidadeInva(usuario) {
  var tipoInstrutor = disponibilidadeInvaTipoValido_(usuario.tipoInstrutor);
  var aba = disponibilidadeInvaAba_(DISPONIBILIDADE_INVA_SHEETS.DADOS, DISPONIBILIDADE_INVA_HEADERS, false);
  var registros = [];

  if (aba) {
    var ultima = aba.getLastRow();
    if (ultima > 1) {
      var valores = aba.getRange(2, 1, ultima - 1, DISPONIBILIDADE_INVA_HEADERS.length).getValues();
      valores.forEach(function(linha) {
        if (String(linha[1]) !== String(usuario.id)) return; // regra rígida: só a própria
        registros.push({ id: String(linha[0]), data: String(linha[2]), tipoRegistro: String(linha[3]), turno: String(linha[4] || '') });
      });
    }
  }

  registros.sort(function(a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });

  return {
    tipoInstrutor: tipoInstrutor,
    hoje: disponibilidadeInvaHojeTexto_(),
    diasAntecedenciaEventual: DISPONIBILIDADE_INVA_DIAS_ANTECEDENCIA_EVENTUAL,
    diasAntecedenciaClt: DISPONIBILIDADE_INVA_DIAS_ANTECEDENCIA_CLT,
    registros: registros
  };
}

// ── Leitura consolidada (CCO/gestão) ───────────────────────────
// Recorte magro: nome e tipo, só o que a tela precisa para saber quem
// avisar. Nenhum e-mail, CPF ou outro dado do cadastro sai daqui.

/** Só ativos e só quem tem TIPO_INSTRUTOR preenchido — inativo não é
 * candidato a acionamento, e usuário sem o campo não é instrutor. */
function listarInstrutoresInva_() {
  var sheet = getSheet(SHEETS.USUARIOS);
  var idx = indiceCabecalho_(sheet);
  if (!idx.TIPO_INSTRUTOR) return [];

  var data = sheet.getDataRange().getValues();
  var lista = [];
  for (var i = 1; i < data.length; i++) {
    var tipo = String(data[i][idx.TIPO_INSTRUTOR - 1] || '').trim().toLowerCase();
    if (['eventual', 'clt'].indexOf(tipo) === -1) continue;
    if (!valorBooleano(data[i][6])) continue; // ATIVO
    lista.push({ id: String(data[i][0]), nome: String(data[i][1] || ''), tipoInstrutor: tipo });
  }
  lista.sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  return lista;
}

/**
 * Um item por instrutor ATIVO (mesmo sem nenhuma marcação ainda — sumir da
 * lista pareceria "não existe" quando na verdade é "ainda não marcou nada",
 * e essa distinção importa para quem está cobrando o preenchimento).
 */
function listarDisponibilidadeInvaTodos() {
  var aba = disponibilidadeInvaAba_(DISPONIBILIDADE_INVA_SHEETS.DADOS, DISPONIBILIDADE_INVA_HEADERS, false);
  var porUsuario = {};

  if (aba) {
    var ultima = aba.getLastRow();
    if (ultima > 1) {
      var valores = aba.getRange(2, 1, ultima - 1, DISPONIBILIDADE_INVA_HEADERS.length).getValues();
      valores.forEach(function(linha) {
        var userId = String(linha[1]);
        if (!porUsuario[userId]) porUsuario[userId] = [];
        porUsuario[userId].push({ data: String(linha[2]), tipoRegistro: String(linha[3]), turno: String(linha[4] || '') });
      });
    }
  }

  return listarInstrutoresInva_().map(function(inst) {
    var registros = (porUsuario[inst.id] || []).slice().sort(function(a, b) {
      return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0);
    });
    return { userId: inst.id, nome: inst.nome, tipoInstrutor: inst.tipoInstrutor, registros: registros };
  });
}

// ── Escrita ──────────────────────────────────────────────────
// Sem otimista: quem decide se o dia ainda está no prazo é o servidor, e
// fingir sucesso numa gravação recusada mostraria "salvo" numa mudança que
// não aconteceu (mesma regra do Fechamento de Horas).

function salvarDisponibilidadeInva(usuario, dados) {
  var tipoInstrutor = disponibilidadeInvaTipoValido_(usuario.tipoInstrutor);
  var data = disponibilidadeInvaValidarDataTexto_(dados && dados.data);
  var tipoRegistro = tipoInstrutor === 'clt' ? 'folga' : 'disponibilidade';
  var turno = '';

  if (tipoInstrutor === 'eventual') {
    if (!disponibilidadeInvaDiaEditavelEventual_(data)) {
      throw new Error('Para alterações neste prazo, entre em contato direto com o CCO.');
    }
    turno = String((dados && dados.turno) || '').trim().toLowerCase();
    if (DISPONIBILIDADE_INVA_TURNOS.indexOf(turno) === -1) {
      throw new Error('Escolha um turno: Manhã, Tarde ou Dia Inteiro.');
    }
  } else {
    if (!disponibilidadeInvaDiaEditavelClt_(data)) {
      throw new Error('Fora do prazo para pedir folga neste mês. Entre em contato direto com o CCO.');
    }
    // CLT não tem turno — o pedido de folga é o dia inteiro, implícito.
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('Outra alteração está em andamento. Tente de novo em alguns segundos.');
  }
  try {
    var aba = disponibilidadeInvaAba_(DISPONIBILIDADE_INVA_SHEETS.DADOS, DISPONIBILIDADE_INVA_HEADERS, true);
    var ultima = aba.getLastRow();
    var linhaExistente = 0;
    var linhaAtual = null;
    var antes = null;

    if (ultima > 1) {
      var valores = aba.getRange(2, 1, ultima - 1, DISPONIBILIDADE_INVA_HEADERS.length).getValues();
      for (var i = 0; i < valores.length; i++) {
        if (String(valores[i][1]) === String(usuario.id) && String(valores[i][2]) === data) {
          linhaExistente = i + 2;
          linhaAtual = valores[i];
          antes = { data: String(valores[i][2]), tipoRegistro: String(valores[i][3]), turno: String(valores[i][4] || '') };
          break;
        }
      }
    }

    var agora = new Date();
    var autor = (usuario.nome || '') + (usuario.email ? ' (' + usuario.email + ')' : '');
    var depois = { data: data, tipoRegistro: tipoRegistro, turno: turno };
    var id = linhaExistente ? linhaAtual[0] : gerarId();
    var criadoEm = linhaExistente ? linhaAtual[5] : agora;
    var criadoPor = linhaExistente ? linhaAtual[6] : autor;
    var linhaDestino = linhaExistente || (aba.getLastRow() + 1);

    aba.getRange(linhaDestino, 3).setNumberFormat('@'); // DATA é texto — formato antes do valor
    aba.getRange(linhaDestino, 1, 1, DISPONIBILIDADE_INVA_HEADERS.length).setValues([[
      id, usuario.id, data, tipoRegistro, turno, criadoEm, criadoPor, agora, autor
    ]]);

    disponibilidadeInvaRegistrarLog_(usuario, linhaExistente ? 'alterar' : 'criar', data, antes, depois);
  } finally {
    lock.releaseLock();
  }

  return listarDisponibilidadeInva(usuario);
}

function excluirDisponibilidadeInva(usuario, dados) {
  var tipoInstrutor = disponibilidadeInvaTipoValido_(usuario.tipoInstrutor);
  var data = disponibilidadeInvaValidarDataTexto_(dados && dados.data);

  var editavel = tipoInstrutor === 'eventual'
    ? disponibilidadeInvaDiaEditavelEventual_(data)
    : disponibilidadeInvaDiaEditavelClt_(data);
  if (!editavel) {
    throw new Error(tipoInstrutor === 'eventual'
      ? 'Para alterações neste prazo, entre em contato direto com o CCO.'
      : 'Fora do prazo para pedir folga neste mês. Entre em contato direto com o CCO.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('Outra alteração está em andamento. Tente de novo em alguns segundos.');
  }
  try {
    var aba = disponibilidadeInvaAba_(DISPONIBILIDADE_INVA_SHEETS.DADOS, DISPONIBILIDADE_INVA_HEADERS, false);
    if (aba) {
      var ultima = aba.getLastRow();
      if (ultima > 1) {
        var valores = aba.getRange(2, 1, ultima - 1, DISPONIBILIDADE_INVA_HEADERS.length).getValues();
        for (var i = valores.length - 1; i >= 0; i--) {
          if (String(valores[i][1]) === String(usuario.id) && String(valores[i][2]) === data) {
            var antes = { data: String(valores[i][2]), tipoRegistro: String(valores[i][3]), turno: String(valores[i][4] || '') };
            aba.deleteRow(i + 2);
            disponibilidadeInvaRegistrarLog_(usuario, 'excluir', data, antes, null);
            break;
          }
        }
      }
    }
  } finally {
    lock.releaseLock();
  }

  return listarDisponibilidadeInva(usuario);
}
