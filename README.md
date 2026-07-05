# SAFE Hub

Portal interno da SAFE Escola de Aviação para operação comercial,
financeira e administrativa.

Google Sheets como backend · Google Apps Script como API · GitHub Pages como frontend.

---

## Estrutura do projeto

```text
portal-hub-safe/
├── index.html             # Login
├── inicio.html            # Página inicial e catálogo de módulos
├── dashboard.html         # Dashboard de vendas (KPIs + gráficos)
├── vendas.html            # Listagem e cadastro de vendas
├── faturamento.html       # Faturamento por canal
├── concorrencia.html      # Tabela de concorrência
├── admin.html             # Gestão de usuários
├── bases.html             # Endereços e contatos das bases SAFE
├── controle-gastos.html   # Controle financeiro por base
├── fechamento-horas.html  # Fechamento mensal de horas e cotistas
├── escala-cco.html         # Escala do Centro de Controle de Operações
├── safe-minions.html      # Análise local de extratos SACI (Master TI)
├── acesso-negado.html     # Aviso padronizado para módulos restritos
├── assets/
│   ├── img/logo.png
│   └── safe-minions/      # Imagem, áudio e biblioteca XLSX local
├── css/
│   ├── safe-theme.css
│   ├── layout.css
│   ├── inicio.css
│   ├── controle-gastos.css
│   └── fechamento-horas.css
└── js/
    ├── config.js          # Configuração central (URL do Apps Script)
    ├── auth.js            # Autenticação, sessão, permissões e menu
    ├── api.js             # Comunicação com o backend e cache
    ├── inicio.js
    ├── dashboard.js
    ├── vendas.js
    ├── concorrencia.js
    ├── admin.js
    ├── controle-gastos.js
    └── fechamento-horas.js
```

---

## SETUP — Passo a passo completo

### 1. Configurar o Google Sheets

1. Abra seu Google Sheets de Vendas
2. Anote o **ID da planilha** (na URL: `spreadsheets/d/SEU_ID_AQUI/edit`)

### 2. Configurar o Apps Script

1. No Sheets: **Extensões → Apps Script**
2. Apague o código padrão e crie os seguintes arquivos:

| Arquivo no Apps Script | Conteúdo |
|---|---|
| `Code.gs` | Copie o conteúdo de `apps-script/Code.gs` |
| `Auth.gs` | Copie o conteúdo de `apps-script/Auth.gs` |
| `Vendas.gs` | Copie o conteúdo de `apps-script/Vendas.gs` |
| `Faturamento.gs` | Copie o conteúdo de `apps-script/Faturamento.gs` |
| `Concorrencia.gs` | Copie o conteúdo de `apps-script/Concorrencia.gs` |
| `Bases.gs` | Copie o conteúdo de `apps-script/Bases.gs` |
| `ControleGastos.gs` | Copie o conteúdo de `apps-script/ControleGastos.gs` |
| `FechamentoHoras.gs` | Copie o conteúdo de `apps-script/FechamentoHoras.gs` |
| `Cavok.gs` | Copie o conteúdo de `apps-script/Cavok.gs` |
| `Cco.gs` | Copie o conteúdo de `apps-script/Cco.gs` |
| `AccessControl.gs` | Copie o conteúdo de `apps-script/AccessControl.gs` |
| `Utils.gs` | Copie o conteúdo de `apps-script/Utils.gs` |

3. Em `Utils.gs`, substitua:
   ```js
   var SHEET_ID = 'SEU_SPREADSHEET_ID_AQUI';
   ```
   pelo ID real da sua planilha.

4. Rode a função `inicializarPlanilha()` **uma única vez**:
   - No Apps Script, selecione a função `inicializarPlanilha` no dropdown
   - Clique em **Executar**
   - Autorize as permissões solicitadas
   - Isso cria as abas comerciais necessárias, incluindo `USUARIOS`,
     `VENDAS`, `FATURAMENTO`, `CONCORRENCIA` e `BASES`

5. **Deploy do Apps Script:**
   - Clique em **Implantar → Novo deploy**
   - Tipo: **App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
   - Clique em **Implantar** e copie a URL gerada

### Inicializar o Controle de Gastos

Depois de adicionar `ControleGastos.gs` e atualizar os demais arquivos:

