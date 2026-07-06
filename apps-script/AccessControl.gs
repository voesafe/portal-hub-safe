// ============================================================
// AccessControl.gs - Grupos, permissoes avulsas e superadmin
// SAFE Hub
// ============================================================

var ACCESS_PERMISSIONS = [
  ['inicio.visualizar', 'Início', 'Visualizar Início'],
  ['dashboard_vendas.visualizar_proprio', 'Dashboard de Vendas', 'Visualizar indicadores próprios'],
  ['dashboard_vendas.visualizar_todos', 'Dashboard de Vendas', 'Visualizar indicadores gerais'],
  ['dashboard_vendas.visualizar_receita_global', 'Dashboard de Vendas', 'Visualizar receita global'],
  ['dashboard_vendas.visualizar_ranking_pac', 'Dashboard de Vendas', 'Visualizar ranking por PAC'],
  ['vendas.visualizar_proprias', 'Vendas', 'Visualizar vendas próprias'],
  ['vendas.visualizar_todas', 'Vendas', 'Visualizar todas as vendas'],
  ['vendas.criar_propria', 'Vendas', 'Criar venda própria'],
  ['vendas.criar_para_qualquer_pac', 'Vendas', 'Criar venda para qualquer PAC'],
  ['vendas.editar_propria', 'Vendas', 'Editar venda própria'],
  ['vendas.editar_todas', 'Vendas', 'Editar todas as vendas'],
  ['vendas.excluir_propria', 'Vendas', 'Excluir venda própria'],
  ['vendas.excluir_todas', 'Vendas', 'Excluir qualquer venda'],
  ['faturamento.visualizar', 'Faturamento', 'Visualizar faturamento'],
  ['faturamento.visualizar_resumo', 'Faturamento', 'Visualizar resumo'],
  ['faturamento.lancar_valores', 'Faturamento', 'Lançar valores'],
  ['faturamento.editar_valores', 'Faturamento', 'Editar valores'],
  ['faturamento.excluir_lancamento', 'Faturamento', 'Excluir lançamento'],
  ['concorrencia.visualizar', 'Concorrência', 'Visualizar concorrência'],
  ['concorrencia.criar_concorrente', 'Concorrência', 'Criar concorrente'],
  ['concorrencia.editar_concorrente', 'Concorrência', 'Editar concorrente'],
  ['concorrencia.excluir_concorrente', 'Concorrência', 'Excluir concorrente'],
  ['concorrencia.visualizar_precos_safe', 'Concorrência', 'Visualizar preços SAFE'],
  ['concorrencia.editar_precos_safe', 'Concorrência', 'Editar preços SAFE'],
  ['controle_gastos.visualizar', 'Controle de Gastos', 'Visualizar controle de gastos'],
  ['controle_gastos.editar_gastos', 'Controle de Gastos', 'Editar gastos'],
  ['controle_gastos.editar_receitas', 'Controle de Gastos', 'Editar receitas'],
  ['controle_gastos.editar_horas_voadas', 'Controle de Gastos', 'Editar horas voadas'],
  ['controle_gastos.criar_categoria', 'Controle de Gastos', 'Criar categoria'],
  ['controle_gastos.editar_categoria', 'Controle de Gastos', 'Editar categoria'],
  ['controle_gastos.ativar_inativar_categoria', 'Controle de Gastos', 'Ativar ou inativar categoria'],
  ['fechamento_horas.visualizar', 'Fechamento de Horas', 'Visualizar fechamento'],
  ['fechamento_horas.editar', 'Fechamento de Horas', 'Editar fechamento'],
  ['fechamento_horas.importar_cavok', 'Fechamento de Horas', 'Importar CAVOK'],
  ['fechamento_horas.fechar_mes', 'Fechamento de Horas', 'Fechar mês'],
  ['fechamento_horas.reabrir_mes', 'Fechamento de Horas', 'Reabrir mês'],
  ['fechamento_horas.visualizar_historico', 'Fechamento de Horas', 'Visualizar histórico'],
  ['escala_cco.visualizar_calendario', 'Escala CCO', 'Visualizar calendário'],
  ['escala_cco.editar_escala', 'Escala CCO', 'Editar escala'],
  ['escala_cco.visualizar_financeiro', 'Escala CCO', 'Visualizar financeiro'],
  ['escala_cco.exportar_ifood', 'Escala CCO', 'Exportar iFood'],
  ['escala_cco.editar_valor_turno', 'Escala CCO', 'Editar valor do turno'],
  ['escala_cco.gerenciar_funcionarios', 'Escala CCO', 'Gerenciar funcionários'],
  ['escala_pav.visualizar_calendario', 'Escala PAV', 'Visualizar calendário'],
  ['escala_pav.editar_escala', 'Escala PAV', 'Editar escala'],
  ['escala_pav.visualizar_financeiro', 'Escala PAV', 'Visualizar financeiro'],
  ['escala_pav.exportar_ifood', 'Escala PAV', 'Exportar iFood'],
  ['escala_pav.gerenciar_pavs', 'Escala PAV', 'Gerenciar PAVs'],
  ['escala_pav.inativar_reativar_pav', 'Escala PAV', 'Inativar ou reativar PAV'],
  ['horas_inva.visualizar', 'Horas Voadas INVA', 'Visualizar horas INVA'],
  ['horas_inva.sincronizar_cavok', 'Horas Voadas INVA', 'Sincronizar CAVOK'],
  ['horas_inva.cadastrar_instrutor', 'Horas Voadas INVA', 'Cadastrar instrutor'],
  ['progresso_alunos.visualizar', 'Progresso de Alunos', 'Visualizar progresso'],
  ['progresso_alunos.buscar_aluno', 'Progresso de Alunos', 'Buscar aluno'],
  ['progresso_alunos.visualizar_detalhe', 'Progresso de Alunos', 'Visualizar detalhe'],
  ['cadastro_alunos.visualizar', 'Cadastro de Alunos', 'Visualizar cadastro'],
  ['cadastro_alunos.importar_xls_cavok', 'Cadastro de Alunos', 'Importar XLS CAVOK'],
  ['cadastro_alunos.marcar_s141', 'Cadastro de Alunos', 'Marcar S141'],
  ['cadastro_alunos.sincronizar_trello', 'Cadastro de Alunos', 'Sincronizar Trello'],
  ['cadastro_alunos.inativar', 'Cadastro de Alunos', 'Inativar aluno'],
  ['cadastro_alunos.reativar', 'Cadastro de Alunos', 'Reativar aluno'],
  ['safe_minions.visualizar', 'SAFE MINIONS', 'Visualizar SAFE MINIONS'],
  ['safe_minions.processar_arquivo_local', 'SAFE MINIONS', 'Processar arquivo local'],
  ['bases.visualizar', 'Bases', 'Visualizar bases'],
  ['bases.criar', 'Bases', 'Criar base'],
  ['bases.editar', 'Bases', 'Editar base'],
  ['bases.inativar_reativar', 'Bases', 'Inativar ou reativar base'],
  ['usuarios.visualizar', 'Usuários', 'Visualizar usuários'],
  ['usuarios.criar', 'Usuários', 'Criar usuário'],
  ['usuarios.editar', 'Usuários', 'Editar usuário'],
  ['usuarios.inativar_reativar', 'Usuários', 'Inativar ou reativar usuário'],
  ['usuarios.redefinir_senha', 'Usuários', 'Redefinir senha'],
  ['usuarios.forcar_relogin_global', 'Usuários', 'Forçar relogin global'],
  ['usuarios.gerenciar_grupos', 'Controle de Acesso', 'Gerenciar grupos'],
  ['usuarios.gerenciar_permissoes', 'Controle de Acesso', 'Gerenciar permissões'],
  ['usuarios.alterar_superadmin', 'Controle de Acesso', 'Alterar superadmin'],
  ['planilha_admin.abrir', 'Planilha Administrativa', 'Abrir planilha administrativa'],
  ['auth.alterar_propria_senha', 'Autenticação', 'Alterar própria senha']
];

