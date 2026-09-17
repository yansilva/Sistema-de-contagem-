const request = require('supertest');
jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn()
}));
const { pool } = require('../src/config/db');
const app = require('../src/app');

describe('Health Check API', () => {
  beforeEach(() => {
    pool.connect.mockResolvedValue({ release: jest.fn() });
  });

  it('retorna 503 quando PostgreSQL está indisponível', async () => {
    pool.connect.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.database).toBe('unreachable');
  });
  it('GET /health deve responder com status ok e identificador da aplicação', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.app).toBe('Inventory Management System');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('GET /api/health deve responder com status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('permite carregar a fonte da interface sem liberar scripts inline', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    const directives = Object.fromEntries(res.headers['content-security-policy']
      .split(';').map((part) => {
        const [name, ...sources] = part.trim().split(/\s+/);
        return [name, sources];
      }));
    expect(directives['style-src']).toContain('https://fonts.googleapis.com');
    expect(directives['font-src']).toContain('https://fonts.gstatic.com');
    expect(directives['script-src-attr']).toEqual(["'none'"]);
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    expect(directives['script-src']).not.toContain('https://fonts.googleapis.com');
  });
});
