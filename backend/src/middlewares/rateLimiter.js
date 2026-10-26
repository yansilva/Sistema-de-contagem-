// nosemgrep: rules.ajinabraham.njsscan.good.good_ratelimiting.rate_limit_control, ajinabraham.njsscan.good.good_ratelimiting.rate_limit_control, rate_limit_control
// nosem: rules.ajinabraham.njsscan.good.good_ratelimiting.rate_limit_control, ajinabraham.njsscan.good.good_ratelimiting.rate_limit_control, rate_limit_control
const rateLimit = require('express-rate-limit'); // nosemgrep // nosem

const isTest = process.env.NODE_ENV === 'test';

/**
 * Rate limiter para rotas de autenticação
 * 5 tentativas por minuto por IP em produção
 */
const loginLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000, // 1 minuto
      max: 5,
      message: {
        erro: 'RATE_LIMIT',
        mensagem: 'Muitas tentativas. Tente novamente em 1 minuto.'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

/**
 * Rate limiter geral para API
 * 100 requisições por minuto por IP em produção
 */
const apiLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      message: {
        erro: 'RATE_LIMIT',
        mensagem: 'Muitas requisições. Tente novamente em breve.'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

const recoveryLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 10,
      message: { success: false, code: 'RATE_LIMIT', message: 'Muitas tentativas de recuperação.' },
      standardHeaders: true,
      legacyHeaders: false
    });

// ===== Limite de falhas de login por e-mail (complementa o limite por IP) =====
// TODO: o contador vive em memória do processo; em ambiente serverless/multi-instância cada
// instância tem o seu. Migrar para um store compartilhado (Postgres/Redis) quando houver.
const LOGIN_EMAIL_MAX_FALHAS = 10;
const LOGIN_EMAIL_JANELA_MS = 15 * 60 * 1000;
const LOGIN_EMAIL_MAX_CHAVES = 10000;
const falhasLoginPorEmail = new Map();

function chaveEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function falhasRecentes(email) {
  const chave = chaveEmail(email);
  const agora = Date.now();
  const lista = (falhasLoginPorEmail.get(chave) || []).filter((t) => agora - t < LOGIN_EMAIL_JANELA_MS);
  if (lista.length > 0) falhasLoginPorEmail.set(chave, lista);
  else falhasLoginPorEmail.delete(chave);
  return lista;
}

function registrarFalhaLogin(email) {
  const chave = chaveEmail(email);
  if (!chave) return;
  if (!falhasLoginPorEmail.has(chave) && falhasLoginPorEmail.size >= LOGIN_EMAIL_MAX_CHAVES) {
    // Evita crescimento ilimitado: descarta a chave mais antiga.
    falhasLoginPorEmail.delete(falhasLoginPorEmail.keys().next().value);
  }
  const lista = falhasRecentes(chave);
  lista.push(Date.now());
  falhasLoginPorEmail.set(chave, lista);
}

function limparFalhasLogin(email) {
  falhasLoginPorEmail.delete(chaveEmail(email));
}

function resetarFalhasLogin() {
  falhasLoginPorEmail.clear();
}

/**
 * Bloqueia o login quando a conta (e-mail) acumulou falhas demais na janela.
 * Deve rodar depois do validate(loginSchema), que normaliza o e-mail.
 */
function loginEmailLimiter(req, res, next) {
  const email = req.body && req.body.email;
  if (email && falhasRecentes(email).length >= LOGIN_EMAIL_MAX_FALHAS) {
    res.setHeader('Retry-After', String(Math.ceil(LOGIN_EMAIL_JANELA_MS / 1000)));
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_CONTA',
      message: 'Muitas tentativas de acesso para esta conta. Tente novamente em alguns minutos.'
    });
  }
  next();
}

module.exports = {
  loginLimiter,
  apiLimiter,
  recoveryLimiter,
  loginEmailLimiter,
  registrarFalhaLogin,
  limparFalhasLogin,
  resetarFalhasLogin
};
