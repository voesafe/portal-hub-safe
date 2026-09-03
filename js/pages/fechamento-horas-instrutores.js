// ============================================================
// fechamento-horas-instrutores.js: Fechamento de Horas / Instrutores
// SAFE Hub
//
// Lista os instrutores de voo com a etiqueta "Eventual" (cadastro vive no
// backend das Horas INVA, outro repositório) cruzados com as horas do mês
// por categoria (VFR, IFR, Simulador AATD e Simulador PCATD, classificadas
// lá pelo equipamento e pela Fase do CAVOK) e com o valor da hora guardado
// aqui no Hub (histórico por vigência).
//
// Duas abas: "Resumo do mês" é só leitura (nome, horas, total a pagar, com
// o valor de cada categoria só no tooltip do Total, Ver voos e Exportar).
// "Valores dos instrutores" é onde se edita o valor atual da hora e se vê
// o histórico de mudanças; só aparece para quem tem permissão de editar.
//
// Editar é otimista com rollback: é edição de um campo de um item já
// carregado, o servidor não recalcula nada complexo na escrita em si.
// Depois de salvar com sucesso, o Resumo é recarregado em segundo plano
// para o total do mês corrente refletir o valor novo.
// ============================================================

/**
 * As categorias de pagamento, definidas UMA vez. A ordem daqui é a ordem
 * das colunas de horas do Resumo, das abas do "Ver voos", dos campos da aba
 * "Valores" e das linhas da mensagem de exportação: com quatro categorias,
 * repetir essa lista em cinco lugares é como uma delas fica de fora de um
 * deles sem ninguém notar (o total continua certo, e só uma coluna deixa de
 * aparecer).
 *
 * ⚠️ A chave 'SIMULADOR' é o AATD, apesar de o rótulo dizer AATD. Ela é a
 * chave gravada no histórico de valores desde a primeira versão do módulo:
 * renomear para 'SIMULADOR_AATD' orfanaria tudo que já foi registrado, e o
 * valor voltaria ao padrão em silêncio.
 */
