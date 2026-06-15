// ============================================================
// progresso-alunos.js — Progresso de Alunos (Newzenler)
// SAFE Hub
// ============================================================

const ProgressoAlunos = {

  _paginaAtual: 1,
  _totalPaginas: 1,
  _totalItems: 0,
  _statusFiltro: '',
  _todosDaPagina: [],

  async init() {
    if (!Auth.protegerProgressoAlunos()) return;
    Auth.preencherUI();

    this._bindEvents();
    await this._carregarCursos();
  },

  _bindEvents() {
    document.getElementById('pa-btn-buscar').addEventListener('click', () => this._buscar(true));
    document.getElementById('pa-btn-limpar').addEventListener('click', () => this._limpar());
    document.getElementById('pa-btn-prev').addEventListener('click', () => this._mudarPagina(-1));
    document.getElementById('pa-btn-next').addEventListener('click', () => this._mudarPagina(1));

    document.getElementById('pa-nome').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._buscar(true);
    });
    document.getElementById('pa-email').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._buscar(true);
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
      this._toast('Erro ao carregar cursos: ' + (res.error || 'falha desconhecida'), 'danger');
      select.disabled = false;
      return;
    }

    const cursos = res.data || [];
    select.innerHTML = '<option value="">Selecione um curso...</option>';
    cursos.forEach(c => {
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

    if (!courseId && !nome && !email) {
      this._toast('Selecione um curso ou informe um filtro para buscar.', 'warning');
      return;
    }

    if (resetPage) this._paginaAtual = 1;

    this._setLoading(true);

    const params = { page: this._paginaAtual, limit: 50 };
    if (courseId) params.courseId = courseId;
    if (nome)     params.nameLike = nome;
    if (email)    params.emailLike = email;

    const res = await API.get('newzenler-progresso', params, false);

    this._setLoading(false);

    if (!res.ok) {
      this._toast('Erro ao buscar progresso: ' + (res.error || res.message || 'falha desconhecida'), 'danger');
      console.error('[Progresso] erro API:', res);
      return;
    }

    const { items, pagination } = res.data;
    this._todosDaPagina  = items || [];
    this._paginaAtual    = Number(pagination.page_index  || 1);
    this._totalPaginas   = Number(pagination.total_pages || 1);
    this._totalItems     = Number(pagination.total_items || this._todosDaPagina.length);

    this._atualizarNomeCurso();
    this._renderKpis(this._todosDaPagina);
    this._renderTabela(this._todosDaPagina);
    this._renderPaginacao();
  },

  _atualizarNomeCurso() {
    const select = document.getElementById('pa-curso');
    const opt = select.options[select.selectedIndex];
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
    const tbody = document.getElementById('pa-tbody');

    const filtrados = this._statusFiltro
      ? items.filter(i => i.status === this._statusFiltro)
      : items;

    if (!filtrados.length) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="progresso-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p>${this._statusFiltro ? 'Nenhum aluno com esse status nesta página' : 'Nenhum aluno encontrado'}</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = filtrados.map(a => {
      const status  = this._normStatus(a.status);
      const pct     = status === 'done' ? 100 : Number(a.completion_percentage || 0);
      const barClass = status === 'done' ? 'progresso-bar-fill--done' : (pct === 0 ? 'progresso-bar-fill--zero' : '');

      return `
        <tr>
          <td>
            <div class="progresso-nome">${this._esc(a.name || '—')}</div>
            <div class="progresso-email">${this._esc(a.email || '')}</div>
          </td>
          <td>${this._badgeStatus(a.status)}</td>
          <td>
            <div class="progresso-bar-wrap">
              <div class="progresso-bar-track">
                <div class="progresso-bar-fill ${barClass}" style="width:${pct}%"></div>
              </div>
              <span class="progresso-bar-pct">${pct}%</span>
            </div>
          </td>
          <td><span class="progresso-date">${this._fmtData(a.enrollment_date)}</span></td>
          <td><span class="progresso-date">${this._fmtData(a.last_attended)}</span></td>
          <td><span class="progresso-date">${this._fmtData(a.completed_date)}</span></td>
        </tr>`;
    }).join('');
  },

  _renderPaginacao() {
    const wrap   = document.getElementById('pa-paginacao');
    const info   = document.getElementById('pa-pag-info');
    const btnPrev = document.getElementById('pa-btn-prev');
    const btnNext = document.getElementById('pa-btn-next');

    if (this._totalPaginas <= 1 && this._todosDaPagina.length === 0) {
      wrap.style.display = 'none';
      return;
    }

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
    this._statusFiltro = '';
    document.querySelectorAll('.progresso-status-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.progresso-status-btn[data-status=""]').classList.add('active');
    this._todosDaPagina = [];
    this._paginaAtual = 1;
    this._totalPaginas = 1;
    this._totalItems = 0;
    document.getElementById('pa-kpi-total').textContent = '—';
    document.getElementById('pa-kpi-ns').textContent    = '—';
    document.getElementById('pa-kpi-prog').textContent  = '—';
    document.getElementById('pa-kpi-done').textContent  = '—';
    document.getElementById('pa-table-title').textContent = 'Alunos';
    document.getElementById('pa-table-sub').textContent  = 'Selecione um curso para carregar os alunos';
    document.getElementById('pa-paginacao').style.display = 'none';
    document.getElementById('pa-tbody').innerHTML = `
      <tr><td colspan="6">
        <div class="progresso-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="m12 3-9 4.5 9 4.5 9-4.5L12 3Z"/>
            <path d="M6 8v5c0 2.5 2.7 4 6 4s6-1.5 6-4V8"/>
            <path d="M21 12v5"/>
          </svg>
          <p>Selecione um curso acima para ver o progresso dos alunos</p>
        </div>
      </td></tr>`;
  },

  _setLoading(on) {
    const tbody = document.getElementById('pa-tbody');
    const btn   = document.getElementById('pa-btn-buscar');
    if (on) {
      tbody.innerHTML = `<tr class="progresso-loading-row"><td colspan="6">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:48px;color:var(--gray-400)">
          <div class="spinner"></div>
          <span>Consultando API Newzenler...</span>
        </div>
      </td></tr>`;
      btn.disabled = true;
      btn.textContent = 'Buscando...';
    } else {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
        Buscar`;
    }
  },

  // ── Helpers ───────────────────────────────────────────────

  _normStatus(s) {
    if (!s || s === 'Not Started' || s === '-') return 'ns';
    if (s === 'Completed')  return 'done';
    return 'prog';
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
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _toast(msg, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => ProgressoAlunos.init());
