const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { gerarAccessToken, gerarRefreshToken, hashToken } = require('../config/jwt');
const { UnauthorizedError, NotFoundError } = require('../errors/AppError');

const SALT_ROUNDS = 12;

/**
 * POST /api/auth/login
 * Autentica email + senha, retorna tokens + dados do usuário e empresa
 */
async function login(req, res, next) {
  try {
    const { email, senha } = req.body;

    const result = await query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.papel, u.empresa_id,
              e.nome AS empresa_nome, e.plano, e.trial_expira_em
       FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Credenciais inválidas.', 'CREDENCIAIS_INVALIDAS');
    }

    const usuario = result.rows[0];

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
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel
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
 * Rotação real de refresh token com hash SHA-256 e detecção de reúso
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const tokenHash = hashToken(refreshToken);

    // Buscar o token pelo hash
    const result = await query(
      `SELECT rt.id, rt.usuario_id, rt.token_hash, rt.revogado, rt.expira_em,
              u.empresa_id
       FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Refresh token inválido ou inexistente.', 'REFRESH_INVALIDO');
    }

    const tokenDoc = result.rows[0];

    // Detecção de Reúso de Token (Token Theft Detection)
    if (tokenDoc.revogado) {
      // Invalida todos os tokens daquele usuário imediatamente
      await query(`UPDATE refresh_tokens SET revogado = TRUE WHERE usuario_id = $1`, [
        tokenDoc.usuario_id
      ]);
      throw new UnauthorizedError(
        'Tentativa de reúso de refresh token detectada. Sessão invalidada por segurança.',
        'SESSAO_COMPROMETIDA'
      );
    }

    // Verificar expiração
    if (new Date(tokenDoc.expira_em) <= new Date()) {
      throw new UnauthorizedError(
        'Refresh token expirado. Faça login novamente.',
        'REFRESH_EXPIRADO'
      );
    }

    // Gerar novo par de tokens (Rotação)
    const novoAccessToken = gerarAccessToken({
      id: tokenDoc.usuario_id,
      empresa_id: tokenDoc.empresa_id
    });
    const { token: novoRawRefreshToken, expiraEm: novoExpiraEm } = gerarRefreshToken();
    const novoTokenHash = hashToken(novoRawRefreshToken);

    // Invalida o token antigo e aponta para o novo (substituído_por)
    await query(
      `UPDATE refresh_tokens
       SET revogado = TRUE, substituido_por = $1
       WHERE id = $2`,
      [novoTokenHash, tokenDoc.id]
    );

    // Salva o novo refresh token hasheado
    await query(
      `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [tokenDoc.usuario_id, novoTokenHash, novoExpiraEm]
    );

    res.json({
      success: true,
      data: {
        accessToken: novoAccessToken,
        refreshToken: novoRawRefreshToken
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
    const { refreshToken } = req.body;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('UPDATE refresh_tokens SET revogado = TRUE WHERE token_hash = $1', [tokenHash]);
    }

    if (req.usuario?.id) {
      await query(
        'DELETE FROM refresh_tokens WHERE usuario_id = $1 AND (expira_em < NOW() OR revogado = TRUE)',
        [req.usuario.id]
      );
    }

    res.json({
      success: true,
      message: 'Logout realizado com sucesso.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado para restauração de sessão
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
          papel: req.usuario.papel
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
 * Altera a senha do usuário autenticado com validação e revogação de sessões antigas
 */
async function alterarSenha(req, res, next) {
  try {
    const { senhaAtual, novaSenha } = req.body;

    const result = await query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (result.rows.length === 0) {
      throw new NotFoundError('Usuário não encontrado.', 'USUARIO_NAO_ENCONTRADO');
    }

    const senhaValida = await bcrypt.compare(senhaAtual, result.rows[0].senha_hash);
    if (!senhaValida) {
      throw new UnauthorizedError('Senha atual incorreta.', 'SENHA_INCORRETA');
    }

    const novoHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
    await query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [novoHash, req.usuario.id]);

    // Revoga sessões antigas por segurança
    await query('UPDATE refresh_tokens SET revogado = TRUE WHERE usuario_id = $1', [
      req.usuario.id
    ]);

    res.json({
      success: true,
      message: 'Senha alterada com sucesso. Faça login novamente se necessário.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/guest
 * Emite token temporário seguro exclusivo para o ambiente sandbox da "Loja Demo"
 */
async function guest(req, res, next) {
  try {
    // Busca exclusivamente a empresa demo oficial
    let result = await query(
      `SELECT id, nome, plano FROM empresas WHERE email_contato = 'contato@lojademo.com'`
    );

    // Se não existir, tenta encontrar por nome ou cria a sandbox demo
    if (result.rows.length === 0) {
      result = await query(`SELECT id, nome, plano FROM empresas WHERE nome = 'Loja Demo' LIMIT 1`);
    }

    let empresa;
    if (result.rows.length === 0) {
      // Criar sandbox demo caso o seed ainda não tenha sido executado
      const trialExpira = new Date();
      trialExpira.setDate(trialExpira.getDate() + 30);
      const novaEmpresa = await query(
        `INSERT INTO empresas (nome, email_contato, plano, trial_expira_em)
         VALUES ('Loja Demo', 'contato@lojademo.com', 'trial', $1)
         RETURNING id, nome, plano`,
        [trialExpira]
      );
      empresa = novaEmpresa.rows[0];
    } else {
      empresa = result.rows[0];
    }

    const guestId = '00000000-0000-0000-0000-000000000000';
    const accessToken = gerarAccessToken({
      id: guestId,
      empresa_id: empresa.id
    });

    res.json({
      success: true,
      data: {
        accessToken,
        usuario: {
          id: guestId,
          nome: 'Convidado (Demonstração)',
          email: 'guest@lojademo.com',
          papel: 'funcionario'
        },
        empresa: {
          id: empresa.id,
          nome: empresa.nome,
          plano: empresa.plano
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, logout, me, alterarSenha, guest };