var ACCESS_DEFAULT_GROUPS = [
  {
    id: 'comercial',
    nome: 'Comercial',
    descricao: 'Rotina comercial com vendas próprias e consulta operacional.',
    legacyPerfis: ['pac'],
    permissoes: [
      'inicio.visualizar',
      'dashboard_vendas.visualizar_proprio',
      'vendas.visualizar_proprias',
      'vendas.criar_propria',
      'vendas.editar_propria',
      'vendas.excluir_propria',
      'concorrencia.visualizar',
      'concorrencia.criar_concorrente',
      'concorrencia.editar_concorrente',
      'bases.visualizar',
      'auth.alterar_propria_senha'
    ]
  },
  {
    id: 'comercial_gerencia',
    nome: 'Comercial Gerência',
    descricao: 'Gestão comercial, dashboard geral e manutenção de concorrência.',
    legacyPerfis: ['admin'],
    permissoes: [
      'inicio.visualizar',
      'dashboard_vendas.visualizar_proprio',
      'dashboard_vendas.visualizar_todos',
      'dashboard_vendas.visualizar_receita_global',
      'dashboard_vendas.visualizar_ranking_pac',
      'vendas.visualizar_proprias',
      'vendas.visualizar_todas',
      'vendas.criar_propria',
      'vendas.criar_para_qualquer_pac',
      'vendas.editar_propria',
      'vendas.editar_todas',
      'vendas.excluir_propria',
      'vendas.excluir_todas',
      'faturamento.visualizar',
      'faturamento.visualizar_resumo',
      'concorrencia.visualizar',
      'concorrencia.criar_concorrente',
      'concorrencia.editar_concorrente',
      'concorrencia.excluir_concorrente',
      'concorrencia.visualizar_precos_safe',
      'concorrencia.editar_precos_safe',
      'escala_cco.visualizar_calendario',
      'fechamento_horas.visualizar',
      'fechamento_horas.editar',
      'fechamento_horas.importar_cavok',
      'fechamento_horas.fechar_mes',
      'fechamento_horas.reabrir_mes',
      'bases.visualizar',
      'auth.alterar_propria_senha'
    ]
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Controle financeiro, fechamento e exportações.',
    legacyPerfis: ['financeiro'],
    permissoes: [
      'inicio.visualizar',
      'faturamento.visualizar',
      'faturamento.visualizar_resumo',
      'faturamento.lancar_valores',
      'faturamento.editar_valores',
      'faturamento.excluir_lancamento',
      'controle_gastos.visualizar',
      'controle_gastos.editar_gastos',
      'controle_gastos.editar_receitas',
      'controle_gastos.editar_horas_voadas',
      'controle_gastos.criar_categoria',
      'controle_gastos.editar_categoria',
      'controle_gastos.ativar_inativar_categoria',
      'fechamento_horas.visualizar',
      'fechamento_horas.editar',
      'fechamento_horas.importar_cavok',
      'fechamento_horas.fechar_mes',
      'fechamento_horas.reabrir_mes',
      'escala_pav.visualizar_financeiro',
      'escala_pav.exportar_ifood',
      'auth.alterar_propria_senha'
    ]
  },
  {
    id: 'controle_gastos_leitura',
    nome: 'Controle de Gastos - Leitura',
    descricao: 'Acesso exclusivo e somente leitura ao Controle de Gastos.',
    legacyPerfis: ['controle_gastos_visualizacao'],
    permissoes: ['inicio.visualizar', 'controle_gastos.visualizar', 'auth.alterar_propria_senha']
  },
  {
    id: 'operacoes_escala',
    nome: 'Operações / Escala',
    descricao: 'Escalas, horas INVA e SAFE MINIONS.',
    legacyPerfis: ['escala_minions'],
    permissoes: [
      'inicio.visualizar',
      'escala_cco.visualizar_calendario',
      'horas_inva.visualizar',
      'horas_inva.sincronizar_cavok',
      'horas_inva.cadastrar_instrutor',
      'safe_minions.visualizar',
      'safe_minions.processar_arquivo_local',
      'auth.alterar_propria_senha'
    ]
  },
  {
    id: 'somente_leitura',
    nome: 'Somente Leitura',
    descricao: 'Consulta administrativa sem ações de escrita.',
    legacyPerfis: ['admin_readonly', 'admin_visualizacao'],
    permissoes: [
      'inicio.visualizar',
      'dashboard_vendas.visualizar_todos',
      'vendas.visualizar_todas',
      'faturamento.visualizar',
      'faturamento.visualizar_resumo',
      'concorrencia.visualizar',
      'controle_gastos.visualizar',
      'fechamento_horas.visualizar',
      'bases.visualizar',
      'auth.alterar_propria_senha'
    ]
  }
];

