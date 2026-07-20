# CLAUDE.md — Regras do Projeto SAFE Hub

Regras permanentes para qualquer trabalho neste projeto. Estas instruções têm prioridade sobre o comportamento padrão.

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
- **Fonte única no frontend:** [js/auth.js](js/auth.js) → mapa `Auth.PAGINAS` (página → permissões de `ver`/`editar`). Tudo deriva daí: `podeVer`, `podeEditar`, `eSomenteLeitura`, `montarMenuSidebar` (esconde itens/seções sem permissão) e todos os `proteger*` (via `protegerPagina`).
- **Níveis:** Visualizar e Editar por módulo. Superadmin/Master ignoram tudo (bypass).
- **`perfil` é apenas cosmético/espelho:** derivado dos grupos no `admin.js` (`perfilDerivadoDosGrupos`) para badges e para os guardas de escrita legados do backend (que agora honram permissão de forma **aditiva** — nunca bloqueiam quem tem a permissão RBAC).
- **Usuários CCO** (origem `cco`) recebem permissões via `permissoesEfetivasCco_` em [apps-script/Auth.gs](apps-script/Auth.gs) (Escala CCO tem backend próprio; aqui controla só a navegação no Hub).
- **Forçar relogin global:** trocar `CONFIG.SESSION_VERSION` ([js/config.js](js/config.js)) e `SAFE_AUTH_VERSION` ([apps-script/Auth.gs](apps-script/Auth.gs)) invalida todas as sessões.
- **Ao criar módulo/página nova:** adicione a permissão em `ACCESS_PERMISSIONS`, mapeie a página em `Auth.PAGINAS` e (se for o caso) inclua no grupo padrão adequado.

### Cargos e tela de criação de usuário (desde 2026-07-09)

- **Cargos oficiais** = os grupos padrão em [apps-script/AccessControl.gs](apps-script/AccessControl.gs) (`ACCESS_DEFAULT_GROUPS`, `ACCESS_CARGOS_OFERECIDOS`): Consultor Comercial, Gerente Comercial, Financeiro, Consultor CCO, Gerente CCO, Operações, DIRETORIA (IDs legados reaproveitados: `comercial`, `comercial_gerencia`, `financeiro`, `operacoes_escala`, `somente_leitura`; novos: `consultor_cco`, `gerente_cco`). `controle_gastos_leitura` é legado, fora da tela.
- **`sincronizarGruposPadrao_` é RECONCILIADOR:** o código é a fonte de verdade — atualiza nome/descrição e o conjunto EXATO de permissões de cada cargo (adiciona faltantes, remove sobras). Mudou um cargo? Basta editar o array e publicar.
- **Tela de criação** ([admin.html](admin.html)/[js/admin.js](js/admin.js)): escolhe um **Cargo** (select `#u-cargo`) → **matriz de módulos** com switches **—/Ver/Editar** e, em Vendas/Dashboard/Escala CCO, toggle de **abrangência** (próprias/todos). A matriz canônica (`RBAC_MODULOS`) é espelho exato do gerador `scratchpad/gen_rbac.js` e dos grupos do backend — round-trip garantido (selecionar cargo não gera exceção).
- **Modelo de exceções:** salvar envia `grupos: [cargoId]` + `permissoesAvulsas` (adiciona) + `permissoesNegadas` (remove). No backend, `USER_PERMISSIONS.TIPO` = GRANT/DENY; `calcularPermissoesEfetivasUsuario_` faz `(grupos ∪ GRANT) \ DENY`.
- **Escala CCO "editar a própria":** permissão `escala_cco.editar_propria_escala` — o Hub concede, mas o **enforcement é do backend próprio da Escala CCO** (fora deste repo; ver [[escala_cco_backend]]).

## Padrão de UI: atualização instantânea (optimistic) — desde 2026-07-15

O backend do Apps Script tem latência alta (~10s). Para o fluxo não travar, as ações de UI usam **atualização otimista com rollback** quando é seguro: aplica a mudança no estado local + re-renderiza **antes** de esperar o servidor; se `res.ok` for falso, **reverte** o estado (snapshot) e mostra toast de erro.

