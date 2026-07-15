const { verificarToken } = require('../config/jwt');
const { query } = require('../config/db');

/**
 * Middleware de autenticação JWT
 * Extrai Bearer token, verifica, busca usuário e empresa no banco.
 * Popula req.usuario com { id, nome, email, papel, empresa_id }
 */
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ erro: 'TOKEN_AUSENTE', mensagem: 'Token de autenticação não fornecido.' });
    }

    const token = header.split(' ')[1];

    let decoded;
    try {
      decoded = verificarToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ erro: 'TOKEN_EXPIRADO', mensagem: 'Token expirado. Renove com refresh token.' });
      }
      return res.status(401).json({ erro: 'TOKEN_INVALIDO', mensagem: 'Token inválido.' });
    }

    let usuario;

    if (decoded.id === '00000000-0000-0000-0000-000000000000') {
      // É um token de guest, não existe na tabela de usuários. Buscar apenas a empresa
      const resultEmp = await query('SELECT id, nome AS empresa_nome, plano, trial_expira_em FROM empresas WHERE id = $1', [decoded.empresa_id]);
      if (resultEmp.rows.length === 0) {
        return res.status(401).json({ erro: 'EMPRESA_NAO_ENCONTRADA', mensagem: 'Empresa do guest não encontrada.' });
      }
      const e = resultEmp.rows[0];
      usuario = {
        id: decoded.id,
        nome: 'Convidado',
        email: 'guest@' + e.id,
        papel: 'funcionario',
        empresa_id: e.id,
        empresa_nome: e.empresa_nome,
        plano: e.plano,
        trial_expira_em: e.trial_expira_em
      };
    } else {
      // Buscar usuário e empresa normal
      const result = await query(
        `SELECT u.id, u.nome, u.email, u.papel, u.empresa_id,
                e.nome AS empresa_nome, e.plano, e.trial_expira_em
         FROM usuarios u
         JOIN empresas e ON e.id = u.empresa_id
         WHERE u.id = $1`,
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ erro: 'USUARIO_NAO_ENCONTRADO', mensagem: 'Usuário não encontrado.' });
      }
      usuario = result.rows[0];
    }

    // Verificar plano da empresa
    if (usuario.plano === 'suspenso') {
      return res.status(403).json({ erro: 'CONTA_SUSPENSA', mensagem: 'Sua conta está suspensa. Entre em contato com o suporte.' });
    }

    if (usuario.plano === 'trial' && usuario.trial_expira_em) {
      const agora = new Date();
      const expira = new Date(usuario.trial_expira_em);
      if (agora > expira) {
        return res.status(403).json({ erro: 'TRIAL_EXPIRADO', mensagem: 'Seu período de teste expirou.' });
      }
    }

    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      empresa_id: usuario.empresa_id,
      empresa_nome: usuario.empresa_nome,
      plano: usuario.plano
    };

    next();
  } catch (err) {
    console.error('Erro no middleware auth:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno de autenticação.' });
  }
}

module.exports = auth;
