// ============================================================
// Utils.gs — Funções auxiliares compartilhadas
// SAFE Escola de Aviação | SAFE Hub
// ============================================================

var SHEET_ID = '1LZ2z3yLZvIdw2h0FohhwoiYLEGwy9zz7CYL40_j2AVw';

var SHEETS = {
  USUARIOS:          'USUARIOS',
  VENDAS:            'VENDAS',
  FATURAMENTO:       'FATURAMENTO',
  CONCORRENCIA:      'CONCORRENCIA',
  PRECOS_SAFE:       'PRECOS_SAFE',
  GASTOS_MENSAIS:    'GASTOS_MENSAIS',
  HORAS_VOADAS_BASE: 'HORAS_VOADAS_BASE',
  CATEGORIAS_GASTOS: 'CATEGORIAS_GASTOS'
};

/**
 * Retorna a planilha ativa pelo nome da aba
 */
function getSheet(name) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Aba não encontrada: ' + name);
  return sheet;
}

/**
 * Resposta JSON padronizada para sucesso
 */
function jsonSuccess(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Resposta JSON padronizada para erro
 */
function jsonError(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizarPerfil(perfil) {
  return String(perfil || '').trim().toLowerCase().replace(/-/g, '_');
}

function perfilEhAdmin(perfil) {
  var p = normalizarPerfil(perfil);
  return p === 'master' || p === 'admin' || p === 'admin_readonly' ||
    p === 'admin_visualizacao' || p === 'financeiro';
}

function perfilEhMaster(perfil) {
  return normalizarPerfil(perfil) === 'master';
}

function perfilEhAdminCompleto(perfil) {
  var p = normalizarPerfil(perfil);
  return p === 'admin' || p === 'master';
}

function perfilSomenteLeitura(perfil) {
  var p = normalizarPerfil(perfil);
  return p === 'admin_readonly' || p === 'admin_visualizacao' || p === 'financeiro';
}

function perfilPodeAcessarEscalaCco(perfil) {
  var p = normalizarPerfil(perfil);
  return p === 'admin' || p === 'master' || p.indexOf('cco_') === 0;
}

function perfilPodeAcessarFinanceiro(perfil, email) {
  var p = normalizarPerfil(perfil);
  if (p === 'master') return true;
  return p === 'financeiro' &&
    String(email || '').trim().toLowerCase() === 'elaine.souza@voesafe.com.br';
}

function valorBooleano(valor) {
  return valor === true || valor === 1 || String(valor).trim().toLowerCase() === 'true';
}

/**
 * Hash SHA-256 usando Utilities do Apps Script
 */
function hashSenha(senha) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    senha,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Gera ID único baseado em timestamp + random
 */
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Formata data para DD/MM/YYYY
 */
function formatarData(date) {
  if (!date) return '';
  var d = new Date(date);
  return ('0' + d.getDate()).slice(-2) + '/' +
         ('0' + (d.getMonth() + 1)).slice(-2) + '/' +
         d.getFullYear();
}

/**
 * Converte linha do Sheets para objeto de venda
 */
function linhaParaVenda(row) {
  // Formata a data sem conversão UTC para evitar problema de fuso (GMT-3)
  var dataFormatada = '';
  if (row[1]) {
    var d = new Date(row[1]);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    dataFormatada = y + '-' + m + '-' + day;
  }
  return {
    id:          row[0],
    data:        dataFormatada,
    pac:         row[2],
    nome:        row[3],
    sexo:        row[4],
    nascimento:  row[5],
    cidade:      row[6],
    estado:      row[7],
    origem:      row[8],
    curso:       row[9],
    email:       row[10],
    valor:       row[11],
    leadNovo:    row[12],
    quemComprou: row[13],
    mes:         row[14],
    ano:         row[15]
  };
}

/**
 * Inicializa as abas necessárias (rode uma vez no setup)
 */
function inicializarPlanilha() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // USUARIOS
  var usuarios = ss.getSheetByName(SHEETS.USUARIOS);
  if (!usuarios) {
    usuarios = ss.insertSheet(SHEETS.USUARIOS);
    usuarios.appendRow(['ID', 'NOME', 'PAC', 'EMAIL', 'SENHA_HASH', 'PERFIL', 'ATIVO', 'CRIADO_EM']);
    var senhaHash = hashSenha('safe@2024');
    usuarios.appendRow([gerarId(), 'Thiago', 'Thiago', 'thiago@voesafe.com.br', senhaHash, 'admin', true, new Date()]);
    usuarios.appendRow([gerarId(), 'Marlon', 'Marlon', 'marlon@voesafe.com.br', senhaHash, 'pac',   true, new Date()]);
    usuarios.appendRow([gerarId(), 'Adauto', 'Adauto', 'adauto@voesafe.com.br', senhaHash, 'pac',   true, new Date()]);
  }

  // VENDAS
  var vendas = ss.getSheetByName(SHEETS.VENDAS);
  if (!vendas) {
    vendas = ss.insertSheet(SHEETS.VENDAS);
    vendas.appendRow([
      'ID', 'DATA', 'PAC', 'NOME_COMPLETO', 'SEXO', 'IDADE',
      'CIDADE', 'ESTADO', 'ORIGEM_LEAD', 'CURSO_COMPRADO',
      'EMAIL', 'VALOR', 'LEAD_NOVO', 'QUEM_COMPROU', 'MES', 'ANO'
    ]);
  }

  // FATURAMENTO
  var fat = ss.getSheetByName(SHEETS.FATURAMENTO);
  if (!fat) {
    fat = ss.insertSheet(SHEETS.FATURAMENTO);
    fat.appendRow(['ID', 'MES', 'ANO', 'CANAL', 'VALOR', 'ATUALIZADO_EM']);
  }

  // CONCORRENCIA (nova estrutura)
  var conc = ss.getSheetByName(SHEETS.CONCORRENCIA);
  if (!conc) {
    conc = ss.insertSheet(SHEETS.CONCORRENCIA);
    conc.appendRow([
      'ID', 'CONCORRENTE', 'CURSO', 'VALOR_AVISTA',
      'VALOR_PARCELADO', 'PARCELAS', 'AERONAVE', 'OBS',
      'CADASTRADO_POR', 'CRIADO_EM', 'ATUALIZADO_EM'
    ]);
  }

  // PRECOS_SAFE (nova aba)
  var precos = ss.getSheetByName(SHEETS.PRECOS_SAFE);
  if (!precos) {
    precos = ss.insertSheet(SHEETS.PRECOS_SAFE);
    precos.appendRow([
      'ID', 'CURSO', 'VALOR_AVISTA', 'VALOR_PARCELADO',
      'PARCELAS', 'ATUALIZADO_EM'
    ]);
  }

  return 'Planilha inicializada com sucesso!';
}
