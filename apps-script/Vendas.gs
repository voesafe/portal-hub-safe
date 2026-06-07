// ============================================================
// Vendas.gs — CRUD completo de vendas
// SAFE Escola de Aviação | SAFE Hub
// ============================================================

function listarVendas(pac, mes, ano) {
  var sheet = getSheet(SHEETS.VENDAS);
  var data = sheet.getDataRange().getValues();
  var vendas = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    if (pac && String(row[2]).toLowerCase() !== pac.toLowerCase()) continue;
    if (mes && Number(row[14]) !== Number(mes)) continue;
    if (ano && Number(row[15]) !== Number(ano)) continue;
    vendas.push(linhaParaVenda(row));
  }

  vendas.sort(function(a, b) {
    var dataA = a.data ? new Date(a.data).getTime() : 0;
    var dataB = b.data ? new Date(b.data).getTime() : 0;
    if (dataB !== dataA) return dataB - dataA;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  return vendas;
}

function valorVenda(valor) {
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

function listarPacsAtivosParaKpi() {
  var sheet = getSheet(SHEETS.USUARIOS);
  var data = sheet.getDataRange().getValues();
  var pacs = [];
  var vistos = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var pac = String(row[2] || '').trim();
    if (!row[0] || !pac || !valorBooleano(row[6]) || perfilSomenteLeitura(row[5]) || perfilEhMaster(row[5])) continue;

    var chave = pac.toLowerCase();
    if (vistos[chave]) continue;
    vistos[chave] = true;
    pacs.push(pac);
  }

  return pacs.sort(function(a, b) {
    return a.localeCompare(b, 'pt-BR');
  });
}

function buscarVenda(id) {
  var sheet = getSheet(SHEETS.VENDAS);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return linhaParaVenda(data[i]);
    }
  }
  return null;
}

function criarVenda(dados) {
  var sheet = getSheet(SHEETS.VENDAS);
  var id = gerarId();
  // Parseia a data como local (YYYY-MM-DD) para evitar problema de fuso UTC
  var partesData = String(dados.data).split('-');
  var dataVenda = new Date(Number(partesData[0]), Number(partesData[1]) - 1, Number(partesData[2]));
  var mes = dataVenda.getMonth() + 1;
  var ano = dataVenda.getFullYear();

  sheet.appendRow([
    id,
    dataVenda,
    dados.pac        || '',
    dados.nome       || '',
    dados.sexo       || '',
    dados.nascimento || dados.idade || '',
    dados.cidade     || '',
    dados.estado     || '',
    dados.origem     || '',
    dados.curso      || '',
    dados.email      || '',
    valorVenda(dados.valor),
    dados.leadNovo   || 'Não',
    dados.quemComprou|| '',
    mes,
    ano
  ]);

  return { id: id };
}

function atualizarVenda(id, dados, pacSolicitante, perfilSolicitante) {
  var sheet = getSheet(SHEETS.VENDAS);
  var data = sheet.getDataRange().getValues();

  if (perfilSomenteLeitura(perfilSolicitante)) {
    throw new Error('Acesso somente leitura.');
  }

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(id)) continue;

    if (!perfilEhAdminCompleto(perfilSolicitante) &&
        String(data[i][2]).toLowerCase() !== pacSolicitante.toLowerCase()) {
      throw new Error('Sem permissão para editar esta venda.');
    }

    var row = i + 1;
    // Parseia a data como local para evitar problema de fuso UTC
    var partesData = String(dados.data).split('-');
    var dataVenda = new Date(Number(partesData[0]), Number(partesData[1]) - 1, Number(partesData[2]));

    sheet.getRange(row, 2).setValue(dataVenda);
    sheet.getRange(row, 3).setValue(dados.pac        || '');
    sheet.getRange(row, 4).setValue(dados.nome       || '');
    sheet.getRange(row, 5).setValue(dados.sexo       || '');
    sheet.getRange(row, 6).setValue(dados.nascimento || dados.idade || '');
    sheet.getRange(row, 7).setValue(dados.cidade     || '');
    sheet.getRange(row, 8).setValue(dados.estado     || '');
    sheet.getRange(row, 9).setValue(dados.origem     || '');
    sheet.getRange(row, 10).setValue(dados.curso     || '');
    sheet.getRange(row, 11).setValue(dados.email     || '');
    sheet.getRange(row, 12).setValue(valorVenda(dados.valor));
    sheet.getRange(row, 13).setValue(dados.leadNovo  || 'Não');
    sheet.getRange(row, 14).setValue(dados.quemComprou || '');
    sheet.getRange(row, 15).setValue(dataVenda.getMonth() + 1);
    sheet.getRange(row, 16).setValue(dataVenda.getFullYear());

    return true;
  }
  return false;
}

function excluirVenda(id, pacSolicitante, perfilSolicitante) {
  var sheet = getSheet(SHEETS.VENDAS);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(id)) continue;

    // Consultor só pode excluir as próprias vendas
    if (!perfilEhAdminCompleto(perfilSolicitante) &&
        String(data[i][2]).toLowerCase() !== pacSolicitante.toLowerCase()) {
      throw new Error('Sem permissão para excluir esta venda.');
    }

    sheet.deleteRow(i + 1);
    return { excluido: true };
  }

  return { excluido: false, erro: 'Venda não encontrada' };
}

function calcularKPIs(pac, perfilSolicitante, mes, ano) {
  var todasVendas = listarVendas(pac, mes, ano);

  var totalVendas  = 0;
  var totalReceita = 0;
  var leadsNovos   = 0;
  var origens      = {};
  var cursos       = {};
  var porPac       = {};
  var porMes       = {};

  if (perfilEhAdmin(perfilSolicitante)) {
    listarPacsAtivosParaKpi().forEach(function(pacNome) {
      porPac[pacNome] = { vendas: 0, receita: 0 };
    });
  }

  todasVendas.forEach(function(v) {
    var valor = valorVenda(v.valor);
    totalVendas++;
    totalReceita += valor;
    if (v.leadNovo === 'Sim' || v.leadNovo === 'SIM') leadsNovos++;

    var origem = v.origem || 'Não informado';
    origens[origem] = (origens[origem] || 0) + 1;

    var curso = v.curso || 'Não informado';
    cursos[curso] = (cursos[curso] || 0) + 1;

    var pacNome = v.pac || 'Sem PAC';
    if (!porPac[pacNome]) porPac[pacNome] = { vendas: 0, receita: 0 };
    porPac[pacNome].vendas++;
    porPac[pacNome].receita += valor;

    var chave = v.ano + '-' + String(v.mes).padStart(2, '0');
    if (!porMes[chave]) porMes[chave] = { vendas: 0, receita: 0 };
    porMes[chave].vendas++;
    porMes[chave].receita += valor;
  });

  var totalVendasGeral = totalVendas;
  var totalReceitaGeral = totalReceita;

  if (!perfilEhAdmin(perfilSolicitante)) {
    var vendasGerais = listarVendas(null, mes, ano);
    totalVendasGeral = vendasGerais.length;
    totalReceitaGeral = vendasGerais.reduce(function(soma, venda) {
      return soma + valorVenda(venda.valor);
    }, 0);
  }

  return {
    totalVendas:  totalVendas,
    totalReceita: totalReceita,
    totalVendasGeral: totalVendasGeral,
    totalReceitaGeral: totalReceitaGeral,
    ticketMedio:  totalVendas > 0 ? totalReceita / totalVendas : 0,
    leadsNovos:   leadsNovos,
    origens:      origens,
    cursos:       cursos,
    porPac:       porPac,
    porMes:       porMes
  };
}
