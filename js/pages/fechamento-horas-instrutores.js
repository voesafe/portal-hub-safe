// ============================================================
// fechamento-horas-instrutores.js: Fechamento de Horas / Instrutores
// SAFE Hub
//
// Lista os instrutores de voo com a etiqueta "Eventual" (cadastro vive no
// backend das Horas INVA, outro repositório) cruzados com as horas do mês
// por categoria (VFR/IFR/Simulador, classificadas lá pela Fase do CAVOK) e
// com o valor da hora guardado aqui no Hub (histórico por vigência).
//
// Duas abas: "Resumo do mês" é só leitura (nome, valores vigentes no mês
// filtrado, horas, total a pagar, Ver voos). "Valores dos instrutores" é
// onde se edita o valor atual da hora e se vê o histórico de mudanças; só
// aparece para quem tem permissão de editar.
//
// Editar é otimista com rollback: é edição de um campo de um item já
// carregado, o servidor não recalcula nada complexo na escrita em si.
// Depois de salvar com sucesso, o Resumo é recarregado em segundo plano
// para o total do mês corrente refletir o valor novo.
// ============================================================

const FechamentoHorasInstrutores = {
  instrutores: [],
  mesAtual: false,
  ano: null,
  mes: null,
  busca: '',

  podeEditar: false,
  valoresInstrutores: [],
  valoresCarregados: false,

  // Instrutor + categoria abertos no modal "Ver voos" no momento.
  _voosInstrutor: null,
  _voosCategoria: 'VFR',

  async iniciar() {
    if (!Auth.protegerFechamentoHorasInstrutores()) return;
    Auth.preencherUI();
    this.podeEditar = Auth.podeEditar('fechamento-horas-instrutores.html');
    this._bindHamburger();
    this._inicializarFiltros();
    this._bindEventos();
    this._bindTabs();
    this._bindModais();
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

  // ── Abas ──────────────────────────────────────────────────

  _bindTabs() {
    const abaValores = document.getElementById('fhi-tab-valores');
    if (abaValores) abaValores.hidden = !this.podeEditar;

    document.querySelectorAll('.fhi-tab').forEach(botao => {
      botao.addEventListener('click', () => this._trocarAba(botao.dataset.view));
    });
  },

  async _trocarAba(view) {
    if (view === 'valores' && !this.podeEditar) return;

    document.querySelectorAll('.fhi-tab').forEach(botao => {
      const ativo = botao.dataset.view === view;
      botao.classList.toggle('active', ativo);
      botao.setAttribute('aria-selected', String(ativo));
    });
    document.getElementById('fhi-view-resumo')?.classList.toggle('active', view === 'resumo');
    document.getElementById('fhi-view-valores')?.classList.toggle('active', view === 'valores');

    if (view === 'valores' && !this.valoresCarregados) {
      await this._carregarValores();
    }
  },

  async _trocarPeriodo() {
    this.mes = Number(document.getElementById('fhi-mes').value);
    this.ano = Number(document.getElementById('fhi-ano').value);
    await this.carregar();
  },

  // ── Aba "Resumo do mês" ──────────────────────────────────

  async carregar(useCache = true) {
    this.setLoading(true);
    try {
      const r = await API.getFechamentoHorasInstrutores(this.ano, this.mes, useCache);
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
    tbody.querySelectorAll('.fhi-btn-voos').forEach(botao => {
      botao.addEventListener('click', () => this._abrirVoos(botao.closest('tr')?.dataset.instrutor));
    });
  },

  _linhaHtml(item) {
    const totalVoos = (item.voos || []).length;
    return `
      <tr data-instrutor="${escapeHtml(item.instrutor)}">
        <td>${escapeHtml(item.instrutor)}</td>
        <td class="text-right fhi-valor-texto">${this._moeda(item.valorVfr)}</td>
        <td class="text-right fhi-valor-texto">${this._moeda(item.valorIfr)}</td>
        <td class="text-right fhi-valor-texto">${this._moeda(item.valorSimulador)}</td>
        <td class="text-right">${this._horas(item.vfrHoras)}</td>
        <td class="text-right">${this._horas(item.ifrHoras)}</td>
        <td class="text-right">${this._horas(item.simuladorHoras)}</td>
        <td class="text-right fhi-total">${this._moeda(item.totalAPagar)}</td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm fhi-btn-acao fhi-btn-voos" type="button" ${totalVoos ? '' : 'disabled'}
            title="${totalVoos ? 'Ver os voos considerados neste mês' : 'Nenhum voo neste mês'}">
            Ver voos
          </button>
        </td>
      </tr>
    `;
  },

  _atualizarTotalGeral() {
    let total = 0;
    this.instrutores.forEach(i => { total += Number(i.totalAPagar) || 0; });
    const alvo = document.getElementById('fhi-total-geral');
    if (alvo) alvo.textContent = this._moeda(total);
  },

  // ── Modal "Ver voos" ─────────────────────────────────────

  _abrirVoos(nome) {
    const item = this.instrutores.find(i => i.instrutor === nome);
    if (!item) return;
    this._voosInstrutor = item;
    this._voosCategoria = 'VFR';

    const rotuloMes = CONFIG.MESES[this.mes] || '';
    document.getElementById('fhi-voos-titulo').textContent =
      `Voos de ${item.instrutor} · ${rotuloMes}/${this.ano}`;

    document.querySelectorAll('.fhi-voos-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.cat === 'VFR');
    });
    this._atualizarContagemVoos(item);
    this._renderizarVoos();
    abrirModal('fhi-modal-voos');
  },

  _atualizarContagemVoos(item) {
    const voos = item.voos || [];
    const contar = cat => voos.filter(v => v.categoria === cat).length;
    document.getElementById('fhi-voos-count-vfr').textContent = contar('VFR');
    document.getElementById('fhi-voos-count-ifr').textContent = contar('IFR');
    document.getElementById('fhi-voos-count-sim').textContent = contar('SIMULADOR');
  },

  _renderizarVoos() {
    const lista = document.getElementById('fhi-voos-lista');
    if (!lista || !this._voosInstrutor) return;
    const voos = (this._voosInstrutor.voos || []).filter(v => v.categoria === this._voosCategoria);

    if (!voos.length) {
      lista.innerHTML = '<p class="fhi-voos-vazio">Nenhum voo nessa categoria neste mês.</p>';
      return;
    }

    lista.innerHTML = `
      <table class="table">
        <thead>
          <tr><th>Data</th><th class="text-right">Horas</th><th>Missão (CAVOK)</th></tr>
        </thead>
        <tbody>
          ${voos.map(v => `
            <tr>
              <td>${escapeHtml(this._dataVoo(v.data))}</td>
              <td class="text-right">${this._horas(v.horas)}</td>
              <td class="col-missao">${escapeHtml(v.missao || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  // ── Aba "Valores dos instrutores" ────────────────────────

  async _carregarValores() {
    this.setLoading(true);
    try {
      const r = await API.getValoresFechamentoHorasInstrutores();
      if (!r.ok) {
        toast(r.error || 'Não foi possível carregar os valores.', 'error');
        this.valoresInstrutores = [];
      } else {
        this.valoresInstrutores = (r.data && r.data.instrutores) || [];
        this.valoresCarregados = true;
      }
    } catch (e) {
      toast('Falha de conexão ao carregar os valores.', 'error');
      this.valoresInstrutores = [];
    } finally {
      this.setLoading(false);
    }
    this._renderizarValoresTabela();
  },

  _renderizarValoresTabela() {
    const tbody = document.getElementById('fhi-valores-tbody');
    const vazio = document.getElementById('fhi-valores-vazio');
    if (!tbody) return;

    if (!this.valoresInstrutores.length) {
      tbody.innerHTML = '';
      if (vazio) vazio.hidden = false;
      return;
    }
    if (vazio) vazio.hidden = true;

    tbody.innerHTML = this.valoresInstrutores.map(item => this._linhaValorHtml(item)).join('');
    tbody.querySelectorAll('.fhi-input-valor').forEach(input => {
      input.addEventListener('change', () => this._salvarValor(input));
    });
    tbody.querySelectorAll('.fhi-btn-historico').forEach(botao => {
      botao.addEventListener('click', () => this._abrirHistorico(botao.closest('tr')?.dataset.instrutor));
    });
  },

  _linhaValorHtml(item) {
    const totalHistorico = (item.historico || []).length;
    return `
      <tr data-instrutor="${escapeHtml(item.instrutor)}">
        <td>${escapeHtml(item.instrutor)}</td>
        <td class="text-right"><input type="number" min="0" step="0.01" class="fhi-input-valor" data-categoria="VFR" value="${this._numeroInput(item.valorVfr)}" aria-label="Valor VFR de ${escapeHtml(item.instrutor)}"></td>
        <td class="text-right"><input type="number" min="0" step="0.01" class="fhi-input-valor" data-categoria="IFR" value="${this._numeroInput(item.valorIfr)}" aria-label="Valor IFR de ${escapeHtml(item.instrutor)}"></td>
        <td class="text-right"><input type="number" min="0" step="0.01" class="fhi-input-valor" data-categoria="SIMULADOR" value="${this._numeroInput(item.valorSimulador)}" aria-label="Valor Simulador de ${escapeHtml(item.instrutor)}"></td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm fhi-btn-acao fhi-btn-historico" type="button" ${totalHistorico ? '' : 'disabled'}
            title="${totalHistorico ? 'Ver o histórico de valores' : 'Nenhuma edição registrada ainda'}">
            Histórico
          </button>
        </td>
      </tr>
    `;
  },

  async _salvarValor(input) {
    const linha = input.closest('tr');
    const nome = linha ? linha.dataset.instrutor : '';
    const categoria = input.dataset.categoria;
    const item = this.valoresInstrutores.find(i => i.instrutor === nome);
    if (!item) return;

    const valorNovo = Number(input.value);
    if (!isFinite(valorNovo) || valorNovo < 0) {
      toast('Valor inválido.', 'error');
      input.value = this._numeroInput(this._campoValor(item, categoria));
      return;
    }

    const valorAntes = this._campoValor(item, categoria);
    this._aplicarValor(item, categoria, valorNovo);

    input.classList.add('is-salvando');
    const r = await API.salvarValorFechamentoHorasInstrutor({ instrutor: nome, categoria, valor: valorNovo });
    input.classList.remove('is-salvando');

    if (!r.ok) {
      this._aplicarValor(item, categoria, valorAntes);
      input.value = this._numeroInput(valorAntes);
      toast(r.error || 'Não foi possível salvar o valor.', 'error');
      return;
    }

    // Acrescenta a entrada nova no histórico local (mais recente primeiro),
    // pra quem abrir "Histórico" na sequência já ver a edição que acabou de
    // fazer, sem esperar um recarregamento da aba.
    const autor = Auth.getNome() ? `${Auth.getNome()} (${Auth.getEmail() || ''})` : (Auth.getEmail() || '');
    item.historico = item.historico || [];
    item.historico.unshift({
      categoria, valor: valorNovo, vigenteDesde: this._agoraTexto(), registradoPor: autor
    });
    this._renderizarValoresTabela();

    toast('Valor salvo.', 'success');

    // Mantém o Resumo do mês corrente coerente com o valor novo, sem
    // esperar o usuário trocar de aba para perceber a mudança.
    if (this.mesAtual) this.carregar(false);
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

  // ── Modal "Histórico de valores" ─────────────────────────

  _abrirHistorico(nome) {
    const item = this.valoresInstrutores.find(i => i.instrutor === nome);
    if (!item) return;

    document.getElementById('fhi-historico-titulo').textContent = `Histórico de valores · ${item.instrutor}`;

    const lista = document.getElementById('fhi-historico-lista');
    const historico = item.historico || [];
    if (!historico.length) {
      lista.innerHTML = '<p class="fhi-historico-vazio">Nenhuma edição registrada ainda. Os valores atuais são os padrões da operação.</p>';
    } else {
      const rotuloCategoria = { VFR: 'VFR', IFR: 'IFR', SIMULADOR: 'Simulador' };
      lista.innerHTML = historico.map(h => `
        <div class="fhi-historico-item">
          <span class="fhi-historico-cat">${escapeHtml(rotuloCategoria[h.categoria] || h.categoria)}</span>
          <span class="fhi-historico-quem">${escapeHtml(this._dataHoraVigencia(h.vigenteDesde))}${h.registradoPor ? ' · ' + escapeHtml(h.registradoPor) : ''}</span>
          <span class="fhi-historico-valor">${this._moeda(h.valor)}</span>
        </div>
      `).join('');
    }
    abrirModal('fhi-modal-historico');
  },

  /** "2026-08-25 14:30:00" -> "25/08/2026 14:30". Sem casar, devolve o texto cru. */
  _dataHoraVigencia(valor) {
    const texto = String(valor || '').trim();
    const m = texto.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
    return texto;
  },

  // ── Modais (fechar por X, clique fora, Escape) ───────────

  _bindModais() {
    document.querySelectorAll('.fhi-voos-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._voosCategoria = tab.dataset.cat;
        document.querySelectorAll('.fhi-voos-tab').forEach(t => t.classList.toggle('active', t === tab));
        this._renderizarVoos();
      });
    });
    document.querySelectorAll('[data-close]').forEach(botao => {
      botao.addEventListener('click', () => fecharModal(botao.dataset.close));
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', event => {
        if (event.target === overlay) fecharModal(overlay.id);
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      fecharModal('fhi-modal-voos');
      fecharModal('fhi-modal-historico');
    });
  },

  /** "2026-08-25" (ou variantes) -> "25/08/2026". Sem casar, devolve o texto cru. */
  _dataVoo(valor) {
    const texto = String(valor || '').trim();
    let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
    return texto;
  },

  /** "agora" no mesmo formato que o servidor grava (yyyy-MM-dd HH:mm:ss), só para a entrada otimista do histórico local. */
  _agoraTexto() {
    const d = new Date();
    const p2 = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
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
