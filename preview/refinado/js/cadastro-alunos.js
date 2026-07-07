// ============================================================
// cadastro-alunos.js — Fila S141 + Trello
// SAFE Hub
// ============================================================

const CadastroAlunos = {
  alunos: [],
  filtro: 'ativos',
  ordenacao: 'matricula_desc',

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
        this.renderizar();
      });
    });

    document.getElementById('cadastro-alunos-tbody')?.addEventListener('click', evento => {
      const botao = evento.target.closest('[data-acao]');
      if (!botao) return;
      this.executarAcao(botao.dataset.acao, botao.dataset.id, botao);
    });
  },

  fecharMenusAcao(menuAtual = null) {
    document.querySelectorAll('.cadastro-action-menu.open').forEach(menu => {
      if (menu !== menuAtual) menu.classList.remove('open');
    });
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

  renderizar() {
    this.atualizarResumo();
    const tbody = document.getElementById('cadastro-alunos-tbody');
    const subtitle = document.getElementById('cadastro-lista-subtitle');
    if (!tbody) return;

    const lista = this.ordenarAlunos(this.alunosFiltrados());
    if (subtitle) subtitle.textContent = `${lista.length} aluno(s) exibido(s) de ${this.alunos.length}.`;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px">Nenhum aluno encontrado para este filtro.</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(aluno => this.renderLinha(aluno)).join('');
  },

  renderLinha(aluno) {
    const meta = this.statusMeta[aluno.status] || { label: aluno.status || '—' };
    const curso = aluno.cursoOperacional || aluno.curso || '—';
    const base = aluno.baseTrello || aluno.base || '—';
    const obs = aluno.observacao ? `<small>${escapeHtml(aluno.observacao)}</small>` : '';
    return `
      <tr>
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
      menu?.classList.toggle('open', abrir);
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
  }
};

document.addEventListener('DOMContentLoaded', () => CadastroAlunos.iniciar());
