const { ValidationError } = require('../errors/AppError');

/**
 * Middleware para validação de requisições com Zod
 * @param {object} schema - Objeto contendo schemas do Zod para body, query e/ou params
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err.errors) {
        const detalhes = err.errors.map((e) => ({
          campo: e.path.join('.'),
          mensagem: e.message
        }));
        return next(new ValidationError('Falha na validação dos dados de entrada.', detalhes));
      }
      next(err);
    }
  };
}

module.exports = validate;
