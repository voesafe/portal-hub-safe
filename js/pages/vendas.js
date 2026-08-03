// ============================================================
// vendas.js — Listagem, cadastro e edição de vendas
// SAFE Hub
// ============================================================

const CURSOS_VENDAS = [
  'Adaptação de Instrutor Externo',
  'Alojamento',
  'Aperfeiçoamento Contínuo',
  'Curriculo de Solo',
  'Horas de Voo',
  'INVA Prático',
  'INVA Teórico',
  'Piloto Comercial/IFR MLTE',
  'Piloto Comercial/IFR Prático',
  'Piloto Comercial Teórico',
  'Piloto Privado Prático',
  'Piloto Privado Teórico',
  'PLA AZUL',
  'SAFE Pilot Academy',
  'SIMULADOR AATD',
  'SIMULADOR PCATD',
  'Voo de Incentivo'
];

// Campos exigidos no cadastro de uma venda NOVA, na ordem em que aparecem no
// modal: a lista de pendencias segue a mesma ordem da tela, senao quem le tem
// que caçar cada campo fora de ordem.
//
// `foco` existe porque nem todo campo obrigatorio e um campo focavel: o curso
// e um <input type="hidden"> alimentado pelo seletor, entao quem recebe o foco
// e a marca de erro e o botao do seletor.
//
// A regra NAO vale na edicao (decidido em 2026-08-03). Venda antiga foi gravada
// quando so data, nome, curso e valor eram obrigatorios: exigir tudo ali
// travaria a correcao de um valor errado ate alguem caçar um e-mail de 2023.
// `validarVenda` recebe `novo` e e por isso que o parametro existe.
const CAMPOS_OBRIGATORIOS_VENDA = [
  { id: 'f-data',         rotulo: 'Data da Venda' },
  { id: 'f-pac',          rotulo: 'Consultor (PAC)' },
  { id: 'f-curso',        rotulo: 'Curso / Produto Comprado', foco: 'curso-picker-trigger' },
  { id: 'f-valor',        rotulo: 'Valor da Compra' },
  { id: 'f-origem',       rotulo: 'Origem do Lead' },
  { id: 'f-lead-novo',    rotulo: 'Lead Novo?' },
  { id: 'f-quem-comprou', rotulo: 'Quem Comprou' },
  { id: 'f-nome',         rotulo: 'Nome Completo' },
  { id: 'f-sexo',         rotulo: 'Sexo' },
  { id: 'f-nascimento',   rotulo: 'Data de Nascimento' },
  { id: 'f-email',        rotulo: 'E-mail' },
  { id: 'f-estado',       rotulo: 'Estado' },
  { id: 'f-cidade',       rotulo: 'Cidade' }
];

// Campos que a edicao continua exigindo, como antes desta entrega.
const CAMPOS_OBRIGATORIOS_EDICAO = ['f-data', 'f-nome', 'f-curso', 'f-valor'];

// Motivo do campo simplesmente vazio. Fica numa constante porque a lista de
// pendencias o usa para decidir NAO desenhar etiqueta nenhuma nesse caso.
const MOTIVO_VAZIO = 'não preenchido';

const PACOTES_LEGADOS_CURSOS = {
  'Pacote Piloto Privado Teórico + Prático': ['Piloto Privado Teórico', 'Piloto Privado Prático'],
  'Pacote Piloto Comercial/IFR Teórico + Prático': ['Piloto Comercial Teórico', 'Piloto Comercial/IFR Prático'],
  'Pacote Piloto Comercial/IFR MLTE Teórico + Prático': ['Piloto Comercial/IFR MLTE', 'Piloto Comercial/IFR Prático'],
  'Pacote INVA Teórico + Prático': ['INVA Teórico', 'INVA Prático']
};

