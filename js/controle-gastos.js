// ============================================================
// controle-gastos.js - Dashboard e fechamento financeiro
// ============================================================

const ControleGastos = {
  dados: null,
  charts: {},
  categoriaEditando: null,

  async init() {
    if (!Auth.protegerFinanceiro()) return;
    Auth.preencherUI();
    this.aplicarPermissoes();
    this.inicializarSidebar();
    this.inicializarFiltros();
    this.inicializarTabs();
    this.inicializarEventos();
    await this.carregar();
  },

  inicializarSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('hamburger');

    toggle?.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('sidebar-collapsed');
      toggle.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
    });
    hamburger?.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('active');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  },

  aplicarPermissoes() {
    if (Auth.podeEditarFinanceiro()) return;
    document.getElementById('cg-readonly-note').hidden = false;
    document.querySelectorAll('.gastos-tab').forEach(tab => {
      if (tab.dataset.tab !== 'visao') tab.hidden = true;
    });
  },

  inicializarFiltros() {
    const agora = new Date();
    const mes = document.getElementById('cg-mes');
    const ano = document.getElementById('cg-ano');

    mes.innerHTML = CONFIG.MESES.slice(1)
      .map((nome, index) => `<option value="${index + 1}">${nome}</option>`)
      .join('');

    const anoAtual = agora.getFullYear();
    const anos = [];
    for (let valor = 2026; valor <= Math.max(anoAtual + 1, 2027); valor++) anos.push(valor);
    ano.innerHTML = anos
      .map(valor => `<option value="${valor}">${valor}</option>`)
      .join('');

    mes.value = String(agora.getMonth() + 1);
    ano.value = String(Math.max(2026, anoAtual));
  },

  inicializarTabs() {
    document.querySelectorAll('.gastos-tab').forEach(botao => {
      botao.addEventListener('click', () => {
        document.querySelectorAll('.gastos-tab').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.gastos-view').forEach(item => item.classList.remove('active'));
        botao.classList.add('active');
        document.getElementById(`view-${botao.dataset.tab}`)?.classList.add('active');
        Object.values(this.charts).forEach(chart => chart?.resize());
      });
    });
  },

  inicializarEventos() {
    document.getElementById('cg-mes').addEventListener('change', () => this.carregar());
    document.getElementById('cg-ano').addEventListener('change', () => this.carregar());
    document.getElementById('cg-btn-salvar').addEventListener('click', () => this.salvarFechamento());
    document.getElementById('cg-btn-salvar-receitas').addEventListener('click', () => this.salvarReceitas());
    document.getElementById('cg-btn-nova-categoria').addEventListener('click', () => this.abrirCategoria());
    document.getElementById('cg-modal-categoria-salvar').addEventListener('click', () => this.salvarCategoria());
    document.getElementById('cg-modal-categoria-close').addEventListener('click', () => fecharModal('cg-modal-categoria'));
    document.getElementById('cg-modal-categoria-cancelar').addEventListener('click', () => fecharModal('cg-modal-categoria'));
    document.getElementById('cg-modal-categoria').addEventListener('click', event => {
      if (event.target.id === 'cg-modal-categoria') fecharModal('cg-modal-categoria');
    });
    document.getElementById('cg-categoria-nome').addEventListener('keydown', event => {
      if (event.key === 'Enter') this.salvarCategoria();
    });
    ['cg-receita-sjk', 'cg-receita-cpn'].forEach(id => {
      const input = document.getElementById(id);
      input.addEventListener('focus', () => input.select());
      input.addEventListener('blur', () => {
        input.value = this.formatarCampoDinheiro(this.parseDinheiro(input.value));
      });
    });
  },

  periodo() {
    return {
      mes: Number(document.getElementById('cg-mes').value),
      ano: Number(document.getElementById('cg-ano').value)
    };
  },

  setLoading(ativo) {
    document.getElementById('cg-loading').classList.toggle('active', ativo);
  },

  async carregar(useCache = true) {
    const { ano, mes } = this.periodo();
    this.setLoading(true);
    const resposta = await API.getControleGastos(ano, mes, useCache);
    this.setLoading(false);

    if (!resposta.ok) {
      this.tratarErro(resposta.error);
      return;
    }

    this.dados = resposta.data;
    this.renderizar();
  },

  tratarErro(mensagem) {
    const texto = mensagem || 'Não foi possível carregar o controle de gastos.';
    toast(texto, 'error', 5000);
    if (/sess[aã]o expirada/i.test(texto)) {
      setTimeout(() => Auth.logout(), 1800);
    }
  },

  renderizar() {
    this.renderizarKpis();
    this.renderizarGraficos();
    this.renderizarEditor();
    this.renderizarReceitas();
    this.renderizarCategorias();
  },

  mesSelecionado() {
    return this.dados?.meses?.[String(this.dados.mes)] ||
      this.dados?.meses?.[this.dados.mes] ||
      {
        SJK: { total: 0, horas: null, custoHora: null },
        CPN: { total: 0, horas: null, custoHora: null },
        total: 0,
        horas: 0,
        custoHora: null
      };
  },

  formatarHoras(valor) {
    if (valor === null || valor === undefined || valor === '') return 'Pendente';
    return `${Number(valor).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} h`;
  },

  renderizarKpis() {
    const item = this.mesSelecionado();
    const nome = CONFIG.MESES[this.dados.mes];
    const horasCompletas = item.SJK.horas > 0 && item.CPN.horas > 0;

    document.getElementById('cg-kpi-total').textContent = formatBRL(item.total);
    document.getElementById('cg-kpi-total-sub').textContent = `${nome} de ${this.dados.ano}`;
    document.getElementById('cg-kpi-horas').textContent = horasCompletas
      ? this.formatarHoras(item.horas)
      : 'Pendente';
    document.getElementById('cg-kpi-custo').textContent =
      item.custoHora === null ? 'Pendente' : formatBRL(item.custoHora);
    document.getElementById('cg-kpi-custo-sub').textContent =
      item.custoHora === null ? 'Aguardando horas das bases' : 'Gasto total ÷ horas totais';
    const receitas = this.dados.receitas || {};
    document.getElementById('cg-kpi-sjk').textContent =
      receitas.SJK === null || receitas.SJK === undefined ? 'Não informada' : formatBRL(receitas.SJK);
    document.getElementById('cg-kpi-sjk-sub').textContent = `${nome} de ${this.dados.ano}`;
    document.getElementById('cg-kpi-cpn').textContent =
      receitas.CPN === null || receitas.CPN === undefined ? 'Não informada' : formatBRL(receitas.CPN);
    document.getElementById('cg-kpi-cpn-sub').textContent = `${nome} de ${this.dados.ano}`;

    document.getElementById('cg-alert-horas').hidden =
      !(item.total > 0 && !horasCompletas);
  },

  destruirChart(nome) {
    if (this.charts[nome]) {
      this.charts[nome].destroy();
      delete this.charts[nome];
    }
  },

  opcoesChart() {
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
        },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${formatBRL(context.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: {
            callback: valor => formatBRL(valor).replace(',00', '')
          },
          grid: { color: 'rgba(188, 200, 220, .22)' }
        }
      }
    };
  },

  renderizarGraficos() {
    const meses = Array.from({ length: 12 }, (_, index) => this.dados.meses[String(index + 1)]);
    const labels = CONFIG.MESES.slice(1).map(nome => nome.slice(0, 3));
    const sjk = meses.map(item => Number(item?.SJK?.total || 0));
    const cpn = meses.map(item => Number(item?.CPN?.total || 0));
    const temGastos = [...sjk, ...cpn].some(valor => valor > 0);

    this.destruirChart('gastos');
    document.getElementById('cg-chart-gastos').hidden = !temGastos;
    document.getElementById('cg-empty-gastos').hidden = temGastos;
    if (temGastos) {
      this.charts.gastos = new Chart(document.getElementById('cg-chart-gastos'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'SJK', data: sjk, backgroundColor: '#5BAEE2', borderRadius: 4 },
            { label: 'CPN', data: cpn, backgroundColor: '#60C0BF', borderRadius: 4 }
          ]
        },
        options: this.opcoesChart()
      });
    }

    const categorias = this.dados.categoriasResumo || [];
    const temCategorias = categorias.some(item => Number(item.valor) > 0);
    this.destruirChart('categorias');
    document.getElementById('cg-chart-categorias').hidden = !temCategorias;
    document.getElementById('cg-empty-categorias').hidden = temCategorias;
    if (temCategorias) {
      const cores = ['#1D2951', '#5BAEE2', '#60C0BF', '#F39C12', '#7B8FB5', '#3E8E8D', '#A9B5C9'];
      this.charts.categorias = new Chart(document.getElementById('cg-chart-categorias'), {
        type: 'doughnut',
        data: {
          labels: categorias.map(item => item.nome),
          datasets: [{
            data: categorias.map(item => Number(item.valor || 0)),
            backgroundColor: categorias.map((_, index) => cores[index % cores.length]),
            borderColor: '#FFFFFF',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8,
                padding: 12,
                font: { family: 'Montserrat', size: 10 }
              }
            },
            tooltip: {
              callbacks: {
                label: context => `${context.label}: ${formatBRL(context.raw)}`
              }
            }
          }
        }
      });
    }

    const custoSjk = meses.map(item => item?.SJK?.custoHora);
    const custoCpn = meses.map(item => item?.CPN?.custoHora);
    const temCusto = [...custoSjk, ...custoCpn].some(valor => valor !== null && valor !== undefined);
    this.destruirChart('custo');
    document.getElementById('cg-chart-custo').hidden = !temCusto;
    document.getElementById('cg-empty-custo').hidden = temCusto;
    if (temCusto) {
      const opcoes = this.opcoesChart();
      opcoes.plugins.tooltip.callbacks.label =
        context => `${context.dataset.label}: ${formatBRL(context.raw)} / hora`;
      this.charts.custo = new Chart(document.getElementById('cg-chart-custo'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'SJK',
              data: custoSjk,
              borderColor: '#3D8CC4',
              backgroundColor: '#3D8CC4',
              pointRadius: 3,
              tension: .25,
              spanGaps: false
            },
            {
              label: 'CPN',
              data: custoCpn,
              borderColor: '#44A8A7',
              backgroundColor: '#44A8A7',
              pointRadius: 3,
              tension: .25,
              spanGaps: false
            }
          ]
        },
        options: opcoes
      });
    }
  },

  valorMes(categoriaId, base) {
    return Number(this.dados?.valores?.[categoriaId]?.[base] || 0);
  },

  formatarCampoDinheiro(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  parseDinheiro(valor) {
    const texto = String(valor || '').trim().replace(/[^\d,.-]/g, '');
    if (!texto) return 0;
    const normalizado = texto.includes(',')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? Math.max(0, numero) : 0;
  },

  escapeHtml(valor) {
    return String(valor || '').replace(/[&<>"']/g, caractere => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[caractere]);
  },

  renderizarEditor() {
    const tbody = document.getElementById('cg-editor-body');
    tbody.innerHTML = this.dados.categorias.map(categoria => `
      <tr data-categoria-id="${this.escapeHtml(categoria.id)}">
        <th>${this.escapeHtml(categoria.nome)}</th>
        ${['SJK', 'CPN'].map(base => `
          <td data-label="Base ${base}">
            <label class="gastos-money-field">
              <span>R$</span>
              <input
                class="form-control gastos-money-input"
                data-base="${base}"
                inputmode="decimal"
                autocomplete="off"
                value="${this.formatarCampoDinheiro(this.valorMes(categoria.id, base))}"
                aria-label="${this.escapeHtml(categoria.nome)} na base ${base}">
            </label>
          </td>
        `).join('')}
      </tr>
    `).join('');

    tbody.querySelectorAll('.gastos-money-input').forEach(input => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => this.atualizarTotaisEditor());
      input.addEventListener('blur', () => {
        input.value = this.formatarCampoDinheiro(this.parseDinheiro(input.value));
        this.atualizarTotaisEditor();
      });
    });

    document.getElementById('cg-horas-sjk').value =
      this.dados.horas.SJK === null ? '' : Number(this.dados.horas.SJK).toFixed(1);
    document.getElementById('cg-horas-cpn').value =
      this.dados.horas.CPN === null ? '' : Number(this.dados.horas.CPN).toFixed(1);
    document.querySelectorAll('.gastos-hours-input').forEach(input => {
      input.addEventListener('input', () => this.atualizarTotaisEditor());
    });

    document.getElementById('cg-competencia-label').textContent =
      `Informe os totais consolidados de ${CONFIG.MESES[this.dados.mes]} de ${this.dados.ano}.`;
    this.atualizarTotaisEditor();
  },

  lerEditor() {
    const valores = [];
    document.querySelectorAll('#cg-editor-body tr').forEach(linha => {
      const categoriaId = linha.dataset.categoriaId;
      linha.querySelectorAll('.gastos-money-input').forEach(input => {
        valores.push({
          categoriaId,
          base: input.dataset.base,
          valor: this.parseDinheiro(input.value)
        });
      });
    });

    const lerHoras = id => {
      const valor = document.getElementById(id).value.trim();
      if (valor === '') return '';
      const numero = Number(valor.replace(',', '.'));
      return Number.isFinite(numero) ? Math.max(0, Math.round(numero * 10) / 10) : '';
    };

    return {
      valores,
      horas: {
        SJK: lerHoras('cg-horas-sjk'),
        CPN: lerHoras('cg-horas-cpn')
      }
    };
  },

  atualizarTotaisEditor() {
    const editor = this.lerEditor();
    const total = { SJK: 0, CPN: 0 };
    editor.valores.forEach(item => { total[item.base] += item.valor; });

    document.getElementById('cg-editor-total-sjk').textContent = formatBRL(total.SJK);
    document.getElementById('cg-editor-total-cpn').textContent = formatBRL(total.CPN);
    ['SJK', 'CPN'].forEach(base => {
      const horas = editor.horas[base];
      document.getElementById(`cg-editor-custo-${base.toLowerCase()}`).textContent =
        horas > 0 ? `${formatBRL(total[base] / horas)} / hora` : 'Horas pendentes';
    });
  },

  renderizarReceitas() {
    const receitas = this.dados.receitas || {};
    document.getElementById('cg-receita-sjk').value =
      this.formatarCampoDinheiro(receitas.SJK || 0);
    document.getElementById('cg-receita-cpn').value =
      this.formatarCampoDinheiro(receitas.CPN || 0);
    document.getElementById('cg-receitas-competencia').textContent =
      `Informe a receita geral de cada base em ${CONFIG.MESES[this.dados.mes]} de ${this.dados.ano}.`;
  },

  async salvarReceitas() {
    const botao = document.getElementById('cg-btn-salvar-receitas');
    const { ano, mes } = this.periodo();
    const dados = {
      ano,
      mes,
      receitas: {
        SJK: this.parseDinheiro(document.getElementById('cg-receita-sjk').value),
        CPN: this.parseDinheiro(document.getElementById('cg-receita-cpn').value)
      }
    };

    btnLoading(botao, true);
    const resposta = await API.salvarReceitasBase(dados);
    btnLoading(botao, false);

    if (!resposta.ok) {
      this.tratarErro(resposta.error);
      return;
    }

    this.dados = resposta.data;
    this.renderizar();
    toast('Receitas por base salvas com sucesso.', 'success');
  },

  async salvarFechamento() {
    const botao = document.getElementById('cg-btn-salvar');
    const editor = this.lerEditor();
    const { ano, mes } = this.periodo();
    const dados = { ano, mes, valores: editor.valores, horas: editor.horas };

    btnLoading(botao, true);
    const resposta = await API.salvarFechamentoGastos(dados);
    btnLoading(botao, false);

    if (!resposta.ok) {
      this.tratarErro(resposta.error);
      return;
    }

    this.dados = resposta.data;
    this.renderizar();
    toast('Fechamento mensal salvo com sucesso.', 'success');
  },

  renderizarCategorias() {
    const tbody = document.getElementById('cg-categorias-body');
    const categorias = this.dados.todasCategorias || [];
    if (!categorias.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhuma categoria cadastrada.</td></tr>';
      return;
    }

    tbody.innerHTML = categorias.map(categoria => `
      <tr>
        <td data-label="Categoria"><strong>${this.escapeHtml(categoria.nome)}</strong></td>
        <td data-label="Status">
          <span class="badge ${categoria.ativa ? 'badge-green' : 'badge-red'}">
            ${categoria.ativa ? 'Ativa' : 'Inativa'}
          </span>
        </td>
        <td data-label="Ações">
          <div class="gastos-actions">
            <button class="gastos-icon-btn" data-acao="editar" data-id="${this.escapeHtml(categoria.id)}" title="Editar categoria" aria-label="Editar categoria">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button class="gastos-icon-btn ${categoria.ativa ? 'danger' : ''}" data-acao="status" data-id="${this.escapeHtml(categoria.id)}" data-ativa="${categoria.ativa}" title="${categoria.ativa ? 'Desativar' : 'Reativar'} categoria" aria-label="${categoria.ativa ? 'Desativar' : 'Reativar'} categoria">
              ${categoria.ativa
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>'}
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-acao="editar"]').forEach(botao => {
      botao.addEventListener('click', () => {
        const categoria = categorias.find(item => item.id === botao.dataset.id);
        this.abrirCategoria(categoria);
      });
    });
    tbody.querySelectorAll('[data-acao="status"]').forEach(botao => {
      botao.addEventListener('click', () => {
        this.alterarStatusCategoria(botao.dataset.id, botao.dataset.ativa !== 'true');
      });
    });
  },

  abrirCategoria(categoria = null) {
    this.categoriaEditando = categoria;
    document.getElementById('cg-modal-categoria-title').textContent =
      categoria ? 'Editar categoria' : 'Nova categoria';
    document.getElementById('cg-categoria-nome').value = categoria?.nome || '';
    abrirModal('cg-modal-categoria');
    setTimeout(() => document.getElementById('cg-categoria-nome').focus(), 100);
  },

  async salvarCategoria() {
    const nome = document.getElementById('cg-categoria-nome').value.trim();
    if (!nome) {
      toast('Informe o nome da categoria.', 'warning');
      return;
    }

    const botao = document.getElementById('cg-modal-categoria-salvar');
    btnLoading(botao, true);
    const resposta = this.categoriaEditando
      ? await API.editarCategoriaGasto(this.categoriaEditando.id, nome)
      : await API.criarCategoriaGasto(nome);
    btnLoading(botao, false);

    if (!resposta.ok) {
      this.tratarErro(resposta.error);
      return;
    }

    fecharModal('cg-modal-categoria');
    toast(this.categoriaEditando ? 'Categoria atualizada.' : 'Categoria criada.', 'success');
    this.categoriaEditando = null;
    await this.carregar(false);
  },

  async alterarStatusCategoria(id, ativa) {
    this.setLoading(true);
    const resposta = await API.alterarStatusCategoriaGasto(id, ativa);
    this.setLoading(false);
    if (!resposta.ok) {
      this.tratarErro(resposta.error);
      return;
    }
    toast(ativa ? 'Categoria reativada.' : 'Categoria desativada.', 'success');
    await this.carregar(false);
  }
};

document.addEventListener('DOMContentLoaded', () => ControleGastos.init());
