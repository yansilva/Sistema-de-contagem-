const reset = require('../services/passwordResetService');
const email = require('../services/emailService');
const { AppError } = require('../errors/AppError');

async function solicitar(req, res, next) {
  try {
    if (!email.configurado()) {
      throw new AppError(
        'O serviço de e-mail ainda não está configurado.',
        503,
        'EMAIL_NAO_CONFIGURADO'
      );
    }
    const solicitacao = await reset.solicitar({
      empresaId: req.params.id,
      usuarioId: req.params.usuarioId,
      ator: req.usuario,
      contexto: req.auditContext
    }, email.enviarRecuperacao);
    res.status(202).json({ success: true, data: { solicitacao } });
  } catch (error) {
    next(error);
  }
}

async function confirmar(req, res, next) {
  try {
    await reset.consumir({
      token: req.body.token,
      novaSenha: req.body.novaSenha,
      contexto: req.auditContext
    });
    res.json({ success: true, message: 'Senha alterada. Entre novamente para continuar.' });
  } catch (error) {
    next(error);
  }
}

function status(req, res) {
  res.json({ success: true, data: { configurado: email.configurado() } });
}

module.exports = { solicitar, confirmar, status };
