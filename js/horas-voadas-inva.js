// ============================================================
// horas-voadas-inva.js — Integração do painel externo ao Hub
// ============================================================

const HorasVoadasInva = {
  instrutores: [],
  grafico: null,

  escape(valor) {
    const el = document.createElement('div');
    el.textContent = String(valor ?? '');
    return el.innerHTML;
  },

  dataLocalIso() {
    const agora = new Date();
    const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  },

  setCarregando(ativo, texto = 'Carregando horas voadas...') {
    const overlay = document.getElementById('horas-inva-loading');
    const label = document.getElementById('horas-inva-loading-text');
    if (label) label.textContent = texto;
    overlay?.classList.toggle('active', ativo);
  },

  async requisitar(action, params = {}) {
    const urlBase = CONFIG.HORAS_VOADAS_INVA_API_URL;
    if (!urlBase) throw new Error('A URL do backend de horas voadas não foi configurada.');

    const query = new URLSearchParams({ action, ...params });
    const resposta = await fetch(`${urlBase}?${query.toString()}`, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    });
    if (!resposta.ok) throw new Error(`Falha na comunicação com o backend (HTTP ${resposta.status}).`);
    return resposta.json();
  },

  async enviar(action, data) {
    const resposta = await fetch(CONFIG.HORAS_VOADAS_INVA_API_URL, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      body: JSON.stringify({ action, data })
    });
    if (!resposta.ok) throw new Error(`Falha na comunicação com o backend (HTTP ${resposta.status}).`);
    return resposta.json();
  },

  mudarView(id) {
    document.querySelectorAll('.horas-inva-tab').forEach(tab => {
      const ativo = tab.dataset.view === id;
      tab.classList.toggle('active', ativo);
      tab.setAttribute('aria-selected', String(ativo));
    });
    document.querySelectorAll('.horas-inva-view').forEach(view => {
      view.classList.toggle('active', view.id === id);
    });
  },

  atualizarKpis() {
    const totalHoras = this.instrutores.reduce(
      (soma, instrutor) => soma + (Number.parseFloat(instrutor.totalHoras) || 0),
      0
    );
    const clt = this.instrutores.filter(
      instrutor => String(instrutor.tipo || '').trim().toLowerCase() === 'clt'
    ).length;

    document.getElementById('kpi-instrutores').textContent = this.instrutores.length;
    document.getElementById('kpi-horas').textContent =
      `${totalHoras.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}h`;
    document.getElementById('kpi-clt').textContent = clt;
    document.getElementById('kpi-eventuais').textContent = this.instrutores.length - clt;
  },

  renderizarTabela(filtro = '') {
    const tbody = document.getElementById('instrutores-tbody');
    const termo = String(filtro).trim().toLocaleLowerCase('pt-BR');
    const lista = this.instrutores.filter(instrutor =>
      String(instrutor.nome || '').toLocaleLowerCase('pt-BR').includes(termo)
    );

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="horas-inva-empty">${
        termo ? 'Nenhum instrutor encontrado.' : 'Nenhum instrutor cadastrado.'
      }</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(instrutor => {
      const tipo = String(instrutor.tipo || 'Não informado');
      const classe = tipo.trim().toLowerCase() === 'clt' ? 'clt' : 'eventual';
      const horas = Number.parseFloat(instrutor.totalHoras) || 0;
      return `
        <tr>
          <td><strong>${this.escape(instrutor.nome)}</strong></td>
          <td><span class="horas-inva-badge ${classe}">${this.escape(tipo)}</span></td>
          <td><span class="horas-inva-hours">${horas.toLocaleString('pt-BR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2
          })}h</span></td>
        </tr>
      `;
    }).join('');
  },

  renderizarGrafico() {
    if (typeof Chart === 'undefined') {
      toast('Não foi possível carregar o componente do gráfico.', 'warning');
      return;
    }
    const canvas = document.getElementById('hours-chart');
    if (!canvas) return;
    this.grafico?.destroy();

    this.grafico = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: this.instrutores.map(instrutor => instrutor.nome),
        datasets: [{
          label: 'Horas voadas',
          data: this.instrutores.map(instrutor => Number.parseFloat(instrutor.totalHoras) || 0),
          backgroundColor: 'rgba(91, 174, 226, .76)',
          borderColor: '#1D2951',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 54
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(188, 200, 220, .3)' },
            title: { display: true, text: 'Horas' }
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 0 }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return `${Number(context.raw).toLocaleString('pt-BR')} horas`;
              }
            }
          }
        }
      }
    });
  },

  async carregarDados(mostrarToast = false) {
    this.setCarregando(true);
    try {
      const resultado = await this.requisitar('get_data');
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'O backend não retornou os dados.');
      }
      this.instrutores = Array.isArray(resultado.data) ? resultado.data : [];
      this.atualizarKpis();
      this.renderizarTabela(document.getElementById('busca-instrutor')?.value);
      this.renderizarGrafico();
      document.getElementById('ultima-atualizacao').textContent =
        `Atualizado em ${new Date().toLocaleString('pt-BR')}.`;
      if (mostrarToast) toast('Dados atualizados.', 'success');
    } catch (erro) {
      console.error('[Horas Voadas INVA]', erro);
      document.getElementById('instrutores-tbody').innerHTML =
        '<tr><td colspan="3" class="horas-inva-empty">Não foi possível carregar os dados.</td></tr>';
      toast(erro.message || 'Erro ao carregar horas voadas.', 'error', 5000);
    } finally {
      this.setCarregando(false);
    }
  },

  async sincronizar() {
    const botao = document.getElementById('btn-sincronizar');
    botao.disabled = true;
    this.setCarregando(true, 'Sincronizando voos com o CAVOK...');
    try {
      const resultado = await this.requisitar('sync_cavok', { date: this.dataLocalIso() });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível sincronizar o CAVOK.');
      }
      toast(resultado.message || 'Sincronização concluída.', 'success', 5000);
      await this.carregarDados();
    } catch (erro) {
      console.error('[Sincronização CAVOK]', erro);
      toast(erro.message || 'Erro ao sincronizar o CAVOK.', 'error', 5000);
    } finally {
      botao.disabled = false;
      this.setCarregando(false);
    }
  },

  async cadastrar(evento) {
    evento.preventDefault();
    const botao = document.getElementById('btn-salvar-instrutor');
    const dados = {
      nome: document.getElementById('instrutor-nome').value.trim(),
      tipo: document.getElementById('instrutor-tipo').value,
      saldoInicial: document.getElementById('instrutor-saldo').value || 0
    };
    if (!dados.nome || !dados.tipo) {
      toast('Preencha o nome e o tipo do instrutor.', 'warning');
      return;
    }

    botao.disabled = true;
    try {
      const resultado = await this.enviar('add_instructor', dados);
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível cadastrar o instrutor.');
      }
      evento.currentTarget.reset();
      toast('Instrutor cadastrado com sucesso.', 'success');
      this.mudarView('dashboard');
      await this.carregarDados();
    } catch (erro) {
      console.error('[Cadastro de instrutor]', erro);
      toast(erro.message || 'Erro ao cadastrar o instrutor.', 'error', 5000);
    } finally {
      botao.disabled = false;
    }
  },

  vincularEventos() {
    document.querySelectorAll('.horas-inva-tab').forEach(tab => {
      tab.addEventListener('click', () => this.mudarView(tab.dataset.view));
    });
    document.getElementById('btn-atualizar').addEventListener(
      'click',
      () => this.carregarDados(true)
    );
    document.getElementById('btn-sincronizar').addEventListener(
      'click',
      () => this.sincronizar()
    );
    document.getElementById('busca-instrutor').addEventListener(
      'input',
      evento => this.renderizarTabela(evento.target.value)
    );
    document.getElementById('form-instrutor').addEventListener(
      'submit',
      evento => this.cadastrar(evento)
    );
    document.getElementById('btn-cancelar-cadastro').addEventListener(
      'click',
      () => this.mudarView('dashboard')
    );
  },

  async iniciar() {
    if (!Auth.protegerHorasVoadasInva()) return;
    Auth.preencherUI();
    this.vincularEventos();
    await this.carregarDados();
  }
};

HorasVoadasInva.iniciar();
