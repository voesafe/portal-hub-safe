// ============================================================
// auth.js — Autenticação, sessão e proteção de rotas
// SAFE Hub — login por e-mail
// ============================================================

const Auth = {

  salvarSessao(usuario) {
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(usuario));
  },

  getSessao() {
    try {
      const raw = sessionStorage.getItem(CONFIG.SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  estaLogado() { return !!this.getSessao(); },

  eAdmin() {
    const s = this.getSessao();
    return s && this.perfilEhAdmin(s.perfil);
  },

  eAdminCompleto() {
    const s = this.getSessao();
    const p = this.normalizarPerfil(s?.perfil);
    return s && (p === 'admin' || p === 'master');
  },

  perfilEhCco(perfil) {
    return this.normalizarPerfil(perfil).startsWith('cco_');
  },

  perfilPodeAcessarEscalaCco(perfil) {
    const p = this.normalizarPerfil(perfil);
    return p === 'admin' || p === 'master' || this.perfilEhCco(p);
  },

  podeAcessarEscalaCco() {
    return this.perfilPodeAcessarEscalaCco(this.getPerfil());
  },

  eUsuarioExclusivoCco() {
    return this.perfilEhCco(this.getPerfil());
  },

  paginaInicial() {
    return 'inicio.html';
  },

  eSomenteLeitura() {
    const s = this.getSessao();
    return s && this.perfilSomenteLeitura(s.perfil);
  },

  podeEditar() { return this.estaLogado() && !this.eSomenteLeitura(); },

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
    return p === 'admin_readonly' || p === 'admin_visualizacao' || p === 'financeiro';
  },

  perfilPodeAcessarFinanceiro(perfil, email) {
    const p = this.normalizarPerfil(perfil);
    if (p === 'master') return true;
    return p === 'financeiro' &&
      String(email || '').trim().toLowerCase() === 'elaine.souza@voesafe.com.br';
  },

  podeAcessarFinanceiro() {
    return this.perfilPodeAcessarFinanceiro(this.getPerfil(), this.getEmail());
  },

  podeEditarFinanceiro() {
    return this.estaLogado() && this.podeAcessarFinanceiro();
  },

  perfilPodeAcessarFechamentoHoras(perfil, email) {
    const p = this.normalizarPerfil(perfil);
    if (p === 'master' || p === 'admin') return true;
    return p === 'financeiro' &&
      String(email || '').trim().toLowerCase() === 'elaine.souza@voesafe.com.br';
  },

  podeAcessarFechamentoHoras() {
    return this.perfilPodeAcessarFechamentoHoras(this.getPerfil(), this.getEmail());
  },

  descricaoPerfil(perfil) {
    const p = this.normalizarPerfil(perfil);
    if (p === 'cco_admin') return 'Administrador CCO';
    if (p === 'cco_financeiro') return 'Financeiro CCO';
    if (p === 'cco_user') return 'Operador CCO';
    if (this.perfilEhMaster(perfil)) return 'Master TI';
    if (p === 'financeiro') return 'Financeiro';
    if (this.perfilSomenteLeitura(perfil)) return 'Visualização';
    if (this.perfilEhAdmin(perfil))        return 'Administrador';
    return 'Consultor Comercial';
  },

  getPac()    { return this.getSessao()?.pac    || null; },
  getPerfil() { return this.getSessao()?.perfil || null; },
  getNome()   { return this.getSessao()?.nome   || null; },
  getEmail()  { return this.getSessao()?.email  || null; },

  logout() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem('cco_session');
    window.location.href = 'index.html';
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
    if (!this.estaLogado()) { window.location.href = 'index.html'; return false; }
    const destino = window.location.pathname.split('/').pop();
    if (this.eUsuarioExclusivoCco() &&
        destino !== 'inicio.html' &&
        destino !== 'escala-cco.html' &&
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
    if (!this.estaLogado()) {
      window.location.replace('index.html');
      return false;
    }
    if (!this.podeAcessarEscalaCco()) {
      return this.negarAcesso('Escala CCO', 'escala-cco.html');
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

  protegerGestaoUsuarios() {
    if (!this.proteger()) return false;
    if (!this.perfilEhMaster(this.getPerfil())) {
      return this.negarAcesso('Gestão central de usuários', 'admin.html');
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
      gastos:       `<svg ${base}><path d="M3 6h18"></path><path d="M7 3v6"></path><path d="M17 3v6"></path><rect x="3" y="6" width="18" height="15" rx="2"></rect><path d="M8 12h3"></path><path d="M8 16h5"></path><path d="M16 12v4"></path><path d="M14 14h4"></path></svg>`,
      horas:        `<svg ${base}><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path><path d="M5 3 2 6"></path><path d="m19 3 3 3"></path></svg>`,
      escala:       `<svg ${base}><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path><path d="m8 15 2 2 4-4"></path></svg>`,
      minions:      `<svg ${base}><path d="M8 3h8"></path><path d="M9 3v3"></path><path d="M15 3v3"></path><rect x="5" y="6" width="14" height="15" rx="4"></rect><circle cx="10" cy="12" r="2"></circle><circle cx="14" cy="12" r="2"></circle><path d="M8 12h4"></path><path d="M12 12h4"></path><path d="M9 17h6"></path></svg>`,
      comercial:     `<svg ${base}><path d="M3 3v18h18"></path><path d="m7 15 4-4 3 3 5-6"></path></svg>`,
      administracao: `<svg ${base}><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 2v4"></path><path d="M16 2v4"></path><path d="M3 9h18"></path></svg>`,
      financeiro:    `<svg ${base}><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h3"></path></svg>`,
      ti:            `<svg ${base}><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path><path d="M8 17h3"></path></svg>`,
      planilha:      `<svg ${base}><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path></svg>`,
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
    const secaoEscala = secao(
      'escala',
      'Escala',
      'escala',
      item('escala-cco.html', 'Escala CCO', 'escala', {
        permitido: acessoEscalaCco
      }),
      ['escala-cco.html']
    );

    const acessoHubPrincipal = !this.eUsuarioExclusivoCco();
    const dashboardPermitido = acessoHubPrincipal;
    const dashboardDestino = dashboardPermitido
      ? 'dashboard.html'
      : this.urlAcessoNegado('Dashboard', 'dashboard.html');

    const secoes = [
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
    const acessoAdmin = this.eAdmin();
    const acessoFinanceiro = this.podeAcessarFinanceiro();
    const acessoFechamento = this.podeAcessarFechamentoHoras();

    secoes.push(secao(
      'administracao',
      'Administração',
      'administracao',
      item('safe-minions.html', 'SAFE MINIONS', 'minions', {
        permitido: acessoMaster
      }) +
        item(
          'https://docs.google.com/spreadsheets/d/1LZ2z3yLZvIdw2h0FohhwoiYLEGwy9zz7CYL40_j2AVw/edit?gid=1905416248#gid=1905416248',
          'Planilha',
          'planilha',
          {
            externo: true,
            permitido: acessoMaster,
            destino: 'planilha-administrativa'
          }
        ),
      ['safe-minions.html']
    ));

    secoes.push(secao(
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

    secoes.push(secao(
      'ti',
      'T.I.',
      'ti',
      item('admin.html', 'Usuários', 'usuarios', {
        permitido: acessoMaster
      }),
      ['admin.html']
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
      'controle-gastos.html': 'gastos',
      'fechamento-horas.html': 'horas',
      'escala-cco.html': 'escala',
      'safe-minions.html': 'minions'
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

  preencherUI() {
    const sessao = this.getSessao();
    if (!sessao) return;

    this.aplicarMarcaHub();
    this.montarMenuSidebar();
    this.prepararLogoutSidebar();

    document.querySelectorAll('.sidebar-avatar').forEach(el => {
      el.textContent = sessao.nome.charAt(0).toUpperCase();
    });
    document.querySelectorAll('.sidebar-user-name').forEach(el => {
      el.textContent = sessao.nome;
    });
    document.querySelectorAll('.sidebar-user-role').forEach(el => {
      el.textContent = this.descricaoPerfil(sessao.perfil);
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
