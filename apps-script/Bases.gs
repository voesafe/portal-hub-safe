// ============================================================
// Bases.gs - Enderecos e contatos das bases SAFE
// ============================================================

var BASES_CABECALHO = [
  'ID', 'NOME', 'ENDERECO', 'COMPLEMENTO', 'CIDADE', 'UF', 'CEP',
  'EMAIL', 'TELEFONE', 'LINK_MAPA', 'ATIVA', 'ORDEM', 'ATUALIZADO_EM'
];

function inicializarBases() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.BASES);

  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.BASES);
    sheet.appendRow(BASES_CABECALHO);
    sheet.appendRow([
      gerarId(),
      'SAFE Campinas',
      'Rua Sylvia da Silva Braga, 415',
      'Terminal de Passageiros',
      'Campinas',
      'SP',
      '13082-105',
      'contato@voesafe.com.br',
      '(12) 99706-9562',
      '',
      true,
      1,
      new Date()
    ]);
    sheet.appendRow([
      gerarId(),
      'SAFE Escola de Aviação',
      'Rodovia dos Tamoios, Km 6,5',
      '',
      'São José dos Campos',
      'SP',
      '12228-845',
      'contato@voesafe.com.br',
      '(12) 99706-9562',
      '',
      true,
      2,
      new Date()
    ]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, BASES_CABECALHO.length);
  }

  return sheet;
}

function listarBases(incluirInativas) {
  var sheet = inicializarBases();
  var data = sheet.getDataRange().getValues();
  var bases = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    var base = {
      id: row[0],
      nome: row[1],
      endereco: row[2],
      complemento: row[3],
      cidade: row[4],
      uf: row[5],
      cep: row[6],
      email: row[7],
      telefone: row[8],
      linkMapa: row[9],
      ativa: valorBooleano(row[10]),
      ordem: Number(row[11]) || 0,
      atualizadoEm: row[12]
    };

    if (incluirInativas || base.ativa) bases.push(base);
  }

  bases.sort(function(a, b) {
    return a.ordem - b.ordem ||
      String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
  return bases;
}

function salvarBase(dados) {
  var sheet = inicializarBases();
  var data = sheet.getDataRange().getValues();
  var id = String(dados.id || '').trim();
  var nome = String(dados.nome || '').trim();
  var endereco = String(dados.endereco || '').trim();
  var cidade = String(dados.cidade || '').trim();
  var uf = String(dados.uf || '').trim().toUpperCase();
  var email = String(dados.email || '').trim().toLowerCase();
  var linkMapa = String(dados.linkMapa || '').trim();

  if (!nome) throw new Error('Informe o nome da base.');
  if (!endereco) throw new Error('Informe o endereco da base.');
  if (!cidade || !uf) throw new Error('Informe cidade e UF.');
  if (uf.length !== 2) throw new Error('Informe uma UF valida.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail valido.');
  }
  if (linkMapa && !/^https?:\/\//i.test(linkMapa)) {
    throw new Error('O link do mapa deve comecar com http:// ou https://.');
  }

  var valores = [
    id || gerarId(),
    nome,
    endereco,
    String(dados.complemento || '').trim(),
    cidade,
    uf,
    String(dados.cep || '').trim(),
    email,
    String(dados.telefone || '').trim(),
    linkMapa,
    dados.hasOwnProperty('ativa') ? valorBooleano(dados.ativa) : true,
    Number(dados.ordem) || 0,
    new Date()
  ];

  if (id) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== id) continue;
      sheet.getRange(i + 1, 1, 1, valores.length).setValues([valores]);
      return { id: id, mensagem: 'Base atualizada' };
    }
    throw new Error('Base nao encontrada.');
  }

  sheet.appendRow(valores);
  return { id: valores[0], mensagem: 'Base criada' };
}
