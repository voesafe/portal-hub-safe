// ============================================================
// concorrencia.js — Comparativo de mercado SAFE
// ============================================================

const Concorrencia = {

  dados: [],          // registros de concorrentes
  precosSafe: [],     // preços SAFE por curso
  filtroCurso: '',
  editandoId: null,
  editandoPrecoSafe: false,

  async init() {
    if (!Auth.proteger(true)) return;
    Auth.preencherUI();
    this.initFiltros();
    this.initForm();
    this.initFormPrecoSafe();
    this._inicializarMascaras();
    this.initSidebar();
    await this.carregar();
  },

  async carregar() {
    this.setLoading(true);

    const [resConcorrencia, resPrecos] = await Promise.all([
      API.getConcorrencia(),
      API.getPrecosSafe()
    ]);

    if (!resConcorrencia.ok) {
      toast(resConcorrencia.error || 'Erro ao carregar dados.', 'error');
    } else {
      this.dados = resConcorrencia.data || [];
    }

    if (resPrecos.ok) {
      this.precosSafe = resPrecos.data || [];
    }

    this.renderComparativo();
    this.setLoading(false);
  },

  // ── Filtros ────────────────────────────────────────────────

  initFiltros() {
    const selCurso = document.getElementById('filtro-curso');
    if (!selCurso) return;

    // Preenche o filtro com os cursos do config
    selCurso.innerHTML = '<option value="">Todos os cursos</option>';
    CONFIG.CURSOS.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      selCurso.appendChild(opt);
    });

    selCurso.addEventListener('change', () => {
      this.filtroCurso = selCurso.value;
      this.renderComparativo();
    });
  },

  // ── Render principal ───────────────────────────────────────

  renderComparativo() {
    const container = document.getElementById('comparativo-container');
    if (!container) return;

    const cursosFiltrados = this.filtroCurso
      ? CONFIG.CURSOS.filter(c => c === this.filtroCurso)
      : CONFIG.CURSOS;

    // Só mostra cursos que têm preço SAFE cadastrado OU concorrentes registradas
    const cursosAtivos = cursosFiltrados.filter(curso => {
      const temPreco      = this.precosSafe.some(p => p.curso === curso);
      const temConcorrente = this.dados.some(d => d.curso === curso);
      return temPreco || temConcorrente;
    });

    // Se nenhum curso com dados, mostra empty state
    if (!cursosAtivos.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:64px 24px">
          <div class="icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3">
              <circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>
            </svg>
          </div>
          <p>${this.filtroCurso ? 'Nenhum dado cadastrado para este curso.' : 'Nenhum dado cadastrado ainda.'}</p>
          <p style="font-size:.8rem;margin-top:6px;color:var(--gray-300)">
            Cadastre os preços SAFE e registre concorrentes para ver o comparativo.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = cursosAtivos.map(curso => this._renderBlocoCurso(curso)).join('');

    // Eventos de editar/excluir concorrentes
    container.querySelectorAll('[data-editar-concorrente]').forEach(btn => {
      btn.addEventListener('click', () => this.abrirFormConcorrente(btn.dataset.editarConcorrente));
    });
    container.querySelectorAll('[data-excluir-concorrente]').forEach(btn => {
      btn.addEventListener('click', () => this.confirmarExcluir(btn.dataset.excluirConcorrente, btn.dataset.nome));
    });
    container.querySelectorAll('[data-editar-preco-safe]').forEach(btn => {
      btn.addEventListener('click', () => this.abrirFormPrecoSafe(btn.dataset.editarPrecoSafe));
    });
  },

  _renderBlocoCurso(curso) {
    const precoSafe = this.precosSafe.find(p => p.curso === curso);
    const concorrentes = this.dados.filter(d => d.curso === curso);
    const podeEditar = Auth.podeEditar();
    const eAdmin = Auth.eAdmin();

    const badgeSafe = `<span class="badge badge-teal" style="font-size:.65rem">SAFE</span>`;

    // Bloco de preço SAFE
    const blocoSafe = precoSafe
      ? `
        <div class="conc-safe-row">
          <div class="conc-escola">
            <div class="conc-escola-nome">${badgeSafe} SAFE Escola de Aviação</div>
            ${precoSafe.aeronave ? `<div class="conc-aeronave">${precoSafe.aeronave}</div>` : ''}
          </div>
          <div class="conc-valor avista">${formatBRL(precoSafe.valorAvista)}<span class="conc-label">à vista</span></div>
          <div class="conc-valor parcelado">
            ${precoSafe.valorParcelado ? `${formatBRL(precoSafe.valorParcelado)}<span class="conc-label">${precoSafe.parcelas}x</span>` : '<span class="text-muted">—</span>'}
          </div>
          <div class="conc-aeronave-col">—</div>
          <div class="conc-obs">—</div>
          <div class="conc-acoes">
            ${eAdmin ? `
              <button class="btn btn-ghost btn-sm btn-icon" data-editar-preco-safe="${curso}" title="Editar preço SAFE">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>` : ''}
          </div>
        </div>
      `
      : eAdmin ? `
        <div class="conc-safe-vazio">
          <span>Preço SAFE não cadastrado para este curso</span>
          <button class="btn btn-teal btn-sm" data-editar-preco-safe="${curso}">
            + Cadastrar preço SAFE
          </button>
        </div>
      ` : `<div class="conc-safe-vazio"><span>Preço SAFE não cadastrado</span></div>`;

    // Linhas de concorrentes
    const linhasConcorrentes = concorrentes.length
      ? concorrentes.map(c => `
        <div class="conc-row">
          <div class="conc-escola">
            <div class="conc-escola-nome">${escapeHtml(c.concorrente || '—')}</div>
            ${c.cadastradoPor ? `<div class="conc-by">por ${escapeHtml(c.cadastradoPor)}</div>` : ''}
          </div>
          <div class="conc-valor avista">
            ${c.valorAvista ? formatBRL(c.valorAvista) : '<span class="text-muted">—</span>'}
            <span class="conc-label">à vista</span>
          </div>
          <div class="conc-valor parcelado">
            ${c.valorParcelado ? `${formatBRL(c.valorParcelado)}<span class="conc-label">${c.parcelas ? c.parcelas + 'x' : ''}</span>` : '<span class="text-muted">—</span>'}
          </div>
          <div class="conc-aeronave-col">${escapeHtml(c.aeronave || '—')}</div>
          <div class="conc-obs" title="${escapeHtml(c.obs || '')}">${c.obs ? `<span class="conc-obs-text">${escapeHtml(c.obs)}</span>` : '—'}</div>
          <div class="conc-acoes">
            ${podeEditar ? `
              <button class="btn btn-ghost btn-sm btn-icon" data-editar-concorrente="${c.id}" title="Editar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>` : ''}
            ${Auth.eAdminCompleto() ? `
              <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--danger)" data-excluir-concorrente="${c.id}" data-nome="${escapeHtml(c.concorrente)}" title="Excluir">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>` : ''}
          </div>
        </div>
      `).join('')
      : `<div class="conc-vazio-curso">Nenhuma concorrente cadastrada para este curso.</div>`;

    return `
      <div class="conc-bloco">
        <div class="conc-bloco-header">
          <h3 class="conc-curso-titulo">${curso}</h3>
          <span class="conc-count">${concorrentes.length} concorrente${concorrentes.length !== 1 ? 's' : ''}</span>
        </div>

        <div class="conc-tabela">
          <div class="conc-thead">
            <div class="conc-escola">Escola</div>
            <div class="conc-valor">Valor à Vista</div>
            <div class="conc-valor">Valor Parcelado</div>
            <div class="conc-aeronave-col">Aeronave</div>
            <div class="conc-obs">Observações</div>
            <div class="conc-acoes"></div>
          </div>
          ${blocoSafe}
          <div class="conc-separador"></div>
          ${linhasConcorrentes}
        </div>
      </div>
    `;
  },

  // ── Formulário concorrente ─────────────────────────────────

  initForm() {
    document.getElementById('btn-nova-concorrente')?.addEventListener('click', () => {
      this.abrirFormConcorrente(null);
    });
    document.getElementById('modal-conc-close')?.addEventListener('click', () => fecharModal('modal-concorrente'));
    document.getElementById('modal-conc-cancelar')?.addEventListener('click', () => fecharModal('modal-concorrente'));
    document.getElementById('btn-conc-salvar')?.addEventListener('click', () => this.salvarConcorrente());

    // Preenche dropdown de cursos no form
    const selCurso = document.getElementById('fc-curso');
    if (selCurso) {
      selCurso.innerHTML = '<option value="" disabled selected>Selecione o curso</option>';
      CONFIG.CURSOS.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        selCurso.appendChild(opt);
      });
    }
  },

  abrirFormConcorrente(id) {
    this.editandoId = id || null;
    const titulo = document.getElementById('modal-conc-titulo');
    if (titulo) titulo.textContent = id ? 'Editar Concorrente' : 'Nova Concorrente';

    const campos = ['fc-concorrente','fc-curso','fc-valor-avista','fc-valor-parcelado','fc-parcelas','fc-aeronave','fc-obs'];

    if (id) {
      const reg = this.dados.find(d => d.id === id);
      if (!reg) return;
      document.getElementById('fc-concorrente').value    = reg.concorrente    || '';
      document.getElementById('fc-curso').value          = reg.curso          || '';
      this._setValorMoeda('fc-valor-avista',   reg.valorAvista);
      this._setValorMoeda('fc-valor-parcelado', reg.valorParcelado);
      document.getElementById('fc-parcelas').value       = reg.parcelas       || '';
      document.getElementById('fc-aeronave').value       = reg.aeronave       || '';
      document.getElementById('fc-obs').value            = reg.obs            || '';
    } else {
      campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      // Pré-seleciona o filtro ativo se houver
      if (this.filtroCurso) {
        const sel = document.getElementById('fc-curso');
        if (sel) sel.value = this.filtroCurso;
      }
    }

    abrirModal('modal-concorrente');
    document.getElementById('fc-concorrente')?.focus();
  },

  async salvarConcorrente() {
    const btn = document.getElementById('btn-conc-salvar');
    const dados = {
      id:             this.editandoId,
      concorrente:    document.getElementById('fc-concorrente')?.value.trim(),
      curso:          document.getElementById('fc-curso')?.value,
      valorAvista:    this._parseBRL(document.getElementById('fc-valor-avista')?.value),
      valorParcelado: this._parseBRL(document.getElementById('fc-valor-parcelado')?.value),
      parcelas:       Number(document.getElementById('fc-parcelas')?.value) || 0,
      aeronave:       document.getElementById('fc-aeronave')?.value.trim(),
      obs:            document.getElementById('fc-obs')?.value.trim()
    };

    if (!dados.concorrente) { toast('Nome da concorrente é obrigatório.', 'warning'); return; }
    if (!dados.curso)        { toast('Selecione o curso.', 'warning'); return; }
    if (!dados.valorAvista)  { toast('Valor à vista é obrigatório.', 'warning'); return; }

    const editando = this.editandoId;

    if (editando) {
      // Edição otimista: aplica na tela e fecha o modal na hora; reverte se falhar.
      const alvo = this.dados.find(c => String(c.id) === String(editando));
      const snapshot = alvo ? { ...alvo } : null;
      if (alvo) { Object.assign(alvo, dados); this.renderComparativo(); }
      fecharModal('modal-concorrente');
      toast('Concorrente atualizada!', 'success');

      const res = await API.editarConcorrente(dados);
      if (!res.ok) {
        if (alvo && snapshot) { Object.assign(alvo, snapshot); this.renderComparativo(); }
        toast(res.error || 'Erro ao salvar. A alteração foi desfeita.', 'error');
      }
      return;
    }

    // Criar: o servidor gera o ID → fecha o modal e recarrega em segundo plano.
    btnLoading(btn, true);
    const res = await API.criarConcorrente(dados);
    btnLoading(btn, false);

    if (res.ok) {
      toast('Concorrente cadastrada!', 'success');
      fecharModal('modal-concorrente');
      this.carregar();
    } else {
      toast(res.error || 'Erro ao salvar.', 'error');
    }
  },

  // ── Formulário Preço SAFE ──────────────────────────────────

  initFormPrecoSafe() {
    document.getElementById('modal-safe-close')?.addEventListener('click', () => fecharModal('modal-preco-safe'));
    document.getElementById('modal-safe-cancelar')?.addEventListener('click', () => fecharModal('modal-preco-safe'));
    document.getElementById('btn-safe-salvar')?.addEventListener('click', () => this.salvarPrecoSafe());
  },

  abrirFormPrecoSafe(curso) {
    const titulo = document.getElementById('modal-safe-titulo');
    if (titulo) titulo.textContent = `Preço SAFE — ${curso}`;

    document.getElementById('fs-curso-display').textContent = curso;
    document.getElementById('fs-curso').value = curso;

    const existente = this.precosSafe.find(p => p.curso === curso);
    this._setValorMoeda('fs-valor-avista',    existente?.valorAvista);
    this._setValorMoeda('fs-valor-parcelado', existente?.valorParcelado);
    document.getElementById('fs-parcelas').value        = existente?.parcelas       || '';

    abrirModal('modal-preco-safe');
    document.getElementById('fs-valor-avista')?.focus();
  },

  async salvarPrecoSafe() {
    const btn = document.getElementById('btn-safe-salvar');
    const dados = {
      curso:          document.getElementById('fs-curso')?.value,
      valorAvista:    this._parseBRL(document.getElementById('fs-valor-avista')?.value),
      valorParcelado: this._parseBRL(document.getElementById('fs-valor-parcelado')?.value),
      parcelas:       Number(document.getElementById('fs-parcelas')?.value) || 0
    };

    if (!dados.valorAvista) { toast('Valor à vista é obrigatório.', 'warning'); return; }

    // Otimista: atualiza o preço SAFE localmente e reverte se o backend falhar.
    const anterior = this.precosSafe.map(p => ({ ...p }));
    const existente = this.precosSafe.find(p => p.curso === dados.curso);
    if (existente) Object.assign(existente, dados);
    else this.precosSafe.push({ ...dados });
    this.renderComparativo();
    fecharModal('modal-preco-safe');
    toast('Preço SAFE atualizado!', 'success');

    const res = await API.salvarPrecoSafe(dados);
    if (!res.ok) {
      this.precosSafe = anterior;
      this.renderComparativo();
      toast(res.error || 'Erro ao salvar. A alteração foi desfeita.', 'error');
    }
  },

  // ── Confirmação de exclusão ────────────────────────────────

  confirmarExcluir(id, nome) {
    const existing = document.getElementById('modal-excluir-conc');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modal-excluir-conc';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h3 style="font-size:1rem">Excluir concorrente</h3>
          <button class="modal-close" id="exc-fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" style="padding-top:12px;padding-bottom:8px">
          <p style="font-size:.9rem;color:var(--gray-500)">
            Tem certeza que deseja excluir <strong style="color:var(--navy)">${nome || 'esta concorrente'}</strong>?
            Esta ação não pode ser desfeita.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" id="exc-cancelar">Cancelar</button>
          <button class="btn btn-danger btn-sm" id="exc-confirmar">Excluir</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const fechar = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 250); };
    overlay.querySelector('#exc-fechar').addEventListener('click', fechar);
    overlay.querySelector('#exc-cancelar').addEventListener('click', fechar);
    overlay.querySelector('#exc-confirmar').addEventListener('click', async () => {
      // Otimista: remove na hora, fecha o modal e restaura se o backend falhar.
      const idx = this.dados.findIndex(c => String(c.id) === String(id));
      const removido = idx !== -1 ? this.dados[idx] : null;
      if (idx !== -1) { this.dados.splice(idx, 1); this.renderComparativo(); }
      fechar();

      const res = await API.excluirConcorrente(id);
      if (res.ok) {
        toast('Concorrente excluída.', 'success');
      } else {
        if (removido) { this.dados.splice(idx, 0, removido); this.renderComparativo(); }
        toast(res.error || 'Erro ao excluir. A exclusão foi desfeita.', 'error');
      }
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
  },

  // ── Utils ──────────────────────────────────────────────────

  // Aplica máscara de moeda BRL em um input
  _aplicarMascaraMoeda(input) {
    if (!input) return;
    const formatar = (val) => {
      let nums = val.replace(/\D/g, '');
      if (!nums) return '';
      const num = parseInt(nums, 10) / 100;
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    input.addEventListener('input', () => {
      const antes = input.value.length;
      input.value = formatar(input.value);
    });
    input.addEventListener('blur', () => {
      if (input.value === 'R$\u00a00,00' || input.value === 'R$ 0,00') input.value = '';
    });
  },

  _inicializarMascaras() {
    ['fc-valor-avista','fc-valor-parcelado','fs-valor-avista','fs-valor-parcelado'].forEach(id => {
      this._aplicarMascaraMoeda(document.getElementById(id));
    });
  },

  _setValorMoeda(id, numero) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!numero) { el.value = ''; return; }
    el.value = Number(numero).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  _parseBRL(valor) {
    if (!valor) return 0;
    const limpo = String(valor).replace(/[R$\s\u00a0]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
  },

  setLoading(on) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = on ? 'flex' : 'none';
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

document.addEventListener('DOMContentLoaded', () => Concorrencia.init());
