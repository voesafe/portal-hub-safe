// ============================================================
// notams.js — Página de NOTAMs (bases SAFE: SBSJ e SDAM)
// SAFE Hub · lê o cache do backend (action=notams) e renderiza.
// Página global (todos os logados). Só leitura — sem escrita.
// ============================================================

const Notams = {
  dados: { atualizadoEm: '', aeroportos: [], resumo: {}, notams: [] },
  // Consulta avulsa de outra localidade. Vive FORA de `dados` de propósito:
  // os tiles, os filtros e a aba "Todos" continuam significando as bases SAFE,
  // e o resultado de terceiro não distorce nenhum número da tela.
  consulta: null,       // { icao, nome, notams: [] } | null
  filtro: 'todos',      // todos | hoje | impacto | futuro
  aeroporto: 'todos',   // todos | SBSJ | SDAM | <icao consultado>
  view: 'decoded',      // decoded | raw

  async init() {
    if (!Auth.proteger(true)) return;
    Auth.preencherUI();
    this.initControles();
    this.initSidebar();
    this.garantirCampoSemFoco();
    this.aplicarPermissaoSincronizar();
    await this.carregar();
  },

  /**
   * O botão "Atualizar" some para quem não pode sincronizar. A página é global
   * e cada clique é uma ida ao DECEA mais uma regravação da planilha: com toda
   * a escola olhando a tela, o botão vira convite a clicar à toa.
   *
   * `podeEditar` faz bypass de superadmin e master, então eles continuam vendo
   * sem precisar de nada. Quem mais precisar recebe `notams.sincronizar` pelo
   * Controle de Acesso, no nível Editar do módulo NOTAMs.
   *
   * Isto é só a camada visual: quem manda de verdade é o guarda
   * `exigirSincronizacaoNotams` no backend, porque esconder botão não impede
   * ninguém de chamar a rota na mão.
   */
  aplicarPermissaoSincronizar() {
    if (Auth.podeEditar('notams.html')) return;
    document.getElementById('notam-refresh')?.remove();
  },

  /**
   * A página é de LEITURA: abrir com o teclado do celular na tela é errado.
   *
   * ⚠️ Isto sozinho NÃO resolveu no iPhone. Nada no código dá foco no campo (o
   * activeElement ao carregar é o BODY e não há uma única chamada a .focus()),
   * mas na prática o Safari focava mesmo assim, depois desta linha rodar. Quem
   * resolve é o CSS: com a lupa, o campo fica em `display: none` no celular, e
   * elemento nesse estado não pode receber foco de forma alguma.
   * Fica como rede para o desktop e para restauração de página pelo histórico.
   */
  garantirCampoSemFoco() {
    const campo = document.getElementById('notam-busca-input');
    if (campo && document.activeElement === campo) campo.blur();
  },

  // ── Carregamento ─────────────────────────────────────────
  async carregar(force = false) {
    this.setLoading(true);
    const res = await API.get('notams', {}, !force);
    this.setLoading(false);

    if (!res || !res.ok) {
      toast((res && res.error) || 'Erro ao carregar NOTAMs.', 'error');
      return;
    }
    this.dados = res.data || this.dados;
    this.render();
  },

  /**
   * Botão "Atualizar": vai ao DECEA de verdade e regrava o cache.
   * Antes ele só relia a planilha, então nunca trazia NOTAM mais novo que a
   * última sincronização automática — parecia atualizar sem atualizar.
   */
  async atualizarDoDecea() {
    const btn = document.getElementById('notam-refresh');
    if (btn) btn.disabled = true;
    this.setLoading(true);
    const res = await API.atualizarNotams();
    this.setLoading(false);
    if (btn) btn.disabled = false;

    if (!res || !res.ok) {
      toast((res && res.error) || 'Não foi possível falar com o DECEA.', 'error');
      return;
    }
    this.dados = res.data || this.dados;
    this.render();

    // O backend devolve o cache anterior quando a AISWEB falha, para a tela não
    // ficar vazia. Nesse caso é obrigatório dizer que o dado é velho.
    if (this.dados.sincronizado === false) {
      toast('DECEA indisponível. Mostrando a última sincronização: ' +
            (this.dados.erroSincronizacao || ''), 'error');
    } else {
      toast('NOTAMs sincronizados com o DECEA.', 'success');
    }
  },

  /** Consulta avulsa de outra localidade (não mexe nas bases nem no cache). */
  async consultarLocalidade(icaoBruto) {
    const icao = String(icaoBruto || '').trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(icao)) {
      toast('Informe o código ICAO com 4 letras, como SBGR.', 'error');
      return;
    }
    if (icao === 'SBSJ' || icao === 'SDAM') {
      this.selecionarAba(icao);
      toast(icao + ' já é base SAFE, está nas abas fixas.', 'info');
      return;
    }

    const btn = document.getElementById('notam-busca-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Consultando…'; }
    this.setLoading(true);
    const res = await API.consultarNotams(icao);
    this.setLoading(false);
    if (btn) { btn.disabled = false; btn.textContent = 'Consultar'; }

    if (!res || !res.ok) {
      toast((res && res.error) || 'Não foi possível consultar ' + icao + '.', 'error');
      return;
    }

    this.consulta = res.data || null;
    this.render();
    this.selecionarAba(icao);

    if (!this.consulta || !(this.consulta.notams || []).length) {
      // A API devolve total=0 tanto para código inexistente quanto para
      // aeródromo sem NOTAM. Não dá para separar, então a frase não afirma.
      toast('Nenhum NOTAM ativo para ' + icao + '. O código pode também não existir.', 'info');
    }
  },

  fecharConsulta() {
    this.consulta = null;
    if (this.aeroporto !== 'todos' && this.aeroporto !== 'SBSJ' && this.aeroporto !== 'SDAM') {
      this.aeroporto = 'todos';
    }
    this.render();
    this.selecionarAba(this.aeroporto);
  },

  // ── Render principal ─────────────────────────────────────
  render() {
    this.renderUpdated();
    this.renderNota();
    this.renderTiles();
    this.renderAbaConsulta();
    this.renderAeroportos();
    this.renderContagens();
    this.renderFoot();
    this.aplicarFiltro();
    this.aplicarView();
  },

  /** Cria, atualiza ou remove a aba da consulta avulsa. */
  renderAbaConsulta() {
    const tabs = document.getElementById('notam-tabs');
    if (!tabs) return;
    tabs.querySelector('.notam-tab-avulsa')?.remove();
    if (!this.consulta) return;

    const icao = this.consulta.icao;
    const n = (this.consulta.notams || []).length;
    // Invólucro com dois botões IRMÃOS. Antes o X era um `<span role="button">`
    // dentro do botão da aba: controle aninhado em controle é HTML inválido e,
    // pior, deixava fechar a consulta fora do alcance do teclado.
    const aba = document.createElement('span');
    aba.className = 'notam-tab notam-tab-avulsa';
    aba.dataset.ap = icao;
    aba.innerHTML =
      `<button type="button" class="notam-tab-sel" role="tab">` +
        `${this._esc(icao)} <span class="tcnt">${n}</span></button>` +
      `<button type="button" class="notam-tab-x" data-fechar-consulta ` +
        `aria-label="Fechar consulta ${this._esc(icao)}">×</button>`;
    tabs.appendChild(aba);
  },

  renderUpdated() {
    const el = document.getElementById('notam-updated-text');
    if (!el) return;
    el.textContent = this.dados.atualizadoEm
      ? 'Atualizado ' + this._formatarTimestamp(this.dados.atualizadoEm)
      : 'sem sincronização ainda';
  },

  renderNota() {
    const nota = document.getElementById('notam-note');
    if (!nota) return;
    const vazio = !(this.dados.notams && this.dados.notams.length);
    if (vazio) {
      nota.hidden = false;
      nota.innerHTML = 'ℹ️ Nenhum NOTAM no cache ainda. Assim que a consulta ao AISWEB/DECEA for sincronizada, os NOTAMs das bases aparecem aqui.';
    } else {
      nota.hidden = true;
      nota.innerHTML = '';
    }
  },

  renderTiles() {
    const r = this.dados.resumo || {};
    const cont = document.getElementById('notam-tiles');
    if (!cont) return;
    const futuros = Number(r.futuros || 0);
    cont.innerHTML = [
      this._tile('live', 'Ativos hoje', r.ativosHoje, 'vigentes na data atual'),
      this._tile('crit', 'Impacto pista', r.impactoPista, 'RWY fechada / restrita'),
      this._tile('warn', 'Auxílios/luzes', r.auxiliosLuzes, 'PAPI · VOR · nav inoperantes'),
      this._tile('tot',  'Total monitorado', r.total, futuros + ' futuro' + (futuros === 1 ? '' : 's') + ' programado' + (futuros === 1 ? '' : 's'))
    ].join('');
  },

  _tile(cls, lab, val, cap) {
    return `<div class="notam-tile ${cls}">
      <div class="lab">${this._esc(lab)}</div>
      <div class="val">${Number(val || 0)}</div>
      <div class="cap">${this._esc(cap)}</div>
    </div>`;
  },

  renderAeroportos() {
    const wrap = document.getElementById('notam-airports');
    if (!wrap) return;
    wrap.innerHTML = this._estacoes().map(ap => {
      const lista = ap.avulsa
        ? (this.consulta.notams || [])
        : (this.dados.notams || []).filter(n => n.icao === ap.icao);
      const vazio = ap.avulsa
        ? 'Nenhum NOTAM ativo para este código. Ele também pode não existir: a API do DECEA responde igual nos dois casos.'
        : 'Sem NOTAMs para esta base.';
      const cards = lista.length
        ? lista.map(n => this._card(n)).join('')
        : `<div class="notam-empty">${vazio}</div>`;
      const aviso = ap.avulsa
        ? '<div class="notam-avulsa-nota">Consulta avulsa, feita agora no DECEA. Não entra no monitoramento das bases SAFE nem no cache.</div>'
        : '';
      // O vazio de filtro nasce junto e fica escondido: quem o revela é a classe
      // `sem-visivel`, posta pelo aplicarFiltro quando nenhum card sobra.
      const vazioFiltro = lista.length
        ? '<div class="notam-empty notam-empty-filtro">Nenhum NOTAM desta base no filtro escolhido.</div>'
        : '';
      return `<div class="notam-station${ap.avulsa ? ' avulsa' : ''}" data-station="${this._esc(ap.icao)}" data-avulsa="${!!ap.avulsa}">
        <div class="notam-station-head">
          <span class="notam-icao">${this._esc(ap.icao)}</span>
          <div class="ident">
            <div class="name">${this._esc(ap.nome || ap.icao)}${this._horario(ap)}</div>
            <div class="meta">${this._esc(ap.sub || '')}</div>
          </div>
          <span class="count" data-count="${this._esc(ap.icao)}">${lista.length} NOTAM${lista.length === 1 ? '' : 's'}</span>
        </div>
        ${aviso}
        <div class="notam-stack" id="notam-stack-${this._esc(ap.icao)}">${cards}${vazioFiltro}</div>
      </div>`;
    }).join('');
  },

  /**
   * Horário de funcionamento, ao lado do nome da base.
   *
   * ⚠️ Três estados, e a diferença entre eles é o ponto do recurso:
   *  - horário conhecido e nenhum NOTAM mexendo nele: mostra o horário;
   *  - NOTAM ativo alterando o horário: mostra em âmbar e manda ler o NOTAM,
   *    porque o horário publicado NÃO vale hoje e afirmá-lo seria pior do que
   *    não mostrar nada;
   *  - horário desconhecido: não desenha nada. Inventar "H24" por omissão
   *    mandaria alguém para um aeródromo fechado.
   *
   * A consulta avulsa fica de fora: o ROTAER só é buscado para as bases SAFE.
   */
  _horario(ap) {
    if (!ap || ap.avulsa) return '';
    const h = String(ap.horario || '').trim();
    if (ap.horarioAlterado) {
      const t = h
        ? `Horário publicado: ${h}. Existe NOTAM ativo alterando o funcionamento desta base, confira os NOTAMs abaixo.`
        : 'Existe NOTAM ativo alterando o funcionamento desta base, confira os NOTAMs abaixo.';
      return ` <span class="notam-hr is-alterado" title="${this._esc(t)}">⚠ ${this._esc(h || 'horário alterado')}</span>`;
    }
    if (!h) return '';
    // ⚠️ O número na tarja é HORA LOCAL, convertido; o ROTAER publica em UTC.
    // O texto original vai inteiro no title, tanto para conferir contra o
    // ROTAER quanto porque é lá que está a condição (o "O/R" e o telefone).
    const titulo = ap.horarioH24
      ? 'Aeródromo aberto 24 horas, conforme o ROTAER.'
      : (/\bLT\b/.test(h)
          ? 'LT = hora local (Brasília). Convertido do ROTAER, que publica em UTC.'
          : 'UTC = hora Zulu, como o ROTAER publica. Não foi possível converter para local.') +
        (ap.horarioTexto ? '\n\nROTAER: ' + ap.horarioTexto : '');
    return ` <span class="notam-hr" title="${this._esc(titulo)}">${this._esc(h)}</span>`;
  },

  /** Bases SAFE + (se houver) a localidade consultada, marcada como avulsa. */
  _estacoes() {
    const bases = (this.dados.aeroportos && this.dados.aeroportos.length)
      ? this.dados.aeroportos
      : this._aeroportosDosNotams();
    if (!this.consulta) return bases;
    const c = this.consulta;
    const primeiro = (c.notams || [])[0] || {};
    return bases.concat([{
      icao: c.icao,
      nome: c.nome && c.nome !== c.icao ? c.nome : (primeiro.aero || c.icao),
      sub: primeiro.cidade || 'consulta avulsa',
      avulsa: true
    }]);
  },

  _card(n) {
    const sev = ['critico', 'atencao', 'info'].indexOf(n.sev) >= 0 ? n.sev : 'info';
    const impacto = sev !== 'info';
    const upcoming = n.future ? ' upcoming' : '';
    let badges = '';
    if (n.active) badges += '<span class="notam-badge b-live">● Ativo hoje</span>';
    if (n.future) badges += '<span class="notam-badge b-future">◷ Futuro</span>';
    if (sev === 'critico') badges += '<span class="notam-badge b-crit">⚠ Pista</span>';
    else if (sev === 'atencao') badges += '<span class="notam-badge b-warn">Atenção</span>';

    return `<article class="notam sev-${sev}" data-active="${!!n.active}" data-future="${!!n.future}" data-impact="${impacto}">
      <div class="notam-head">
        <div class="ident">
          <div class="notam-id">${this._esc(n.id || '—')}</div>
          <div class="notam-cat">${this._esc(n.cat || 'Geral')}${n.qcode ? ' · ' + this._esc(n.qcode) : ''}</div>
        </div>
        <div class="notam-badges">${badges}</div>
      </div>
      <div class="notam-valid">
        <div class="v"><b>Início</b><span>${this._esc(n.from || '—')}</span></div>
        <div class="v${upcoming}"><b>Término</b><span>${this._esc(n.to || '—')}</span></div>
      </div>
      <div class="notam-body">
        <div class="notam-decoded">${this._esc(n.decoded || n.raw || '')}</div>
        <div class="notam-raw">${this._esc(n.raw || '')}</div>
      </div>
      <div class="notam-foot">
        <button class="notam-mini-toggle" data-toggle-raw>⟨/⟩ Ver NOTAM cru</button>
        <span class="notam-scope">${this._esc(n.scope || 'Aeródromo')}</span>
      </div>
    </article>`;
  },

  renderFoot() {
    const el = document.getElementById('notam-foot');
    if (!el) return;
    el.textContent = 'Consulta automatizada via API AISWEB/DECEA · o NOTAM cru é sempre preservado.';
  },

  // ── Contagens (filtros + abas) ───────────────────────────
  renderContagens() {
    const ns = this.dados.notams || [];
    const set = (sel, v) => { const e = document.querySelector(sel); if (e) e.textContent = v; };
    set('[data-cnt="todos"]',   ns.length);
    set('[data-cnt="hoje"]',    ns.filter(n => n.active).length);
    set('[data-cnt="impacto"]', ns.filter(n => n.sev === 'critico' || n.sev === 'atencao').length);
    set('[data-cnt="futuro"]',  ns.filter(n => n.future).length);

    document.querySelectorAll('[data-tcnt]').forEach(el => {
      const ic = el.getAttribute('data-tcnt');
      el.textContent = ns.filter(n => n.icao === ic).length;
    });
  },

  // ── Controles (eventos) ──────────────────────────────────
  initControles() {
    // filtros de status
    document.querySelectorAll('.notam-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.notam-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filtro = chip.dataset.filter;
        this.aplicarFiltro();
      });
    });
    // Abas de aeroporto: por DELEGAÇÃO, porque a aba da consulta avulsa é
    // criada depois deste bind e não existiria para receber o listener.
    document.getElementById('notam-tabs')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-fechar-consulta]')) {
        this.fecharConsulta();
        return;   // o X fecha a aba, não seleciona
      }
      const tab = e.target.closest('.notam-tab');
      if (!tab) return;
      this.selecionarAba(tab.dataset.ap);
    });
    // toggle global cru/decodificado
    document.querySelectorAll('.notam-seg').forEach(seg => {
      seg.addEventListener('click', () => {
        document.querySelectorAll('.notam-seg').forEach(s => s.classList.remove('active'));
        seg.classList.add('active');
        this.view = seg.dataset.view;
        this.aplicarView();
      });
    });
    // toggle individual (delegação — cards são recriados no render)
    const wrap = document.getElementById('notam-airports');
    wrap?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toggle-raw]');
      if (!btn) return;
      const card = btn.closest('.notam');
      const raw = card.classList.toggle('show-raw');
      btn.textContent = raw ? '✦ Ver decodificado' : '⟨/⟩ Ver NOTAM cru';
    });
    // Atualizar: consulta o DECEA de verdade e regrava o cache.
    document.getElementById('notam-refresh')?.addEventListener('click', () => this.atualizarDoDecea());

    // Lupa do celular: revela o campo e só então dá o foco. Aqui o teclado
    // DEVE abrir, porque foi a pessoa que pediu. É o oposto de abrir a página
    // já com ele na tela, que era o defeito.
    document.getElementById('notam-busca-lupa')?.addEventListener('click', () => {
      const form = document.getElementById('notam-busca');
      const campo = document.getElementById('notam-busca-input');
      form?.classList.add('aberta');
      document.getElementById('notam-busca-lupa')?.setAttribute('aria-expanded', 'true');
      campo?.focus();
    });

    // Busca de outra localidade.
    document.getElementById('notam-busca')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('notam-busca-input');
      this.consultarLocalidade(input?.value);
    });
    // Só letras, sempre em caixa alta: o campo aceita 4 caracteres e o usuário
    // não deveria descobrir o formato pela mensagem de erro.
    document.getElementById('notam-busca-input')?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    });
  },

  /** Troca a aba ativa e reaplica os filtros. */
  selecionarAba(ap) {
    this.aeroporto = ap || 'todos';
    document.querySelectorAll('.notam-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.ap === this.aeroporto);
    });
    this.aplicarFiltro();
  },

  aplicarFiltro() {
    const solo = this.aeroporto !== 'todos';
    const wrap = document.getElementById('notam-airports');
    if (wrap) wrap.classList.toggle('solo', solo);

    document.querySelectorAll('.notam-station').forEach(st => {
      const isThis = st.getAttribute('data-station') === this.aeroporto;
      const avulsa = st.getAttribute('data-avulsa') === 'true';
      // Em "Todos os aeroportos" a estação avulsa fica fora: essa aba significa
      // "as bases SAFE", e é o que os tiles e os filtros contam. Misturar
      // localidade de terceiro ali faria o número da tela mentir.
      st.classList.toggle('hidden-ap', solo ? !isThis : avulsa);
    });

    document.querySelectorAll('.notam').forEach(el => {
      const f = this.filtro;
      const show = f === 'todos'
        || (f === 'hoje'    && el.dataset.active === 'true')
        || (f === 'futuro'  && el.dataset.future === 'true')
        || (f === 'impacto' && el.dataset.impact === 'true');
      el.classList.toggle('hidden', !show);
    });

    // atualiza contagem por estação (visíveis)
    this._estacoes().forEach(ap => {
      const stack = document.getElementById('notam-stack-' + ap.icao);
      const vis = stack ? stack.querySelectorAll('.notam:not(.hidden)').length : 0;
      const badge = document.querySelector('[data-count="' + CSS.escape(ap.icao) + '"]');
      if (badge) badge.textContent = vis + ' NOTAM' + (vis === 1 ? '' : 's');
      // Base que tem NOTAM mas nenhum casou com o filtro: sem esta linha a
      // estação ficava uma caixa branca só com o cabeçalho, sem dizer por quê.
      if (stack) stack.classList.toggle('sem-visivel', vis === 0 && stack.querySelector('.notam') !== null);
    });
  },

  aplicarView() {
    const raw = this.view === 'raw';
    document.querySelectorAll('.notam').forEach(el => {
      el.classList.toggle('show-raw', raw);
      const t = el.querySelector('[data-toggle-raw]');
      if (t) t.textContent = raw ? '✦ Ver decodificado' : '⟨/⟩ Ver NOTAM cru';
    });
  },


  // ── Auxiliares ───────────────────────────────────────────
  _aeroportosDosNotams() {
    const vistos = {};
    (this.dados.notams || []).forEach(n => { if (n.icao) vistos[n.icao] = true; });
    return Object.keys(vistos).map(ic => ({ icao: ic, nome: ic, sub: '' }));
  },

  _formatarTimestamp(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return d.toISOString();
    }
  },

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  setLoading(on) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = on ? 'flex' : 'none';
  },

  initSidebar() {
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('main');
    const overlay = document.getElementById('sidebar-overlay');
    const hamb    = document.getElementById('hamburger');

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

document.addEventListener('DOMContentLoaded', () => Notams.init());
