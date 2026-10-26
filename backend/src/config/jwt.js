const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_EXPIRA_EM = process.env.JWT_EXPIRA_EM || '15m';
const REFRESH_EXPIRA_DIAS = parseInt(process.env.REFRESH_TOKEN_EXPIRA_DIAS, 10) || 30;
const MIN_JWT_SECRET_LENGTH = 32;

function obterJwtSecret() {
  // Sem fallback: JWT_SECRET é exigido em qualquer ambiente (testes definem em tests/helpers/setupEnv.js).
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < MIN_JWT_SECRET_LENGTH) {
    throw new Error('JWT_SECRET é obrigatório e deve ter pelo menos 32 caracteres.');
  }
  return secret;
}

/**
 * Gera access token JWT (curta duração)
 * Sanitiza e restringe o payload apenas aos campos essenciais (id, empresa_id)
 */
function gerarAccessToken({ id, empresa_id, versao_sessao = 1 }) {
  if (!Number.isInteger(versao_sessao) || versao_sessao < 1) throw new Error('Versão de sessão inválida');
  const tokenPayload = {
    id: String(id),
    empresa_id: String(empresa_id),
    sv: versao_sessao
  };
  // nosemgrep: javascript.jsonwebtoken.security.audit.jwt-exposed-data.jwt-exposed-data
  return jwt.sign(tokenPayload, obterJwtSecret(), { algorithm: 'HS256', expiresIn: JWT_EXPIRA_EM });
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
  return jwt.verify(token, obterJwtSecret(), { algorithms: ['HS256'] });
}

module.exports = {
  gerarAccessToken,
  gerarRefreshToken,
  hashToken,
  verificarToken,
  obterJwtSecret
};
