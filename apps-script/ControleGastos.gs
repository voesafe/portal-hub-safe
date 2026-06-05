// ============================================================
// ControleGastos.gs - Controle mensal de gastos por base
// SAFE Escola de Aviacao | Modulo Financeiro
// ============================================================

var BASES_GASTOS = ['SJK', 'CPN'];

function garantirEstruturaControleGastos_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  var categorias = ss.getSheetByName(SHEETS.CATEGORIAS_GASTOS);
  if (!categorias) {
    categorias = ss.insertSheet(SHEETS.CATEGORIAS_GASTOS);
    categorias.appendRow([
      'ID', 'NOME', 'ATIVA', 'CRIADO_POR', 'CRIADO_EM',
      'ATUALIZADO_POR', 'ATUALIZADO_EM'
    ]);
  }

  var gastos = ss.getSheetByName(SHEETS.GASTOS_MENSAIS);
  if (!gastos) {
    gastos = ss.insertSheet(SHEETS.GASTOS_MENSAIS);
    gastos.appendRow([
      'ID', 'ANO', 'MES', 'BASE', 'CATEGORIA_ID', 'VALOR',
      'OBSERVACAO', 'ATIVO', 'CRIADO_POR', 'CRIADO_EM',
      'ATUALIZADO_POR', 'ATUALIZADO_EM', 'EXCLUIDO_POR', 'EXCLUIDO_EM'
    ]);
  }

  var horas = ss.getSheetByName(SHEETS.HORAS_VOADAS_BASE);
  if (!horas) {
    horas = ss.insertSheet(SHEETS.HORAS_VOADAS_BASE);
    horas.appendRow([
      'ID', 'ANO', 'MES', 'BASE', 'HORAS',
      'ATUALIZADO_POR', 'ATUALIZADO_EM'
    ]);
  }
}

function normalizarCategoriaGasto_(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function numeroGasto_(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
  var texto = String(valor).replace(/R\$/g, '').replace(/\s/g, '');
  if (texto.indexOf(',') !== -1) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  }
  var numero = Number(texto);
  return isNaN(numero) ? 0 : numero;
}

function validarCompetenciaGasto_(ano, mes) {
  ano = Number(ano);
  mes = Number(mes);
  if (!ano || ano < 2020 || ano > 2100) throw new Error('Ano inválido.');
  if (!mes || mes < 1 || mes > 12) throw new Error('Mês inválido.');
  return { ano: ano, mes: mes };
}

function validarBaseGasto_(base) {
  base = String(base || '').trim().toUpperCase();
  if (BASES_GASTOS.indexOf(base) === -1) throw new Error('Base inválida.');
  return base;
}