1. Execute `inicializarControleGastos()` uma vez no editor do Apps Script.
2. A função cria as abas `CATEGORIAS_GASTOS`, `GASTOS_MENSAIS` e
   `HORAS_VOADAS_BASE`.
3. Ela importa os dados iniciais de janeiro a junho de 2026 e as horas
   disponíveis de janeiro a abril.
4. Se `elaine.souza@voesafe.com.br` existir em `USUARIOS`, o perfil será
   atualizado para `financeiro`.
5. Publique uma nova versão do App da Web e mantenha a URL em `js/config.js`.
6. Peça para Elaine sair e entrar novamente, para receber o novo perfil e a
   sessão segura do módulo financeiro.

A inicialização é idempotente e pode ser executada novamente sem duplicar os
lançamentos já importados.

### Configurar o Fechamento de Horas

O fechamento usa uma planilha operacional separada da base comercial.

1. Em `apps-script/FechamentoHoras.gs`, configure
   `FECHAMENTO_HORAS_SHEET_ID` com o ID da planilha operacional.
2. Garanta que a conta proprietária do deploy tenha permissão de edição nessa
   planilha.
3. Execute `testarFechamentoHoras()` no editor do Apps Script para validar o
   acesso e autorizar as permissões.
4. Publique uma nova versão do App da Web.

#### Integração direta com a API CAVOK

1. Adicione `apps-script/Cavok.gs` ao projeto do Apps Script do Hub.
2. Confirme que `CAVOK_HORAS_SERVICE_URL` aponta para a implantação do serviço
   de Horas Voadas INVA mantido pelo TI.
3. Publique uma nova versão do App da Web do Hub.
4. Em `js/config.js`, mantenha `CAVOK_FECHAMENTO_API_ENABLED` como `true`.

A importação consulta todos os dias da competência, consolida as horas por
aeronave e aplica as mesmas exclusões de cotistas do arquivo XLS. Os valores
entram somente no rascunho e ainda precisam ser revisados e salvos pelo usuário.

### Atualizações automáticas CAVOK

Os dois projetos Apps Script possuem gatilhos diários para execução por volta
das 05:00 no fuso `America/Sao_Paulo`:

- `atualizarHorasVoadasInvaDiario`: importa os voos do dia anterior para a
  planilha de instrutores;
- `atualizarFechamentoCavokDiario`: recalcula a competência do dia anterior,
  preserva as métricas manuais e não altera meses já fechados.

Execute uma vez `instalarAtualizacaoDiariaInva` no projeto Horas INVA e
`instalarAtualizacaoDiariaFechamentoCavok` no projeto principal do Hub. As
funções removem gatilhos anteriores do mesmo tipo antes de criar o novo.

As abas ocultas `CONTROLE_FECHAMENTO` e `HISTORICO_FECHAMENTO` são criadas
automaticamente. As abas mensais são criadas no primeiro salvamento do período.

O módulo permite acesso a `master`, `admin` e ao usuário financeiro autorizado
`elaine.souza@voesafe.com.br`.

### Configurar a Escala CCO

1. Adicione `apps-script/Cco.gs` ao Apps Script do SAFE Hub.
2. Confirme que `CCO_API_URL` aponta para o deploy atual do backend da Escala.
3. Publique uma nova versão do App da Web do SAFE Hub.

Os usuários da CCO não são duplicados na planilha comercial. O Hub valida
usuário e senha diretamente no backend da Escala e recebe o papel vigente:

- `admin` vira `cco_admin`;
- `financeiro` vira `cco_financeiro`;
- `user` vira `cco_user`.

Esses perfis entram diretamente em `escala-cco.html` e não podem acessar os
demais módulos do Hub. Administradores e Master do Hub também podem abrir a
Escala pelo menu `Escala > Escala CCO`.

O diretório `TI > Usuários`, exclusivo do perfil `master`, agrega os cadastros
do Hub e do CCO. Inclusões e alterações feitas nessa tela são encaminhadas ao
backend de origem, mantendo senhas e regras operacionais em seus sistemas atuais.
O e-mail é a identidade única informada no login. PAC e username permanecem
somente como identificadores internos para vendas e escalas históricas.
Usuários desativados ficam separados na aba `Inativos`; a desativação bloqueia
o acesso sem remover registros comerciais, escalas ou dados de auditoria.

### SAFE MINIONS

