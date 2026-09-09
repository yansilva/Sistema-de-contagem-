const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { gerarAccessToken, gerarRefreshToken, hashToken } = require('../config/jwt');
const { ConflictError } = require('../errors/AppError');

const SALT_ROUNDS = 12;

/**
 * POST /api/empresas/registrar
 * Onboarding: cria empresa + primeiro usuário gestor
 * Retorna tokens + dados do usuário e empresa
 */
async function registrar(req, res, next) {
  try {
    const { empresa_nome, nome, email, senha } = req.body;
    const emailNorm = email.toLowerCase().trim();

    // Verificar se email de usuário já existe
    const emailExiste = await query('SELECT id FROM usuarios WHERE email = $1', [emailNorm]);
    if (emailExiste.rows.length > 0) {
      throw new ConflictError('Este email já está cadastrado no sistema.', 'EMAIL_EXISTENTE');
    }

    // Verificar se email de contato da empresa já existe
    const empresaExiste = await query('SELECT id FROM empresas WHERE email_contato = $1', [
      emailNorm
    ]);
    if (empresaExiste.rows.length > 0) {
      throw new ConflictError(
        'Já existe uma empresa cadastrada com este email de contato.',
        'EMPRESA_EXISTENTE'
      );
    }

    // Criar empresa com 14 dias de trial
    const trialExpira = new Date();
    trialExpira.setDate(trialExpira.getDate() + 14);

    const empresaResult = await query(
      `INSERT INTO empresas (nome, email_contato, plano, trial_expira_em)
       VALUES ($1, $2, 'trial', $3)
       RETURNING id, nome, plano`,
      [empresa_nome.trim(), emailNorm, trialExpira]
    );
    const empresa = empresaResult.rows[0];

    // Hash da senha com bcrypt
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
    const { token: rawRefreshToken, expiraEm } = gerarRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);

    // Salvar hash do refresh token no banco
    await query(
      `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3)`,
      [usuario.id, tokenHash, expiraEm]
    );

    res.status(201).json({
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

module.exports = { registrar };
