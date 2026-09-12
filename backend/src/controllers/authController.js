const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { gerarAccessToken, gerarRefreshToken, hashToken } = require('../config/jwt');
const { UnauthorizedError, NotFoundError } = require('../errors/AppError');
const { registrar: registrarEmpresa } = require('./empresasController');

const SALT_ROUNDS = 12;

/**
 * POST /api/auth/login
 * Autentica email + senha, retorna tokens + dados do usuário e empresa
 * SEM backdoors, SEM senhas demo padrão.
 */
async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    const emailNorm = email.toLowerCase().trim();

    const result = await query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.papel, u.ativo, u.must_change_password, u.empresa_id,
              e.nome AS empresa_nome, e.plano, e.trial_expira_em
       FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1`,
      [emailNorm]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Credenciais inválidas.', 'CREDENCIAIS_INVALIDAS');
    }
    const usuario = result.rows[0];

    // Verificar se usuário está ativo
    if (usuario.ativo === false) {
      throw new UnauthorizedError(
        'Este usuário foi desativado pelo administrador da empresa.',
        'USUARIO_DESATIVADO'
      );
    }

    // Validação estrita via bcrypt (SEM senhas padrão 123456 ou AdminDemo)
    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaValida) {
      throw new UnauthorizedError('Credenciais inválidas.', 'CREDENCIAIS_INVALIDAS');
    }

    // Gerar tokens
    const accessToken = gerarAccessToken({ id: usuario.id, empresa_id: usuario.empresa_id });
    const { token: rawRefreshToken, expiraEm } = gerarRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);

    // Salvar hash do refresh token no banco
    await query(
      `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [usuario.id, tokenHash, expiraEm]
    );

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: rawRefreshToken,
        mustChangePassword: Boolean(usuario.must_change_password),
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          ativo: usuario.ativo,
          mustChangePassword: Boolean(usuario.must_change_password)
        },
        empresa: {
          id: usuario.empresa_id,
          nome: usuario.empresa_nome,
          plano: usuario.plano
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Renova access token com detecção de roubo de token e rotação estrita
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const tokenHash = hashToken(refreshToken);

    const result = await query(
      `SELECT rt.id, rt.usuario_id, rt.revogado, rt.expira_em,
              u.empresa_id, u.papel, u.nome, u.email, u.ativo, u.must_change_password
       FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Refresh token inválido ou não reconhecido.', 'REFRESH_INVALIDO');
    }

    const row = result.rows[0];

    // Detecção de reutilização de token revogado (Theft Detection)
    if (row.revogado) {
      await query(`UPDATE refresh_tokens SET revogado = TRUE WHERE usuario_id = $1`, [
        row.usuario_id
      ]);
      throw new UnauthorizedError(
        'Violação de segurança detectada: tentativa de reutilização de token. Todas as sessões foram invalidadas.',
        'SESSAO_COMPROMETIDA'
      );
    }

    // Verificar se usuário ainda está ativo
    if (row.ativo === false) {
      throw new UnauthorizedError('Usuário desativado.', 'USUARIO_DESATIVADO');
    }

    // Verificar se expirou
    if (new Date() > new Date(row.expira_em)) {
      throw new UnauthorizedError('Refresh token expirado.', 'TOKEN_EXPIRADO');
    }

    // Invalidar o token atual (Single-Use Token Rotation)
    await query(`UPDATE refresh_tokens SET revogado = TRUE WHERE id = $1`, [row.id]);

    // Emitir novo par de tokens
    const novoAccessToken = gerarAccessToken({
      id: row.usuario_id,
      empresa_id: row.empresa_id
    });
    const { token: novoRefreshTokenRaw, expiraEm } = gerarRefreshToken();
    const novoTokenHash = hashToken(novoRefreshTokenRaw);

    await query(
      `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [row.usuario_id, novoTokenHash, expiraEm]
    );

    res.json({
      success: true,
      data: {
        accessToken: novoAccessToken,
        refreshToken: novoRefreshTokenRaw
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Invalida o refresh token atual e remove tokens expirados
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body || {};

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('UPDATE refresh_tokens SET revogado = TRUE WHERE token_hash = $1', [tokenHash]);
    }

    if (req.usuario && req.usuario.id) {
      await query(
        'DELETE FROM refresh_tokens WHERE usuario_id = $1 AND (revogado = TRUE OR expira_em < NOW())',
        [req.usuario.id]
      );
    }

    res.json({
      success: true,
      message: 'Sessão encerrada com sucesso.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Retorna dados completos do usuário autenticado para restauração de sessão
 */
async function me(req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        usuario: {
          id: req.usuario.id,
          nome: req.usuario.nome,
          email: req.usuario.email,
          papel: req.usuario.papel,
          ativo: req.usuario.ativo,
          mustChangePassword: Boolean(req.usuario.must_change_password)
        },
        empresa: {
          id: req.usuario.empresa_id,
          nome: req.usuario.empresa_nome,
          plano: req.usuario.plano
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/auth/senha
 * Altera a senha do usuário e desativa a flag must_change_password
 */
async function alterarSenha(req, res, next) {
  try {
    const { senhaAtual, novaSenha } = req.body;

    const result = await query('SELECT senha_hash, must_change_password FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (result.rows.length === 0) {
      throw new NotFoundError('Usuário não encontrado.', 'USUARIO_NAO_ENCONTRADO');
    }

    const senhaValida = await bcrypt.compare(senhaAtual, result.rows[0].senha_hash);
    if (!senhaValida) {
      throw new UnauthorizedError('A senha atual fornecida está incorreta.', 'SENHA_INCORRETA');
    }

    const novoHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
    await query(
      `UPDATE usuarios
       SET senha_hash = $1, must_change_password = FALSE, atualizado_em = NOW()
       WHERE id = $2`,
      [novoHash, req.usuario.id]
    );

    res.json({
      success: true,
      message: 'Senha alterada com sucesso.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  alterarSenha,
  registro: registrarEmpresa
};
