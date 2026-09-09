const { verificarToken } = require('../config/jwt');
const { query } = require('../config/db');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

/**
 * Middleware de autenticação JWT
 * Extrai Bearer token, verifica integridade, busca usuário e empresa no banco.
 * Popula req.usuario com { id, nome, email, papel, empresa_id }
 */
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token de autenticação não fornecido.', 'TOKEN_AUSENTE');
    }

    const token = header.split(' ')[1];

    let decoded;
    try {
      decoded = verificarToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError(
          'Token expirado. Renove sua sessão com o refresh token.',
          'TOKEN_EXPIRADO'
        );
      }
      throw new UnauthorizedError('Token de autenticação inválido.', 'TOKEN_INVALIDO');
    }

    let usuario;

    if (decoded.id === '00000000-0000-0000-0000-000000000000') {
      // Token de Convidado (Sandbox Demo)
      const resultEmp = await query(
        'SELECT id, nome AS empresa_nome, plano, trial_expira_em FROM empresas WHERE id = $1',
        [decoded.empresa_id]
      );
      if (resultEmp.rows.length === 0) {
        throw new UnauthorizedError(
          'Empresa de demonstração não encontrada.',
          'EMPRESA_NAO_ENCONTRADA'
        );
      }
      const e = resultEmp.rows[0];
      usuario = {
        id: decoded.id,
        nome: 'Convidado (Demonstração)',
        email: 'guest@lojademo.com',
        papel: 'funcionario',
        empresa_id: e.id,
        empresa_nome: e.empresa_nome,
        plano: e.plano,
        trial_expira_em: e.trial_expira_em,
        isGuest: true
      };
    } else {
      // Usuário registrado padrão
      const result = await query(
        `SELECT u.id, u.nome, u.email, u.papel, u.empresa_id,
                e.nome AS empresa_nome, e.plano, e.trial_expira_em
         FROM usuarios u
         JOIN empresas e ON e.id = u.empresa_id
         WHERE u.id = $1`,
        [decoded.id]
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedError('Usuário não encontrado ou inativo.', 'USUARIO_NAO_ENCONTRADO');
      }
      usuario = result.rows[0];
      usuario.isGuest = false;
    }

    // Verificar status do plano
    if (usuario.plano === 'suspenso') {
      throw new ForbiddenError(
        'Acesso suspenso para esta organização. Contate o suporte.',
        'CONTA_SUSPENSA'
      );
    }

    if (usuario.plano === 'trial' && usuario.trial_expira_em) {
      const agora = new Date();
      const expira = new Date(usuario.trial_expira_em);
      if (agora > expira) {
        throw new ForbiddenError('O período de avaliação desta conta expirou.', 'TRIAL_EXPIRADO');
      }
    }

    req.usuario = usuario;
    req.empresaId = usuario.empresa_id;

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = auth;
