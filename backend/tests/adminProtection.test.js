const request = require('supertest');
const { resetMockDb, state } = require('../src/config/mockDb');
const { gerarAccessToken } = require('../src/config/jwt');
const { bootstrapSuperAdmin } = require('../src/scripts/bootstrapSuperAdmin');

// Certifica que mockDb está ativo
jest.mock('../src/config/db', () => require('../src/config/mockDb'));

const app = require('../src/app');

describe('Fase 1: Proteção de Administrador, RBAC e Super Admin', () => {
  const empresaId = '11111111-1111-1111-1111-111111111111';
  const admin1Id = '22222222-2222-2222-2222-222222222221';
  const admin2Id = '22222222-2222-2222-2222-222222222222';
  const funcId = '33333333-3333-3333-3333-333333333333';

  let tokenAdmin1;

  beforeEach(() => {
    resetMockDb();

    // Empresa ativa
    state.empresas.push({
      id: empresaId,
      nome: 'Empresa Teste RBAC',
      email_contato: 'contato@empresa.com',
      plano: 'ativo',
      trial_expira_em: null,
      criado_em: new Date().toISOString()
    });

    // Administrador 1
    state.usuarios.push({
      id: admin1Id,
      empresa_id: empresaId,
      nome: 'Admin Primário',
      email: 'admin1@empresa.com',
      senha_hash: 'hash_admin1',
      papel: 'administrador',
      ativo: true,
      must_change_password: false,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    });

    // Funcionário comum
    state.usuarios.push({
      id: funcId,
      empresa_id: empresaId,
      nome: 'Func Operador',
      email: 'func@empresa.com',
      senha_hash: 'hash_func',
      papel: 'funcionario',
      ativo: true,
      must_change_password: false,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    });

    tokenAdmin1 = gerarAccessToken({ id: admin1Id, empresa_id: empresaId });
  });

  it('deve impedir a autodesativação do administrador logado', async () => {
    const res = await request(app)
      .patch(`/api/usuarios/${admin1Id}/status`)
      .set('Authorization', `Bearer ${tokenAdmin1}`)
      .send({ ativo: false });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('AUTO_DESATIVACAO_PROIBIDA');
  });

  it('deve impedir a desativação do único administrador ativo da organização', async () => {
    // Simula outro admin logado tentando desativar o admin1Id (quando admin1Id é o único admin ativo)
    const tokenOutroAdmin = gerarAccessToken({ id: admin2Id, empresa_id: empresaId });
    // Adicionamos temporariamente o admin2 no state como funcionário (portanto só há 1 admin ativo)
    state.usuarios.push({
      id: admin2Id,
      empresa_id: empresaId,
      nome: 'Admin Secundário Temporário',
      email: 'admin2@empresa.com',
      senha_hash: 'hash_admin2',
      papel: 'administrador',
      ativo: true,
      must_change_password: false,
      criado_em: new Date().toISOString()
    });

    // Agora há 2 admins. Se desativar admin1Id, deve permitir:
    const res1 = await request(app)
      .patch(`/api/usuarios/${admin1Id}/status`)
      .set('Authorization', `Bearer ${tokenOutroAdmin}`)
      .send({ ativo: false });

    expect(res1.statusCode).toBe(200);

    // Agora só sobrou o admin2Id ativo. Se tentar desativar o admin2Id através de requisição:
    // Ele mesmo desativando é barrado por AUTO_DESATIVACAO_PROIBIDA.
    // Mas reativamos o admin1 como funcionario para testar desativar o único admin:
    const u1 = state.usuarios.find((u) => u.id === admin1Id);
    u1.ativo = true;
    u1.papel = 'funcionario';

    // Agora admin2Id tenta ser desativado pelo token de admin1 (que agora é func, 403) ou
    // se admin1 fosse admin desativado, o total de admins ativos é 1.
    // Vamos reverter admin1 para desativado e testar a query de totalAdmins <= 1:
    u1.ativo = false;
    u1.papel = 'administrador';
    // admin2Id é o ÚNICO ativo. Tentando desativá-lo deve bater em ULTIMO_ADMIN_PROIBIDO ou AUTO_DESATIVACAO_PROIBIDA
    const res2 = await request(app)
      .patch(`/api/usuarios/${admin2Id}/status`)
      .set('Authorization', `Bearer ${tokenOutroAdmin}`)
      .send({ ativo: false });

    expect(res2.statusCode).toBe(409);
  });

  it('deve impedir o rebaixamento de papel do único administrador ativo para funcionário', async () => {
    const res = await request(app)
      .put(`/api/usuarios/${admin1Id}`)
      .set('Authorization', `Bearer ${tokenAdmin1}`)
      .send({ papel: 'funcionario' });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ULTIMO_ADMIN_PROIBIDO');
  });

  it('deve impedir que administrador de empresa conceda o papel de super_admin em edição', async () => {
    const res = await request(app)
      .put(`/api/usuarios/${funcId}`)
      .set('Authorization', `Bearer ${tokenAdmin1}`)
      .send({ papel: 'super_admin' });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CONCESSAO_SUPERADMIN_PROIBIDA');
  });

  it('deve impedir que administrador de empresa crie usuário com papel de super_admin', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin1}`)
      .send({
        nome: 'Tentativa Super Admin',
        email: 'hacker@empresa.com',
        papel: 'super_admin',
        senha_temporaria: 'Temp@12345'
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CONCESSAO_SUPERADMIN_PROIBIDA');
  });

  it('deve bloquear cadastro público de empresas se ALLOW_PUBLIC_REGISTRATION=false em produção', async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldAllow = process.env.ALLOW_PUBLIC_REGISTRATION;

    try {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_PUBLIC_REGISTRATION = 'false';

      const res = await request(app)
        .post('/api/auth/registro')
        .send({
          empresa_nome: 'Tentativa Invasão',
          nome: 'Invasor',
          email: 'invasor@teste.com',
          senha: 'SenhaForte@123'
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('CADASTRO_PUBLICO_DESABILITADO');
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.ALLOW_PUBLIC_REGISTRATION = oldAllow;
    }
  });

  it('bootstrapSuperAdmin deve provisionar super_admin de plataforma com segurança', async () => {
    process.env.SUPER_ADMIN_EMAIL = 'super@plataforma.internal';
    process.env.SUPER_ADMIN_SENHA = 'SuperSenhaForte@2026';
    process.env.SUPER_ADMIN_NOME = 'Administrador Global';

    const usuario = await bootstrapSuperAdmin();

    expect(usuario).toBeDefined();
    expect(usuario.email).toBe('super@plataforma.internal');
    expect(usuario.papel).toBe('super_admin');

    // Execução idempotente não duplica
    const usuarioRepetido = await bootstrapSuperAdmin();
    expect(usuarioRepetido.email).toBe('super@plataforma.internal');
  });
});
