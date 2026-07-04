// ============================================================
// cadastro-alunos.js — Fila S141 + Trello
// SAFE Hub
// ============================================================

const CadastroAlunos = {
  alunos: [],
  filtro: 'ativos',

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
    document.getElementById('kpi-pendentes').textContent = c.pendentes;
    document.getElementById('kpi-prontos').textContent = c.trello;
    document.getElementById('kpi-concluidos').textContent = c.concluidos;
    document.getElementById('kpi-atencao').textContent = c.atencao;
    document.getElementById('count-ativos').textContent = c.ativos;
    document.getElementById('count-pendentes').textContent = c.pendentes;
    document.getElementById('count-trello').textContent = c.trello;
    document.getElementById('count-concluidos').textContent = c.concluidos;
    document.getElementById('count-atencao').textContent = c.atencao;
    document.getElementById('count-inativos').textContent = c.inativos;
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
        aluno.cpf,
        aluno.curso,
        aluno.cursoOperacional,
        aluno.base
      ].join(' ').toLowerCase().includes(busca);
    });
  },

  renderizar() {
    this.atualizarResumo();
    const tbody = document.getElementById('cadastro-alunos-tbody');
    const subtitle = document.getElementById('cadastro-lista-subtitle');
    if (!tbody) return;

    const lista = this.alunosFiltrados();
    if (subtitle) subtitle.textContent = `${lista.length} aluno(s) exibido(s) de ${this.alunos.length}.`;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:32px">Nenhum aluno encontrado para este filtro.</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(aluno => this.renderLinha(aluno)).join('');
  },

  renderLinha(aluno) {
    const meta = this.statusMeta[aluno.status] || { label: aluno.status || '—' };
    const curso = aluno.cursoOperacional || aluno.curso || '—';
    const base = aluno.baseTrello || aluno.base || '—';
    const obs = aluno.observacao ? `<small>${escapeHtml(aluno.observacao)}</small>` : '';
    const trello = aluno.trelloUrl
      ? `<small><a href="${escapeHtml(aluno.trelloUrl)}" target="_blank" rel="noopener noreferrer">Abrir Trello</a></small>`
      : '';
    return `
      <tr>
        <td class="cadastro-aluno-cell" data-label="Aluno">
          <strong>${escapeHtml(aluno.nome || 'Aluno sem nome')}</strong>
          <small>Matrícula ${escapeHtml(aluno.matricula || '—')} · ${escapeHtml(aluno.email || 'sem e-mail')}</small>
        </td>
        <td data-label="CPF">${escapeHtml(aluno.cpfFormatado || aluno.cpf || '—')}</td>
        <td data-label="Curso">
          <strong>${escapeHtml(curso)}</strong>
          <span class="cadastro-muted">${escapeHtml(aluno.curso || '')}</span>
        </td>
        <td data-label="Base">${escapeHtml(base)}</td>
        <td data-label="Data matrícula">${escapeHtml(aluno.dataMatricula || '—')}</td>
        <td data-label="Status">
          <span class="cadastro-status ${escapeHtml(aluno.status || '')}">${escapeHtml(meta.label)}</span>
          ${obs}
          ${trello}
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

    const botoes = [];
    if (aluno.cpf) {
      botoes.push(`<button class="btn btn-ghost" data-acao="copiar-cpf" data-id="${escapeHtml(aluno.id)}">Copiar CPF</button>`);
    }
    if (['pendente_s141', 'novo_curso', 'reativado'].includes(aluno.status)) {
      botoes.push(`<button class="btn btn-primary" data-acao="marcar-s141" data-id="${escapeHtml(aluno.id)}">Marcar S141 feito</button>`);
    }
    if (aluno.status === 'pronto_trello') {
      botoes.push(`<button class="btn btn-primary" data-acao="sync-trello" data-id="${escapeHtml(aluno.id)}">Sincronizar Trello</button>`);
    }
    if (aluno.trelloUrl) {
      botoes.push(`<a class="btn btn-ghost" href="${escapeHtml(aluno.trelloUrl)}" target="_blank" rel="noopener noreferrer">Abrir Trello</a>`);
    }
    botoes.push(`<button class="btn btn-ghost" data-acao="inativar" data-id="${escapeHtml(aluno.id)}">Inativar</button>`);
    return botoes.join('');
  },

  alunoPorId(id) {
    return this.alunos.find(aluno => String(aluno.id) === String(id));
  },

  async executarAcao(acao, id, botao) {
    const aluno = this.alunoPorId(id);
    if (!aluno) return;

    if (acao === 'copiar-cpf') {
      await navigator.clipboard?.writeText(aluno.cpf || '');
      toast('CPF copiado.', 'success');
      return;
    }

    if (acao === 'inativar' && !window.confirm(`Inativar ${aluno.nome}?`)) return;
    if (acao === 'reativar' && !window.confirm(`Reativar ${aluno.nome}?`)) return;

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
