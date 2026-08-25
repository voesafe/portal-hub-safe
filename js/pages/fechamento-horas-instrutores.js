// ============================================================
// fechamento-horas-instrutores.js — Fechamento de Horas / Instrutores
// SAFE Hub
//
// Lista os instrutores de voo com a etiqueta "Eventual" (cadastro vive no
// backend das Horas INVA, outro repositório) cruzados com as horas do mês
// por categoria (VFR/IFR/Simulador, classificadas lá pela Fase do CAVOK) e
// com o valor da hora guardado aqui no Hub (histórico por vigência).
//
// Editar um valor é otimista com rollback: é edição de um campo de um item
// já carregado, o servidor não recalcula nada complexo na escrita em si
// (quem recalcula o total é o próximo carregamento). Só o mês CORRENTE é
// editável — o valor de um mês passado é o que já foi de fato usado no
// cálculo daquele mês (resolvido pela vigência), então editar ali
// reescreveria histórico em vez de corrigir o futuro.
// ============================================================

const FechamentoHorasInstrutores = {
  instrutores: [],
  mesAtual: false,
  ano: null,
  mes: null,
  busca: '',

  async iniciar() {
    if (!Auth.protegerFechamentoHorasInstrutores()) return;
    Auth.preencherUI();
    this._bindHamburger();
    this._inicializarFiltros();
    this._bindEventos();
    await this.carregar();
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

  _inicializarFiltros() {
    const agora = new Date();
    const selMes = document.getElementById('fhi-mes');
    const selAno = document.getElementById('fhi-ano');

    selMes.innerHTML = CONFIG.MESES.slice(1)
      .map((nome, i) => `<option value="${i + 1}">${nome}</option>`)
      .join('');

    const anoAtual = agora.getFullYear();
    const anos = [];
    for (let v = anoAtual - 1; v <= anoAtual + 1; v++) anos.push(v);
    selAno.innerHTML = anos.map(v => `<option value="${v}">${v}</option>`).join('');

    this.mes = agora.getMonth() + 1;
    this.ano = anoAtual;
    selMes.value = String(this.mes);
    selAno.value = String(this.ano);
  },

  _bindEventos() {
    document.getElementById('fhi-mes').addEventListener('change', () => this._trocarPeriodo());
    document.getElementById('fhi-ano').addEventListener('change', () => this._trocarPeriodo());
    document.getElementById('fhi-busca').addEventListener('input', e => {
      this.busca = e.target.value || '';
      this._renderizarTabela();
    });
  },

  async _trocarPeriodo() {
    this.mes = Number(document.getElementById('fhi-mes').value);
    this.ano = Number(document.getElementById('fhi-ano').value);
    await this.carregar();
  },

  async carregar() {
    this.setLoading(true);
    try {
      const r = await API.getFechamentoHorasInstrutores(this.ano, this.mes);
      if (!r.ok) {
        toast(r.error || 'Não foi possível carregar o fechamento.', 'error');
        this.instrutores = [];
        this.mesAtual = false;
      } else {
        this.instrutores = (r.data && r.data.instrutores) || [];
        this.mesAtual = !!(r.data && r.data.mesAtual);
      }
    } catch (e) {
      toast('Falha de conexão ao carregar o fechamento.', 'error');
      this.instrutores = [];
      this.mesAtual = false;
    } finally {
      this.setLoading(false);
    }
    this.renderizar();
  },

  renderizar() {
    const aviso = document.getElementById('fhi-aviso-historico');
    if (aviso) aviso.hidden = this.mesAtual;

    const sub = document.getElementById('fhi-card-sub');
    if (sub) {
      const rotuloMes = CONFIG.MESES[this.mes] || '';
      sub.textContent = `${this.instrutores.length} instrutor(es) com a etiqueta Eventual em ${rotuloMes}/${this.ano}`;
    }

    this._renderizarTabela();
    this._atualizarTotalGeral();
  },

  _renderizarTabela() {
    const tbody = document.getElementById('fhi-tbody');
    const vazio = document.getElementById('fhi-vazio');
    if (!tbody) return;

    const termo = this.busca.trim().toLowerCase();
    const lista = termo
      ? this.instrutores.filter(i => (i.instrutor || '').toLowerCase().includes(termo))
      : this.instrutores;

    if (!lista.length) {
      tbody.innerHTML = '';
      if (vazio) vazio.hidden = false;
      return;
    }
    if (vazio) vazio.hidden = true;

    tbody.innerHTML = lista.map(item => this._linhaHtml(item)).join('');
    tbody.querySelectorAll('.fhi-input-valor').forEach(input => {
      input.addEventListener('change', () => this._salvarValor(input));
    });
  },

  _linhaHtml(item) {
    const dis = item.editavel ? '' : 'disabled';
    return `
      <tr data-instrutor="${escapeHtml(item.instrutor)}">
        <td>${escapeHtml(item.instrutor)}</td>
        <td class="text-right"><input type="number" min="0" step="0.01" class="fhi-input-valor" data-categoria="VFR" value="${this._numeroInput(item.valorVfr)}" ${dis} aria-label="Valor VFR de ${escapeHtml(item.instrutor)}"></td>
        <td class="text-right"><input type="number" min="0" step="0.01" class="fhi-input-valor" data-categoria="IFR" value="${this._numeroInput(item.valorIfr)}" ${dis} aria-label="Valor IFR de ${escapeHtml(item.instrutor)}"></td>
        <td class="text-right"><input type="number" min="0" step="0.01" class="fhi-input-valor" data-categoria="SIMULADOR" value="${this._numeroInput(item.valorSimulador)}" ${dis} aria-label="Valor Simulador de ${escapeHtml(item.instrutor)}"></td>
        <td class="text-right">${this._horas(item.vfrHoras)}</td>
        <td class="text-right">${this._horas(item.ifrHoras)}</td>
        <td class="text-right">${this._horas(item.simuladorHoras)}</td>
        <td class="text-right fhi-total" data-total>${this._moeda(item.totalAPagar)}</td>
      </tr>
    `;
  },

  async _salvarValor(input) {
    const linha = input.closest('tr');
    const nome = linha ? linha.dataset.instrutor : '';
    const categoria = input.dataset.categoria;
    const item = this.instrutores.find(i => i.instrutor === nome);
    if (!item) return;

    const valorNovo = Number(input.value);
    if (!isFinite(valorNovo) || valorNovo < 0) {
      toast('Valor inválido.', 'error');
      input.value = this._numeroInput(this._campoValor(item, categoria));
      return;
    }

    const antes = {
      valorVfr: item.valorVfr, valorIfr: item.valorIfr,
      valorSimulador: item.valorSimulador, totalAPagar: item.totalAPagar
    };

    this._aplicarValor(item, categoria, valorNovo);
    this._recalcularTotal(item);
    this._atualizarLinhaTotal(linha, item);
    this._atualizarTotalGeral();

    input.classList.add('is-salvando');
    const r = await API.salvarValorFechamentoHorasInstrutor({ instrutor: nome, categoria, valor: valorNovo });
    input.classList.remove('is-salvando');

    if (!r.ok) {
      Object.assign(item, antes);
      input.value = this._numeroInput(this._campoValor(item, categoria));
      this._atualizarLinhaTotal(linha, item);
      this._atualizarTotalGeral();
      toast(r.error || 'Não foi possível salvar o valor.', 'error');
      return;
    }
    toast('Valor salvo.', 'success');
  },

  _campoValor(item, categoria) {
    if (categoria === 'VFR') return item.valorVfr;
    if (categoria === 'IFR') return item.valorIfr;
    return item.valorSimulador;
  },
  _aplicarValor(item, categoria, valor) {
    if (categoria === 'VFR') item.valorVfr = valor;
    else if (categoria === 'IFR') item.valorIfr = valor;
    else item.valorSimulador = valor;
  },
  _recalcularTotal(item) {
    item.totalAPagar = Math.round(
      (Number(item.vfrHoras || 0) * Number(item.valorVfr || 0) +
        Number(item.ifrHoras || 0) * Number(item.valorIfr || 0) +
        Number(item.simuladorHoras || 0) * Number(item.valorSimulador || 0)) * 100
    ) / 100;
  },
  _atualizarLinhaTotal(linha, item) {
    if (!linha) return;
    const celula = linha.querySelector('[data-total]');
    if (celula) celula.textContent = this._moeda(item.totalAPagar);
  },
  _atualizarTotalGeral() {
    let total = 0;
    this.instrutores.forEach(i => { total += Number(i.totalAPagar) || 0; });
    const alvo = document.getElementById('fhi-total-geral');
    if (alvo) alvo.textContent = this._moeda(total);
  },

  _numeroInput(valor) {
    const n = Number(valor) || 0;
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  },
  _horas(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
  },
  _moeda(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  setLoading(ativo) {
    document.getElementById('fhi-loading')?.classList.toggle('active', !!ativo);
  }
};

document.addEventListener('DOMContentLoaded', () => FechamentoHorasInstrutores.iniciar());
