const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');
jest.mock('../src/config/db', () => ({ query: jest.fn(), getClient: jest.fn(), pool: { connect: jest.fn() } }));
const app = require('../src/app');

describe('GET /api/contagens/semana', () => {
  beforeEach(() => jest.resetAllMocks());
  it('exige autenticação', async () => {
    expect((await request(app).get('/api/contagens/semana')).status).toBe(401);
  });
  it('usa tenant autenticado, ignora relógio da URL e não expõe saldos', async () => {
    const empresa = '11111111-1111-1111-1111-111111111111';
    const id = '22222222-2222-2222-2222-222222222222';
    db.query.mockResolvedValueOnce({ rows: [{ id, empresa_id: empresa, papel: 'funcionario', ativo: true, plano: 'ativo', versao_sessao: 1 }] });
    db.query.mockResolvedValueOnce({ rows: [{ inicio: new Date('2026-09-28T03:00:00Z'), fim: new Date('2026-10-05T03:00:00Z'), id: 'produto', codigo: '01', nome: 'Queijo', fornecedor: 'Fazenda', tipo: 'geral', contado: false }] });
    const antes = Date.now();
    const res = await request(app).get('/api/contagens/semana?empresa_id=outra&agora=2000-01-01').set('Authorization', 'Bearer ' + gerarAccessToken({ id, empresa_id: empresa }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { resumo: { contados: 0, parciais: 0, pendentes: 1 }, produtores: [{ fornecedor: 'Fazenda', status: 'pendente', produtos_pendentes: [{ id: 'produto', codigo: '01', nome: 'Queijo', tipo: 'geral' }] }] } });
    expect(db.query.mock.calls[1][1][0]).toBe(empresa);
    expect(db.query.mock.calls[1][1][1].getTime()).toBeGreaterThanOrEqual(antes);
    expect(JSON.stringify(res.body)).not.toMatch(/estoque|saldo|diferenca|situacao|quantidade_contada/);
  });
  it('encaminha falha do banco', async () => {
    const erroEsperado = jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockResolvedValueOnce({ rows: [{ id: '22222222-2222-2222-2222-222222222222', empresa_id: '11111111-1111-1111-1111-111111111111', ativo: true, plano: 'ativo', versao_sessao: 1 }] });
    db.query.mockRejectedValueOnce(new Error('falha controlada'));
    const token = gerarAccessToken({ id: '22222222-2222-2222-2222-222222222222', empresa_id: '11111111-1111-1111-1111-111111111111' });
    try {
      expect((await request(app).get('/api/contagens/semana').set('Authorization', 'Bearer ' + token)).status).toBe(500);
      expect(erroEsperado).toHaveBeenCalledWith('[ERROR_HANDLER]', expect.objectContaining({ error: 'falha controlada' }));
    } finally {
      erroEsperado.mockRestore();
    }
  });
});
