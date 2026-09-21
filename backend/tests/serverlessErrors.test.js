describe('Falha de inicialização serverless', () => {
  it('não expõe stack nem diagnóstico interno ao cliente', () => {
    jest.resetModules();
    jest.doMock('../src/app', () => { throw new Error('synthetic-private-database-url'); });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const handler = require('../../api/index');
    const res = { setHeader: jest.fn(), end: jest.fn() };
    handler({ url: '/api/empresas' }, res);
    expect(res.statusCode).toBe(500);
    expect(res.end.mock.calls[0][0]).not.toContain('synthetic-private');
    expect(JSON.parse(res.end.mock.calls[0][0])).not.toHaveProperty('stack');
    log.mockRestore();
    jest.dontMock('../src/app');
  });
});
