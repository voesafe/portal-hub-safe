// ============================================================
// CadastroAlunos.gs — Backend da fila S141 + Trello
// SAFE Escola de Aviação | SAFE Hub
// ============================================================

var CADASTRO_ALUNOS_SHEET_ID = '1aNLtIIvalqPG7FkKncD5j16Pmgy5ly-34coaa4Gyyp8';
var CADASTRO_ALUNOS_SHEET_NAME = 'Planilha Alunos';
var CADASTRO_ALUNOS_TRELLO_API_URL = 'CADASTRO_ALUNOS_API_URL_AQUI';

var CADASTRO_ALUNOS_EXTRA_HEADERS = [
  'HUB_STATUS',
  'CURSO_OPERACIONAL',
  'BASE_TRELLO',
  'TRELLO_URL',
  'TRELLO_STATUS',
  'OBS_HUB',
  'ATUALIZADO_EM'
];

function listarCadastroAlunos(usuario) {
  var contexto = carregarContextoCadastroAlunos_();
  var alunos = contexto.linhas.map(function(item) {
    return linhaParaCadastroAluno_(item.row, item.rowNumber, contexto.indices);
  }).filter(function(aluno) {
    return aluno.nome || aluno.cpf || aluno.matricula;
  });

  return {
    alunos: alunos,
    resumo: resumirCadastroAlunos_(alunos),
    usuario: String(usuario.email || usuario.nome || '')
  };
}

function importarCadastroAlunos(alunos, usuario) {
  if (!Array.isArray(alunos) || !alunos.length) {
    throw new Error('Nenhum aluno recebido para importação.');
  }

  var contexto = carregarContextoCadastroAlunos_();
  var sheet = contexto.sheet;
  var indices = contexto.indices;
  var linhas = contexto.linhas;
  var agora = new Date();
  var resumo = {
    lidas: alunos.length,
    novos: 0,
    existentes: 0,
    reativados: 0,
    novosCursos: 0,
    naoElegiveis: 0,
    atencoes: 0
  };

  var porCpf = {};
  var porNome = {};
  linhas.forEach(function(item) {
    var aluno = linhaParaCadastroAluno_(item.row, item.rowNumber, indices);
    if (aluno.cpf) {
      if (!porCpf[aluno.cpf]) porCpf[aluno.cpf] = [];
      porCpf[aluno.cpf].push({ item: item, aluno: aluno });
    }
    var nomeKey = normalizarTextoCadastroAluno_(aluno.nome);
    if (nomeKey) {
      if (!porNome[nomeKey]) porNome[nomeKey] = [];
      porNome[nomeKey].push({ item: item, aluno: aluno });
    }
  });

  alunos.forEach(function(raw) {
    var novo = normalizarAlunoImportado_(raw);
    if (!novo.nome && !novo.cpf) return;
    if (!novo.cpf) {
      resumo.atencoes++;
      return;
    }

    var candidatos = porCpf[novo.cpf] || [];
    var ativo = candidatos.filter(function(c) { return c.aluno.status !== 'inativo'; })[0];
    var inativo = candidatos.filter(function(c) { return c.aluno.status === 'inativo'; })[0];
    var mesmoCurso = candidatos.filter(function(c) {
      return normalizarCursoCadastroAluno_(c.aluno.curso).codigo === novo.cursoOperacional;
    })[0];
    var conflitoNome = (porNome[normalizarTextoCadastroAluno_(novo.nome)] || []).some(function(c) {
      return c.aluno.cpf && c.aluno.cpf !== novo.cpf;
    });

    if (inativo && !ativo) {
      atualizarLinhaCadastroAluno_(sheet, inativo.item.rowNumber, indices, novo, {
        situacao: 'Ativo',
        s141: false,
        hubStatus: novo.elegivel ? 'reativado' : 'nao_elegivel_s141',
        obs: novo.elegivel
          ? 'Reativado automaticamente pelo upload CAVOK.'
          : 'Reativado pelo upload CAVOK; curso não elegível S141.',
        atualizadoEm: agora
      });
      resumo.reativados++;
      if (!novo.elegivel) resumo.naoElegiveis++;
      return;
    }

    if (mesmoCurso) {
      atualizarLinhaCadastroAluno_(sheet, mesmoCurso.item.rowNumber, indices, novo, {
        preservarStatus: true,
        atualizadoEm: agora
      });
      resumo.existentes++;
      if (!novo.elegivel) resumo.naoElegiveis++;
      return;
    }

    if (ativo && novo.elegivel) {
      atualizarLinhaCadastroAluno_(sheet, ativo.item.rowNumber, indices, novo, {
        situacao: 'Ativo',
        s141: false,
        hubStatus: conflitoNome ? 'atencao' : 'novo_curso',
        obs: conflitoNome
          ? 'Novo curso detectado, mas existe outro CPF com nome parecido.'
          : 'Novo curso detectado pelo upload CAVOK.',
        atualizadoEm: agora
      });
      resumo.novosCursos++;
      if (conflitoNome) resumo.atencoes++;
      return;
    }

    if (ativo && !novo.elegivel) {
      resumo.existentes++;
      resumo.naoElegiveis++;
      return;
    }

    var rowNumber = appendCadastroAluno_(sheet, indices, novo, {
      situacao: 'Ativo',
      s141: false,
      hubStatus: conflitoNome ? 'atencao' : (novo.elegivel ? 'pendente_s141' : 'nao_elegivel_s141'),
      obs: conflitoNome ? 'Nome semelhante encontrado com CPF diferente.' : '',
      atualizadoEm: agora
    });
    var item = { row: sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0], rowNumber: rowNumber };
    if (!porCpf[novo.cpf]) porCpf[novo.cpf] = [];
    porCpf[novo.cpf].push({ item: item, aluno: linhaParaCadastroAluno_(item.row, rowNumber, indices) });
    resumo.novos++;
    if (!novo.elegivel) resumo.naoElegiveis++;
    if (conflitoNome) resumo.atencoes++;
  });

  var listado = listarCadastroAlunos(usuario);
  listado.resumoImportacao = resumo;
  return {
    alunos: listado.alunos,
    resumo: resumo
  };
}

