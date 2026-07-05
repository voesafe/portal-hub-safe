// ============================================================
// Code.gs — Roteador principal (doGet / doPost)
// SAFE Escola de Aviação | SAFE Hub
//
// DEPLOY: Extensões → Apps Script → Implantar → Novo deploy
//         Tipo: App da Web | Executar como: Eu | Acesso: Qualquer pessoa
// ============================================================

function doGet(e) {
  try {
    var p = e.parameter;
    var action  = p.action  || '';
    var pac     = p.pac     || null;
    var perfil  = p.perfil  || 'pac';
    var mes     = p.mes     ? Number(p.mes)  : null;
    var ano     = p.ano     ? Number(p.ano)  : null;
    var id      = p.id      || null;
    var token   = p.token   || '';

    validarAcaoPerfilExclusivo_(token, action);

    switch (action) {

      case 'kpis': {
        var uKpis = exigirSessao(token);
        var perfilKpis = usuarioEhSuperadmin(uKpis) ? 'master' : uKpis.perfil;
        return jsonSuccess(calcularKPIs(perfilEhAdmin(perfilKpis) ? null : uKpis.pac, perfilKpis, mes, ano));
      }

      case 'vendas': {
        var uVendas = exigirSessao(token);
        var perfilVendas = usuarioEhSuperadmin(uVendas) ? 'master' : uVendas.perfil;
        var filtPac = perfilEhAdmin(perfilVendas) ? null : uVendas.pac;
        return jsonSuccess(listarVendas(filtPac, mes, ano));
      }

      case 'venda': {
        if (!id) return jsonError('ID obrigatório');
        var uVenda = exigirSessao(token);
        var vendaItem = buscarVenda(id);
        var perfilVendaItem = usuarioEhSuperadmin(uVenda) ? 'master' : uVenda.perfil;
        if (vendaItem && !perfilEhAdmin(perfilVendaItem) &&
            String(vendaItem.pac || '').toLowerCase() !== String(uVenda.pac || '').toLowerCase()) {
          return jsonError('Sem permissão para ver esta venda.');
        }
        return jsonSuccess(vendaItem);
      }

      case 'faturamento': {
        var uFat = exigirSessao(token);
        if (!usuarioEhSuperadmin(uFat) && !perfilEhAdmin(uFat.perfil)) return jsonError('Acesso negado');
        return jsonSuccess(listarFaturamento(mes, ano));
      }

      case 'faturamento-resumo': {
        var uFatR = exigirSessao(token);
        if (!usuarioEhSuperadmin(uFatR) && !perfilEhAdmin(uFatR.perfil)) return jsonError('Acesso negado');
        return jsonSuccess(resumoFaturamento(ano));
      }

      case 'usuarios':
        exigirGestaoUsuarios(token);
        return jsonSuccess(listarUsuariosCentralizados());

      case 'access-control':
        exigirGestaoUsuarios(token);
        return jsonSuccess(listarControleAcesso());

      case 'login-usuarios':
        return jsonSuccess(listarUsuariosLogin());

      case 'bases':
        var usuarioBases = validarTokenSessao(token);
        if (!usuarioBases) return jsonError('Sessão expirada. Entre novamente.');
        return jsonSuccess(listarBases(usuarioEhSuperadmin(usuarioBases) || perfilEhAdminCompleto(usuarioBases.perfil)));

      case 'canais':
        return jsonSuccess(CANAIS);

      // Concorrência — todos os logados podem ver
      case 'listar-concorrencia':
        exigirSessao(token);
        return jsonSuccess(listarConcorrencia());

      // Preços SAFE — todos os logados podem ver
      case 'listar-precos-safe':
        exigirSessao(token);
        return jsonSuccess(listarPrecosSafe());

      // ── Newzenler / Progresso de Alunos ───────────────────
      case 'newzenler-cursos': {
        var uNzCursos = validarTokenSessao(token);
        if (!uNzCursos) return jsonError('Sessão expirada. Entre novamente.');
        if (!usuarioEhSuperadmin(uNzCursos) && !perfilEhAdminCompleto(uNzCursos.perfil)) return jsonError('Acesso negado.');
        return jsonSuccess(newzenlerListarCursos());
      }

      case 'newzenler-progresso': {
        var uNzProg = validarTokenSessao(token);
        if (!uNzProg) return jsonError('Sessão expirada. Entre novamente.');
        if (!usuarioEhSuperadmin(uNzProg) && !perfilEhAdminCompleto(uNzProg.perfil)) return jsonError('Acesso negado.');
        return jsonSuccess(newzenlerProgressoDetalhado({
          courseId:  p.courseId  || '',
          nameLike:  p.nameLike  || '',
          emailLike: p.emailLike || '',
          page:      p.page  ? Number(p.page)  : 1,
          limit:     p.limit ? Number(p.limit) : 50
        }));
      }

      case 'newzenler-buscar-alunos': {
        var uNzBusca = validarTokenSessao(token);
        if (!uNzBusca) return jsonError('Sessão expirada. Entre novamente.');
        if (!usuarioEhSuperadmin(uNzBusca) && !perfilEhAdminCompleto(uNzBusca.perfil)) return jsonError('Acesso negado.');
        if (!p.query) return jsonError('Informe um nome ou e-mail para buscar.');
        return jsonSuccess(newzenlerBuscarAlunos(p.query));
      }

      case 'newzenler-progresso-aluno': {
        var uNzPa = validarTokenSessao(token);
        if (!uNzPa) return jsonError('Sessão expirada. Entre novamente.');
        if (!usuarioEhSuperadmin(uNzPa) && !perfilEhAdminCompleto(uNzPa.perfil)) return jsonError('Acesso negado.');
        if (!p.email) return jsonError('E-mail do aluno obrigatório.');
        return jsonSuccess(newzenlerProgressoAluno(p.email));
      }

      case 'cadastro-alunos':
        var usuarioCadastro = exigirCadastroAlunos(token);
        return jsonSuccess(listarCadastroAlunos(usuarioCadastro));

      default:
        return jsonError('Ação desconhecida: ' + action);
    }

  } catch(err) {
    return jsonError(err.message);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action  = body.action  || '';
    var dados   = body.dados   || {};
    var pac     = body.pac     || '';
    var perfil  = body.perfil  || 'pac';
    var token   = body.token   || '';

    if (action !== 'login') validarAcaoPerfilExclusivo_(token, action);

    switch (action) {

      // ── Auth ───────────────────────────────────────────────
      case 'login':
        var usuario = login(dados.email, dados.senha);
        if (!usuario) return jsonError('E-mail ou senha incorretos');
        return jsonSuccess(usuario);

      case 'alterar-senha':
        var ok = alterarMinhaSenha(token, dados.senhaAtual, dados.novaSenha);
        if (!ok) return jsonError('Senha atual incorreta');
        return jsonSuccess({ mensagem: 'Senha alterada com sucesso' });

      // ── Vendas ─────────────────────────────────────────────
      case 'criar-venda': {
        var uCriarV = exigirSessao(token);
        if (!usuarioEhSuperadmin(uCriarV) && perfilSomenteLeitura(uCriarV.perfil)) return jsonError('Acesso somente leitura');
        if (!usuarioEhSuperadmin(uCriarV) && !perfilEhAdminCompleto(uCriarV.perfil)) dados.pac = uCriarV.pac;
        return jsonSuccess(criarVenda(dados));
      }

      case 'editar-venda': {
        var uEditarV = exigirSessao(token);
        if (!usuarioEhSuperadmin(uEditarV) && perfilSomenteLeitura(uEditarV.perfil)) return jsonError('Acesso somente leitura');
        if (!dados.id) return jsonError('ID obrigatório');
        var atualizado = atualizarVenda(dados.id, dados, uEditarV.pac, usuarioEhSuperadmin(uEditarV) ? 'master' : uEditarV.perfil);
        if (!atualizado) return jsonError('Venda não encontrada');
        return jsonSuccess({ mensagem: 'Venda atualizada' });
      }

      case 'excluir-venda': {
        var uExcluirV = exigirSessao(token);
        if (!usuarioEhSuperadmin(uExcluirV) && perfilSomenteLeitura(uExcluirV.perfil)) return jsonError('Acesso somente leitura');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(excluirVenda(dados.id, uExcluirV.pac, usuarioEhSuperadmin(uExcluirV) ? 'master' : uExcluirV.perfil));
      }

      // ── Faturamento ────────────────────────────────────────
      case 'salvar-faturamento': {
        var uSalvarFat = exigirSessao(token);
        if (!usuarioEhSuperadmin(uSalvarFat) && !perfilEhAdminCompleto(uSalvarFat.perfil)) return jsonError('Acesso negado');
        return jsonSuccess(salvarFaturamento(dados.mes, dados.ano, dados.canal, dados.valor));
      }

      case 'excluir-faturamento': {
        var uExcluirFat = exigirSessao(token);
        if (!usuarioEhSuperadmin(uExcluirFat) && !perfilEhAdminCompleto(uExcluirFat.perfil)) return jsonError('Acesso negado');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(excluirFaturamento(dados.id));
      }

      // ── Usuários ───────────────────────────────────────────
      case 'criar-usuario':
        var gestorCriaUsuario = exigirGestaoUsuarios(token);
        dados.atualizadoPor = gestorCriaUsuario.email || gestorCriaUsuario.pac || '';
        return jsonSuccess(criarUsuarioCentralizado(dados));

      case 'editar-usuario':
        var gestorEditaUsuario = exigirGestaoUsuarios(token);
        if (!dados.id) return jsonError('ID obrigatório');
        if (String(dados.id) === String(gestorEditaUsuario.id) &&
            dados.hasOwnProperty('superadmin') &&
            !valorBooleano(dados.superadmin)) {
          return jsonError('Você não pode remover seu próprio acesso de superadmin.');
        }
        if (String(dados.id) === String(gestorEditaUsuario.id) &&
            dados.hasOwnProperty('ativo') &&
            !valorBooleano(dados.ativo)) {
          return jsonError('Você não pode desativar seu próprio acesso.');
        }
        dados.atualizadoPor = gestorEditaUsuario.email || gestorEditaUsuario.pac || '';
        var editado = atualizarUsuarioCentralizado(dados.id, dados);
        if (!editado) return jsonError('Usuário não encontrado');
        return jsonSuccess({ mensagem: 'Usuário atualizado' });

      case 'alterar-status-usuario':
        var gestorStatusUsuario = exigirGestaoUsuarios(token);
        if (!dados.id) return jsonError('ID obrigatório');
        if (String(dados.id) === String(gestorStatusUsuario.id) &&
            dados.hasOwnProperty('ativo') &&
            !valorBooleano(dados.ativo)) {
          return jsonError('Você não pode desativar seu próprio acesso.');
        }
        dados.atualizadoPor = gestorStatusUsuario.email || gestorStatusUsuario.pac || '';
        var statusAlterado = alterarStatusUsuarioCentralizado(dados.id, dados);
        if (!statusAlterado) return jsonError('Usuário não encontrado');
        return jsonSuccess({ mensagem: 'Status atualizado' });

      case 'reenviar-boas-vindas-usuario':
        var gestorReenviaBoasVindas = exigirGestaoUsuarios(token);
        if (!dados.id) return jsonError('ID obrigatório');
        dados.atualizadoPor = gestorReenviaBoasVindas.email || gestorReenviaBoasVindas.pac || '';
        return jsonSuccess(reenviarEmailBoasVindasUsuarioCentralizado(dados.id, dados));

      case 'resetar-senha-padrao-usuario':
        exigirGestaoUsuarios(token);
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(resetarSenhaPadraoUsuarioCentralizado(dados.id));

      case 'forcar-logout-global':
        return jsonSuccess(forcarLogoutGlobal(token));

      case 'salvar-access-group':
        var gestorGrupoAcesso = exigirGestaoUsuarios(token);
        return jsonSuccess(salvarGrupoAcesso(dados, gestorGrupoAcesso));

      case 'cadastro-alunos-importar':
        var usuarioImportaAlunos = exigirCadastroAlunos(token);
        return jsonSuccess(importarCadastroAlunos(dados.alunos || [], usuarioImportaAlunos));

      case 'cadastro-alunos-marcar-s141':
        var usuarioS141 = exigirCadastroAlunos(token);
        return jsonSuccess(marcarS141CadastroAluno(dados.id, usuarioS141));

      case 'cadastro-alunos-sync-trello':
        var usuarioSyncAluno = exigirCadastroAlunos(token);
        return jsonSuccess(sincronizarTrelloCadastroAluno(dados.id, usuarioSyncAluno, token));

      case 'cadastro-alunos-inativar':
        var usuarioInativaAluno = exigirCadastroAlunos(token);
        return jsonSuccess(alterarSituacaoCadastroAluno(dados.id, false, usuarioInativaAluno));

      case 'cadastro-alunos-reativar':
        var usuarioReativaAluno = exigirCadastroAlunos(token);
        return jsonSuccess(alterarSituacaoCadastroAluno(dados.id, true, usuarioReativaAluno));

      // ── Bases ──────────────────────────────────────────────
      case 'salvar-base':
        exigirGestaoBases(token);
        return jsonSuccess(salvarBase(dados));

      // ── Concorrência — PAC pode criar/editar, só admin pode excluir ──
      case 'criar-concorrente': {
        var uCriarC = exigirSessao(token);
        if (!usuarioEhSuperadmin(uCriarC) && perfilSomenteLeitura(uCriarC.perfil)) return jsonError('Acesso somente leitura');
        return jsonSuccess(criarConcorrente(dados, uCriarC.pac));
      }

      case 'editar-concorrente': {
        var uEditarC = exigirSessao(token);
        if (!usuarioEhSuperadmin(uEditarC) && perfilSomenteLeitura(uEditarC.perfil)) return jsonError('Acesso somente leitura');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(editarConcorrente(dados.id, dados));
      }

      case 'excluir-concorrente': {
        var uExcluirC = exigirSessao(token);
        if (!usuarioEhSuperadmin(uExcluirC) && !perfilEhAdminCompleto(uExcluirC.perfil)) return jsonError('Acesso negado');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(excluirConcorrente(dados.id));
      }

      // ── Preços SAFE — só admin completo edita ─────────────
      case 'salvar-preco-safe': {
        var uPreco = exigirSessao(token);
        if (!usuarioEhSuperadmin(uPreco) && !perfilEhAdminCompleto(uPreco.perfil)) return jsonError('Acesso negado');
        if (!dados.curso) return jsonError('Curso obrigatório');
        return jsonSuccess(salvarPrecoSafe(dados));
      }

      // ── Controle de Gastos - sessão validada no servidor ───
      case 'controle-gastos':
        var usuarioConsultaFinanceiro = exigirAcessoFinanceiro(token);
        return jsonSuccess(listarControleGastos(dados.ano, dados.mes));

      case 'salvar-fechamento-gastos':
        var usuarioFinanceiro = exigirEdicaoControleGastos(token);
        return jsonSuccess(salvarFechamentoGastos(dados, usuarioFinanceiro));

      case 'salvar-receitas-base':
        var usuarioReceitasBase = exigirEdicaoControleGastos(token);
        return jsonSuccess(salvarReceitasBase(dados, usuarioReceitasBase));

      case 'criar-categoria-gasto':
        var usuarioCriaCategoria = exigirEdicaoControleGastos(token);
        return jsonSuccess(criarCategoriaGasto(dados, usuarioCriaCategoria));

      case 'editar-categoria-gasto':
        var usuarioEditaCategoria = exigirEdicaoControleGastos(token);
        return jsonSuccess(editarCategoriaGasto(dados, usuarioEditaCategoria));

      case 'alterar-status-categoria-gasto':
        var usuarioStatusCategoria = exigirEdicaoControleGastos(token);
        return jsonSuccess(alterarStatusCategoriaGasto(dados, usuarioStatusCategoria));

      // ── Fechamento de Horas / Cotistas ────────────────────
      case 'fechamento-horas':
        var usuarioConsultaHoras = exigirAcessoFechamentoHoras(token);
        return jsonSuccess(listarFechamentoHoras(dados.ano, dados.mes));

      case 'salvar-fechamento-horas':
        var usuarioSalvaHoras = exigirAcessoFechamentoHoras(token);
        return jsonSuccess(salvarFechamentoHoras(dados, usuarioSalvaHoras));

      case 'alterar-status-fechamento-horas':
        var usuarioStatusHoras = exigirAcessoFechamentoHoras(token);
        return jsonSuccess(alterarStatusFechamentoHoras(dados, usuarioStatusHoras));

      case 'importar-fechamento-cavok':
        var usuarioImportaCavok = exigirAcessoFechamentoHoras(token);
        return jsonSuccess(importarFechamentoHorasCavok(dados, usuarioImportaCavok));

      default:
        return jsonError('Ação desconhecida: ' + action);
    }

  } catch(err) {
    return jsonError(err.message);
  }
}
