// ============================================================
// auth.js — Autenticação, sessão e proteção de rotas
// SAFE Hub — login por e-mail
// ============================================================

const Auth = {
  SESSION_MAX_MS: 12 * 60 * 60 * 1000,
  SESSION_TIMEZONE: 'America/Sao_Paulo',

  // Feature flag do módulo NOTAMs. Mantém OFF até: (1) backend promovido a @28
  // (rota `notams`) e (2) chave AISWEB/DECEA configurada. Com OFF, a entrada
  // `notams.html` é removida de PAGINAS (fonte única) → some do menu e o acesso
  // direto é bloqueado por protegerPagina. Ligar = trocar para true.
  NOTAMS_ATIVO: false,

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

  // "Gestor" = enxerga dados de todos (escopo de dados, NÃO é guarda de página).
  // Base agora é RBAC (permissões efetivas), com fallback ao perfil legado.
  eAdmin() {
    if (!this.estaLogado()) return false;
    if (this.eSuperadmin()) return true;
    if (this.temAlgumaPermissao([
      'vendas.visualizar_todas',
      'dashboard_vendas.visualizar_todos',
      'usuarios.visualizar'
    ])) return true;
    return this.perfilEhAdmin(this.getPerfil());
  },

  eAdminCompleto() {
    if (!this.estaLogado()) return false;
    if (this.eSuperadmin()) return true;
    if (this.temAlgumaPermissao(['vendas.visualizar_todas', 'faturamento.visualizar'])) return true;
    const p = this.normalizarPerfil(this.getPerfil());
    return p === 'admin' || p === 'master';
  },

  eSuperadmin() {
    const s = this.getSessao();
    return !!(s && (s.superadmin === true || String(s.superadmin).toLowerCase() === 'true' || this.perfilEhMaster(s.perfil)));
  },

  permissoesEfetivas() {
    const s = this.getSessao();
    if (!Array.isArray(s?.permissoesEfetivas)) return [];
    return s.permissoesEfetivas.map(id => String(id || '').trim()).filter(Boolean);
  },

  temPermissao(permissaoId) {
    if (this.eSuperadmin()) return true;
    const id = String(permissaoId || '').trim();
    return !!id && this.permissoesEfetivas().includes(id);
  },

  temAlgumaPermissao(permissoes) {
    return Array.isArray(permissoes) && permissoes.some(id => this.temPermissao(id));
  },

  // ══════════════════════════════════════════════════════════
  // RBAC — Controle de acesso por permissões efetivas
  // ----------------------------------------------------------
  // Fonte ÚNICA de verdade: `permissoesEfetivas` da sessão (vinda
  // dos grupos + permissões avulsas calculados no backend).
  // Cada página é liberada por permissões de VISUALIZAÇÃO (`ver`)
  // e cada ação de escrita por permissões de EDIÇÃO (`editar`).
  // Superadmin/Master ignoram tudo (bypass em temPermissao/eSuperadmin).
  // ══════════════════════════════════════════════════════════
  PAGINAS: {
    'inicio.html':            { ver: ['inicio.visualizar'], publica: true },
    'notams.html':            { publica: true },  // NOTAMs: global p/ todos os logados (backend só exige sessão)
    'dashboard.html':         { ver: ['dashboard_vendas.visualizar_proprio', 'dashboard_vendas.visualizar_todos'] },
    'vendas.html':            { ver: ['vendas.visualizar_proprias', 'vendas.visualizar_todas'],
                                editar: ['vendas.criar_propria', 'vendas.criar_para_qualquer_pac', 'vendas.editar_propria', 'vendas.editar_todas', 'vendas.excluir_propria', 'vendas.excluir_todas'] },
    'faturamento.html':       { ver: ['faturamento.visualizar', 'faturamento.visualizar_resumo'],
                                editar: ['faturamento.lancar_valores', 'faturamento.editar_valores', 'faturamento.excluir_lancamento'] },
    'concorrencia.html':      { ver: ['concorrencia.visualizar'],
                                editar: ['concorrencia.criar_concorrente', 'concorrencia.editar_concorrente', 'concorrencia.excluir_concorrente', 'concorrencia.editar_precos_safe'] },
    'controle-gastos.html':   { ver: ['controle_gastos.visualizar'],
                                editar: ['controle_gastos.editar_gastos', 'controle_gastos.editar_receitas', 'controle_gastos.editar_horas_voadas', 'controle_gastos.criar_categoria', 'controle_gastos.editar_categoria', 'controle_gastos.ativar_inativar_categoria'] },
    'fechamento-horas.html':  { ver: ['fechamento_horas.visualizar'],
                                editar: ['fechamento_horas.editar', 'fechamento_horas.importar_cavok', 'fechamento_horas.fechar_mes', 'fechamento_horas.reabrir_mes'] },
    'escala-cco.html':        { ver: ['escala_cco.visualizar_calendario'],
                                editar: ['escala_cco.editar_propria_escala', 'escala_cco.editar_escala', 'escala_cco.editar_valor_turno', 'escala_cco.gerenciar_funcionarios'] },
    'escala-pav.html':        { ver: ['escala_pav.visualizar_calendario', 'escala_pav.visualizar_financeiro'],
                                editar: ['escala_pav.editar_escala', 'escala_pav.gerenciar_pavs', 'escala_pav.inativar_reativar_pav'] },
    'horas-voadas-inva.html': { ver: ['horas_inva.visualizar'],
                                editar: ['horas_inva.sincronizar_cavok', 'horas_inva.cadastrar_instrutor'] },
    'progresso-alunos.html':  { ver: ['progresso_alunos.visualizar'] },
    'cadastro-alunos.html':   { ver: ['cadastro_alunos.visualizar'],
                                editar: ['cadastro_alunos.importar_xls_cavok', 'cadastro_alunos.marcar_s141', 'cadastro_alunos.sincronizar_trello', 'cadastro_alunos.inativar', 'cadastro_alunos.reativar'] },
    'safe-minions.html':      { ver: ['safe_minions.visualizar'],
                                editar: ['safe_minions.processar_arquivo_local'] },
    'bases.html':             { ver: ['bases.visualizar'],
                                editar: ['bases.criar', 'bases.editar', 'bases.inativar_reativar'] },
    'admin.html':             { ver: ['usuarios.visualizar', 'usuarios.criar', 'usuarios.editar'],
                                editar: ['usuarios.criar', 'usuarios.editar', 'usuarios.inativar_reativar', 'usuarios.redefinir_senha'] },
    'access-control.html':    { ver: ['usuarios.gerenciar_grupos', 'usuarios.gerenciar_permissoes'],
                                editar: ['usuarios.gerenciar_grupos', 'usuarios.gerenciar_permissoes'] }
  },

  ROTULOS_PAGINA: {
    'notams.html': 'NOTAMs',
    'dashboard.html': 'Dashboard de Vendas',
    'vendas.html': 'Vendas',
    'faturamento.html': 'Faturamento',
    'concorrencia.html': 'Concorrência',
    'controle-gastos.html': 'Controle de Gastos',
    'fechamento-horas.html': 'Fechamento de Horas',
    'escala-cco.html': 'Escala CCO',
    'escala-pav.html': 'Escala PAV de Base',
    'horas-voadas-inva.html': 'Horas Voadas INVA Mês',
    'progresso-alunos.html': 'Progresso de Alunos',
    'cadastro-alunos.html': 'Cadastro de Aluno',
    'safe-minions.html': 'SAFE MINIONS',
    'bases.html': 'Bases',
    'admin.html': 'Gestão de Usuários',
    'access-control.html': 'Controle de Acesso'
  },

  paginaAtual() {
    try { return (window.location.pathname.split('/').pop() || 'inicio.html').toLowerCase(); }
    catch { return ''; }
  },

  rotuloPagina(pagina) {
    return this.ROTULOS_PAGINA[pagina || this.paginaAtual()] || 'esta página';
  },

  configPagina(pagina) {
    return this.PAGINAS[pagina || this.paginaAtual()] || null;
  },

  // Pode VER a página (aparece no menu / passa no guarda de rota).
  podeVer(pagina) {
    if (this.eSuperadmin()) return true;
    const cfg = this.configPagina(pagina);
    if (!cfg) return this.estaLogado();   // sem regra = liberado a logados
    if (cfg.publica) return this.estaLogado();
    return this.temAlgumaPermissao(cfg.ver || []);
  },

  // Pode EDITAR na página atual (ou informada): tem alguma permissão de escrita.
  podeEditar(pagina) {
    if (!this.estaLogado()) return false;
    if (this.eSuperadmin()) return true;
    const cfg = this.configPagina(pagina);
    if (!cfg) return !this.perfilSomenteLeitura(this.getPerfil());
    return this.temAlgumaPermissao(cfg.editar || []);
  },

  eSomenteLeitura(pagina) {
    if (!this.estaLogado()) return true;
    if (this.eSuperadmin()) return false;
    const cfg = this.configPagina(pagina);
    if (!cfg || !Array.isArray(cfg.editar) || !cfg.editar.length) {
      return this.perfilSomenteLeitura(this.getPerfil());
    }
    return !this.temAlgumaPermissao(cfg.editar);
  },

  // ── Wrappers de acesso por página (nomes mantidos p/ compatibilidade) ──
  podeAcessarEscalaCco()       { return this.podeVer('escala-cco.html'); },
  podeAcessarEscalaPav()       { return this.podeVer('escala-pav.html'); },
  podeAcessarHorasVoadasInva() { return this.podeVer('horas-voadas-inva.html'); },
  podeAcessarSafeMinions()     { return this.podeVer('safe-minions.html'); },
  podeAcessarProgressoAlunos() { return this.podeVer('progresso-alunos.html'); },
  podeAcessarCadastroAlunos()  { return this.podeVer('cadastro-alunos.html'); },
  podeAcessarFinanceiro()      { return this.podeVer('controle-gastos.html'); },
  podeAcessarFechamentoHoras() { return this.podeVer('fechamento-horas.html'); },
  podeEditarFinanceiro()       { return this.podeEditar('controle-gastos.html'); },
  podeGerenciarBases()         { return this.podeEditar('bases.html'); },

  // ── Perfil "exclusivo": mantido só para comportamentos internos de
  //    algumas páginas (ex.: escala-cco.html, controle-gastos.js). NÃO
  //    comanda mais o menu nem os guardas de rota. ──
  perfilEhCco(perfil) {
    return this.normalizarPerfil(perfil).startsWith('cco_');
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

  // ── Helpers de perfil mantidos APENAS para exibição (badges/rótulos) ──
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

  // Guarda base: valida login e, por defesa em profundidade, aplica a
  // permissão de visualização da própria página (se ela estiver no mapa).
  // `adminOnly` foi mantido só por compatibilidade de assinatura — o acesso
  // agora é 100% RBAC via PAGINAS.
  proteger(adminOnly = false) {
    if (!this.estaLogado()) return this.irParaLogin();
    const destino = this.paginaAtual();
    if (this.PAGINAS[destino] && !this.podeVer(destino)) {
      return this.negarAcesso(this.rotuloPagina(destino), destino);
    }
    return true;
  },

  // Guarda genérico por página, dirigido pelo mapa RBAC.
  protegerPagina(pagina, rotulo) {
    if (!this.estaLogado()) return this.irParaLogin();
    if (!this.podeVer(pagina)) {
      return this.negarAcesso(rotulo || this.rotuloPagina(pagina), pagina);
    }
    return true;
  },

  protegerEscalaCco()       { return this.protegerPagina('escala-cco.html', 'Escala CCO'); },
  protegerEscalaPav()       { return this.protegerPagina('escala-pav.html', 'Escala PAV de Base'); },
  protegerHorasVoadasInva() { return this.protegerPagina('horas-voadas-inva.html', 'Horas Voadas INVA Mês'); },
  protegerSafeMinions()     { return this.protegerPagina('safe-minions.html', 'SAFE MINIONS'); },
  protegerProgressoAlunos() { return this.protegerPagina('progresso-alunos.html', 'Progresso de Alunos'); },
  protegerCadastroAlunos()  { return this.protegerPagina('cadastro-alunos.html', 'Cadastro de Aluno'); },
  protegerFinanceiro()      { return this.protegerPagina('controle-gastos.html', 'Controle de Gastos'); },
  protegerFechamentoHoras() { return this.protegerPagina('fechamento-horas.html', 'Fechamento de Horas / Cotistas'); },
  protegerGestaoUsuarios()  { return this.protegerPagina('admin.html', 'Gestão central de usuários'); },
  protegerControleAcesso()  { return this.protegerPagina('access-control.html', 'Controle de Acesso'); },

  protegerMaster() {
    if (!this.proteger()) return false;
    if (!this.eSuperadmin() && !this.perfilEhMaster(this.getPerfil())) {
      return this.negarAcesso('SAFE MINIONS', 'safe-minions.html');
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
      logout:       `<svg ${base}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>`,
      notam:        `<svg ${base}><path d="M2 12l20-8-4 18-6-6-4 4z"></path><path d="M12 16l-2-2"></path></svg>`
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

    // Sidebar 100% RBAC: cada item aparece só se o usuário PODE VER a página;
    // seção sem nenhum item permitido não é renderizada.
    const ver = (pagina) => this.podeVer(pagina);
    // Monta uma seção só quando há ao menos um item permitido dentro dela.
    const secaoSeTiver = (id, label, icone, itensDef, paginas) => {
      const conteudo = itensDef
        .filter(def => ver(def.pagina))
        .map(def => item(def.href || def.pagina, def.label, def.icone, def.opcoes || { permitido: true }))
        .join('');
      return conteudo ? secao(id, label, icone, conteudo, paginas) : '';
    };

    const secoes = [
      `<a href="inicio.html" class="menu-dashboard${path === 'inicio.html' ? ' active' : ''}">
        <span class="nav-icon" aria-hidden="true">${this.iconSvg('inicio')}</span>
        <span>Início</span>
      </a>`
    ];

    // NOTAMs — global (todos os logados). Operacional das bases SAFE.
    if (ver('notams.html')) {
      secoes.push(`<a href="notams.html" class="menu-dashboard${path === 'notams.html' ? ' active' : ''}">
        <span class="nav-icon" aria-hidden="true">${this.iconSvg('notam')}</span>
        <span>NOTAMs</span>
      </a>`);
    }

    if (ver('dashboard.html')) {
      secoes.push(`<a href="dashboard.html" class="menu-dashboard${path === 'dashboard.html' ? ' active' : ''}">
        <span class="nav-icon" aria-hidden="true">${this.iconSvg('dashboard')}</span>
        <span>Dashboard de Vendas</span>
      </a>`);
    }

    secoes.push(secaoSeTiver('comercial', 'Comercial', 'comercial', [
      { pagina: 'vendas.html', label: 'Vendas', icone: 'vendas' }
    ], ['vendas.html']));

    secoes.push(secaoSeTiver('escala', 'Escala', 'escala', [
      { pagina: 'escala-cco.html', label: 'Escala CCO', icone: 'escala' },
      { pagina: 'escala-pav.html', label: 'Escala PAV de Base', icone: 'escala' },
      { pagina: 'horas-voadas-inva.html', label: 'Horas Voadas INVA Mês', icone: 'horas' }
    ], ['escala-cco.html', 'escala-pav.html', 'horas-voadas-inva.html']));

    secoes.push(secaoSeTiver('portal-aluno', 'Portal do Aluno', 'academico', [
      { pagina: 'progresso-alunos.html', label: 'Progresso de Alunos', icone: 'academico' }
    ], ['progresso-alunos.html']));

    // Administração — inclui a Planilha administrativa (permissão própria).
    const itensAdm = [
      ver('safe-minions.html') ? item('safe-minions.html', 'SAFE MINIONS', 'minions', { permitido: true }) : '',
      ver('cadastro-alunos.html') ? item('cadastro-alunos.html', 'Cadastro de Aluno', 'aluno', { permitido: true }) : '',
      this.temPermissao('planilha_admin.abrir')
        ? item(
            'https://docs.google.com/spreadsheets/d/1zUHGTAC8TUhD6v1k-7OLeDQRlj99J0BMbimScZD2SoI/edit?gid=1905416248#gid=1905416248',
            'Planilha', 'planilha',
            { externo: true, permitido: true, destino: 'planilha-administrativa' }
          )
        : ''
    ].join('');
    if (itensAdm) {
      secoes.push(secao('administracao', 'Administração', 'administracao', itensAdm,
        ['safe-minions.html', 'cadastro-alunos.html']));
    }

    secoes.push(secaoSeTiver('financeiro', 'Financeiro', 'financeiro', [
      { pagina: 'faturamento.html', label: 'Faturamento', icone: 'faturamento' },
      { pagina: 'concorrencia.html', label: 'Concorrência', icone: 'concorrencia' },
      { pagina: 'controle-gastos.html', label: 'Controle de Gastos', icone: 'gastos' },
      { pagina: 'fechamento-horas.html', label: 'Fechamento de Horas / Cotistas', icone: 'horas' }
    ], ['faturamento.html', 'concorrencia.html', 'controle-gastos.html', 'fechamento-horas.html']));

    secoes.push(secaoSeTiver('suporte', 'Suporte', 'suporte', [
      { pagina: 'bases.html', label: 'Bases', icone: 'bases' },
      { pagina: 'admin.html', label: 'Usuários', icone: 'usuarios' },
      { pagina: 'access-control.html', label: 'Controle de Acesso', icone: 'acesso' }
    ], ['bases.html', 'admin.html', 'access-control.html']));

    nav.innerHTML = secoes.filter(Boolean).join('');

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

// Gate do módulo NOTAMs. Enquanto o flag estiver OFF, troca a entrada `publica`
// por uma que exige uma permissão que NINGUÉM possui (nem está no catálogo) →
// podeVer() = false p/ todos (menos superadmin, que bypassa), some do menu e o
// acesso direto é barrado por protegerPagina. NÃO usar `delete`: podeVer é
// fail-open (sem regra = liberado a logados). Ligar em Auth.NOTAMS_ATIVO quando
// @28 (rota `notams`) + chave AISWEB estiverem prontos.
if (!Auth.NOTAMS_ATIVO) {
  Auth.PAGINAS['notams.html'] = { ver: ['notams.indisponivel'] };
}
