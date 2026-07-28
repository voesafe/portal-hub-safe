# CLAUDE.md — Regras do Projeto SAFE Hub

Regras permanentes para qualquer trabalho neste projeto. Estas instruções têm prioridade sobre o comportamento padrão.

## Escrita: sem travessão

0. **Nunca use travessão (`—`) nem meia-risca (`–`) em texto gerado.** Vale para e-mails a alunos, textos de interface, comentários de código novo e mensagens de commit. Decidido em 2026-07-25: para a SAFE, travessão no meio da frase é marca de texto feito por IA, e a comunicação com aluno não pode soar automática. **Reescreva a frase**, não apenas troque o sinal: use vírgula (pausa curta), dois pontos (o que vem depois explica), ponto quebrando em duas frases (quase sempre lê melhor) ou reordene. O `—` sozinho como marcador de campo vazio na interface (`valor: '—'`) é convenção de UI e está liberado, assim como o separador `·`.

## Uso obrigatório do Graphify

1. **Antes de responder qualquer pergunta** sobre o código, arquitetura, arquivos, funções ou fluxos do projeto, consulte primeiro o Graphify, usando o comando/skill correto disponível neste projeto.

2. **Antes de fazer qualquer alteração no código**, consulte primeiro o Graphify, usando o comando/skill correto disponível neste projeto, para entender a estrutura atual e evitar mexer em arquivos errados.

3. **Sempre que fizer alterações no código**, atualize o Graphify depois da alteração, usando o comando/skill correto disponível neste projeto, para manter o grafo sincronizado com o projeto.

4. **Sempre que fizer alterações relevantes** em arquitetura, fluxos, dependências, comandos, estrutura de pastas, padrões técnicos ou decisões importantes, atualize também este arquivo (`CLAUDE.md`).

5. **Evite ler arquivos inteiros sem necessidade.** Use o Graphify primeiro para localizar os arquivos e trechos relevantes, economizando tokens.

6. **Priorize o Graphify como fonte inicial de contexto** ao trabalhar neste projeto, para reduzir consumo de tokens em um projeto grande (195+ arquivos, ~480k palavras).

## Transparência de comandos

7. **Antes de executar qualquer comando de build, merge, instalação ou atualização** (incluindo os do Graphify), mostre o comando exato que será rodado e explique rapidamente o que ele faz, antes de executá-lo.

## Confiabilidade do grafo

8. **Antes de confiar nas informações do Graphify**, verifique se o grafo está atualizado em relação aos arquivos atuais do projeto. Se houver dúvida, atualize ou valide o Graphify antes de usar como base.

## Arquitetura de Controle de Acesso (RBAC) — desde 2026-07-09

O acesso é **100% baseado em permissões efetivas** (`permissoesEfetivas`), calculadas no backend a partir de **grupos + permissões avulsas** de cada usuário. Não há mais decisão de acesso por string de `perfil`.

- **Catálogo de permissões e grupos padrão:** [apps-script/AccessControl.gs](apps-script/AccessControl.gs) (`ACCESS_PERMISSIONS`, `ACCESS_DEFAULT_GROUPS`). Grupo `operacoes_escala` = Escala CCO + Horas INVA + SAFE MINIONS.
- **Fonte única no frontend:** [js/auth.js](js/core/auth.js) → mapa `Auth.PAGINAS` (página → permissões de `ver`/`editar`). Tudo deriva daí: `podeVer`, `podeEditar`, `eSomenteLeitura`, `montarMenuSidebar` (esconde itens/seções sem permissão) e todos os `proteger*` (via `protegerPagina`).
- **Níveis:** Visualizar e Editar por módulo. Superadmin/Master ignoram tudo (bypass).
- **`perfil` é apenas cosmético/espelho:** derivado dos grupos no `admin.js` (`perfilDerivadoDosGrupos`) para badges e para os guardas de escrita legados do backend (que agora honram permissão de forma **aditiva** — nunca bloqueiam quem tem a permissão RBAC).
- **Usuários CCO** (origem `cco`) recebem permissões via `permissoesEfetivasCco_` em [apps-script/Auth.gs](apps-script/Auth.gs) (Escala CCO tem backend próprio; aqui controla só a navegação no Hub).
- **Forçar relogin global:** trocar `CONFIG.SESSION_VERSION` ([js/config.js](js/core/config.js)) e `SAFE_AUTH_VERSION` ([apps-script/Auth.gs](apps-script/Auth.gs)) invalida todas as sessões.
- **Ao criar módulo/página nova:** adicione a permissão em `ACCESS_PERMISSIONS`, mapeie a página em `Auth.PAGINAS` e (se for o caso) inclua no grupo padrão adequado.

### Cargos e tela de criação de usuário (desde 2026-07-09)

- **Cargos oficiais** = os grupos padrão em [apps-script/AccessControl.gs](apps-script/AccessControl.gs) (`ACCESS_DEFAULT_GROUPS`, `ACCESS_CARGOS_OFERECIDOS`): Consultor Comercial, Gerente Comercial, Financeiro, Consultor CCO, Gerente CCO, Operações, DIRETORIA (IDs legados reaproveitados: `comercial`, `comercial_gerencia`, `financeiro`, `operacoes_escala`, `somente_leitura`; novos: `consultor_cco`, `gerente_cco`). `controle_gastos_leitura` é legado, fora da tela.
- **`sincronizarGruposPadrao_` é RECONCILIADOR:** o código é a fonte de verdade — atualiza nome/descrição e o conjunto EXATO de permissões de cada cargo (adiciona faltantes, remove sobras). Mudou um cargo? Basta editar o array e publicar.
- **Tela de criação** ([admin.html](admin.html)/[js/admin.js](js/pages/admin.js)): escolhe um **Cargo** (select `#u-cargo`) → **matriz de módulos** com switches **—/Ver/Editar** e, em Vendas/Dashboard/Escala CCO, toggle de **abrangência** (próprias/todos). A matriz canônica (`RBAC_MODULOS`) é espelho exato do gerador `scratchpad/gen_rbac.js` e dos grupos do backend — round-trip garantido (selecionar cargo não gera exceção).
- **Modelo de exceções:** salvar envia `grupos: [cargoId]` + `permissoesAvulsas` (adiciona) + `permissoesNegadas` (remove). No backend, `USER_PERMISSIONS.TIPO` = GRANT/DENY; `calcularPermissoesEfetivasUsuario_` faz `(grupos ∪ GRANT) \ DENY`.
- **Escala CCO "editar a própria":** permissão `escala_cco.editar_propria_escala` — o Hub concede, mas o **enforcement é do backend próprio da Escala CCO** (fora deste repo; ver [[escala_cco_backend]]).

## Padrão de UI: atualização instantânea (optimistic) — desde 2026-07-15

O backend do Apps Script tem latência alta (~10s). Para o fluxo não travar, as ações de UI usam **atualização otimista com rollback** quando é seguro: aplica a mudança no estado local + re-renderiza **antes** de esperar o servidor; se `res.ok` for falso, **reverte** o estado (snapshot) e mostra toast de erro.

- **Quando USAR otimista (mutação simples de item já existente no estado local):** toggles ativar/inativar, excluir, e editar registros de lista. Padrão: snapshot → mutar `this.dados`/`this.itens`/etc. → `render*()` → `await API.x()` → em falha, restaurar snapshot + `render*()`. Exemplos: [admin.js](js/pages/admin.js) `alternarStatus`; [vendas.js](js/pages/vendas.js) `excluir`/`salvar`(editar); [concorrencia.js](js/pages/concorrencia.js) `salvarConcorrente`(editar)/`salvarPrecoSafe`/excluir; [controle-gastos.js](js/pages/controle-gastos.js) `alterarStatusCategoria`/`salvarCategoria`(editar); [bases.js](js/pages/bases.js) `salvar`(editar).
- **CRIAR:** o servidor gera o ID → **não** fingir a linha. Padrão: fechar modal na hora + `this.carregar()` **sem `await`** (recarrega em segundo plano). Vale para vendas/concorrencia/bases/controle-gastos/admin.
- **NÃO usar otimista (manter round-trip único):** saves cujo resultado é **recalculado no servidor** e que a tela renderiza direto de `resposta.data` — fingir geraria versão/KPI errados. São: [fechamento-horas.js](js/pages/fechamento-horas.js) (`salvar`, `alterarStatus` = fechar/reabrir mês, com controle de versão + histórico), [controle-gastos.js](js/pages/controle-gastos.js) (`salvarReceitas`, `salvarFechamento` — KPIs), [access-control.js](js/pages/access-control.js) (`salvarGrupo`, já renderiza de `res.data`) e o salvar de valores em [faturamento.html](faturamento.html) (agregados/gráficos no servidor).
- **Regra prática ao criar/editar um fluxo novo:** se a tela só mostra os campos do formulário/estado local → otimista com rollback; se o servidor recalcula/gera algo (ID, versão, agregados) → round-trip único ou reload em bg. **Sempre** bumpar o `?v=` do `<script>` no HTML da página ao mudar o JS (cache-bust do GitHub Pages).

## Módulo NOTAMs (bases SAFE) — desde 2026-07-17

Página global (todos os usuários logados) que consulta os **NOTAM** ativos/futuros das bases **SBSJ** (São José dos Campos) e **SDAM** (Campinas/Amarais) para o CCO acompanhar impactos operacionais.

- **Fonte:** API oficial **AISWEB/DECEA** (`https://aisweb.decea.mil.br/api/?apiKey=..&apiPass=..&area=notam&icaoCode=SBSJ&icaoCode=SDAM`), GET, retorno **XML**. Requer `apiKey`/`apiPass` (solicitados ao DECEA; ver [[modulo_notams_cco]]).
- **Arquitetura:** o frontend **não** chama a AISWEB (CORS/credenciais); quem chama é o **Apps Script `UrlFetchApp`** (server-side) via gatilho diário → parseia o XML → grava a aba **`NOTAMS`** (cache) → `doGet(action=notams)` lê o cache → a página abre instantânea. Backend em [apps-script/Notams.gs](apps-script/Notams.gs); rota `notams` (leitura, `exigirSessao`) em [apps-script/Code.gs](apps-script/Code.gs).
- **Config da chave:** Propriedades do script `AISWEB_API_KEY`/`AISWEB_API_PASS` (nunca hardcoded). Instalar gatilho: `notamsInstalarTrigger()`. Conferir schema real do XML: `notamsDebugRaw()`. Testar sem chave: `notamsSelfTest()` (parseia XML de exemplo → grava cache).
- **Parser defensivo:** `notamParseXml_` achata cada `<item>` e escolhe campos por vários nomes de tag candidatos. **O schema foi confirmado contra a API real em 2026-07-28** (chave em mãos), e as listas de candidatos foram acertadas. Ver a subseção abaixo.

### Schema real do AISWEB, confirmado em 2026-07-28

Medido contra a resposta de verdade: 8 NOTAMs das bases SAFE e os **2207 do Brasil inteiro** como amostra de robustez.

