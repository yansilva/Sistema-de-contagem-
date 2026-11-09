const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Valida o SQL de cadastro, edição e reativação contra um Postgres real.
// Só roda com TEST_DATABASE_URL apontando para um banco de TESTE (o nome precisa conter "test" ou "teste").
// Não usa DROP SCHEMA: apenas cria/atualiza o schema e limpa as linhas criadas pelos próprios testes.
let mockPool;
jest.mock('../src/config/db', () => ({
  query: (...args) => mockPool.query(...args),
  getClient: () => mockPool.connect(),
  pool: { connect: () => mockPool.connect() }
}));

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration('Reativação de produto pelo SKU (Postgres real)', () => {
  const empresasDaFixture = [];
  let produtosController;
  let empresaId;
  let outraEmpresaId;
  let gestorId;

  const chamar = (fn, req) =>
    new Promise((resolve) => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body }); return this; }
      };
      fn(req, res, (erro) => resolve({ erro }));
    });

  const reqGestor = (extra = {}) => ({
    empresaId,
    usuario: { id: gestorId, papel: 'gestor', email: 'gestor@pg.invalid' },
    auditContext: {},
    ...extra
  });

  const criarProdutoInativo = async (codigo, nome = 'Queijo antigo') => {
    const r = await mockPool.query(
      'INSERT INTO produtos(empresa_id, codigo, nome, fornecedor, ativo) VALUES ($1, $2, $3, $4, FALSE) RETURNING id',
      [empresaId, codigo, nome, 'Queijaria']
    );
    return r.rows[0].id;
  };

  const criarProdutoAtivo = async (codigo, nome = 'Queijo ativo') => {
    const r = await mockPool.query(
      'INSERT INTO produtos(empresa_id, codigo, nome, fornecedor) VALUES ($1, $2, $3, $4) RETURNING id',
      [empresaId, codigo, nome, 'Queijaria']
    );
    return r.rows[0].id;
  };

  const estadoAtivo = async (id) =>
    (await mockPool.query('SELECT ativo FROM produtos WHERE id = $1', [id])).rows[0].ativo;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!/test|teste/i.test(new URL(url).pathname)) {
      throw new Error('TEST_DATABASE_URL precisa apontar para um banco de teste (nome com "test" ou "teste").');
    }
    mockPool = new Pool({ connectionString: url, max: 5 });
    await mockPool.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));

    empresaId = (await mockPool.query(
      "INSERT INTO empresas(nome, email_contato) VALUES('Reativar teste', $1) RETURNING id",
      [`reativar-${Date.now()}@teste.invalid`]
    )).rows[0].id;
    outraEmpresaId = (await mockPool.query(
      "INSERT INTO empresas(nome, email_contato) VALUES('Outra empresa', $1) RETURNING id",
      [`reativar-outra-${Date.now()}@teste.invalid`]
    )).rows[0].id;
    empresasDaFixture.push(empresaId, outraEmpresaId);

    gestorId = (await mockPool.query(
      "INSERT INTO usuarios(empresa_id, nome, email, senha_hash, papel) VALUES($1, 'Gestor', $2, 'x', 'gestor') RETURNING id",
      [empresaId, `gestor-${Date.now()}@teste.invalid`]
    )).rows[0].id;

    produtosController = require('../src/controllers/produtosController');
  });

  afterAll(async () => {
    if (!mockPool) return;
    try {
      await mockPool.query('DELETE FROM audit_logs WHERE empresa_id = ANY($1::uuid[]) OR empresa_afetada_id = ANY($1::uuid[])', [empresasDaFixture]);
      await mockPool.query('DELETE FROM empresas WHERE id = ANY($1::uuid[])', [empresasDaFixture]);
    } finally {
      await mockPool.end();
    }
  });

  it('cadastrar SKU de produto inativo: 409 PRODUTO_INATIVO_EXISTE com o produto antigo, sem inserir duplicata', async () => {
    const sku = `PG-CAD-${Date.now()}`;
    const inativoId = await criarProdutoInativo(sku, 'Queijo antigo');

    const r = await chamar(produtosController.criar, reqGestor({
      body: { codigo: sku, nome: 'Queijo novo', fornecedor: 'Queijaria', estoque_atual: 0 }
    }));

    expect(r.erro.statusCode).toBe(409);
    expect(r.erro.code).toBe('PRODUTO_INATIVO_EXISTE');
    expect(r.erro.details).toEqual({ produto_inativo: { id: inativoId, codigo: sku, nome: 'Queijo antigo' } });
    const linhas = (await mockPool.query('SELECT id FROM produtos WHERE empresa_id = $1 AND codigo = $2', [empresaId, sku])).rows;
    expect(linhas).toHaveLength(1);
  });

  it('cadastrar SKU de produto ativo continua 409 CODIGO_DUPLICADO', async () => {
    const sku = `PG-ATIVO-${Date.now()}`;
    await criarProdutoAtivo(sku);

    const r = await chamar(produtosController.criar, reqGestor({
      body: { codigo: sku, nome: 'Outro', fornecedor: 'Queijaria', estoque_atual: 0 }
    }));

    expect(r.erro.statusCode).toBe(409);
    expect(r.erro.code).toBe('CODIGO_DUPLICADO');
  });

  it('reativar: volta ao catálogo ativo com o mesmo id e grava auditoria produto_reativado', async () => {
    const sku = `PG-REA-${Date.now()}`;
    const inativoId = await criarProdutoInativo(sku);

    const r = await chamar(produtosController.reativar, reqGestor({ params: { id: inativoId } }));

    expect(r.erro).toBeUndefined();
    expect(r.status).toBe(200);
    expect(r.body.data.produto.id).toBe(inativoId);
    expect(await estadoAtivo(inativoId)).toBe(true);

    const naLista = (await mockPool.query(
      'SELECT id FROM produtos WHERE empresa_id = $1 AND ativo = TRUE AND codigo = $2',
      [empresaId, sku]
    )).rows;
    expect(naLista.map((x) => x.id)).toEqual([inativoId]);

    const auditoria = (await mockPool.query(
      "SELECT count(*)::int AS total FROM audit_logs WHERE entidade_id = $1 AND acao = 'produto_reativado'",
      [inativoId]
    )).rows[0].total;
    expect(auditoria).toBe(1);

    const atualizadoPor = (await mockPool.query('SELECT atualizado_por FROM produtos WHERE id = $1', [inativoId])).rows[0].atualizado_por;
    expect(atualizadoPor).toBe(gestorId);
  });

  it('reativar produto de outra empresa devolve 404 e não altera nada', async () => {
    const sku = `PG-OUTRA-${Date.now()}`;
    const idDeOutra = (await mockPool.query(
      'INSERT INTO produtos(empresa_id, codigo, nome, fornecedor, ativo) VALUES ($1, $2, $3, $4, FALSE) RETURNING id',
      [outraEmpresaId, sku, 'Produto de outra', 'Queijaria']
    )).rows[0].id;

    const r = await chamar(produtosController.reativar, reqGestor({ params: { id: idDeOutra } }));

    expect(r.erro.statusCode).toBe(404);
    expect(r.erro.code).toBe('PRODUTO_NAO_ENCONTRADO');
    expect(await estadoAtivo(idDeOutra)).toBe(false);
  });

  it('reativar produto já ativo devolve 409 PRODUTO_JA_ATIVO', async () => {
    const ativoId = await criarProdutoAtivo(`PG-JA-${Date.now()}`);

    const r = await chamar(produtosController.reativar, reqGestor({ params: { id: ativoId } }));

    expect(r.erro.statusCode).toBe(409);
    expect(r.erro.code).toBe('PRODUTO_JA_ATIVO');
  });

  it('editar o SKU para código de produto inativo: 409 PRODUTO_INATIVO_EXISTE, sem alterar o produto', async () => {
    const skuInativo = `PG-EDI-I-${Date.now()}`;
    await criarProdutoInativo(skuInativo, 'Excluído');
    const ativoId = await criarProdutoAtivo(`PG-EDI-A-${Date.now()}`, 'Ativo editado');

    const r = await chamar(produtosController.editar, reqGestor({
      params: { id: ativoId },
      body: { codigo: skuInativo }
    }));

    expect(r.erro.statusCode).toBe(409);
    expect(r.erro.code).toBe('PRODUTO_INATIVO_EXISTE');
    expect(r.erro.details.produto_inativo.nome).toBe('Excluído');
    expect(await estadoAtivo(ativoId)).toBe(true);
  });

  it('a listagem do PDF (SQL sem filtro de ativo) traz o flag ativo para separar os inativos', async () => {
    const sku = `PG-PDF-${Date.now()}`;
    await criarProdutoInativo(sku);
    const linhas = (await mockPool.query(
      `SELECT id, codigo, nome, fornecedor, estoque_atual, ativo
       FROM produtos
       WHERE empresa_id = $1`,
      [empresaId]
    )).rows;
    const linha = linhas.find((x) => x.codigo === sku);
    expect(linha.ativo).toBe(false);
  });
});
