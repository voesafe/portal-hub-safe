// ============================================================
// vendas.js — Listagem, cadastro e edição de vendas
// SAFE Hub
// ============================================================

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

  async init() {
    Auth.proteger();
    Auth.preencherUI();
    this.setLoadingTabela(true);
    await this.carregarPacs();
    this.initFiltros();
    this.initForm();
    this.initExportacao();
    this.initSidebar();
    await this.carregar();
  },

  async carregarPacs() {
    const campoPac = document.getElementById('f-pac');
    if (!campoPac) return;

    const fallback = Array.from(campoPac.options).map(o => ({
      nome: o.textContent.trim(), pac: o.value, perfil: 'pac'
    }));

    try {
      const res = await API.getUsuariosLogin();
      this.pacs = res.ok && Array.isArray(res.data) && res.data.length
        ? res.data.filter(u => u.pac && !Auth.perfilSomenteLeitura(u.perfil) && !Auth.perfilEhMaster(u.perfil))
        : fallback;
    } catch { this.pacs = fallback; }

    this.preencherSelectPacs();
    this.preencherFiltroPacs();
  },

  preencherSelectPacs() {
    const campoPac = document.getElementById('f-pac');
    if (!campoPac || !this.pacs.length) return;
    const valorAtual = campoPac.value;
    campoPac.innerHTML = '';
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
    document.getElementById('btn-nova-venda')?.addEventListener('click',   () => this.abrirForm());
    document.getElementById('modal-close')?.addEventListener('click',      () => fecharModal('modal-venda'));
    document.getElementById('modal-cancelar')?.addEventListener('click',   () => fecharModal('modal-venda'));
    document.getElementById('btn-salvar')?.addEventListener('click',       () => this.salvar());
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
        ${Auth.eAdmin() ? `<td class="col-pac" data-label="PAC"><span class="badge badge-blue">${v.pac || '—'}</span></td>` : ''}
        <td data-label="Cliente">${v.nome || '—'}</td>
        <td class="col-curso" data-label="Curso">${v.curso || '—'}</td>
        <td class="col-origem" data-label="Origem">${v.origem || '—'}</td>
        <td class="col-lead" data-label="Lead Novo">
          <span class="badge ${v.leadNovo === 'Sim' || v.leadNovo === 'SIM' ? 'badge-green' : 'badge-navy'}">${v.leadNovo || '—'}</span>
        </td>
        <td class="col-valor" data-label="Valor" style="text-align:right;font-weight:700;color:var(--navy);white-space:nowrap">${formatBRL(this._numeroVenda(v.valor))}</td>
        <td data-label="Ação" style="white-space:nowrap">${Auth.podeEditar() ? `
          <button class="btn btn-ghost btn-sm btn-icon" onclick="Vendas.editar('${v.id}')" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="Vendas.excluir('${v.id}','${(v.nome||'').replace(/'/g,"\\'")}') " title="Excluir" style="color:#e74c3c">
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

    if (venda) {
      document.getElementById('f-data').value         = venda.data        || '';
      document.getElementById('f-pac').value          = venda.pac         || '';
      document.getElementById('f-nome').value         = venda.nome        || '';
      document.getElementById('f-sexo').value         = venda.sexo        || '';
      document.getElementById('f-nascimento').value   = venda.nascimento  || venda.idade || '';
      document.getElementById('f-cidade').value       = venda.cidade      || '';
      document.getElementById('f-estado').value       = venda.estado      || '';
      document.getElementById('f-origem').value       = venda.origem      || '';
      document.getElementById('f-curso').value        = venda.curso       || '';
      document.getElementById('f-email').value        = venda.email       || '';
      setInputBRL('f-valor', venda.valor);
      document.getElementById('f-lead-novo').value    = venda.leadNovo    || 'Não';
      document.getElementById('f-quem-comprou').value = venda.quemComprou || '';
    } else {
      ['f-nome','f-nascimento','f-cidade','f-email','f-valor'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      document.getElementById('f-data').value         = new Date().toISOString().split('T')[0];
      document.getElementById('f-pac').value          = Auth.eAdmin() ? (this.pacs[0]?.pac || '') : Auth.getPac();
      document.getElementById('f-sexo').value         = '';
      document.getElementById('f-estado').value       = '';
      document.getElementById('f-origem').value       = '';
      document.getElementById('f-curso').value        = '';
      document.getElementById('f-lead-novo').value    = 'Não';
      document.getElementById('f-quem-comprou').value = '';
    }

    const campoPac = document.getElementById('f-pac');
    if (campoPac) { campoPac.disabled = !Auth.eAdmin(); if (!Auth.eAdmin()) campoPac.value = Auth.getPac(); }

    abrirModal('modal-venda');
    setTimeout(() => document.getElementById('f-nome')?.focus(), 150);
  },

  async editar(id) {
    const venda = this.dados.find(v => v.id === id);
    if (venda) this.abrirForm(venda);
  },

  async excluir(id, nome) {
    if (!Auth.podeEditar()) { toast('Este acesso é somente leitura.', 'warning'); return; }
    if (!confirm(`Excluir a venda de "${nome}"?\nEsta ação não pode ser desfeita.`)) return;

    const res = await API.excluirVenda(id);
    if (!res.ok) { toast(res.error || 'Erro ao excluir venda.', 'error'); return; }
    toast('Venda excluída.', 'success');
    await this.carregar();
  },

  async salvar() {
    if (!Auth.podeEditar()) { toast('Este acesso é somente leitura.', 'warning'); return; }

    const btn = document.getElementById('btn-salvar');
    btnLoading(btn, true);

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

    if (!dados.data || !dados.nome || !dados.valor || !dados.curso) {
      toast('Data, nome, curso e valor são obrigatórios.', 'warning');
      btnLoading(btn, false); return;
    }

    const res = this.editandoId ? await API.editarVenda(dados) : await API.criarVenda(dados);
    btnLoading(btn, false);

    if (res.ok) {
      toast(this.editandoId ? 'Venda atualizada!' : 'Venda registrada!', 'success');
      fecharModal('modal-venda');
      await this.carregar();
    } else {
      toast(res.error || 'Erro ao salvar.', 'error');
    }
  },

  setLoadingTabela(on) {
    const tbody = document.getElementById('tabela-vendas');
    if (!tbody || !on) return;
    const cols = Auth.eAdmin() ? 8 : 7;
    const shimmer = `<td><div style="height:13px;border-radius:4px;background:linear-gradient(90deg,var(--gray-100) 25%,var(--gray-200) 50%,var(--gray-100) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite"></div></td>`;
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
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('main');
    const overlay = document.getElementById('sidebar-overlay');
    const hamb    = document.getElementById('hamburger');
    toggle?.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed'); main.classList.toggle('sidebar-collapsed');
      toggle.innerHTML = sidebar.classList.contains('collapsed') ? '›' : '‹';
    });
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
