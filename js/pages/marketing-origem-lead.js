// ============================================================
// marketing-origem-lead.js — Origem do Lead
// SAFE Hub
//
// Só leitura, sem nenhuma escrita, então não há atualização otimista aqui.
//
// A base inteira vem numa requisição só (API.getMarketing) e TODOS os cortes
// são feitos no navegador. Com os ~10s de latência do Apps Script, uma ida ao
// servidor por clique de filtro deixaria a tela inutilizável, e os cortes são
// contagens sobre alguns milhares de linhas, coisa de milissegundos.
//
// ── Sobre as cores dos gráficos ────────────────────────────────────────────
// Nenhum gráfico daqui pinta barra por categoria, e isso é decisão, não
// economia. Numa barra nominal (origem, estado, cidade, curso) quem já diz
// "quanto" é o comprimento; dar uma cor por categoria gasta o canal de
// identidade repetindo o que a barra mostra, e obriga uma paleta de 10 tons
// distinguíveis que a paleta SAFE não tem: medido, o azul #5BAEE2 e o teal
// #60C0BF ficam a ΔE 8,3 em visão normal, abaixo do piso de 15, ou seja, lado
// a lado eles se confundem para qualquer pessoa. Então barra nominal é de UMA
// cor só. A exceção é a faixa etária, que é ORDINAL (trocar a ordem das faixas
// mudaria o sentido), e por isso ganha uma rampa de um matiz só, do claro ao
// escuro, com os degraus validados nos dois modos.
//
// ⚠️ As cores não moram neste arquivo: vêm das variáveis --mkt-* do CSS da
// página, que é onde o modo escuro é resolvido. Ao mexer em cor, mexa lá.
// ============================================================

