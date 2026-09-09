const { query, getClient } = require('../config/db');
const { NotFoundError, ValidationError, ConflictError } = require('../errors/AppError');

/**
 * POST /api/contagens
 * Inicia nova sessão de contagem
 */
async function iniciar(req, res, next) {
  try {
    const result = await query(
      `INSERT INTO contagens (empresa_id, iniciado_por, status)
       VALUES ($1, $2, 'em_andamento')
       RETURNING id, iniciado_em, status`,
      [req.empresaId, req.usuario.id]
    );

    res.status(201).json({
      success: true,
      message: 'Sessão de contagem iniciada com sucesso.',
      data: {
        contagem: result.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/contagens/:id/fornecedor
 * Registra a contagem de um fornecedor
 */
async function adicionarFornecedor(req, res, next) {
  const client = await getClient();

  try {
    const { id } = req.params;
    const { fornecedor, tem_diferenca = false, produtos } = req.body;

    // Verificar se a contagem pertence à empresa e está em andamento
    const contagemResult = await client.query(
      `SELECT id FROM contagens
       WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'`,
      [id, req.empresaId]
    );

    if (contagemResult.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada, finalizada ou sem permissão de acesso.',
        'CONTAGEM_INVALIDA'
      );
    }

    // Verificar se fornecedor já foi contado nesta sessão
    const fornExistente = await client.query(
      `SELECT id FROM contagem_fornecedores WHERE contagem_id = $1 AND fornecedor = $2`,
      [id, fornecedor.trim()]
    );
    if (fornExistente.rows.length > 0) {
      throw new ConflictError(
        `O fornecedor '${fornecedor}' já foi registrado nesta sessão de contagem.`,
        'FORNECEDOR_JA_REGISTRADO'
      );
    }

    await client.query('BEGIN');

    // Inserir fornecedor
    const fornResult = await client.query(
      `INSERT INTO contagem_fornecedores (contagem_id, fornecedor, tem_diferenca)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [id, fornecedor.trim(), Boolean(tem_diferenca)]
    );
    const fornecedorId = fornResult.rows[0].id;

    // Inserir itens contados
    for (const p of produtos) {
      await client.query(
        `INSERT INTO contagem_itens
         (contagem_fornecedor_id, produto_id, codigo, nome, qty_tiny, qty_contagem, diferenca, sem_diferenca)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          fornecedorId,
          p.produto_id || null,
          p.codigo.trim(),
          p.nome.trim(),
          p.qty_tiny || 0,
          p.qty_contagem || 0,
          p.diferenca || 0,
          Boolean(p.sem_diferenca)
        ]
      );
    }

    // Atualizar flag global de diferença na contagem
    if (tem_diferenca) {
      await client.query('UPDATE contagens SET tem_diferenca = TRUE WHERE id = $1', [id]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Contagem do fornecedor '${fornecedor}' registrada com sucesso.`,
      data: {
        contagem_fornecedor_id: fornecedorId
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return next(
        new ConflictError(`Fornecedor já registrado nesta contagem.`, 'FORNECEDOR_DUPLICADO')
      );
    }
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/contagens/:id/finalizar
 * Finaliza uma contagem em andamento
 */
async function finalizar(req, res, next) {
  try {
    const { id } = req.params;

    // Verificar se possui ao menos um fornecedor contado
    const fornCheck = await query(
      'SELECT COUNT(*)::int AS total FROM contagem_fornecedores WHERE contagem_id = $1',
      [id]
    );

    if (fornCheck.rows[0].total === 0) {
      throw new ValidationError(
        'Nenhum fornecedor foi registrado nesta contagem. Realize ao menos uma contagem antes de finalizar.',
        'SEM_FORNECEDORES'
      );
    }

    const result = await query(
      `UPDATE contagens
       SET status = 'finalizada', finalizado_em = NOW()
       WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'
       RETURNING id, iniciado_em, finalizado_em, tem_diferenca, status`,
      [id, req.empresaId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada ou já finalizada.',
        'CONTAGEM_NAO_ENCONTRADA'
      );
    }

    res.json({
      success: true,
      message: 'Contagem finalizada com sucesso.',
      data: {
        contagem: result.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/contagens
 * Lista histórico de contagens comagregação JSON em query única (sem N+1)
 */
async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Query otimizada: 1 única query resolvendo contagens + fornecedores via json_agg
    const sql = `
      SELECT c.id, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
             u.nome AS iniciado_por_nome,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', cf.id,
                   'fornecedor', cf.fornecedor,
                   'tem_diferenca', cf.tem_diferenca,
                   'contado_em', cf.contado_em
                 ) ORDER BY cf.contado_em ASC
               ) FILTER (WHERE cf.id IS NOT NULL),
               '[]'
             ) AS fornecedores
      FROM contagens c
      LEFT JOIN usuarios u ON u.id = c.iniciado_por
      LEFT JOIN contagem_fornecedores cf ON cf.contagem_id = c.id
      WHERE c.empresa_id = $1 AND c.status = 'finalizada'
      GROUP BY c.id, u.nome
      ORDER BY c.finalizado_em DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [req.empresaId, limit, offset]);

    res.json({
      success: true,
      data: {
        contagens: result.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/contagens/:id
 * Detalhes completos de uma contagem com fornecedores e itens agrupados em query única (sem N+1)
 */
async function detalhe(req, res, next) {
  try {
    const { id } = req.params;

    // Buscar contagem
    const contagemResult = await query(
      `SELECT c.id, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
              u.nome AS iniciado_por_nome
       FROM contagens c
       LEFT JOIN usuarios u ON u.id = c.iniciado_por
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [id, req.empresaId]
    );

    if (contagemResult.rows.length === 0) {
      throw new NotFoundError('Contagem não encontrada.', 'CONTAGEM_NAO_ENCONTRADA');
    }

    // Buscar fornecedores com seus respectivos itens em uma única query agregada
    const sql = `
      SELECT cf.id, cf.fornecedor, cf.tem_diferenca, cf.contado_em,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', ci.id,
                   'produto_id', ci.produto_id,
                   'codigo', ci.codigo,
                   'nome', ci.nome,
                   'qty_tiny', ci.qty_tiny,
                   'qty_contagem', ci.qty_contagem,
                   'diferenca', ci.diferenca,
                   'sem_diferenca', ci.sem_diferenca
                 ) ORDER BY ci.codigo ASC
               ) FILTER (WHERE ci.id IS NOT NULL),
               '[]'
             ) AS produtos
      FROM contagem_fornecedores cf
      LEFT JOIN contagem_itens ci ON ci.contagem_fornecedor_id = cf.id
      WHERE cf.contagem_id = $1
      GROUP BY cf.id
      ORDER BY cf.contado_em ASC
    `;

    const fornecedoresResult = await query(sql, [id]);

    res.json({
      success: true,
      data: {
        contagem: {
          ...contagemResult.rows[0],
          fornecedores: fornecedoresResult.rows
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { iniciar, adicionarFornecedor, finalizar, listar, detalhe };
