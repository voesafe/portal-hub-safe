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

function dataAnteriorFechamentoCavok_() {
  var agora = new Date();
  agora.setDate(agora.getDate() - 1);
  return {
    ano: Number(Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy')),
    mes: Number(Utilities.formatDate(agora, 'America/Sao_Paulo', 'M')),
    data: Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd')
  };
}

function horasFechamentoIguais_(atual, importado) {
  var mapaAtual = {};
  (atual || []).forEach(function(item) {
    mapaAtual[String(item.tipo || '')] = {
      horas: Number(item.horas || 0),
      cotista: item.cotista_horas === null ? null : Number(item.cotista_horas || 0)
    };
  });
  return (importado || []).every(function(item) {
    var existente = mapaAtual[String(item.tipo || '')];
    if (!existente) return false;
    var cotista = item.cotista_horas === null
      ? null
      : Number(item.cotista_horas || 0);
    return existente.horas === Number(item.horas || 0) &&
      existente.cotista === cotista;
  });
}

function atualizarFechamentoCavokDiario() {
  var competencia = dataAnteriorFechamentoCavok_();
  var atual = lerMesFechamentoHoras_(competencia.ano, competencia.mes);
  if (atual.fechado) {
    console.log('Automação CAVOK ignorada: competência fechada ' + competencia.data);
    return { ok: true, atualizado: false, motivo: 'MES_FECHADO' };
  }

  var importacao = importarFechamentoHorasCavok(competencia);
  if (horasFechamentoIguais_(atual.horas, importacao.horas)) {
    console.log('Automação CAVOK sem alterações para ' + competencia.data);
    return { ok: true, atualizado: false, motivo: 'SEM_ALTERACOES' };
  }

  salvarFechamentoHoras({
    ano: competencia.ano,
    mes: competencia.mes,
    versao: atual.versao,
    horas: importacao.horas,
    metricas: atual.metricas
  }, {
    email: 'automacao.cavok@voesafe.com.br',
    pac: 'AUTOMACAO_CAVOK'
  });
  console.log('Fechamento atualizado automaticamente para ' + competencia.data);
  return {
    ok: true,
    atualizado: true,
    ano: competencia.ano,
    mes: competencia.mes,
    resumoImportacao: importacao.resumoImportacao || {}
  };
}

function instalarAtualizacaoDiariaFechamentoCavok() {
  var handler = 'atualizarFechamentoCavokDiario';
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
  var trigger = ScriptApp.newTrigger(handler)
    .timeBased()
    .atHour(5)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone('America/Sao_Paulo')
    .create();
  return {
    ok: true,
    handler: handler,
    triggerId: trigger.getUniqueId(),
    horario: '05:00',
    fuso: 'America/Sao_Paulo'
  };
}