- **Quando USAR otimista (mutação simples de item já existente no estado local):** toggles ativar/inativar, excluir, e editar registros de lista. Padrão: snapshot → mutar `this.dados`/`this.itens`/etc. → `render*()` → `await API.x()` → em falha, restaurar snapshot + `render*()`. Exemplos: [admin.js](js/admin.js) `alternarStatus`; [vendas.js](js/vendas.js) `excluir`/`salvar`(editar); [concorrencia.js](js/concorrencia.js) `salvarConcorrente`(editar)/`salvarPrecoSafe`/excluir; [controle-gastos.js](js/controle-gastos.js) `alterarStatusCategoria`/`salvarCategoria`(editar); [bases.js](js/bases.js) `salvar`(editar).
- **CRIAR:** o servidor gera o ID → **não** fingir a linha. Padrão: fechar modal na hora + `this.carregar()` **sem `await`** (recarrega em segundo plano). Vale para vendas/concorrencia/bases/controle-gastos/admin.
- **NÃO usar otimista (manter round-trip único):** saves cujo resultado é **recalculado no servidor** e que a tela renderiza direto de `resposta.data` — fingir geraria versão/KPI errados. São: [fechamento-horas.js](js/fechamento-horas.js) (`salvar`, `alterarStatus` = fechar/reabrir mês, com controle de versão + histórico), [controle-gastos.js](js/controle-gastos.js) (`salvarReceitas`, `salvarFechamento` — KPIs), [access-control.js](js/access-control.js) (`salvarGrupo`, já renderiza de `res.data`) e o salvar de valores em [faturamento.html](faturamento.html) (agregados/gráficos no servidor).
- **Regra prática ao criar/editar um fluxo novo:** se a tela só mostra os campos do formulário/estado local → otimista com rollback; se o servidor recalcula/gera algo (ID, versão, agregados) → round-trip único ou reload em bg. **Sempre** bumpar o `?v=` do `<script>` no HTML da página ao mudar o JS (cache-bust do GitHub Pages).

## Módulo NOTAMs (bases SAFE) — desde 2026-07-17

Página global (todos os usuários logados) que consulta os **NOTAM** ativos/futuros das bases **SBSJ** (São José dos Campos) e **SDAM** (Campinas/Amarais) para o CCO acompanhar impactos operacionais.

- **Fonte:** API oficial **AISWEB/DECEA** (`https://aisweb.decea.mil.br/api/?apiKey=..&apiPass=..&area=notam&icaoCode=SBSJ&icaoCode=SDAM`), GET, retorno **XML**. Requer `apiKey`/`apiPass` (solicitados ao DECEA; ver [[modulo_notams_cco]]).
- **Arquitetura:** o frontend **não** chama a AISWEB (CORS/credenciais); quem chama é o **Apps Script `UrlFetchApp`** (server-side) via gatilho diário → parseia o XML → grava a aba **`NOTAMS`** (cache) → `doGet(action=notams)` lê o cache → a página abre instantânea. Backend em [apps-script/Notams.gs](apps-script/Notams.gs); rota `notams` (leitura, `exigirSessao`) em [apps-script/Code.gs](apps-script/Code.gs).
- **Config da chave:** Propriedades do script `AISWEB_API_KEY`/`AISWEB_API_PASS` (nunca hardcoded). Instalar gatilho: `notamsInstalarTrigger()`. Conferir schema real do XML: `notamsDebugRaw()`. Testar sem chave: `notamsSelfTest()` (parseia XML de exemplo → grava cache).
- **Parser defensivo:** `notamParseXml_` achata cada `<item>` e escolhe campos por vários nomes de tag candidatos — os nomes exatos do AISWEB só são confirmados com a chave (rodar `notamsDebugRaw` e ajustar as listas em `notamPick_`).
- **Classificação de impacto** (`notamClassificar_`): severidade `critico` (pista/RWY), `atencao` (táxi/luzes/nav), `info`. Deriva do Q-code + palavras-chave no texto E + datas de validade (ativo/futuro). Glossário de decodificação (`NOTAMS_GLOSSARIO`) é mínimo na Fase 1 — expandir na Fase 3.
- **Frontend (Fase 2, feita):** [notams.html](notams.html) + [js/notams.js](js/notams.js) + [css/notams.css](css/notams.css) (porte do mockup aprovado, no design system do Hub). Quando ativo, acesso **global**: `Auth.PAGINAS['notams.html'] = { publica: true }` — visível a **todos os logados** (não precisa de permissão nova no catálogo nem bump de `SESSION_VERSION`; o backend já gateia com `exigirSessao`). Item no menu (nível principal, ícone `notam`) e `ROTULOS_PAGINA` em [js/auth.js](js/auth.js); getter `API.getNotams()` em [js/api.js](js/api.js). Só leitura (sem escrita) → sem otimista. **Modo claro é o padrão**; botão de modo escuro **opcional e escopado** nesta página via `body.notams-dark` (não afeta o resto do Hub), persistido em `localStorage('notams-theme')`.
- **⚠️ Feature flag `Auth.NOTAMS_ATIVO` (default `false`, desde 2026-07-20):** o módulo está **commitado mas DESLIGADO** em produção. Com o flag OFF, [js/auth.js](js/auth.js) troca a entrada de `PAGINAS['notams.html']` por `{ ver: ['notams.indisponivel'] }` (permissão que ninguém tem) → some do menu e o acesso direto é barrado. **NÃO usar `delete`** na entrada: `podeVer` é *fail-open* (sem regra em PAGINAS = liberado a logados) e `protegerPagina` só barra `if (PAGINAS[destino] && !podeVer)` — deletar liberaria geral. **Para ligar:** (1) reautenticar clasp (`clasp login`) e promover backend a @28; (2) configurar chave AISWEB + `notamsInstalarTrigger()`; (3) trocar `NOTAMS_ATIVO` para `true` e bumpar `?v=` do auth.js.
- **Deploy/publicação:** frontend vai pro **GitHub Pages** (git push na main → hub.voesafe.com.br); backend já está no **@HEAD**. Para o Hub chamar a rota `notams` em produção é preciso **promover o backend a @28** (`clasp deploy -i AKfycbxpOGXgEJ5...`), senão o deployment de produção @27 responde "Ação desconhecida: notams". **Enquanto @28 não sobe, mantenha `NOTAMS_ATIVO=false`** (evita menu quebrado).

