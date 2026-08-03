// ============================================================
// Marketing.gs — recorte anônimo das vendas para o dashboard de marketing
// SAFE Escola de Aviação | SAFE Hub
//
// A página Origem do Lead responde "qual o perfil de quem COMPRA", para
// direcionar mídia. Ela lê a mesma aba VENDAS do resto do Hub, mas por uma
// rota própria e não pela rota `vendas`, por três motivos:
//
// 1. ESCOPO. A rota `vendas` devolve só as vendas do PAC de quem chamou
//    quando a pessoa não é admin. Marketing decide mídia para a escola
//    inteira: um recorte por consultor daria um retrato parcial sem avisar
//    ninguém disso. Aqui o escopo é SEMPRE global, e a permissão que abre a
//    rota se chama `marketing.visualizar_todos` justamente para dizer isso
//    no nome.
// 2. PRIVACIDADE. Quem analisa mídia não precisa de nome, e-mail nem de quem
//    comprou, e mandar a lista de clientes para mais gente do que o necessário
//    é risco sem contrapartida. `linhaParaMarketing_` projeta só as dimensões
//    do gráfico e o valor. Nome, e-mail e quem comprou NÃO saem daqui.
//    ⚠️ Ao acrescentar campo a este recorte, pergunte antes se ele identifica
//    uma pessoa. Se identificar, ele não pertence a esta rota.
// 3. TAMANHO. O recorte magro é o que permite mandar a base inteira de uma vez
//    e cruzar os filtros no navegador. Com os ~10s de latência do Apps Script,
//    uma ida ao servidor por clique de filtro deixaria a tela inutilizável.
// ============================================================

// Faixas de idade. Os mesmos limites do filtro da página de Vendas, para as
// duas telas falarem da mesma coisa quando disserem "25 a 34".
var MARKETING_FAIXAS = [
  { id: 'menor18', ate: 17 },
  { id: '18-24',   ate: 24 },
  { id: '25-34',   ate: 34 },
  { id: '35-44',   ate: 44 },
  { id: '45-54',   ate: 54 },
  { id: '55+',     ate: 999 }
];

/**
 * Devolve o recorte anônimo de TODAS as vendas, uma linha por venda.
 * Sem filtro de PAC de propósito: ver o motivo 1 no topo do arquivo.
 */
