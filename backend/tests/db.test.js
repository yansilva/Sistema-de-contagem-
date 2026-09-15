describe('PostgreSQL operacional sem fallback para memória', () => {
  let originalEnv;
  let pgPool;
  let db;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    pgPool = { query: jest.fn(), connect: jest.fn(), on: jest.fn() };
    jest.resetModules();
    jest.doMock('pg', () => ({ Pool: jest.fn(() => pgPool) }));
    db = require('../src/config/db');
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.dontMock('pg');
    jest.resetModules();
  });

  it('informa indisponibilidade em vez de credenciais inválidas e tenta reconectar na próxima consulta', async () => {
    pgPool.query
      .mockRejectedValueOnce(
        Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
      )
      .mockResolvedValueOnce({ rows: [{ id: 'usuario-persistido' }] });
    await expect(db.query('SELECT id FROM usuarios')).rejects.toMatchObject({
      statusCode: 503,
      code: 'BANCO_INDISPONIVEL'
    });
    await expect(db.query('SELECT id FROM usuarios')).resolves.toEqual({
      rows: [{ id: 'usuario-persistido' }]
    });
    expect(pgPool.query).toHaveBeenCalledTimes(2);
  });

  it('não permite provisionamento em memória quando a conexão falha', async () => {
    pgPool.connect.mockRejectedValue(
      Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
    );
    await expect(db.getClient()).rejects.toMatchObject({
      statusCode: 503,
      code: 'BANCO_INDISPONIVEL'
    });
  });

  it('preserva erros de integridade do PostgreSQL', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
    pgPool.query.mockRejectedValue(duplicate);
    await expect(db.query('INSERT')).rejects.toBe(duplicate);
  });
});
