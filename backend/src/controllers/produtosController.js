const { query, getClient } = require('../config/db');

/**
 * GET /api/produtos
 * Lista todos os produtos ativos da empresa
 */
async function listar(req, res) {
  try {
    const result = await query(
      `SELECT id, codigo, nome, fornecedor, criado_em
       FROM produtos
       WHERE empresa_id = $1 AND ativo = TRUE
       ORDER BY fornecedor, codigo`,
      [req.empresaId]
    );

    res.json({ produtos: result.rows });
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao listar produtos.' });
  }
}

/**
 * GET /api/produtos/fornecedores
 * Lista fornecedores únicos da empresa
 */
async function listarFornecedores(req, res) {
  try {
    const result = await query(
      `SELECT DISTINCT fornecedor
       FROM produtos
       WHERE empresa_id = $1 AND ativo = TRUE
       ORDER BY fornecedor`,
      [req.empresaId]
    );

    res.json({ fornecedores: result.rows.map(r => r.fornecedor) });
  } catch (err) {
    console.error('Erro ao listar fornecedores:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao listar fornecedores.' });
  }
}

/**
 * POST /api/produtos
 * Cria um produto (gestor only)
 */
async function criar(req, res) {
  try {
    const { codigo, nome, fornecedor } = req.body;

    if (!codigo || !nome || !fornecedor) {
      return res.status(400).json({
        erro: 'CAMPOS_OBRIGATORIOS',
        mensagem: 'Código, nome e fornecedor são obrigatórios.'
      });
    }

    const result = await query(
      `INSERT INTO produtos (empresa_id, codigo, nome, fornecedor)
       VALUES ($1, $2, $3, $4)
       RETURNING id, codigo, nome, fornecedor, criado_em`,
      [req.empresaId, codigo.trim(), nome.trim(), fornecedor.trim()]
    );

    res.status(201).json({ produto: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ erro: 'CODIGO_DUPLICADO', mensagem: 'Já existe um produto com este código.' });
    }
    console.error('Erro ao criar produto:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao criar produto.' });
  }
}

/**
 * PUT /api/produtos/:id
 * Edita um produto (gestor only)
 */
async function editar(req, res) {
  try {
    const { id } = req.params;
    const { codigo, nome, fornecedor } = req.body;

    const result = await query(
      `UPDATE produtos
       SET codigo = COALESCE($1, codigo),
           nome = COALESCE($2, nome),
           fornecedor = COALESCE($3, fornecedor)
       WHERE id = $4 AND empresa_id = $5 AND ativo = TRUE
       RETURNING id, codigo, nome, fornecedor`,
      [codigo?.trim(), nome?.trim(), fornecedor?.trim(), id, req.empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'NAO_ENCONTRADO', mensagem: 'Produto não encontrado.' });
    }

    res.json({ produto: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'CODIGO_DUPLICADO', mensagem: 'Já existe um produto com este código.' });
    }
    console.error('Erro ao editar produto:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao editar produto.' });
  }
}

/**
 * DELETE /api/produtos/:id
 * Soft delete — desativa o produto (gestor only)
 */
async function desativar(req, res) {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE produtos SET ativo = FALSE WHERE id = $1 AND empresa_id = $2 RETURNING id`,
      [id, req.empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'NAO_ENCONTRADO', mensagem: 'Produto não encontrado.' });
    }

    res.json({ mensagem: 'Produto desativado com sucesso.' });
  } catch (err) {
    console.error('Erro ao desativar produto:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao desativar produto.' });
  }
}

/**
 * POST /api/produtos/importar
 * Importa array de produtos (substitui todos os ativos)
 * Usa transação: desativa antigos → insere novos
 */
async function importar(req, res) {
  const client = await getClient();

  try {
    const { produtos } = req.body;

    if (!Array.isArray(produtos) || produtos.length === 0) {
      return res.status(400).json({
        erro: 'DADOS_INVALIDOS',
        mensagem: 'Envie um array de produtos com codigo, nome e fornecedor.'
      });
    }

    // Validar cada produto
    for (const p of produtos) {
      if (!p.codigo || !p.nome || !p.fornecedor) {
        return res.status(400).json({
          erro: 'PRODUTO_INVALIDO',
          mensagem: `Produto inválido: ${JSON.stringify(p)}. Código, nome e fornecedor são obrigatórios.`
        });
      }
    }

    await client.query('BEGIN');

    // Desativar todos os produtos antigos
    await client.query(
      'UPDATE produtos SET ativo = FALSE WHERE empresa_id = $1',
      [req.empresaId]
    );

    // Inserir novos produtos
    let inseridos = 0;
    for (const p of produtos) {
      await client.query(
        `INSERT INTO produtos (empresa_id, codigo, nome, fornecedor, ativo)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (empresa_id, codigo) DO UPDATE SET
           nome = EXCLUDED.nome,
           fornecedor = EXCLUDED.fornecedor,
           ativo = TRUE`,
        [req.empresaId, p.codigo.trim(), p.nome.trim(), p.fornecedor.trim()]
      );
      inseridos++;
    }

    await client.query('COMMIT');

    res.json({
      mensagem: `${inseridos} produtos importados com sucesso.`,
      total: inseridos
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao importar produtos:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao importar produtos.' });
  } finally {
    client.release();
  }
}

module.exports = { listar, listarFornecedores, criar, editar, desativar, importar };