- ⚠️ **UM `icaoCode` POR REQUISIÇÃO.** `icaoCode=SBSJ` sozinho filtra certo (7 NOTAMs, ~15 KB). Qualquer forma de pedir as duas bases de uma vez (`icaoCode` repetido, vírgula, espaço, pipe) faz o filtro **cair em silêncio**: volta o Brasil inteiro, 2207 NOTAMs e 4,9 MB, com HTTP 200 e sem aviso nenhum. O código original pedia exatamente assim (`icaoCode=SBSJ&icaoCode=SDAM`) e teria engasgado o `XmlService.parse` com megabytes. Hoje `atualizarNotamsAisweb` faz **uma chamada por base**, com `NOTAMS_MAX_BYTES` (600 KB) abortando antes do parse e uma **rede de segurança por `loc`** que descarta NOTAM de base alheia.
- ⚠️ **`<cod>` é o Q-CODE, não o identificador.** Bate com `/^Q[A-Z]{4}$/` em **2207 de 2207**. O identificador do NOTAM (`F3879/26`) está em **`<n>`**, também 100%. **A tag `<q>` não existe.** O parser original procurava `<q>` para o Q-code e usava `<cod>` como identificador, ou seja, errava os dois: a tela mostraria `QFUAU` como número do NOTAM e a classificação rodaria sem Q-code nenhum. `notamQcode_` valida pela **forma** (Q + 4 letras), não pelo nome da tag, então acerta nas duas hipóteses de schema.
- ⚠️ **O Q-code MANDA na classificação; palavra-chave é só fallback.** A ordem invertida era um bug real e caro: a primeira regra do `notamClassificar_` casava com `\bRWY\b` no texto, então **`ILS GP RWY 16 U/S` virava "Pista (RWY) / crítico"** — alarme de pista fechada com a pista aberta, em dois dos sete NOTAMs de SBSJ. Hoje `notamCatPorQcode_` decide pelo assunto do Q-code e `notamCatPorTexto_` só entra quando o Q-code falta (e nele a checagem de auxílio de navegação vem **antes** da de pista, para não repetir o mesmo erro).
- **Campos usados:** `loc` (ICAO), `n` (identificador), `cod` (Q-code), `b`/`c` (validade), `d` (campo D, a janela real tipo `DAILY 1200-2100`), `e` (texto), `tp` (NOTAMN/NOTAMR), `scope`. O `d` era descartado e agora entra no cru como `D)` e no decodificado como `· Válido em:` **inline**, porque `.notam-decoded` não tem `white-space: pre-wrap` (só `.notam-raw` tem).
- **Domínios reais:** `status`/`state` é sempre `ACTIVE` (a API só devolve o que está em vigor, então não há o que filtrar); `scope` ∈ {W: 1514, A: 468, AE: 167, E: 58}, traduzido por `notamEscopo_`; `tp` ∈ {NOTAMN, NOTAMR}; `b` sempre com 10 dígitos (`yyMMddHHmm`) e `c` com 10 dígitos ou **`PERM`** (87 casos, já tratado).
- **Regra própria da SAFE:** NOTAM que proíbe ou suspende **voo de instrução ou cheque** vira categoria "Voo de instrução" e severidade **crítica**. Existe um ativo em SBSJ (`F3883/26`, `AD PRB VOOS DE TREINAMENTO E CHECK ANAC`) que pela régua genérica sairia como informativo, quando na prática para em pé a operação da escola nas datas dele.
- **Host:** o e-mail do DECEA indica `http://www.aisweb.aer.mil.br/api/`, que **não respondeu** (timeout em http e https). O `https://aisweb.decea.mil.br/api/` que já estava no código responde normalmente com as mesmas credenciais e é o que ficou.
- **`notamsSelfTest()` agora usa uma amostra REAL** do XML (antes era uma hipótese de schema com `<q>`, que testava um formato inexistente e passaria sem provar nada). `notamsDebugRaw(icao)` passou a receber uma base.

### Sincronização e busca de outra localidade, desde 2026-07-28

- ⚠️ **O botão "Atualizar" NÃO consultava o DECEA.** Ele só passava `!force` para o `API.get`, que controla o **cache em memória do frontend**, não a origem do dado: relia a planilha e pronto. Como o gatilho era diário, apertar o botão nunca trazia NOTAM mais novo que as 6h daquele dia, e a tela dava a impressão contrária. Hoje ele chama a rota **`notams-atualizar`** → `atualizarECarregarNotams()`, que vai à AISWEB, regrava o cache e devolve o resultado. **Se a AISWEB falhar, o backend devolve o cache anterior com `sincronizado: false` e `erroSincronizacao`**, e o frontend avisa por toast: NOTAM velho e sinalizado é melhor que tela vazia, mas mentir que está fresco não é opção.
- **O gatilho passou de diário (06:00) para de hora em hora** (`everyHours(1)`). NOTAM é publicado a qualquer momento e quem abre a tela está decidindo operação; 24h de atraso não servia. Custo desprezível: 2 chamadas por hora contra o limite de 20 mil por dia do `UrlFetchApp`. `notamsRemoverTrigger()` desliga.
- **Busca de outra localidade** (rota `notams-consulta`, `consultarNotamsPorIcao`): campo na barra das abas, resultado numa **aba própria** ao lado de SBSJ e SDAM, com X para fechar. Validação de 4 letras no frontend **e** no backend. A consulta **não grava no cache**: a aba `NOTAMS` é das bases SAFE e não pode ser contaminada por consulta de terceiro.
- ⚠️ **A estação avulsa é escondida na aba "Todos os aeroportos"** (`aplicarFiltro`, via `data-avulsa`). Essa aba significa "as bases SAFE", e é o que os tiles e os contadores de filtro medem. Deixar a localidade de terceiro aparecer ali faria os números da tela mentirem. O estado da consulta vive em `this.consulta`, **fora de `this.dados`**, exatamente para os resumos não serem afetados.
- ⚠️ **As abas passaram a usar DELEGAÇÃO de evento** (`#notam-tabs`), porque a aba avulsa nasce depois do bind inicial e nunca receberia o listener por `querySelectorAll`. O X é interceptado antes do clique da aba, senão fechar também selecionaria.
- ⚠️ **ICAO inexistente é indistinguível de aeródromo sem NOTAM:** `XXXX` e `SBZZ` devolvem o mesmo `total="0"` que um aeródromo real e tranquilo. A mensagem da tela admite as duas hipóteses em vez de afirmar uma.
- **`aero` e `cidade`** passaram a ser extraídos do XML só para nomear a localidade consultada (as bases já têm nome fixo em `NOTAMS_AD_INFO`). Não vão para o cache: `notamGravarCache_` grava colunas fixas.
- **`.sr-only` foi definido no [notams.css](css/pages/notams.css)**, não no `layout.css`, para não obrigar a bumpar o CSS compartilhado nos 21 HTML por causa de uma classe. Se outra página precisar, aí vale promover para o core.
- **Verificação:** script de Playwright descartável interceptando `script.google.com` com payloads controlados, cobrindo 7 cenários (busca com minúsculas, aba criada e ativa, bases escondidas, tiles não contaminados, volta para Todos, código sem NOTAM, fechar pelo X, código inválido não chamando o backend, botão Atualizar chamando a rota certa). Zero erro de JS, desktop e 390px. Vale repetir se mexer no estado das abas.
- **Deploy:** backend em produção no **@40**; rollback `clasp redeploy AKfycbxpOGXgEJ5… -V 39`. Assets em `?v=20260728-notams-busca-v1` (`api.js` é core, foi bumpado nos 20 HTML que o carregam).
- **Classificação de impacto** (`notamClassificar_`): severidade `critico` (pista/RWY), `atencao` (táxi/luzes/nav), `info`. Deriva do Q-code + palavras-chave no texto E + datas de validade (ativo/futuro). Glossário de decodificação (`NOTAMS_GLOSSARIO`) é mínimo na Fase 1 — expandir na Fase 3.
- **Frontend (Fase 2, feita):** [notams.html](notams.html) + [js/notams.js](js/pages/notams.js) + [css/notams.css](css/pages/notams.css) (porte do mockup aprovado, no design system do Hub). Quando ativo, acesso **global**: `Auth.PAGINAS['notams.html'] = { publica: true }` — visível a **todos os logados** (não precisa de permissão nova no catálogo nem bump de `SESSION_VERSION`; o backend já gateia com `exigirSessao`). Item no menu (nível principal, ícone `notam`) e `ROTULOS_PAGINA` em [js/auth.js](js/core/auth.js); getter `API.getNotams()` em [js/api.js](js/core/api.js). Só leitura (sem escrita) → sem otimista. **Modo claro é o padrão**; botão de modo escuro **opcional e escopado** nesta página via `body.notams-dark` (não afeta o resto do Hub), persistido em `localStorage('notams-theme')`.
- **⚠️ Feature flag `Auth.NOTAMS_ATIVO` (default `false`, desde 2026-07-20):** o módulo está **commitado mas DESLIGADO** em produção. Com o flag OFF, [js/auth.js](js/core/auth.js) troca a entrada de `PAGINAS['notams.html']` por `{ ver: ['notams.indisponivel'] }` (permissão que ninguém tem) → some do menu e o acesso direto é barrado. **NÃO usar `delete`** na entrada: `podeVer` é *fail-open* (sem regra em PAGINAS = liberado a logados) e `protegerPagina` só barra `if (PAGINAS[destino] && !podeVer)` — deletar liberaria geral. **Para ligar:** (1) reautenticar clasp (`clasp login`) e promover backend a @28; (2) configurar chave AISWEB + `notamsInstalarTrigger()`; (3) trocar `NOTAMS_ATIVO` para `true` e bumpar `?v=` do auth.js.
- **Deploy/publicação:** frontend vai pro **GitHub Pages** (git push na main → hub.voesafe.com.br). O parser corrigido está no `@HEAD` e em **produção no @39** desde 2026-07-28. Vale lembrar que, para o NOTAM, o `@HEAD` já bastaria: gatilho de tempo roda o **código salvo do projeto**, não a implantação. A implantação fixa só serve o `doGet`, e `listarNotams` não mudou. Rollback: `clasp redeploy AKfycbxpOGXgEJ5… -V 38`. **Sobraram os passos fora do código:** configurar `AISWEB_API_KEY`/`AISWEB_API_PASS` nas Propriedades do script, rodar `atualizarNotamsAisweb()` uma vez à mão (prova que a chave funciona e já popula o cache) e rodar `notamsInstalarTrigger()`. Só depois disso trocar `NOTAMS_ATIVO` para `true` e bumpar o `?v=` do auth.js nos 21 HTML. Ligar o flag antes da chave deixaria a página no ar sem dado nenhum.
- ⚠️ **`clasp run` não funciona neste projeto** ("script is deployed as API executable" ausente), igual ao backend de Horas INVA. Rodar `notamsInstalarTrigger()`, `atualizarNotamsAisweb()` ou `notamsSelfTest()` exige clique no Run dentro do editor.

### NOTAMs no Controle de Acesso: entrega em duas fases, desde 2026-07-28

A página nasceu `publica: true`, o que a deixava visível a todo logado **mas fora do Controle de Acesso**: sem permissão no catálogo, não havia o que conceder nem negar. Virou permissão de verdade, `notams.visualizar`, presente em **todos** os cargos padrão (na prática segue global) e nas permissões de usuário de origem CCO.

- ⚠️ **Não use o padrão do `inicio.html` (`{ ver: [...], publica: true }`) quando quiser gatear de fato.** O `podeVer` testa `cfg.publica` **antes** de olhar o array `ver` e devolve `estaLogado()`, então a permissão vira decoração: ela aparece no Controle de Acesso e o interruptor não consegue negar a página a ninguém. Para NOTAMs ficou só `{ ver: ['notams.visualizar'] }`.
- ⚠️ **`sincronizarGruposPadrao_` NÃO roda no login.** Ele roda em `listarControleAcesso()` (abrir o Controle de Acesso) e nos `criarUsuario`/`atualizarUsuario`. O `login` chama `anexarPermissoesEfetivasSessao_` → `calcularPermissoesEfetivasUsuario_`, que apenas **lê** os grupos da planilha. Consequência: publicar catálogo e frontend juntos criaria uma janela em que todo mundo reloga **sem** a permissão nova e o módulo some do menu até alguém abrir o Controle de Acesso. Daí as duas fases.
  - **Fase 1 (@41, na `main`):** permissão no catálogo + nos 8 cargos + nas permissões CCO. Puramente aditiva, nada muda enquanto o frontend não trocar a regra da página.
  - **Passo humano no meio:** abrir o Controle de Acesso em produção uma vez, o que dispara a reconciliação e grava `notams.visualizar` nos grupos.
  - **Fase 2 (branch `notams-rbac`):** troca de `publica` para `ver`, módulo NOTAMs na matriz do `admin.js`, e bump de `SESSION_VERSION` + `SAFE_AUTH_VERSION` (relogin geral, senão o item some para quem já está logado, cuja `permissoesEfetivas` em `localStorage` não tem a permissão).
- **A sessão já morre na virada do dia** (`sessaoInvalidaPorPolitica_` compara `diaLogin` com a data local), então sem o bump todo mundo pegaria a permissão no dia seguinte de qualquer forma. O bump só evita o buraco de algumas horas.
- **O backend recalcula as permissões a cada requisição** (`validarTokenSessao` também chama `anexarPermissoesEfetivasSessao_`), mas **o menu do frontend lê a cópia do `localStorage`** gravada no login. É por isso que o relogin é necessário mesmo com o servidor já sabendo da permissão nova.
- **Verificação:** round-trip da matriz nos 8 cargos (permissões do backend → `inferirMatriz` → `matrizParaPermissoes`), sem sobra nem falta, mais 4 cenários de gate (com permissão, sem, superadmin, origem CCO) e o acesso direto caindo em `acesso-negado.html`. ⚠️ Ao escrever teste que dá `eval` em trecho do `admin.js`, converta `const` para `var`: `const` em `eval` fica no escopo do próprio `eval` e não vaza, mesma armadilha do `Auth` no navegador.
- **Publicado em 2026-07-28:** fase 1 no @41, fase 2 no **@42** com o relogin geral. Rollback do backend: `clasp redeploy AKfycbxpOGXgEJ5… -V 41`.
- `scratchpad/gen_rbac.js`, citado antes como gerador canônico da matriz, **não existe mais**. A fonte de verdade hoje são `ACCESS_DEFAULT_GROUPS` (backend) e `RBAC_MODULOS` (frontend), mantidos em espelho e conferidos pelo round-trip acima.

