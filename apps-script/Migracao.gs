function migrarDadosHistoricos() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var destino = ss.getSheetByName('VENDAS');

  var abasOrigem = [
    'Outubro 2025', 'Novembro 2025', 'Dezembro 2025',
    'Janeiro 2026', 'Fevereiro 2026', 'Março 2026',
    'Abril 2026', 'Maio 2026'
  ];

  var totalMigradas = 0;

  abasOrigem.forEach(function(nomeAba) {
    var aba = ss.getSheetByName(nomeAba);
    if (!aba) {
      Logger.log('Aba não encontrada: ' + nomeAba);
      return;
    }

    var dados = aba.getDataRange().getValues();

    for (var i = 5; i < dados.length; i++) {
      var row = dados[i];
      if (!row[1] && !row[3]) continue;

      var dataVenda = row[1] ? new Date(row[1]) : new Date();
      var mes = dataVenda.getMonth() + 1;
      var ano = dataVenda.getFullYear();

      destino.appendRow([
        gerarId(),
        dataVenda,
        row[2] || '',
        row[3] || '',
        row[4] || '',
        row[5] || '',
        row[6] || '',
        row[7] || '',
        row[8] || '',
        row[9] || '',
        row[10] || '',
        row[11] || 0,
        row[12] || '',
        row[13] || '',
        mes,
        ano
      ]);

      totalMigradas++;
    }

    Logger.log('Migrada: ' + nomeAba + ' — linhas processadas');
  });

  Logger.log('TOTAL MIGRADO: ' + totalMigradas + ' vendas');
  return 'Migração concluída: ' + totalMigradas + ' vendas importadas.';
}
