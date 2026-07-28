// ============================================================
// AccessControl.gs - Grupos, permissoes avulsas e superadmin
// SAFE Hub
// ============================================================

var ACCESS_PERMISSIONS = [
  ['inicio.visualizar', 'Início', 'Visualizar Início'],
  // NOTAMs nasce em TODOS os cargos padrão: na prática é global, como era
  // quando a página estava marcada `publica`. A diferença é que agora existe
  // no catálogo, então aparece no Controle de Acesso e dá para NEGAR a alguém.
  ['notams.visualizar', 'NOTAMs', 'Visualizar NOTAMs das bases'],
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
  ['escala_cco.editar_propria_escala', 'Escala CCO', 'Editar a própria escala/disponibilidade'],
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
  // Aniversários: de propósito FORA de todos os cargos padrão. Sem grupo, só
  // superadmin/master enxerga (bypass em usuarioEhSuperadmin/temPermissao).
  // Para liberar a alguém, conceder no Controle de Acesso — o guarda do
  // backend (exigirAniversarios) já honra a permissão de forma aditiva.
  ['aniversarios.visualizar', 'Aniversários', 'Visualizar aniversários'],
  ['aniversarios.reenviar', 'Aniversários', 'Reenviar e-mail de aniversário'],
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

// ── Cargos oficiais (matriz definida pela SAFE em 2026-07) ──
// Estes grupos são a fonte de verdade: sincronizarGruposPadrao_ reconcilia
// nome/descrição e o conjunto EXATO de permissões de cada um no banco.
var ACCESS_DEFAULT_GROUPS = [
  {
    id: 'comercial',
    nome: 'Consultor Comercial',
    descricao: 'Vendas próprias, dashboard próprio e concorrência.',
    legacyPerfis: ['pac'],
    permissoes: [
      'inicio.visualizar',
      'notams.visualizar',
      'auth.alterar_propria_senha',
      'dashboard_vendas.visualizar_proprio',
      'vendas.visualizar_proprias',
      'vendas.criar_propria',
      'vendas.editar_propria',
      'vendas.excluir_propria',
      'concorrencia.visualizar',
      'concorrencia.visualizar_precos_safe',
      'concorrencia.criar_concorrente',
      'concorrencia.editar_concorrente',
      'concorrencia.excluir_concorrente',
      'concorrencia.editar_precos_safe',
      'bases.visualizar'
    ]
  },
  {
    id: 'comercial_gerencia',
    nome: 'Gerente Comercial',
    descricao: 'Gestão comercial completa: vendas de todos, faturamento, concorrência e fechamento.',
    legacyPerfis: ['admin'],
    permissoes: [
      'inicio.visualizar',
      'notams.visualizar',
      'auth.alterar_propria_senha',
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
      'concorrencia.visualizar_precos_safe',
      'concorrencia.criar_concorrente',
      'concorrencia.editar_concorrente',
      'concorrencia.excluir_concorrente',
      'concorrencia.editar_precos_safe',
      'fechamento_horas.visualizar',
      'fechamento_horas.visualizar_historico',
      'fechamento_horas.editar',
      'fechamento_horas.importar_cavok',
      'fechamento_horas.fechar_mes',
      'fechamento_horas.reabrir_mes',
      'bases.visualizar'
    ]
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Faturamento, controle de gastos, fechamento e financeiro da Escala PAV.',
    legacyPerfis: ['financeiro'],
    permissoes: [
      'inicio.visualizar',
      'notams.visualizar',
      'auth.alterar_propria_senha',
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
      'fechamento_horas.visualizar_historico',
      'fechamento_horas.editar',
      'fechamento_horas.importar_cavok',
      'fechamento_horas.fechar_mes',
      'fechamento_horas.reabrir_mes',
      'escala_pav.visualizar_calendario',
      'escala_pav.visualizar_financeiro',
      'bases.visualizar'
    ]
  },
  {
    id: 'consultor_cco',
    nome: 'Consultor CCO',
    descricao: 'Vê a Escala CCO e edita a própria escala/disponibilidade; Horas INVA e SAFE MINIONS em leitura.',
    legacyPerfis: [],
    permissoes: [
      'inicio.visualizar',
      'notams.visualizar',
      'auth.alterar_propria_senha',
      'escala_cco.visualizar_calendario',
      'escala_cco.editar_propria_escala',
      'horas_inva.visualizar',
      'safe_minions.visualizar',
      'bases.visualizar'
    ]
  },
  {
    id: 'gerente_cco',
    nome: 'Gerente CCO',
    descricao: 'Gestão completa da Escala CCO, Horas INVA e SAFE MINIONS.',
    legacyPerfis: [],
    permissoes: [
      'inicio.visualizar',
      'notams.visualizar',
      'auth.alterar_propria_senha',
      'escala_cco.visualizar_calendario',
      'escala_cco.editar_propria_escala',
      'escala_cco.editar_escala',
      'escala_cco.visualizar_financeiro',
      'escala_cco.exportar_ifood',
      'escala_cco.editar_valor_turno',
      'escala_cco.gerenciar_funcionarios',
      'horas_inva.visualizar',
      'horas_inva.sincronizar_cavok',
      'horas_inva.cadastrar_instrutor',
      'safe_minions.visualizar',
      'safe_minions.processar_arquivo_local',
      'bases.visualizar'
    ]
  },
  {
    id: 'operacoes_escala',
    nome: 'Operações',
    descricao: 'Escala CCO e PAV, Horas INVA, SAFE MINIONS, cadastro e progresso de alunos.',
    legacyPerfis: ['escala_minions'],
    permissoes: [
      'inicio.visualizar',
      'notams.visualizar',
      'auth.alterar_propria_senha',
      'escala_cco.visualizar_calendario',
      'escala_cco.editar_propria_escala',
      'escala_cco.editar_escala',
      'escala_cco.visualizar_financeiro',
      'escala_cco.exportar_ifood',
      'escala_cco.editar_valor_turno',
      'escala_cco.gerenciar_funcionarios',
      'escala_pav.visualizar_calendario',
      'escala_pav.visualizar_financeiro',
      'escala_pav.editar_escala',
      'escala_pav.exportar_ifood',
      'escala_pav.gerenciar_pavs',
      'escala_pav.inativar_reativar_pav',
      'horas_inva.visualizar',
      'horas_inva.sincronizar_cavok',
      'horas_inva.cadastrar_instrutor',
      'progresso_alunos.visualizar',
      'progresso_alunos.buscar_aluno',
      'progresso_alunos.visualizar_detalhe',
      'cadastro_alunos.visualizar',
      'safe_minions.visualizar',
      'safe_minions.processar_arquivo_local',
      'bases.visualizar'
    ]
  },
  {
    id: 'somente_leitura',
    nome: 'DIRETORIA',
    descricao: 'Visão geral em leitura de todos os módulos operacionais e comerciais.',
    legacyPerfis: ['admin_readonly', 'admin_visualizacao'],
    permissoes: [
      'inicio.visualizar',
      'notams.visualizar',
      'auth.alterar_propria_senha',
      'dashboard_vendas.visualizar_proprio',
      'dashboard_vendas.visualizar_todos',
      'dashboard_vendas.visualizar_receita_global',
      'dashboard_vendas.visualizar_ranking_pac',
      'vendas.visualizar_proprias',
      'vendas.visualizar_todas',
      'faturamento.visualizar',
      'faturamento.visualizar_resumo',
      'concorrencia.visualizar',
      'concorrencia.visualizar_precos_safe',
      'controle_gastos.visualizar',
      'fechamento_horas.visualizar',
      'fechamento_horas.visualizar_historico',
      'escala_cco.visualizar_calendario',
      'escala_pav.visualizar_calendario',
      'escala_pav.visualizar_financeiro',
      'horas_inva.visualizar',
      'progresso_alunos.visualizar',
      'progresso_alunos.buscar_aluno',
      'progresso_alunos.visualizar_detalhe',
      'safe_minions.visualizar',
      'bases.visualizar'
    ]
  },
  {
    // Legado — mantido para não quebrar usuários antigos; não é um cargo oferecido.
    id: 'controle_gastos_leitura',
    nome: 'Controle de Gastos - Leitura (legado)',
    descricao: 'Acesso exclusivo e somente leitura ao Controle de Gastos.',
    legacyPerfis: ['controle_gastos_visualizacao'],
    permissoes: ['inicio.visualizar', 'notams.visualizar', 'controle_gastos.visualizar', 'auth.alterar_propria_senha']
  }
];

// Cargos oferecidos na tela de criação (na ordem). O legado fica de fora.
var ACCESS_CARGOS_OFERECIDOS = [
  'comercial', 'comercial_gerencia', 'financeiro',
  'consultor_cco', 'gerente_cco', 'operacoes_escala', 'somente_leitura'
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

function garantirEstruturaControleAcessoLeitura_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  garantirColunaUsuariosSuperadmin_();
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
  // AVATAR guarda a foto como data URI (JPEG base64), não um link.
  // A célula do Sheets aceita 50.000 caracteres e o frontend reduz para
  // 128x128 antes de enviar, o que dá ~8 KB em base64: sobra folga de 6x.
  // Link do Drive foi descartado de propósito: exigiria a foto de cada
  // funcionário pública por URL, e o `drive.google.com/uc?id=` quebra em
  // hotlink. Ver `salvarMeuAvatar`.
  ['SUPERADMIN', 'CPF', 'ATUALIZADO_EM', 'ATUALIZADO_POR', 'AVATAR'].forEach(function(nome) {
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

  // 1) Upsert dos grupos padrão (nome/descrição são reconciliados com o código).
  var gruposData = groupsSheet.getDataRange().getValues();
  var linhaPorGrupo = {};
  for (var i = 1; i < gruposData.length; i++) {
    linhaPorGrupo[String(gruposData[i][0])] = i + 1; // linha 1-based
  }
  ACCESS_DEFAULT_GROUPS.forEach(function(grupo) {
    var linha = linhaPorGrupo[grupo.id];
    if (linha) {
      groupsSheet.getRange(linha, 2).setValue(grupo.nome);
      groupsSheet.getRange(linha, 3).setValue(grupo.descricao);
    } else {
      groupsSheet.appendRow([grupo.id, grupo.nome, grupo.descricao, true, true, new Date(), new Date()]);
    }
  });

  // 2) Reconciliar as permissões de cada grupo PADRÃO para o conjunto EXATO
  //    definido no código (adiciona faltantes, remove sobras). Grupos criados
  //    pelo usuário não são tocados.
  var relacoesData = groupPermsSheet.getDataRange().getValues();
  var linhaPorRelacao = {}; // "gid|pid" -> linha 1-based
  var existentesPorGrupo = {}; // gid -> { pid: true }
  for (var r = 1; r < relacoesData.length; r++) {
    var gid = String(relacoesData[r][0] || '').trim();
    var pid = String(relacoesData[r][1] || '').trim();
    if (!gid || !pid) continue;
    linhaPorRelacao[gid + '|' + pid] = r + 1;
    if (!existentesPorGrupo[gid]) existentesPorGrupo[gid] = {};
    existentesPorGrupo[gid][pid] = true;
  }

  var linhasParaRemover = [];
  var novasRelacoes = [];
  ACCESS_DEFAULT_GROUPS.forEach(function(grupo) {
    var desejado = {};
    grupo.permissoes.forEach(function(p) { desejado[p] = true; });
    var existentes = existentesPorGrupo[grupo.id] || {};
    // sobras: existe no banco mas não no código
    Object.keys(existentes).forEach(function(pid) {
      if (!desejado[pid]) linhasParaRemover.push(linhaPorRelacao[grupo.id + '|' + pid]);
    });
    // faltantes: está no código mas não no banco
    grupo.permissoes.forEach(function(pid) {
      if (!existentes[pid]) novasRelacoes.push([grupo.id, pid, new Date()]);
    });
  });

  // Remove de baixo para cima para não invalidar os índices.
  linhasParaRemover.sort(function(a, b) { return b - a; }).forEach(function(rowIdx) {
    if (rowIdx) groupPermsSheet.deleteRow(rowIdx);
  });
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

/**
 * Verifica uma permissão efetiva do usuário da sessão. Superadmin sempre passa.
 * A sessão já carrega `permissoesEfetivas` (validarTokenSessao/anexar...).
 */
function usuarioTemPermissao(usuario, permissaoId) {
  if (!usuario) return false;
  if (usuarioEhSuperadmin(usuario)) return true;
  var id = String(permissaoId || '').trim();
  if (!id) return false;
  var lista = Array.isArray(usuario.permissoesEfetivas) ? usuario.permissoesEfetivas : [];
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i]).trim() === id) return true;
  }
  return false;
}

