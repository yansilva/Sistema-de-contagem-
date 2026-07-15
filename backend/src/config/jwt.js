const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRA_EM = process.env.JWT_EXPIRA_EM || '15m';
const REFRESH_EXPIRA_DIAS = parseInt(process.env.REFRESH_TOKEN_EXPIRA_DIAS) || 30;

/**
 * Gera access token JWT (curta duração)
 */
function gerarAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRA_EM });
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
 * Verifica e decodifica access token
 * Lança erro se inválido ou expirado
 */
function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { gerarAccessToken, gerarRefreshToken, verificarToken };
