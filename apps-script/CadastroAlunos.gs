// ============================================================
// CadastroAlunos.gs — Backend da fila S141 + Trello
// SAFE Escola de Aviação | SAFE Hub
// ============================================================

var CADASTRO_ALUNOS_SHEET_ID = '1aNLtIIvalqPG7FkKncD5j16Pmgy5ly-34coaa4Gyyp8';
var CADASTRO_ALUNOS_SHEET_NAME = 'Planilha Alunos';

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
  var porMatricula = {};
  linhas.forEach(function(item) {
    var aluno = linhaParaCadastroAluno_(item.row, item.rowNumber, indices);
    if (aluno.cpf) {
      if (!porCpf[aluno.cpf]) porCpf[aluno.cpf] = [];
      porCpf[aluno.cpf].push({ item: item, aluno: aluno });
    }
    if (aluno.matricula) {
      if (!porMatricula[aluno.matricula]) porMatricula[aluno.matricula] = [];
      porMatricula[aluno.matricula].push({ item: item, aluno: aluno });
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

    var candidatos = porCpf[novo.cpf] || [];
    if (!candidatos.length && novo.matricula) candidatos = porMatricula[novo.matricula] || [];
    var ativo = candidatos.filter(function(c) { return c.aluno.status !== 'inativo'; })[0];
    var inativo = candidatos.filter(function(c) { return c.aluno.status === 'inativo'; })[0];
    var mesmoCurso = candidatos.filter(function(c) {
      return normalizarCursoCadastroAluno_(c.aluno.curso).codigo === novo.cursoOperacional;
    })[0];
    var conflitoNome = (porNome[normalizarTextoCadastroAluno_(novo.nome)] || []).some(function(c) {
      return c.aluno.cpf && c.aluno.cpf !== novo.cpf;
    });
    var cpfInvalido = !novo.cpf || !novo.cpfValido;

    if (cpfInvalido) {
      var obsCpf = novo.cpf
        ? 'CPF inválido no XLS do CAVOK. Corrija o cadastro antes de seguir para S141/Trello.'
        : 'CPF ausente no XLS do CAVOK. Corrija o cadastro antes de seguir para S141/Trello.';
      if (mesmoCurso || ativo || inativo) {
        var alvoCpf = mesmoCurso || ativo || inativo;
        atualizarLinhaCadastroAluno_(sheet, alvoCpf.item.rowNumber, indices, novo, {
          situacao: ativo || mesmoCurso ? 'Ativo' : 'Inativo',
          s141: false,
          hubStatus: 'atencao',
          obs: obsCpf,
          atualizadoEm: agora
        });
        resumo.existentes++;
      } else {
        appendCadastroAluno_(sheet, indices, novo, {
          situacao: 'Ativo',
          s141: false,
          hubStatus: 'atencao',
          obs: obsCpf,
          atualizadoEm: agora
        });
        resumo.novos++;
      }
      resumo.atencoes++;
      if (!novo.elegivel) resumo.naoElegiveis++;
      return;
    }

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
    if (novo.matricula) {
      if (!porMatricula[novo.matricula]) porMatricula[novo.matricula] = [];
      porMatricula[novo.matricula].push({ item: item, aluno: linhaParaCadastroAluno_(item.row, rowNumber, indices) });
    }
    resumo.novos++;
    if (!novo.elegivel) resumo.naoElegiveis++;
    if (conflitoNome) resumo.atencoes++;
  });

  var duplicidadesRemovidas = removerDuplicidadesExatasCadastroAlunos_(sheet, indices);
  if (duplicidadesRemovidas) resumo.atencoes += duplicidadesRemovidas;

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
  if (!aluno.s141) throw new Error('Marque o S141 antes de sincronizar o Trello.');
  if (!aluno.baseTrello) throw new Error('Base não identificada. Revise o cadastro antes de sincronizar Trello.');

  var dados = sincronizarCadastroAlunoNoTrello_(aluno);
  var trelloUrl = dados.url || '';
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
  var cpf = normalizarCpfCadastroAluno_(valorLinhaCadastroAluno_(row, idx.cpf));
  var observacao = String(valorLinhaCadastroAluno_(row, idx.observacao) || '').trim();
  if (atencaoCpfResolvidaCadastroAluno_(hubStatus, observacao, cpf)) {
    hubStatus = '';
    observacao = '';
  }
  var status = calcularStatusCadastroAluno_(ativo, s141, cursoInfo, baseInfo, hubStatus);

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
    observacao: observacao
  };
}

