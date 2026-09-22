const { AppError } = require('../errors/AppError');

// O transporte será ligado somente depois que um provedor for escolhido e configurado.
function configurado() {
  return false;
}

async function enviarRecuperacao() {
  throw new AppError(
    'O serviço de e-mail ainda não está configurado.',
    503,
    'EMAIL_NAO_CONFIGURADO'
  );
}

module.exports = { configurado, enviarRecuperacao };