## Cadastro de Aluno — menu de ações e seleção em massa (desde 2026-07-20)

Página da fila S141/Trello ([cadastro-alunos.html](cadastro-alunos.html) + [js/cadastro-alunos.js](js/pages/cadastro-alunos.js) + [css/cadastro-alunos.css](css/pages/cadastro-alunos.css)). Só leitura + mutações simples via ações por linha; **sem otimista** (cada ação recalcula e devolve a lista inteira `res.data.alunos` do servidor → round-trip único, na regra do padrão optimistic acima).

- **Menu de ações "..." (drop-up):** o popover (`.cadastro-action-popover`) abre para baixo por padrão; ao abrir, `posicionarMenuAcao` mede o espaço abaixo do gatilho e, se não couber, adiciona a classe `drop-up` (abre para cima). Corrige as opções ficarem escondidas atrás da janela na **última linha** de qualquer aba (o `.table-wrapper` tem `overflow-x:auto`, que força corte no eixo Y).
- **Seleção em massa (exclusiva da aba "Prontos Trello"):** estado em `this.selecionados` (Set de ids). Checkbox por linha + "selecionar todos" no cabeçalho **só aparecem** quando `filtro === 'trello'` (regra CSS `.cadastro-fila-card:not(.mostrar-selecao) .cadastro-col-check{display:none}`); trocar de aba limpa a seleção. Barra `#cadastro-bulk-bar` surge com ≥1 selecionado.
- **Sincronizar em lote:** `sincronizarSelecionados` roda **sequencial** (não paralelo) reusando o endpoint por-id `API.sincronizarTrelloCadastroAluno(id)` — cada chamada serializa no Apps Script e devolve a lista completa; paralelizar geraria corrida de estado. Mostra progresso `n/total` e tolera falhas parciais (conta sucesso/erro). **Nenhuma mudança de backend** foi necessária.
- **⚠️ Armadilha do `table-layout: fixed`:** a tabela `.table-cadastro-alunos` fixa a largura de cada coluna por `th/td:nth-child(1..9)`. Ao **inserir/remover coluna**, todos os `nth-child` deslocam — e `display:none` **não** tira o elemento da contagem `nth-child`. A coluna de check é `nth-child(1)` (44px) e as originais foram deslocadas para `nth-child(2..9)`; escondida (`display:none !important` fora da aba Trello), a soma volta a bater com o layout de 8 colunas → sem regressão. Se mexer em colunas aqui, reindexe as regras `nth-child`.
- **⚠️ `hidden` vs `display`:** a barra `.cadastro-bulk-bar` tem `display:flex`, que sobrepõe o atributo `hidden` (só `display:none` de baixa especificidade) — precisa da regra `.cadastro-bulk-bar[hidden]{display:none}`.
- **Drop-up mede contra o `.table-wrapper`, não a janela:** o wrapper tem `overflow-x:auto` (→ força `overflow-y:auto`), então é ele quem corta o popover para baixo; medir só `window.innerHeight` deixava o menu cortado com viewport sobrando.
- **Cache-bust:** ao mexer no JS/CSS, bumpar `?v=` dos assets no HTML (padrão `AAAAMMDD-cadastro-alunos-vN`).

## Auditoria de alterações (Escala CCO) — desde 2026-07-22

Log de **quem** alterou a escala/valores/cadastros na Escala CCO, com valor **antes→depois**. Piloto do padrão de auditoria que será replicado nos demais módulos.

- **Backend** = Apps Script **container-bound** da Escala CCO (fonte fora deste repo — agora clonada em `~/Documents/01. Código VSCODE SAFE/Escala CCO SAFE/backend/Código.js`; Script ID `1i5Y7hRzwCVnwKUukWenluQPmRd3WR3M_8r_je-6bDrAw41GHoi9QI90B`, conta clasp `victor.pinho@voesafe.com`). Ver [[escala_cco_backend]].
- **Sheet `LOG`** (`timestamp, autor, acao, alvo, turno, antes, depois, detalhe`), gravada por `logAudit_` (defensivo em try/catch — auditoria **nunca** bloqueia a operação principal). Usa `getLogSheet_` próprio (NÃO o `getSheet` genérico, que criaria colunas de escala).
- **Autor + antes→depois** capturados em TODAS as mutações: `setShift` (ações `escalar`/`desmarcar`/`alterar_turno`), `setConfig` (`valor_turno`), `saveUser` (`criar`/`editar_funcionario`), `toggleUserActive`. O frontend passa a identidade via **dois params**: **`by`** = principal de auth (governa os guards) e **`actor`** = rótulo do autor real gravado no LOG (`logAudit_` grava `e.parameter.actor || e.parameter.by`). O backend não descobre sozinho (auth é própria, não Google-SSO). `getLog` é leitura → só manda `by`.
- **Action `getLog`** (leitura) com **guard no servidor** `ehAuditor_(by)`: só `role=admin` OU coluna **`canViewLog=true`** no `usuarios`. Filtros opcionais `month`/`limit` (padrão 500). Retorna mais recente primeiro.
- **Permissão `canViewLog`** = coluna O (15) do `usuarios`, concedida **só por admin** (`ehAdmin_`, checado no `saveUser` edição). Exposta em `login`/`getUsers` (admin sempre true). Frontend: checkbox "Pode ver o Histórico" no cadastro de funcionário (admin-only) e item de menu **🕓 Histórico** (drawer) + modal, gated por `isAdmin() || currentUser.canViewLog`.
- **⚠️ Admin do Hub (`safe-hub-admin`):** quando a Escala CCO abre **pelo Hub** (SSO, usuário não-exclusivo CCO), o `currentUser.username` é o sentinel **`safe-hub-admin`** — que NÃO existe na planilha `usuarios`. Por isso o guard `ehAuditor_`/`ehAdmin_` **aceita `HUB_ADMIN_USERS = ["safe-hub-admin"]`** como admin (senão o `getLog` retorna "Sem permissão" e o modal quebra). É coerente com o modelo do backend (ANYONE_ANONYMOUS, sem auth própria; as mutações já confiam no `by`). O gate real de quem vê é o **frontend** (menu + `Auth.PAGINAS`).
- **⚠️ `by` (auth) ≠ `actor` (autor do LOG) — desde 2026-07-22:** como TODO admin que entra pelo Hub compartilha o `by` sentinel `safe-hub-admin`, o LOG não sabia **quem** alterou (tudo virava "safe-hub-admin"). Correção: no SSO, `currentUser.autor` recebe a identidade real da sessão (`Nome (email)`) e as mutações enviam **`actor: currentUser?.autor || currentUser?.username`** junto do `by`. `by` continua o sentinel (mantém `ehAdmin_`/`ehAuditor_`); `actor` é só o autor exibido no histórico. Usuários exclusivos-CCO (login próprio) já tinham autor real via `username`. Retrocompat total: sem `actor`, backend cai no `by`.
- **⚠️ `alvo` vira Date no Sheets:** o LOG grava o dia do turno como `"2026-08-01"`, mas o Sheets auto-converte em Date na célula. `getLog` normaliza de volta (`alvo instanceof Date → formatDate`) e a coluna D do LOG é criada com formato texto (`@`). Sem isso o front recebia `"Sat Aug 01 2026 …"` e a formatação da data quebrava.
- **Botão Histórico:** existe em DOIS lugares — item no drawer (`dItemHistorico`) **e** botão na topbar (`navHistoricoBtn`, ao lado de Funcionários), ambos gated por `admin || canViewLog`. O topbar some/volta junto com os demais ao entrar/sair de Funcionários/Dashboard.
- **Deploy:** backend em **produção @5** (`clasp deploy -i AKfycbyeoa-8Vv…`; @5 = param `actor`, @4 = base da auditoria); mudança 100% **aditiva/retrocompatível** (ações antigas intactas, `by`/`actor` opcionais). Rollback: `clasp redeploy AKfycbyeoa-8Vv… -V N`. Frontend ([escala-cco.html](escala-cco.html)) tem JS inline (sem `?v=` a bumpar) → publica via git push na `main` (GitHub Pages). **Sem otimista** no getLog (só leitura). ⚠️ Cada usuário precisa de **hard-refresh** (Cmd+Shift+R) pós-deploy senão a página em cache não envia o `actor`/`by` (autor sai como sentinel/vazio no LOG).

## Módulo Aniversários de alunos — desde 2026-07-24

E-mail de parabéns automático para alunos, uma vez por ano. Lê a **mesma** "Planilha Alunos" do Cadastro de Aluno (fila S141) — a planilha acumula com dedupe por CPF, então já é base histórica.