function marcarS141CadastroAluno(id, usuario) {
  var contexto = carregarContextoCadastroAlunos_();
  var alvo = buscarLinhaCadastroAluno_(contexto, id);
  if (!alvo) throw new Error('Aluno não encontrado.');

  var aluno = linhaParaCadastroAluno_(alvo.row, alvo.rowNumber, contexto.indices);
  if (aluno.status === 'inativo') throw new Error('Reative o aluno antes de marcar S141.');
  if (!aluno.elegivel) throw new Error('Este curso não é elegível S141.');

  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 's141', true);
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'hubStatus', 'pronto_trello');
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'observacao', 'S141 marcado pelo Hub por ' + String(usuario.email || usuario.nome || 'Master') + '.');
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'atualizadoEm', new Date());

  var listado = listarCadastroAlunos(usuario);
  return {
    alunos: listado.alunos,
    mensagem: 'S141 marcado. Aluno pronto para sincronizar Trello.'
  };
}

function alterarSituacaoCadastroAluno(id, ativo, usuario) {
  var contexto = carregarContextoCadastroAlunos_();
  var alvo = buscarLinhaCadastroAluno_(contexto, id);
  if (!alvo) throw new Error('Aluno não encontrado.');
  var aluno = linhaParaCadastroAluno_(alvo.row, alvo.rowNumber, contexto.indices);
  var novoStatus = ativo
    ? (aluno.elegivel ? 'reativado' : 'nao_elegivel_s141')
    : 'inativo';

  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'situacao', ativo ? 'Ativo' : 'Inativo');
  if (ativo) setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 's141', false);
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'hubStatus', novoStatus);
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'observacao', (ativo ? 'Reativado' : 'Inativado') + ' no Hub por ' + String(usuario.email || usuario.nome || 'Master') + '.');
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'atualizadoEm', new Date());

  var listado = listarCadastroAlunos(usuario);
  return {
    alunos: listado.alunos,
    mensagem: ativo ? 'Aluno reativado.' : 'Aluno inativado.'
  };
}