function listarCategoriasGastos_(incluirInativas) {
  garantirEstruturaControleGastos_();
  var sheet = getSheet(SHEETS.CATEGORIAS_GASTOS);
  var data = sheet.getDataRange().getValues();
  var lista = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var ativa = valorBooleano(row[2]);
    if (!incluirInativas && !ativa) continue;
    lista.push({
      id: String(row[0]),
      nome: String(row[1] || ''),
      ativa: ativa
    });
  }

  lista.sort(function(a, b) {
    if (a.ativa !== b.ativa) return a.ativa ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return lista;
}

function listarControleGastos(ano, mes) {
  garantirEstruturaControleGastos_();
  ano = Number(ano) || new Date().getFullYear();
  mes = Number(mes) || new Date().getMonth() + 1;

  var categorias = listarCategoriasGastos_(true);
  var categoriaPorId = {};
  categorias.forEach(function(categoria) {
    categoriaPorId[categoria.id] = categoria;
  });

  var meses = {};
  for (var m = 1; m <= 12; m++) {
    meses[m] = {
      SJK: { total: 0, horas: null, custoHora: null },
      CPN: { total: 0, horas: null, custoHora: null },
      total: 0,
      horas: 0,
      custoHora: null
    };
  }

  var valoresMes = {};
  categorias.forEach(function(categoria) {
    valoresMes[categoria.id] = { SJK: 0, CPN: 0 };
  });

  var totaisCategoriaMes = {};
  var gastosSheet = getSheet(SHEETS.GASTOS_MENSAIS);
  var gastosData = gastosSheet.getDataRange().getValues();

  for (var i = 1; i < gastosData.length; i++) {
    var row = gastosData[i];
    if (!row[0] || !valorBooleano(row[7])) continue;
    if (Number(row[1]) !== ano) continue;

    var mesRow = Number(row[2]);
    var base = String(row[3] || '').toUpperCase();
    var categoriaId = String(row[4] || '');
    var valor = numeroGasto_(row[5]);
    if (!meses[mesRow] || BASES_GASTOS.indexOf(base) === -1) continue;

    meses[mesRow][base].total += valor;
    meses[mesRow].total += valor;
    if (!valoresMes[categoriaId]) {
      valoresMes[categoriaId] = { SJK: 0, CPN: 0 };
    }
    if (mesRow === mes) {
      valoresMes[categoriaId][base] += valor;
      totaisCategoriaMes[categoriaId] =
        (totaisCategoriaMes[categoriaId] || 0) + valor;
    }
  }

  var horasMes = { SJK: null, CPN: null };
  var horasSheet = getSheet(SHEETS.HORAS_VOADAS_BASE);
  var horasData = horasSheet.getDataRange().getValues();
  for (var h = 1; h < horasData.length; h++) {
    var horaRow = horasData[h];
    if (!horaRow[0] || Number(horaRow[1]) !== ano) continue;

    var mesHora = Number(horaRow[2]);
    var baseHora = String(horaRow[3] || '').toUpperCase();
    if (!meses[mesHora] || BASES_GASTOS.indexOf(baseHora) === -1) continue;

    var horas = horaRow[4] === '' || horaRow[4] === null
      ? null
      : Number(horaRow[4]);
    meses[mesHora][baseHora].horas = horas;
    if (mesHora === mes) horasMes[baseHora] = horas;
  }

  Object.keys(meses).forEach(function(chaveMes) {
    var item = meses[chaveMes];
    var horasTotais = 0;
    var temHorasSjk = item.SJK.horas !== null && item.SJK.horas > 0;
    var temHorasCpn = item.CPN.horas !== null && item.CPN.horas > 0;

    if (temHorasSjk) {
      item.SJK.custoHora = item.SJK.total / item.SJK.horas;
      horasTotais += item.SJK.horas;
    }
    if (temHorasCpn) {
      item.CPN.custoHora = item.CPN.total / item.CPN.horas;
      horasTotais += item.CPN.horas;
    }

    item.horas = horasTotais;
    if (horasTotais > 0 && temHorasSjk && temHorasCpn) {
      item.custoHora = item.total / horasTotais;
    }
  });

  var categoriasVisiveis = categorias.filter(function(categoria) {
    var temValor = valoresMes[categoria.id] &&
      (valoresMes[categoria.id].SJK > 0 || valoresMes[categoria.id].CPN > 0);
    return categoria.ativa || temValor;
  });

  var categoriasResumo = categorias.map(function(categoria) {
    return {
      id: categoria.id,
      nome: categoria.nome,
      valor: totaisCategoriaMes[categoria.id] || 0
    };
  }).filter(function(item) {
    return item.valor > 0;
  }).sort(function(a, b) {
    return b.valor - a.valor;
  });

  return {
    ano: ano,
    mes: mes,
    bases: BASES_GASTOS,
    categorias: categoriasVisiveis,
    todasCategorias: categorias,
    valores: valoresMes,
    horas: horasMes,
    meses: meses,
    categoriasResumo: categoriasResumo
  };
}

function salvarFechamentoGastos(dados, usuario) {
  garantirEstruturaControleGastos_();
  var competencia = validarCompetenciaGasto_(dados.ano, dados.mes);
  var valores = Array.isArray(dados.valores) ? dados.valores : [];
  var horas = dados.horas || {};
  var agora = new Date();
  var email = String(usuario.email || usuario.pac || '');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var categorias = listarCategoriasGastos_(true);
    var categoriasValidas = {};
    categorias.forEach(function(categoria) {
      categoriasValidas[categoria.id] = true;
    });

    var sheet = getSheet(SHEETS.GASTOS_MENSAIS);
    var data = sheet.getDataRange().getValues();
    var existentes = {};
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      var chave = [row[1], row[2], row[3], row[4]].join('|');
      existentes[chave] = i + 1;
    }

    valores.forEach(function(item) {
      var base = validarBaseGasto_(item.base);
      var categoriaId = String(item.categoriaId || '');
      if (!categoriasValidas[categoriaId]) throw new Error('Categoria inválida.');
      var valor = Math.max(0, numeroGasto_(item.valor));
      var chave = [competencia.ano, competencia.mes, base, categoriaId].join('|');
      var rowIndex = existentes[chave];

      if (rowIndex) {
        sheet.getRange(rowIndex, 6).setValue(valor);
        sheet.getRange(rowIndex, 8).setValue(valor > 0);
        sheet.getRange(rowIndex, 11).setValue(email);
        sheet.getRange(rowIndex, 12).setValue(agora);
        sheet.getRange(rowIndex, 13).setValue(valor > 0 ? '' : email);
        sheet.getRange(rowIndex, 14).setValue(valor > 0 ? '' : agora);
      } else if (valor > 0) {
        sheet.appendRow([
          gerarId(), competencia.ano, competencia.mes, base, categoriaId,
          valor, '', true, email, agora, email, agora, '', ''
        ]);
      }
    });

    var horasSheet = getSheet(SHEETS.HORAS_VOADAS_BASE);
    var horasData = horasSheet.getDataRange().getValues();
    BASES_GASTOS.forEach(function(base) {
      var valorHoras = horas[base];
      var horasNumero = '';
      if (valorHoras !== '' && valorHoras !== null && valorHoras !== undefined) {
        var horasConvertidas = Number(valorHoras);
        if (!isFinite(horasConvertidas) || horasConvertidas < 0) {
          throw new Error('Horas voadas inválidas para a base ' + base + '.');
        }
        horasNumero = Math.round(horasConvertidas * 10) / 10;
      }
      var rowHoras = 0;

      for (var h = 1; h < horasData.length; h++) {
        if (Number(horasData[h][1]) === competencia.ano &&
            Number(horasData[h][2]) === competencia.mes &&
            String(horasData[h][3]).toUpperCase() === base) {
          rowHoras = h + 1;
          break;
        }
      }

      if (rowHoras) {
        horasSheet.getRange(rowHoras, 5).setValue(horasNumero);
        horasSheet.getRange(rowHoras, 6).setValue(email);
        horasSheet.getRange(rowHoras, 7).setValue(agora);
      } else if (horasNumero !== '') {
        horasSheet.appendRow([
          gerarId(), competencia.ano, competencia.mes, base,
          horasNumero, email, agora
        ]);
      }
    });
  } finally {
    lock.releaseLock();
  }

  return listarControleGastos(competencia.ano, competencia.mes);
}

