const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { gerarAccessToken, gerarRefreshToken } = require('../config/jwt');

const SALT_ROUNDS = 12;

/**
 * POST /api/empresas/registrar
 * Onboarding: cria empresa + primeiro usuário gestor
 * Retorna tokens + dados (mesmo formato do login)
 */
async function registrar(req, res) {
  try {
    const { empresa_nome, nome, email, senha } = req.body;

    // Validações
    if (!empresa_nome || !nome || !email || !senha) {
      return res.status(400).json({
        erro: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Todos os campos são obrigatórios: empresa_nome, nome, email, senha.'
      });
    }

    if (senha.length < 4) {
      return res.status(400).json({
        erro: 'SENHA_CURTA',
        mensagem: 'A senha deve ter pelo menos 4 caracteres.'
      });
    }

    const emailNorm = email.toLowerCase().trim();

    // Verificar se email já existe
    const emailExiste = await query('SELECT id FROM usuarios WHERE email = $1', [emailNorm]);
    if (emailExiste.rows.length > 0) {
      return res.status(409).json({ erro: 'EMAIL_EXISTENTE', mensagem: 'Este email já está cadastrado.' });
    }

    // Verificar se email de contato da empresa já existe
    const empresaExiste = await query('SELECT id FROM empresas WHERE email_contato = $1', [emailNorm]);
    if (empresaExiste.rows.length > 0) {
      return res.status(409).json({ erro: 'EMPRESA_EXISTENTE', mensagem: 'Já existe uma empresa com este email.' });
    }

    // Criar empresa
    const trialExpira = new Date();
    trialExpira.setDate(trialExpira.getDate() + 14);

    const empresaResult = await query(
      `INSERT INTO empresas (nome, email_contato, plano, trial_expira_em)
       VALUES ($1, $2, 'trial', $3)
       RETURNING id, nome, plano`,
      [empresa_nome.trim(), emailNorm, trialExpira]
    );

    const empresa = empresaResult.rows[0];

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    // Criar usuário gestor
    const usuarioResult = await query(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel)
       VALUES ($1, $2, $3, $4, 'gestor')
       RETURNING id, nome, email, papel`,
      [empresa.id, nome.trim(), emailNorm, senhaHash]
    );

    const usuario = usuarioResult.rows[0];

    // Gerar tokens
    const accessToken = gerarAccessToken({ id: usuario.id, empresa_id: empresa.id });
    const { token: refreshToken, expiraEm } = gerarRefreshToken();

    await query(
      'INSERT INTO refresh_tokens (usuario_id, token, expira_em) VALUES ($1, $2, $3)',
      [usuario.id, refreshToken, expiraEm]
    );

    res.status(201).json({
      accessToken,
      refreshToken,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel
      },
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        plano: empresa.plano
      }
    });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao registrar empresa.' });
  }
}

module.exports = { registrar };