function usuarioTemAlgumaPermissao(usuario, permissoes) {
  if (!Array.isArray(permissoes)) return false;
  for (var i = 0; i < permissoes.length; i++) {
    if (usuarioTemPermissao(usuario, permissoes[i])) return true;
  }
  return false;
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
  var permissoesPorUsuario = {};   // exceções concedidas (GRANT)
  var negadasPorUsuario = {};      // exceções negadas (DENY)

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
    if (!usuarioId || !permissaoId) continue;
    var alvo = tipo === 'DENY' ? negadasPorUsuario : permissoesPorUsuario;
    if (!alvo[usuarioId]) alvo[usuarioId] = [];
    if (alvo[usuarioId].indexOf(permissaoId) === -1) alvo[usuarioId].push(permissaoId);
  }

  return {
    gruposPorUsuario: gruposPorUsuario,
    permissoesPorUsuario: permissoesPorUsuario,
    negadasPorUsuario: negadasPorUsuario
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

  // Base: permissões vindas dos grupos (cargos) do usuário.
  (acessos.gruposPorUsuario[usuarioId] || []).forEach(function(groupId) {
    (permissoesPorGrupo[groupId] || []).forEach(function(permissaoId) {
      efetivas[permissaoId] = true;
    });
  });

  // Exceções concedidas (GRANT): adicionam permissões por cima do cargo.
  (acessos.permissoesPorUsuario[usuarioId] || []).forEach(function(permissaoId) {
    efetivas[permissaoId] = true;
  });

  // Exceções negadas (DENY): removem permissões que o cargo concederia.
  (acessos.negadasPorUsuario[usuarioId] || []).forEach(function(permissaoId) {
    delete efetivas[permissaoId];
  });

  return Object.keys(efetivas);
}

