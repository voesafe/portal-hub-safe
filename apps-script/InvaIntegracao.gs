// Autoriza as rotas legadas de escrita de Instrutores pela sessao do Hub.
// A credencial do parceiro so vale na API restrita do backend INVA.
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
