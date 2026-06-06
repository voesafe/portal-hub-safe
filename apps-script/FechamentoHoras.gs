// ============================================================
// FechamentoHoras.gs - Fechamento mensal de horas e cotistas
// Usa uma planilha operacional separada da base comercial.
// ============================================================

var FECHAMENTO_HORAS_SHEET_ID = '1aQTkJPULrrPaHIEX7PtDyKnPlw6k7-Rw0ogoeXEZj_g';
var FECHAMENTO_HORAS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
var FECHAMENTO_HORAS_AERONAVES = [
  { base: 'SJK', tipo: 'PR-CRS', cotista: false },
  { base: 'SJK', tipo: 'PS-LOM', cotista: true },
  { base: 'SJK', tipo: 'PS-SFE', cotista: true },
  { base: 'SJK', tipo: 'PS-SFH', cotista: true },
  { base: 'SJK', tipo: 'PS-SFI', cotista: true },
  { base: 'CPQ', tipo: 'PS-SFJ', cotista: false },
  { base: 'CPQ', tipo: 'PS-SFL', cotista: false },
  { base: 'SJK', tipo: 'PS-SFP', cotista: false },
  { base: 'SJK', tipo: 'SM-SJK', cotista: false },
  { base: 'CPQ', tipo: 'SM-CPQ', cotista: false }
];
var FECHAMENTO_HORAS_METRICAS = [
  'Número de Cheques',
  'Número de Voos Solos',
  'Alunos Novos',
  'Alunos Ativos CPQ - PP',
  'Alunos Ativos CPQ - PC',
  'Alunos Ativos CPQ - INVA',
  'Alunos Ativos SJK - PP',
  'Alunos Ativos SJK - PC',
  'Alunos Ativos SJK - INVA',
  'Alunos Ativos SJK - Contínuo',
  'Alunos Ativos CPQ - Contínuo'
];
var FECHAMENTO_HORAS_CONTROLE = 'CONTROLE_FECHAMENTO';
var FECHAMENTO_HORAS_HISTORICO = 'HISTORICO_FECHAMENTO';

function perfilPodeAcessarFechamentoHoras(perfil, email) {
  var p = normalizarPerfil(perfil);
  if (p === 'master' || p === 'admin') return true;
  return p === 'financeiro' &&
    String(email || '').trim().toLowerCase() === 'elaine.souza@voesafe.com.br';
}

function exigirAcessoFechamentoHoras(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (!perfilPodeAcessarFechamentoHoras(usuario.perfil, usuario.email)) {
    throw new Error('Acesso ao fechamento de horas não autorizado.');
  }
  return usuario;
}

function validarCompetenciaFechamentoHoras_(ano, mes) {
  ano = Number(ano);
  mes = Number(mes);
  if (!ano || ano < 2026 || ano > 2100) throw new Error('Ano inválido.');
  if (!mes || mes < 1 || mes > 12) throw new Error('Mês inválido.');
  return { ano: ano, mes: mes };
}

function nomeAbaFechamentoHoras_(ano, mes) {
  var nome = FECHAMENTO_HORAS_MESES[mes - 1];
  return Number(ano) === 2026 ? nome : nome + ' ' + ano;
}

function numeroFechamentoHoras_(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  var numero = Number(String(valor).replace(',', '.'));
  return isFinite(numero) ? numero : 0;
}

