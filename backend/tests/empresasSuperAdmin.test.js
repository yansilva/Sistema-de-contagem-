const request = require('supertest');
jest.mock('../src/config/db', () => {
  const mock = require('../src/config/mockDb');
  return { ...mock, getClient: jest.fn(() => mock.getMockClient()) };
});
const db = require('../src/config/db');
const { state, resetMockDb } = require('../src/config/mockDb');
const { gerarAccessToken } = require('../src/config/jwt');
const app = require('../src/app');

describe('Console Super Admin — Gestão Avançada de Tenants', () => {
  const superId = 'super-0000-4000-8000-000000000001';
  const superEmpresaId = 'empresa-super-0000-4000-8000-000000000001';
  const targetEmpresaId = 'empresa-alvo-0000-4000-8000-000000000002';
  const targetAdminId = 'admin-alvo-0000-4000-8000-000000000002';
  const normalUserId = 'user-normal-0000-4000-8000-000000000003';

  const superToken = gerarAccessToken({ id: superId, empresa_id: superEmpresaId });
  const targetAdminToken = gerarAccessToken({ id: targetAdminId, empresa_id: targetEmpresaId });

  beforeEach(() => {
    resetMockDb();
    db.getClient.mockImplementation(() => require('../src/config/mockDb').getMockClient());

    state.empresas.push(
      {
        id: superEmpresaId,
        nome: 'Plataforma Super',
        plano: 'ativo',
        email_contato: 'super@plataforma.internal',
        criado_em: new Date().toISOString()
      },
      {
        id: targetEmpresaId,
        nome: 'Queijaria Modelo',
        plano: 'ativo',
        email_contato: 'contato@queijaria.test',
        trial_expira_em: new Date(Date.now() + 86400000 * 15).toISOString(),
        criado_em: new Date().toISOString()
      }
    );

    state.usuarios.push(
      {
        id: superId,
        empresa_id: superEmpresaId,
        nome: 'Super Admin',
        email: 'super@plataforma.internal',
        papel: 'super_admin',
        ativo: true
      },
      {
        id: targetAdminId,
        empresa_id: targetEmpresaId,
        nome: 'Admin Queijaria',
        email: 'admin@queijaria.test',
        papel: 'administrador',
        ativo: true
      },
      {
        id: normalUserId,
        empresa_id: targetEmpresaId,
        nome: 'Operador Queijaria',
        email: 'operador@queijaria.test',
        papel: 'funcionario',
        ativo: true
      }
    );

    state.produtos.push(
      {
        id: 'prod-1',
        empresa_id: targetEmpresaId,
        codigo: 'QJ01',
        nome: 'Queijo Canastra',
        fornecedor: 'Fazenda 1',
        estoque_atual: 10,
        ativo: true
      }
    );
  });

  describe('GET /api/empresas/metricas/saas — Métricas Globais do SaaS', () => {
    it('retorna métricas consolidadas apenas para super_admin', async () => {
      const resAdmin = await request(app)
        .get('/api/empresas/metricas/saas')
        .set('Authorization', `Bearer ${targetAdminToken}`);
      expect(resAdmin.status).toBe(403);

      const res = await request(app)
        .get('/api/empresas/metricas/saas')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        totalEmpresas: 2,
        ativas: 2,
        totalUsuarios: 3,
        totalProdutos: 1
      });
    });
  });

  describe('GET /api/empresas/:id — Detalhes do Tenant', () => {
    it('retorna informações detalhadas da empresa e seus usuários para super_admin', async () => {
      const res = await request(app)
        .get(`/api/empresas/${targetEmpresaId}`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.empresa.id).toBe(targetEmpresaId);
      expect(res.body.data.empresa.nome).toBe('Queijaria Modelo');
      expect(res.body.data.usuarios).toHaveLength(2);
      expect(res.body.data.usuarios.some((u) => u.papel === 'administrador')).toBe(true);
    });

    it('retorna 404 para empresa inexistente', async () => {
      const res = await request(app)
        .get('/api/empresas/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/empresas/:id — Atualização Cadastral', () => {
    it('atualiza nome e email de contato da empresa com registro de auditoria', async () => {
      const res = await request(app)
        .put(`/api/empresas/${targetEmpresaId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          nome: 'Queijaria Modelo Atualizada',
          email_contato: 'novo@queijaria.test',
          plano: 'trial'
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.empresa.nome).toBe('Queijaria Modelo Atualizada');
      expect(res.body.data.empresa.plano).toBe('trial');

      const audit = state.auditLogs.find(
        (a) => a.acao === 'empresa_atualizada' && a.entidade_id === targetEmpresaId
      );
      expect(audit).toBeDefined();
    });
  });

  describe('PATCH /api/empresas/:id/status — Alteração de Status', () => {
    it('altera status da empresa para suspenso e depois reativa', async () => {
      const resSuspenso = await request(app)
        .patch(`/api/empresas/${targetEmpresaId}/status`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ plano: 'suspenso' });
      expect(resSuspenso.status).toBe(200);
      expect(resSuspenso.body.data.empresa.plano).toBe('suspenso');

      const resAtivo = await request(app)
        .patch(`/api/empresas/${targetEmpresaId}/status`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ plano: 'ativo' });
      expect(resAtivo.status).toBe(200);
      expect(resAtivo.body.data.empresa.plano).toBe('ativo');
    });

    it('recusa status inválido', async () => {
      const res = await request(app)
        .patch(`/api/empresas/${targetEmpresaId}/status`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ plano: 'plano_invalido' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/empresas/:id/impersonar — Acesso como Suporte', () => {
    it('emite token de impersonation para o administrador do tenant', async () => {
      const res = await request(app)
        .post(`/api/empresas/${targetEmpresaId}/impersonar`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.empresa.id).toBe(targetEmpresaId);
      expect(res.body.data.usuario.id).toBe(targetAdminId);
      expect(res.body.data.impersonated).toBe(true);

      const audit = state.auditLogs.find(
        (a) => a.acao === 'impersonation_iniciado' && a.entidade_id === targetEmpresaId
      );
      expect(audit).toBeDefined();
    });
  });

  describe('DELETE /api/empresas/:id — Exclusão em Cascata com Auditoria', () => {
    it('exclui permanentemente a empresa, produtos e usuários', async () => {
      state.auditLogs.push({
        id: 'audit-empresa-antiga',
        escopo: 'empresa',
        empresa_id: targetEmpresaId,
        ator_tipo: 'usuario_empresa',
        ator_id: targetAdminId,
        acao: 'contagem_finalizada',
        entidade: 'contagem',
        resultado: 'sucesso',
        request_id: '11111111-1111-1111-1111-111111111111',
        operacao_id: '22222222-2222-2222-2222-222222222222',
        evento_chave: 'contagem_finalizada_1'
      });

      const res = await request(app)
        .delete(`/api/empresas/${targetEmpresaId}`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(state.empresas.find((e) => e.id === targetEmpresaId)).toBeUndefined();
      expect(state.usuarios.filter((u) => u.empresa_id === targetEmpresaId)).toHaveLength(0);
      expect(state.produtos.filter((p) => p.empresa_id === targetEmpresaId)).toHaveLength(0);

      const auditDelete = state.auditLogs.find(
        (a) => a.acao === 'empresa_excluida_permanentemente' && a.entidade_id === targetEmpresaId
      );
      expect(auditDelete).toBeDefined();
    });

    it('impede exclusão da própria empresa do super admin', async () => {
      const res = await request(app)
        .delete(`/api/empresas/${superEmpresaId}`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(400);
    });
  });
});
