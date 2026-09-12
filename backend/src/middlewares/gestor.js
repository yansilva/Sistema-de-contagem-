const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

/**
 * Middleware de controle de acesso baseado em papel (RBAC)
 * Garante que apenas gestores ou administradores acessem rotas administrativas
 */
function gestor(req, res, next) {
  if (!req.usuario) {
    return next(new UnauthorizedError('Autenticação necessária.', 'NAO_AUTENTICADO'));
  }

  const papel = (req.usuario.papel || '').toLowerCase();
  const isAdmin = papel === 'administrador' || papel === 'gestor' || papel === 'admin';

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

module.exports = gestor;
