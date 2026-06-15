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

      case 'kpis':
        return jsonSuccess(calcularKPIs(perfilEhAdmin(perfil) ? null : pac, perfil, mes, ano));

      case 'vendas':
        var filtPac = perfilEhAdmin(perfil) ? null : pac;
        return jsonSuccess(listarVendas(filtPac, mes, ano));

      case 'venda':
        if (!id) return jsonError('ID obrigatório');
        return jsonSuccess(buscarVenda(id));

      case 'faturamento':
        if (!perfilEhAdmin(perfil)) return jsonError('Acesso negado');
        return jsonSuccess(listarFaturamento(mes, ano));

      case 'faturamento-resumo':
        if (!perfilEhAdmin(perfil)) return jsonError('Acesso negado');
        return jsonSuccess(resumoFaturamento(ano));

      case 'usuarios':
        exigirGestaoUsuarios(token);
        return jsonSuccess(listarUsuariosCentralizados());

      case 'login-usuarios':
        return jsonSuccess(listarUsuariosLogin());

      case 'bases':
        var usuarioBases = validarTokenSessao(token);
        if (!usuarioBases) return jsonError('Sessão expirada. Entre novamente.');
        return jsonSuccess(listarBases(perfilEhAdminCompleto(usuarioBases.perfil)));

      case 'canais':
        return jsonSuccess(CANAIS);

      // Concorrência — todos os logados podem ver
      case 'listar-concorrencia':
        return jsonSuccess(listarConcorrencia());

      // Preços SAFE — todos os logados podem ver
      case 'listar-precos-safe':
        return jsonSuccess(listarPrecosSafe());

      // ── Newzenler / Progresso de Alunos ───────────────────
      case 'newzenler-cursos': {
        var uNzCursos = validarTokenSessao(token);
        if (!uNzCursos) return jsonError('Sessão expirada. Entre novamente.');
        if (!perfilEhAdminCompleto(uNzCursos.perfil)) return jsonError('Acesso negado.');
        return jsonSuccess(newzenlerListarCursos());
      }

      case 'newzenler-progresso': {
        var uNzProg = validarTokenSessao(token);
        if (!uNzProg) return jsonError('Sessão expirada. Entre novamente.');
        if (!perfilEhAdminCompleto(uNzProg.perfil)) return jsonError('Acesso negado.');
        return jsonSuccess(newzenlerProgressoDetalhado({
          courseId:  p.courseId  || '',
          nameLike:  p.nameLike  || '',
          emailLike: p.emailLike || '',
          page:      p.page  ? Number(p.page)  : 1,
          limit:     p.limit ? Number(p.limit) : 50
        }));
      }

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
      case 'criar-venda':
        if (perfilSomenteLeitura(perfil)) return jsonError('Acesso somente leitura');
        if (!perfilEhAdminCompleto(perfil)) dados.pac = pac;
        return jsonSuccess(criarVenda(dados));

      case 'editar-venda':
        if (perfilSomenteLeitura(perfil)) return jsonError('Acesso somente leitura');
        if (!dados.id) return jsonError('ID obrigatório');
        var atualizado = atualizarVenda(dados.id, dados, pac, perfil);
        if (!atualizado) return jsonError('Venda não encontrada');
        return jsonSuccess({ mensagem: 'Venda atualizada' });

      case 'excluir-venda':
        if (perfilSomenteLeitura(perfil)) return jsonError('Acesso somente leitura');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(excluirVenda(dados.id, pac, perfil));

      // ── Faturamento ────────────────────────────────────────
      case 'salvar-faturamento':
        if (!perfilEhAdminCompleto(perfil)) return jsonError('Acesso negado');
        return jsonSuccess(salvarFaturamento(dados.mes, dados.ano, dados.canal, dados.valor));

      case 'excluir-faturamento':
        if (!perfilEhAdminCompleto(perfil)) return jsonError('Acesso negado');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(excluirFaturamento(dados.id));

      // ── Usuários ───────────────────────────────────────────
      case 'criar-usuario':
        exigirGestaoUsuarios(token);
        return jsonSuccess(criarUsuarioCentralizado(dados));

      case 'editar-usuario':
        exigirGestaoUsuarios(token);
        if (!dados.id) return jsonError('ID obrigatório');
        var editado = atualizarUsuarioCentralizado(dados.id, dados);
        if (!editado) return jsonError('Usuário não encontrado');
        return jsonSuccess({ mensagem: 'Usuário atualizado' });

      // ── Bases ──────────────────────────────────────────────
      case 'salvar-base':
        exigirGestaoBases(token);
        return jsonSuccess(salvarBase(dados));

      // ── Concorrência — PAC pode criar/editar, só admin pode excluir ──
      case 'criar-concorrente':
        if (perfilSomenteLeitura(perfil)) return jsonError('Acesso somente leitura');
        return jsonSuccess(criarConcorrente(dados, pac));

      case 'editar-concorrente':
        if (perfilSomenteLeitura(perfil)) return jsonError('Acesso somente leitura');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(editarConcorrente(dados.id, dados));

      case 'excluir-concorrente':
        if (!perfilEhAdminCompleto(perfil)) return jsonError('Acesso negado');
        if (!dados.id) return jsonError('ID obrigatório');
        return jsonSuccess(excluirConcorrente(dados.id));

      // ── Preços SAFE — só admin completo edita ─────────────
      case 'salvar-preco-safe':
        if (!perfilEhAdminCompleto(perfil)) return jsonError('Acesso negado');
        if (!dados.curso) return jsonError('Curso obrigatório');
        return jsonSuccess(salvarPrecoSafe(dados));

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