function sincronizarTrelloCadastroAluno(id, usuario, token) {
  var contexto = carregarContextoCadastroAlunos_();
  var alvo = buscarLinhaCadastroAluno_(contexto, id);
  if (!alvo) throw new Error('Aluno não encontrado.');

  var aluno = linhaParaCadastroAluno_(alvo.row, alvo.rowNumber, contexto.indices);
  if (aluno.status === 'inativo') throw new Error('Reative o aluno antes de sincronizar Trello.');
  if (!aluno.elegivel) throw new Error('Este curso não é elegível S141.');
  if (!aluno.baseTrello) throw new Error('Base não identificada. Revise o cadastro antes de sincronizar Trello.');

  var endpoint = obterCadastroAlunosTrelloApiUrl_();
  if (!endpoint || endpoint === 'CADASTRO_ALUNOS_API_URL_AQUI') {
    throw new Error('Endpoint Trello ainda não configurado em CADASTRO_ALUNOS_API_URL.');
  }

  var params = {
    action: 'sincronizarAluno',
    nome: aluno.nome,
    cpf: aluno.cpf,
    matricula: aluno.matricula,
    base: aluno.baseTrello,
    curso: aluno.cursoOperacional,
    token: token || ''
  };
  var url = endpoint + '?' + Object.keys(params).map(function(chave) {
    return encodeURIComponent(chave) + '=' + encodeURIComponent(params[chave] || '');
  }).join('&');
  var resposta = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });
  var texto = resposta.getContentText();
  var dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    throw new Error('O backend Trello respondeu em formato inválido.');
  }
  if (!dados.ok) throw new Error(dados.error || 'Não foi possível sincronizar o Trello.');

  var trelloUrl = dados.url || dados.data && dados.data.url || '';
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'trelloUrl', trelloUrl);
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'trelloStatus', dados.status || 'sincronizado');
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'hubStatus', 'concluido');
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'observacao', dados.message || 'Trello sincronizado pelo Hub.');
  setCadastroAlunoValor_(contexto.sheet, alvo.rowNumber, contexto.indices, 'atualizadoEm', new Date());

  var listado = listarCadastroAlunos(usuario);
  return {
    alunos: listado.alunos,
    mensagem: dados.message || 'Trello sincronizado com sucesso.',
    url: trelloUrl
  };
}

function carregarContextoCadastroAlunos_() {
  var ss = SpreadsheetApp.openById(obterCadastroAlunosSheetId_());
  var sheet = ss.getSheetByName(CADASTRO_ALUNOS_SHEET_NAME);
  if (!sheet) throw new Error('Aba de alunos não encontrada: ' + CADASTRO_ALUNOS_SHEET_NAME);
  var headerInfo = detectarHeaderCadastroAlunos_(sheet);
  garantirColunasCadastroAlunos_(sheet, headerInfo);
  headerInfo = detectarHeaderCadastroAlunos_(sheet);

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var rows = [];
  if (lastRow > headerInfo.row) {
    var values = sheet.getRange(headerInfo.row + 1, 1, lastRow - headerInfo.row, lastCol).getValues();
    values.forEach(function(row, idx) {
      if (row.join('').trim() !== '') rows.push({ row: row, rowNumber: headerInfo.row + 1 + idx });
    });
  }
  return {
    ss: ss,
    sheet: sheet,
    headerRow: headerInfo.row,
    indices: headerInfo.indices,
    linhas: rows
  };
}

function detectarHeaderCadastroAlunos_(sheet) {
  var maxRows = Math.min(sheet.getLastRow(), 12);
  var maxCols = sheet.getLastColumn();
  var values = sheet.getRange(1, 1, maxRows, maxCols).getValues();
  for (var r = 0; r < values.length; r++) {
    var indices = mapearCabecalhosCadastroAlunos_(values[r]);
    if (indices.nome && indices.cpf && indices.curso) {
      return { row: r + 1, indices: indices };
    }
  }
  throw new Error('Cabeçalho da Planilha Alunos não encontrado.');
}

