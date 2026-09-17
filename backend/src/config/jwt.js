const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_EXPIRA_EM = process.env.JWT_EXPIRA_EM || '15m';
const REFRESH_EXPIRA_DIAS = parseInt(process.env.REFRESH_TOKEN_EXPIRA_DIAS, 10) || 30;
const MIN_JWT_SECRET_LENGTH = 32;

function obterJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.trim().length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        'JWT_SECRET é obrigatório em produção e deve ter pelo menos 32 caracteres.'
      );
    }
    return secret;
  }
  if (secret && secret.length >= MIN_JWT_SECRET_LENGTH) {
    return secret;
  }
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      '[JWT] JWT_SECRET ausente ou curto. Usando chave local de desenvolvimento — nunca use isso em produção.'
    );
  }
  return secret || 'dev-secret-inventory-jwt-key-change-in-prod-2026';
}

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
  return jwt.sign(tokenPayload, obterJwtSecret(), { expiresIn: JWT_EXPIRA_EM });
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
  return jwt.verify(token, obterJwtSecret());
}

module.exports = {
  gerarAccessToken,
  gerarRefreshToken,
  hashToken,
  verificarToken,
  obterJwtSecret
};
