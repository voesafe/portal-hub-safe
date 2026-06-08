// ============================================================
// admin.js - Diretório central de usuários (Master TI)
// SAFE Hub
// ============================================================

const Admin = {
  usuarios: [],
  editandoId: null,

  async init() {
    if (!Auth.protegerGestaoUsuarios()) return;
    Auth.preencherUI();
    this.initSidebar();
    this.initForm();
    this.initFiltros();
    this.initAlterarSenha();
    await this.carregar();
  },

  async carregar() {
    const res = await API.getUsuarios();
    if (!res.ok) {
      toast(res.error || 'Erro ao carregar usuários.', 'error');
      return;
    }

    this.usuarios = res.data?.usuarios || [];
    if (res.data?.aviso) toast(res.data.aviso, 'warning', 6000);
    this.renderResumo();
    this.renderTabela();
  },

  normalizarOrigem(origem) {
    return String(origem || 'hub').trim().toLowerCase();
  },

  labelOrigem(origem) {
    return this.normalizarOrigem(origem) === 'cco' ? 'CCO' : 'Hub';
  },

  labelPerfil(usuario) {
    const perfil = usuario.perfil;
    if (Auth.perfilEhMaster(perfil)) return 'Master TI';
    if (Auth.normalizarPerfil(perfil) === 'financeiro') return 'Financeiro';
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

  estaAtivo(valor) {
    return valor === true || valor === 1 || String(valor).trim().toLowerCase() === 'true';
  },

  usuariosFiltrados() {
    const busca = document.getElementById('filtro-busca')?.value.trim().toLowerCase() || '';
    const origem = document.getElementById('filtro-origem')?.value || '';
    const status = document.getElementById('filtro-status')?.value || '';

    return this.usuarios.filter(usuario => {
      const texto = [
        usuario.nome,
        usuario.pac,
        usuario.email,
        usuario.modulo,
        this.labelPerfil(usuario)
      ].join(' ').toLowerCase();

      if (busca && !texto.includes(busca)) return false;
      if (origem && this.normalizarOrigem(usuario.origem) !== origem) return false;
      if (status && String(this.estaAtivo(usuario.ativo)) !== status) return false;
      return true;
    });
  },

  renderResumo() {
    const total = this.usuarios.length;
    const ativos = this.usuarios.filter(u => this.estaAtivo(u.ativo)).length;
    const hub = this.usuarios.filter(u => this.normalizarOrigem(u.origem) === 'hub').length;
    const cco = this.usuarios.filter(u => this.normalizarOrigem(u.origem) === 'cco').length;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-ativos').textContent = ativos;
    document.getElementById('kpi-hub').textContent = hub;
    document.getElementById('kpi-cco').textContent = cco;
  },

  renderTabela() {
    const tbody = document.getElementById('tabela-usuarios');
    const contador = document.getElementById('usuarios-contagem');
    if (!tbody) return;

    const usuarios = this.usuariosFiltrados();
    if (contador) contador.textContent = `${usuarios.length} de ${this.usuarios.length}`;

    if (!usuarios.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:32px">Nenhum usuário encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = usuarios.map(usuario => {
      const ativo = this.estaAtivo(usuario.ativo);
      const origem = this.normalizarOrigem(usuario.origem);
      return `
        <tr>
          <td class="col-nome" data-label="Usuário">
            <div class="usuario-identidade">
              <span class="usuario-avatar origem-${origem}">${this.iniciais(usuario.nome)}</span>
              <span>
                <strong>${this.escape(usuario.nome || usuario.pac)}</strong>
                <small>${this.escape(usuario.email || 'E-mail não informado')}</small>
              </span>
            </div>
          </td>
          <td class="col-pac" data-label="Login"><span class="usuario-login">${this.escape(usuario.pac)}</span></td>
          <td data-label="Sistema">
            <span class="badge origem-badge origem-${origem}">${this.labelOrigem(origem)}</span>
            <small class="usuario-modulo">${this.escape(usuario.modulo || 'SAFE Hub')}</small>
          </td>
          <td class="col-perfil" data-label="Perfil"><span class="badge ${this.badgePerfil(usuario.perfil)}">${this.labelPerfil(usuario)}</span></td>
          <td class="col-status" data-label="Status"><span class="badge ${ativo ? 'badge-green' : 'badge-red'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td data-label="Criado em">${origem === 'hub' ? this.formatarData(usuario.criadoEm) : 'Sistema externo'}</td>
          <td data-label="Ação">
            <button class="btn btn-ghost btn-sm" onclick="Admin.editar('${this.escapeAtributo(usuario.id)}')">Editar</button>
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
    ['filtro-busca', 'filtro-origem', 'filtro-status'].forEach(id => {
      document.getElementById(id)?.addEventListener(id === 'filtro-busca' ? 'input' : 'change', () => {
        this.renderTabela();
      });
    });
  },

  initForm() {
    document.getElementById('btn-novo-usuario')?.addEventListener('click', () => this.abrirForm());
    document.getElementById('btn-salvar-usuario')?.addEventListener('click', () => this.salvar());
    document.getElementById('u-origem')?.addEventListener('change', () => this.atualizarCamposOrigem());
  },

  atualizarCamposOrigem() {
    const origem = document.getElementById('u-origem').value;
    const cco = origem === 'cco';
    document.getElementById('campos-cco').hidden = !cco;
    document.getElementById('grupo-perfil-hub').hidden = cco;
    document.getElementById('grupo-perfil-cco').hidden = !cco;
    document.getElementById('u-identificador-label').textContent = cco
      ? 'Usuário de login'
      : 'PAC (identificador de login)';
    document.getElementById('u-senha-label').textContent = this.editandoId
      ? 'Nova senha (opcional)'
      : (cco ? 'Senha inicial' : 'Senha inicial (opcional)');
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
    document.getElementById('u-senha').value = '';
    document.getElementById('u-iniciais').value = usuario?.initials || '';
    document.getElementById('u-cpf').value = usuario?.cpf || '';
    document.getElementById('u-nascimento').value = usuario?.birthdate || '';
    document.getElementById('u-telefone').value = usuario?.phone || '';
    document.getElementById('u-cor').value = usuario?.color || '#5BAEE2';
    document.getElementById('u-visivel-escala').checked = usuario ? usuario.scheduleVisible !== false : true;

    document.getElementById('u-pac').disabled = !!usuario;
    this.atualizarCamposOrigem();
    abrirModal('modal-usuario');
  },

  editar(id) {
    const usuario = this.usuarios.find(item => String(item.id) === String(id));
    if (usuario) this.abrirForm(usuario);
  },

  async salvar() {
    const btn = document.getElementById('btn-salvar-usuario');
    const origem = document.getElementById('u-origem').value;
    const dados = {
      id: this.editandoId,
      origem,
      nome: document.getElementById('u-nome').value.trim(),
      pac: document.getElementById('u-pac').value.trim(),
      email: document.getElementById('u-email').value.trim(),
      perfil: document.getElementById('u-perfil').value,
      roleOrigem: document.getElementById('u-role-cco').value,
      ativo: document.getElementById('u-ativo').value === 'true',
      senha: document.getElementById('u-senha').value || undefined,
      initials: document.getElementById('u-iniciais').value.trim().toUpperCase(),
      cpf: document.getElementById('u-cpf').value.replace(/\D/g, ''),
      birthdate: document.getElementById('u-nascimento').value.trim(),
      phone: document.getElementById('u-telefone').value.replace(/\D/g, ''),
      color: document.getElementById('u-cor').value,
      scheduleVisible: document.getElementById('u-visivel-escala').checked
    };

    if (!dados.nome || !dados.pac) {
      toast('Nome e identificador de login são obrigatórios.', 'warning');
      return;
    }
    if (origem === 'cco' && (!dados.cpf || !dados.birthdate || !dados.initials)) {
      toast('Para o CCO, informe iniciais, CPF e data de nascimento.', 'warning');
      return;
    }
    if (origem === 'cco' && !this.editandoId && !dados.senha) {
      toast('Informe a senha inicial do usuário CCO.', 'warning');
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
