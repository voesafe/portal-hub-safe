// ============================================================
// Cavok.gs - Integração do Hub com o serviço de dados CAVOK
// ============================================================

var CAVOK_HORAS_SERVICE_URL =
  'https://script.google.com/macros/s/AKfycbzHBglsjy1a-NRfaq2nU-RQngeLEdGBsmjUWDhzo4kShguV1zI8_qJjYRwcRAwAE13v/exec';

function importarFechamentoHorasCavok(dados) {
  var competencia = validarCompetenciaFechamentoHoras_(dados.ano, dados.mes);
  var query = [
    'action=get_month',
    'ano=' + encodeURIComponent(competencia.ano),
    'mes=' + encodeURIComponent(competencia.mes)
  ].join('&');
  var resposta = UrlFetchApp.fetch(CAVOK_HORAS_SERVICE_URL + '?' + query, {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true
  });
  var codigo = resposta.getResponseCode();
  if (codigo < 200 || codigo >= 300) {
    throw new Error('Serviço CAVOK indisponível (HTTP ' + codigo + ').');
  }
  var conteudo;
  try {
    conteudo = JSON.parse(resposta.getContentText());
  } catch (e) {
    throw new Error('Resposta inválida do serviço CAVOK.');
  }
  if (conteudo.status !== 'success' || !conteudo.data) {
    throw new Error(conteudo.message || 'Não foi possível consultar o CAVOK.');
  }
  return conteudo.data;
}
