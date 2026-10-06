const ExcelJS = require('exceljs');
const { serializeItem } = require('../src/serializers/contagemSerializer');
const { gerarExcelContagem } = require('../src/services/excel');
const { salvarProgressoContagemSchema } = require('../src/validators/schemas');

describe('produtos vencidos em contagem geral', () => {
  const item = { id: 'i', produto_id: 'p', codigo: 'SKU', nome: 'Produto', quantidade_contada: 10, quantidade_vencida: 4, estoque_referencia: 10, diferenca: 0, estoque_antes_baixa_vencidos: 1, quantidade_vencida_baixada: 1 };
  it('mostra vencidos durante contagem sem divulgar baixa ou estoque', () => {
    const result = serializeItem(item, { papel: 'funcionario' }, false);
    expect(result.quantidade_vencida).toBe(4);
    expect(result).not.toHaveProperty('estoque_antes_baixa_vencidos');
    expect(result).not.toHaveProperty('quantidade_vencida_baixada');
  });
  it('mostra baixa limitada no resultado final', () => {
    expect(serializeItem(item, { papel: 'funcionario' }, true)).toMatchObject({ quantidade_vencida: 4, quantidade_vencida_baixada: 1, quantidade_vencida_nao_descontada: 3, estoque_apos_baixa_vencidos: 0 });
  });
  it('inclui vencidos e observação no arquivo Excel', async () => {
    const buffer = await gerarExcelContagem([{ fornecedor: 'Produtor', ...item }], new Date());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const sheet = book.worksheets[0];
    expect(sheet.getRow(1).values).toContain('Unidades vencidas');
    expect(sheet.getRow(2).getCell(7).value).toBe(4);
    expect(sheet.getRow(2).getCell(11).value).toMatch(/3/);
  });
  it.each([
    [null, 0, true], [0, 0, true], [4, 4, true], [4, 5, false], [null, 1, false],
    [4, -1, false], [4, 1.5, false], [4, '1', false]
  ])('valida físico %s e vencidos %s (aceito: %s)', (fisico, vencidos, aceito) => {
    const result = salvarProgressoContagemSchema.body.safeParse({ fornecedor: 'Produtor', itens: [{ produto_id: '11111111-1111-4111-8111-111111111111', quantidade_contada: fisico, quantidade_vencida: vencidos }] });
    expect(result.success).toBe(aceito);
  });
});
