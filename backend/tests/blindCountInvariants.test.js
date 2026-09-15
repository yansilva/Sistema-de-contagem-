const {
  serializeItem,
  serializeFornecedor,
  serializeContagemDetalhe
} = require('../src/serializers/contagemSerializer');

describe('Invariantes de Contagem Cega (Blind Count Security)', () => {
  const usuarioFuncionario = {
    id: 'f1111111-1111-1111-1111-111111111111',
    nome: 'Operador de Estoque',
    papel: 'funcionario'
  };

  const usuarioAdmin = {
    id: 'a2222222-2222-2222-2222-222222222222',
    nome: 'Gerente Geral',
    papel: 'administrador'
  };

  const rawItem = {
    id: 'item-01',
    produto_id: 'prod-01',
    codigo: 'SKU-MELATO-250',
    nome: 'Melato de Figo Araci 250g',
    estoque_referencia: 42,
    quantidade_contada: 40,
    diferenca: -2,
    situacao: 'falta',
    contado_em: '2026-09-14T10:00:00Z'
  };

  const rawFornecedor = {
    id: 'forn-01',
    fornecedor: 'Araci Alimentos',
    tem_diferenca: true,
    contado_em: '2026-09-14T10:00:00Z',
    produtos: [rawItem]
  };

  const rawContagemAberta = {
    id: 'cont-01',
    iniciado_em: '2026-09-14T09:00:00Z',
    finalizado_em: null,
    status: 'em_andamento',
    tem_diferenca: false,
    iniciado_por_nome: 'Gerente Geral'
  };

  const rawContagemFinalizada = {
    id: 'cont-01',
    iniciado_em: '2026-09-14T09:00:00Z',
    finalizado_em: '2026-09-14T11:00:00Z',
    status: 'finalizada',
    tem_diferenca: true,
    iniciado_por_nome: 'Gerente Geral'
  };

  describe('Invariante 1: Ocultação estrita de estoque_referencia para funcionários', () => {
    it('Funcionário em contagem ABERTA não recebe estoque_referencia', () => {
      const item = serializeItem(rawItem, usuarioFuncionario, false);
      expect(item).not.toHaveProperty('estoque_referencia');
      expect(item.estoque_referencia).toBeUndefined();
    });

    it('Funcionário em contagem FINALIZADA não recebe estoque_referencia', () => {
      const item = serializeItem(rawItem, usuarioFuncionario, true);
      expect(item).not.toHaveProperty('estoque_referencia');
      expect(item.estoque_referencia).toBeUndefined();
    });

    it('Administrador tem acesso a estoque_referencia', () => {
      const itemAberto = serializeItem(rawItem, usuarioAdmin, false);
      expect(itemAberto.estoque_referencia).toBe(42);

      const itemFinalizado = serializeItem(rawItem, usuarioAdmin, true);
      expect(itemFinalizado.estoque_referencia).toBe(42);
    });
  });

  describe('Invariante 2: Ocultação de diferenças e situações durante contagem aberta', () => {
    it('Funcionário durante contagem ABERTA não recebe diferenca nem situacao', () => {
      const item = serializeItem(rawItem, usuarioFuncionario, false);
      expect(item).not.toHaveProperty('diferenca');
      expect(item).not.toHaveProperty('situacao');
      expect(item).not.toHaveProperty('sem_diferenca');
    });

    it('Funcionário durante contagem ABERTA não vê sinal tem_diferenca no cabeçalho ou fornecedor', () => {
      const contagem = serializeContagemDetalhe(rawContagemAberta, [rawFornecedor], usuarioFuncionario);
      expect(contagem.tem_diferenca).toBeUndefined();
      expect(contagem.fornecedores[0].tem_diferenca).toBeUndefined();
    });
  });

  describe('Invariante 3: Liberação controlada de divergências apenas pós-finalização', () => {
    it('Funcionário em contagem FINALIZADA recebe diferenca e situacao, mas NUNCA estoque_referencia', () => {
      const item = serializeItem(rawItem, usuarioFuncionario, true);
      expect(item.diferenca).toBe(-2);
      expect(item.situacao).toBe('falta');
      expect(item.sem_diferenca).toBe(false);
      expect(item).not.toHaveProperty('estoque_referencia');
    });

    it('Administrador em contagem FINALIZADA recebe visão completa (referencia + diferenca + situacao)', () => {
      const item = serializeItem(rawItem, usuarioAdmin, true);
      expect(item.estoque_referencia).toBe(42);
      expect(item.diferenca).toBe(-2);
      expect(item.situacao).toBe('falta');
      expect(item.sem_diferenca).toBe(false);
    });

    it('Serialização completa da contagem respeita as invariantes estruturais', () => {
      const contagem = serializeContagemDetalhe(rawContagemFinalizada, [rawFornecedor], usuarioFuncionario);
      expect(contagem.status).toBe('finalizada');
      expect(contagem.tem_diferenca).toBe(true);
      expect(contagem.fornecedores[0].produtos[0].codigo).toBe('SKU-MELATO-250');
      expect(contagem.fornecedores[0].produtos[0].quantidade_contada).toBe(40);
      expect(contagem.fornecedores[0].produtos[0].diferenca).toBe(-2);
      expect(contagem.fornecedores[0].produtos[0]).not.toHaveProperty('estoque_referencia');
    });
  });
});
