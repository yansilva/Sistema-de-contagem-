const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors/AppError');
const auditService = require('../services/auditService');

const SALT_ROUNDS = 12;

/**
 * GET /api/usuarios
 * Lista os usuários da empresa autenticada (isolamento multi-tenant)
 */
async function listar(req, res, next) {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT id, nome, email, papel, ativo, must_change_password, criado_em, atualizado_em
      FROM usuarios
      WHERE empresa_id = $1
    `;
    const params = [req.empresaId];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(nome) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }

    // Contagem total para paginação
    const countSql = sql.replace(
      'SELECT id, nome, email, papel, ativo, must_change_password, criado_em, atualizado_em',
      'SELECT COUNT(*)::int AS total'
    );
    const countRes = await query(countSql, params);
    const total = countRes.rows[0]?.total || 0;

    sql += ` ORDER BY criado_em DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offset);

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        usuarios: result.rows,
        paginacao: {
          total,
          pagina: pageNum,
          limite: limitNum,
          totalPaginas: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/usuarios
 * Cadastra novo funcionário com senha temporária (must_change_password = true)
 */
async function criar(req, res, next) {
  try {
    const { nome, email, papel = 'funcionario', senha_temporaria } = req.body;
    const emailNorm = email.toLowerCase().trim();

    if (papel && papel.toLowerCase() === 'super_admin') {
      throw new ForbiddenError(
        'Permissão negada: administradores de organização não podem conceder papel de super_admin.',
        'CONCESSAO_SUPERADMIN_PROIBIDA'
      );
    }

    // Verificar unicidade global de email
    const emailExiste = await query('SELECT id FROM usuarios WHERE email = $1', [emailNorm]);
    if (emailExiste.rows.length > 0) {
      throw new ConflictError('Já existe um usuário com este email.', 'EMAIL_EXISTENTE');
    }

    const senhaHash = await bcrypt.hash(senha_temporaria, SALT_ROUNDS);

    const result = await query(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel, ativo, must_change_password)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
       RETURNING id, nome, email, papel, ativo, must_change_password, criado_em`,
      [req.empresaId, nome.trim(), emailNorm, senhaHash, papel]
    );

    res.status(201).json({
      success: true,
      message: 'Usuário cadastrado com sucesso. O primeiro acesso exigirá a troca da senha temporária.',
      data: {
        usuario: result.rows[0]
      }
    });

    // Auditoria: usuário criado (fora da transação pois a criação já foi commitada)
    try {
      await auditService.registrarForaDaTransacao(req.auditContext || {}, {
        empresaId: req.empresaId,
        atorId: req.usuario.id,
        atorPapel: req.usuario.papel,
        atorRotulo: req.usuario.email,
        acao: 'usuario_criado',
        entidade: 'usuario',
        entidadeId: result.rows[0].id,
        dadosNovos: { nome: result.rows[0].nome, email: result.rows[0].email, papel: result.rows[0].papel },
        whitelistCampos: ['nome', 'email', 'papel'],
        eventoChave: `usuario_criado_${result.rows[0].id}`
      });
    } catch { /* Auditoria não deve bloquear resposta */ }
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/usuarios/:id
 * Edita dados de um usuário da empresa
 */
async function editar(req, res, next) {
  try {
    const { id } = req.params;
    const { nome, papel } = req.body;

    const userCheck = await query(
      'SELECT id, papel FROM usuarios WHERE id = $1 AND empresa_id = $2',
      [id, req.empresaId]
    );

    if (userCheck.rows.length === 0) {
      throw new NotFoundError('Usuário não encontrado nesta empresa.', 'USUARIO_NAO_ENCONTRADO');
    }

    const updates = [];
    const params = [id, req.empresaId];

    if (nome && nome.trim()) {
      params.push(nome.trim());
      updates.push(`nome = $${params.length}`);
    }
    if (papel) {
      if (papel.toLowerCase() === 'super_admin') {
        throw new ForbiddenError(
          'Permissão negada: administradores de organização não podem conceder papel de super_admin.',
          'CONCESSAO_SUPERADMIN_PROIBIDA'
        );
      }

      const roleAtual = (userCheck.rows[0].papel || '').toLowerCase();
      const isCurrentAdmin = ['administrador', 'gestor', 'admin'].includes(roleAtual);
      const isNewAdmin = ['administrador', 'gestor', 'admin'].includes(papel.toLowerCase());

      if (isCurrentAdmin && !isNewAdmin) {
        const adminsAtivos = await query(
          `SELECT COUNT(*)::int AS total
           FROM usuarios
           WHERE empresa_id = $1 AND ativo = TRUE AND papel IN ('administrador', 'gestor', 'admin')`,
          [req.empresaId]
        );
        const totalAdmins = adminsAtivos.rows[0]?.total || 0;
        if (totalAdmins <= 1) {
          throw new ConflictError(
            'Operação não permitida: não é possível rebaixar o único administrador ativo da organização.',
            'ULTIMO_ADMIN_PROIBIDO'
          );
        }
      }

      params.push(papel);
      updates.push(`papel = $${params.length}`);
    }

    if (updates.length === 0) {
      throw new ValidationError('Nenhum campo para atualização informado.', 'SEM_ALTERACOES');
    }

    updates.push('atualizado_em = NOW()');

    const sql = `
      UPDATE usuarios
      SET ${updates.join(', ')}
      WHERE id = $1 AND empresa_id = $2
      RETURNING id, nome, email, papel, ativo, must_change_password, atualizado_em
    `;

    const result = await query(sql, params);

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso.',
      data: {
        usuario: result.rows[0]
      }
    });

    // Auditoria: usuário editado
    try {
      await auditService.registrarForaDaTransacao(req.auditContext || {}, {
        empresaId: req.empresaId,
        atorId: req.usuario.id,
        atorPapel: req.usuario.papel,
        atorRotulo: req.usuario.email,
        acao: 'usuario_editado',
        entidade: 'usuario',
        entidadeId: id,
        dadosAnteriores: { papel: userCheck.rows[0].papel },
        dadosNovos: { nome: result.rows[0].nome, papel: result.rows[0].papel },
        whitelistCampos: ['nome', 'papel'],
        eventoChave: `usuario_editado_${id}`
      });
    } catch { /* Auditoria não deve bloquear resposta */ }
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/usuarios/:id/status
 * Ativa ou desativa um usuário da empresa
 */
async function alternarStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { ativo } = req.body;

    if (req.usuario.id === id && ativo === false) {
      throw new ConflictError(
        'Você não pode desativar seu próprio usuário de administrador.',
        'AUTO_DESATIVACAO_PROIBIDA'
      );
    }

    if (ativo === false) {
      const userCheck = await query(
        'SELECT papel, ativo FROM usuarios WHERE id = $1 AND empresa_id = $2',
        [id, req.empresaId]
      );
      if (userCheck.rows.length === 0) {
        throw new NotFoundError('Usuário não encontrado nesta empresa.', 'USUARIO_NAO_ENCONTRADO');
      }

      const roleAtual = (userCheck.rows[0].papel || '').toLowerCase();
      const isCurrentAdmin = ['administrador', 'gestor', 'admin'].includes(roleAtual);
      const isUserAtivo = userCheck.rows[0].ativo !== false;

      if (isCurrentAdmin && isUserAtivo) {
        const adminsAtivos = await query(
          `SELECT COUNT(*)::int AS total
           FROM usuarios
           WHERE empresa_id = $1 AND ativo = TRUE AND papel IN ('administrador', 'gestor', 'admin')`,
          [req.empresaId]
        );
        const totalAdmins = adminsAtivos.rows[0]?.total || 0;
        if (totalAdmins <= 1) {
          throw new ConflictError(
            'Operação não permitida: não é possível desativar o único administrador ativo da organização.',
            'ULTIMO_ADMIN_PROIBIDO'
          );
        }
      }
    }

    const result = await query(
      `UPDATE usuarios
       SET ativo = $1, atualizado_em = NOW()
       WHERE id = $2 AND empresa_id = $3
       RETURNING id, nome, email, papel, ativo`,
      [Boolean(ativo), id, req.empresaId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Usuário não encontrado nesta empresa.', 'USUARIO_NAO_ENCONTRADO');
    }

    // Se desativado, revogar todas as sessões ativas
    if (!ativo) {
      await query('UPDATE refresh_tokens SET revogado = TRUE WHERE usuario_id = $1', [id]);
    }

    res.json({
      success: true,
      message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso.`,
      data: {
        usuario: result.rows[0]
      }
    });

    // Auditoria: status do usuário alterado
    try {
      await auditService.registrarForaDaTransacao(req.auditContext || {}, {
        empresaId: req.empresaId,
        atorId: req.usuario.id,
        atorPapel: req.usuario.papel,
        atorRotulo: req.usuario.email,
        acao: ativo ? 'usuario_ativado' : 'usuario_desativado',
        entidade: 'usuario',
        entidadeId: id,
        dadosNovos: { ativo: Boolean(ativo), nome: result.rows[0].nome, papel: result.rows[0].papel },
        whitelistCampos: ['ativo', 'nome', 'papel'],
        eventoChave: `usuario_status_${id}_${Date.now()}`
      });
    } catch { /* Auditoria não deve bloquear resposta */ }
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/usuarios/:id/reset-senha
 * Administrador redefine a senha com uma nova senha temporária
 */
async function resetarSenha(req, res, next) {
  try {
    const { id } = req.params;
    const { novaSenhaTemporaria } = req.body;

    const senhaHash = await bcrypt.hash(novaSenhaTemporaria, SALT_ROUNDS);

    const result = await query(
      `UPDATE usuarios
       SET senha_hash = $1, must_change_password = TRUE, atualizado_em = NOW()
       WHERE id = $2 AND empresa_id = $3
       RETURNING id, nome, email, papel, must_change_password`,
      [senhaHash, id, req.empresaId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Usuário não encontrado nesta empresa.', 'USUARIO_NAO_ENCONTRADO');
    }

    // Revoga tokens anteriores para forçar novo login com a temporária
    await query('UPDATE refresh_tokens SET revogado = TRUE WHERE usuario_id = $1', [id]);

    res.json({
      success: true,
      message: 'Senha temporária redefinida com sucesso. O usuário precisará alterá-la no próximo acesso.'
    });

    // Auditoria: senha redefinida pelo administrador
    try {
      await auditService.registrarForaDaTransacao(req.auditContext || {}, {
        escopo: 'seguranca',
        empresaId: req.empresaId,
        atorId: req.usuario.id,
        atorPapel: req.usuario.papel,
        atorRotulo: req.usuario.email,
        acao: 'senha_redefinida',
        entidade: 'usuario',
        entidadeId: id,
        resultado: 'sucesso',
        metadados: { alvo_nome: result.rows[0].nome, alvo_email: result.rows[0].email },
        eventoChave: `senha_redefinida_${id}_${Date.now()}`
      });
    } catch { /* Auditoria não deve bloquear resposta */ }
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listar,
  criar,
  editar,
  alternarStatus,
  resetarSenha
};
