const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

/**
 * Middleware para exigir papéis específicos (RBAC)
 * @param  {...string} rolesPermitidas - Lista de papéis autorizados (case-insensitive)
 */
function requireRole(...rolesPermitidas) {
  const permitidos = rolesPermitidas.map((r) => r.toLowerCase());

  return (req, res, next) => {
    if (!req.usuario) {
      return next(new UnauthorizedError('Autenticação necessária.', 'NAO_AUTENTICADO'));
    }

    const papelAtual = (req.usuario.papel || '').toLowerCase();
    if (!permitidos.includes(papelAtual)) {
      return next(
        new ForbiddenError(
          'Permissão negada. Seu papel de usuário não autoriza esta operação.',
          'ACESSO_NEGADO_PAPEL'
        )
      );
    }

    next();
  };
}

/**
 * Middleware para exigir perfil administrativo (administrador da empresa ou super_admin)
 */
function requireAdmin(req, res, next) {
  if (!req.usuario) {
    return next(new UnauthorizedError('Autenticação necessária.', 'NAO_AUTENTICADO'));
  }

  const papel = (req.usuario.papel || '').toLowerCase();
  const isAdmin =
    papel === 'administrador' ||
    papel === 'gestor' ||
    papel === 'admin' ||
    papel === 'super_admin';

  if (!isAdmin) {
    return next(
      new ForbiddenError(
        'Permissão restrita. Apenas administradores podem realizar esta ação.',
        'ACESSO_RESTRITO_GESTOR'
      )
    );
  }

  next();
}

/**
 * Middleware para exigir perfil exclusivo de plataforma (super_admin)
 */
function requireSuperAdmin(req, res, next) {
  if (!req.usuario) {
    return next(new UnauthorizedError('Autenticação necessária.', 'NAO_AUTENTICADO'));
  }

  const papel = (req.usuario.papel || '').toLowerCase();
  if (papel !== 'super_admin') {
    return next(
      new ForbiddenError(
        'Permissão restrita à gestão da plataforma (super_admin).',
        'ACESSO_RESTRITO_PLATAFORMA'
      )
    );
  }

  next();
}

module.exports = {
  requireRole,
  requireAdmin,
  requireSuperAdmin
};
