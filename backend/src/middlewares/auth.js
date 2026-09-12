const { verificarToken } = require('../config/jwt');
const { query } = require('../config/db');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

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
              e.nome AS empresa_nome, e.plano, e.trial_expira_em
       FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Usuário não encontrado ou inválido.', 'USUARIO_NAO_ENCONTRADO');
    }

    const usuario = result.rows[0];

    // Verificar se usuário está ativo
    if (usuario.ativo === false) {
      throw new UnauthorizedError(
        'Este usuário foi desativado pelo administrador da empresa.',
        'USUARIO_DESATIVADO'
      );
    }

    // Verificar status do plano da empresa
    if (usuario.plano === 'suspenso') {
      throw new ForbiddenError(
        'Acesso suspenso para esta organização. Contate o suporte.',
        'CONTA_SUSPENSA'
      );
    }

    if (usuario.plano === 'trial' && usuario.trial_expira_em) {
      const agora = new Date();
      const expira = new Date(usuario.trial_expira_em);
      if (agora > expira) {
        throw new ForbiddenError('O período de avaliação desta conta expirou.', 'TRIAL_EXPIRADO');
      }
    }

    // Se deve trocar a senha, bloqueia acesso a outros endpoints
    // Verifica na URL original para garantir precisão
    const url = req.originalUrl || req.url || '';
    const isAuthRoute =
      url.includes('/auth/senha') ||
      url.includes('/auth/me') ||
      url.includes('/auth/logout');

    if (usuario.must_change_password && !isAuthRoute) {
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

module.exports = auth;
