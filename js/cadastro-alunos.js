// ============================================================
// cadastro-alunos.js — Fila S141 + Trello
// SAFE Hub
// ============================================================

const CadastroAlunos = {
  alunos: [],
  filtro: 'ativos',
  ordenacao: 'matricula_desc',
  selecionados: new Set(),

  statusMeta: {
    pendente_s141: { label: 'Pendente S141' },
    pronto_trello: { label: 'Pronto Trello' },
    concluido: { label: 'Concluído' },
    concluido_legado: { label: 'Concluído legado' },
    nao_elegivel_s141: { label: 'Não elegível S141' },
    novo_curso: { label: 'Novo curso' },
    reativado: { label: 'Reativado' },
    atencao: { label: 'Atenção' },
    inativo: { label: 'Inativo' }
  },

  async iniciar() {
    if (!Auth.protegerCadastroAlunos()) return;
    Auth.preencherUI();
    this.vincularEventos();
    await this.carregar();
  },

  setCarregando(ativo, texto = 'Processando alunos...') {
    const overlay = document.getElementById('cadastro-loading');
    const label = document.getElementById('cadastro-loading-text');
    if (label) label.textContent = texto;
    overlay?.classList.toggle('active', ativo);
  },

  vincularEventos() {
    document.getElementById('btn-recarregar-alunos')?.addEventListener('click', () => this.carregar(true));
    document.getElementById('arquivo-cavok')?.addEventListener('change', evento => this.importarArquivo(evento));
    document.getElementById('cadastro-busca')?.addEventListener('input', () => this.renderizar());
    document.getElementById('cadastro-ordenacao')?.addEventListener('change', evento => {
      this.ordenacao = evento.target.value || 'matricula_desc';
      this.renderizar();
    });
    document.addEventListener('click', evento => {
      if (!evento.target.closest('.cadastro-action-menu')) this.fecharMenusAcao();
    });

    document.querySelectorAll('.cadastro-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.filtro = tab.dataset.filtro;
        document.querySelectorAll('.cadastro-tab').forEach(item => item.classList.toggle('active', item === tab));
        this.selecionados.clear();
        this.renderizar();
      });
    });

    document.getElementById('cadastro-alunos-tbody')?.addEventListener('click', evento => {
      const botao = evento.target.closest('[data-acao]');
      if (!botao) return;
      this.executarAcao(botao.dataset.acao, botao.dataset.id, botao);
    });

    document.getElementById('cadastro-alunos-tbody')?.addEventListener('change', evento => {
      const check = evento.target.closest('.cadastro-row-check');
      if (!check) return;
      if (check.checked) this.selecionados.add(check.dataset.id);
      else this.selecionados.delete(check.dataset.id);
      this.atualizarSelecao();
    });

    document.getElementById('cadastro-check-all')?.addEventListener('change', evento => {
      const marcar = evento.target.checked;
      this.selecionados.clear();
      if (marcar) {
        this.ordenarAlunos(this.alunosFiltrados()).forEach(aluno => this.selecionados.add(String(aluno.id)));
      }
      this.renderizar();
    });

    document.getElementById('cadastro-bulk-limpar')?.addEventListener('click', () => {
      this.selecionados.clear();
      this.renderizar();
    });

    document.getElementById('cadastro-bulk-sync')?.addEventListener('click', () => this.sincronizarSelecionados());
  },

  fecharMenusAcao(menuAtual = null) {
    document.querySelectorAll('.cadastro-action-menu.open').forEach(menu => {
      if (menu !== menuAtual) {
        menu.classList.remove('open');
        menu.classList.remove('drop-up');
      }
    });
  },

  // Abre o popover para cima quando não cabe abaixo do gatilho (última linha da tabela).
  // Quem corta é o .table-wrapper (overflow) e/ou a janela — mede contra o menor dos dois.
  posicionarMenuAcao(menu, gatilho) {
    const popover = menu.querySelector('.cadastro-action-popover');
    if (!popover) return;
    const rect = gatilho.getBoundingClientRect();
    const alturaPopover = popover.offsetHeight; // já visível: .open foi aplicado antes

    const wrapper = menu.closest('.table-wrapper');
    const limiteInferior = wrapper
      ? Math.min(window.innerHeight, wrapper.getBoundingClientRect().bottom)
      : window.innerHeight;
    const limiteSuperior = wrapper
      ? Math.max(0, wrapper.getBoundingClientRect().top)
      : 0;

    const espacoAbaixo = limiteInferior - rect.bottom;
    const espacoAcima = rect.top - limiteSuperior;
    if (espacoAbaixo < alturaPopover + 16 && espacoAcima > espacoAbaixo) {
      menu.classList.add('drop-up');
    }
  },

  async carregar(mostrarToast = false) {
    this.setCarregando(true, 'Carregando alunos...');
    try {
      const res = await API.getCadastroAlunos();
      if (!res.ok) throw new Error(res.error || 'Não foi possível carregar alunos.');
      this.alunos = res.data?.alunos || [];
      this.renderizar();
      if (mostrarToast) toast('Lista atualizada.', 'success');
    } catch (erro) {
      console.error('[Cadastro Alunos]', erro);
      toast(erro.message || 'Erro ao carregar alunos.', 'error', 5000);
    } finally {
      this.setCarregando(false);
    }
  },

  async importarArquivo(evento) {
    const input = evento.target;
    const arquivo = input.files?.[0];
    if (!arquivo) return;

    if (typeof XLSX === 'undefined') {
      toast('Biblioteca de leitura XLS não carregada.', 'error');
      input.value = '';
      return;
    }

    this.setCarregando(true, 'Importando XLS do CAVOK...');
    try {
      const buffer = await arquivo.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!linhas.length) throw new Error('O arquivo não possui linhas para importar.');

      const res = await API.importarCadastroAlunos(linhas);
      if (!res.ok) throw new Error(res.error || 'Não foi possível importar o XLS.');

      this.alunos = res.data?.alunos || [];
      this.renderResumoImportacao(res.data?.resumo || {});
      this.renderizar();
      toast('Importação aplicada com sucesso.', 'success', 5000);
    } catch (erro) {
      console.error('[Importação CAVOK]', erro);
      toast(erro.message || 'Erro ao importar XLS do CAVOK.', 'error', 6000);
    } finally {
      input.value = '';
      this.setCarregando(false);
    }
  },

  renderResumoImportacao(resumo) {
    const card = document.getElementById('cadastro-import-card');
    const box = document.getElementById('cadastro-import-summary');
    if (!card || !box) return;
    const itens = [
      ['Lidas', resumo.lidas || 0],
      ['Novos', resumo.novos || 0],
      ['Já importados', resumo.existentes || 0],
      ['Reativados', resumo.reativados || 0],
      ['Novos cursos', resumo.novosCursos || 0],
      ['Não elegíveis', resumo.naoElegiveis || 0],
      ['Atenção', resumo.atencoes || 0]
    ];
    box.innerHTML = itens
      .map(([label, valor]) => `<span class="cadastro-import-pill">${escapeHtml(label)} <strong>${valor}</strong></span>`)
      .join('');
    card.hidden = false;
  },

  contagens() {
    const porStatus = status => this.alunos.filter(aluno => aluno.status === status).length;
    const ativos = this.alunos.filter(aluno => aluno.status !== 'inativo').length;
    const pendentes = this.alunos.filter(aluno =>
      ['pendente_s141', 'novo_curso', 'reativado'].includes(aluno.status)
    ).length;
    const trello = porStatus('pronto_trello');
    const concluidos = porStatus('concluido') + porStatus('concluido_legado');
    const atencao = porStatus('atencao');
    const inativos = porStatus('inativo');
    return { ativos, pendentes, trello, concluidos, atencao, inativos };
  },

  atualizarResumo() {
    const c = this.contagens();
    const setTexto = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    };
    setTexto('count-ativos', c.ativos);
    setTexto('count-pendentes', c.pendentes);
    setTexto('count-trello', c.trello);
    setTexto('count-concluidos', c.concluidos);
    setTexto('count-atencao', c.atencao);
    setTexto('count-inativos', c.inativos);
  },

  alunosFiltrados() {
    const busca = String(document.getElementById('cadastro-busca')?.value || '').trim().toLowerCase();
    return this.alunos.filter(aluno => {
      if (this.filtro === 'ativos' && aluno.status === 'inativo') return false;
      if (this.filtro === 'pendentes' && !['pendente_s141', 'novo_curso', 'reativado'].includes(aluno.status)) return false;
      if (this.filtro === 'trello' && aluno.status !== 'pronto_trello') return false;
      if (this.filtro === 'concluidos' && !['concluido', 'concluido_legado'].includes(aluno.status)) return false;
      if (this.filtro === 'atencao' && aluno.status !== 'atencao') return false;
      if (this.filtro === 'inativos' && aluno.status !== 'inativo') return false;

      if (!busca) return true;
      return [
        aluno.nome,
        aluno.matricula,
        aluno.cpf,
        aluno.curso,
        aluno.cursoOperacional,
        aluno.base
      ].join(' ').toLowerCase().includes(busca);
    });
  },

  ordenarAlunos(lista) {
    const ordenadores = {
      matricula_desc: (a, b) => this.numeroMatricula(b) - this.numeroMatricula(a) || this.compararTexto(a.nome, b.nome),
      matricula_asc: (a, b) => this.numeroMatricula(a) - this.numeroMatricula(b) || this.compararTexto(a.nome, b.nome),
      nome_asc: (a, b) => this.compararTexto(a.nome, b.nome),
      data_desc: (a, b) => this.valorData(b.dataMatricula) - this.valorData(a.dataMatricula) || this.numeroMatricula(b) - this.numeroMatricula(a),
      status_asc: (a, b) => this.compararTexto(this.statusMeta[a.status]?.label || a.status, this.statusMeta[b.status]?.label || b.status)
    };
    return [...lista].sort(ordenadores[this.ordenacao] || ordenadores.matricula_desc);
  },

  numeroMatricula(aluno) {
    const numero = Number(String(aluno?.matricula || '').replace(/\D/g, ''));
    return Number.isFinite(numero) ? numero : 0;
  },

  valorData(valor) {
    const texto = String(valor || '').trim();
    const partesBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (partesBr) return new Date(Number(partesBr[3]), Number(partesBr[2]) - 1, Number(partesBr[1])).getTime();
    const data = new Date(texto);
    const tempo = data.getTime();
    return Number.isFinite(tempo) ? tempo : 0;
  },

  compararTexto(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
  },

  // Seleção em massa só faz sentido na aba "Prontos Trello" (sincronizar em lote).
  selecaoAtiva() {
    return this.filtro === 'trello';
  },

  renderizar() {
    this.atualizarResumo();
    const tbody = document.getElementById('cadastro-alunos-tbody');
    const subtitle = document.getElementById('cadastro-lista-subtitle');
    if (!tbody) return;

    const lista = this.ordenarAlunos(this.alunosFiltrados());
    if (subtitle) subtitle.textContent = `${lista.length} aluno(s) exibido(s) de ${this.alunos.length}.`;

    // Fora da aba com seleção, nada fica selecionado. Dentro, descarta ids que saíram da lista.
    if (!this.selecaoAtiva()) {
      this.selecionados.clear();
    } else {
      const idsVisiveis = new Set(lista.map(aluno => String(aluno.id)));
      [...this.selecionados].forEach(id => { if (!idsVisiveis.has(id)) this.selecionados.delete(id); });
    }

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:32px">Nenhum aluno encontrado para este filtro.</td></tr>';
    } else {
      tbody.innerHTML = lista.map(aluno => this.renderLinha(aluno)).join('');
    }

    this.atualizarSelecao();
  },

  atualizarSelecao() {
    const card = document.getElementById('cadastro-fila-card');
    const barra = document.getElementById('cadastro-bulk-bar');
    const contador = document.getElementById('cadastro-bulk-count');
    const checkAll = document.getElementById('cadastro-check-all');
    const ativa = this.selecaoAtiva();

    card?.classList.toggle('mostrar-selecao', ativa);

    const total = this.selecionados.size;
    if (contador) contador.textContent = total;
    if (barra) barra.hidden = !(ativa && total > 0);

    if (checkAll) {
      const visiveis = this.ordenarAlunos(this.alunosFiltrados()).length;
      checkAll.checked = ativa && visiveis > 0 && total === visiveis;
      checkAll.indeterminate = ativa && total > 0 && total < visiveis;
    }
  },

  renderLinha(aluno) {
    const meta = this.statusMeta[aluno.status] || { label: aluno.status || '—' };
    const curso = aluno.cursoOperacional || aluno.curso || '—';
    const base = aluno.baseTrello || aluno.base || '—';
    const obs = aluno.observacao ? `<small>${escapeHtml(aluno.observacao)}</small>` : '';
    const selecionado = this.selecionados.has(String(aluno.id)) ? 'checked' : '';
    return `
      <tr>
        <td class="cadastro-col-check" data-label="">
          <input type="checkbox" class="cadastro-row-check" data-id="${escapeHtml(aluno.id)}" aria-label="Selecionar aluno" ${selecionado}>
        </td>
        <td data-label="Matrícula">
          <strong>${escapeHtml(aluno.matricula || '—')}</strong>
        </td>
        <td class="cadastro-aluno-cell" data-label="Aluno">
          <strong>${escapeHtml(aluno.nome || 'Aluno sem nome')}</strong>
          <small>${escapeHtml(aluno.email || 'sem e-mail')}</small>
        </td>
        <td data-label="CPF">
          ${this.renderCpf(aluno)}
        </td>
        <td data-label="Curso">
          <strong>${escapeHtml(curso)}</strong>
          <span class="cadastro-muted">${escapeHtml(aluno.curso || '')}</span>
        </td>
        <td data-label="Base">${escapeHtml(base)}</td>
        <td data-label="Data matrícula">${escapeHtml(aluno.dataMatricula || '—')}</td>
        <td data-label="Status">
          <span class="cadastro-status ${escapeHtml(aluno.status || '')}">${escapeHtml(meta.label)}</span>
          ${obs}
        </td>
        <td data-label="Ações">
          <div class="cadastro-actions">${this.renderAcoes(aluno)}</div>
        </td>
      </tr>
    `;
  },

  renderAcoes(aluno) {
    if (aluno.status === 'inativo') {
      return `<button class="btn btn-primary" data-acao="reativar" data-id="${escapeHtml(aluno.id)}">Reativar</button>`;
    }

    const principal = this.renderAcaoPrincipal(aluno);
    const itensMenu = this.renderItensMenuAcao(aluno);
    return `
      ${principal}
      <div class="cadastro-action-menu">
        <button class="btn btn-ghost cadastro-menu-trigger" type="button" data-acao="menu-acoes" data-id="${escapeHtml(aluno.id)}" aria-label="Mais ações">...</button>
        <div class="cadastro-action-popover">
          ${itensMenu}
        </div>
      </div>
    `;
  },

  renderCpf(aluno) {
    const cpf = aluno.cpfFormatado || aluno.cpf || '';
    if (!cpf) return '—';
    return `<button class="cadastro-cpf-button" type="button" data-acao="copiar-cpf" data-id="${escapeHtml(aluno.id)}" title="Copiar CPF">${escapeHtml(cpf)}</button>`;
  },

  renderAcaoPrincipal(aluno) {
    if (['pendente_s141', 'novo_curso', 'reativado'].includes(aluno.status)) {
      return `<button class="btn btn-primary" data-acao="marcar-s141" data-id="${escapeHtml(aluno.id)}">Marcar S141</button>`;
    }
    if (aluno.status === 'pronto_trello') {
      return `<button class="btn btn-primary" data-acao="sync-trello" data-id="${escapeHtml(aluno.id)}">Sincronizar</button>`;
    }
    if (aluno.trelloUrl) {
      return `<a class="btn btn-primary" href="${escapeHtml(aluno.trelloUrl)}" target="_blank" rel="noopener noreferrer">Abrir Trello</a>`;
    }
    return '';
  },

  renderItensMenuAcao(aluno) {
    const itens = [];
    if (aluno.cpf) {
      itens.push(`<button type="button" data-acao="copiar-cpf" data-id="${escapeHtml(aluno.id)}">Copiar CPF</button>`);
    }
    itens.push(`<button type="button" data-acao="inativar" data-id="${escapeHtml(aluno.id)}">Inativar</button>`);
    return itens.join('');
  },

  alunoPorId(id) {
    return this.alunos.find(aluno => String(aluno.id) === String(id));
  },

  async executarAcao(acao, id, botao) {
    const aluno = this.alunoPorId(id);
    if (!aluno) return;

    if (acao === 'menu-acoes') {
      const menu = botao.closest('.cadastro-action-menu');
      const abrir = !menu?.classList.contains('open');
      this.fecharMenusAcao(menu);
      if (menu) {
        menu.classList.remove('drop-up');
        menu.classList.toggle('open', abrir);
        if (abrir) this.posicionarMenuAcao(menu, botao);
      }
      return;
    }

    if (acao === 'copiar-cpf') {
      await navigator.clipboard?.writeText(aluno.cpf || '');
      toast('CPF copiado.', 'success');
      this.fecharMenusAcao();
      return;
    }

    if (acao === 'inativar' && !window.confirm(`Inativar ${aluno.nome}?`)) return;
    if (acao === 'reativar' && !window.confirm(`Reativar ${aluno.nome}?`)) return;

    this.fecharMenusAcao();
    btnLoading(botao, true);
    try {
      const chamadas = {
        'marcar-s141': () => API.marcarS141CadastroAluno(id),
        'sync-trello': () => API.sincronizarTrelloCadastroAluno(id),
        inativar: () => API.inativarCadastroAluno(id),
        reativar: () => API.reativarCadastroAluno(id)
      };
      const res = await chamadas[acao]();
      if (!res.ok) throw new Error(res.error || 'Não foi possível executar a ação.');
      this.alunos = res.data?.alunos || this.alunos;
      this.renderizar();

      const msg = res.data?.mensagem || 'Ação concluída.';
      const url = res.data?.url;
      toast(url
        ? `${escapeHtml(msg)} <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir cartão</a>`
        : escapeHtml(msg),
        'success',
        6500
      );
    } catch (erro) {
      console.error('[Cadastro Alunos ação]', erro);
      toast(erro.message || 'Erro ao executar ação.', 'error', 6000);
    } finally {
      btnLoading(botao, false);
    }
  },

  async sincronizarSelecionados() {
    const ids = [...this.selecionados];
    if (!ids.length) return;
    if (!window.confirm(`Sincronizar ${ids.length} aluno(s) selecionado(s) com o Trello?`)) return;

    this.fecharMenusAcao();
    // O Apps Script serializa cada chamada e devolve a lista completa — roda sequencial
    // para evitar corridas de estado no servidor.
    let sucesso = 0;
    let falhas = 0;
    this.setCarregando(true, `Sincronizando 0/${ids.length}...`);
    try {
      for (let i = 0; i < ids.length; i++) {
        this.setCarregando(true, `Sincronizando ${i + 1}/${ids.length}...`);
        try {
          const res = await API.sincronizarTrelloCadastroAluno(ids[i]);
          if (!res.ok) throw new Error(res.error || 'Falha ao sincronizar.');
          this.alunos = res.data?.alunos || this.alunos;
          sucesso++;
        } catch (erro) {
          console.error('[Cadastro Alunos sync massa]', ids[i], erro);
          falhas++;
        }
      }
      this.selecionados.clear();
      this.renderizar();
      if (falhas) {
        toast(`${sucesso} sincronizado(s), ${falhas} com erro. Verifique os que restaram na aba.`, 'error', 7000);
      } else {
        toast(`${sucesso} aluno(s) sincronizado(s) com o Trello.`, 'success', 6000);
      }
    } finally {
      this.setCarregando(false);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => CadastroAlunos.iniciar());
