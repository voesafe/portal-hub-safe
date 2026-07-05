// ============================================================
// access-control.js - Grupos e permissoes do SAFE Hub
// ============================================================

const AccessControl = {
  grupos: [],
  permissoes: [],
  editandoId: null,

  async init() {
    if (!Auth.protegerControleAcesso()) return;
    Auth.preencherUI();
    this.inicializarMenuMobile();
    this.vincularEventos();
    await this.carregar();
  },

  inicializarMenuMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    const definirAberto = aberto => {
      document.body.classList.toggle('access-menu-open', aberto);
      sidebar.classList.toggle('mobile-open', aberto);
      overlay?.classList.toggle('active', aberto);
      document.getElementById('hamburger')?.setAttribute('aria-expanded', String(aberto));
    };

    const fechar = event => {
      event?.preventDefault?.();
      sidebar.classList.remove('mobile-open');
      overlay?.classList.remove('active');
      document.body.classList.remove('access-menu-open');
      document.getElementById('hamburger')?.setAttribute('aria-expanded', 'false');
    };

    document.addEventListener('click', event => {
      if (!event.target.closest('#hamburger')) return;
      event.preventDefault();
      event.stopPropagation();
      definirAberto(!document.body.classList.contains('access-menu-open'));
    }, true);
    overlay?.addEventListener('click', fechar);
  },

  vincularEventos() {
    document.getElementById('btn-novo-grupo')?.addEventListener('click', () => this.abrirGrupo());
    document.getElementById('btn-salvar-grupo')?.addEventListener('click', () => this.salvarGrupo());
    document.getElementById('btn-limpar-permissoes')?.addEventListener('click', () => {
      document.querySelectorAll('#grupo-permissoes input[type="checkbox"]').forEach(input => {
        input.checked = false;
      });
    });
    document.getElementById('grupo-busca')?.addEventListener('input', () => this.renderGrupos());
    document.getElementById('grupo-nome')?.addEventListener('input', () => {
      if (this.editandoId) return;
      const id = this.slug(document.getElementById('grupo-nome').value);
      document.getElementById('grupo-id').value = id;
    });
  },

  async carregar() {
    const res = await API.getControleAcesso();
    if (!res.ok) {
      this.renderErroBackend(res.error || 'Erro ao carregar controle de acesso.');
      toast(res.error || 'Erro ao carregar controle de acesso.', 'error');
      return;
    }
    this.grupos = res.data?.grupos || [];
    this.permissoes = res.data?.permissoes || [];
    this.renderResumo();
    this.renderGrupos();
    this.renderCatalogo();
  },

  renderErroBackend(mensagem) {
    const texto = /Ação desconhecida:\s*access-control/i.test(String(mensagem || ''))
      ? 'O frontend já está atualizado, mas o Apps Script publicado ainda não possui a rota de Controle de Acesso. Publique a nova versão do backend para carregar grupos e permissões.'
      : mensagem;
    document.getElementById('access-kpi-grupos').textContent = '0';
    document.getElementById('access-kpi-permissoes').textContent = '0';
    document.getElementById('access-kpi-usuarios').textContent = '0';
    document.getElementById('access-groups').innerHTML = `<div class="access-empty">${this.escape(texto)}</div>`;
    document.getElementById('access-permission-list').innerHTML = `<div class="access-empty">${this.escape(texto)}</div>`;
  },

  renderResumo() {
    document.getElementById('access-kpi-grupos').textContent =
      this.grupos.filter(grupo => grupo.ativo).length;
    document.getElementById('access-kpi-permissoes').textContent = this.permissoes.length;
    document.getElementById('access-kpi-usuarios').textContent =
      this.grupos.reduce((soma, grupo) => soma + (Number(grupo.quantidadeUsuarios) || 0), 0);
  },

  renderGrupos() {
    const container = document.getElementById('access-groups');
    const busca = String(document.getElementById('grupo-busca')?.value || '').trim().toLowerCase();
    const grupos = this.grupos.filter(grupo => {
      if (!busca) return true;
      return [grupo.nome, grupo.descricao, grupo.id].join(' ').toLowerCase().includes(busca);
    });

    if (!grupos.length) {
      container.innerHTML = '<div class="access-empty">Nenhum grupo encontrado.</div>';
      return;
    }

    container.innerHTML = grupos.map(grupo => `
      <article class="access-group-card">
        <div>
          <h3>${this.escape(grupo.nome)}</h3>
          <p>${this.escape(grupo.descricao || 'Sem descrição.')}</p>
          <div class="access-group-meta">
            <span class="access-pill ${grupo.ativo ? '' : 'inactive'}">${grupo.ativo ? 'Ativo' : 'Inativo'}</span>
            <span class="access-pill muted">${Number(grupo.quantidadeUsuarios) || 0} usuário(s)</span>
            <span class="access-pill muted">${Number(grupo.quantidadePermissoes) || 0} permissão(ões)</span>
            ${grupo.sistema ? '<span class="access-pill muted">Padrão</span>' : ''}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" onclick="AccessControl.editarGrupo('${this.escapeAtributo(grupo.id)}')">Editar</button>
      </article>
    `).join('');
  },

  renderCatalogo() {
    const container = document.getElementById('access-permission-list');
    const porModulo = this.permissoesPorModulo();
    container.innerHTML = Object.keys(porModulo).map(modulo => `
      <section class="access-module">
        <h3>${this.escape(modulo)}</h3>
        <ul>
          ${porModulo[modulo].map(permissao => `<li>${this.escape(permissao.nome)}</li>`).join('')}
        </ul>
      </section>
    `).join('');
  },

  renderEditorPermissoes(permissoesSelecionadas = []) {
    const container = document.getElementById('grupo-permissoes');
    const selecionadas = new Set(permissoesSelecionadas);
    const porModulo = this.permissoesPorModulo();
    container.innerHTML = `
      <div class="access-editor-grid">
        ${Object.keys(porModulo).map(modulo => `
          <section class="access-module">
            <h3>${this.escape(modulo)}</h3>
            <div class="access-permission-checks">
              ${porModulo[modulo].map(permissao => `
                <label>
                  <input type="checkbox" value="${this.escapeAtributo(permissao.id)}" ${selecionadas.has(permissao.id) ? 'checked' : ''}>
                  <span>${this.escape(permissao.nome)}</span>
                </label>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    `;
  },

  permissoesPorModulo() {
    return this.permissoes.reduce((mapa, permissao) => {
      const modulo = permissao.modulo || 'Outros';
      if (!mapa[modulo]) mapa[modulo] = [];
      mapa[modulo].push(permissao);
      return mapa;
    }, {});
  },

  abrirGrupo(grupo = null) {
    this.editandoId = grupo?.id || null;
    document.getElementById('modal-grupo-titulo').textContent = grupo ? 'Editar grupo' : 'Novo grupo';
    document.getElementById('grupo-nome').value = grupo?.nome || '';
    document.getElementById('grupo-id').value = grupo?.id || '';
    document.getElementById('grupo-id').disabled = !!grupo;
    document.getElementById('grupo-descricao').value = grupo?.descricao || '';
    document.getElementById('grupo-ativo').checked = grupo ? grupo.ativo !== false : true;
    this.renderEditorPermissoes(grupo?.permissoes || []);
    abrirModal('modal-grupo');
  },

  editarGrupo(id) {
    const grupo = this.grupos.find(item => String(item.id) === String(id));
    if (grupo) this.abrirGrupo(grupo);
  },

  async salvarGrupo() {
    const btn = document.getElementById('btn-salvar-grupo');
    const permissoes = Array.from(document.querySelectorAll('#grupo-permissoes input[type="checkbox"]:checked'))
      .map(input => input.value);
    const dados = {
      id: document.getElementById('grupo-id').value.trim(),
      nome: document.getElementById('grupo-nome').value.trim(),
      descricao: document.getElementById('grupo-descricao').value.trim(),
      ativo: document.getElementById('grupo-ativo').checked,
      permissoes
    };

    if (!dados.nome) {
      toast('Informe o nome do grupo.', 'warning');
      return;
    }

    btnLoading(btn, true);
    const res = await API.salvarGrupoAcesso(dados);
    btnLoading(btn, false);
    if (!res.ok) {
      toast(res.error || 'Erro ao salvar grupo.', 'error');
      return;
    }
    toast('Grupo salvo.', 'success');
    fecharModal('modal-grupo');
    this.grupos = res.data?.grupos || [];
    this.permissoes = res.data?.permissoes || this.permissoes;
    this.renderResumo();
    this.renderGrupos();
    this.renderCatalogo();
  },

  slug(valor) {
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  },

  escape(valor) {
    const el = document.createElement('div');
    el.textContent = String(valor ?? '');
    return el.innerHTML;
  },

  escapeAtributo(valor) {
    return String(valor ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
};

document.addEventListener('DOMContentLoaded', () => AccessControl.init());
