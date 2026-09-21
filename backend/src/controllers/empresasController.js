const bcrypt = require('bcryptjs');
const { query, getClient } = require('../config/db');
const auditService = require('../services/auditService');
const { gerarAccessToken, gerarRefreshToken, hashToken } = require('../config/jwt');
const { ConflictError, ForbiddenError, NotFoundError, AppError } = require('../errors/AppError');

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
      `INSERT INTO empresas (nome, email_contato, plano, trial_expira_em)
       VALUES ($1, $2, 'ativo', $3)
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
       RETURNING id, nome, email, papel, ativo, must_change_password`,
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
      'INSERT INTO empresas (nome, email_contato, plano) VALUES ($1, $2, $3) RETURNING id, nome, plano',
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
 * GET /api/empresas
 * Lista todas as empresas cadastradas com estatísticas (total de usuários e produtos).
 * Restrito a super_admin.
 */
async function listar(req, res, next) {
  try {
    const result = await query(
      `SELECT e.id, e.nome, e.email_contato, e.plano, e.trial_expira_em, e.criado_em,
              COALESCE(u.total_usuarios, 0) AS total_usuarios,
              COALESCE(p.total_produtos, 0) AS total_produtos
       FROM empresas e
       LEFT JOIN (
         SELECT empresa_id, COUNT(*) AS total_usuarios
         FROM usuarios WHERE ativo = TRUE GROUP BY empresa_id
       ) u ON u.empresa_id = e.id
       LEFT JOIN (
         SELECT empresa_id, COUNT(*) AS total_produtos
         FROM produtos WHERE ativo = TRUE GROUP BY empresa_id
       ) p ON p.empresa_id = e.id
       ORDER BY e.criado_em DESC`
    );

    const empresas = result.rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      email_contato: row.email_contato,
      plano: row.plano,
      trial_expira_em: row.trial_expira_em,
      criado_em: row.criado_em,
      total_usuarios: Number(row.total_usuarios),
      total_produtos: Number(row.total_produtos)
    }));

    res.json({
      success: true,
      data: {
        empresas,
        total: empresas.length
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/empresas/metricas/saas
 * Retorna métricas agregadas da plataforma SaaS (Super Admin)
 */
async function obterMetricasSaaS(req, res, next) {
  try {
    const empresasRes = await query('SELECT id, plano FROM empresas');
    const usuariosRes = await query('SELECT id FROM usuarios WHERE ativo = TRUE');
    const produtosRes = await query('SELECT id FROM produtos WHERE ativo = TRUE');
    const contagensRes = await query('SELECT id FROM contagens');

    const totalEmpresas = empresasRes.rows.length;
    const ativas = empresasRes.rows.filter((e) => e.plano === 'ativo').length;
    const trial = empresasRes.rows.filter((e) => e.plano === 'trial').length;
    const suspensas = empresasRes.rows.filter((e) => e.plano === 'suspenso').length;
    const totalUsuarios = usuariosRes.rows.length;
    const totalProdutos = produtosRes.rows.length;
    const totalContagens = contagensRes.rows.length;

    res.json({
      success: true,
      data: {
        totalEmpresas,
        ativas,
        trial,
        suspensas,
        totalUsuarios,
        totalProdutos,
        totalContagens
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/empresas/:id
 * Retorna dados detalhados de uma empresa e seus usuários
 */
async function obterDetalhes(req, res, next) {
  try {
    const { id } = req.params;
    const empRes = await query(
      'SELECT id, nome, email_contato, plano, trial_expira_em, criado_em FROM empresas WHERE id = $1',
      [id]
    );
    if (!empRes.rows.length) {
      throw new NotFoundError('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    const empresa = empRes.rows[0];

    const usersRes = await query(
      'SELECT id, nome, email, papel, ativo, criado_em FROM usuarios WHERE empresa_id = $1 ORDER BY criado_em ASC',
      [id]
    );

    const prodCountRes = await query(
      'SELECT COUNT(*)::int AS total FROM produtos WHERE empresa_id = $1 AND ativo = TRUE',
      [id]
    );
    const contCountRes = await query(
      'SELECT COUNT(*)::int AS total FROM contagens WHERE empresa_id = $1',
      [id]
    );

    res.json({
      success: true,
      data: {
        empresa: {
          ...empresa,
          total_produtos: Number(prodCountRes.rows[0]?.total || 0),
          total_contagens: Number(contCountRes.rows[0]?.total || 0)
        },
        usuarios: usersRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/empresas/:id
 * Atualização cadastral da empresa (nome, email_contato, plano, trial_expira_em)
 */
async function atualizar(req, res, next) {
  try {
    const { id } = req.params;
    const { nome, email_contato, plano, trial_expira_em } = req.body;

    const empRes = await query(
      'SELECT id, nome, email_contato, plano, trial_expira_em FROM empresas WHERE id = $1',
      [id]
    );
    if (!empRes.rows.length) {
      throw new NotFoundError('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    const empresaAtual = empRes.rows[0];

    if (
      email_contato &&
      email_contato.toLowerCase().trim() !== empresaAtual.email_contato?.toLowerCase()
    ) {
      const emailExiste = await query(
        'SELECT id FROM empresas WHERE email_contato = $1 AND id != $2',
        [email_contato.toLowerCase().trim(), id]
      );
      if (emailExiste.rows.length) {
        throw new ConflictError(
          'Já existe uma empresa cadastrada com este email de contato.',
          'EMPRESA_EXISTENTE'
        );
      }
    }

    if (plano && !['ativo', 'trial', 'suspenso'].includes(plano)) {
      throw new AppError('Plano inválido. Valores aceitos: ativo, trial, suspenso.', 400, 'PLANO_INVALIDO');
    }

    const novoNome = nome !== undefined ? nome.trim() : empresaAtual.nome;
    const novoEmail =
      email_contato !== undefined ? email_contato.toLowerCase().trim() : empresaAtual.email_contato;
    const novoPlano = plano !== undefined ? plano : empresaAtual.plano;
    const novoTrial =
      trial_expira_em !== undefined
        ? trial_expira_em
          ? new Date(trial_expira_em).toISOString()
          : null
        : empresaAtual.trial_expira_em;

    const updateRes = await query(
      `UPDATE empresas
       SET nome = $1, email_contato = $2, plano = $3, trial_expira_em = $4
       WHERE id = $5
       RETURNING id, nome, email_contato, plano, trial_expira_em, criado_em`,
      [novoNome, novoEmail, novoPlano, novoTrial, id]
    );

    const empresaAtualizada = updateRes.rows[0];

    await auditService.registrar(query, req.auditContext || {}, {
      escopo: 'plataforma',
      atorTipo: 'usuario_plataforma',
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'empresa_atualizada',
      entidade: 'empresa',
      entidadeId: id,
      dadosAnteriores: empresaAtual,
      dadosNovos: empresaAtualizada,
      eventoChave: `empresa_atualizada_${id}_${Date.now()}`
    });

    res.json({
      success: true,
      data: {
        empresa: empresaAtualizada
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/empresas/:id/status
 * Alternância rápida de status/plano da empresa (ativo, trial, suspenso)
 */
async function alterarStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { plano } = req.body;

    if (!plano || !['ativo', 'trial', 'suspenso'].includes(plano)) {
      throw new AppError(
        'Status/plano inválido. Valores permitidos: ativo, trial, suspenso.',
        400,
        'STATUS_INVALIDO'
      );
    }

    const empRes = await query('SELECT id, nome, plano FROM empresas WHERE id = $1', [id]);
    if (!empRes.rows.length) {
      throw new NotFoundError('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    const anterior = empRes.rows[0];

    const updateRes = await query(
      'UPDATE empresas SET plano = $1 WHERE id = $2 RETURNING id, nome, email_contato, plano, trial_expira_em',
      [plano, id]
    );
    const empresaAtualizada = updateRes.rows[0];

    await auditService.registrar(query, req.auditContext || {}, {
      escopo: 'plataforma',
      atorTipo: 'usuario_plataforma',
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'empresa_status_alterado',
      entidade: 'empresa',
      entidadeId: id,
      dadosAnteriores: { plano: anterior.plano },
      dadosNovos: { plano },
      eventoChave: `empresa_status_${id}_${Date.now()}`
    });

    res.json({
      success: true,
      data: {
        empresa: empresaAtualizada
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/empresas/:id
 * Exclusão definitiva de empresa com cascata e desvinculação segura de auditoria
 */
async function excluirEmpresa(req, res, next) {
  let client;
  try {
    const { id } = req.params;

    if (id === req.empresaId || (req.usuario && req.usuario.empresa_id === id)) {
      throw new AppError(
        'Não é permitido excluir a própria empresa da plataforma.',
        400,
        'EXCLUSAO_PROPRIA_EMPRESA_NEGADA'
      );
    }

    client = await getClient();
    await client.query('BEGIN');

    const empRes = await client.query('SELECT id, nome, email_contato FROM empresas WHERE id = $1', [
      id
    ]);
    if (!empRes.rows.length) {
      throw new NotFoundError('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    const empresa = empRes.rows[0];

    // Desvincula registros de audit_logs associados para satisfazer ON DELETE RESTRICT
    await client.query('UPDATE audit_logs SET empresa_id = NULL WHERE empresa_id = $1', [id]);

    // Registra evento de auditoria formal na plataforma ANTES de deletar a empresa
    await auditService.registrar(client, req.auditContext || {}, {
      escopo: 'plataforma',
      atorTipo: 'usuario_plataforma',
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'empresa_excluida_permanentemente',
      entidade: 'empresa',
      entidadeId: id,
      dadosAnteriores: empresa,
      eventoChave: `empresa_excluida_${id}_${Date.now()}`
    });

    // Exclui a empresa (ON DELETE CASCADE cuidará de usuários, produtos, contagens, refresh_tokens)
    await client.query('DELETE FROM empresas WHERE id = $1', [id]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Empresa e todos os dados associados foram excluídos com sucesso.'
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
}

/**
 * POST /api/empresas/:id/impersonar
 * Emite token de suporte para o Super Admin navegar diretamente no tenant
 */
async function impersonarEmpresa(req, res, next) {
  try {
    const { id } = req.params;

    const empRes = await query('SELECT id, nome, plano FROM empresas WHERE id = $1', [id]);
    if (!empRes.rows.length) {
      throw new NotFoundError('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    const empresa = empRes.rows[0];

    // Buscar o primeiro administrador ativo da empresa (ou fallback para outro usuário ativo)
    const userRes = await query(
      `SELECT id, nome, email, papel, ativo
       FROM usuarios
       WHERE empresa_id = $1 AND ativo = TRUE
       ORDER BY CASE WHEN papel = 'administrador' THEN 0 ELSE 1 END, criado_em ASC
       LIMIT 1`,
      [id]
    );

    if (!userRes.rows.length) {
      throw new NotFoundError(
        'Nenhum usuário ativo encontrado para esta empresa.',
        'USUARIO_NAO_ENCONTRADO'
      );
    }
    const targetUser = userRes.rows[0];

    const accessToken = gerarAccessToken({
      id: targetUser.id,
      empresa_id: id,
      impersonated_by: req.usuario.id
    });

    await auditService.registrar(query, req.auditContext || {}, {
      escopo: 'plataforma',
      atorTipo: 'usuario_plataforma',
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'impersonation_iniciado',
      entidade: 'empresa',
      entidadeId: id,
      dadosNovos: {
        usuario_alvo_id: targetUser.id,
        usuario_alvo_email: targetUser.email,
        empresa_alvo_nome: empresa.nome
      },
      eventoChave: `impersonation_${id}_${Date.now()}`
    });

    res.json({
      success: true,
      data: {
        accessToken,
        usuario: {
          id: targetUser.id,
          nome: targetUser.nome,
          email: targetUser.email,
          papel: targetUser.papel
        },
        empresa: {
          id: empresa.id,
          nome: empresa.nome,
          plano: empresa.plano
        },
        impersonated: true
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/empresas/:id/reset-senha-admin
 * Super Admin redefine a senha do administrador principal de uma empresa.
 * Nunca expõe chaves administrativas ao frontend.
 */
async function resetSenhaAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { novaSenha } = req.body;

    // Buscar empresa
    const empRes = await query('SELECT id, nome FROM empresas WHERE id = $1', [id]);
    if (!empRes.rows.length) {
      throw new NotFoundError('Empresa não encontrada.', 'EMPRESA_NAO_ENCONTRADA');
    }
    const empresa = empRes.rows[0];

    // Buscar o administrador principal (primeiro admin ativo, por ordem de criação)
    const adminRes = await query(
      `SELECT id, nome, email, papel
       FROM usuarios
       WHERE empresa_id = $1 AND ativo = TRUE AND papel IN ('administrador', 'gestor', 'admin')
       ORDER BY criado_em ASC
       LIMIT 1`,
      [id]
    );

    if (!adminRes.rows.length) {
      throw new NotFoundError(
        'Nenhum administrador ativo encontrado para esta empresa.',
        'ADMIN_NAO_ENCONTRADO'
      );
    }
    const admin = adminRes.rows[0];

    // Hash da nova senha com bcrypt
    const senhaHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);

    // Atualizar senha e forçar troca no próximo login
    await query(
      `UPDATE usuarios
       SET senha_hash = $1, must_change_password = TRUE, atualizado_em = NOW()
       WHERE id = $2`,
      [senhaHash, admin.id]
    );

    // Revogar todas as sessões ativas do administrador
    await query('UPDATE refresh_tokens SET revogado = TRUE WHERE usuario_id = $1', [admin.id]);

    // Auditoria: senha redefinida pelo Super Admin
    try {
      await auditService.registrarForaDaTransacao(req.auditContext || {}, {
        escopo: 'plataforma',
        atorTipo: 'usuario_plataforma',
        atorId: req.usuario.id,
        atorPapel: req.usuario.papel,
        atorRotulo: req.usuario.email,
        acao: 'senha_redefinida_por_superadmin',
        entidade: 'usuario',
        entidadeId: admin.id,
        resultado: 'sucesso',
        metadados: {
          empresa_id: empresa.id,
          empresa_nome: empresa.nome,
          admin_nome: admin.nome,
          admin_email: admin.email
        },
        eventoChave: `reset_senha_admin_${admin.id}_${Date.now()}`
      });
    } catch { /* Auditoria não deve bloquear resposta */ }

    res.json({
      success: true,
      message: `Senha do administrador "${admin.nome}" redefinida com sucesso. O usuário precisará alterá-la no próximo acesso.`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registrar,
  provisionar,
  listar,
  obterMetricasSaaS,
  obterDetalhes,
  atualizar,
  alterarStatus,
  excluirEmpresa,
  impersonarEmpresa,
  resetSenhaAdmin
};
