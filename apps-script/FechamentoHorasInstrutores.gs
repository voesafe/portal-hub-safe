// ============================================================
// FechamentoHorasInstrutores.gs — Fechamento de Horas / Instrutores
// SAFE Hub
//
// O PROBLEMA
// Instrutor de voo com etiqueta "Eventual" (na tela Instrutores, Escala)
// e pago por hora, em tres categorias diferentes: VFR, IFR e Simulador.
// Este modulo lista quem esta nessa etiqueta, cruza com as horas voadas
// do mes (vindas do backend das Horas INVA, que por sua vez consulta o
// CAVOK) e calcula o total a pagar.
//
// DOIS BACKENDS, PROPOSITO
// O cadastro dos instrutores e as horas voadas vivem no backend proprio
// das Horas INVA (outro repositorio, sem sessao). O que este modulo
// guarda AQUI, no Hub, e so o valor da hora por categoria — porque isso
// e dado de folha e precisa de RBAC de verdade (sessao + permissao), que
// o backend das Horas INVA nao tem (ele responde anonimo). Na leitura,
// este modulo busca no backend das Horas INVA (a) a lista de instrutores
// com a etiqueta 'eventual' e (b) as horas do mes por categoria, e junta
// com os valores daqui. Nada de escrita cruza para o outro backend.
//
// VALOR COM HISTORICO POR VIGENCIA
// Editar o valor da hora NAO sobrescreve: grava uma linha nova, com a
// data de quando passou a valer. O calculo de um mes usa o valor que
// estava vigente no FIM daquele mes, entao mudar o valor hoje nunca
// altera o pagamento de um mes ja fechado. Os campos da tela so ficam
// editaveis no mes corrente (editar o passado nao faz sentido: o valor
// mostrado ali e o que foi de fato usado, e mudar o passado seria
// reescrever historico).
//
// Instrutor novo, ou sem valor gravado ainda, cai nos padroes definidos
// pela operacao: R$70 VFR, R$100 IFR, R$60 Simulador.
// ============================================================

var FHI_SHEET_VALORES = 'FECHAMENTO_HORAS_INSTRUTORES_VALORES';
var FHI_VALORES_HEADERS = ['ID', 'INSTRUTOR', 'CATEGORIA', 'VALOR', 'VIGENTE_DESDE', 'REGISTRADO_POR'];

var FHI_CATEGORIAS = ['VFR', 'IFR', 'SIMULADOR'];
var FHI_VALOR_PADRAO = { VFR: 70, IFR: 100, SIMULADOR: 60 };

// Mesma implantacao de producao que o frontend das Horas INVA ja usa
// (CONFIG.HORAS_VOADAS_INVA_API_URL em js/core/config.js). Nao e segredo,
// e URL publica de um web app "Qualquer pessoa".
var FHI_INVA_API_URL = 'https://script.google.com/macros/s/AKfycbyThE1-1S77CJFfrSsWVVYak4tu-V37xsXH1VZFckKf1CJulgueWhqpKx70NWg9ifA9/exec';

// ── Aba ──────────────────────────────────────────────────────

/**
 * ⚠️ `criar` falso na LEITURA, de proposito: leitura que cria aba e escrita
 * disfarcada, e duas cargas de tela simultaneas criariam a aba duas vezes.
 * Mesma regra do `portalAba_`/`mapaColunasInstrutores_`.
 */
function fhiAba_(criar) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var aba = ss.getSheetByName(FHI_SHEET_VALORES);
  if (aba) return aba;
  if (!criar) return null;
  aba = ss.insertSheet(FHI_SHEET_VALORES);
  aba.appendRow(FHI_VALORES_HEADERS);
  return aba;
}

