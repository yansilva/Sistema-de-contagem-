const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const crypto = require('crypto');
const app = require('../src/app');

describe('Segurança Multi-Tenant e Isolamento de Dados', () => {
  const empresaA_Id = crypto.randomUUID();
  const userA_Id = crypto.randomUUID();
  const produtoB_Id = crypto.randomUUID();

  let tokenEmpresaA;

  beforeAll(() => {
    tokenEmpresaA = gerarAccessToken({
      id: userA_Id,
      empresa_id: empresaA_Id
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Garante que usuário da Empresa A não consiga editar produto da Empresa B', async () => {
    // 1. SELECT usuario & empresa no middleware auth
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: userA_Id,
            nome: 'Gestor A',
            email: 'gestora@empresa.com',
            papel: 'gestor',
            empresa_id: empresaA_Id,
            empresa_nome: 'Empresa A',
            plano: 'ativo',
            trial_expira_em: null
          }
        ]
      })
      // 2. UPDATE produtos WHERE id = produtoB_Id AND empresa_id = empresaA_Id
      // Retorna 0 linhas porque o produto pertence à Empresa B!
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put(`/api/produtos/${produtoB_Id}`)
      .set('Authorization', `Bearer ${tokenEmpresaA}`)
      .send({ nome: 'Tentativa de alteração maliciosa', codigo: 'HACK-01', fornecedor: 'Invasor' });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PRODUTO_NAO_ENCONTRADO');

    // Verifica que a query executada no banco de dados filtrou ESTRITAMENTE pela Empresa A
    const updateCall = db.query.mock.calls[1];
    expect(updateCall[0]).toContain('empresa_id = $5');
    expect(updateCall[1]).toContain(empresaA_Id); // A cláusula foi forçada pelo token JWT, não pelo usuário!
  });

  it('Garante que usuário da Empresa A não consiga desativar produto da Empresa B', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: userA_Id,
            nome: 'Gestor A',
            email: 'gestora@empresa.com',
            papel: 'gestor',
            empresa_id: empresaA_Id,
            empresa_nome: 'Empresa A',
            plano: 'ativo'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete(`/api/produtos/${produtoB_Id}`)
      .set('Authorization', `Bearer ${tokenEmpresaA}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
