const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const { withTransaction } = require('../src/config/transaction');
const app = require('../src/app');

describe('withTransaction', () => {
  const novoClient = (impl) => ({ query: jest.fn(impl || (async () => ({ rows: [] }))), release: jest.fn() });

  beforeEach(() => jest.clearAllMocks());

  it('confirma e libera o cliente uma única vez, devolvendo o resultado', async () => {
    const client = novoClient();
    db.getClient.mockResolvedValueOnce(client);
    await expect(withTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it('reverte, repassa o erro original e libera sem descartar a conexão', async () => {
    const client = novoClient();
    db.getClient.mockResolvedValueOnce(client);
    const erro = new Error('regra de negócio');
    await expect(withTransaction(async () => { throw erro; })).rejects.toBe(erro);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it('ROLLBACK que falha não mascara o erro original e descarta a conexão quebrada', async () => {
    const quebrada = new Error('Connection terminated');
    const client = novoClient(async (sql) => {
      if (sql === 'ROLLBACK') throw quebrada;
      return { rows: [] };
    });
    db.getClient.mockResolvedValueOnce(client);
    const erro = new Error('falha original');
    await expect(withTransaction(async () => { throw erro; })).rejects.toBe(erro);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(quebrada);
  });

  it('COMMIT que falha reverte e propaga o erro do COMMIT', async () => {
    const falhaCommit = new Error('commit falhou');
    const client = novoClient(async (sql) => {
      if (sql === 'COMMIT') throw falhaCommit;
      return { rows: [] };
    });
    db.getClient.mockResolvedValueOnce(client);
    await expect(withTransaction(async () => 1)).rejects.toBe(falhaCommit);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('BEGIN que falha não tenta ROLLBACK e descarta a conexão', async () => {
    const falha = new Error('sem conexão');
    const client = novoClient(async () => { throw falha; });
    db.getClient.mockResolvedValueOnce(client);
    const fn = jest.fn();
    await expect(withTransaction(fn)).rejects.toBe(falha);
    expect(fn).not.toHaveBeenCalled();
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN']);
    expect(client.release).toHaveBeenCalledWith(falha);
  });
});

describe('Contagens em lote (salvar-progresso, finalizar, listar)', () => {
  const empresaId = '11111111-1111-1111-1111-111111111111';
  const funcionarioId = '33333333-3333-3333-3333-333333333333';
  const contagemId = '44444444-4444-4444-4444-444444444444';
  const fornecedorId = '66666666-6666-4666-8666-666666666666';
  const P1 = '11111111-aaaa-4aaa-8aaa-111111111111';
  const P2 = '22222222-aaaa-4aaa-8aaa-222222222222';
  const P3 = '33333333-aaaa-4aaa-8aaa-333333333333';
  let token;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    token = gerarAccessToken({ id: funcionarioId, empresa_id: empresaId });
  });

  beforeEach(() => {
    jest.resetAllMocks();
    db.query.mockResolvedValueOnce({ rows: [{ id: funcionarioId, papel: 'funcionario', ativo: true, empresa_id: empresaId, plano: 'ativo' }] });
  });

  const sqls = (client) => client.query.mock.calls.map(([sql]) => String(sql));
  const chamadas = (client, trecho) => client.query.mock.calls.filter(([sql]) => String(sql).includes(trecho));

  describe('salvar-progresso', () => {
    const clienteSalvar = ({ tipo = 'geral', casados = [], produto = [] } = {}) => ({
      query: jest.fn(async (sql) => {
        sql = String(sql);
        if (sql.includes('SELECT id, tipo FROM contagens')) return { rows: [{ id: contagemId, tipo }] };
        if (sql.includes('SELECT id FROM contagem_fornecedores')) return { rows: [{ id: fornecedorId }] };
        if (sql.startsWith('UPDATE contagem_itens')) return { rows: casados.map(produto_id => ({ produto_id })) };
        if (sql.includes('SELECT id, codigo, nome, estoque_atual FROM produtos')) return { rows: produto };
        return { rows: [] };
      }),
      release: jest.fn()
    });

    it('grava todos os itens em um único UPDATE, o último vale para produto repetido e NULL difere de zero', async () => {
      const client = clienteSalvar({ casados: [P1, P2, P3] });
      db.getClient.mockResolvedValueOnce(client);

      const res = await request(app).put(`/api/contagens/${contagemId}/salvar-progresso`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fornecedor: 'Produtor', itens: [
          { produto_id: P1, quantidade_contada: 5, quantidade_vencida: 1 },
          { produto_id: P2, quantidade_contada: 0 },
          { produto_id: P3, quantidade_contada: null },
          { produto_id: P1, quantidade_contada: 8, quantidade_vencida: 3 }
        ] });

      expect(res.status).toBe(200);
      expect(res.body.data.itens_salvos).toBe(4);
      const updates = chamadas(client, 'UPDATE contagem_itens');
      expect(updates).toHaveLength(1);
      const [, [forn, ids, qtds, vencs]] = updates[0];
      expect(forn).toBe(fornecedorId);
      expect(ids).toEqual([P1, P2, P3]);
      expect(qtds).toEqual([8, 0, null]);
      expect(vencs).toEqual([3, 0, 0]);
      expect(sqls(client)).toContain('COMMIT');
      expect(sqls(client)).not.toContain('ROLLBACK');
    });

    it('geral: item sem correspondência no snapshot derruba o lote inteiro (ROLLBACK)', async () => {
      const client = clienteSalvar({ casados: [P1] });
      db.getClient.mockResolvedValueOnce(client);

      const res = await request(app).put(`/api/contagens/${contagemId}/salvar-progresso`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fornecedor: 'Produtor', itens: [{ produto_id: P1, quantidade_contada: 1 }, { produto_id: P2, quantidade_contada: 1 }] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ITEM_INCOMPATIVEL');
      expect(sqls(client)).toContain('ROLLBACK');
      expect(sqls(client)).not.toContain('COMMIT');
    });

    it('peças: só o item não casado segue o caminho de inclusão dinâmica', async () => {
      const client = clienteSalvar({
        tipo: 'pecas_queijo',
        casados: [P1],
        produto: [{ id: P2, codigo: 'NOVO', nome: 'Peça nova', estoque_atual: 9 }]
      });
      db.getClient.mockResolvedValueOnce(client);

      const res = await request(app).put(`/api/contagens/${contagemId}/salvar-progresso`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fornecedor: 'Produtor', itens: [{ produto_id: P1, quantidade_contada: 2 }, { produto_id: P2, quantidade_contada: null }] });

      expect(res.status).toBe(200);
      expect(res.body.data.itens_salvos).toBe(2);
      expect(chamadas(client, 'SELECT id, codigo, nome, estoque_atual FROM produtos')).toHaveLength(1);
      const inserts = chamadas(client, 'INSERT INTO contagem_itens');
      expect(inserts).toHaveLength(1);
      // peças: sem referência de estoque; quantidade nula preservada
      expect(inserts[0][1]).toEqual([fornecedorId, P2, 'NOVO', 'Peça nova', null, null]);
    });

    it('UPPERCASE no UUID de entrada ainda casa com o retorno minúsculo do Postgres', async () => {
      const client = clienteSalvar({ casados: [P1] });
      db.getClient.mockResolvedValueOnce(client);

      const res = await request(app).put(`/api/contagens/${contagemId}/salvar-progresso`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fornecedor: 'Produtor', itens: [{ produto_id: P1.toUpperCase(), quantidade_contada: 2 }] });

      expect(res.status).toBe(200);
    });
  });

  describe('finalizar: baixa de vencidos em lote', () => {
    /**
     * Cliente que imita as consultas da finalização com estoque em memória.
     * Registra os parâmetros dos UPDATEs em lote para comparação com a semântica antiga item a item.
     */
    function clienteFinalizar({ vencidos, estoques, historicoRetorna, produtosRetorna }) {
      const client = {
        query: jest.fn(async (sql, params) => {
          sql = String(sql);
          if (sql.includes("status = 'em_andamento'")) return { rows: [{ id: contagemId, tipo: 'geral' }] };
          if (sql.startsWith('UPDATE contagem_itens AS ci') && sql.includes('SET diferenca')) {
            return { rows: [{ contagem_fornecedor_id: 'f1', diferenca: 0 }] };
          }
          if (sql.includes('ci.quantidade_vencida > 0')) return { rows: vencidos };
          if (sql.includes('FROM produtos WHERE id = ANY')) {
            return { rows: Object.entries(estoques).map(([id, estoque_atual]) => ({ id, estoque_atual })) };
          }
          if (sql.startsWith('UPDATE produtos AS p')) {
            return { rows: (produtosRetorna ?? params[0]).map(id => ({ id })) };
          }
          if (sql.includes('SET estoque_antes_baixa_vencidos')) {
            return { rows: (historicoRetorna ?? params[0]).map(id => ({ id })) };
          }
          if (sql.includes("SET status = 'finalizada'")) return { rows: [{ id: contagemId, tipo: 'geral', status: 'finalizada', tem_diferenca: false }] };
          return { rows: [] };
        }),
        release: jest.fn()
      };
      db.getClient.mockResolvedValueOnce(client);
      return client;
    }

    const finalizar = () => request(app).put(`/api/contagens/${contagemId}/finalizar`).set('Authorization', `Bearer ${token}`);

    it('limita a baixa ao estoque, nunca deixa negativo e registra o histórico de cada item', async () => {
      const client = clienteFinalizar({
        vencidos: [
          { id: 'i1', produto_id: P1, quantidade_vencida: 4 },
          { id: 'i2', produto_id: P2, quantidade_vencida: 5 },
          { id: 'i3', produto_id: P3, quantidade_vencida: 2 }
        ],
        estoques: { [P1]: 10, [P2]: 3, [P3]: 0 }
      });

      const res = await finalizar();

      expect(res.status).toBe(200);
      expect(res.body.data.contagem.total_vencidos).toBe(11);
      const trava = chamadas(client, 'FROM produtos WHERE id = ANY');
      expect(trava).toHaveLength(1);
      expect(String(trava[0][0])).toMatch(/ORDER BY id\s+FOR UPDATE/);
      expect(trava[0][1]).toEqual([[P1, P2, P3], empresaId]);

      const baixa = chamadas(client, 'UPDATE produtos AS p');
      expect(baixa).toHaveLength(1);
      expect(baixa[0][1]).toEqual([[P1, P2, P3], [6, 0, 0], empresaId]);

      const historico = chamadas(client, 'SET estoque_antes_baixa_vencidos');
      expect(historico).toHaveLength(1);
      // antes da baixa 10/3/0; baixadas 4/3/0 (limitadas ao estoque)
      expect(historico[0][1]).toEqual([['i1', 'i2', 'i3'], [10, 3, 0], [4, 3, 0]]);
      expect(sqls(client)).toContain('COMMIT');
    });

    it('mesmo produto em mais de um item enxerga o saldo já baixado, como no laço antigo', async () => {
      const client = clienteFinalizar({
        vencidos: [
          { id: 'i1', produto_id: P1, quantidade_vencida: 4 },
          { id: 'i2', produto_id: P1, quantidade_vencida: 4 },
          { id: 'i3', produto_id: P1, quantidade_vencida: 4 }
        ],
        estoques: { [P1]: 10 }
      });

      const res = await finalizar();

      expect(res.status).toBe(200);
      expect(chamadas(client, 'UPDATE produtos AS p')[0][1]).toEqual([[P1], [0], empresaId]);
      // 10 -> 6 -> 2 -> 0 : antes 10/6/2; baixadas 4/4/2 (a última limitada)
      expect(chamadas(client, 'SET estoque_antes_baixa_vencidos')[0][1]).toEqual([['i1', 'i2', 'i3'], [10, 6, 2], [4, 4, 2]]);
    });

    it('sem vencidos nenhuma consulta de baixa roda', async () => {
      const client = clienteFinalizar({ vencidos: [], estoques: {} });

      const res = await finalizar();

      expect(res.status).toBe(200);
      expect(chamadas(client, 'FROM produtos WHERE id = ANY')).toHaveLength(0);
      expect(chamadas(client, 'UPDATE produtos AS p')).toHaveLength(0);
    });

    it('produto ausente ou de outra empresa derruba tudo com 409 e ROLLBACK', async () => {
      const client = clienteFinalizar({
        vencidos: [{ id: 'i1', produto_id: P1, quantidade_vencida: 1 }, { id: 'i2', produto_id: P2, quantidade_vencida: 1 }],
        estoques: { [P1]: 5 }
      });

      const res = await finalizar();

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRODUTO_BAIXA_INDISPONIVEL');
      expect(chamadas(client, 'UPDATE produtos AS p')).toHaveLength(0);
      expect(sqls(client)).toContain('ROLLBACK');
      expect(sqls(client)).not.toContain('COMMIT');
    });

    it('estoque nulo não é elegível para baixa', async () => {
      const client = clienteFinalizar({
        vencidos: [{ id: 'i1', produto_id: P1, quantidade_vencida: 1 }],
        estoques: { [P1]: null }
      });

      const res = await finalizar();

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRODUTO_BAIXA_INDISPONIVEL');
      expect(sqls(client)).toContain('ROLLBACK');
    });

    it('UPDATE de produtos que não atinge todos os produtos reverte', async () => {
      const client = clienteFinalizar({
        vencidos: [{ id: 'i1', produto_id: P1, quantidade_vencida: 1 }],
        estoques: { [P1]: 5 },
        produtosRetorna: []
      });

      const res = await finalizar();

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRODUTO_BAIXA_INDISPONIVEL');
      expect(sqls(client)).toContain('ROLLBACK');
    });

    it('histórico incompleto reverte com BAIXA_INCOMPLETA', async () => {
      const client = clienteFinalizar({
        vencidos: [{ id: 'i1', produto_id: P1, quantidade_vencida: 1 }, { id: 'i2', produto_id: P2, quantidade_vencida: 1 }],
        estoques: { [P1]: 5, [P2]: 5 },
        historicoRetorna: ['i1']
      });

      const res = await finalizar();

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BAIXA_INCOMPLETA');
      expect(sqls(client)).toContain('ROLLBACK');
      expect(sqls(client)).not.toContain('COMMIT');
    });
  });

  describe('listar: paginação antes da agregação', () => {
    it('limita a CTE por empresa/ordem/LIMIT e agrega só a página; total vem da janela', async () => {
      db.query.mockResolvedValueOnce({ rows: [
        { id: contagemId, tipo: 'geral', status: 'finalizada', iniciado_em: new Date().toISOString(), total_geral: '57', total_vencidos: '0', fornecedores: [] }
      ] });

      const res = await request(app).get('/api/contagens?page=2&limit=10&status=finalizada').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(57);
      const [sql, params] = db.query.mock.calls[1];
      expect(params).toEqual([empresaId, 10, 10, null, 'finalizada']);
      const cte = sql.slice(sql.indexOf('WITH pagina AS'), sql.indexOf('SELECT p.id'));
      expect(cte).toMatch(/WHERE c\.empresa_id = \$1/);
      expect(cte).toMatch(/ORDER BY c\.iniciado_em DESC, c\.id DESC\s+LIMIT \$2 OFFSET \$3/);
      expect(cte).not.toMatch(/contagem_fornecedores|contagem_itens|json_agg/);
      expect(sql).toMatch(/FROM pagina p/);
    });

    it('página além do fim devolve lista vazia e total zero', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/contagens?page=99').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ contagens: [], total: 0 });
    });
  });
});
