// ============================================================
// inicio.js — Portal de entrada do SAFE Hub
// ============================================================

const Inicio = {
  basesPadrao: [
    {
      nome: 'SAFE Campinas',
      endereco: 'Rua Sylvia da Silva Braga, 415',
      complemento: 'Terminal de Passageiros',
      cidade: 'Campinas',
      uf: 'SP',
      cep: '13082-105',
      email: 'contato@voesafe.com.br',
      telefone: '(12) 99706-9562'
    },
    {
      nome: 'SAFE Escola de Aviação',
      endereco: 'Rodovia dos Tamoios, Km 6,5',
      complemento: '',
      cidade: 'São José dos Campos',
      uf: 'SP',
      cep: '12228-845',
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
    const acessoHubPrincipal =
      !Auth.eUsuarioExclusivoCco() && !Auth.eUsuarioExclusivoControleGastos();
    const acessoAdmin = Auth.eAdmin();
    const acessoMaster = Auth.perfilEhMaster(Auth.getPerfil());

    return [
      {
        titulo: 'Dashboard de Vendas',
        descricao: 'Indicadores, receitas, leads e desempenho comercial.',
        href: 'dashboard.html',
        icone: 'dashboard',
        tom: 'blue',
        permitido: acessoHubPrincipal
      },
      {
        titulo: 'Vendas',
        descricao: 'Cadastro, consulta e acompanhamento das vendas realizadas.',
        href: 'vendas.html',
        icone: 'vendas',
        tom: 'teal',
        permitido: acessoHubPrincipal
      },
      {
        titulo: 'Escala CCO',
        descricao: 'Escalas, operações, benefícios e rotinas da equipe CCO.',
        href: 'escala-cco.html',
        icone: 'escala',
        tom: 'navy',
        permitido: Auth.podeAcessarEscalaCco()
      },
      {
        titulo: 'Faturamento',
        descricao: 'Consolidação mensal dos canais e receitas da SAFE.',
        href: 'faturamento.html',
        icone: 'faturamento',
        tom: 'amber',
        permitido: acessoMaster
      },
      {
        titulo: 'Concorrência',
        descricao: 'Análise comparativa de preços, escolas e mercado.',
        href: 'concorrencia.html',
        icone: 'concorrencia',
        tom: 'violet',
        permitido: acessoAdmin
      },
      {
        titulo: 'Controle de Gastos',
        descricao: 'Acompanhamento financeiro e gestão das despesas.',
        href: 'controle-gastos.html',
        icone: 'gastos',
        tom: 'teal',
        permitido: Auth.podeAcessarFinanceiro()
      },
      {
        titulo: 'Fechamento de Horas',
        descricao: 'Fechamento operacional de horas e controle de cotistas.',
        href: 'fechamento-horas.html',
        icone: 'horas',
        tom: 'blue',
        permitido: Auth.podeAcessarFechamentoHoras()
      },
      {
        titulo: 'SAFE MINIONS',
        descricao: 'Verificação dos mínimos de formação conforme requisitos ANAC.',
        href: 'safe-minions.html',
        icone: 'minions',
        tom: 'navy',
        permitido: acessoMaster
      },
      {
        titulo: 'Usuários',
        descricao: 'Gerenciamento de acessos, perfis e permissões do Hub.',
        href: 'admin.html',
        icone: 'usuarios',
        tom: 'violet',
        permitido: acessoAdmin
      },
      {
        titulo: 'Planilha Administrativa',
        descricao: 'Acesso à base administrativa integrada do SAFE Hub.',
        href: 'https://docs.google.com/spreadsheets/d/1LZ2z3yLZvIdw2h0FohhwoiYLEGwy9zz7CYL40_j2AVw/edit?gid=1905416248#gid=1905416248',
        destinoRestrito: 'planilha-administrativa',
        icone: 'planilha',
        tom: 'teal',
        permitido: acessoMaster,
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
    const status = modulo.permitido
      ? ''
      : `<span class="home-module-status">${Auth.iconSvg('lock')} Restrito</span>`;
    const acao = modulo.permitido ? 'Acessar módulo' : 'Ver permissão necessária';

    return `
      <a class="home-module${modulo.permitido ? '' : ' restricted'}"
         data-tone="${modulo.tom}"
         href="${destino}"
         ${modulo.externo && modulo.permitido ? 'target="_blank" rel="noopener noreferrer"' : ''}
         aria-label="${acao}: ${modulo.titulo}">
        <div class="home-module-top">
          <span class="home-module-icon" aria-hidden="true">${Auth.iconSvg(modulo.icone)}</span>
          ${status}
        </div>
        <h3>${modulo.titulo}</h3>
        <p>${modulo.descricao}</p>
        <span class="home-module-action">
          ${acao}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6"></path>
          </svg>
        </span>
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

  renderizarBases(bases) {
    const container = document.getElementById('home-bases');
    if (!container) return;

    if (!bases.length) {
      container.innerHTML = '<div class="home-bases-loading">Nenhuma base cadastrada.</div>';
      return;
    }

    container.innerHTML = bases.map(base => {
      const complemento = base.complemento
        ? `<span>${this.escape(base.complemento)}</span>`
        : '';
      const contato = [base.email, base.telefone].filter(Boolean)
        .map(item => this.escape(item)).join(' <span aria-hidden="true">|</span> ');
      return `
        <article class="home-base">
          <div class="home-base-content">
            <h3>${this.escape(base.nome)}</h3>
            <address>
              <span>${this.escape(base.endereco)}</span>
              ${complemento}
              <span>${this.escape(base.cidade)} - ${this.escape(base.uf)}${base.cep ? ` · CEP ${this.escape(base.cep)}` : ''}</span>
            </address>
            ${contato ? `<p>${contato}</p>` : ''}
          </div>
          <a class="home-base-map" href="${this.escape(this.linkMapa(base))}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${this.escape(base.nome)} no mapa">
            ${Auth.iconSvg('bases')}
          </a>
        </article>
      `;
    }).join('');
  },

  async carregarBases() {
    const res = await API.getBases();
    const bases = res.ok ? (res.data || []).filter(base => base.ativa !== false) : this.basesPadrao;
    this.renderizarBases(bases);
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
    const secaoBases = document.getElementById('home-bases')?.closest('.home-section');
    if (Auth.eUsuarioExclusivoControleGastos()) {
      if (secaoBases) secaoBases.hidden = true;
    } else {
      await this.carregarBases();
    }
  }
};

Inicio.iniciar();
