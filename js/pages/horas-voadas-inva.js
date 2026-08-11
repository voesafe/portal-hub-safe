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
  // Popover de comentarios. Estado SEPARADO do de etiquetas de proposito: sao
  // duas maquinas de estado diferentes, e so uma fica aberta por vez.
  // O rascunho e por instrutor para o texto digitado sobreviver a um render,
  // e principalmente para voltar ao campo quando o envio falha: perder o que
  // a pessoa escreveu por causa de uma oscilacao de rede e o pior desfecho.
  popComent: { instrutor: null, salvando: false, rascunhos: {} },
  TEXTO_MAX: 1000,
  // Etiquetas marcadas no formulario de cadastro, antes de o instrutor existir.
  etiquetasNovoInstrutor: [],
  // Paleta fechada, compartilhada pelos instrutores de voo e de solo: a cor
  // e infraestrutura visual (o catalogo de etiquetas de cada um e que e
  // separado). A chave viaja para o backend, o tom vem do CSS. Ampliada de
  // 10 para 20 em 2026-08-11, cores solidas em vez de tom pastel.
  CORES: [
    { chave: 'verde', nome: 'Verde' },
    { chave: 'limao', nome: 'Limão' },
    { chave: 'amarelo', nome: 'Amarelo' },
    { chave: 'mostarda', nome: 'Mostarda' },
    { chave: 'laranja', nome: 'Laranja' },
    { chave: 'coral', nome: 'Coral' },
    { chave: 'vermelho', nome: 'Vermelho' },
    { chave: 'vinho', nome: 'Vinho' },
    { chave: 'rosa', nome: 'Rosa' },
    { chave: 'fucsia', nome: 'Fúcsia' },
    { chave: 'roxo', nome: 'Roxo' },
    { chave: 'indigo', nome: 'Índigo' },
    { chave: 'azul', nome: 'Azul' },
    { chave: 'marinho', nome: 'Marinho' },
    { chave: 'ceu', nome: 'Céu' },
    { chave: 'turquesa', nome: 'Turquesa' },
    { chave: 'oliva', nome: 'Oliva' },
    { chave: 'marrom', nome: 'Marrom' },
    { chave: 'preto', nome: 'Preto' },
    { chave: 'cinza', nome: 'Cinza' }
  ],
  COR_PADRAO: 'cinza',
  NOME_MAX: 60,
  // ⚠️ A ordem de PRIORIDADE e a ordem de verdade da lista, decidida pela
  // coordenacao e guardada na planilha. As outras tres sao VISTAS temporarias
  // para ajudar a decidir (quem esta com menos horas, por exemplo) e por isso
  // nao sao persistidas: uma preferencia de ordenacao esquecida semanas atras
  // faria a lista parecer a fila de acionamento sem ser. Como o Hub recarrega
  // a pagina inteira a cada navegacao, a vista ja volta sozinha ao padrao.
  ordens: { SJK: 'prioridade', CPQ: 'prioridade' },
  ORDEM_PADRAO: 'prioridade',
  CHAVE_ORDENS_LEGADA: 'horas-inva-ordens',
  // O gráfico nasce recolhido: é consulta ocasional e custava ~330px em cima
  // da lista, que é o que a tela existe para mostrar.
  graficoAberto: false,
  CHAVE_GRAFICO: 'horas-inva-grafico',
  diretrizAberta: false,
  CHAVE_DIRETRIZ: 'horas-inva-diretriz',
  ROTULOS_ORDEM: {
    prioridade: 'Prioridade de acionamento',
    alfabetica: 'Ordem alfabética',
    'horas-asc': 'Horas, da menor',
    'horas-desc': 'Horas, da maior'
  },
  // Arrastar termina em pointerup, mas o navegador ainda dispara o click do
  // punho logo depois. Sem esta trava, um arraste bem-sucedido moveria de
  // novo pelo click e o instrutor voltaria para a base de origem.
  ignorarCliqueDoPunho: false,

  // ── Instrutores de solo (2026-08-11) ─────────────────────────
  // Mundo separado, com estado PRÓPRIO (nunca misturado com o de voo
  // acima): sem hora voada, sem CAVOK, sem OPR, sem flag de 100h. Ver o
  // bloco grande "INSTRUTORES DE SOLO" mais abaixo no arquivo.
  solo: {
    instrutores: [],
    // Catalogo PROPRIO (decisão do Victor): a cor (this.CORES, acima) é
    // infraestrutura visual compartilhada, mas a etiqueta em si não —
    // misturar com CLT/Eventual/LIBERADO IFR AVIÃO ofereceria, num
    // seletor, etiqueta que não serve para o outro mundo.
    etiquetas: [],
    // Some a aba enquanto o backend publicado não manda `dataSolo`: aba
    // que abre e não salva nada é peor do que aba que não aparece.
    suportado: false,
    filtro: '',
    ordens: { SJK: 'prioridade', CPQ: 'prioridade' },
    pop: { instrutor: null, painel: 'lista', editando: null, cor: 'verde', busca: '' },
    popComent: { instrutor: null, salvando: false, rascunhos: {} },
    arraste: null,
    ignorarCliqueDoPunho: false
  },

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

  /**
   * Mesma mecânica de mudarView, uma camada abaixo: troca entre "Instrutores
   * de Voo" e "Instrutores de Solo" DENTRO do card "Instrutores por base",
   * sem tocar em qual aba de nível superior (Dashboard/Cadastrar) está ativa.
   */
  mudarSubView(id) {
    document.querySelectorAll('.hi-subtab').forEach(tab => {
      const ativo = tab.dataset.subview === id;
      tab.classList.toggle('active', ativo);
      tab.setAttribute('aria-selected', String(ativo));
    });
    document.querySelectorAll('.hi-subview').forEach(view => {
      view.classList.toggle('active', view.id === `hi-subview-${id}`);
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
    this.posicionarPopover(document.getElementById('hi-pop'), this.gatilhoDoPop());
  },

  /**
   * Ancoragem compartilhada pelos dois popovers da tela. Recebe o elemento e o
   * gatilho porque o de comentarios nasceu depois: duplicar esta conta seria
   * duplicar as tres armadilhas dela (medir escondido, teto de altura, grude
   * na borda), e a segunda copia envelheceria sozinha.
   */
  /**
   * O scroll do corpo do popover NAO deve reancorar o popover.
   *
   * ⚠️ Os listeners de scroll usam capture:true, entao recebem tambem o
   * scroll dos descendentes. Reancorar ali zera a rolagem (o
   * posicionarPopover limpa o max-height para medir, e sem o teto o corpo
   * deixa de transbordar), e o conteudo fica preso no topo: nem a roda do
   * mouse nem a barra de rolagem funcionam.
   */
  scrollVeioDeDentro(alvo, id) {
    const pop = document.getElementById(id);
    return !!(pop && alvo && alvo.nodeType === 1 && pop.contains(alvo));
  },

  posicionarPopover(pop, gatilho) {
    if (!pop || !gatilho) return;

    // Guarda a rolagem antes de mexer no teto de altura e devolve no fim.
    // Sem isso, rolar a PAGINA com o popover aberto joga o conteudo dele de
    // volta para o topo, que e a mesma perda pela porta dos fundos.
    const corpo = pop.querySelector('.hi-pop-body');
    const rolagem = corpo ? corpo.scrollTop : 0;

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

    if (corpo && rolagem) corpo.scrollTop = rolagem;
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
    // Escopado a #hi-pop: desde que os instrutores de solo ganharam popover
    // próprio (com o mesmo [data-pop-previa]/.hi-pop-cor, escondido mas no
    // mesmo documento), uma busca sem escopo aqui pintaria os dois.
    const pop = document.getElementById('hi-pop');
    const previa = pop.querySelector('[data-pop-previa]');
    if (previa) {
      previa.className = `hi-chip cor-${this.pop.cor}`;
    }
    pop.querySelectorAll('.hi-pop-cor').forEach(botao => {
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

  // ── Comentários por instrutor ───────────────────────────────

  comentariosDe(instrutor) {
    return Array.isArray(instrutor?.comentarios) ? instrutor.comentarios : [];
  },

  /**
   * ⚠️ O balao so existe quando o backend publicado sabe de comentarios.
   *
   * O frontend sobe pelo GitHub Pages e o Apps Script sobe por clasp, em
   * momentos diferentes. Sem esta checagem, entre um deploy e o outro a tela
   * ofereceria um botao que abre um popover onde escrever nao funciona, que e
   * pior que nao ter o recurso. O backend novo devolve `comentarios` sempre,
   * nem que seja lista vazia; o antigo nao devolve o campo. Assim o recurso
   * aparece sozinho na primeira carga depois do deploy do backend.
   */
  suportaComentarios() {
    return this.instrutores.some(i => Array.isArray(i.comentarios));
  },

  autorAtual() {
    return Auth.getNome() || Auth.getEmail() || '';
  },

  /**
   * "30/07/2026 08:12" vira "hoje, 08:12" e "ontem, 08:12". Numa lista curta e
   * recente, a data por extenso ocupa a linha inteira para dizer menos: o que
   * a operacao pergunta e se o recado e de hoje.
   */
  quandoDoComentario(data) {
    const texto = String(data || '').trim();
    const casa = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?$/);
    if (!casa) return texto;
    const [, dia, mes, ano, hora] = casa;
    const quando = new Date(Number(ano), Number(mes) - 1, Number(dia));
    const hoje = new Date();
    const soData = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dias = Math.round((soData(hoje) - soData(quando)) / 86400000);
    if (dias === 0) return hora ? `hoje, ${hora}` : 'hoje';
    if (dias === 1) return hora ? `ontem, ${hora}` : 'ontem';
    return hora ? `${dia}/${mes} · ${hora}` : `${dia}/${mes}/${ano}`;
  },

  iniciaisDoAutor(autor) {
    const partes = String(autor || '').replace(/\(.*\)/g, '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    const primeira = partes[0][0] || '';
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + ultima).toUpperCase();
  },

  popComentAberto() {
    return !!this.popComent.instrutor;
  },

  /** O gatilho renasce a cada render: sempre reachar pelo nome do instrutor. */
  gatilhoDoPopComent() {
    if (!this.popComent.instrutor) return null;
    return document.querySelector(
      `.hi-coment[data-coment="${CSS.escape(this.popComent.instrutor)}"]`
    );
  },

  posicionarPopComent() {
    this.posicionarPopover(
      document.getElementById('hi-pop-coment'),
      this.gatilhoDoPopComent()
    );
  },

  abrirPopComent(nome) {
    if (this.popComent.instrutor === nome) { this.fecharPopComent(); return; }
    // Os dois popovers usam o mesmo canto da tela: deixar os dois abertos
    // faria um cobrir o outro.
    this.fecharPop();
    this.popComent.instrutor = nome;
    this.popComent.salvando = false;
    this.renderizarPopComent();
    this.posicionarPopComent();
    document.getElementById('hi-pop-coment').hidden = false;
    this.marcarGatilhoComentAtivo();
    document.getElementById('hi-coment-campo')?.focus();
  },

  fecharPopComent() {
    if (!this.popComent.instrutor) return;
    this.guardarRascunho();
    this.popComent.instrutor = null;
    this.popComent.salvando = false;
    document.getElementById('hi-pop-coment').hidden = true;
    this.marcarGatilhoComentAtivo();
  },

  /** O que estiver digitado sobrevive a fechar e reabrir. */
  guardarRascunho() {
    const nome = this.popComent.instrutor;
    if (!nome) return;
    const campo = document.getElementById('hi-coment-campo');
    if (!campo) return;
    const texto = campo.value;
    if (texto.trim()) this.popComent.rascunhos[nome] = texto;
    else delete this.popComent.rascunhos[nome];
  },

  marcarGatilhoComentAtivo() {
    document.querySelectorAll('.hi-coment').forEach(botao => {
      const ativo = botao.dataset.coment === this.popComent.instrutor;
      botao.classList.toggle('is-aberto', ativo);
      botao.setAttribute('aria-expanded', String(ativo));
    });
  },

  comentarioHtml(comentario, podeExcluir) {
    const pendente = comentario.pendente === true;
    return `
      <li class="hi-co-item${pendente ? ' is-pendente' : ''}">
        <span class="hi-co-avatar" aria-hidden="true">${this.escape(this.iniciaisDoAutor(comentario.autor))}</span>
        <div class="hi-co-corpo">
          <p class="hi-co-meta">
            <b>${this.escape(comentario.autor || 'Sem autor')}</b>
            <span>${this.escape(pendente ? 'enviando...' : this.quandoDoComentario(comentario.data))}</span>
          </p>
          <p class="hi-co-texto">${this.escape(comentario.texto)}</p>
        </div>
        ${podeExcluir && !pendente && comentario.id ? `
          <button class="hi-co-excluir" type="button" data-coment-acao="excluir"
            data-id="${this.escape(comentario.id)}"
            title="Apagar este comentário" aria-label="Apagar este comentário">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M3 4h10M6.5 4V2.8h3V4M5 4l.6 9h4.8L11 4" fill="none"
                stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>` : ''}
      </li>
    `;
  },

  renderizarPopComent() {
    const pop = document.getElementById('hi-pop-coment');
    const nome = this.popComent.instrutor;
    const instrutor = this.instrutores.find(i => i.nome === nome);
    const comentarios = this.comentariosDe(instrutor);
    const autor = this.autorAtual();
    const rascunho = this.popComent.rascunhos[nome] || '';

    const lista = comentarios.length
      ? comentarios.map(comentario => this.comentarioHtml(
          comentario,
          // ⚠️ Isto e afordancia, nao permissao: quem manda e o guarda do
          // backend. Aqui so evita oferecer um botao que vai ser recusado.
          !!autor && String(comentario.autor || '').trim().toUpperCase() === autor.trim().toUpperCase()
        )).join('')
      : `<li class="hi-pop-vazio">Nenhum comentário ainda. O primeiro fica aqui.</li>`;

    pop.innerHTML = `
      <div class="hi-pop-head">
        <span class="hi-pop-titulo">Comentários</span>
        <button class="hi-pop-icone" type="button" data-coment-acao="fechar" aria-label="Fechar">&times;</button>
      </div>
      <div class="hi-pop-body">
        <p class="hi-pop-alvo">${this.escape(nome || '')}</p>
        <ul class="hi-co-lista">${lista}</ul>
        <form class="hi-co-form" data-coment-form>
          <textarea class="form-control hi-co-campo" id="hi-coment-campo" rows="2"
            maxlength="${this.TEXTO_MAX}"
            placeholder="Escrever um comentário sobre ${this.escape(nome || '')}"
            aria-label="Escrever um comentário">${this.escape(rascunho)}</textarea>
          <div class="hi-co-acoes">
            <button class="btn btn-primary" type="submit" data-coment-acao="enviar"
              ${this.popComent.salvando ? 'disabled' : ''}>
              ${this.popComent.salvando ? 'Salvando...' : 'Comentar'}
            </button>
          </div>
        </form>
      </div>
    `;
  },

  /**
   * Otimista com rollback, e nao o round-trip unico que a casa usa para criar.
   *
   * A regra existe porque fingir uma linha cujo id nasce no servidor deixa a
   * tela com um registro que nenhuma acao seguinte alcanca. Aqui o risco e
   * removido em vez de aceito: o comentario pendente e marcado, o botao de
   * apagar nao aparece nele, e a resposta do servidor SUBSTITUI a lista
   * inteira em vez de completar a que foi fingida. O que se ganha e nao
   * encarar um botao desabilitado por ~10s depois de escrever uma frase, que
   * e a escrita mais frequente desta tela.
   */
  async enviarComentario(evento) {
    evento?.preventDefault();
    const nome = this.popComent.instrutor;
    const instrutor = this.instrutores.find(i => i.nome === nome);
    const campo = document.getElementById('hi-coment-campo');
    if (!instrutor || !campo || this.popComent.salvando) return;

    const texto = String(campo.value || '').trim();
    if (!texto) {
      toast('Escreva o comentário antes de salvar.', 'warning');
      campo.focus();
      return;
    }

    const anteriores = this.comentariosDe(instrutor);
    instrutor.comentarios = [
      ...anteriores,
      { id: '', autor: this.autorAtual(), data: '', texto, pendente: true }
    ];
    delete this.popComent.rascunhos[nome];
    this.popComent.salvando = true;
    this.renderizarTudo();
    this.renderizarPopComent();
    this.posicionarPopComent();

    try {
      const resultado = await this.enviar('add_comment', {
        nome: instrutor.nome,
        texto,
        autor: this.autorAtual()
      });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar o comentário.');
      }
      instrutor.comentarios = Array.isArray(resultado.data?.comentarios)
        ? resultado.data.comentarios
        : anteriores;
    } catch (erro) {
      console.error('[Comentário do instrutor]', erro);
      instrutor.comentarios = anteriores;
      // Devolve o texto ao campo: o comentario nao foi gravado, e digitar de
      // novo e o tipo de perda que faz a pessoa deixar de usar o recurso.
      this.popComent.rascunhos[nome] = texto;
      toast(erro.message || 'Erro ao salvar o comentário.', 'error', 5000);
    } finally {
      this.popComent.salvando = false;
      this.renderizarTudo();
      if (this.popComentAberto()) {
        this.renderizarPopComent();
        this.posicionarPopComent();
        document.getElementById('hi-coment-campo')?.focus();
      }
    }
  },

  /** Round-trip unico: quem decide se pode apagar e o servidor. */
  async excluirComentario(id) {
    const nome = this.popComent.instrutor;
    const instrutor = this.instrutores.find(i => i.nome === nome);
    if (!instrutor || !id) return;
    if (!confirm('Apagar este comentário?')) return;

    this.guardarRascunho();
    const botao = document.querySelector(`[data-coment-acao="excluir"][data-id="${CSS.escape(id)}"]`);
    if (botao) botao.disabled = true;
    try {
      const resultado = await this.enviar('delete_comment', { id, autor: this.autorAtual() });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível apagar o comentário.');
      }
      instrutor.comentarios = Array.isArray(resultado.data?.comentarios)
        ? resultado.data.comentarios
        : this.comentariosDe(instrutor).filter(c => c.id !== id);
      this.renderizarTudo();
      if (this.popComentAberto()) { this.renderizarPopComent(); this.posicionarPopComent(); }
    } catch (erro) {
      console.error('[Excluir comentário]', erro);
      toast(erro.message || 'Erro ao apagar o comentário.', 'error', 5000);
      const atual = document.querySelector(`[data-coment-acao="excluir"][data-id="${CSS.escape(id)}"]`);
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

  /**
   * A escolha de ordenacao nao e mais persistida (ver o comentario em
   * `ordens`). Isto so limpa a chave que ficou nos navegadores de quem usou a
   * versao anterior, para nao deixar lixo no localStorage.
   */
  carregarOrdens() {
    try { localStorage.removeItem(this.CHAVE_ORDENS_LEGADA); } catch (ignore) {}
  },

  emPrioridade(base) {
    return this.ordens[base] === 'prioridade';
  },

  compararNome(a, b) {
    // localeCompare com pt-BR para acento nao jogar o nome para o fim,
    // mesma escolha da ordenacao do menu da sidebar.
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  },

  /**
   * Posicao do instrutor na fila da base.
   *
   * ⚠️ Zero significa "sem posicao definida" e vale INFINITO aqui, ou seja,
   * vai para o FIM. Tratar zero como zero jogaria todo instrutor ainda nao
   * posicionado para a primeira chamada, que e o oposto do que a ausencia de
   * decisao significa. Quando NINGUEM tem posicao (base nunca ordenada),
   * todos empatam em infinito e o desempate por nome devolve exatamente a
   * ordem alfabetica de antes: nao ha migracao a fazer.
   */
  ordemDe(instrutor) {
    const valor = Number(instrutor?.ordem) || 0;
    return valor > 0 ? valor : Number.POSITIVE_INFINITY;
  },

  ordenarInstrutores(lista, ordem) {
    const copia = [...lista];
    // Empate desempata por nome em todas as ordens, senao a lista muda de
    // posicao sozinha entre um render e outro.
    if (ordem === 'horas-asc') {
      return copia.sort((a, b) => this.horasDe(a) - this.horasDe(b) || this.compararNome(a, b));
    }
    if (ordem === 'horas-desc') {
      return copia.sort((a, b) => this.horasDe(b) - this.horasDe(a) || this.compararNome(a, b));
    }
    if (ordem === 'alfabetica') {
      return copia.sort((a, b) => this.compararNome(a, b));
    }
    return copia.sort((a, b) => this.ordemDe(a) - this.ordemDe(b) || this.compararNome(a, b));
  },

  /** A base inteira na ordem de prioridade, SEM o filtro da busca. */
  nomesDaBase(base) {
    return this.ordenarInstrutores(
      this.instrutores.filter(i => this.baseDoInstrutor(i) === base),
      'prioridade'
    ).map(i => i.nome);
  },

  /**
   * Grava a nova fila de UMA base. Otimista com rollback: e reposicionamento
   * de itens que ja estao no estado local e o servidor nao recalcula nada.
   * Com ~10s de latencia, esperar deixaria o instrutor parado no lugar antigo
   * depois do arraste, que e a coisa que o arraste promete desfazer.
   */
  async aplicarOrdem(base, nomes) {
    if (!this.bases.includes(base) || !nomes.length) return;

    // O instantaneo cobre base E ordem porque um arraste entre bases muda as
    // duas, e o rollback tem que devolver o instrutor para a base de origem
    // na posicao que ele tinha la.
    const antes = this.instrutores.map(i => ({ i, base: i.base, ordem: i.ordem }));
    nomes.forEach((nome, indice) => {
      const instrutor = this.instrutores.find(i => i.nome === nome);
      if (!instrutor) return;
      instrutor.base = base;
      instrutor.ordem = indice + 1;
    });
    this.renderizarTudo();

    try {
      const resultado = await this.enviar('set_instructor_order', { base, nomes });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar a ordem.');
      }
    } catch (erro) {
      console.error('[Ordem de prioridade]', erro);
      antes.forEach(({ i, base: b, ordem }) => { i.base = b; i.ordem = ordem; });
      this.renderizarTudo();
      toast(erro.message || 'Erro ao salvar a ordem de prioridade.', 'error', 5000);
    }
  },

  /**
   * Move o instrutor para a posicao imediatamente antes de `nomeAlvo` na base
   * de destino, ou para o fim quando `nomeAlvo` e nulo.
   *
   * ⚠️ Trabalha sobre a lista COMPLETA da base, nunca sobre o que esta
   * visivel. Com a busca ativa, montar a fila a partir dos itens na tela
   * apagaria a posicao de todo mundo que o filtro escondeu.
   */
  reposicionar(nome, base, nomeAlvo) {
    const fila = this.nomesDaBase(base).filter(n => n !== nome);
    const destino = nomeAlvo && nomeAlvo !== nome ? fila.indexOf(nomeAlvo) : -1;
    if (destino >= 0) fila.splice(destino, 0, nome);
    else fila.push(nome);
    return this.aplicarOrdem(base, fila);
  },

  /** Um degrau para cima ou para baixo, para quem usa teclado. */
  moverNaFila(nome, passo) {
    const instrutor = this.instrutores.find(i => i.nome === nome);
    if (!instrutor) return;
    const base = this.baseDoInstrutor(instrutor);
    if (!this.emPrioridade(base)) return;

    const fila = this.nomesDaBase(base);
    const atual = fila.indexOf(nome);
    const novo = atual + passo;
    if (atual < 0 || novo < 0 || novo >= fila.length) return;
    fila.splice(atual, 1);
    fila.splice(novo, 0, nome);
    this.aplicarOrdem(base, fila);
    // O innerHTML da lista destroi o botao que estava com o foco: sem
    // devolve-lo, a segunda seta teria que ser precedida de um tab.
    // Escopado a #hi-bases: sem isso, um instrutor de solo com o mesmo
    // nome de um instrutor de voo poderia levar o foco embora.
    requestAnimationFrame(() => {
      document.querySelector(
        `#hi-bases .hi-item[data-nome="${CSS.escape(nome)}"] .hi-punho`
      )?.focus();
    });
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

  /**
   * O balao ao lado do "+". Nasce discreto e vazado; com recado, vira pilula
   * cheia com o numero, para a linha dizer de longe que existe algo escrito
   * sobre a pessoa sem precisar abrir nada.
   */
  botaoComentarios(instrutor, nomeEscapado) {
    if (!this.suportaComentarios()) return '';
    const quantos = this.comentariosDe(instrutor).length;
    const rotulo = quantos === 0
      ? `Sem comentário sobre ${instrutor.nome}`
      : `${quantos} ${quantos === 1 ? 'comentário' : 'comentários'} sobre ${instrutor.nome}`;
    return `
      <button class="hi-coment${quantos ? ' tem' : ''}" type="button" data-coment="${nomeEscapado}"
        aria-haspopup="dialog" aria-expanded="false"
        title="${this.escape(rotulo)}" aria-label="${this.escape(rotulo)}">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-2.9-.4L3 21l1.6-4.6A8.3 8.3 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"
            fill="none" stroke="currentColor" stroke-width="2.1"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${quantos ? `<span class="hi-coment-n">${quantos}</span>` : ''}
      </button>
    `;
  },

  /**
   * O check da liberação por OPR.
   *
   * ⚠️ Sem texto visível, TODO o significado passa a viver no title e no
   * aria-label: eles precisam dizer o estado atual, quem liberou e quando, e
   * o que o clique faz. Um ✓ mudo seria um botão que ninguém sabe apertar, e
   * pior, um botão que ninguém sabe que já está apertado.
   *
   * `aria-pressed` porque é alternador de estado, não uma ação de mão única.
   *
   * ⚠️ Quem bateu a meta de horas fica com o check verde e TRAVADO. A flag
   * verde da linha já vem das duas origens (meta ou liberação da operação),
   * então deixar o check apagado ao lado dela dizia duas coisas diferentes
   * sobre o mesmo instrutor. Travado porque não há o que a operação decidir:
   * pela meta ele já está liberado, e conceder ou remover a marca de OPR não
   * mudaria nada na tela. Quem já tinha liberação da operação e depois bateu
   * a meta mantém a marca registrada (o selo continua na linha), e ela volta
   * a ser editável se as horas caírem abaixo da meta numa reconciliação.
   */
  botaoLiberar(instrutor, nomeEscapado, liberado) {
    const horas = this.horasDe(instrutor);
    const quando = instrutor.liberadoEm ? ` em ${instrutor.liberadoEm}` : '';
    const quem = instrutor.liberadoPor ? ` por ${instrutor.liberadoPor}` : '';
    const porHoras = horas >= this.metaHoras;
    const verde = porHoras || liberado;

    let rotulo;
    if (porHoras) {
      // Sem flexao de genero: o rotulo e montado para qualquer instrutor, e
      // "liberado" sairia errado em metade da lista.
      rotulo = `${instrutor.nome} tem ${this.formatarHoras(horas)}h voadas e já cumpre a meta `
        + `de ${this.metaHoras}h. Não depende da liberação da operação.`
        + (liberado ? ` A liberação da operação${quando}${quem} segue registrada.` : '');
    } else if (liberado) {
      rotulo = `Liberado pela operação${quando}${quem}. Clique para remover a liberação de ${instrutor.nome}.`;
    } else {
      rotulo = `Liberar ${instrutor.nome} pela operação, mesmo sem as ${this.metaHoras}h. `
        + 'Pede a senha da operação.';
    }

    return `
      <button class="hi-liberar${verde ? ' is-liberado' : ''}" type="button"
        ${porHoras ? 'disabled' : `data-liberar="${liberado ? 'remover' : 'conceder'}"`}
        aria-pressed="${verde}"
        title="${this.escape(rotulo)}" aria-label="${this.escape(rotulo)}">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;
  },

  linhaInstrutor(instrutor, base, posicao) {
    const outra = this.bases.find(b => b !== base) || base;
    const horas = this.horasDe(instrutor);
    const liberado = instrutor.liberadoOpr === true;
    const flag = this.temFlagVerde(instrutor);
    const nome = this.escape(instrutor.nome);
    const motivo = this.escape(this.motivoDaFlag(instrutor));
    const prioridade = this.emPrioridade(base);
    // ⚠️ O numero e a posicao na fila COMPLETA, nao a posicao na tela. Com a
    // busca ativa, ver 1, 2 e 7 e o que diz a verdade: os outros existem e
    // estao escondidos. Numerar o que esta visivel faria o quinto da fila
    // parecer o segundo.
    const rotuloPunho = prioridade
      ? `${nome} está em ${posicao}º na prioridade de ${base}. Arraste para mudar a posição, `
        + `use as setas para cima e para baixo, ou clique para mover para a base ${outra}`
      : `Arraste para a outra base, ou clique para mover ${nome} para a base ${outra}`;

    return `
      <li class="hi-item${flag ? ' is-liberado' : ''}" data-nome="${nome}">
        <button class="hi-punho" type="button" data-mover="${outra}"
          title="${this.escape(rotuloPunho)}" aria-label="${this.escape(rotuloPunho)}">
          <span class="hi-punho-icone" aria-hidden="true"></span>
        </button>
        ${prioridade
          ? `<span class="hi-posicao" aria-hidden="true">${posicao}</span>`
          : ''}
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
            ${this.botaoComentarios(instrutor, nome)}
            ${liberado ? `<span class="hi-selo-opr">OPR${instrutor.liberadoEm ? ` · ${this.escape(instrutor.liberadoEm)}` : ''}</span>` : ''}
          </span>
        </div>
        <span class="horas-inva-hours">${this.formatarHoras(horas)}h</span>
        ${this.botaoLiberar(instrutor, nome, liberado)}
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
      // E casa o TEXTO dos comentarios pelo mesmo motivo: guardar recado sem
      // conseguir achar recado nao resolve nada seis meses depois.
      const visiveis = daBase.filter(i => {
        if (!termo) return true;
        if (String(i.nome || '').toLocaleLowerCase('pt-BR').includes(termo)) return true;
        const naEtiqueta = this.etiquetasDo(i).some(id =>
          String(this.etiquetaPorId(id)?.nome || '')
            .toLocaleLowerCase('pt-BR').includes(termo)
        );
        if (naEtiqueta) return true;
        return this.comentariosDe(i).some(c =>
          String(c.texto || '').toLocaleLowerCase('pt-BR').includes(termo)
        );
      });
      const horasBase = daBase.reduce((soma, i) => soma + this.horasDe(i), 0);

      const contador = document.getElementById(`hi-contador-${base}`);
      const total = document.getElementById(`hi-total-${base}`);
      if (contador) {
        contador.textContent = `${daBase.length} ${daBase.length === 1 ? 'instrutor' : 'instrutores'}`;
      }
      if (total) total.textContent = `${this.formatarHoras(horasBase)}h`;

      const aviso = document.getElementById(`hi-vista-${base}`);
      if (aviso) {
        // ⚠️ Sem este aviso, uma vista ordenada por horas seria lida como a
        // fila de acionamento, que e exatamente o que o texto no topo da
        // tela afirma. A vista some no recarregamento, mas enquanto ela
        // estiver ativa a tela tem que dizer que aquilo nao e a prioridade.
        aviso.hidden = this.emPrioridade(base);
        aviso.textContent = this.emPrioridade(base)
          ? ''
          : `Vendo por ${this.ROTULOS_ORDEM[this.ordens[base]].toLowerCase()}. Esta não é a ordem de prioridade.`;
      }

      if (!visiveis.length) {
        const texto = termo && daBase.length
          ? 'Nenhum instrutor com esse nome nesta base.'
          : 'Nenhum instrutor aqui. Arraste um pelo punho.';
        lista.innerHTML = `<li class="hi-vazio">${texto}</li>`;
        return;
      }

      // A posicao vem da fila completa da base, para o numero nao mentir
      // quando a busca esconde parte dela.
      const posicoes = new Map(this.nomesDaBase(base).map((nome, i) => [nome, i + 1]));
      lista.innerHTML = visiveis
        .map(i => this.linhaInstrutor(i, base, posicoes.get(i.nome) || 0))
        .join('');
    });
  },

  // ── Gráfico recolhível ──────────────────────────────────────

  carregarEstadoGrafico() {
    try {
      this.graficoAberto = localStorage.getItem(this.CHAVE_GRAFICO) === 'aberto';
    } catch (ignore) {
      this.graficoAberto = false;
    }
  },

  /** Só visibilidade e rótulo. Quem desenha é o renderizarGrafico. */
  aplicarEstadoGrafico() {
    const corpo = document.getElementById('hi-chart-corpo');
    const botao = document.getElementById('hi-chart-toggle');
    if (!corpo || !botao) return;
    corpo.hidden = !this.graficoAberto;
    botao.setAttribute('aria-expanded', String(this.graficoAberto));
    botao.title = this.graficoAberto
      ? 'Recolher o gráfico'
      : 'Ver o gráfico de horas por instrutor';
  },

  // ── Diretriz recolhível ─────────────────────────────────────
  //
  // Mesmo molde do gráfico, com uma diferença: aqui não há nada a
  // construir ao abrir. O conteúdo é HTML estático, então basta mostrar,
  // sem o cuidado do canvas medido em container escondido.

  carregarEstadoDiretriz() {
    try {
      this.diretrizAberta = localStorage.getItem(this.CHAVE_DIRETRIZ) === 'aberto';
    } catch (ignore) {
      this.diretrizAberta = false;
    }
  },

  aplicarEstadoDiretriz() {
    const corpo = document.getElementById('hi-diretriz-corpo');
    const botao = document.getElementById('hi-diretriz-toggle');
    if (!corpo || !botao) return;
    corpo.hidden = !this.diretrizAberta;
    botao.setAttribute('aria-expanded', String(this.diretrizAberta));
    botao.title = this.diretrizAberta
      ? 'Recolher a diretriz'
      : 'Ver a diretriz de missões dos instrutores eventuais';
  },

  alternarDiretriz() {
    this.diretrizAberta = !this.diretrizAberta;
    try {
      localStorage.setItem(this.CHAVE_DIRETRIZ, this.diretrizAberta ? 'aberto' : 'fechado');
    } catch (ignore) {}
    this.aplicarEstadoDiretriz();
  },

  alternarGrafico() {
    this.graficoAberto = !this.graficoAberto;
    // Recolher e abrir é preferência de quem usa, e nada aqui pode ser lido
    // errado por estar fechado: diferente das ordenações, que não são
    // persistidas justamente porque uma vista salva mentiria sobre a fila.
    try {
      localStorage.setItem(this.CHAVE_GRAFICO, this.graficoAberto ? 'aberto' : 'fechado');
    } catch (ignore) {}
    this.aplicarEstadoGrafico();
    if (this.graficoAberto) {
      this.renderizarGrafico();
    } else {
      // Destruir ao recolher evita um Chart.js vivo preso a um canvas de
      // tamanho zero, que é o estado do qual ele não se recupera sozinho.
      this.grafico?.destroy();
      this.grafico = null;
    }
  },

  renderizarGrafico() {
    // ⚠️ O Chart.js mede o canvas no momento da criação. Dentro de um
    // container escondido ele nasce 0x0 e CONTINUA quebrado depois de abrir,
    // porque nada o manda medir de novo. Por isso o gráfico só é criado com o
    // card aberto, e é recriado a cada abertura.
    if (!this.graficoAberto) return;
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
    if (this.popComentAberto()) {
      this.marcarGatilhoComentAtivo();
      this.posicionarPopComent();
    }
  },

  // ── Arrastar: posição na fila e troca de base ───────────────

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
      // Nome do instrutor ANTES do qual o arrastado vai entrar. Nulo = fim da
      // fila. Guardar o nome, e nao o indice, e o que faz o alvo sobreviver a
      // um render no meio do arraste.
      antesDe: null,
      marca: null,
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

    if (base !== a.alvo) {
      a.alvo = base;
      document.querySelectorAll('[data-drop-base]').forEach(el => {
        el.classList.toggle('is-drop', el.dataset.dropBase === base);
      });
    }

    this.marcarPosicaoDeSoltura(evento, zona, base);
  },

  /**
   * Desenha onde o instrutor vai cair na fila. Sem isto o arraste dentro da
   * mesma base seria as cegas: a lista so mudaria depois de soltar, e a
   * pessoa teria que tentar de novo para acertar a posicao.
   *
   * Numa vista que nao e a de prioridade, a marca nao aparece e a posicao nao
   * e calculada: reordenar uma lista ordenada por horas gravaria uma fila que
   * nao e a que esta na tela.
   */
  marcarPosicaoDeSoltura(evento, zona, base) {
    const a = this.arraste;
    const lista = base && this.emPrioridade(base) ? zona.querySelector('.hi-lista') : null;
    if (!lista) {
      a.antesDe = null;
      a.marca?.remove();
      a.marca = null;
      return;
    }

    const itens = [...lista.querySelectorAll('.hi-item')].filter(el => el !== a.item);
    let alvo = null;
    for (const el of itens) {
      const caixa = el.getBoundingClientRect();
      // A metade da altura e a fronteira: acima dela entra antes, abaixo
      // continua procurando. E o que faz o indicador acompanhar o ponteiro
      // sem oscilar entre duas posicoes na borda.
      if (evento.clientY < caixa.top + caixa.height / 2) { alvo = el; break; }
    }

    a.antesDe = alvo?.dataset.nome || null;
    if (!a.marca) {
      a.marca = document.createElement('li');
      a.marca.className = 'hi-drop-marca';
      a.marca.setAttribute('aria-hidden', 'true');
    }
    if (alvo) lista.insertBefore(a.marca, alvo);
    else lista.appendChild(a.marca);
  },

  encerrarArraste(evento) {
    const a = this.arraste;
    if (!a || (evento && evento.pointerId !== a.pointerId)) return;
    this.arraste = null;

    try { a.punho.releasePointerCapture(a.pointerId); } catch (ignore) {}
    a.ghost?.remove();
    a.marca?.remove();
    a.item.classList.remove('is-arrastando');
    document.body.classList.remove('hi-arrastando');
    document.querySelectorAll('[data-drop-base]')
      .forEach(el => el.classList.remove('is-drop'));

    if (!a.ativo) return; // clique simples: quem resolve e o handler de click
    this.ignorarCliqueDoPunho = true;
    if (!a.alvo) return;

    const instrutor = this.instrutores.find(i => i.nome === a.nome);
    const origem = instrutor ? this.baseDoInstrutor(instrutor) : null;

    // Fora da vista de prioridade nao ha posicao a gravar, entao um arraste
    // so vale se atravessar as bases.
    if (!this.emPrioridade(a.alvo)) {
      if (a.alvo !== origem) this.moverBase(a.nome, a.alvo);
      return;
    }

    // Soltar exatamente onde ja estava nao e uma mudanca: sem esta checagem,
    // todo arraste desistido gravaria a fila inteira de novo.
    const fila = this.nomesDaBase(a.alvo);
    const atual = fila.indexOf(a.nome);
    const seguinte = atual >= 0 ? (fila[atual + 1] || null) : null;
    if (a.alvo === origem && (a.antesDe === seguinte || a.antesDe === a.nome)) return;

    this.reposicionar(a.nome, a.alvo, a.antesDe);
  },

  cancelarArraste() {
    const a = this.arraste;
    if (!a) return;
    a.alvo = null;
    a.antesDe = null;
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
    const ordemAnterior = instrutor.ordem;
    instrutor.base = base;
    // O backend poe quem chega no FIM da fila da base de destino. Espelhar
    // isso aqui evita o instrutor aparecer no meio por um instante e pular
    // para o fim quando a resposta chegar.
    instrutor.ordem = this.instrutores
      .filter(i => this.baseDoInstrutor(i) === base && i !== instrutor)
      .reduce((maior, i) => Math.max(maior, Number(i.ordem) || 0), 0) + 1;
    this.renderizarTudo();

    try {
      const resultado = await this.enviar('set_instructor_base', { nome, base });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível mudar a base.');
      }
      if (Number(resultado.data?.ordem) > 0) {
        instrutor.ordem = Number(resultado.data.ordem);
        this.renderizarBases();
      }
      toast(`${nome} agora está na base ${base}.`, 'success');
    } catch (erro) {
      console.error('[Base do instrutor]', erro);
      instrutor.base = anterior;
      instrutor.ordem = ordemAnterior;
      this.renderizarTudo();
      toast(erro.message || 'Erro ao mudar a base do instrutor.', 'error', 5000);
    }
  },

  // ── Liberação por OPR ───────────────────────────────────────

  abrirLiberacao(nome, remover) {
    const instrutor = this.instrutores.find(i => i.nome === nome);
    if (!instrutor) return;
    // Mesma regra do botao travado: quem bateu a meta ja esta liberado, entao
    // nao ha senha a pedir. O guarda vive aqui tambem porque o modal e o unico
    // caminho de escrita, e esconder o botao nao impede uma chamada direta.
    if (this.horasDe(instrutor) >= this.metaHoras) return;

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

      // Instrutores de solo viajam na MESMA resposta (ver o backend). A aba
      // so aparece quando `dataSolo` existe: backend antigo nao manda o
      // campo, e uma aba visivel sem o back correspondente e pior que aba
      // escondida.
      this.solo.suportado = Array.isArray(resultado.dataSolo);
      this.solo.instrutores = this.solo.suportado ? resultado.dataSolo : [];
      this.solo.etiquetas = Array.isArray(resultado.meta?.etiquetasSolo)
        ? resultado.meta.etiquetasSolo
        : [];
      this.aplicarSuporteSolo();
      this.renderizarTudoSolo();
      if (this.popAbertoSolo()) this.renderizarPopSolo();

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
        const listaSolo = document.getElementById(`hi-lista-${base}-solo`);
        if (listaSolo) {
          listaSolo.innerHTML = '<li class="hi-vazio">Não foi possível carregar os dados.</li>';
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
    document.querySelectorAll('.hi-subtab').forEach(tab => {
      tab.addEventListener('click', () => this.mudarSubView(tab.dataset.subview));
    });
    document.getElementById('btn-atualizar').addEventListener(
      'click',
      () => this.carregarDados(true)
    );
    document.getElementById('btn-sincronizar').addEventListener(
      'click',
      () => this.sincronizar()
    );
    document.getElementById('hi-chart-toggle').addEventListener(
      'click',
      () => this.alternarGrafico()
    );
    document.getElementById('hi-diretriz-toggle').addEventListener(
      'click',
      () => this.alternarDiretriz()
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
    // Arrastar por teclado nao existe. As setas dao o mesmo resultado, um
    // degrau por vez, e o preventDefault impede a pagina de rolar junto.
    bases.addEventListener('keydown', evento => {
      if (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown') return;
      const punho = evento.target.closest('.hi-punho');
      if (!punho) return;
      const item = punho.closest('.hi-item');
      if (!item) return;
      evento.preventDefault();
      this.moverNaFila(item.dataset.nome, evento.key === 'ArrowUp' ? -1 : 1);
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
        this.fecharPopComent();
        this.abrirPop(etiquetas.dataset.etiquetas);
        return;
      }
      const comentarios = evento.target.closest('.hi-coment');
      if (comentarios) {
        evento.stopPropagation();
        this.abrirPopComent(comentarios.dataset.coment);
        return;
      }

      const liberar = evento.target.closest('.hi-liberar');
      if (!liberar) return;
      // Botao desabilitado nao dispara clique, mas o closest sobe a partir do
      // alvo real: se algum dia o svg deixar de ser pointer-events none, o
      // clique chegaria aqui pelo filho. Barato garantir.
      if (liberar.disabled) return;
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

    // ── Popover de comentários ────────────────────────────────
    const popComent = document.getElementById('hi-pop-coment');
    popComent.addEventListener('click', evento => {
      const acao = evento.target.closest('[data-coment-acao]');
      if (!acao) return;
      const tipo = acao.dataset.comentAcao;
      if (tipo === 'fechar') { this.fecharPopComent(); return; }
      if (tipo === 'excluir') { this.excluirComentario(acao.dataset.id); return; }
    });
    popComent.addEventListener('submit', evento => {
      if (evento.target.dataset.comentForm !== undefined) this.enviarComentario(evento);
    });
    // Enter envia, Shift+Enter quebra linha: e o que se espera de um campo de
    // comentario, e o botao continua ali para quem prefere o mouse.
    popComent.addEventListener('keydown', evento => {
      if (evento.key !== 'Enter' || evento.shiftKey) return;
      if (!evento.target.classList.contains('hi-co-campo')) return;
      evento.preventDefault();
      this.enviarComentario();
    });
    document.addEventListener('click', evento => {
      if (!this.popComentAberto()) return;
      // Mesma armadilha do popover de etiquetas: o innerHTML e refeito durante
      // o proprio despacho, entao o closest sobe uma arvore sem o popover.
      const caminho = evento.composedPath();
      const dentro = caminho.some(no =>
        no.id === 'hi-pop-coment' || no.classList?.contains('hi-coment')
      );
      if (dentro) return;
      this.fecharPopComent();
    });
    window.addEventListener('scroll', evento => {
      if (!this.popComentAberto()) return;
      if (this.scrollVeioDeDentro(evento.target, 'hi-pop-coment')) return;
      this.posicionarPopComent();
    }, true);
    window.addEventListener('resize', () => {
      if (this.popComentAberto()) this.posicionarPopComent();
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
    window.addEventListener('scroll', evento => {
      if (!this.popAberto()) return;
      if (this.scrollVeioDeDentro(evento.target, 'hi-pop')) return;
      this.posicionarPop();
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
      // O rascunho e guardado no fechamento, entao Escape nao apaga o que a
      // pessoa escreveu: reabrir devolve o texto.
      if (this.popComentAberto()) { this.fecharPopComent(); return; }
      if (document.querySelector('.hi-ordenar-menu:not([hidden])')) {
        this.fecharMenusOrdem();
        return;
      }
      if (this.liberacao) this.fecharLiberacao();
    });
  },

  // ============================================================
  // INSTRUTORES DE SOLO (2026-08-11)
  //
  // Mundo separado dos instrutores de voo: sem hora voada, sem CAVOK, sem
  // liberacao por OPR, sem flag de 100h (nada de hora e contabilizada para
  // eles). O que sobra em comum e exatamente o que esta secao reusa: a
  // paleta de cores (this.CORES/this.paletaHtml/this.corValida), o
  // posicionamento de popover (this.posicionarPopover) e os comentarios
  // genericos (this.comentariosDe/this.comentarioHtml/this.autorAtual). O
  // catalogo de ETIQUETAS e proprio (this.solo.etiquetas), por pedido do
  // Victor: misturar com CLT/Eventual/LIBERADO IFR AVIAO ofereceria, num
  // seletor, etiqueta que nao serve para o outro mundo.
  //
  // ⚠️ Todo elemento clicavel da linha usa CLASSE ou ATRIBUTO exclusivos
  // deste mundo (.hi-etiquetas-abrir-solo, .hi-coment-solo, data-*-solo),
  // nunca os mesmos das linhas de voo: os seletores de voo em
  // marcarGatilhoAtivo/marcarGatilhoComentAtivo/pintarMenusOrdem sao
  // GLOBAIS (document.querySelectorAll sem escopo), e as duas listas vivem
  // no mesmo documento (a aba escondida e display:none, nao removida do
  // DOM). Reusar o mesmo atributo faria abrir o seletor de cor de um mundo
  // tambem pintar o do outro.
  // ============================================================

  baseDoInstrutorSolo(instrutor) {
    const base = String(instrutor.base || '').trim().toUpperCase();
    return this.bases.includes(base) ? base : this.bases[0];
  },

  etiquetaPorIdSolo(id) {
    return this.solo.etiquetas.find(e => e.id === id) || null;
  },

  etiquetasDoSolo(instrutor) {
    const ids = Array.isArray(instrutor?.etiquetas) ? instrutor.etiquetas : [];
    return this.solo.etiquetas.filter(e => ids.includes(e.id)).map(e => e.id);
  },

  temEtiquetaSolo(instrutor, id) {
    return this.etiquetasDoSolo(instrutor).includes(id);
  },

  /** chipEtiqueta e generico (so le etiqueta.cor/etiqueta.nome): reusado tal e qual. */
  chipsDoInstrutorSolo(instrutor) {
    return this.etiquetasDoSolo(instrutor)
      .map(id => this.chipEtiqueta(this.etiquetaPorIdSolo(id)))
      .join('');
  },

  /**
   * Some enquanto o backend publicado nao manda `dataSolo`: aba/sub-aba que
   * abre e nao salva nada e pior do que aba que nao aparece. O frontend sobe
   * pelo GitHub Pages e o backend por clasp, em momentos diferentes. Dois
   * lugares escondem: a aba de nivel superior "Cadastrar Instrutor de Solo"
   * e a sub-aba "Instrutores de Solo" dentro de Instrutores por base.
   */
  aplicarSuporteSolo() {
    const tabCadastro = document.querySelector('.horas-inva-tab[data-view="cadastro-solo"]');
    if (tabCadastro) tabCadastro.hidden = !this.solo.suportado;
    const subtabSolo = document.querySelector('.hi-subtab[data-subview="solo"]');
    if (subtabSolo) subtabSolo.hidden = !this.solo.suportado;
    if (!this.solo.suportado) {
      if (document.getElementById('cadastro-solo')?.classList.contains('active')) {
        this.mudarView('dashboard');
      }
      if (document.getElementById('hi-subview-solo')?.classList.contains('active')) {
        this.mudarSubView('voo');
      }
    }
  },

  // ── Popover de etiquetas de solo (molde Trello) ──────────────

  popAbertoSolo() {
    return !!this.solo.pop.instrutor;
  },

  gatilhoDoPopSolo() {
    if (!this.solo.pop.instrutor) return null;
    return document.querySelector(
      `.hi-etiquetas-abrir-solo[data-etiquetas-solo="${CSS.escape(this.solo.pop.instrutor)}"]`
    );
  },

  posicionarPopSolo() {
    this.posicionarPopover(document.getElementById('hi-pop-solo'), this.gatilhoDoPopSolo());
  },

  abrirPopSolo(nome) {
    if (this.solo.pop.instrutor === nome) { this.fecharPopSolo(); return; }
    this.solo.pop.instrutor = nome;
    this.solo.pop.painel = 'lista';
    this.solo.pop.editando = null;
    this.solo.pop.busca = '';
    this.renderizarPopSolo();
    this.posicionarPopSolo();
    const pop = document.getElementById('hi-pop-solo');
    pop.hidden = false;
    pop.querySelector('.hi-pop-busca')?.focus();
    this.marcarGatilhoAtivoSolo();
  },

  fecharPopSolo() {
    this.solo.pop.instrutor = null;
    this.solo.pop.editando = null;
    document.getElementById('hi-pop-solo').hidden = true;
    this.marcarGatilhoAtivoSolo();
  },

  marcarGatilhoAtivoSolo() {
    document.querySelectorAll('.hi-etiquetas-abrir-solo').forEach(botao => {
      const ativo = botao.dataset.etiquetasSolo === this.solo.pop.instrutor;
      botao.classList.toggle('is-aberto', ativo);
      botao.setAttribute('aria-expanded', String(ativo));
    });
  },

  renderizarPopSolo() {
    const pop = document.getElementById('hi-pop-solo');
    const instrutor = this.solo.instrutores.find(i => i.nome === this.solo.pop.instrutor);
    const editando = this.solo.pop.editando
      ? this.etiquetaPorIdSolo(this.solo.pop.editando)
      : null;

    if (this.solo.pop.painel === 'editar') {
      pop.innerHTML = `
        <div class="hi-pop-head">
          <button class="hi-pop-icone" type="button" data-pop-solo="voltar" aria-label="Voltar">&#8592;</button>
          <span class="hi-pop-titulo">${editando ? 'Editar etiqueta' : 'Criar etiqueta'}</span>
          <button class="hi-pop-icone" type="button" data-pop-solo="fechar" aria-label="Fechar">&times;</button>
        </div>
        <form class="hi-pop-body" data-pop-solo-form="etiqueta">
          <div class="hi-pop-previa">
            <span class="hi-chip cor-${this.corValida(this.solo.pop.cor)}" data-pop-solo-previa>
              ${this.escape(editando ? editando.nome : 'Nova etiqueta')}
            </span>
          </div>
          <label class="hi-pop-rotulo" for="hi-pop-solo-nome">Nome</label>
          <input class="form-control hi-pop-nome" id="hi-pop-solo-nome" type="text"
            maxlength="${this.NOME_MAX}" autocomplete="off"
            value="${this.escape(editando ? editando.nome : '')}"
            placeholder="Ex.: LIBERADO GROUND SCHOOL">
          <span class="hi-pop-rotulo">Cor</span>
          <div class="hi-pop-paleta">${this.paletaHtml(this.corValida(this.solo.pop.cor))}</div>
          <div class="hi-pop-acoes">
            ${editando
              ? `<button class="btn btn-ghost hi-pop-excluir" type="button" data-pop-solo="excluir">Excluir</button>`
              : ''}
            <button class="btn btn-primary" type="submit" data-pop-solo="salvar">
              ${editando ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      `;
      pop.querySelector('.hi-pop-nome')?.focus();
      return;
    }

    const termo = this.solo.pop.busca.trim().toLocaleLowerCase('pt-BR');
    const visiveis = this.solo.etiquetas.filter(
      e => String(e.nome).toLocaleLowerCase('pt-BR').includes(termo)
    );

    let lista = '';
    if (!this.solo.etiquetas.length) {
      lista = `<li class="hi-pop-vazio">Nenhuma etiqueta ainda. Crie a primeira abaixo.</li>`;
    } else if (!visiveis.length) {
      lista = `<li class="hi-pop-vazio">Nenhuma etiqueta com esse nome.</li>`;
    } else {
      lista = visiveis.map(etiqueta => {
        const marcada = instrutor && this.temEtiquetaSolo(instrutor, etiqueta.id);
        return `
          <li class="hi-pop-item">
            <button class="hi-pop-marcar cor-${this.corValida(etiqueta.cor)}${marcada ? ' is-marcada' : ''}"
              type="button" role="checkbox" aria-checked="${!!marcada}"
              data-pop-solo="alternar" data-id="${this.escape(etiqueta.id)}">
              <span class="hi-pop-marcar-nome">${this.escape(etiqueta.nome)}</span>
              <span class="hi-pop-check" aria-hidden="true"></span>
            </button>
            <button class="hi-pop-lapis" type="button" data-pop-solo="editar"
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
        <button class="hi-pop-icone" type="button" data-pop-solo="fechar" aria-label="Fechar">&times;</button>
      </div>
      <div class="hi-pop-body">
        <p class="hi-pop-alvo">${this.escape(this.solo.pop.instrutor || '')}</p>
        ${this.solo.etiquetas.length > 5
          ? `<input class="form-control hi-pop-busca" type="search" autocomplete="off"
              placeholder="Buscar etiqueta" value="${this.escape(this.solo.pop.busca)}"
              aria-label="Buscar etiqueta">`
          : ''}
        <ul class="hi-pop-lista">${lista}</ul>
        <button class="hi-pop-criar" type="button" data-pop-solo="criar">
          <span aria-hidden="true">+</span> Criar nova etiqueta
        </button>
      </div>
    `;
  },

  abrirPainelEtiquetaSolo(id) {
    const etiqueta = id ? this.etiquetaPorIdSolo(id) : null;
    this.solo.pop.painel = 'editar';
    this.solo.pop.editando = etiqueta ? etiqueta.id : null;
    this.solo.pop.cor = etiqueta ? this.corValida(etiqueta.cor) : 'verde';
    this.renderizarPopSolo();
    this.posicionarPopSolo();
  },

  voltarParaListaSolo() {
    this.solo.pop.painel = 'lista';
    this.solo.pop.editando = null;
    this.renderizarPopSolo();
    this.posicionarPopSolo();
  },

  escolherCorPopSolo(cor) {
    this.solo.pop.cor = this.corValida(cor);
    const pop = document.getElementById('hi-pop-solo');
    const previa = pop.querySelector('[data-pop-solo-previa]');
    if (previa) previa.className = `hi-chip cor-${this.solo.pop.cor}`;
    pop.querySelectorAll('.hi-pop-cor').forEach(botao => {
      const ativa = botao.dataset.cor === this.solo.pop.cor;
      botao.classList.toggle('is-ativa', ativa);
      botao.setAttribute('aria-pressed', String(ativa));
    });
  },

  async alternarEtiquetaSolo(id) {
    const instrutor = this.solo.instrutores.find(i => i.nome === this.solo.pop.instrutor);
    const etiqueta = this.etiquetaPorIdSolo(id);
    if (!instrutor || !etiqueta) return;

    const anterior = this.etiquetasDoSolo(instrutor);
    const novos = anterior.includes(id)
      ? anterior.filter(item => item !== id)
      : [...anterior, id];

    instrutor.etiquetas = novos;
    this.renderizarTudoSolo();
    this.renderizarPopSolo();
    this.posicionarPopSolo();

    try {
      const resultado = await this.enviar('set_instructor_labels_solo', {
        nome: instrutor.nome,
        etiquetas: novos
      });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar as etiquetas.');
      }
    } catch (erro) {
      console.error('[Etiquetas do instrutor de solo]', erro);
      instrutor.etiquetas = anterior;
      this.renderizarTudoSolo();
      if (this.popAbertoSolo()) { this.renderizarPopSolo(); this.posicionarPopSolo(); }
      toast(erro.message || 'Erro ao salvar as etiquetas.', 'error', 5000);
    }
  },

  async salvarEtiquetaSolo(evento) {
    evento?.preventDefault();
    const campo = document.getElementById('hi-pop-solo-nome');
    const nome = String(campo?.value || '').trim();
    if (!nome) {
      toast('Dê um nome para a etiqueta.', 'warning');
      campo?.focus();
      return;
    }

    const botao = document.querySelector('[data-pop-solo="salvar"]');
    if (botao) botao.disabled = true;
    try {
      const resultado = await this.enviar('save_label_solo', {
        id: this.solo.pop.editando || '',
        nome,
        cor: this.solo.pop.cor
      });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar a etiqueta.');
      }
      this.solo.etiquetas = resultado.data?.etiquetas || this.solo.etiquetas;
      toast(this.solo.pop.editando ? 'Etiqueta atualizada.' : 'Etiqueta criada.', 'success');
      this.voltarParaListaSolo();
      this.renderizarTudoSolo();
    } catch (erro) {
      console.error('[Salvar etiqueta de solo]', erro);
      toast(erro.message || 'Erro ao salvar a etiqueta.', 'error', 5000);
    } finally {
      const atual = document.querySelector('[data-pop-solo="salvar"]');
      if (atual) atual.disabled = false;
    }
  },

  async excluirEtiquetaSolo() {
    const etiqueta = this.etiquetaPorIdSolo(this.solo.pop.editando);
    if (!etiqueta) return;

    const usada = this.solo.instrutores.filter(i => this.temEtiquetaSolo(i, etiqueta.id)).length;
    const aviso = usada
      ? `\n\nEla está em ${usada} ${usada === 1 ? 'instrutor' : 'instrutores'} e será removida de todos.`
      : '';
    if (!confirm(`Excluir a etiqueta "${etiqueta.nome}"?${aviso}`)) return;

    const botao = document.querySelector('[data-pop-solo="excluir"]');
    if (botao) botao.disabled = true;
    try {
      const resultado = await this.enviar('delete_label_solo', { id: etiqueta.id });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível excluir a etiqueta.');
      }
      this.solo.etiquetas = resultado.data?.etiquetas || [];
      this.solo.instrutores.forEach(instrutor => {
        if (Array.isArray(instrutor.etiquetas)) {
          instrutor.etiquetas = instrutor.etiquetas.filter(id => id !== etiqueta.id);
        }
      });
      toast('Etiqueta excluída.', 'success');
      this.voltarParaListaSolo();
      this.renderizarTudoSolo();
    } catch (erro) {
      console.error('[Excluir etiqueta de solo]', erro);
      toast(erro.message || 'Erro ao excluir a etiqueta.', 'error', 5000);
    } finally {
      const atual = document.querySelector('[data-pop-solo="excluir"]');
      if (atual) atual.disabled = false;
    }
  },

  // ── Comentários por instrutor de solo ────────────────────────

  popComentAbertoSolo() {
    return !!this.solo.popComent.instrutor;
  },

  gatilhoDoPopComentSolo() {
    if (!this.solo.popComent.instrutor) return null;
    return document.querySelector(
      `.hi-coment-solo[data-coment-solo="${CSS.escape(this.solo.popComent.instrutor)}"]`
    );
  },

  posicionarPopComentSolo() {
    this.posicionarPopover(
      document.getElementById('hi-pop-coment-solo'),
      this.gatilhoDoPopComentSolo()
    );
  },

  abrirPopComentSolo(nome) {
    if (this.solo.popComent.instrutor === nome) { this.fecharPopComentSolo(); return; }
    this.fecharPopSolo();
    this.solo.popComent.instrutor = nome;
    this.solo.popComent.salvando = false;
    this.renderizarPopComentSolo();
    this.posicionarPopComentSolo();
    document.getElementById('hi-pop-coment-solo').hidden = false;
    this.marcarGatilhoComentAtivoSolo();
    document.getElementById('hi-coment-solo-campo')?.focus();
  },

  fecharPopComentSolo() {
    if (!this.solo.popComent.instrutor) return;
    this.guardarRascunhoSolo();
    this.solo.popComent.instrutor = null;
    this.solo.popComent.salvando = false;
    document.getElementById('hi-pop-coment-solo').hidden = true;
    this.marcarGatilhoComentAtivoSolo();
  },

  guardarRascunhoSolo() {
    const nome = this.solo.popComent.instrutor;
    if (!nome) return;
    const campo = document.getElementById('hi-coment-solo-campo');
    if (!campo) return;
    const texto = campo.value;
    if (texto.trim()) this.solo.popComent.rascunhos[nome] = texto;
    else delete this.solo.popComent.rascunhos[nome];
  },

  marcarGatilhoComentAtivoSolo() {
    document.querySelectorAll('.hi-coment-solo').forEach(botao => {
      const ativo = botao.dataset.comentSolo === this.solo.popComent.instrutor;
      botao.classList.toggle('is-aberto', ativo);
      botao.setAttribute('aria-expanded', String(ativo));
    });
  },

  /** suportaComentarios genérico bastaria, mas o nome explícito lê melhor aqui. */
  suportaComentariosSolo() {
    return this.solo.instrutores.some(i => Array.isArray(i.comentarios));
  },

  renderizarPopComentSolo() {
    const pop = document.getElementById('hi-pop-coment-solo');
    const nome = this.solo.popComent.instrutor;
    const instrutor = this.solo.instrutores.find(i => i.nome === nome);
    const comentarios = this.comentariosDe(instrutor);
    const autor = this.autorAtual();
    const rascunho = this.solo.popComent.rascunhos[nome] || '';

    const lista = comentarios.length
      ? comentarios.map(comentario => this.comentarioHtml(
          comentario,
          !!autor && String(comentario.autor || '').trim().toUpperCase() === autor.trim().toUpperCase()
        )).join('')
      : `<li class="hi-pop-vazio">Nenhum comentário ainda. O primeiro fica aqui.</li>`;

    pop.innerHTML = `
      <div class="hi-pop-head">
        <span class="hi-pop-titulo">Comentários</span>
        <button class="hi-pop-icone" type="button" data-coment-solo-acao="fechar" aria-label="Fechar">&times;</button>
      </div>
      <div class="hi-pop-body">
        <p class="hi-pop-alvo">${this.escape(nome || '')}</p>
        <ul class="hi-co-lista">${lista}</ul>
        <form class="hi-co-form" data-coment-solo-form>
          <textarea class="form-control hi-co-campo" id="hi-coment-solo-campo" rows="2"
            maxlength="${this.TEXTO_MAX}"
            placeholder="Escrever um comentário sobre ${this.escape(nome || '')}"
            aria-label="Escrever um comentário">${this.escape(rascunho)}</textarea>
          <div class="hi-co-acoes">
            <button class="btn btn-primary" type="submit" data-coment-solo-acao="enviar"
              ${this.solo.popComent.salvando ? 'disabled' : ''}>
              ${this.solo.popComent.salvando ? 'Salvando...' : 'Comentar'}
            </button>
          </div>
        </form>
      </div>
    `;
  },

  async enviarComentarioSolo(evento) {
    evento?.preventDefault();
    const nome = this.solo.popComent.instrutor;
    const instrutor = this.solo.instrutores.find(i => i.nome === nome);
    const campo = document.getElementById('hi-coment-solo-campo');
    if (!instrutor || !campo || this.solo.popComent.salvando) return;

    const texto = String(campo.value || '').trim();
    if (!texto) {
      toast('Escreva o comentário antes de salvar.', 'warning');
      campo.focus();
      return;
    }

    const anteriores = this.comentariosDe(instrutor);
    instrutor.comentarios = [
      ...anteriores,
      { id: '', autor: this.autorAtual(), data: '', texto, pendente: true }
    ];
    delete this.solo.popComent.rascunhos[nome];
    this.solo.popComent.salvando = true;
    this.renderizarTudoSolo();
    this.renderizarPopComentSolo();
    this.posicionarPopComentSolo();

    try {
      const resultado = await this.enviar('add_comment_solo', {
        nome: instrutor.nome,
        texto,
        autor: this.autorAtual()
      });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar o comentário.');
      }
      instrutor.comentarios = Array.isArray(resultado.data?.comentarios)
        ? resultado.data.comentarios
        : anteriores;
    } catch (erro) {
      console.error('[Comentário do instrutor de solo]', erro);
      instrutor.comentarios = anteriores;
      this.solo.popComent.rascunhos[nome] = texto;
      toast(erro.message || 'Erro ao salvar o comentário.', 'error', 5000);
    } finally {
      this.solo.popComent.salvando = false;
      this.renderizarTudoSolo();
      if (this.popComentAbertoSolo()) {
        this.renderizarPopComentSolo();
        this.posicionarPopComentSolo();
        document.getElementById('hi-coment-solo-campo')?.focus();
      }
    }
  },

  async excluirComentarioSolo(id) {
    const nome = this.solo.popComent.instrutor;
    const instrutor = this.solo.instrutores.find(i => i.nome === nome);
    if (!instrutor || !id) return;
    if (!confirm('Apagar este comentário?')) return;

    this.guardarRascunhoSolo();
    const botao = document.querySelector(
      `#hi-pop-coment-solo [data-coment-solo-acao="excluir"][data-id="${CSS.escape(id)}"]`
    );
    if (botao) botao.disabled = true;
    try {
      const resultado = await this.enviar('delete_comment_solo', { id, autor: this.autorAtual() });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível apagar o comentário.');
      }
      instrutor.comentarios = Array.isArray(resultado.data?.comentarios)
        ? resultado.data.comentarios
        : this.comentariosDe(instrutor).filter(c => c.id !== id);
      this.renderizarTudoSolo();
      if (this.popComentAbertoSolo()) { this.renderizarPopComentSolo(); this.posicionarPopComentSolo(); }
    } catch (erro) {
      console.error('[Excluir comentário de solo]', erro);
      toast(erro.message || 'Erro ao apagar o comentário.', 'error', 5000);
      const atual = document.querySelector(
        `#hi-pop-coment-solo [data-coment-solo-acao="excluir"][data-id="${CSS.escape(id)}"]`
      );
      if (atual) atual.disabled = false;
    }
  },

  // ── Ordenação de cada base (só prioridade e alfabética) ──────

  emPrioridadeSolo(base) {
    return this.solo.ordens[base] === 'prioridade';
  },

  /** A base inteira na ordem de prioridade, SEM o filtro da busca. */
  nomesDaBaseSolo(base) {
    return this.ordenarInstrutores(
      this.solo.instrutores.filter(i => this.baseDoInstrutorSolo(i) === base),
      'prioridade'
    ).map(i => i.nome);
  },

  async aplicarOrdemSolo(base, nomes) {
    if (!this.bases.includes(base) || !nomes.length) return;

    const antes = this.solo.instrutores.map(i => ({ i, base: i.base, ordem: i.ordem }));
    nomes.forEach((nome, indice) => {
      const instrutor = this.solo.instrutores.find(i => i.nome === nome);
      if (!instrutor) return;
      instrutor.base = base;
      instrutor.ordem = indice + 1;
    });
    this.renderizarTudoSolo();

    try {
      const resultado = await this.enviar('set_instructor_order_solo', { base, nomes });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível salvar a ordem.');
      }
    } catch (erro) {
      console.error('[Ordem de prioridade — solo]', erro);
      antes.forEach(({ i, base: b, ordem }) => { i.base = b; i.ordem = ordem; });
      this.renderizarTudoSolo();
      toast(erro.message || 'Erro ao salvar a ordem de prioridade.', 'error', 5000);
    }
  },

  reposicionarSolo(nome, base, nomeAlvo) {
    const fila = this.nomesDaBaseSolo(base).filter(n => n !== nome);
    const destino = nomeAlvo && nomeAlvo !== nome ? fila.indexOf(nomeAlvo) : -1;
    if (destino >= 0) fila.splice(destino, 0, nome);
    else fila.push(nome);
    return this.aplicarOrdemSolo(base, fila);
  },

  moverNaFilaSolo(nome, passo) {
    const instrutor = this.solo.instrutores.find(i => i.nome === nome);
    if (!instrutor) return;
    const base = this.baseDoInstrutorSolo(instrutor);
    if (!this.emPrioridadeSolo(base)) return;

    const fila = this.nomesDaBaseSolo(base);
    const atual = fila.indexOf(nome);
    const novo = atual + passo;
    if (atual < 0 || novo < 0 || novo >= fila.length) return;
    fila.splice(atual, 1);
    fila.splice(novo, 0, nome);
    this.aplicarOrdemSolo(base, fila);
    requestAnimationFrame(() => {
      document.querySelector(
        `#hi-bases-solo .hi-item[data-nome="${CSS.escape(nome)}"] .hi-punho`
      )?.focus();
    });
  },

  pintarMenusOrdemSolo() {
    this.bases.forEach(base => {
      const ordem = this.solo.ordens[base];
      const botao = document.querySelector(`.hi-ordenar-btn[data-ordenar-solo="${base}"]`);
      if (botao) botao.title = `Ordenar: ${this.ROTULOS_ORDEM[ordem]}`;
      document.querySelectorAll(`.hi-ordenar-menu[data-menu-solo="${base}"] button`)
        .forEach(item => {
          const ativa = item.dataset.ordem === ordem;
          item.classList.toggle('is-ativa', ativa);
          item.setAttribute('aria-checked', String(ativa));
        });
    });
  },

  abrirMenuOrdemSolo(base) {
    document.querySelectorAll('#hi-bases-solo .hi-ordenar-menu').forEach(menu => {
      const abrir = menu.dataset.menuSolo === base && menu.hidden;
      menu.hidden = !abrir;
      const botao = document.querySelector(`.hi-ordenar-btn[data-ordenar-solo="${menu.dataset.menuSolo}"]`);
      botao?.setAttribute('aria-expanded', String(abrir));
      botao?.classList.toggle('is-aberto', abrir);
    });
  },

  fecharMenusOrdemSolo() {
    document.querySelectorAll('#hi-bases-solo .hi-ordenar-menu').forEach(menu => { menu.hidden = true; });
    document.querySelectorAll('#hi-bases-solo .hi-ordenar-btn').forEach(botao => {
      botao.setAttribute('aria-expanded', 'false');
      botao.classList.remove('is-aberto');
    });
  },

  escolherOrdemSolo(base, ordem) {
    if (!this.ROTULOS_ORDEM[ordem] || !this.bases.includes(base)) return;
    this.solo.ordens[base] = ordem;
    this.fecharMenusOrdemSolo();
    this.pintarMenusOrdemSolo();
    this.renderizarBasesSolo();
  },

  // ── Render ──────────────────────────────────────────────────

  botaoComentariosSolo(instrutor, nomeEscapado) {
    if (!this.suportaComentariosSolo()) return '';
    const quantos = this.comentariosDe(instrutor).length;
    const rotulo = quantos === 0
      ? `Sem comentário sobre ${instrutor.nome}`
      : `${quantos} ${quantos === 1 ? 'comentário' : 'comentários'} sobre ${instrutor.nome}`;
    return `
      <button class="hi-coment-solo${quantos ? ' tem' : ''}" type="button" data-coment-solo="${nomeEscapado}"
        aria-haspopup="dialog" aria-expanded="false"
        title="${this.escape(rotulo)}" aria-label="${this.escape(rotulo)}">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-2.9-.4L3 21l1.6-4.6A8.3 8.3 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"
            fill="none" stroke="currentColor" stroke-width="2.1"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${quantos ? `<span class="hi-coment-n">${quantos}</span>` : ''}
      </button>
    `;
  },

  linhaInstrutorSolo(instrutor, base, posicao) {
    const outra = this.bases.find(b => b !== base) || base;
    const nome = this.escape(instrutor.nome);
    const prioridade = this.emPrioridadeSolo(base);
    const rotuloPunho = prioridade
      ? `${nome} está em ${posicao}º na prioridade de ${base}. Arraste para mudar a posição, `
        + `use as setas para cima e para baixo, ou clique para mover para a base ${outra}`
      : `Arraste para a outra base, ou clique para mover ${nome} para a base ${outra}`;

    return `
      <li class="hi-item" data-nome="${nome}">
        <button class="hi-punho" type="button" data-mover="${outra}"
          title="${this.escape(rotuloPunho)}" aria-label="${this.escape(rotuloPunho)}">
          <span class="hi-punho-icone" aria-hidden="true"></span>
        </button>
        ${prioridade
          ? `<span class="hi-posicao" aria-hidden="true">${posicao}</span>`
          : ''}
        <div class="hi-item-info">
          <span class="hi-item-nome">${nome}</span>
          <span class="hi-item-meta">
            ${this.chipsDoInstrutorSolo(instrutor)}
            <button class="hi-etiquetas-abrir-solo" type="button" data-etiquetas-solo="${nome}"
              aria-haspopup="dialog" aria-expanded="false"
              title="Etiquetas de ${nome}" aria-label="Etiquetas de ${nome}">
              <span aria-hidden="true">+</span>
            </button>
            ${this.botaoComentariosSolo(instrutor, nome)}
          </span>
        </div>
      </li>
    `;
  },

  renderizarBasesSolo() {
    const termo = String(this.solo.filtro).trim().toLocaleLowerCase('pt-BR');

    this.bases.forEach(base => {
      const lista = document.getElementById(`hi-lista-${base}-solo`);
      if (!lista) return;

      const daBase = this.ordenarInstrutores(
        this.solo.instrutores.filter(i => this.baseDoInstrutorSolo(i) === base),
        this.solo.ordens[base]
      );
      const visiveis = daBase.filter(i => {
        if (!termo) return true;
        if (String(i.nome || '').toLocaleLowerCase('pt-BR').includes(termo)) return true;
        const naEtiqueta = this.etiquetasDoSolo(i).some(id =>
          String(this.etiquetaPorIdSolo(id)?.nome || '')
            .toLocaleLowerCase('pt-BR').includes(termo)
        );
        if (naEtiqueta) return true;
        return this.comentariosDe(i).some(c =>
          String(c.texto || '').toLocaleLowerCase('pt-BR').includes(termo)
        );
      });

      const contador = document.getElementById(`hi-contador-${base}-solo`);
      if (contador) {
        contador.textContent = `${daBase.length} ${daBase.length === 1 ? 'instrutor' : 'instrutores'}`;
      }

      const aviso = document.getElementById(`hi-vista-${base}-solo`);
      if (aviso) {
        aviso.hidden = this.emPrioridadeSolo(base);
        aviso.textContent = this.emPrioridadeSolo(base)
          ? ''
          : `Vendo por ${this.ROTULOS_ORDEM[this.solo.ordens[base]].toLowerCase()}. Esta não é a ordem de prioridade.`;
      }

      if (!visiveis.length) {
        const texto = termo && daBase.length
          ? 'Nenhum instrutor com esse nome nesta base.'
          : 'Nenhum instrutor aqui. Arraste um pelo punho.';
        lista.innerHTML = `<li class="hi-vazio">${texto}</li>`;
        return;
      }

      const posicoes = new Map(this.nomesDaBaseSolo(base).map((nome, i) => [nome, i + 1]));
      lista.innerHTML = visiveis
        .map(i => this.linhaInstrutorSolo(i, base, posicoes.get(i.nome) || 0))
        .join('');
    });
  },

  renderizarTudoSolo() {
    this.renderizarBasesSolo();
    if (this.popAbertoSolo()) {
      this.marcarGatilhoAtivoSolo();
      this.posicionarPopSolo();
    }
    if (this.popComentAbertoSolo()) {
      this.marcarGatilhoComentAtivoSolo();
      this.posicionarPopComentSolo();
    }
  },

  // ── Arrastar: posição na fila e troca de base ───────────────

  iniciarArrasteSolo(evento, punho) {
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;
    const item = punho.closest('.hi-item');
    if (!item) return;

    this.solo.arraste = {
      nome: item.dataset.nome,
      item,
      punho,
      pointerId: evento.pointerId,
      x0: evento.clientX,
      y0: evento.clientY,
      largura: item.getBoundingClientRect().width,
      ativo: false,
      alvo: null,
      antesDe: null,
      marca: null,
      ghost: null
    };
    try { punho.setPointerCapture(evento.pointerId); } catch (ignore) {}
  },

  moverArrasteSolo(evento) {
    const a = this.solo.arraste;
    if (!a || evento.pointerId !== a.pointerId) return;

    if (!a.ativo) {
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

    const sob = document.elementFromPoint(evento.clientX, evento.clientY);
    const zona = sob?.closest('#hi-bases-solo [data-drop-base]') || null;
    const base = zona?.dataset.dropBase || null;

    if (base !== a.alvo) {
      a.alvo = base;
      document.querySelectorAll('#hi-bases-solo [data-drop-base]').forEach(el => {
        el.classList.toggle('is-drop', el.dataset.dropBase === base);
      });
    }

    this.marcarPosicaoDeSolturaSolo(evento, zona, base);
  },

  marcarPosicaoDeSolturaSolo(evento, zona, base) {
    const a = this.solo.arraste;
    const lista = base && this.emPrioridadeSolo(base) ? zona.querySelector('.hi-lista') : null;
    if (!lista) {
      a.antesDe = null;
      a.marca?.remove();
      a.marca = null;
      return;
    }

    const itens = [...lista.querySelectorAll('.hi-item')].filter(el => el !== a.item);
    let alvo = null;
    for (const el of itens) {
      const caixa = el.getBoundingClientRect();
      if (evento.clientY < caixa.top + caixa.height / 2) { alvo = el; break; }
    }

    a.antesDe = alvo?.dataset.nome || null;
    if (!a.marca) {
      a.marca = document.createElement('li');
      a.marca.className = 'hi-drop-marca';
      a.marca.setAttribute('aria-hidden', 'true');
    }
    if (alvo) lista.insertBefore(a.marca, alvo);
    else lista.appendChild(a.marca);
  },

  encerrarArrasteSolo(evento) {
    const a = this.solo.arraste;
    if (!a || (evento && evento.pointerId !== a.pointerId)) return;
    this.solo.arraste = null;

    try { a.punho.releasePointerCapture(a.pointerId); } catch (ignore) {}
    a.ghost?.remove();
    a.marca?.remove();
    a.item.classList.remove('is-arrastando');
    document.body.classList.remove('hi-arrastando');
    document.querySelectorAll('#hi-bases-solo [data-drop-base]')
      .forEach(el => el.classList.remove('is-drop'));

    if (!a.ativo) return;
    this.solo.ignorarCliqueDoPunho = true;
    if (!a.alvo) return;

    const instrutor = this.solo.instrutores.find(i => i.nome === a.nome);
    const origem = instrutor ? this.baseDoInstrutorSolo(instrutor) : null;

    if (!this.emPrioridadeSolo(a.alvo)) {
      if (a.alvo !== origem) this.moverBaseSolo(a.nome, a.alvo);
      return;
    }

    const fila = this.nomesDaBaseSolo(a.alvo);
    const atual = fila.indexOf(a.nome);
    const seguinte = atual >= 0 ? (fila[atual + 1] || null) : null;
    if (a.alvo === origem && (a.antesDe === seguinte || a.antesDe === a.nome)) return;

    this.reposicionarSolo(a.nome, a.alvo, a.antesDe);
  },

  cancelarArrasteSolo() {
    const a = this.solo.arraste;
    if (!a) return;
    a.alvo = null;
    a.antesDe = null;
    this.encerrarArrasteSolo({ pointerId: a.pointerId });
  },

  async moverBaseSolo(nome, base) {
    if (!this.bases.includes(base)) return;
    const instrutor = this.solo.instrutores.find(i => i.nome === nome);
    if (!instrutor) return;

    const anterior = this.baseDoInstrutorSolo(instrutor);
    if (anterior === base) return;

    const ordemAnterior = instrutor.ordem;
    instrutor.base = base;
    instrutor.ordem = this.solo.instrutores
      .filter(i => this.baseDoInstrutorSolo(i) === base && i !== instrutor)
      .reduce((maior, i) => Math.max(maior, Number(i.ordem) || 0), 0) + 1;
    this.renderizarTudoSolo();

    try {
      const resultado = await this.enviar('set_instructor_base_solo', { nome, base });
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível mudar a base.');
      }
      if (Number(resultado.data?.ordem) > 0) {
        instrutor.ordem = Number(resultado.data.ordem);
        this.renderizarBasesSolo();
      }
      toast(`${nome} agora está na base ${base}.`, 'success');
    } catch (erro) {
      console.error('[Base do instrutor de solo]', erro);
      instrutor.base = anterior;
      instrutor.ordem = ordemAnterior;
      this.renderizarTudoSolo();
      toast(erro.message || 'Erro ao mudar a base do instrutor.', 'error', 5000);
    }
  },

  // ── Cadastro ──────────────────────────────────────────────────

  async cadastrarSolo(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget || document.getElementById('form-instrutor-solo');
    const botao = formulario.querySelector('button[type="submit"]');
    const dados = {
      nome: document.getElementById('instrutor-solo-nome').value.trim(),
      base: document.getElementById('instrutor-solo-base').value
    };
    if (!dados.nome || !dados.base) {
      toast('Preencha o nome e a base do instrutor.', 'warning');
      return;
    }

    if (botao) botao.disabled = true;
    try {
      const resultado = await this.enviar('add_instructor_solo', dados);
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível cadastrar o instrutor.');
      }
      formulario?.reset();
      toast('Instrutor de solo cadastrado com sucesso.', 'success');
      // Mesmo destino do cadastro de voo: volta pro Dashboard, e já na
      // sub-aba certa, senão a pessoa cadastra e não vê onde o novo
      // instrutor caiu sem um clique extra.
      this.mudarView('dashboard');
      this.mudarSubView('solo');
      await this.carregarDados();
    } catch (erro) {
      console.error('[Cadastro de instrutor de solo]', erro);
      toast(erro.message || 'Erro ao cadastrar o instrutor de solo.', 'error', 5000);
    } finally {
      if (botao) botao.disabled = false;
    }
  },

  vincularEventosSolo() {
    document.getElementById('form-instrutor-solo').addEventListener(
      'submit',
      evento => this.cadastrarSolo(evento)
    );
    document.getElementById('btn-cancelar-cadastro-solo').addEventListener(
      'click',
      () => this.mudarView('dashboard')
    );
    document.getElementById('busca-instrutor-solo').addEventListener('input', evento => {
      this.solo.filtro = evento.target.value;
      this.renderizarBasesSolo();
    });

    const bases = document.getElementById('hi-bases-solo');
    bases.addEventListener('pointerdown', evento => {
      const punho = evento.target.closest('.hi-punho');
      if (punho) this.iniciarArrasteSolo(evento, punho);
    });
    bases.addEventListener('keydown', evento => {
      if (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown') return;
      const punho = evento.target.closest('.hi-punho');
      if (!punho) return;
      const item = punho.closest('.hi-item');
      if (!item) return;
      evento.preventDefault();
      this.moverNaFilaSolo(item.dataset.nome, evento.key === 'ArrowUp' ? -1 : 1);
    });
    bases.addEventListener('click', evento => {
      const gatilhoOrdem = evento.target.closest('.hi-ordenar-btn');
      if (gatilhoOrdem) { this.abrirMenuOrdemSolo(gatilhoOrdem.dataset.ordenarSolo); return; }
      const itemOrdem = evento.target.closest('.hi-ordenar-menu button');
      if (itemOrdem) {
        this.escolherOrdemSolo(itemOrdem.closest('.hi-ordenar-menu').dataset.menuSolo, itemOrdem.dataset.ordem);
        return;
      }

      const punho = evento.target.closest('.hi-punho');
      if (punho) {
        if (this.solo.ignorarCliqueDoPunho) {
          this.solo.ignorarCliqueDoPunho = false;
          return;
        }
        const item = punho.closest('.hi-item');
        if (item) this.moverBaseSolo(item.dataset.nome, punho.dataset.mover);
        return;
      }
      const etiquetas = evento.target.closest('.hi-etiquetas-abrir-solo');
      if (etiquetas) {
        evento.stopPropagation();
        this.fecharPopComentSolo();
        this.abrirPopSolo(etiquetas.dataset.etiquetasSolo);
        return;
      }
      const comentarios = evento.target.closest('.hi-coment-solo');
      if (comentarios) {
        evento.stopPropagation();
        this.abrirPopComentSolo(comentarios.dataset.comentSolo);
        return;
      }
    });

    // ── Popover de etiquetas de solo ──────────────────────────
    const pop = document.getElementById('hi-pop-solo');
    pop.addEventListener('click', evento => {
      const acao = evento.target.closest('[data-pop-solo]');
      if (!acao) return;
      const tipo = acao.dataset.popSolo;
      if (tipo === 'fechar') { this.fecharPopSolo(); return; }
      if (tipo === 'voltar') { this.voltarParaListaSolo(); return; }
      if (tipo === 'criar') { this.abrirPainelEtiquetaSolo(null); return; }
      if (tipo === 'editar') { this.abrirPainelEtiquetaSolo(acao.dataset.id); return; }
      if (tipo === 'alternar') { this.alternarEtiquetaSolo(acao.dataset.id); return; }
      if (tipo === 'excluir') { this.excluirEtiquetaSolo(); return; }
    });
    pop.addEventListener('click', evento => {
      const cor = evento.target.closest('.hi-pop-cor');
      if (cor) this.escolherCorPopSolo(cor.dataset.cor);
    });
    pop.addEventListener('submit', evento => {
      if (evento.target.dataset.popSoloForm !== undefined) this.salvarEtiquetaSolo(evento);
    });
    pop.addEventListener('input', evento => {
      if (!evento.target.classList.contains('hi-pop-busca')) return;
      this.solo.pop.busca = evento.target.value;
      const foco = document.activeElement === evento.target;
      this.renderizarPopSolo();
      if (foco) {
        const campo = pop.querySelector('.hi-pop-busca');
        campo?.focus();
        campo?.setSelectionRange(campo.value.length, campo.value.length);
      }
      this.posicionarPopSolo();
    });

    // ── Popover de comentários de solo ────────────────────────
    const popComent = document.getElementById('hi-pop-coment-solo');
    popComent.addEventListener('click', evento => {
      const acao = evento.target.closest('[data-coment-solo-acao]');
      if (!acao) return;
      const tipo = acao.dataset.comentSoloAcao;
      if (tipo === 'fechar') { this.fecharPopComentSolo(); return; }
      if (tipo === 'excluir') { this.excluirComentarioSolo(acao.dataset.id); return; }
    });
    popComent.addEventListener('submit', evento => {
      if (evento.target.dataset.comentSoloForm !== undefined) this.enviarComentarioSolo(evento);
    });
    popComent.addEventListener('keydown', evento => {
      if (evento.key !== 'Enter' || evento.shiftKey) return;
      if (!evento.target.classList.contains('hi-co-campo')) return;
      evento.preventDefault();
      this.enviarComentarioSolo();
    });

    document.addEventListener('click', evento => {
      if (!this.popComentAbertoSolo()) return;
      const caminho = evento.composedPath();
      const dentro = caminho.some(no =>
        no.id === 'hi-pop-coment-solo' || no.classList?.contains('hi-coment-solo')
      );
      if (dentro) return;
      this.fecharPopComentSolo();
    });
    window.addEventListener('scroll', evento => {
      if (!this.popComentAbertoSolo()) return;
      if (this.scrollVeioDeDentro(evento.target, 'hi-pop-coment-solo')) return;
      this.posicionarPopComentSolo();
    }, true);
    window.addEventListener('resize', () => {
      if (this.popComentAbertoSolo()) this.posicionarPopComentSolo();
    });

    document.addEventListener('click', evento => {
      if (!this.popAbertoSolo()) return;
      const caminho = evento.composedPath();
      const dentro = caminho.some(no =>
        no.id === 'hi-pop-solo' || no.classList?.contains('hi-etiquetas-abrir-solo')
      );
      if (dentro) return;
      this.fecharPopSolo();
    });
    window.addEventListener('scroll', evento => {
      if (!this.popAbertoSolo()) return;
      if (this.scrollVeioDeDentro(evento.target, 'hi-pop-solo')) return;
      this.posicionarPopSolo();
    }, true);
    window.addEventListener('resize', () => {
      if (this.popAbertoSolo()) this.posicionarPopSolo();
    });

    document.addEventListener('pointermove', evento => this.moverArrasteSolo(evento));
    document.addEventListener('pointerup', evento => this.encerrarArrasteSolo(evento));
    document.addEventListener('pointercancel', evento => this.encerrarArrasteSolo(evento));

    document.addEventListener('click', evento => {
      if (!evento.target.closest('.hi-ordenar')) this.fecharMenusOrdemSolo();
    });

    document.addEventListener('keydown', evento => {
      if (evento.key !== 'Escape') return;
      if (this.solo.arraste) { this.cancelarArrasteSolo(); return; }
      if (this.popAbertoSolo()) {
        if (this.solo.pop.painel === 'editar') this.voltarParaListaSolo();
        else this.fecharPopSolo();
        return;
      }
      if (this.popComentAbertoSolo()) { this.fecharPopComentSolo(); return; }
      if (document.querySelector('#hi-bases-solo .hi-ordenar-menu:not([hidden])')) {
        this.fecharMenusOrdemSolo();
      }
    });
  },

  async iniciar() {
    if (!Auth.protegerHorasVoadasInva()) return;
    Auth.preencherUI();
    this.carregarOrdens();
    this.carregarEstadoGrafico();
    this.aplicarEstadoGrafico();
    this.carregarEstadoDiretriz();
    this.aplicarEstadoDiretriz();
    this.pintarMenusOrdem();
    this.pintarMenusOrdemSolo();
    this.renderizarEtiquetasCadastro();
    this.vincularEventos();
    this.vincularEventosSolo();
    await this.carregarDados();
  }
};

HorasVoadasInva.iniciar();
