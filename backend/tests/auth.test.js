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

describe('Autenticação, Onboarding & Refresh Token com Rotação', () => {
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

  it('POST /api/auth/registro — deve realizar onboarding da empresa e do primeiro administrador', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // verifica se email usuario existe
      .mockResolvedValueOnce({ rows: [] }) // verifica se email empresa existe
      .mockResolvedValueOnce({
        rows: [{ id: mockEmpresaId, nome: 'Empresa Teste Onboarding', plano: 'ativo' }]
      }) // insere empresa
      .mockResolvedValueOnce({
        rows: [
          {
            id: mockUserId,
            nome: 'Administrador Silva',
            email: 'admin@empresa.com',
            papel: 'administrador',
            ativo: true,
            must_change_password: false
          }
        ]
      }) // insere usuario
      .mockResolvedValueOnce({ rows: [] }); // insere refresh token

    const res = await request(app)
      .post('/api/auth/registro')
      .send({
        empresa_nome: 'Empresa Teste Onboarding',
        nome: 'Administrador Silva',
        email: 'admin@empresa.com',
        senha: 'SenhaForte@123'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.usuario.papel).toBe('administrador');
    expect(res.body.data.empresa.nome).toBe('Empresa Teste Onboarding');
  });

  it('POST /api/auth/login — deve autenticar com sucesso e retornar tokens e flag mustChangePassword', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: mockUserId,
            nome: 'Gestor Teste',
            email: 'gestor@teste.com',
            senha_hash: mockSenhaHash,
            papel: 'administrador',
            ativo: true,
            must_change_password: false,
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
    expect(res.body.data.mustChangePassword).toBe(false);
    expect(res.body.data.usuario.email).toBe('gestor@teste.com');
  });

  it('POST /api/auth/login — deve rejeitar senhas backdoor antigas (123456 ou AdminDemo)', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: mockUserId,
          nome: 'Gestor Teste',
          email: 'gestor@teste.com',
          senha_hash: mockSenhaHash, // hash de "SenhaForte@123"
          papel: 'administrador',
          ativo: true,
          must_change_password: false,
          empresa_id: mockEmpresaId,
          empresa_nome: 'Empresa Teste',
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'gestor@teste.com', senha: '123456' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('CREDENCIAIS_INVALIDAS');
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

  it('POST /api/auth/login — deve rejeitar usuário desativado pelo administrador', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: mockUserId,
          nome: 'Funcionario Desativado',
          email: 'inativo@teste.com',
          senha_hash: mockSenhaHash,
          papel: 'funcionario',
          ativo: false, // DESATIVADO
          must_change_password: false,
          empresa_id: mockEmpresaId,
          empresa_nome: 'Empresa Teste',
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inativo@teste.com', senha: 'SenhaForte@123' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('USUARIO_DESATIVADO');
  });

  it('POST /api/auth/refresh — deve rotacionar refresh token e invalidar o anterior', async () => {
    const rawToken = 'teste_refresh_token_com_mais_de_dez_caracteres';
    const hash = hashToken(rawToken);

    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid-1',
            usuario_id: mockUserId,
            token_hash: hash,
            revogado: false,
            expira_em: new Date(Date.now() + 86400000).toISOString(),
            empresa_id: mockEmpresaId,
            ativo: true
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE revogado = true
      .mockResolvedValueOnce({ rows: [] }); // INSERT novo token

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: rawToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.refreshToken).not.toBe(rawToken);
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
            revogado: true, // Token já revogado
            expira_em: new Date(Date.now() + 86400000).toISOString(),
            empresa_id: mockEmpresaId
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: rawToken });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('SESSAO_COMPROMETIDA');
  });
});