function atencaoCpfResolvidaCadastroAluno_(hubStatus, observacao, cpf) {
  if (String(hubStatus || '') !== 'atencao') return false;
  if (normalizarTextoCadastroAluno_(observacao).indexOf('cpf invalido') === -1) return false;
  return cpfValidoCadastroAluno_(cpf);
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
    cpfValido: cpfValidoCadastroAluno_(obj.cpf),
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
  var cpf = String(valor || '').replace(/\D/g, '');
  var cpfComZero = '0' + cpf;
  if (cpf.length === 10 && cpfValidoNumeroCadastroAluno_(cpfComZero)) return cpfComZero;
  return cpf;
}

function cpfValidoCadastroAluno_(valor) {
  var cpf = normalizarCpfCadastroAluno_(valor);
  return cpfValidoNumeroCadastroAluno_(cpf);
}

function cpfValidoNumeroCadastroAluno_(cpf) {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  var soma = 0;
  for (var i = 0; i < 9; i++) soma += Number(cpf.charAt(i)) * (10 - i);
  var digito1 = 11 - (soma % 11);
  if (digito1 >= 10) digito1 = 0;

  soma = 0;
  for (var j = 0; j < 10; j++) soma += Number(cpf.charAt(j)) * (11 - j);
  var digito2 = 11 - (soma % 11);
  if (digito2 >= 10) digito2 = 0;

  return digito1 === Number(cpf.charAt(9)) && digito2 === Number(cpf.charAt(10));
}

function removerDuplicidadesExatasCadastroAlunos_(sheet, idx) {
  var headerInfo = detectarHeaderCadastroAlunos_(sheet);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= headerInfo.row) return 0;

  var values = sheet.getRange(headerInfo.row + 1, 1, lastRow - headerInfo.row, lastCol).getValues();
  var grupos = {};
  values.forEach(function(row, offset) {
    var rowNumber = headerInfo.row + 1 + offset;
    var aluno = linhaParaCadastroAluno_(row, rowNumber, idx);
    var chave = [
      aluno.matricula,
      aluno.cpf,
      normalizarCursoCadastroAluno_(aluno.curso).codigo,
      normalizarTextoCadastroAluno_(aluno.nome)
    ].join('|');
    if (!aluno.matricula || !aluno.cpf || !aluno.nome) return;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push({ rowNumber: rowNumber, aluno: aluno });
  });

  var linhasParaExcluir = [];
  Object.keys(grupos).forEach(function(chave) {
    var grupo = grupos[chave];
    if (grupo.length < 2) return;
    grupo.sort(function(a, b) {
      return scoreLinhaCadastroAluno_(b.aluno) - scoreLinhaCadastroAluno_(a.aluno) ||
        a.rowNumber - b.rowNumber;
    });
    grupo.slice(1).forEach(function(item) {
      linhasParaExcluir.push(item.rowNumber);
    });
  });

  linhasParaExcluir.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) {
    sheet.deleteRow(rowNumber);
  });
  return linhasParaExcluir.length;
}

