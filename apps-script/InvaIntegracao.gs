// Autoriza as rotas legadas de escrita de Instrutores pela sessao do Hub.
// A credencial do parceiro so vale na API da pagina Instrutores do INVA.
function autorizarEscritaInva(token, acao) {
  var sincronias = ['sync_cavok', 'sync_cavok_dia'];
  var cadastros = [
    'add_instructor', 'set_instructor_base', 'set_instructor_release',
    'set_instructor_order', 'set_instructor_active', 'save_label',
    'delete_label', 'set_instructor_labels', 'add_comment', 'delete_comment',
    'add_instructor_solo', 'set_instructor_base_solo', 'set_instructor_order_solo',
    'set_instructor_active_solo', 'save_label_solo', 'delete_label_solo',
    'set_instructor_labels_solo', 'add_comment_solo', 'delete_comment_solo'
  ];
  var permissao = sincronias.indexOf(acao) >= 0 ? 'horas_inva.sincronizar_cavok'
    : cadastros.indexOf(acao) >= 0 ? 'horas_inva.cadastrar_instrutor' : '';
  if (!permissao) throw new Error('Operacao de instrutores nao autorizada.');
  var usuario = exigirSessao(token);
  if (!usuarioTemPermissao(usuario, permissao)) throw new Error('Sem permissao para alterar instrutores.');
  return { autorizado: true };
}

// Diagnostico administrativo somente leitura, sem emitir ou alterar sessoes.
function diagnosticarAcessoInstrutores(userId) {
  var sheet = getSheet(SHEETS.USUARIOS);
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var linha = -1;
  ids.forEach(function (r, i) { if (String(r[0]) === String(userId)) linha = i + 2; });
  if (linha < 0) throw new Error('Usuario nao encontrado.');
  var perfilAtivo = sheet.getRange(linha, 6, 1, 2).getValues()[0];
  var sessao = { perfil: perfilAtivo[0], superadmin: false };
  var efetivas = calcularPermissoesEfetivasUsuario_(userId, false);
  var rotaPermitida = true;
  try { validarAcaoExclusivaDaSessao_(sessao, 'autorizar-inva'); }
  catch (e) { rotaPermitida = false; }
  return {
    ativo: valorBooleano(perfilAtivo[1]), perfil: sessao.perfil,
    rotaPermitida: rotaPermitida,
    visualizar: efetivas.indexOf('horas_inva.visualizar') >= 0,
    editar: efetivas.indexOf('horas_inva.cadastrar_instrutor') >= 0,
    sincronizar: efetivas.indexOf('horas_inva.sincronizar_cavok') >= 0
  };
}
