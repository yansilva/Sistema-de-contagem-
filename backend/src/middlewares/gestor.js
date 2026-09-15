const { requireAdmin } = require('./authorize');

/**
 * Middleware de controle de acesso baseado em papel (RBAC)
 * Garante que apenas gestores ou administradores acessem rotas administrativas
 */
module.exports = requireAdmin;