function garantirEstruturaControleAcesso_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    garantirEstruturaControleAcessoSemLock_();
  } finally {
    lock.releaseLock();
  }
}

function garantirEstruturaControleAcessoSemLock_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  garantirColunaUsuariosSuperadmin_();
  garantirSheetComCabecalho_(ss, SHEETS.PERMISSIONS_CATALOG, [
    'ID', 'MODULO', 'NOME', 'ATIVO', 'CRIADO_EM'
  ]);
  garantirSheetComCabecalho_(ss, SHEETS.ACCESS_GROUPS, [
    'ID', 'NOME', 'DESCRICAO', 'ATIVO', 'SISTEMA', 'CRIADO_EM', 'ATUALIZADO_EM'
  ]);
  garantirSheetComCabecalho_(ss, SHEETS.ACCESS_GROUP_PERMISSIONS, [
    'GROUP_ID', 'PERMISSION_ID', 'CRIADO_EM'
  ]);
  garantirSheetComCabecalho_(ss, SHEETS.USER_GROUPS, [
    'USER_ID', 'GROUP_ID', 'CRIADO_EM', 'ATUALIZADO_EM'
  ]);
  garantirSheetComCabecalho_(ss, SHEETS.USER_PERMISSIONS, [
    'USER_ID', 'PERMISSION_ID', 'TIPO', 'CRIADO_EM'
  ]);
  garantirSheetComCabecalho_(ss, SHEETS.ACCESS_AUDIT, [
    'ID', 'USUARIO_ALVO', 'ACAO', 'DETALHE', 'EXECUTADO_POR', 'CRIADO_EM'
  ]);

  removerDuplicidadesControleAcesso_();
  sincronizarCatalogoPermissoes_();
  sincronizarGruposPadrao_();
  migrarAcessosLegados_();
  removerDuplicidadesControleAcesso_();
}

