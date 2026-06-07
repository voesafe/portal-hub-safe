// ============================================================
// admin-cli.js — Administração de usuários pelo terminal
// SAFE Hub
//
// USO:
//   node admin-cli.js listar
//   node admin-cli.js adicionar
//   node admin-cli.js senha <pac>
//   node admin-cli.js remover <pac>
//   node admin-cli.js resetar <pac> <nova_senha>
// ============================================================

const https   = require('https');
const http    = require('http');
const readline = require('readline');
const crypto  = require('crypto');

// ── Configuração ─────────────────────────────────────────────
// Cole aqui a mesma URL do Apps Script que está no config.js
const API_URL = 'SUA_URL_DO_APPS_SCRIPT_AQUI';

// Credenciais de admin para autenticar as chamadas
const ADMIN_PAC    = 'Thiago';
const ADMIN_SENHA  = 'safe@2024'; // atualize se já alterou

// ─────────────────────────────────────────────────────────────

let rl = null;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

function pergunta(msg) {
  return new Promise(resolve => getRl().question(msg, resolve));
}

function hashSenha(senha) {
  return crypto.createHash('sha256').update(senha, 'utf8').digest('hex');
}

// Faz requisição GET seguindo redirects automaticamente
function fazerGet(urlStr, tentativas) {
  tentativas = tentativas || 0;
  return new Promise((resolve, reject) => {
    if (tentativas > 5) { reject(new Error('Muitos redirects')); return; }
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    lib.get(urlStr, { headers: { 'User-Agent': 'safe-cli/1.0' } }, res => {
      // Segue redirect
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
        resolve(fazerGet(res.headers.location, tentativas + 1));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta inválida: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

// Faz requisição POST seguindo redirect com GET (padrão Apps Script)
function fazerPost(urlStr, body, tentativas) {
  tentativas = tentativas || 0;
  return new Promise((resolve, reject) => {
    if (tentativas > 5) { reject(new Error('Muitos redirects')); return; }
    const url     = new URL(urlStr);
    const lib     = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers: {
        'Content-Type':   'text/plain',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'safe-cli/1.0'
      }
    };
    const req = lib.request(options, res => {
      // Apps Script redireciona POST → GET na URL final
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
        if (res.statusCode === 307 || res.statusCode === 308) {
          resolve(fazerPost(res.headers.location, body, tentativas + 1));
        } else {
          resolve(fazerGet(res.headers.location, tentativas + 1));
        }
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta inválida: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function apiPost(action, dados) {
  const body = JSON.stringify({
    action,
    dados,
    pac:    ADMIN_PAC,
    perfil: 'admin'
  });
  return fazerPost(API_URL, body);
}

function apiGet(action, params) {
  params = params || {};
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('pac', ADMIN_PAC);
  url.searchParams.set('perfil', 'admin');
  Object.entries(params).forEach(function(kv) { url.searchParams.set(kv[0], kv[1]); });
  return fazerGet(url.toString());
}

// ── Cores no terminal ────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

function ok(msg)   { console.log(`${c.green}✓${c.reset} ${msg}`); }
function erro(msg) { console.log(`${c.red}✗${c.reset} ${msg}`); }
function info(msg) { console.log(`${c.blue}→${c.reset} ${msg}`); }
function titulo(msg) { console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}\n`); }

function labelPerfil(perfil) {
  if (perfil === 'master') return 'Master TI';
  if (perfil === 'admin') return 'Admin';
  if (perfil === 'admin_readonly' || perfil === 'admin_visualizacao') return 'Admin leitura';
  return 'Consultor';
}

// ── Comandos ─────────────────────────────────────────────────

async function cmdListar() {
  titulo('Usuários cadastrados');
  info('Consultando...\n');

  const res = await apiGet('usuarios');
  if (!res.ok) { erro(res.error); return; }

  const usuarios = res.data;
  if (!usuarios.length) { console.log('Nenhum usuário.'); return; }

  const linha = '─'.repeat(70);
  console.log(linha);
  console.log(
    c.bold +
    'NOME'.padEnd(18) +
    'PAC'.padEnd(14) +
    'PERFIL'.padEnd(14) +
    'STATUS'.padEnd(10) +
    'E-MAIL' +
    c.reset
  );
  console.log(linha);

  usuarios.forEach(u => {
    const perfil = labelPerfil(u.perfil);
    const status = u.ativo
      ? c.green + 'Ativo' + c.reset
      : c.red   + 'Inativo' + c.reset;

    console.log(
      u.nome.padEnd(18).substring(0,18) +
      u.pac.padEnd(14).substring(0,14) +
      perfil.padEnd(14).substring(0,14) +
      (u.ativo ? 'Ativo     ' : 'Inativo   ').padEnd(10) +
      (u.email || '—')
    );
  });
  console.log(linha);
  console.log(c.gray + `Total: ${usuarios.length} usuário(s)` + c.reset);
}

async function cmdAdicionar() {
  titulo('Adicionar novo usuário');

  const nome   = await pergunta('Nome completo: ');
  const pac    = await pergunta('PAC (identificador de login, sem espaços): ');
  const email  = await pergunta('E-mail (opcional, Enter para pular): ');
  info('Dica: digite 4 no perfil para criar um acesso Master TI.');
  const perfil = await pergunta('Perfil — 1 Consultor, 2 Admin completo, 3 Admin somente leitura [1]: ');
  const senha  = await pergunta('Senha inicial (Enter para usar "safe@2024"): ');

  if (!nome.trim() || !pac.trim()) {
    erro('Nome e PAC são obrigatórios.');
    return;
  }

  const dados = {
    nome:   nome.trim(),
    pac:    pac.trim(),
    email:  email.trim() || '',
    perfil: perfil.trim() === '2' ? 'admin' : (perfil.trim() === '3' ? 'admin_readonly' : (perfil.trim() === '4' ? 'master' : 'pac')),
    senha:  senha.trim() || 'safe@2024'
  };

  info(`Criando usuário "${dados.nome}" (${dados.pac})...`);
  const res = await apiPost('criar-usuario', dados);

  if (res.ok) {
    ok(`Usuário "${dados.nome}" criado com sucesso!`);
    console.log(c.gray + `  Senha inicial: ${senha.trim() || 'safe@2024'}` + c.reset);
    console.log(c.gray + '  O usuário aparecerá automaticamente no login após atualizar o Apps Script.' + c.reset);
  } else {
    erro(res.error || 'Erro ao criar usuário.');
  }
}

async function cmdSenha(pac) {
  if (!pac) {
    pac = await pergunta('PAC do usuário: ');
  }
  titulo(`Alterar senha — ${pac}`);

  const nova     = await pergunta('Nova senha: ');
  const confirma = await pergunta('Confirmar senha: ');

  if (nova !== confirma) { erro('As senhas não coincidem.'); return; }
  if (nova.length < 6)   { erro('Senha deve ter pelo menos 6 caracteres.'); return; }

  // Busca o ID do usuário
  const listaRes = await apiGet('usuarios');
  if (!listaRes.ok) { erro(listaRes.error); return; }

  const usuario = listaRes.data.find(u =>
    u.pac.toLowerCase() === pac.trim().toLowerCase()
  );
  if (!usuario) { erro(`PAC "${pac}" não encontrado.`); return; }

  info(`Alterando senha de "${usuario.nome}"...`);
  const res = await apiPost('editar-usuario', {
    id:    usuario.id,
    senha: nova
  });

  if (res.ok) ok(`Senha de "${usuario.nome}" alterada com sucesso!`);
  else        erro(res.error || 'Erro ao alterar senha.');
}

async function cmdResetar(pac, novaSenha) {
  if (!pac || !novaSenha) {
    erro('Uso: node admin-cli.js resetar <pac> <nova_senha>');
    erro('Exemplo: node admin-cli.js resetar Marlon minhasenha123');
    return;
  }

  const listaRes = await apiGet('usuarios');
  if (!listaRes.ok) { erro(listaRes.error); return; }

  const usuario = listaRes.data.find(u =>
    u.pac.toLowerCase() === pac.toLowerCase()
  );
  if (!usuario) { erro(`PAC "${pac}" não encontrado.`); return; }

  info(`Resetando senha de "${usuario.nome}"...`);
  const res = await apiPost('editar-usuario', {
    id:    usuario.id,
    senha: novaSenha
  });

  if (res.ok) ok(`Senha de "${usuario.nome}" resetada para: ${novaSenha}`);
  else        erro(res.error || 'Erro ao resetar senha.');
}

async function cmdRemover(pac) {
  if (!pac) {
    pac = await pergunta('PAC do usuário a remover: ');
  }

  const listaRes = await apiGet('usuarios');
  if (!listaRes.ok) { erro(listaRes.error); return; }

  const usuario = listaRes.data.find(u =>
    u.pac.toLowerCase() === pac.trim().toLowerCase()
  );
  if (!usuario) { erro(`PAC "${pac}" não encontrado.`); return; }

  titulo(`Remover usuário — ${usuario.nome}`);
  console.log(`${c.yellow}Atenção:${c.reset} isso vai ${c.bold}desativar${c.reset} o acesso de "${usuario.nome}".`);
  console.log(`As vendas registradas por ele continuam na base.\n`);

  const confirma = await pergunta(`Digite o PAC "${usuario.pac}" para confirmar: `);
  if (confirma.trim() !== usuario.pac) {
    erro('Confirmação incorreta. Operação cancelada.');
    return;
  }

  info(`Desativando "${usuario.nome}"...`);
  const res = await apiPost('editar-usuario', {
    id:    usuario.id,
    ativo: false
  });

  if (res.ok) ok(`Usuário "${usuario.nome}" desativado. Não conseguirá mais fazer login.`);
  else        erro(res.error || 'Erro ao remover usuário.');
}

function ajuda() {
  titulo('SAFE Hub — Admin CLI');
  console.log(`${c.bold}Comandos disponíveis:${c.reset}\n`);
  console.log(`  ${c.cyan}node admin-cli.js listar${c.reset}`);
  console.log(`  ${c.gray}  Lista todos os usuários cadastrados${c.reset}\n`);
  console.log(`  ${c.cyan}node admin-cli.js adicionar${c.reset}`);
  console.log(`  ${c.gray}  Adiciona novo usuário (modo interativo)${c.reset}\n`);
  console.log(`  ${c.cyan}node admin-cli.js senha <pac>${c.reset}`);
  console.log(`  ${c.gray}  Altera senha de um usuário (modo interativo)${c.reset}\n`);
  console.log(`  ${c.cyan}node admin-cli.js resetar <pac> <nova_senha>${c.reset}`);
  console.log(`  ${c.gray}  Reseta senha diretamente (sem interação)${c.reset}\n`);
  console.log(`  ${c.cyan}node admin-cli.js remover <pac>${c.reset}`);
  console.log(`  ${c.gray}  Desativa acesso de um usuário${c.reset}\n`);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const [,, cmd, arg1, arg2] = process.argv;

  try {
    switch ((cmd || '').toLowerCase()) {
      case 'listar':    await cmdListar();            break;
      case 'adicionar': await cmdAdicionar();         break;
      case 'senha':     await cmdSenha(arg1);         break;
      case 'resetar':   await cmdResetar(arg1, arg2); break;
      case 'remover':   await cmdRemover(arg1);       break;
      default:          ajuda();
    }
  } catch (err) {
    erro('Erro inesperado: ' + err.message);
    console.log(c.gray + 'Verifique se a API_URL está correta no topo do arquivo.' + c.reset);
  }

  if (rl) rl.close();
  process.exit(0);
}

main();