function fhiChaveNome_(nome) {
  return String(nome || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function fhiValorPadrao_(categoria) {
  return FHI_VALOR_PADRAO.hasOwnProperty(categoria) ? FHI_VALOR_PADRAO[categoria] : 0;
}

function fhiArredondar2_(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

/** 'aaaa-mm-dd 23:59:59' do ultimo dia do mes — o corte para "vigente naquele mes". */
function fhiChaveMesCorte_(ano, mes) {
  var ultimoDia = new Date(ano, mes, 0).getDate();
  return String(ano).padStart(4, '0') + '-' + String(mes).padStart(2, '0') + '-' +
    String(ultimoDia).padStart(2, '0') + ' 23:59:59';
}

function fhiAgoraTexto_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Historico completo, uma entrada por vigencia gravada. `getDisplayValues`
 * na coluna de data: mesma cautela do LOG da Escala CCO, da DATA_NASCIMENTO
 * e da reconciliacao das Horas INVA — celula que parece data pode ter virado
 * Date de verdade no Sheets, e o que a pessoa ve na celula e o confiavel.
 */
function fhiLerHistorico_() {
  var aba = fhiAba_(false);
  if (!aba) return [];
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  var valores = aba.getRange(2, 1, ultimaLinha - 1, FHI_VALORES_HEADERS.length).getDisplayValues();
  var historico = [];
  valores.forEach(function (linha) {
    var chave = fhiChaveNome_(linha[1]);
    var categoria = String(linha[2] || '').trim().toUpperCase();
    var vigenteDesde = String(linha[4] || '').trim();
    if (!chave || FHI_CATEGORIAS.indexOf(categoria) < 0 || !vigenteDesde) return; // linha ilegivel: ignora
    historico.push({
      instrutorChave: chave,
      categoria: categoria,
      valor: Number(linha[3]) || 0,
      vigenteDesde: vigenteDesde
    });
  });
  return historico;
}

/**
 * Valor vigente de uma categoria para um instrutor, ATE o texto de corte
 * (comparacao lexicografica: funciona porque "aaaa-mm-dd HH:mm:ss" e largura
 * fixa e ordena igual a cronologia). Sem registro ate o corte, cai no padrao.
 */
function fhiValorVigenteAte_(historico, instrutorChave, categoria, corteTexto) {
  var melhor = null;
  historico.forEach(function (r) {
    if (r.instrutorChave !== instrutorChave || r.categoria !== categoria) return;
    if (r.vigenteDesde > corteTexto) return;
    if (!melhor || r.vigenteDesde > melhor.vigenteDesde) melhor = r;
  });
  return melhor ? melhor.valor : fhiValorPadrao_(categoria);
}

// ── Backend das Horas INVA (leitura, server-to-server) ──────

/**
 * Instrutores com a etiqueta 'eventual' (id fixo, ver INVA_ETIQUETAS_SEMENTE
 * no backend das Horas INVA). So o nome: e a unica coisa que este modulo usa
 * de la alem das horas.
 */
function fhiListarInstrutoresEventuais_() {
  var resposta = UrlFetchApp.fetch(FHI_INVA_API_URL + '?action=get_data', {
    method: 'get',
    muteHttpExceptions: true
  });
  var codigo = resposta.getResponseCode();
  if (codigo < 200 || codigo >= 300) {
    throw new Error('Não foi possível consultar os instrutores (HTTP ' + codigo + ').');
  }
  var corpo = JSON.parse(resposta.getContentText());
  if (corpo.status !== 'success' || !Array.isArray(corpo.data)) {
    throw new Error('Resposta inesperada do backend de Instrutores.');
  }
  return corpo.data
    .filter(function (inst) { return Array.isArray(inst.etiquetas) && inst.etiquetas.indexOf('eventual') >= 0; })
    .map(function (inst) { return String(inst.nome || '').trim(); })
    .filter(function (nome) { return nome; });
}

/** Horas do mes por instrutor, ja separadas em VFR/IFR/Simulador pelo backend das Horas INVA. */
function fhiHorasCategoriaMes_(ano, mes) {
  var resposta = UrlFetchApp.fetch(
    FHI_INVA_API_URL + '?action=get_horas_categoria&ano=' + encodeURIComponent(ano) + '&mes=' + encodeURIComponent(mes),
    { method: 'get', muteHttpExceptions: true }
  );
  var codigo = resposta.getResponseCode();
  if (codigo < 200 || codigo >= 300) {
    throw new Error('Não foi possível consultar as horas do mês (HTTP ' + codigo + ').');
  }
  var corpo = JSON.parse(resposta.getContentText());
  if (corpo.status !== 'success' || !corpo.data || !Array.isArray(corpo.data.instrutores)) {
    throw new Error('Resposta inesperada do backend de Instrutores ao consultar horas do mês.');
  }
  var porInstrutor = {};
  corpo.data.instrutores.forEach(function (item) {
    porInstrutor[fhiChaveNome_(item.instrutor)] = {
      vfrHoras: Number(item.vfrHoras) || 0,
      ifrHoras: Number(item.ifrHoras) || 0,
      simuladorHoras: Number(item.simuladorHoras) || 0
    };
  });
  return porInstrutor;
}

// ── Leitura consolidada ──────────────────────────────────────

function listarFechamentoHorasInstrutores(ano, mes) {
  var anoNum = Number(ano);
  var mesNum = Number(mes);
  if (!anoNum || anoNum < 2020 || anoNum > 2100) throw new Error('Ano inválido.');
  if (!mesNum || mesNum < 1 || mesNum > 12) throw new Error('Mês inválido.');

  var hoje = new Date();
  var mesAtual = hoje.getFullYear() === anoNum && (hoje.getMonth() + 1) === mesNum;

  var instrutoresEventuais = fhiListarInstrutoresEventuais_();
  var horasPorInstrutor = fhiHorasCategoriaMes_(anoNum, mesNum);
  var historico = fhiLerHistorico_();
  var corte = fhiChaveMesCorte_(anoNum, mesNum);

  var instrutores = instrutoresEventuais.map(function (nome) {
    var chave = fhiChaveNome_(nome);
    var horas = horasPorInstrutor[chave] || { vfrHoras: 0, ifrHoras: 0, simuladorHoras: 0 };

    var valorVfr = fhiValorVigenteAte_(historico, chave, 'VFR', corte);
    var valorIfr = fhiValorVigenteAte_(historico, chave, 'IFR', corte);
    var valorSimulador = fhiValorVigenteAte_(historico, chave, 'SIMULADOR', corte);

    return {
      instrutor: nome,
      valorVfr: valorVfr,
      valorIfr: valorIfr,
      valorSimulador: valorSimulador,
      vfrHoras: horas.vfrHoras,
      ifrHoras: horas.ifrHoras,
      simuladorHoras: horas.simuladorHoras,
      totalAPagar: fhiArredondar2_(
        horas.vfrHoras * valorVfr + horas.ifrHoras * valorIfr + horas.simuladorHoras * valorSimulador
      ),
      // Só o mês corrente permite editar: valor de mês passado é o que já
      // foi de fato usado no cálculo, editar ali reescreveria histórico.
      editavel: mesAtual
    };
  });

  return { ano: anoNum, mes: mesNum, mesAtual: mesAtual, instrutores: instrutores };
}

// ── Escrita: nova vigência ───────────────────────────────────

function salvarValorFechamentoHorasInstrutor(dados, usuario) {
  var instrutor = String((dados && dados.instrutor) || '').trim();
  var categoria = String((dados && dados.categoria) || '').trim().toUpperCase();
  var valor = Number(dados && dados.valor);

  if (!instrutor) throw new Error('Instrutor obrigatório.');
  if (FHI_CATEGORIAS.indexOf(categoria) < 0) throw new Error('Categoria inválida.');
  if (!isFinite(valor) || valor < 0) throw new Error('Valor inválido.');

  var aba = fhiAba_(true);
  var agora = fhiAgoraTexto_();
  var autor = usuario ? (String(usuario.nome || '').trim() + ' (' + String(usuario.email || '').trim() + ')') : '';

  // Linha vazia primeiro, formato de TEXTO na coluna de data ANTES do
  // valor: senao o Sheets le "aaaa-mm-dd HH:mm:ss" como Date e a leitura
  // volta deslocada. Mesma armadilha do LOG da Escala CCO, da
  // DATA_NASCIMENTO e da reconciliação das Horas INVA.
  aba.appendRow(new Array(FHI_VALORES_HEADERS.length).fill(''));
  var numeroLinha = aba.getLastRow();
  aba.getRange(numeroLinha, 5).setNumberFormat('@'); // VIGENTE_DESDE
  aba.getRange(numeroLinha, 1, 1, FHI_VALORES_HEADERS.length).setValues([[
    gerarId(), instrutor, categoria, valor, agora, autor
  ]]);

  return { ok: true };
}

// ── Guardas de acesso ────────────────────────────────────────

function exigirFechamentoHorasInstrutoresVer(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'fechamento_horas_instrutores.visualizar')) return usuario;
  throw new Error('Sem permissão para ver o Fechamento de Horas / Instrutores.');
}

function exigirFechamentoHorasInstrutoresEditar(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'fechamento_horas_instrutores.editar_valores')) return usuario;
  throw new Error('Sem permissão para editar valores do Fechamento de Horas / Instrutores.');
}