- **A data de nascimento sempre veio no XLS do CAVOK e era descartada.** O export real tem **15 colunas** (não 7); o cabeçalho é **"Data Nascimento"** (sem "de") → chave normalizada **`data_nascimento`**. `normalizarAlunoImportado_` lê *todas* as colunas em `obj` e o `return` repassava só 7 — o dado morria ali. Nenhuma mudança foi necessária no processo manual do CAVOK. Ver [[cavok_alunos_endpoint]].
- **⚠️ A data é TEXTO `dd/mm/aaaa` de ponta a ponta e NUNCA vira `Date`.** `normalizarNascimentoCadastroAluno_` aceita string BR, ISO e `Date` (usando componentes **locais**, nunca UTC); `diaMesNascimentoCadastroAluno_` extrai dia/mês por regex. A escrita usa `setNascimentoCadastroAluno_`, que força `setNumberFormat('@')` **antes** do `setValue` — sem isso o Sheets converte em Date e a leitura volta deslocada (mesma armadilha do campo `alvo` no LOG da Escala CCO). A leitura em `carregarContextoCadastroAlunos_` usa `getDisplayValues` para as duas colunas de data. Errar um dia aqui = parabenizar na data errada.
- **Colunas novas** em `CADASTRO_ALUNOS_EXTRA_HEADERS` (auto-criadas no fim da planilha, sem deslocar nada): `DATA_NASCIMENTO`, `ANIVERSARIO_ENVIADO_EM` (ano do último envio = idempotência) e `SEM_ANIVERSARIO` (opt-out; a equipe também pode marcar à mão nos casos delicados — aluno falecido, aluno com problema com a escola).
- **`DATA_NASCIMENTO` não duplica coluna** se a planilha já tiver "Data Nascimento": `normalizarHeaderCadastroAluno_` reduz as duas grafias à mesma chave (underscore → espaço → underscore).
- **Escritas são por NOME, não por posição.** `setCadastroAlunoValor_` faz `if (!col) return` — adicionar coluna não pode corromper outra. É o **oposto** da armadilha `nth-child` do CSS do cadastro-alunos: lá inserir coluna desloca tudo, aqui não.
- **Regras do envio** ([Aniversarios.gs](apps-script/Aniversarios.gs)): nunca retroativo (só casa com o dia de hoje); **29/02 cai em 28/02 em ano não bissexto** (`aniversariosDiasAlvo_`); `LockService` evita execução dupla (gatilho + clique manual); `try/catch` por aluno (falha isolada não derruba o lote); respeita a cota do `MailApp`. Critério único de elegibilidade em `aniversariosMotivoInelegivel_`, usado tanto pelo envio quanto pela tela.
- **Logo embutido, sem host externo:** [LogoAsset.gs](apps-script/LogoAsset.gs) guarda o PNG 620px (28 KB) como base64 e `safeLogoBlob_()` devolve o blob cacheado por execução; o e-mail usa `inlineImages` + `<img src="cid:logoSafe">`. Isso mata os **dois** riscos: host caindo (Imgur/Drive) e bloqueio de imagem remota (o bloqueio existe contra rastreamento; imagem embutida não faz requisição). O `alt` é **estilizado** no próprio `<img>`, então se algum Outlook suprimir tudo o cabeçalho mostra "SAFE Escola de Aviação" em branco sobre o navy em vez de ficar vazio. ⚠️ **Base64 em `data:` URI NÃO serve** — o Gmail remove.
- **Template v2 com foto (desde 2026-07-25):** hero de largura inteira com a equipe comemorando, saudação em navy, corpo, citação em **Georgia** (única serifada, é o que dá o ar editorial) e rodapé compacto. Imagens em [HeroAsset.gs](apps-script/HeroAsset.gs): `SAFE_HERO_JPG_B64` (1240×667, 114 KB — otimizada de 2,1 MB) e `SAFE_MARCA_PNG_B64` (símbolo circular, 4 KB). Três `cid:` por e-mail (`heroSafe`, `logoSafe`, `marcaSafe`), ~153 KB total; o **corpo HTML tem 7,6 KB**, longe do recorte de ~102 KB do Gmail.
- **⚠️ O texto NUNCA entra dentro da imagem.** O mockup original tinha "Feliz aniversário!" sobre a foto em faixa diagonal. Dois impedimentos: (a) `background-image` em `<td>` não renderiza no Outlook e recorte diagonal não tem equivalente confiável; (b) **o nome do aluno muda em cada envio** — tem que ser HTML gerado. Ganho colateral: com imagens bloqueadas o e-mail ainda abre com a saudação legível.
- **Compatibilidade do template:** tabela **fluida** (`width:100%;max-width:640px`) com **wrapper condicional MSO** de 640px fixos — o Gmail no Android com conta não-Google remove o `<style>` do head, então sem media query uma tabela de 640px fixos estouraria a tela. Mais `bgcolor` junto de todo `background-color` (clientes antigos ignoram CSS em `<td>`), `display:block`+`border:0`+`width=` em toda `<img>`, `-ms-interpolation-mode:bicubic`, `font-size:0;line-height:0` nas barras de 1-5px, e a marca da citação escondida no mobile (`.marca-cel`) em vez de espremer o texto.
- **⚠️ Modo escuro do app do Gmail invertia o navy (corrigido 2026-07-25):** no iPhone o `#071126` aparecia azul claro — o app do Gmail aplica **inversão própria** por cima do que o e-mail pede, e CSS comum não alcança. Três camadas: `<meta name="color-scheme" content="light only">` + `supported-color-schemes` (Apple Mail e Outlook respeitam), reafirmação em `@media (prefers-color-scheme:dark)`, e principalmente os seletores **`[data-ogsc]` / `[data-ogsb]`** — atributos que o app do Gmail *coloca nos elementos que ele inverteu*, e a única via de recuperar a cor depois. Exige que todo bloco navy tenha a classe `.fn` e todo texto claro `.fwhite`/`.fteal`/`.fmuted`, senão a regra não alcança. **Ao adicionar bloco colorido novo, marcar com essas classes.**
- **⚠️ `replace('{NOME}', primeiroNome)` era um bug latente:** com string, um `$&` ou `$1` no nome seria interpretado como padrão de substituição e o assunto sairia corrompido. Agora usa **função** como segundo argumento. Testado com "A$&B Costa".
- **Teste de integridade do nome:** `scratchpad/teste-nome.js` roda um lote de 6 alunos reais com stubs do `MailApp` e verifica, por e-mail: nome certo no assunto/corpo/texto-puro, destino certo, **nenhum nome de outro aluno presente**, token de descadastro do CPF próprio e não de outro, as 3 imagens anexadas, e nome com HTML/apóstrofo/`$&` escapado. É o teste que responde "o aluno pode receber o nome de outro?" — não pode.
- **Rodapé:** logo 124px, Site + Instagram (`www.voesafe.com.br`, `instagram.com/voesafe/`), aviso de mensagem automática **unido ao descadastro num parágrafo só** (eram dois blocos com um vão; a junção cortou 29% da altura do rodapé, de 316px para 224px) e copyright. `ANIVERSARIOS_LINK_WHATSAPP` existe e, vazia, o link não é renderizado.
- **Descadastro (opt-out) sem login:** rota `aniversario-descadastro` no [Code.gs](apps-script/Code.gs) devolve **HTML** (`HtmlService`), não JSON — é a única rota assim. Token opaco = HMAC-SHA256 do CPF com `ANIVERSARIOS_SECRET` (criado sozinho no primeiro uso), no param **`t`** para não colidir com o `token` de sessão. Um clique, sem senha: exigir login faz a pessoa marcar como spam, e reclamação de spam **derruba a entrega de todos os e-mails do Hub**, inclusive os de acesso. Não afeta os transacionais.
- **Permissões `aniversarios.visualizar` / `aniversarios.reenviar`** existem no catálogo e **de propósito em NENHUM cargo padrão** → só superadmin/master vê (bypass em `usuarioEhSuperadmin`/`temPermissao`). Para liberar a alguém, conceder no Controle de Acesso: o guarda `exigirAniversarios` já honra a permissão de forma **aditiva**, sem mexer em código.
- **Página** ([aniversarios.html](aniversarios.html) + [js/aniversarios.js](js/pages/aniversarios.js) + [css/aniversarios.css](css/pages/aniversarios.css)) fica em **Administração**, ao lado do Cadastro de Aluno. Mostra hoje, próximos 7 dias, o mês, o estado do gatilho e a **cobertura da base** (% de ativos com data — expõe quem nunca vai receber). **Sem otimista**: o reenvio devolve a lista recalculada e a tela renderiza de `res.data` (fingir geraria contagem errada).
- **O gatilho é o último passo e é independente:** mesmo com tudo publicado, **ninguém recebe nada** até rodar `aniversariosInstalarTrigger()` (diário, ~9h). `aniversariosRemoverTrigger()` desliga.
- **Testar com segurança:** `obterCadastroAlunosSheetId_()` lê a propriedade de script `CADASTRO_ALUNOS_SHEET_ID` (fallback no código) → aponte para uma **cópia** da planilha, rode a importação real, confira, e apague a propriedade para voltar à produção. No editor: `aniversariosSelfTest('voce@voesafe.com')` (manda só pra você, não grava nada), `aniversariosPrevia()` (quem receberia hoje, sem enviar), `aniversariosDiagnostico()` (cobertura + cota + gatilho).
- **Deploy:** `clasp push` só atualiza o **@HEAD** — produção segue intocada até `clasp deploy -i AKfycbxpOGXgEJ5…`. Permissão nova exige relogin geral: `CONFIG.SESSION_VERSION` e `SAFE_AUTH_VERSION` foram para `2026.07.24-aniversarios-v1`.
### Entrega (deliverability) do e-mail de aniversário

Medido em 2026-07-25: **24,5% dos alunos estão na Microsoft** (195 hotmail.com, 41 outlook.com, 9 live.com, 6 hotmail.com.br = 257 de 1.050). Gmail é 60,7%. Um problema de entrega no Outlook.com atinge um quarto da base, não é caso isolado.

**Estado do DNS de `voesafe.com`** (domínio remetente, Google Workspace):

| | Valor | Situação |
|---|---|---|
| SPF | `v=spf1 include:_spf.google.com ~all` | ok |
| DKIM | presente no seletor `google` | ok |
| DMARC | `v=DMARC1; p=none` | **fraco, e sem `rua=`** |
| MX | `smtp.google.com` | ok |

*(`voesafe.com.br` é outro domínio, na Hostinger, usado pelo site. Não envia o e-mail de aniversário e não influencia essa entrega. `hub.voesafe.com.br` é CNAME para `voesafe.github.io`.)*

**Sintoma real:** Gmail entrega na caixa de entrada; um Hotmail testado caiu em spam. Causa mais provável é **remetente sem histórico** no Outlook.com, não configuração: a Microsoft desconfia de remetente novo mesmo com autenticação perfeita. Volume de 2-3/dia é o perfil ideal para construir reputação (parece orgânico, não disparo em massa).

**Passos, nesta ordem (DNS é manual, fora deste repo):**

1. **Relatórios DMARC, risco zero.** TXT em `_dmarc.voesafe.com`:
   `v=DMARC1; p=none; rua=mailto:dmarc@voesafe.com; fo=1`
   Comportamento não muda; passa a receber relatórios de tudo que envia como o domínio.
2. **Depois de 1 ou 2 semanas lendo os relatórios**, subir para aplicação:
   `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@voesafe.com; fo=1`
   ⚠️ **Não pular o passo 1.** Se algum sistema legítimo (ERP, matrícula, ferramenta de marketing) envia como `@voesafe.com` sem passar por SPF/DKIM, ele começa a cair em quarentena. Os relatórios revelam isso antes.
3. **Pedir a quem recebeu no Hotmail para marcar "Não é lixo eletrônico"** e adicionar o remetente aos contatos. Sinal de usuário pesa muito na Microsoft, e volume baixo é o melhor momento para semear isso.
4. Para testar de novo: marcar como legítimo **primeiro**, depois reenviar. Reenviar para uma caixa que tem a mensagem em spam, sem marcação, reforça o sinal negativo.

**Avaliado e descartado:**
- **Cabeçalho `List-Unsubscribe`:** é o que a Microsoft pede de remetente em massa, e o `MailApp` não define cabeçalhos. Daria com o serviço avançado do Gmail montando o MIME na mão, mas reescreve todo o envio (inclusive as imagens embutidas) e exige escopo amplo de Gmail. O gatilho de "massa" da Microsoft é 5.000/dia; estamos em 3. Custo alto, benefício duvidoso.
- **Descadastro apontando para `hub.voesafe.com.br` com redirecionamento**, para alinhar domínio: `script.google.com` tem reputação altíssima e cadeia de redirecionamento é sinal negativo por si só. Ficaria pior.
- **SNDS / JMRP da Microsoft:** são para quem controla os IPs de envio. Os nossos são do Google, compartilhados.

**Não existe garantia de 100%.** O que existe é probabilidade alta. Vale lembrar que este e-mail **não é transacional**: se um parabéns cai em spam, perde-se uma gentileza, não quebra matrícula nem acesso. Diferente do e-mail de senha do Hub, que precisa chegar.

- **Remetente e avatar (decidido em 2026-07-24):** os e-mails saem por `MailApp` da conta dona do script (`victor.pinho@voesafe.com`), então o **avatar no Gmail é a foto de perfil dele** — o `name` do `MailApp` só muda o nome exibido ("SAFE Escola de Aviação"). **Não existe forma de trocar o avatar por mensagem**: ele vem do perfil da conta remetente ou de BIMI (domínio). Para o logo aparecer no avatar seria preciso um **usuário Workspace de verdade** (alias não tem foto própria) + trocar `MailApp` por `GmailApp.sendEmail({from})`, que exige **escopo amplo de Gmail** no projeto — troca recusada por ora, já que o logo já é a primeira coisa no corpo do e-mail. Se um dia mudar, o envio está isolado em `enviarEmailAniversario_` (~5 linhas) e o remetente é a constante `ANIVERSARIOS_REMETENTE`; o custo real é a licença e a reautorização, não o código. `replyTo` foi avaliado e **não** adicionado (respostas ficam na caixa do Victor por escolha).
- **Carga de nascimentos (usada UMA vez, em 2026-07-24, e removida da UI):** os 742 ativos já estavam na planilha sem data — um export completo do CAVOK (1.050 alunos) preencheu **789 linhas** (787 alunos; 2 têm dois cursos) via `atualizarNascimentosCadastroAlunos` ([CadastroAlunos.gs](apps-script/CadastroAlunos.gs)), que escreve **só** a coluna `DATA_NASCIMENTO` em lote. Sobraram 260 sem data no próprio CAVOK e 3 alunos que não existem no Hub. A função ficou **dormente** (sem rota nem botão) porque a importação normal passou a gravar o nascimento em **todos** os ramos — inclusive o `if (ativo && !novo.elegivel)`, que antes fazia `return` sem tocar na linha e deixaria sem data quem já está no Hub com curso fora de PP/PC/INVA. Para reativar: rota no `Code.gs` + método no `api.js` + input no HTML.
- **⚠️ Nunca use `importarCadastroAlunos` para uma carga em massa com export completo:** ela **reativa** todo inativo que aparecer no arquivo (`if (inativo && !ativo)` → `situacao: 'Ativo'`, `hubStatus: 'reativado'`) e marca `novo_curso` + `s141: false` quando o curso do export difere do da planilha. No fluxo semanal (só matriculados da semana) isso quase nunca dispara; com a base inteira, dispararia para todos.
- **Estado do envio automático é uma pílula no header** (`.aniv-pill`, ao lado do Atualizar), não um card. Era um card de largura inteira; virou pílula em 2026-07-24 porque fica verde quase sempre e status permanente não deve competir com os dados. Ponto colorido + rótulo, com o detalhe (e a instrução de como ligar, quando desligado) no `title`. Em tela &lt;640px só o ponto aparece.
- **3 KPIs no topo:** aniversariantes de hoje, e-mails enviados no ano e **status do disparo do dia** (`cardStatusDoDia`). O terceiro tem 4 estados: `—` sem aniversariante (com a hora da última verificação, se foi hoje), `N` em vermelho quando houve falha, `N/N` verde quando tudo saiu, `N/N` âmbar aguardando. Os cards de cobertura (% com data) e de ativos sem data foram **removidos por decisão do Victor em 2026-07-24** — `resumo.coberturaPct` e `resumo.semData` continuam sendo calculados no backend e podem voltar à tela sem mexer no servidor.
- **⚠️ Falha de envio só existe se for persistida.** A coluna `ANIVERSARIO_ENVIADO_EM` registra **sucesso**, então um aluno cujo e-mail falhou ficava idêntico a um que não foi processado — e o Google não avisa, porque as falhas são tratadas por aluno no `try/catch`. `aniversariosGravarUltimaExecucao_` guarda o resultado do lote (data, hora, enviados, falhas e até 30 erros com `rowNumber`) na propriedade `ANIVERSARIOS_ULTIMA_EXECUCAO`; `listarAniversarios` casa por linha e devolve `erroEnvio` no aluno. O registro acontece **mesmo em dia sem aniversariante** — é o sinal de que o gatilho está vivo. Reenvio manual bem-sucedido chama `aniversariosLimparErro_`. Victor optou por **não** receber e-mail de alerta (2026-07-24): a tela é a única via.
- **A página lista SÓ alunos ativos.** `listarAniversarios` faz `if (!ativo) return` antes de montar hoje/próximos/mês: inativo não recebe e-mail (`aniversariosMotivoInelegivel_` barra por `situacao`), então aparecer só poluiria a tela. Ele continua contado no `resumo` e volta às listas se for reativado. `reenviarAniversario` também recusa aluno inativo. O motivo `inativo` foi tirado do mapa `MOTIVOS` do front, já que o backend não o manda mais.
- **⚠️ Guarda de nome inválido (`aniversariosNomeSuspeito_`):** o campo NOME do CAVOK é usado como marcador de status por gente do cadastro. Na base real (2026-07-24) havia **"INATIVO" com o Gmail de uma pessoa real**, **"Aluno TESTE"** (nascimento 01/01/1990 — dispararia todo 1º de janeiro) e **"teste2"**. Sem guarda, alguém receberia "Feliz aniversário, Inativo!". O filtro compara o **primeiro token inteiro** (e o nome completo) contra `ANIVERSARIOS_NOMES_INVALIDOS`, mais `/^test(e)?\d*$/` e nome com menos de 2 caracteres — **nunca substring**, senão pegaria "Testa Pereira", "Ativan", "Alonso Teste Filho". Validado contra os 1.050 nomes reais: 3 bloqueados, 1.047 liberados, zero falso positivo. Aparece na tela como tag **"Nome inválido no CAVOK"** e bloqueia o botão de reenvio; guarda repetida em `reenviarAniversario` e em `enviarEmailAniversario_` (última linha de defesa).
- **`aniversariosPrimeiroNome_` normaliza a caixa** porque 30 nomes vêm em CAIXA ALTA e 1 em minúsculas do CAVOK — sem isso seriam "Feliz aniversário, ADRIANO!" e "joão". Acentos sobrevivem ao `escapeHtmlEmail_` (testado com Ângela/João/Thaís/Íris). Nome com apóstrofo ou hífen sai com a segunda parte em minúscula ("D'angelo", "Maria-josé") — cosmético, e não existe nenhum na base atual.
- **⚠️ O hamburger da sidebar é responsabilidade do JS de CADA página.** O `auth.js` só ajusta o `aria-expanded` e FECHA o menu (`fecharMenu`); o toggle de `mobile-open` + `overlay.active` fica no `_bindHamburger()` de cada arquivo (padrão em [progresso-alunos.js](js/pages/progresso-alunos.js)). Faltava em `cadastro-alunos.js` (bug pré-existente) e por herança em `aniversarios.js` — os dois corrigidos em 2026-07-24. **Ao criar página nova copiando outra, confira se o molde tem esse bind.**

