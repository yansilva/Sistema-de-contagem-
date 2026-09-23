const request = require('supertest');
const ExcelJS = require('exceljs');
const { gerarAccessToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({ query: jest.fn(), getClient: jest.fn(), pool: {} }));
const db = require('../src/config/db');
const app = require('../src/app');

describe('Excel de diferenças da contagem', () => {
  const usuario = {
    id: '11111111-1111-4111-8111-111111111111',
    empresa_id: '22222222-2222-4222-8222-222222222222',
    nome: 'Equipe', papel: 'funcionario', ativo: true,
    plano: 'ativo', must_change_password: false
  };
  const item = {
    fornecedor: 'Produtor', codigo: 'SKU', nome: 'Produto',
    estoque_referencia: 15, quantidade_contada: 12, diferenca: -3
  };

  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValueOnce({ rows: [usuario] });
  });

  it('permite ao funcionário baixar apenas diferenças finalizadas sem revelar saldo de referência', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c', status: 'finalizada', finalizado_em: '2026-09-23T12:00:00Z' }] });
    db.query.mockResolvedValueOnce({ rows: [item] });
    const res = await request(app)
      .get(`/api/relatorios/contagens/${usuario.id}/excel`)
      .set('Authorization', `Bearer ${gerarAccessToken(usuario)}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([undefined, 'Fornecedor', 'Código', 'Produto', 'Contagem Física', 'Diferença']);
    expect(sheet.getRow(2).values).toEqual([undefined, 'Produtor', 'SKU', 'Produto', 12, -3]);
    expect(db.query.mock.calls[1][0]).toMatch(/status/);
    expect(db.query.mock.calls[2][0]).toMatch(/quantidade_contada IS NOT NULL/);
  });

  it('impede Excel de contagem em andamento', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c', status: 'em_andamento' }] });
    const res = await request(app).get(`/api/relatorios/contagens/${usuario.id}/excel`)
      .set('Authorization', `Bearer ${gerarAccessToken(usuario)}`);
    expect(res.status).toBe(400);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('impede Excel de outra empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`/api/relatorios/contagens/${usuario.id}/excel`)
      .set('Authorization', `Bearer ${gerarAccessToken(usuario)}`);
    expect(res.status).toBe(404);
    expect(db.query.mock.calls[1][1]).toEqual([usuario.id, usuario.empresa_id]);
  });
});