function criarCategoriaGasto(dados, usuario) {
  garantirEstruturaControleGastos_();
  var nome = String(dados.nome || '').trim();
  if (!nome) throw new Error('Nome da categoria é obrigatório.');

  var categorias = listarCategoriasGastos_(true);
  var normalizado = normalizarCategoriaGasto_(nome);
  var duplicada = categorias.some(function(categoria) {
    return normalizarCategoriaGasto_(categoria.nome) === normalizado;
  });
  if (duplicada) throw new Error('Já existe uma categoria com esse nome.');

  var agora = new Date();
  var email = String(usuario.email || usuario.pac || '');
  getSheet(SHEETS.CATEGORIAS_GASTOS).appendRow([
    gerarId(), nome, true, email, agora, email, agora
  ]);
  return listarCategoriasGastos_(true);
}

function editarCategoriaGasto(dados, usuario) {
  garantirEstruturaControleGastos_();
  var id = String(dados.id || '');
  var nome = String(dados.nome || '').trim();
  if (!id || !nome) throw new Error('Categoria e nome são obrigatórios.');

  var sheet = getSheet(SHEETS.CATEGORIAS_GASTOS);
  var data = sheet.getDataRange().getValues();
  var normalizado = normalizarCategoriaGasto_(nome);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== id &&
        normalizarCategoriaGasto_(data[i][1]) === normalizado) {
      throw new Error('Já existe uma categoria com esse nome.');
    }
  }

  for (var j = 1; j < data.length; j++) {
    if (String(data[j][0]) !== id) continue;
    sheet.getRange(j + 1, 2).setValue(nome);
    sheet.getRange(j + 1, 6).setValue(String(usuario.email || usuario.pac || ''));
    sheet.getRange(j + 1, 7).setValue(new Date());
    return listarCategoriasGastos_(true);
  }
  throw new Error('Categoria não encontrada.');
}

function alterarStatusCategoriaGasto(dados, usuario) {
  garantirEstruturaControleGastos_();
  var id = String(dados.id || '');
  var ativa = valorBooleano(dados.ativa);
  var sheet = getSheet(SHEETS.CATEGORIAS_GASTOS);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== id) continue;
    sheet.getRange(i + 1, 3).setValue(ativa);
    sheet.getRange(i + 1, 6).setValue(String(usuario.email || usuario.pac || ''));
    sheet.getRange(i + 1, 7).setValue(new Date());
    return listarCategoriasGastos_(true);
  }
  throw new Error('Categoria não encontrada.');
}

