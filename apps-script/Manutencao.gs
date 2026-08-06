// ============================================================
// Manutencao.gs: Rodar manutencao sem clique no editor.
//
// PROBLEMA QUE ISTO RESOLVE
// `clasp run` nao funciona neste projeto: o clasp esta logado com o
// OAuth client fornecido pelo Google, e `run` exige client proprio de
// um projeto GCP padrao. Trocar o projeto GCP dos scripts invalida a
// autorizacao existente e PARARIA os gatilhos (NOTAM de hora em hora,
// aniversarios, sincronia do INVA) ate alguem reautorizar cada um.
// Nao vale o risco so para rodar `instalarTrigger`.
//
// Entao o caminho e por onde o backend ja atende: o proprio web app.
// Esta rota recebe o nome de uma funcao de manutencao, confere um
// token forte e executa. E o que tirou da frente os "passos humanos"
// que sobravam em toda entrega: instalar gatilho, gravar propriedade
// de script, reconciliar grupos de acesso.
//
// LIMITES, DE PROPOSITO
//   - Lista FECHADA de funcoes (MANUTENCAO_FUNCOES). A rota nao chama
//     qualquer coisa que exista no projeto: um `eval` remoto atras de
//     um web app anonimo seria outra categoria de risco.
//   - Token so em Propriedade do script, nunca no codigo (este repo e
//     publico no GitHub Pages).
//   - Sem token configurado, TUDO e recusado. Backend aberto ao
//     anonimo nao pode ficar permissivo por esquecimento, que e a
//     mesma regra do `verificarSenhaOprInva_`.
//   - Toda execucao avisa o dono por e-mail quando muda estado
//     (bootstrap, rotacao de token, gravacao de propriedade).
// ============================================================

var MANUTENCAO_PROP_TOKEN = 'MANUTENCAO_TOKEN';
var MANUTENCAO_TAMANHO_MINIMO_TOKEN = 32;

/**
 * Lista fechada do que a rota aceita executar, com a descricao que a
 * propria rota devolve em `manutencao.catalogo`. Manter a descricao
 * aqui e o que permite descobrir o que da para rodar sem abrir o
 * codigo de novo.
 */
var MANUTENCAO_FUNCOES = {
  // ── NOTAMs ────────────────────────────────────────────────
  notamsInstalarTrigger:   'Instala o gatilho de hora em hora dos NOTAMs.',
  notamsRemoverTrigger:    'Remove o gatilho dos NOTAMs.',
  atualizarNotamsAisweb:   'Busca os NOTAMs no DECEA agora e regrava o cache.',
  notamsSelfTest:          'Testa o parser de NOTAM com XML de exemplo, sem rede.',
  notamsDebugRaw:          'Mostra o XML cru da AISWEB. Argumento: ICAO (ex.: "SBSJ").',

  // ── ROTAER (horario das bases) ────────────────────────────
  rotaerInstalarTrigger:   'Instala o gatilho diario do horario das bases.',
  rotaerRemoverTrigger:    'Remove o gatilho do ROTAER.',
  atualizarHorariosRotaer: 'Coleta o horario de funcionamento das bases agora.',
  rotaerDebugRaw:          'Mostra o XML cru do ROTAER. Argumento: ICAO.',
  rotaerDiagnostico:       'Relata o que o parser leu do ROTAER, com as notas.',
  rotaerSelfTest:          'Testa o parser do ROTAER sem chave e sem rede.',

  // ── Aniversarios ──────────────────────────────────────────
  aniversariosInstalarTrigger: 'Instala o gatilho diario do e-mail de aniversario.',
  aniversariosRemoverTrigger:  'Remove o gatilho de aniversarios.',
  aniversariosPrevia:          'Quem receberia hoje, sem enviar nada.',
  aniversariosDiagnostico:     'Cobertura da base, cota de e-mail e estado do gatilho.',
  aniversariosSelfTest:        'Manda o e-mail so para um endereco. Argumento: e-mail.',

  // ── Controle de acesso ────────────────────────────────────
  // ⚠️ Este era o "passo humano" documentado como "abrir o Controle de
  // Acesso em producao uma vez". `sincronizarGruposPadrao_` nao roda no
  // login: roda ao abrir aquela tela e nos criar/atualizar usuario. Sem
  // ele, permissao nova no catalogo nunca chega aos cargos.
  sincronizarGruposPadrao_: 'Reconcilia os cargos padrao com o catalogo de permissoes.',

  // ── Portal do Aluno ───────────────────────────────────────
  portalInstalar:           'Cria as abas do Portal do Aluno e semeia os 3 pacotes. Idempotente.',
  portalSincronizarCursos:  'Traz os cursos da Zenler para a planilha, sem apagar a curadoria.',
  portalDiagnostico:        'So le. Confere se os cursos dos pacotes existem e estao ativos.',
  portalAplicarAvulsos:     'ESCREVE. Reescreve a curadoria: so a lista oficial fica ativa.',
  sincronizarMatriculasPortal:   'ESCREVE o cache. Varre a Zenler e regrava quem esta em que curso.',
  portalInstalarTriggerMatriculas: 'Instala o gatilho diario (04h) da sincronia de matriculas.',
  portalRemoverTriggerMatriculas:  'Remove o gatilho da sincronia de matriculas.',

};

