const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const { hashToken } = require('../src/config/jwt');

// Mock do banco de dados para isolamento de testes unitários
jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const app = require('../src/app');

describe('Autenticação & Refresh Token com Rotação', () => {
  const mockEmpresaId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  let mockSenhaHash;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    mockSenhaHash = await bcrypt.hash('SenhaForte@123', 10);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/auth/login — deve autenticar com sucesso e retornar tokens', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: mockUserId,
            nome: 'Gestor Teste',
            email: 'gestor@teste.com',
            senha_hash: mockSenhaHash,
            papel: 'gestor',
            empresa_id: mockEmpresaId,
            empresa_nome: 'Empresa Teste',
            plano: 'ativo',
            trial_expira_em: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] }); // insert refresh token

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'gestor@teste.com', senha: 'SenhaForte@123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.usuario.email).toBe('gestor@teste.com');
  });

  it('POST /api/auth/login — deve rejeitar credenciais inválidas', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inexistente@teste.com', senha: 'QualquerCoisa@123' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('POST /api/auth/login — deve falhar na validação Zod se email for inválido', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'email-invalido', senha: '123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('DADOS_INVALIDOS');
  });

  it('GET /api/auth/guest — deve emitir token para a Loja Demo oficial', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: mockEmpresaId,
          nome: 'Loja Demo',
          plano: 'trial'
        }
      ]
    });

    const res = await request(app).get('/api/auth/guest');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data.usuario.papel).toBe('funcionario');
    expect(res.body.data.empresa.nome).toBe('Loja Demo');
  });

  it('POST /api/auth/refresh — deve rotacionar refresh token e invalidar o anterior', async () => {
    const rawToken = 'teste_refresh_token_com_mais_de_dez_caracteres';
    const hash = hashToken(rawToken);

    // 1. SELECT refresh_tokens
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid-1',
            usuario_id: mockUserId,
            token_hash: hash,
            revogado: false,
            expira_em: new Date(Date.now() + 86400000).toISOString(),
            empresa_id: mockEmpresaId
          }
        ]
      })
      // 2. UPDATE refresh_tokens revogado = true
      .mockResolvedValueOnce({ rows: [] })
      // 3. INSERT new refresh token
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: rawToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.refreshToken).not.toBe(rawToken); // novo token rotacionado!
  });

  it('POST /api/auth/refresh — deve detectar reúso de token revogado e revogar sessões', async () => {
    const rawToken = 'token_ja_usado_previamente_pelo_cliente';
    const hash = hashToken(rawToken);

    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid-2',
            usuario_id: mockUserId,
            token_hash: hash,
            revogado: true, // Token já havia sido revogado/usado!
            expira_em: new Date(Date.now() + 86400000).toISOString(),
            empresa_id: mockEmpresaId
          }
        ]
      })
      // UPDATE all tokens to revoked
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: rawToken });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('SESSAO_COMPROMETIDA');
  });
});
