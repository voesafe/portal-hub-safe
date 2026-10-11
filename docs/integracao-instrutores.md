# Integracao da pagina Instrutores, API v1

Estado: implementada e testada localmente. A ativacao em producao depende dos
passos de [publicacao](publicacao-integracao-instrutores.md).

Esta API permite incorporar os dados da pagina Instrutores ao projeto do
parceiro, cujo backend fica na VPS. O parceiro constroi a propria interface.
O Hub e a API continuam fora da VPS e usam a mesma base de instrutores.

## Escopo

| Operacao | Permitido |
|---|---|
| Consultar | Todos os dados da pagina Instrutores, de voo e de solo, incluindo inativos |
| Cadastrar | Modalidade (`voo` ou `solo`), nome e base (`SJK` ou `CPQ`) |
| Editar | Somente nome e base, identificando o instrutor por ID |
| Outras alteracoes | Bloqueadas, incluindo horas, saldo, etiquetas, comentarios, prioridade, OPR e inativacao |

Modalidade e o grupo voo/solo, definido na criacao. O campo legado `tipo`
(vinculo CLT/Eventual) e somente leitura. Cadastro novo nao recebe etiquetas,
saldo inicial ou liberacao operacional. A operacao SAFE continua responsavel
por conceder essas informacoes no Hub.

Ao cadastrar ou mudar de base, o instrutor entra no fim da fila da base
destino, seguindo a regra do Hub. O parceiro nao escolhe a prioridade.
Alterar nome preserva ID, horas e comentarios. Nomes antigos permanecem
reservados para a mesma pessoa, inclusive quando o instrutor esta inativo.
O parceiro nao pode transformar um instrutor de voo em instrutor de solo.

Nenhum endpoint desta API retorna pagamentos, valores de hora, fechamento
financeiro ou outros modulos do Hub.

## Transporte e credencial

Todas as chamadas usam HTTPS e POST com JSON no corpo. A credencial nunca vai
na URL nem no navegador. Guarde `SAFE_INSTRUTORES_API_CHAVE` como segredo no
backend da VPS, sem inclui-la no Git ou nos logs. A SAFE armazena somente seu
hash SHA-256 em `INVA_PARCEIRO_SHA256`, nas Propriedades do Apps Script.
Apagar essa propriedade revoga o acesso. Trocar o hash rotaciona a credencial.
Use uma chave aleatoria de pelo menos 32 caracteres.

Endpoint apos a publicacao:

```text
https://script.google.com/macros/s/AKfycbyThE1-1S77CJFfrSsWVVYak4tu-V37xsXH1VZFckKf1CJulgueWhqpKx70NWg9ifA9/exec
```

O cliente deve seguir redirecionamentos. O Apps Script devolve erros de negocio
em JSON, inclusive com HTTP 200. Confira `status`, `code` e `message`, alem do
status HTTP. A acao de integracao e exclusivamente `integracao_instrutores_v1`.
Nao reutilize as rotas internas do Hub.

## Consultar

```json
{
  "action": "integracao_instrutores_v1",
  "chave": "CREDENCIAL_FORNECIDA_PELA_SAFE",
  "operacao": "listar"
}
```

A resposta tem a forma:

```json
{
  "status": "success",
  "apiVersion": 1,
  "data": {
    "instrutores": [],
    "meta": {
      "bases": ["SJK", "CPQ"],
      "metaHoras": 100,
      "etiquetas": [],
      "etiquetasSolo": [],
      "diretrizEventuais": []
    }
  }
}
```

| Campo por instrutor | Conteudo |
|---|---|
| `id`, `versao` | Identidade estavel e versao opaca usada na edicao |
| `modalidade`, `nome`, `base` | Grupo voo/solo, nome atual e base |
| `nomesAnteriores` | Historico de renomeacoes |
| `etiquetas` | IDs associados ao catalogo da modalidade em `meta` |
| `comentarios` | Lista com ID, autor, data, texto e ISO, quando disponivel |
| `ordem` | Prioridade na base; zero significa sem prioridade definida |
| `inativo`, `inativoEm`, `inativoPor`, `inativoMotivo` | Situacao operacional |
| `tipo`, `totalHoras` | Somente voo: vinculo legado e horas acumuladas como string decimal |
| `liberadoOpr`, `liberadoEm`, `liberadoPor` | Somente voo: liberacao manual pela operacao |
| `flagVerde` | Somente voo: meta de horas atingida ou liberacao OPR |

O grafico de horas pode ser montado a partir de `totalHoras`. Instrutores de
solo nao possuem horas nem liberacao OPR. Para reproduzir a lista, separe por
modalidade/base, filtre `inativo === false` e ordene por `ordem`, deixando zero
no fim. Inativos devem aparecer em uma lista separada. A consulta le o cache
operacional atual; nao executa sincronizacao CAVOK.

`diretrizEventuais` reproduz o texto informativo da pagina. Nao e uma autorizacao
individual automatica e nao permite liberar instrutores pela API.

## Cadastrar

