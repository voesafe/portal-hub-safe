// ============================================================
// fechamento-horas.js - Fechamento mensal de horas e cotistas
// ============================================================

const FechamentoHoras = {
  dados: null,
  rascunho: null,
  editando: false,
  alterado: false,
  view: 'visao',
  aircraftTab: 'geral',
  charts: {},
  uploadProcessado: null,
  confirmacaoPendente: null,

  aircraftTabs: [
    { id: 'geral', label: 'Geral', tipos: null },
    { id: 'mc01', label: 'MC-01', tipos: ['PS-LOM', 'PS-SFE', 'PS-SFH', 'PS-SFI'] },
    { id: 'colt', label: 'COLT', tipos: ['PS-SFJ', 'PS-SFL'] },
    { id: 'sira', label: 'SIRA', tipos: ['PS-SFP'] },
    { id: 'sim', label: 'Simulador', tipos: ['SM-SJK', 'SM-CPQ'] },
    {
      id: 'cotista',
      label: 'Cotista',
      tipos: ['PS-LOM', 'PS-SFE', 'PS-SFH', 'PS-SFI'],
      campo: 'cotista_horas'
    }
  ],

  async init() {
    if (!Auth.protegerFechamentoHoras()) return;
    Auth.preencherUI();
    this.inicializarSidebar();
    this.inicializarFiltros();
    this.inicializarEventos();
    this.renderizarAircraftTabs();
    await this.carregar();

    window.addEventListener('beforeunload', event => {
      if (!this.alterado) return;
      event.preventDefault();
      event.returnValue = '';
    });
  },

  inicializarSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('hamburger');
    hamburger?.addEventListener('click', () => {
      sidebar?.classList.toggle('mobile-open');
      overlay?.classList.toggle('active');
    });
    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  },

  inicializarFiltros() {
    const agora = new Date();
    const mes = document.getElementById('fh-mes');
    const ano = document.getElementById('fh-ano');
    mes.innerHTML = CONFIG.MESES.slice(1)
      .map((nome, index) => `<option value="${index + 1}">${nome}</option>`)
      .join('');

    const anoAtual = Math.max(2026, agora.getFullYear());
    const anos = [];
    for (let valor = 2026; valor <= anoAtual + 1; valor++) anos.push(valor);
    ano.innerHTML = anos.map(valor => `<option value="${valor}">${valor}</option>`).join('');
    mes.value = String(agora.getMonth() + 1);
    ano.value = String(anoAtual);
  },

  inicializarEventos() {
    document.querySelectorAll('.fechamento-tab').forEach(botao => {
      botao.addEventListener('click', () => this.alterarView(botao.dataset.view));
    });
    document.getElementById('fh-mes').addEventListener('change', () => this.trocarPeriodo());
    document.getElementById('fh-ano').addEventListener('change', () => this.trocarPeriodo());
    document.getElementById('fh-btn-editar').addEventListener('click', () => this.iniciarEdicao());
    document.getElementById('fh-btn-cancelar').addEventListener('click', () => this.cancelarEdicao());
    document.getElementById('fh-btn-salvar').addEventListener('click', () => this.abrirRevisao());
    document.getElementById('fh-save-confirm').addEventListener('click', () => this.salvar());
    document.getElementById('fh-btn-upload').addEventListener('click', () => this.abrirUpload());
    document.getElementById('fh-upload-input').addEventListener('change', event => {
      if (event.target.files[0]) this.processarUpload(event.target.files[0]);
    });
    document.getElementById('fh-upload-aplicar').addEventListener('click', () => this.aplicarUpload());
    document.getElementById('fh-btn-status').addEventListener('click', () => this.confirmarAlteracaoStatus());
    document.getElementById('fh-status-confirm').addEventListener('click', () => {
      const acao = this.confirmacaoPendente;
      this.confirmacaoPendente = null;
      fecharModal('fh-modal-status');
      if (acao) acao();
    });
    document.getElementById('fh-btn-recarregar').addEventListener('click', () => {
      if (!this.alterado) {
        this.carregar(false);
        return;
      }
      this.abrirConfirmacao(
        'Descartar alterações?',
        'As alterações locais deste mês serão descartadas e os dados serão carregados novamente.',
        () => this.carregar(false)
      );
    });

    const zona = document.getElementById('fh-upload-zone');
    zona.addEventListener('dragover', event => {
      event.preventDefault();
      zona.classList.add('dragover');
    });
    zona.addEventListener('dragleave', () => zona.classList.remove('dragover'));
    zona.addEventListener('drop', event => {
      event.preventDefault();
      zona.classList.remove('dragover');
      if (event.dataTransfer.files[0]) this.processarUpload(event.dataTransfer.files[0]);
    });

    document.querySelectorAll('[data-close]').forEach(botao => {
      botao.addEventListener('click', () => fecharModal(botao.dataset.close));
    });
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', event => {
        if (event.target !== modal) return;
        if (modal.id === 'fh-modal-status') {
          const cancelar = modal._cancelar;
          modal._cancelar = null;
          this.confirmacaoPendente = null;
          if (cancelar) cancelar();
        }
        fecharModal(modal.id);
      });
    });
  },

  periodo() {
    return {
      mes: Number(document.getElementById('fh-mes').value),
      ano: Number(document.getElementById('fh-ano').value)
    };
  },

  trocarPeriodo() {
    if (!this.alterado) {
      this.carregar();
      return;
    }
    const anterior = { ano: this.dados.ano, mes: this.dados.mes };
    this.abrirConfirmacao(
      'Trocar período?',
      'As alterações locais ainda não foram salvas.',
      () => this.carregar(),
      () => {
        document.getElementById('fh-ano').value = String(anterior.ano);
        document.getElementById('fh-mes').value = String(anterior.mes);
      }
    );
  },

  alterarView(view) {
    this.view = view;
    document.querySelectorAll('.fechamento-tab').forEach(botao => {
      botao.classList.toggle('active', botao.dataset.view === view);
    });
    document.querySelectorAll('.fechamento-view').forEach(secao => {
      secao.classList.toggle('active', secao.id === `fh-view-${view}`);
    });
    Object.values(this.charts).forEach(chart => chart?.resize());
  },

  setLoading(ativo, texto = 'Carregando fechamento de horas') {
    const loading = document.getElementById('fh-loading');
    loading.querySelector('span').textContent = texto;
    loading.classList.toggle('active', ativo);
  },

  async carregar(useCache = true) {
    const { ano, mes } = this.periodo();
    this.setLoading(true);
    const resposta = await API.getFechamentoHoras(ano, mes, useCache);
    this.setLoading(false);
    if (!resposta.ok) {
      if (this.dados) {
        document.getElementById('fh-ano').value = String(this.dados.ano);
        document.getElementById('fh-mes').value = String(this.dados.mes);
      }
      this.tratarErro(resposta.error);
      return;
    }

    this.dados = resposta.data;
    this.rascunho = this.clonar(this.dados.selecionado);
    this.editando = false;
    this.alterado = false;
    this.renderizar();
  },

  tratarErro(mensagem) {
    const texto = mensagem || 'Não foi possível carregar o fechamento de horas.';
    toast(texto, 'error', 5500);
    if (/sess[aã]o expirada/i.test(texto)) setTimeout(() => Auth.logout(), 1600);
  },

  clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  },

  renderizar() {
    this.renderizarKpisAno();
    this.renderizarGraficosAno();
    this.renderizarStatus();
    this.renderizarKpisMes();
    this.renderizarAircraftTabs();
    this.renderizarTabelaHoras();
    this.renderizarGraficoAeronaves();
    this.renderizarMetricas();
    this.renderizarHistorico();
  },

  formatarHoras(valor) {
    return `${Number(valor || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} h`;
  },

  formatarNumero(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      maximumFractionDigits: 1
    });
  },

  totalHoras(horas, campo = 'horas') {
    return horas.reduce((total, item) => total + Number(item[campo] || 0), 0);
  },

  valorMetrica(nome) {
    const alvo = this.normalizarTexto(nome);
    const item = this.rascunho.metricas.find(metrica =>
      this.normalizarTexto(metrica.metrica) === alvo
    );
    return Number(item?.valor || 0);
  },

  normalizarTexto(valor) {
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  },

  criarKpi(label, valor, sub = '') {
    return `
      <div class="kpi-card">
        <span class="kpi-label">${label}</span>
        <strong class="kpi-value">${valor}</strong>
        <span class="kpi-sub">${sub}</span>
      </div>
    `;
  },

  renderizarKpisAno() {
    const meses = Object.values(this.dados.meses || {});
    const total = meses.reduce((soma, item) => soma + Number(item.total || 0), 0);
    const alunos = meses.reduce((soma, item) => soma + Number(item.alunosNovos || 0), 0);
    const cheques = meses.reduce((soma, item) => soma + Number(item.cheques || 0), 0);
    const solos = meses.reduce((soma, item) => soma + Number(item.voosSolos || 0), 0);
    const comDados = meses.filter(item => item.temDados).length;
    const media = comDados ? total / comDados : 0;
    document.getElementById('fh-kpis-ano').innerHTML = [
      this.criarKpi('Horas totais no ano', this.formatarHoras(total), String(this.dados.ano)),
      this.criarKpi('Alunos novos', this.formatarNumero(alunos), 'Acumulado anual'),
      this.criarKpi('Cheques', this.formatarNumero(cheques), 'Acumulado anual'),
      this.criarKpi('Voos solos', this.formatarNumero(solos), 'Acumulado anual'),
      this.criarKpi('Meses com dados', comDados, 'De 12 meses'),
      this.criarKpi('Média mensal', this.formatarHoras(media), 'Meses preenchidos')
    ].join('');
  },

  renderizarKpisMes() {
    const resumo = this.calcularResumoRascunho();
    document.getElementById('fh-kpis-mes').innerHTML = [
      this.criarKpi('Total de horas', this.formatarHoras(resumo.total), 'Voo + simulador'),
      this.criarKpi('Horas SJK', this.formatarHoras(resumo.sjk), 'Base São José dos Campos'),
      this.criarKpi('Horas CPQ', this.formatarHoras(resumo.cpq), 'Base Campinas'),
      this.criarKpi('Alunos novos', this.formatarNumero(this.valorMetrica('Alunos Novos')), 'Lançamento manual'),
      this.criarKpi('Cheques', this.formatarNumero(this.valorMetrica('Número de Cheques')), 'Lançamento manual'),
      this.criarKpi('Voos solos', this.formatarNumero(this.valorMetrica('Número de Voos Solos')), 'Lançamento manual')
    ].join('');
  },

  calcularResumoRascunho() {
    const horas = this.rascunho?.horas || [];
    return horas.reduce((resumo, item) => {
      const valor = Number(item.horas || 0);
      resumo.total += valor;
      if (item.base === 'SJK') resumo.sjk += valor;
      if (item.base === 'CPQ') resumo.cpq += valor;
      if (String(item.tipo).startsWith('SM-')) resumo.simulador += valor;
      resumo.cotista += Number(item.cotista_horas || 0);
      return resumo;
    }, { total: 0, sjk: 0, cpq: 0, simulador: 0, cotista: 0 });
  },

  destruirChart(nome) {
    if (!this.charts[nome]) return;
    this.charts[nome].destroy();
    delete this.charts[nome];
  },

  opcoesChart(sufixo = 'h') {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            padding: 16,
            font: { family: 'Montserrat', size: 11 }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(188, 200, 220, .25)' },
          ticks: { callback: valor => `${valor}${sufixo}` }
        }
      }
    };
  },

  renderizarGraficosAno() {
    const meses = Array.from({ length: 12 }, (_, index) =>
      this.dados.meses[String(index + 1)] || {}
    );
    const labels = CONFIG.MESES.slice(1).map(nome => nome.slice(0, 3));
    const totais = meses.map(item => Number(item.total || 0));
    const sjk = meses.map(item => Number(item.sjk || 0));
    const cpq = meses.map(item => Number(item.cpq || 0));
    const alunos = meses.map(item => Number(item.alunosNovos || 0));

    this.renderizarChartComVazio(
      'meses',
      'fh-chart-meses',
      'fh-empty-meses',
      totais.some(valor => valor > 0),
      () => new Chart(document.getElementById('fh-chart-meses'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Horas',
            data: totais,
            backgroundColor: '#5BAEE2',
            borderRadius: 4
          }]
        },
        options: this.opcoesChart()
      })
    );

    this.renderizarChartComVazio(
      'bases',
      'fh-chart-bases',
      'fh-empty-bases',
      [...sjk, ...cpq].some(valor => valor > 0),
      () => {
        const options = this.opcoesChart();
        options.scales.x.stacked = true;
        options.scales.y.stacked = true;
        return new Chart(document.getElementById('fh-chart-bases'), {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'SJK', data: sjk, backgroundColor: '#5BAEE2', borderRadius: 3 },
              { label: 'CPQ', data: cpq, backgroundColor: '#60C0BF', borderRadius: 3 }
            ]
          },
          options
        });
      }
    );

    this.renderizarChartComVazio(
      'alunos',
      'fh-chart-alunos',
      'fh-empty-alunos',
      alunos.some(valor => valor > 0),
      () => new Chart(document.getElementById('fh-chart-alunos'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Alunos novos',
            data: alunos,
            borderColor: '#F39C12',
            backgroundColor: 'rgba(243, 156, 18, .09)',
            fill: true,
            tension: .3,
            pointRadius: 4
          }]
        },
        options: this.opcoesChart('')
      })
    );
  },

  renderizarChartComVazio(nome, canvasId, vazioId, temDados, criar) {
    this.destruirChart(nome);
    document.getElementById(canvasId).hidden = !temDados;
    document.getElementById(vazioId).hidden = temDados;
    if (temDados) this.charts[nome] = criar();
  },

  renderizarStatus() {
    const selecionado = this.dados.selecionado;
    const status = document.getElementById('fh-status');
    const btnStatus = document.getElementById('fh-btn-status');
    const btnEditar = document.getElementById('fh-btn-editar');
    const btnCancelar = document.getElementById('fh-btn-cancelar');
    const btnSalvar = document.getElementById('fh-btn-salvar');
    const btnUpload = document.getElementById('fh-btn-upload');

    status.className = 'fechamento-status';
    if (this.editando) {
      status.classList.add('editing');
      status.textContent = this.alterado ? 'Edição não salva' : 'Em edição';
    } else if (selecionado.fechado) {
      status.classList.add('closed');
      status.textContent = 'Mês fechado';
    } else {
      status.textContent = 'Mês aberto';
    }

    document.getElementById('fh-competencia').textContent =
      `${CONFIG.MESES[this.dados.mes]} de ${this.dados.ano}`;
    document.getElementById('fh-audit').textContent = selecionado.atualizadoEm
      ? `Versão ${selecionado.versao} · atualizado por ${selecionado.atualizadoPor || 'usuário não identificado'} em ${this.formatarDataHora(selecionado.atualizadoEm)}`
      : `Versão ${selecionado.versao} · sem alterações registradas`;

    btnStatus.textContent = selecionado.fechado ? 'Reabrir mês' : 'Fechar mês';
    btnStatus.hidden = this.editando;
    btnEditar.hidden = this.editando || selecionado.fechado;
    btnCancelar.hidden = !this.editando;
    btnSalvar.hidden = !this.editando;
    btnUpload.hidden = !this.editando;
  },

  formatarDataHora(valor) {
    if (!valor) return '—';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  iniciarEdicao() {
    if (this.dados.selecionado.fechado) {
      toast('Reabra o mês antes de editar.', 'warning');
      return;
    }
    this.editando = true;
    this.alterado = false;
    this.renderizarStatus();
    this.renderizarTabelaHoras();
    this.renderizarMetricas();
  },

  cancelarEdicao() {
    if (!this.alterado) {
      this.encerrarEdicao();
      return;
    }
    this.abrirConfirmacao(
      'Cancelar edição?',
      'As alterações locais deste mês serão descartadas.',
      () => this.encerrarEdicao()
    );
  },

  encerrarEdicao() {
    this.rascunho = this.clonar(this.dados.selecionado);
    this.editando = false;
    this.alterado = false;
    this.renderizarStatus();
    this.renderizarKpisMes();
    this.renderizarTabelaHoras();
    this.renderizarGraficoAeronaves();
    this.renderizarMetricas();
  },

  marcarAlterado() {
    this.alterado = true;
    this.renderizarStatus();
    this.renderizarKpisMes();
  },

  renderizarAircraftTabs() {
    const container = document.getElementById('fh-aircraft-tabs');
    container.innerHTML = this.aircraftTabs.map(tab => `
      <button
        class="fechamento-aircraft-tab${tab.id === this.aircraftTab ? ' active' : ''}"
        data-aircraft-tab="${tab.id}">
        ${tab.label}
      </button>
    `).join('');
    container.querySelectorAll('[data-aircraft-tab]').forEach(botao => {
      botao.addEventListener('click', () => {
        this.aircraftTab = botao.dataset.aircraftTab;
        this.renderizarAircraftTabs();
        this.renderizarTabelaHoras();
        this.renderizarGraficoAeronaves();
      });
    });
  },

  filtroAtual() {
    return this.aircraftTabs.find(tab => tab.id === this.aircraftTab) || this.aircraftTabs[0];
  },

  linhasFiltradas() {
    const filtro = this.filtroAtual();
    const linhas = filtro.tipos
      ? this.rascunho.horas.filter(item => filtro.tipos.includes(item.tipo))
      : this.rascunho.horas;
    return {
      filtro,
      linhas,
      campo: filtro.campo || 'horas'
    };
  },

  renderizarTabelaHoras() {
    const { filtro, linhas, campo } = this.linhasFiltradas();
    const tbody = document.getElementById('fh-horas-body');
    document.getElementById('fh-table-sub').textContent = campo === 'cotista_horas'
      ? 'Horas MC-01 elegíveis para pagamento dos cotistas'
      : 'Valores consolidados do mês';

    tbody.innerHTML = linhas.map(item => `
      <tr>
        <td><span class="fechamento-base-badge ${item.base.toLowerCase()}">${item.base}</span></td>
        <td><strong>${this.escapeHtml(item.tipo)}</strong></td>
        <td class="text-right">
          <input
            class="form-control fechamento-hour-input"
            type="number"
            min="0"
            max="750"
            step="0.1"
            inputmode="decimal"
            data-tipo="${this.escapeHtml(item.tipo)}"
            data-campo="${campo}"
            value="${Number(item[campo] || 0).toFixed(1)}"
            ${this.editando ? '' : 'disabled'}>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.fechamento-hour-input').forEach(input => {
      input.addEventListener('input', () => {
        const item = this.rascunho.horas.find(row => row.tipo === input.dataset.tipo);
        const valor = Math.max(0, Math.min(750, Number(input.value) || 0));
        if (input.dataset.campo === 'cotista_horas') {
          item.cotista_horas = Math.min(valor, Number(item.horas || 0));
        } else {
          item.horas = valor;
          if (item.cotista_horas !== null && Number(item.cotista_horas) > valor) {
            item.cotista_horas = valor;
          }
        }
        this.marcarAlterado();
        this.atualizarTotalTabela();
        this.renderizarGraficoAeronaves();
      });
      input.addEventListener('blur', () => {
        const item = this.rascunho.horas.find(row => row.tipo === input.dataset.tipo);
        input.value = Number(item[input.dataset.campo] || 0).toFixed(1);
      });
    });

    document.getElementById('fh-horas-total-label').textContent =
      filtro.id === 'geral' ? 'Total' : `Total ${filtro.label}`;
    this.atualizarTotalTabela();
  },

  atualizarTotalTabela() {
    const { linhas, campo } = this.linhasFiltradas();
    document.getElementById('fh-horas-total').textContent =
      this.formatarHoras(this.totalHoras(linhas, campo));
  },

  renderizarGraficoAeronaves() {
    const { linhas, campo } = this.linhasFiltradas();
    const valores = linhas.map(item => Number(item[campo] || 0));
    this.renderizarChartComVazio(
      'aeronaves',
      'fh-chart-aeronaves',
      'fh-empty-aeronaves',
      valores.some(valor => valor > 0),
      () => new Chart(document.getElementById('fh-chart-aeronaves'), {
        type: 'bar',
        data: {
          labels: linhas.map(item => item.tipo),
          datasets: [{
            data: valores,
            backgroundColor: linhas.map(item =>
              item.base === 'SJK' ? '#5BAEE2' : '#60C0BF'
            ),
            borderRadius: 4
          }]
        },
        options: {
          ...this.opcoesChart(),
          indexAxis: 'y',
          plugins: { legend: { display: false } }
        }
      })
    );
  },

  renderizarMetricas() {
    const container = document.getElementById('fh-metricas');
    container.innerHTML = this.rascunho.metricas.map((item, index) => `
      <div class="fechamento-metrica-label">${this.escapeHtml(item.metrica)}</div>
      <div class="fechamento-metrica-value">
        <input
          class="form-control fechamento-metric-input"
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          data-index="${index}"
          value="${Number(item.valor || 0)}"
          ${this.editando ? '' : 'disabled'}>
      </div>
    `).join('');

    container.querySelectorAll('.fechamento-metric-input').forEach(input => {
      input.addEventListener('input', () => {
        const valor = Math.max(0, Number(input.value) || 0);
        this.rascunho.metricas[Number(input.dataset.index)].valor = valor;
        this.marcarAlterado();
      });
    });
  },

  renderizarHistorico() {
    const container = document.getElementById('fh-history');
    const historico = this.dados.historico || [];
    if (!historico.length) {
      container.innerHTML = '<div class="text-muted text-sm">Nenhuma alteração registrada neste mês.</div>';
      return;
    }
    const labels = {
      SALVAMENTO: 'Dados salvos',
      FECHAMENTO: 'Mês fechado',
      REABERTURA: 'Mês reaberto'
    };
    container.innerHTML = historico.map(item => `
      <div class="fechamento-history-item">
        <span class="fechamento-history-dot"></span>
        <div>
          <div class="fechamento-history-title">${labels[item.acao] || this.escapeHtml(item.acao)}</div>
          <div class="fechamento-history-meta">
            ${this.escapeHtml(item.usuario || 'Usuário não identificado')} ·
            ${this.formatarDataHora(item.data)} · versão ${item.versaoNova}
          </div>
        </div>
      </div>
    `).join('');
  },

  abrirUpload() {
    this.uploadProcessado = null;
    document.getElementById('fh-upload-input').value = '';
    document.getElementById('fh-upload-result').hidden = true;
    document.getElementById('fh-upload-result').textContent = '';
    document.getElementById('fh-upload-aplicar').disabled = true;
    abrirModal('fh-modal-upload');
  },

  processarUpload(file) {
    const resultado = document.getElementById('fh-upload-result');
    resultado.hidden = false;
    resultado.textContent = 'Lendo arquivo...';
    document.getElementById('fh-upload-aplicar').disabled = true;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!rows.length) throw new Error('Arquivo vazio ou inválido.');

        const keys = Object.keys(rows[0]);
        const encontrar = candidatos => keys.find(chave =>
          candidatos.includes(chave.toLowerCase().replace(/\s+/g, '_'))
        );
        const colAero = encontrar(['aeronave']);
        const colHoras = encontrar(['tempo_total_decimal_export']);
        const colAluno = encontrar(['aluno']);
        if (!colAero || !colHoras || !colAluno) {
          throw new Error('O arquivo não possui as colunas padrão Aeronave, Aluno e Tempo total decimal export.');
        }

        const baseMap = {
          'PS-LOM': 'SJK',
          'PS-SFE': 'SJK',
          'PS-SFH': 'SJK',
          'PS-SFI': 'SJK',
          'PS-SFJ': 'CPQ',
          'PS-SFL': 'CPQ',
          'PS-SFP': 'SJK',
          'SM-SJK': 'SJK',
          'SM-CPQ': 'CPQ'
        };
        const validas = Object.keys(baseMap);
        const mc01 = ['PS-LOM', 'PS-SFE', 'PS-SFH', 'PS-SFI'];
        const horas = Object.fromEntries(validas.map(tipo => [tipo, 0]));
        const cotistas = Object.fromEntries(validas.map(tipo => [tipo, 0]));
        let excluidasVazio = 0;
        let excluidasAdministrativo = 0;

        rows.forEach(row => {
          let aero = String(row[colAero] || '').trim().toUpperCase();
          aero = aero
            .replace('SM-CPQ (CAMPINAS)', 'SM-CPQ')
            .replace('SM-SJK (SAO JOSE DOS CAMPOS)', 'SM-SJK')
            .replace('SM-SJK (SÃO JOSÉ DOS CAMPOS)', 'SM-SJK');
          if (!validas.includes(aero)) return;

          const valor = Number(String(row[colHoras] || '0').replace(',', '.')) || 0;
          horas[aero] += valor;
          if (!mc01.includes(aero)) return;

          const aluno = String(row[colAluno] || '').trim().toUpperCase();
          if (!aluno) {
            excluidasVazio += valor;
          } else if (aluno === 'VOO ADMINISTRATIVO - SAFE') {
            excluidasAdministrativo += valor;
          } else {
            cotistas[aero] += valor;
          }
        });

        const processado = validas.map(tipo => ({
          base: baseMap[tipo],
          tipo,
          horas: Math.round(horas[tipo] * 10) / 10,
          cotista_horas: mc01.includes(tipo)
            ? Math.round(cotistas[tipo] * 10) / 10
            : null
        }));
        this.uploadProcessado = processado;

        const total = this.totalHoras(processado);
        const totalCotista = this.totalHoras(processado, 'cotista_horas');
        const linhas = processado.map(item => {
          const cotista = item.cotista_horas === null
            ? ''
            : ` | cotista ${this.formatarHoras(item.cotista_horas)}`;
          return `${item.tipo}: ${this.formatarHoras(item.horas)}${cotista}`;
        });
        linhas.push('');
        linhas.push(`TOTAL GERAL: ${this.formatarHoras(total)}`);
        linhas.push(`TOTAL COTISTAS: ${this.formatarHoras(totalCotista)}`);
        linhas.push(`EXCLUÍDO SEM ALUNO: ${this.formatarHoras(excluidasVazio)}`);
        linhas.push(`EXCLUÍDO ADMINISTRATIVO: ${this.formatarHoras(excluidasAdministrativo)}`);
        resultado.textContent = linhas.join('\n');
        document.getElementById('fh-upload-aplicar').disabled = false;
      } catch (error) {
        this.uploadProcessado = null;
        resultado.textContent = `Erro ao processar: ${error.message}`;
      }
    };
    reader.readAsArrayBuffer(file);
  },

  aplicarUpload() {
    if (!this.uploadProcessado) return;
    this.rascunho.horas = this.clonar(this.uploadProcessado);
    this.marcarAlterado();
    fecharModal('fh-modal-upload');
    this.renderizarTabelaHoras();
    this.renderizarGraficoAeronaves();
    toast('Horas importadas. Revise os dados antes de salvar.', 'success', 4500);
  },

  abrirRevisao() {
    if (!this.alterado) {
      toast('Nenhuma alteração para salvar.', 'info');
      return;
    }
    const resumo = this.calcularResumoRascunho();
    document.getElementById('fh-review').innerHTML = [
      ['Competência', `${CONFIG.MESES[this.dados.mes]} de ${this.dados.ano}`],
      ['Total de horas', this.formatarHoras(resumo.total)],
      ['Base SJK', this.formatarHoras(resumo.sjk)],
      ['Base CPQ', this.formatarHoras(resumo.cpq)],
      ['Simuladores', this.formatarHoras(resumo.simulador)],
      ['Cotistas', this.formatarHoras(resumo.cotista)]
    ].map(([label, valor]) => `
      <div class="fechamento-review-item">
        <span>${label}</span>
        <strong>${valor}</strong>
      </div>
    `).join('');
    abrirModal('fh-modal-save');
  },

  async salvar() {
    const botao = document.getElementById('fh-save-confirm');
    btnLoading(botao, true);
    const resposta = await API.salvarFechamentoHoras({
      ano: this.dados.ano,
      mes: this.dados.mes,
      versao: this.dados.selecionado.versao,
      horas: this.rascunho.horas,
      metricas: this.rascunho.metricas
    });
    btnLoading(botao, false);
    if (!resposta.ok) {
      fecharModal('fh-modal-save');
      this.tratarErro(resposta.error);
      return;
    }

    fecharModal('fh-modal-save');
    this.dados = resposta.data;
    this.rascunho = this.clonar(this.dados.selecionado);
    this.editando = false;
    this.alterado = false;
    this.renderizar();
    toast('Fechamento salvo e versão anterior preservada.', 'success', 4500);
  },

  confirmarAlteracaoStatus() {
    const fechar = !this.dados.selecionado.fechado;
    this.abrirConfirmacao(
      fechar ? 'Fechar o mês?' : 'Reabrir o mês?',
      fechar
        ? 'O fechamento bloqueará edições até que um usuário autorizado reabra o mês.'
        : 'O mês voltará a aceitar edições. A reabertura ficará registrada no histórico.',
      () => this.alterarStatus(fechar)
    );
  },

  async alterarStatus(fechado) {
    this.setLoading(true, fechado ? 'Fechando mês' : 'Reabrindo mês');
    const resposta = await API.alterarStatusFechamentoHoras(
      this.dados.ano,
      this.dados.mes,
      fechado,
      this.dados.selecionado.versao
    );
    this.setLoading(false);
    if (!resposta.ok) {
      this.tratarErro(resposta.error);
      return;
    }
    this.dados = resposta.data;
    this.rascunho = this.clonar(this.dados.selecionado);
    this.editando = false;
    this.alterado = false;
    this.renderizar();
    toast(fechado ? 'Mês fechado com sucesso.' : 'Mês reaberto para edição.', 'success');
  },

  abrirConfirmacao(titulo, texto, confirmar, cancelar = null) {
    document.getElementById('fh-status-title').textContent = titulo;
    document.getElementById('fh-status-copy').textContent = texto;
    this.confirmacaoPendente = confirmar;
    const modal = document.getElementById('fh-modal-status');
    modal.dataset.cancelCallback = cancelar ? 'true' : '';
    modal._cancelar = cancelar;
    abrirModal('fh-modal-status');
  },

  escapeHtml(valor) {
    return String(valor || '').replace(/[&<>"']/g, caractere => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[caractere]);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-close="fh-modal-status"]').forEach(botao => {
    botao.addEventListener('click', () => {
      const modal = document.getElementById('fh-modal-status');
      const cancelar = modal._cancelar;
      modal._cancelar = null;
      FechamentoHoras.confirmacaoPendente = null;
      if (cancelar) cancelar();
    });
  });
  FechamentoHoras.init();
});
