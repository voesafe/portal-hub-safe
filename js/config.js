// ============================================================
// config.js — Configuração central
// SAFE Hub
// ============================================================

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxpOGXgEJ5qBl46iy0JIoli9Ugl8O5-cS-iSxeeLEjsnnB0Pl50fGxSV3H2_DVNie6FsQ/exec',
  HORAS_VOADAS_INVA_API_URL: 'https://script.google.com/macros/s/AKfycbyThE1-1S77CJFfrSsWVVYak4tu-V37xsXH1VZFckKf1CJulgueWhqpKx70NWg9ifA9/exec',
  CADASTRO_ALUNOS_API_URL: 'CADASTRO_ALUNOS_API_URL_AQUI',
  CAVOK_FECHAMENTO_API_ENABLED: true,

  APP_NAME:    'SAFE Hub',
  APP_VERSION: '2026.07.09-rbac-enforcement-v2',
  // Trocar SESSION_VERSION invalida TODAS as sessões salvas no navegador,
  // forçando novo login (necessário para recarregar as permissões efetivas).
  SESSION_VERSION: '2026.07.24-aniversarios-v1',
  API_TIMEOUT_MS: 30000,

  MESES: [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril',
    'Maio', 'Junho', 'Julho', 'Agosto',
    'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ],

  ESTADOS: [
    'AC','AL','AP','AM','BA','CE','DF','ES','GO',
    'MA','MT','MS','MG','PA','PB','PR','PE','PI',
    'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ],

  ORIGENS: [
    'Instagram', 'Google', 'Site', 'Facebook',
    'Indicação', 'Aluno Interno', 'YouTube',
    'WhatsApp', 'Outros'
  ],

  CURSOS: [
    'Adaptação de Instrutor Externo',
    'Aperfeiçoamento Contínuo',
    'Curriculo de Solo',
    'INVA Prático',
    'INVA Teórico',
    'Piloto Comercial/IFR MLTE',
    'Piloto Comercial/IFR Prático',
    'Piloto Comercial Teórico',
    'Piloto Privado Prático',
    'Piloto Privado Teórico',
    'PLA AZUL',
    'SAFE Pilot Academy',
    'SIMULADOR AATD',
    'SIMULADOR PCATD'
  ],

  CANAIS_FATURAMENTO: [
    'Lojinha', 'Safe Academy', 'Azul Pontos',
    'Lito Academy', 'Vendas Comercial'
  ],

  SESSION_KEY: 'safe_session'
};

CONFIG.ANO_ATUAL = new Date().getFullYear();
CONFIG.MES_ATUAL = new Date().getMonth() + 1;