const FHI_CATEGORIAS = [
  { chave: 'VFR',             rotulo: 'VFR',             horas: 'vfrHoras',            valor: 'valorVfr' },
  { chave: 'IFR',             rotulo: 'IFR',             horas: 'ifrHoras',            valor: 'valorIfr' },
  { chave: 'SIMULADOR',       rotulo: 'Simulador AATD',  horas: 'simuladorHoras',      valor: 'valorSimulador' },
  { chave: 'SIMULADOR_PCATD', rotulo: 'Simulador PCATD', horas: 'simuladorPcatdHoras', valor: 'valorSimuladorPcatd' }
];

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
    this.setLoading(true, 'Carregando fechamento de horas...');
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
    tbody.querySelectorAll('.fhi-btn-exportar').forEach(botao => {
      botao.addEventListener('click', () => this._exportarInstrutor(botao.closest('tr')?.dataset.instrutor));
    });
    tbody.querySelectorAll('.fhi-tooltip-gatilho').forEach(gatilho => {
      gatilho.addEventListener('mouseenter', () => this._mostrarTooltip(gatilho));
      gatilho.addEventListener('mouseleave', () => this._esconderTooltip());
      gatilho.addEventListener('focus', () => this._mostrarTooltip(gatilho));
      gatilho.addEventListener('blur', () => this._esconderTooltip());
    });
  },

  /**
   * Posiciona o tooltip flutuante por JS (não por CSS escapando o card),
   * porque `.card`/`.table-wrapper` deste projeto acabam com overflow
   * hidden pela cascata do layout.css: um tooltip absoluto escapando pra
   * cima da linha seria cortado em silêncio. O elemento único vive fora da
   * tabela (irmão do topo do body), então nada o corta.
   */
  _mostrarTooltip(gatilho) {
    const el = document.getElementById('fhi-tooltip-flutuante');
    if (!el) return;
    el.innerHTML = (gatilho.dataset.tooltip || '')
      .split('\n')
      .map(linha => `<span>${escapeHtml(linha)}</span>`)
      .join('');

    const rect = gatilho.getBoundingClientRect();
    el.classList.add('active');
    const larguraTooltip = el.offsetWidth;
    let esquerda = rect.right - larguraTooltip;
    esquerda = Math.max(8, Math.min(esquerda, window.innerWidth - larguraTooltip - 8));
    el.style.left = `${esquerda}px`;
    el.style.top = `${rect.top - el.offsetHeight - 10}px`;
  },

  _esconderTooltip() {
    document.getElementById('fhi-tooltip-flutuante')?.classList.remove('active');
  },

  _linhaHtml(item) {
    const totalVoos = (item.voos || []).length;
    const tooltipTexto = FHI_CATEGORIAS
      .map(c => `Valor ${c.rotulo}: ${this._moeda(item[c.valor])}`)
      .join('\n');
    const colunasHoras = FHI_CATEGORIAS
      .map(c => `<td class="text-right">${this._horas(item[c.horas])}</td>`)
      .join('');
    return `
      <tr data-instrutor="${escapeHtml(item.instrutor)}">
        <td>${escapeHtml(item.instrutor)}</td>
        ${colunasHoras}
        <td class="text-right">
          <span class="fhi-total fhi-tooltip-gatilho" tabindex="0" data-tooltip="${escapeHtml(tooltipTexto)}">${this._moeda(item.totalAPagar)}</span>
        </td>
        <td class="text-right fhi-acoes">
          <button class="btn btn-ghost btn-sm fhi-btn-acao fhi-btn-voos" type="button" ${totalVoos ? '' : 'disabled'}
            title="${totalVoos ? 'Ver os voos considerados neste mês' : 'Nenhum voo neste mês'}">
            Ver voos
          </button>
          <button class="btn btn-ghost btn-sm fhi-btn-acao fhi-btn-exportar" type="button"
            title="Copiar mensagem pronta para enviar ao instrutor">
            Exportar
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

    this._renderizarVoosTabs(item);
    this._renderizarVoos();
    abrirModal('fhi-modal-voos');
  },

  /**
   * Abas do modal montadas por JS a partir de `FHI_CATEGORIAS`, com a
   * contagem de voos de cada uma. Escritas no HTML seriam quatro blocos
   * quase idênticos, e acrescentar categoria voltaria a exigir mexer em
   * dois arquivos.
   */
  _renderizarVoosTabs(item) {
    const alvo = document.getElementById('fhi-voos-tabs');
    if (!alvo || !item) return;
    const voos = item.voos || [];
    alvo.innerHTML = FHI_CATEGORIAS.map(c => {
      const total = voos.filter(v => v.categoria === c.chave).length;
      const ativo = c.chave === this._voosCategoria;
      return `<button class="fhi-voos-tab${ativo ? ' active' : ''}" type="button" role="tab"
        aria-selected="${ativo}" data-cat="${c.chave}">${escapeHtml(c.rotulo)} <span>${total}</span></button>`;
    }).join('');
  },

  _renderizarVoos() {
    const lista = document.getElementById('fhi-voos-lista');
    if (!lista || !this._voosInstrutor) return;
    const voos = (this._voosInstrutor.voos || []).filter(v => v.categoria === this._voosCategoria);

    if (!voos.length) {
      lista.innerHTML = '<p class="fhi-voos-vazio">Nenhum voo nessa categoria neste mês.</p>';
      return;
    }

    // A coluna Aeronave não é enfeite: desde 2026-09-03 é o equipamento que
    // decide se o voo é simulador e qual dos dois (SM- = AATD, PC- = PCATD).
    // Sem ela, auditar "por que este voo caiu em PCATD" exigiria abrir o
    // CAVOK.
    lista.innerHTML = `
      <table class="table">
        <thead>
          <tr><th>Data</th><th>Aeronave</th><th class="text-right">Horas</th><th>Missão (CAVOK)</th></tr>
        </thead>
        <tbody>
          ${voos.map(v => `
            <tr>
              <td>${escapeHtml(this._dataVoo(v.data))}</td>
              <td>${escapeHtml(v.aeronave || '—')}</td>
              <td class="text-right">${this._horas(v.horas)}</td>
              <td class="col-missao">${escapeHtml(v.missao || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  // ── Exportar mensagem para o instrutor ───────────────────

  _exportarInstrutor(nome) {
    const item = this.instrutores.find(i => i.instrutor === nome);
    if (!item) return;
    document.getElementById('fhi-exportar-titulo').textContent = `Mensagem para ${item.instrutor}`;
    const campo = document.getElementById('fhi-exportar-texto');
    if (campo) campo.value = this._textoExportacao(item);
    abrirModal('fhi-modal-exportar');
  },

  async _copiarMensagemExportacao() {
    const campo = document.getElementById('fhi-exportar-texto');
    if (!campo) return;
    await navigator.clipboard?.writeText(campo.value);
    toast('Mensagem copiada.', 'success');
  },

  /**
   * Monta a mensagem pronta para o instrutor: saudação, a discriminação
   * de cada voo considerado por categoria e o mesmo cálculo (horas × valor
   * = total) que a linha da tabela mostra, para o instrutor conferir contra
   * o próprio CAVOK antes de emitir a NF.
   */
  _textoExportacao(item) {
    const categorias = FHI_CATEGORIAS.map(c => ({
      chave: c.chave,
      rotulo: c.rotulo,
      horas: Number(item[c.horas]) || 0,
      valor: Number(item[c.valor]) || 0
    }));

    const linhas = [
      `Boa tarde, ${item.instrutor}`,
      '',
      'Segue em anexo abaixo horas do CAVOK referente aos voos realizados.'
    ];

    categorias.forEach(c => {
      const voos = (item.voos || []).filter(v => v.categoria === c.chave);
      if (!voos.length) return;
      linhas.push('', `Voos ${c.rotulo}:`);
      voos.forEach(v => linhas.push(`${this._dataVoo(v.data)} - ${this._horas(v.horas)} - ${v.missao || ''}`));
    });

    // Categoria sem hora no mês fica FORA da conta: com quatro categorias,
    // "0,0 h * R$ 45,00 = R$ 0,00" repetido é ruído em cima justamente das
    // linhas que o instrutor precisa conferir.
    categorias.forEach(c => {
      if (!c.horas) return;
      linhas.push('', `Período totaliza ${this._horas(c.horas)} ${c.rotulo} * ${this._moeda(c.valor)} = ${this._moeda(c.horas * c.valor)}`);
    });

    linhas.push('', `TOTAL ${this._moeda(item.totalAPagar)}`, '', 'Estando de acordo, peço a gentileza de emitir a NF');

    return linhas.join('\n');
  },

  // ── Aba "Valores dos instrutores" ────────────────────────

  async _carregarValores() {
    this.setLoading(true, 'Carregando valores dos instrutores...');
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
    const campos = FHI_CATEGORIAS.map(c => `
      <td class="text-right"><input type="number" min="0" step="0.01" class="fhi-input-valor"
        data-categoria="${c.chave}" value="${this._numeroInput(item[c.valor])}"
        aria-label="Valor ${escapeHtml(c.rotulo)} de ${escapeHtml(item.instrutor)}"></td>`).join('');
    return `
      <tr data-instrutor="${escapeHtml(item.instrutor)}">
        <td>${escapeHtml(item.instrutor)}</td>
        ${campos}
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

  /** Nome do campo do payload que guarda o valor daquela categoria. */
  _campoDaCategoria(categoria) {
    const achado = FHI_CATEGORIAS.find(c => c.chave === categoria);
    return achado ? achado.valor : '';
  },
  _campoValor(item, categoria) {
    const campo = this._campoDaCategoria(categoria);
    return campo ? item[campo] : 0;
  },
  _aplicarValor(item, categoria, valor) {
    const campo = this._campoDaCategoria(categoria);
    if (campo) item[campo] = valor;
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
      const rotuloCategoria = {};
      FHI_CATEGORIAS.forEach(c => { rotuloCategoria[c.chave] = c.rotulo; });
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
    // Delegação, e não um listener por aba: as abas nascem do
    // `_renderizarVoosTabs` a cada abertura do modal, então um bind direto
    // no carregamento não encontraria nenhuma.
    document.getElementById('fhi-voos-tabs')?.addEventListener('click', event => {
      const tab = event.target.closest('.fhi-voos-tab');
      if (!tab) return;
      this._voosCategoria = tab.dataset.cat;
      this._renderizarVoosTabs(this._voosInstrutor);
      this._renderizarVoos();
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
      fecharModal('fhi-modal-exportar');
    });
    document.getElementById('fhi-exportar-copiar')?.addEventListener('click', () => this._copiarMensagemExportacao());

    // Scroll não bubbla, então captura é o único jeito de pegar o scroll de
    // dentro do .table-wrapper também, não só o da página. Só esconde: o
    // tooltip é uma interação curta, não precisa reancorar.
    window.addEventListener('scroll', () => this._esconderTooltip(), true);
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

  setLoading(ativo, texto = 'Carregando fechamento de horas...') {
    const overlay = document.getElementById('fhi-loading');
    const label = document.getElementById('fhi-loading-text');
    if (label) label.textContent = texto;
    overlay?.classList.toggle('active', !!ativo);
  }
};

document.addEventListener('DOMContentLoaded', () => FechamentoHorasInstrutores.iniciar());
