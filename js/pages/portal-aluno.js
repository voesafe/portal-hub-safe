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
  busca: '',
  enviando: false,
  ultimaFalha: null,   // guarda o que faltou, para o botao de refazer

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
    document.getElementById('pa-pacote')?.addEventListener('change', () => this.aoTrocarPacote());
    document.getElementById('pa-busca')?.addEventListener('input', (e) => {
      this.busca = e.target.value.trim().toLowerCase();
      this.renderCursos();
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
      this.renderPacotes();
      this.renderCursos();
      this.renderPreview();
      this.renderHistorico();
      this.renderSubtitulo();
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
    sel.innerHTML = '<option value="">Escolher cursos avulsos</option>' +
      this.pacotes.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`).join('');
    if (atual && this.pacotes.some(p => p.id === atual)) sel.value = atual;
  },

  aoTrocarPacote() {
    const id = document.getElementById('pa-pacote').value;
    const bloco = document.getElementById('pa-avulsos-bloco');
    this.selecionados = new Set();

    if (id) {
      const p = this.pacotes.find(x => x.id === id);
      // ⚠️ Curso que sumiu da planilha entra na selecao assim mesmo e aparece
      // marcado na previa. Descartar em silencio faria o pacote liberar menos
      // do que o nome dele promete, sem ninguem notar.
      (p?.cursos || []).forEach(c => this.selecionados.add(String(c.id)));
      if (bloco) bloco.hidden = true;
    } else {
      if (bloco) bloco.hidden = false;
    }
    this.renderCursos();
    this.renderPreview();
  },

  renderCursos() {
    const box = document.getElementById('pa-cursos');
    if (!box) return;

    const lista = this.cursos.filter(c =>
      !this.busca || c.nome.toLowerCase().includes(this.busca));

    if (!lista.length) {
      box.innerHTML = '<p class="pa-vazio">Nenhum curso encontrado.</p>';
      return;
    }

    // Agrupa so para a leitura. O grupo vem da planilha e nao decide nada.
    const grupos = {};
    lista.forEach(c => { (grupos[c.grupo] = grupos[c.grupo] || []).push(c); });

    box.innerHTML = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(g => `
      <div class="pa-grupo">
        <div class="pa-grupo-nome">${escapeHtml(g)}</div>
        ${grupos[g].map(c => `
          <label class="pa-curso">
            <input type="checkbox" value="${escapeHtml(c.id)}" ${this.selecionados.has(String(c.id)) ? 'checked' : ''}>
            <span>${escapeHtml(c.nome)}</span>
          </label>`).join('')}
      </div>`).join('');

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
    const idPacote = document.getElementById('pa-pacote')?.value;
    if (idPacote) {
      const p = this.pacotes.find(x => x.id === idPacote);
      return (p?.cursos || []).map(c => ({ id: String(c.id), nome: c.nome, existe: c.existe !== false }));
    }
    return [...this.selecionados].map(id => {
      const c = this.cursos.find(x => String(x.id) === String(id));
      return { id: String(id), nome: c ? c.nome : `curso ${id}`, existe: !!c };
    });
  },

  renderPreview() {
    const box = document.getElementById('pa-preview');
    const lista = document.getElementById('pa-preview-lista');
    const n = document.getElementById('pa-preview-n');
    const escolhidos = this.cursosEscolhidos();

    if (!escolhidos.length) { if (box) box.hidden = true; return; }
    if (box) box.hidden = false;
    if (n) n.textContent = String(escolhidos.length);
    if (lista) {
      lista.innerHTML = escolhidos.map(c =>
        `<li class="${c.existe ? '' : 'pa-curso-sumido'}">${escapeHtml(c.nome)}${c.existe ? '' : ' (não encontrado na lista)'}</li>`
      ).join('');
    }
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