function salvarAcessosUsuario_(userId, grupos, permissoesAvulsas, usuarioExecutor, permissoesNegadas) {
  garantirEstruturaControleAcesso_();
  if (!userId) throw new Error('Usuário obrigatório para salvar acessos.');
  var gruposNormalizados = normalizarListaIdsAcesso_(grupos);
  var concedidas = normalizarListaIdsAcesso_(permissoesAvulsas);
  var negadas = normalizarListaIdsAcesso_(permissoesNegadas);
  // Uma permissão não pode ser concedida e negada ao mesmo tempo: negar vence.
  negadas.forEach(function(id) {
    var pos = concedidas.indexOf(id);
    if (pos !== -1) concedidas.splice(pos, 1);
  });
  validarIdsAcesso_(SHEETS.ACCESS_GROUPS, gruposNormalizados, 'grupo de acesso');
  validarIdsAcesso_(SHEETS.PERMISSIONS_CATALOG, concedidas, 'permissão');
  validarIdsAcesso_(SHEETS.PERMISSIONS_CATALOG, negadas, 'permissão');

  substituirVinculosUsuario_(getSheet(SHEETS.USER_GROUPS), userId, gruposNormalizados, function(id) {
    return [userId, id, new Date(), new Date()];
  });
  // GRANT e DENY na mesma tabela, numa única substituição de vínculos do usuário.
  var linhasPermissoes = concedidas.map(function(id) { return { id: id, tipo: 'GRANT' }; })
    .concat(negadas.map(function(id) { return { id: id, tipo: 'DENY' }; }));
  substituirVinculosUsuario_(getSheet(SHEETS.USER_PERMISSIONS), userId, linhasPermissoes, function(item) {
    return [userId, item.id, item.tipo, new Date()];
  });
  registrarAuditoriaAcesso_(userId, 'USUARIO_ACESSOS_ATUALIZADOS', JSON.stringify({
    grupos: gruposNormalizados.length,
    permissoesAvulsas: concedidas.length,
    permissoesNegadas: negadas.length
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
  var alvo = String(groupId);
  var agora = new Date();
  var cabecalho = data.length ? data[0] : ['GROUP_ID', 'PERMISSION_ID', 'CRIADO_EM'];
  var totalColunas = cabecalho.length;

  // Mantém as relações dos outros grupos e reconstrói as do grupo atual.
  var linhas = [cabecalho];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== alvo) linhas.push(data[i]);
  }
  var vistas = {};
  permissoes.forEach(function(permissao) {
    var id = String(permissao || '').trim();
    if (!id || vistas[id]) return;
    vistas[id] = true;
    var linha = [alvo, id, agora];
    while (linha.length < totalColunas) linha.push('');
    linhas.push(linha.slice(0, totalColunas));
  });

  // Reescreve a aba inteira de uma só vez: evita deleteRow em loop
  // (que reindexa a planilha a cada chamada) e um appendRow por permissão.
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha > 1) {
    sheet.getRange(2, 1, ultimaLinha - 1, totalColunas).clearContent();
  }
  sheet.getRange(1, 1, linhas.length, totalColunas).setValues(linhas);
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