function scoreLinhaCadastroAluno_(aluno) {
  var score = 0;
  if (aluno.status !== 'inativo') score += 10;
  if (aluno.status && aluno.status !== 'atencao') score += 20;
  if (aluno.s141 || aluno.status === 'concluido' || aluno.status === 'concluido_legado') score += 100;
  if (aluno.trelloUrl) score += 50;
  return score;
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

function sincronizarCadastroAlunoNoTrello_(aluno) {
  var cfg = obterConfigCadastroAlunosTrello_();
  var curso = String(aluno.cursoCodigo || '').toUpperCase();
  var listId = cfg.listas[curso];
  var templateId = cfg.templates[curso];
  if (!listId || !templateId) throw new Error('Curso sem lista/template Trello configurado: ' + curso);

  var card = buscarCardCadastroAlunoTrello_(cfg, aluno);
  var criado = false;
  if (!card) {
    card = criarCardCadastroAlunoTrello_(cfg, aluno, listId, templateId);
    criado = true;
  } else if (String(card.idList) !== String(listId)) {
    card = trelloCadastroAlunos_('put', '/cards/' + card.id, {
      idList: listId
    }, null, cfg);
  }

  atualizarBaseCadastroAlunoTrello_(cfg, card.id, aluno.baseTrello);
  marcarS141CadastroAlunoTrello_(cfg, card.id, curso);

  var atualizado = trelloCadastroAlunos_('get', '/cards/' + card.id, {
    fields: 'name,url,idList'
  }, null, cfg);

  return {
    url: atualizado.url || card.url || '',
    status: criado ? 'criado' : 'atualizado',
    message: criado ? 'Card criado e checklist S141 marcado.' : 'Card atualizado e checklist S141 marcado.'
  };
}

function buscarCardCadastroAlunoTrello_(cfg, aluno) {
  var cardPorUrl = buscarCardCadastroAlunoPorUrl_(cfg, aluno.trelloUrl);
  if (cardPorUrl) return cardPorUrl;

  var cards = trelloCadastroAlunos_('get', '/boards/' + cfg.boardId + '/cards', {
    fields: 'name,idList,closed,url,isTemplate'
  }, null, cfg);
  var nomeAluno = normalizarNomeCartaoCadastroAlunoTrello_(aluno.nome);
  var encontrados = cards.filter(function(card) {
    if (card.closed || card.isTemplate) return false;
    return normalizarNomeCartaoCadastroAlunoTrello_(card.name) === nomeAluno;
  });
  if (!encontrados.length) return null;
  if (encontrados.length > 1) {
    throw new Error('Mais de um card encontrado no Trello com este nome. Abra o Trello e resolva a duplicidade antes de sincronizar.');
  }
  return encontrados[0];
}

function buscarCardCadastroAlunoPorUrl_(cfg, url) {
  var shortLink = extrairShortLinkTrello_(url);
  if (!shortLink) return null;
  try {
    var card = trelloCadastroAlunos_('get', '/cards/' + shortLink, {
      fields: 'name,idList,closed,url,isTemplate'
    }, null, cfg);
    if (card && !card.closed && !card.isTemplate) return card;
  } catch (e) {
    return null;
  }
  return null;
}

function criarCardCadastroAlunoTrello_(cfg, aluno, listId, templateId) {
  return trelloCadastroAlunos_('post', '/cards', {
    idList: listId,
    idCardSource: templateId,
    keepFromSource: 'all',
    name: aluno.nome,
    pos: 'top'
  }, null, cfg);
}

function atualizarBaseCadastroAlunoTrello_(cfg, cardId, base) {
  if (!cfg.baseFields.sjk || !cfg.baseFields.cpn) {
    throw new Error('Campos de Base do Trello não configurados.');
  }
  var baseNormalizada = String(base || '').toUpperCase();
  setCheckboxCadastroAlunoTrello_(cfg, cardId, cfg.baseFields.sjk, baseNormalizada === 'SJK');
  setCheckboxCadastroAlunoTrello_(cfg, cardId, cfg.baseFields.cpn, baseNormalizada === 'CPN');
}

function setCheckboxCadastroAlunoTrello_(cfg, cardId, fieldId, checked) {
  trelloCadastroAlunos_('put', '/cards/' + cardId + '/customField/' + fieldId + '/item', {}, {
    value: {
      checked: checked ? 'true' : 'false'
    }
  }, cfg);
}

function marcarS141CadastroAlunoTrello_(cfg, cardId, curso) {
  var checklists = trelloCadastroAlunos_('get', '/cards/' + cardId + '/checklists', {}, null, cfg);
  var item = localizarItemS141CadastroAlunoTrello_(checklists, curso);
  if (!item) {
    throw new Error('Checklist "Cadastro S141" do curso ' + curso + ' não encontrado neste card.');
  }
  trelloCadastroAlunos_('put', '/cards/' + cardId + '/checkItem/' + item.id, {
    state: 'complete'
  }, null, cfg);
}

function localizarItemS141CadastroAlunoTrello_(checklists, curso) {
  var prioridades = {
    PP: ['piloto privado inicial'],
    PC: ['cadastro anac piloto comercial', 'piloto comercial inicial'],
    INVA: ['cadastro anac inva', 'inva inicial']
  }[curso] || [];

  for (var p = 0; p < prioridades.length; p++) {
    var alvo = prioridades[p];
    for (var c = 0; c < checklists.length; c++) {
      var checklist = checklists[c];
      var nomeChecklist = normalizarTextoCadastroAluno_(checklist.name);
      if (nomeChecklist.indexOf(alvo) === -1) continue;
      var item = localizarItemCadastroS141_(checklist);
      if (item) return item;
    }
  }

  if (curso === 'PP') {
    for (var i = 0; i < checklists.length; i++) {
      var itemInicial = localizarItemCadastroS141_(checklists[i]);
      if (itemInicial) return itemInicial;
    }
  }
  return null;
}

function localizarItemCadastroS141_(checklist) {
  var itens = checklist.checkItems || [];
  for (var i = 0; i < itens.length; i++) {
    if (normalizarTextoCadastroAluno_(itens[i].name) === 'cadastro s141') return itens[i];
  }
  return null;
}

function trelloCadastroAlunos_(method, path, params, payload, cfg) {
  var query = {
    key: cfg.key,
    token: cfg.token
  };
  Object.keys(params || {}).forEach(function(k) {
    if (params[k] !== undefined && params[k] !== null) query[k] = params[k];
  });
  var url = 'https://api.trello.com/1' + path + '?' + Object.keys(query).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
  }).join('&');
  var opcoes = {
    method: method,
    muteHttpExceptions: true,
    followRedirects: true
  };
  if (payload) {
    opcoes.contentType = 'application/json';
    opcoes.payload = JSON.stringify(payload);
  }
  var resposta = UrlFetchApp.fetch(url, opcoes);
  var status = resposta.getResponseCode();
  var texto = resposta.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Trello respondeu erro ' + status + ': ' + texto.slice(0, 180));
  }
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch (e) {
    return {};
  }
}

