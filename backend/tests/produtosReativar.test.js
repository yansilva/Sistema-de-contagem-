const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');
const { processarPdfEstoque } = require('../src/services/pdfStockImportService');

const mockClientQuery = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: jest.fn()
};

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

// PDF mockado: o teste controla o texto do relatório
jest.mock('pdf-parse/worker', () => ({
  CanvasFactory: jest.fn(),
  getData: () => 'data:text/javascript;base64,d29ya2Vy'
}));
jest.mock('pdf-parse', () => {
  const PDFParse = jest.fn();
  PDFParse.setWorker = jest.fn();
  return { PDFParse };
});

const app = require('../src/app');

const empresaId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const gestorId = '11111111-1111-1111-1111-111111111111';
const funcId = '22222222-2222-2222-2222-222222222222';
const produtoId = '33333333-3333-3333-3333-333333333333';
const inativoId = '44444444-4444-4444-4444-444444444444';

const usuarioGestor = {
  id: gestorId,
  nome: 'Gestor',
  email: 'gestor@teste.com',
  papel: 'gestor',
  ativo: true,
  must_change_password: false,
  empresa_id: empresaId,
  empresa_nome: 'Empresa',
  plano: 'ativo'
};

describe('Reativação de produto excluído pelo SKU (API)', () => {
  let tokenGestor;
  let tokenFuncionario;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    tokenGestor = gerarAccessToken({ id: gestorId, empresa_id: empresaId });
    tokenFuncionario = gerarAccessToken({ id: funcId, empresa_id: empresaId });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockReset();
    mockClientQuery.mockResolvedValue({ rows: [] });
    db.getClient.mockResolvedValue(mockClient);
  });

  const autenticarGestor = () => db.query.mockResolvedValueOnce({ rows: [usuarioGestor] });

  const sqlsExecutados = () => mockClientQuery.mock.calls.map((c) => String(c[0]));

  describe('POST /api/produtos (cadastro)', () => {
    it('SKU de produto INATIVO devolve 409 PRODUTO_INATIVO_EXISTE com o produto antigo e não insere', async () => {
      autenticarGestor();
      mockClientQuery.mockImplementation(async (sql) => {
        if (sql.includes('ativo = FALSE')) {
          return { rows: [{ id: inativoId, codigo: 'SKU-7', nome: 'Queijo antigo' }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/produtos')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({ codigo: 'SKU-7', nome: 'Queijo novo', fornecedor: 'Fornecedor A' });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PRODUTO_INATIVO_EXISTE');
      expect(res.body.message).toContain('Queijo antigo');
      expect(res.body.details).toEqual({
        produto_inativo: { id: inativoId, codigo: 'SKU-7', nome: 'Queijo antigo' }
      });
      expect(sqlsExecutados().some((sql) => sql.includes('INSERT INTO produtos'))).toBe(false);
    });

    it('SKU de produto ATIVO mantém CODIGO_DUPLICADO', async () => {
      autenticarGestor();
      mockClientQuery.mockImplementation(async (sql) => {
        if (sql.includes('INSERT INTO produtos')) {
          throw Object.assign(new Error('duplicate key'), { code: '23505' });
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/produtos')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({ codigo: 'SKU-ATIVO', nome: 'Produto', fornecedor: 'Fornecedor A' });

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('CODIGO_DUPLICADO');
    });
  });

  describe('PUT /api/produtos/:id (edição do SKU)', () => {
    it('trocar o SKU para um código de produto INATIVO devolve 409 PRODUTO_INATIVO_EXISTE', async () => {
      autenticarGestor();
      mockClientQuery.mockImplementation(async (sql) => {
        if (sql.includes('ativo = FALSE')) {
          return { rows: [{ id: inativoId, codigo: 'SKU-7', nome: 'Queijo antigo' }] };
        }
        if (sql.includes('id = $1') && sql.includes('ativo = TRUE')) {
          return { rows: [{ id: produtoId, codigo: 'SKU-1', nome: 'Ativo', fornecedor: 'F', estoque_atual: 0, contagem_em_pecas: false }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .put(`/api/produtos/${produtoId}`)
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({ codigo: 'SKU-7' });

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('PRODUTO_INATIVO_EXISTE');
      expect(res.body.details.produto_inativo.id).toBe(inativoId);
      expect(sqlsExecutados().some((sql) => sql.startsWith('UPDATE produtos'))).toBe(false);
    });
  });

  describe('POST /api/produtos/:id/reativar', () => {
    it('gestor reativa produto excluído: 200, ativo, atualizado_por e auditoria', async () => {
      autenticarGestor();
      mockClientQuery.mockImplementation(async (sql) => {
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: inativoId, codigo: 'SKU-7', nome: 'Queijo antigo', fornecedor: 'F', ativo: false }] };
        }
        if (sql.startsWith('UPDATE produtos')) {
          return { rows: [{ id: inativoId, codigo: 'SKU-7', nome: 'Queijo antigo', fornecedor: 'F', estoque_atual: 0, contagem_em_pecas: false, atualizado_em: new Date().toISOString() }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post(`/api/produtos/${inativoId}/reativar`)
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({});

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.produto.id).toBe(inativoId);

      const update = mockClientQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE produtos'));
      expect(String(update[0])).toContain('ativo = TRUE');
      expect(String(update[0])).toContain('atualizado_por');
      expect(update[1]).toEqual([inativoId, empresaId, gestorId]);
      const auditoria = sqlsExecutados().some((sql) => sql.includes('audit_logs'));
      expect(auditoria).toBe(true);
    });

    it('produto de outra empresa ou inexistente devolve 404 e a busca usa o tenant do token', async () => {
      autenticarGestor();
      mockClientQuery.mockImplementation(async () => ({ rows: [] }));

      const res = await request(app)
        .post(`/api/produtos/${inativoId}/reativar`)
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({});

      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('PRODUTO_NAO_ENCONTRADO');
      const busca = mockClientQuery.mock.calls.find((c) => String(c[0]).includes('FOR UPDATE'));
      expect(busca[1]).toEqual([inativoId, empresaId]);
      expect(sqlsExecutados().some((sql) => sql.startsWith('UPDATE produtos'))).toBe(false);
    });

    it('produto já ativo devolve 409 PRODUTO_JA_ATIVO sem atualizar', async () => {
      autenticarGestor();
      mockClientQuery.mockImplementation(async (sql) => {
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: produtoId, codigo: 'SKU-1', nome: 'Ativo', fornecedor: 'F', ativo: true }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post(`/api/produtos/${produtoId}/reativar`)
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({});

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('PRODUTO_JA_ATIVO');
      expect(sqlsExecutados().some((sql) => sql.startsWith('UPDATE produtos'))).toBe(false);
    });

    it('funcionário comum não pode reativar produto (403, mesma regra de criar/excluir)', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ ...usuarioGestor, id: funcId, papel: 'funcionario', email: 'func@teste.com' }]
      });

      const res = await request(app)
        .post(`/api/produtos/${inativoId}/reativar`)
        .set('Authorization', `Bearer ${tokenFuncionario}`)
        .send({});

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('ACESSO_RESTRITO_GESTOR');
      expect(db.getClient).not.toHaveBeenCalled();
    });
  });

  describe('Prévia do PDF de estoque', () => {
    const texto = `
Relatório de Estoque - Tiny ERP
Página 1 de 1
Código Descrição Un Saldo
001 Camiseta Básica Branca UN 15
002 Produto Excluído UN 8
999 Produto Desconhecido UN 4
`;

    it('SKU de produto inativo aparece em itens_ignorados com o motivo de reativação, fora de "não cadastrado"', async () => {
      require('pdf-parse').PDFParse.mockImplementationOnce(() => ({
        getText: async () => ({ text: texto }),
        destroy: async () => {}
      }));

      const previa = await processarPdfEstoque(Buffer.from('pdf'), 'tiny.pdf', [
        { id: 'a', codigo: '001', nome: 'Camiseta', fornecedor: 'F', estoque_atual: 10, ativo: true },
        { id: 'b', codigo: '002', nome: 'Produto Excluído', fornecedor: 'F', estoque_atual: 3, ativo: false }
      ]);

      expect(previa.produtos_para_atualizar.map((p) => p.codigo)).toEqual(['001']);
      expect(previa.itens_ignorados).toEqual([
        expect.objectContaining({ codigo: '002', motivo: 'produto excluído — reative em Produtos' })
      ]);
      expect(previa.skus_nao_encontrados.map((s) => s.codigo)).toEqual(['999']);
    });
  });
});
