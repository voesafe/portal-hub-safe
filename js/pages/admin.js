// ============================================================
// admin.js - Diretório central de usuários (Master TI)
// SAFE Hub
// ============================================================

// ── Matriz de acesso (fonte única, espelhada no backend AccessControl.gs) ──
// Cada módulo mapeia (nível Ver/Editar, escopo próprias/todos) → permissões.
const RBAC_PERMS_BASE = ['inicio.visualizar', 'auth.alterar_propria_senha'];
const RBAC_CARGOS_OFERECIDOS = [
  'comercial', 'comercial_gerencia', 'financeiro',
  'consultor_cco', 'gerente_cco', 'operacoes_escala', 'somente_leitura'
];
const RBAC_MODULOS = [
  { id: 'dashboard', nome: 'Dashboard de Vendas', nota: 'indicadores comerciais', viewOnly: true, escopo: true,
    escLabels: ['Só o próprio', 'De todos'],
    ver: { proprias: ['dashboard_vendas.visualizar_proprio'],
           todas: ['dashboard_vendas.visualizar_proprio', 'dashboard_vendas.visualizar_todos', 'dashboard_vendas.visualizar_receita_global', 'dashboard_vendas.visualizar_ranking_pac'] } },
  { id: 'vendas', nome: 'Vendas', nota: 'cadastro e acompanhamento', escopo: true,
    escLabels: ['Só as próprias', 'De todos'],
    ver: { proprias: ['vendas.visualizar_proprias'], todas: ['vendas.visualizar_proprias', 'vendas.visualizar_todas'] },
    editar: { proprias: ['vendas.criar_propria', 'vendas.editar_propria', 'vendas.excluir_propria'],
              todas: ['vendas.criar_propria', 'vendas.criar_para_qualquer_pac', 'vendas.editar_propria', 'vendas.editar_todas', 'vendas.excluir_propria', 'vendas.excluir_todas'] } },
  { id: 'faturamento', nome: 'Faturamento', nota: 'canais e receitas',
    ver: ['faturamento.visualizar', 'faturamento.visualizar_resumo'],
    editar: ['faturamento.lancar_valores', 'faturamento.editar_valores', 'faturamento.excluir_lancamento'] },
  { id: 'concorrencia', nome: 'Concorrência', nota: 'preços e mercado',
    ver: ['concorrencia.visualizar', 'concorrencia.visualizar_precos_safe'],
    editar: ['concorrencia.criar_concorrente', 'concorrencia.editar_concorrente', 'concorrencia.excluir_concorrente', 'concorrencia.editar_precos_safe'] },
  { id: 'controle_gastos', nome: 'Controle de Gastos', nota: 'despesas e receitas',
    ver: ['controle_gastos.visualizar'],
    editar: ['controle_gastos.editar_gastos', 'controle_gastos.editar_receitas', 'controle_gastos.editar_horas_voadas', 'controle_gastos.criar_categoria', 'controle_gastos.editar_categoria', 'controle_gastos.ativar_inativar_categoria'] },
  { id: 'fechamento', nome: 'Fechamento de Horas', nota: 'cotistas e fechamento',
    ver: ['fechamento_horas.visualizar', 'fechamento_horas.visualizar_historico'],
    editar: ['fechamento_horas.editar', 'fechamento_horas.importar_cavok', 'fechamento_horas.fechar_mes', 'fechamento_horas.reabrir_mes'] },
  { id: 'escala_cco', nome: 'Escala CCO', nota: 'escala da equipe CCO', escopo: true,
    escLabels: ['Só a própria', 'De todos'],
    ver: { proprias: ['escala_cco.visualizar_calendario'], todas: ['escala_cco.visualizar_calendario'] },
    editar: { proprias: ['escala_cco.editar_propria_escala'],
              todas: ['escala_cco.editar_propria_escala', 'escala_cco.editar_escala', 'escala_cco.visualizar_financeiro', 'escala_cco.exportar_ifood', 'escala_cco.editar_valor_turno', 'escala_cco.gerenciar_funcionarios'] } },
  { id: 'escala_pav', nome: 'Escala PAV de Base', nota: 'PAV das bases',
    ver: ['escala_pav.visualizar_calendario', 'escala_pav.visualizar_financeiro'],
    editar: ['escala_pav.editar_escala', 'escala_pav.exportar_ifood', 'escala_pav.gerenciar_pavs', 'escala_pav.inativar_reativar_pav'] },
  { id: 'horas_inva', nome: 'Horas Voadas INVA', nota: 'instrutores / CAVOK',
    ver: ['horas_inva.visualizar'],
    editar: ['horas_inva.sincronizar_cavok', 'horas_inva.cadastrar_instrutor'] },
  { id: 'notams', nome: 'NOTAMs', nota: 'avisos das bases SBSJ e SDAM', viewOnly: true,
    ver: ['notams.visualizar'] },
  { id: 'progresso', nome: 'Progresso de Alunos', nota: 'acompanhamento acadêmico', viewOnly: true,
    ver: ['progresso_alunos.visualizar', 'progresso_alunos.buscar_aluno', 'progresso_alunos.visualizar_detalhe'] },
  { id: 'cadastro_alunos', nome: 'Cadastro de Alunos', nota: 'fila S141 / Trello',
    ver: ['cadastro_alunos.visualizar'],
    editar: ['cadastro_alunos.importar_xls_cavok', 'cadastro_alunos.marcar_s141', 'cadastro_alunos.sincronizar_trello', 'cadastro_alunos.inativar', 'cadastro_alunos.reativar'] },
  { id: 'safe_minions', nome: 'SAFE MINIONS', nota: 'mínimos ANAC',
    ver: ['safe_minions.visualizar'],
    editar: ['safe_minions.processar_arquivo_local'] },
  { id: 'bases', nome: 'Bases', nota: 'endereços e contatos',
    ver: ['bases.visualizar'],
    editar: ['bases.criar', 'bases.editar', 'bases.inativar_reativar'] },
  { id: 'usuarios', nome: 'Usuários', nota: 'gestão de acessos',
    ver: ['usuarios.visualizar'],
    editar: ['usuarios.criar', 'usuarios.editar', 'usuarios.inativar_reativar', 'usuarios.redefinir_senha'] },
  { id: 'controle_acesso', nome: 'Controle de Acesso', nota: 'grupos e permissões', viewOnly: true,
    ver: ['usuarios.gerenciar_grupos', 'usuarios.gerenciar_permissoes'] },
  { id: 'planilha', nome: 'Planilha Administrativa', nota: 'base integrada', viewOnly: true,
    ver: ['planilha_admin.abrir'] }
];