O SAFE MINIONS processa arquivos `.xlt`, `.xltx` e `.xlsx` diretamente no
navegador. Os arquivos não são enviados ao Apps Script. O acesso à página é
restrito ao perfil `master`.

### 3. Configurar o frontend

Abra `js/config.js` e substitua:
```js
API_URL: 'SUA_URL_DO_APPS_SCRIPT_AQUI',
```
pela URL copiada no passo anterior.

### 4. Migrar dados históricos (opcional)

Para importar as vendas antigas da planilha Excel para a aba `VENDAS`:

1. Copie os dados das abas mensais (Out/2025 até Mai/2026)
2. Cole na aba `VENDAS` respeitando as colunas:
   `ID | DATA | PAC | NOME_COMPLETO | SEXO | IDADE | CIDADE | ESTADO | ORIGEM_LEAD | CURSO_COMPRADO | EMAIL | VALOR | LEAD_NOVO | QUEM_COMPROU | MES | ANO`
3. Preencha `ID` com qualquer string única (ex: sequência numérica)
4. Preencha `MES` e `ANO` correspondentes à data de cada venda

### 5. Deploy no GitHub Pages

```bash
# Na pasta do projeto
git init
git add .
git commit -m "feat: SAFE Hub v1.0"
git remote add origin https://github.com/SEU_USUARIO/safe-comercial.git
git push -u origin main
```

No GitHub:
- **Settings → Pages → Source: main → / (root)**
- Aguarde ~2 minutos
- Acesse: `https://SEU_USUARIO.github.io/safe-comercial`

---

## Credenciais padrão

| PAC | Senha inicial | Perfil |
|---|---|---|
| Thiago | safe@2024 | Admin |
| Marlon | safe@2024 | Consultor |
| Adauto | safe@2024 | Consultor |

> **Importante:** Altere as senhas no primeiro acesso via **Usuários → Alterar minha senha**.

---

## Perfis de acesso

Todos os módulos aparecem no menu lateral. Opções indisponíveis para o perfil
recebem um cadeado e direcionam para a página de acesso restrito.

| Recurso | Consultor (PAC) | Admin | Financeiro | Master TI |
|---|---|---|---|---|
| Ver próprias vendas | Sim | Sim | Sim | Sim |
| Ver vendas de todos | Não | Sim | Sim | Sim |
| Criar e editar vendas | Sim (próprias) | Sim | Não | Sim |
| Faturamento por canal | Não | Sim | Somente leitura | Sim |
| Concorrência | Não | Sim | Somente leitura | Sim |
| Gestão de usuários | Não | Sim | Somente leitura | Sim |
| Controle de gastos | Não | Não | Edição completa | Edição completa |
| Fechamento de horas e cotistas | Não | Edição completa | Elaine autorizada | Edição completa |
| Escala CCO | Não | Edição completa | Não | Edição completa |
| SAFE MINIONS | Não | Não | Não | Sim |
| Consultar bases e endereços | Sim | Sim | Sim | Sim |
| Editar bases e endereços | Não | Sim | Não | Sim |

O tipo de acesso `Controle de Gastos — somente visualização` é exclusivo:
exibe apenas a página inicial e a Visão Geral do Controle de Gastos. O usuário
não pode acessar outros módulos nem alterar gastos, receitas ou categorias.

Os perfis exclusivos `cco_user`, `cco_financeiro` e `cco_admin` acessam a
Escala CCO, SAFE MINIONS e Bases. O painel Horas Voadas INVA não é exibido nem
liberado para funcionários do CCO. As configurações individuais de privacidade
e visibilidade da escala continuam sendo definidas no sistema de origem.

---

## Personalização

**Adicionar novo PAC:**
1. Acesse `admin.html → Novo Usuário`
2. Preencha nome, PAC (identificador de login), email, perfil
3. Depois, adicione o novo PAC no `<select>` de `index.html` e `vendas.html`

**Alterar cores:** edite as variáveis em `css/safe-theme.css` (seção `:root`)

**Adicionar origem de lead:** edite o array `ORIGENS` em `js/config.js` e o `<select>` em `vendas.html`

---

## Tecnologias

- **Frontend:** HTML5 + CSS3 + JavaScript vanilla
- **Gráficos:** Chart.js 4.4
- **Backend:** Google Apps Script (serverless)
- **Banco de dados:** Google Sheets
- **Hospedagem:** GitHub Pages
- **Fontes:** Raleway + Montserrat (Google Fonts)
