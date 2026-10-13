# Integracao da pagina Instrutores, API v1

Estado inicial: publicada e validada em producao em 11/10/2026, Hub 85 e INVA 31.
Em 13/10/2026, o escopo autorizado foi ampliado para todas as acoes da pagina
Instrutores, pela API e pelo Hub. Consulte o [registro de publicacao](publicacao-integracao-instrutores.md).
A credencial e entregue separadamente, por arquivo privado.

Esta API permite incorporar os dados da pagina Instrutores ao projeto do
parceiro, cujo backend fica na VPS. O parceiro constroi a propria interface.
O Hub e a API continuam fora da VPS e usam a mesma base de instrutores.

## Escopo

| Operacao | Permitido |
|---|---|
| Consultar | Todos os dados da pagina Instrutores, de voo e de solo, incluindo inativos |
| Cadastrar | Modalidade (`voo` ou `solo`), nome e base (`SJK` ou `CPQ`) |
| Editar | Somente nome e base, identificando o instrutor por ID |
| Executar | Todas as acoes da pagina, usando a lista fechada abaixo |

Modalidade e o grupo voo/solo, definido na criacao. O campo legado `tipo`
(vinculo CLT/Eventual) deriva das etiquetas. A operacao `cadastrar` preserva o
contrato simples de nome/base. Para cadastrar com etiquetas ou saldo inicial,
use `executar` com `add_instructor` ou `add_instructor_solo`.

Ao cadastrar ou mudar de base, o instrutor entra no fim da fila da base
destino, seguindo a regra do Hub. A prioridade pode ser ajustada por `executar`.
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
individual automatica. A liberacao individual depende de etiquetas ou OPR.

## Executar as demais acoes da pagina

A mesma URL e a mesma credencial continuam validas. O backend da VPS deve usar
`operacao: "executar"`, uma `acao` da tabela e um novo `requestId` por operacao.
Na consulta, `data.meta.acessoCompleto` informa se a liberacao esta ativa.
No servidor, a propriedade `INVA_PARCEIRO_ACESSO_COMPLETO=true` habilita essas
acoes; removendo-a, voltam a valer apenas listar/cadastrar/editar.

Exemplo para ajustar as habilitacoes de um instrutor de voo:

```json
{
  "action": "integracao_instrutores_v1",
  "chave": "CREDENCIAL_FORNECIDA_PELA_SAFE",
  "operacao": "executar",
  "acao": "set_instructor_labels",
  "requestId": "UUID_UNICO_DA_OPERACAO",
  "autor": "Eduardo Fields",
  "dados": {
    "instrutorId": "ID_RECEBIDO_NA_CONSULTA",
    "etiquetas": ["ID_ETIQUETA_MC01", "ID_ETIQUETA_IFR"]
  }
}
```

`etiquetas` substitui o conjunto inteiro, portanto envie tambem os IDs que
devem permanecer. Use os IDs reais de `meta.etiquetas` ou `meta.etiquetasSolo`.
Nas acoes por instrutor, prefira `instrutorId`; `nome` atual tambem e aceito.
Na ordenacao, `nomes` e uma lista ordenada de nomes atuais, sem repeticoes,
seguindo o comportamento do Hub, inclusive movimentacao entre bases.

| Acao de voo | Dados aceitos |
|---|---|
| `add_instructor` | `nome`, `base`, `etiquetas` opcional, `saldoInicial` opcional, numero nao negativo |
| `set_instructor_base` | `instrutorId` ou `nome`, `base` |
| `set_instructor_order` | `base`, `nomes` em ordem de prioridade |
| `set_instructor_labels` | `instrutorId` ou `nome`, `etiquetas` com IDs |
| `set_instructor_active` | `instrutorId` ou `nome`, `inativo` booleano, `motivo` opcional |
| `set_instructor_release` | `instrutorId` ou `nome`, `liberado` booleano, `senha` da operacao |
| `add_comment` | `instrutorId` ou `nome`, `texto` |
| `delete_comment` | `id` do comentario |
| `save_label` | `nome`, `cor`, `id` opcional para editar etiqueta existente |
| `delete_label` | `id` da etiqueta |
| `sync_cavok` | objeto vazio `{}`, mesma janela automatica da pagina |

