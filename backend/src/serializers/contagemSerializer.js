/**
 * Serializador Blindado para Contagens
 * Garante as regras invariáveis de contagem cega:
 * 1. Funcionário NUNCA recebe estoque_referencia ou estoque_atual (antes ou depois da finalização).
 * 2. Em contagem aberta (em_andamento), funcionário NUNCA recebe diferenca ou situacao.
 * 3. Somente após finalizada, funcionário recebe diferenca e situacao.
 * 4. Administrador recebe visão completa após finalização (e estoque_referencia).
 */

function isAdministrador(usuario = {}) {
  const p = (usuario.papel || '').toLowerCase();
  return p === 'administrador' || p === 'gestor' || p === 'admin' || p === 'super_admin';
}

/**
 * Serializa um item individual de contagem
 */
function serializeItem(item, usuario, isFinalizada) {
  const admin = isAdministrador(usuario);

  const base = {
    id: item.id,
    produto_id: item.produto_id,
    codigo: item.codigo,
    nome: item.nome,
    quantidade_contada: item.quantidade_contada !== undefined ? item.quantidade_contada : null,
    contado_em: item.contado_em || null,
    qty_contagem: item.quantidade_contada || 0
  };

  if (!isFinalizada) {
    if (admin) {
      base.estoque_referencia = item.estoque_referencia !== undefined ? item.estoque_referencia : null;
    }
    return base;
  }

  // Contagem finalizada
  if (admin) {
    return {
      ...base,
      estoque_referencia: item.estoque_referencia !== undefined ? item.estoque_referencia : null,
      diferenca: item.diferenca !== undefined ? item.diferenca : null,
      situacao: item.situacao || null,
      sem_diferenca: item.diferenca === 0
    };
  }

  // Funcionário em contagem finalizada:
  // Vê diferenca e situacao, mas NUNCA estoque_referencia
  return {
    ...base,
    diferenca: item.diferenca !== undefined ? item.diferenca : null,
    situacao: item.situacao || null,
    sem_diferenca: item.diferenca === 0
  };
}

/**
 * Serializa fornecedores e seus itens de uma contagem
 */
function serializeFornecedor(fornecedor, usuario, isFinalizada) {
  const itens = Array.isArray(fornecedor.produtos) ? fornecedor.produtos : [];
  return {
    id: fornecedor.id,
    fornecedor: fornecedor.fornecedor,
    tem_diferenca: isAdministrador(usuario) || isFinalizada ? fornecedor.tem_diferenca : undefined,
    contado_em: fornecedor.contado_em,
    produtos: itens.map(p => serializeItem(p, usuario, isFinalizada))
  };
}

/**
 * Serializa a contagem completa com fornecedores e itens
 */
function serializeContagemDetalhe(contagem, fornecedores = [], usuario) {
  const isFinalizada = contagem.status === 'finalizada';
  const admin = isAdministrador(usuario);

  return {
    id: contagem.id,
    iniciado_em: contagem.iniciado_em,
    finalizado_em: contagem.finalizado_em,
    status: contagem.status,
    tem_diferenca: admin || isFinalizada ? contagem.tem_diferenca : undefined,
    iniciado_por_nome: contagem.iniciado_por_nome,
    fornecedores: fornecedores.map(f => serializeFornecedor(f, usuario, isFinalizada))
  };
}

module.exports = {
  isAdministrador,
  serializeItem,
  serializeFornecedor,
  serializeContagemDetalhe
};
