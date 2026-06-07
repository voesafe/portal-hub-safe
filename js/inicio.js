// ============================================================
// inicio.js — Portal de entrada do SAFE Hub
// ============================================================

const Inicio = {
  modulos() {
    const acessoHubPrincipal = !Auth.eUsuarioExclusivoCco();
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
        permitido: acessoAdmin
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

  iniciar() {
    if (!Auth.proteger()) return;

    Auth.preencherUI();

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
      .sort((a, b) => Number(b.permitido) - Number(a.permitido))
      .map(modulo => this.renderizarModulo(modulo))
      .join('');
  }
};

Inicio.iniciar();
