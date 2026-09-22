const request = require('supertest');

jest.mock('../src/config/db', () => {
  const mock = require('../src/config/mockDb');
  return { ...mock, getClient: jest.fn(() => mock.getMockClient()) };
});

const db = require('../src/config/db');
const { state, resetMockDb } = require('../src/config/mockDb');
const { gerarAccessToken } = require('../src/config/jwt');
const app = require('../src/app');

describe('Console Super Admin — contrato seguro', () => {
  const plataformaId = '11111111-1111-4111-8111-111111111111';
  const superId = '11111111-1111-4111-8111-111111111112';
  const empresaId = '22222222-2222-4222-8222-222222222222';
  const adminId = '22222222-2222-4222-8222-222222222223';
  const funcionarioId = '22222222-2222-4222-8222-222222222224';
  const superToken = gerarAccessToken({ id: superId, empresa_id: plataformaId, versao_sessao: 1 });
  const adminToken = gerarAccessToken({ id: adminId, empresa_id: empresaId, versao_sessao: 1 });

  beforeEach(() => {
    resetMockDb();
    db.getClient.mockImplementation(() => require('../src/config/mockDb').getMockClient());
    state.empresas.push(
      { id: plataformaId, nome: 'Plataforma', email_contato: 'plataforma@teste.invalid', plano: 'ativo', status: 'ativa', tipo: 'plataforma', excluida_em: null, criado_em: '2026-01-01T00:00:00.000Z' },
      { id: empresaId, nome: 'Queijaria Modelo', email_contato: 'contato@queijaria.test', plano: 'ativo', status: 'ativa', tipo: 'cliente', excluida_em: null, trial_expira_em: null, criado_em: '2026-02-01T00:00:00.000Z' }
    );
    state.usuarios.push(
      { id: superId, empresa_id: plataformaId, nome: 'Super', email: 'super@teste.invalid', papel: 'super_admin', ativo: true, versao_sessao: 1 },
      { id: adminId, empresa_id: empresaId, nome: 'Admin', email: 'admin@teste.invalid', papel: 'administrador', ativo: true, versao_sessao: 1, criado_em: '2026-02-01T00:00:00.000Z' },
      { id: funcionarioId, empresa_id: empresaId, nome: 'Operador', email: 'operador@teste.invalid', papel: 'funcionario', ativo: false, versao_sessao: 1, criado_em: '2026-02-02T00:00:00.000Z' }
    );
    state.produtos.push({ id: '33333333-3333-4333-8333-333333333333', empresa_id: empresaId, codigo: 'QJ01', nome: 'Queijo', fornecedor: 'Fazenda', estoque_atual: 10, ativo: true });
  });

  it('calcula indicadores apenas para empresas clientes não excluídas', async () => {
    const res = await request(app).get('/api/empresas/metricas/saas').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalEmpresas: 1, ativas: 1, inativas: 0, totalUsuarios: 2, usuariosAtivos: 1, totalAdmins: 1, totalProdutos: 1, totalContagens: 0, contagensFinalizadas: 0 });
    expect(res.body.data.geradoEm).toBeTruthy();
  });

  it('lista e detalha empresa com paginação e UUID validado', async () => {
    const lista = await request(app).get('/api/empresas?limit=20').set('Authorization', `Bearer ${superToken}`);
    expect(lista.status).toBe(200);
    expect(lista.body.data.empresas).toHaveLength(1);
    expect(lista.body.data.pagination).toMatchObject({ total: 1, page: 1, limit: 20 });
    const detalhe = await request(app).get(`/api/empresas/${empresaId}`).set('Authorization', `Bearer ${superToken}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.data.empresa.id).toBe(empresaId);
    expect(detalhe.body.data.usuarios).toHaveLength(2);
    expect((await request(app).get('/api/empresas/id-invalido').set('Authorization', `Bearer ${superToken}`)).status).toBe(400);
  });

  it('edita dados permitidos e grava autoria da plataforma', async () => {
    const res = await request(app).put(`/api/empresas/${empresaId}`).set('Authorization', `Bearer ${superToken}`).send({ nome: 'Queijaria Atualizada', email_contato: 'novo@queijaria.test', plano: 'trial' });
    expect(res.status).toBe(200);
    expect(res.body.data.empresa).toMatchObject({ nome: 'Queijaria Atualizada', plano: 'trial' });
    expect(state.auditLogs.find((log) => log.acao === 'empresa_atualizada')).toMatchObject({ ator_id: superId, empresa_afetada_id: empresaId });
  });

  it('exige confirmação para inativar e não ressuscita a sessão antiga ao reativar', async () => {
    const semConfirmar = await request(app).patch(`/api/empresas/${empresaId}/status`).set('Authorization', `Bearer ${superToken}`).send({ status: 'inativa' });
    expect(semConfirmar.status).toBe(400);
    const inativada = await request(app).patch(`/api/empresas/${empresaId}/status`).set('Authorization', `Bearer ${superToken}`).send({ status: 'inativa', confirmar: true, motivo: 'Solicitação do cliente' });
    expect(inativada.status).toBe(200);
    expect(inativada.body.data.empresa.status).toBe('inativa');
    expect((await request(app).get('/api/produtos').set('Authorization', `Bearer ${adminToken}`)).status).toBe(401);
    const reativada = await request(app).patch(`/api/empresas/${empresaId}/status`).set('Authorization', `Bearer ${superToken}`).send({ status: 'ativa', confirmar: true });
    expect(reativada.status).toBe(200);
    expect((await request(app).get('/api/produtos').set('Authorization', `Bearer ${adminToken}`)).status).toBe(401);
  });

  it('mantém plataforma protegida e encerra o impersonation', async () => {
    const protegida = await request(app).delete(`/api/empresas/${plataformaId}`).set('Authorization', `Bearer ${superToken}`).send({ nomeConfirmacao: 'Plataforma' });
    expect(protegida.status).toBe(400);
    const impersonation = await request(app).post(`/api/empresas/${empresaId}/impersonar`).set('Authorization', `Bearer ${superToken}`);
    expect(impersonation.status).toBe(410);
    expect(impersonation.body).not.toHaveProperty('data.accessToken');
  });

  it('exclui logicamente só com nome exato e preserva dados vinculados', async () => {
    const negada = await request(app).delete(`/api/empresas/${empresaId}`).set('Authorization', `Bearer ${superToken}`).send({ nomeConfirmacao: 'Nome errado' });
    expect(negada.status).toBe(400);
    expect(state.empresas.find((e) => e.id === empresaId).excluida_em).toBeNull();
    const res = await request(app).delete(`/api/empresas/${empresaId}`).set('Authorization', `Bearer ${superToken}`).send({ nomeConfirmacao: 'Queijaria Modelo', motivo: 'Encerramento' });
    expect(res.status).toBe(200);
    expect(state.empresas.find((e) => e.id === empresaId).excluida_em).toBeTruthy();
    expect(state.usuarios.filter((u) => u.empresa_id === empresaId)).toHaveLength(2);
    expect(state.produtos.filter((p) => p.empresa_id === empresaId)).toHaveLength(1);
    expect(state.auditLogs.find((log) => log.acao === 'empresa_excluida')).toMatchObject({ empresa_afetada_id: empresaId });
  });
});