function garantirSheetComCabecalho_(ss, nome, cabecalho) {
  var sheet = ss.getSheetByName(nome);
  if (!sheet) sheet = ss.insertSheet(nome);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(cabecalho);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function indiceCabecalho_(sheet) {
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var mapa = {};
  headers.forEach(function(header, index) {
    mapa[String(header || '').trim().toUpperCase()] = index + 1;
  });
  return mapa;
}

function garantirColunaUsuariosSuperadmin_() {
  var sheet = getSheet(SHEETS.USUARIOS);
  var idx = indiceCabecalho_(sheet);
  ['SUPERADMIN', 'CPF', 'ATUALIZADO_EM', 'ATUALIZADO_POR'].forEach(function(nome) {
    if (idx[nome]) return;
    var col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(nome);
    idx[nome] = col;
  });
}

function sincronizarCatalogoPermissoes_() {
  var sheet = getSheet(SHEETS.PERMISSIONS_CATALOG);
  var data = sheet.getDataRange().getValues();
  var existentes = {};
  var novasLinhas = [];
  for (var i = 1; i < data.length; i++) {
    existentes[String(data[i][0])] = true;
  }
  ACCESS_PERMISSIONS.forEach(function(item) {
    if (existentes[item[0]]) return;
    existentes[item[0]] = true;
    novasLinhas.push([item[0], item[1], item[2], true, new Date()]);
  });
  if (novasLinhas.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, novasLinhas.length, novasLinhas[0].length).setValues(novasLinhas);
  }
}