function listarMarketingLeads() {
  var sheet = getSheet(SHEETS.VENDAS);
  var range = sheet.getDataRange();
  var valores = range.getValues();

  // ⚠️ As duas colunas de DATA saem por getDisplayValues, não por getValues.
  // A planilha não tem fuso declarado e uma célula de data lida como objeto
  // volta deslocada (é a armadilha já documentada no CadastroAlunos e no LOG
  // da Escala CCO). O que a pessoa vê na célula é a leitura confiável.
  // O resto das colunas continua vindo de getValues, porque VALOR precisa
  // chegar como número e não como "R$ 1.200,00".
  var exibidos = range.getDisplayValues();

  var linhas = [];
  for (var i = 1; i < valores.length; i++) {
    if (!valores[i][0]) continue;
    var linha = linhaParaMarketing_(valores[i], exibidos[i]);
    if (linha) linhas.push(linha);
  }

  return {
    // `geradoEm` existe para a tela poder dizer de quando é o retrato. Sem isso
    // um cache antigo do navegador passa por dado fresco.
    geradoEm: Utilities.formatDate(new Date(), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss"),
    total: linhas.length,
    leads: linhas
  };
}

/**
 * Projeta uma linha da aba VENDAS no recorte de marketing.
 * `bruto` vem de getValues (VALOR numérico); `exibido` de getDisplayValues
 * (as datas como estão na célula).
 */
function linhaParaMarketing_(bruto, exibido) {
  var dataVenda = marketingDataVenda_(bruto[1], exibido[1]);
  if (!dataVenda) return null;   // sem data não entra em nenhum recorte mensal

  return {
    data:   dataVenda.iso,
    mes:    dataVenda.mes,
    ano:    dataVenda.ano,
    pac:    marketingTexto_(bruto[2]),
    sexo:   marketingTexto_(bruto[4]),
    // Idade NA DATA DA COMPRA, não a idade de hoje. Ver marketingIdade_.
    idade:  marketingIdade_(exibido[5], dataVenda),
    cidade: marketingTexto_(bruto[6]),
    estado: marketingTexto_(bruto[7]),
    origem: marketingTexto_(bruto[8]),
    curso:  marketingTexto_(bruto[9]),
    valor:  valorVenda(bruto[11])
  };
}

function marketingTexto_(valor) {
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

/**
 * Normaliza a data da venda para { iso, mes, ano }.
 * Aceita o objeto Date do Sheets e o texto exibido na célula (dd/mm/aaaa ou
 * ISO), nesta ordem de preferência: o texto exibido é o que não sofre com
 * fuso, e o Date só entra quando a exibição não é legível.
 */
function marketingDataVenda_(bruto, exibido) {
  var texto = marketingTexto_(exibido);

  var br = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (br) return marketingMontarData_(Number(br[3]), Number(br[2]), Number(br[1]));

  var iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return marketingMontarData_(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  if (bruto instanceof Date && !isNaN(bruto.getTime())) {
    return marketingMontarData_(bruto.getFullYear(), bruto.getMonth() + 1, bruto.getDate());
  }
  return null;
}

function marketingMontarData_(ano, mes, dia) {
  if (!(ano >= 1900 && ano <= 2200) || !(mes >= 1 && mes <= 12) || !(dia >= 1 && dia <= 31)) return null;
  return {
    iso: ano + '-' + marketingPad2_(mes) + '-' + marketingPad2_(dia),
    ano: ano,
    mes: mes,
    dia: dia
  };
}

function marketingPad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * Idade do comprador NA DATA DA COMPRA.
 *
 * ⚠️ É de propósito diferente do filtro de faixa etária da página de Vendas,
 * que usa a idade de HOJE. As duas estão certas para o que cada uma faz: lá a
 * pergunta é "quem é esta pessoa agora"; aqui é "que idade eu devo mirar no
 * anúncio". Quem comprou aos 22 há três anos tem 25 hoje, e configurar a
 * campanha para 25 erraria o público que de fato converte. A tela escreve
 * "na data da compra" ao lado do gráfico para ninguém ler outra coisa.
 *
 * O campo aceita três formatos porque a coluna já foi usada de dois jeitos:
 * hoje é data de nascimento, e em vendas antigas era a idade digitada na mão.
 * Uma idade digitada na época da venda já É a idade na data da venda, então
 * esse caso legado sai exato, sem conversão.
 */
function marketingIdade_(nascimento, dataVenda) {
  var texto = marketingTexto_(nascimento);
  if (!texto) return null;

  // Caso legado: a idade em si (número curto).
  var numero = Number(texto.replace(',', '.'));
  if (/^\d{1,3}([.,]\d+)?$/.test(texto) && isFinite(numero)) {
    var inteiro = Math.floor(numero);
    return (inteiro >= 0 && inteiro <= 120) ? inteiro : null;
  }

  // Só o ano de nascimento (4 dígitos plausíveis).
  if (/^\d{4}$/.test(texto)) {
    var ano = Number(texto);
    if (ano >= 1900 && ano <= dataVenda.ano) {
      var porAno = dataVenda.ano - ano;
      return (porAno >= 0 && porAno <= 120) ? porAno : null;
    }
    return null;
  }

  var nasc = marketingDataNascimento_(texto);
  if (!nasc) return null;

  var idade = dataVenda.ano - nasc.ano;
  // Ainda não fez aniversário até o dia da venda.
  if (dataVenda.mes < nasc.mes || (dataVenda.mes === nasc.mes && dataVenda.dia < nasc.dia)) idade--;
  return (idade >= 0 && idade <= 120) ? idade : null;
}

function marketingDataNascimento_(texto) {
  var br = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br) {
    var ano = Number(br[3]);
    if (ano < 100) ano += (ano > (new Date().getFullYear() % 100)) ? 1900 : 2000;
    return marketingMontarData_(ano, Number(br[2]), Number(br[1]));
  }
  var iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return marketingMontarData_(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

/**
 * Guarda da rota. Superadmin e master passam por bypass, como no resto do Hub.
 *
 * ⚠️ Esconder o item no menu não impede ninguém de chamar a rota na mão, então
 * é este guarda que vale de verdade. Mesmo padrão do exigirAniversarios.
 */
function exigirMarketing(token) {
  var usuario = validarTokenSessao(token);
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.');
  if (usuarioEhSuperadmin(usuario)) return usuario;
  if (usuarioTemPermissao(usuario, 'marketing.visualizar_todos')) return usuario;
  throw new Error('Sem permissão para ver o painel de marketing.');
}
