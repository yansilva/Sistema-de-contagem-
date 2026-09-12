const { query, getClient } = require('../config/db');
const { ValidationError, NotFoundError } = require('../errors/AppError');
const { processarPdfEstoque } = require('../services/pdfStockImportService');

/**
 * POST /api/estoque/upload-pdf
 * ETAPA 1: Processa o relatório PDF do Tiny e retorna a PRÉVIA.
 * NÃO altera o banco de dados antes da confirmação explícita.
 */
async function uploadPdf(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      throw new ValidationError('Nenhum arquivo PDF foi enviado.', 'ARQUIVO_OBRIGATORIO');
    }

    // Buscar produtos já cadastrados na empresa
    const produtosDb = await query(
      `SELECT id, codigo, nome, fornecedor, estoque_atual
       FROM produtos
       WHERE empresa_id = $1 AND ativo = TRUE`,
      [req.empresaId]
    );

    const previa = await processarPdfEstoque(
      req.file.buffer,
      req.file.originalname,
      produtosDb.rows
    );

    res.json({
      success: true,
      message: 'Relatório PDF processado com sucesso. Prévia pronta para conferência.',
      data: previa
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/estoque/confirmar-atualizacao
 * ETAPA 2: Confirmação da prévia e atualização atômica do estoque atual no banco.
 */
async function confirmarAtualizacao(req, res, next) {
  const client = await getClient();

  try {
    const {
      nome_arquivo,
      atualizacoes,
      produtos_encontrados = 0,
      linhas_ignoradas = 0,
      skus_nao_encontrados = []
    } = req.body;

    if (!Array.isArray(atualizacoes) || atualizacoes.length === 0) {
      throw new ValidationError(
        'Nenhum produto válido para atualização foi fornecido.',
        'SEM_ATUALIZACOES'
      );
    }

    await client.query('BEGIN');

    let produtosAtualizados = 0;

    for (const item of atualizacoes) {
      const resUpdate = await client.query(
        `UPDATE produtos
         SET estoque_atual = $1, atualizado_em = NOW()
         WHERE empresa_id = $2 AND codigo = $3 AND ativo = TRUE
         RETURNING id`,
        [item.estoque_atual, req.empresaId, item.codigo.trim()]
      );

      if (resUpdate.rows.length > 0) {
        produtosAtualizados++;
      }
    }

    // Registrar no histórico de importações
    await client.query(
      `INSERT INTO historico_importacao_estoque
       (empresa_id, usuario_id, nome_arquivo, produtos_encontrados, produtos_atualizados, skus_nao_encontrados, linhas_ignoradas, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluido')`,
      [
        req.empresaId,
        req.usuario.id,
        nome_arquivo || 'relatorio_tiny.pdf',
        produtos_encontrados,
        produtosAtualizados,
        JSON.stringify(skus_nao_encontrados),
        linhas_ignoradas
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Estoque atualizado com sucesso para ${produtosAtualizados} produto(s).`,
      data: {
        produtos_atualizados: produtosAtualizados,
        skus_pendentes: skus_nao_encontrados.length
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/estoque/historico
 * Lista histórico de importações de estoque do Tiny da empresa
 */
async function listarHistorico(req, res, next) {
  try {
    const result = await query(
      `SELECT h.id, h.nome_arquivo, h.produtos_encontrados, h.produtos_atualizados,
              h.skus_nao_encontrados, h.linhas_ignoradas, h.status, h.criado_em,
              u.nome AS usuario_nome
       FROM historico_importacao_estoque h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.empresa_id = $1
       ORDER BY h.criado_em DESC
       LIMIT 50`,
      [req.empresaId]
    );

    res.json({
      success: true,
      data: {
        historico: result.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadPdf,
  confirmarAtualizacao,
  listarHistorico
};