function sincronizarGruposPadrao_() {
  var groupsSheet = getSheet(SHEETS.ACCESS_GROUPS);
  var groupPermsSheet = getSheet(SHEETS.ACCESS_GROUP_PERMISSIONS);
  var gruposData = groupsSheet.getDataRange().getValues();
  var relacoesData = groupPermsSheet.getDataRange().getValues();
  var grupos = {};
  var relacoes = {};
  var novosGrupos = [];
  var novasRelacoes = [];
  for (var i = 1; i < gruposData.length; i++) {
    grupos[String(gruposData[i][0])] = i + 1;
  }
  for (var r = 1; r < relacoesData.length; r++) {
    relacoes[String(relacoesData[r][0]) + '|' + String(relacoesData[r][1])] = true;
  }
  ACCESS_DEFAULT_GROUPS.forEach(function(grupo) {
    if (!grupos[grupo.id]) {
      grupos[grupo.id] = true;
      novosGrupos.push([grupo.id, grupo.nome, grupo.descricao, true, true, new Date(), new Date()]);
    }
    grupo.permissoes.forEach(function(permissao) {
      var chave = grupo.id + '|' + permissao;
      if (relacoes[chave]) return;
      relacoes[chave] = true;
      novasRelacoes.push([grupo.id, permissao, new Date()]);
    });
  });
  if (novosGrupos.length) {
    groupsSheet.getRange(groupsSheet.getLastRow() + 1, 1, novosGrupos.length, novosGrupos[0].length).setValues(novosGrupos);
  }
  if (novasRelacoes.length) {
    groupPermsSheet.getRange(groupPermsSheet.getLastRow() + 1, 1, novasRelacoes.length, novasRelacoes[0].length).setValues(novasRelacoes);
  }
}

function migrarAcessosLegados_() {
  var usuariosSheet = getSheet(SHEETS.USUARIOS);
  var idx = indiceCabecalho_(usuariosSheet);
  var userGroupsSheet = getSheet(SHEETS.USER_GROUPS);
  var usuarios = usuariosSheet.getDataRange().getValues();
  var vinculosData = userGroupsSheet.getDataRange().getValues();
  var mapaGrupoPorPerfil = {};
  var vinculos = {};
  var novosVinculos = [];
  ACCESS_DEFAULT_GROUPS.forEach(function(grupo) {
    grupo.legacyPerfis.forEach(function(perfil) {
      mapaGrupoPorPerfil[normalizarPerfil(perfil)] = grupo.id;
    });
  });
  for (var v = 1; v < vinculosData.length; v++) {
    vinculos[String(vinculosData[v][0]) + '|' + String(vinculosData[v][1])] = true;
  }

  for (var i = 1; i < usuarios.length; i++) {
    var row = usuarios[i];
    var userId = row[0];
    if (!userId) continue;
    var perfil = normalizarPerfil(row[5]);
    if (perfil === 'master' && idx.SUPERADMIN && !valorBooleano(row[idx.SUPERADMIN - 1])) {
      usuariosSheet.getRange(i + 1, idx.SUPERADMIN).setValue(true);
    }
    var groupId = mapaGrupoPorPerfil[perfil];
    var chave = String(userId) + '|' + String(groupId || '');
    if (groupId && !vinculos[chave]) {
      vinculos[chave] = true;
      novosVinculos.push([userId, groupId, new Date(), new Date()]);
    }
  }
  if (novosVinculos.length) {
    userGroupsSheet.getRange(userGroupsSheet.getLastRow() + 1, 1, novosVinculos.length, novosVinculos[0].length).setValues(novosVinculos);
  }
}