function mapearCabecalhosCadastroAlunos_(headers) {
  var map = {};
  headers.forEach(function(header, idx) {
    var key = normalizarHeaderCadastroAluno_(header);
    if (key === 'matricula') map.matricula = idx + 1;
    if (key === 'nome') map.nome = idx + 1;
    if (key === 'cpf') map.cpf = idx + 1;
    if (key === 'email' || key === 'e_mail') map.email = idx + 1;
    if (key === 'curso') map.curso = idx + 1;
    if (key === 'base') map.base = idx + 1;
    if (key === 'data_matricula') map.dataMatricula = idx + 1;
    if (key === 'situacao') map.situacao = idx + 1;
    if (key === 's141') map.s141 = idx + 1;
    if (key === 'hub_status') map.hubStatus = idx + 1;
    if (key === 'curso_operacional') map.cursoOperacional = idx + 1;
    if (key === 'base_trello') map.baseTrello = idx + 1;
    if (key === 'trello_url') map.trelloUrl = idx + 1;
    if (key === 'trello_status') map.trelloStatus = idx + 1;
    if (key === 'obs_hub' || key === 'observacao' || key === 'observacao_hub') map.observacao = idx + 1;
    if (key === 'atualizado_em') map.atualizadoEm = idx + 1;
  });
  return map;
}