## Layout mobile: invariantes descobertas na auditoria de 2026-07-26

Auditoria de bugs **visuais** de celular em todas as páginas do Hub. O desktop não foi tocado. Três correções aplicadas; o restante do levantamento está listado no fim como pendente.

- **⚠️ A sidebar precisa de `height`, nunca `min-height`** ([layout.css](css/core/layout.css)). Ela é `position: fixed` com `overflow: hidden`, então `min-height: 100vh` fazia o elemento **crescer junto com o menu** em vez de deixar o `.sidebar-nav` rolar. Com o menu de superadmin (Início, Dashboard, 6 seções e o submenu aberto) o conteúdo passa de 800px: em tela curta o rodapé com o usuário e o botão **Sair ficava fora da dobra e inalcançável**, porque nada rola um elemento `fixed`. Agora é `height: 100vh` seguido de `height: 100dvh` (o `dvh` acompanha a barra de endereço do celular; o `vh` é o fallback). O trio obrigatório: `height` fixo na `.sidebar`, **`min-height: 0`** no `.sidebar-nav` (item flex se recusa a encolher abaixo do conteúdo sem isso, e o bug volta) e `flex-shrink: 0` no `.sidebar-brand` e no `.sidebar-footer`. **Ao mexer na sidebar, não reintroduza `min-height` nem tire o `min-height: 0` do nav.**
- **⚠️ Concorrência: o cabeçalho e as linhas são grids SEPARADOS** ([concorrencia.css](css/pages/concorrencia.css)). `.conc-thead`, `.conc-row` e `.conc-safe-row` só ficam alinhados porque repetem o **mesmo** `grid-template-columns`. Mudou um, muda os três. Não dá para usar `auto` na faixa das ações: no cabeçalho ela é vazia (viraria 0) e desalinharia das linhas. A faixa era de 60px (≤900px) e 48px (≤600px) para **74px de conteúdo** (dois `btn-icon` de 32px, mais borda, mais 4px de gap): como a faixa é fixa e o `.conc-acoes` usa `justify-content: flex-end`, o excedente transbordava **para a esquerda** e os botões apareciam por cima da coluna de valor. Hoje são 76px nos dois breakpoints. **Se entrar um terceiro botão na linha, suba esse número.**
- **⚠️ Escala PAV: a topbar é própria e não é filha direta de `.main`** ([escala-pav.html](escala-pav.html)), então o `fixarTopbar()` do [auth.js](js/core/auth.js) (que mede a altura real e alimenta `--topbar-current-h`) **não enxerga essa página**. A compensação era um `padding-top` fixo no `#appScreen`, que só funciona enquanto a topbar couber em uma linha. Com 3 abas, tema e Sair não cabia em 390px: os dois lados colidiam e o Sair saía da tela. No mobile (≤768px) ela virou **`position: static` com `flex-wrap`**, e o `padding-top` do `#appScreen` foi a zero. Assim não existe sobreposição possível, independente da largura ou de quantos botões entrarem depois. O custo aceito é a topbar rolar junto com o conteúdo no celular. **Não devolva `position: fixed` aqui sem medir a altura por JS.**
- **Cache-bust:** `layout.css` está em `?v=20260726-mobile-v1` nos 19 HTML e o `concorrencia.css` ganhou `?v=` (não tinha). Ao mexer em CSS compartilhado, bumpar em **todos** os arquivos, senão o GitHub Pages serve a versão velha para quem já visitou.

### Segunda leva, fechada no mesmo dia

1. **Dashboard**, tabela "Cursos mais vendidos" ([dashboard.css](css/pages/dashboard.css)): é a **única `.table` do Hub sem `.table-wrapper`**, e o tema aplica `white-space: nowrap` em todo `.table tbody td`. Nome de curso longo empurrava a coluna da quantidade para fora e o `.card { overflow: hidden }` cortava ela. Corrigido com `#ranking-cursos td { white-space: normal }`, mantendo posição e quantidade sem quebra. **Se algum dia essa tabela ganhar mais colunas, aí sim envolva num `.table-wrapper`.**
2. **Topbar abaixo de 480px** ([layout.css](css/core/layout.css)): `.topbar-right` era `flex-direction: column`, que empilhava cada botão numa linha própria e, numa topbar fixa, virava faixa de três linhas. Hoje é linha com `flex-wrap` e `.topbar-right > .btn { flex: 1 1 auto }`. Os pares que existem hoje cabem numa faixa só. **Ao adicionar um terceiro botão na topbar de alguma página, confira o mobile: ele vai quebrar para uma segunda faixa, o que é aceitável, mas quatro já ficam ruins.** O `.topbar-context` (título e subtítulo) segue escondido nessa faixa de propósito.
3. **SAFE MINIONS** ([safe-minions.css](css/pages/safe-minions.css)): os blocos do resultado tinham 32px de padding lateral fixo, 64px de ~358px úteis, agora 18px em ≤600px. Em ≤480px o `.tipo-selector` empilha os 3 botões de habilitação, que em linha ficavam com ~110px e quebravam "Piloto Comercial + Instrumentos" em quatro linhas.
4. **Miudezas:** `.modal-footer` ganhou `flex-wrap` ([safe-theme.css](css/core/safe-theme.css)); o `.toast-container` passou a respeitar as duas margens em ≤480px, como a Escala CCO já fazia no CSS dela; e o `.progresso-filter-actions` vira largura total quando os filtros empilham, valendo para as duas abas.

**Versões de asset:** `layout`, `safe-theme`, `dashboard`, `safe-minions` e `progresso-alunos` estão em `?v=20260726-mobile-v2`; `concorrencia` em `mobile-v1`. O `safe-theme.css` e o `dashboard.css` **não tinham `?v=` nenhum** até aqui. Reparado de passagem: o `js/config.js` aparece com **quatro `?v=` diferentes** entre as páginas sendo o mesmo arquivo, ou seja, o cache-bust é por página e não por asset. Não foi mexido, mas é a origem do risco de servir arquivo velho.

### Zoom automático em campo no celular, corrigido em 2026-07-28

⚠️ **O Safari do iPhone AMPLIA a página inteira ao focar um campo com `font-size` menor que 16px.** O tema global só definia `font-family` para campo, nunca tamanho, então cada página escolheu o seu: medido, **78 campos abaixo de 16px em 11 telas**, o **login incluído (15,2px)**. Ou seja, todo formulário do Hub dava um solavanco no celular, e a pessoa percebe isso como "a página selecionou o campo sozinha".

- A regra vive no [safe-theme.css](css/core/safe-theme.css) sob **`@media (pointer: coarse)`**, que restringe a dispositivo de toque: o desktop não muda um pixel (conferido campo a campo depois da mudança, tamanhos idênticos aos de antes).
- **O `!important` é necessário**, não preguiça: as regras de página são mais específicas (`.notam-busca input` vale 0,1,1 contra 0,0,1 de `input`) e venceriam.
- ⚠️ **Nunca resolva isso com `maximum-scale=1` ou `user-scalable=no`.** Some com o solavanco impedindo **qualquer** zoom, inclusive o que a pessoa dá de propósito para enxergar. Foi exatamente o que a auditoria de 2026-07-26 removeu da Escala CCO e da PAV.
- Checkbox, radio e range ficam de fora da regra: não recebem texto digitado e o tamanho ali afeta o desenho do controle.
- **Ao criar campo novo, não precisa fazer nada:** a regra é global e pega por elemento. Só não reintroduza `font-size` menor com especificidade maior **e** `!important`.

## Header e navegação unificados na auditoria de 2026-07-26

Segunda frente do mesmo dia: o Hub nasceu da colagem de sistemas separados e cada um trouxe o header do lugar de origem. O shell (`app-shell` + sidebar + `main`) já era comum às 19 páginas; o que denunciava a costura era a topbar e uns detalhes de `<head>`.

### Contrato de header (obrigatório em página nova)

```html
<div class="topbar">
  <div class="topbar-left">
    <button class="hamburger" id="hamburger" aria-label="Abrir menu">
      <span></span><span></span><span></span>
    </button>
    <div class="topbar-context">
      <div class="topbar-title">Título</div>
      <div class="topbar-subtitle">Subtítulo</div>
    </div>
  </div>
  <div class="topbar-right"><!-- ações --></div>
</div>
```

A marca (logo + divisor) **não vai no HTML**: o `aplicarMarcaHub()` do [auth.js](js/core/auth.js) injeta entre o hamburger e o `.topbar-context`. O `.topbar-context` agora vem escrito no HTML de todas as páginas; o `auth.js` mantém o fallback pelo primeiro filho não-hamburger só para uma página nova que esqueça a classe. Sem essa classe, a regra que esconde o título em ≤480px não pega.

**Componentes compartilhados no [layout.css](css/core/layout.css)**, criados porque três páginas desenhavam a mesma coisa de três jeitos:

- **Escala do botão de header:** `.topbar-right > .btn` fixa padding e tamanho de fonte. **Use só `.btn .btn-ghost` ou `.btn .btn-primary` e não invente classe própria por página.** Foi exatamente isso que deixou a Escala CCO com cinco botões de cinco cores.
- **`.topbar-status`:** pílula de estado com `.is-ok` / `.is-warn` / `.is-error`. Substituiu a `.aniv-pill` (Aniversários) e a `.notam-updated` (NOTAMs). ⚠️ Tem `.topbar-status[hidden]{display:none}` porque o `display:inline-flex` ganharia do atributo `hidden`, mesma armadilha da `.cadastro-bulk-bar`; Aniversários depende disso, a pílula nasce escondida.
- **`.topbar-tabs`:** abas de sub-visão no header. Aceita `.is-active` **e** `.active` (a Escala PAV já usava `.active` em JS que também cuida dos filtros de base dentro da página; renomear ali seria risco sem ganho).
- **`.theme-toggle`:** ícone SVG sol/lua, com `.is-dark` no próprio botão. As três telas com modo escuro próprio (CCO, PAV, NOTAMs) usavam **três emojis diferentes** trocados por `textContent`, o que ainda apagava o conteúdo do botão. **Ao ligar modo escuro em outra tela, marque `.is-dark` no botão, não troque texto.**

