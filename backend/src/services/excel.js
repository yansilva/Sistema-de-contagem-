const ExcelJS = require('exceljs');

/**
 * Gera planilha Excel com diferenças de estoque
 * @param {Array} itens - Array de objetos { fornecedor, codigo, nome, estoque_referencia, quantidade_contada, diferenca }
 * @param {Date|string} data - Data da contagem
 * @returns {Buffer} Buffer do arquivo .xlsx
 */
async function gerarExcelContagem(itens, _data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Estoque SaaS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Diferenças de Estoque', {
    properties: { tabColor: { argb: 'FFDC2626' } }
  });

  // Definir colunas
  sheet.columns = [
    { header: 'Fornecedor', key: 'fornecedor', width: 28 },
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Produto', key: 'nome', width: 38 },
    { header: 'Estoque de Referência', key: 'estoque_referencia', width: 22 },
    { header: 'Contagem Física', key: 'quantidade_contada', width: 18 },
    { header: 'Diferença', key: 'diferenca', width: 14 },
    { header: 'Unidades vencidas', key: 'quantidade_vencida', width: 20 },
    { header: 'Baixa efetiva', key: 'quantidade_vencida_baixada', width: 18 },
    { header: 'Estoque antes da baixa', key: 'estoque_antes_baixa_vencidos', width: 24 },
    { header: 'Estoque após a baixa', key: 'estoque_apos_baixa_vencidos', width: 24 },
    { header: 'Observação', key: 'observacao', width: 36 }
  ];

  // Estilo do cabeçalho
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  // Adicionar dados com linhas zebradas
  itens.forEach((item, index) => {
    const row = sheet.addRow({
      fornecedor: item.fornecedor,
      codigo: item.codigo,
      nome: item.nome,
      estoque_referencia: Number(item.estoque_referencia),
      quantidade_contada: Number(item.quantidade_contada),
      diferenca: Number(item.diferenca),
      quantidade_vencida: Number(item.quantidade_vencida || 0),
      quantidade_vencida_baixada: item.quantidade_vencida_baixada == null ? null : Number(item.quantidade_vencida_baixada),
      estoque_antes_baixa_vencidos: item.estoque_antes_baixa_vencidos == null ? null : Number(item.estoque_antes_baixa_vencidos),
      estoque_apos_baixa_vencidos: item.estoque_antes_baixa_vencidos == null ? null : Math.max(0, Number(item.estoque_antes_baixa_vencidos) - Number(item.quantidade_vencida_baixada || 0)),
      observacao: Number(item.quantidade_vencida || 0) > Number(item.quantidade_vencida_baixada || 0) ? `Baixa limitada: ${Number(item.quantidade_vencida || 0) - Number(item.quantidade_vencida_baixada || 0)} unidade(s) não descontada(s)` : ''
    });

    // Linha zebrada
    if (index % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
    }

    // Diferença colorida
    const diffCell = row.getCell('diferenca');
    if (item.diferenca < 0) {
      diffCell.font = { bold: true, color: { argb: 'FFDC2626' } };
    } else if (item.diferenca > 0) {
      diffCell.font = { bold: true, color: { argb: 'FF16A34A' } };
    }

    // Alinhamento numérico
    row.getCell('estoque_referencia').alignment = { horizontal: 'center' };
    row.getCell('quantidade_contada').alignment = { horizontal: 'center' };
    diffCell.alignment = { horizontal: 'center' };
  });

  // Bordas finas em todas as células
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // Auto-filter
  sheet.autoFilter = {
    from: 'A1',
    to: `K${itens.length + 1}`
  };

  // Congelar cabeçalho
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { gerarExcelContagem };
