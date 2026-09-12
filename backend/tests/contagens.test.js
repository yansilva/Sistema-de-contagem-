const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const app = require('../src/app');

describe('Contagem Cega, Snapshot de Referência e Exibição Estrita de Diferenças', () => {
  const empresaId = '11111111-1111-1111-1111-111111111111';
  const adminId = '22222222-2222-2222-2222-222222222222';
  const funcionarioId = '33333333-3333-3333-3333-333333333333';
  const contagemId = '44444444-4444-4444-4444-444444444444';

  let adminToken;
  let funcionarioToken;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    adminToken = gerarAccessToken({ id: adminId, empresa_id: empresaId });
    funcionarioToken = gerarAccessToken({ id: funcionarioId, empresa_id: empresaId });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/contagens — Inicia contagem e registra snapshot imutável de estoque_referencia', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: contagemId, iniciado_em: new Date().toISOString(), status: 'em_andamento' }]
        }) // INSERT contagens
        .mockResolvedValueOnce({
          rows: [
            { id: 'p1', codigo: '001', nome: 'Queijo Tulha', fornecedor: 'Fazenda A', estoque_atual: 15 },
            { id: 'p2', codigo: '002', nome: 'Queijo Regente', fornecedor: 'Fazenda A', estoque_atual: 10 }
          ]
        }) // SELECT produtos ativos
        .mockResolvedValueOnce({ rows: [{ id: 'forn-1' }] }) // INSERT contagem_fornecedores
        .mockResolvedValueOnce({ rows: [] }) // INSERT item 1 (snapshot estoque_referencia = 15)
        .mockResolvedValueOnce({ rows: [] }) // INSERT item 2 (snapshot estoque_referencia = 10)
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: jest.fn()
    };

    db.getClient.mockResolvedValueOnce(mockClient);

    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: adminId,
          nome: 'Admin',
          papel: 'administrador',
          ativo: true,
          must_change_password: false,
          empresa_id: empresaId,
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .post('/api/contagens')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contagem.id).toBe(contagemId);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('PUT /api/contagens/:id/salvar-progresso — Permite salvar contagem diferenciando zero de não contado', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: contagemId }] }) // check contagem em_andamento
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'forn-1' }] }) // check fornecedor
        .mockResolvedValueOnce({ rows: [{ id: 'item-1' }] }) // update item 1 (12 unidades)
        .mockResolvedValueOnce({ rows: [{ id: 'item-2' }] }) // update item 2 (0 unidades contadas)
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: jest.fn()
    };

    db.getClient.mockResolvedValueOnce(mockClient);

    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: funcionarioId,
          nome: 'Funcionario',
          papel: 'funcionario',
          ativo: true,
          must_change_password: false,
          empresa_id: empresaId,
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .put(`/api/contagens/${contagemId}/salvar-progresso`)
      .set('Authorization', `Bearer ${funcionarioToken}`)
      .send({
        fornecedor: 'Fazenda A',
        itens: [
          { produto_id: '11111111-2222-3333-4444-555555555555', quantidade_contada: 12 },
          { produto_id: '66666666-7777-8888-9999-000000000000', quantidade_contada: 0 } // ZERO contado
        ]
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.itens_salvos).toBe(2);
  });

  it('GET /api/contagens/:id — Funcionário NUNCA recebe estoque_referencia nem diferenca durante contagem em andamento', async () => {
    db.query
      // auth
      .mockResolvedValueOnce({
        rows: [
          {
            id: funcionarioId,
            nome: 'Funcionario',
            papel: 'funcionario',
            ativo: true,
            must_change_password: false,
            empresa_id: empresaId,
            plano: 'ativo'
          }
        ]
      })
      // buscar contagem
      .mockResolvedValueOnce({
        rows: [
          {
            id: contagemId,
            iniciado_em: new Date().toISOString(),
            status: 'em_andamento', // EM ANDAMENTO
            tem_diferenca: false
          }
        ]
      })
      // buscar fornecedores e itens (com dados brutos do banco)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'forn-1',
            fornecedor: 'Fazenda A',
            tem_diferenca: false,
            contado_em: null,
            produtos: [
              {
                id: 'item-1',
                produto_id: 'p1',
                codigo: '001',
                nome: 'Queijo Tulha',
                quantidade_contada: 12,
                estoque_referencia: 15, // DADO INTERNO NO BANCO
                diferenca: null,
                situacao: null
              }
            ]
          }
        ]
      });

    const res = await request(app)
      .get(`/api/contagens/${contagemId}`)
      .set('Authorization', `Bearer ${funcionarioToken}`);

    expect(res.statusCode).toBe(200);
    const produto = res.body.data.contagem.fornecedores[0].produtos[0];

    // CONFERÊNCIA DE SEGURANÇA CEGA:
    expect(produto.codigo).toBe('001');
    expect(produto.nome).toBe('Queijo Tulha');
    expect(produto.quantidade_contada).toBe(12);
    // NÃO PODE ESTAR PRESENTE:
    expect(produto).not.toHaveProperty('estoque_referencia');
    expect(produto).not.toHaveProperty('diferenca');
    expect(produto).not.toHaveProperty('situacao');
  });

  it('PUT /api/contagens/:id/finalizar — Apura diferenças e classifica em sobra e falta', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: contagemId }] }) // check em andamento
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            { id: 'item-1', contagem_fornecedor_id: 'forn-1', estoque_referencia: 15, quantidade_contada: 12 }, // 12 - 15 = -3 (falta)
            { id: 'item-2', contagem_fornecedor_id: 'forn-1', estoque_referencia: 10, quantidade_contada: 12 }  // 12 - 10 = +2 (sobra)
          ]
        }) // SELECT itens
        .mockResolvedValueOnce({ rows: [] }) // UPDATE item-1
        .mockResolvedValueOnce({ rows: [] }) // UPDATE item-2
        .mockResolvedValueOnce({ rows: [] }) // UPDATE fornecedor tem_diferenca
        .mockResolvedValueOnce({
          rows: [{ id: contagemId, status: 'finalizada', tem_diferenca: true }]
        }) // UPDATE contagem status = 'finalizada'
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: jest.fn()
    };

    db.getClient.mockResolvedValueOnce(mockClient);

    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: funcionarioId,
          nome: 'Funcionario',
          papel: 'funcionario',
          ativo: true,
          must_change_password: false,
          empresa_id: empresaId,
          plano: 'ativo'
        }
      ]
    });

    const res = await request(app)
      .put(`/api/contagens/${contagemId}/finalizar`)
      .set('Authorization', `Bearer ${funcionarioToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contagem.status).toBe('finalizada');
  });

  it('GET /api/contagens/:id — Após finalização, funcionário vê SOMENTE diferença e situação, SEM estoque_referencia', async () => {
    db.query
      // auth funcionario
      .mockResolvedValueOnce({
        rows: [
          {
            id: funcionarioId,
            nome: 'Funcionario',
            papel: 'funcionario',
            ativo: true,
            must_change_password: false,
            empresa_id: empresaId,
            plano: 'ativo'
          }
        ]
      })
      // buscar contagem finalizada
      .mockResolvedValueOnce({
        rows: [
          {
            id: contagemId,
            iniciado_em: new Date().toISOString(),
            status: 'finalizada', // FINALIZADA
            tem_diferenca: true
          }
        ]
      })
      // itens com dados calculados
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'forn-1',
            fornecedor: 'Fazenda A',
            tem_diferenca: true,
            produtos: [
              {
                id: 'item-1',
                produto_id: 'p1',
                codigo: '001',
                nome: 'Queijo Tulha',
                quantidade_contada: 12,
                estoque_referencia: 15,
                diferenca: -3,
                situacao: 'falta'
              }
            ]
          }
        ]
      });

    const res = await request(app)
      .get(`/api/contagens/${contagemId}`)
      .set('Authorization', `Bearer ${funcionarioToken}`);

    expect(res.statusCode).toBe(200);
    const produto = res.body.data.contagem.fornecedores[0].produtos[0];

    // O funcionário vê a diferença e a situação:
    expect(produto.diferenca).toBe(-3);
    expect(produto.situacao).toBe('falta');
    expect(produto.quantidade_contada).toBe(12);

    // REGRA DE OURO: O funcionário NUNCA vê o estoque Tiny de referência (15)!
    expect(produto).not.toHaveProperty('estoque_referencia');
  });

  it('GET /api/contagens/:id — Após finalização, administrador visualiza auditoria completa incluindo estoque_referencia', async () => {
    db.query
      // auth admin
      .mockResolvedValueOnce({
        rows: [
          {
            id: adminId,
            nome: 'Admin',
            papel: 'administrador',
            ativo: true,
            must_change_password: false,
            empresa_id: empresaId,
            plano: 'ativo'
          }
        ]
      })
      // buscar contagem finalizada
      .mockResolvedValueOnce({
        rows: [
          {
            id: contagemId,
            iniciado_em: new Date().toISOString(),
            status: 'finalizada',
            tem_diferenca: true
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'forn-1',
            fornecedor: 'Fazenda A',
            tem_diferenca: true,
            produtos: [
              {
                id: 'item-1',
                produto_id: 'p1',
                codigo: '001',
                nome: 'Queijo Tulha',
                quantidade_contada: 12,
                estoque_referencia: 15,
                diferenca: -3,
                situacao: 'falta'
              }
            ]
          }
        ]
      });

    const res = await request(app)
      .get(`/api/contagens/${contagemId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    const produto = res.body.data.contagem.fornecedores[0].produtos[0];

    // Administrador tem visão total de auditoria:
    expect(produto.estoque_referencia).toBe(15);
    expect(produto.quantidade_contada).toBe(12);
    expect(produto.diferenca).toBe(-3);
    expect(produto.situacao).toBe('falta');
  });
});
