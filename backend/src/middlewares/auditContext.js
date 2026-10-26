const crypto = require('crypto');

/**
 * Middleware para coletar e sanitizar o contexto de auditoria da requisição HTTP
 * Gera request_id e operacao_id imutáveis e captura IP / User-Agent com segurança.
 */
function auditContext(req, res, next) {
  // 1. request_id e operacao_id únicos
  const requestId = crypto.randomUUID();
  // X-Operation-Id enviado pelo cliente é ignorado: o ID de operação é sempre gerado no servidor,
  // senão um cliente poderia forjar/colidir identificadores de rastreabilidade da auditoria.
  const operacaoId = crypto.randomUUID();

  // 2. IP observado: req.ip respeita o 'trust proxy' configurado em app.js (Vercel/TRUST_PROXY),
  // então X-Forwarded-For só vale quando o proxy é confiável.
  let ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  // Normalizar IPv6 loopback para IPv4 se local
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }

  // 3. User-Agent sanitizado (máximo 512 chars, sem controles)
  const rawUa = req.headers['user-agent'] || 'Desconhecido';
  const sanitizedUa = rawUa
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // remove caracteres de controle ASCII
    .slice(0, 512);

  // Anexar aos objetos req e res (para rastreabilidade de ponta a ponta)
  req.requestId = requestId;
  req.operacaoId = operacaoId;
  res.setHeader('X-Request-Id', requestId);

  req.auditContext = {
    ip,
    userAgent: sanitizedUa,
    requestId,
    operacaoId
  };

  next();
}

module.exports = auditContext;
