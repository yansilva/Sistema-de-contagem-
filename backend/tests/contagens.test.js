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

  it('salva progresso com quantidade vazia sem erro de tipo do PostgreSQL', async () => {
    const produtoId = '55555555-5555-4555-8555-555555555555';
    const mockClient = {
      query: jest.fn(async sql => {
        if (sql.includes('UPDATE contagem_itens')) {
          if (/\$1\s+IS NULL/.test(sql)) {
            const error = new Error('could not determine data type of parameter $1');
            error.code = '42P08';
            throw error;
          }
          return { rows: [{ id: produtoId }] };
        }
        if (sql.includes('SELECT id FROM contagens')) return { rows: [{ id: contagemId }] };
        if (sql.includes('SELECT id FROM contagem_fornecedores')) return { rows: [{ id: '66666666-6666-4666-8666-666666666666' }] };
        return { rows: [] };
      }),
      release: jest.fn()
    };
    db.getClient.mockResolvedValueOnce(mockClient);
    db.query.mockResolvedValueOnce({ rows: [{
      id: funcionarioId, papel: 'funcionario', ativo: true,
      empresa_id: empresaId, plano: 'ativo'
    }] });

    const res = await request(app)
      .put(`/api/contagens/${contagemId}/salvar-progresso`)
      .set('Authorization', `Bearer ${funcionarioToken}`)
      .send({ fornecedor: 'Fazenda A', itens: [{ produto_id: produtoId, quantidade_contada: null }] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.itens_salvos).toBe(1);
  });

  it('inclui produto novo com quantidade vazia sem erro de tipo do PostgreSQL', async () => {
    const produtoId = '55555555-5555-4555-8555-555555555555';
    const mockClient = {
      query: jest.fn(async sql => {
        if (sql.includes('INSERT INTO contagem_itens')) {
          if (/\$6\s+IS NULL/.test(sql)) {
            const error = new Error('could not determine data type of parameter $6');
            error.code = '42P08';
            throw error;
          }
          return { rows: [] };
        }
        if (sql.includes('UPDATE contagem_itens')) return { rows: [] };
        if (sql.includes('SELECT id, codigo, nome, estoque_atual FROM produtos')) {
          return { rows: [{ id: produtoId, codigo: 'NOVO', nome: 'Produto novo', estoque_atual: 3 }] };
        }
        if (sql.includes('SELECT id FROM contagens')) return { rows: [{ id: contagemId }] };
        if (sql.includes('SELECT id FROM contagem_fornecedores')) return { rows: [{ id: '66666666-6666-4666-8666-666666666666' }] };
        return { rows: [] };
      }),
      release: jest.fn()
    };
    db.getClient.mockResolvedValueOnce(mockClient);
    db.query.mockResolvedValueOnce({ rows: [{
      id: funcionarioId, papel: 'funcionario', ativo: true,
      empresa_id: empresaId, plano: 'ativo'
    }] });

    const res = await request(app)
      .put(`/api/contagens/${contagemId}/salvar-progresso`)
      .set('Authorization', `Bearer ${funcionarioToken}`)
      .send({ fornecedor: 'Fazenda A', itens: [{ produto_id: produtoId, quantidade_contada: null }] });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.itens_salvos).toBe(1);
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

  it('PUT /api/contagens/:id/finalizar — apura só itens contados em lote e preserva NULL', async () => {
    const mockClient = {
      query: jest.fn(async sql => {
        if (sql.includes("status = 'em_andamento'")) return { rows: [{ id: contagemId }] };
        if (sql.includes('UPDATE contagem_itens')) return {
          rows: [
            { contagem_fornecedor_id: 'forn-1', diferenca: -3 },
            { contagem_fornecedor_id: 'forn-1', diferenca: 2 },
            { contagem_fornecedor_id: 'forn-2', diferenca: -10 } // zero digitado
          ]
        };
        if (sql.includes("SET status = 'finalizada'")) return {
          rows: [{ id: contagemId, status: 'finalizada', tem_diferenca: true }]
        };
        return { rows: [] };
      }),
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
    const itemUpdates = mockClient.query.mock.calls.filter(([sql]) => sql.includes('UPDATE contagem_itens'));
    expect(itemUpdates).toHaveLength(1);
    expect(itemUpdates[0][0]).toMatch(/quantidade_contada IS NOT NULL/);
    expect(itemUpdates[0][0]).toMatch(/RETURNING/);
    expect(mockClient.query.mock.calls.filter(([sql]) => sql.includes('UPDATE contagem_fornecedores'))).toHaveLength(1);
  });

  it('recusa finalizar quando nenhum produto foi contado', async () => {
    const mockClient = {
      query: jest.fn(async sql => {
        if (sql.includes("status = 'em_andamento'")) return { rows: [{ id: contagemId }] };
        return { rows: [] };
      }),
      release: jest.fn()
    };
    db.getClient.mockResolvedValueOnce(mockClient);
    db.query.mockResolvedValueOnce({ rows: [{ id: funcionarioId, papel: 'funcionario', ativo: true, empresa_id: empresaId, plano: 'ativo' }] });

    const res = await request(app).put(`/api/contagens/${contagemId}/finalizar`)
      .set('Authorization', `Bearer ${funcionarioToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SEM_ITENS_CONTADOS');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('lista somente produtores com produtos contados em sessões finalizadas', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: funcionarioId, papel: 'funcionario', ativo: true, empresa_id: empresaId, plano: 'ativo' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/contagens').set('Authorization', `Bearer ${funcionarioToken}`);

    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][0]).toMatch(/EXISTS[\s\S]*ci\.quantidade_contada IS NOT NULL/);
  });

  it('GET /api/contagens/:id — Após finalização, funcionário vê referência, diferença e situação', async () => {
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
    expect(db.query.mock.calls[2][0]).toMatch(/ci\.quantidade_contada IS NOT NULL/);

    expect(produto.estoque_referencia).toBe(15);
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