const Vendas = {

  mesFiltro:   CONFIG.MES_ATUAL,
  anoFiltro:   CONFIG.ANO_ATUAL,
  dados:       [],
  pacs:        [],
  filtroPac:   '',
  filtroCidade:'',
  filtroEstado:'',
  filtroIdade: '',
  editandoId:  null,
  cursosSelecionados: [],
  cursoBusca: '',

  async init() {
    Auth.proteger();
    Auth.preencherUI();
    this.setCarregando(true);
    this.setLoadingTabela(true);
    try {
      await this.carregarPacs();
      this.initFiltros();
      this.initForm();
      this.initExportacao();
      this.initSidebar();
      await this.carregar();
    } finally {
      this.setCarregando(false);
    }
  },

  setCarregando(ativo, texto = 'Carregando vendas...') {
    const overlay = document.getElementById('vendas-loading');
    const label = document.getElementById('vendas-loading-text');
    if (label) label.textContent = texto;
    overlay?.classList.toggle('active', ativo);
  },

  // Consultores comerciais oficiais. Lista fixa e definida no select do HTML
  // (Thiago, Marlon, Adauto) — não é derivada dos usuários de login para
  // evitar que perfis administrativos com código PAC apareçam como consultores.
  async carregarPacs() {
    const campoPac = document.getElementById('f-pac');
    if (!campoPac) return;

    this.pacs = Array.from(campoPac.options).map(o => ({
      nome: o.textContent.trim(), pac: o.value, perfil: 'pac'
    }));

    this.preencherSelectPacs();
    this.preencherFiltroPacs();
  },

  preencherSelectPacs() {
    const campoPac = document.getElementById('f-pac');
    if (!campoPac || !this.pacs.length) return;
    const valorAtual = campoPac.value;
    campoPac.innerHTML = '';
    // Placeholder para o admin ter que escolher o consultor de proposito. Sem
    // ele o campo abre no primeiro da lista e uma venda de outra pessoa entra
    // no PAC errado so porque ninguem olhou o campo. Para quem nao e admin o
    // valor vem da sessao e o campo fica desabilitado, entao nao atrapalha.
    const vazio = document.createElement('option');
    vazio.value = '';
    vazio.textContent = 'Selecione';
    campoPac.appendChild(vazio);
    this.pacs.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.pac;
      opt.textContent = u.nome && u.nome !== u.pac ? `${u.nome} (${u.pac})` : u.pac;
      campoPac.appendChild(opt);
    });
    if (valorAtual && this.pacs.some(u => u.pac === valorAtual)) campoPac.value = valorAtual;
  },

  preencherFiltroPacs() {
    const filtro = document.getElementById('filtro-pac-vendas');
    if (!filtro) return;
    const campo = filtro.closest('[data-admin-only]') || filtro;
    if (!Auth.eAdmin()) { campo.style.display = 'none'; return; }
    campo.style.display = '';

    const valorAtual = filtro.value || this.filtroPac;
    const pacs = [...new Map(
      this.pacs.filter(u => u.pac).map(u => [u.pac, u.pac])
    ).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    filtro.innerHTML = '<option value="">Todos os PACs</option>';
    pacs.forEach(pac => {
      const opt = document.createElement('option');
      opt.value = pac; opt.textContent = pac;
      filtro.appendChild(opt);
    });
    if (valorAtual && pacs.includes(valorAtual)) { filtro.value = valorAtual; this.filtroPac = valorAtual; }
  },

  _normalizarFiltroTexto(valor) {
    return String(valor || '').trim();
  },

  // Popula os dropdowns de cidade e estado a partir das vendas carregadas
  _preencherFiltroCidades() {
    const sel = document.getElementById('filtro-cidade-vendas');
    if (!sel) return;

    const cidades = [...new Set(
      this.dados.map(v => this._normalizarFiltroTexto(v.cidade)).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const atual = sel.value || this.filtroCidade;
    sel.innerHTML = '<option value="">Todas as cidades</option>';
    cidades.forEach(cidade => {
      const opt = document.createElement('option');
      opt.value = cidade;
      opt.textContent = cidade;
      sel.appendChild(opt);
    });

    if (atual && cidades.includes(atual)) {
      sel.value = atual;
      this.filtroCidade = atual;
    } else if (atual) {
      this.filtroCidade = '';
    }
  },

  _preencherFiltroEstados() {
    const sel = document.getElementById('filtro-estado-vendas');
    if (!sel) return;
    const estados = [...new Set(
      this.dados.map(v => this._normalizarFiltroTexto(v.estado)).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const atual = sel.value || this.filtroEstado;
    sel.innerHTML = '<option value="">Todos os estados</option>';
    estados.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e; opt.textContent = e;
      sel.appendChild(opt);
    });
    if (atual && estados.includes(atual)) {
      sel.value = atual;
      this.filtroEstado = atual;
    } else if (atual) {
      this.filtroEstado = '';
    }
  },

  initFiltros() {
    const selMes = document.getElementById('sel-mes');
    const selAno = document.getElementById('sel-ano');

    if (selMes) {
      selMes.value = String(this.mesFiltro);
      selMes.addEventListener('change', () => { this.mesFiltro = selMes.value; this.carregar(); });
    }
    if (selAno) {
      selAno.value = this.anoFiltro;
      selAno.addEventListener('change', () => { this.anoFiltro = selAno.value; this.carregar(); });
    }

    document.getElementById('filtro-pac-vendas')?.addEventListener('change', e => {
      this.filtroPac = e.target.value; this.renderTabela();
    });
    document.getElementById('busca')?.addEventListener('input', e => {
      this.renderTabela(e.target.value);
    });
    document.getElementById('filtro-cidade-vendas')?.addEventListener('change', e => {
      this.filtroCidade = e.target.value; this.renderTabela();
    });
    document.getElementById('filtro-estado-vendas')?.addEventListener('change', e => {
      this.filtroEstado = e.target.value; this.renderTabela();
    });
    document.getElementById('filtro-idade-vendas')?.addEventListener('change', e => {
      this.filtroIdade = e.target.value; this.renderTabela();
    });

    // Limpa todos os filtros do painel de vendas.
    document.getElementById('btn-limpar-filtros')?.addEventListener('click', () => {
      this.filtroPac = '';
      this.filtroCidade = '';
      this.filtroEstado = '';
      this.filtroIdade  = '';
      const pac = document.getElementById('filtro-pac-vendas');
      const busca = document.getElementById('busca');
      const cidade = document.getElementById('filtro-cidade-vendas');
      const estado = document.getElementById('filtro-estado-vendas');
      const idade  = document.getElementById('filtro-idade-vendas');
      if (pac) pac.value = '';
      if (busca) busca.value = '';
      if (cidade) cidade.value = '';
      if (estado) estado.value = '';
      if (idade)  idade.value  = '';
      this.renderTabela();
    });
  },

  initForm() {
    this.initCursoPicker();
    this.initCidadeEstado();
    this.initValidacao();
    document.getElementById('btn-nova-venda')?.addEventListener('click',   () => this.abrirForm());
    document.getElementById('modal-close')?.addEventListener('click',      () => fecharModal('modal-venda'));
    document.getElementById('modal-cancelar')?.addEventListener('click',   () => fecharModal('modal-venda'));
    document.getElementById('btn-salvar')?.addEventListener('click',       () => this.salvar());
  },

  // ── Cidade dependente do estado ─────────────────────────────
  initCidadeEstado() {
    document.getElementById('f-estado')?.addEventListener('change', e => {
      this.preencherCidades(e.target.value);
    });
  },

  // Repopula o dropdown de cidades com os municipios da UF.
  //
  // `desejada` e o que esta gravado na venda. Cidade antiga foi digitada a mao,
  // entao pode vir "SAO PAULO" ou "sao paulo": `municipioOficial` casa ignorando
  // caixa e acento. Quando nao casa com municipio nenhum, o valor entra como uma
  // opcao extra e continua selecionado. Descartar em silencio apagaria dado que
  // ninguem pediu para apagar, e a pessoa so notaria depois de salvar.
  preencherCidades(uf, desejada = '') {
    const sel = document.getElementById('f-cidade');
    if (!sel) return;

    const estado   = String(uf || '').trim().toUpperCase();
    const gravada  = String(desejada || '').trim();
    const cidades  = municipiosDoEstado(estado);

    if (!cidades.length) {
      // Sem estado escolhido nao ha lista possivel. Se a venda ja trazia uma
      // cidade, ela fica ali sozinha para nao se perder.
      sel.innerHTML = '';
      sel.appendChild(this._opcaoCidade('', gravada ? 'Selecione' : 'Escolha o estado primeiro'));
      if (gravada) sel.appendChild(this._opcaoCidade(gravada, `${gravada} (fora da lista)`));
      sel.value = gravada;
      sel.disabled = !gravada;
      return;
    }

    sel.disabled = false;
    sel.innerHTML = '';
    sel.appendChild(this._opcaoCidade('', 'Selecione a cidade'));
    cidades.forEach(cidade => sel.appendChild(this._opcaoCidade(cidade, cidade)));

    if (!gravada) { sel.value = ''; return; }

    const oficial = municipioOficial(estado, gravada);
    if (oficial) { sel.value = oficial; return; }

    sel.appendChild(this._opcaoCidade(gravada, `${gravada} (fora da lista)`));
    sel.value = gravada;
  },

  _opcaoCidade(valor, texto) {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = texto;
    return opt;
  },

  // ── Validacao e modal de pendencias ─────────────────────────
  initValidacao() {
    const fechar = () => this.fecharCamposFaltando();
    document.getElementById('faltando-close')?.addEventListener('click', fechar);
    document.getElementById('faltando-ok')?.addEventListener('click', fechar);
    document.getElementById('modal-campos-faltando')?.addEventListener('click', e => {
      if (e.target.id === 'modal-campos-faltando') fechar();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('modal-campos-faltando')?.classList.contains('open')) fechar();
    });

    // A marca vermelha some assim que a pessoa mexe no campo. Deixar o campo
    // vermelho depois de preenchido faria a tela continuar acusando erro que
    // ja foi resolvido, e a proxima tentativa de salvar seria as cegas.
    CAMPOS_OBRIGATORIOS_VENDA.forEach(campo => {
      const el = document.getElementById(campo.id);
      if (!el) return;
      ['input', 'change'].forEach(evt => el.addEventListener(evt, () => this._desmarcarCampo(campo)));
    });
  },

  // Devolve a lista de pendencias, na ordem da tela. Vazia = pode salvar.
  validarVenda(dados, novo) {
    const exigidos = novo
      ? CAMPOS_OBRIGATORIOS_VENDA
      : CAMPOS_OBRIGATORIOS_VENDA.filter(c => CAMPOS_OBRIGATORIOS_EDICAO.includes(c.id));

    return exigidos
      .map(campo => {
        const motivo = this._motivoInvalido(campo.id, dados);
        return motivo ? { ...campo, motivo } : null;
      })
      .filter(Boolean);
  },

  // null = campo ok. String = o que esta errado, mostrado na lista do modal.
  _motivoInvalido(id, dados) {
    const hoje = new Date().toISOString().split('T')[0];

    if (id === 'f-valor') {
      if (!dados.valor) return MOTIVO_VAZIO;
      return dados.valor > 0 ? null : 'precisa ser maior que zero';
    }
    if (id === 'f-email') {
      if (!dados.email.trim()) return MOTIVO_VAZIO;
      // Checagem de forma, nao de existencia: exige texto, @, dominio e ponto.
      // Campo obrigatorio que aceita "abc" garante preenchimento e nao dado.
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dados.email.trim()) ? null : 'e-mail inválido';
    }
    if (id === 'f-nascimento') {
      if (!dados.nascimento) return MOTIVO_VAZIO;
      if (dados.nascimento > hoje) return 'não pode ser uma data futura';
      return dados.nascimento >= '1900-01-01' ? null : 'ano fora do razoável';
    }
    if (id === 'f-data') {
      if (!dados.data) return MOTIVO_VAZIO;
      return dados.data > hoje ? 'não pode ser uma data futura' : null;
    }
    // Para quem nao e admin o PAC vem da sessao, nao do campo, que fica
    // desabilitado: e o valor que vai ser gravado que precisa ser conferido.
    if (id === 'f-pac') return String(dados.pac || '').trim() ? null : MOTIVO_VAZIO;

    const valor = String(this._valorDoCampo(id) || '').trim();
    return valor ? null : MOTIVO_VAZIO;
  },

  _valorDoCampo(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  },

  // Pinta os campos pendentes, lista as pendencias e abre o modal por cima do
  // formulario. O modal-venda continua aberto atras: fechar o formulario para
  // avisar de campo faltando jogaria fora o que ja foi digitado.
  mostrarCamposFaltando(faltando) {
    this.limparMarcasInvalidas();
    faltando.forEach(campo => this._marcarCampo(campo));

    const intro = document.getElementById('faltando-intro');
    const lista = document.getElementById('faltando-lista');
    if (intro) {
      intro.textContent = faltando.length === 1
        ? 'Falta um campo para registrar a venda:'
        : `Faltam ${faltando.length} campos para registrar a venda:`;
    }
    if (lista) {
      // A etiqueta do motivo so aparece quando ela diz algo alem do obvio.
      // "NAO PREENCHIDO" repetido em doze linhas vira ruido e apaga justamente
      // o aviso que importa, que e o campo preenchido de forma errada.
      lista.innerHTML = faltando.map(campo => {
        const etiqueta = campo.motivo === MOTIVO_VAZIO
          ? ''
          : `<span class="faltando-motivo">${escapeHtml(campo.motivo)}</span>`;
        return `
        <li>
          <button type="button" class="faltando-item" data-foco="${escapeHtml(campo.foco || campo.id)}">
            <span class="faltando-rotulo">${escapeHtml(campo.rotulo)}</span>
            ${etiqueta}
          </button>
        </li>`;
      }).join('');
      lista.querySelectorAll('[data-foco]').forEach(btn => {
        btn.addEventListener('click', () => this.fecharCamposFaltando(btn.dataset.foco));
      });
    }

    this._focoAoFechar = faltando[0] ? (faltando[0].foco || faltando[0].id) : '';
    abrirModal('modal-campos-faltando');
    setTimeout(() => document.getElementById('faltando-ok')?.focus(), 150);
  },

  // Ao fechar, leva a pessoa ao campo: sem isso ela sai do aviso e tem que
  // procurar sozinha o que estava vermelho, num modal que rola.
  fecharCamposFaltando(alvoId = '') {
    fecharModal('modal-campos-faltando');
    const id = alvoId || this._focoAoFechar;
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    }, 180);
  },

  _marcarCampo(campo) {
    document.getElementById(campo.foco || campo.id)?.classList.add('is-invalid');
  },

  _desmarcarCampo(campo) {
    document.getElementById(campo.foco || campo.id)?.classList.remove('is-invalid');
  },

  limparMarcasInvalidas() {
    document.querySelectorAll('#modal-venda .is-invalid').forEach(el => el.classList.remove('is-invalid'));
  },

  initCursoPicker() {
    const picker = document.getElementById('curso-picker');
    const trigger = document.getElementById('curso-picker-trigger');
    const busca = document.getElementById('curso-picker-search');
    const limpar = document.getElementById('curso-picker-clear');
    if (!picker || !trigger) return;

    trigger.addEventListener('click', () => {
      const aberto = picker.classList.toggle('open');
      trigger.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      if (aberto) setTimeout(() => busca?.focus(), 0);
    });

    busca?.addEventListener('input', e => {
      this.cursoBusca = e.target.value || '';
      this.renderCursoPicker();
    });

    limpar?.addEventListener('click', () => {
      this.setCursosSelecionados([]);
      busca?.focus();
    });

    document.addEventListener('click', e => {
      if (!picker.contains(e.target)) this.fecharCursoPicker();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.fecharCursoPicker();
    });

    this.renderCursoPicker();
  },

  fecharCursoPicker() {
    const picker = document.getElementById('curso-picker');
    const trigger = document.getElementById('curso-picker-trigger');
    picker?.classList.remove('open');
    trigger?.setAttribute('aria-expanded', 'false');
  },

  _normalizarCursoTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  },

  cursosPorTexto(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return [];
    if (PACOTES_LEGADOS_CURSOS[texto]) return [...PACOTES_LEGADOS_CURSOS[texto]];

    const porNormalizado = new Map(CURSOS_VENDAS.map(curso => [this._normalizarCursoTexto(curso), curso]));
    const encontrados = [];

    texto
      .split(/\s+\+\s+|,\s*|;\s*/)
      .map(parte => parte.trim())
      .filter(Boolean)
      .forEach(parte => {
        const curso = porNormalizado.get(this._normalizarCursoTexto(parte));
        if (curso && !encontrados.includes(curso)) encontrados.push(curso);
      });

    if (encontrados.length) return encontrados;
    return [texto];
  },

  setCursosSelecionados(cursos) {
    const vistos = new Set();
    this.cursosSelecionados = cursos
      .map(curso => String(curso || '').trim())
      .filter(curso => {
        const chave = this._normalizarCursoTexto(curso);
        if (!curso || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
    this.atualizarCursoHidden();
    this.renderCursoPicker();
  },

  alternarCurso(curso) {
    if (!CURSOS_VENDAS.includes(curso)) return;
    const selecionados = this.cursosSelecionados.includes(curso)
      ? this.cursosSelecionados.filter(item => item !== curso)
      : [...this.cursosSelecionados, curso];
    this.setCursosSelecionados(selecionados);
  },

  removerCursoSelecionado(curso) {
    const chave = this._normalizarCursoTexto(curso);
    this.setCursosSelecionados(
      this.cursosSelecionados.filter(item => this._normalizarCursoTexto(item) !== chave)
    );
  },

  atualizarCursoHidden() {
    const campo = document.getElementById('f-curso');
    if (campo) campo.value = this.cursosSelecionados.join(' + ');
    // O curso e um input hidden preenchido por codigo, e atribuir `.value` nao
    // dispara evento nenhum: sem esta linha o botao do seletor ficaria vermelho
    // para sempre depois de um aviso, mesmo com curso ja escolhido.
    if (this.cursosSelecionados.length) {
      document.getElementById('curso-picker-trigger')?.classList.remove('is-invalid');
    }
  },

  renderCursoPicker() {
    const lista = document.getElementById('curso-picker-options');
    const placeholder = document.getElementById('curso-picker-placeholder');
    const chips = document.getElementById('curso-picker-selected');
    const contador = document.getElementById('curso-picker-count');
    if (!lista || !placeholder || !chips || !contador) return;

    const termo = this._normalizarCursoTexto(this.cursoBusca);
    const cursos = termo
      ? CURSOS_VENDAS.filter(curso => this._normalizarCursoTexto(curso).includes(termo))
      : CURSOS_VENDAS;

    lista.innerHTML = cursos.length
      ? cursos.map(curso => {
        const selecionado = this.cursosSelecionados.includes(curso);
        return `
          <button class="curso-picker-option${selecionado ? ' selected' : ''}" type="button" role="option" aria-selected="${selecionado ? 'true' : 'false'}" data-curso="${escapeHtml(curso)}">
            <span class="curso-picker-check">${selecionado ? '✓' : ''}</span>
            <span>${escapeHtml(curso)}</span>
          </button>`;
      }).join('')
      : '<div class="curso-picker-empty">Nenhum curso encontrado</div>';

    lista.querySelectorAll('[data-curso]').forEach(btn => {
      btn.addEventListener('click', () => this.alternarCurso(btn.dataset.curso));
    });

    const total = this.cursosSelecionados.length;
    placeholder.textContent = total
      ? `${total} curso${total === 1 ? '' : 's'} selecionado${total === 1 ? '' : 's'}`
      : 'Selecione um ou mais cursos';
    contador.textContent = `${total} selecionado${total === 1 ? '' : 's'}`;

    chips.innerHTML = this.cursosSelecionados.map(curso => `
      <button class="curso-chip" type="button" data-curso-remove="${escapeHtml(curso)}">
        <span>${escapeHtml(curso)}</span>
        <span aria-hidden="true">×</span>
      </button>
    `).join('');
    chips.querySelectorAll('[data-curso-remove]').forEach(btn => {
      btn.addEventListener('click', () => this.removerCursoSelecionado(btn.dataset.cursoRemove));
    });
  },

  initExportacao() {
    document.getElementById('btn-exportar-vendas')?.addEventListener('click', () => this.exportarCsv());
  },

  async carregar() {
    this.setLoadingTabela(true);
    const res = await API.getVendas(this.mesFiltro || null, this.anoFiltro);

    if (!res.ok) { toast(res.error || 'Erro ao carregar vendas.', 'error'); this.setLoadingTabela(false); return; }

    this.dados = this.ordenarPorDataDesc(res.data || []);
    this._preencherFiltroCidades();
    this._preencherFiltroEstados();
    this.renderTabela();
  },

  // ── Cálculo de idade ────────────────────────────────────────
  _idadePorData(nasc) {
    const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade >= 0 && idade <= 120 ? idade : null;
  },

  _calcularIdade(valor) {
    if (valor === null || valor === undefined || valor === '') return null;

    if (typeof valor === 'number' && Number.isFinite(valor)) {
      return valor >= 0 && valor <= 120 ? Math.floor(valor) : null;
    }

    const texto = String(valor).trim();
    if (!texto) return null;

    const numero = Number(texto.replace(',', '.'));
    if (Number.isFinite(numero) && /^\d{1,3}([,.]\d+)?$/.test(texto)) {
      return numero >= 0 && numero <= 120 ? Math.floor(numero) : null;
    }

    const dataBr = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (dataBr) {
      const dia = Number(dataBr[1]);
      const mes = Number(dataBr[2]) - 1;
      let ano = Number(dataBr[3]);
      if (ano < 100) ano += ano > new Date().getFullYear() % 100 ? 1900 : 2000;
      const nasc = new Date(ano, mes, dia);
      if (nasc.getFullYear() === ano && nasc.getMonth() === mes && nasc.getDate() === dia) {
        return this._idadePorData(nasc);
      }
    }

    const nasc = new Date(texto);
    return Number.isNaN(nasc.getTime()) ? null : this._idadePorData(nasc);
  },

  _faixaEtaria(idade) {
    if (idade === null) return null;
    if (idade < 18)  return 'menor18';
    if (idade <= 24) return '18-24';
    if (idade <= 34) return '25-34';
    if (idade <= 44) return '35-44';
    if (idade <= 54) return '45-54';
    return '55+';
  },

  timestampVenda(venda) {
    const d = venda?.data ? new Date(venda.data).getTime() : 0;
    return Number.isFinite(d) ? d : 0;
  },

  ordenarPorDataDesc(lista) {
    return [...lista].sort((a, b) => {
      const diff = this.timestampVenda(b) - this.timestampVenda(a);
      if (diff !== 0) return diff;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  },

  obterListaFiltrada(busca = document.getElementById('busca')?.value || '') {
    let lista = this.ordenarPorDataDesc(this.dados);

    // Filtro PAC
    if (Auth.eAdmin() && this.filtroPac)
      lista = lista.filter(v => String(v.pac || '') === String(this.filtroPac));

    // Filtro texto (nome, curso, email, pac)
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(v =>
        (v.nome  || '').toLowerCase().includes(q) ||
        (v.curso || '').toLowerCase().includes(q) ||
        (v.email || '').toLowerCase().includes(q) ||
        (v.pac   || '').toLowerCase().includes(q)
      );
    }

    // Filtro cidade
    if (this.filtroCidade) {
      lista = lista.filter(v => this._normalizarFiltroTexto(v.cidade) === this.filtroCidade);
    }

    // Filtro estado
    if (this.filtroEstado)
      lista = lista.filter(v => this._normalizarFiltroTexto(v.estado) === this.filtroEstado);

    // Filtro faixa etária
    if (this.filtroIdade) {
      lista = lista.filter(v => {
        const idade = this._calcularIdade(v.nascimento || v.idade);
        return this._faixaEtaria(idade) === this.filtroIdade;
      });
    }

    return lista;
  },

  renderTabela(busca = document.getElementById('busca')?.value || '') {
    const tbody = document.getElementById('tabela-vendas');
    if (!tbody) return;

    const lista = this.obterListaFiltrada(busca);

    // Indicador de filtros ativos
    this._atualizarBadgeFiltros();

    if (!lista.length) {
      this.atualizarContador(lista);
      tbody.innerHTML = `
        <tr><td colspan="8">
          <div class="empty-state">
            <div class="icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4">
                <path d="M4 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
                <path d="M8 8h8M8 12h8M8 16h5"/>
              </svg>
            </div>
            <p>Nenhuma venda encontrada</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.style.opacity = '0';
    tbody.innerHTML = lista.map(v => `
      <tr>
        <td data-label="Data">${formatData(v.data)}</td>
        ${Auth.eAdmin() ? `<td class="col-pac" data-label="PAC"><span class="badge badge-blue">${escapeHtml(v.pac || '—')}</span></td>` : ''}
        <td data-label="Cliente">${escapeHtml(v.nome || '—')}</td>
        <td class="col-curso" data-label="Curso">${escapeHtml(v.curso || '—')}</td>
        <td class="col-origem" data-label="Origem">${escapeHtml(v.origem || '—')}</td>
        <td class="col-lead" data-label="Lead Novo">
          <span class="badge ${v.leadNovo === 'Sim' || v.leadNovo === 'SIM' ? 'badge-green' : 'badge-navy'}">${v.leadNovo || '—'}</span>
        </td>
        <td class="col-valor" data-label="Valor" style="text-align:right;font-weight:700;color:var(--text);white-space:nowrap">${formatBRL(this._numeroVenda(v.valor))}</td>
        <td data-label="Ação" style="white-space:nowrap">${Auth.podeEditar() ? `
          <button class="btn btn-ghost btn-sm btn-icon" onclick="Vendas.editar('${v.id}')" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="Vendas.excluir('${v.id}')" title="Excluir" style="color:#e74c3c">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>` : ''}</td>
      </tr>
    `).join('');

    requestAnimationFrame(() => { tbody.style.transition = 'opacity .25s'; tbody.style.opacity = '1'; });
    this.atualizarContador(lista);
  },

  _atualizarBadgeFiltros() {
    const busca = document.getElementById('busca')?.value?.trim() || '';
    const ativos = [
      busca,
      Auth.eAdmin() ? this.filtroPac : '',
      this.filtroCidade,
      this.filtroEstado,
      this.filtroIdade
    ].filter(Boolean).length;
    const badge = document.getElementById('badge-filtros-ativos');
    const btnLimpar = document.getElementById('btn-limpar-filtros');
    if (badge) {
      badge.textContent = ativos === 1 ? '1 filtro' : `${ativos} filtros`;
      badge.style.display = ativos > 0 ? 'inline-flex' : 'none';
    }
    if (btnLimpar) btnLimpar.style.visibility = ativos > 0 ? 'visible' : 'hidden';
  },

  atualizarContador(lista = this.dados) {
    const total = lista.reduce((s, v) => s + this._numeroVenda(v.valor), 0);
    const el = document.getElementById('info-total');
    if (el) el.textContent = `${lista.length} vendas · ${formatBRL(total)}`;
  },

  _numeroVenda(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

    const texto = String(valor)
      .replace(/R\$/g, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
  },

  _csvCampo(valor) {
    return `"${String(valor ?? '').replace(/"/g, '""')}"`;
  },

  _slugExportacao(valor) {
    return String(valor || 'todos')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'todos';
  },

  _nomeArquivoExportacao() {
    const mes = this.mesFiltro ? String(this.mesFiltro).padStart(2, '0') : 'todos-meses';
    const ano = this.anoFiltro || 'todos-anos';
    const pac = Auth.eAdmin()
      ? (this.filtroPac || 'todos-pacs')
      : (Auth.getPac() || 'pac');

    return `safe-vendas-${ano}-${mes}-${this._slugExportacao(pac)}.csv`;
  },

  exportarCsv() {
    const lista = this.obterListaFiltrada();

    if (!lista.length) {
      toast('Nenhuma venda para exportar.', 'warning');
      return;
    }

    const colunas = [
      ['Data', v => formatData(v.data)],
      ['PAC', v => v.pac || ''],
      ['Cliente', v => v.nome || ''],
      ['Sexo', v => v.sexo || ''],
      ['Idade/Nascimento', v => v.nascimento || v.idade || ''],
      ['Cidade', v => v.cidade || ''],
      ['Estado', v => v.estado || ''],
      ['Origem', v => v.origem || ''],
      ['Curso', v => v.curso || ''],
      ['Email', v => v.email || ''],
      ['Valor', v => this._numeroVenda(v.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
      ['Lead Novo', v => v.leadNovo || ''],
      ['Quem Comprou', v => v.quemComprou || '']
    ];

    const linhas = [
      colunas.map(([titulo]) => this._csvCampo(titulo)).join(';'),
      ...lista.map(venda => colunas.map(([, valor]) => this._csvCampo(valor(venda))).join(';'))
    ];

    const blob = new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = this._nomeArquivoExportacao();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast(`${lista.length} venda${lista.length === 1 ? '' : 's'} exportada${lista.length === 1 ? '' : 's'}.`, 'success');
  },

  abrirForm(venda = null) {
    if (!Auth.podeEditar()) { toast('Este acesso é somente leitura.', 'warning'); return; }

    this.editandoId = venda ? venda.id : null;
    document.getElementById('modal-titulo').textContent = venda ? 'Editar Venda' : 'Nova Venda';

    this.limparMarcasInvalidas();

    if (venda) {
      document.getElementById('f-data').value         = venda.data        || '';
      document.getElementById('f-pac').value          = venda.pac         || '';
      document.getElementById('f-nome').value         = venda.nome        || '';
      document.getElementById('f-sexo').value         = venda.sexo        || '';
      document.getElementById('f-nascimento').value   = venda.nascimento  || venda.idade || '';
      // A UF gravada pode vir em caixa baixa ou com espaco; sem normalizar, o
      // select cai em vazio e a venda parece nao ter estado.
      const uf = String(venda.estado || '').trim().toUpperCase();
      document.getElementById('f-estado').value       = municipiosDoEstado(uf).length ? uf : '';
      this.preencherCidades(uf, venda.cidade);
      document.getElementById('f-origem').value       = venda.origem      || '';
      this.setCursosSelecionados(this.cursosPorTexto(venda.curso));
      document.getElementById('f-email').value        = venda.email       || '';
      setInputBRL('f-valor', venda.valor);
      document.getElementById('f-lead-novo').value    = venda.leadNovo    || 'Não';
      document.getElementById('f-quem-comprou').value = venda.quemComprou || '';
    } else {
      ['f-nome','f-nascimento','f-email','f-valor'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      document.getElementById('f-data').value         = new Date().toISOString().split('T')[0];
      // Admin escolhe o consultor a cada venda; quem nao e admin so pode ser
      // ele mesmo, entao o proprio PAC da sessao ja vem preenchido.
      document.getElementById('f-pac').value          = Auth.eAdmin() ? '' : Auth.getPac();
      document.getElementById('f-sexo').value         = '';
      document.getElementById('f-estado').value       = '';
      this.preencherCidades('');
      document.getElementById('f-origem').value       = '';
      this.setCursosSelecionados([]);
      document.getElementById('f-lead-novo').value    = '';
      document.getElementById('f-quem-comprou').value = '';
    }

    const campoPac = document.getElementById('f-pac');
    if (campoPac) { campoPac.disabled = !Auth.eAdmin(); if (!Auth.eAdmin()) campoPac.value = Auth.getPac(); }
    this.cursoBusca = '';
    const buscaCurso = document.getElementById('curso-picker-search');
    if (buscaCurso) buscaCurso.value = '';
    this.fecharCursoPicker();
    this.renderCursoPicker();

    abrirModal('modal-venda');
    setTimeout(() => document.getElementById('f-nome')?.focus(), 150);
  },

  async editar(id) {
    const venda = this.dados.find(v => v.id === id);
    if (venda) this.abrirForm(venda);
  },

  async excluir(id) {
    if (!Auth.podeEditar()) { toast('Este acesso é somente leitura.', 'warning'); return; }
    const idx = this.dados.findIndex(v => String(v.id) === String(id));
    if (idx === -1) return;
    const nome = this.dados[idx].nome || '';
    if (!confirm(`Excluir a venda de "${nome}"?\nEsta ação não pode ser desfeita.`)) return;

    // Otimista: remove da lista na hora e restaura se o backend falhar.
    const [removida] = this.dados.splice(idx, 1);
    this.renderTabela();

    const res = await API.excluirVenda(id);
    if (!res.ok) {
      this.dados.splice(idx, 0, removida);
      this.renderTabela();
      toast(res.error || 'Erro ao excluir venda. A exclusão foi desfeita.', 'error');
      return;
    }
    toast('Venda excluída.', 'success');
  },

  async salvar() {
    if (!Auth.podeEditar()) { toast('Este acesso é somente leitura.', 'warning'); return; }

    const btn = document.getElementById('btn-salvar');

    const dados = {
      id:          this.editandoId,
      data:        document.getElementById('f-data').value,
      pac:         Auth.eAdmin() ? document.getElementById('f-pac').value : Auth.getPac(),
      nome:        document.getElementById('f-nome').value,
      sexo:        document.getElementById('f-sexo').value,
      nascimento:  document.getElementById('f-nascimento').value,
      cidade:      document.getElementById('f-cidade').value,
      estado:      document.getElementById('f-estado').value,
      origem:      document.getElementById('f-origem').value,
      curso:       document.getElementById('f-curso').value,
      email:       document.getElementById('f-email').value,
      valor:       getInputBRL('f-valor'),
      leadNovo:    document.getElementById('f-lead-novo').value,
      quemComprou: document.getElementById('f-quem-comprou').value
    };

    const editando = this.editandoId;

    const faltando = this.validarVenda(dados, !editando);
    if (faltando.length) { this.mostrarCamposFaltando(faltando); return; }
    this.limparMarcasInvalidas();

    if (editando) {
      // Edição otimista: aplica na tela e fecha o modal na hora; reverte se falhar.
      const alvo = this.dados.find(v => String(v.id) === String(editando));
      const snapshot = alvo ? { ...alvo } : null;
      if (alvo) { Object.assign(alvo, dados); this.renderTabela(); }
      fecharModal('modal-venda');
      toast('Venda atualizada!', 'success');

      const res = await API.editarVenda(dados);
      if (!res.ok) {
        if (alvo && snapshot) { Object.assign(alvo, snapshot); this.renderTabela(); }
        toast(res.error || 'Erro ao salvar. A alteração foi desfeita.', 'error');
      }
      return;
    }

    // Criar: o servidor gera o ID → fecha o modal e recarrega em segundo plano.
    btnLoading(btn, true);
    const res = await API.criarVenda(dados);
    btnLoading(btn, false);

    if (res.ok) {
      toast('Venda registrada!', 'success');
      fecharModal('modal-venda');
      this.carregar();
    } else {
      toast(res.error || 'Erro ao salvar.', 'error');
    }
  },

  setLoadingTabela(on) {
    const tbody = document.getElementById('tabela-vendas');
    if (!tbody || !on) return;
    const cols = Auth.eAdmin() ? 8 : 7;
    const shimmer = `<td><div style="height:13px;border-radius:4px;background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3) 50%,var(--surface-2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite"></div></td>`;
    tbody.innerHTML = Array.from({ length: 7 }, (_, i) =>
      `<tr class="sk-row" style="opacity:${1 - i * 0.1}">${Array.from({ length: cols }, () => shimmer).join('')}</tr>`
    ).join('');
    if (!document.getElementById('shimmer-kf')) {
      const s = document.createElement('style'); s.id = 'shimmer-kf';
      s.textContent = '@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
      document.head.appendChild(s);
    }
  },

  initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamb    = document.getElementById('hamburger');
    hamb?.addEventListener('click', () => { sidebar.classList.toggle('mobile-open'); overlay.classList.toggle('active'); });
    overlay?.addEventListener('click', () => { sidebar.classList.remove('mobile-open'); overlay.classList.remove('active'); });
  }
};

// ── Helpers BRL para input de valor ──────────────────────────
function aplicarMascaraBRL(input) {
  input.addEventListener('input', () => {
    let raw = input.value.replace(/\D/g, '');
    if (!raw) { input.value = ''; return; }
    const num = Number(raw) / 100;
    input.value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}
function setInputBRL(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!valor && valor !== 0) { el.value = ''; return; }
  const num = typeof valor === 'string'
    ? Number(String(valor).replace(/\./g,'').replace(',','.')) || 0
    : Number(valor) || 0;
  el.value = num > 0
    ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
}
function getInputBRL(id) {
  const el = document.getElementById(id);
  if (!el || !el.value) return 0;
  return Number(el.value.replace(/\./g, '').replace(',', '.')) || 0;
}

document.addEventListener('DOMContentLoaded', () => {
  const elValor = document.getElementById('f-valor');
  if (elValor) aplicarMascaraBRL(elValor);
  Vendas.init();
});
