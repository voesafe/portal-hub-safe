// ============================================================
// dashboard.js — KPIs + Gráficos + UX melhorada
// SAFE Hub
// ============================================================

let chartReceita = null;
let chartOrigens = null;
let chartPac     = null;

const Dashboard = {

  mesFiltro: CONFIG.MES_ATUAL,
  anoFiltro:  CONFIG.ANO_ATUAL,
  _primeiraVez: true,

  async init() {
    Auth.proteger();
    Auth.preencherUI();
    this.initFiltros();
    this.initSidebar();
    await this.carregar();
  },

  initFiltros() {
    const selMes = document.getElementById('sel-mes');
    const selAno = document.getElementById('sel-ano');

    if (selMes) {
      selMes.value = String(this.mesFiltro);
      selMes.addEventListener('change', () => { this.mesFiltro = selMes.value; this.carregar(); });
    }
    if (selAno) {
      selAno.value = String(this.anoFiltro);
      selAno.addEventListener('change', () => { this.anoFiltro = selAno.value; this.carregar(); });
    }
  },

  async carregar() {
    this.setLoading(true);
    try {
      const [resKpi, resFat, resHistorico] = await Promise.all([
        this._comTimeout(
          API.getKPIs(this.mesFiltro, this.anoFiltro),
          'Tempo limite excedido ao carregar os dados.'
        ),
        Auth.eAdmin()
          ? API.getResumoFaturamento(this.anoFiltro || CONFIG.ANO_ATUAL)
          : Promise.resolve(null),
        this._comTimeout(
          API.getKPIs(),
          'Tempo limite excedido ao carregar o histórico.'
        )
      ]);

      if (!resKpi.ok) { toast(resKpi.error || 'Erro ao carregar dados.', 'error'); return; }

      const k = resKpi.data;
      const porMes = resHistorico?.ok
        ? resHistorico.data?.porMes
        : k.porMes;
      this.renderKPIs(k, resFat);
      this.renderChartReceita(porMes, this.mesFiltro, this.anoFiltro);
      this.renderChartOrigens(k.origens);
      if (Auth.eAdmin()) this.renderChartPac(k.porPac);
      this.renderRankingCursos(k.cursos);
      this._primeiraVez = false;
    } catch (err) {
      console.error('[Dashboard]', err);
      toast(err.message || 'Erro ao renderizar o dashboard.', 'error');
    } finally {
      this.setLoading(false);
    }
  },

  _comTimeout(promise, mensagem) {
    let timeoutId;
    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve({ ok: false, error: mensagem }), CONFIG.API_TIMEOUT_MS || 30000);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
  },

  // ── KPIs ───────────────────────────────────────────────────

  renderKPIs(k, resFat) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.transition = 'opacity .2s';
      el.style.opacity = '0';
      setTimeout(() => {
        el.innerHTML = val;
        el.style.opacity = '1';
      }, 120);
    };

    set('kpi-total-vendas', k.totalVendas);
    set('kpi-receita',      formatBRL(k.totalReceita));
    set('kpi-total-geral',  formatBRL(k.totalReceitaGeral ?? k.totalReceita));
    set('kpi-ticket',       formatBRL(k.ticketMedio));
    set('kpi-leads',        k.leadsNovos);

    const receitaSub = document.getElementById('kpi-receita-sub');
    if (receitaSub) receitaSub.textContent = Auth.eAdmin() ? 'Soma de todas as vendas' : 'Suas vendas no período';

    const cardTotalGeral = document.getElementById('kpi-total-geral-card');
    if (cardTotalGeral) cardTotalGeral.style.display = Auth.eAdmin() ? 'none' : 'flex';

    // ── Card Receita Global (admin only) ───────────────────
    const cardGlobal = document.getElementById('kpi-receita-global-card');
    if (cardGlobal && Auth.eAdmin()) {
      cardGlobal.style.display = 'flex';

      // Calcula receita de faturamento (apenas 4 canais manuais: Lojinha, Academy, Azul, Lito)
      // "Vendas Comercial" do faturamento É a mesma receita de vendas — não somar duas vezes
      const CANAIS_FAT = ['Lojinha', 'Safe Academy', 'Azul Pontos', 'Lito Academy'];
      let receitaFat = 0;
      if (resFat && resFat.ok && resFat.data) {
        // Normaliza mesFiltro: "" ou null = todos os meses
        const mesFiltroNum = this.mesFiltro ? Number(this.mesFiltro) : null;
        const meses = mesFiltroNum
          ? [mesFiltroNum]
          : Array.from({ length: 12 }, (_, i) => i + 1);

        meses.forEach(m => {
          const d = resFat.data[m];
          if (!d) return;
          CANAIS_FAT.forEach(c => { receitaFat += Number(d[c]) || 0; });
        });
      }

      // totalReceita = soma das vendas no período (já filtrado por mês/ano pelo backend)
      const receitaVendas = k.totalReceita || 0;
      const receitaGlobal = receitaVendas + receitaFat;

      set('kpi-receita-global', formatBRL(receitaGlobal));

      const sub = document.getElementById('kpi-receita-global-sub');
      if (sub) sub.innerHTML =
        `<span style="font-size:.7rem;color:var(--gray-400)">Vendas ${formatBRL(receitaVendas)} + Fat. ${formatBRL(receitaFat)}</span>`;
    }

    // Badges de variação (usa dados do mês anterior se disponível)
    if (k.variacao) {
      this._renderDelta('kpi-total-vendas-delta', k.variacao.vendas);
      this._renderDelta('kpi-receita-delta',      k.variacao.receita);
      this._renderDelta('kpi-ticket-delta',        k.variacao.ticket);
      this._renderDelta('kpi-leads-delta',         k.variacao.leads);
    }
  },

  _renderDelta(elId, pct) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (pct === null || pct === undefined) { el.innerHTML = ''; return; }

    const abs = Math.abs(pct).toFixed(0);
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral';
    const seta = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    const texto = pct === 0 ? 'Igual ao mês anterior' : `${seta} ${abs}% vs mês anterior`;

    el.innerHTML = `<span class="kpi-delta ${cls}">${texto}</span>`;
  },

  // ── Gráficos ───────────────────────────────────────────────

  _emptyChart(wrapperId, msg = 'Nenhum dado no período') {
    const wrap = document.getElementById(wrapperId);
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="chart-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-4"/>
        </svg>
        <p>${msg}</p>
      </div>`;
  },

  _restoreCanvas(wrapperId, canvasId) {
    const wrap = document.getElementById(wrapperId);
    if (!wrap) return;
    if (!wrap.querySelector('canvas')) {
      const c = document.createElement('canvas');
      c.id = canvasId;
      wrap.innerHTML = '';
      wrap.appendChild(c);
    }
  },

  renderChartReceita(porMes, mesReferencia, anoReferencia) {
    const labels = [], dados = [];
    const mesBase = Number(mesReferencia) || CONFIG.MES_ATUAL;
    const anoBase = Number(anoReferencia) || CONFIG.ANO_ATUAL;

    for (let i = 5; i >= 0; i--) {
      let mes = mesBase - i, ano = anoBase;
      if (mes <= 0) { mes += 12; ano--; }
      const chave = `${ano}-${String(mes).padStart(2,'0')}`;
      labels.push(CONFIG.MESES[mes].substring(0,3));
      dados.push(porMes[chave]?.receita || 0);
    }

    const temDados = dados.some(v => v > 0);
    if (!temDados) { if (chartReceita) { chartReceita.destroy(); chartReceita = null; } this._emptyChart('wrap-chart-receita'); return; }

    this._restoreCanvas('wrap-chart-receita', 'chart-receita');
    const ctx = document.getElementById('chart-receita');
    if (!ctx) return;
    if (chartReceita) chartReceita.destroy();

    chartReceita = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: dados,
          backgroundColor: dados.map((_, i) => i === dados.length - 1 ? 'rgba(96,192,191,.9)' : 'rgba(91,174,226,.6)'),
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => formatBRL(ctx.parsed.y) } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Montserrat', size: 11 }, color: '#5E7A9A' } },
          y: {
            grid: { color: 'rgba(0,0,0,.04)' },
            ticks: { font: { family: 'Montserrat', size: 10 }, color: '#5E7A9A', callback: v => 'R$ ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) }
          }
        }
      }
    });
  },

  renderChartOrigens(origens) {
    const labels = Object.keys(origens || {});
    const dados  = Object.values(origens || {});
    const temDados = dados.some(v => v > 0);

    if (!temDados || !labels.length) {
      if (chartOrigens) { chartOrigens.destroy(); chartOrigens = null; }
      this._emptyChart('wrap-chart-origens', 'Nenhum lead registrado');
      return;
    }

    this._restoreCanvas('wrap-chart-origens', 'chart-origens');
    const ctx = document.getElementById('chart-origens');
    if (!ctx) return;
    if (chartOrigens) chartOrigens.destroy();

    const cores = ['#5BAEE2','#60C0BF','#1D2951','#80B8B8','#3d8cc4','#44a8a7','#253463','#7ec3ea'];
    chartOrigens = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: dados, backgroundColor: cores.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Montserrat', size: 11 }, color: '#3E5475', padding: 12, boxWidth: 10, borderRadius: 3 } }
        }
      }
    });
  },

  renderChartPac(porPac) {
    const pacs     = Object.keys(porPac || {});
    const receitas = pacs.map(p => porPac[p].receita);
    const temDados = receitas.some(v => v > 0);

    if (!temDados || !pacs.length) {
      if (chartPac) { chartPac.destroy(); chartPac = null; }
      this._emptyChart('wrap-chart-pac', 'Nenhuma venda no período');
      return;
    }

    this._restoreCanvas('wrap-chart-pac', 'chart-pac');
    const ctx = document.getElementById('chart-pac');
    if (!ctx) return;
    if (chartPac) chartPac.destroy();

    chartPac = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: pacs,
        datasets: [{ data: receitas, backgroundColor: ['#5BAEE2','#60C0BF','#1D2951','#80B8B8'], borderRadius: 8, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => formatBRL(ctx.parsed.x) } }
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { family: 'Montserrat', size: 10 }, color: '#5E7A9A', callback: v => 'R$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } },
          y: { grid: { display: false }, ticks: { font: { family: 'Montserrat', size: 12 }, color: '#1D2951' } }
        }
      }
    });
  },

  renderRankingCursos(cursos) {
    const tbody = document.getElementById('ranking-cursos');
    if (!tbody) return;

    const sorted = Object.entries(cursos || {}).sort((a,b) => b[1] - a[1]).slice(0, 8);

    if (!sorted.length) {
      tbody.innerHTML = `
        <tr><td colspan="3">
          <div class="empty-state" style="padding:32px 24px">
            <div class="icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4">
                <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-4"/>
              </svg>
            </div>
            <p>Nenhuma venda no período</p>
          </div>
        </td></tr>`;
      return;
    }

    const max = sorted[0][1];
    tbody.innerHTML = sorted.map(([curso, qtd], i) => `
      <tr>
        <td style="width:24px;color:var(--gray-300);font-size:.8rem">${i+1}</td>
        <td>
          <div style="font-size:.85rem;font-weight:500;color:var(--navy);margin-bottom:4px" title="${curso}">${curso}</div>
          <div style="height:4px;background:var(--gray-100);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${(qtd/max*100).toFixed(0)}%;background:linear-gradient(90deg,var(--blue),var(--teal));border-radius:2px;transition:width .6s ease"></div>
          </div>
        </td>
        <td style="text-align:right;font-weight:700;color:var(--navy);font-size:.9rem">${qtd}</td>
      </tr>
    `).join('');
  },

  // ── Loading ────────────────────────────────────────────────

  setLoading(on) {
    // Mostra overlay no carregamento inicial e sempre consegue remove-lo ao finalizar.
    const overlay = on && this._primeiraVez
      ? this._getOverlay()
      : document.getElementById('dashboard-loading-overlay');

    if (overlay) {
      overlay.classList.toggle('active', on);
      if (!on) setTimeout(() => overlay.remove(), 220);
    }

    document.querySelectorAll('.kpi-value').forEach(el => {
      if (on && !el.querySelector('.kpi-skeleton')) {
        el.innerHTML = '<div class="kpi-skeleton"></div>';
      }
    });
  },

  _getOverlay() {
    let overlay = document.getElementById('dashboard-loading-overlay');
    if (overlay) return overlay;
    const page = document.querySelector('.page');
    if (!page) return null;
    overlay = document.createElement('div');
    overlay.id = 'dashboard-loading-overlay';
    overlay.className = 'dashboard-loading-overlay';
    overlay.innerHTML = `
      <div class="dashboard-loading-card">
        <img class="dashboard-loading-logo" src="assets/img/logo.png" alt="SAFE">
        <div class="dashboard-loading-text">Carregando dados</div>
      </div>`;
    page.appendChild(overlay);
    return overlay;
  },

  // ── Sidebar ────────────────────────────────────────────────

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

document.addEventListener('DOMContentLoaded', () => {
  Dashboard.init().catch(err => {
    console.error('[Dashboard init]', err);
    Dashboard.setLoading(false);
    toast('Erro ao iniciar o dashboard.', 'error');
  });
});
