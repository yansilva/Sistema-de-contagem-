/**
 * Middleware de isolamento de tenant
 * Garante que req.empresaId vem do token JWT (nunca do body/query)
 * Deve ser usado DEPOIS do middleware auth
 */
function tenant(req, res, next) {
  if (!req.usuario || !req.usuario.empresa_id) {
    return res.status(401).json({ erro: 'TENANT_INVALIDO', mensagem: 'Empresa não identificada.' });
  }

  // Injeta empresa_id como atalho
  req.empresaId = req.usuario.empresa_id;
  next();
}

module.exports = tenant;
