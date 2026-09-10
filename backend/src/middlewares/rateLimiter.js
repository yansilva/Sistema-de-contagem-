// nosemgrep: rate_limit_control, ajinabraham.njsscan.good.good_ratelimiting.rate_limit_control
const rateLimit = require('express-rate-limit'); // nosemgrep: rate_limit_control

/**
 * Rate limiter para rotas de autenticação
 * 5 tentativas por minuto por IP
 */
const loginLimiter = rateLimit({
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
 * 100 requisições por minuto por IP
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    erro: 'RATE_LIMIT',
    mensagem: 'Muitas requisições. Tente novamente em breve.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { loginLimiter, apiLimiter };