function removerDuplicidadesControleAcesso_() {
  deduplicarSheetControleAcesso_(getSheet(SHEETS.PERMISSIONS_CATALOG), function(row) {
    return String(row[0] || '').trim();
  });
  deduplicarSheetControleAcesso_(getSheet(SHEETS.ACCESS_GROUPS), function(row) {
    return String(row[0] || '').trim();
  });
  deduplicarSheetControleAcesso_(getSheet(SHEETS.ACCESS_GROUP_PERMISSIONS), function(row) {
    return String(row[0] || '').trim() + '|' + String(row[1] || '').trim();
  });
  deduplicarSheetControleAcesso_(getSheet(SHEETS.USER_GROUPS), function(row) {
    return String(row[0] || '').trim() + '|' + String(row[1] || '').trim();
  });
  deduplicarSheetControleAcesso_(getSheet(SHEETS.USER_PERMISSIONS), function(row) {
    return String(row[0] || '').trim() + '|' + String(row[1] || '').trim() + '|' + String(row[2] || '').trim();
  });
}

function deduplicarSheetControleAcesso_(sheet, chaveFn) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 2) return;
  var vistos = {};
  var linhasParaExcluir = [];
  for (var i = 1; i < data.length; i++) {
    var chave = chaveFn(data[i]);
    if (!chave || chave === '|') continue;
    if (vistos[chave]) {
      linhasParaExcluir.push(i + 1);
    } else {
      vistos[chave] = true;
    }
  }
  for (var j = linhasParaExcluir.length - 1; j >= 0; j--) {
    sheet.deleteRow(linhasParaExcluir[j]);
  }
}

function usuarioSuperadminPorId_(userId) {
  garantirColunaUsuariosSuperadmin_();
  var sheet = getSheet(SHEETS.USUARIOS);
  var idx = indiceCabecalho_(sheet);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      return valorBooleano(data[i][idx.SUPERADMIN - 1]);
    }
  }
  return false;
}

function usuarioEhSuperadmin(usuario) {
  if (!usuario) return false;
  if (valorBooleano(usuario.superadmin)) return true;
  return normalizarPerfil(usuario.perfil) === 'master';
}

function listarControleAcesso() {
  garantirEstruturaControleAcesso_();
  var catalogo = listarCatalogoPermissoes_();
  var grupos = listarGruposAcesso_();
  return { permissoes: catalogo, grupos: grupos };
}

function listarCatalogoPermissoes_() {
  var sheet = getSheet(SHEETS.PERMISSIONS_CATALOG);
  var data = sheet.getDataRange().getValues();
  var lista = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0] || !valorBooleano(data[i][3])) continue;
    lista.push({
      id: data[i][0],
      modulo: data[i][1],
      nome: data[i][2]
    });
  }
  return lista;
}

