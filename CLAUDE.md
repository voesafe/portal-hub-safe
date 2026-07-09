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
