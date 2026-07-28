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
    const clt = this.instrutores.filter(
      instrutor => String(instrutor.tipo || '').trim().toLowerCase() === 'clt'
    ).length;
    const liberados = this.instrutores.filter(i => this.temFlagVerde(i)).length;

    document.getElementById('kpi-instrutores').textContent = this.instrutores.length;
    document.getElementById('kpi-horas').textContent = `${this.formatarHoras(totalHoras)}h`;
    document.getElementById('kpi-clt').textContent = clt;
    document.getElementById('kpi-eventuais').textContent = this.instrutores.length - clt;
    document.getElementById('kpi-liberados').textContent = liberados;
  },

  linhaInstrutor(instrutor, base) {
    const outra = this.bases.find(b => b !== base) || base;
    const horas = this.horasDe(instrutor);
    const tipo = String(instrutor.tipo || 'Não informado');
    const classeTipo = tipo.trim().toLowerCase() === 'clt' ? 'clt' : 'eventual';
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
            <span class="horas-inva-badge ${classeTipo}">${this.escape(tipo)}</span>
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
      const visiveis = daBase.filter(i =>
        String(i.nome || '').toLocaleLowerCase('pt-BR').includes(termo)
      );
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
      this.renderizarTudo();
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
      tipo: document.getElementById('instrutor-tipo').value,
      base: document.getElementById('instrutor-base').value,
      saldoInicial: Number.isFinite(saldoBruto) ? saldoBruto : 0
    };
    if (!dados.nome || !dados.tipo || !dados.base) {
      toast('Preencha o nome, o tipo e a base do instrutor.', 'warning');
      return;
    }

    botao.disabled = true;
    try {
      const resultado = await this.enviar('add_instructor', dados);
      if (resultado.status !== 'success') {
        throw new Error(resultado.message || 'Não foi possível cadastrar o instrutor.');
      }
      formulario?.reset();
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
      const liberar = evento.target.closest('.hi-liberar');
      if (!liberar) return;
      const item = liberar.closest('.hi-item');
      if (item) this.abrirLiberacao(item.dataset.nome, liberar.dataset.liberar === 'remover');
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
    this.vincularEventos();
    await this.carregarDados();
  }
};

HorasVoadasInva.iniciar();
