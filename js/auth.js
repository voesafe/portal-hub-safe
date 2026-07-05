// ============================================================
// auth.js — Autenticação, sessão e proteção de rotas
// SAFE Hub — login por e-mail
// ============================================================

const Auth = {
  SESSION_MAX_MS: 12 * 60 * 60 * 1000,
  SESSION_TIMEZONE: 'America/Sao_Paulo',

  salvarSessao(usuario) {
    localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(this.normalizarSessao(usuario)));
  },

  versaoSessaoAtual() {
    return CONFIG.SESSION_VERSION || CONFIG.APP_VERSION || '1.0.0';
  },

  diaLocal(data = new Date()) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: this.SESSION_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(data);
    } catch {
      return data.toISOString().slice(0, 10);
    }
  },

  normalizarSessao(usuario) {
    const agora = Date.now();
    const loginEm = Number(usuario?.loginEm || usuario?.criadoEm || agora);
    const expiraEmServidor = Number(usuario?.expiraEm || 0);
    const expiraEm = expiraEmServidor
      ? Math.min(expiraEmServidor, loginEm + this.SESSION_MAX_MS)
      : loginEm + this.SESSION_MAX_MS;

    return {
      ...usuario,
      loginEm,
      expiraEm,
      diaLogin: usuario?.diaLogin || this.diaLocal(new Date(loginEm)),
      sessionVersion: this.versaoSessaoAtual()
    };
  },

  limparSessao() {
    localStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem('cco_session');
  },

  motivoSessaoInvalida(sessao) {
    if (!sessao || typeof sessao !== 'object') return 'ausente';
    if (!sessao.loginEm || !sessao.expiraEm || !sessao.diaLogin || !sessao.sessionVersion) {
      return 'legada';
    }
    if (sessao.sessionVersion !== this.versaoSessaoAtual()) return 'versao';
    if (Date.now() >= Number(sessao.expiraEm)) return 'tempo';
    if (sessao.diaLogin !== this.diaLocal()) return 'dia';
    return '';
  },

  getSessao() {
    try {
      const raw = localStorage.getItem(CONFIG.SESSION_KEY)
               || sessionStorage.getItem(CONFIG.SESSION_KEY);
      if (!raw) return null;
      const sessao = JSON.parse(raw);
      if (this.motivoSessaoInvalida(sessao)) {
        this.limparSessao();
        return null;
      }
      return sessao;
    } catch { return null; }
  },

  estaLogado() { return !!this.getSessao(); },

  eAdmin() {
    const s = this.getSessao();
    return s && (this.eSuperadmin() || this.perfilEhAdmin(s.perfil));
  },

  eAdminCompleto() {
    const s = this.getSessao();
    const p = this.normalizarPerfil(s?.perfil);
    return s && (this.eSuperadmin() || p === 'admin' || p === 'master');
  },

  eSuperadmin() {
    const s = this.getSessao();
    return !!(s && (s.superadmin === true || String(s.superadmin).toLowerCase() === 'true' || this.perfilEhMaster(s.perfil)));
  },

  perfilEhCco(perfil) {
    return this.normalizarPerfil(perfil).startsWith('cco_');
  },

  perfilPodeAcessarEscalaCco(perfil) {
    const p = this.normalizarPerfil(perfil);
    return p === 'admin' || p === 'master' || p === 'escala_minions' || this.perfilEhCco(p);
  },

  podeAcessarEscalaCco() {
    if (this.eSuperadmin()) return true;
    return this.perfilPodeAcessarEscalaCco(this.getPerfil());
  },

  perfilPodeAcessarEscalaPav(perfil) {
    const p = this.normalizarPerfil(perfil);
    return p === 'master' || p === 'financeiro';
  },

  podeAcessarEscalaPav() {
    if (this.eSuperadmin()) return true;
    return this.perfilPodeAcessarEscalaPav(this.getPerfil());
  },

  perfilPodeAcessarHorasVoadasInva(perfil) {
    const p = this.normalizarPerfil(perfil);
    return p === 'admin' || p === 'master' || p === 'escala_minions';
  },

  podeAcessarHorasVoadasInva() {
    if (this.eSuperadmin()) return true;
    return this.perfilPodeAcessarHorasVoadasInva(this.getPerfil());
  },

  perfilPodeAcessarSafeMinions(perfil) {
    const p = this.normalizarPerfil(perfil);
    return p === 'escala_minions' || this.perfilEhMaster(perfil) || this.perfilEhCco(perfil);
  },

  podeAcessarSafeMinions() {
    if (this.eSuperadmin()) return true;
    return this.perfilPodeAcessarSafeMinions(this.getPerfil());
  },

  podeAcessarProgressoAlunos() {
    if (this.eSuperadmin()) return true;
    return this.eAdminCompleto();
  },

  podeAcessarCadastroAlunos() {
    if (this.eSuperadmin()) return true;
    return this.perfilEhMaster(this.getPerfil());
  },

  eUsuarioExclusivoCco() {
    return this.perfilEhCco(this.getPerfil());
  },

  eUsuarioExclusivoControleGastos() {
    return this.normalizarPerfil(this.getPerfil()) === 'controle_gastos_visualizacao';
  },

  eUsuarioExclusivoEscalaMinions() {
    return this.normalizarPerfil(this.getPerfil()) === 'escala_minions';
  },

  paginaInicial() {
    return 'inicio.html';
  },

  eSomenteLeitura() {
    const s = this.getSessao();
    return s && this.perfilSomenteLeitura(s.perfil);
  },

  podeEditar() { return this.estaLogado() && !this.eSomenteLeitura(); },

  podeGerenciarBases() {
    return this.estaLogado() && this.eAdminCompleto();
  },

  normalizarPerfil(perfil) {
    return String(perfil || '').trim().toLowerCase().replace(/-/g, '_');
  },

  perfilEhAdmin(perfil) {
    const p = this.normalizarPerfil(perfil);
    return p === 'master' || p === 'admin' || p === 'admin_readonly' ||
      p === 'admin_visualizacao' || p === 'financeiro';
  },

  perfilEhMaster(perfil) {
    return this.normalizarPerfil(perfil) === 'master';
  },

  perfilSomenteLeitura(perfil) {
    const p = this.normalizarPerfil(perfil);
    return p === 'admin_readonly' || p === 'admin_visualizacao' ||
      p === 'financeiro' || p === 'controle_gastos_visualizacao';
  },

  perfilPodeAcessarFinanceiro(perfil, email) {
    const p = this.normalizarPerfil(perfil);
    if (p === 'master') return true;
    if (p === 'controle_gastos_visualizacao') return true;
    return p === 'financeiro' &&
      String(email || '').trim().toLowerCase() === 'elaine.souza@voesafe.com.br';
  },

  podeAcessarFinanceiro() {
    if (this.eSuperadmin()) return true;
    return this.perfilPodeAcessarFinanceiro(this.getPerfil(), this.getEmail());
  },

  podeEditarFinanceiro() {
    if (this.eSuperadmin()) return true;
    const p = this.normalizarPerfil(this.getPerfil());
    if (p === 'master') return true;
    return p === 'financeiro' &&
      String(this.getEmail() || '').trim().toLowerCase() === 'elaine.souza@voesafe.com.br';
  },

  perfilPodeAcessarFechamentoHoras(perfil, email) {
    const p = this.normalizarPerfil(perfil);
    if (p === 'master' || p === 'admin') return true;
    return p === 'financeiro' &&
      String(email || '').trim().toLowerCase() === 'elaine.souza@voesafe.com.br';
  },

  podeAcessarFechamentoHoras() {
    if (this.eSuperadmin()) return true;
    return this.perfilPodeAcessarFechamentoHoras(this.getPerfil(), this.getEmail());
  },

  descricaoPerfil(perfil) {
    const p = this.normalizarPerfil(perfil);
    if (p === 'cco_admin') return 'Administrador CCO';
    if (p === 'cco_financeiro') return 'Financeiro CCO';
    if (p === 'cco_user') return 'Operador CCO';
    if (this.perfilEhMaster(perfil)) return 'Master TI';
    if (p === 'financeiro') return 'Financeiro';
    if (p === 'controle_gastos_visualizacao') return 'Controle de Gastos · Visualização';
    if (p === 'escala_minions') return 'Escala & SAFE MINIONS';
    if (this.perfilSomenteLeitura(perfil)) return 'Visualização';
    if (this.perfilEhAdmin(perfil))        return 'Administrador';
    return 'Consultor Comercial';
  },

  getPac()    { return this.getSessao()?.pac    || null; },
  getPerfil() { return this.getSessao()?.perfil || null; },
  getNome()   { return this.getSessao()?.nome   || null; },
  getEmail()  { return this.getSessao()?.email  || null; },

  logout() {
    this.limparSessao();
    localStorage.removeItem('safe_return_to');
    window.location.href = 'index.html';
  },

  expirarSessaoServidor() {
    this.limparSessao();
    this.irParaLogin();
  },

  // Guarda a página atual e manda para o login; após autenticar,
  // paginaAposLogin() devolve o usuário para onde ele estava.
  irParaLogin() {
    try {
      const atual = window.location.pathname.split('/').pop();
      if (atual && atual !== 'index.html') {
        localStorage.setItem('safe_return_to', atual + window.location.search);
      }
    } catch {}
    window.location.href = 'index.html';
    return false;
  },

  paginaAposLogin() {
    try {
      const alvo = localStorage.getItem('safe_return_to');
      localStorage.removeItem('safe_return_to');
      if (alvo) return alvo;
    } catch {}
    return this.paginaInicial();
  },

  urlAcessoNegado(recurso, destino = '') {
    const params = new URLSearchParams();
    if (recurso) params.set('recurso', recurso);
    if (destino) params.set('destino', destino);
    return `acesso-negado.html?${params.toString()}`;
  },

  negarAcesso(recurso, destino = '') {
    window.location.replace(this.urlAcessoNegado(recurso, destino));
    return false;
  },

  proteger(adminOnly = false) {
    if (!this.estaLogado()) return this.irParaLogin();
    const destino = window.location.pathname.split('/').pop();
    if (this.eUsuarioExclusivoCco() &&
        destino !== 'inicio.html' &&
        destino !== 'escala-cco.html' &&
        destino !== 'safe-minions.html' &&
        destino !== 'bases.html' &&
        destino !== 'acesso-negado.html') {
      window.location.replace('inicio.html');
      return false;
    }
    if (this.eUsuarioExclusivoControleGastos() &&
        destino !== 'inicio.html' &&
        destino !== 'controle-gastos.html' &&
        destino !== 'acesso-negado.html') {
      window.location.replace('inicio.html');
      return false;
    }
    if (this.eUsuarioExclusivoEscalaMinions() &&
        destino !== 'inicio.html' &&
        destino !== 'escala-cco.html' &&
        destino !== 'horas-voadas-inva.html' &&
        destino !== 'safe-minions.html' &&
        destino !== 'acesso-negado.html') {
      window.location.replace('inicio.html');
      return false;
    }
    if (adminOnly && !this.eAdmin()) {
      const recursos = {
        'admin.html': 'Usuários',
        'faturamento.html': 'Faturamento',
        'concorrencia.html': 'Concorrência'
      };
      return this.negarAcesso(recursos[destino] || 'Administração', destino);
    }
    return true;
  },

  protegerEscalaCco() {
    if (!this.estaLogado()) return this.irParaLogin();
    if (!this.podeAcessarEscalaCco()) {
      return this.negarAcesso('Escala CCO', 'escala-cco.html');
    }
    return true;
  },

  protegerEscalaPav() {
    if (!this.estaLogado()) return this.irParaLogin();
    if (!this.podeAcessarEscalaPav()) {
      return this.negarAcesso('Escala PAV de Base', 'escala-pav.html');
    }
    return true;
  },

  protegerHorasVoadasInva() {
    if (!this.estaLogado()) return this.irParaLogin();
    if (!this.podeAcessarHorasVoadasInva()) {
      return this.negarAcesso('Horas Voadas INVA Mês', 'horas-voadas-inva.html');
    }
    return true;
  },

  protegerMaster() {
    if (!this.proteger()) return false;
    if (!this.perfilEhMaster(this.getPerfil())) {
      return this.negarAcesso('SAFE MINIONS', 'safe-minions.html');
    }
    return true;
  },

  protegerSafeMinions() {
    if (!this.proteger()) return false;
    if (!this.podeAcessarSafeMinions()) {
      return this.negarAcesso('SAFE MINIONS', 'safe-minions.html');
    }
    return true;
  },

  protegerProgressoAlunos() {
    if (!this.proteger()) return false;
    if (!this.podeAcessarProgressoAlunos()) {
      return this.negarAcesso('Progresso de Alunos', 'progresso-alunos.html');
    }
    return true;
  },

  protegerCadastroAlunos() {
    if (!this.proteger()) return false;
    if (!this.podeAcessarCadastroAlunos()) {
      return this.negarAcesso('Cadastro de Aluno', 'cadastro-alunos.html');
    }
    return true;
  },

  protegerGestaoUsuarios() {
    if (!this.proteger()) return false;
    if (!this.eSuperadmin()) {
      return this.negarAcesso('Gestão central de usuários', 'admin.html');
    }
    return true;
  },

  protegerControleAcesso() {
    if (!this.proteger()) return false;
    if (!this.eSuperadmin()) {
      return this.negarAcesso('Controle de Acesso', 'access-control.html');
    }
    return true;
  },

  protegerFinanceiro() {
    if (!this.proteger()) return false;
    if (!this.podeAcessarFinanceiro()) {
      return this.negarAcesso('Controle de Gastos', 'controle-gastos.html');
    }
    return true;
  },

  protegerFechamentoHoras() {
    if (!this.proteger()) return false;
    if (!this.podeAcessarFechamentoHoras()) {
      return this.negarAcesso(
        'Fechamento de Horas / Cotistas',
        'fechamento-horas.html'
      );
    }
    return true;
  },

  // Login por e-mail
  async login(email, senha) {
    const res = await API.post('login', { email, senha });
    if (res.ok) this.salvarSessao(res.data);
    return res;
  },

  async alterarSenha(senhaAtual, novaSenha) {
    const sessao = this.getSessao();
    return await API.post('alterar-senha', {
      email: sessao.email,
      senhaAtual,
      novaSenha
    });
  },

  // ── Ícones SVG da sidebar ─────────────────────────────────
  iconSvg(nome) {
    const base = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    const icons = {
      inicio:       `<svg ${base}><path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path></svg>`,
      dashboard:    `<svg ${base}><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect></svg>`,
      vendas:       `<svg ${base}><path d="M4 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>`,
      faturamento:  `<svg ${base}><rect x="3" y="6" width="18" height="14" rx="2"></rect><path d="M16 10h5"></path><path d="M7 6V4h10v2"></path><path d="M7 14h4"></path></svg>`,
      concorrencia: `<svg ${base}><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path></svg>`,
      usuarios:     `<svg ${base}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
      acesso:       `<svg ${base}><path d="M20 7h-9"></path><circle cx="7" cy="7" r="4"></circle><path d="M15 7v4"></path><path d="M18 7v3"></path><rect x="4" y="15" width="16" height="6" rx="2"></rect><path d="M8 18h.01"></path></svg>`,
      gastos:       `<svg ${base}><path d="M3 6h18"></path><path d="M7 3v6"></path><path d="M17 3v6"></path><rect x="3" y="6" width="18" height="15" rx="2"></rect><path d="M8 12h3"></path><path d="M8 16h5"></path><path d="M16 12v4"></path><path d="M14 14h4"></path></svg>`,
      horas:        `<svg ${base}><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path><path d="M5 3 2 6"></path><path d="m19 3 3 3"></path></svg>`,
      escala:       `<svg ${base}><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path><path d="m8 15 2 2 4-4"></path></svg>`,
      minions:      `<svg ${base}><path d="M8 3h8"></path><path d="M9 3v3"></path><path d="M15 3v3"></path><rect x="5" y="6" width="14" height="15" rx="4"></rect><circle cx="10" cy="12" r="2"></circle><circle cx="14" cy="12" r="2"></circle><path d="M8 12h4"></path><path d="M12 12h4"></path><path d="M9 17h6"></path></svg>`,
      academico:    `<svg ${base}><path d="m12 3-9 4.5 9 4.5 9-4.5L12 3Z"></path><path d="M6 8v5c0 2.5 2.7 4 6 4s6-1.5 6-4V8"></path><path d="M21 12v5"></path></svg>`,
      aluno:        `<svg ${base}><path d="M20 21a8 8 0 1 0-16 0"></path><circle cx="12" cy="7" r="4"></circle><path d="M16 11l2 2 4-4"></path></svg>`,
      comercial:     `<svg ${base}><path d="M3 3v18h18"></path><path d="m7 15 4-4 3 3 5-6"></path></svg>`,
      administracao: `<svg ${base}><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 2v4"></path><path d="M16 2v4"></path><path d="M3 9h18"></path></svg>`,
      financeiro:    `<svg ${base}><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h3"></path></svg>`,
      ti:            `<svg ${base}><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path><path d="M8 17h3"></path></svg>`,
      planilha:      `<svg ${base}><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path></svg>`,
      bases:         `<svg ${base}><path d="M3 21h18"></path><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path><path d="M9 7h2"></path><path d="M13 7h2"></path><path d="M9 11h2"></path><path d="M13 11h2"></path><path d="M9 15h2"></path><path d="M13 15h2"></path></svg>`,
      suporte:       `<svg ${base}><circle cx="12" cy="12" r="9"></circle><path d="M9.1 9a3 3 0 1 1 5.7 1.3c-.8 1.1-2.8 1.4-2.8 3.2"></path><path d="M12 17h.01"></path></svg>`,
      chevron:       `<svg ${base}><path d="m9 18 6-6-6-6"></path></svg>`,
      fechar:        `<svg ${base}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`,
      lock:          `<svg ${base}><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>`,
      logout:       `<svg ${base}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>`
    };
    return icons[nome] || '';
  },

  montarMenuSidebar() {
    const nav = document.querySelector('.sidebar-nav');
    const brand = document.querySelector('.sidebar-brand');
    const hamburger = document.getElementById('hamburger');
    if (!nav || !brand) return;

    const path = window.location.pathname.split('/').pop() || 'inicio.html';
    const item = (href, label, icone, opcoes = {}) => {
      const ativo = path === href;
      const permitido = opcoes.permitido !== false;
      const destino = permitido
        ? href
        : this.urlAcessoNegado(label, opcoes.destino || href);
      const externo = opcoes.externo && permitido
        ? ' target="_blank" rel="noopener noreferrer"'
        : '';
      const restrito = permitido
        ? ''
        : `<span class="nav-lock" aria-label="Acesso restrito" title="Acesso restrito">${this.iconSvg('lock')}</span>`;
      return `
        <a href="${destino}" class="nav-item menu-child${ativo ? ' active' : ''}${permitido ? '' : ' restricted'}"${externo}>
          <span class="nav-icon" aria-hidden="true">${this.iconSvg(icone)}</span>
          <span class="nav-label">${label}</span>
          ${restrito}
        </a>
      `;
    };

    const secao = (id, label, icone, conteudo, paginas) => {
      const aberta = paginas.includes(path);
      return `
        <div class="menu-section${aberta ? ' open current' : ''}" data-menu-section="${id}">
          <button class="menu-section-trigger" type="button" aria-expanded="${aberta}">
            <span class="nav-icon" aria-hidden="true">${this.iconSvg(icone)}</span>
            <span class="menu-section-label">${label}</span>
            <span class="menu-section-chevron" aria-hidden="true">${this.iconSvg('chevron')}</span>
          </button>
          <div class="menu-submenu">${conteudo}</div>
        </div>
      `;
    };

    const acessoEscalaCco = this.podeAcessarEscalaCco();
    const acessoHorasVoadasInva = this.podeAcessarHorasVoadasInva();
    const acessoEscalaPav = this.podeAcessarEscalaPav();
    const secaoEscala = secao(
      'escala',
      'Escala',
      'escala',
      item('escala-cco.html', 'Escala CCO', 'escala', {
        permitido: acessoEscalaCco
      }) +
      item('escala-pav.html', 'Escala PAV de Base', 'escala', {
        permitido: acessoEscalaPav
      }) +
      item('horas-voadas-inva.html', 'Horas Voadas INVA Mês', 'horas', {
        permitido: acessoHorasVoadasInva
      }),
      ['escala-cco.html', 'escala-pav.html', 'horas-voadas-inva.html']
    );

    const acessoExclusivoGastos = this.eUsuarioExclusivoControleGastos();
    const acessoExclusivoEscalaMinions = this.eUsuarioExclusivoEscalaMinions();
    const acessoHubPrincipal = !this.eUsuarioExclusivoCco() && !acessoExclusivoGastos;
    const dashboardPermitido = acessoHubPrincipal;
    const dashboardDestino = dashboardPermitido
      ? 'dashboard.html'
      : this.urlAcessoNegado('Dashboard', 'dashboard.html');

    const secoes = acessoExclusivoGastos ? [
      `<a href="inicio.html" class="menu-dashboard${path === 'inicio.html' ? ' active' : ''}">
        <span class="nav-icon" aria-hidden="true">${this.iconSvg('inicio')}</span>
        <span>Início</span>
      </a>`,
      secao(
        'financeiro',
        'Financeiro',
        'financeiro',
        item('controle-gastos.html', 'Controle de Gastos', 'gastos'),
        ['controle-gastos.html']
      )
    ] : acessoExclusivoEscalaMinions ? [
      `<a href="inicio.html" class="menu-dashboard${path === 'inicio.html' ? ' active' : ''}">
        <span class="nav-icon" aria-hidden="true">${this.iconSvg('inicio')}</span>
        <span>Início</span>
      </a>`,
      secaoEscala,
      secao(
        'administracao',
        'Administração',
        'administracao',
        item('safe-minions.html', 'SAFE MINIONS', 'minions'),
        ['safe-minions.html']
      )
    ] : [
      `<a href="inicio.html" class="menu-dashboard${path === 'inicio.html' ? ' active' : ''}">
        <span class="nav-icon" aria-hidden="true">${this.iconSvg('inicio')}</span>
        <span>Início</span>
      </a>`,
      `<a href="${dashboardDestino}" class="menu-dashboard${path === 'dashboard.html' ? ' active' : ''}${dashboardPermitido ? '' : ' restricted'}">
        <span class="nav-icon" aria-hidden="true">${this.iconSvg('dashboard')}</span>
        <span>Dashboard de Vendas</span>
        ${dashboardPermitido ? '' : `<span class="nav-lock" aria-label="Acesso restrito" title="Acesso restrito">${this.iconSvg('lock')}</span>`}
      </a>`,
      secao(
        'comercial',
        'Comercial',
        'comercial',
        item('vendas.html', 'Vendas', 'vendas', {
          permitido: acessoHubPrincipal
        }),
        ['vendas.html']
      ),
      secaoEscala
    ];

    const acessoMaster = this.perfilEhMaster(this.getPerfil());
    const acessoSuperadmin = this.eSuperadmin();
    const acessoSafeMinions = this.podeAcessarSafeMinions();
    const acessoCadastroAlunos = this.podeAcessarCadastroAlunos();
    const acessoAdmin = this.eAdmin();
    const acessoFinanceiro = this.podeAcessarFinanceiro();
    const acessoFechamento = this.podeAcessarFechamentoHoras();
    const acessoProgressoAlunos = this.podeAcessarProgressoAlunos();

    if (!acessoExclusivoGastos && !acessoExclusivoEscalaMinions) secoes.push(secao(
      'portal-aluno',
      'Portal do Aluno',
      'academico',
      item('progresso-alunos.html', 'Progresso de Alunos', 'academico', {
        permitido: acessoProgressoAlunos
      }),
      ['progresso-alunos.html']
    ));

    if (!acessoExclusivoGastos && !acessoExclusivoEscalaMinions) secoes.push(secao(
      'administracao',
      'Administração',
      'administracao',
      item('safe-minions.html', 'SAFE MINIONS', 'minions', {
        permitido: acessoSafeMinions
      }) +
        item('cadastro-alunos.html', 'Cadastro de Aluno', 'aluno', {
          permitido: acessoCadastroAlunos
        }) +
        item(
          'https://docs.google.com/spreadsheets/d/1zUHGTAC8TUhD6v1k-7OLeDQRlj99J0BMbimScZD2SoI/edit?gid=1905416248#gid=1905416248',
          'Planilha',
          'planilha',
          {
            externo: true,
            permitido: acessoMaster,
            destino: 'planilha-administrativa'
          }
        ),
      ['safe-minions.html', 'cadastro-alunos.html']
    ));

    if (!acessoExclusivoGastos && !acessoExclusivoEscalaMinions) secoes.push(secao(
      'financeiro',
      'Financeiro',
      'financeiro',
      item('faturamento.html', 'Faturamento', 'faturamento', {
        permitido: acessoAdmin
      }) +
        item('concorrencia.html', 'Concorrência', 'concorrencia', {
          permitido: acessoAdmin
        }) +
        item('controle-gastos.html', 'Controle de Gastos', 'gastos', {
          permitido: acessoFinanceiro
        }) +
        item('fechamento-horas.html', 'Fechamento de Horas / Cotistas', 'horas', {
          permitido: acessoFechamento
        }),
      [
        'faturamento.html',
        'concorrencia.html',
        'controle-gastos.html',
        'fechamento-horas.html'
      ]
    ));

    if (!acessoExclusivoGastos && !acessoExclusivoEscalaMinions) secoes.push(secao(
      'suporte',
      'Suporte',
      'suporte',
      item('bases.html', 'Bases', 'bases') +
        item('admin.html', 'Usuários', 'usuarios', {
          permitido: acessoSuperadmin
        }) +
        item('access-control.html', 'Controle de Acesso', 'acesso', {
          permitido: acessoSuperadmin
        }),
      ['bases.html', 'admin.html', 'access-control.html']
    ));

    nav.innerHTML = secoes.join('');

    let fechar = brand.querySelector('.sidebar-close');
    if (!fechar) {
      fechar = document.createElement('button');
      fechar.type = 'button';
      fechar.className = 'sidebar-close';
      fechar.setAttribute('aria-label', 'Fechar menu');
      fechar.innerHTML = this.iconSvg('fechar');
      brand.appendChild(fechar);
    }

    hamburger?.setAttribute('aria-label', 'Abrir menu');
    hamburger?.setAttribute('aria-expanded', 'false');
    this.inicializarMenuSidebar();
  },

  inicializarMenuSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('hamburger');
    const fecharMenu = () => {
      sidebar?.classList.remove('mobile-open');
      overlay?.classList.remove('active');
      hamburger?.setAttribute('aria-expanded', 'false');
    };

    document.querySelectorAll('.menu-section-trigger').forEach(botao => {
      botao.addEventListener('click', () => {
        const secao = botao.closest('.menu-section');
        const vaiAbrir = !secao.classList.contains('open');
        document.querySelectorAll('.menu-section.open').forEach(item => {
          item.classList.remove('open');
          item.querySelector('.menu-section-trigger')?.setAttribute('aria-expanded', 'false');
        });
        if (vaiAbrir) {
          secao.classList.add('open');
          botao.setAttribute('aria-expanded', 'true');
        }
      });
    });

    document.querySelector('.sidebar-close')?.addEventListener('click', fecharMenu);
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
      link.addEventListener('click', fecharMenu);
    });
    hamburger?.addEventListener('click', () => {
      setTimeout(() => {
        hamburger.setAttribute(
          'aria-expanded',
          sidebar?.classList.contains('mobile-open') ? 'true' : 'false'
        );
      });
    });
  },

  renderizarIconesSidebar() {
    const porHref = {
      'inicio.html':      'inicio',
      'dashboard.html':   'dashboard',
      'vendas.html':      'vendas',
      'faturamento.html': 'faturamento',
      'concorrencia.html':'concorrencia',
      'admin.html':       'usuarios',
      'access-control.html': 'acesso',
      'controle-gastos.html': 'gastos',
      'fechamento-horas.html': 'horas',
      'escala-cco.html': 'escala',
      'escala-pav.html': 'escala',
      'horas-voadas-inva.html': 'horas',
      'safe-minions.html': 'minions',
      'cadastro-alunos.html': 'aluno',
      'bases.html': 'bases',
      'progresso-alunos.html': 'academico'
    };
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = (item.getAttribute('href') || '').split('/').pop();
      const nome = porHref[href];
      const alvo = item.querySelector('.nav-icon');
      if (!nome || !alvo) return;
      alvo.innerHTML = this.iconSvg(nome);
      alvo.setAttribute('aria-hidden', 'true');
    });
  },

  prepararLogoutSidebar() {
    const usuario = document.querySelector('.sidebar-user');
    const footer  = document.querySelector('.sidebar-footer');
    if (!usuario || !footer) return;

    if (usuario.id === 'btn-logout') {
      usuario.id = 'sidebar-user-current';
      usuario.removeAttribute('title');
    }

    if (!document.getElementById('btn-logout')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id   = 'btn-logout';
      btn.className = 'sidebar-logout';
      btn.innerHTML = `
        <span class="sidebar-logout-icon" aria-hidden="true">${this.iconSvg('logout')}</span>
        <span class="sidebar-logout-label">Sair</span>
      `;
      footer.appendChild(btn);
    }
    this.inicializarLogoutSidebar();
  },

  inicializarLogoutSidebar() {
    const btn = document.getElementById('btn-logout');
    if (!btn || btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => this._confirmarLogout());
  },

  // Modal de confirmação de logout (sem confirm() nativo)
  _confirmarLogout() {
    const existing = document.getElementById('modal-logout-confirm');
    if (existing) { existing.remove(); }

    const overlay = document.createElement('div');
    overlay.id = 'modal-logout-confirm';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:360px">
        <div class="modal-header">
          <h3 style="font-size:1rem">Sair do SAFE Hub?</h3>
          <button class="modal-close" id="ml-fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" style="padding-top:12px;padding-bottom:8px">
          <p style="font-size:.9rem;color:var(--gray-500)">Você será redirecionado para a página de login.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" id="ml-cancelar">Cancelar</button>
          <button class="btn btn-danger btn-sm" id="ml-sair">Sair</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const fechar = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 250); };
    overlay.querySelector('#ml-fechar').addEventListener('click', fechar);
    overlay.querySelector('#ml-cancelar').addEventListener('click', fechar);
    overlay.querySelector('#ml-sair').addEventListener('click', () => this.logout());
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
  },

  aplicarMarcaHub() {
    const paginaInicial = this.paginaInicial();

    document.querySelectorAll('.topbar-left').forEach(topbarLeft => {
      if (topbarLeft.querySelector('.topbar-brand-link')) return;

      const contexto = Array.from(topbarLeft.children).find(
        el => !el.classList.contains('hamburger')
      );
      if (contexto) contexto.classList.add('topbar-context');

      const link = document.createElement('a');
      link.className = 'topbar-brand-link';
      link.href = paginaInicial;
      link.setAttribute('aria-label', 'Ir para a página inicial');
      link.innerHTML = '<img src="assets/img/safe-logo-horizontal.png" alt="SAFE Escola de Aviação">';

      const divisor = document.createElement('span');
      divisor.className = 'topbar-brand-divider';
      divisor.setAttribute('aria-hidden', 'true');

      const hamburger = topbarLeft.querySelector('.hamburger');
      if (hamburger) {
        hamburger.insertAdjacentElement('afterend', link);
      } else {
        topbarLeft.prepend(link);
      }
      if (contexto) link.insertAdjacentElement('afterend', divisor);
    });
  },

  fixarTopbar() {
    const topbar = document.querySelector('.main > .topbar');
    if (!topbar || topbar.dataset.fixedReady === 'true') return;

    topbar.dataset.fixedReady = 'true';
    const atualizarAltura = () => {
      document.documentElement.style.setProperty(
        '--topbar-current-h',
        `${Math.ceil(topbar.getBoundingClientRect().height)}px`
      );
    };

    atualizarAltura();
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(atualizarAltura);
      observer.observe(topbar);
      topbar._safeResizeObserver = observer;
    } else {
      window.addEventListener('resize', atualizarAltura);
    }
  },

  preencherUI() {
    const sessao = this.getSessao();
    if (!sessao) return;

    this.aplicarMarcaHub();
    this.fixarTopbar();
    this.montarMenuSidebar();
    this.prepararLogoutSidebar();

    document.querySelectorAll('.sidebar-avatar').forEach(el => {
      el.textContent = sessao.nome.charAt(0).toUpperCase();
    });
    document.querySelectorAll('.sidebar-user-name').forEach(el => {
      el.textContent = sessao.nome;
    });
    document.querySelectorAll('.sidebar-user-role').forEach(el => {
      el.textContent = this.eSuperadmin() ? 'Superadmin' : this.descricaoPerfil(sessao.perfil);
    });

    if (!this.eAdmin()) {
      document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
    } else {
      document.querySelectorAll('[data-pac-only]').forEach(el => el.style.display = 'none');
    }

    // Itens visíveis apenas para o perfil Master TI
    if (!this.perfilEhMaster(sessao.perfil)) {
      document.querySelectorAll('[data-master-only]').forEach(el => el.style.display = 'none');
    }

    if (!this.podeAcessarFinanceiro()) {
      document.querySelectorAll('[data-finance-only]').forEach(el => el.style.display = 'none');
    }

    if (!this.podeEditar()) {
      document.querySelectorAll('[data-write-only]').forEach(el => el.style.display = 'none');
    }

  }
};
