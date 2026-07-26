// ============================================================
// notams.js — Página de NOTAMs (bases SAFE: SBSJ e SDAM)
// SAFE Hub · lê o cache do backend (action=notams) e renderiza.
// Página global (todos os logados). Só leitura — sem escrita.
// ============================================================

const Notams = {
  dados: { atualizadoEm: '', aeroportos: [], resumo: {}, notams: [] },
  filtro: 'todos',      // todos | hoje | impacto | futuro
  aeroporto: 'todos',   // todos | SBSJ | SDAM
  view: 'decoded',      // decoded | raw

  async init() {
    if (!Auth.proteger(true)) return;
    Auth.preencherUI();
    this.initTema();
    this.initControles();
    this.initSidebar();
    await this.carregar();
  },

  // ── Carregamento ─────────────────────────────────────────
  async carregar(force = false) {
    this.setLoading(true);
    const res = await API.get('notams', {}, !force);
    this.setLoading(false);

    if (!res || !res.ok) {
      toast((res && res.error) || 'Erro ao carregar NOTAMs.', 'error');
      return;
    }
    this.dados = res.data || this.dados;
    this.render();
  },

  // ── Render principal ─────────────────────────────────────
  render() {
    this.renderUpdated();
    this.renderNota();
    this.renderTiles();
    this.renderAeroportos();
    this.renderContagens();
    this.renderFoot();
    this.aplicarFiltro();
    this.aplicarView();
  },

  renderUpdated() {
    const el = document.getElementById('notam-updated-text');
    if (!el) return;
    el.textContent = this.dados.atualizadoEm
      ? 'Atualizado ' + this._formatarTimestamp(this.dados.atualizadoEm)
      : 'sem sincronização ainda';
  },

  renderNota() {
    const nota = document.getElementById('notam-note');
    if (!nota) return;
    const vazio = !(this.dados.notams && this.dados.notams.length);
    if (vazio) {
      nota.hidden = false;
      nota.innerHTML = 'ℹ️ Nenhum NOTAM no cache ainda. Assim que a consulta ao AISWEB/DECEA for sincronizada, os NOTAMs das bases aparecem aqui.';
    } else {
      nota.hidden = true;
      nota.innerHTML = '';
    }
  },

  renderTiles() {
    const r = this.dados.resumo || {};
    const cont = document.getElementById('notam-tiles');
    if (!cont) return;
    const futuros = Number(r.futuros || 0);
    cont.innerHTML = [
      this._tile('live', 'Ativos hoje', r.ativosHoje, 'vigentes na data atual'),
      this._tile('crit', 'Impacto pista', r.impactoPista, 'RWY fechada / restrita'),
      this._tile('warn', 'Auxílios/luzes', r.auxiliosLuzes, 'PAPI · VOR · nav inoperantes'),
      this._tile('tot',  'Total monitorado', r.total, futuros + ' futuro' + (futuros === 1 ? '' : 's') + ' programado' + (futuros === 1 ? '' : 's'))
    ].join('');
  },

  _tile(cls, lab, val, cap) {
    return `<div class="notam-tile ${cls}">
      <div class="lab">${this._esc(lab)}</div>
      <div class="val">${Number(val || 0)}</div>
      <div class="cap">${this._esc(cap)}</div>
    </div>`;
  },

  renderAeroportos() {
    const wrap = document.getElementById('notam-airports');
    if (!wrap) return;
    const aeroportos = (this.dados.aeroportos && this.dados.aeroportos.length)
      ? this.dados.aeroportos
      : this._aeroportosDosNotams();

    wrap.innerHTML = aeroportos.map(ap => {
      const lista = (this.dados.notams || []).filter(n => n.icao === ap.icao);
      const cards = lista.length
        ? lista.map(n => this._card(n)).join('')
        : '<div class="notam-empty">Sem NOTAMs para esta base.</div>';
      return `<div class="notam-station" data-station="${this._esc(ap.icao)}">
        <div class="notam-station-head">
          <span class="notam-icao">${this._esc(ap.icao)}</span>
          <div>
            <div class="name">${this._esc(ap.nome || ap.icao)}</div>
            <div class="meta">${this._esc(ap.sub || '')}</div>
          </div>
          <span class="count" data-count="${this._esc(ap.icao)}">${lista.length} NOTAM${lista.length === 1 ? '' : 's'}</span>
        </div>
        <div class="notam-stack" id="notam-stack-${this._esc(ap.icao)}">${cards}</div>
      </div>`;
    }).join('');
  },

  _card(n) {
    const sev = ['critico', 'atencao', 'info'].indexOf(n.sev) >= 0 ? n.sev : 'info';
    const impacto = sev !== 'info';
    const upcoming = n.future ? ' upcoming' : '';
    let badges = '';
    if (n.active) badges += '<span class="notam-badge b-live">● Ativo hoje</span>';
    if (n.future) badges += '<span class="notam-badge b-future">◷ Futuro</span>';
    if (sev === 'critico') badges += '<span class="notam-badge b-crit">⚠ Pista</span>';
    else if (sev === 'atencao') badges += '<span class="notam-badge b-warn">Atenção</span>';

    return `<article class="notam sev-${sev}" data-active="${!!n.active}" data-future="${!!n.future}" data-impact="${impacto}">
      <div class="notam-head">
        <div>
          <div class="notam-id">${this._esc(n.id || '—')}</div>
          <div class="notam-cat">${this._esc(n.cat || 'Geral')}${n.qcode ? ' · ' + this._esc(n.qcode) : ''}</div>
        </div>
        <div class="notam-badges">${badges}</div>
      </div>
      <div class="notam-valid">
        <div class="v"><b>Início</b><span>${this._esc(n.from || '—')}</span></div>
        <div class="v${upcoming}"><b>Término</b><span>${this._esc(n.to || '—')}</span></div>
      </div>
      <div class="notam-body">
        <div class="notam-decoded">${this._esc(n.decoded || n.raw || '')}</div>
        <div class="notam-raw">${this._esc(n.raw || '')}</div>
      </div>
      <div class="notam-foot">
        <button class="notam-mini-toggle" data-toggle-raw>⟨/⟩ Ver NOTAM cru</button>
        <span class="notam-scope">${this._esc(n.scope || 'Aeródromo')}</span>
      </div>
    </article>`;
  },

  renderFoot() {
    const el = document.getElementById('notam-foot');
    if (!el) return;
    el.textContent = 'Consulta automatizada via API AISWEB/DECEA · o NOTAM cru é sempre preservado.';
  },

  // ── Contagens (filtros + abas) ───────────────────────────
  renderContagens() {
    const ns = this.dados.notams || [];
    const set = (sel, v) => { const e = document.querySelector(sel); if (e) e.textContent = v; };
    set('[data-cnt="todos"]',   ns.length);
    set('[data-cnt="hoje"]',    ns.filter(n => n.active).length);
    set('[data-cnt="impacto"]', ns.filter(n => n.sev === 'critico' || n.sev === 'atencao').length);
    set('[data-cnt="futuro"]',  ns.filter(n => n.future).length);

    document.querySelectorAll('[data-tcnt]').forEach(el => {
      const ic = el.getAttribute('data-tcnt');
      el.textContent = ns.filter(n => n.icao === ic).length;
    });
  },

  // ── Controles (eventos) ──────────────────────────────────
  initControles() {
    // filtros de status
    document.querySelectorAll('.notam-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.notam-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filtro = chip.dataset.filter;
        this.aplicarFiltro();
      });
    });
    // abas de aeroporto
    document.querySelectorAll('.notam-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.notam-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.aeroporto = tab.dataset.ap;
        this.aplicarFiltro();
      });
    });
    // toggle global cru/decodificado
    document.querySelectorAll('.notam-seg').forEach(seg => {
      seg.addEventListener('click', () => {
        document.querySelectorAll('.notam-seg').forEach(s => s.classList.remove('active'));
        seg.classList.add('active');
        this.view = seg.dataset.view;
        this.aplicarView();
      });
    });
    // toggle individual (delegação — cards são recriados no render)
    const wrap = document.getElementById('notam-airports');
    wrap?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toggle-raw]');
      if (!btn) return;
      const card = btn.closest('.notam');
      const raw = card.classList.toggle('show-raw');
      btn.textContent = raw ? '✦ Ver decodificado' : '⟨/⟩ Ver NOTAM cru';
    });
    // refresh
    document.getElementById('notam-refresh')?.addEventListener('click', () => this.carregar(true));
  },

  aplicarFiltro() {
    const solo = this.aeroporto !== 'todos';
    const wrap = document.getElementById('notam-airports');
    if (wrap) wrap.classList.toggle('solo', solo);

    document.querySelectorAll('.notam-station').forEach(st => {
      const isThis = st.getAttribute('data-station') === this.aeroporto;
      st.classList.toggle('hidden-ap', solo && !isThis);
    });

    document.querySelectorAll('.notam').forEach(el => {
      const f = this.filtro;
      const show = f === 'todos'
        || (f === 'hoje'    && el.dataset.active === 'true')
        || (f === 'futuro'  && el.dataset.future === 'true')
        || (f === 'impacto' && el.dataset.impact === 'true');
      el.classList.toggle('hidden', !show);
    });

    // atualiza contagem por estação (visíveis)
    (this.dados.aeroportos || this._aeroportosDosNotams()).forEach(ap => {
      const vis = document.querySelectorAll('#notam-stack-' + CSS.escape(ap.icao) + ' .notam:not(.hidden)').length;
      const badge = document.querySelector('[data-count="' + CSS.escape(ap.icao) + '"]');
      if (badge) badge.textContent = vis + ' NOTAM' + (vis === 1 ? '' : 's');
    });
  },

  aplicarView() {
    const raw = this.view === 'raw';
    document.querySelectorAll('.notam').forEach(el => {
      el.classList.toggle('show-raw', raw);
      const t = el.querySelector('[data-toggle-raw]');
      if (t) t.textContent = raw ? '✦ Ver decodificado' : '⟨/⟩ Ver NOTAM cru';
    });
  },

  // ── Tema (claro padrão; escuro opcional, escopado) ───────
  initTema() {
    let tema = 'light';
    try { tema = localStorage.getItem('notams-theme') || 'light'; } catch (e) {}
    this._aplicarTema(tema);
    document.getElementById('notam-theme-btn')?.addEventListener('click', () => {
      const atual = document.body.classList.contains('notams-dark') ? 'dark' : 'light';
      this._aplicarTema(atual === 'dark' ? 'light' : 'dark');
    });
  },

  _aplicarTema(tema) {
    const dark = tema === 'dark';
    document.body.classList.toggle('notams-dark', dark);
    // Ícone SVG compartilhado do Hub: o `.is-dark` troca sol por lua na
    // regra `.theme-toggle` do layout.css. Era emoji via textContent.
    document.getElementById('notam-theme-btn')?.classList.toggle('is-dark', dark);
    try { localStorage.setItem('notams-theme', dark ? 'dark' : 'light'); } catch (e) {}
  },

  // ── Auxiliares ───────────────────────────────────────────
  _aeroportosDosNotams() {
    const vistos = {};
    (this.dados.notams || []).forEach(n => { if (n.icao) vistos[n.icao] = true; });
    return Object.keys(vistos).map(ic => ({ icao: ic, nome: ic, sub: '' }));
  },

  _formatarTimestamp(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return d.toISOString();
    }
  },

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

document.addEventListener('DOMContentLoaded', () => Notams.init());