### Escala CCO

Os seis botões `nav-*` e o `theme-btn` viraram `.btn .btn-ghost`; o CSS deles saiu, junto com `.nav-users-btn` e `.nav-avatar`, que já eram mortos (sem elemento correspondente). **IDs e `onclick` ficaram intactos**, então nenhum JS mudou. ⚠️ O JS mostra/esconde por `style.display`, e o `display:none` vinha da classe antiga: por isso cada botão levou `style="display:none"` no markup. Abaixo de 768px continua trocando a fileira pelo drawer, agora via `[data-cco-nav]` (`!important`, senão o `style.display` do JS ganha) em vez de listar classe por classe. O `.hamburger-btn` do drawer manteve só as barras e a animação para "X"; o resto vem do `.btn-icon`.

### Escala PAV

A página tinha uma **segunda topbar inteira** dentro do `#appScreen`: logo próprio em base64, divisor, tema e um "Sair" que chamava o mesmo `Auth.logout()` do rodapé da sidebar. A topbar virou irmã de `.pav-app`, filha direta de `.main`, que é o que o `fixarTopbar()` procura (`.main > .topbar`). Com isso caiu o hack de `position:static` no mobile: a altura passa a ser medida por JS como em qualquer outra página. **Não devolva a topbar para dentro de `.pav-app`:** lá o `.pav-app .topbar` a repinta com os tokens escuros da PAV.

⚠️ **Ao mover a topbar, o `.pav-main{padding-top:0 !important}` virou uma armadilha e foi removido.** Ele existia porque quem compensava a barra fixa era o `#appScreen`. Com a topbar do Hub, quem compensa é o `.main`, e o `padding-top:0` escondia a primeira linha de ações do calendário (Replicar mês / Escalar por dia) atrás do header. O modo escuro da PAV no header agora vem de `body.dark .pav-main > .topbar`.

### Ordem do menu da sidebar, decidida em 2026-07-26

Decisão do Victor: **seções e itens em ordem alfabética**, com o **Início fixo no topo** (é a entrada da casa, não um módulo). Além disso, **NOTAMs saiu do nível principal e entrou em Escala** (é operacional das bases, mesma família) e **Dashboard de Vendas saiu do nível principal e entrou em Comercial**.

- Ordem das seções: Administração, Comercial, Escala, Financeiro, Portal do Aluno, Suporte.
- **Os itens dentro de cada seção são ordenados em tempo de execução** por `localeCompare(label, 'pt-BR')` no `secaoSeTiver`. Ao incluir item novo, **não precisa acertar a posição na mão**. Já as seções são ordenadas pela ordem dos `push`: aí sim insira no lugar alfabético.
- `secaoSeTiver` ganhou `def.visivel` (predicado próprio) para o item que **não é página do Hub**: a Planilha administrativa é link externo e depende de `planilha_admin.abrir`, não de `podeVer`. Isso permitiu a Administração deixar de ser HTML montado à mão e entrar na mesma ordenação das outras.
- ⚠️ O array `paginas` de cada seção é o que faz a seção **abrir sozinha** quando você está numa página dela. Ao mover um item de seção, mova a página nesse array também, senão o menu abre fechado na página ativa.
- **NOTAMs continua visível para superadmin mesmo com `NOTAMS_ATIVO=false`**, porque `podeVer` faz bypass de superadmin antes de olhar `PAGINAS`. Comportamento pré-existente, só mudou de lugar no menu. Para os demais perfis segue escondido.
- Os **cards da home** ([inicio.js](js/pages/inicio.js)) têm ordem própria e **não** foram alfabetizados: o pedido foi sobre a sidebar.

### `<head>` padronizado

`theme-color` estava `#1D2951` em duas páginas e `#19213f` em dezessete; ficou `#19213f`, o valor do `manifest.webmanifest`. A CCO usava `favicon.ico` (agora `favicon.png`, como todas) e CCO e PAV bloqueavam pinch-zoom com `maximum-scale=1.0, user-scalable=no`, que saiu. As duas também carregavam Montserrat/Raleway por `<link>` próprio, com pesos diferentes do resto: os pesos 800/900 de Montserrat entraram no `@import` do [safe-theme.css](css/core/safe-theme.css) e os links duplicados saíram, então **fonte agora vem de um lugar só**. O `debug.html` ganhou manifest, favicon e viewport, e o `faturamento.css` ganhou o `?v=` que era o único a não ter.

**Versões de asset:** `safe-theme`, `layout`, `auth.js`, `notams.css/js`, `aniversarios.css/js` e `faturamento.css` estão em `?v=20260726-hub-ui-v1`. Ao mexer em CSS ou JS compartilhado, bumpar em **todos** os HTML.

### O que ficou de fora

- Os itens do **drawer da Escala CCO** ainda usam emoji (📅 📊 👥 🕓), diferente dos SVG da sidebar do Hub. É conteúdo interno, não header. Próximo candidato.
- A validação visual cobriu desktop e a faixa ≤768px. A faixa abaixo de 480px ficou sem verificar no dia, e **foi conferida em 2026-07-27** com a ferramenta descrita na seção abaixo: Escala CCO, Escala PAV, Vendas, NOTAMs, Aniversários e Dashboard a 390px estão corretos (o `.topbar-context` some e a `.topbar-status` colapsa para o ponto, como projetado). Sobrou uma miudeza: nos NOTAMs a 390px o "Atualizar" estica na largura toda, porque `.topbar-right > .btn { flex: 1 1 auto }` foi pensado para dois botões e ali sobrou um. Não é defeito, e como alvo de toque ajuda.

## Estrutura de pastas, tema global e menu do usuário, desde 2026-07-27

Terceira frente da unificação. O Hub nasceu de HTML colados e ainda tinha três modos escuros diferentes, três alternadores e um `Sair` no rodapé da sidebar. Virou um tema só, um menu só, no molde do CAVOK.

### Pastas: `core/` e `pages/`

`js/` e `css/` foram divididos em **`core/`** (o que toda página carrega: `config.js`, `auth.js`, `api.js`, `safe-theme.css`, `layout.css`) e **`pages/`** (um arquivo por página). O `admin-cli.js` saiu da raiz para `tools/`.

- **A divisão é a regra de cache-bust escrita no caminho.** Mexeu em `core/` → bumpar `?v=` nos **21** HTML. Mexeu em `pages/` → só o HTML daquela página.
- ⚠️ **Os `.html` continuam na raiz e não podem sair de lá.** O Pages serve da raiz (`.nojekyll`, sem workflow), então cada arquivo é uma URL pública e o nome é também a chave de `Auth.PAGINAS`, o `href` do menu e o argumento de `protegerPagina`. Mover um quebra as três coisas mais os links que a equipe salvou.
- Todos os `?v=` foram normalizados para `20260727-tema-global-v1`. Antes o `js/config.js` tinha **quatro** versões diferentes sendo o mesmo arquivo.

### Camada semântica de cor (é aqui que o tema acontece)

O `safe-theme.css` passou a ter dois blocos: a **paleta** (`--navy`, `--blue`, `--gray-400`, valor fixo, igual nos dois modos) e a **camada semântica** (`--bg`, `--surface`, `--surface-2`, `--text`, `--text-2`, `--text-muted`, `--border`, `--brand-surface`, `--text-on-brand`), que é a única que muda. O escopo escuro é `:root[data-theme="dark"]`.

- **Regra ao escrever CSS novo: componente usa papel, nunca paleta.** `background: var(--surface)`, não `var(--white)`. A paleta segue válida para o que é marca e não deve inverter (azul do botão primário, verde de sucesso).
- ⚠️ **Os dois tokens que enganavam:** `--navy` era cor de texto em 71 lugares e fundo de marca em 17; `--white` era fundo em 41 e texto sobre marca em 39. A propriedade CSS é que distingue, e foi assim que a migração de ~430 ocorrências foi feita. **Se você escrever `--navy` num texto novo, ele fica ilegível só no escuro**, que é o jeito mais fácil do erro passar.
- **Blocos de estado:** `--tint-ok/erro/aviso/info` + `--ink-ok/erro/aviso/info` substituíram o par de hex do Tailwind (`#f0fdf4` com `#166534`) que estava copiado em seis páginas. O fundo é rgba de propósito: translúcido assenta sobre a superfície de baixo em vez de impor a sua, então serve nos dois modos.
- **Ajustes que token não resolve** (tint de marca escrito em `rgba` cru) ficam num bloco único no fim do `safe-theme.css`. Não espalhe seletor de tema pelos arquivos de página de novo.
- ⚠️ **Nada de `prefers-color-scheme`.** Claro é o padrão e o sistema operacional não opina: decisão de produto do Victor. Só entra no escuro quem pedir no menu.

### Guarda anti-flash (obrigatória em página nova)

Um `<script>` inline no `<head>` dos 21 HTML, marcado com `<!-- tema:guarda-anti-flash -->`, lê `localStorage['safe-hub-theme']` e carimba `data-theme` no `<html>` **antes da primeira pintura**. Sem ela, quem usa escuro leva um clarão branco **a cada clique na sidebar**, porque o Hub recarrega a página inteira. Precisa ser inline e síncrono: arquivo externo chega tarde. Ela também herda a chave antiga `notams-theme`.

### Menu do usuário (avatar na topbar)

Injetado por `montarMenuUsuario()` no [auth.js](js/core/auth.js), como a marca já era: **página nova não escreve nada**, basta ter `.topbar`, e o `.topbar-right` é criado se faltar. Tem Alternar modo, Mudar minha senha, Meus dados e Sair.

- ⚠️ **É filho DIRETO da `.topbar`, irmão do `.topbar-right`, nunca dentro dele.** Abaixo de 768px o `.topbar-right` vira faixa de largura inteira para caber os botões da página; com o avatar lá dentro ele descia junto e a topbar virava duas faixas com o avatar solto na segunda. Como irmão + `order`, ele fica preso no topo à direita e são os botões que descem.
- ⚠️ **A margem automática que alinha à direita vai no `.topbar-right`, NÃO no `.user-menu`.** Com o avatar virando irmão, a topbar passou a ter três filhos, e o `justify-content: space-between` dela joga o do meio para o CENTRO. Margem automática engole o espaço livre **antes** de quem a tem: no menu, ela colava o `.topbar-right` no `.topbar-left`, e a data do Início e os botões de cada página apareciam no meio do header. No `.topbar-right`, ela empurra o par inteiro para a direita, encostado no avatar. Medido: o vão até o avatar caiu de 487-765px para os 10px do `gap` da topbar.
- **O `Sair` saiu da sidebar** (decisão do Victor). O rodapé guarda só a identidade. `prepararLogoutSidebar` agora **remove** um `#btn-logout` que algum HTML antigo ainda traga, para não duplicar.
- **Mudar minha senha** reusa `Auth.alterarSenha` e a rota `alterar-senha`, que já existiam. **Sem otimista**: quem valida a senha atual é o servidor. O form é `novalidate` de propósito, senão o `minlength` nativo barra o submit antes do validador e o usuário leva a bolha cinza do navegador em vez da mensagem do modal, num erro só.
- **Meus dados** é só leitura da sessão, sem backend.
- ⚠️ **Comentário com crase dentro de template literal fecha a string.** Aconteceu ao documentar o `novalidate` no HTML do modal. Em bloco de template, escreva o comentário sem crase.

### Foto de perfil (avatar), desde 2026-07-27

Cada pessoa envia a própria foto em **Meus dados**. Ninguém troca a foto de ninguém: `salvarMeuAvatar` ([Auth.gs](apps-script/Auth.gs)) só enxerga a linha da sessão que chamou, e a rota `salvar-avatar` não aceita id nem e-mail de alvo. Por isso também **não tem permissão no catálogo**: não há o que gatear.

