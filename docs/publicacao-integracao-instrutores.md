# Ativacao da API de Instrutores

## Publicacao concluida em 11/10/2026

- Hub backend: versao 85, anterior 84.
- INVA backend: versao 31, anterior 30.
- Frontend: publicado no GitHub Pages, JavaScript conferido contra o arquivo local.
- IDs estaveis inicializados nos 25 instrutores de voo e 15 de solo.
- Credencial exclusiva ativa, com somente o hash no servidor.
- 11 cenarios locais e 22 verificacoes em producao aprovados.
- Registros de teste removidos. Os dados dos 40 instrutores existentes foram
  comparados antes/depois e permaneceram intactos.
- Credencial entregue em arquivo privado, separado do pacote tecnico.

A integracao do parceiro na VPS pode consumir a API existente. Os passos abaixo
sao o registro operacional e a referencia para futuras publicacoes.

Esta entrega muda dois repositorios: `portal-hub-safe` e
`../horas-voadas-inva-main`. O novo arquivo `backend/IntegracaoInstrutores.js`
precisa acompanhar `backend/Codigo.js` (nome real com acento). Publicar apenas
o arquivo antigo deixa referencias a funcoes inexistentes e quebra o backend.

## Ordem de publicacao

1. Conferir os diffs dos dois repositorios e passar os testes documentados.
2. Publicar o backend do Hub com `InvaIntegracao.gs`, a rota `autorizar-inva`
   e a compatibilidade interna dos nomes anteriores.
3. Publicar o frontend do Hub com o envio do token de sessao pelo painel
   Instrutores e o novo hash em `horas-voadas-inva.html`. O backend INVA antigo
   ignora esse parametro adicional, mantendo a compatibilidade.
4. Somente depois, publicar o backend INVA completo. Suas rotas legadas de
   escrita agora dependem da nova rota de autorizacao do Hub e do frontend novo.
5. Executar `instalarIntegracaoInstrutores()` no INVA. A funcao e idempotente,
   acrescenta colunas no fim e popula os IDs dos instrutores existentes.
   Nao muda nomes, bases, horas, etiquetas ou situacao.
6. Gerar uma chave aleatoria forte, entregar por canal privado e guardar seu
   hash SHA-256 na propriedade `INVA_PARCEIRO_SHA256`. A API recusa acesso ate
   essa configuracao. Para gerar chave e hash, use um gerenciador de segredos
   ou ferramenta local, sem colocar valores reais no codigo ou historico Git.
7. Guardar a chave no backend da VPS e entregar a documentacao ao parceiro.
8. Conferir em producao consulta autenticada, bloqueio sem chave, cadastro e
   edicao com um registro operacional aprovado, alem das acoes usuais do Hub.

A inicializacao pode ser chamada pela rota administrativa existente:

```sh
node tools/deploy/manutencao.mjs rodar inva instalarIntegracaoInstrutores
```

Esse comando grava IDs reais e so deve rodar na fase de ativacao. A chave do
parceiro nao permite chamar manutencao, sincronizar CAVOK ou usar as rotas
legadas de escrita. Estas exigem token do Hub e permissao
`horas_inva.cadastrar_instrutor` ou `horas_inva.sincronizar_cavok`.

As leituras legadas ja usadas por outros modulos continuam com o contrato
existente. A nova API retorna somente a pagina Instrutores. Esta entrega nao
e uma revisao geral de autenticacao de todos os endpoints do sistema.

O frontend standalone do repositorio INVA e previews antigos nao enviam token
do Hub: suas gravacoes deixam de funcionar apos o passo 4. O fluxo suportado
e a pagina Instrutores dentro do Hub. Quem precisar manter outro cliente deve
integra-lo a uma sessao autorizada antes de publicar.

## Rollback

Registre as versoes do Hub e INVA antes de publicar. Em caso de falha, revogue
primeiro a credencial apagando `INVA_PARCEIRO_SHA256`, sem retirar IDs ou nomes
anteriores da planilha. Evite voltar a um backend anterior que nao reconhece
nomes anteriores apos renomeacoes reais: horas e comentarios poderiam sumir
da visualizacao. Prefira corrigir mantendo a camada de compatibilidade.

As mudancas locais preexistentes em `escala-pav.html` nao fazem parte desta
entrega e devem ser excluidas do commit/publicacao desta integracao.
