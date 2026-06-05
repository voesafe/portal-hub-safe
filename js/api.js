// ============================================================
// api.js — Comunicação com Apps Script + cache
// SAFE Dashboard Comercial
// ============================================================

const Cache = {
  _store: {},

  key(action, params) { return action + '|' + JSON.stringify(params || {}); },

  get(action, params) {
    const k = this.key(action, params);
    const entry = this._store[k];
    if (!entry) return null;
    if (Date.now() - entry.ts > 3 * 60 * 1000) { delete this._store[k]; return null; }
    return entry.data;
  },

  set(action, params, data) {
    this._store[this.key(action, params)] = { data, ts: Date.now() };
  },

  invalidar(prefixo) {
    Object.keys(this._store).forEach(k => {
      if (k.startsWith(prefixo)) delete this._store[k];
    });
  },

  invalidarVendas()       { this.invalidar('vendas|'); this.invalidar('kpis|'); },
  invalidarConcorrencia() { this.invalidar('listar-concorrencia|'); this.invalidar('listar-precos-safe|'); }
};

const API = {

  async get(action, params = {}, useCache = true) {
    try {
      const sessao = Auth.getSessao();
      const cacheParams = { ...params, __pac: sessao?.pac || '', __perfil: sessao?.perfil || '' };

      if (useCache) {
        const cached = Cache.get(action, cacheParams);
        if (cached) return cached;
      }

      const base = { action };
      if (sessao) {
        base.pac = sessao.pac;
        base.perfil = sessao.perfil;
        if (sessao.token) base.token = sessao.token;
      }

      const query = new URLSearchParams({ ...base, ...params }).toString();
      const res   = await fetch(`${CONFIG.API_URL}?${query}`);
      const data  = await res.json();

      if (data.ok && useCache) Cache.set(action, cacheParams, data);
      return data;
    } catch (err) {
      console.error('[API GET]', err);
      return { ok: false, error: 'Erro de conexão com o servidor.' };
    }
  },

  async post(action, dados = {}) {
    try {
      const sessao = Auth.getSessao();
      const body   = { action, dados };
      if (sessao) {
        body.pac = sessao.pac;
        body.perfil = sessao.perfil;
        if (sessao.token) body.token = sessao.token;
      }

      const res  = await fetch(CONFIG.API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(body)
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[API POST]', err);
      return { ok: false, error: 'Erro de conexão com o servidor.' };
    }
  },

  // ── Vendas ─────────────────────────────────────────────────
  async getKPIs(mes, ano)    { return this.get('kpis',   { ...(mes && {mes}), ...(ano && {ano}) }); },
  async getVendas(mes, ano)  { return this.get('vendas', { ...(mes && {mes}), ...(ano && {ano}) }); },
  async getVenda(id)         { return this.get('venda',  { id }, false); },

  async criarVenda(dados)  { const r = await this.post('criar-venda',  dados); if (r.ok) Cache.invalidarVendas(); return r; },
  async editarVenda(dados) { const r = await this.post('editar-venda', dados); if (r.ok) Cache.invalidarVendas(); return r; },
  async excluirVenda(id)   { const r = await this.post('excluir-venda', { id }); if (r.ok) Cache.invalidarVendas(); return r; },

  // ── Faturamento ────────────────────────────────────────────
  async getFaturamento(mes, ano)     { return this.get('faturamento',        { ...(mes && {mes}), ...(ano && {ano}) }); },
  async getResumoFaturamento(ano)    { return this.get('faturamento-resumo', { ano }); },
  async salvarFaturamento(mes, ano, canal, valor) {
    const r = await this.post('salvar-faturamento', { mes, ano, canal, valor });
    if (r.ok) { Cache.invalidar('faturamento'); Cache.invalidarVendas(); }
    return r;
  },
  async excluirFaturamento(id) {
    const r = await this.post('excluir-faturamento', { id });
    if (r.ok) { Cache.invalidar('faturamento'); Cache.invalidarVendas(); }
    return r;
  },

  // ── Usuários ───────────────────────────────────────────────
  async getUsuarios()      { return this.get('usuarios', {}, false); },
  async getUsuariosLogin() { return this.get('login-usuarios', {}, true); },
  async criarUsuario(dados)  { return this.post('criar-usuario',  dados); },
  async editarUsuario(dados) { return this.post('editar-usuario', dados); },

  // ── Concorrência ───────────────────────────────────────────
  async getConcorrencia()  { return this.get('listar-concorrencia', {}, true); },
  async getPrecosSafe()    { return this.get('listar-precos-safe',  {}, true); },

  async criarConcorrente(dados) {
    const r = await this.post('criar-concorrente', dados);
    if (r.ok) Cache.invalidarConcorrencia();
    return r;
  },
  async editarConcorrente(dados) {
    const r = await this.post('editar-concorrente', dados);
    if (r.ok) Cache.invalidarConcorrencia();
    return r;
  },
  async excluirConcorrente(id) {
    const r = await this.post('excluir-concorrente', { id });
    if (r.ok) Cache.invalidarConcorrencia();
    return r;
  },
  async salvarPrecoSafe(dados) {
    const r = await this.post('salvar-preco-safe', dados);
    if (r.ok) Cache.invalidarConcorrencia();
    return r;
  },

  // ── Controle de Gastos ─────────────────────────────────────
  async getControleGastos(ano, mes, useCache = true) {
    const sessao = Auth.getSessao();
    const params = {
      ano,
      mes,
      __pac: sessao?.pac || '',
      __perfil: sessao?.perfil || ''
    };
    if (useCache) {
      const cached = Cache.get('controle-gastos', params);
      if (cached) return cached;
    }
    const r = await this.post('controle-gastos', { ano, mes });
    if (r.ok && useCache) Cache.set('controle-gastos', params, r);
    return r;
  },
  async salvarFechamentoGastos(dados) {
    const r = await this.post('salvar-fechamento-gastos', dados);
    if (r.ok) Cache.invalidar('controle-gastos|');
    return r;
  },
  async criarCategoriaGasto(nome) {
    const r = await this.post('criar-categoria-gasto', { nome });
    if (r.ok) Cache.invalidar('controle-gastos|');
    return r;
  },
  async editarCategoriaGasto(id, nome) {
    const r = await this.post('editar-categoria-gasto', { id, nome });
    if (r.ok) Cache.invalidar('controle-gastos|');
    return r;
  },
  async alterarStatusCategoriaGasto(id, ativa) {
    const r = await this.post('alterar-status-categoria-gasto', { id, ativa });
    if (r.ok) Cache.invalidar('controle-gastos|');
    return r;
  }
};

// ── Helpers de UI ─────────────────────────────────────────────

function toast(msg, tipo = 'info', duracao = 3500) {
  const svgs = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `${svgs[tipo] || svgs.info}<span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all .3s';
    setTimeout(() => el.remove(), 300);
  }, duracao);
}

function formatBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function formatData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function nomeMes(num) { return CONFIG.MESES[Number(num)] || '—'; }

function abrirModal(id)  { document.getElementById(id)?.classList.add('open'); }
function fecharModal(id) { document.getElementById(id)?.classList.remove('open'); }

function btnLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.original || 'OK';
  }
}

// Skeleton loader para tabelas
function skeletonTabela(tbody, colunas = 5, linhas = 5) {
  const shimmer = `<td><div style="height:14px;background:linear-gradient(90deg,var(--gray-100) 25%,var(--gray-200) 50%,var(--gray-100) 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:4px"></div></td>`;
  tbody.innerHTML = Array.from({ length: linhas }, () =>
    `<tr>${Array.from({ length: colunas }, () => shimmer).join('')}</tr>`
  ).join('');
  // Injeta keyframe uma vez
  if (!document.getElementById('shimmer-style')) {
    const s = document.createElement('style');
    s.id = 'shimmer-style';
    s.textContent = '@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    document.head.appendChild(s);
  }
}