- **A foto é um data URI na coluna `AVATAR` da planilha USUARIOS**, não um link do Drive. A célula do Sheets aceita 50.000 caracteres; o frontend recorta no centro em 1:1 e reduz para 128px em JPEG 0.8, o que dá ~2 a 8 KB de base64. Medido com um retrato de 1,1 MB e 1800×2400: saiu com 2.763 caracteres. **Drive foi descartado de propósito**: exigiria a foto de cada funcionário pública por URL, e o `drive.google.com/uc?id=` quebra em hotlink. É a mesma decisão do logo embutido no e-mail de aniversário.
- **A coluna nasce sozinha**, pelo `garantirColunaUsuariosSuperadmin_` ([AccessControl.gs](apps-script/AccessControl.gs)), que cria coluna por nome no fim da planilha. Nada de posição fixa.
- ⚠️ **`setNumberFormat('@')` antes do `setValue`**, senão o Sheets tenta interpretar a string gigante e a leitura volta diferente. Terceira vez que essa armadilha aparece no projeto: a primeira foi o `alvo` no LOG da Escala CCO, a segunda a `DATA_NASCIMENTO` dos aniversários.
- **Recorte e redução acontecem no navegador** (`_prepararAvatar` no [auth.js](js/core/auth.js)), por canvas. Sobem os ~3 KB finais, não os 4 MB da câmera do celular. O recorte é central e quadrado, porque esticar retrato para o quadrado deforma o rosto, e o canvas leva fundo branco antes do desenho, porque PNG transparente viraria preto no JPEG.
- **`pintarAvatares()` é o único lugar que desenha avatar**: troca entre `<img>` e iniciais em todo `.user-menu-avatar` e `.sidebar-avatar` de uma vez. Ao criar um avatar novo em outra tela, use uma dessas classes e ele entra junto.
- **Sem otimista**: quem valida e persiste é o servidor, e fingir mostraria a foto nova numa gravação recusada. Depois do `ok`, a sessão em localStorage é reescrita na hora, senão a foto só apareceria no próximo login (o Hub recarrega a página inteira a cada navegação).
- **Usuário de origem CCO não tem linha nesta planilha**: o backend recusa com mensagem própria e a tela nem mostra os botões, só a explicação. Degrada para as iniciais.
- **Publicado em produção no @37** (2026-07-27), junto do frontend. A mudança é aditiva e retrocompatível: a leitura do avatar é tolerante (`idx.AVATAR ? ... : ''`), então promover não quebrou nada de antes. Rollback: `clasp redeploy AKfycbxpOGXgEJ5… -V 36`.
- ⚠️ **Quem já estava logado só vê a foto no próximo login**, porque o campo entra na sessão pelo `login`. Não foi forçado relogin geral (`SESSION_VERSION`) de propósito: derrubar a sessão de todo mundo por causa de uma foto não compensa, e a sessão expira no mesmo dia.

### Editor de enquadramento e foto pelo superadmin, desde 2026-07-28

Duas melhorias sobre o avatar: a pessoa passa a escolher o recorte, e o superadmin passa a ver e trocar a foto de qualquer um pelo cadastro central.

- **O recorte central automático saiu.** `_prepararAvatar` agora carrega a imagem (`_carregarImagemAvatar`) e abre o modal `modal-ajustar-foto` (`_abrirEditorAvatar`), com arraste e zoom de 1x a 4x. Devolve o data URI, ou **`null` se a pessoa cancelar** — todo chamador precisa tratar o `null`, senão grava foto vazia e apaga a que existia.
- ⚠️ **O estado do recorte é `{ zoom, cx, cy }` com cx/cy em FRAÇÃO do lado do quadro, nunca em pixels.** É isso que faz a prévia de 240px e o arquivo final de 128px enquadrarem exatamente a mesma coisa: `_pintarRecorteAvatar` é a única função que desenha, e as duas a chamam com o mesmo estado e lados diferentes. Guardar em pixels amarraria o recorte ao tamanho da prévia, e o resultado sairia diferente do que a pessoa viu. Medido: desvio de 0,35% entre prévia e final.
- ⚠️ **`_limitarEstadoAvatar` é obrigatório depois de QUALQUER mudança de estado** (arraste, zoom, abertura). Ele prende a imagem às bordas; sem a chamada, arrastar até o fim descola a foto e aparece faixa branca do fundo. Os limites saem em fração e independem do lado do quadro, então valem para a prévia e para o arquivo final. Testado em retrato, paisagem e quadrada, 4 zooms e os 4 cantos: zero folga.
- **O quadro encolhe com a tela** (`Math.max(180, Math.min(240, innerWidth - 96))`): 240px fixos não cabem num celular de 390px depois do respiro do modal. A máscara circular é `box-shadow` de 9999px presa pelo `overflow:hidden` do palco, e leva `pointer-events:none`, senão engoliria o arraste.
- ⚠️ **`touch-action: none` no canvas é o que faz o arraste funcionar no celular.** Sem isso o navegador entende o gesto como rolagem da página e o `pointermove` nunca chega.
- ⚠️ **A barra de zoom é desenhada à mão** (`::-webkit-slider-runnable-track` e companhia). Com `accent-color` sozinho o navegador pinta só o preenchimento e escolhe o resto: o trilho vazio saía preto no claro e cáqui no escuro.
- **`_abrirModal` ganhou um terceiro parâmetro `aoFechar`** e passou a responder ao Escape **só quando é o modal de cima** (`.modal-overlay.open` mais recente). O editor abre sobre o "Meus dados": sem isso, uma tecla fechava os dois.
- **Superadmin vê a foto na lista de usuários:** `listarUsuarios` passou a devolver `avatar`, e `avatarUsuarioHtml` ([admin.js](js/pages/admin.js)) troca as iniciais pelo `<img>`, mesmo contrato do `pintarAvatares`. ⚠️ **`fotoUsuario` valida o data URI por regex inteira**, não só o prefixo, porque o valor entra como `src` dentro de uma string de HTML e o `escape` do admin.js não escapa aspas.
- **Superadmin troca a foto de outro** pelo bloco no topo de "Identidade" do modal de usuário. **Grava na hora, por rota própria (`salvar-avatar-usuario`), e não pelo botão Salvar do formulário** — por isso o bloco só aparece ao editar um usuário do Hub já criado: cadastro novo ainda não tem linha onde gravar, e usuário CCO nunca terá. Trocar a própria foto por ali reescreve a sessão em localStorage, senão a topbar só mudaria no próximo login.
- **`gravarAvatarUsuario_` é o núcleo comum** ([Auth.gs](apps-script/Auth.gs)) e **não decide permissão**: quem decide é o chamador. `salvarMeuAvatar` continua sem alvo (só a linha da sessão); `salvarAvatarUsuarioCentralizado` recebe alvo e por isso a rota fica atrás do `exigirGestaoUsuarios`, que é superadmin puro. Sem permissão nova no catálogo.
- ⚠️ **Perfil exclusivo não conseguia trocar a própria foto** (bug da entrega anterior): o `validarAcaoPerfilExclusivo_` tem lista fechada de ações, e `salvar-avatar` não estava nela. A pessoa escolhia a foto, enquadrava e levava "este acesso é exclusivo". Ação incluída nas duas listas (`controle_gastos_visualizacao` e `escala_minions`).
- ⚠️ **A lista de usuários engordou:** cada pessoa com foto acrescenta ~3 a 8 KB ao payload do `usuarios` e ao cache em localStorage do admin. A gravação do cache já vive num `try/catch`, então estouro de cota degrada para "sem cache", não para erro. Se a base de usuários crescer muito, o caminho é devolver só um sinalizador de "tem foto" na lista e buscar a imagem sob demanda.
- **Verificação:** `tools/screenshot.mjs` não cobre isto (o editor precisa de interação). Foi usado um script de Playwright de sessão com 60 combinações de recorte, comparação prévia/final e o fluxo salvar/cancelar, mais capturas nos dois modos e no celular. Vale repetir se mexer na geometria.
- **Publicado em 2026-07-28: frontend na `main` e backend em produção no @38** (`clasp deploy -i AKfycbxpOGXgEJ5…`). Rollback do backend: `clasp redeploy AKfycbxpOGXgEJ5… -V 37`. Aditivo e retrocompatível: rota nova, campo novo na leitura, nenhuma permissão nova, sem relogin geral.
- ⚠️ **Antes de `clasp push`, confira se o `@HEAD` remoto não tem edição feita direto no editor do Apps Script.** O jeito seguro: `clasp pull` (com a árvore do git limpa) e comparar. **Atenção:** o `scriptExtensions` do [.clasp.json](.clasp.json) tem `.js` e `.gs`, então o `pull` grava `Auth.js` **ao lado** de `Auth.gs` em vez de sobrescrever. Serve bem para diferenciar (`diff Auth.js Auth.gs`), mas **apague os `.js` antes do push**, senão sobem os dois arquivos e o projeto fica com todas as funções duplicadas.
- ⚠️ **Não dá para testar rota POST do web app com `curl`:** ele devolve a página HTML do Google, e devolve a MESMA página para uma rota inexistente, então não distingue nada. GET funciona e devolve JSON. Para POST, use `fetch` de dentro de uma página do Hub (Playwright): com token inválido, rota existente responde `Sessão expirada` e rota ausente responde `Ação desconhecida`. **Sempre rode a rota-fantasma de controle junto**, senão você não sabe se o teste distingue.

### Marca em dois arquivos

`safe-logo-horizontal.png` (lettering navy) e `safe-logo-horizontal-dark.png` (lettering claro, símbolo azul e verde preservados, gerado por script a partir do original separando por luminância). As **duas** ficam no DOM e o CSS escolhe: trocar `src` por JS piscaria a marca ao alternar.

- ⚠️ **Os seletores precisam do `.topbar-brand-link` na frente.** A regra existente `.topbar-brand-link img` vale (0,1,1); uma classe sozinha vale (0,1,0) e perde, então o `display:block` dela vencia e **as duas marcas apareciam lado a lado no modo claro**, em todas as páginas. Só apareceu na captura de tela.

### O que foi arrancado

`body.notams-dark` (notams.css), `body.dark` da Escala CCO (72 seletores no HTML, chave `cco-theme`, botão na topbar e interruptor no drawer) e `body.dark .pav-app` da Escala PAV (15 seletores, chave `pav-theme`, botão próprio). Os três viraram `:root[data-theme="dark"]`. O `.theme-toggle` do layout.css e o CSS do interruptor do drawer ficaram órfãos e saíram.

- ⚠️ Ao remover o botão da PAV sobrou um `document.getElementById('btnTheme').addEventListener(...)` sem proteção, que teria derrubado **todo o script inline** da página. Ao tirar elemento de página com JS inline, procure o acesso sem `?.`.
- No **notams.css** e no **safe-minions.css** a página inteira seguiu o tema só repontando o bloco de apelidos locais (`--n-surface`, `--texto`) para a camada semântica. Quando existir esse bloco, mexa nele, não nos 200 usos.
- ⚠️ **A remoção deixou a Escala CCO em branco (corrigido em 2026-07-28).** Ao tirar o interruptor de tema e o "Sair da conta" do rodapé do drawer, saíram junto os dois `</div>` que fechavam o `.drawer-footer` e o `.drawer`. O `<div class="drawer-footer">` ficou aberto e o parser aninhou **todo o `<main class="cco-main">`** dentro dele: o calendário, o Dashboard e Funcionários foram parar num painel de 300px fora da tela, e a página abria só com a topbar sobre uma área vazia. **Nenhum erro de JS**, porque HTML mal fechado não lança nada, e nada nas telas irmãs quebrou, então a revisão visual das outras páginas não pegava. Hoje o rodapé sumiu de vez (o `.drawer` fecha logo após o `.drawer-body`) e o CSS de `.drawer-footer`/`.drawer-logout` saiu com ele. **Ao apagar um bloco inteiro de página com HTML inline, confira o aninhamento no navegador, não só o diff:** a leitura mais rápida é `document.querySelector('.cco-main').parentElement.id`, que tem que ser `appScreen`.

### Verificação

`tools/screenshot.mjs` ganhou `--dark` e `--usermenu`. O `--dark` grava na **mesma chave** que a guarda do `<head>` lê, antes de navegar, para reproduzir o caminho real em vez de forçar o atributo depois do load. Rodado nas 17 páginas nos 2 modos: 1 logo, menu presente, zero erro de JS em todas; a 390px, nenhum estouro horizontal e topbar de no máximo 17% da tela (Vendas, que tem 4 controles).

⚠️ **Tokens de paleta também vivem em estilo embutido no JS** (o esqueleto de carregamento de Vendas e do Dashboard, `api.js`, o JS inline da CCO e do faturamento: 50 ocorrências). O CSS estava certo e a tela continuava clara. Ao migrar cor, varra `js/` e o `<script>` dos HTML, não só `css/`.

## Bases na home: pinta na hora, confere depois, desde 2026-07-27

A seção "Bases SAFE" da [inicio.html](inicio.html) esperava o `getBases` para aparecer, e com os ~10s do Apps Script a parte mais visível da home ficava carregando. Endereço de base muda quando a base muda de lugar ou fecha, o que não acontece há anos: é o caso perfeito para mostrar o que já se sabe e conferir em segundo plano.

