const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { gerarAccessToken, gerarRefreshToken } = require('../config/jwt');

/**
 * POST /api/auth/login
 * Autentica email + senha, retorna tokens + dados do usuário e empresa
 */
async function login(req, res) {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'CAMPOS_OBRIGATORIOS', mensagem: 'Email e senha são obrigatórios.' });
    }

    // Buscar usuário com dados da empresa
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.papel, u.empresa_id,
              e.nome AS empresa_nome, e.plano, e.trial_expira_em
       FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ erro: 'CREDENCIAIS_INVALIDAS', mensagem: 'Email ou senha incorretos.' });
    }

    const usuario = result.rows[0];

    // Verificar senha com bcrypt
    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'CREDENCIAIS_INVALIDAS', mensagem: 'Email ou senha incorretos.' });
    }

    // Gerar tokens
    const accessToken = gerarAccessToken({ id: usuario.id, empresa_id: usuario.empresa_id });
    const { token: refreshToken, expiraEm } = gerarRefreshToken();

    // Salvar refresh token no banco
    await query(
      'INSERT INTO refresh_tokens (usuario_id, token, expira_em) VALUES ($1, $2, $3)',
      [usuario.id, refreshToken, expiraEm]
    );

    res.json({
      accessToken,
      refreshToken,
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
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao processar login.' });
  }
}

/**
 * POST /api/auth/refresh
 * Renova access token usando refresh token válido
 */
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ erro: 'TOKEN_AUSENTE', mensagem: 'Refresh token é obrigatório.' });
    }

    // Buscar refresh token no banco
    const result = await query(
      `SELECT rt.*, u.id AS user_id, u.empresa_id
       FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token = $1 AND rt.expira_em > NOW()`,
      [refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ erro: 'REFRESH_INVALIDO', mensagem: 'Refresh token inválido ou expirado.' });
    }

    const row = result.rows[0];

    // Gerar novo access token
    const accessToken = gerarAccessToken({ id: row.user_id, empresa_id: row.empresa_id });

    res.json({ accessToken });
  } catch (err) {
    console.error('Erro no refresh:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao renovar token.' });
  }
}

/**
 * POST /api/auth/logout
 * Invalida o refresh token
 */
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }

    // Limpar todos os tokens expirados do usuário
    if (req.usuario) {
      await query('DELETE FROM refresh_tokens WHERE usuario_id = $1 AND expira_em < NOW()', [req.usuario.id]);
    }

    res.json({ mensagem: 'Logout realizado com sucesso.' });
  } catch (err) {
    console.error('Erro no logout:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao processar logout.' });
  }
}

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado (para restaurar sessão)
 */
async function me(req, res) {
  try {
    res.json({
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
    });
  } catch (err) {
    console.error('Erro no /me:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao buscar dados do usuário.' });
  }
}

/**
 * PUT /api/auth/senha
 * Altera a senha do usuário autenticado
 */
async function alterarSenha(req, res) {
  try {
    const { senha_atual, nova_senha } = req.body;

    if (!senha_atual || !nova_senha) {
      return res.status(400).json({
        erro: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Senha atual e nova senha são obrigatórias.'
      });
    }

    if (nova_senha.length < 4) {
      return res.status(400).json({
        erro: 'SENHA_CURTA',
        mensagem: 'A nova senha deve ter pelo menos 4 caracteres.'
      });
    }

    // Buscar hash atual
    const result = await query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'USUARIO_NAO_ENCONTRADO', mensagem: 'Usuário não encontrado.' });
    }

    // Verificar senha atual
    const senhaValida = await bcrypt.compare(senha_atual, result.rows[0].senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'SENHA_INCORRETA', mensagem: 'Senha atual incorreta.' });
    }

    // Hash da nova senha
    const novoHash = await bcrypt.hash(nova_senha, 12);
    await query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [novoHash, req.usuario.id]);

    res.json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao alterar senha.' });
  }
}

/**
 * GET /api/auth/guest
 * Emite um token temporário com papel de funcionário
 * da primeira empresa cadastrada (ou Loja Demo)
 */
async function guest(req, res) {
  try {
    // Busca a primeira empresa existente (preferencialmente a Demo se existir)
    const result = await query(
      `SELECT id, nome FROM empresas ORDER BY id ASC LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'SEM_EMPRESA', mensagem: 'Nenhuma empresa cadastrada no sistema.' });
    }

    const empresa = result.rows[0];

    // Gerar token como funcionário (gestor=falso, sem acesso ao backoffice)
    // Usamos um ID de usuário fictício (0) ou podemos criar um usuário anônimo
    const accessToken = gerarAccessToken({
      id: '00000000-0000-0000-0000-000000000000',
      empresa_id: empresa.id
    });

    res.json({
      accessToken,
      usuario: {
        id: '00000000-0000-0000-0000-000000000000',
        nome: 'Convidado (Funcionário)',
        email: 'guest@' + empresa.id,
        papel: 'funcionario'
      },
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        plano: 'trial' // ou o que for irrelevante
      }
    });
  } catch (err) {
    console.error('Erro no guest login:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao gerar login temporário.' });
  }
}

module.exports = { login, refresh, logout, me, alterarSenha, guest };
