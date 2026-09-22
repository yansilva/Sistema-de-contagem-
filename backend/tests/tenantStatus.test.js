const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => require('../src/config/mockDb'));

const app = require('../src/app');
const { state, resetMockDb } = require('../src/config/mockDb');
const { gerarAccessToken, obterJwtSecret } = require('../src/config/jwt');

describe('Status da conta e versão de sessão', () => {
  const empresaId = '44444444-4444-4444-8444-444444444444';
  const usuarioId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    resetMockDb();
    state.empresas.push({ id: empresaId, nome: 'Cliente', email_contato: 'cliente@teste.invalid', plano: 'ativo', status: 'ativa', tipo: 'cliente', excluida_em: null });
    state.usuarios.push({ id: usuarioId, empresa_id: empresaId, nome: 'Admin', email: 'admin@teste.invalid', papel: 'administrador', ativo: true, versao_sessao: 2 });
  });

  it('aceita somente a versão atual da sessão', async () => {
    const atual = gerarAccessToken({ id: usuarioId, empresa_id: empresaId, versao_sessao: 2 });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${atual}`)).status).toBe(200);

    const antiga = gerarAccessToken({ id: usuarioId, empresa_id: empresaId, versao_sessao: 1 });
    const resAntiga = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${antiga}`);
    expect(resAntiga.status).toBe(401);
    expect(resAntiga.body.code).toBe('SESSAO_INVALIDADA');

    const semVersao = jwt.sign({ id: usuarioId, empresa_id: empresaId }, obterJwtSecret(), { expiresIn: '5m' });
    const resSemVersao = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${semVersao}`);
    expect(resSemVersao.status).toBe(401);
    expect(resSemVersao.body.code).toBe('SESSAO_INVALIDADA');
  });

  it('bloqueia empresa inativa, excluída e trial expirado', async () => {
    const token = gerarAccessToken({ id: usuarioId, empresa_id: empresaId, versao_sessao: 2 });
    const empresa = state.empresas[0];

    empresa.status = 'inativa';
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).body.code).toBe('CONTA_SUSPENSA');

    empresa.status = 'ativa';
    empresa.excluida_em = new Date().toISOString();
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).body.code).toBe('CONTA_SUSPENSA');

    empresa.excluida_em = null;
    empresa.plano = 'trial';
    empresa.trial_expira_em = new Date(Date.now() - 1000).toISOString();
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).body.code).toBe('TRIAL_EXPIRADO');
  });
});
