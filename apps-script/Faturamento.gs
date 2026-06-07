// ============================================================
// Faturamento.gs - Faturamento por canal (so admin)
// SAFE Escola de Aviacao | SAFE Hub
// ============================================================

var CANAIS = ['Lojinha', 'Safe Academy', 'Azul Pontos', 'Lito Academy', 'Vendas Comercial'];

var MESES_FATURAMENTO = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

function normalizarTextoFaturamento(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .replace(/[áàãâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòõôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

function canalFaturamento(valor) {
  var alvo = normalizarTextoFaturamento(valor);
  for (var i = 0; i < CANAIS.length; i++) {
    if (normalizarTextoFaturamento(CANAIS[i]) === alvo) return CANAIS[i];
  }
  return null;
}

function mesFaturamento(valor) {
  var nome = normalizarTextoFaturamento(valor);
  return MESES_FATURAMENTO[nome] || null;
}

function numeroFaturamento(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return valor;

  var texto = String(valor)
    .replace(/R\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  var n = Number(texto);
  return isNaN(n) ? 0 : n;
}

function detectarMatrizFaturamento(data, ano) {
  var matriz = null;

  for (var r = 0; r < data.length; r++) {
    var cols = [];
    for (var c = 0; c < data[r].length; c++) {
      var mes = mesFaturamento(data[r][c]);
      if (mes) cols.push({ col: c, mes: mes });
    }

    if (cols.length >= 2) {
      matriz = { headerRow: r, cols: cols };
      break;
    }
  }

  if (!matriz) return null;

  var anoBase = Number(ano) || new Date().getFullYear();
  var anoAtual = new Date().getFullYear();
  var wrap = -1;

  for (var i = 1; i < matriz.cols.length; i++) {
    if (matriz.cols[i - 1].mes > matriz.cols[i].mes) {
      wrap = i;
      break;
    }
  }

  matriz.cols.forEach(function(item, idx) {
    item.ano = anoBase;
    if (wrap > 0) {
      // Ex.: DEZEMBRO, JANEIRO, FEVEREIRO...
      // Para o ano atual, meses antes da virada pertencem ao ano anterior.
      // Para anos passados, meses antes da virada pertencem ao ano selecionado.
      item.ano = anoBase < anoAtual
        ? (idx < wrap ? anoBase : anoBase + 1)
        : (idx < wrap ? anoBase - 1 : anoBase);
    }
  });

  return matriz;
}

function aplicarMatrizFaturamento(meses, data, ano, origemMatriz) {
  var matriz = detectarMatrizFaturamento(data, ano);
  if (!matriz) return;

  for (var r = matriz.headerRow + 1; r < data.length; r++) {
    var canal = null;

    for (var c = 0; c < data[r].length; c++) {
      canal = canalFaturamento(data[r][c]);
      if (canal) break;
    }

    if (!canal) continue;

    matriz.cols.forEach(function(info) {
      if (ano && Number(info.ano) !== Number(ano)) return;

      var bruto = data[r][info.col];
      if (bruto === '' || bruto === null || bruto === undefined) return;
      if (!meses[info.mes]) return;

      meses[info.mes][canal] = numeroFaturamento(bruto);
      if (!origemMatriz[info.mes]) origemMatriz[info.mes] = {};
      origemMatriz[info.mes][canal] = true;
    });
  }
}

function localizarCelulaMatrizFaturamento(data, mes, ano, canal) {
  var matriz = detectarMatrizFaturamento(data, ano);
  if (!matriz) return null;

  var colInfo = null;
  matriz.cols.forEach(function(info) {
    if (Number(info.mes) === Number(mes) && (!ano || Number(info.ano) === Number(ano))) {
      colInfo = info;
    }
  });

  if (!colInfo) return null;

  for (var r = matriz.headerRow + 1; r < data.length; r++) {
    for (var c = 0; c < data[r].length; c++) {
      if (canalFaturamento(data[r][c]) === canal) {
        return { row: r + 1, col: colInfo.col + 1 };
      }
    }
  }

  return null;
}

/**
 * Lista faturamento por canal com filtro de mes/ano
 */
function listarFaturamento(mes, ano) {
  var sheet = getSheet(SHEETS.FATURAMENTO);
  var data = sheet.getDataRange().getValues();
  var registros = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    if (mes && Number(row[1]) !== Number(mes)) continue;
    if (ano && Number(row[2]) !== Number(ano)) continue;

    registros.push({
      id:           row[0],
      mes:          row[1],
      ano:          row[2],
      canal:        canalFaturamento(row[3]) || String(row[3]),
      valor:        row[4],
      atualizadoEm: row[5]
    });
  }

  return registros;
}

/**
 * Salva ou atualiza faturamento de um canal em um mes/ano
 */
function salvarFaturamento(mes, ano, canal, valor) {
  var sheet = getSheet(SHEETS.FATURAMENTO);
  var data = sheet.getDataRange().getValues();
  var valorNumerico = Number(valor) || 0;
  var celulaMatriz = localizarCelulaMatrizFaturamento(data, mes, ano, canal);
  var matrizAtualizada = false;

  if (celulaMatriz) {
    sheet.getRange(celulaMatriz.row, celulaMatriz.col).setValue(valorNumerico);
    matrizAtualizada = true;
  }

  // Verifica se ja existe registro para esse mes/ano/canal
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (Number(row[1]) === Number(mes) &&
        Number(row[2]) === Number(ano) &&
        String(row[3]).toLowerCase() === String(canal).toLowerCase()) {
      sheet.getRange(i + 1, 5).setValue(valorNumerico);
      sheet.getRange(i + 1, 6).setValue(new Date());
      return { acao: 'atualizado', matrizAtualizada: matrizAtualizada };
    }
  }

  sheet.appendRow([
    gerarId(),
    Number(mes),
    Number(ano),
    canal,
    valorNumerico,
    new Date()
  ]);

  return { acao: 'criado', matrizAtualizada: matrizAtualizada };
}

/**
 * Exclui um registro de faturamento pelo ID
 */
function excluirFaturamento(id) {
  var sheet = getSheet(SHEETS.FATURAMENTO);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { excluido: true };
    }
  }

  return { excluido: false, erro: 'Registro não encontrado' };
}

