const { query } = require('../config/db');
const { gerarExcelContagem } = require('../services/excel');
const { NotFoundError, ValidationError } = require('../errors/AppError');

/**
 * GET /api/relatorios/contagens/:id/excel
 * Gera e retorna arquivo .xlsx com as diferenças de uma contagem
 */
async function excelContagem(req, res, next) {
  try {
    const { id } = req.params;

    // Verificar se a contagem pertence à empresa
    const contagem = await query(
      `SELECT c.id, c.finalizado_em, c.tem_diferenca
       FROM contagens c
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [id, req.empresaId]
    );

    if (contagem.rows.length === 0) {
      throw new NotFoundError('Contagem não encontrada.', 'CONTAGEM_NAO_ENCONTRADA');
    }

    // Buscar fornecedores e itens com diferença
    const itens = await query(
      `SELECT cf.fornecedor, ci.codigo, ci.nome, ci.qty_tiny, ci.qty_contagem, ci.diferenca
       FROM contagem_itens ci
       JOIN contagem_fornecedores cf ON cf.id = ci.contagem_fornecedor_id
       WHERE cf.contagem_id = $1 AND ci.sem_diferenca = FALSE AND ci.diferenca != 0
       ORDER BY cf.fornecedor, ci.codigo`,
      [id]
    );

    if (itens.rows.length === 0) {
      throw new ValidationError(
        'Esta contagem não possui divergências de estoque para exportação.',
        'SEM_DIFERENCAS'
      );
    }

    // Gerar Excel
    const data = contagem.rows[0].finalizado_em || new Date();
    const buffer = await gerarExcelContagem(itens.rows, data);

    // Formatar nome do arquivo
    const d = new Date(data);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const aaaa = d.getFullYear();
    const nomeArquivo = `diferenca_estoque_${dd}_${mm}_${aaaa}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = { excelContagem };
