class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'DADOS_INVALIDOS', details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado', code = 'NAO_AUTORIZADO') {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado', code = 'ACESSO_NEGADO') {
    super(message, 403, code);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado', code = 'NAO_ENCONTRADO') {
    super(message, 404, code);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflito de dados', code = 'CONFLITO') {
    super(message, 409, code);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};