function obterConfigCadastroAlunosTrello_() {
  var props = PropertiesService.getScriptProperties();
  var cfg = {
    key: props.getProperty('TRELLO_API_KEY'),
    token: props.getProperty('TRELLO_TOKEN'),
    boardId: props.getProperty('CADASTRO_ALUNOS_TRELLO_BOARD_ID'),
    listas: {
      PP: props.getProperty('CADASTRO_ALUNOS_TRELLO_LIST_PP_ID'),
      PC: props.getProperty('CADASTRO_ALUNOS_TRELLO_LIST_PC_ID'),
      INVA: props.getProperty('CADASTRO_ALUNOS_TRELLO_LIST_INVA_ID')
    },
    templates: {
      PP: props.getProperty('CADASTRO_ALUNOS_TRELLO_TEMPLATE_PP_ID'),
      PC: props.getProperty('CADASTRO_ALUNOS_TRELLO_TEMPLATE_PC_ID'),
      INVA: props.getProperty('CADASTRO_ALUNOS_TRELLO_TEMPLATE_INVA_ID')
    },
    baseFields: {
      sjk: props.getProperty('CADASTRO_ALUNOS_TRELLO_BASE_SJK_FIELD_ID'),
      cpn: props.getProperty('CADASTRO_ALUNOS_TRELLO_BASE_CPN_FIELD_ID')
    }
  };

  if (!cfg.key || !cfg.token || !cfg.boardId) {
    throw new Error('Credenciais/board do Trello ainda não configurados nas propriedades do Apps Script.');
  }
  return cfg;
}

function extrairShortLinkTrello_(url) {
  var match = String(url || '').match(/trello\.com\/c\/([^\/?#]+)/i);
  return match ? match[1] : '';
}

function normalizarNomeCartaoCadastroAlunoTrello_(nome) {
  return normalizarTextoCadastroAluno_(nome).replace(/^[0-9]+[\s.]*/, '').trim();
}