function textoNormalizadoFechamentoHoras_(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function planilhaFechamentoHoras_() {
  return SpreadsheetApp.openById(FECHAMENTO_HORAS_SHEET_ID);
}

function garantirEstruturaFechamentoHoras_() {
  var ss = planilhaFechamentoHoras_();
  var controle = ss.getSheetByName(FECHAMENTO_HORAS_CONTROLE);
  if (!controle) {
    controle = ss.insertSheet(FECHAMENTO_HORAS_CONTROLE);
    controle.appendRow([
      'ANO', 'MES', 'FECHADO', 'VERSAO',
      'ATUALIZADO_POR', 'ATUALIZADO_EM'
    ]);
    controle.hideSheet();
  }

  var historico = ss.getSheetByName(FECHAMENTO_HORAS_HISTORICO);
  if (!historico) {
    historico = ss.insertSheet(FECHAMENTO_HORAS_HISTORICO);
    historico.appendRow([
      'ID', 'ANO', 'MES', 'ACAO', 'USUARIO', 'DATA',
      'VERSAO_ANTERIOR', 'VERSAO_NOVA', 'SNAPSHOT_ANTERIOR'
    ]);
    historico.hideSheet();
  }
  return ss;
}

function criarAbaFechamentoHoras_(ano, mes) {
  var ss = planilhaFechamentoHoras_();
  var nome = nomeAbaFechamentoHoras_(ano, mes);
  var sheet = ss.getSheetByName(nome);
  if (sheet) return sheet;

  sheet = ss.insertSheet(nome);
  sheet.getRange('A2').setValue('Tabela_1');
  sheet.getRange('A3:D3').setValues([[
    'Base', 'Tipo', 'Horas Voadas', 'Cotista Horas'
  ]]);
  sheet.getRange('F2').setValue('Tabela_2');
  sheet.getRange('F3:G3').setValues([['Métrica', 'Valor']]);
  sheet.getRange(4, 1, FECHAMENTO_HORAS_AERONAVES.length, 4).setValues(
    FECHAMENTO_HORAS_AERONAVES.map(function(item) {
      return [item.base, item.tipo, 0, item.cotista ? 0 : ''];
    })
  );
  sheet.getRange(4, 6, FECHAMENTO_HORAS_METRICAS.length, 2).setValues(
    FECHAMENTO_HORAS_METRICAS.map(function(nomeMetrica) {
      return [nomeMetrica, 0];
    })
  );
  return sheet;
}

function mapaStatusFechamentoHoras_(ss) {
  var sheet = ss.getSheetByName(FECHAMENTO_HORAS_CONTROLE);
  var data = sheet.getDataRange().getValues();
  var mapa = {};
  for (var i = 1; i < data.length; i++) {
    var chave = [Number(data[i][0]), Number(data[i][1])].join('|');
    mapa[chave] = {
      linha: i + 1,
      fechado: valorBooleano(data[i][2]),
      versao: Number(data[i][3]) || 0,
      atualizadoPor: String(data[i][4] || ''),
      atualizadoEm: data[i][5] || ''
    };
  }
  return mapa;
}

function statusVazioFechamentoHoras_() {
  return {
    linha: 0,
    fechado: false,
    versao: 0,
    atualizadoPor: '',
    atualizadoEm: ''
  };
}

function obterStatusFechamentoHoras_(ano, mes, ss, mapaStatus) {
  ss = ss || garantirEstruturaFechamentoHoras_();
  mapaStatus = mapaStatus || mapaStatusFechamentoHoras_(ss);
  return mapaStatus[[Number(ano), Number(mes)].join('|')] ||
    statusVazioFechamentoHoras_();
}

function salvarStatusFechamentoHoras_(ano, mes, fechado, versao, usuario, agora, ss, mapaStatus) {
  ss = ss || garantirEstruturaFechamentoHoras_();
  var sheet = ss.getSheetByName(FECHAMENTO_HORAS_CONTROLE);
  var status = obterStatusFechamentoHoras_(ano, mes, ss, mapaStatus);
  var valores = [
    ano, mes, fechado, versao,
    String(usuario.email || usuario.pac || ''), agora
  ];
  if (status.linha) {
    sheet.getRange(status.linha, 1, 1, valores.length).setValues([valores]);
  } else {
    sheet.appendRow(valores);
  }
}

function lerMesFechamentoHoras_(ano, mes, ss, mapaStatus) {
  ss = ss || garantirEstruturaFechamentoHoras_();
  var sheet = ss.getSheetByName(nomeAbaFechamentoHoras_(ano, mes));
  var horas = [];
  var metricas = [];

  if (sheet) {
    horas = sheet.getRange('A4:D30').getValues()
      .filter(function(row) {
        return row[0] || row[1] || row[2] || row[3];
      })
      .map(function(row) {
        var tipo = String(row[1] || '').trim()
          .replace('AATD SJK', 'SM-SJK')
          .replace('AATD CPQ', 'SM-CPQ');
        return {
          base: String(row[0] || ''),
          tipo: tipo,
          horas: Math.round(numeroFechamentoHoras_(row[2]) * 10) / 10,
          cotista_horas: row[3] === '' || row[3] === null
            ? null
            : Math.round(numeroFechamentoHoras_(row[3]) * 10) / 10
        };
      });

    metricas = sheet.getRange('F4:G30').getValues()
      .filter(function(row) {
        return String(row[0] || '').trim() !== '' && isNaN(row[0]);
      })
      .map(function(row) {
        return {
          metrica: String(row[0]).trim(),
          valor: Math.max(0, numeroFechamentoHoras_(row[1]))
        };
      });
  }

  if (!horas.length) {
    horas = FECHAMENTO_HORAS_AERONAVES.map(function(item) {
      return {
        base: item.base,
        tipo: item.tipo,
        horas: 0,
        cotista_horas: item.cotista ? 0 : null
      };
    });
  }
  if (!metricas.length) {
    metricas = FECHAMENTO_HORAS_METRICAS.map(function(nomeMetrica) {
      return { metrica: nomeMetrica, valor: 0 };
    });
  }

  var status = obterStatusFechamentoHoras_(ano, mes, ss, mapaStatus);
  return {
    ano: Number(ano),
    mes: Number(mes),
    horas: horas,
    metricas: metricas,
    fechado: status.fechado,
    versao: status.versao,
    atualizadoPor: status.atualizadoPor,
    atualizadoEm: status.atualizadoEm
  };
}

function valorMetricaFechamentoHoras_(metricas, nome) {
  var alvo = textoNormalizadoFechamentoHoras_(nome);
  for (var i = 0; i < metricas.length; i++) {
    if (textoNormalizadoFechamentoHoras_(metricas[i].metrica) === alvo) {
      return numeroFechamentoHoras_(metricas[i].valor);
    }
  }
  return 0;
}

function resumirMesFechamentoHoras_(item) {
  var total = 0;
  var sjk = 0;
  var cpq = 0;
  var simulador = 0;
  var cotista = 0;
  item.horas.forEach(function(row) {
    var horas = numeroFechamentoHoras_(row.horas);
    total += horas;
    if (String(row.base).toUpperCase() === 'SJK') sjk += horas;
    if (String(row.base).toUpperCase() === 'CPQ') cpq += horas;
    if (String(row.tipo).indexOf('SM-') === 0) simulador += horas;
    if (row.cotista_horas !== null && row.cotista_horas !== '') {
      cotista += numeroFechamentoHoras_(row.cotista_horas);
    }
  });
  return {
    total: Math.round(total * 10) / 10,
    sjk: Math.round(sjk * 10) / 10,
    cpq: Math.round(cpq * 10) / 10,
    simulador: Math.round(simulador * 10) / 10,
    cotista: Math.round(cotista * 10) / 10,
    alunosNovos: valorMetricaFechamentoHoras_(item.metricas, 'Alunos Novos'),
    cheques: valorMetricaFechamentoHoras_(item.metricas, 'Número de Cheques'),
    voosSolos: valorMetricaFechamentoHoras_(item.metricas, 'Número de Voos Solos'),
    temDados: total > 0 || item.metricas.some(function(metrica) {
      return numeroFechamentoHoras_(metrica.valor) > 0;
    }),
    fechado: item.fechado
  };
}

function listarHistoricoFechamentoHoras_(ano, mes, ss) {
  ss = ss || garantirEstruturaFechamentoHoras_();
  var sheet = ss.getSheetByName(FECHAMENTO_HORAS_HISTORICO);
  var data = sheet.getDataRange().getValues();
  var lista = [];
  for (var i = data.length - 1; i >= 1 && lista.length < 12; i--) {
    var row = data[i];
    if (Number(row[1]) !== Number(ano) || Number(row[2]) !== Number(mes)) continue;
    lista.push({
      id: String(row[0] || ''),
      acao: String(row[3] || ''),
      usuario: String(row[4] || ''),
      data: row[5] || '',
      versaoAnterior: Number(row[6]) || 0,
      versaoNova: Number(row[7]) || 0
    });
  }
  return lista;
}

function listarFechamentoHoras(ano, mes) {
  var competencia = validarCompetenciaFechamentoHoras_(ano, mes);
  var ss = garantirEstruturaFechamentoHoras_();
  var mapaStatus = mapaStatusFechamentoHoras_(ss);
  var meses = {};
  for (var m = 1; m <= 12; m++) {
    meses[m] = resumirMesFechamentoHoras_(
      lerMesFechamentoHoras_(competencia.ano, m, ss, mapaStatus)
    );
  }
  var selecionado = lerMesFechamentoHoras_(
    competencia.ano,
    competencia.mes,
    ss,
    mapaStatus
  );
  selecionado.resumo = resumirMesFechamentoHoras_(selecionado);
  return {
    ano: competencia.ano,
    mes: competencia.mes,
    meses: meses,
    selecionado: selecionado,
    historico: listarHistoricoFechamentoHoras_(
      competencia.ano,
      competencia.mes,
      ss
    )
  };
}

function validarHorasFechamento_(horas) {
  if (!Array.isArray(horas)) throw new Error('Lista de horas inválida.');
  var porTipo = {};
  horas.forEach(function(item) {
    porTipo[String(item.tipo || '').trim().toUpperCase()] = item;
  });

  return FECHAMENTO_HORAS_AERONAVES.map(function(modelo) {
    var item = porTipo[modelo.tipo] || {};
    var horasNumero = numeroFechamentoHoras_(item.horas);
    var cotistaNumero = modelo.cotista
      ? numeroFechamentoHoras_(item.cotista_horas)
      : null;
    if (horasNumero < 0 || horasNumero > 750) {
      throw new Error('Horas inválidas para ' + modelo.tipo + '.');
    }
    if (cotistaNumero !== null && (cotistaNumero < 0 || cotistaNumero > horasNumero)) {
      throw new Error('Horas de cotista inválidas para ' + modelo.tipo + '.');
    }
    return {
      base: modelo.base,
      tipo: modelo.tipo,
      horas: Math.round(horasNumero * 10) / 10,
      cotista_horas: cotistaNumero === null
        ? null
        : Math.round(cotistaNumero * 10) / 10
    };
  });
}

function validarMetricasFechamento_(metricas) {
  if (!Array.isArray(metricas)) throw new Error('Lista de métricas inválida.');
  var porNome = {};
  metricas.forEach(function(item) {
    porNome[textoNormalizadoFechamentoHoras_(item.metrica)] = item;
  });
  return FECHAMENTO_HORAS_METRICAS.map(function(nome) {
    var item = porNome[textoNormalizadoFechamentoHoras_(nome)] || {};
    var valor = numeroFechamentoHoras_(item.valor);
    if (valor < 0 || valor > 100000) throw new Error('Métrica inválida: ' + nome + '.');
    return { metrica: nome, valor: Math.round(valor * 10) / 10 };
  });
}

function registrarHistoricoFechamentoHoras_(ano, mes, acao, usuario, anterior, versaoAnterior, versaoNova) {
  var sheet = planilhaFechamentoHoras_().getSheetByName(FECHAMENTO_HORAS_HISTORICO);
  sheet.appendRow([
    gerarId(),
    ano,
    mes,
    acao,
    String(usuario.email || usuario.pac || ''),
    new Date(),
    versaoAnterior,
    versaoNova,
    anterior ? JSON.stringify(anterior) : ''
  ]);
}

function salvarFechamentoHoras(dados, usuario) {
  var competencia = validarCompetenciaFechamentoHoras_(dados.ano, dados.mes);
  var horas = validarHorasFechamento_(dados.horas);
  var metricas = validarMetricasFechamento_(dados.metricas);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    garantirEstruturaFechamentoHoras_();
    var status = obterStatusFechamentoHoras_(competencia.ano, competencia.mes);
    var versaoEsperada = Number(dados.versao) || 0;
    if (status.versao !== versaoEsperada) {
      throw new Error('Este mês foi alterado por outro usuário. Recarregue antes de salvar.');
    }
    if (status.fechado) {
      throw new Error('O mês está fechado. Reabra o mês antes de editar.');
    }

    var anterior = lerMesFechamentoHoras_(competencia.ano, competencia.mes);
    var sheet = criarAbaFechamentoHoras_(competencia.ano, competencia.mes);
    sheet.getRange('A2:D30').clearContent();
    sheet.getRange('F2:G30').clearContent();
    sheet.getRange('A2').setValue('Tabela_1');
    sheet.getRange('A3:D3').setValues([[
      'Base', 'Tipo', 'Horas Voadas', 'Cotista Horas'
    ]]);
    sheet.getRange(4, 1, horas.length, 4).setValues(
      horas.map(function(item) {
        return [
          item.base,
          item.tipo,
          item.horas,
          item.cotista_horas === null ? '' : item.cotista_horas
        ];
      })
    );
    sheet.getRange('F2').setValue('Tabela_2');
    sheet.getRange('F3:G3').setValues([['Métrica', 'Valor']]);
    sheet.getRange(4, 6, metricas.length, 2).setValues(
      metricas.map(function(item) {
        return [item.metrica, item.valor];
      })
    );

    var novaVersao = status.versao + 1;
    var agora = new Date();
    salvarStatusFechamentoHoras_(
      competencia.ano,
      competencia.mes,
      false,
      novaVersao,
      usuario,
      agora
    );
    registrarHistoricoFechamentoHoras_(
      competencia.ano,
      competencia.mes,
      'SALVAMENTO',
      usuario,
      anterior,
      status.versao,
      novaVersao
    );
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return listarFechamentoHoras(competencia.ano, competencia.mes);
}

function alterarStatusFechamentoHoras(dados, usuario) {
  var competencia = validarCompetenciaFechamentoHoras_(dados.ano, dados.mes);
  var fechado = valorBooleano(dados.fechado);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    garantirEstruturaFechamentoHoras_();
    var status = obterStatusFechamentoHoras_(competencia.ano, competencia.mes);
    var versaoEsperada = Number(dados.versao) || 0;
    if (status.versao !== versaoEsperada) {
      throw new Error('Este mês foi alterado por outro usuário. Recarregue antes de continuar.');
    }
    if (status.fechado === fechado) {
      return listarFechamentoHoras(competencia.ano, competencia.mes);
    }

    var novaVersao = status.versao + 1;
    salvarStatusFechamentoHoras_(
      competencia.ano,
      competencia.mes,
      fechado,
      novaVersao,
      usuario,
      new Date()
    );
    registrarHistoricoFechamentoHoras_(
      competencia.ano,
      competencia.mes,
      fechado ? 'FECHAMENTO' : 'REABERTURA',
      usuario,
      null,
      status.versao,
      novaVersao
    );
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return listarFechamentoHoras(competencia.ano, competencia.mes);
}

/**
 * Teste manual no editor do Apps Script.
 * Confirma a autorização e a leitura da planilha de fechamento.
 */
function testarFechamentoHoras() {
  return listarFechamentoHoras(2026, 5);
}