function garantirColunasCadastroAlunos_(sheet, headerInfo) {
  var headers = sheet.getRange(headerInfo.row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var existentes = {};
  headers.forEach(function(header) {
    existentes[normalizarHeaderCadastroAluno_(header)] = true;
  });
  CADASTRO_ALUNOS_EXTRA_HEADERS.forEach(function(header) {
    if (!existentes[normalizarHeaderCadastroAluno_(header)]) {
      sheet.getRange(headerInfo.row, sheet.getLastColumn() + 1).setValue(header);
    }
  });
}

function linhaParaCadastroAluno_(row, rowNumber, idx) {
  var cursoInfo = normalizarCursoCadastroAluno_(valorLinhaCadastroAluno_(row, idx.curso));
  var baseInfo = normalizarBaseCadastroAluno_(valorLinhaCadastroAluno_(row, idx.base));
  var ativo = normalizarTextoCadastroAluno_(valorLinhaCadastroAluno_(row, idx.situacao) || 'Ativo') !== 'inativo';
  var s141 = valorBooleano(valorLinhaCadastroAluno_(row, idx.s141));
  var hubStatus = String(valorLinhaCadastroAluno_(row, idx.hubStatus) || '').trim();
  var status = calcularStatusCadastroAluno_(ativo, s141, cursoInfo, baseInfo, hubStatus);
  var cpf = normalizarCpfCadastroAluno_(valorLinhaCadastroAluno_(row, idx.cpf));

  return {
    id: String(rowNumber),
    rowNumber: rowNumber,
    matricula: String(valorLinhaCadastroAluno_(row, idx.matricula) || '').trim(),
    nome: String(valorLinhaCadastroAluno_(row, idx.nome) || '').trim(),
    cpf: cpf,
    cpfFormatado: formatarCpfCadastroAluno_(cpf),
    email: String(valorLinhaCadastroAluno_(row, idx.email) || '').trim(),
    curso: String(valorLinhaCadastroAluno_(row, idx.curso) || '').trim(),
    cursoOperacional: cursoInfo.label,
    cursoCodigo: cursoInfo.codigo,
    elegivel: !!cursoInfo.codigo,
    base: String(valorLinhaCadastroAluno_(row, idx.base) || '').trim(),
    baseTrello: String(valorLinhaCadastroAluno_(row, idx.baseTrello) || '').trim() || baseInfo.codigo,
    dataMatricula: formatarDataCadastroAluno_(valorLinhaCadastroAluno_(row, idx.dataMatricula)),
    situacao: ativo ? 'Ativo' : 'Inativo',
    s141: s141,
    status: status,
    trelloUrl: String(valorLinhaCadastroAluno_(row, idx.trelloUrl) || '').trim(),
    trelloStatus: String(valorLinhaCadastroAluno_(row, idx.trelloStatus) || '').trim(),
    observacao: String(valorLinhaCadastroAluno_(row, idx.observacao) || '').trim()
  };
}

function calcularStatusCadastroAluno_(ativo, s141, cursoInfo, baseInfo, hubStatus) {
  if (!ativo) return 'inativo';
  if (hubStatus) return hubStatus;
  if (s141) return 'concluido_legado';
  if (!cursoInfo.codigo) return 'nao_elegivel_s141';
  if (!baseInfo.codigo) return 'atencao';
  return 'pendente_s141';
}

function normalizarAlunoImportado_(raw) {
  var obj = {};
  Object.keys(raw || {}).forEach(function(key) {
    obj[normalizarHeaderCadastroAluno_(key)] = raw[key];
  });
  var cursoOriginal = obj.curso || '';
  var cursoInfo = normalizarCursoCadastroAluno_(cursoOriginal);
  var baseOriginal = obj.base || '';
  var baseInfo = normalizarBaseCadastroAluno_(baseOriginal);
  return {
    matricula: String(obj.matricula || '').trim(),
    nome: String(obj.nome || obj.cliente || '').trim(),
    cpf: normalizarCpfCadastroAluno_(obj.cpf),
    email: String(obj.email || obj.e_mail || '').trim(),
    curso: String(cursoOriginal || '').trim(),
    cursoOperacional: cursoInfo.codigo,
    cursoLabel: cursoInfo.label,
    elegivel: !!cursoInfo.codigo,
    base: String(baseOriginal || '').trim(),
    baseTrello: baseInfo.codigo,
    dataMatricula: obj.data_matricula || ''
  };
}

function normalizarCursoCadastroAluno_(curso) {
  var t = normalizarTextoCadastroAluno_(curso);
  if (!t) return { codigo: '', label: '' };
  if (t.indexOf('ppa') !== -1 && t.indexOf('pratico') !== -1) {
    return { codigo: 'PP', label: 'Piloto Privado' };
  }
  if ((t.indexOf('pc') !== -1 || t.indexOf('pca') !== -1) && t.indexOf('pratico') !== -1) {
    return { codigo: 'PC', label: 'Piloto Comercial' };
  }
  if (t.indexOf('pc ifr') !== -1 || t.indexOf('pc ifra') !== -1 ||
      t.indexOf('pcifr') !== -1 || t.indexOf('pcifra') !== -1 || t.indexOf('pc_ifr') !== -1) {
    return { codigo: 'PC', label: 'Piloto Comercial' };
  }
  if (t.indexOf('inva') !== -1 && t.indexOf('pratico') !== -1) {
    return { codigo: 'INVA', label: 'INVA' };
  }
  return { codigo: '', label: '' };
}

function normalizarBaseCadastroAluno_(base) {
  var t = normalizarTextoCadastroAluno_(base);
  if (t.indexOf('sbsj') !== -1) return { codigo: 'SJK', label: 'São José dos Campos (SJK)' };
  if (t.indexOf('sdam') !== -1) return { codigo: 'CPN', label: 'Campinas (CPN)' };
  if (t === 'sjk') return { codigo: 'SJK', label: 'São José dos Campos (SJK)' };
  if (t === 'cpn') return { codigo: 'CPN', label: 'Campinas (CPN)' };
  return { codigo: '', label: '' };
}

function appendCadastroAluno_(sheet, idx, novo, opcoes) {
  var row = [];
  row[idx.matricula - 1] = novo.matricula;
  row[idx.nome - 1] = novo.nome;
  row[idx.cpf - 1] = novo.cpf;
  row[idx.email - 1] = novo.email;
  row[idx.curso - 1] = novo.curso;
  row[idx.base - 1] = novo.base;
  row[idx.dataMatricula - 1] = novo.dataMatricula;
  row[idx.situacao - 1] = opcoes.situacao || 'Ativo';
  row[idx.s141 - 1] = !!opcoes.s141;
  row[idx.hubStatus - 1] = opcoes.hubStatus || '';
  row[idx.cursoOperacional - 1] = novo.cursoOperacional || '';
  row[idx.baseTrello - 1] = novo.baseTrello || '';
  row[idx.observacao - 1] = opcoes.obs || '';
  row[idx.atualizadoEm - 1] = opcoes.atualizadoEm || new Date();
  var lastCol = sheet.getLastColumn();
  for (var i = 0; i < lastCol; i++) if (typeof row[i] === 'undefined') row[i] = '';
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function atualizarLinhaCadastroAluno_(sheet, rowNumber, idx, novo, opcoes) {
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'matricula', novo.matricula);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'nome', novo.nome);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'cpf', novo.cpf);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'email', novo.email);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'curso', novo.curso);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'base', novo.base);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'dataMatricula', novo.dataMatricula);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'cursoOperacional', novo.cursoOperacional || '');
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'baseTrello', novo.baseTrello || '');
  if (opcoes.situacao) setCadastroAlunoValor_(sheet, rowNumber, idx, 'situacao', opcoes.situacao);
  if (opcoes.hasOwnProperty('s141')) setCadastroAlunoValor_(sheet, rowNumber, idx, 's141', !!opcoes.s141);
  if (!opcoes.preservarStatus) setCadastroAlunoValor_(sheet, rowNumber, idx, 'hubStatus', opcoes.hubStatus || '');
  if (opcoes.obs !== undefined) setCadastroAlunoValor_(sheet, rowNumber, idx, 'observacao', opcoes.obs);
  setCadastroAlunoValor_(sheet, rowNumber, idx, 'atualizadoEm', opcoes.atualizadoEm || new Date());
}

