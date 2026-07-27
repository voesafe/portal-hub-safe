// ============================================================
// inicio.js — Portal de entrada do SAFE Hub
// ============================================================

const Inicio = {
  // Só serve para o PRIMEIRO acesso de um navegador, antes de existir
  // cache. Da segunda vez em diante quem manda é a resposta do servidor,
  // guardada em `BASES_CACHE_KEY`. Ordem igual à que a planilha devolve
  // hoje (São José primeiro), para o primeiro acesso não pintar numa
  // ordem e trocar para outra alguns segundos depois.
  basesPadrao: [
    {
      nome: 'SAFE Escola de Aviação',
      endereco: 'Rodovia dos Tamoios, Km 6,5',
      complemento: '',
      cidade: 'São José dos Campos',
      uf: 'SP',
      cep: '12228-845',
      email: 'contato@voesafe.com.br',
      telefone: '(12) 99706-9562'
    },
    {
      nome: 'SAFE Campinas',
      endereco: 'Rua Sylvia da Silva Braga, 415',
      complemento: 'Terminal de Passageiros',
      cidade: 'Campinas',
      uf: 'SP',
      cep: '13082-105',
      email: 'contato@voesafe.com.br',
      telefone: '(12) 99706-9562'
    }
  ],

  inicializarMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const hamburger = document.getElementById('hamburger');

    hamburger?.addEventListener('click', () => {
      const aberto = sidebar?.classList.toggle('mobile-open');
      overlay?.classList.toggle('active', aberto);
      hamburger.setAttribute('aria-expanded', String(!!aberto));
    });

    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('mobile-open');
      overlay.classList.remove('active');
      hamburger?.setAttribute('aria-expanded', 'false');
    });
  },

  modulos() {
    // Gating 100% RBAC: cada card usa a permissão de visualização da página
    // (mesma fonte do menu lateral, via Auth.PAGINAS).
    return [
      {
        titulo: 'Dashboard de Vendas',
        descricao: 'Indicadores, receitas, leads e desempenho comercial.',
        href: 'dashboard.html',
        icone: 'dashboard',
        tom: 'blue',
        permitido: Auth.podeVer('dashboard.html')
      },
      {
        titulo: 'Vendas',
        descricao: 'Cadastro, consulta e acompanhamento das vendas realizadas.',
        href: 'vendas.html',
        icone: 'vendas',
        tom: 'teal',
        permitido: Auth.podeVer('vendas.html')
      },
      {
        titulo: 'Escala CCO',
        descricao: 'Escalas, operações, benefícios e rotinas da equipe CCO.',
        href: 'escala-cco.html',
        icone: 'escala',
        tom: 'navy',
        permitido: Auth.podeVer('escala-cco.html')
      },
      {
        titulo: 'Escala PAV de Base',
        descricao: 'Escala de PAV das bases (CPN e SJK), fechamento e cadastro.',
        href: 'escala-pav.html',
        icone: 'escala',
        tom: 'teal',
        permitido: Auth.podeVer('escala-pav.html')
      },
      {
        titulo: 'Horas Voadas INVA Mês',
        descricao: 'Acompanhamento de instrutores e horas sincronizadas com o CAVOK.',
        href: 'horas-voadas-inva.html',
        icone: 'horas',
        tom: 'blue',
        permitido: Auth.podeVer('horas-voadas-inva.html')
      },
      {
        titulo: 'Faturamento',
        descricao: 'Consolidação mensal dos canais e receitas da SAFE.',
        href: 'faturamento.html',
        icone: 'faturamento',
        tom: 'amber',
        permitido: Auth.podeVer('faturamento.html')
      },
      {
        titulo: 'Concorrência',
        descricao: 'Análise comparativa de preços, escolas e mercado.',
        href: 'concorrencia.html',
        icone: 'concorrencia',
        tom: 'violet',
        permitido: Auth.podeVer('concorrencia.html')
      },
      {
        titulo: 'Controle de Gastos',
        descricao: 'Acompanhamento financeiro e gestão das despesas.',
        href: 'controle-gastos.html',
        icone: 'gastos',
        tom: 'teal',
        permitido: Auth.podeVer('controle-gastos.html')
      },
      {
        titulo: 'Fechamento de Horas',
        descricao: 'Fechamento operacional de horas e controle de cotistas.',
        href: 'fechamento-horas.html',
        icone: 'horas',
        tom: 'blue',
        permitido: Auth.podeVer('fechamento-horas.html')
      },
      {
        titulo: 'SAFE MINIONS',
        descricao: 'Verificação dos mínimos de formação conforme requisitos ANAC.',
        href: 'safe-minions.html',
        icone: 'minions',
        tom: 'navy',
        permitido: Auth.podeVer('safe-minions.html')
      },
      {
        titulo: 'Cadastro de Alunos',
        descricao: 'Fila S141 e sincronização do cadastro operacional no Trello.',
        href: 'cadastro-alunos.html',
        icone: 'aluno',
        tom: 'blue',
        permitido: Auth.podeVer('cadastro-alunos.html')
      },
      {
        titulo: 'Usuários',
        descricao: 'Gerenciamento de acessos, perfis e permissões do Hub.',
        href: 'admin.html',
        icone: 'usuarios',
        tom: 'violet',
        permitido: Auth.podeVer('admin.html')
      },
      {
        titulo: 'Controle de Acesso',
        descricao: 'Grupos, permissões e acessos efetivos dos colaboradores.',
        href: 'access-control.html',
        icone: 'acesso',
        tom: 'navy',
        permitido: Auth.podeVer('access-control.html')
      },
      {
        titulo: 'Planilha Administrativa',
        descricao: 'Acesso à base administrativa integrada do SAFE Hub.',
        href: 'https://docs.google.com/spreadsheets/d/1zUHGTAC8TUhD6v1k-7OLeDQRlj99J0BMbimScZD2SoI/edit?gid=1905416248#gid=1905416248',
        destinoRestrito: 'planilha-administrativa',
        icone: 'planilha',
        tom: 'teal',
        permitido: Auth.temPermissao('planilha_admin.abrir'),
        externo: true
      }
    ];
  },

  saudacao() {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  },

  primeiroNome(nome) {
    return String(nome || 'bem-vindo').trim().split(/\s+/)[0];
  },

  renderizarModulo(modulo) {
    const destino = modulo.permitido
      ? modulo.href
      : Auth.urlAcessoNegado(
          modulo.titulo,
          modulo.destinoRestrito || modulo.href
        );
    // Indicador no topo: seta (permitido) ou selo "Restrito".
    // Obs.: a home só recebe módulos permitidos (filtro em iniciar()),
    // o estado restrito é mantido por consistência/segurança.
    const indicador = modulo.permitido
      ? `<span class="home-module-arrow" aria-hidden="true">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M7 17 17 7"></path><path d="M9 7h8v8"></path>
           </svg>
         </span>`
      : `<span class="home-module-status">${Auth.iconSvg('lock')} Restrito</span>`;
    const acao = modulo.permitido ? 'Acessar' : 'Ver permissão necessária';

    return `
      <a class="home-module${modulo.permitido ? '' : ' restricted'}"
         data-tone="${modulo.tom}"
         href="${destino}"
         ${modulo.externo && modulo.permitido ? 'target="_blank" rel="noopener noreferrer"' : ''}
         aria-label="${acao}: ${modulo.titulo}">
        <div class="home-module-top">
          <span class="home-module-icon" aria-hidden="true">${Auth.iconSvg(modulo.icone)}</span>
          ${indicador}
        </div>
        <h3>${modulo.titulo}</h3>
        <p>${modulo.descricao}</p>
      </a>
    `;
  },

  escape(valor) {
    const el = document.createElement('div');
    el.textContent = String(valor ?? '');
    return el.innerHTML;
  },

  linkMapa(base) {
    if (/^https?:\/\//i.test(String(base.linkMapa || ''))) return base.linkMapa;
    const endereco = [
      base.endereco,
      base.complemento,
      base.cidade,
      base.uf,
      base.cep
    ].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  },

  iconesBase: {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.7a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.8 2z"></path></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3z"></path><path d="M9 7v13"></path><path d="M15 4v13"></path></svg>'
  },

  renderizarBases(bases) {
    const container = document.getElementById('home-bases');
    if (!container) return;

    if (!bases.length) {
      container.innerHTML = '<div class="home-bases-loading">Nenhuma base cadastrada.</div>';
      return;
    }

    container.innerHTML = bases.map(base => {
      const cidadeUf = [base.cidade, base.uf].filter(Boolean).map(v => this.escape(v)).join(' · ');
      const complemento = base.complemento
        ? `<span>${this.escape(base.complemento)}</span>`
        : '';
      const cep = base.cep ? `<span>CEP ${this.escape(base.cep)}</span>` : '';
      const email = base.email
        ? `<a class="home-base-contact" href="mailto:${this.escape(base.email)}">${this.iconesBase.mail}<span>${this.escape(base.email)}</span></a>`
        : '';
      const telefone = base.telefone
        ? `<a class="home-base-contact" href="tel:${this.escape(String(base.telefone).replace(/[^0-9+]/g, ''))}">${this.iconesBase.phone}<span>${this.escape(base.telefone)}</span></a>`
        : '';
      return `
        <article class="home-base">
          <div class="home-base-head">
            <span class="home-base-icon" aria-hidden="true">${this.iconesBase.pin}</span>
            <div>
              <h3>${this.escape(base.nome)}</h3>
              ${cidadeUf ? `<span class="home-base-city">${cidadeUf}</span>` : ''}
            </div>
          </div>
          <address>
            <span>${this.escape(base.endereco)}</span>
            ${complemento}
            ${cep}
          </address>
          <div class="home-base-contacts">
            ${email}
            ${telefone}
            <a class="home-base-maplink" href="${this.escape(this.linkMapa(base))}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${this.escape(base.nome)} no mapa">
              ${this.iconesBase.map}<span>Ver no mapa</span>
            </a>
          </div>
        </article>
      `;
    }).join('');
  },

  // ── Bases: pinta na hora, confere depois ──────────────────
  // O endereço de uma base muda quando a base muda de lugar ou fecha, o
  // que não acontece há anos. Esperar os ~10s do Apps Script para mostrar
  // um dado que praticamente nunca muda deixava a home em "carregando" na
  // parte mais visível dela. Agora a tela pinta com o que já se sabe e a
  // conferência acontece em segundo plano: se o servidor discordar, a
  // seção se corrige sozinha, sem ninguém esperando.
  BASES_CACHE_KEY: 'safe-hub-bases',

  basesConhecidas() {
    try {
      const bruto = localStorage.getItem(this.BASES_CACHE_KEY);
      const lista = bruto ? JSON.parse(bruto) : null;
      if (Array.isArray(lista) && lista.length) return lista;
    } catch (e) {}
    return this.basesPadrao;   // primeiro acesso do navegador
  },

  carregarBases() {
    // O que está na tela agora, guardado ANTES de qualquer escrita: é com
    // isto que a resposta do servidor será comparada. Reler o cache depois
    // de gravar daria sempre igual, e a tela nunca se corrigiria.
    const naTela = JSON.stringify(this.basesConhecidas());
    this.renderizarBases(JSON.parse(naTela));

    // Sem `await` de propósito: quem chama não deve ficar preso nisso.
    API.getBases().then(res => {
      if (!res?.ok) return;   // servidor fora: fica o que já está na tela
      const bases = (res.data || []).filter(base => base.ativa !== false);
      if (!bases.length) return;

      const novo = JSON.stringify(bases);

      // Gravar SEMPRE, repintar só se mudou: são coisas separadas.
      // Amarrar a gravação à diferença deixava sem cache justamente o
      // navegador cujos dados batem com o padrão, que é o caso comum, e
      // ele seguia dependendo da constante do código para sempre.
      try { localStorage.setItem(this.BASES_CACHE_KEY, novo); } catch (e) {}

      // Repintar conteúdo idêntico faria a seção piscar do nada, uns dez
      // segundos depois de a página já estar aberta e lida.
      if (novo !== naTela) this.renderizarBases(bases);
    });
  },

  setCarregando(ativo) {
    document.getElementById('inicio-loading')?.classList.toggle('active', ativo);
  },

  async iniciar() {
    if (!Auth.proteger()) return;

    Auth.preencherUI();
    this.inicializarMenu();

    const nome = Auth.getNome();
    document.getElementById('home-greeting').textContent = this.saudacao();
    document.getElementById('home-name').textContent = this.primeiroNome(nome);
    document.getElementById('home-role').textContent = Auth.descricaoPerfil(Auth.getPerfil());
    document.getElementById('home-date').textContent = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    }).format(new Date());
    document.getElementById('home-modules').innerHTML = this.modulos()
      .filter(modulo => modulo.permitido)
      .map(modulo => this.renderizarModulo(modulo))
      .join('');
    this.setCarregando(false);
    const secaoBases = document.getElementById('home-bases')?.closest('.home-section');
    if (!Auth.podeVer('bases.html')) {
      if (secaoBases) secaoBases.hidden = true;
    } else {
      // Sem `await`: pinta na hora com o que já se sabe e confere com o
      // servidor em segundo plano. Ver `carregarBases`.
      this.carregarBases();
    }
  }
};

Inicio.iniciar();
