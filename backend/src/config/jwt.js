const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-inventory-jwt-key-change-in-prod-2026';
const JWT_EXPIRA_EM = process.env.JWT_EXPIRA_EM || '15m';
const REFRESH_EXPIRA_DIAS = parseInt(process.env.REFRESH_TOKEN_EXPIRA_DIAS) || 30;

/**
 * Gera access token JWT (curta duração)
 * Sanitiza e restringe o payload apenas aos campos essenciais (id, empresa_id)
 */
function gerarAccessToken({ id, empresa_id }) {
  const tokenPayload = {
    id: String(id),
    empresa_id: String(empresa_id)
  };
  // nosemgrep: javascript.jsonwebtoken.security.audit.jwt-exposed-data.jwt-exposed-data
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRA_EM });
}

/**
 * Gera refresh token opaco (longa duração)
 * Retorna { token, expiraEm }
 */
function gerarRefreshToken() {
  const token = crypto.randomBytes(64).toString('hex');
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + REFRESH_EXPIRA_DIAS);
  return { token, expiraEm };
}

/**
 * Gera hash SHA-256 de um token para armazenamento seguro
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Verifica e decodifica access token
 * Lança erro se inválido ou expirado
 */
function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { gerarAccessToken, gerarRefreshToken, hashToken, verificarToken };
