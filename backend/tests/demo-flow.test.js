const request = require('supertest');
const app = require('../src/app');

describe('Fluxo Completo de Demonstração (Demo / Guest Flow)', () => {
  it('1. Deve autenticar como Convidado Demo via GET /api/auth/guest', async () => {
    const res = await request(app).get('/api/auth/guest');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.usuario.nome).toContain('Convidado');
    expect(res.body.data.empresa.nome).toBe('Loja Demo');
  });

  it('2. Deve listar produtos com o token de Convidado', async () => {
    const guestRes = await request(app).get('/api/auth/guest');
    const token = guestRes.body.data.accessToken;

    const res = await request(app).get('/api/produtos').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.produtos.length).toBeGreaterThan(0);
  });

  it('3. Deve listar fornecedores com o token de Convidado', async () => {
    const guestRes = await request(app).get('/api/auth/guest');
    const token = guestRes.body.data.accessToken;

    const res = await request(app)
      .get('/api/produtos/fornecedores')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fornecedores).toContain('Têxtil Sul');
  });

  it('4. Deve restaurar sessão via GET /api/auth/me', async () => {
    const guestRes = await request(app).get('/api/auth/guest');
    const token = guestRes.body.data.accessToken;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuario.nome).toContain('Convidado');
  });
});
