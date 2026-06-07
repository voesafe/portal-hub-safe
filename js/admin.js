// ============================================================
// admin.js — Gestão de usuários (só admin)
// SAFE Hub
// ============================================================

const Admin = {

  usuarios:   [],
  editandoId: null,

  async init() {
    if (!Auth.proteger(true)) return;
    Auth.preencherUI();
    this.initSidebar();
    this.initForm();
    this.initAlterarSenha();
    await this.carregar();
  },

  async carregar() {
    const res = await API.getUsuarios();
    if (!res.ok) { toast(res.error || 'Erro ao carregar usuários.', 'error'); return; }
    this.usuarios = res.data || [];
    this.renderTabela();
  },

  labelPerfil(perfil) {
    if (Auth.perfilEhMaster(perfil)) return 'Master TI';
    if (Auth.normalizarPerfil(perfil) === 'financeiro') return 'Financeiro';
    if (Auth.perfilSomenteLeitura(perfil)) return 'Admin leitura';
    if (Auth.perfilEhAdmin(perfil)) return 'Admin';
    return 'Consultor';
  },

  badgePerfil(perfil) {
    if (Auth.perfilEhMaster(perfil)) return 'badge-blue';
    if (Auth.normalizarPerfil(perfil) === 'financeiro') return 'badge-teal';
    if (Auth.perfilSomenteLeitura(perfil)) return 'badge-orange';
    return Auth.perfilEhAdmin(perfil) ? 'badge-navy' : 'badge-teal';
  },

  estaAtivo(valor) {
    return valor === true || valor === 1 || String(valor).trim().toLowerCase() === 'true';
  },

  renderTabela() {
    const tbody = document.getElementById('tabela-usuarios');
    if (!tbody) return;

    if (!this.usuarios.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:32px">Nenhum usuário</td></tr>';
      return;
    }

    tbody.innerHTML = this.usuarios.map(u => {
      const ativo = this.estaAtivo(u.ativo);
      return `
      <tr>
        <td class="col-nome" data-label="Nome" style="font-weight:600">${u.nome}</td>
        <td class="col-pac" data-label="PAC"><span class="badge badge-blue">${u.pac}</span></td>
        <td class="col-email" data-label="E-mail" style="color:var(--gray-500);font-size:.85rem">${u.email || '—'}</td>
        <td class="col-perfil" data-label="Perfil"><span class="badge ${this.badgePerfil(u.perfil)}">${this.labelPerfil(u.perfil)}</span></td>
        <td class="col-status" data-label="Status"><span class="badge ${ativo ? 'badge-green' : 'badge-red'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td data-label="Ação">
          ${Auth.podeEditar() ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="Admin.editar('${u.id}')" title="Editar">✎</button>` : ''}
        </td>
      </tr>
    `;
    }).join('');
  },

  initForm() {
    document.getElementById('btn-novo-usuario')?.addEventListener('click', () => {
      this.abrirForm();
    });

    document.getElementById('btn-salvar-usuario')?.addEventListener('click', () => {
      this.salvar();
    });
  },

  abrirForm(usuario = null) {
    this.editandoId = usuario ? usuario.id : null;
    document.getElementById('modal-u-titulo').textContent = usuario ? 'Editar Usuário' : 'Novo Usuário';

    document.getElementById('u-nome').value   = usuario?.nome   || '';
    document.getElementById('u-pac').value    = usuario?.pac    || '';
    document.getElementById('u-email').value  = usuario?.email  || '';
    document.getElementById('u-perfil').value = usuario?.perfil || 'pac';
    document.getElementById('u-ativo').value  = usuario ? String(usuario.ativo) : 'true';
    document.getElementById('u-senha').value  = '';

    // Trava PAC se editando (evita mudar o identificador de login)
    document.getElementById('u-pac').disabled = !!usuario;

    abrirModal('modal-usuario');
  },

  editar(id) {
    const u = this.usuarios.find(u => u.id === id);
    if (u) this.abrirForm(u);
  },

  async salvar() {
    const btn = document.getElementById('btn-salvar-usuario');
    btnLoading(btn, true);

    const dados = {
      id:     this.editandoId,
      nome:   document.getElementById('u-nome').value.trim(),
      pac:    document.getElementById('u-pac').value.trim(),
      email:  document.getElementById('u-email').value.trim(),
      perfil: document.getElementById('u-perfil').value,
      ativo:  document.getElementById('u-ativo').value === 'true',
      senha:  document.getElementById('u-senha').value || undefined
    };

    if (!dados.nome || !dados.pac) {
      toast('Nome e PAC são obrigatórios.', 'warning');
      btnLoading(btn, false);
      return;
    }

    const res = this.editandoId
      ? await API.editarUsuario(dados)
      : await API.criarUsuario(dados);

    btnLoading(btn, false);

    if (res.ok) {
      toast(this.editandoId ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
      fecharModal('modal-usuario');
      await this.carregar();
    } else {
      toast(res.error || 'Erro ao salvar.', 'error');
    }
  },

  initAlterarSenha() {
    document.getElementById('btn-alterar-senha')?.addEventListener('click', async () => {
      const atual     = document.getElementById('senha-atual').value;
      const nova      = document.getElementById('senha-nova').value;
      const confirmar = document.getElementById('senha-confirmar').value;

      if (!atual || !nova) { toast('Preencha todos os campos.', 'warning'); return; }
      if (nova !== confirmar) { toast('As senhas não coincidem.', 'warning'); return; }
      if (nova.length < 6) { toast('A nova senha deve ter pelo menos 6 caracteres.', 'warning'); return; }

      const btn = document.getElementById('btn-alterar-senha');
      btnLoading(btn, true);

      const res = await Auth.alterarSenha(atual, nova);

      btnLoading(btn, false);

      if (res.ok) {
        toast('Senha alterada com sucesso!', 'success');
        document.getElementById('senha-atual').value = '';
        document.getElementById('senha-nova').value = '';
        document.getElementById('senha-confirmar').value = '';
      } else {
        toast(res.error || 'Erro ao alterar senha.', 'error');
      }
    });
  },

  initSidebar() {
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('main');
    const overlay = document.getElementById('sidebar-overlay');
    const hamb    = document.getElementById('hamburger');

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
