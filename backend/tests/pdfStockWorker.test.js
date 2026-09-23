describe('Leitura de PDF em ambiente serverless', () => {
  it('configura o worker empacotado e o canvas antes de abrir o relatório', async () => {
    jest.resetModules();
    const getText = jest.fn().mockResolvedValue({ text: '001 Produto UN 5' });
    const destroy = jest.fn().mockResolvedValue();
    const CanvasFactory = jest.fn();
    const PDFParse = jest.fn().mockImplementation(() => ({ getText, destroy }));
    PDFParse.setWorker = jest.fn();
    jest.doMock('pdf-parse/worker', () => ({ CanvasFactory, getData: () => 'data:text/javascript;base64,d29ya2Vy' }));
    jest.doMock('pdf-parse', () => ({ PDFParse }));

    const { processarPdfEstoque } = require('../src/services/pdfStockImportService');
    await processarPdfEstoque(Buffer.from('pdf'), 'estoque.pdf', []);

    expect(PDFParse.setWorker).toHaveBeenCalledWith('data:text/javascript;base64,d29ya2Vy');
    expect(PDFParse).toHaveBeenCalledWith(expect.objectContaining({ CanvasFactory }));
    expect(getText).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
