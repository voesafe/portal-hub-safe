// ============================================================
// Concorrencia.gs — CRUD de concorrentes e Preços SAFE
// SAFE Escola de Aviação | SAFE Hub
// ============================================================

// ── Concorrentes ─────────────────────────────────────────────

function listarConcorrencia() {
  var sheet = getSheet(SHEETS.CONCORRENCIA);
  var data = sheet.getDataRange().getValues();
  var lista = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    lista.push(linhaParaConcorrente(row));
  }

  lista.sort(function(a, b) {
    var cursoA = String(a.curso || '').localeCompare(String(b.curso || ''), 'pt-BR');
    if (cursoA !== 0) return cursoA;
    return String(a.concorrente || '').localeCompare(String(b.concorrente || ''), 'pt-BR');
  });

  return lista;
}

function criarConcorrente(dados, pacCadastrou) {
  var sheet = getSheet(SHEETS.CONCORRENCIA);
  var id = gerarId();
  var agora = new Date();

  sheet.appendRow([
    id,
    dados.concorrente  || '',
    dados.curso        || '',
    Number(dados.valorAvista)    || 0,
    Number(dados.valorParcelado) || 0,
    Number(dados.parcelas)       || 0,
    dados.aeronave     || '',
    dados.obs          || '',
    pacCadastrou       || '',
    agora,
    agora
  ]);

  return { id: id };
}

function editarConcorrente(id, dados) {
  var sheet = getSheet(SHEETS.CONCORRENCIA);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(id)) continue;
    var row = i + 1;
    sheet.getRange(row, 2).setValue(dados.concorrente  || '');
    sheet.getRange(row, 3).setValue(dados.curso        || '');
    sheet.getRange(row, 4).setValue(Number(dados.valorAvista)    || 0);
    sheet.getRange(row, 5).setValue(Number(dados.valorParcelado) || 0);
    sheet.getRange(row, 6).setValue(Number(dados.parcelas)       || 0);
    sheet.getRange(row, 7).setValue(dados.aeronave     || '');
    sheet.getRange(row, 8).setValue(dados.obs          || '');
    sheet.getRange(row, 11).setValue(new Date());
    return { atualizado: true };
  }
  return { atualizado: false };
}

function excluirConcorrente(id) {
  var sheet = getSheet(SHEETS.CONCORRENCIA);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { removido: true };
    }
  }
  return { removido: false };
}

function linhaParaConcorrente(row) {
  return {
    id:             row[0],
    concorrente:    row[1],
    curso:          row[2],
    valorAvista:    Number(row[3]) || 0,
    valorParcelado: Number(row[4]) || 0,
    parcelas:       Number(row[5]) || 0,
    aeronave:       row[6],
    obs:            row[7],
    cadastradoPor:  row[8],
    criadoEm:       row[9] ? new Date(row[9]).toISOString().split('T')[0] : '',
    atualizadoEm:   row[10] ? new Date(row[10]).toISOString().split('T')[0] : ''
  };
}

// ── Preços SAFE ───────────────────────────────────────────────

function listarPrecosSafe() {
  var sheet = getSheet(SHEETS.PRECOS_SAFE);
  var data = sheet.getDataRange().getValues();
  var lista = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    lista.push({
      id:             row[0],
      curso:          row[1],
      valorAvista:    Number(row[2]) || 0,
      valorParcelado: Number(row[3]) || 0,
      parcelas:       Number(row[4]) || 0,
      atualizadoEm:   row[5] ? new Date(row[5]).toISOString().split('T')[0] : ''
    });
  }

  lista.sort(function(a, b) {
    return String(a.curso).localeCompare(String(b.curso), 'pt-BR');
  });

  return lista;
}

function salvarPrecoSafe(dados) {
  var sheet = getSheet(SHEETS.PRECOS_SAFE);
  var data = sheet.getDataRange().getValues();
  var agora = new Date();

  // Tenta atualizar se o curso já existir
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === String(dados.curso).trim().toLowerCase()) {
      var row = i + 1;
      sheet.getRange(row, 3).setValue(Number(dados.valorAvista)    || 0);
      sheet.getRange(row, 4).setValue(Number(dados.valorParcelado) || 0);
      sheet.getRange(row, 5).setValue(Number(dados.parcelas)       || 0);
      sheet.getRange(row, 6).setValue(agora);
      return { salvo: true, acao: 'atualizado' };
    }
  }

  // Cria novo registro para esse curso
  sheet.appendRow([
    gerarId(),
    dados.curso,
    Number(dados.valorAvista)    || 0,
    Number(dados.valorParcelado) || 0,
    Number(dados.parcelas)       || 0,
    agora
  ]);

  return { salvo: true, acao: 'criado' };
}
