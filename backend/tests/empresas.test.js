const request = require('supertest');
const bcrypt = require('bcryptjs');
jest.mock('../src/config/db', () => {
  const mock = require('../src/config/mockDb');
  return { ...mock, getClient: jest.fn(() => mock.getMockClient()) };
});
const db = require('../src/config/db');
const { state, resetMockDb } = require('../src/config/mockDb');
const { gerarAccessToken } = require('../src/config/jwt');
const app = require('../src/app');

describe('Provisionamento de empresas pela plataforma', () => {
  const empresaId = '11111111-1111-4111-8111-111111111111';
  const superId = '22222222-2222-4222-8222-222222222222';
  const adminId = '33333333-3333-4333-8333-333333333333';
  const body = {
    empresa_nome: 'Nova Loja',
    nome: 'Admin Loja',
    email: 'admin@nova.test',
    senha: 'Temporaria@123'
  };
  const superToken = gerarAccessToken({ id: superId, empresa_id: empresaId });
  const adminToken = gerarAccessToken({ id: adminId, empresa_id: empresaId });

  beforeEach(() => {
    resetMockDb();
    db.getClient.mockImplementation(() => require('../src/config/mockDb').getMockClient());
    state.empresas.push({
      id: empresaId,
      nome: 'Plataforma',
      plano: 'ativo',
      email_contato: 'plataforma@teste.test'
    });
    state.usuarios.push(
      {
        id: superId,
        empresa_id: empresaId,
        nome: 'Super Admin',
        email: 'super@teste.test',
        papel: 'super_admin',
        ativo: true
      },
      {
        id: adminId,
        empresa_id: empresaId,
        nome: 'Admin',
        email: 'admin@teste.test',
        papel: 'administrador',
        ativo: true
      }
    );
  });

  it('exige autenticação e bloqueia administradores empresariais', async () => {
    expect((await request(app).post('/api/empresas').send(body)).status).toBe(401);
    const res = await request(app)
      .post('/api/empresas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(403);
    expect(state.empresas).toHaveLength(1);
  });

  it('cria empresa, administrador e auditoria sem emitir tokens de outra conta', async () => {
    const res = await request(app)
      .post('/api/empresas')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ ...body, papel: 'super_admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.usuario.papel).toBe('administrador');
    expect(res.body.data.usuario.mustChangePassword).toBe(true);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    const user = state.usuarios.find((u) => u.email === body.email);
    expect(await bcrypt.compare(body.senha, user.senha_hash)).toBe(true);
    expect(state.auditLogs).toHaveLength(1);
    expect(state.auditLogs[0]).toMatchObject({
      escopo: 'plataforma',
      ator_id: superId,
      acao: 'empresa_criada'
    });
    expect(JSON.stringify(res.body)).not.toContain('senha_hash');
    expect(JSON.stringify(state.auditLogs)).not.toContain(body.senha);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${superToken}`);
    expect(me.body.data.usuario.papel).toBe('super_admin');
  });

  it('recusa email duplicado sem criar outra empresa', async () => {
    await request(app)
      .post('/api/empresas')
      .set('Authorization', `Bearer ${superToken}`)
      .send(body);
    const res = await request(app)
      .post('/api/empresas')
      .set('Authorization', `Bearer ${superToken}`)
      .send(body);
    expect(res.status).toBe(409);
    expect(state.empresas).toHaveLength(2);
  });

  it('o novo administrador autentica e troca a senha antes de acessar o estoque', async () => {
    await request(app)
      .post('/api/empresas')
      .set('Authorization', `Bearer ${superToken}`)
      .send(body);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, senha: body.senha });
    expect(login.status).toBe(200);
    expect(login.body.data.mustChangePassword).toBe(true);
    const token = login.body.data.accessToken;
    const blocked = await request(app).get('/api/produtos').set('Authorization', `Bearer ${token}`);
    expect(blocked.body.code).toBe('TROCA_SENHA_OBRIGATORIA');
    const change = await request(app)
      .put('/api/auth/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: body.senha, novaSenha: 'Definitiva@456' });
    expect(change.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.data.usuario.mustChangePassword).toBe(false);
  });

  it('faz rollback se a auditoria falhar e libera a conexão', async () => {
    const mockQuery = require('../src/config/mockDb').executeMockQuery;
    const client = {
      query: jest.fn((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          return Promise.reject(new Error('audit unavailable'));
        }
        return mockQuery(sql, params);
      }),
      release: jest.fn()
    };
    db.getClient.mockResolvedValueOnce(client);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app)
        .post('/api/empresas')
        .set('Authorization', `Bearer ${superToken}`)
        .send(body);
      expect(res.status).toBe(500);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.query).not.toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  describe('GET /api/empresas — Listagem para Super Admin', () => {
    it('bloqueia requisição sem autenticação com 401', async () => {
      const res = await request(app).get('/api/empresas');
      expect(res.status).toBe(401);
    });

    it('bloqueia administrador empresarial com 403', async () => {
      const res = await request(app)
        .get('/api/empresas')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it('permite super_admin listar empresas com estatísticas', async () => {
      const res = await request(app)
        .get('/api/empresas')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.empresas).toBeDefined();
      expect(res.body.data.total).toBe(state.empresas.length);
      const plataforma = res.body.data.empresas.find((e) => e.id === empresaId);
      expect(plataforma).toBeDefined();
      expect(plataforma.nome).toBe('Plataforma');
      expect(plataforma.total_usuarios).toBeGreaterThanOrEqual(1);
    });

    it('conta apenas usuários e produtos ativos por empresa, incluindo empresas vazias', async () => {
      state.empresas.push({ id: 'empresa-vazia', nome: 'Vazia', plano: 'trial' });
      state.usuarios.push({ id: 'inativo', empresa_id: empresaId, ativo: false });
      state.produtos.push(
        { id: 'p1', empresa_id: empresaId, ativo: true },
        { id: 'p2', empresa_id: empresaId, ativo: true },
        { id: 'p3', empresa_id: empresaId, ativo: true },
        { id: 'p4', empresa_id: empresaId, ativo: false }
      );
      const res = await request(app)
        .get('/api/empresas')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.empresas).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: empresaId, total_usuarios: 2, total_produtos: 3 }),
        expect.objectContaining({ id: 'empresa-vazia', total_usuarios: 0, total_produtos: 0 })
      ]));
    });
  });

  describe('POST /api/empresas/:id/administradores/:usuarioId/senha-temporaria', () => {
    it('altera somente o administrador selecionado, encerra sua sessão e exige troca no login', async () => {
      const tenantId = '44444444-4444-4444-8444-444444444444';
      const tenantAdminId = '55555555-5555-4555-8555-555555555555';
      const funcionarioId = '66666666-6666-4666-8666-666666666666';
      const senhaAnterior = 'AnteriorSegura123';
      const novaSenha = 'TemporariaNova123';
      const senhaAnteriorHash = await bcrypt.hash(senhaAnterior, 4);
      const senhaSuperHash = await bcrypt.hash('SuperSegura123', 4);

      state.empresas.push({ id: tenantId, nome: 'Cliente', plano: 'ativo', tipo: 'cliente' });
      Object.assign(state.usuarios.find((u) => u.id === superId), {
        senha_hash: senhaSuperHash,
        versao_sessao: 1
      });
      state.usuarios.push(
        {
          id: tenantAdminId,
          empresa_id: tenantId,
          nome: 'Admin Cliente',
          email: 'admin@cliente.test',
          papel: 'administrador',
          ativo: true,
          senha_hash: senhaAnteriorHash,
          must_change_password: false,
          versao_sessao: 2
        },
        {
          id: funcionarioId,
          empresa_id: tenantId,
          nome: 'Funcionário Cliente',
          email: 'funcionario@cliente.test',
          papel: 'funcionario',
          ativo: true,
          senha_hash: senhaAnteriorHash,
          must_change_password: false,
          versao_sessao: 1
        }
      );
      state.refreshTokens.push(
        { usuario_id: tenantAdminId, token_hash: 'admin-token', revogado: false },
        { usuario_id: funcionarioId, token_hash: 'func-token', revogado: false },
        { usuario_id: superId, token_hash: 'super-token', revogado: false }
      );

      const res = await request(app)
        .post(`/api/empresas/${tenantId}/administradores/${tenantAdminId}/senha-temporaria`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ novaSenhaTemporaria: novaSenha, confirmar: true });

      expect(res.status).toBe(200);
      const admin = state.usuarios.find((u) => u.id === tenantAdminId);
      const funcionario = state.usuarios.find((u) => u.id === funcionarioId);
      const superAdmin = state.usuarios.find((u) => u.id === superId);
      expect(await bcrypt.compare(novaSenha, admin.senha_hash)).toBe(true);
      expect(admin.must_change_password).toBe(true);
      expect(admin.versao_sessao).toBe(3);
      expect(await bcrypt.compare(senhaAnterior, funcionario.senha_hash)).toBe(true);
      expect(superAdmin.senha_hash).toBe(senhaSuperHash);
      expect(state.refreshTokens.find((t) => t.usuario_id === tenantAdminId).revogado).toBe(true);
      expect(state.refreshTokens.find((t) => t.usuario_id === funcionarioId).revogado).toBe(false);
      expect(state.refreshTokens.find((t) => t.usuario_id === superId).revogado).toBe(false);
      expect(state.auditLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          escopo: 'plataforma',
          ator_id: superId,
          empresa_afetada_id: tenantId,
          entidade_id: tenantAdminId,
          acao: 'senha_temporaria_definida_superadmin'
        })
      ]));
      expect(JSON.stringify(state.auditLogs)).not.toContain(novaSenha);
    });

    it('recusa funcionário e usuário pertencente a outra empresa', async () => {
      const tenantId = '44444444-4444-4444-8444-444444444444';
      const outroTenantId = '77777777-7777-4777-8777-777777777777';
      const tenantAdminId = '55555555-5555-4555-8555-555555555555';
      const funcionarioId = '66666666-6666-4666-8666-666666666666';
      const senhaAnteriorHash = await bcrypt.hash('AnteriorSegura123', 4);
      state.empresas.push(
        { id: tenantId, nome: 'Cliente', plano: 'ativo', tipo: 'cliente' },
        { id: outroTenantId, nome: 'Outro Cliente', plano: 'ativo', tipo: 'cliente' }
      );
      state.usuarios.push(
        { id:tenantAdminId, empresa_id:tenantId, nome:'Admin', email:'admin@cliente.test', papel:'administrador', ativo:true, senha_hash:senhaAnteriorHash },
        { id:funcionarioId, empresa_id:tenantId, nome:'Funcionário', email:'func@cliente.test', papel:'funcionario', ativo:true, senha_hash:senhaAnteriorHash }
      );

      const funcionario = await request(app)
        .post(`/api/empresas/${tenantId}/administradores/${funcionarioId}/senha-temporaria`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ novaSenhaTemporaria:'NaoPodeAlterar123', confirmar:true });
      expect(funcionario.status).toBe(409);

      const outraEmpresa = await request(app)
        .post(`/api/empresas/${outroTenantId}/administradores/${tenantAdminId}/senha-temporaria`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ novaSenhaTemporaria:'NaoPodeAlterar123', confirmar:true });
      expect(outraEmpresa.status).toBe(404);
      expect(state.usuarios.find((u) => u.id === funcionarioId).senha_hash).toBe(senhaAnteriorHash);
      expect(state.usuarios.find((u) => u.id === tenantAdminId).senha_hash).toBe(senhaAnteriorHash);
    });

    it('exige Super Admin e recusa senha acima do limite seguro do bcrypt', async () => {
      const tenantId = '44444444-4444-4444-8444-444444444444';
      const tenantAdminId = '55555555-5555-4555-8555-555555555555';
      const senhaAnteriorHash = await bcrypt.hash('AnteriorSegura123', 4);
      state.empresas.push({ id:tenantId, nome:'Cliente', plano:'ativo', tipo:'cliente' });
      state.usuarios.push({
        id:tenantAdminId, empresa_id:tenantId, nome:'Admin', email:'admin@cliente.test',
        papel:'administrador', ativo:true, senha_hash:senhaAnteriorHash
      });
      const endpoint = `/api/empresas/${tenantId}/administradores/${tenantAdminId}/senha-temporaria`;
      const corpo = { novaSenhaTemporaria:'Aa1' + 'x'.repeat(70), confirmar:true };

      expect((await request(app).post(endpoint).send(corpo)).status).toBe(401);
      expect((await request(app).post(endpoint).set('Authorization', `Bearer ${adminToken}`).send(corpo)).status).toBe(403);
      expect((await request(app).post(endpoint).set('Authorization', `Bearer ${superToken}`).send(corpo)).status).toBe(400);
      expect(state.usuarios.find((u) => u.id === tenantAdminId).senha_hash).toBe(senhaAnteriorHash);
    });
  });
});
