// ============================================================
// aniversarios.js — Aniversários de alunos
// SAFE Hub
//
// Só leitura + reenvio manual. O reenvio NÃO usa atualização otimista:
// o servidor devolve a lista recalculada (res.data) e a tela renderiza
// direto dela — fingir o estado geraria contagem/marcação errada.
// ============================================================

const Aniversarios = {
  dados: null,
  mes: null,

  // Motivos de um aluno ATIVO não receber. 'inativo' não está aqui porque o
  // backend não manda mais aluno inativo nas listas.
  MOTIVOS: {
    descadastrado:  { label: 'Cancelou o envio',     tom: 'neutro' },
    nome_invalido:  { label: 'Nome inválido no CAVOK', tom: 'alerta' },
    sem_data:       { label: 'Sem data de nascimento', tom: 'alerta' },
    sem_email:      { label: 'Sem e-mail válido',    tom: 'alerta' },
    ja_enviado:     { label: 'Já enviado este ano',  tom: 'ok' }
  },

  async iniciar() {
    if (!Auth.protegerAniversarios()) return;
    Auth.preencherUI();
    this._bindHamburger();
    this.vincularEventos();
    await this.carregar();
  },

  /**
   * Abre/fecha a sidebar no mobile.
   * O auth.js só ajusta o aria-expanded e FECHA o menu (fecharMenu) — o toggle
   * de `mobile-open` é responsabilidade do JS de cada página. Sem isto o
   * hamburger não abre nada. Mesmo padrão do progresso-alunos.js.
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
    document.getElementById('btn-recarregar-aniv')
      ?.addEventListener('click', () => this.carregar(true));

    document.getElementById('aniv-mes')?.addEventListener('change', evento => {
      this.mes = evento.target.value;
      this.carregar();
    });
  },

  setCarregando(ativo, texto = 'Carregando aniversários...') {
    const overlay = document.getElementById('aniv-loading');
    const label = document.getElementById('aniv-loading-text');
    if (label) label.textContent = texto;
    overlay?.classList.toggle('active', ativo);
  },

  async carregar(forcar = false) {
    this.setCarregando(true);
    try {
      const res = await API.getAniversarios(this.mes);
      if (!res.ok) throw new Error(res.error || 'Não foi possível carregar os aniversários.');
      this.dados = res.data;
      this.mes = this.dados.mesAlvo;
      this.renderizar();
      if (forcar) toast('Aniversários atualizados.', 'success');
    } catch (erro) {
      toast(erro.message || 'Erro ao carregar aniversários.', 'error', 6000);
    } finally {
      this.setCarregando(false);
    }
  },

  renderizar() {
    if (!this.dados) return;
    this.renderStatus();
    this.renderTemplate();
    this.renderKpis();
    this.renderHoje();
    this.renderProximos();
    this.renderMes();
  },

  /**
   * Estado do envio automático — pílula discreta no header.
   * Era um card de largura inteira; virou pílula porque fica verde 99% do
   * tempo e um status permanente não merece ocupar a página. O detalhe (e o
   * que fazer quando está desligado) vai no title.
   */
  renderStatus() {
    const pill = document.getElementById('aniv-pill');
    if (!pill) return;
    const label = pill.querySelector('.aniv-pill-label');

    const ativo = !!this.dados.gatilhoAtivo;
    const ultima = this.dados.ultimaExecucao;

    pill.hidden = false;
    // `.is-ok` / `.is-warn` são os estados da pílula compartilhada
    // (`.topbar-status` no layout.css), usada igual na página de NOTAMs.
    pill.classList.toggle('is-ok', ativo);
    pill.classList.toggle('is-warn', !ativo);

    if (ativo) {
      label.textContent = 'Envio automático ligado';
      pill.title = ultima?.quando
        ? `Todos os dias por volta das 9h. Última verificação: ${ultima.quando}.`
        : 'Todos os dias por volta das 9h, quem faz aniversário recebe o e-mail.';
    } else {
      label.textContent = 'Envio desligado';
      pill.title = 'Nenhum e-mail está sendo enviado. Para ligar, rode aniversariosInstalarTrigger() no Apps Script.';
    }
  },

  /**
   * Lembrete de trocar o template do e-mail.
   *
   * O aluno recebe um e-mail por ano, pela vida inteira que estudar aqui.
   * Sem trocar o texto e a foto, o de 2027 é palavra por palavra o de 2026,
   * e quem guardou a mensagem do ano passado percebe.
   *
   * ⚠️ NÃO existe botão de "já troquei" de propósito. Dispensar o aviso é
   * exatamente o jeito de silenciá-lo sem trocar nada, que é a falha que ele
   * existe para evitar. A única forma de apagá-lo é editar o template e
   * atualizar ANIVERSARIOS_TEMPLATE_ANO no Aniversarios.gs, ou seja, fazer
   * o trabalho. Backend antigo (sem o campo) simplesmente não desenha nada.
   */
  renderTemplate() {
    const alvo = document.getElementById('aniv-template-aviso');
    if (!alvo) return;

    const t = this.dados.template;
    if (!t || !t.estado || t.estado === 'ok') {
      alvo.hidden = true;
      alvo.innerHTML = '';
      return;
    }

    const vencido = t.estado === 'vencido';
    const dias = Number(t.diasAteVirada);

    const titulo = vencido
      ? `O e-mail de aniversário ainda é o de ${this.esc(t.ano)}`
      : `Prepare o e-mail de aniversário de ${this.esc(t.proximoAno)}`;

    const texto = vencido
      ? `Quem faz aniversário em ${this.esc(t.anoAtual)} está recebendo a mesma mensagem que recebeu em ${this.esc(t.ano)}. Troque o texto e a foto antes do próximo envio.`
      : `O template atual é o de ${this.esc(t.anoAtual)} e ${dias === 1 ? 'falta 1 dia' : `faltam ${this.esc(dias)} dias`} para o primeiro aniversariante de ${this.esc(t.proximoAno)}, que chega no dia 1º de janeiro.`;

    alvo.hidden = false;
    alvo.className = `aniv-template-aviso ${vencido ? 'is-vencido' : 'is-preparar'}`;
    alvo.innerHTML = `
      <div class="aniv-template-titulo">${titulo}</div>
      <p class="aniv-template-texto">${texto}</p>
      <p class="aniv-template-como">
        Trocar em <code>apps-script/Aniversarios.gs</code>: a mensagem e a citação em
        <code>templateEmailAniversario_</code>, a versão em texto puro em
        <code>textoEmailAniversario_</code> e a foto em <code>HeroAsset.gs</code>.
        Depois atualize <code>ANIVERSARIOS_TEMPLATE_ANO</code> para
        ${this.esc(vencido ? t.anoAtual : t.proximoAno)}, publique o backend, e este aviso some.
      </p>
    `;
  },

  // ── Indicadores ────────────────────────────────────────────
  renderKpis() {
    const alvo = document.getElementById('aniv-kpis');
    if (!alvo) return;
    const r = this.dados.resumo || {};

    const cards = [
      { valor: this.dados.hoje.length, label: 'Aniversariantes hoje', tom: 'destaque' },
      { valor: r.enviadosNoAno || 0, label: `E-mails enviados em ${this.dados.ano}`, tom: '' },
      this.cardStatusDoDia()
    ];

    alvo.innerHTML = cards.map(c => `
      <div class="aniv-kpi ${c.tom ? 'aniv-kpi-' + c.tom : ''}">
        <div class="aniv-kpi-valor">${c.valor}</div>
        <div class="aniv-kpi-label">${c.label}</div>
      </div>
    `).join('');
  },

  /**
   * Status do disparo de hoje. Responde três perguntas de uma vez: o lote rodou?
   * quantos saíram? algum falhou? O erro do lote fica guardado no servidor
   * (ANIVERSARIOS_ULTIMA_EXECUCAO) porque a planilha só registra sucesso.
   */
  cardStatusDoDia() {
    const total = (this.dados.hoje || []).length;
    const comErro = (this.dados.hoje || []).filter(a => a.erroEnvio).length;
    const enviados = (this.dados.hoje || []).filter(a => a.enviadoHoje).length;
    const ultima = this.dados.ultimaExecucao;

    if (!total) {
      return {
        valor: '—',
        label: ultima?.deHoje
          ? `Nenhum aniversariante hoje · verificado ${ultima.quando.slice(-5)}`
          : 'Nenhum aniversariante hoje',
        tom: ''
      };
    }

    if (comErro) {
      return {
        valor: `${comErro}`,
        label: comErro === 1 ? 'E-mail falhou, reenvie abaixo' : 'E-mails falharam, reenvie abaixo',
        tom: 'erro'
      };
    }

    if (enviados === total) {
      return { valor: `${enviados}/${total}`, label: 'E-mails de hoje enviados', tom: 'ok' };
    }

    return {
      valor: `${enviados}/${total}`,
      label: this.dados.gatilhoAtivo ? 'Aguardando o envio automático' : 'Envio desligado, envie pelo botão',
      tom: 'alerta'
    };
  },

  // ── Hoje ───────────────────────────────────────────────────
  renderHoje() {
    const alvo = document.getElementById('aniv-hoje-lista');
    const sub = document.getElementById('aniv-hoje-sub');
    if (!alvo) return;

    const lista = this.dados.hoje || [];
    if (sub) {
      sub.textContent = lista.length
        ? `${this.dados.hojeLabel} · ${lista.length} aluno${lista.length > 1 ? 's' : ''}`
        : `${this.dados.hojeLabel} · ninguém faz aniversário hoje`;
    }

    if (!lista.length) {
      alvo.innerHTML = this.vazio('Nenhum aniversariante hoje.');
      return;
    }

    alvo.innerHTML = lista.map(a => this.cartaoAluno(a, true)).join('');
    alvo.querySelectorAll('[data-reenviar]').forEach(botao => {
      botao.addEventListener('click', () => this.reenviar(botao.dataset.reenviar));
    });
  },

  // ── Próximos 7 dias ────────────────────────────────────────
  renderProximos() {
    const alvo = document.getElementById('aniv-proximos-lista');
    if (!alvo) return;
    const lista = this.dados.proximos || [];

    if (!lista.length) {
      alvo.innerHTML = this.vazio('Nenhum aniversário nos próximos 7 dias.');
      return;
    }
    alvo.innerHTML = lista.map(a => this.cartaoAluno(a, false)).join('');
  },

  cartaoAluno(aluno, comAcao) {
    const motivo = aluno.erroEnvio
      ? { label: 'Erro no envio', tom: 'erro' }
      : (aluno.motivo ? this.MOTIVOS[aluno.motivo] : null);
    const quando = comAcao
      ? (aluno.erroEnvio ? 'Falhou no envio' : (aluno.enviadoHoje ? 'E-mail enviado' : 'Aguardando envio'))
      : (aluno.emDias === 1 ? 'amanhã' : `em ${aluno.emDias} dias`);

    const podeReenviar = comAcao && Auth.podeEditar('aniversarios.html') &&
      !aluno.semAniversario && aluno.motivo !== 'sem_email' &&
      aluno.motivo !== 'sem_data' && aluno.motivo !== 'nome_invalido';

    // Falha do lote: mostra o motivo e troca o rótulo do botão para 'Tentar de novo'.
    const rotuloBotao = aluno.erroEnvio
      ? 'Tentar de novo'
      : (aluno.enviadoHoje ? 'Reenviar' : 'Enviar agora');

    return `
      <article class="aniv-card">
        <div class="aniv-card-dia">
          <span class="aniv-card-dia-num">${this.esc(aluno.dia)}</span>
          <span class="aniv-card-dia-mes">${this.nomeMesCurto(aluno.mes)}</span>
        </div>
        <div class="aniv-card-info">
          <div class="aniv-card-nome">${this.esc(aluno.nome)}</div>
          <div class="aniv-card-meta">
            ${aluno.idade ? `<span>faz ${aluno.idade} anos</span>` : ''}
            ${aluno.cursoOperacional || aluno.curso ? `<span>${this.esc(aluno.cursoOperacional || aluno.curso)}</span>` : ''}
            ${aluno.email ? `<span class="aniv-card-email">${this.esc(aluno.email)}</span>` : ''}
          </div>
          ${aluno.erroEnvio ? `<div class="aniv-card-erro">${this.esc(aluno.erroEnvio)}</div>` : ''}
        </div>
        <div class="aniv-card-lado">
          <span class="aniv-quando">${this.esc(quando)}</span>
          ${motivo ? `<span class="aniv-tag aniv-tag-${motivo.tom}">${motivo.label}</span>` : ''}
          ${podeReenviar ? `<button class="btn ${aluno.erroEnvio ? 'btn-primary' : 'btn-ghost'} btn-sm" type="button" data-reenviar="${this.esc(aluno.id)}">${rotuloBotao}</button>` : ''}
        </div>
      </article>
    `;
  },

  // ── Mês ────────────────────────────────────────────────────
  renderMes() {
    const corpo = document.getElementById('aniv-mes-corpo');
    const sub = document.getElementById('aniv-mes-sub');
    const select = document.getElementById('aniv-mes');
    if (!corpo) return;

    if (select) select.value = this.dados.mesAlvo;

    const lista = this.dados.mes || [];
    if (sub) sub.textContent = `${lista.length} aluno${lista.length === 1 ? '' : 's'} ativo${lista.length === 1 ? '' : 's'} em ${this.nomeMes(this.dados.mesAlvo)}`;

    if (!lista.length) {
      corpo.innerHTML = `<tr><td colspan="6" class="aniv-td-vazio">Nenhum aniversariante neste mês.</td></tr>`;
      return;
    }

    corpo.innerHTML = lista.map(a => {
      const motivo = a.motivo ? this.MOTIVOS[a.motivo] : null;
      return `
        <tr class="${a.diaMes === this.dados.hojeLabel ? 'aniv-linha-hoje' : ''}">
          <td class="aniv-td-dia">${this.esc(a.dia)}</td>
          <td>${this.esc(a.nome)}</td>
          <td>${a.idade ? this.esc(a.idade) : '—'}</td>
          <td>${this.esc(a.cursoOperacional || a.curso || '—')}</td>
          <td class="aniv-td-email">${this.esc(a.email || '—')}</td>
          <td>${motivo ? `<span class="aniv-tag aniv-tag-${motivo.tom}">${motivo.label}</span>` : '<span class="aniv-tag aniv-tag-ok">Vai receber</span>'}</td>
        </tr>
      `;
    }).join('');
  },

  // ── Reenvio manual ─────────────────────────────────────────
  async reenviar(id) {
    const aluno = (this.dados?.hoje || []).find(a => String(a.id) === String(id));
    const nome = aluno ? aluno.nome : 'este aluno';
    if (!confirm(`Enviar o e-mail de aniversário para ${nome} agora?`)) return;

    this.setCarregando(true, 'Enviando e-mail...');
    try {
      const res = await API.reenviarAniversario(id);
      if (!res.ok) throw new Error(res.error || 'Não foi possível enviar o e-mail.');
      // Servidor devolve a lista recalculada — renderiza direto dela.
      this.dados = res.data;
      this.mes = this.dados.mesAlvo;
      this.renderizar();
      toast('E-mail de aniversário enviado.', 'success');
    } catch (erro) {
      toast(erro.message || 'Erro ao enviar o e-mail.', 'error', 6000);
    } finally {
      this.setCarregando(false);
    }
  },

  // ── Utilitários ────────────────────────────────────────────
  vazio(texto) {
    return `<div class="aniv-vazio">${this.esc(texto)}</div>`;
  },

  nomeMes(mes) {
    const nomes = {
      '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
      '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
      '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro'
    };
    return nomes[String(mes)] || '—';
  },

  nomeMesCurto(mes) {
    return this.nomeMes(mes).slice(0, 3).toUpperCase();
  },

  esc(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

document.addEventListener('DOMContentLoaded', () => Aniversarios.iniciar());