function buscarLinhaCadastroAluno_(contexto, id) {
  var rowNumber = Number(id);
  for (var i = 0; i < contexto.linhas.length; i++) {
    if (contexto.linhas[i].rowNumber === rowNumber) return contexto.linhas[i];
  }
  return null;
}

function setCadastroAlunoValor_(sheet, rowNumber, idx, campo, valor) {
  var col = idx[campo];
  if (!col) return;
  sheet.getRange(rowNumber, col).setValue(valor);
}

function valorLinhaCadastroAluno_(row, col) {
  return col ? row[col - 1] : '';
}

function obterCadastroAlunosSheetId_() {
  return PropertiesService.getScriptProperties().getProperty('CADASTRO_ALUNOS_SHEET_ID') ||
    CADASTRO_ALUNOS_SHEET_ID;
}

function obterCadastroAlunosTrelloApiUrl_() {
  return PropertiesService.getScriptProperties().getProperty('CADASTRO_ALUNOS_API_URL') ||
    CADASTRO_ALUNOS_TRELLO_API_URL;
}

function normalizarHeaderCadastroAluno_(valor) {
  return normalizarTextoCadastroAluno_(valor).replace(/\s+/g, '_');
}

function normalizarTextoCadastroAluno_(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizarCpfCadastroAluno_(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function formatarCpfCadastroAluno_(cpf) {
  var v = normalizarCpfCadastroAluno_(cpf);
  if (v.length !== 11) return cpf || '';
  return v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9);
}

function formatarDataCadastroAluno_(valor) {
  if (!valor) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') return formatarData(valor);
  return String(valor).trim();
}

function resumirCadastroAlunos_(alunos) {
  var resumo = {
    total: alunos.length,
    ativos: 0,
    pendentes: 0,
    prontos: 0,
    concluidos: 0,
    atencao: 0,
    inativos: 0
  };
  alunos.forEach(function(aluno) {
    if (aluno.status === 'inativo') resumo.inativos++;
    else resumo.ativos++;
    if (aluno.status === 'pendente_s141' || aluno.status === 'novo_curso' || aluno.status === 'reativado') resumo.pendentes++;
    if (aluno.status === 'pronto_trello') resumo.prontos++;
    if (aluno.status === 'concluido' || aluno.status === 'concluido_legado') resumo.concluidos++;
    if (aluno.status === 'atencao') resumo.atencao++;
  });
  return resumo;
}