- **Ordem das operações** em `carregarBases` ([inicio.js](js/pages/inicio.js)): pinta do cache (`localStorage['safe-hub-bases']`) ou do `basesPadrao` no primeiro acesso, dispara o `getBases` **sem `await`**, e quando a resposta chega grava o cache e repinta **só se mudou**. Medido: os cards aparecem em ~350ms mesmo com o servidor levando 10s.
- ⚠️ **Gravar o cache e repintar são decisões separadas.** Amarrar a gravação à diferença deixava sem cache justamente o navegador cujos dados batem com o padrão, que é o caso comum, e ele seguia dependendo da constante do código para sempre. Grava sempre, repinta só na diferença.
- ⚠️ **Guarde o estado da tela ANTES de gravar.** `basesConhecidas()` lê do localStorage: comparar depois de gravar dá sempre igual e a tela nunca se corrige. A comparação usa a variável `naTela`, capturada antes.
- **Repintar conteúdo idêntico é um bug visual**, não um no-op: a seção piscaria uns dez segundos depois de a página estar aberta e lida.
- **`basesPadrao` só vale para o primeiro acesso de um navegador** e está na mesma ordem que a planilha devolve (São José primeiro), senão o primeiro acesso pinta numa ordem e troca para outra segundos depois.
- **Servidor fora do ar não apaga nada**: sem `res.ok`, fica o que está na tela.
- **Alinhamento dos dois cards:** `.home-base address` leva `flex: 1` + `align-content: start` ([inicio.css](css/pages/inicio.css)). Os cards já tinham a mesma altura, porque a grade estica por padrão; faltava escolher **quem fica com a sobra**. Sem isso, o card com complemento de endereço empurrava a divisória para baixo e as duas ficavam em alturas diferentes.

**Esse padrão serve para outras telas**, e é o mesmo diagnóstico do cache em memória do [api.js](js/core/api.js) que morre a cada navegação: onde o dado muda pouco e a espera é visível, pinte o conhecido e revalide atrás.

## Horas Voadas INVA Mês: cadastro de instrutor, desde 2026-07-28

Página [horas-voadas-inva.html](horas-voadas-inva.html) + [js/pages/horas-voadas-inva.js](js/pages/horas-voadas-inva.js). **O backend NÃO é o do Hub**: é um Apps Script próprio, container-bound à planilha de horas, apontado por `CONFIG.HORAS_VOADAS_INVA_API_URL` ([js/core/config.js](js/core/config.js)). A página fala com ele por `fetch` direto (`requisitar` para GET, `enviar` para POST), sem passar pelo `api.js` e sem token de sessão.

- **Fonte local em `../horas-voadas-inva-main/backend/`, FORA deste repo** (e fora do git). Script ID `1EWtRjpU0-fwhWBVaWAG2ObykdVLcuMT2icu8SxziYpGSDjuEf9cF8hwy`, planilha `13oGd6Zt4AKKkHmOOjeEXkhS8MBZw9GwOkL9Y_rhwA-M`, arquivo `Código.js`. Ganhou `.clasp.json` em 2026-07-28: antes disso não tinha, e a pasta estava **três versões atrás** do publicado (local 2.2, produção 2.5, sem `handleGetMonth`, sem `FECHAMENTO_AERONAVES`, com a URL do CAVOK ainda em `http`). Colar o local por cima teria destruído funcionalidade em produção.
- ⚠️ **Sempre `clasp pull` para uma pasta separada e `diff` ANTES de mexer.** Foi o que salvou aqui. O fluxo usado: pull limpo, aplicar a mudança sobre o arquivo puxado, conferir que o diff só contém o pretendido, `clasp push`, e só então `clasp deploy`.
- **Deploy:** produção é a implantação `AKfycbyThE1-1S77CJFfrSsWVVYak4tu-V37xsXH1VZFckKf1CJulgueWhqpKx70NWg9ifA9`, **@3** desde 2026-07-28 (@2 era a base que habilitou o `doPost`). `clasp push` sozinho só mexe no @HEAD e não muda produção. Rollback: `clasp redeploy AKfycbyThE1… -V 2`.
- ⚠️ **`clasp run` não funciona neste projeto:** o script não está publicado como "API executable". Função de manutenção precisa de clique no Run dentro do editor.
- Abas da planilha: `Instrutores` (Nome | Tipo) e `Horas` (Instrutor | Data | Horas | CavokId). O saldo inicial não é campo do instrutor: vira uma **linha na aba `Horas`** com `Data = "SALDO INICIAL"` e `CavokId = "SISTEMA"`. O total de cada instrutor é a soma de todas as linhas dele em `Horas`, casada **por nome** (`handleGetData`), o que torna nome duplicado um problema de dado, não só de estética.

### Três bugs corrigidos em 2026-07-28

1. ⚠️ **`evento.currentTarget` é null depois de um `await`.** O `cadastrar` fazia `evento.currentTarget.reset()` **depois** do `await this.enviar('add_instructor')`. `currentTarget` só existe durante o despacho do evento; com os ~10s de latência do Apps Script, quando a linha rodava o evento já tinha terminado havia muito tempo. O efeito era o pior possível: o instrutor **era gravado**, o `reset()` lançava, caía no `catch` e a tela mostrava erro sem voltar para o dashboard e sem recarregar a lista. Quem tentava de novo criava duplicata. Hoje a referência do formulário é capturada **antes** do `await`. **Regra geral: em handler `async`, guarde `currentTarget` na primeira linha.** Era a única ocorrência de `currentTarget` no Hub.
2. ⚠️ **`toFixed()` devolve STRING, e o Sheets em pt-BR leu "5.8" como 5 de agosto.** O `handleAddInstructor` gravava `Number(data.saldoInicial).toFixed(1)`, ou seja, a string `"5.8"`, e o `appendRow` deixou o Sheets interpretar: virou a data 05/08/2026, serial **46239**. O `setNumberFormat('0.0')` da linha seguinte não salvava nada, porque rodava **depois** de o valor já ser Date, e só reformatava o serial. Hoje grava número de verdade (`Math.round(n*10)/10`) e o formato vem **antes** do valor, com `appendRow` de célula vazia + `setValue`. Quarta vez que a armadilha do `setNumberFormat` antes do `setValue` aparece no projeto: as anteriores foram o `alvo` no LOG da Escala CCO, a `DATA_NASCIMENTO` dos aniversários e o data URI do avatar. **O que é novo aqui é que o valor nem precisava ser string:** a correção de verdade é não deixar string chegar na célula.
3. **Não havia guarda de nome repetido.** `handleAddInstructor` fazia `appendRow` direto. Agora recusa nome já cadastrado (comparação por nome normalizado em caixa alta) e roda dentro de `LockService`, senão dois cliques seguidos leem a planilha ao mesmo tempo e os dois inserem.

**Faxina de dado:** qualquer linha `SALDO INICIAL` cujo valor esteja na casa dos 4xxxx é uma data disfarçada, não um saldo. O estrago só acontece com saldo **decimal** cujas duas partes formem dia e mês válidos (5.8, 1.2, 12.5); saldo inteiro escapava por acaso. O `Code.gs` ganhou duas funções dormentes (sem rota, rodadas pelo editor): **`inspecionarDadosInva()`**, que só lê e relata, e **`repararDadosInva()`**, que desfaz o estrago. Rode a inspeção primeiro.

- ⚠️ **A inversão data → saldo não é injetora nas viradas de mês.** 29,2 (29 de fevereiro, que não existe em ano comum) e 1,3 (1 de março) caem no mesmo serial, e o mesmo vale para 30,2/2,3, 31,2/3,3, 31,4/1,5 e 31,6/1,7. Nesses cinco seriais o reparo **se recusa a escolher** e manda corrigir à mão; nos demais 269 valores testados a volta é exata. A exceção é 31,9, que rola para 1 de outubro: como o `toFixed(1)` só gerava mês de 1 a 9, outubro só pode ter vindo dali, então esse é resolvido sem ambiguidade.
- O reparo exige **serial inteiro**: o bug gerava data sem hora, então valor fracionário acima de 10000 é outro problema e fica intocado.

## Conferir a interface antes de publicar (tools/preview.sh)

`./tools/preview.sh` sobe o Hub em `localhost:8080` e abre o navegador. `--fundo` devolve o terminal e o servidor sobrevive ao fechamento dele; `--parar` encerra. **O login e os dados são os de produção**, com o código que ainda não subiu: o web app do Apps Script responde `Access-Control-Allow-Origin: *` e o POST usa `Content-Type: text/plain` de propósito, que é tipo "simples" e não dispara preflight de CORS. Não existe ambiente de homologação, e não é preciso: o frontend é estático e o backend é o mesmo dos dois lados.

- ⚠️ **O script abre DOIS sockets, um por pilha, e isso não é exagero.** O `python3 -m http.server --bind 127.0.0.1` escuta só em IPv4, e neste Mac o nome `localhost` resolve para `::1` (IPv6) **antes** do IPv4: o navegador tentava o IPv6, batia em porta fechada e a página não abria, com o servidor no ar e o `curl` funcionando. Também **não adianta** um socket IPv6 com `IPV6_V6ONLY` desligado: esse mapeamento só vale quando o bind é em `::` (qualquer endereço), o que abriria o servidor para a rede toda. Ligado a `::1` ele atende apenas IPv6, medido. Por isso são dois, `127.0.0.1` e `::1`, ambos presos ao laço local.
- O servidor manda `Cache-Control: no-store`, senão conferir UI com o navegador servindo arquivo velho vira perda de tempo.

- ⚠️ **Ler é seguro, salvar é real.** Não existe banco de teste. Para exercitar escrita, use registro descartável, ou aponte `CADASTRO_ALUNOS_SHEET_ID` para uma cópia (vale só para o módulo de alunos).
- **A Escala CCO e a Escala PAV têm backend próprio** e também respondem local. A CCO é a única que precisa do backend de pé para sair da tela de login.
- Publicar continua sendo `git push` na `main` (GitHub Pages). O que está no working tree **não** afeta produção.
- ⚠️ **Depois de publicar, o cache do GitHub Pages serve o arquivo antigo para quem já visitou** se o `?v=` não subiu. Local você não vê esse erro, porque o servidor do Python não guarda cache: é a classe de bug que só aparece em produção, e a única defesa é o `?v=`.

## Captura de tela das páginas (tools/), desde 2026-07-27

`node tools/screenshot.mjs <pagina.html> [--mobile] [--menu] [--full] [--online]`, com o servidor estático de pé (`python3 -m http.server 8080 --bind 127.0.0.1`). Serve para conferir UI sem depender de olho humano em toda página. Fica em [tools/](tools/), fora do site publicado; `node_modules` e os PNGs são ignorados pelo git.

**⚠️ Não volte a usar as flags one-shot do Chrome (`--headless --screenshot`) para isso.** Elas são recurso de depuração, não API de automação, e travam por três motivos medidos em 2026-07-27:

1. **`--user-data-dir` com perfil novo trava o `--screenshot`.** Reproduzido numa página `file://` com só um `<h1>`, sem rede, dentro e fora do sandbox. Era a causa da maioria das travas. Sem a flag o Chrome usa o perfil padrão, e aí não dá para rodar duas capturas ao mesmo tempo nem garantir estado limpo, o que obrigava a `pkill` entre execuções.
2. **`--window-size` tem piso de 500px no headless** e não emula dispositivo, então a faixa abaixo de 480px do Hub era invisível.
3. **`--virtual-time-budget` é chute de tempo, não condição de espera.** Em página pesada dispara cedo ou fica girando.

O script usa **`playwright-core`** (só a biblioteca, sem baixar navegador: acha o Chrome for Testing já no cache do `~/Library/Caches/ms-playwright` e aponta o `executablePath`). Passou de 30s com travas para ~3s por captura.

- **O Apps Script é bloqueado por padrão** (`contexto.route` abortando `script.google.com`), porque a sessão semeada não tem token válido: o backend responderia "sessão inválida" e a página iria para o login. Bloqueado, ela mostra o estado de erro de conexão e o layout fica visível. `--online` libera, e é o que a **Escala CCO** precisa, porque com o backend fora ela fica presa na própria tela de login.
- **⚠️ `Auth` não existe em `window`:** é `const` no topo do [auth.js](js/core/auth.js), e `const` de escopo global mora no escopo léxico, fora do objeto global. Dentro de `page.evaluate` use a referência solta (`Auth.salvarSessao(...)`), nunca `window.Auth`. O script chama o próprio `salvarSessao` do app justamente para não duplicar aqui a conta de expiração, dia e versão de sessão, que muda a cada relogin forçado.
- A espera é por `.topbar` **anexada** ao DOM, não visível, porque a Escala CCO mantém a topbar oculta enquanto tenta o SSO. E o script **avisa em vez de falhar**: tela em estado inesperado tem que virar imagem para a gente olhar, não erro.