function listarGruposAcesso_() {
  var groupsSheet = getSheet(SHEETS.ACCESS_GROUPS);
  var groupPermsSheet = getSheet(SHEETS.ACCESS_GROUP_PERMISSIONS);
  var userGroupsSheet = getSheet(SHEETS.USER_GROUPS);
  var groupsData = groupsSheet.getDataRange().getValues();
  var permsData = groupPermsSheet.getDataRange().getValues();
  var usersData = userGroupsSheet.getDataRange().getValues();
  var permsPorGrupo = {};
  var usuariosPorGrupo = {};

  for (var p = 1; p < permsData.length; p++) {
    var gid = String(permsData[p][0] || '');
    if (!gid) continue;
    if (!permsPorGrupo[gid]) permsPorGrupo[gid] = [];
    permsPorGrupo[gid].push(String(permsData[p][1] || ''));
  }

  for (var u = 1; u < usersData.length; u++) {
    var groupId = String(usersData[u][1] || '');
    if (!groupId) continue;
    usuariosPorGrupo[groupId] = (usuariosPorGrupo[groupId] || 0) + 1;
  }

  var grupos = [];
  for (var i = 1; i < groupsData.length; i++) {
    if (!groupsData[i][0]) continue;
    var id = String(groupsData[i][0]);
    grupos.push({
      id: id,
      nome: groupsData[i][1],
      descricao: groupsData[i][2],
      ativo: valorBooleano(groupsData[i][3]),
      sistema: valorBooleano(groupsData[i][4]),
      quantidadePermissoes: (permsPorGrupo[id] || []).length,
      quantidadeUsuarios: usuariosPorGrupo[id] || 0,
      permissoes: permsPorGrupo[id] || []
    });
  }
  grupos.sort(function(a, b) {
    return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
  return grupos;
}

function carregarAcessosUsuarios_() {
  var gruposSheet = getSheet(SHEETS.USER_GROUPS);
  var permissoesSheet = getSheet(SHEETS.USER_PERMISSIONS);
  var gruposData = gruposSheet.getDataRange().getValues();
  var permissoesData = permissoesSheet.getDataRange().getValues();
  var gruposPorUsuario = {};
  var permissoesPorUsuario = {};

  for (var i = 1; i < gruposData.length; i++) {
    var userId = String(gruposData[i][0] || '').trim();
    var groupId = String(gruposData[i][1] || '').trim();
    if (!userId || !groupId) continue;
    if (!gruposPorUsuario[userId]) gruposPorUsuario[userId] = [];
    if (gruposPorUsuario[userId].indexOf(groupId) === -1) gruposPorUsuario[userId].push(groupId);
  }

  for (var p = 1; p < permissoesData.length; p++) {
    var usuarioId = String(permissoesData[p][0] || '').trim();
    var permissaoId = String(permissoesData[p][1] || '').trim();
    var tipo = String(permissoesData[p][2] || 'GRANT').trim().toUpperCase();
    if (!usuarioId || !permissaoId || tipo === 'DENY') continue;
    if (!permissoesPorUsuario[usuarioId]) permissoesPorUsuario[usuarioId] = [];
    if (permissoesPorUsuario[usuarioId].indexOf(permissaoId) === -1) {
      permissoesPorUsuario[usuarioId].push(permissaoId);
    }
  }

  return {
    gruposPorUsuario: gruposPorUsuario,
    permissoesPorUsuario: permissoesPorUsuario
  };
}

function carregarPermissoesPorGrupo_() {
  var sheet = getSheet(SHEETS.ACCESS_GROUP_PERMISSIONS);
  var data = sheet.getDataRange().getValues();
  var permissoesPorGrupo = {};

  for (var i = 1; i < data.length; i++) {
    var groupId = String(data[i][0] || '').trim();
    var permissaoId = String(data[i][1] || '').trim();
    if (!groupId || !permissaoId) continue;
    if (!permissoesPorGrupo[groupId]) permissoesPorGrupo[groupId] = [];
    if (permissoesPorGrupo[groupId].indexOf(permissaoId) === -1) {
      permissoesPorGrupo[groupId].push(permissaoId);
    }
  }

  return permissoesPorGrupo;
}

function calcularPermissoesEfetivasUsuario_(userId, superadmin) {
  if (valorBooleano(superadmin)) {
    return ACCESS_PERMISSIONS.map(function(item) {
      return item[0];
    });
  }

  var usuarioId = String(userId || '').trim();
  if (!usuarioId) return [];

  var acessos = carregarAcessosUsuarios_();
  var permissoesPorGrupo = carregarPermissoesPorGrupo_();
  var efetivas = {};

  (acessos.gruposPorUsuario[usuarioId] || []).forEach(function(groupId) {
    (permissoesPorGrupo[groupId] || []).forEach(function(permissaoId) {
      efetivas[permissaoId] = true;
    });
  });

  (acessos.permissoesPorUsuario[usuarioId] || []).forEach(function(permissaoId) {
    efetivas[permissaoId] = true;
  });

  return Object.keys(efetivas);
}

function salvarAcessosUsuario_(userId, grupos, permissoesAvulsas, usuarioExecutor) {
  garantirEstruturaControleAcesso_();
  if (!userId) throw new Error('Usuário obrigatório para salvar acessos.');
  var gruposNormalizados = normalizarListaIdsAcesso_(grupos);
  var permissoesNormalizadas = normalizarListaIdsAcesso_(permissoesAvulsas);
  validarIdsAcesso_(SHEETS.ACCESS_GROUPS, gruposNormalizados, 'grupo de acesso');
  validarIdsAcesso_(SHEETS.PERMISSIONS_CATALOG, permissoesNormalizadas, 'permissão');

  substituirVinculosUsuario_(getSheet(SHEETS.USER_GROUPS), userId, gruposNormalizados, function(id) {
    return [userId, id, new Date(), new Date()];
  });
  substituirVinculosUsuario_(getSheet(SHEETS.USER_PERMISSIONS), userId, permissoesNormalizadas, function(id) {
    return [userId, id, 'GRANT', new Date()];
  });
  registrarAuditoriaAcesso_(userId, 'USUARIO_ACESSOS_ATUALIZADOS', JSON.stringify({
    grupos: gruposNormalizados.length,
    permissoesAvulsas: permissoesNormalizadas.length
  }), usuarioExecutor);
}

function normalizarListaIdsAcesso_(lista) {
  if (!Array.isArray(lista)) return [];
  var vistos = {};
  var resultado = [];
  lista.forEach(function(item) {
    var id = String(item || '').trim();
    if (!id || vistos[id]) return;
    vistos[id] = true;
    resultado.push(id);
  });
  return resultado;
}

function validarIdsAcesso_(sheetName, ids, tipo) {
  if (!ids.length) return;
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var existentes = {};
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var ativo = data[i].length < 4 || valorBooleano(data[i][3]);
    if (ativo) existentes[String(data[i][0])] = true;
  }
  ids.forEach(function(id) {
    if (!existentes[id]) throw new Error('O ' + tipo + ' "' + id + '" não existe ou está inativo.');
  });
}

function substituirVinculosUsuario_(sheet, userId, ids, linhaFn) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(userId)) sheet.deleteRow(i + 1);
  }
  if (!ids.length) return;
  var linhas = ids.map(linhaFn);
  sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
}

