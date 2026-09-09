const request = require('supertest');
const app = require('../src/app');

describe('Health Check API', () => {
  it('GET /health deve responder com status ok e identificador da aplicação', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.app).toBe('Inventory Management System');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/health deve responder com status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