/**
 * Resumo consolidado de faturamento por mes (todos os canais)
 */
function resumoFaturamento(ano) {
  var sheet = getSheet(SHEETS.FATURAMENTO);
  var data = sheet.getDataRange().getValues();

  var vendasSheet = getSheet(SHEETS.VENDAS);
  var vendasData = vendasSheet.getDataRange().getValues();

  var meses = {};
  var origemMatriz = {};

  for (var m = 1; m <= 12; m++) {
    meses[m] = { total: 0 };
    CANAIS.forEach(function(c) { meses[m][c] = 0; });
  }

  // Registros internos criados pelo app continuam funcionando como fallback.
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    if (ano && Number(row[2]) !== Number(ano)) continue;
    var mes = Number(row[1]);
    var canal = canalFaturamento(row[3]);

    if (meses[mes] && canal && canal !== 'Vendas Comercial') {
      meses[mes][canal] = numeroFaturamento(row[4]);
    }
  }

  // A matriz visual da aba FATURAMENTO tem prioridade sobre o fallback interno.
  aplicarMatrizFaturamento(meses, data, ano, origemMatriz);

  // Vendas Comercial vem da matriz quando preenchido; senao, calcula pela aba VENDAS.
  for (var j = 1; j < vendasData.length; j++) {
    var vRow = vendasData[j];
    if (!vRow[0]) continue;
    if (ano && Number(vRow[15]) !== Number(ano)) continue;
    var mesVenda = Number(vRow[14]);

    if (meses[mesVenda] && !(origemMatriz[mesVenda] && origemMatriz[mesVenda]['Vendas Comercial'])) {
      meses[mesVenda]['Vendas Comercial'] += valorVenda(vRow[11]);
    }
  }

  Object.keys(meses).forEach(function(m) {
    var total = 0;
    CANAIS.forEach(function(c) { total += meses[m][c] || 0; });
    meses[m].total = total;
  });

  return meses;
}
