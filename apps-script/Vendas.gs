// ============================================================
// Vendas.gs — CRUD completo de vendas
// SAFE Escola de Aviação | SAFE Hub
// ============================================================

// ⚠️ O CPF fica na coluna Q, no FIM da aba, e não junto do nome, onde faria
// mais sentido para quem lê a planilha. A aba VENDAS é lida e escrita por
// POSIÇÃO em três lugares (`linhaParaVenda` no Utils.gs, o `appendRow` do
// `criarVenda` e os `bruto[...]` do Marketing.gs): inserir coluna no meio
// deslocaria mês e ano e desalinharia todas as linhas já gravadas. É a mesma
// família da armadilha do `nth-child` no CSS do cadastro de alunos.
var VENDAS_COL_CPF = 17;

/**
 * Só dígitos. É assim que o CPF é gravado e comparado, porque a mesma pessoa
 * aparece ora com pontuação, ora sem, e a Planilha Alunos deduplica por CPF.
 */
function cpfSoDigitosVenda_(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/\D/g, '');
}

/**
 * Escreve o CPF como TEXTO na linha indicada.
 *
 * ⚠️ `setNumberFormat('@')` vem ANTES do `setValue`. CPF só de dígitos é lido
 * pelo Sheets como número, e aí o zero da frente some: um CPF começando com
 * zero (que existe e não é raro) viraria dez dígitos e deixaria de casar com a
 * base de alunos, que deduplica justamente por esse campo. Sexta ocorrência
 * dessa armadilha no projeto, depois do `alvo` no LOG da Escala CCO, da
 * `DATA_NASCIMENTO`, do data URI do avatar, do saldo `5.8` das Horas INVA e
 * dos comentários por instrutor.
 */
function gravarCpfVenda_(sheet, linha, valor) {
  var celula = sheet.getRange(linha, VENDAS_COL_CPF);
  celula.setNumberFormat('@');
  celula.setValue(cpfSoDigitosVenda_(valor));
}

/**
 * Garante o cabeçalho da coluna nova. A aba de produção já existe, então o
 * `inicializarPlanilha` (que só cria aba do zero) nunca vai rodar de novo: sem
 * isto, a coluna Q ficaria com dado e sem título, e quem abrisse a planilha não
 * saberia o que é aquilo. Idempotente e barato.
 */
function garantirCabecalhoCpfVendas_(sheet) {
  var celula = sheet.getRange(1, VENDAS_COL_CPF);
  if (String(celula.getValue() || '').trim()) return;
  celula.setValue('CPF');
}

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

/**
 * Recorte magro de clientes já cadastrados em vendas anteriores, para o
 * autocompletar do "Nome Completo" no cadastro de venda nova. Poupa o
 * comercial de redigitar CPF, sexo, nascimento, cidade, estado e e-mail de
 * quem já comprou antes.
 *
 * ⚠️ Mesma regra de escopo da rota `vendas`: pac !== null filtra por
 * consultor. Quem não é admin só reencontra os próprios clientes, nunca os
 * de um colega.
 *
 * ⚠️ Dedup por CPF, chave estável. Venda anterior a 2026-08-06 pode não ter
 * CPF gravado, e cai no e-mail. Sem os dois não há como identificar o
 * cliente de forma confiável entre uma venda e outra, e a linha fica de
 * fora: é a mesma regra de `portalVendasCasaveis_`.
 *
 * ⚠️ Nome suspeito (marcador de status tipo "TESTE"/"INATIVO" digitado no
 * campo errado) é descartado pelo mesmo filtro dos Aniversários e do Portal
 * do Aluno: sugerir aqui preencheria o cadastro novo com lixo.
 *
 * ⚠️ NASCIMENTO sai por `getDisplayValues` + `marketingDataNascimento_`
 * ([Marketing.gs](apps-script/Marketing.gs)), NUNCA pelo `row[5]` cru de
 * `linhaParaVenda`. A coluna não tem `setNumberFormat('@')` nenhum na
 * escrita, então o Sheets pode ter convertido a célula em Date de verdade; a
 * planilha não tem fuso declarado, e um objeto Date lido por `getValues` e
 * depois serializado em JSON vira ISO com hora e `Z`, formato que o
 * `<input type="date">` do navegador rejeita em silêncio, deixando o campo
 * em branco. O Marketing já tinha essa armadilha resolvida para esta mesma
 * coluna; aqui é reaproveitada, não reinventada. Venda antiga com só a
 * idade (número solto) não vira data, e o campo fica vazio de propósito:
 * não existe nascimento nenhum para reconstruir a partir de uma idade.
 */
function listarClientesVendas(pac) {
  var sheet = getSheet(SHEETS.VENDAS);
  var range = sheet.getDataRange();
  var dados = range.getValues();
  var exibidos = range.getDisplayValues();

  var porChave = {};
  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    if (!row[0]) continue;
    if (pac && String(row[2]).toLowerCase() !== pac.toLowerCase()) continue;

    var v = linhaParaVenda(row);
    if (!v.nome) continue;
    try { if (aniversariosNomeSuspeito_(v.nome)) continue; } catch (e) {}

    var cpfDigitos = cpfSoDigitosVenda_(v.cpf);
    var email = String(v.email || '').trim().toLowerCase();
    var chave = cpfDigitos ? 'cpf:' + cpfDigitos : (email ? 'email:' + email : '');
    if (!chave) continue;

    var nasc = null;
    try { nasc = marketingDataNascimento_(String(exibidos[i][5] || '').trim()); } catch (e) {}

    // Mesmo cliente com duas vendas aparece uma vez, com a mais recente.
    var atual = porChave[chave];
    if (!atual || String(v.data) > String(atual.data)) {
      porChave[chave] = {
        nome:       v.nome,
        cpf:        cpfDigitos,
        sexo:       v.sexo || '',
        nascimento: nasc ? nasc.iso : '',
        cidade:     v.cidade || '',
        estado:     v.estado || '',
        email:      v.email || '',
        data:       v.data || '',
        curso:      v.curso || ''
      };
    }
  }

  var lista = [];
  Object.keys(porChave).forEach(function(k) { lista.push(porChave[k]); });
  lista.sort(function(a, b) { return String(b.data).localeCompare(String(a.data)); });
  return lista;
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
    ano,
    ''   // CPF: escrito logo abaixo, como texto, por gravarCpfVenda_
  ]);

  garantirCabecalhoCpfVendas_(sheet);
  gravarCpfVenda_(sheet, sheet.getLastRow(), dados.cpf);

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

    // ⚠️ CPF vazio PRESERVA o que já está gravado, em vez de apagar. A edição
    // não exige CPF (venda antiga foi feita quando o campo não existia), então
    // campo em branco quer dizer "não mexi nisso", não "apague". Sobrescrever
    // com vazio destruiria dado que ninguém pediu para destruir, inclusive na
    // hipótese de o formulário deixar de mandar o campo por um defeito.
    if (cpfSoDigitosVenda_(dados.cpf)) {
      garantirCabecalhoCpfVendas_(sheet);
      gravarCpfVenda_(sheet, row, dados.cpf);
    }

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
