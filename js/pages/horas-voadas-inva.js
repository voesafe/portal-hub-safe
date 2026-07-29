// ============================================================
// horas-voadas-inva.js — Integração do painel externo ao Hub
// ============================================================

const HorasVoadasInva = {
  instrutores: [],
  grafico: null,
  filtro: '',
  metaHoras: 100,
  bases: ['SJK', 'CPQ'],
  nomesBases: { SJK: 'São José dos Campos', CPQ: 'Campinas' },
  arraste: null,
  liberacao: null,
  // Catalogo de etiquetas, vindo junto do get_data para nao custar uma
  // segunda ida de ~10s ao Apps Script so para abrir a tela.
  etiquetas: [],
  // Estado do popover no molde do Trello. Um so na pagina inteira: ele vive
  // FORA da lista, senao o innerHTML de cada render o destruiria aberto.
  pop: { instrutor: null, painel: 'lista', editando: null, cor: 'verde', busca: '' },
  // Etiquetas marcadas no formulario de cadastro, antes de o instrutor existir.
  etiquetasNovoInstrutor: [],
  // Paleta fechada. A chave viaja para o backend, o tom vem do CSS, que
  // afina cada cor no claro e no escuro. Cor livre sairia ilegivel num deles.
  CORES: [
    { chave: 'verde', nome: 'Verde' },
    { chave: 'limao', nome: 'Limão' },
    { chave: 'amarelo', nome: 'Amarelo' },
    { chave: 'laranja', nome: 'Laranja' },
    { chave: 'vermelho', nome: 'Vermelho' },
    { chave: 'rosa', nome: 'Rosa' },
    { chave: 'roxo', nome: 'Roxo' },
    { chave: 'azul', nome: 'Azul' },
    { chave: 'ceu', nome: 'Céu' },
    { chave: 'cinza', nome: 'Cinza' }
  ],
  COR_PADRAO: 'cinza',
  NOME_MAX: 60,
  // Uma ordem por base, escolhida no menuzinho do cabecalho de cada card.
  ordens: { SJK: 'alfabetica', CPQ: 'alfabetica' },
  // O Hub recarrega a pagina inteira a cada item da sidebar, entao sem
  // persistir a escolha se perderia a cada visita.
  CHAVE_ORDENS: 'horas-inva-ordens',
  ROTULOS_ORDEM: {
    alfabetica: 'Ordem alfabética',
    'horas-asc': 'Horas, da menor',
    'horas-desc': 'Horas, da maior'
  },
  // Arrastar termina em pointerup, mas o navegador ainda dispara o click do
  // punho logo depois. Sem esta trava, um arraste bem-sucedido moveria de
  // novo pelo click e o instrutor voltaria para a base de origem.
  ignorarCliqueDoPunho: false,

  escape(valor) {
    // Escapa tambem as aspas: o retorno entra em atributo (data-nome, title),
    // e um nome com aspas na planilha quebraria o HTML montado por string.
    const el = document.createElement('div');
    el.textContent = String(valor ?? '');
    return el.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  // ── Leitura do instrutor ────────────────────────────────────

  horasDe(instrutor) {
    return Number.parseFloat(instrutor.totalHoras) || 0;
  },

  formatarHoras(valor) {
    return Number(valor).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    });
  },

  baseDoInstrutor(instrutor) {
    const base = String(instrutor.base || '').trim().toUpperCase();
    // Quem ainda nao tem base gravada aparece na primeira, senao sumiria
    // da tela por causa de uma celula vazia.
    return this.bases.includes(base) ? base : this.bases[0];
  },

  temFlagVerde(instrutor) {
    return this.horasDe(instrutor) >= this.metaHoras || instrutor.liberadoOpr === true;
  },

  motivoDaFlag(instrutor) {
    const motivos = [];
    const horas = this.horasDe(instrutor);
    if (horas >= this.metaHoras) {
      motivos.push(`${this.formatarHoras(horas)}h voadas (meta de ${this.metaHoras}h)`);
    }
    if (instrutor.liberadoOpr === true) {
      const quando = instrutor.liberadoEm ? ` em ${instrutor.liberadoEm}` : '';
      const quem = instrutor.liberadoPor ? ` por ${instrutor.liberadoPor}` : '';
      motivos.push(`liberado por OPR${quando}${quem}`);
    }
    return motivos.join(' · ');
  },

  // ── Etiquetas ───────────────────────────────────────────────

  corValida(cor) {
    return this.CORES.some(c => c.chave === cor) ? cor : this.COR_PADRAO;
  },

  etiquetaPorId(id) {
    return this.etiquetas.find(e => e.id === id) || null;
  },

  /** Ids do instrutor, sem orfao e na ordem do catalogo. */
  etiquetasDo(instrutor) {
    const ids = Array.isArray(instrutor?.etiquetas) ? instrutor.etiquetas : [];
    return this.etiquetas.filter(e => ids.includes(e.id)).map(e => e.id);
  },

  temEtiqueta(instrutor, id) {
    return this.etiquetasDo(instrutor).includes(id);
  },

  /** Conta por NOME, nao por id: a etiqueta pode ter sido excluida e recriada. */
  contarPorNome(nome) {
    const alvo = this.etiquetas.find(
      e => String(e.nome).trim().toUpperCase() === nome.toUpperCase()
    );
    if (!alvo) return null;
    return this.instrutores.filter(i => this.temEtiqueta(i, alvo.id)).length;
  },

  chipEtiqueta(etiqueta, extra = '') {
    return `<span class="hi-chip cor-${this.escape(this.corValida(etiqueta.cor))}${extra}"
      title="${this.escape(etiqueta.nome)}">${this.escape(etiqueta.nome)}</span>`;
  },

  chipsDoInstrutor(instrutor) {
    return this.etiquetasDo(instrutor)
      .map(id => this.chipEtiqueta(this.etiquetaPorId(id)))
      .join('');
  },

  // ── Popover de etiquetas (molde Trello) ─────────────────────

  popAberto() {
    return !!this.pop.instrutor;
  },

  /** O gatilho renasce a cada render: sempre reachar pelo nome do instrutor. */
  gatilhoDoPop() {
    if (!this.pop.instrutor) return null;
    return document.querySelector(
      `.hi-etiquetas-abrir[data-etiquetas="${CSS.escape(this.pop.instrutor)}"]`
    );
  },

  abrirPop(nome) {
    // Clicar de novo no mesmo gatilho fecha, que e o que o Trello faz.
    if (this.pop.instrutor === nome) { this.fecharPop(); return; }
    this.pop.instrutor = nome;
    this.pop.painel = 'lista';
    this.pop.editando = null;
    this.pop.busca = '';
    this.renderizarPop();
    this.posicionarPop();
    document.getElementById('hi-pop').hidden = false;
    document.querySelector('.hi-pop-busca')?.focus();
    this.marcarGatilhoAtivo();
  },

  fecharPop() {
    this.pop.instrutor = null;
    this.pop.editando = null;
    document.getElementById('hi-pop').hidden = true;
    this.marcarGatilhoAtivo();
  },

  marcarGatilhoAtivo() {
    document.querySelectorAll('.hi-etiquetas-abrir').forEach(botao => {
      const ativo = botao.dataset.etiquetas === this.pop.instrutor;
      botao.classList.toggle('is-aberto', ativo);
      botao.setAttribute('aria-expanded', String(ativo));
    });
  },

  /**
   * Ancorado no gatilho, com virada para cima quando nao ha espaco embaixo e
   * grude nas bordas da janela. Fixed, entao mede em coordenada de viewport.
   */
  posicionarPop() {
    const pop = document.getElementById('hi-pop');
    const gatilho = this.gatilhoDoPop();
    if (!gatilho) return;

    const alvo = gatilho.getBoundingClientRect();
    const margem = 8;
    const vao = 6;
    const alturaMinima = 160;

    // Precisa estar visivel para medir: escondido daria altura zero e o
    // popover nunca viraria para cima. O teto anterior tambem sai antes da
    // medida, senao a altura natural ficaria presa no teto da vez passada.
    const estavaOculto = pop.hidden;
    if (estavaOculto) { pop.style.visibility = 'hidden'; pop.hidden = false; }
    pop.style.maxHeight = '';
    const caixa = pop.getBoundingClientRect();
    const natural = caixa.height;

    const abaixo = window.innerHeight - alvo.bottom - vao - margem;
    const acima = alvo.top - vao - margem;
    // Vira para cima so quando nao cabe embaixo E ha mais espaco em cima.
    const paraCima = natural > abaixo && acima > abaixo;
    const disponivel = Math.max(alturaMinima, paraCima ? acima : abaixo);
    // ⚠️ Nao cabendo em nenhum dos dois lados, o popover ENCOLHE e rola por
    // dentro. Sem este teto ele vazava para fora da tela no celular, onde a
    // faixa util e curta, e as ultimas etiquetas ficavam inalcancaveis.
    if (natural > disponivel) pop.style.maxHeight = `${disponivel}px`;
    const altura = Math.min(natural, disponivel);
    if (estavaOculto) { pop.hidden = true; pop.style.visibility = ''; }

    const topo = paraCima ? alvo.top - vao - altura : alvo.bottom + vao;
    let esquerda = alvo.left;
    if (esquerda + caixa.width > window.innerWidth - margem) {
      esquerda = window.innerWidth - caixa.width - margem;
    }
    pop.style.top =
      `${Math.max(margem, Math.min(topo, window.innerHeight - altura - margem))}px`;
    pop.style.left = `${Math.max(margem, esquerda)}px`;
  },

  paletaHtml(selecionada) {
    return this.CORES.map(cor => `
      <button class="hi-pop-cor cor-${cor.chave}${cor.chave === selecionada ? ' is-ativa' : ''}"
        type="button" data-cor="${cor.chave}" title="${cor.nome}" aria-label="Cor ${cor.nome}"
        aria-pressed="${cor.chave === selecionada}"></button>
    `).join('');
  },

  renderizarPop() {
    const pop = document.getElementById('hi-pop');
    const instrutor = this.instrutores.find(i => i.nome === this.pop.instrutor);
    const editando = this.pop.editando
      ? this.etiquetaPorId(this.pop.editando)
      : null;

    if (this.pop.painel === 'editar') {
      pop.innerHTML = `
        <div class="hi-pop-head">
          <button class="hi-pop-icone" type="button" data-pop="voltar" aria-label="Voltar">&#8592;</button>
          <span class="hi-pop-titulo">${editando ? 'Editar etiqueta' : 'Criar etiqueta'}</span>
          <button class="hi-pop-icone" type="button" data-pop="fechar" aria-label="Fechar">&times;</button>
        </div>
        <form class="hi-pop-body" data-pop-form="etiqueta">
          <div class="hi-pop-previa">
            <span class="hi-chip cor-${this.corValida(this.pop.cor)}" data-pop-previa>
              ${this.escape(editando ? editando.nome : 'Nova etiqueta')}
            </span>
          </div>
          <label class="hi-pop-rotulo" for="hi-pop-nome">Nome</label>
          <input class="form-control hi-pop-nome" id="hi-pop-nome" type="text"
            maxlength="${this.NOME_MAX}" autocomplete="off"
            value="${this.escape(editando ? editando.nome : '')}"
            placeholder="Ex.: LIBERADO IFR AVIÃO">
          <span class="hi-pop-rotulo">Cor</span>
          <div class="hi-pop-paleta">${this.paletaHtml(this.corValida(this.pop.cor))}</div>
          <div class="hi-pop-acoes">
            ${editando
              ? `<button class="btn btn-ghost hi-pop-excluir" type="button" data-pop="excluir">Excluir</button>`
              : ''}
            <button class="btn btn-primary" type="submit" data-pop="salvar">
              ${editando ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      `;
      pop.querySelector('.hi-pop-nome')?.focus();
      return;
    }

    const termo = this.pop.busca.trim().toLocaleLowerCase('pt-BR');
    const visiveis = this.etiquetas.filter(
      e => String(e.nome).toLocaleLowerCase('pt-BR').includes(termo)
    );

    let lista = '';
    if (!this.etiquetas.length) {
      lista = `<li class="hi-pop-vazio">Nenhuma etiqueta ainda. Crie a primeira abaixo.</li>`;
    } else if (!visiveis.length) {
      lista = `<li class="hi-pop-vazio">Nenhuma etiqueta com esse nome.</li>`;
    } else {
      lista = visiveis.map(etiqueta => {
        const marcada = instrutor && this.temEtiqueta(instrutor, etiqueta.id);
        return `
          <li class="hi-pop-item">
            <button class="hi-pop-marcar cor-${this.corValida(etiqueta.cor)}${marcada ? ' is-marcada' : ''}"
              type="button" role="checkbox" aria-checked="${!!marcada}"
              data-pop="alternar" data-id="${this.escape(etiqueta.id)}">
              <span class="hi-pop-marcar-nome">${this.escape(etiqueta.nome)}</span>
              <span class="hi-pop-check" aria-hidden="true"></span>
            </button>
            <button class="hi-pop-lapis" type="button" data-pop="editar"
              data-id="${this.escape(etiqueta.id)}"
              aria-label="Editar a etiqueta ${this.escape(etiqueta.nome)}">
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M11.5 2.5l2 2L6 12l-2.6.6L4 10l7.5-7.5z" fill="none"
                  stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              </svg>
            </button>
          </li>
        `;
      }).join('');
    }

    pop.innerHTML = `
      <div class="hi-pop-head">
        <span class="hi-pop-titulo">Etiquetas</span>
        <button class="hi-pop-icone" type="button" data-pop="fechar" aria-label="Fechar">&times;</button>
      </div>
      <div class="hi-pop-body">
        <p class="hi-pop-alvo">${this.escape(this.pop.instrutor || '')}</p>
        ${this.etiquetas.length > 5
          ? `<input class="form-control hi-pop-busca" type="search" autocomplete="off"
              placeholder="Buscar etiqueta" value="${this.escape(this.pop.busca)}"
              aria-label="Buscar etiqueta">`
          : ''}
        <ul class="hi-pop-lista">${lista}</ul>
        <button class="hi-pop-criar" type="button" data-pop="criar">
          <span aria-hidden="true">+</span> Criar nova etiqueta
        </button>
      </div>
    `;
  },

  abrirPainelEtiqueta(id) {
    const etiqueta = id ? this.etiquetaPorId(id) : null;
    this.pop.painel = 'editar';
    this.pop.editando = etiqueta ? etiqueta.id : null;
    this.pop.cor = etiqueta ? this.corValida(etiqueta.cor) : 'verde';
    this.renderizarPop();
    this.posicionarPop();
  },

  voltarParaLista() {
    this.pop.painel = 'lista';
    this.pop.editando = null;
    this.renderizarPop();
    this.posicionarPop();
  },

  escolherCorPop(cor) {
    this.pop.cor = this.corValida(cor);
    const previa = document.querySelector('[data-pop-previa]');
    if (previa) {
      previa.className = `hi-chip cor-${this.pop.cor}`;
    }
    document.querySelectorAll('.hi-pop-cor').forEach(botao => {
      const ativa = botao.dataset.cor === this.pop.cor;
      botao.classList.toggle('is-ativa', ativa);
      botao.setAttribute('aria-pressed', String(ativa));
    });
  },

  /**
   * Marcar e desmarcar e otimista: mutacao simples de item que ja esta no
   * estado local e o servidor nao recalcula nada. Com ~10s de latencia,
   * esperar deixaria o chip aparecendo muito depois do clique.
   */
  async alternarEtiqueta(id) {
    const instrutor = this.instrutores.find(i => i.nome === this.pop.instrutor);
    const etiqueta = this.etiquetaPorId(id);
    if (!instrutor || !etiqueta) return;

    const anterior = this.etiquetasDo(instrutor);
    const novos = anterior.includes(id)
      ? anterior.filter(item => item !== id)
      : [...anterior, id];

    instrutor.etiquetas = novos;
    this.renderizarTudo();
    this.renderizarPop();
    this.posicionarPop();

    try {
      const resultado = await this.enviar('set_instructor_labels', {
        nome: instrutor.nome,
        etiquetas: novos
      });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar as etiquetas.');
      }
      // O Tipo e espelho do backend: aceitar o que ele devolveu evita a tela
      // discordar da planilha.
      if (resultado.data && 'tipo' in resultado.data) instrutor.tipo = resultado.data.tipo;
    } catch (erro) {
      console.error('[Etiquetas do instrutor]', erro);
      instrutor.etiquetas = anterior;
      this.renderizarTudo();
      if (this.popAberto()) { this.renderizarPop(); this.posicionarPop(); }
      toast(erro.message || 'Erro ao salvar as etiquetas.', 'error', 5000);
    }
  },

  /**
   * Criar e editar sao round-trip unico: o id de etiqueta nova nasce no
   * servidor, e a tela redesenha do catalogo que ele devolve. Fingir aqui
   * geraria um chip com id inventado.
   */
  async salvarEtiqueta(evento) {
    evento?.preventDefault();
    const campo = document.getElementById('hi-pop-nome');
    const nome = String(campo?.value || '').trim();
    if (!nome) {
      toast('Dê um nome para a etiqueta.', 'warning');
      campo?.focus();
      return;
    }

    const botao = document.querySelector('[data-pop="salvar"]');
    if (botao) botao.disabled = true;
    try {
      const resultado = await this.enviar('save_label', {
        id: this.pop.editando || '',
        nome,
        cor: this.pop.cor
      });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar a etiqueta.');
      }
      this.etiquetas = resultado.data?.etiquetas || this.etiquetas;
      toast(this.pop.editando ? 'Etiqueta atualizada.' : 'Etiqueta criada.', 'success');
      this.voltarParaLista();
      this.renderizarTudo();
    } catch (erro) {
      console.error('[Salvar etiqueta]', erro);
      toast(erro.message || 'Erro ao salvar a etiqueta.', 'error', 5000);
    } finally {
      const atual = document.querySelector('[data-pop="salvar"]');
      if (atual) atual.disabled = false;
    }
  },

  async excluirEtiqueta() {
    const etiqueta = this.etiquetaPorId(this.pop.editando);
    if (!etiqueta) return;

    const usada = this.instrutores.filter(i => this.temEtiqueta(i, etiqueta.id)).length;
    const aviso = usada
      ? `\n\nEla está em ${usada} ${usada === 1 ? 'instrutor' : 'instrutores'} e será removida de todos.`
      : '';
    if (!confirm(`Excluir a etiqueta "${etiqueta.nome}"?${aviso}`)) return;

    const botao = document.querySelector('[data-pop="excluir"]');
    if (botao) botao.disabled = true;
    try {
      const resultado = await this.enviar('delete_label', { id: etiqueta.id });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível excluir a etiqueta.');
      }
      this.etiquetas = resultado.data?.etiquetas || [];
      // O backend ja limpou a planilha; limpar o estado local evita o chip
      // fantasma sobreviver ate o proximo carregamento.
      this.instrutores.forEach(instrutor => {
        if (Array.isArray(instrutor.etiquetas)) {
          instrutor.etiquetas = instrutor.etiquetas.filter(id => id !== etiqueta.id);
        }
      });
      this.etiquetasNovoInstrutor = this.etiquetasNovoInstrutor.filter(id => id !== etiqueta.id);
      toast('Etiqueta excluída.', 'success');
      this.voltarParaLista();
      this.renderizarTudo();
    } catch (erro) {
      console.error('[Excluir etiqueta]', erro);
      toast(erro.message || 'Erro ao excluir a etiqueta.', 'error', 5000);
    } finally {
      const atual = document.querySelector('[data-pop="excluir"]');
      if (atual) atual.disabled = false;
    }
  },

  // ── Etiquetas no formulário de cadastro ─────────────────────

  renderizarEtiquetasCadastro() {
    const area = document.getElementById('cadastro-etiquetas');
    if (!area) return;
    if (!this.etiquetas.length) {
      area.innerHTML = `<p class="hi-cadastro-vazio">
        Nenhuma etiqueta cadastrada ainda. Você pode criar etiquetas pelo botão de
        etiquetas de qualquer instrutor, na aba Dashboard.
      </p>`;
      return;
    }
    area.innerHTML = this.etiquetas.map(etiqueta => {
      const marcada = this.etiquetasNovoInstrutor.includes(etiqueta.id);
      return `
        <button class="hi-chip cor-${this.corValida(etiqueta.cor)} hi-chip-toggle${marcada ? ' is-marcada' : ''}"
          type="button" role="checkbox" aria-checked="${marcada}"
          data-cadastro-etiqueta="${this.escape(etiqueta.id)}">
          ${this.escape(etiqueta.nome)}
        </button>
      `;
    }).join('');
  },

  alternarEtiquetaCadastro(id) {
    if (!this.etiquetaPorId(id)) return;
    this.etiquetasNovoInstrutor = this.etiquetasNovoInstrutor.includes(id)
      ? this.etiquetasNovoInstrutor.filter(item => item !== id)
      : [...this.etiquetasNovoInstrutor, id];
    this.renderizarEtiquetasCadastro();
  },

  // ── Ordenação de cada base ──────────────────────────────────

  carregarOrdens() {
    try {
      const salvo = JSON.parse(localStorage.getItem(this.CHAVE_ORDENS) || '{}');
      this.bases.forEach(base => {
        // So aceita ordem conhecida: um valor estranho no localStorage nao
        // pode deixar a lista sem criterio nenhum.
        if (this.ROTULOS_ORDEM[salvo[base]]) this.ordens[base] = salvo[base];
      });
    } catch (ignore) {
      // localStorage indisponivel ou JSON quebrado: fica no padrao alfabetico.
    }
  },

  salvarOrdens() {
    try {
      localStorage.setItem(this.CHAVE_ORDENS, JSON.stringify(this.ordens));
    } catch (ignore) {}
  },

  compararNome(a, b) {
    // localeCompare com pt-BR para acento nao jogar o nome para o fim,
    // mesma escolha da ordenacao do menu da sidebar.
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  },

  ordenarInstrutores(lista, ordem) {
    const copia = [...lista];
    // Empate desempata por nome nas duas ordens de horas, senao a lista
    // muda de posicao sozinha entre um render e outro.
    if (ordem === 'horas-asc') {
      return copia.sort((a, b) => this.horasDe(a) - this.horasDe(b) || this.compararNome(a, b));
    }
    if (ordem === 'horas-desc') {
      return copia.sort((a, b) => this.horasDe(b) - this.horasDe(a) || this.compararNome(a, b));
    }
    return copia.sort((a, b) => this.compararNome(a, b));
  },

  pintarMenusOrdem() {
    this.bases.forEach(base => {
      const ordem = this.ordens[base];
      const botao = document.querySelector(`.hi-ordenar-btn[data-ordenar="${base}"]`);
      if (botao) botao.title = `Ordenar: ${this.ROTULOS_ORDEM[ordem]}`;
      document.querySelectorAll(`.hi-ordenar-menu[data-menu="${base}"] button`)
        .forEach(item => {
          const ativa = item.dataset.ordem === ordem;
          item.classList.toggle('is-ativa', ativa);
          item.setAttribute('aria-checked', String(ativa));
        });
    });
  },

  abrirMenuOrdem(base) {
    document.querySelectorAll('.hi-ordenar-menu').forEach(menu => {
      const abrir = menu.dataset.menu === base && menu.hidden;
      menu.hidden = !abrir;
      const botao = document.querySelector(`.hi-ordenar-btn[data-ordenar="${menu.dataset.menu}"]`);
      botao?.setAttribute('aria-expanded', String(abrir));
      botao?.classList.toggle('is-aberto', abrir);
    });
  },

  fecharMenusOrdem() {
    document.querySelectorAll('.hi-ordenar-menu').forEach(menu => { menu.hidden = true; });
    document.querySelectorAll('.hi-ordenar-btn').forEach(botao => {
      botao.setAttribute('aria-expanded', 'false');
      botao.classList.remove('is-aberto');
    });
  },

  escolherOrdem(base, ordem) {
    if (!this.ROTULOS_ORDEM[ordem] || !this.bases.includes(base)) return;
    this.ordens[base] = ordem;
    this.salvarOrdens();
    this.fecharMenusOrdem();
    this.pintarMenusOrdem();
    this.renderizarBases();
  },

  // ── Render ──────────────────────────────────────────────────

  atualizarKpis() {
    const totalHoras = this.instrutores.reduce(
      (soma, instrutor) => soma + this.horasDe(instrutor),
      0
    );
    const liberados = this.instrutores.filter(i => this.temFlagVerde(i)).length;
    // O vinculo virou etiqueta, entao os dois KPIs contam quem TEM a etiqueta.
    // Nao da mais para deduzir um do outro por subtracao: com etiqueta, o
    // instrutor pode nao ter nenhuma das duas, e "total menos CLT" mentiria.
    const clt = this.contarPorNome('CLT');
    const eventual = this.contarPorNome('Eventual');

    document.getElementById('kpi-instrutores').textContent = this.instrutores.length;
    document.getElementById('kpi-horas').textContent = `${this.formatarHoras(totalHoras)}h`;
    // Sem a etiqueta no catalogo o numero nao existe, e mostrar 0 afirmaria
    // que ninguem e CLT.
    document.getElementById('kpi-clt').textContent = clt === null ? '—' : clt;
    document.getElementById('kpi-eventuais').textContent = eventual === null ? '—' : eventual;
    document.getElementById('kpi-liberados').textContent = liberados;
  },

  linhaInstrutor(instrutor, base) {
    const outra = this.bases.find(b => b !== base) || base;
    const horas = this.horasDe(instrutor);
    const liberado = instrutor.liberadoOpr === true;
    const flag = this.temFlagVerde(instrutor);
    const nome = this.escape(instrutor.nome);
    const motivo = this.escape(this.motivoDaFlag(instrutor));

    return `
      <li class="hi-item${flag ? ' is-liberado' : ''}" data-nome="${nome}">
        <button class="hi-punho" type="button" data-mover="${outra}"
          title="Arraste para a outra base, ou clique para mover para ${outra}"
          aria-label="Mover ${nome} para a base ${outra}">
          <span class="hi-punho-icone" aria-hidden="true"></span>
        </button>
        <div class="hi-item-info">
          <span class="hi-item-nome">
            ${nome}
            ${flag ? `<span class="hi-flag" role="img" title="${motivo}" aria-label="Liberado: ${motivo}"></span>` : ''}
          </span>
          <span class="hi-item-meta">
            ${this.chipsDoInstrutor(instrutor)}
            <button class="hi-etiquetas-abrir" type="button" data-etiquetas="${nome}"
              aria-haspopup="dialog" aria-expanded="false"
              title="Etiquetas de ${nome}" aria-label="Etiquetas de ${nome}">
              <span aria-hidden="true">+</span>
            </button>
            ${liberado ? `<span class="hi-selo-opr">OPR${instrutor.liberadoEm ? ` · ${this.escape(instrutor.liberadoEm)}` : ''}</span>` : ''}
          </span>
        </div>
        <span class="horas-inva-hours">${this.formatarHoras(horas)}h</span>
        <button class="btn btn-ghost hi-liberar" type="button" data-liberar="${liberado ? 'remover' : 'conceder'}">
          ${liberado ? 'Remover liberação' : 'Liberado por OPR'}
        </button>
      </li>
    `;
  },

  renderizarBases() {
    const termo = String(this.filtro).trim().toLocaleLowerCase('pt-BR');

    this.bases.forEach(base => {
      const lista = document.getElementById(`hi-lista-${base}`);
      if (!lista) return;

      const daBase = this.ordenarInstrutores(
        this.instrutores.filter(i => this.baseDoInstrutor(i) === base),
        this.ordens[base]
      );
      // A busca tambem casa etiqueta: com nomes como LIBERADO IFR AVIAO, a
      // pergunta real da operacao e "quem tem", e digitar o nome dela responde
      // sem precisar de um filtro proprio na tela.
      const visiveis = daBase.filter(i => {
        if (!termo) return true;
        if (String(i.nome || '').toLocaleLowerCase('pt-BR').includes(termo)) return true;
        return this.etiquetasDo(i).some(id =>
          String(this.etiquetaPorId(id)?.nome || '')
            .toLocaleLowerCase('pt-BR').includes(termo)
        );
      });
      const horasBase = daBase.reduce((soma, i) => soma + this.horasDe(i), 0);

      const contador = document.getElementById(`hi-contador-${base}`);
      const total = document.getElementById(`hi-total-${base}`);
      if (contador) {
        contador.textContent = `${daBase.length} ${daBase.length === 1 ? 'instrutor' : 'instrutores'}`;
      }
      if (total) total.textContent = `${this.formatarHoras(horasBase)}h`;

      if (!visiveis.length) {
        const texto = termo && daBase.length
          ? 'Nenhum instrutor com esse nome nesta base.'
          : 'Nenhum instrutor aqui. Arraste um pelo punho.';
        lista.innerHTML = `<li class="hi-vazio">${texto}</li>`;
        return;
      }

      lista.innerHTML = visiveis.map(i => this.linhaInstrutor(i, base)).join('');
    });
  },

  renderizarGrafico() {
    if (typeof Chart === 'undefined') {
      toast('Não foi possível carregar o componente do gráfico.', 'warning');
      return;
    }
    const canvas = document.getElementById('hours-chart');
    if (!canvas) return;
    this.grafico?.destroy();

    // Ordena por base para o grafico contar a mesma historia da lista.
    const ordenados = [...this.instrutores].sort((a, b) => {
      const baseA = this.baseDoInstrutor(a);
      const baseB = this.baseDoInstrutor(b);
      if (baseA !== baseB) return this.bases.indexOf(baseA) - this.bases.indexOf(baseB);
      return this.horasDe(b) - this.horasDe(a);
    });

    this.grafico = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ordenados.map(i => `${i.nome} (${this.baseDoInstrutor(i)})`),
        datasets: [{
          label: 'Horas voadas',
          data: ordenados.map(i => this.horasDe(i)),
          // Verde na barra de quem esta liberado: e a mesma informacao da
          // flag da lista, so que legivel de longe.
          backgroundColor: ordenados.map(i =>
            this.temFlagVerde(i) ? 'rgba(39,174,96,.78)' : 'rgba(91,174,226,.76)'
          ),
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
              label: context =>
                `${Number(context.raw).toLocaleString('pt-BR')} horas`
            }
          }
        }
      }
    });
  },

  renderizarTudo() {
    this.atualizarKpis();
    this.renderizarBases();
    this.renderizarGrafico();
    this.renderizarEtiquetasCadastro();
    // As listas sao remontadas por innerHTML, entao o gatilho do popover
    // aberto acabou de ser destruido e recriado: reancorar, senao o popover
    // fica flutuando longe do instrutor que ele edita.
    if (this.popAberto()) {
      this.marcarGatilhoAtivo();
      this.posicionarPop();
    }
  },

  // ── Arrastar entre bases ────────────────────────────────────

  iniciarArraste(evento, punho) {
    // Botao direito do mouse nao arrasta.
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;
    const item = punho.closest('.hi-item');
    if (!item) return;

    this.arraste = {
      nome: item.dataset.nome,
      item,
      punho,
      pointerId: evento.pointerId,
      x0: evento.clientX,
      y0: evento.clientY,
      largura: item.getBoundingClientRect().width,
      ativo: false,
      alvo: null,
      ghost: null
    };
    // A captura garante que o pointermove continue chegando mesmo quando o
    // dedo sai de cima do punho, que e o caso normal ao arrastar.
    try { punho.setPointerCapture(evento.pointerId); } catch (ignore) {}
  },

  moverArraste(evento) {
    const a = this.arraste;
    if (!a || evento.pointerId !== a.pointerId) return;

    if (!a.ativo) {
      // Folga antes de virar arraste, senao um clique com a mao tremida
      // no celular seria interpretado como arrastar.
      if (Math.hypot(evento.clientX - a.x0, evento.clientY - a.y0) < 6) return;
      a.ativo = true;
      a.item.classList.add('is-arrastando');
      a.ghost = document.createElement('div');
      a.ghost.className = 'hi-ghost';
      a.ghost.style.width = `${a.largura}px`;
      a.ghost.textContent = a.nome;
      document.body.appendChild(a.ghost);
      document.body.classList.add('hi-arrastando');
    }

    evento.preventDefault();
    a.ghost.style.transform = `translate(${evento.clientX + 14}px, ${evento.clientY + 14}px)`;

    // O ghost tem pointer-events:none no CSS, senao ele seria sempre o
    // elemento sob o cursor e nenhuma base seria detectada.
    const sob = document.elementFromPoint(evento.clientX, evento.clientY);
    const zona = sob?.closest('[data-drop-base]') || null;
    const base = zona?.dataset.dropBase || null;
    if (base === a.alvo) return;
    a.alvo = base;
    document.querySelectorAll('[data-drop-base]').forEach(el => {
      el.classList.toggle('is-drop', el.dataset.dropBase === base);
    });
  },

  encerrarArraste(evento) {
    const a = this.arraste;
    if (!a || (evento && evento.pointerId !== a.pointerId)) return;
    this.arraste = null;

    try { a.punho.releasePointerCapture(a.pointerId); } catch (ignore) {}
    a.ghost?.remove();
    a.item.classList.remove('is-arrastando');
    document.body.classList.remove('hi-arrastando');
    document.querySelectorAll('[data-drop-base]')
      .forEach(el => el.classList.remove('is-drop'));

    if (!a.ativo) return; // clique simples: quem resolve e o handler de click
    this.ignorarCliqueDoPunho = true;
    if (a.alvo) this.moverBase(a.nome, a.alvo);
  },

  cancelarArraste() {
    const a = this.arraste;
    if (!a) return;
    a.alvo = null;
    this.encerrarArraste({ pointerId: a.pointerId });
  },

  async moverBase(nome, base) {
    if (!this.bases.includes(base)) return;
    const instrutor = this.instrutores.find(i => i.nome === nome);
    if (!instrutor) return;

    const anterior = this.baseDoInstrutor(instrutor);
    if (anterior === base) return;

    // Otimista: e mutacao simples de item que ja existe no estado local e o
    // servidor nao recalcula nada. Com ~10s de latencia, esperar deixaria o
    // instrutor parado na base antiga depois do arraste.
    instrutor.base = base;
    this.renderizarTudo();

    try {
      const resultado = await this.enviar('set_instructor_base', { nome, base });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível mudar a base.');
      }
      toast(`${nome} agora está na base ${base}.`, 'success');
    } catch (erro) {
      console.error('[Base do instrutor]', erro);
      instrutor.base = anterior;
      this.renderizarTudo();
      toast(erro.message || 'Erro ao mudar a base do instrutor.', 'error', 5000);
    }
  },

  // ── Liberação por OPR ───────────────────────────────────────

  abrirLiberacao(nome, remover) {
    const instrutor = this.instrutores.find(i => i.nome === nome);
    if (!instrutor) return;

    this.liberacao = { nome, remover };
    const overlay = document.getElementById('modal-liberacao');
    document.getElementById('liberacao-titulo').textContent =
      remover ? 'Remover liberação de OPR' : 'Liberado por OPR';
    document.getElementById('liberacao-instrutor').textContent = nome;
    document.getElementById('liberacao-descricao').textContent = remover
      ? 'A marca verde concedida pela operação será retirada. A senha da operação é obrigatória.'
      : 'A operação assume a liberação deste instrutor, mesmo sem as 100h. A senha da operação é obrigatória.';
    document.getElementById('liberacao-confirmar').textContent =
      remover ? 'Remover liberação' : 'Liberar';
    document.getElementById('liberacao-confirmar').classList.toggle('btn-danger', !!remover);

    const senha = document.getElementById('liberacao-senha');
    senha.value = '';
    overlay.classList.add('open');
    // Deixa a transicao do modal terminar antes do foco, senao o teclado do
    // celular sobe com a caixa ainda no meio do caminho.
    setTimeout(() => senha.focus(), 120);
  },

  fecharLiberacao() {
    this.liberacao = null;
    document.getElementById('modal-liberacao').classList.remove('open');
    document.getElementById('liberacao-senha').value = '';
  },

  async confirmarLiberacao(evento) {
    evento?.preventDefault();
    const pedido = this.liberacao;
    if (!pedido) return;

    const senha = document.getElementById('liberacao-senha').value;
    if (!senha) {
      toast('Digite a senha da operação.', 'warning');
      return;
    }

    const botao = document.getElementById('liberacao-confirmar');
    botao.disabled = true;
    try {
      // Sem otimista: quem valida a senha e o servidor, e pintar a flag verde
      // numa senha errada seria exatamente o contrario do que o botao promete.
      const resultado = await this.enviar('set_instructor_release', {
        nome: pedido.nome,
        liberado: !pedido.remover,
        senha,
        autor: Auth.getNome() || Auth.getEmail() || ''
      });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível registrar a liberação.');
      }

      const instrutor = this.instrutores.find(i => i.nome === pedido.nome);
      if (instrutor) {
        const dados = resultado.data || {};
        instrutor.liberadoOpr = dados.liberadoOpr === true;
        instrutor.liberadoEm = dados.liberadoEm || '';
        instrutor.liberadoPor = dados.liberadoPor || '';
      }
      this.fecharLiberacao();
      this.renderizarTudo();
      toast(
        pedido.remover
          ? `Liberação de ${pedido.nome} removida.`
          : `${pedido.nome} liberado pela operação.`,
        'success'
      );
    } catch (erro) {
      console.error('[Liberação OPR]', erro);
      toast(erro.message || 'Erro ao registrar a liberação.', 'error', 5000);
    } finally {
      botao.disabled = false;
    }
  },

  // ── Carga e cadastro ────────────────────────────────────────

  async carregarDados(mostrarToast = false) {
    this.setCarregando(true);
    try {
      const resultado = await this.requisitar('get_data');
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'O backend não retornou os dados.');
      }
      this.instrutores = Array.isArray(resultado.data) ? resultado.data : [];
      if (Number(resultado.meta?.metaHoras) > 0) {
        this.metaHoras = Number(resultado.meta.metaHoras);
      }
      // Backend antigo (sem a aba de etiquetas publicada) nao manda o campo:
      // cai em catalogo vazio, a tela some com os chips e nao quebra.
      this.etiquetas = Array.isArray(resultado.meta?.etiquetas)
        ? resultado.meta.etiquetas
        : [];
      this.renderizarTudo();
      if (this.popAberto()) this.renderizarPop();
      document.getElementById('ultima-atualizacao').textContent =
        `Atualizado em ${new Date().toLocaleString('pt-BR')}.`;
      if (mostrarToast) toast('Dados atualizados.', 'success');
    } catch (erro) {
      console.error('[Horas Voadas INVA]', erro);
      this.bases.forEach(base => {
        const lista = document.getElementById(`hi-lista-${base}`);
        if (lista) {
          lista.innerHTML = '<li class="hi-vazio">Não foi possível carregar os dados.</li>';
        }
      });
      toast(erro.message || 'Erro ao carregar horas voadas.', 'error', 5000);
    } finally {
      this.setCarregando(false);
    }
  },

  async sincronizar() {
    const botao = document.getElementById('btn-sincronizar');
    botao.disabled = true;
    this.setCarregando(true, 'Conferindo os últimos dias no CAVOK...');
    try {
      // Sem parametro de data: o backend reconcilia a janela inteira, que e
      // o que pega voo lancado atrasado e corrige lancamento errado.
      const resultado = await this.requisitar('sync_cavok');
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível sincronizar o CAVOK.');
      }
      toast(resultado.message || 'Sincronização concluída.', 'success', 6000);
      // Dia que o CAVOK nao respondeu fica sem conferir de proposito, e nada
      // e removido nele. Avisar e melhor que deixar parecer tudo em dia.
      if (resultado.data?.falhas?.length) {
        toast(
          `Sem resposta do CAVOK para ${resultado.data.falhas.join('; ')}. Esses dias não foram conferidos.`,
          'warning',
          8000
        );
      }
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
    // currentTarget vira null assim que o despacho do evento termina, e aqui
    // existe await antes do reset. Guardar a referencia agora.
    const formulario = evento.currentTarget || document.getElementById('form-instrutor');
    const botao = document.getElementById('btn-salvar-instrutor');
    // O .value do input e string. Mandar "5.8" faz o Sheets interpretar como
    // data (5 de agosto). Converter para numero antes de sair daqui.
    const saldoBruto = Number.parseFloat(
      String(document.getElementById('instrutor-saldo').value).replace(',', '.')
    );
    const dados = {
      nome: document.getElementById('instrutor-nome').value.trim(),
      base: document.getElementById('instrutor-base').value,
      saldoInicial: Number.isFinite(saldoBruto) ? saldoBruto : 0,
      etiquetas: [...this.etiquetasNovoInstrutor]
    };
    if (!dados.nome || !dados.base) {
      toast('Preencha o nome e a base do instrutor.', 'warning');
      return;
    }

    botao.disabled = true;
    try {
      const resultado = await this.enviar('add_instructor', dados);
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível cadastrar o instrutor.');
      }
      formulario?.reset();
      // reset() nao alcanca os chips, que sao botoes e nao campos de form.
      this.etiquetasNovoInstrutor = [];
      this.renderizarEtiquetasCadastro();
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
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('hamburger');
    hamburger?.addEventListener('click', () => {
      const aberto = sidebar?.classList.toggle('mobile-open');
      overlay?.classList.toggle('active', aberto);
      hamburger.setAttribute('aria-expanded', String(!!aberto));
    });
    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('mobile-open');
      overlay.classList.remove('active');
      hamburger?.setAttribute('aria-expanded', 'false');
    });

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
    document.getElementById('busca-instrutor').addEventListener('input', evento => {
      this.filtro = evento.target.value;
      this.renderizarBases();
    });
    document.getElementById('form-instrutor').addEventListener(
      'submit',
      evento => this.cadastrar(evento)
    );
    document.getElementById('btn-cancelar-cadastro').addEventListener(
      'click',
      () => this.mudarView('dashboard')
    );

    // As listas sao remontadas por innerHTML a cada render, entao os botoes
    // de cada linha nascem depois deste bind: delegacao no container.
    const bases = document.getElementById('hi-bases');
    bases.addEventListener('pointerdown', evento => {
      const punho = evento.target.closest('.hi-punho');
      if (punho) this.iniciarArraste(evento, punho);
    });
    bases.addEventListener('click', evento => {
      const gatilhoOrdem = evento.target.closest('.hi-ordenar-btn');
      if (gatilhoOrdem) { this.abrirMenuOrdem(gatilhoOrdem.dataset.ordenar); return; }
      const itemOrdem = evento.target.closest('.hi-ordenar-menu button');
      if (itemOrdem) {
        this.escolherOrdem(itemOrdem.closest('.hi-ordenar-menu').dataset.menu, itemOrdem.dataset.ordem);
        return;
      }

      const punho = evento.target.closest('.hi-punho');
      if (punho) {
        // Tambem cobre teclado: Enter e Espaco num <button> viram click, e
        // arrastar por teclado nao existe.
        if (this.ignorarCliqueDoPunho) {
          this.ignorarCliqueDoPunho = false;
          return;
        }
        const item = punho.closest('.hi-item');
        if (item) this.moverBase(item.dataset.nome, punho.dataset.mover);
        return;
      }
      const etiquetas = evento.target.closest('.hi-etiquetas-abrir');
      if (etiquetas) {
        // Sem isto o mesmo clique borbulha ate o handler de "clique fora" no
        // document e fecha o popover que acabou de abrir.
        evento.stopPropagation();
        this.abrirPop(etiquetas.dataset.etiquetas);
        return;
      }

      const liberar = evento.target.closest('.hi-liberar');
      if (!liberar) return;
      const item = liberar.closest('.hi-item');
      if (item) this.abrirLiberacao(item.dataset.nome, liberar.dataset.liberar === 'remover');
    });

    // ── Popover de etiquetas ──────────────────────────────────
    // Ele e remontado por innerHTML a cada painel, entao tudo por delegacao.
    const pop = document.getElementById('hi-pop');
    pop.addEventListener('click', evento => {
      const acao = evento.target.closest('[data-pop]');
      if (!acao) return;
      const tipo = acao.dataset.pop;
      if (tipo === 'fechar') { this.fecharPop(); return; }
      if (tipo === 'voltar') { this.voltarParaLista(); return; }
      if (tipo === 'criar') { this.abrirPainelEtiqueta(null); return; }
      if (tipo === 'editar') { this.abrirPainelEtiqueta(acao.dataset.id); return; }
      if (tipo === 'alternar') { this.alternarEtiqueta(acao.dataset.id); return; }
      if (tipo === 'excluir') { this.excluirEtiqueta(); return; }
    });
    pop.addEventListener('click', evento => {
      const cor = evento.target.closest('.hi-pop-cor');
      if (cor) this.escolherCorPop(cor.dataset.cor);
    });
    pop.addEventListener('submit', evento => {
      if (evento.target.dataset.popForm === 'etiqueta') this.salvarEtiqueta(evento);
    });
    pop.addEventListener('input', evento => {
      if (!evento.target.classList.contains('hi-pop-busca')) return;
      this.pop.busca = evento.target.value;
      const foco = document.activeElement === evento.target;
      this.renderizarPop();
      if (foco) {
        const campo = document.querySelector('.hi-pop-busca');
        campo?.focus();
        // O cursor volta para o fim: sem isto, digitar a segunda letra a
        // colocaria antes da primeira.
        campo?.setSelectionRange(campo.value.length, campo.value.length);
      }
      this.posicionarPop();
    });

    document.addEventListener('click', evento => {
      if (!this.popAberto()) return;
      // ⚠️ Nao troque por evento.target.closest('#hi-pop'). Clicar numa
      // etiqueta REMONTA o popover por innerHTML durante o proprio despacho,
      // entao quando este handler roda o alvo ja esta SOLTO do documento e o
      // closest sobe uma arvore sem o #hi-pop: devolve null, o clique de
      // dentro passa por clique de fora e o popover fecha a cada marcacao.
      // O composedPath e capturado no despacho e sobrevive a remocao.
      const caminho = evento.composedPath();
      const dentro = caminho.some(no =>
        no.id === 'hi-pop' || no.classList?.contains('hi-etiquetas-abrir')
      );
      if (dentro) return;
      this.fecharPop();
    });
    // Fixed nao acompanha a rolagem: sem reancorar, o popover ficaria parado
    // enquanto o instrutor dele sobe na tela.
    window.addEventListener('scroll', () => {
      if (this.popAberto()) this.posicionarPop();
    }, true);
    window.addEventListener('resize', () => {
      if (this.popAberto()) this.posicionarPop();
    });

    document.getElementById('cadastro-etiquetas').addEventListener('click', evento => {
      const chip = evento.target.closest('[data-cadastro-etiqueta]');
      if (chip) this.alternarEtiquetaCadastro(chip.dataset.cadastroEtiqueta);
    });

    document.addEventListener('pointermove', evento => this.moverArraste(evento));
    document.addEventListener('pointerup', evento => this.encerrarArraste(evento));
    document.addEventListener('pointercancel', evento => this.encerrarArraste(evento));

    document.getElementById('form-liberacao').addEventListener(
      'submit',
      evento => this.confirmarLiberacao(evento)
    );
    document.getElementById('liberacao-cancelar').addEventListener(
      'click',
      () => this.fecharLiberacao()
    );
    document.getElementById('liberacao-fechar').addEventListener(
      'click',
      () => this.fecharLiberacao()
    );
    document.getElementById('modal-liberacao').addEventListener('click', evento => {
      if (evento.target.id === 'modal-liberacao') this.fecharLiberacao();
    });
    // Clique fora fecha o menu de ordenacao. O clique no proprio menu ja foi
    // tratado acima e chega aqui pelo borbulhamento, por isso a excecao.
    document.addEventListener('click', evento => {
      if (!evento.target.closest('.hi-ordenar')) this.fecharMenusOrdem();
    });

    document.addEventListener('keydown', evento => {
      if (evento.key !== 'Escape') return;
      if (this.arraste) { this.cancelarArraste(); return; }
      // O popover fecha antes do menu de ordenacao e do modal: e sempre o que
      // esta por cima, e uma tecla nao pode fechar dois.
      if (this.popAberto()) {
        // Do painel de edicao, Escape volta para a lista em vez de descartar
        // tudo: quem digitou um nome nao espera perde-lo por uma tecla.
        if (this.pop.painel === 'editar') this.voltarParaLista();
        else this.fecharPop();
        return;
      }
      if (document.querySelector('.hi-ordenar-menu:not([hidden])')) {
        this.fecharMenusOrdem();
        return;
      }
      if (this.liberacao) this.fecharLiberacao();
    });
  },

  async iniciar() {
    if (!Auth.protegerHorasVoadasInva()) return;
    Auth.preencherUI();
    this.carregarOrdens();
    this.pintarMenusOrdem();
    this.renderizarEtiquetasCadastro();
    this.vincularEventos();
    await this.carregarDados();
  }
};

HorasVoadasInva.iniciar();