const Marketing = {
  leads: [],
  geradoEm: '',
  metricaMensal: 'qtd',
  charts: {},

  // Rótulo do que não foi preenchido. Aparece na tela de propósito: esconder
  // faria os percentuais somarem 100% sobre uma base menor do que a real, e a
  // decisão de mídia sairia de um retrato que não existe.
  SEM: '(não informado)',

  // Ordem fixa das faixas. É a mesma régua do filtro da página de Vendas, para
  // as duas telas quererem dizer a mesma coisa quando disserem "25 a 34".
  FAIXAS: [
    { id: 'menor18', ate: 17,  label: 'Menor de 18' },
    { id: '18-24',   ate: 24,  label: '18 a 24' },
    { id: '25-34',   ate: 34,  label: '25 a 34' },
    { id: '35-44',   ate: 44,  label: '35 a 44' },
    { id: '45-54',   ate: 54,  label: '45 a 54' },
    { id: '55+',     ate: 999, label: '55 ou mais' }
  ],

  // Cada dimensão sabe o campo que lê, o `select` que a controla e o gráfico
  // que a desenha. Ter isto num mapa é o que faz o filtro cruzado, os chips e
  // o clique no gráfico serem um código só em vez de sete repetições.
  DIMENSOES: {
    origem: { campo: 'origem', select: 'mkt-f-origem', rotulo: 'Origem' },
    estado: { campo: 'estado', select: 'mkt-f-estado', rotulo: 'Estado' },
    cidade: { campo: 'cidade', select: 'mkt-f-cidade', rotulo: 'Cidade' },
    faixa:  { campo: 'faixa',  select: 'mkt-f-faixa',  rotulo: 'Faixa etária' },
    sexo:   { campo: 'sexo',   select: 'mkt-f-sexo',   rotulo: 'Sexo' },
    curso:  { campo: 'curso',  select: 'mkt-f-curso',  rotulo: 'Curso' }
  },

  filtros: { ano: '', mes: '', origem: '', estado: '', cidade: '', faixa: '', sexo: '', curso: '' },

  async iniciar() {
    if (!Auth.protegerMarketing()) return;
    Auth.preencherUI();
    this._bindHamburger();
    this.vincularEventos();
    await this.carregar();
  },

  /**
   * Abre/fecha a sidebar no mobile.
   * O auth.js só ajusta o aria-expanded e FECHA o menu (fecharMenu). O toggle
   * de `mobile-open` é responsabilidade do JS de cada página: sem isto o
   * hamburger não abre nada. Mesmo padrão do aniversarios.js.
   */
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

  vincularEventos() {
    document.getElementById('mkt-atualizar')
      ?.addEventListener('click', () => this.carregar(true));

    document.getElementById('mkt-periodo')?.addEventListener('change', evento => {
      this.filtros.ano = evento.target.value;
      // Trocar de ano precisa soltar o mês: um mês de 2025 selecionado dentro
      // do ano de 2026 é um recorte vazio, e a tela ficaria em branco sem a
      // pessoa entender por quê.
      this.filtros.mes = '';
      this.renderizar();
    });

    Object.entries(this.DIMENSOES).forEach(([dim, cfg]) => {
      document.getElementById(cfg.select)?.addEventListener('change', evento => {
        this.filtros[dim] = evento.target.value;
        this.renderizar();
      });
    });

    document.getElementById('mkt-limpar')?.addEventListener('click', () => {
      Object.keys(this.filtros).forEach(k => { this.filtros[k] = ''; });
      this.renderizar();
    });

    document.querySelectorAll('.mkt-metrica-btn').forEach(botao => {
      botao.addEventListener('click', () => {
        this.metricaMensal = botao.dataset.metrica;
        document.querySelectorAll('.mkt-metrica-btn')
          .forEach(b => b.classList.toggle('is-ativo', b === botao));
        this.renderMensal();
      });
    });

    // Os chips são criados a cada render, então o clique é delegado.
    document.getElementById('mkt-chips')?.addEventListener('click', evento => {
      const botao = evento.target.closest('[data-remover]');
      if (!botao) return;
      this.filtros[botao.dataset.remover] = '';
      this.renderizar();
    });

    // ⚠️ Os gráficos são desenhados em <canvas>, então nada neles herda cor do
    // CSS: eixo, grade e rótulo são pintados por JS com o valor lido das
    // variáveis --mkt-*. Sem redesenhar ao alternar o tema, a página inteira
    // vira escura e os sete gráficos continuam com texto de modo claro.
    document.addEventListener('safe:tema', () => this.renderizar());
  },

  async carregar(forcar = false) {
    this.setLoading(true);
    try {
      const res = await API.getMarketing(!forcar);
      if (!res.ok) {
        toast(res.error || 'Erro ao carregar os dados de marketing.', 'error');
        return;
      }
      this.leads = (res.data?.leads || []).map(lead => this._preparar(lead));
      this.geradoEm = res.data?.geradoEm || '';
      this.preencherPeriodo();
      this.renderizar();
      this.renderAtualizadoEm();
    } catch (erro) {
      toast('Não foi possível carregar os dados de marketing.', 'error');
    } finally {
      this.setLoading(false);
    }
  },

  /**
   * Acrescenta ao lead o que a tela precisa e o servidor não manda pronto:
   * a faixa etária (derivada da idade) e a chave de mês.
   * Campo vazio vira o rótulo de não informado uma vez só, aqui, para o resto
   * do arquivo não ter que testar string vazia em todo lugar.
   */
  _preparar(lead) {
    const texto = valor => {
      const t = String(valor ?? '').trim();
      return t || this.SEM;
    };
    return {
      mesChave: lead.ano && lead.mes ? `${lead.ano}-${String(lead.mes).padStart(2, '0')}` : '',
      ano:    String(lead.ano || ''),
      valor:  Number(lead.valor) || 0,
      origem: texto(lead.origem),
      estado: texto(lead.estado),
      cidade: texto(lead.cidade),
      sexo:   texto(lead.sexo),
      curso:  texto(lead.curso),
      faixa:  this._faixa(lead.idade)
    };
  },

  _faixa(idade) {
    if (idade === null || idade === undefined || !Number.isFinite(Number(idade))) return this.SEM;
    const n = Number(idade);
    const achada = this.FAIXAS.find(f => n <= f.ate);
    return achada ? achada.label : this.SEM;
  },

  // ── Filtro cruzado ────────────────────────────────────────
  /**
   * Lista filtrada. `exceto` é a dimensão que NÃO deve aplicar o próprio
   * filtro.
   *
   * ⚠️ É de propósito, e é o que torna a tela navegável: se o gráfico de
   * Estado aplicasse o filtro de Estado, escolher SP deixaria aquele gráfico
   * com uma barra só e não haveria como ver que Minas vem logo atrás nem
   * trocar para ela sem voltar no dropdown. Assim cada gráfico continua
   * mostrando as alternativas da sua própria dimensão, já recortadas por
   * todos os OUTROS filtros, e a seleção aparece destacada.
   */
  listaPara(exceto = null) {
    return this.leads.filter(lead => {
      if (exceto !== 'periodo') {
        if (this.filtros.ano && lead.ano !== this.filtros.ano) return false;
        if (this.filtros.mes && lead.mesChave !== this.filtros.mes) return false;
      }
      for (const [dim, cfg] of Object.entries(this.DIMENSOES)) {
        if (dim === exceto) continue;
        if (this.filtros[dim] && lead[cfg.campo] !== this.filtros[dim]) return false;
      }
      return true;
    });
  },

  /**
   * Conta uma dimensão. Devolve [{ chave, qtd, valor }], da maior para a menor,
   * com o "(não informado)" sempre no fim, fora da ordenação: ele não disputa
   * ranking com uma categoria de verdade, porque não é uma.
   */
  contar(lista, campo) {
    const mapa = new Map();
    lista.forEach(lead => {
      const chave = lead[campo];
      const atual = mapa.get(chave) || { chave, qtd: 0, valor: 0 };
      atual.qtd += 1;
      atual.valor += lead.valor;
      mapa.set(chave, atual);
    });
    const itens = [...mapa.values()];
    const sem = itens.filter(i => i.chave === this.SEM);
    const comDado = itens.filter(i => i.chave !== this.SEM).sort((a, b) => b.qtd - a.qtd);
    return comDado.concat(sem);
  },

  // ── Render ────────────────────────────────────────────────
  renderizar() {
    this.sincronizarControles();
    this.renderChips();
    this.renderKpis();
    this.renderMensal();
    this.renderDimensao('origem', 'mkt-origem', 'wrap-mkt-origem', { limite: 12 });
    this.renderDimensao('faixa',  'mkt-faixa',  'wrap-mkt-faixa',  { ordinal: true, vertical: true });
    this.renderDimensao('estado', 'mkt-estado', 'wrap-mkt-estado', { limite: 12 });
    this.renderDimensao('cidade', 'mkt-cidade', 'wrap-mkt-cidade', { limite: 10 });
    this.renderDimensao('sexo',   'mkt-sexo',   'wrap-mkt-sexo',   {});
    this.renderDimensao('curso',  'mkt-curso',  'wrap-mkt-curso',  { limite: 12 });
    this.renderCobertura();
  },

  preencherPeriodo() {
    const sel = document.getElementById('mkt-periodo');
    if (!sel) return;
    const anos = [...new Set(this.leads.map(l => l.ano).filter(Boolean))]
      .sort((a, b) => Number(b) - Number(a));
    sel.innerHTML = '<option value="">Todo o período</option>'
      + anos.map(a => `<option value="${a}">${a}</option>`).join('');
    sel.value = this.filtros.ano;
  },

  /** Repovoa os selects de dimensão com as opções que sobram no recorte. */
  sincronizarControles() {
    Object.entries(this.DIMENSOES).forEach(([dim, cfg]) => {
      const sel = document.getElementById(cfg.select);
      if (!sel) return;
      const itens = this.contar(this.listaPara(dim), cfg.campo);
      const selecionado = this.filtros[dim];
      sel.innerHTML = `<option value="">Todos</option>`
        + itens.map(i => `<option value="${escapeHtml(i.chave)}">${escapeHtml(i.chave)} (${i.qtd})</option>`).join('');
      // Uma opção que sumiu do recorte não pode continuar marcada em silêncio:
      // a tela mostraria "filtrando por X" sem nenhum X existir ali.
      sel.value = itens.some(i => i.chave === selecionado) ? selecionado : '';
      if (sel.value !== selecionado) this.filtros[dim] = sel.value;
    });

    const periodo = document.getElementById('mkt-periodo');
    if (periodo) periodo.value = this.filtros.ano;
  },

  renderChips() {
    const cont = document.getElementById('mkt-chips');
    const limpar = document.getElementById('mkt-limpar');
    if (!cont) return;

    const chips = [];
    if (this.filtros.mes) chips.push({ dim: 'mes', rotulo: 'Mês', valor: this.rotuloMes(this.filtros.mes) });
    Object.entries(this.DIMENSOES).forEach(([dim, cfg]) => {
      if (this.filtros[dim]) chips.push({ dim, rotulo: cfg.rotulo, valor: this.filtros[dim] });
    });

    cont.innerHTML = chips.map(c => `
      <button type="button" class="mkt-chip" data-remover="${c.dim}"
              title="Remover o filtro de ${escapeHtml(c.rotulo.toLowerCase())}">
        <span class="mkt-chip-rot">${escapeHtml(c.rotulo)}</span>
        <span class="mkt-chip-val">${escapeHtml(c.valor)}</span>
        <span class="mkt-chip-x" aria-hidden="true">&times;</span>
      </button>
    `).join('');

    // O ano fica fora dos chips porque o próprio select já o mostra, mas conta
    // para habilitar o "Limpar filtros".
    const algum = chips.length > 0 || !!this.filtros.ano;
    if (limpar) limpar.hidden = !algum;
  },

  renderKpis() {
    const cont = document.getElementById('mkt-kpis');
    if (!cont) return;

    const lista = this.listaPara();
    const receita = lista.reduce((s, l) => s + l.valor, 0);

    // O "campeão" de cada dimensão é calculado só sobre quem TEM o dado, e o
    // card diz sobre quantas pessoas ele fala. "O estado que mais compra é
    // (não informado)" seria verdade e não serviria para nada.
    const topo = campo => {
      const comDado = lista.filter(l => l[campo] !== this.SEM);
      if (!comDado.length) return null;
      const itens = this.contar(comDado, campo);
      const primeiro = itens[0];
      return {
        chave: primeiro.chave,
        pct: Math.round((primeiro.qtd / comDado.length) * 100),
        base: comDado.length
      };
    };

    const cards = [
      {
        rotulo: 'Matrículas no recorte',
        valor: String(lista.length),
        nota: receita > 0 ? formatBRL(receita) : 'Sem receita registrada'
      },
      this._cardTopo('Origem principal', topo('origem')),
      this._cardTopo('Faixa etária que mais compra', topo('faixa')),
      this._cardTopo('Estado que mais compra', topo('estado'))
    ];

    cont.innerHTML = cards.map(c => `
      <article class="kpi-card mkt-kpi">
        <span class="mkt-kpi-rot">${escapeHtml(c.rotulo)}</span>
        <strong class="mkt-kpi-val">${escapeHtml(c.valor)}</strong>
        <span class="mkt-kpi-nota">${escapeHtml(c.nota)}</span>
      </article>
    `).join('');
  },

  _cardTopo(rotulo, topo) {
    if (!topo) return { rotulo, valor: '—', nota: 'Sem dado preenchido no recorte' };
    return {
      rotulo,
      valor: topo.chave,
      nota: `${topo.pct}% de ${topo.base} com o dado preenchido`
    };
  },

  rotuloMes(chave) {
    const [ano, mes] = String(chave).split('-');
    const nome = CONFIG.MESES[Number(mes)] || '';
    return `${nome.substring(0, 3)}/${String(ano).slice(-2)}`;
  },

  // ── Gráficos ──────────────────────────────────────────────
  /** Lê uma variável de cor do CSS da página. Ver o cabeçalho do arquivo. */
  _cor(nome) {
    const alvo = document.querySelector('.mkt-page') || document.documentElement;
    return getComputedStyle(alvo).getPropertyValue(nome).trim();
  },

  _rampa() {
    return [1, 2, 3, 4, 5, 6].map(n => this._cor(`--mkt-rampa-${n}`));
  },

  /**
   * Plugin de rótulo em cima da barra.
   *
   * ⚠️ Não é enfeite: o tom das barras fica em 2,4:1 sobre a superfície clara,
   * abaixo do mínimo de 3:1, e a régua diz que contraste baixo obriga rótulo
   * visível ou tabela. O rótulo é o que torna o valor legível sem depender de
   * enxergar a cor, e ainda evita a ida ao tooltip para ler cada número.
   */
  _pluginRotulos() {
    const corRotulo = this._cor('--mkt-rotulo');
    const horizontal = (chart) => chart.options.indexAxis === 'y';
    return {
      id: 'mktRotulos',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        const dados = chart.data.datasets[0]?.data || [];
        const deitado = horizontal(chart);
        ctx.save();
        ctx.font = '600 11px Montserrat, sans-serif';
        ctx.fillStyle = corRotulo;
        meta.data.forEach((barra, i) => {
          const bruto = dados[i];
          if (!bruto) return;
          const texto = chart.$mktFormatarRotulo ? chart.$mktFormatarRotulo(bruto) : String(bruto);
          if (deitado) {
            const largura = ctx.measureText(texto).width;
            // Se não couber depois da ponta, o rótulo entra para dentro da
            // barra. Sem isto ele sai da área do gráfico e some.
            const cabeFora = barra.x + 6 + largura < chart.chartArea.right;
            ctx.textAlign = cabeFora ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(texto, cabeFora ? barra.x + 6 : barra.x - 6, barra.y);
          } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(texto, barra.x, barra.y - 4);
          }
        });
        ctx.restore();
      }
    };
  },

  /**
   * Largura reservada para os nomes das categorias na barra deitada.
   *
   * ⚠️ Fixar isto é o que torna o corte previsível. Deixado por conta do
   * Chart.js, ele decide sozinho um teto e, quando o nome não cabe, corta
   * pela ESQUERDA: medido na tela, "Plataforma Teórico" virava "taforma
   * Teórico", "Piloto Comercial" virava "loto Comercial" e "(não informado)"
   * virava "ão informado)". Não é um nome encurtado, é outro texto.
   */
  _larguraEixoCategoria(chart) {
    return Math.round(Math.min(190, Math.max(84, chart.width * 0.36)));
  },

  /**
   * Encurta o rótulo pelo FIM, com reticências, MEDINDO o texto.
   *
   * ⚠️ Contar caracteres não serve: foi a primeira tentativa e falhou, porque
   * "Plataforma Teórico" e "São José dos Campos" têm contagens parecidas e
   * larguras bem diferentes, e o limite em caracteres que servia a um card de
   * 500px sobrava no de 340px. Quem sabe o que cabe é o measureText da mesma
   * fonte que vai desenhar.
   *
   * O nome inteiro continua no tooltip, pelo callback `title` explícito.
   */
  _encurtarPara(ctx, texto, maxPx) {
    const t = String(texto);
    ctx.save();
    ctx.font = '11px Montserrat, sans-serif';
    if (ctx.measureText(t).width <= maxPx) { ctx.restore(); return t; }
    let corte = t;
    while (corte.length > 1 && ctx.measureText(corte + '…').width > maxPx) {
      corte = corte.slice(0, -1);
    }
    ctx.restore();
    return corte.trimEnd() + '…';
  },

  /** Opções comuns aos gráficos, já com as cores do modo em vigor. */
  _opcoesBase(deitado) {
    const eixo = this._cor('--mkt-eixo');
    const grade = this._cor('--mkt-grade');
    const fonte = { family: 'Montserrat', size: 11 };
    const larguraEixo = chart => this._larguraEixoCategoria(chart);
    const encurtar = (ctx, texto, max) => this._encurtarPara(ctx, texto, max);
    const eixoCategoria = {
      grid: { display: false },
      ticks: {
        font: fonte,
        color: eixo,
        // Sem autoSkip o eixo mostra TODAS as categorias. Numa lista já
        // limitada a 10 ou 12, esconder uma no meio seria pior que apertar.
        autoSkip: false,
        callback(valor) {
          const rotulo = this.getLabelForValue ? this.getLabelForValue(valor) : String(valor);
          if (!deitado) return rotulo;
          // 10px de folga entre o texto e o começo da barra.
          return encurtar(this.chart.ctx, rotulo, larguraEixo(this.chart) - 10);
        }
      },
      // Prende a faixa no mesmo orçamento que o corte acima usou. Sem isto os
      // dois discordariam e o texto encurtado ainda poderia ser clipado.
      afterFit(escala) { if (deitado) escala.width = larguraEixo(escala.chart); }
    };
    const eixoValor = {
      grid: { color: grade, drawBorder: false },
      border: { display: false },
      ticks: { font: { family: 'Montserrat', size: 10 }, color: eixo, precision: 0 }
    };
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: deitado ? 'y' : 'x',
      // Espaço para o rótulo que fica na ponta da barra.
      layout: { padding: deitado ? { right: 30 } : { top: 18 } },
      plugins: {
        legend: { display: false },   // série única: o título do card já a nomeia
        tooltip: {
          backgroundColor: this._cor('--mkt-tooltip-bg'),
          titleColor: this._cor('--mkt-tooltip-texto'),
          bodyColor: this._cor('--mkt-tooltip-texto'),
          padding: 10,
          displayColors: false,
          titleFont: { family: 'Montserrat', size: 12, weight: '600' },
          bodyFont: { family: 'Montserrat', size: 12 }
        }
      },
      scales: deitado
        ? { x: eixoValor, y: eixoCategoria }
        : { x: eixoCategoria, y: eixoValor }
    };
  },

  _destruir(id) {
    if (this.charts[id]) { this.charts[id].destroy(); this.charts[id] = null; }
  },

  /**
   * Devolve o canvas do card, recriando-o quando o card está mostrando a
   * mensagem de vazio. Sem isto, o gráfico nunca volta depois de um recorte
   * que zerou, porque o canvas foi substituído pelo texto.
   */
  _canvas(idWrap, idCanvas) {
    const wrap = document.getElementById(idWrap);
    if (!wrap) return null;
    let canvas = wrap.querySelector('canvas');
    if (!canvas) {
      wrap.classList.remove('mkt-chart-vazio');
      wrap.innerHTML = `<canvas id="${idCanvas}"></canvas>`;
      canvas = wrap.querySelector('canvas');
    }
    return canvas;
  },

  _vazio(idWrap, idCanvas, mensagem) {
    this._destruir(idCanvas);
    const wrap = document.getElementById(idWrap);
    if (!wrap) return;
    wrap.classList.add('mkt-chart-vazio');
    wrap.innerHTML = `<p class="mkt-vazio">${escapeHtml(mensagem)}</p>`;
  },

  /**
   * Meses do recorte. Quando há ano escolhido, mostra os 12 meses dele; senão,
   * todos os meses com venda, limitados aos 24 últimos para as barras não
   * virarem tiras ilegíveis.
   */
  _mesesDoRecorte(lista) {
    if (this.filtros.ano) {
      return Array.from({ length: 12 }, (_, i) => `${this.filtros.ano}-${String(i + 1).padStart(2, '0')}`);
    }
    const chaves = [...new Set(lista.map(l => l.mesChave).filter(Boolean))].sort();
    return chaves.slice(-24);
  },

  renderMensal() {
    const lista = this.listaPara('periodo');
    const meses = this._mesesDoRecorte(lista);
    const sub = document.getElementById('mkt-mensal-sub');
    if (sub) {
      sub.textContent = this.metricaMensal === 'valor'
        ? 'Receita por mês. Clique numa barra para filtrar por aquele mês.'
        : 'Matrículas por mês. Clique numa barra para filtrar por aquele mês.';
    }

    if (!meses.length) {
      this._vazio('wrap-mkt-mensal', 'mkt-mensal', 'Nenhuma venda no recorte selecionado.');
      return;
    }

    const porMes = new Map(meses.map(m => [m, { qtd: 0, valor: 0 }]));
    lista.forEach(lead => {
      const alvo = porMes.get(lead.mesChave);
      if (!alvo) return;
      alvo.qtd += 1;
      alvo.valor += lead.valor;
    });

    const usaValor = this.metricaMensal === 'valor';
    const dados = meses.map(m => usaValor ? porMes.get(m).valor : porMes.get(m).qtd);
    const base = this._cor('--mkt-serie');
    const selecionado = this.filtros.mes;

    const canvas = this._canvas('wrap-mkt-mensal', 'mkt-mensal');
    if (!canvas) return;
    this._destruir('mkt-mensal');

    const opcoes = this._opcoesBase(false);
    opcoes.plugins.tooltip.callbacks = {
      title: itens => this.rotuloMes(meses[itens[0].dataIndex]),
      label: item => usaValor
        ? formatBRL(item.parsed.y)
        : `${item.parsed.y} ${item.parsed.y === 1 ? 'matrícula' : 'matrículas'}`
    };
    opcoes.onClick = (_evento, elementos) => {
      if (!elementos.length) return;
      const chave = meses[elementos[0].index];
      // Clicar no mês já selecionado desfaz o filtro, que é o que a dica na
      // tela promete.
      this.filtros.mes = this.filtros.mes === chave ? '' : chave;
      this.renderizar();
    };
    opcoes.onHover = (evento, elementos) => {
      evento.native.target.style.cursor = elementos.length ? 'pointer' : 'default';
    };

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: meses.map(m => this.rotuloMes(m)),
        datasets: [{
          data: dados,
          backgroundColor: meses.map(m => this._pintar(base, !selecionado || m === selecionado)),
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 42
        }]
      },
      options: opcoes,
      plugins: [this._pluginRotulos()]
    });
    chart.$mktFormatarRotulo = v => usaValor ? this._valorCurto(v) : String(v);
    this.charts['mkt-mensal'] = chart;
  },

  /**
   * Desenha uma dimensão como barra.
   *
   * `ordinal: true` liga a rampa de um matiz só (faixa etária): trocar a ordem
   * das faixas mudaria o sentido, então a cor carrega a ordem. As demais são
   * nominais e ficam de uma cor só.
   */
  renderDimensao(dim, idCanvas, idWrap, { limite = 0, ordinal = false, vertical = false } = {}) {
    const cfg = this.DIMENSOES[dim];
    const lista = this.listaPara(dim);
    let itens = this.contar(lista, cfg.campo);

    if (ordinal) {
      // A ordem é a das faixas, não a do ranking.
      const ordem = this.FAIXAS.map(f => f.label).concat(this.SEM);
      itens = ordem
        .map(label => itens.find(i => i.chave === label))
        .filter(Boolean);
    } else if (limite && itens.length > limite) {
      // O "(não informado)" nunca é cortado pelo limite: ele é o aviso de que
      // falta dado, e é justamente nele que o corte bateria primeiro se ficasse
      // no fim de uma lista longa.
      const sem = itens.filter(i => i.chave === this.SEM);
      const comDado = itens.filter(i => i.chave !== this.SEM);
      itens = comDado.slice(0, limite).concat(sem);
    }

    if (!itens.length) {
      this._vazio(idWrap, idCanvas, 'Sem dado neste recorte.');
      return;
    }

    const deitado = !vertical;
    const selecionado = this.filtros[dim];
    const rampa = this._rampa();
    const base = this._cor('--mkt-serie');
    const neutro = this._cor('--mkt-sem-dado');

    const cores = itens.map((item, i) => {
      // O "(não informado)" é cinza de propósito: ele não é uma categoria, é a
      // ausência de uma. Pintado com a cor da série, entraria no gráfico
      // parecendo mais um valor real.
      if (item.chave === this.SEM) return this._pintar(neutro, !selecionado || item.chave === selecionado);
      const cor = ordinal ? rampa[Math.min(i, rampa.length - 1)] : base;
      return this._pintar(cor, !selecionado || item.chave === selecionado);
    });

    const canvas = this._canvas(idWrap, idCanvas);
    if (!canvas) return;
    this._destruir(idCanvas);

    const total = itens.reduce((s, i) => s + i.qtd, 0);
    const opcoes = this._opcoesBase(deitado);
    opcoes.plugins.tooltip.callbacks = {
      // Explícito de propósito: é aqui que o nome INTEIRO aparece quando o
      // eixo teve que encurtá-lo. Ver _encurtar.
      title: tips => itens[tips[0].dataIndex].chave,
      label: item => {
        const it = itens[item.dataIndex];
        const pct = total ? Math.round((it.qtd / total) * 100) : 0;
        const plural = it.qtd === 1 ? 'matrícula' : 'matrículas';
        return [`${it.qtd} ${plural} (${pct}%)`, formatBRL(it.valor)];
      }
    };
    opcoes.onClick = (_evento, elementos) => {
      if (!elementos.length) return;
      const chave = itens[elementos[0].index].chave;
      this.filtros[dim] = this.filtros[dim] === chave ? '' : chave;
      this.renderizar();
    };
    opcoes.onHover = (evento, elementos) => {
      evento.native.target.style.cursor = elementos.length ? 'pointer' : 'default';
    };

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: itens.map(i => i.chave),
        datasets: [{
          data: itens.map(i => i.qtd),
          backgroundColor: cores,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: deitado ? 26 : 42
        }]
      },
      options: opcoes,
      plugins: [this._pluginRotulos()]
    });
    chart.$mktFormatarRotulo = v => String(v);
    this.charts[idCanvas] = chart;
  },

  /**
   * Aplica o esmaecido de quem não está selecionado.
   *
   * ⚠️ O destaque é feito por OPACIDADE, não por uma segunda cor. Duas cores
   * lado a lado teriam que passar no piso de separação (ΔE 15 em visão normal)
   * e a paleta SAFE não tem esse par: o azul e o teal ficam a 8,3, medido.
   * Opacidade não depende de distinguir matiz, e a seleção ainda aparece no
   * chip e no dropdown, então nunca é a cor sozinha carregando a informação.
   */
  _pintar(cor, ativo) {
    if (ativo) return cor;
    return this._comAlfa(cor, 0.28);
  },

  _comAlfa(cor, alfa) {
    const hex = String(cor).trim().replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return cor;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alfa})`;
  },

  _valorCurto(v) {
    if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (v >= 1000) return 'R$ ' + Math.round(v / 1000) + 'k';
    return 'R$ ' + Math.round(v);
  },

  // ── Cobertura ─────────────────────────────────────────────
  /**
   * Quanto de cada campo está preenchido no recorte.
   *
   * ⚠️ Isto é parte do resultado, não um extra. Um gráfico de faixa etária
   * montado sobre 30% da base é visualmente idêntico a um montado sobre 100%,
   * e a decisão de mídia que sai dele custa dinheiro. Este bloco é o que
   * impede alguém de confiar num corte que quase não tem gente por trás.
   */
  renderCobertura() {
    const cont = document.getElementById('mkt-cobertura');
    if (!cont) return;
    const lista = this.listaPara();
    if (!lista.length) {
      cont.innerHTML = '<p class="mkt-vazio">Sem matrículas no recorte selecionado.</p>';
      return;
    }

    const campos = [
      { campo: 'origem', rotulo: 'Origem do lead' },
      { campo: 'estado', rotulo: 'Estado' },
      { campo: 'cidade', rotulo: 'Cidade' },
      { campo: 'faixa',  rotulo: 'Data de nascimento' },
      { campo: 'sexo',   rotulo: 'Sexo' },
      { campo: 'curso',  rotulo: 'Curso' }
    ];

    cont.innerHTML = campos.map(c => {
      const preenchidos = lista.filter(l => l[c.campo] !== this.SEM).length;
      const pct = Math.round((preenchidos / lista.length) * 100);
      // Os limites existem para a barra dizer sozinha se dá para confiar:
      // abaixo de 50% o corte fala por menos da metade das pessoas.
      const tom = pct >= 80 ? 'ok' : (pct >= 50 ? 'aviso' : 'baixo');
      return `
        <div class="mkt-cob-item">
          <div class="mkt-cob-topo">
            <span class="mkt-cob-rot">${escapeHtml(c.rotulo)}</span>
            <span class="mkt-cob-pct">${pct}%</span>
          </div>
          <div class="mkt-cob-trilho">
            <div class="mkt-cob-barra is-${tom}" style="width:${pct}%"></div>
          </div>
          <span class="mkt-cob-nota">${preenchidos} de ${lista.length} preenchidos</span>
        </div>
      `;
    }).join('');
  },

  renderAtualizadoEm() {
    const pill = document.getElementById('mkt-atualizado');
    const label = document.getElementById('mkt-atualizado-label');
    if (!pill || !label) return;
    if (!this.geradoEm) { pill.hidden = true; return; }
    const d = new Date(this.geradoEm);
    if (Number.isNaN(d.getTime())) { pill.hidden = true; return; }
    label.textContent = `Dados de ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    pill.classList.add('is-ok');
    pill.hidden = false;
  },

  setLoading(ativo) {
    const overlay = document.getElementById('mkt-loading');
    if (overlay) overlay.classList.toggle('active', !!ativo);
  }
};

document.addEventListener('DOMContentLoaded', () => Marketing.iniciar());
