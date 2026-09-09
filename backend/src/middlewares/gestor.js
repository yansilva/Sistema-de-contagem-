const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

/**
 * Middleware de controle de acesso baseado em papel (RBAC)
 * Garante que apenas gestores ou administradores acessem rotas administrativas
 */
function gestor(req, res, next) {
  if (!req.usuario) {
    return next(new UnauthorizedError('Autenticação necessária.', 'NAO_AUTENTICADO'));
  }

  if (req.usuario.papel !== 'gestor' && req.usuario.papel !== 'admin') {
    return next(
      new ForbiddenError(
        'Permissão restrita. Apenas gestores podem realizar esta ação.',
        'ACESSO_RESTRITO_GESTOR'
      )
    );
  }

  next();
}

module.exports = gestor;
