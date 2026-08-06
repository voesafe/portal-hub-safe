// ============================================================
// portal-aluno.js — Liberar acesso ao portal do aluno (Newzenler)
// SAFE Hub
//
// SEM ATUALIZACAO OTIMISTA, de proposito. A regra da casa manda otimista para
// mutacao simples de item ja no estado local, e round-trip quando o servidor
// gera ou recalcula algo. Aqui o servidor cria o aluno na Zenler, matricula
// curso a curso e devolve o resultado DE CADA UM: fingir sucesso mostraria
// "liberado" numa matricula que falhou, e o aluno descobriria isso tentando
// abrir o curso.
// ============================================================

const PortalAluno = {

  pacotes: [],
  cursos: [],
  liberacoes: [],
  selecionados: new Set(),
  pickerAberto: false,
  enviando: false,
  ultimaFalha: null,   // guarda o que faltou, para o botao de refazer

  // Aba "Alunos"
  alunos: [],          // [{ e: email, n: nome, c: [[cursoId, status, data]] }]
  nomesCursos: {},     // TODOS os cursos, nao so os liberaveis avulsos
  sincronia: null,
  aba: 'liberar',
  alunoAberto: null,
  addSelecionados: new Set(),
  removendo: null,

  // Teto do que e desenhado de uma vez. ⚠️ Sempre acompanhado da nota que
  // diz quantos casaram: lista cortada em silencio faz a pessoa concluir que
  // o aluno nao existe quando ele so ficou de fora do corte.
  LIMITE_LISTA: 80,

  async init() {
    Auth.proteger();
    Auth.protegerPagina('portal-aluno.html', 'Portal do Aluno');
    Auth.preencherUI();
    this._bindHamburger();
    this._bind();
    await this.carregar();
  },

  // ⚠️ O toggle do menu no celular e responsabilidade do JS de CADA pagina: o
  // auth.js so ajusta o aria-expanded e FECHA o menu. Copiar pagina sem este
  // bind deixa o hamburger morto, que ja aconteceu duas vezes neste projeto.
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
    document.getElementById('pa-atualizar')?.addEventListener('click', () => this.carregar());
    document.getElementById('pa-pacote')?.addEventListener('change', () => this.renderPreview());

    // Picker dos avulsos. O clique fora usa composedPath(): o painel e refeito
    // por innerHTML durante o proprio despacho do evento, entao um closest()
    // subiria uma arvore sem ele e o clique de dentro passaria por clique de
    // fora, fechando o painel a cada marcacao.
    const botao = document.getElementById('pa-picker-botao');
    botao?.addEventListener('click', () => this.alternarPicker());
    document.addEventListener('click', (e) => {
      if (!this.pickerAberto) return;
      if (e.composedPath().some(el => el.id === 'pa-picker')) return;
      this.fecharPicker();
    });
    document.getElementById('pa-liberar')?.addEventListener('click', () => this.confirmar());

    document.getElementById('pa-modal-close')?.addEventListener('click', () => fecharModal('pa-modal'));
    document.getElementById('pa-modal-cancelar')?.addEventListener('click', () => fecharModal('pa-modal'));
    document.getElementById('pa-modal-confirmar')?.addEventListener('click', () => this.liberar());

    document.getElementById('pa-resultado-close')?.addEventListener('click', () => fecharModal('pa-resultado'));
    document.getElementById('pa-resultado-ok')?.addEventListener('click', () => fecharModal('pa-resultado'));
    document.getElementById('pa-resultado-refazer')?.addEventListener('click', () => this.refazer());

    // Mascara do CPF. O cursor vai para o fim porque o valor inteiro e
    // reescrito: sem isso, digitar o segundo bloco escreveria de tras para
    // frente. Mesma solucao do campo de CPF em Vendas.
    const cpf = document.getElementById('pa-cpf');
    cpf?.addEventListener('input', () => {
      const f = this._mascaraCpf(cpf.value);
      if (f === cpf.value) return;
      cpf.value = f;
      cpf.setSelectionRange(f.length, f.length);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Fecha so o modal de cima, senao uma tecla fecharia os dois.
      const abertos = document.querySelectorAll('.modal-overlay.open');
      if (abertos.length) abertos[abertos.length - 1].classList.remove('open');
    });

    this._bindAlunos();
  },

  _bindAlunos() {
    document.getElementById('pa-tab-liberar')?.addEventListener('click', () => this.trocarAba('liberar'));
    document.getElementById('pa-tab-alunos')?.addEventListener('click', () => this.trocarAba('alunos'));
    document.getElementById('pa-busca')?.addEventListener('input', () => this.renderLista());
    document.getElementById('pa-sincronizar')?.addEventListener('click', () => this.sincronizar());

    // Delegação: as linhas nascem depois deste bind e são refeitas a cada
    // busca, então listener por linha morreria no primeiro filtro.
    document.getElementById('pa-lista')?.addEventListener('click', (e) => {
      const linha = e.target.closest('[data-email]');
      if (linha) this.abrirAluno(linha.dataset.email);
    });

    document.getElementById('pa-aluno-close')?.addEventListener('click', () => fecharModal('pa-aluno'));
    document.getElementById('pa-aluno-fechar')?.addEventListener('click', () => fecharModal('pa-aluno'));
    document.getElementById('pa-add-pacote')?.addEventListener('change', () => this.renderAdd());
    document.getElementById('pa-add-btn')?.addEventListener('click', () => this.acrescentar());

    document.getElementById('pa-aluno-cursos')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remover]');
      if (btn) this.confirmarRemocao(btn.dataset.remover);
    });

    document.getElementById('pa-remover-close')?.addEventListener('click', () => fecharModal('pa-remover'));
    document.getElementById('pa-remover-cancelar')?.addEventListener('click', () => fecharModal('pa-remover'));
    document.getElementById('pa-remover-confirmar')?.addEventListener('click', () => this.remover());
  },

  // ── Abas ─────────────────────────────────────────────────

  trocarAba(qual) {
    this.aba = qual;
    const ehLiberar = qual === 'liberar';
    document.getElementById('pa-painel-liberar').hidden = !ehLiberar;
    document.getElementById('pa-painel-alunos').hidden = ehLiberar;
    const tl = document.getElementById('pa-tab-liberar');
    const ta = document.getElementById('pa-tab-alunos');
    tl?.classList.toggle('is-active', ehLiberar);
    ta?.classList.toggle('is-active', !ehLiberar);
    tl?.setAttribute('aria-selected', String(ehLiberar));
    ta?.setAttribute('aria-selected', String(!ehLiberar));
  },

  // ── Dados ────────────────────────────────────────────────

  async carregar() {
    this.setCarregando(true);
    try {
      const res = await API.getPortalAluno();
      if (!res.ok) {
        toast(res.error || 'Não foi possível carregar.', 'error');
        return;
      }
      const d = res.data || {};
      this.pacotes = d.pacotes || [];
      this.cursos = d.cursos || [];
      this.liberacoes = d.liberacoes || [];
      // Backend antigo não manda estes campos. Cair em vazio deixa a aba
      // "Alunos" sem lista em vez de quebrar a página inteira, e ela volta
      // sozinha na primeira carga depois do deploy do backend.
      this.alunos = d.alunos || [];
      this.nomesCursos = d.nomesCursos || {};
      this.sincronia = d.sincronia || null;
      this.renderPacotes();
      this.renderCursos();
      this.renderPreview();
      this.renderHistorico();
      this.renderSubtitulo();
      this.renderLista();
      this.renderSincronia();
    } finally {
      this.setCarregando(false);
    }
  },

  setCarregando(ativo, texto = 'Carregando...') {
    const o = document.getElementById('pa-loading');
    const t = document.getElementById('pa-loading-text');
    if (t) t.textContent = texto;
    o?.classList.toggle('active', ativo);
  },

  renderSubtitulo() {
    const el = document.getElementById('pa-subtitulo');
    if (!el) return;
    el.textContent = `${this.pacotes.length} pacotes · ${this.cursos.length} cursos disponíveis`;
  },

  // ── Pacotes e cursos ─────────────────────────────────────

  renderPacotes() {
    const sel = document.getElementById('pa-pacote');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Nenhum</option>' +
      this.pacotes.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`).join('');
    if (atual && this.pacotes.some(p => p.id === atual)) sel.value = atual;
  },

  alternarPicker() { this.pickerAberto ? this.fecharPicker() : this.abrirPicker(); },

  abrirPicker() {
    this.pickerAberto = true;
    document.getElementById('pa-picker-painel').hidden = false;
    document.getElementById('pa-picker-botao').setAttribute('aria-expanded', 'true');
  },

  fecharPicker() {
    this.pickerAberto = false;
    document.getElementById('pa-picker-painel').hidden = true;
    document.getElementById('pa-picker-botao').setAttribute('aria-expanded', 'false');
  },

  renderCursos() {
    const box = document.getElementById('pa-cursos');
    if (!box) return;

    if (!this.cursos.length) {
      box.innerHTML = '<p class="pa-vazio">Nenhum curso avulso disponível.</p>';
      return;
    }

    box.innerHTML = this.cursos.map(c => `
      <label class="pa-curso">
        <input type="checkbox" value="${escapeHtml(c.id)}" ${this.selecionados.has(String(c.id)) ? 'checked' : ''}>
        <span>${escapeHtml(c.nome)}</span>
      </label>`).join('');

    box.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this.selecionados.add(cb.value);
        else this.selecionados.delete(cb.value);
        this.renderPreview();
      });
    });
  },

  // Nomes do que vai ser matriculado, na ordem do pacote quando houver.
  cursosEscolhidos() {
    const fora = [];
    const jaTem = new Set();
    const por = (id, nome, existe) => {
      if (jaTem.has(String(id))) return;   // pacote e avulso podem repetir curso
      jaTem.add(String(id));
      fora.push({ id: String(id), nome, existe });
    };

    const idPacote = document.getElementById('pa-pacote')?.value;
    if (idPacote) {
      const p = this.pacotes.find(x => x.id === idPacote);
      (p?.cursos || []).forEach(c => por(c.id, c.nome, c.existe !== false));
    }
    [...this.selecionados].forEach(id => {
      const c = this.cursos.find(x => String(x.id) === String(id));
      por(id, c ? c.nome : `curso ${id}`, !!c);
    });
    return fora;
  },

  renderPreview() {
    const box = document.getElementById('pa-preview');
    const lista = document.getElementById('pa-preview-lista');
    const n = document.getElementById('pa-preview-n');
    const escolhidos = this.cursosEscolhidos();

    this.atualizarRotuloPicker();
    if (!escolhidos.length) { if (box) box.hidden = true; return; }
    if (box) box.hidden = false;
    if (n) n.textContent = String(escolhidos.length);
    if (lista) {
      lista.innerHTML = escolhidos.map(c =>
        `<li class="${c.existe ? '' : 'pa-curso-sumido'}">${escapeHtml(c.nome)}${c.existe ? '' : ' (não encontrado na lista)'}</li>`
      ).join('');
    }
  },

  // O botao precisa dizer o que esta escolhido: painel fechado sem resumo
  // esconde a selecao e a pessoa nao sabe se marcou algo.
  atualizarRotuloPicker() {
    const el = document.getElementById('pa-picker-rotulo');
    if (!el) return;
    const n = this.selecionados.size;
    el.textContent = n === 0 ? 'Nenhum curso avulso'
                   : n === 1 ? '1 curso avulso'
                   : `${n} cursos avulsos`;
  },

  // ── Liberação ────────────────────────────────────────────

  _dados() {
    return {
      nome:  document.getElementById('pa-nome').value.trim(),
      email: document.getElementById('pa-email').value.trim(),
      cpf:   this._soDigitos(document.getElementById('pa-cpf').value),
      pacote: document.getElementById('pa-pacote').value || '',
      cursos: this.cursosEscolhidos().map(c => c.id)
    };
  },

  _pendencias(d) {
    const faltas = [];
    if (!d.nome) faltas.push('Nome completo');
    if (!d.email) faltas.push('E-mail');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) faltas.push('E-mail inválido');
    // O CPF vira a senha do primeiro acesso, entao sem ele nao ha como criar.
    if (d.cpf.length !== 11) faltas.push('CPF com 11 dígitos');
    else if (!this._cpfValido(d.cpf)) faltas.push('CPF inválido');
    if (!d.cursos.length) faltas.push('Ao menos um curso');
    return faltas;
  },

  confirmar() {
    const d = this._dados();
    const faltas = this._pendencias(d);
    if (faltas.length) {
      toast('Falta preencher: ' + faltas.join(', '), 'error', 5000);
      return;
    }
    const escolhidos = this.cursosEscolhidos();
    document.getElementById('pa-modal-corpo').innerHTML = `
      <p class="pa-conf-nome">${escapeHtml(d.nome)}</p>
      <p class="pa-conf-sub">${escapeHtml(d.email)} · CPF ${escapeHtml(this._mascaraCpf(d.cpf))}</p>
      <p class="pa-conf-aviso">O aluno recebe o e-mail de boas-vindas da Zenler assim que isto for confirmado. A senha inicial é o CPF, só os números.</p>
      <div class="pa-conf-titulo">Vai matricular em ${escolhidos.length} cursos</div>
      <ul class="pa-conf-lista">${escolhidos.map(c => `<li>${escapeHtml(c.nome)}</li>`).join('')}</ul>`;
    abrirModal('pa-modal');
  },

  async liberar() {
    if (this.enviando) return;
    const d = this._dados();
    const btn = document.getElementById('pa-modal-confirmar');

    this.enviando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Liberando...'; }

    try {
      const res = await API.liberarPortalAluno(d);

      // ⚠️ Resposta perdida no redirecionamento do Apps Script: o POST pode ter
      // rodado inteiro. Nao dizer nem sucesso nem falha, e mandar conferir.
      if (res.indeterminado) {
        fecharModal('pa-modal');
        toast('Não deu para confirmar o resultado. Recarregue e confira o histórico antes de tentar de novo.', 'warning', 7000);
        await this.carregar();
        return;
      }
      if (!res.ok) {
        toast(res.error || 'Não foi possível liberar.', 'error', 6000);
        return;
      }

      fecharModal('pa-modal');
      this.mostrarResultado(res.data || {}, d);
      await this.carregar();
    } finally {
      this.enviando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Liberar acesso'; }
    }
  },

  mostrarResultado(r, enviado) {
    const cursos = r.cursos || [];
    const falharam = cursos.filter(c => c.status !== 'OK');
    const tit = document.getElementById('pa-resultado-titulo');
    const corpo = document.getElementById('pa-resultado-corpo');
    const refazer = document.getElementById('pa-resultado-refazer');

    if (tit) {
      tit.textContent = falharam.length
        ? `Liberado em ${r.ok} de ${r.total}`
        : 'Acesso liberado';
    }

    if (corpo) {
      corpo.innerHTML = `
        ${r.alunoCriado
          ? `<p class="pa-res-novo">Aluno criado na Zenler. Ele já recebeu o e-mail de boas-vindas. Senha inicial: <strong>${escapeHtml(r.senhaInicial || '')}</strong></p>`
          : `<p class="pa-res-existia">O aluno já existia na Zenler, então nenhum e-mail de boas-vindas foi enviado.</p>`}
        <ul class="pa-res-lista">
          ${cursos.map(c => `
            <li class="${c.status === 'OK' ? 'ok' : 'erro'}">
              <span class="pa-res-marca" aria-hidden="true">${c.status === 'OK' ? '✓' : '!'}</span>
              <span class="pa-res-nome">${escapeHtml(c.nome)}</span>
              <span class="pa-res-det">${escapeHtml(c.detalhe || '')}</span>
            </li>`).join('')}
        </ul>`;
    }

    // ⚠️ O botao de refazer so aparece quando ha o que refazer, e refaz SO os
    // que faltaram. Repetir a lista inteira nao estragaria nada (matricular
    // duas vezes e inofensivo), mas mostraria "ja estava matriculado" em tudo
    // e esconderia qual era o problema de verdade.
    this.ultimaFalha = falharam.length ? { ...enviado, cursos: falharam.map(c => c.id) } : null;
    if (refazer) refazer.hidden = !falharam.length;

    abrirModal('pa-resultado');
  },

  async refazer() {
    if (!this.ultimaFalha || this.enviando) return;
    const btn = document.getElementById('pa-resultado-refazer');
    this.enviando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Refazendo...'; }
    try {
      const alvo = this.ultimaFalha;
      const res = await API.liberarPortalAluno(alvo);
      if (res.indeterminado) {
        toast('Não deu para confirmar. Recarregue e confira o histórico.', 'warning', 7000);
      } else if (!res.ok) {
        toast(res.error || 'Não foi possível refazer.', 'error', 6000);
      } else {
        this.mostrarResultado(res.data || {}, alvo);
      }
      await this.carregar();
    } finally {
      this.enviando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Refazer o que faltou'; }
    }
  },

  // ── Aba Alunos ───────────────────────────────────────────

  podeRemover() { return Auth.temPermissao('portal_aluno.remover'); },
  podeLiberar() { return Auth.podeEditar('portal-aluno.html'); },

  renderSincronia() {
    const el = document.getElementById('pa-sinc-quando');
    const btn = document.getElementById('pa-sincronizar');
    // Sincronizar vai à Zenler e regrava a planilha, então segue a mesma
    // permissão de liberar. Quem só visualiza vê a lista e a hora dela.
    if (btn) btn.hidden = !this.podeLiberar();
    if (!el) return;
    if (!this.sincronia) { el.textContent = 'Nunca sincronizado'; return; }
    const quando = this._quando(this.sincronia.quando);
    const falhas = Number(this.sincronia.falhas || 0);
    el.textContent = `Sincronizado ${quando}` + (falhas ? ` · ${falhas} curso(s) falharam` : '');
    el.classList.toggle('tem-falha', falhas > 0);
  },

  alunosFiltrados() {
    const q = (document.getElementById('pa-busca')?.value || '').trim().toLowerCase();
    if (!q) return this.alunos;
    return this.alunos.filter(a =>
      String(a.n || '').toLowerCase().includes(q) || String(a.e || '').includes(q));
  },

  renderLista() {
    const box = document.getElementById('pa-lista');
    const nota = document.getElementById('pa-lista-nota');
    const conta = document.getElementById('pa-tab-alunos-n');
    if (conta) conta.textContent = this.alunos.length ? String(this.alunos.length) : '';
    if (!box) return;

    if (!this.alunos.length) {
      box.innerHTML = `<p class="pa-vazio">Nenhum aluno no cache ainda. ${
        this.podeLiberar() ? 'Use o Sincronizar para trazer da Zenler.' : 'Peça a alguém com permissão para sincronizar.'}</p>`;
      if (nota) nota.hidden = true;
      return;
    }

    const lista = this.alunosFiltrados();
    if (!lista.length) {
      box.innerHTML = '<p class="pa-vazio">Nenhum aluno casa com essa busca.</p>';
      if (nota) nota.hidden = true;
      return;
    }

    const mostrados = lista.slice(0, this.LIMITE_LISTA);
    box.innerHTML = mostrados.map(a => `
      <button type="button" class="pa-aluno-linha" data-email="${escapeHtml(a.e)}">
        <span class="pa-aluno-linha-nome">${escapeHtml(a.n || '(sem nome)')}</span>
        <span class="pa-aluno-linha-email">${escapeHtml(a.e)}</span>
        <span class="pa-aluno-linha-n">${a.c.length} ${a.c.length === 1 ? 'curso' : 'cursos'}</span>
      </button>`).join('');

    if (nota) {
      const sobra = lista.length - mostrados.length;
      nota.hidden = sobra <= 0;
      nota.textContent = sobra > 0
        ? `Mostrando ${mostrados.length} de ${lista.length}. Use a busca para achar alguém específico.`
        : '';
    }
  },

  // ── Ficha do aluno ───────────────────────────────────────

  abrirAluno(email) {
    const a = this.alunos.find(x => x.e === email);
    if (!a) return;
    this.alunoAberto = a;
    this.addSelecionados = new Set();

    document.getElementById('pa-aluno-titulo').textContent = a.n || '(sem nome)';
    document.getElementById('pa-aluno-email').textContent = a.e;

    const sel = document.getElementById('pa-add-pacote');
    if (sel) {
      sel.innerHTML = '<option value="">Nenhum</option>' +
        this.pacotes.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`).join('');
      sel.value = '';
    }

    // Só quem pode liberar vê o bloco de acrescentar.
    const add = document.getElementById('pa-add');
    if (add) add.hidden = !this.podeLiberar();

    this.renderCursosDoAluno();
    this.renderAdd();
    abrirModal('pa-aluno');
  },

  _statusLegivel(s) {
    const m = { 'Completed': 'Concluído', 'In Progress': 'Em andamento', 'Not Started': 'Não iniciado' };
    return m[s] || s || '—';
  },

  renderCursosDoAluno() {
    const ul = document.getElementById('pa-aluno-cursos');
    const n = document.getElementById('pa-aluno-n');
    const a = this.alunoAberto;
    if (!ul || !a) return;
    if (n) n.textContent = String(a.c.length);

    const podeRemover = this.podeRemover();
    ul.innerHTML = a.c.map(([id, status, data]) => {
      // Curso fora da planilha ainda mostra o id: sumir faria a tela dizer
      // que o aluno não tem um acesso que ele tem.
      const nome = this.nomesCursos[String(id)] || `curso ${id}`;
      return `<li class="pa-aluno-curso">
        <span class="pa-ac-nome">${escapeHtml(nome)}</span>
        <span class="pa-ac-meta">${escapeHtml(this._statusLegivel(status))}${data ? ' · desde ' + escapeHtml(this._data(data)) : ''}</span>
        ${podeRemover ? `<button type="button" class="pa-ac-x" data-remover="${escapeHtml(String(id))}"
            aria-label="Remover matrícula em ${escapeHtml(nome)}" title="Remover matrícula">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>` : ''}
      </li>`;
    }).join('') || '<li class="pa-vazio">Nenhum curso.</li>';
  },

  // Só os cursos que ele ainda NÃO tem: oferecer o que já está lá seria
  // pedir uma ação sem efeito, e a resposta viria "já estava matriculado".
  cursosQueFaltam() {
    const tem = new Set((this.alunoAberto?.c || []).map(c => String(c[0])));
    return this.cursos.filter(c => !tem.has(String(c.id)));
  },

  renderAdd() {
    const box = document.getElementById('pa-add-cursos');
    if (!box || !this.alunoAberto) return;

    const faltam = this.cursosQueFaltam();
    box.innerHTML = faltam.length
      ? faltam.map(c => `
        <label class="pa-curso">
          <input type="checkbox" value="${escapeHtml(String(c.id))}" ${this.addSelecionados.has(String(c.id)) ? 'checked' : ''}>
          <span>${escapeHtml(c.nome)}</span>
        </label>`).join('')
      : '<p class="pa-vazio">Ele já está em todos os cursos avulsos disponíveis.</p>';

    box.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this.addSelecionados.add(cb.value);
        else this.addSelecionados.delete(cb.value);
        this.renderAdd();
      });
    });

    const escolhidos = this.cursosParaAcrescentar();
    const previa = document.getElementById('pa-add-previa');
    const btn = document.getElementById('pa-add-btn');
    if (previa) {
      previa.hidden = !escolhidos.length;
      previa.innerHTML = escolhidos.length
        ? `<strong>Vai matricular em ${escolhidos.length}:</strong> ` +
          escolhidos.map(c => escapeHtml(c.nome)).join(', ')
        : '';
    }
    if (btn) btn.disabled = !escolhidos.length;
  },

  // Pacote e avulsos SOMAM, como no formulário. O que o aluno já tem é
  // descartado aqui também, inclusive quando vem dentro de um pacote.
  cursosParaAcrescentar() {
    const tem = new Set((this.alunoAberto?.c || []).map(c => String(c[0])));
    const fora = [], vistos = new Set();
    const por = (id, nome) => {
      id = String(id);
      if (tem.has(id) || vistos.has(id)) return;
      vistos.add(id);
      fora.push({ id, nome });
    };
    const idPacote = document.getElementById('pa-add-pacote')?.value;
    if (idPacote) {
      const p = this.pacotes.find(x => x.id === idPacote);
      (p?.cursos || []).forEach(c => por(c.id, c.nome));
    }
    [...this.addSelecionados].forEach(id => {
      const c = this.cursos.find(x => String(x.id) === String(id));
      por(id, c ? c.nome : `curso ${id}`);
    });
    return fora;
  },

  async acrescentar() {
    if (this.enviando || !this.alunoAberto) return;
    const escolhidos = this.cursosParaAcrescentar();
    if (!escolhidos.length) return;

    const btn = document.getElementById('pa-add-btn');
    this.enviando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Matriculando...'; }

    try {
      // ⚠️ Sem CPF de propósito: o aluno já existe, e o CPF só serve como
      // senha do primeiro acesso. O backend só o exige quando vai criar.
      const alvo = {
        nome: this.alunoAberto.n,
        email: this.alunoAberto.e,
        cpf: '',
        pacote: document.getElementById('pa-add-pacote')?.value || '',
        cursos: escolhidos.map(c => c.id)
      };
      const res = await API.liberarPortalAluno(alvo);

      if (res.indeterminado) {
        fecharModal('pa-aluno');
        toast('Não deu para confirmar o resultado. Recarregue e confira antes de tentar de novo.', 'warning', 7000);
        await this.carregar();
        return;
      }
      if (!res.ok) {
        toast(res.error || 'Não foi possível matricular.', 'error', 6000);
        return;
      }

      fecharModal('pa-aluno');
      this.mostrarResultado(res.data || {}, alvo);
      await this.carregar();
    } finally {
      this.enviando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Matricular nos cursos escolhidos'; }
    }
  },

  // ── Remover matrícula ────────────────────────────────────

  confirmarRemocao(cursoId) {
    if (!this.alunoAberto) return;
    const nome = this.nomesCursos[String(cursoId)] || `curso ${cursoId}`;
    this.removendo = { cursoId: String(cursoId), cursoNome: nome };

    document.getElementById('pa-remover-corpo').innerHTML = `
      <p class="pa-conf-nome">${escapeHtml(this.alunoAberto.n || this.alunoAberto.e)}</p>
      <p class="pa-conf-sub">${escapeHtml(this.alunoAberto.e)}</p>
      <p class="pa-rem-curso">Vai perder o acesso a <strong>${escapeHtml(nome)}</strong>.</p>
      <p class="pa-rem-aviso">O progresso do aluno nesse curso é apagado junto, e matricular de novo não traz de volta.</p>`;
    abrirModal('pa-remover');
  },

  async remover() {
    if (this.enviando || !this.removendo || !this.alunoAberto) return;
    const btn = document.getElementById('pa-remover-confirmar');
    this.enviando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Removendo...'; }

    try {
      const res = await API.removerMatriculaPortal({
        email: this.alunoAberto.e,
        nome: this.alunoAberto.n,
        cursoId: this.removendo.cursoId
      });

      if (res.indeterminado) {
        fecharModal('pa-remover');
        fecharModal('pa-aluno');
        toast('Não deu para confirmar o resultado. Recarregue e confira os cursos do aluno.', 'warning', 7000);
        await this.carregar();
        return;
      }
      if (!res.ok) {
        toast(res.error || 'Não foi possível remover.', 'error', 6000);
        return;
      }

      fecharModal('pa-remover');
      toast(`Matrícula removida: ${this.removendo.cursoNome}.`, 'success');
      const email = this.alunoAberto.e;
      await this.carregar();
      // Reabre a ficha já com a lista nova, senão a pessoa fica olhando um
      // modal que ainda mostra o curso que ela acabou de remover.
      const ainda = this.alunos.find(x => x.e === email);
      if (ainda) { this.alunoAberto = ainda; this.renderCursosDoAluno(); this.renderAdd(); }
      else fecharModal('pa-aluno');
    } finally {
      this.enviando = false;
      this.removendo = null;
      if (btn) { btn.disabled = false; btn.textContent = 'Remover matrícula'; }
    }
  },

  // ── Sincronizar com a Zenler ─────────────────────────────

  async sincronizar() {
    if (this.enviando) return;
    const btn = document.getElementById('pa-sincronizar');
    this.enviando = true;
    if (btn) btn.disabled = true;
    this.setCarregando(true, 'Lendo a Zenler curso a curso...');
    try {
      const res = await API.sincronizarMatriculasPortal();
      if (res.indeterminado) {
        toast('Não deu para confirmar. Recarregue para ver como ficou.', 'warning', 6000);
      } else if (!res.ok) {
        toast(res.error || 'Não foi possível sincronizar.', 'error', 6000);
        return;
      } else {
        const d = res.data || {};
        toast(`${d.matriculas || 0} matrículas em ${d.cursosVarridos || 0} cursos.`, 'success');
      }
      await this.carregar();
    } finally {
      this.enviando = false;
      if (btn) btn.disabled = false;
      this.setCarregando(false);
    }
  },

  _data(v) {
    const s = String(v || '');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  },

  // ── Histórico ────────────────────────────────────────────

  renderHistorico() {
    const tb = document.getElementById('pa-historico');
    if (!tb) return;
    if (!this.liberacoes.length) {
      tb.innerHTML = '<tr><td colspan="5" class="pa-vazio">Nenhuma liberação ainda.</td></tr>';
      return;
    }
    tb.innerHTML = this.liberacoes.map(l => {
      const parcial = l.ok < l.total;
      return `<tr>
        <td>${escapeHtml(this._quando(l.data))}</td>
        <td>
          <div class="pa-h-nome">${escapeHtml(l.nome)}</div>
          <div class="pa-h-email">${escapeHtml(l.email)}</div>
        </td>
        <td>${escapeHtml(l.pacote || '—')}</td>
        <td><span class="pa-badge ${parcial ? 'is-parcial' : 'is-ok'}">${l.ok} de ${l.total}</span></td>
        <td class="pa-h-autor">${escapeHtml(l.autor || '—')}</td>
      </tr>`;
    }).join('');
  },

  _quando(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit',
                                       hour: '2-digit', minute: '2-digit' });
  },

  // ── CPF ──────────────────────────────────────────────────

  _soDigitos(v) { return String(v ?? '').replace(/\D/g, ''); },

  _mascaraCpf(v) {
    const d = this._soDigitos(v).slice(0, 11);
    if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
    return d;
  },

  _cpfValido(v) {
    const c = this._soDigitos(v);
    if (c.length !== 11) return false;
    // Os onze digitos iguais PASSAM na conta do verificador e nao sao CPF.
    if (/^(\d)\1{10}$/.test(c)) return false;
    for (let corte = 9; corte < 11; corte++) {
      let soma = 0;
      for (let i = 0; i < corte; i++) soma += Number(c[i]) * (corte + 1 - i);
      let dv = (soma * 10) % 11;
      if (dv === 10) dv = 0;
      if (dv !== Number(c[corte])) return false;
    }
    return true;
  }
};

document.addEventListener('DOMContentLoaded', () => PortalAluno.init());
