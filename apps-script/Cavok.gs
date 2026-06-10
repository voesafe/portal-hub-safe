// ============================================================
// Cavok.gs - Consulta segura da API do CAVOK pelo backend
// ============================================================

var CAVOK_VOOS_API_URL = 'https://voesafe.cavok.in/api/voos/';
var CAVOK_USUARIO_PROP = 'CAVOK_API_USUARIO';
var CAVOK_SENHA_PROP = 'CAVOK_API_SENHA';

function credenciaisCavok_() {
  var props = PropertiesService.getScriptProperties();
  var usuario = props.getProperty(CAVOK_USUARIO_PROP);
  var senha = props.getProperty(CAVOK_SENHA_PROP);
  if (!usuario || !senha) {
    throw new Error('Credenciais da API CAVOK não configuradas no servidor.');
  }
  return {
    usuario: usuario,
    senha: senha,
    authorization: 'Basic ' + Utilities.base64Encode(usuario + ':' + senha)
  };
}

function datasDoMesCavok_(ano, mes) {
  var ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
  var datas = [];
  for (var dia = 1; dia <= ultimoDia; dia++) {
    datas.push([
      String(ano).padStart(4, '0'),
      String(mes).padStart(2, '0'),
      String(dia).padStart(2, '0')
    ].join('-'));
  }
  return datas;
}

function buscarVoosMesCavok_(ano, mes) {
  var competencia = validarCompetenciaFechamentoHoras_(ano, mes);
  var credenciais = credenciaisCavok_();
  var datas = datasDoMesCavok_(competencia.ano, competencia.mes);
  var requisicoes = datas.map(function(data) {
    return {
      url: CAVOK_VOOS_API_URL + '?data=' + encodeURIComponent(data),
      method: 'get',
      headers: { Authorization: credenciais.authorization },
      followRedirects: true,
      muteHttpExceptions: true
    };
  });
  var respostas = UrlFetchApp.fetchAll(requisicoes);
  var voos = [];
  var ids = {};

  respostas.forEach(function(resposta, index) {
    var codigo = resposta.getResponseCode();
    if (codigo < 200 || codigo >= 300) {
      throw new Error(
        'CAVOK indisponível para ' + datas[index] + ' (HTTP ' + codigo + ').'
      );
    }
    var conteudo;
    try {
      conteudo = JSON.parse(resposta.getContentText());
    } catch (e) {
      throw new Error('Resposta inválida do CAVOK para ' + datas[index] + '.');
    }
    var lista = Array.isArray(conteudo.response) ? conteudo.response : [];
    lista.forEach(function(voo) {
      var id = String(voo.Id || '');
      if (id && ids[id]) return;
      if (id) ids[id] = true;
      voos.push(voo);
    });
  });
  return voos;
}

function normalizarAeronaveCavok_(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .replace('SM-CPQ (CAMPINAS)', 'SM-CPQ')
    .replace('SM-SJK (SAO JOSE DOS CAMPOS)', 'SM-SJK')
    .replace('SM-SJK (SÃO JOSÉ DOS CAMPOS)', 'SM-SJK');
}

function consolidarFechamentoCavok_(voos) {
  var modelos = {};
  FECHAMENTO_HORAS_AERONAVES.forEach(function(item) {
    modelos[item.tipo] = {
      base: item.base,
      tipo: item.tipo,
      minutos: 0,
      minutosCotista: item.cotista ? 0 : null
    };
  });

  var ignorados = 0;
  var excluidosSemAluno = 0;
  var excluidosAdministrativo = 0;
  var voosConsiderados = 0;

  voos.forEach(function(voo) {
    var aeronave = normalizarAeronaveCavok_(voo.Aeronave);
    var modelo = modelos[aeronave];
    if (!modelo) {
      ignorados++;
      return;
    }

    var minutos = Math.max(0, numeroFechamentoHoras_(voo['Tempo total de voo']));
    modelo.minutos += minutos;
    voosConsiderados++;

    if (modelo.minutosCotista === null) return;
    var aluno = String(voo.Aluno || '').trim().toUpperCase();
    if (!aluno) {
      excluidosSemAluno += minutos;
    } else if (aluno === 'VOO ADMINISTRATIVO - SAFE') {
      excluidosAdministrativo += minutos;
    } else {
      modelo.minutosCotista += minutos;
    }
  });

  var horas = FECHAMENTO_HORAS_AERONAVES.map(function(item) {
    var modelo = modelos[item.tipo];
    return {
      base: modelo.base,
      tipo: modelo.tipo,
      horas: Math.round((modelo.minutos / 60) * 10) / 10,
      cotista_horas: modelo.minutosCotista === null
        ? null
        : Math.round((modelo.minutosCotista / 60) * 10) / 10
    };
  });

  return {
    horas: horas,
    resumoImportacao: {
      voosRecebidos: voos.length,
      voosConsiderados: voosConsiderados,
      voosIgnorados: ignorados,
      horasExcluidasSemAluno: Math.round((excluidosSemAluno / 60) * 10) / 10,
      horasExcluidasAdministrativo:
        Math.round((excluidosAdministrativo / 60) * 10) / 10
    }
  };
}

function importarFechamentoHorasCavok(dados) {
  var competencia = validarCompetenciaFechamentoHoras_(dados.ano, dados.mes);
  var voos = buscarVoosMesCavok_(competencia.ano, competencia.mes);
  var consolidado = consolidarFechamentoCavok_(voos);
  consolidado.ano = competencia.ano;
  consolidado.mes = competencia.mes;
  return consolidado;
}

/**
 * Execute uma vez pelo editor ou clasp para armazenar as credenciais,
 * sem incluí-las no código-fonte.
 */
function configurarCredenciaisCavok(usuario, senha) {
  if (!usuario || !senha) throw new Error('Usuário e senha do CAVOK são obrigatórios.');
  PropertiesService.getScriptProperties().setProperties({
    CAVOK_API_USUARIO: String(usuario),
    CAVOK_API_SENHA: String(senha)
  });
  return true;
}
