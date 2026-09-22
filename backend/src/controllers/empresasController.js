const bcrypt = require('bcryptjs');
const { query, getClient } = require('../config/db');
const auditService = require('../services/auditService');
const { gerarAccessToken, gerarRefreshToken, hashToken } = require('../config/jwt');
const { ConflictError, ForbiddenError } = require('../errors/AppError');

const SALT_ROUNDS = 12;

/**
 * POST /api/empresas/registrar ou POST /api/auth/registro
 * Onboarding: cria empresa + primeiro usuário administrador
 * Retorna tokens + dados do usuário e empresa
 */
async function registrar(req, res, next) {
  try {
    const isPublicAllowed =
      process.env.ALLOW_PUBLIC_REGISTRATION === 'true' || process.env.NODE_ENV === 'test';

    if (!isPublicAllowed) {
      throw new ForbiddenError(
        'O cadastro público de organizações está desabilitado. O provisionamento é gerenciado pela administração da plataforma.',
        'CADASTRO_PUBLICO_DESABILITADO'
      );
    }

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

    // Criar empresa com 30 dias de trial ativo
    const trialExpira = new Date();
    trialExpira.setDate(trialExpira.getDate() + 30);

    const empresaResult = await query(
      `INSERT INTO empresas (nome, email_contato, plano, status, tipo, trial_expira_em)
       VALUES ($1, $2, 'ativo', 'ativa', 'cliente', $3)
       RETURNING id, nome, plano`,
      [empresa_nome.trim(), emailNorm, trialExpira]
    );
    const empresa = empresaResult.rows[0];

    // Hash da senha com bcrypt
    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    // Criar usuário administrador inicial
    const usuarioResult = await query(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel, ativo, must_change_password)
       VALUES ($1, $2, $3, $4, 'administrador', TRUE, FALSE)
       RETURNING id, nome, email, papel, ativo, must_change_password, versao_sessao`,
      [empresa.id, nome.trim(), emailNorm, senhaHash]
    );
    const usuario = usuarioResult.rows[0];

    // Gerar tokens
    const accessToken = gerarAccessToken({
      id: usuario.id,
      empresa_id: empresa.id,
      versao_sessao: usuario.versao_sessao || 1
    });
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
        mustChangePassword: false,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          ativo: usuario.ativo,
          mustChangePassword: false
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

// Provisionamento de plataforma: não emite sessão em nome do administrador criado.
async function provisionar(req, res, next) {
  let client;
  try {
    const { empresa_nome, nome, email, senha } = req.body;
    const emailNorm = email.toLowerCase().trim();
    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
    client = await getClient();
    await client.query('BEGIN');
    const usuarioExistente = await client.query('SELECT id FROM usuarios WHERE email = $1', [
      emailNorm
    ]);
    if (usuarioExistente.rows.length) {
      throw new ConflictError('Este email já está cadastrado no sistema.', 'EMAIL_EXISTENTE');
    }
    const empresaExistente = await client.query(
      'SELECT id FROM empresas WHERE email_contato = $1',
      [emailNorm]
    );
    if (empresaExistente.rows.length) {
      throw new ConflictError(
        'Já existe uma empresa com este email de contato.',
        'EMPRESA_EXISTENTE'
      );
    }
    const empresaResult = await client.query(
      `INSERT INTO empresas (nome, email_contato, plano, status, tipo)
       VALUES ($1, $2, $3, 'ativa', 'cliente') RETURNING id, nome, plano, status, tipo`,
      [empresa_nome.trim(), emailNorm, 'ativo']
    );
    const empresa = empresaResult.rows[0];
    const usuarioResult = await client.query(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel, ativo, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nome, email, papel, ativo, must_change_password`,
      [empresa.id, nome.trim(), emailNorm, senhaHash, 'administrador', true, true]
    );
    const usuario = usuarioResult.rows[0];
    await auditService.registrar(client, req.auditContext, {
      escopo: 'plataforma',
      empresaAfetadaId: empresa.id,
      atorTipo: 'usuario_plataforma',
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'empresa_criada',
      entidade: 'empresa',
      entidadeId: empresa.id,
      dadosNovos: { nome: empresa.nome, administrador_id: usuario.id },
      eventoChave: 'empresa_criada'
    });
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      data: {
        empresa,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          mustChangePassword: true
        }
      }
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    if (client) client.release();
  }
}

/**
 * PUT /api/empresas/:id
 * Atualização cadastral da empresa (nome, email_contato, plano, trial_expira_em)
 */
module.exports = { registrar, provisionar,
  ...require('./empresasLeituraController'),
  ...require('./empresasAdminController') };
