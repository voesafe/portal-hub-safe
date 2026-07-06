// ============================================================
// admin.js - Diretório central de usuários (Master TI)
// SAFE Hub
// ============================================================

const Admin = {
  usuarios: [],
  contagemEmails: new Map(),
  controleAcesso: { grupos: [], permissoes: [] },
  acessosSelecionados: { grupos: new Set(), permissoes: new Set() },
  editandoId: null,
  abaAtual: 'ativos',
  CACHE_USUARIOS_KEY: 'safe-admin-usuarios-cache-v1',

  async init() {
    if (!Auth.protegerGestaoUsuarios()) return;
    Auth.preencherUI();
    this.initSidebar();
    this.initForm();
    this.initFiltros();
    this.limparFiltrosIniciais();
    this.initTabs();
    this.initAlterarSenha();
    await this.carregar();
  },

  lerCacheUsuarios() {
    try {
      const cache = JSON.parse(localStorage.getItem(this.CACHE_USUARIOS_KEY) || 'null');
      if (!cache || !Array.isArray(cache.usuarios)) return null;
      if (Date.now() - Number(cache.ts || 0) > 5 * 60 * 1000) return null;
      return cache;
    } catch {
      return null;
    }
  },

  gravarCacheUsuarios(payload) {
    try {
      localStorage.setItem(this.CACHE_USUARIOS_KEY, JSON.stringify({
        usuarios: payload?.usuarios || [],
        aviso: payload?.aviso || '',
        ts: Date.now()
      }));
    } catch {}
  },

  aplicarUsuarios(payload) {
    this.usuarios = payload?.usuarios || [];
    this.recalcularContagemEmails();
    this.renderResumo();
    this.renderTabela();
  },

  // Conta e-mails uma única vez por carga em vez de refiltrar a lista inteira
  // para cada usuário (antes O(n²) a cada render da tabela/resumo/filtro).
  recalcularContagemEmails() {
    this.contagemEmails = new Map();
    this.usuarios.forEach(usuario => {
      const email = String(usuario.email || '').trim().toLowerCase();
      if (!email) return;
      this.contagemEmails.set(email, (this.contagemEmails.get(email) || 0) + 1);
    });
  },

  async carregar(opcoes = {}) {
    const usarCache = opcoes.usarCache !== false;
    const cache = usarCache ? this.lerCacheUsuarios() : null;
    if (cache) {
      this.aplicarUsuarios(cache);
    }

    const [res, acessoRes] = await Promise.all([
      API.getUsuarios(),
      API.getControleAcesso()
    ]);
    if (!res.ok) {
      toast(res.error || 'Erro ao carregar usuários.', 'error');
      return;
    }
    if (acessoRes.ok) {
      this.controleAcesso = acessoRes.data || { grupos: [], permissoes: [] };
    } else {
      toast(acessoRes.error || 'Não foi possível carregar grupos e permissões.', 'warning');
    }

    this.aplicarUsuarios(res.data || {});
    this.gravarCacheUsuarios(res.data || {});
    if (res.data?.aviso) toast(res.data.aviso, 'warning', 6000);
  },

  normalizarOrigem(origem) {
    return String(origem || 'hub').trim().toLowerCase();
  },

  labelOrigem(origem) {
    return this.normalizarOrigem(origem) === 'cco' ? 'CCO' : 'Hub';
  },

  labelPerfil(usuario) {
    if (this.eSuperadminUsuario(usuario)) return 'Superadmin';
    const perfil = usuario.perfil;
    if (Auth.perfilEhMaster(perfil)) return 'Master TI';
    if (Auth.normalizarPerfil(perfil) === 'financeiro') return 'Financeiro';
    if (Auth.normalizarPerfil(perfil) === 'controle_gastos_visualizacao') {
      return 'Controle de Gastos · Leitura';
    }
    if (Auth.normalizarPerfil(perfil) === 'escala_minions') {
      return 'Escala & SAFE MINIONS';
    }
    if (Auth.perfilSomenteLeitura(perfil)) return 'Admin leitura';
    if (Auth.perfilEhAdmin(perfil)) return 'Administrador';
    if (Auth.normalizarPerfil(perfil) === 'cco_admin') return 'Administrador CCO';
    if (Auth.normalizarPerfil(perfil) === 'cco_financeiro') return 'Financeiro CCO';
    if (Auth.normalizarPerfil(perfil) === 'cco_user') return 'Operador CCO';
    return 'Consultor';
  },

  badgePerfil(perfil) {
    if (Auth.perfilEhMaster(perfil)) return 'badge-blue';
    if (Auth.normalizarPerfil(perfil).includes('financeiro')) return 'badge-teal';
    if (Auth.perfilSomenteLeitura(perfil)) return 'badge-orange';
    return Auth.normalizarPerfil(perfil).includes('admin') ? 'badge-navy' : 'badge-teal';
  },

  badgeUsuario(usuario) {
    return this.eSuperadminUsuario(usuario) ? 'badge-blue' : this.badgePerfil(usuario.perfil);
  },

  resumoAcessoUsuario(usuario) {
    if (this.normalizarOrigem(usuario.origem) === 'cco') return 'Acesso gerenciado no CCO';
    if (this.eSuperadminUsuario(usuario)) return 'Acesso total ao Hub';
    const grupos = Array.isArray(usuario.grupos) ? usuario.grupos.length : 0;
    const permissoes = Array.isArray(usuario.permissoesAvulsas) ? usuario.permissoesAvulsas.length : 0;
    if (!grupos && !permissoes) return 'Sem grupos ou permissões avulsas';
    return `${grupos} grupo(s) · ${permissoes} permissão(ões) avulsa(s)`;
  },

  eSuperadminUsuario(usuario) {
    return usuario?.superadmin === true || String(usuario?.superadmin).toLowerCase() === 'true';
  },

  estaAtivo(valor) {
    return valor === true || valor === 1 || String(valor).trim().toLowerCase() === 'true';
  },

  usuariosFiltrados() {
    const busca = document.getElementById('filtro-busca')?.value.trim().toLowerCase() || '';
    const origem = document.getElementById('filtro-origem')?.value || '';
    const cadastro = document.getElementById('filtro-cadastro')?.value || '';

    return this.usuarios.filter(usuario => {
      const ativo = this.estaAtivo(usuario.ativo);
      const texto = [
        usuario.nome,
        usuario.email,
        usuario.modulo,
        this.labelPerfil(usuario)
      ].join(' ').toLowerCase();

      if (busca && !texto.includes(busca)) return false;
      if (origem && this.normalizarOrigem(usuario.origem) !== origem) return false;
      if (this.abaAtual === 'ativos' && !ativo) return false;
      if (this.abaAtual === 'inativos' && ativo) return false;
      if (cadastro === 'completo' && !this.cadastroCompleto(usuario)) return false;
      if (cadastro === 'pendente' && this.cadastroCompleto(usuario)) return false;
      return true;
    });
  },

  renderResumo() {
    const total = this.usuarios.length;
    const ativos = this.usuarios.filter(u => this.estaAtivo(u.ativo)).length;
    const sistemas = new Set(this.usuarios.map(u => this.normalizarOrigem(u.origem))).size;
    const pendentes = this.usuarios.filter(u => !this.cadastroCompleto(u)).length;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-ativos').textContent = ativos;
    document.getElementById('kpi-sistemas').textContent = sistemas;
    document.getElementById('kpi-pendentes').textContent = pendentes;
    document.getElementById('tab-ativos-count').textContent = ativos;
    document.getElementById('tab-inativos-count').textContent = total - ativos;
  },

  cadastroCompleto(usuario) {
    const email = String(usuario.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    return (this.contagemEmails?.get(email) || 0) === 1;
  },

  renderTabela() {
    const tbody = document.getElementById('tabela-usuarios');
    const contador = document.getElementById('usuarios-contagem');
    if (!tbody) return;

    const usuarios = this.usuariosFiltrados();
    if (contador) contador.textContent = `${usuarios.length} de ${this.usuarios.length}`;

    if (!usuarios.length) {
      const mensagem = this.abaAtual === 'ativos'
        ? 'Nenhum usuário ativo encontrado'
        : 'Nenhum usuário inativo encontrado';
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:32px">${mensagem}</td></tr>`;
      return;
    }

    const usuarioAtualId = String(Auth.getSessao()?.id || '');
    tbody.innerHTML = usuarios.map(usuario => {
      const ativo = this.estaAtivo(usuario.ativo);
      const origem = this.normalizarOrigem(usuario.origem);
      const completo = this.cadastroCompleto(usuario);
      const proprioUsuario = String(usuario.id) === usuarioAtualId;
      return `
        <tr>
          <td class="col-nome" data-label="Usuário">
            <div class="usuario-identidade">
              <span class="usuario-avatar origem-${origem}">${this.iniciais(usuario.nome)}</span>
              <span>
                <strong>${this.escape(usuario.nome || usuario.pac)}</strong>
                <small class="${completo ? '' : 'usuario-email-pendente'}">${this.escape(usuario.email || 'E-mail de acesso não informado')}</small>
              </span>
            </div>
          </td>
          <td data-label="Sistema">
            <span class="badge origem-badge origem-${origem}">${this.labelOrigem(origem)}</span>
            <small class="usuario-modulo">${this.escape(usuario.modulo || 'SAFE Hub')}</small>
          </td>
          <td class="col-perfil" data-label="Perfil">
            <span class="badge ${this.badgeUsuario(usuario)}">${this.labelPerfil(usuario)}</span>
            <small class="usuario-access-line">${this.escape(this.resumoAcessoUsuario(usuario))}</small>
          </td>
          <td data-label="Cadastro"><span class="cadastro-status ${completo ? 'completo' : 'pendente'}">${completo ? 'Completo' : 'Ação necessária'}</span></td>
          <td data-label="Ação">
            <div class="usuario-actions">
              <button class="btn btn-ghost btn-sm" onclick="Admin.editar('${this.escapeAtributo(usuario.id)}')">Editar</button>
              <button class="btn btn-sm ${ativo ? 'btn-status-danger' : 'btn-status-success'}" ${proprioUsuario ? 'disabled title="Você não pode desativar seu próprio acesso"' : `onclick="Admin.alternarStatus('${this.escapeAtributo(usuario.id)}')"`}>
                ${ativo ? 'Desativar' : 'Reativar'}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  iniciais(nome) {
    return String(nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  },

  escape(valor) {
    const el = document.createElement('div');
    el.textContent = String(valor ?? '');
    return el.innerHTML;
  },

  escapeAtributo(valor) {
    return String(valor ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  },

  formatarData(valor) {
    if (!valor) return '—';
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
  },

  initFiltros() {
    ['filtro-busca', 'filtro-origem', 'filtro-cadastro'].forEach(id => {
      document.getElementById(id)?.addEventListener(id === 'filtro-busca' ? 'input' : 'change', () => {
        this.renderTabela();
      });
    });
  },

  limparFiltrosIniciais() {
    const busca = document.getElementById('filtro-busca');
    if (busca) {
      busca.value = '';
      busca.setAttribute('autocomplete', 'off');
      // O campo começa readonly (no HTML) para impedir o autofill do navegador,
      // que estava injetando o e-mail do usuário logado. Só liberamos a digitação
      // quando o próprio usuário interage com o campo.
      const liberar = () => busca.removeAttribute('readonly');
      busca.addEventListener('focus', liberar, { once: true });
      busca.addEventListener('pointerdown', liberar, { once: true });
      // Rede de segurança: se o navegador ainda assim preencher, limpamos.
      [150, 500].forEach(delay => setTimeout(() => {
        if (busca.value) {
          busca.value = '';
          this.renderTabela();
        }
      }, delay));
    }
    const origem = document.getElementById('filtro-origem');
    const cadastro = document.getElementById('filtro-cadastro');
    if (origem) origem.value = '';
    if (cadastro) cadastro.value = '';
  },

  initTabs() {
    document.querySelectorAll('.usuarios-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.abaAtual = tab.dataset.tab;
        document.querySelectorAll('.usuarios-tab').forEach(item => {
          const ativa = item === tab;
          item.classList.toggle('active', ativa);
          item.setAttribute('aria-selected', String(ativa));
        });
        this.renderTabela();
      });
    });
  },

  initForm() {
    document.getElementById('btn-novo-usuario')?.addEventListener('click', () => this.abrirForm());
    document.getElementById('btn-salvar-usuario')?.addEventListener('click', () => this.salvar());
    document.getElementById('btn-reenviar-boas-vindas')?.addEventListener('click', () => this.reenviarBoasVindas());
    document.getElementById('btn-resetar-senha-padrao')?.addEventListener('click', () => this.resetarSenhaPadrao());
    document.getElementById('btn-forcar-relogin')?.addEventListener('click', () => this.forcarReloginGlobal());
    document.getElementById('u-origem')?.addEventListener('change', () => this.atualizarCamposOrigem());
    document.getElementById('u-perfil')?.addEventListener('change', () => this.atualizarResumoAcesso());
    document.getElementById('u-superadmin')?.addEventListener('change', () => this.atualizarResumoAcesso());
    document.getElementById('u-busca-grupos')?.addEventListener('input', () => this.renderSeletoresAcesso());
    document.getElementById('u-busca-permissoes')?.addEventListener('input', () => this.renderSeletoresAcesso());
    document.getElementById('u-grupos-acesso')?.addEventListener('change', event => {
      const input = event.target.closest('input[data-access-group]');
      if (!input) return;
      this.alternarSet(this.acessosSelecionados.grupos, input.dataset.accessGroup, input.checked);
      // Re-renderiza para ocultar/reexibir as permissões que o grupo passa a cobrir.
      this.renderSeletoresAcesso();
      this.atualizarResumoAcesso();
    });
    document.getElementById('u-permissoes-avulsas')?.addEventListener('change', event => {
      const input = event.target.closest('input[data-access-permission]');
      if (!input) return;
      this.alternarSet(this.acessosSelecionados.permissoes, input.dataset.accessPermission, input.checked);
      this.atualizarResumoAcesso();
    });
  },

  alternarSet(set, valor, ativo) {
    if (!valor) return;
    if (ativo) set.add(valor);
    else set.delete(valor);
  },

  async forcarReloginGlobal() {
    const msg = 'Isso vai encerrar todas as sessões ativas do Hub, inclusive a sua. Todos precisarão entrar novamente.';
    if (!window.confirm(`${msg}\n\nDeseja continuar?`)) return;

    const btn = document.getElementById('btn-forcar-relogin');
    btnLoading(btn, true);
    const res = await API.forcarLogoutGlobal();
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Não foi possível forçar o relogin geral.', 'error');
      return;
    }

    toast('Sessões encerradas. Redirecionando para o login.', 'success');
    setTimeout(() => Auth.logout(), 1200);
  },

  perfisAcesso() {
    return {
      pac: {
        titulo: 'Consultor comercial',
        descricao: 'Acesso às rotinas comerciais vinculadas ao próprio usuário.',
        tags: ['Dashboard', 'Vendas próprias', 'Consulta de bases']
      },
      admin: {
        titulo: 'Administrador completo',
        descricao: 'Acesso administrativo amplo aos módulos operacionais e comerciais.',
        tags: ['Vendas', 'Faturamento', 'Concorrência', 'Escala CCO']
      },
      master: {
        titulo: 'Master TI',
        descricao: 'Controle integral do SAFE Hub, incluindo usuários e configurações.',
        tags: ['Todos os módulos', 'Gestão de usuários', 'Configurações']
      },
      admin_readonly: {
        titulo: 'Administrador somente visualização',
        descricao: 'Consulta administrativa sem permissão para criar, editar ou excluir registros.',
        tags: ['Dashboard', 'Vendas', 'Faturamento', 'Concorrência', 'Somente leitura']
      },
      financeiro: {
        titulo: 'Financeiro operacional',
        descricao: 'Perfil financeiro autorizado para lançamentos e fechamentos.',
        tags: ['Controle de Gastos', 'Fechamento de Horas', 'Edição']
      },
      controle_gastos_visualizacao: {
        titulo: 'Controle de Gastos · Somente visualização',
        descricao: 'Acesso exclusivo aos indicadores do Controle de Gastos, sem alterar valores, receitas ou categorias.',
        tags: ['Apenas Controle de Gastos', 'Visão Geral', 'Sem edição']
      },
      escala_minions: {
        titulo: 'Escala CCO/INVA + SAFE MINIONS',
        descricao: 'Acesso exclusivo à Escala CCO, Horas Voadas INVA Mês e SAFE MINIONS. Nenhum outro módulo do Hub fica visível.',
        tags: ['Escala CCO', 'Horas Voadas INVA', 'SAFE MINIONS']
      }
    };
  },

  atualizarResumoAcesso() {
    const origem = document.getElementById('u-origem').value;
    const resumo = document.getElementById('u-access-summary');
    if (!resumo) return;
    resumo.hidden = true;
    if (origem === 'cco') {
      this.atualizarEstadoRbac();
      return;
    }

    const superadmin = document.getElementById('u-superadmin')?.checked;
    document.getElementById('grupo-superadmin')?.classList.toggle('is-active', !!superadmin);
    if (superadmin) {
      document.getElementById('u-access-summary-title').textContent = 'Superadmin';
      document.getElementById('u-access-summary-description').textContent = 'Acesso total ao SAFE Hub, incluindo usuários, grupos, permissões e módulos futuros.';
      document.getElementById('u-access-summary-tags').innerHTML = ['Acesso total', 'Ignora grupos', 'Inclui novas permissões']
        .map(tag => `<span>${this.escape(tag)}</span>`)
        .join('');
      resumo.classList.remove('restricted');
      this.atualizarEstadoRbac();
      return;
    }

    const perfil = document.getElementById('u-perfil').value;
    const dados = this.perfisAcesso()[perfil] || this.perfisAcesso().pac;
    document.getElementById('u-access-summary-title').textContent = dados.titulo;
    document.getElementById('u-access-summary-description').textContent = dados.descricao;
    document.getElementById('u-access-summary-tags').innerHTML = dados.tags
      .map(tag => `<span>${this.escape(tag)}</span>`)
      .join('');
    resumo.classList.toggle('restricted', perfil === 'controle_gastos_visualizacao' || perfil === 'escala_minions');
    this.atualizarEstadoRbac();
  },

  atualizarCamposOrigem() {
    const origem = document.getElementById('u-origem').value;
    const cco = origem === 'cco';
    document.getElementById('campos-cco').hidden = !cco;
    document.getElementById('grupo-perfil-cco').hidden = !cco;
    document.getElementById('grupo-superadmin').hidden = cco;
    document.getElementById('usuario-rbac').hidden = cco;
    document.getElementById('grupo-email-boas-vindas').hidden = !!this.editandoId;
    document.getElementById('acoes-usuario-existente').hidden = !this.editandoId;
    this.atualizarResumoAcesso();
  },

  permissoesDosGruposSelecionados() {
    const cobertas = new Set();
    const grupos = this.controleAcesso.grupos || [];
    this.acessosSelecionados.grupos.forEach(groupId => {
      const grupo = grupos.find(item => String(item.id) === String(groupId));
      (grupo?.permissoes || []).forEach(permissaoId => cobertas.add(String(permissaoId)));
    });
    return cobertas;
  },

  renderSeletoresAcesso() {
    const gruposEl = document.getElementById('u-grupos-acesso');
    const permissoesEl = document.getElementById('u-permissoes-avulsas');
    if (!gruposEl || !permissoesEl) return;

    // Permissões já garantidas pelos grupos selecionados não aparecem como avulsas:
    // elas são redundantes. Também as removemos da seleção avulsa para não salvar duplicado.
    const cobertasPorGrupo = this.permissoesDosGruposSelecionados();
    cobertasPorGrupo.forEach(id => this.acessosSelecionados.permissoes.delete(id));

    const buscaGrupos = document.getElementById('u-busca-grupos')?.value.trim().toLowerCase() || '';
    const buscaPermissoes = document.getElementById('u-busca-permissoes')?.value.trim().toLowerCase() || '';
    const grupos = (this.controleAcesso.grupos || [])
      .filter(grupo => grupo.ativo !== false)
      .filter(grupo => !buscaGrupos || [grupo.nome, grupo.descricao, grupo.id].join(' ').toLowerCase().includes(buscaGrupos));
    const permissoes = (this.controleAcesso.permissoes || [])
      .filter(permissao => !cobertasPorGrupo.has(String(permissao.id)))
      .filter(permissao => !buscaPermissoes || [permissao.modulo, permissao.nome, permissao.id].join(' ').toLowerCase().includes(buscaPermissoes));

    gruposEl.innerHTML = grupos.length
      ? grupos.map(grupo => `
          <label class="usuario-rbac-option">
            <input type="checkbox" data-access-group="${this.escapeAtributo(grupo.id)}" ${this.acessosSelecionados.grupos.has(String(grupo.id)) ? 'checked' : ''}>
            <span>
              <strong>${this.escape(grupo.nome || grupo.id)}</strong>
              <small>${this.escape(grupo.descricao || grupo.id)}</small>
            </span>
          </label>
        `).join('')
      : '<div class="usuario-rbac-empty">Nenhum grupo encontrado.</div>';

    const permissoesPorModulo = permissoes.reduce((acc, permissao) => {
      const modulo = permissao.modulo || 'Outras permissões';
      if (!acc[modulo]) acc[modulo] = [];
      acc[modulo].push(permissao);
      return acc;
    }, {});

    const nota = cobertasPorGrupo.size
      ? `<div class="usuario-rbac-note">${cobertasPorGrupo.size} permissão(ões) já vêm dos grupos selecionados e ficam ocultas aqui. Use avulsas apenas para acessos extras.</div>`
      : '';
    permissoesEl.innerHTML = nota + (Object.keys(permissoesPorModulo).length
      ? Object.keys(permissoesPorModulo).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(modulo => `
          <div class="usuario-rbac-module">
            <div class="usuario-rbac-module-title">${this.escape(modulo)}</div>
            ${permissoesPorModulo[modulo].map(permissao => `
              <label class="usuario-rbac-option compact">
                <input type="checkbox" data-access-permission="${this.escapeAtributo(permissao.id)}" ${this.acessosSelecionados.permissoes.has(String(permissao.id)) ? 'checked' : ''}>
                <span>${this.escape(permissao.nome || permissao.id)}</span>
              </label>
            `).join('')}
          </div>
        `).join('')
      : '<div class="usuario-rbac-empty">Nenhuma permissão avulsa disponível.</div>');

    this.atualizarEstadoRbac();
  },

  atualizarEstadoRbac() {
    const origem = document.getElementById('u-origem')?.value || 'hub';
    const superadmin = document.getElementById('u-superadmin')?.checked;
    const bloqueado = origem === 'cco' || !!superadmin;
    document.getElementById('usuario-rbac')?.classList.toggle('is-disabled', bloqueado);
    document.querySelectorAll('#usuario-rbac input').forEach(input => {
      input.disabled = bloqueado;
    });
    this.atualizarAcessoEfetivo();
  },

  // União das permissões dos grupos selecionados com as avulsas marcadas.
  acessoEfetivoSelecionado() {
    const efetivas = new Set(this.permissoesDosGruposSelecionados());
    this.acessosSelecionados.permissoes.forEach(id => efetivas.add(String(id)));
    return efetivas;
  },

  atualizarAcessoEfetivo() {
    const el = document.getElementById('u-rbac-efetivo');
    if (!el) return;
    const catalogo = this.controleAcesso.permissoes || [];
    const superadmin = document.getElementById('u-superadmin')?.checked;

    if (superadmin) {
      el.innerHTML = `<strong>Acesso efetivo</strong>`
        + `<span class="usuario-rbac-effective-total">Acesso total (superadmin) · ${catalogo.length} permissões</span>`;
      return;
    }

    const efetivas = this.acessoEfetivoSelecionado();
    if (!efetivas.size) {
      el.innerHTML = `<strong>Acesso efetivo</strong>`
        + `<span class="usuario-rbac-effective-empty">Nenhuma permissão — o usuário não verá nenhum módulo.</span>`;
      return;
    }

    const porModulo = {};
    catalogo.forEach(permissao => {
      if (!efetivas.has(String(permissao.id))) return;
      const modulo = permissao.modulo || 'Outros';
      porModulo[modulo] = (porModulo[modulo] || 0) + 1;
    });
    const chips = Object.keys(porModulo)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(modulo => `<span>${this.escape(modulo)} <b>${porModulo[modulo]}</b></span>`)
      .join('');
    el.innerHTML = `<strong>Acesso efetivo · ${efetivas.size} permissão(ões)</strong>`
      + `<div class="usuario-rbac-effective-chips">${chips}</div>`;
  },

  abrirForm(usuario = null) {
    this.editandoId = usuario?.id || null;
    const origem = this.normalizarOrigem(usuario?.origem);

    document.getElementById('modal-u-titulo').textContent = usuario ? 'Editar acesso' : 'Novo acesso';
    document.getElementById('u-origem').value = origem;
    document.getElementById('u-origem').disabled = !!usuario;
    document.getElementById('u-nome').value = usuario?.nome || '';
    document.getElementById('u-pac').value = usuario?.pac || '';
    document.getElementById('u-email').value = usuario?.email || '';
    document.getElementById('u-perfil').value = usuario?.perfil || 'pac';
    document.getElementById('u-role-cco').value = usuario?.roleOrigem || 'user';
    document.getElementById('u-ativo').value = usuario ? String(this.estaAtivo(usuario.ativo)) : 'true';
    document.getElementById('u-superadmin').checked = this.eSuperadminUsuario(usuario);
    document.getElementById('u-enviar-boas-vindas').checked = !usuario;
    this.acessosSelecionados = {
      grupos: new Set((usuario?.grupos || []).map(String)),
      permissoes: new Set((usuario?.permissoesAvulsas || []).map(String))
    };
    document.getElementById('u-iniciais').value = usuario?.initials || '';
    document.getElementById('u-cpf').value = usuario?.cpf || '';
    document.getElementById('u-nascimento').value = usuario?.birthdate || '';
    document.getElementById('u-telefone').value = usuario?.phone || '';
    document.getElementById('u-cor').value = usuario?.color || '#5BAEE2';
    document.getElementById('u-visivel-escala').checked = usuario ? usuario.scheduleVisible !== false : true;

    document.getElementById('u-pac').disabled = !!usuario;
    this.atualizarCamposOrigem();
    this.renderSeletoresAcesso();
    abrirModal('modal-usuario');
  },

  editar(id) {
    const usuario = this.usuarios.find(item => String(item.id) === String(id));
    if (usuario) this.abrirForm(usuario);
  },

  async alternarStatus(id) {
    const usuario = this.usuarios.find(item => String(item.id) === String(id));
    if (!usuario) return;

    const ativo = this.estaAtivo(usuario.ativo);
    const verbo = ativo ? 'desativar' : 'reativar';
    const explicacao = ativo
      ? 'O usuário perderá o acesso, mas vendas, escalas e históricos serão preservados.'
      : 'O usuário voltará a conseguir entrar nos sistemas vinculados.';

    if (!window.confirm(`Deseja ${verbo} o acesso de ${usuario.nome}?\n\n${explicacao}`)) return;

    const res = await API.alterarStatusUsuario(usuario.id, this.normalizarOrigem(usuario.origem), !ativo);

    if (!res.ok) {
      toast(res.error || `Não foi possível ${verbo} o acesso.`, 'error');
      return;
    }

    toast(ativo ? 'Acesso desativado.' : 'Acesso reativado.', 'success');
    usuario.ativo = !ativo;
    this.gravarCacheUsuarios({ usuarios: this.usuarios });
    this.renderResumo();
    this.renderTabela();
  },

  dadosFormularioUsuario() {
    const origem = document.getElementById('u-origem').value;
    const superadmin = origem === 'hub' && document.getElementById('u-superadmin').checked;
    // Superadmin ignora grupos e avulsas no acesso efetivo; enviamos listas vazias
    // para o backend limpar vínculos antigos e não deixar dados mortos gravados.
    return {
      id: this.editandoId,
      origem,
      nome: document.getElementById('u-nome').value.trim(),
      pac: document.getElementById('u-pac').value.trim(),
      email: document.getElementById('u-email').value.trim(),
      perfil: document.getElementById('u-perfil').value,
      roleOrigem: document.getElementById('u-role-cco').value,
      ativo: document.getElementById('u-ativo').value === 'true',
      superadmin,
      grupos: origem === 'hub' ? (superadmin ? [] : Array.from(this.acessosSelecionados.grupos)) : undefined,
      permissoesAvulsas: origem === 'hub' ? (superadmin ? [] : Array.from(this.acessosSelecionados.permissoes)) : undefined,
      initials: document.getElementById('u-iniciais').value.trim().toUpperCase(),
      cpf: document.getElementById('u-cpf').value.replace(/\D/g, ''),
      birthdate: document.getElementById('u-nascimento').value.trim(),
      phone: document.getElementById('u-telefone').value.replace(/\D/g, ''),
      color: document.getElementById('u-cor').value,
      scheduleVisible: document.getElementById('u-visivel-escala').checked
    };
  },

  async reenviarBoasVindas() {
    if (!this.editandoId) return;
    const dados = this.dadosFormularioUsuario();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
      toast('Informe um e-mail válido antes de reenviar.', 'warning');
      return;
    }
    if (dados.cpf.length !== 11) {
      toast('Cadastre um CPF válido antes de reenviar o e-mail.', 'warning');
      return;
    }
    if (!window.confirm('Reenviar o e-mail de boas-vindas para este usuário? A senha atual não será alterada.')) return;

    const btn = document.getElementById('btn-reenviar-boas-vindas');
    btnLoading(btn, true);
    const res = await API.reenviarEmailBoasVindas(dados);
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Não foi possível reenviar o e-mail.', 'error');
      return;
    }
    toast('E-mail de boas-vindas reenviado.', 'success');
    await this.carregar();
  },

  async resetarSenhaPadrao() {
    if (!this.editandoId) return;
    const dados = this.dadosFormularioUsuario();
    if (dados.cpf.length !== 11) {
      toast('Cadastre e salve um CPF válido antes de resetar a senha.', 'warning');
      return;
    }
    if (!window.confirm('Resetar a senha deste usuário para o CPF cadastrado?')) return;

    const btn = document.getElementById('btn-resetar-senha-padrao');
    btnLoading(btn, true);
    const res = await API.resetarSenhaPadraoUsuario(this.editandoId);
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Não foi possível resetar a senha.', 'error');
      return;
    }
    toast('Senha resetada para o CPF cadastrado.', 'success');
  },

  async salvar() {
    const btn = document.getElementById('btn-salvar-usuario');
    const dados = this.dadosFormularioUsuario();
    dados.enviarBoasVindas = !this.editandoId && document.getElementById('u-enviar-boas-vindas').checked;
    const origem = dados.origem;

    if (!dados.nome) {
      toast('Informe o nome completo.', 'warning');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
      toast('Informe um e-mail de acesso válido.', 'warning');
      return;
    }
    if (origem === 'cco' && (!dados.cpf || !dados.birthdate || !dados.initials)) {
      toast('Para o CCO, informe iniciais, CPF e data de nascimento.', 'warning');
      return;
    }
    if (dados.cpf.length !== 11) {
      toast('Informe um CPF válido com 11 dígitos.', 'warning');
      return;
    }

    btnLoading(btn, true);
    const res = this.editandoId
      ? await API.editarUsuario(dados)
      : await API.criarUsuario(dados);
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Erro ao salvar.', 'error');
      return;
    }

    toast(this.editandoId ? 'Acesso atualizado.' : 'Acesso criado.', 'success');
    if (!this.editandoId && res.data?.emailBoasVindasErro) {
      toast(`Acesso criado, mas o e-mail de boas-vindas não foi enviado: ${res.data.emailBoasVindasErro}`, 'warning', 7000);
    } else if (!this.editandoId && res.data?.emailBoasVindasEnviado) {
      toast('E-mail de boas-vindas enviado.', 'success');
    }
    fecharModal('modal-usuario');
    await this.carregar();
  },

  initAlterarSenha() {
    document.getElementById('btn-alterar-senha')?.addEventListener('click', async () => {
      const atual = document.getElementById('senha-atual').value;
      const nova = document.getElementById('senha-nova').value;
      const confirmar = document.getElementById('senha-confirmar').value;

      if (!atual || !nova) return toast('Preencha todos os campos.', 'warning');
      if (nova !== confirmar) return toast('As senhas não coincidem.', 'warning');
      if (nova.length < 6) return toast('A nova senha deve ter pelo menos 6 caracteres.', 'warning');

      const btn = document.getElementById('btn-alterar-senha');
      btnLoading(btn, true);
      const res = await Auth.alterarSenha(atual, nova);
      btnLoading(btn, false);

      if (!res.ok) return toast(res.error || 'Erro ao alterar senha.', 'error');
      toast('Senha alterada com sucesso.', 'success');
      ['senha-atual', 'senha-nova', 'senha-confirmar'].forEach(id => {
        document.getElementById(id).value = '';
      });
    });
  },

  initSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main');
    const overlay = document.getElementById('sidebar-overlay');
    const hamb = document.getElementById('hamburger');

    toggle?.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('sidebar-collapsed');
      toggle.innerHTML = sidebar.classList.contains('collapsed') ? '›' : '‹';
    });
    hamb?.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('active');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
