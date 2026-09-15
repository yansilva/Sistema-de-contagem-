const request = require('supertest');
const { gerarAccessToken } = require('../src/config/jwt');
jest.mock('../src/config/db', () => ({ query: jest.fn(), getClient: jest.fn(), pool: {} }));
const db = require('../src/config/db');
const app = require('../src/app');

describe('Permissões do funcionário de contagem', () => {
  const usuario = {
    id: '11111111-1111-4111-8111-111111111111',
    empresa_id: '22222222-2222-4222-8222-222222222222',
    nome: 'Equipe',
    papel: 'funcionario',
    ativo: true,
    plano: 'ativo',
    must_change_password: false
  };
  const token = gerarAccessToken(usuario);
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [usuario] });
  });

  it.each([
    ['get', '/api/usuarios'],
    ['post', '/api/usuarios'],
    ['put', `/api/usuarios/${usuario.id}`],
    ['patch', `/api/usuarios/${usuario.id}/status`],
    ['post', `/api/usuarios/${usuario.id}/reset-senha`],
    ['get', '/api/atividades'],
    ['post', '/api/atividades/exportacoes'],
    ['get', '/api/estoque/historico'],
    ['post', '/api/estoque/upload-pdf'],
    ['post', '/api/estoque/confirmar-atualizacao'],
    ['post', '/api/produtos'],
    ['put', `/api/produtos/${usuario.id}`],
    ['delete', `/api/produtos/${usuario.id}`],
    ['post', '/api/produtos/importar'],
    ['get', `/api/relatorios/contagens/${usuario.id}/excel`],
    ['post', '/api/empresas']
  ])('bloqueia %s %s antes de qualquer operação de gestão', async (method, url) => {
    const res = await request(app)[method](url).set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('permite consultar catálogo sem informar o estoque do sistema', async () => {
    db.query.mockReset();
    db.query
      .mockResolvedValueOnce({ rows: [usuario] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: usuario.id,
            nome: 'Produto',
            codigo: 'SKU',
            fornecedor: 'Produtor',
            estoque_atual: 4567
          }
        ]
      });
    const res = await request(app).get('/api/produtos').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.produtos[0].nome).toBe('Produto');
    expect(res.body.data.produtos[0]).not.toHaveProperty('estoque_atual');
  });

  it.each(['/api/produtos/fornecedores', '/api/contagens'])(
    'permite a consulta %s',
    async (url) => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [usuario] }).mockResolvedValue({ rows: [] });
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  );

  it('o histórico não antecipa divergências de uma contagem em andamento', async () => {
    db.query.mockReset();
    db.query.mockResolvedValueOnce({ rows: [usuario] }).mockResolvedValueOnce({
      rows: [
        {
          id: usuario.id,
          status: 'em_andamento',
          tem_diferenca: true,
          fornecedores: [{ fornecedor: 'Produtor', tem_diferenca: true }]
        }
      ]
    });
    const res = await request(app).get('/api/contagens').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.contagens[0]).not.toHaveProperty('tem_diferenca');
    expect(res.body.data.contagens[0].fornecedores[0]).not.toHaveProperty('tem_diferenca');
  });
});
