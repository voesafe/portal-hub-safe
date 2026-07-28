// ============================================================
// auth.js — Autenticação, sessão e proteção de rotas
// SAFE Hub — login por e-mail
// ============================================================

const Auth = {
  SESSION_MAX_MS: 12 * 60 * 60 * 1000,
  SESSION_TIMEZONE: 'America/Sao_Paulo',

  // Feature flag do módulo NOTAMs. LIGADO em 2026-07-28: backend em produção no
  // @39, chave AISWEB/DECEA gravada nas Propriedades do script e gatilho diário
  // instalado. Com OFF, a entrada `notams.html` é trocada por uma permissão que
  // ninguém tem (ver o fim do arquivo) → some do menu e o acesso direto é
  // bloqueado por protegerPagina. Desligar = trocar para false.
  NOTAMS_ATIVO: true,

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
    // NOTAMs é global na prática (a permissão nasce em TODOS os cargos padrão e
    // nas permissões de usuário CCO), mas passa por permissão de verdade em vez
    // de `publica`. Motivo: com `publica: true` o podeVer curto-circuita e o
    // interruptor no Controle de Acesso ficaria decorativo, sem conseguir NEGAR
    // a página a ninguém. Ver ACCESS_DEFAULT_GROUPS no AccessControl.gs.
    'notams.html':            { ver: ['notams.visualizar'], editar: ['notams.sincronizar'] },
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
    // Aniversários: nenhum cargo padrão tem `aniversarios.*` (ver
    // AccessControl.gs), então só superadmin/master enxerga — que é o pedido.
    'aniversarios.html':      { ver: ['aniversarios.visualizar'],
                                editar: ['aniversarios.reenviar'] },
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
    'aniversarios.html': 'Aniversários',
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
  protegerAniversarios()    { return this.protegerPagina('aniversarios.html', 'Aniversários'); },
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
      aniversario:  `<svg ${base}><path d="M4 21h16"></path><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"></path><path d="M5 16.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"></path><path d="M9 12V9"></path><path d="M12 12V8"></path><path d="M15 12V9"></path></svg>`,
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
      notam:        `<svg ${base}><path d="M2 12l20-8-4 18-6-6-4 4z"></path><path d="M12 16l-2-2"></path></svg>`,
      sol:          `<svg ${base}><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>`,
      lua:          `<svg ${base}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg>`,
      chave:        `<svg ${base}><circle cx="7.5" cy="15.5" r="3.5"></circle><path d="m10 13 8.5-8.5"></path><path d="m16 7 2 2"></path><path d="m19 4 2 2"></path></svg>`,
      perfil:       `<svg ${base}><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-1a7 7 0 0 1 16 0v1"></path></svg>`
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
    // Os itens saem em ordem alfabética pelo rótulo, então incluir um item
    // novo na lista não exige acertar a posição na mão.
    // `def.visivel` cobre o item que não é uma página do Hub (a Planilha, que
    // é link externo e depende de permissão própria, não de `podeVer`).
    const secaoSeTiver = (id, label, icone, itensDef, paginas) => {
      const conteudo = itensDef
        .filter(def => (def.visivel ? def.visivel() : ver(def.pagina)))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
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

    // As seções vêm em ordem alfabética, e o Início fica fixo no topo por ser
    // a entrada da casa, não um módulo. Ao criar uma seção nova, insira na
    // posição alfabética; os ITENS dentro dela o `secaoSeTiver` já ordena.
    secoes.push(secaoSeTiver('administracao', 'Administração', 'administracao', [
      { pagina: 'aniversarios.html', label: 'Aniversários', icone: 'aniversario' },
      { pagina: 'cadastro-alunos.html', label: 'Cadastro de Aluno', icone: 'aluno' },
      { pagina: 'safe-minions.html', label: 'SAFE MINIONS', icone: 'minions' },
      {
        label: 'Planilha',
        icone: 'planilha',
        href: 'https://docs.google.com/spreadsheets/d/1zUHGTAC8TUhD6v1k-7OLeDQRlj99J0BMbimScZD2SoI/edit?gid=1905416248#gid=1905416248',
        visivel: () => this.temPermissao('planilha_admin.abrir'),
        opcoes: { externo: true, permitido: true, destino: 'planilha-administrativa' }
      }
    ], ['aniversarios.html', 'cadastro-alunos.html', 'safe-minions.html']));

    secoes.push(secaoSeTiver('comercial', 'Comercial', 'comercial', [
      { pagina: 'dashboard.html', label: 'Dashboard de Vendas', icone: 'dashboard' },
      { pagina: 'vendas.html', label: 'Vendas', icone: 'vendas' }
    ], ['dashboard.html', 'vendas.html']));

    // NOTAMs entra aqui: é operacional das bases SAFE, mesma família de Escala.
    // Continua global (todos os logados), quando o `NOTAMS_ATIVO` estiver ligado.
    secoes.push(secaoSeTiver('escala', 'Escala', 'escala', [
      { pagina: 'escala-cco.html', label: 'Escala CCO', icone: 'escala' },
      { pagina: 'escala-pav.html', label: 'Escala PAV de Base', icone: 'escala' },
      { pagina: 'horas-voadas-inva.html', label: 'Horas Voadas INVA Mês', icone: 'horas' },
      { pagina: 'notams.html', label: 'NOTAMs', icone: 'notam' }
    ], ['escala-cco.html', 'escala-pav.html', 'horas-voadas-inva.html', 'notams.html']));

    secoes.push(secaoSeTiver('financeiro', 'Financeiro', 'financeiro', [
      { pagina: 'concorrencia.html', label: 'Concorrência', icone: 'concorrencia' },
      { pagina: 'controle-gastos.html', label: 'Controle de Gastos', icone: 'gastos' },
      { pagina: 'faturamento.html', label: 'Faturamento', icone: 'faturamento' },
      { pagina: 'fechamento-horas.html', label: 'Fechamento de Horas / Cotistas', icone: 'horas' }
    ], ['concorrencia.html', 'controle-gastos.html', 'faturamento.html', 'fechamento-horas.html']));

    secoes.push(secaoSeTiver('portal-aluno', 'Portal do Aluno', 'academico', [
      { pagina: 'progresso-alunos.html', label: 'Progresso de Alunos', icone: 'academico' }
    ], ['progresso-alunos.html']));

    secoes.push(secaoSeTiver('suporte', 'Suporte', 'suporte', [
      { pagina: 'access-control.html', label: 'Controle de Acesso', icone: 'acesso' },
      { pagina: 'bases.html', label: 'Bases', icone: 'bases' },
      { pagina: 'admin.html', label: 'Usuários', icone: 'usuarios' }
    ], ['access-control.html', 'admin.html', 'bases.html']));

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
      'aniversarios.html': 'aniversario',
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
    if (!usuario) return;

    if (usuario.id === 'btn-logout') {
      usuario.id = 'sidebar-user-current';
      usuario.removeAttribute('title');
    }

    // O Sair saiu daqui e virou item do menu do avatar, na topbar, em
    // 2026-07-27. O rodapé da sidebar guarda só a identidade agora.
    // A remoção fica porque a sidebar é montada por HTML em cada página:
    // se algum arquivo antigo ainda trouxer o botão escrito à mão, ele
    // some por aqui em vez de aparecer duplicado com o do menu.
    document.getElementById('btn-logout')?.remove();
  },

  // ── Tema (claro/escuro) ───────────────────────────────────
  // Claro é o padrão e o sistema operacional NÃO opina: quem quiser
  // escuro pede pelo menu. Quem carimba antes da primeira pintura é a
  // guarda inline no <head> de cada página; daqui para frente só
  // mantemos os dois em acordo sobre a mesma chave.
  TEMA_KEY: 'safe-hub-theme',
  TEMA_COR_BARRA: { light: '#19213f', dark: '#0b1120' },

  temaAtual() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  },

  aplicarTema(tema) {
    const escuro = tema === 'dark';
    const raiz = document.documentElement;

    if (escuro) raiz.setAttribute('data-theme', 'dark');
    else raiz.removeAttribute('data-theme');

    try { localStorage.setItem(this.TEMA_KEY, escuro ? 'dark' : 'light'); } catch (e) {}

    // A barra do navegador no celular e a janela do PWA leem daqui.
    // Sem isto o topo do aparelho segue navy com a página preta.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.TEMA_COR_BARRA[escuro ? 'dark' : 'light']);

    document.querySelectorAll('.user-menu').forEach(menu => {
      menu.querySelector('[data-acao="tema"] .user-menu-hint')
        ?.replaceChildren(document.createTextNode(escuro ? 'Escuro' : 'Claro'));
      const icone = menu.querySelector('[data-acao="tema"] .user-menu-icon');
      if (icone) icone.innerHTML = this.iconSvg(escuro ? 'sol' : 'lua');
    });

    document.dispatchEvent(new CustomEvent('safe:tema', { detail: { tema: escuro ? 'dark' : 'light' } }));
  },

  alternarTema() {
    this.aplicarTema(this.temaAtual() === 'dark' ? 'light' : 'dark');
  },

  // ── Menu do usuário (avatar na topbar) ────────────────────
  // Injetado por JS nas 21 páginas, como a marca do Hub já era. Página
  // nova não precisa escrever nada: basta ter `.topbar`, e o
  // `.topbar-right` é criado aqui se faltar.
  montarMenuUsuario() {
    const sessao = this.getSessao();
    if (!sessao) return;

    document.querySelectorAll('.topbar').forEach(topbar => {
      if (topbar.querySelector('.user-menu')) return;

      // Filho DIRETO da topbar, irmão do `.topbar-right`, nunca dentro dele.
      // Abaixo de 768px o `.topbar-right` vira uma faixa de largura inteira
      // para caber os botões da página; com o avatar lá dentro ele descia
      // junto e a topbar virava duas faixas, com o avatar solto na segunda.
      // Como irmão, ele fica preso ao topo à direita, ao lado da marca, e
      // são os botões da página que descem. É o arranjo do CAVOK.
      const iniciais = this.iniciaisUsuario(sessao.nome);
      const papel = this.eSuperadmin() ? 'Superadmin' : this.descricaoPerfil(sessao.perfil);
      const escuro = this.temaAtual() === 'dark';

      const menu = document.createElement('div');
      menu.className = 'user-menu';
      menu.innerHTML = `
        <button type="button" class="user-menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Menu do usuário">
          <span class="user-menu-avatar" aria-hidden="true">${this.escaparHtml(iniciais)}</span>
          <span class="user-menu-caret" aria-hidden="true">${this.iconSvg('chevron')}</span>
        </button>
        <div class="user-menu-popover" role="menu" hidden>
          <div class="user-menu-head">
            <span class="user-menu-avatar is-lg" aria-hidden="true">${this.escaparHtml(iniciais)}</span>
            <div class="user-menu-ident">
              <div class="user-menu-name">${this.escaparHtml(sessao.nome || '')}</div>
              <div class="user-menu-role">${this.escaparHtml(papel || '')}</div>
            </div>
          </div>
          <div class="user-menu-sep" role="separator"></div>
          <button type="button" class="user-menu-item" role="menuitem" data-acao="tema">
            <span class="user-menu-icon" aria-hidden="true">${this.iconSvg(escuro ? 'sol' : 'lua')}</span>
            <span class="user-menu-label">Alternar modo</span>
            <span class="user-menu-hint">${escuro ? 'Escuro' : 'Claro'}</span>
          </button>
          <button type="button" class="user-menu-item" role="menuitem" data-acao="senha">
            <span class="user-menu-icon" aria-hidden="true">${this.iconSvg('chave')}</span>
            <span class="user-menu-label">Mudar minha senha</span>
          </button>
          <button type="button" class="user-menu-item" role="menuitem" data-acao="dados">
            <span class="user-menu-icon" aria-hidden="true">${this.iconSvg('perfil')}</span>
            <span class="user-menu-label">Meus dados</span>
          </button>
          <div class="user-menu-sep" role="separator"></div>
          <button type="button" class="user-menu-item is-danger" role="menuitem" data-acao="sair">
            <span class="user-menu-icon" aria-hidden="true">${this.iconSvg('logout')}</span>
            <span class="user-menu-label">Sair</span>
          </button>
        </div>
      `;
      topbar.appendChild(menu);
      this._ligarMenuUsuario(menu);
    });
  },

  _ligarMenuUsuario(menu) {
    const gatilho  = menu.querySelector('.user-menu-trigger');
    const popover  = menu.querySelector('.user-menu-popover');

    const fechar = () => {
      if (popover.hidden) return;
      popover.hidden = true;
      menu.classList.remove('is-open');
      gatilho.setAttribute('aria-expanded', 'false');
    };
    const abrir = () => {
      popover.hidden = false;
      menu.classList.add('is-open');
      gatilho.setAttribute('aria-expanded', 'true');
      this._posicionarMenuUsuario(menu, popover);
    };

    gatilho.addEventListener('click', e => {
      e.stopPropagation();
      popover.hidden ? abrir() : fechar();
    });

    // Fecha ao clicar fora e no Esc. Sem isto o popover fica presente na
    // tela ao navegar por teclado e cobre o conteúdo abaixo.
    document.addEventListener('click', e => { if (!menu.contains(e.target)) fechar(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || popover.hidden) return;
      fechar();
      gatilho.focus();
    });

    popover.addEventListener('click', e => {
      const item = e.target.closest('.user-menu-item');
      if (!item) return;
      const acao = item.dataset.acao;
      if (acao !== 'tema') fechar();

      if (acao === 'tema')  this.alternarTema();
      if (acao === 'senha') this.abrirTrocarSenha();
      if (acao === 'dados') this.abrirMeusDados();
      if (acao === 'sair')  this._confirmarLogout();
    });
  },

  // O popover abre alinhado à direita do gatilho. Em tela estreita isso
  // o joga para fora da janela, então ele passa a se ancorar na borda da
  // topbar. É a mesma armadilha do menu de ações do Cadastro de Aluno,
  // que precisou de `drop-up` pelo mesmo motivo, só que no outro eixo.
  _posicionarMenuUsuario(menu, popover) {
    popover.classList.remove('is-edge');
    const caixa = popover.getBoundingClientRect();
    if (caixa.left < 8) popover.classList.add('is-edge');
  },

  // ── Avatar (foto do usuário) ──────────────────────────────
  // 128px é o dobro do maior lugar onde a foto aparece (40px no cabeçalho
  // do menu), o que cobre tela retina sem pesar. A 128px em JPEG 0.8 a
  // imagem fica em ~8 KB de base64, contra o teto de 50.000 caracteres da
  // célula do Sheets, onde ela é guardada. Ver `salvarMeuAvatar`.
  AVATAR_PX: 128,
  AVATAR_QUALIDADE: 0.8,
  AVATAR_MAX_ARQUIVO: 8 * 1024 * 1024,
  AVATAR_ZOOM_MAX: 4,

  avatarDaSessao() {
    const url = this.getSessao()?.avatar;
    return typeof url === 'string' && url.startsWith('data:image/') ? url : '';
  },

  // Valida o arquivo e devolve a imagem já decodificada, pronta para o
  // editor. Separado do recorte porque o editor precisa da mesma imagem em
  // várias pinturas seguidas, e reler o arquivo a cada quadro travaria.
  _carregarImagemAvatar(arquivo) {
    return new Promise((resolve, reject) => {
      if (!arquivo) return reject(new Error('Nenhuma imagem escolhida.'));
      if (!/^image\//.test(arquivo.type)) return reject(new Error('Escolha um arquivo de imagem.'));
      if (arquivo.size > this.AVATAR_MAX_ARQUIVO) return reject(new Error('Imagem muito grande. O limite é 8 MB.'));

      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Não consegui abrir essa imagem.'));
        img.onload = () => {
          if (!img.width || !img.height) return reject(new Error('Não consegui abrir essa imagem.'));
          resolve(img);
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  },

  // O estado do recorte é { zoom, cx, cy }, com cx/cy em fração do lado do
  // quadro (0,5 = centro). Guardar em fração, e não em pixels, é o que faz a
  // prévia de 240px e o arquivo final de 128px enquadrarem exatamente igual.
  _estadoAvatarInicial() {
    return { zoom: 1, cx: 0.5, cy: 0.5 };
  },

  // Limita o passeio para a imagem nunca descolar da borda do quadro: com
  // zoom 1 ela cobre o quadro justo no menor lado, e aí só sobra folga no
  // maior. Sem isso apareceria faixa branca na foto.
  _limitarEstadoAvatar(img, estado) {
    const menor = Math.min(img.width, img.height);
    const meiaL = (img.width  * estado.zoom) / (2 * menor);
    const meiaA = (img.height * estado.zoom) / (2 * menor);
    const preso = (v, meia) => (meia <= 0.5 ? 0.5 : Math.min(Math.max(v, 1 - meia), meia));
    estado.cx = preso(estado.cx, meiaL);
    estado.cy = preso(estado.cy, meiaA);
    return estado;
  },

  // Pinta o recorte num canvas quadrado. A mesma função desenha a prévia e o
  // arquivo que sobe, então o que a pessoa enquadra é o que ela recebe.
  _pintarRecorteAvatar(canvas, img, estado, lado, densidade) {
    const dpr = densidade || 1;
    canvas.width = canvas.height = Math.round(lado * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Fundo branco antes de desenhar: PNG com transparência viraria preto no
    // JPEG, que não tem canal alfa.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lado, lado);
    ctx.imageSmoothingQuality = 'high';

    const escala = (lado / Math.min(img.width, img.height)) * estado.zoom;
    const larg = img.width * escala;
    const alt  = img.height * escala;
    ctx.drawImage(img, estado.cx * lado - larg / 2, estado.cy * lado - alt / 2, larg, alt);
    return canvas;
  },

  _gerarUriAvatar(img, estado) {
    const canvas = this._pintarRecorteAvatar(document.createElement('canvas'), img, estado, this.AVATAR_PX, 1);
    return canvas.toDataURL('image/jpeg', this.AVATAR_QUALIDADE);
  },

  // Lê o arquivo escolhido e abre o editor de enquadramento. Devolve o data
  // URI de 128px, ou `null` se a pessoa desistir. Tudo acontece no navegador:
  // o que sobe são os ~8 KB finais, não os 4 MB que a câmera do celular
  // produz. O recorte central automático de antes servia para a maioria das
  // fotos e cortava errado sempre que a pessoa não estava no meio do quadro.
  async _prepararAvatar(arquivo) {
    const img = await this._carregarImagemAvatar(arquivo);
    const uri = await this._abrirEditorAvatar(img);
    if (uri && uri.length > 40000) throw new Error('Imagem complexa demais. Tente outra foto.');
    return uri;
  },

  _abrirEditorAvatar(img) {
    return new Promise(resolve => {
      const estado = this._limitarEstadoAvatar(img, this._estadoAvatarInicial());
      // O quadro encolhe junto com a tela: 240px não cabe num celular de
      // 390px depois do respiro lateral do modal.
      const lado = Math.max(180, Math.min(240, window.innerWidth - 96));

      let resolvido = false;
      const concluir = valor => {
        if (resolvido) return;
        resolvido = true;
        resolve(valor);
      };

      const { overlay, fechar } = this._abrirModal('modal-ajustar-foto', `
        <div class="modal" style="max-width:360px">
          <div class="modal-header">
            <h3 style="font-size:1rem">Ajustar foto</h3>
            <button class="modal-close" data-fechar aria-label="Fechar">${this.iconSvg('fechar')}</button>
          </div>
          <div class="modal-body avatar-editor">
            <div class="avatar-editor-palco" style="width:${lado}px;height:${lado}px">
              <canvas class="avatar-editor-canvas" id="ae-canvas" style="width:${lado}px;height:${lado}px"></canvas>
              <div class="avatar-editor-mascara" aria-hidden="true"></div>
            </div>
            <p class="avatar-editor-dica">Arraste a foto para posicionar e use a barra para aproximar.</p>
            <div class="avatar-editor-zoom">
              ${this.iconSvg('perfil')}
              <input type="range" id="ae-zoom" min="1" max="${this.AVATAR_ZOOM_MAX}" step="0.01" value="1" aria-label="Aproximar a foto">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-sm" type="button" data-fechar>Cancelar</button>
            <button class="btn btn-primary btn-sm" type="button" id="ae-salvar">Usar esta foto</button>
          </div>
        </div>
      `, () => concluir(null));

      const canvas = overlay.querySelector('#ae-canvas');
      const zoom   = overlay.querySelector('#ae-zoom');
      const dpr    = Math.min(window.devicePixelRatio || 1, 3);
      const pintar = () => this._pintarRecorteAvatar(canvas, img, estado, lado, dpr);
      pintar();

      // Arrastar com Pointer Events cobre mouse, dedo e caneta de uma vez, e
      // o setPointerCapture segura o movimento mesmo quando o cursor sai do
      // quadro no meio do gesto.
      let arrastando = null;
      canvas.addEventListener('pointerdown', e => {
        arrastando = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('arrastando');
      });
      canvas.addEventListener('pointermove', e => {
        if (!arrastando) return;
        estado.cx += (e.clientX - arrastando.x) / lado;
        estado.cy += (e.clientY - arrastando.y) / lado;
        arrastando = { x: e.clientX, y: e.clientY };
        this._limitarEstadoAvatar(img, estado);
        pintar();
      });
      const soltar = e => {
        if (!arrastando) return;
        arrastando = null;
        canvas.classList.remove('arrastando');
        if (e.pointerId != null && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      };
      canvas.addEventListener('pointerup', soltar);
      canvas.addEventListener('pointercancel', soltar);

      // O zoom é ancorado no centro do quadro: o ponto que está no meio
      // continua no meio, que é o que a pessoa está olhando enquanto ajusta.
      const aplicarZoom = novo => {
        const alvo = Math.min(Math.max(novo, 1), this.AVATAR_ZOOM_MAX);
        const razao = alvo / estado.zoom;
        estado.zoom = alvo;
        estado.cx = 0.5 + (estado.cx - 0.5) * razao;
        estado.cy = 0.5 + (estado.cy - 0.5) * razao;
        this._limitarEstadoAvatar(img, estado);
        zoom.value = String(alvo);
        pintar();
      };

      zoom.addEventListener('input', () => aplicarZoom(Number(zoom.value)));
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        aplicarZoom(estado.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
      }, { passive: false });

      overlay.querySelector('#ae-salvar').addEventListener('click', () => {
        concluir(this._gerarUriAvatar(img, estado));
        fechar();
      });
    });
  },

  // Pinta a foto (ou as iniciais) em todo avatar da tela de uma vez: o do
  // menu, o do cabeçalho do popover, o do rodapé da sidebar e o do modal.
  pintarAvatares() {
    const sessao = this.getSessao();
    if (!sessao) return;
    const foto = this.avatarDaSessao();
    const iniciais = this.iniciaisUsuario(sessao.nome);

    document.querySelectorAll('.user-menu-avatar, .sidebar-avatar').forEach(el => {
      el.classList.toggle('tem-foto', !!foto);
      if (foto) {
        el.innerHTML = '';
        const img = document.createElement('img');
        img.src = foto;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        el.appendChild(img);
      } else {
        el.textContent = iniciais;
      }
    });
  },

  iniciaisUsuario(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
    return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
  },

  escaparHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  // Abre um `.modal-overlay` e devolve { overlay, fechar }. Os modais do
  // menu do usuário precisam existir nas 21 páginas, então nascem por JS
  // em vez de virar markup repetido em cada HTML.
  // `aoFechar` roda em qualquer saída (botão, clique fora, Escape) e existe
  // para o editor de foto avisar que a pessoa desistiu do recorte.
  _abrirModal(id, html, aoFechar) {
    document.getElementById(id)?.remove();

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'modal-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const fechar = () => {
      overlay.classList.remove('open');
      document.removeEventListener('keydown', aoTeclar);
      setTimeout(() => overlay.remove(), 250);
      if (typeof aoFechar === 'function') aoFechar();
    };
    // Só o modal de cima responde ao Escape. O editor de foto abre por cima
    // do "Meus dados", e sem esse teste uma tecla fecharia os dois de uma vez.
    const aoTeclar = e => {
      if (e.key !== 'Escape') return;
      const abertos = document.querySelectorAll('.modal-overlay.open');
      if (abertos.length && abertos[abertos.length - 1] !== overlay) return;
      fechar();
    };

    document.addEventListener('keydown', aoTeclar);
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
    overlay.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar));

    return { overlay, fechar };
  },

  abrirTrocarSenha() {
    const { overlay, fechar } = this._abrirModal('modal-trocar-senha', `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h3 style="font-size:1rem">Mudar minha senha</h3>
          <button class="modal-close" data-fechar aria-label="Fechar">${this.iconSvg('fechar')}</button>
        </div>
        <!-- novalidate: com a validação nativa ligada, o minlength barra o
             submit antes do nosso validador rodar, e o usuário leva a bolha
             cinza do navegador em vez da mensagem do modal. Ficava um erro
             estilizado e o outro não, sem razão aparente. Os atributos ficam
             para o gerenciador de senhas, mas quem decide é o JS. -->
        <form class="modal-body" id="form-trocar-senha" style="padding-top:14px" novalidate>
          <div class="form-group">
            <label class="form-label" for="ts-atual">Senha atual</label>
            <input class="form-control" type="password" id="ts-atual" autocomplete="current-password" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="ts-nova">Nova senha</label>
            <input class="form-control" type="password" id="ts-nova" autocomplete="new-password" minlength="6" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="ts-conf">Confirmar nova senha</label>
            <input class="form-control" type="password" id="ts-conf" autocomplete="new-password" minlength="6" required>
          </div>
          <p class="modal-erro" id="ts-erro" hidden></p>
        </form>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" type="button" data-fechar>Cancelar</button>
          <button class="btn btn-primary btn-sm" type="submit" form="form-trocar-senha" id="ts-salvar">Salvar</button>
        </div>
      </div>
    `);

    const form  = overlay.querySelector('#form-trocar-senha');
    const erro  = overlay.querySelector('#ts-erro');
    const botao = overlay.querySelector('#ts-salvar');
    overlay.querySelector('#ts-atual').focus();

    const mostrarErro = msg => {
      erro.textContent = msg;
      erro.hidden = false;
    };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      erro.hidden = true;

      const atual = overlay.querySelector('#ts-atual').value;
      const nova  = overlay.querySelector('#ts-nova').value;
      const conf  = overlay.querySelector('#ts-conf').value;

      if (!atual)           return mostrarErro('Informe a senha atual.');
      if (nova.length < 6)  return mostrarErro('A nova senha precisa ter pelo menos 6 caracteres.');
      if (nova !== conf)    return mostrarErro('A confirmação não bate com a nova senha.');
      if (nova === atual)   return mostrarErro('A nova senha é igual à atual.');

      // Sem otimista: quem valida a senha atual é o servidor, e fingir
      // sucesso aqui diria "senha alterada" para uma troca recusada.
      botao.disabled = true;
      botao.textContent = 'Salvando...';

      const res = await this.alterarSenha(atual, nova);

      botao.disabled = false;
      botao.textContent = 'Salvar';

      if (!res?.ok) return mostrarErro(res?.error || 'Não foi possível alterar a senha.');

      fechar();
      toast('Senha alterada.', 'success');
    });
  },

  abrirMeusDados() {
    const sessao = this.getSessao();
    if (!sessao) return;

    const papel = this.eSuperadmin() ? 'Superadmin' : this.descricaoPerfil(sessao.perfil);
    const modulos = Array.isArray(sessao.permissoesEfetivas) ? sessao.permissoesEfetivas.length : 0;
    const hora = ms => {
      const d = new Date(Number(ms) || 0);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };

    const linhas = [
      ['Nome', sessao.nome],
      ['E-mail', sessao.email],
      ['Código PAC', sessao.pac],
      ['Cargo', papel],
      ['Permissões ativas', modulos ? `${modulos} permissões` : '—'],
      ['Sessão iniciada', hora(sessao.loginEm)],
      ['Sessão expira', hora(sessao.expiraEm)]
    ];

    const ehCco = String(sessao.perfil || '').toLowerCase().indexOf('cco_') === 0;

    const { overlay } = this._abrirModal('modal-meus-dados', `
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <h3 style="font-size:1rem">Meus dados</h3>
          <button class="modal-close" data-fechar aria-label="Fechar">${this.iconSvg('fechar')}</button>
        </div>
        <div class="modal-body" style="padding-top:14px">
          <div class="dados-foto">
            <span class="user-menu-avatar is-xl" id="md-avatar" aria-hidden="true"></span>
            <div class="dados-foto-acoes">
              <div class="dados-foto-titulo">Foto de perfil</div>
              ${ehCco
                ? `<p class="dados-foto-dica">A foto de usuários da Escala CCO é gerenciada no sistema dela.</p>`
                : `<div class="dados-foto-botoes">
                     <button class="btn btn-ghost btn-sm" type="button" id="md-enviar">Enviar foto</button>
                     <button class="btn btn-ghost btn-sm" type="button" id="md-remover" ${this.avatarDaSessao() ? '' : 'hidden'}>Remover</button>
                   </div>
                   <input type="file" id="md-arquivo" accept="image/*" hidden>
                   <p class="dados-foto-dica">Você escolhe o enquadramento. A foto é reduzida para 128px aqui mesmo, antes de subir.</p>`}
            </div>
          </div>
          <p class="modal-erro" id="md-erro" hidden></p>
          <dl class="dados-lista">
            ${linhas.map(([rotulo, valor]) => `
              <div class="dados-linha">
                <dt>${this.escaparHtml(rotulo)}</dt>
                <dd>${this.escaparHtml(valor || '—')}</dd>
              </div>
            `).join('')}
          </dl>
          <p class="dados-nota">Para corrigir nome, e-mail ou cargo, procure um administrador do Hub. Estes campos não são editáveis por aqui.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" type="button" data-fechar>Fechar</button>
        </div>
      </div>
    `);

    this.pintarAvatares();
    if (ehCco) return;

    const erro     = overlay.querySelector('#md-erro');
    const arquivo  = overlay.querySelector('#md-arquivo');
    const btEnviar = overlay.querySelector('#md-enviar');
    const btRemover= overlay.querySelector('#md-remover');

    const mostrarErro = msg => { erro.textContent = msg; erro.hidden = false; };

    // Sem otimista: quem valida e persiste é o servidor, e a foto some no
    // próximo login se a gravação falhar. Fingir mostraria a nova foto numa
    // troca recusada. O botão vira "Enviando..." no lugar.
    const gravar = async (uri, botao, rotulo) => {
      erro.hidden = true;
      const textoOriginal = botao.textContent;
      botao.disabled = btEnviar.disabled = true;
      botao.textContent = rotulo;

      const res = await API.salvarAvatar(uri);

      botao.disabled = btEnviar.disabled = false;
      botao.textContent = textoOriginal;

      if (!res?.ok) return mostrarErro(res?.error || 'Não foi possível salvar a foto.');

      // A sessão em localStorage é a fonte que todas as páginas leem, e o
      // Hub recarrega a página inteira a cada navegação: sem atualizar aqui,
      // a foto nova só apareceria no próximo login.
      this.salvarSessao({ ...this.getSessao(), avatar: uri });
      this.pintarAvatares();
      btRemover.hidden = !uri;
      toast(uri ? 'Foto atualizada.' : 'Foto removida.', 'success');
    };

    btEnviar.addEventListener('click', () => arquivo.click());
    btRemover.addEventListener('click', () => gravar('', btRemover, 'Removendo...'));

    arquivo.addEventListener('change', async () => {
      const f = arquivo.files?.[0];
      arquivo.value = '';   // permite reescolher o mesmo arquivo depois de um erro
      if (!f) return;
      erro.hidden = true;
      try {
        const uri = await this._prepararAvatar(f);
        if (!uri) return;   // fechou o editor sem confirmar o enquadramento
        await gravar(uri, btEnviar, 'Enviando...');
      } catch (e) {
        mostrarErro(e.message || 'Não consegui usar essa imagem.');
      }
    });
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
          <p style="font-size:.9rem;color:var(--text-muted)">Você será redirecionado para a página de login.</p>
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

      // Todas as páginas já marcam o bloco de título/subtítulo como
      // `.topbar-context` no próprio HTML. O fallback pelo primeiro filho
      // que não é o hamburger fica só para uma página nova que esqueça a
      // classe: sem ela, a regra que esconde o título no celular não pega.
      const contexto = topbarLeft.querySelector('.topbar-context')
        || Array.from(topbarLeft.children).find(el => !el.classList.contains('hamburger'));
      if (contexto) contexto.classList.add('topbar-context');

      const link = document.createElement('a');
      link.className = 'topbar-brand-link';
      link.href = paginaInicial;
      link.setAttribute('aria-label', 'Ir para a página inicial');
      // Duas imagens, uma por modo, escolhidas por CSS. O lettering da
      // marca é navy e some no fundo escuro; a variante clara troca só o
      // navy e preserva o azul e o verde do símbolo. Ficam as duas no DOM
      // de propósito: trocar o `src` por JS no alternar piscaria a marca,
      // e no carregamento a guarda do <head> já resolveu o tema antes da
      // primeira pintura, então o navegador só busca a que vai aparecer.
      link.innerHTML = `
        <img class="topbar-brand-claro" src="assets/img/safe-logo-horizontal.png" alt="SAFE Escola de Aviação">
        <img class="topbar-brand-escuro" src="assets/img/safe-logo-horizontal-dark.png" alt="" aria-hidden="true">
      `;

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
    this.montarMenuUsuario();
    // Depois do menu: ele entra na topbar e pode mudar a altura dela, que
    // é justamente o que o fixarTopbar mede para alimentar a
    // `--topbar-current-h`. Medir antes daria um valor velho.
    this.fixarTopbar();
    this.montarMenuSidebar();
    this.prepararLogoutSidebar();

    // Pinta foto ou iniciais no avatar do menu e no do rodapé da sidebar,
    // depois que os dois já existem no DOM.
    this.pintarAvatares();
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