const Admin = {
  usuarios: [],
  contagemEmails: new Map(),
  controleAcesso: { grupos: [], permissoes: [] },
  matrizAcesso: {},   // { moduloId: { n: 0|1|2, s: 'proprias'|'todas' } }
  cargoAtual: '',     // id do cargo (grupo) base selecionado
  editandoId: null,
  abaAtual: 'ativos',
  CACHE_USUARIOS_KEY: 'safe-admin-usuarios-cache-v1',

  async init() {
    if (!Auth.protegerGestaoUsuarios()) return;
    Auth.preencherUI();
    this.initSidebar();
    this.initForm();
    this.initFotoUsuario();
    this.initFiltros();
    this.limparFiltrosIniciais();
    this.initTabs();
    this.initAlterarSenha();
    await this.carregar();
  },

  lerCacheUsuarios() {
    try {
      const cache = JSON.parse(localStorage.getItem(this.CACHE_USUARIOS_KEY) || 'null');
      if (!cache || !Array.isArray(cache.usuarios)) return null;
      if (Date.now() - Number(cache.ts || 0) > 5 * 60 * 1000) return null;
      return cache;
    } catch {
      return null;
    }
  },

  gravarCacheUsuarios(payload) {
    try {
      localStorage.setItem(this.CACHE_USUARIOS_KEY, JSON.stringify({
        usuarios: payload?.usuarios || [],
        aviso: payload?.aviso || '',
        ts: Date.now()
      }));
    } catch {}
  },

  aplicarUsuarios(payload) {
    this.usuarios = payload?.usuarios || [];
    this.recalcularContagemEmails();
    this.renderResumo();
    this.renderTabela();
  },

  // Conta e-mails uma única vez por carga em vez de refiltrar a lista inteira
  // para cada usuário (antes O(n²) a cada render da tabela/resumo/filtro).
  recalcularContagemEmails() {
    this.contagemEmails = new Map();
    this.usuarios.forEach(usuario => {
      const email = String(usuario.email || '').trim().toLowerCase();
      if (!email) return;
      this.contagemEmails.set(email, (this.contagemEmails.get(email) || 0) + 1);
    });
  },

  setCarregando(ativo, texto = 'Carregando usuários...') {
    const overlay = document.getElementById('admin-loading');
    const label = document.getElementById('admin-loading-text');
    if (label) label.textContent = texto;
    overlay?.classList.toggle('active', ativo);
  },

  async carregar(opcoes = {}) {
    const usarCache = opcoes.usarCache !== false;
    const cache = usarCache ? this.lerCacheUsuarios() : null;
    if (cache) {
      this.aplicarUsuarios(cache);
    } else {
      this.setCarregando(true);
    }

    try {
      const [res, acessoRes] = await Promise.all([
        API.getUsuarios(),
        API.getControleAcesso()
      ]);
      if (!res.ok) {
        toast(res.error || 'Erro ao carregar usuários.', 'error');
        return;
      }
      if (acessoRes.ok) {
        this.controleAcesso = acessoRes.data || { grupos: [], permissoes: [] };
      } else {
        toast(acessoRes.error || 'Não foi possível carregar grupos e permissões.', 'warning');
      }

      this.aplicarUsuarios(res.data || {});
      this.gravarCacheUsuarios(res.data || {});
      if (res.data?.aviso) toast(res.data.aviso, 'warning', 6000);
    } finally {
      this.setCarregando(false);
    }
  },

  normalizarOrigem(origem) {
    return String(origem || 'hub').trim().toLowerCase();
  },

  labelOrigem(origem) {
    return this.normalizarOrigem(origem) === 'cco' ? 'CCO' : 'Hub';
  },

  // Nome do cargo (grupo oficial) do usuário, quando houver.
  nomeCargoUsuario(usuario) {
    const grupos = (usuario?.grupos || []).map(String);
    const cargoId = grupos.find(g => RBAC_CARGOS_OFERECIDOS.includes(g));
    if (!cargoId) return '';
    const grupo = (this.controleAcesso.grupos || []).find(g => String(g.id) === cargoId);
    return grupo?.nome || cargoId;
  },

  labelPerfil(usuario) {
    if (this.eSuperadminUsuario(usuario)) return 'Superadmin';
    if (this.normalizarOrigem(usuario.origem) !== 'cco') {
      const cargo = this.nomeCargoUsuario(usuario);
      if (cargo) return cargo;
    }
    const perfil = usuario.perfil;
    if (Auth.perfilEhMaster(perfil)) return 'Master TI';
    if (Auth.normalizarPerfil(perfil) === 'financeiro') return 'Financeiro';
    if (Auth.normalizarPerfil(perfil) === 'controle_gastos_visualizacao') {
      return 'Controle de Gastos · Leitura';
    }
    if (Auth.normalizarPerfil(perfil) === 'escala_minions') {
      return 'Escala & SAFE MINIONS';
    }
    if (Auth.perfilSomenteLeitura(perfil)) return 'Admin leitura';
    if (Auth.perfilEhAdmin(perfil)) return 'Administrador';
    if (Auth.normalizarPerfil(perfil) === 'cco_admin') return 'Administrador CCO';
    if (Auth.normalizarPerfil(perfil) === 'cco_financeiro') return 'Financeiro CCO';
    if (Auth.normalizarPerfil(perfil) === 'cco_user') return 'Operador CCO';
    return 'Consultor';
  },

  badgePerfil(perfil) {
    if (Auth.perfilEhMaster(perfil)) return 'badge-blue';
    if (Auth.normalizarPerfil(perfil).includes('financeiro')) return 'badge-teal';
    if (Auth.perfilSomenteLeitura(perfil)) return 'badge-orange';
    return Auth.normalizarPerfil(perfil).includes('admin') ? 'badge-navy' : 'badge-teal';
  },

  badgeUsuario(usuario) {
    return this.eSuperadminUsuario(usuario) ? 'badge-blue' : this.badgePerfil(usuario.perfil);
  },

  resumoAcessoUsuario(usuario) {
    if (this.normalizarOrigem(usuario.origem) === 'cco') return 'Acesso gerenciado no CCO';
    if (this.eSuperadminUsuario(usuario)) return 'Acesso total ao Hub';
    const grupos = (usuario.grupos || []).map(String);
    if (!grupos.length) return 'Sem cargo definido';
    const excecoes = (Array.isArray(usuario.permissoesAvulsas) ? usuario.permissoesAvulsas.length : 0)
      + (Array.isArray(usuario.permissoesNegadas) ? usuario.permissoesNegadas.length : 0);
    return excecoes ? `Cargo + ${excecoes} exceção(ões)` : 'Cargo padrão';
  },

  eSuperadminUsuario(usuario) {
    return usuario?.superadmin === true || String(usuario?.superadmin).toLowerCase() === 'true';
  },

  estaAtivo(valor) {
    return valor === true || valor === 1 || String(valor).trim().toLowerCase() === 'true';
  },

  usuariosFiltrados() {
    const busca = document.getElementById('filtro-busca')?.value.trim().toLowerCase() || '';
    const origem = document.getElementById('filtro-origem')?.value || '';
    const cadastro = document.getElementById('filtro-cadastro')?.value || '';

    return this.usuarios.filter(usuario => {
      const ativo = this.estaAtivo(usuario.ativo);
      const texto = [
        usuario.nome,
        usuario.email,
        usuario.modulo,
        this.labelPerfil(usuario)
      ].join(' ').toLowerCase();

      if (busca && !texto.includes(busca)) return false;
      if (origem && this.normalizarOrigem(usuario.origem) !== origem) return false;
      if (this.abaAtual === 'ativos' && !ativo) return false;
      if (this.abaAtual === 'inativos' && ativo) return false;
      if (cadastro === 'completo' && !this.cadastroCompleto(usuario)) return false;
      if (cadastro === 'pendente' && this.cadastroCompleto(usuario)) return false;
      return true;
    });
  },

  renderResumo() {
    const total = this.usuarios.length;
    const ativos = this.usuarios.filter(u => this.estaAtivo(u.ativo)).length;
    const sistemas = new Set(this.usuarios.map(u => this.normalizarOrigem(u.origem))).size;
    const pendentes = this.usuarios.filter(u => !this.cadastroCompleto(u)).length;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-ativos').textContent = ativos;
    document.getElementById('kpi-sistemas').textContent = sistemas;
    document.getElementById('kpi-pendentes').textContent = pendentes;
    document.getElementById('tab-ativos-count').textContent = ativos;
    document.getElementById('tab-inativos-count').textContent = total - ativos;
  },

  cadastroCompleto(usuario) {
    const email = String(usuario.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    return (this.contagemEmails?.get(email) || 0) === 1;
  },

  renderTabela() {
    const tbody = document.getElementById('tabela-usuarios');
    const contador = document.getElementById('usuarios-contagem');
    if (!tbody) return;

    const usuarios = this.usuariosFiltrados();
    if (contador) contador.textContent = `${usuarios.length} de ${this.usuarios.length}`;

    if (!usuarios.length) {
      const mensagem = this.abaAtual === 'ativos'
        ? 'Nenhum usuário ativo encontrado'
        : 'Nenhum usuário inativo encontrado';
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:32px">${mensagem}</td></tr>`;
      return;
    }

    const usuarioAtualId = String(Auth.getSessao()?.id || '');
    tbody.innerHTML = usuarios.map(usuario => {
      const ativo = this.estaAtivo(usuario.ativo);
      const origem = this.normalizarOrigem(usuario.origem);
      const completo = this.cadastroCompleto(usuario);
      const proprioUsuario = String(usuario.id) === usuarioAtualId;
      return `
        <tr>
          <td class="col-nome" data-label="Usuário">
            <div class="usuario-identidade">
              ${this.avatarUsuarioHtml(usuario, origem)}
              <span>
                <strong>${this.escape(usuario.nome || usuario.pac)}</strong>
                <small class="${completo ? '' : 'usuario-email-pendente'}">${this.escape(usuario.email || 'E-mail de acesso não informado')}</small>
              </span>
            </div>
          </td>
          <td data-label="Sistema">
            <span class="badge origem-badge origem-${origem}">${this.labelOrigem(origem)}</span>
            <small class="usuario-modulo">${this.escape(usuario.modulo || 'SAFE Hub')}</small>
          </td>
          <td class="col-perfil" data-label="Perfil">
            <span class="badge ${this.badgeUsuario(usuario)}">${this.labelPerfil(usuario)}</span>
            <small class="usuario-access-line">${this.escape(this.resumoAcessoUsuario(usuario))}</small>
          </td>
          <td data-label="Cadastro"><span class="cadastro-status ${completo ? 'completo' : 'pendente'}">${completo ? 'Completo' : 'Ação necessária'}</span></td>
          <td data-label="Ação">
            <div class="usuario-actions">
              <button class="btn btn-ghost btn-sm" onclick="Admin.editar('${this.escapeAtributo(usuario.id)}')">Editar</button>
              <button class="btn btn-sm ${ativo ? 'btn-status-danger' : 'btn-status-success'}" ${proprioUsuario ? 'disabled title="Você não pode desativar seu próprio acesso"' : `onclick="Admin.alternarStatus('${this.escapeAtributo(usuario.id)}')"`}>
                ${ativo ? 'Desativar' : 'Reativar'}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  iniciais(nome) {
    return String(nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  },

  // Só data URI de imagem vira <img>. A coluna AVATAR guarda a imagem
  // embutida, nunca um link, então qualquer outra coisa ali é lixo e não
  // deve virar requisição para fora. O formato é conferido por inteiro
  // porque este valor entra como atributo `src` numa string de HTML: o
  // alfabeto base64 não tem aspas, e o que não casa não é desenhado.
  fotoUsuario(usuario) {
    const foto = String(usuario?.avatar || '');
    return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto) ? foto : '';
  },

  // Mesmo elemento com e sem foto, como no `pintarAvatares` do auth.js: sem
  // ela mostra as iniciais; com ela recebe um <img> e a classe `tem-foto`.
  avatarUsuarioHtml(usuario, origem, classeExtra = '') {
    const foto = this.fotoUsuario(usuario);
    const classes = `usuario-avatar origem-${origem}${foto ? ' tem-foto' : ''}${classeExtra ? ' ' + classeExtra : ''}`;
    const conteudo = foto
      ? `<img src="${this.escape(foto)}" alt="" aria-hidden="true">`
      : this.iniciais(usuario.nome);
    return `<span class="${classes}">${conteudo}</span>`;
  },

  escape(valor) {
    const el = document.createElement('div');
    el.textContent = String(valor ?? '');
    return el.innerHTML;
  },

  escapeAtributo(valor) {
    return String(valor ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  },

  formatarData(valor) {
    if (!valor) return '—';
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
  },

  initFiltros() {
    ['filtro-busca', 'filtro-origem', 'filtro-cadastro'].forEach(id => {
      document.getElementById(id)?.addEventListener(id === 'filtro-busca' ? 'input' : 'change', () => {
        this.renderTabela();
      });
    });
  },

  limparFiltrosIniciais() {
    const busca = document.getElementById('filtro-busca');
    if (busca) {
      busca.value = '';
      busca.setAttribute('autocomplete', 'off');
      // O campo começa readonly (no HTML) para impedir o autofill do navegador,
      // que estava injetando o e-mail do usuário logado. Só liberamos a digitação
      // quando o próprio usuário interage com o campo.
      const liberar = () => busca.removeAttribute('readonly');
      busca.addEventListener('focus', liberar, { once: true });
      busca.addEventListener('pointerdown', liberar, { once: true });
      // Rede de segurança: se o navegador ainda assim preencher, limpamos.
      [150, 500].forEach(delay => setTimeout(() => {
        if (busca.value) {
          busca.value = '';
          this.renderTabela();
        }
      }, delay));
    }
    const origem = document.getElementById('filtro-origem');
    const cadastro = document.getElementById('filtro-cadastro');
    if (origem) origem.value = '';
    if (cadastro) cadastro.value = '';
  },

  initTabs() {
    document.querySelectorAll('.usuarios-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.abaAtual = tab.dataset.tab;
        document.querySelectorAll('.usuarios-tab').forEach(item => {
          const ativa = item === tab;
          item.classList.toggle('active', ativa);
          item.setAttribute('aria-selected', String(ativa));
        });
        this.renderTabela();
      });
    });
  },

  initForm() {
    document.getElementById('btn-novo-usuario')?.addEventListener('click', () => this.abrirForm());
    document.getElementById('btn-salvar-usuario')?.addEventListener('click', () => this.salvar());
    document.getElementById('btn-reenviar-boas-vindas')?.addEventListener('click', () => this.reenviarBoasVindas());
    document.getElementById('btn-resetar-senha-padrao')?.addEventListener('click', () => this.resetarSenhaPadrao());
    document.getElementById('btn-forcar-relogin')?.addEventListener('click', () => this.forcarReloginGlobal());
    document.getElementById('u-origem')?.addEventListener('change', () => this.atualizarCamposOrigem());
    document.getElementById('u-superadmin')?.addEventListener('change', () => this.atualizarResumoAcesso());
    document.getElementById('u-cargo')?.addEventListener('change', event => this.aplicarCargo(event.target.value));
    document.getElementById('u-matriz-acesso')?.addEventListener('click', event => {
      const nivelBtn = event.target.closest('.acesso-seg button');
      const escBtn = event.target.closest('.acesso-escopo');
      const row = event.target.closest('.acesso-row');
      if (!row) return;
      const mid = row.dataset.mid;
      const estado = this.matrizAcesso[mid] || { n: 0, s: 'proprias' };
      if (nivelBtn) {
        estado.n = Number(nivelBtn.dataset.lvl);
      } else if (escBtn) {
        estado.s = estado.s === 'todas' ? 'proprias' : 'todas';
      } else {
        return;
      }
      this.matrizAcesso[mid] = estado;
      this.renderMatrizAcesso();
    });
  },

  async forcarReloginGlobal() {
    const msg = 'Isso vai encerrar todas as sessões ativas do Hub, inclusive a sua. Todos precisarão entrar novamente.';
    if (!window.confirm(`${msg}\n\nDeseja continuar?`)) return;

    const btn = document.getElementById('btn-forcar-relogin');
    btnLoading(btn, true);
    const res = await API.forcarLogoutGlobal();
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Não foi possível forçar o relogin geral.', 'error');
      return;
    }

    toast('Sessões encerradas. Redirecionando para o login.', 'success');
    setTimeout(() => Auth.logout(), 1200);
  },

  // O acesso efetivo é 100% RBAC (grupos + permissões avulsas). O `perfil`
  // legado é mantido apenas como ESPELHO para badges/rótulos e para os
  // guardas de escrita legados do backend — por isso é derivado dos grupos,
  // nunca escolhido à mão. Ordem = do mais privilegiado ao menos.
  GRUPO_PARA_PERFIL: [
    ['comercial_gerencia', 'admin'],
    ['financeiro', 'financeiro'],
    ['operacoes_escala', 'escala_minions'],
    ['somente_leitura', 'admin_readonly'],
    ['controle_gastos_leitura', 'controle_gastos_visualizacao'],
    ['comercial', 'pac']
  ],

  perfilDerivadoDosGrupos(gruposSelecionados) {
    const set = new Set((gruposSelecionados || []).map(g => String(g)));
    for (const [grupoId, perfil] of this.GRUPO_PARA_PERFIL) {
      if (set.has(grupoId)) return perfil;
    }
    return 'pac';
  },

  atualizarResumoAcesso() {
    const superadmin = document.getElementById('u-superadmin')?.checked;
    document.getElementById('grupo-superadmin')?.classList.toggle('is-active', !!superadmin);
    const rbac = document.getElementById('usuario-rbac');
    if (rbac) rbac.dataset.superadmin = superadmin ? '1' : '0';
    this.renderMatrizAcesso();
  },

  atualizarCamposOrigem() {
    const origem = document.getElementById('u-origem').value;
    const cco = origem === 'cco';
    document.getElementById('campos-cco').hidden = !cco;
    document.getElementById('grupo-perfil-cco').hidden = !cco;
    document.getElementById('grupo-superadmin').hidden = cco;
    document.getElementById('usuario-rbac').hidden = cco;
    document.getElementById('grupo-email-boas-vindas').hidden = !!this.editandoId;
    document.getElementById('acoes-usuario-existente').hidden = !this.editandoId;
    this.atualizarResumoAcesso();
  },

  // ── Helpers da matriz de acesso ──────────────────────────
  moduloPorId(mid) {
    return RBAC_MODULOS.find(m => m.id === mid) || null;
  },

  // Permissões de um módulo dado nível (1=Ver, 2=Editar) e escopo.
  permsDoModulo(m, n, s) {
    if (!m || !n) return [];
    const pick = campo => Array.isArray(campo) ? campo : (s === 'todas' ? campo.todas : campo.proprias);
    let out = pick(m.ver).slice();
    if (n === 2 && m.editar) out = out.concat(pick(m.editar));
    return out;
  },

  // Permissões dos grupos (cargos) do usuário, via dados do backend.
  permsDoGrupo(grupoId) {
    const g = (this.controleAcesso.grupos || []).find(item => String(item.id) === String(grupoId));
    return (g?.permissoes || []).map(String);
  },

  // Converte o estado atual da matriz em um conjunto de permissões.
  matrizParaPermissoes() {
    const set = new Set(RBAC_PERMS_BASE);
    RBAC_MODULOS.forEach(m => {
      const st = this.matrizAcesso[m.id] || { n: 0 };
      this.permsDoModulo(m, st.n, st.s).forEach(p => set.add(p));
    });
    return set;
  },

  // Deduz o estado da matriz (nível/escopo por módulo) de um conjunto de permissões.
  inferirMatriz(permSet) {
    const has = list => Array.isArray(list) && list.some(p => permSet.has(p));
    const matriz = {};
    RBAC_MODULOS.forEach(m => {
      let n = 0, s = 'proprias';
      if (m.escopo) {
        const verTodasOnly = m.ver.todas.filter(p => m.ver.proprias.indexOf(p) === -1);
        const escVer = has(verTodasOnly);
        if (m.editar) {
          const edTodasOnly = m.editar.todas.filter(p => m.editar.proprias.indexOf(p) === -1);
          if (has(m.editar.proprias) || has(m.editar.todas)) {
            n = 2; s = (has(edTodasOnly) || escVer) ? 'todas' : 'proprias';
          } else if (has(m.ver.proprias) || has(m.ver.todas)) {
            n = 1; s = escVer ? 'todas' : 'proprias';
          }
        } else if (has(m.ver.proprias) || has(m.ver.todas)) {
          n = 1; s = escVer ? 'todas' : 'proprias';
        }
      } else {
        if (m.editar && has(m.editar)) n = 2;
        else if (has(m.ver)) n = 1;
      }
      matriz[m.id] = { n, s };
    });
    return matriz;
  },

  // Preenche os cargos disponíveis no select.
  popularCargos() {
    const sel = document.getElementById('u-cargo');
    if (!sel) return;
    const grupos = this.controleAcesso.grupos || [];
    const nomeDe = id => (grupos.find(g => String(g.id) === id)?.nome) || id;
    sel.innerHTML = RBAC_CARGOS_OFERECIDOS
      .map(id => `<option value="${this.escapeAtributo(id)}">${this.escape(nomeDe(id))}</option>`)
      .join('');
  },

  // Troca de cargo: preenche a matriz com o acesso padrão do cargo.
  aplicarCargo(cargoId) {
    this.cargoAtual = cargoId;
    this.matrizAcesso = this.inferirMatriz(new Set(this.permsDoGrupo(cargoId)));
    this.renderMatrizAcesso();
  },

  renderMatrizAcesso() {
    const cont = document.getElementById('u-matriz-acesso');
    if (!cont) return;
    const superadmin = document.getElementById('u-superadmin')?.checked;

    cont.innerHTML = RBAC_MODULOS.map(m => {
      const st = this.matrizAcesso[m.id] || { n: 0, s: 'proprias' };
      const seg = [
        `<button type="button" data-lvl="0" class="${st.n === 0 ? 'is-active' : ''}">—</button>`,
        `<button type="button" data-lvl="1" class="${st.n === 1 ? 'is-active' : ''}">Ver</button>`,
        m.viewOnly ? '' : `<button type="button" data-lvl="2" class="${st.n === 2 ? 'is-active' : ''}">Editar</button>`
      ].join('');
      const escopo = m.escopo
        ? `<button type="button" class="acesso-escopo" data-escopo="${st.s}" ${st.n === 0 ? 'hidden' : ''}>${st.s === 'todas' ? m.escLabels[1] : m.escLabels[0]}</button>`
        : '';
      return `
        <div class="acesso-row ${st.n === 0 ? 'is-off' : ''}" data-mid="${m.id}" role="row">
          <div class="acesso-row-info">
            <div class="acesso-row-nome">${this.escape(m.nome)}</div>
            <div class="acesso-row-nota">${this.escape(m.nota)}</div>
          </div>
          <div class="acesso-row-controls">
            <div class="acesso-seg">${seg}</div>
            ${escopo}
          </div>
        </div>`;
    }).join('');

    // Resumo + exceções em relação ao cargo escolhido.
    const resumo = document.getElementById('u-acesso-resumo');
    if (resumo) {
      if (superadmin) {
        resumo.innerHTML = '<b>Superadmin</b> — acesso total ao Hub. O cargo e os ajustes acima são ignorados.';
      } else {
        const desejado = this.matrizParaPermissoes();
        const base = new Set(this.permsDoGrupo(this.cargoAtual));
        const extras = [...desejado].filter(p => !base.has(p)).length;
        const removidas = [...base].filter(p => !desejado.has(p)).length;
        const liberados = RBAC_MODULOS.filter(m => (this.matrizAcesso[m.id]?.n || 0) > 0).length;
        const exc = (extras + removidas)
          ? ` · <b>${extras + removidas}</b> exceção(ões) sobre o cargo`
          : ' · sem exceções (igual ao cargo)';
        resumo.innerHTML = `<b>${liberados}</b> módulo(s) liberado(s)${exc}.`;
      }
    }
  },

  abrirForm(usuario = null) {
    this.editandoId = usuario?.id || null;
    const origem = this.normalizarOrigem(usuario?.origem);

    document.getElementById('modal-u-titulo').textContent = usuario ? 'Editar acesso' : 'Novo acesso';
    document.getElementById('u-origem').value = origem;
    document.getElementById('u-origem').disabled = !!usuario;
    document.getElementById('u-nome').value = usuario?.nome || '';
    document.getElementById('u-pac').value = usuario?.pac || '';
    document.getElementById('u-email').value = usuario?.email || '';
    document.getElementById('u-perfil').value = usuario?.perfil || 'pac';
    document.getElementById('u-role-cco').value = usuario?.roleOrigem || 'user';
    document.getElementById('u-ativo').value = usuario ? String(this.estaAtivo(usuario.ativo)) : 'true';
    document.getElementById('u-superadmin').checked = this.eSuperadminUsuario(usuario);
    document.getElementById('u-enviar-boas-vindas').checked = !usuario;

    // Cargo base + matriz. Deduz o acesso efetivo do usuário (grupos + exceções).
    this.popularCargos();
    const gruposUsuario = (usuario?.grupos || []).map(String);
    this.cargoAtual = gruposUsuario.find(g => RBAC_CARGOS_OFERECIDOS.includes(g)) || RBAC_CARGOS_OFERECIDOS[0];
    document.getElementById('u-cargo').value = this.cargoAtual;
    if (usuario) {
      const efetivas = new Set();
      gruposUsuario.forEach(gid => this.permsDoGrupo(gid).forEach(p => efetivas.add(p)));
      (usuario.permissoesAvulsas || []).forEach(p => efetivas.add(String(p)));
      (usuario.permissoesNegadas || []).forEach(p => efetivas.delete(String(p)));
      this.matrizAcesso = this.inferirMatriz(efetivas);
    } else {
      this.matrizAcesso = this.inferirMatriz(new Set(this.permsDoGrupo(this.cargoAtual)));
    }

    document.getElementById('u-iniciais').value = usuario?.initials || '';
    document.getElementById('u-cpf').value = usuario?.cpf || '';
    document.getElementById('u-nascimento').value = usuario?.birthdate || '';
    document.getElementById('u-telefone').value = usuario?.phone || '';
    document.getElementById('u-cor').value = usuario?.color || '#5BAEE2';
    document.getElementById('u-visivel-escala').checked = usuario ? usuario.scheduleVisible !== false : true;

    document.getElementById('u-pac').disabled = !!usuario;
    this.atualizarCamposOrigem();
    this.renderMatrizAcesso();
    this.renderFotoFormulario(usuario);
    abrirModal('modal-usuario');
  },

  // Estado do bloco de foto do formulário. Só usuário do Hub já criado pode
  // receber foto: o CCO guarda a dele no sistema próprio, e um cadastro novo
  // ainda não tem linha na planilha para gravar.
  renderFotoFormulario(usuario) {
    const origem = this.normalizarOrigem(usuario?.origem);
    const editavel = !!usuario && origem === 'hub';
    const foto = editavel ? this.fotoUsuario(usuario) : '';

    const avatar = document.getElementById('u-avatar');
    avatar.className = `usuario-avatar is-lg origem-${origem}${foto ? ' tem-foto' : ''}`;
    avatar.innerHTML = '';
    if (foto) {
      const img = document.createElement('img');
      img.src = foto;
      img.alt = '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = this.iniciais(usuario?.nome);
    }

    document.getElementById('u-foto-botoes').hidden = !editavel;
    document.getElementById('u-foto-remover').hidden = !foto;
    document.getElementById('u-foto-dica').textContent = editavel
      ? 'Você escolhe o enquadramento. A foto é salva na hora, sem depender do botão Salvar.'
      : (origem === 'cco'
          ? 'A foto de usuários da Escala CCO é gerenciada no sistema dela.'
          : 'A foto pode ser enviada depois de criar o acesso.');
  },

  initFotoUsuario() {
    const arquivo  = document.getElementById('u-foto-arquivo');
    const btEnviar = document.getElementById('u-foto-enviar');
    const btRemover = document.getElementById('u-foto-remover');
    if (!arquivo || !btEnviar || !btRemover) return;

    // Sem otimista: quem valida a imagem e persiste é o servidor, e fingir
    // mostraria a foto nova numa gravação recusada. Mesma escolha do
    // "Meus dados" no auth.js.
    const gravar = async (uri, botao, rotulo) => {
      const usuario = this.usuarios.find(item => String(item.id) === String(this.editandoId));
      if (!usuario) return;

      const textoOriginal = botao.textContent;
      botao.disabled = btEnviar.disabled = true;
      botao.textContent = rotulo;

      const res = await API.salvarAvatarUsuario(usuario.id, uri);

      botao.disabled = btEnviar.disabled = false;
      botao.textContent = textoOriginal;

      if (!res?.ok) {
        toast(res?.error || 'Não foi possível salvar a foto.', 'error');
        return;
      }

      usuario.avatar = uri;
      this.gravarCacheUsuarios({ usuarios: this.usuarios });
      this.renderFotoFormulario(usuario);
      this.renderTabela();

      // Se o superadmin trocou a própria foto, a sessão em localStorage é o
      // que todas as páginas leem: sem atualizar aqui, o avatar da topbar só
      // mudaria no próximo login.
      if (String(usuario.id) === String(Auth.getSessao()?.id || '')) {
        Auth.salvarSessao({ ...Auth.getSessao(), avatar: uri });
        Auth.pintarAvatares();
      }
      toast(uri ? 'Foto atualizada.' : 'Foto removida.', 'success');
    };

    btEnviar.addEventListener('click', () => arquivo.click());
    btRemover.addEventListener('click', () => gravar('', btRemover, 'Removendo...'));

    arquivo.addEventListener('change', async () => {
      const f = arquivo.files?.[0];
      arquivo.value = '';   // permite reescolher o mesmo arquivo depois de um erro
      if (!f) return;
      try {
        const uri = await Auth._prepararAvatar(f);
        if (!uri) return;   // fechou o editor sem confirmar o enquadramento
        await gravar(uri, btEnviar, 'Enviando...');
      } catch (e) {
        toast(e.message || 'Não consegui usar essa imagem.', 'error');
      }
    });
  },

  editar(id) {
    const usuario = this.usuarios.find(item => String(item.id) === String(id));
    if (usuario) this.abrirForm(usuario);
  },

  async alternarStatus(id) {
    const usuario = this.usuarios.find(item => String(item.id) === String(id));
    if (!usuario) return;

    const ativo = this.estaAtivo(usuario.ativo);
    const verbo = ativo ? 'desativar' : 'reativar';
    const explicacao = ativo
      ? 'O usuário perderá o acesso, mas vendas, escalas e históricos serão preservados.'
      : 'O usuário voltará a conseguir entrar nos sistemas vinculados.';

    if (!window.confirm(`Deseja ${verbo} o acesso de ${usuario.nome}?\n\n${explicacao}`)) return;

    // Atualização otimista: reflete na tela imediatamente (o backend do Apps Script
    // pode levar ~10s). Se a gravação falhar, revertemos o estado e avisamos.
    usuario.ativo = !ativo;
    this.gravarCacheUsuarios({ usuarios: this.usuarios });
    this.renderResumo();
    this.renderTabela();

    const res = await API.alterarStatusUsuario(usuario.id, this.normalizarOrigem(usuario.origem), !ativo);

    if (!res.ok) {
      // Reverte o estado otimista, pois o servidor não confirmou a alteração.
      usuario.ativo = ativo;
      this.gravarCacheUsuarios({ usuarios: this.usuarios });
      this.renderResumo();
      this.renderTabela();
      toast(res.error || `Não foi possível ${verbo} o acesso.`, 'error');
      return;
    }

    toast(ativo ? 'Acesso desativado.' : 'Acesso reativado.', 'success');
  },

  dadosFormularioUsuario() {
    const origem = document.getElementById('u-origem').value;
    const superadmin = origem === 'hub' && document.getElementById('u-superadmin').checked;

    // Acesso = cargo (grupo) + exceções: avulsas (adiciona) e negadas (remove),
    // calculadas comparando a matriz atual com o padrão do cargo escolhido.
    let grupos, avulsas, negadas;
    if (origem === 'hub' && !superadmin) {
      const desejado = this.matrizParaPermissoes();
      const base = new Set(this.permsDoGrupo(this.cargoAtual));
      grupos = this.cargoAtual ? [this.cargoAtual] : [];
      avulsas = [...desejado].filter(p => !base.has(p));
      negadas = [...base].filter(p => !desejado.has(p));
    } else if (origem === 'hub') {
      // Superadmin ignora tudo; limpa vínculos.
      grupos = []; avulsas = []; negadas = [];
    }

    // `perfil` (legado) é ESPELHO derivado do cargo — o acesso real é RBAC.
    const perfil = origem === 'cco'
      ? document.getElementById('u-perfil').value
      : (superadmin ? 'master' : this.perfilDerivadoDosGrupos(grupos || []));
    return {
      id: this.editandoId,
      origem,
      nome: document.getElementById('u-nome').value.trim(),
      pac: document.getElementById('u-pac').value.trim(),
      email: document.getElementById('u-email').value.trim(),
      perfil,
      roleOrigem: document.getElementById('u-role-cco').value,
      ativo: document.getElementById('u-ativo').value === 'true',
      superadmin,
      grupos: origem === 'hub' ? grupos : undefined,
      permissoesAvulsas: origem === 'hub' ? avulsas : undefined,
      permissoesNegadas: origem === 'hub' ? negadas : undefined,
      initials: document.getElementById('u-iniciais').value.trim().toUpperCase(),
      cpf: document.getElementById('u-cpf').value.replace(/\D/g, ''),
      birthdate: document.getElementById('u-nascimento').value.trim(),
      phone: document.getElementById('u-telefone').value.replace(/\D/g, ''),
      color: document.getElementById('u-cor').value,
      scheduleVisible: document.getElementById('u-visivel-escala').checked
    };
  },

  async reenviarBoasVindas() {
    if (!this.editandoId) return;
    const dados = this.dadosFormularioUsuario();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
      toast('Informe um e-mail válido antes de reenviar.', 'warning');
      return;
    }
    if (dados.cpf.length !== 11) {
      toast('Cadastre um CPF válido antes de reenviar o e-mail.', 'warning');
      return;
    }
    if (!window.confirm('Reenviar o e-mail de boas-vindas para este usuário? A senha atual não será alterada.')) return;

    const btn = document.getElementById('btn-reenviar-boas-vindas');
    btnLoading(btn, true);
    const res = await API.reenviarEmailBoasVindas(dados);
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Não foi possível reenviar o e-mail.', 'error');
      return;
    }
    toast('E-mail de boas-vindas reenviado.', 'success');
    await this.carregar();
  },

  async resetarSenhaPadrao() {
    if (!this.editandoId) return;
    const dados = this.dadosFormularioUsuario();
    if (dados.cpf.length !== 11) {
      toast('Cadastre e salve um CPF válido antes de resetar a senha.', 'warning');
      return;
    }
    if (!window.confirm('Resetar a senha deste usuário para o CPF cadastrado?')) return;

    const btn = document.getElementById('btn-resetar-senha-padrao');
    btnLoading(btn, true);
    const res = await API.resetarSenhaPadraoUsuario(this.editandoId);
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Não foi possível resetar a senha.', 'error');
      return;
    }
    toast('Senha resetada para o CPF cadastrado.', 'success');
  },

  async salvar() {
    const btn = document.getElementById('btn-salvar-usuario');
    const dados = this.dadosFormularioUsuario();
    dados.enviarBoasVindas = !this.editandoId && document.getElementById('u-enviar-boas-vindas').checked;
    const origem = dados.origem;

    if (!dados.nome) {
      toast('Informe o nome completo.', 'warning');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
      toast('Informe um e-mail de acesso válido.', 'warning');
      return;
    }
    if (origem === 'cco' && (!dados.cpf || !dados.birthdate || !dados.initials)) {
      toast('Para o CCO, informe iniciais, CPF e data de nascimento.', 'warning');
      return;
    }
    if (dados.cpf.length !== 11) {
      toast('Informe um CPF válido com 11 dígitos.', 'warning');
      return;
    }

    btnLoading(btn, true);
    const res = this.editandoId
      ? await API.editarUsuario(dados)
      : await API.criarUsuario(dados);
    btnLoading(btn, false);

    if (!res.ok) {
      toast(res.error || 'Erro ao salvar.', 'error');
      return;
    }

    toast(this.editandoId ? 'Acesso atualizado.' : 'Acesso criado.', 'success');
    if (!this.editandoId && res.data?.emailBoasVindasErro) {
      toast(`Acesso criado, mas o e-mail de boas-vindas não foi enviado: ${res.data.emailBoasVindasErro}`, 'warning', 7000);
    } else if (!this.editandoId && res.data?.emailBoasVindasEnviado) {
      toast('E-mail de boas-vindas enviado.', 'success');
    }
    fecharModal('modal-usuario');
    // Recarrega em segundo plano: o modal já fechou e perfil/badges derivam dos
    // grupos calculados no servidor, então não fingimos o estado localmente.
    this.carregar();
  },

  initAlterarSenha() {
    document.getElementById('btn-alterar-senha')?.addEventListener('click', async () => {
      const atual = document.getElementById('senha-atual').value;
      const nova = document.getElementById('senha-nova').value;
      const confirmar = document.getElementById('senha-confirmar').value;

      if (!atual || !nova) return toast('Preencha todos os campos.', 'warning');
      if (nova !== confirmar) return toast('As senhas não coincidem.', 'warning');
      if (nova.length < 6) return toast('A nova senha deve ter pelo menos 6 caracteres.', 'warning');

      const btn = document.getElementById('btn-alterar-senha');
      btnLoading(btn, true);
      const res = await Auth.alterarSenha(atual, nova);
      btnLoading(btn, false);

      if (!res.ok) return toast(res.error || 'Erro ao alterar senha.', 'error');
      toast('Senha alterada com sucesso.', 'success');
      ['senha-atual', 'senha-nova', 'senha-confirmar'].forEach(id => {
        document.getElementById(id).value = '';
      });
    });
  },

  initSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main');
    const overlay = document.getElementById('sidebar-overlay');
    const hamb = document.getElementById('hamburger');

    toggle?.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('sidebar-collapsed');
      toggle.innerHTML = sidebar.classList.contains('collapsed') ? '›' : '‹';
    });
    hamb?.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('active');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
