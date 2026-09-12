const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const app = require('../src/app');

describe('Gestão de Usuários e Troca Obrigatória de Senha', () => {
  const empresaA = '11111111-1111-1111-1111-111111111111';
  const empresaB = '99999999-9999-9999-9999-999999999999';
  const adminId = '22222222-2222-2222-2222-222222222222';
  const funcionarioId = '33333333-3333-3333-3333-333333333333';

  let adminToken;
  let funcionarioTokenComTrocaPendente;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    adminToken = gerarAccessToken({ id: adminId, empresa_id: empresaA });
    funcionarioTokenComTrocaPendente = gerarAccessToken({ id: funcionarioId, empresa_id: empresaA });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/usuarios — Administrador cadastra funcionário com senha temporária', async () => {
    // 1. auth middleware
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: adminId,
            nome: 'Admin',
            papel: 'administrador',
            ativo: true,
            must_change_password: false,
            empresa_id: empresaA,
            plano: 'ativo'
          }
        ]
      })
      // 2. verifica se email existe
      .mockResolvedValueOnce({ rows: [] })
      // 3. INSERT usuario
      .mockResolvedValueOnce({
        rows: [
          {
            id: funcionarioId,
            nome: 'Funcionario 1',
            email: 'func1@empresa.com',
            papel: 'funcionario',
            ativo: true,
            must_change_password: true,
            criado_em: new Date().toISOString()
          }
        ]
      });

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nome: 'Funcionario 1',
        email: 'func1@empresa.com',
        papel: 'funcionario',
        senha_temporaria: 'TempPass@123'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuario.must_change_password).toBe(true);
  });

  it('GET /api/produtos — Bloqueia funcionário se must_change_password estiver pendente', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: funcionarioId,
          nome: 'Funcionario 1',
          papel: 'funcionario',
          ativo: true,
          must_change_password: true, // DEVE TROCAR SENHA!
          empresa_id: empresaA,
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .get('/api/produtos')
      .set('Authorization', `Bearer ${funcionarioTokenComTrocaPendente}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('TROCA_SENHA_OBRIGATORIA');
  });

  it('PUT /api/auth/senha — Funcionário com troca pendente consegue alterar senha e liberar acesso', async () => {
    const senhaAntigaHash = await bcrypt.hash('TempPass@123', 10);

    db.query
      // 1. auth middleware
      .mockResolvedValueOnce({
        rows: [
          {
            id: funcionarioId,
            nome: 'Funcionario 1',
            papel: 'funcionario',
            ativo: true,
            must_change_password: true,
            empresa_id: empresaA,
            plano: 'ativo'
          }
        ]
      })
      // 2. buscar usuario para verificar senha atual
      .mockResolvedValueOnce({
        rows: [{ senha_hash: senhaAntigaHash, must_change_password: true }]
      })
      // 3. update senha_hash e must_change_password = false
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/auth/senha')
      .set('Authorization', `Bearer ${funcionarioTokenComTrocaPendente}`)
      .send({
        senhaAtual: 'TempPass@123',
        novaSenha: 'NovaSenhaDefinitiva@2026'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /api/usuarios/:id/status — Impede administrador de desativar a si próprio', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: adminId,
          nome: 'Admin',
          papel: 'administrador',
          ativo: true,
          must_change_password: false,
          empresa_id: empresaA,
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .patch(`/api/usuarios/${adminId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ativo: false });

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('AUTO_DESATIVACAO_PROIBIDA');
  });

  it('PATCH /api/usuarios/:id/status — Administrador desativa funcionário com sucesso', async () => {
    db.query
      // auth middleware
      .mockResolvedValueOnce({
        rows: [
          {
            id: adminId,
            nome: 'Admin',
            papel: 'administrador',
            ativo: true,
            must_change_password: false,
            empresa_id: empresaA,
            plano: 'ativo'
          }
        ]
      })
      // update usuario ativo = false
      .mockResolvedValueOnce({
        rows: [
          {
            id: funcionarioId,
            nome: 'Funcionario 1',
            email: 'func1@empresa.com',
            papel: 'funcionario',
            ativo: false
          }
        ]
      })
      // revogar refresh tokens
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch(`/api/usuarios/${funcionarioId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ativo: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.usuario.ativo).toBe(false);
  });
});
