const { ForbiddenError, UnauthorizedError } = require('../errors/AppError');
function validarAcessoConta(usuario) {
  if (usuario.ativo === false) throw new UnauthorizedError('Usuário desativado.','USUARIO_DESATIVADO');
  if (usuario.excluida_em || usuario.status === 'inativa' || (!usuario.status && usuario.plano === 'suspenso')) {
    throw new ForbiddenError('Esta empresa está inativa. Contate o suporte.','CONTA_SUSPENSA');
  }
  if (usuario.plano === 'trial' && usuario.trial_expira_em && new Date(usuario.trial_expira_em) <= new Date()) {
    throw new ForbiddenError('O período de avaliação expirou.','TRIAL_EXPIRADO');
  }
}
module.exports = {validarAcessoConta};
