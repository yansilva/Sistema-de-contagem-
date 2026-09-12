const { query, getClient } = require('../config/db');
const { NotFoundError, ConflictError } = require('../errors/AppError');

/**
 * GET /api/produtos
 * Lista produtos ativos da empresa com suporte a paginação, busca e filtros
 */
async function listar(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      fornecedor,
      sort = 'fornecedor',
      order = 'asc'
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [req.empresaId];
    let whereClauses = 'WHERE empresa_id = $1 AND ativo = TRUE';

    if (search) {
      params.push(`%${search.trim()}%`);
      whereClauses += ` AND (nome ILIKE $${params.length} OR codigo ILIKE $${params.length})`;
    }

    if (fornecedor) {
      params.push(fornecedor.trim());
      whereClauses += ` AND fornecedor = $${params.length}`;
    }

    // Contagem total para paginação
    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM produtos ${whereClauses}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Ordenação segura
    const sortFieldMap = {
      nome: 'nome',
      codigo: 'codigo',
      fornecedor: 'fornecedor',
      estoque_atual: 'estoque_atual',
      criado_em: 'criado_em'
    };
    const sortCol = sortFieldMap[sort] || 'fornecedor';
    const sortDir = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    params.push(limit, offset);
    const sql = `
      SELECT id, codigo, nome, fornecedor, estoque_atual, criado_em, atualizado_em
      FROM produtos
      ${whereClauses}
      ORDER BY ${sortCol} ${sortDir}, codigo ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        produtos: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/produtos/fornecedores
 * Lista fornecedores / produtores únicos da empresa com produtos ativos
 */
async function listarFornecedores(req, res, next) {
  try {
    const result = await query(
      `SELECT DISTINCT fornecedor
       FROM produtos
       WHERE empresa_id = $1 AND ativo = TRUE
       ORDER BY fornecedor ASC`,
      [req.empresaId]
    );

    res.json({
      success: true,
      data: {
        fornecedores: result.rows.map((r) => r.fornecedor)
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/produtos
 * Cria um produto (administrador only)
 */
async function criar(req, res, next) {
  try {
    const { codigo, nome, fornecedor, estoque_atual = 0 } = req.body;

    const result = await query(
      `INSERT INTO produtos (empresa_id, codigo, nome, fornecedor, estoque_atual)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, codigo, nome, fornecedor, estoque_atual, criado_em, atualizado_em`,
      [req.empresaId, codigo.trim(), nome.trim(), fornecedor.trim(), parseInt(estoque_atual, 10) || 0]
    );

    res.status(201).json({
      success: true,
      message: 'Produto cadastrado com sucesso.',
      data: {
        produto: result.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return next(
        new ConflictError(
          'Já existe um produto com este código/SKU na sua empresa.',
          'CODIGO_DUPLICADO'
        )
      );
    }
    next(err);
  }
}

/**
 * PUT /api/produtos/:id
 * Edita um produto (administrador only)
 */
async function editar(req, res, next) {
  try {
    const { id } = req.params;
    const { codigo, nome, fornecedor, estoque_atual } = req.body;

    const updates = [];
    const params = [id, req.empresaId];

    if (codigo !== undefined && codigo.trim()) {
      params.push(codigo.trim());
      updates.push(`codigo = $${params.length}`);
    }
    if (nome !== undefined && nome.trim()) {
      params.push(nome.trim());
      updates.push(`nome = $${params.length}`);
    }
    if (fornecedor !== undefined && fornecedor.trim()) {
      params.push(fornecedor.trim());
      updates.push(`fornecedor = $${params.length}`);
    }
    if (estoque_atual !== undefined) {
      params.push(parseInt(estoque_atual, 10) || 0);
      updates.push(`estoque_atual = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: 'Nenhuma alteração enviada.' });
    }

    updates.push('atualizado_em = NOW()');

    const sql = `
      UPDATE produtos
      SET ${updates.join(', ')}
      WHERE id = $1 AND empresa_id = $2 AND ativo = TRUE
      RETURNING id, codigo, nome, fornecedor, estoque_atual, atualizado_em
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new NotFoundError('Produto não encontrado ou inativo.', 'PRODUTO_NAO_ENCONTRADO');
    }

    res.json({
      success: true,
      message: 'Produto atualizado com sucesso.',
      data: {
        produto: result.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return next(
        new ConflictError('Já existe outro produto cadastrado com este código/SKU.', 'CODIGO_DUPLICADO')
      );
    }
    next(err);
  }
}

/**
 * DELETE /api/produtos/:id
 * Soft delete — desativa o produto (administrador only)
 */
async function desativar(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE produtos
       SET ativo = FALSE, atualizado_em = NOW()
       WHERE id = $1 AND empresa_id = $2 AND ativo = TRUE
       RETURNING id`,
      [id, req.empresaId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Produto não encontrado.', 'PRODUTO_NAO_ENCONTRADO');
    }

    res.json({
      success: true,
      message: 'Produto desativado com sucesso.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/produtos/importar
 * Importa catálogo de produtos com transação segura
 */
async function importar(req, res, next) {
  const client = await getClient();

  try {
    const { produtos, modo = 'mesclar' } = req.body;

    await client.query('BEGIN');

    if (modo === 'substituir') {
      await client.query(
        'UPDATE produtos SET ativo = FALSE, atualizado_em = NOW() WHERE empresa_id = $1',
        [req.empresaId]
      );
    }

    let processados = 0;
    for (const p of produtos) {
      await client.query(
        `INSERT INTO produtos (empresa_id, codigo, nome, fornecedor, estoque_atual, ativo, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
         ON CONFLICT (empresa_id, codigo) DO UPDATE SET
           nome = EXCLUDED.nome,
           fornecedor = EXCLUDED.fornecedor,
           estoque_atual = COALESCE(EXCLUDED.estoque_atual, produtos.estoque_atual),
           ativo = TRUE,
           atualizado_em = NOW()`,
        [req.empresaId, p.codigo.trim(), p.nome.trim(), p.fornecedor.trim(), p.estoque_atual || 0]
      );
      processados++;
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `${processados} produto(s) importado(s) com sucesso no modo '${modo}'.`,
      data: {
        totalProcessados: processados,
        modo
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { listar, listarFornecedores, criar, editar, desativar, importar };