```json
{
  "action": "integracao_instrutores_v1",
  "chave": "CREDENCIAL_FORNECIDA_PELA_SAFE",
  "operacao": "cadastrar",
  "requestId": "UUID_UNICO_DA_OPERACAO",
  "autor": "usuario-no-projeto-parceiro",
  "dados": { "modalidade": "voo", "nome": "Nome do Instrutor", "base": "SJK" }
}
```

Para solo, use `"modalidade": "solo"`. `autor` e opcional, ate 200 caracteres,
e serve como rotulo informado pelo parceiro. Nao e identidade autenticada
individualmente pela SAFE; a credencial identifica o sistema `parceiro-vps`.

## Editar

```json
{
  "action": "integracao_instrutores_v1",
  "chave": "CREDENCIAL_FORNECIDA_PELA_SAFE",
  "operacao": "editar",
  "requestId": "OUTRO_UUID_UNICO",
  "autor": "usuario-no-projeto-parceiro",
  "dados": {
    "id": "ID_RECEBIDO_NA_CONSULTA",
    "versao": "VERSAO_RECEBIDA_NA_CONSULTA",
    "nome": "Nome Atualizado",
    "base": "CPQ"
  }
}
```

Envie nome, base ou ambos. ID e versao sao obrigatorios. Em caso de `CONFLITO`,
consulte novamente, apresente os valores atuais ao usuario e confirme uma nova
edicao com novo `requestId`. Isso evita sobrescrever uma alteracao de outra pessoa.

Cadastro e edicao retornam:

```json
{
  "status": "success",
  "apiVersion": 1,
  "data": { "instrutor": {}, "repetida": false }
}
```

`instrutor` tem os campos completos da consulta. Uma repeticao retorna
`repetida: true` e o cadastro atual, que pode ter mudado desde a primeira resposta.

## Reenvios e falhas

Crie e persista um UUID por acao do usuario, antes de enviar a requisicao.
Em timeout, falha de conexao, resposta ilegivel ou `ERRO_INTERNO`, a gravacao
pode ter acontecido. Reenvie o mesmo corpo com o mesmo `requestId`; nao gere
outro ID automaticamente. Nao repita mudando dados ou autor.

O servidor serializa alteracoes e guarda um comprovante na linha e no log.
Isso impede que um reenvio crie outra pessoa. Uma nova acao usa novo UUID.

| Codigo | Tratamento |
|---|---|
| `NAO_AUTORIZADO` | Conferir a credencial ou sua revogacao |
| `INSTALACAO_PENDENTE` | A SAFE precisa inicializar os IDs |
| `CAMPO_PROIBIDO`, `OPERACAO_PROIBIDA` | Corrigir o pedido; nao repetir automaticamente |
| `DADOS_INVALIDOS` | Corrigir nome, base, modalidade ou campos obrigatorios |
| `NOME_DUPLICADO` | Reutilizar o cadastro existente; inativos exigem acao da SAFE |
| `NAO_ENCONTRADO` | Atualizar a lista e conferir o ID |
| `CONFLITO` | Reconsultar antes de tentar nova edicao |
| `REQUEST_ID_REUTILIZADO` | O UUID ja foi usado com outro corpo |
| `ERRO_INTERNO` | Resultado possivelmente indeterminado; repetir com mesmo UUID |

Nomes aceitam ate 120 caracteres, sem virgulas, caracteres de controle ou prefixo
de formula. Use consulta com cache no backend da VPS, por exemplo 60 segundos,
e invalide-o apos gravar. Nao consulte continuamente por segundo. A latencia e
os limites do Apps Script exigem chamadas moderadas.

## Exemplo no backend Node.js da VPS

```js
import { randomUUID } from 'node:crypto';

async function instrutores(operacao, dados, requestId, autor) {
  const body = {
    action: 'integracao_instrutores_v1',
    chave: process.env.SAFE_INSTRUTORES_API_CHAVE,
    operacao,
    ...(dados && { dados }),
    ...(requestId && { requestId }),
    ...(autor && { autor })
  };
  const resposta = await fetch(process.env.SAFE_INSTRUTORES_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000)
  });
  const json = await resposta.json();
  if (!resposta.ok || json.status !== 'success') {
    const erro = new Error(json.message || 'Resposta inesperada da API');
    erro.code = json.code || 'RESULTADO_INDETERMINADO';
    throw erro;
  }
  return json.data;
}

const lista = await instrutores('listar');
// Guarde este UUID no seu banco/fila antes de enviar e preserve-o em retries.
const requestId = randomUUID();
const cadastro = await instrutores('cadastrar', {
  modalidade: 'solo', nome: 'Nome do Instrutor', base: 'SJK'
}, requestId, 'usuario-logado');
```

Esse exemplo roda no servidor. O navegador do parceiro consulta apenas o backend
dele, que deve validar sua propria sessao e suas permissoes antes de usar a API.

## Testes locais

Na raiz do Hub:

```sh
node --test tools/tests/instrutores-api.test.mjs
node tools/deploy/verificar-gs.mjs apps-script
node tools/deploy/verificar-gs.mjs ../horas-voadas-inva-main/backend
```

Os testes usam Sheets em memoria e nao acessam producao. O checkout do backend
INVA deve estar ao lado do Hub, conforme `tools/deploy/alvos.mjs`.