Para solo, acrescente `_solo` ao nome da acao. As excecoes sao
`set_instructor_release` e `sync_cavok`, que so existem para voo. Cadastro de
solo nao aceita saldo inicial. `save_label` usa as cores do catalogo do Hub.
`delete_label` tambem remove a etiqueta dos instrutores que a possuem.
`autor` fica no corpo principal e identifica o usuario informado pelo parceiro.
A exclusao de comentario conserva a regra de autor original. A senha OPR
continua obrigatoria, igual ao Hub, e nao e registrada no recibo.

Resposta: `status`, `apiVersion`, `repetida`, e `data` com o resultado do
handler. Apos sucesso, consulte `listar` para atualizar a interface e a versao.
Em erro de negocio: `status: "error"`, `code: "REGRA_NEGOCIO"` e `message`.
Reenvie o MESMO pedido com o MESMO `requestId` se a resposta se perder.
Nao use esse ID para outra acao ou outros dados.

As novas acoes possuem recibos na aba `INTEGRACAO_INSTRUTORES_REQUESTS`.
Se a execucao interromper depois de reservar o pedido, o reenvio responde
`RESULTADO_INDETERMINADO`, sem executar novamente. Nesse caso, consulte os
dados e confira o resultado antes de gerar outro pedido. A SAFE pode verificar
o recibo. A credencial e a senha OPR nao aparecem nessa aba.

Inativacao preserva historico. Exclusao definitiva de instrutores, alteracao
arbitraria de horas, manutencao e outros modulos continuam fora deste contrato.

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

Os handlers serializam alteracoes. Cadastro e edicao guardam comprovante na
linha e no log; `executar` usa a aba de recibos. Isso impede repetir criacoes
em reenvios. Uma nova acao usa novo UUID.

| Codigo | Tratamento |
|---|---|
| `NAO_AUTORIZADO` | Conferir a credencial ou sua revogacao |
| `INSTALACAO_PENDENTE` | A SAFE precisa inicializar os IDs |
| `CAMPO_PROIBIDO`, `OPERACAO_PROIBIDA` | Corrigir o pedido; nao repetir automaticamente |
| `DADOS_INVALIDOS` | Corrigir nome, base, modalidade ou campos obrigatorios |
| `NOME_DUPLICADO` | Reutilizar o cadastro existente; reativar pela API se necessario |
| `NAO_ENCONTRADO` | Atualizar a lista e conferir o ID |
| `CONFLITO` | Reconsultar antes de tentar nova edicao |
| `REQUEST_ID_REUTILIZADO` | O UUID ja foi usado com outro corpo |
| `ERRO_INTERNO` | Resultado possivelmente indeterminado; repetir com mesmo UUID |
| `RESULTADO_INDETERMINADO` | Conferir o estado antes de gerar outro pedido |
| `REGRA_NEGOCIO` | Conferir `message`; a regra da pagina recusou a acao |

Nomes aceitam ate 120 caracteres, sem virgulas, caracteres de controle ou prefixo
de formula. Use consulta com cache no backend da VPS, por exemplo 60 segundos,
e invalide-o apos gravar. Nao consulte continuamente por segundo. A latencia e
os limites do Apps Script exigem chamadas moderadas.

## Exemplo no backend Node.js da VPS

```js
import { randomUUID } from 'node:crypto';

async function instrutores(operacao, dados, requestId, autor, acao) {
  const body = {
    action: 'integracao_instrutores_v1',
    chave: process.env.SAFE_INSTRUTORES_API_CHAVE,
    operacao,
    ...(acao && { acao }),
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
