const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const request = require('supertest');
const enabled = Boolean(process.env.TEST_DATABASE_URL);
const integration = enabled ? describe : describe.skip;
let mockPool;
jest.mock('../src/config/db', () => ({
  query: (...args) => mockPool.query(...args),
  getClient: () => mockPool.connect(),
  pool: { connect: () => mockPool.connect() }
}));

integration('Super Admin — PostgreSQL isolado', () => {
  let app;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!url.pathname.endsWith('_test')) throw new Error('Banco de integração deve terminar em _test');
    mockPool = new Pool({ connectionString: url.href, max: 5 });
    await mockPool.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));
    await require('../src/scripts/migrate').runMigrations();
    app = require('../src/app');
  }, 30000);
  afterAll(async () => { if (mockPool) await mockPool.end(); });

  it('migra novamente sem reativar empresa e mantém constraints dos logs', async () => {
    const empresa = (await mockPool.query("INSERT INTO empresas(nome,email_contato,plano) VALUES ('Teste','migracao@teste.invalid','ativo') RETURNING *")).rows[0];
    expect(empresa.status).toBe('ativa');
    expect(empresa.tipo).toBe('cliente');
    await mockPool.query("UPDATE empresas SET status = 'inativa' WHERE id=$1", [empresa.id]);
    await require('../src/scripts/migrate').runMigrations();
    expect((await mockPool.query('SELECT status FROM empresas WHERE id=$1', [empresa.id])).rows[0].status).toBe('inativa');
    const col = await mockPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='empresa_afetada_id'");
    expect(col.rowCount).toBe(1);
  });
});
