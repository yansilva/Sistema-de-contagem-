const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const app = require('../src/app');

describe('Produtos API (CRUD, Paginação e Permissões)', () => {
  const empresaId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const gestorId = '11111111-1111-1111-1111-111111111111';
  const funcId = '22222222-2222-2222-2222-222222222222';

  let tokenGestor;
  let tokenFuncionario;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    tokenGestor = gerarAccessToken({ id: gestorId, empresa_id: empresaId });
    tokenFuncionario = gerarAccessToken({ id: funcId, empresa_id: empresaId });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/produtos — deve listar produtos paginados com sucesso', async () => {
    // 1. Auth check
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: funcId,
            nome: 'Funcionário',
            email: 'func@teste.com',
            papel: 'funcionario',
            empresa_id: empresaId,
            empresa_nome: 'Empresa',
            plano: 'ativo'
          }
        ]
      })
      // 2. Count total
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      // 3. Select produtos
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'prod-1',
            codigo: '001',
            nome: 'Camiseta',
            fornecedor: 'Têxtil',
            criado_em: new Date().toISOString()
          }
        ]
      });

    const res = await request(app)
      .get('/api/produtos?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenFuncionario}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.produtos).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1
    });
  });

  it('POST /api/produtos — gestor pode criar produto', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: gestorId,
            nome: 'Gestor',
            email: 'gestor@teste.com',
            papel: 'gestor',
            empresa_id: empresaId,
            empresa_nome: 'Empresa',
            plano: 'ativo'
          }
        ]
      })
      // Insert produto
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'prod-new',
            codigo: 'SKU-99',
            nome: 'Novo Produto',
            fornecedor: 'Fornecedor A',
            criado_em: new Date().toISOString()
          }
        ]
      });

    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({
        codigo: 'SKU-99',
        nome: 'Novo Produto',
        fornecedor: 'Fornecedor A'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.produto.codigo).toBe('SKU-99');
  });

  it('POST /api/produtos — funcionário comum NÃO pode criar produto (403 Forbidden)', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: funcId,
          nome: 'Funcionário',
          email: 'func@teste.com',
          papel: 'funcionario',
          empresa_id: empresaId,
          empresa_nome: 'Empresa',
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${tokenFuncionario}`)
      .send({
        codigo: 'SKU-99',
        nome: 'Novo Produto',
        fornecedor: 'Fornecedor A'
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('ACESSO_RESTRITO_GESTOR');
  });
});
