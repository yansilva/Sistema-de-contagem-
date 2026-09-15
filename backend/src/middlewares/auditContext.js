const crypto = require('crypto');

/**
 * Middleware para coletar e sanitizar o contexto de auditoria da requisição HTTP
 * Gera request_id e operacao_id imutáveis e captura IP / User-Agent com segurança.
 */
function auditContext(req, res, next) {
  // 1. request_id e operacao_id únicos
  const requestId = crypto.randomUUID();
  const operacaoId = req.headers['x-operation-id'] && isValidUuid(req.headers['x-operation-id'])
    ? req.headers['x-operation-id']
    : crypto.randomUUID();

  // 2. Extração segura de IP observado
  // Só confia em headers de proxy se explicitamente habilitado via TRUST_PROXY
  let ip = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  if (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-for']) {
    const forwarded = req.headers['x-forwarded-for'].split(',')[0].trim();
    if (forwarded) ip = forwarded;
  }
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

function isValidUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

module.exports = auditContext;