// ── Token ───────────────────────────────────────────────────

function manutencaoTokenGravado_() {
  return PropertiesService.getScriptProperties().getProperty(MANUTENCAO_PROP_TOKEN) || '';
}

/**
 * Comparacao sem saida antecipada. A latencia do Apps Script torna
 * ataque de tempo irreal aqui, mas escrever certo custa tres linhas.
 */
function manutencaoTokensIguais_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  var dif = 0;
  for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function manutencaoDono_() {
  try {
    return Session.getEffectiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

/**
 * Avisa o dono do script quando algo muda de estado por esta rota.
 * ⚠️ Isto e o que torna a janela do bootstrap aceitavel: se alguem
 * alem de nos tomar o token, o Victor descobre no mesmo minuto e
 * rotaciona, em vez de o acesso ficar aberto em silencio.
 */
function manutencaoAvisar_(assunto, corpo) {
  try {
    var para = manutencaoDono_();
    if (!para) return;
    MailApp.sendEmail({
      to: para,
      subject: '[SAFE Hub] Manutencao: ' + assunto,
      body: corpo + '\n\nSe nao foi voce, rotacione o token agora.',
      name: 'SAFE Hub',
    });
  } catch (e) {
    // Aviso e rede de seguranca, nao pode derrubar a operacao.
  }
}

// ── Acoes internas da propria rota ──────────────────────────

function manutencaoCatalogo_() {
  var lista = [];
  for (var nome in MANUTENCAO_FUNCOES) {
    if (!MANUTENCAO_FUNCOES.hasOwnProperty(nome)) continue;
    lista.push({
      funcao: nome,
      descricao: MANUTENCAO_FUNCOES[nome],
      existe: typeof globalThis[nome] === 'function',
    });
  }
  return { funcoes: lista, dono: manutencaoDono_() };
}

function manutencaoMascarar_(valor) {
  var s = String(valor == null ? '' : valor);
  if (!s) return '(vazio)';
  return s.slice(0, 3) + '…' + s.slice(-2) + ' (' + s.length + ' caracteres)';
}

function manutencaoListarPropriedades_(dados) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var revelar = String((dados && dados.revelar) || '');
  var fora = {};
  for (var k in props) {
    if (!props.hasOwnProperty(k)) continue;
    // ⚠️ As sessoes vivem em Propriedade tambem e sao centenas.
    // Listar todas afogaria a resposta e exporia token de sessao.
    if (k.indexOf('SAFE_SESSION_') === 0) continue;
    fora[k] = k === revelar ? props[k] : manutencaoMascarar_(props[k]);
  }
  return { propriedades: fora, sessoesOmitidas: true };
}

function manutencaoDefinirPropriedade_(dados) {
  // ⚠️ A propriedade alvo vem em `propriedade`, NUNCA em `chave`:
  // `chave` ja carrega o token da rota. Reusar aquele campo faria a
  // gravacao criar uma propriedade com o nome do proprio token, ou
  // pior, sobrescrever o token com um valor qualquer.
  var alvoProp = String((dados && dados.propriedade) || '').trim();
  var valor = dados && dados.valor;
  if (!alvoProp) throw new Error('Informe a propriedade em "propriedade".');
  if (alvoProp === MANUTENCAO_PROP_TOKEN) {
    throw new Error('Use a acao "rotacionar-token" para trocar o token da manutencao.');
  }
  if (alvoProp.indexOf('SAFE_SESSION_') === 0) {
    throw new Error('Nao mexa em sessao por aqui.');
  }
  var props = PropertiesService.getScriptProperties();
  var tinha = props.getProperty(alvoProp) !== null;
  if (valor === null || valor === undefined || valor === '') {
    props.deleteProperty(alvoProp);
    manutencaoAvisar_('propriedade apagada', 'Chave: ' + alvoProp);
    return { chave: alvoProp, acao: 'apagada' };
  }
  props.setProperty(alvoProp, String(valor));
  manutencaoAvisar_(
    'propriedade gravada',
    'Chave: ' + alvoProp + '\nValor: ' + manutencaoMascarar_(valor)
  );
  return { chave: alvoProp, acao: tinha ? 'atualizada' : 'criada' };
}

function manutencaoListarGatilhos_() {
  return ScriptApp.getProjectTriggers().map(function (t) {
    return {
      funcao: t.getHandlerFunction(),
      tipo: String(t.getEventType()),
      id: t.getUniqueId(),
    };
  });
}

function manutencaoRotacionarToken_(dados) {
  var novo = String((dados && dados.novoToken) || '');
  if (novo.length < MANUTENCAO_TAMANHO_MINIMO_TOKEN) {
    throw new Error('O token novo precisa de ao menos ' + MANUTENCAO_TAMANHO_MINIMO_TOKEN + ' caracteres.');
  }
  PropertiesService.getScriptProperties().setProperty(MANUTENCAO_PROP_TOKEN, novo);
  manutencaoAvisar_('token rotacionado', 'O token da rota de manutencao foi trocado.');
  return { ok: true };
}

// ── Ponto de entrada da rota ────────────────────────────────

/**
 * Chamado pelo doPost em `case 'manutencao'`.
 * Corpo esperado: { action: 'manutencao', dados: { chave, op, funcao, args } }
 */
function manutencaoExecutar(dados) {
  dados = dados || {};
  var enviado = String(dados.chave || '');
  var gravado = manutencaoTokenGravado_();
  var op = String(dados.op || 'chamar');

  // Bootstrap: so passa enquanto NAO existe token. Depois disso a
  // porta fica fechada para sempre, e trocar exige o token atual.
  if (op === 'bootstrap') {
    if (gravado) throw new Error('O token da manutencao ja existe. Use "rotacionar-token".');
    if (enviado.length < MANUTENCAO_TAMANHO_MINIMO_TOKEN) {
      throw new Error('O token precisa de ao menos ' + MANUTENCAO_TAMANHO_MINIMO_TOKEN + ' caracteres.');
    }
    PropertiesService.getScriptProperties().setProperty(MANUTENCAO_PROP_TOKEN, enviado);
    manutencaoAvisar_(
      'token criado',
      'A rota de manutencao foi ativada e ganhou o primeiro token.'
    );
    return { bootstrap: true };
  }

  if (!gravado) {
    throw new Error('Manutencao desativada: nao ha token configurado neste projeto.');
  }
  if (!manutencaoTokensIguais_(enviado, gravado)) {
    console.warn('Manutencao: token recusado.');
    throw new Error('Token de manutencao invalido.');
  }

  switch (op) {
    case 'catalogo':            return manutencaoCatalogo_();
    case 'propriedades':        return manutencaoListarPropriedades_(dados);
    case 'definir-propriedade': return manutencaoDefinirPropriedade_(dados);
    case 'gatilhos':            return manutencaoListarGatilhos_();
    case 'rotacionar-token':    return manutencaoRotacionarToken_(dados);
    case 'chamar':              break;
    default: throw new Error('Operacao de manutencao desconhecida: ' + op);
  }

  var nome = String(dados.funcao || '');
  if (!MANUTENCAO_FUNCOES.hasOwnProperty(nome)) {
    throw new Error(
      'Funcao fora da lista de manutencao: "' + nome + '". ' +
      'Para liberar, acrescente em MANUTENCAO_FUNCOES no Manutencao.gs.'
    );
  }
  var fn = globalThis[nome];
  if (typeof fn !== 'function') {
    throw new Error('A funcao "' + nome + '" esta na lista mas nao existe no projeto.');
  }

  var args = Array.isArray(dados.args) ? dados.args : [];
  var inicio = Date.now();
  var retorno = fn.apply(null, args);

  return {
    funcao: nome,
    args: args,
    duracaoMs: Date.now() - inicio,
    // ⚠️ Serializa aqui dentro. Funcao de manutencao pode devolver
    // objeto do Apps Script (Sheet, Trigger) que o JSON.stringify do
    // roteador nao daria conta, e a resposta viraria erro opaco
    // DEPOIS de a funcao ja ter rodado e mudado estado.
    retorno: manutencaoSerializar_(retorno),
  };
}

function manutencaoSerializar_(v) {
  try {
    return JSON.parse(JSON.stringify(v === undefined ? null : v));
  } catch (e) {
    return String(v);
  }
}
