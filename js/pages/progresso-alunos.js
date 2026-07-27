// ============================================================
// progresso-alunos.js — Progresso de Alunos (Newzenler)
// SAFE Hub
// ============================================================

const ProgressoAlunos = {

  // ── Estado ────────────────────────────────────────────────
  _paginaAtual:  1,
  _totalPaginas: 1,
  _totalItems:   0,
  _statusFiltro: '',
  _todosDaPagina: [],

  async init() {
    if (!Auth.protegerProgressoAlunos()) return;
    Auth.preencherUI();
    this._bindHamburger();
    this._bindTabs();
    this._bindCurso();
    this._bindAluno();
    try {
      await this._carregarCursos();
    } finally {
      document.getElementById('progresso-alunos-loading')?.classList.remove('active');
    }
  },

  _bindHamburger() {
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('hamburger');
    hamburger?.addEventListener('click', () => {
      const aberto = sidebar?.classList.toggle('mobile-open');
      overlay?.classList.toggle('active');
      hamburger.setAttribute('aria-expanded', String(!!aberto));
    });
    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('mobile-open');
      overlay?.classList.remove('active');
      hamburger?.setAttribute('aria-expanded', 'false');
    });
  },

  // ── Abas ──────────────────────────────────────────────────
  _bindTabs() {
    document.querySelectorAll('.progresso-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.progresso-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.progresso-view').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('pa-view-' + btn.dataset.tab).classList.add('active');
      });
    });
  },

  // ══════════════════════════════════════════════════════════
  //  ABA: POR CURSO
  // ══════════════════════════════════════════════════════════

  _bindCurso() {
    document.getElementById('pa-btn-buscar').addEventListener('click', () => this._buscar(true));
    document.getElementById('pa-btn-limpar').addEventListener('click', () => this._limpar());
    document.getElementById('pa-btn-prev').addEventListener('click',   () => this._mudarPagina(-1));
    document.getElementById('pa-btn-next').addEventListener('click',   () => this._mudarPagina(1));

    ['pa-nome', 'pa-email'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') this._buscar(true);
      });
    });

    document.querySelectorAll('.progresso-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.progresso-status-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._statusFiltro = btn.dataset.status;
        this._renderTabela(this._todosDaPagina);
      });
    });
  },

  async _carregarCursos() {
    const select = document.getElementById('pa-curso');
    select.disabled = true;
    select.innerHTML = '<option value="">Carregando cursos...</option>';

    const res = await API.get('newzenler-cursos', {}, false);
    if (!res.ok) {
      select.innerHTML = '<option value="">Erro ao carregar cursos</option>';
      this._toast('Erro ao carregar cursos: ' + (res.error || 'falha'), 'danger');
      select.disabled = false;
      return;
    }

    select.innerHTML = '<option value="">Selecione um curso...</option>';
    (res.data || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
    select.disabled = false;
  },

  async _buscar(resetPage = true) {
    const courseId = document.getElementById('pa-curso').value;
    const nome     = document.getElementById('pa-nome').value.trim();
    const email    = document.getElementById('pa-email').value.trim();

    if (!courseId) {
      this._toast('Selecione um curso para buscar.', 'warning');
      return;
    }

    if (resetPage) this._paginaAtual = 1;
    this._setLoadingCurso(true);

    const params = { page: this._paginaAtual, limit: 50 };
    if (courseId) params.courseId = courseId;
    if (nome)     params.nameLike = nome;
    if (email)    params.emailLike = email;

    const res = await API.get('newzenler-progresso', params, false);
    this._setLoadingCurso(false);

    if (!res.ok) {
      this._toast('Erro ao buscar: ' + (res.error || res.message || 'falha'), 'danger');
      console.error('[Progresso] erro:', res);
      return;
    }

    const { items, pagination } = res.data;
    this._todosDaPagina = items || [];
    this._paginaAtual   = Number(pagination.page_index  || 1);
    this._totalPaginas  = Number(pagination.total_pages || 1);
    this._totalItems    = Number(pagination.total_items || this._todosDaPagina.length);

    this._atualizarNomeCurso();
    this._renderKpis(this._todosDaPagina);
    this._renderTabela(this._todosDaPagina);
    this._renderPaginacao();
  },

  _atualizarNomeCurso() {
    const select = document.getElementById('pa-curso');
    const opt  = select.options[select.selectedIndex];
    const nome = opt && opt.value ? opt.textContent : 'Todos os cursos';
    document.getElementById('pa-table-title').textContent = nome;
    document.getElementById('pa-table-sub').textContent =
      `${this._totalItems} aluno${this._totalItems !== 1 ? 's' : ''} encontrado${this._totalItems !== 1 ? 's' : ''}`;
  },

  _renderKpis(items) {
    const ns   = items.filter(i => this._normStatus(i.status) === 'ns').length;
    const prog = items.filter(i => this._normStatus(i.status) === 'prog').length;
    const done = items.filter(i => this._normStatus(i.status) === 'done').length;
    document.getElementById('pa-kpi-total').textContent = this._totalItems;
    document.getElementById('pa-kpi-ns').textContent    = ns;
    document.getElementById('pa-kpi-prog').textContent  = prog;
    document.getElementById('pa-kpi-done').textContent  = done;
  },

  _renderTabela(items) {
    const tbody    = document.getElementById('pa-tbody');
    const filtrados = this._statusFiltro
      ? items.filter(i => i.status === this._statusFiltro)
      : items;

    if (!filtrados.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="progresso-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
        <p>${this._statusFiltro ? 'Nenhum aluno com esse status nesta página' : 'Nenhum aluno encontrado'}</p>
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtrados.map(a => {
      return `<tr>
        <td>
          <div class="progresso-nome">${this._esc(a.name || '—')}</div>
          <div class="progresso-email">${this._esc(a.email || '')}</div>
        </td>
        <td>${this._badgeStatus(a.status)}</td>
        <td>${this._celulaProgresso(a.status)}</td>
        <td><span class="progresso-date">${this._fmtData(a.enrollment_date)}</span></td>
        <td><span class="progresso-date">${this._fmtData(a.last_attended)}</span></td>
        <td><span class="progresso-date">${this._fmtData(a.completed_date)}</span></td>
      </tr>`;
    }).join('');
  },

  _renderPaginacao() {
    const wrap    = document.getElementById('pa-paginacao');
    const info    = document.getElementById('pa-pag-info');
    const btnPrev = document.getElementById('pa-btn-prev');
    const btnNext = document.getElementById('pa-btn-next');
    if (!this._todosDaPagina.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    info.textContent = `Página ${this._paginaAtual} de ${this._totalPaginas} · ${this._totalItems} alunos`;
    btnPrev.disabled = this._paginaAtual <= 1;
    btnNext.disabled = this._paginaAtual >= this._totalPaginas;
  },

  async _mudarPagina(delta) {
    const nova = this._paginaAtual + delta;
    if (nova < 1 || nova > this._totalPaginas) return;
    this._paginaAtual = nova;
    await this._buscar(false);
    document.querySelector('.progresso-table-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _limpar() {
    document.getElementById('pa-curso').value  = '';
    document.getElementById('pa-nome').value   = '';
    document.getElementById('pa-email').value  = '';
    this._statusFiltro  = '';
    this._todosDaPagina = [];
    this._paginaAtual   = 1;
    this._totalPaginas  = 1;
    this._totalItems    = 0;
    document.querySelectorAll('.progresso-status-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.progresso-status-btn[data-status=""]').classList.add('active');
    ['pa-kpi-total','pa-kpi-ns','pa-kpi-prog','pa-kpi-done'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    document.getElementById('pa-table-title').textContent = 'Alunos';
    document.getElementById('pa-table-sub').textContent   = 'Selecione um curso para carregar os alunos';
    document.getElementById('pa-paginacao').style.display = 'none';
    document.getElementById('pa-tbody').innerHTML = `<tr><td colspan="6">
      <div class="progresso-placeholder">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="m12 3-9 4.5 9 4.5 9-4.5L12 3Z"/><path d="M6 8v5c0 2.5 2.7 4 6 4s6-1.5 6-4V8"/><path d="M21 12v5"/></svg>
        <p>Selecione um curso acima para ver o progresso dos alunos</p>
      </div>
    </td></tr>`;
  },

  _setLoadingCurso(on) {
    const tbody = document.getElementById('pa-tbody');
    const btn   = document.getElementById('pa-btn-buscar');
    if (on) {
      tbody.innerHTML = `<tr><td colspan="6"><div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:48px;color:var(--text-muted)">
        <div class="spinner"></div><span>Consultando API Newzenler...</span>
      </div></td></tr>`;
      btn.disabled = true;
      btn.textContent = 'Buscando...';
    } else {
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg> Buscar`;
    }
  },

  // ══════════════════════════════════════════════════════════
  //  ABA: POR ALUNO
  // ══════════════════════════════════════════════════════════

  _bindAluno() {
    const input = document.getElementById('pa-aluno-query');
    const btn   = document.getElementById('pa-btn-buscar-aluno');
    btn.addEventListener('click', () => this._buscarAlunos());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') this._buscarAlunos(); });
  },

  async _buscarAlunos() {
    const query = document.getElementById('pa-aluno-query').value.trim();
    if (!query) { this._toast('Digite um nome ou e-mail para buscar.', 'warning'); return; }

    const btn  = document.getElementById('pa-btn-buscar-aluno');
    const lista = document.getElementById('pa-alunos-lista');
    const detalhe = document.getElementById('pa-aluno-detalhe');

    btn.disabled    = true;
    btn.textContent = 'Buscando...';
    detalhe.style.display = 'none';
    lista.innerHTML = `<div class="progresso-placeholder" style="padding:40px">
      <div class="spinner"></div><p>Buscando alunos...</p>
    </div>`;

    const res = await API.get('newzenler-buscar-alunos', { query }, false);

    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg> Buscar`;

    if (!res.ok) {
      lista.innerHTML = '';
      this._toast('Erro ao buscar alunos: ' + (res.error || 'falha'), 'danger');
      return;
    }

    const alunos = res.data || [];
    this._renderListaAlunos(alunos, lista);
  },

  _renderListaAlunos(alunos, container) {
    if (!alunos.length) {
      container.innerHTML = `<div class="progresso-placeholder" style="padding:48px">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p>Nenhum aluno encontrado</p>
      </div>`;
      return;
    }

    container.innerHTML = `
      <div class="pa-alunos-grid" id="pa-alunos-cards">
        ${alunos.map(a => `
          <button class="pa-aluno-card" data-email="${this._esc(a.email)}" data-nome="${this._esc(a.name)}">
            <div class="pa-aluno-avatar">${(a.name || '?').charAt(0).toUpperCase()}</div>
            <div class="pa-aluno-info">
              <div class="pa-aluno-nome">${this._esc(a.name || '—')}</div>
              <div class="pa-aluno-email">${this._esc(a.email || '')}</div>
            </div>
            <svg class="pa-aluno-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        `).join('')}
      </div>`;

    container.querySelectorAll('.pa-aluno-card').forEach(card => {
      card.addEventListener('click', () => {
        container.querySelectorAll('.pa-aluno-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this._abrirDetalheAluno(card.dataset.email, card.dataset.nome);
      });
    });
  },

  async _abrirDetalheAluno(email, nome) {
    const detalhe = document.getElementById('pa-aluno-detalhe');
    const header  = document.getElementById('pa-detalhe-header');
    const sub     = document.getElementById('pa-detalhe-sub');
    const tbody   = document.getElementById('pa-detalhe-tbody');

    // Monta header do aluno
    header.innerHTML = `
      <div class="pa-detalhe-avatar">${(nome || email).charAt(0).toUpperCase()}</div>
      <div class="pa-detalhe-info">
        <div class="pa-detalhe-nome">${this._esc(nome)}</div>
        <div class="pa-detalhe-email">${this._esc(email)}</div>
      </div>`;

    sub.textContent = 'Consultando todos os cursos em paralelo...';
    tbody.innerHTML = `<tr><td colspan="6"><div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:40px;color:var(--text-muted)">
      <div class="spinner"></div><span>Buscando cursos matriculados...</span>
    </div></td></tr>`;

    detalhe.style.display = 'block';
    detalhe.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const res = await API.get('newzenler-progresso-aluno', { email }, false);

    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="progresso-placeholder"><p>Erro ao carregar cursos: ${this._esc(res.error || 'falha')}</p></div></td></tr>`;
      sub.textContent = 'Erro ao carregar';
      return;
    }

    const cursos = res.data || [];
    sub.textContent = `${cursos.length} curso${cursos.length !== 1 ? 's' : ''} matriculado${cursos.length !== 1 ? 's' : ''}`;

    if (!cursos.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="progresso-placeholder">
        <p>Nenhum curso encontrado para este aluno</p>
      </div></td></tr>`;
      return;
    }

    tbody.innerHTML = cursos.map(c => {
      return `<tr>
        <td><div class="progresso-nome">${this._esc(c.courseName)}</div></td>
        <td>${this._badgeStatus(c.status)}</td>
        <td>${this._celulaProgresso(c.status)}</td>
        <td><span class="progresso-date">${this._fmtData(c.enrollmentDate)}</span></td>
        <td><span class="progresso-date">${this._fmtData(c.lastAttended)}</span></td>
        <td><span class="progresso-date">${this._fmtData(c.completedDate)}</span></td>
      </tr>`;
    }).join('');
  },

  // ── Helpers ───────────────────────────────────────────────

  _normStatus(s) {
    if (!s || s === 'Not Started' || s === '-') return 'ns';
    if (s === 'Completed') return 'done';
    return 'prog';
  },

  // Coluna de progresso baseada no status confiável da API.
  // A % exata de cursos "Em andamento" não é exposta pela API do
  // Newzenler, então mostramos "—" em vez de um número incorreto.
  _celulaProgresso(statusRaw) {
    const status = this._normStatus(statusRaw);
    if (status === 'done') {
      return `<div class="progresso-bar-wrap">
        <div class="progresso-bar-track"><div class="progresso-bar-fill progresso-bar-fill--done" style="width:100%"></div></div>
        <span class="progresso-bar-pct">100%</span>
      </div>`;
    }
    if (status === 'ns') {
      return `<div class="progresso-bar-wrap">
        <div class="progresso-bar-track"><div class="progresso-bar-fill progresso-bar-fill--zero" style="width:0%"></div></div>
        <span class="progresso-bar-pct">0%</span>
      </div>`;
    }
    // Em andamento — % real indisponível na API
    return `<div class="progresso-bar-wrap" title="A % exata de cursos em andamento não é disponibilizada pela API do Newzenler">
      <div class="progresso-bar-track"><div class="progresso-bar-fill progresso-bar-fill--indet"></div></div>
      <span class="progresso-bar-pct">—</span>
    </div>`;
  },

  _badgeStatus(s) {
    const norm = this._normStatus(s);
    const cls  = { ns: 'progresso-badge--ns', prog: 'progresso-badge--prog', done: 'progresso-badge--done' }[norm];
    const txt  = { ns: 'Não iniciado', prog: 'Em andamento', done: 'Concluído' }[norm];
    return `<span class="progresso-badge ${cls}">${txt}</span>`;
  },

  _fmtData(val) {
    if (!val || val === '-') return '—';
    const d = new Date(val);
    if (isNaN(d)) return val;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _toast(msg, tipo = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4500);
  }
};

document.addEventListener('DOMContentLoaded', () => ProgressoAlunos.init());
