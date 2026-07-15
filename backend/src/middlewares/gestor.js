/**
 * Middleware de verificação de papel (gestor)
 * Deve ser usado DEPOIS do middleware auth
 */
function gestor(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ erro: 'NAO_AUTENTICADO', mensagem: 'Autenticação necessária.' });
  }

  if (req.usuario.papel !== 'gestor') {
    return res.status(403).json({
      erro: 'ACESSO_NEGADO',
      mensagem: 'Apenas gestores podem acessar este recurso.'
    });
  }

  next();
}

module.exports = gestor;
