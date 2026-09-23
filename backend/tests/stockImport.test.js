const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');
const { extrairLinhaTiny, normalizarSku, parseQuantidade, processarPdfEstoque } = require('../src/services/pdfStockImportService');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

// Mock do pdf-parse para testes previsíveis
jest.mock('pdf-parse/worker', () => ({
  CanvasFactory: jest.fn(),
  getData: () => 'data:text/javascript;base64,d29ya2Vy'
}));
jest.mock('pdf-parse', () => {
  const PDFParse = jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({ text: `
Relatório de Estoque - Tiny ERP
Página 1 de 1
Código Descrição Un Saldo
001 Camiseta Básica Branca UN 15
002 Camiseta Básica Preta UN 25
999 Produto Desconhecido Não Cadastrado UN 8
Total Geral 48
` }),
    destroy: jest.fn().mockResolvedValue()
  }));
  PDFParse.setWorker = jest.fn();
  return { PDFParse };
});

const app = require('../src/app');

describe('Importação e Atualização de Estoque via PDF do Tiny ERP', () => {
  const empresaId = '11111111-1111-1111-1111-111111111111';
  const adminId = '22222222-2222-2222-2222-222222222222';
  let adminToken;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    adminToken = gerarAccessToken({ id: adminId, empresa_id: empresaId });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Unidade: pdfStockImportService', () => {
    it('lê o PDF com a API atual e fecha o parser', async () => {
      const { PDFParse } = require('pdf-parse');
      const preview = await processarPdfEstoque(Buffer.from('pdf'), 'tiny.pdf', []);
      expect(preview.produtos_encontrados).toBe(3);
      expect(PDFParse).toHaveBeenCalledTimes(1);
      expect(PDFParse.mock.results[0].value.destroy).toHaveBeenCalledTimes(1);
    });

    it('interpreta o estoque da Olist sem confundir preço, inclusive descrições quebradas', async () => {
      const { PDFParse } = require('pdf-parse');
      PDFParse.mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({ text: `Estoque - Depósito São Paulo
Código (SKU) Descrição \tPreço Estoque Unidade Localização
1.1.000760.01 Comprar Peça - Queijo Mantiqueira \t357,00 0,00 KG
1.11.001021.01 Aliciella Antepasto de Sardinha
- 100g \t30,00 6,00 UN
1.1.000187.01 Peça Queijo Tulha \t1.531,66 11,89 PÇ
1.1.000498.02 Queijo Feta \t263,00 2,49 KG
1.1.000327-02 Queijo Sol do Japi \t63,00 -3,00 UN
1.15.000958.01-
1 \tCerveja Easy Pils! \t27,00 4,00 UN
1.11.009999.01 Produto não cadastrado \t85,00 7,00 UN
Boursin sem código \t200,00 -2,00 KG
1 \tCerveja A \t27,00 4,00 UN
1 \tCerveja B \t32,00 9,00 UN` }),
        destroy: jest.fn().mockResolvedValue()
      }));
      const produtos = [
        { id: 'p1', codigo: '1.1.000760.01', nome: 'Mantiqueira', estoque_atual: 5 },
        { id: 'p2', codigo: '1.11.001021.01', nome: 'Aliciella', estoque_atual: 0 },
        { id: 'p3', codigo: '1.1.000187.01', nome: 'Tulha', estoque_atual: 4 },
        { id: 'p4', codigo: '1.1.000498.02', nome: 'Feta', estoque_atual: 4 },
        { id: 'p5', codigo: '1.1.000327-02', nome: 'Sol do Japi', estoque_atual: 4 },
        { id: 'p6', codigo: '1', nome: 'Cerveja A', estoque_atual: 4 },
        { id: 'p7', codigo: '1.15.000958.01-1', nome: 'Easy Pils', estoque_atual: 0 }
      ];
      const preview = await processarPdfEstoque(Buffer.from('pdf'), 'olist.pdf', produtos);
      expect(preview.formato).toBe('olist');
      expect(preview.produtos_para_atualizar.map((p) => [p.codigo, p.estoque_novo])).toEqual([
        ['1.1.000760.01', 0], ['1.11.001021.01', 6], ['1.1.000327-02', -3], ['1.15.000958.01-1', 4]
      ]);
      expect(preview.skus_nao_encontrados).toEqual([{ codigo: '1.11.009999.01', nome_relatorio: 'Produto não cadastrado', quantidade: 7 }]);
      expect(preview.itens_ignorados.map((p) => p.motivo)).toEqual(expect.arrayContaining([
        'Estoque fracionário', 'SKU ausente', 'SKU repetido no PDF'
      ]));
    });
    it('normalizarSku — remove espaços e padroniza caixa alta', () => {
      expect(normalizarSku(' sku-101 ')).toBe('SKU-101');
      expect(normalizarSku('001')).toBe('001');
      expect(normalizarSku(null)).toBe('');
    });

    it('parseQuantidade — trata números inteiros e decimais brasileiros', () => {
      expect(parseQuantidade('15')).toBe(15);
      expect(parseQuantidade('12,00')).toBe(12);
      expect(parseQuantidade('1.250')).toBe(1250);
      expect(parseQuantidade('-3')).toBe(-3);
      expect(parseQuantidade(20)).toBe(20);
    });

    it('extrairLinhaTiny — identifica SKU, descrição e saldo, ignorando cabeçalhos', () => {
      const linhaValida = '001 Camiseta Básica Branca UN 15';
      const parsed = extrairLinhaTiny(linhaValida);
      expect(parsed).toEqual({
        codigo: '001',
        nome: 'Camiseta Básica Branca',
        quantidade: 15
      });

      const cabecalho = 'Relatório de Estoque - Tiny ERP';
      expect(extrairLinhaTiny(cabecalho)).toBeNull();

      const rodape = 'Total Geral 100';
      expect(extrairLinhaTiny(rodape)).toBeNull();
    });
  });

  describe('Integração: Endpoints de Estoque', () => {
    it('POST /api/estoque/upload-pdf — Retorna prévia sem alterar o banco de dados', async () => {
      db.query
        // 1. auth middleware
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
        // 2. buscar produtos ativos da empresa
        .mockResolvedValueOnce({
          rows: [
            { id: 'p1', codigo: '001', nome: 'Camiseta Básica Branca', fornecedor: 'Têxtil Sul', estoque_atual: 10 },
            { id: 'p2', codigo: '002', nome: 'Camiseta Básica Preta', fornecedor: 'Têxtil Sul', estoque_atual: 20 }
          ]
        });

      const fakePdfBuffer = Buffer.from('%PDF-1.4 fake content');

      const res = await request(app)
        .post('/api/estoque/upload-pdf')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('arquivo', fakePdfBuffer, 'relatorio_tiny.pdf');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.produtos_encontrados).toBe(3); // 001, 002 e 999
      expect(res.body.data.produtos_correspondentes).toBe(2); // 001 e 002 no banco
      expect(res.body.data.skus_nao_encontrados_total).toBe(1); // 999 é pendência
      expect(res.body.data.skus_nao_encontrados[0].codigo).toBe('999');
    });

    it('POST /api/estoque/confirmar-atualizacao — Atualiza estoque_atual no banco e grava histórico', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 'p1' }] }) // UPDATE 001
          .mockResolvedValueOnce({ rows: [{ id: 'p2' }] }) // UPDATE 002
          .mockResolvedValueOnce({ rows: [] }) // INSERT historico
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
        .post('/api/estoque/confirmar-atualizacao')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome_arquivo: 'relatorio_tiny.pdf',
          produtos_encontrados: 3,
          linhas_ignoradas: 2,
          skus_nao_encontrados: [{ codigo: '999', nome: 'Pendente', quantidade: 8 }],
          atualizacoes: [
            { codigo: '001', estoque_atual: 15 },
            { codigo: '002', estoque_atual: 25 }
          ]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.produtos_atualizados).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('GET /api/estoque/historico — Lista auditoria de importações', async () => {
      db.query
        // auth
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
        // historico
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'hist-1',
              nome_arquivo: 'relatorio_tiny.pdf',
              produtos_encontrados: 3,
              produtos_atualizados: 2,
              skus_nao_encontrados: [{ codigo: '999' }],
              linhas_ignoradas: 2,
              status: 'concluido',
              criado_em: new Date().toISOString(),
              usuario_nome: 'Admin'
            }
          ]
        });

      const res = await request(app)
        .get('/api/estoque/historico')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.historico.length).toBe(1);
      expect(res.body.data.historico[0].produtos_atualizados).toBe(2);
    });
  });
});