## Cadastro de Aluno — menu de ações e seleção em massa (desde 2026-07-20)

Página da fila S141/Trello ([cadastro-alunos.html](cadastro-alunos.html) + [js/cadastro-alunos.js](js/cadastro-alunos.js) + [css/cadastro-alunos.css](css/cadastro-alunos.css)). Só leitura + mutações simples via ações por linha; **sem otimista** (cada ação recalcula e devolve a lista inteira `res.data.alunos` do servidor → round-trip único, na regra do padrão optimistic acima).

- **Menu de ações "..." (drop-up):** o popover (`.cadastro-action-popover`) abre para baixo por padrão; ao abrir, `posicionarMenuAcao` mede o espaço abaixo do gatilho e, se não couber, adiciona a classe `drop-up` (abre para cima). Corrige as opções ficarem escondidas atrás da janela na **última linha** de qualquer aba (o `.table-wrapper` tem `overflow-x:auto`, que força corte no eixo Y).
- **Seleção em massa (exclusiva da aba "Prontos Trello"):** estado em `this.selecionados` (Set de ids). Checkbox por linha + "selecionar todos" no cabeçalho **só aparecem** quando `filtro === 'trello'` (regra CSS `.cadastro-fila-card:not(.mostrar-selecao) .cadastro-col-check{display:none}`); trocar de aba limpa a seleção. Barra `#cadastro-bulk-bar` surge com ≥1 selecionado.
- **Sincronizar em lote:** `sincronizarSelecionados` roda **sequencial** (não paralelo) reusando o endpoint por-id `API.sincronizarTrelloCadastroAluno(id)` — cada chamada serializa no Apps Script e devolve a lista completa; paralelizar geraria corrida de estado. Mostra progresso `n/total` e tolera falhas parciais (conta sucesso/erro). **Nenhuma mudança de backend** foi necessária.
- **⚠️ Armadilha do `table-layout: fixed`:** a tabela `.table-cadastro-alunos` fixa a largura de cada coluna por `th/td:nth-child(1..9)`. Ao **inserir/remover coluna**, todos os `nth-child` deslocam — e `display:none` **não** tira o elemento da contagem `nth-child`. A coluna de check é `nth-child(1)` (44px) e as originais foram deslocadas para `nth-child(2..9)`; escondida (`display:none !important` fora da aba Trello), a soma volta a bater com o layout de 8 colunas → sem regressão. Se mexer em colunas aqui, reindexe as regras `nth-child`.
- **⚠️ `hidden` vs `display`:** a barra `.cadastro-bulk-bar` tem `display:flex`, que sobrepõe o atributo `hidden` (só `display:none` de baixa especificidade) — precisa da regra `.cadastro-bulk-bar[hidden]{display:none}`.
- **Drop-up mede contra o `.table-wrapper`, não a janela:** o wrapper tem `overflow-x:auto` (→ força `overflow-y:auto`), então é ele quem corta o popover para baixo; medir só `window.innerHeight` deixava o menu cortado com viewport sobrando.
- **Cache-bust:** ao mexer no JS/CSS, bumpar `?v=` dos assets no HTML (padrão `AAAAMMDD-cadastro-alunos-vN`).
