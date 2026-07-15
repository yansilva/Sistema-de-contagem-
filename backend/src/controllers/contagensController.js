const { query, getClient } = require('../config/db');

/**
 * POST /api/contagens
 * Inicia nova contagem, retorna o ID
 */
async function iniciar(req, res) {
  try {
    const result = await query(
      `INSERT INTO contagens (empresa_id, iniciado_por, status)
       VALUES ($1, $2, 'em_andamento')
       RETURNING id, iniciado_em, status`,
      [req.empresaId, req.usuario.id]
    );

    res.status(201).json({ contagem: result.rows[0] });
  } catch (err) {
    console.error('Erro ao iniciar contagem:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao iniciar contagem.' });
  }
}

/**
 * POST /api/contagens/:id/fornecedor
 * Adiciona fornecedor contado à contagem
 */
async function adicionarFornecedor(req, res) {
  const client = await getClient();

  try {
    const { id } = req.params;
    const { fornecedor, tem_diferenca, produtos } = req.body;

    if (!fornecedor || !Array.isArray(produtos)) {
      return res.status(400).json({
        erro: 'DADOS_INVALIDOS',
        mensagem: 'Fornecedor e array de produtos são obrigatórios.'
      });
    }

    // Verificar se a contagem pertence à empresa e está em andamento
    const contagem = await client.query(
      `SELECT id FROM contagens
       WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'`,
      [id, req.empresaId]
    );

    if (contagem.rows.length === 0) {
      client.release();
      return res.status(404).json({
        erro: 'NAO_ENCONTRADO',
        mensagem: 'Contagem não encontrada ou já finalizada.'
      });
    }

    await client.query('BEGIN');

    // Inserir fornecedor
    const fornResult = await client.query(
      `INSERT INTO contagem_fornecedores (contagem_id, fornecedor, tem_diferenca)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [id, fornecedor, tem_diferenca || false]
    );

    const fornecedorId = fornResult.rows[0].id;

    // Inserir itens do fornecedor
    for (const p of produtos) {
      await client.query(
        `INSERT INTO contagem_itens
         (contagem_fornecedor_id, produto_id, codigo, nome, qty_tiny, qty_contagem, diferenca, sem_diferenca)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          fornecedorId,
          p.produto_id || null,
          p.codigo,
          p.nome,
          p.qty_tiny || 0,
          p.qty_contagem || 0,
          p.diferenca || 0,
          p.sem_diferenca !== undefined ? p.sem_diferenca : true
        ]
      );
    }

    // Se teve diferença, marcar na contagem
    if (tem_diferenca) {
      await client.query(
        'UPDATE contagens SET tem_diferenca = TRUE WHERE id = $1',
        [id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      mensagem: 'Fornecedor registrado com sucesso.',
      contagem_fornecedor_id: fornecedorId
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar fornecedor:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao registrar fornecedor.' });
  } finally {
    client.release();
  }
}

/**
 * PUT /api/contagens/:id/finalizar
 * Finaliza a contagem
 */
async function finalizar(req, res) {
  try {
    const { id } = req.params;

    // Verificar se tem fornecedores contados
    const fornecedores = await query(
      'SELECT COUNT(*) AS total FROM contagem_fornecedores WHERE contagem_id = $1',
      [id]
    );

    if (parseInt(fornecedores.rows[0].total) === 0) {
      return res.status(400).json({
        erro: 'SEM_FORNECEDORES',
        mensagem: 'Nenhum fornecedor foi contado nesta sessão.'
      });
    }

    const result = await query(
      `UPDATE contagens
       SET status = 'finalizada', finalizado_em = NOW()
       WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'
       RETURNING id, iniciado_em, finalizado_em, tem_diferenca, status`,
      [id, req.empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'NAO_ENCONTRADO',
        mensagem: 'Contagem não encontrada ou já finalizada.'
      });
    }

    res.json({ contagem: result.rows[0] });
  } catch (err) {
    console.error('Erro ao finalizar contagem:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao finalizar contagem.' });
  }
}

/**
 * GET /api/contagens
 * Lista histórico de contagens (gestor)
 */
async function listar(req, res) {
  try {
    // Buscar contagens
    const contagens = await query(
      `SELECT c.id, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
              u.nome AS iniciado_por_nome
       FROM contagens c
       LEFT JOIN usuarios u ON u.id = c.iniciado_por
       WHERE c.empresa_id = $1 AND c.status = 'finalizada'
       ORDER BY c.finalizado_em DESC`,
      [req.empresaId]
    );

    // Para cada contagem, buscar fornecedores
    const resultado = [];
    for (const c of contagens.rows) {
      const fornecedores = await query(
        `SELECT id, fornecedor, tem_diferenca, contado_em
         FROM contagem_fornecedores
         WHERE contagem_id = $1
         ORDER BY contado_em`,
        [c.id]
      );

      resultado.push({
        ...c,
        fornecedores: fornecedores.rows
      });
    }

    res.json({ contagens: resultado });
  } catch (err) {
    console.error('Erro ao listar contagens:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao listar contagens.' });
  }
}

/**
 * GET /api/contagens/:id
 * Detalhe completo de uma contagem (gestor)
 */
async function detalhe(req, res) {
  try {
    const { id } = req.params;

    // Buscar contagem
    const contagem = await query(
      `SELECT c.id, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
              u.nome AS iniciado_por_nome
       FROM contagens c
       LEFT JOIN usuarios u ON u.id = c.iniciado_por
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [id, req.empresaId]
    );

    if (contagem.rows.length === 0) {
      return res.status(404).json({ erro: 'NAO_ENCONTRADO', mensagem: 'Contagem não encontrada.' });
    }

    // Buscar fornecedores com itens
    const fornecedores = await query(
      `SELECT id, fornecedor, tem_diferenca, contado_em
       FROM contagem_fornecedores
       WHERE contagem_id = $1
       ORDER BY contado_em`,
      [id]
    );

    const fornecedoresComItens = [];
    for (const f of fornecedores.rows) {
      const itens = await query(
        `SELECT id, produto_id, codigo, nome, qty_tiny, qty_contagem, diferenca, sem_diferenca
         FROM contagem_itens
         WHERE contagem_fornecedor_id = $1
         ORDER BY codigo`,
        [f.id]
      );

      fornecedoresComItens.push({
        ...f,
        produtos: itens.rows
      });
    }

    res.json({
      contagem: {
        ...contagem.rows[0],
        fornecedores: fornecedoresComItens
      }
    });
  } catch (err) {
    console.error('Erro ao buscar detalhe da contagem:', err);
    res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro ao buscar contagem.' });
  }
}

module.exports = { iniciar, adicionarFornecedor, finalizar, listar, detalhe };