function garantirCategoriasIniciais_() {
  var nomes = [
    'Hangaragem',
    'Combustível',
    'Limpeza',
    'Locação de container',
    'Aluguel de alojamento',
    'Aluguel de carretinha'
  ];
  var existentes = listarCategoriasGastos_(true);
  var porNome = {};
  existentes.forEach(function(categoria) {
    porNome[normalizarCategoriaGasto_(categoria.nome)] = categoria.id;
  });

  var sheet = getSheet(SHEETS.CATEGORIAS_GASTOS);
  nomes.forEach(function(nome) {
    var chave = normalizarCategoriaGasto_(nome);
    if (porNome[chave]) return;
    var id = gerarId();
    sheet.appendRow([
      id, nome, true, 'importacao@voesafe.com.br', new Date(),
      'importacao@voesafe.com.br', new Date()
    ]);
    porNome[chave] = id;
  });
  return porNome;
}

function salvarGastoImportado_(ano, mes, base, categoriaId, valor) {
  valor = numeroGasto_(valor);
  if (valor <= 0) return;
  var sheet = getSheet(SHEETS.GASTOS_MENSAIS);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (Number(data[i][1]) === Number(ano) &&
        Number(data[i][2]) === Number(mes) &&
        String(data[i][3]).toUpperCase() === base &&
        String(data[i][4]) === String(categoriaId)) {
      return;
    }
  }

  var agora = new Date();
  sheet.appendRow([
    gerarId(), ano, mes, base, categoriaId, valor,
    'Importação da planilha inicial', true,
    'importacao@voesafe.com.br', agora,
    'importacao@voesafe.com.br', agora, '', ''
  ]);
}

function salvarHorasImportadas_(ano, mes, base, horas) {
  if (horas === null || horas === undefined || horas === '') return;
  var sheet = getSheet(SHEETS.HORAS_VOADAS_BASE);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (Number(data[i][1]) === Number(ano) &&
        Number(data[i][2]) === Number(mes) &&
        String(data[i][3]).toUpperCase() === base) {
      return;
    }
  }

  sheet.appendRow([
    gerarId(), ano, mes, base, Number(horas),
    'importacao@voesafe.com.br', new Date()
  ]);
}

function configurarElaineFinanceiro_() {
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var emailAlvo = 'elaine.souza@voesafe.com.br';

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][3]).trim().toLowerCase() !== emailAlvo) continue;
    sheet.getRange(i + 1, 6).setValue('financeiro');
    return true;
  }
  return false;
}

/**
 * Execute uma vez no Apps Script após publicar esta versão.
 * É idempotente: não duplica dados se for executada novamente.
 */
function inicializarControleGastos() {
  garantirEstruturaControleGastos_();
  var categorias = garantirCategoriasIniciais_();
  var id = function(nome) {
    return categorias[normalizarCategoriaGasto_(nome)];
  };

  var dados = [
    ['SJK', 'Hangaragem', [9315.43, 0, 14631, 14632.80, 14566.30, 14644.04]],
    ['SJK', 'Locação de container', [2500, 2500, 2500, 2500, 2500, 0]],
    ['SJK', 'Combustível', [52350, 26250, 26550, 57750, 31200, 33450]],
    ['SJK', 'Limpeza', [2911.93, 3140.02, 3775.26, 1562.61, 4751.77, 563.15]],
    ['SJK', 'Aluguel de alojamento', [4000, 104.46, 4104.43, 4104.43, 4104.43, 4000]],
    ['CPN', 'Hangaragem', [8329.15, 8329.15, 8329.15, 11279.15, 7860, 1275]],
    ['CPN', 'Combustível', [21973.50, 17814.40, 17959.20, 37877.25, 59452.25, 0]],
    ['CPN', 'Limpeza', [500, 500, 500, 400, 400, 0]],
    ['CPN', 'Aluguel de carretinha', [5800, 5050, 5050, 5050, 5050, 0]]
  ];

  dados.forEach(function(item) {
    item[2].forEach(function(valor, index) {
      salvarGastoImportado_(2026, index + 1, item[0], id(item[1]), valor);
    });
  });

  [181, 226, 244, 329].forEach(function(horas, index) {
    salvarHorasImportadas_(2026, index + 1, 'SJK', horas);
  });
  [193, 175, 252, 307].forEach(function(horas, index) {
    salvarHorasImportadas_(2026, index + 1, 'CPN', horas);
  });

  return {
    ok: true,
    usuarioElaineAtualizado: configurarElaineFinanceiro_(),
    mensagem: 'Controle de gastos inicializado com dados de janeiro a junho de 2026.'
  };
}