function salvarGrupoAcesso(dados, usuarioExecutor) {
  garantirEstruturaControleAcesso_();
  var id = String(dados.id || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  var nome = String(dados.nome || '').trim();
  var descricao = String(dados.descricao || '').trim();
  var ativo = dados.hasOwnProperty('ativo') ? valorBooleano(dados.ativo) : true;
  var permissoes = Array.isArray(dados.permissoes) ? dados.permissoes : [];
  if (!nome) throw new Error('Informe o nome do grupo.');
  if (!id) id = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('Informe um identificador válido para o grupo.');

  var groupsSheet = getSheet(SHEETS.ACCESS_GROUPS);
  var groupsData = groupsSheet.getDataRange().getValues();
  var row = 0;
  var sistema = false;
  for (var i = 1; i < groupsData.length; i++) {
    if (String(groupsData[i][0]) === id) {
      row = i + 1;
      sistema = valorBooleano(groupsData[i][4]);
      break;
    }
  }

  if (row) {
    groupsSheet.getRange(row, 2, 1, 4).setValues([[nome, descricao, ativo, sistema]]);
    groupsSheet.getRange(row, 7).setValue(new Date());
  } else {
    groupsSheet.appendRow([id, nome, descricao, ativo, false, new Date(), new Date()]);
  }

  substituirPermissoesGrupo_(id, permissoes);
  registrarAuditoriaAcesso_(id, row ? 'GRUPO_ATUALIZADO' : 'GRUPO_CRIADO', JSON.stringify({
    nome: nome,
    permissoes: permissoes.length
  }), usuarioExecutor);
  return listarControleAcesso();
}

function substituirPermissoesGrupo_(groupId, permissoes) {
  var sheet = getSheet(SHEETS.ACCESS_GROUP_PERMISSIONS);
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(groupId)) sheet.deleteRow(i + 1);
  }
  var vistas = {};
  permissoes.forEach(function(permissao) {
    var id = String(permissao || '').trim();
    if (!id || vistas[id]) return;
    vistas[id] = true;
    sheet.appendRow([groupId, id, new Date()]);
  });
}

function registrarAuditoriaAcesso_(usuarioAlvo, acao, detalhe, usuarioExecutor) {
  try {
    getSheet(SHEETS.ACCESS_AUDIT).appendRow([
      gerarId(),
      usuarioAlvo,
      acao,
      detalhe || '',
      usuarioExecutor ? String(usuarioExecutor.email || usuarioExecutor.pac || '') : '',
      new Date()
    ]);
  } catch (e) {}
}
