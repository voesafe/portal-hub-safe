// ============================================================
// bases.js - Consulta e gestao das bases SAFE
// ============================================================

const Bases = {
  itens: [],
  editandoId: null,

  async init() {
    if (!Auth.proteger()) return;
    Auth.preencherUI();
    this.initMenu();
    this.initForm();

    const podeEditar = Auth.podeGerenciarBases();
    document.getElementById('btn-nova-base').hidden = !podeEditar;
    await this.carregar();
  },

  initMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('hamburger');
    hamburger?.addEventListener('click', () => {
      const aberto = sidebar?.classList.toggle('mobile-open');
      overlay?.classList.toggle('active', aberto);
    });
    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('mobile-open');
      overlay?.classList.remove('active');
    });
  },

  initForm() {
    document.getElementById('btn-nova-base')?.addEventListener('click', () => this.abrirForm());
    document.getElementById('btn-salvar-base')?.addEventListener('click', () => this.salvar());
    document.getElementById('base-uf')?.addEventListener('input', event => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
  },

  async carregar() {
    const res = await API.getBases(false);
    if (!res.ok) {
      document.getElementById('bases-grid').innerHTML =
        `<div class="bases-empty">${this.escape(res.error || 'Nao foi possivel carregar as bases.')}</div>`;
      return;
    }
    this.itens = res.data || [];
    this.renderizar();
  },

  escape(valor) {
    const el = document.createElement('div');
    el.textContent = String(valor ?? '');
    return el.innerHTML;
  },

  linkMapa(base) {
    if (/^https?:\/\//i.test(String(base.linkMapa || ''))) return base.linkMapa;
    const endereco = [
      base.endereco,
      base.complemento,
      base.cidade,
      base.uf,
      base.cep
    ].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  },

  renderizar() {
    const grid = document.getElementById('bases-grid');
    if (!this.itens.length) {
      grid.innerHTML = '<div class="bases-empty">Nenhuma base cadastrada.</div>';
      return;
    }

    const podeEditar = Auth.podeGerenciarBases();
    grid.innerHTML = this.itens.map(base => `
      <article class="base-card${base.ativa ? '' : ' inativa'}">
        <div class="base-card-header">
          <h2>${this.escape(base.nome)}</h2>
          <span class="base-status${base.ativa ? '' : ' inativa'}">${base.ativa ? 'Visivel' : 'Oculta'}</span>
        </div>
        <address class="base-address">
          <span>${this.escape(base.endereco)}</span>
          ${base.complemento ? `<span>${this.escape(base.complemento)}</span>` : ''}
          <span>${this.escape(base.cidade)} - ${this.escape(base.uf)}${base.cep ? ` · CEP ${this.escape(base.cep)}` : ''}</span>
        </address>
        <div class="base-contact">
          ${base.email ? `<span>${this.escape(base.email)}</span>` : ''}
          ${base.telefone ? `<span>${this.escape(base.telefone)}</span>` : ''}
        </div>
        <div class="base-card-actions">
          <a class="btn btn-ghost btn-sm" href="${this.escape(this.linkMapa(base))}" target="_blank" rel="noopener noreferrer">Abrir mapa</a>
          ${podeEditar ? `<button class="btn btn-primary btn-sm" type="button" onclick="Bases.editar('${this.escapeAtributo(base.id)}')">Editar</button>` : ''}
        </div>
      </article>
    `).join('');
  },

  escapeAtributo(valor) {
    return String(valor ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  },

  abrirForm(base = null) {
    this.editandoId = base?.id || null;
    document.getElementById('modal-base-titulo').textContent = base ? 'Editar base' : 'Nova base';
    document.getElementById('base-nome').value = base?.nome || '';
    document.getElementById('base-endereco').value = base?.endereco || '';
    document.getElementById('base-complemento').value = base?.complemento || '';
    document.getElementById('base-cidade').value = base?.cidade || '';
    document.getElementById('base-uf').value = base?.uf || '';
    document.getElementById('base-cep').value = base?.cep || '';
    document.getElementById('base-email').value = base?.email || '';
    document.getElementById('base-telefone').value = base?.telefone || '';
    document.getElementById('base-mapa').value = base?.linkMapa || '';
    document.getElementById('base-ordem').value = base?.ordem ?? this.itens.length + 1;
    document.getElementById('base-ativa').checked = base ? base.ativa : true;
    abrirModal('modal-base');
  },

  editar(id) {
    const base = this.itens.find(item => String(item.id) === String(id));
    if (base) this.abrirForm(base);
  },

  async salvar() {
    const dados = {
      id: this.editandoId,
      nome: document.getElementById('base-nome').value.trim(),
      endereco: document.getElementById('base-endereco').value.trim(),
      complemento: document.getElementById('base-complemento').value.trim(),
      cidade: document.getElementById('base-cidade').value.trim(),
      uf: document.getElementById('base-uf').value.trim().toUpperCase(),
      cep: document.getElementById('base-cep').value.trim(),
      email: document.getElementById('base-email').value.trim(),
      telefone: document.getElementById('base-telefone').value.trim(),
      linkMapa: document.getElementById('base-mapa').value.trim(),
      ordem: Number(document.getElementById('base-ordem').value) || 0,
      ativa: document.getElementById('base-ativa').checked
    };

    if (!dados.nome || !dados.endereco || !dados.cidade || dados.uf.length !== 2) {
      toast('Preencha nome, endereco, cidade e uma UF valida.', 'warning');
      return;
    }
    if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
      toast('Informe um e-mail valido.', 'warning');
      return;
    }
    if (dados.linkMapa && !/^https?:\/\//i.test(dados.linkMapa)) {
      toast('O link do mapa deve comecar com http:// ou https://.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-salvar-base');
    btnLoading(btn, true);
    const res = await API.salvarBase(dados);
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Nao foi possivel salvar a base.', 'error');
      return;
    }

    toast(this.editandoId ? 'Base atualizada.' : 'Base criada.', 'success');
    fecharModal('modal-base');
    await this.carregar();
  }
};

document.addEventListener('DOMContentLoaded', () => Bases.init());
