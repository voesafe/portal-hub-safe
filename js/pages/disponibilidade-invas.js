// ============================================================
// disponibilidade-invas.js — Disponibilidade (Eventual) e pedidos de
// folga (CLT) dos instrutores de INVA
// SAFE Hub
//
// ⚠️ REGRA RÍGIDA: esta tela só mostra e só altera a disponibilidade do
// PRÓPRIO usuário logado. Não existe seletor de instrutor na tela porque
// não pode existir — o backend nunca aceitaria um id de outro instrutor
// mesmo que o front mandasse (ver DisponibilidadeInva.gs).
//
// SEM ATUALIZAÇÃO OTIMISTA, de propósito: quem decide se o dia ainda está
// no prazo é o servidor (usa a data dele, não a do navegador), e fingir
// sucesso numa gravação que vai ser recusada mostraria "salvo" numa
// mudança que não aconteceu. Mesma regra do Fechamento de Horas.
//
// As contas de prazo abaixo (_diaEditavelEventual/_diaEditavelClt) são
// ESPELHO das mesmas contas em DisponibilidadeInva.gs, só para a tela
// desenhar o calendário como editável/bloqueado sem uma chamada por dia
// navegado. Quem decide de verdade, nas duas pontas, é o servidor.
// ============================================================

const DisponibilidadeInvas = {
  tipoInstrutor: '',       // 'eventual' | 'clt', vem da sessão/leitura
  hoje: '',                // 'aaaa-mm-dd', data do SERVIDOR
  diasAntecedenciaEventual: 4,
  diasAntecedenciaClt: 15,
  registros: [],
  porData: new Map(),
  mesAtual: null,          // Date do primeiro dia do mês exibido
  enviando: false,

  // ── Leitura consolidada (CCO/gestão) ──────────────────────────
  // Permissão SEPARADA de `visualizar_propria` — quem gerencia não é
  // instrutor, e um instrutor nunca tem esta. Sem edição nenhuma aqui.
  podeVerPropria: false,
  podeVerTodos: false,
  abaAtual: 'propria',
  instrutores: [],
  porDataTodos: new Map(),
  mesAtualTodos: null,
  buscaTodos: '',

  async init() {
    Auth.proteger();
    Auth.protegerDisponibilidadeInvas();
    Auth.preencherUI();
    this.podeVerPropria = Auth.temPermissao('disponibilidade_inva.visualizar_propria');
    this.podeVerTodos = Auth.temPermissao('disponibilidade_inva.visualizar_todos');
    this._bindHamburger();
    this._bind();
    this._prepararAbas();
    await this.carregar();
  },

  // Só quem tem as DUAS permissões vê a escolha; caso contrário a página
  // já nasce na única aba que faz sentido para a pessoa.
  _prepararAbas() {
    const tabs = document.getElementById('di-tabs');
    const tabPropria = document.getElementById('di-tab-propria');
    const tabTodos = document.getElementById('di-tab-todos');
    const painelPropria = document.getElementById('di-painel-propria');
    const painelTodos = document.getElementById('di-painel-todos');

    if (tabs) tabs.hidden = !(this.podeVerPropria && this.podeVerTodos);

    const ativar = aba => {
      this.abaAtual = aba;
      tabPropria?.classList.toggle('is-active', aba === 'propria');
      tabTodos?.classList.toggle('is-active', aba === 'todos');
      tabPropria?.setAttribute('aria-selected', String(aba === 'propria'));
      tabTodos?.setAttribute('aria-selected', String(aba === 'todos'));
      if (painelPropria) painelPropria.hidden = aba !== 'propria';
      if (painelTodos) painelTodos.hidden = aba !== 'todos';
    };

    tabPropria?.addEventListener('click', () => ativar('propria'));
    tabTodos?.addEventListener('click', () => ativar('todos'));

    ativar(this.podeVerPropria ? 'propria' : 'todos');

    if (!this.podeVerPropria) {
      const sub = document.getElementById('di-subtitulo');
      if (sub) sub.textContent = 'Consulta consolidada';
    }
  },

  // ⚠️ O toggle do menu no celular é responsabilidade do JS de CADA página
  // (padrão em progresso-alunos.js); o auth.js só ajusta aria-expanded e
  // fecha o menu.
  _bindHamburger() {
    const btn = document.getElementById('hamburger');
    const side = document.getElementById('sidebar');
    const over = document.getElementById('sidebar-overlay');
    btn?.addEventListener('click', () => {
      side?.classList.toggle('mobile-open');
      over?.classList.toggle('active');
    });
    over?.addEventListener('click', () => {
      side?.classList.remove('mobile-open');
      over?.classList.remove('active');
    });
  },

  _bind() {
    document.getElementById('di-mes-anterior')?.addEventListener('click', () => this._navegarMes(-1));
    document.getElementById('di-mes-proximo')?.addEventListener('click', () => this._navegarMes(1));

    document.getElementById('di-cal-grid')?.addEventListener('click', event => {
      const dia = event.target.closest('.di-day');
      if (!dia || !dia.dataset.data) return;

      // Bloqueado: NENHUM botão aqui tem o atributo `disabled` de propósito
      // (disabled não dispara `click`), então é este guard que garante a
      // mensagem em qualquer tentativa de alteração, onde quer que o toque
      // caia dentro da célula.
      if (dia.dataset.bloqueado === '1') {
        toast(this.tipoInstrutor === 'clt'
          ? 'Fora do prazo para pedir folga neste mês. Entre em contato direto com o CCO.'
          : 'Para alterações neste prazo, entre em contato direto com o CCO.', 'warning');
        return;
      }

      const btnTurno = event.target.closest('.di-turno-btn');
      const btnFolga = event.target.closest('.di-folga-btn');
      if (btnTurno) this._alternarTurno(dia.dataset.data, btnTurno.dataset.turno);
      else if (btnFolga) this._alternarFolga(dia.dataset.data);
    });

    document.getElementById('di-todos-mes-anterior')?.addEventListener('click', () => this._navegarMesTodos(-1));
    document.getElementById('di-todos-mes-proximo')?.addEventListener('click', () => this._navegarMesTodos(1));
    document.getElementById('di-todos-busca')?.addEventListener('input', event => {
      this.buscaTodos = event.target.value || '';
      this.renderTudoTodos();
    });
  },

  async carregar() {
    this._mostrarCarregando(true);
    const tarefas = [];
    if (this.podeVerPropria) tarefas.push(this._carregarPropria());
    if (this.podeVerTodos) tarefas.push(this._carregarTodos());
    await Promise.all(tarefas);
    this._mostrarCarregando(false);
  },

  async _carregarPropria() {
    const res = await API.getDisponibilidadeInva();
    if (!res.ok) {
      toast(res.error || 'Não foi possível carregar sua disponibilidade.', 'error');
      return;
    }

    this.tipoInstrutor = String(res.data.tipoInstrutor || '');
    this.hoje = String(res.data.hoje || '');
    this.diasAntecedenciaEventual = Number(res.data.diasAntecedenciaEventual) || 4;
    this.diasAntecedenciaClt = Number(res.data.diasAntecedenciaClt) || 15;
    this.registros = Array.isArray(res.data.registros) ? res.data.registros : [];
    this._indexar();

    if (!this.mesAtual) this.mesAtual = this._primeiroDiaMes(this._parseData(this.hoje));

    this._renderSubtitulo();
    this._renderLegenda();
    this.renderTudo();
  },

  // Leitura consolidada: puramente informativa, sem regra de prazo — por
  // isso o mês inicial vem do relógio do navegador mesmo (não há decisão
  // nenhuma sendo tomada contra essa data, só "que mês abrir por padrão").
  async _carregarTodos() {
    const res = await API.getDisponibilidadeInvaTodos();
    if (!res.ok) {
      toast(res.error || 'Não foi possível carregar a disponibilidade dos instrutores.', 'error');
      return;
    }

    this.instrutores = Array.isArray(res.data) ? res.data : [];
    this._indexarTodos();
    if (!this.mesAtualTodos) this.mesAtualTodos = this._primeiroDiaMes(new Date());

    this.renderTudoTodos();
  },

  _indexarTodos() {
    this.porDataTodos = new Map();
    this.instrutores.forEach(inst => {
      (inst.registros || []).forEach(r => {
        if (!this.porDataTodos.has(r.data)) this.porDataTodos.set(r.data, []);
        this.porDataTodos.get(r.data).push({ nome: inst.nome, tipoRegistro: r.tipoRegistro, turno: r.turno });
      });
    });
  },

  _indexar() {
    this.porData = new Map();
    this.registros.forEach(r => this.porData.set(r.data, r));
  },

  _mostrarCarregando(ativo) {
    document.getElementById('di-loading')?.classList.toggle('active', ativo);
  },

  _renderSubtitulo() {
    const el = document.getElementById('di-subtitulo');
    if (!el) return;
    el.textContent = this.tipoInstrutor === 'clt'
      ? 'Instrutor CLT · pedidos de folga'
      : 'Instrutor Eventual · disponibilidade por turno';
  },

  _renderLegenda() {
    const el = document.getElementById('di-legenda');
    if (el) el.hidden = this.tipoInstrutor !== 'eventual';
  },

  // ── Datas ────────────────────────────────────────────────────
  // Meia-noite local para as duas pontas da conta (hoje e o dia da célula):
  // consistente entre si é o que basta para a UI, e é só isso que o front
  // decide — a autoridade continua sendo o servidor.
  _parseData(aaaaMmDd) {
    return new Date(`${aaaaMmDd}T00:00:00`);
  },

  _fmtData(data) {
    const y = data.getFullYear();
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const d = String(data.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  _primeiroDiaMes(data) {
    return new Date(data.getFullYear(), data.getMonth(), 1);
  },

  _diferencaDias(a, b) {
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  },

  // Eventual: editável a partir de hoje+N dias (inclusive).
  _diaEditavelEventual(dataStr) {
    return this._diferencaDias(this._parseData(dataStr), this._parseData(this.hoje)) >= this.diasAntecedenciaEventual;
  },

  // CLT: bloqueio é do MÊS DE REFERÊNCIA inteiro — todo dia do mesmo mês
  // compartilha o mesmo limite (o dia 16/10 é o corte para o mês de
  // novembro inteiro, não um limite por dia dentro dele).
  _diaEditavelClt(dataStr) {
    const [ano, mes] = dataStr.split('-');
    const primeiroDiaMes = `${ano}-${mes}-01`;
    return this._diferencaDias(this._parseData(primeiroDiaMes), this._parseData(this.hoje)) > this.diasAntecedenciaClt;
  },

  _diaEditavel(dataStr) {
    return this.tipoInstrutor === 'clt' ? this._diaEditavelClt(dataStr) : this._diaEditavelEventual(dataStr);
  },

  // ── Navegação de mês ─────────────────────────────────────────
  _navegarMes(delta) {
    this.mesAtual = new Date(this.mesAtual.getFullYear(), this.mesAtual.getMonth() + delta, 1);
    this.renderTudo();
  },

  _navegarMesTodos(delta) {
    this.mesAtualTodos = new Date(this.mesAtualTodos.getFullYear(), this.mesAtualTodos.getMonth() + delta, 1);
    this.renderTudoTodos();
  },

  // ── Leitura consolidada: calendário só de leitura ────────────
  renderTudoTodos() {
    const titulo = document.getElementById('di-todos-cal-titulo');
    if (titulo && this.mesAtualTodos) {
      titulo.textContent = this.mesAtualTodos.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }

    const grid = document.getElementById('di-todos-cal-grid');
    const vazio = document.getElementById('di-todos-vazio');
    if (vazio) vazio.hidden = this.instrutores.length > 0;
    if (!grid || !this.mesAtualTodos) return;

    if (!this.instrutores.length) { grid.innerHTML = ''; return; }

    const ano = this.mesAtualTodos.getFullYear();
    const mes = this.mesAtualTodos.getMonth();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const diasMesAnterior = new Date(ano, mes, 0).getDate();
    const hojeStr = this._fmtData(new Date());

    const celulas = [];
    for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
      celulas.push(this._celulaInerte(diasMesAnterior - i));
    }
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dataStr = this._fmtData(new Date(ano, mes, dia));
      celulas.push(this._celulaDiaTodos(dia, dataStr, dataStr === hojeStr));
    }
    const restam = (7 - (celulas.length % 7)) % 7;
    for (let dia = 1; dia <= restam; dia++) {
      celulas.push(this._celulaInerte(dia));
    }

    grid.innerHTML = celulas.join('');
  },

  _celulaDiaTodos(numero, dataStr, ehHoje) {
    const pessoas = this.porDataTodos.get(dataStr) || [];
    const busca = this.buscaTodos.trim().toLowerCase();
    const classes = ['di-day', ehHoje ? 'is-hoje' : ''].filter(Boolean).join(' ');

    const chips = pessoas.map(p => {
      const oculto = busca && !p.nome.toLowerCase().includes(busca);
      const classe = p.tipoRegistro === 'folga' ? 'folga' : (p.turno || 'dia_inteiro');
      const rotulo = p.tipoRegistro === 'folga' ? `${p.nome} · Folga` : `${p.nome} · ${this._rotuloTurno(p.turno)}`;
      return `<span class="di-chip ${classe}${oculto ? ' is-oculto' : ''}" title="${this._escape(rotulo)}">${this._escape(rotulo)}</span>`;
    }).join('');

    return `
      <div class="${classes}" role="gridcell">
        <span class="di-day-num">${numero}</span>
        <div class="di-chips">${chips}</div>
      </div>`;
  },

  _rotuloTurno(turno) {
    return { manha: 'Manhã', tarde: 'Tarde', dia_inteiro: 'Dia inteiro' }[turno] || turno || '';
  },

  renderTudo() {
    this._renderRegraPrazo();
    this._renderCalendario();
  },

  // Mensagem exigida pela regra de negócio. NUNCA fica escondida — não é
  // aviso de conveniência que se dispensa, é a mensagem que a regra pede.
  _renderRegraPrazo() {
    const el = document.getElementById('di-regra');
    if (!el) return;

    if (this.tipoInstrutor === 'clt') {
      const primeiroDiaMes = new Date(this.mesAtual.getFullYear(), this.mesAtual.getMonth(), 1);
      const editavel = this._diaEditavelClt(this._fmtData(primeiroDiaMes));
      const mesLabel = primeiroDiaMes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const dataLimite = new Date(primeiroDiaMes);
      dataLimite.setDate(dataLimite.getDate() - this.diasAntecedenciaClt - 1);
      const dataLimiteLabel = dataLimite.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      el.className = 'di-regra ' + (editavel ? 'is-info' : 'is-erro');
      el.innerHTML = editavel
        ? `Pedidos de folga de <strong>${this._escape(mesLabel)}</strong> podem ser feitos até <strong>${dataLimiteLabel}</strong>.`
        : `Fora do prazo para pedir folga em <strong>${this._escape(mesLabel)}</strong>. Entre em contato direto com o CCO.`;
      return;
    }

    const dataCorte = new Date(this._parseData(this.hoje));
    dataCorte.setDate(dataCorte.getDate() + this.diasAntecedenciaEventual);
    const dataCorteLabel = dataCorte.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    el.className = 'di-regra is-info';
    el.innerHTML = `Você pode alterar a disponibilidade a partir de <strong>${dataCorteLabel}</strong> (hoje + ${this.diasAntecedenciaEventual} dias). Para alterações neste prazo, entre em contato direto com o CCO.`;
  },

  _renderCalendario() {
    const titulo = document.getElementById('di-cal-titulo');
    if (titulo) titulo.textContent = this.mesAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const grid = document.getElementById('di-cal-grid');
    if (!grid) return;

    const ano = this.mesAtual.getFullYear();
    const mes = this.mesAtual.getMonth();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const diasMesAnterior = new Date(ano, mes, 0).getDate();
    const hojeStr = this.hoje;

    const celulas = [];

    for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
      celulas.push(this._celulaInerte(diasMesAnterior - i));
    }
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dataStr = this._fmtData(new Date(ano, mes, dia));
      celulas.push(this._celulaDia(dia, dataStr, dataStr === hojeStr));
    }
    const restam = (7 - (celulas.length % 7)) % 7;
    for (let dia = 1; dia <= restam; dia++) {
      celulas.push(this._celulaInerte(dia));
    }

    grid.innerHTML = celulas.join('');
  },

  _celulaInerte(numero) {
    return `<div class="di-day is-outro-mes" role="gridcell"><span class="di-day-num">${numero}</span></div>`;
  },

  _celulaDia(numero, dataStr, ehHoje) {
    const editavel = this._diaEditavel(dataStr);
    const registro = this.porData.get(dataStr);
    const classes = ['di-day', ehHoje ? 'is-hoje' : '', editavel ? '' : 'is-bloqueado'].filter(Boolean).join(' ');

    const controles = this.tipoInstrutor === 'clt'
      ? this._controlesFolga(registro)
      : this._controlesTurno(registro);

    return `
      <div class="${classes}" role="gridcell" data-data="${dataStr}" data-bloqueado="${editavel ? 0 : 1}">
        <span class="di-day-num">${numero}</span>
        ${controles}
      </div>`;
  },

  _controlesTurno(registro) {
    const turnoAtivo = registro?.tipoRegistro === 'disponibilidade' ? registro.turno : '';
    const btn = (turno, rotulo, letra) =>
      `<button type="button" class="di-turno-btn ${turno} ${turnoAtivo === turno ? 'is-ativo' : ''}"
               data-turno="${turno}" title="${rotulo}" aria-pressed="${turnoAtivo === turno}">${letra}</button>`;
    return `<div class="di-turnos">
      ${btn('manha', 'Manhã', 'M')}
      ${btn('tarde', 'Tarde', 'T')}
      ${btn('dia_inteiro', 'Dia inteiro', 'D')}
    </div>`;
  },

  _controlesFolga(registro) {
    const ativo = registro?.tipoRegistro === 'folga';
    return `<button type="button" class="di-folga-btn ${ativo ? 'is-ativo' : ''}" aria-pressed="${ativo}">
      ${ativo ? 'Folga ✓' : 'Folga'}
    </button>`;
  },

  // ── Escrita (sem otimista — ver o porquê no topo do arquivo) ──

  async _alternarTurno(dataStr, turno) {
    if (this.enviando) return;
    const registro = this.porData.get(dataStr);
    const jaEstaNesseTurno = registro?.tipoRegistro === 'disponibilidade' && registro.turno === turno;

    this.enviando = true;
    const res = jaEstaNesseTurno
      ? await API.excluirDisponibilidadeInva({ data: dataStr })
      : await API.salvarDisponibilidadeInva({ data: dataStr, turno });
    this.enviando = false;

    this._aplicarResultado(res);
  },

  async _alternarFolga(dataStr) {
    if (this.enviando) return;
    const registro = this.porData.get(dataStr);
    const jaEhFolga = registro?.tipoRegistro === 'folga';

    this.enviando = true;
    const res = jaEhFolga
      ? await API.excluirDisponibilidadeInva({ data: dataStr })
      : await API.salvarDisponibilidadeInva({ data: dataStr });
    this.enviando = false;

    this._aplicarResultado(res);
  },

  // O servidor devolve a lista inteira recalculada (mesmo formato do
  // `carregar`), então a tela sempre desenha o que está de verdade
  // gravado — nunca o que a gente torceu para ter dado certo.
  _aplicarResultado(res) {
    if (!res.ok) {
      toast(res.error || 'Não foi possível salvar. Tente de novo.', 'error');
      return;
    }
    this.tipoInstrutor = String(res.data.tipoInstrutor || this.tipoInstrutor);
    this.hoje = String(res.data.hoje || this.hoje);
    this.diasAntecedenciaEventual = Number(res.data.diasAntecedenciaEventual) || this.diasAntecedenciaEventual;
    this.diasAntecedenciaClt = Number(res.data.diasAntecedenciaClt) || this.diasAntecedenciaClt;
    this.registros = Array.isArray(res.data.registros) ? res.data.registros : [];
    this._indexar();
    this.renderTudo();
  },

  _escape(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
};

document.addEventListener('DOMContentLoaded', () => DisponibilidadeInvas.init());
