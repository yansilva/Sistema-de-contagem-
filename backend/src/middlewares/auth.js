const { verificarToken } = require('../config/jwt');
const { query } = require('../config/db');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');
const { validarAcessoConta } = require('../services/acessoService');

/**
 * Middleware de autenticação JWT
 * Extrai Bearer token, verifica assinatura, busca usuário e empresa no banco.
 * Popula req.usuario com { id, nome, email, papel, ativo, must_change_password, empresa_id }
 */
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token de autenticação não fornecido.', 'TOKEN_AUSENTE');
    }

    const token = header.split(' ')[1];

    let decoded;
    try {
      decoded = verificarToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError(
          'Token expirado. Renove sua sessão com o refresh token.',
          'TOKEN_EXPIRADO'
        );
      }
      throw new UnauthorizedError('Token de autenticação inválido.', 'TOKEN_INVALIDO');
    }

    // Busca usuário real no banco
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.must_change_password, u.empresa_id,
              e.nome AS empresa_nome, e.plano, e.trial_expira_em, e.status, e.excluida_em, e.tipo, u.versao_sessao
       FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Usuário não encontrado ou inválido.', 'USUARIO_NAO_ENCONTRADO');
    }

    const usuario = result.rows[0];
    if (decoded.sv !== (usuario.versao_sessao || 1)) {
      throw new UnauthorizedError('Sessão invalidada. Entre novamente.','SESSAO_INVALIDADA');
    }
    validarAcessoConta(usuario);

    // Se deve trocar a senha, bloqueia acesso a outros endpoints
    // Whitelist exata por método + baseUrl + path (nunca originalUrl/query string)
    if (usuario.must_change_password && !isAllowedDuringPasswordChange(req)) {
      throw new ForbiddenError(
        'Você deve alterar sua senha temporária antes de continuar.',
        'TROCA_SENHA_OBRIGATORIA'
      );
    }

    req.usuario = usuario;
    req.empresaId = usuario.empresa_id;

    next();
  } catch (err) {
    next(err);
  }
}

const ALLOWED_PASSWORD_CHANGE_OPERATIONS = Object.freeze([
  { method: 'GET', baseUrl: '/api/auth', path: '/me' },
  { method: 'PUT', baseUrl: '/api/auth', path: '/senha' },
  { method: 'POST', baseUrl: '/api/auth', path: '/logout' }
]);

/**
 * Operações permitidas enquanto a troca de senha é obrigatória.
 * Igualdade literal de método, baseUrl e path: a query string não participa.
 */
function isAllowedDuringPasswordChange(req) {
  return ALLOWED_PASSWORD_CHANGE_OPERATIONS.some(
    (op) => req.method === op.method && req.baseUrl === op.baseUrl && req.path === op.path
  );
}

auth.isAllowedDuringPasswordChange = isAllowedDuringPasswordChange;

module.exports = auth;
