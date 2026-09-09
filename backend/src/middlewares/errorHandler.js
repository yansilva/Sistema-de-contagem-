const { AppError } = require('../errors/AppError');

/**
 * Middleware centralizado de tratamento de erros
 * Padroniza respostas de erro em toda a aplicação
 */
function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Erros de validação do Zod (caso cheguem diretamente)
  if (err.name === 'ZodError' || err.issues) {
    return res.status(400).json({
      success: false,
      message: 'Falha na validação dos dados de entrada.',
      code: 'DADOS_INVALIDOS',
      details: (err.issues || err.errors || []).map((e) => ({
        campo: e.path ? e.path.join('.') : undefined,
        mensagem: e.message
      }))
    });
  }

  // Erros operacionais conhecidos (AppError)
  if (err instanceof AppError || err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      code: err.code || 'ERRO_OPERACIONAL',
      details: err.details || undefined
    });
  }

  // Erros de sintaxe JSON do body-parser
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'JSON malformado no corpo da requisição.',
      code: 'JSON_INVALIDO'
    });
  }

  // Erros de constraint única do PostgreSQL
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Registro duplicado ou já existente.',
      code: 'DUPLICIDADE_REGISTRO',
      detail: isDev ? err.detail : undefined
    });
  }

  // Erros de foreign key do PostgreSQL
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referência de dados inválida ou inexistente.',
      code: 'REFERENCIA_INVALIDA'
    });
  }

  // Erros não previstos (500)
  console.error('[ERROR_HANDLER]', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: isDev ? err.stack : undefined
  });

  return res.status(500).json({
    success: false,
    message: isDev ? err.message : 'Erro interno do servidor.',
    code: 'ERRO_INTERNO'
  });
}

module.exports = errorHandler;
