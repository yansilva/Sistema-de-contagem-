/**
 * Serializador Blindado para Contagens
 * Garante as regras invariáveis de contagem cega:
 * 1. Funcionário não recebe estoque_referencia ou estoque_atual enquanto a contagem está aberta.
 * 2. Em contagem aberta (em_andamento), funcionário NUNCA recebe diferenca ou situacao.
 * 3. Somente após finalizada, funcionário recebe diferenca e situacao.
 * 4. Após finalização, todos os participantes recebem estoque_referencia, diferenca e situacao.
 */

function isAdministrador(usuario = {}) {
  const p = (usuario.papel || '').toLowerCase();
  return p === 'administrador' || p === 'gestor' || p === 'admin' || p === 'super_admin';
}

/**
 * Serializa um item individual de contagem
 */
function serializeItem(item, usuario, isFinalizada, tipo = 'geral') {

  const base = {
    id: item.id,
    produto_id: item.produto_id,
    codigo: item.codigo,
    nome: item.nome,
    quantidade_contada: item.quantidade_contada !== undefined ? item.quantidade_contada : null,
    contado_em: item.contado_em || null,
    qty_contagem: item.quantidade_contada || 0
  };

  if (tipo === 'pecas_queijo') return base;
  base.quantidade_vencida = Number(item.quantidade_vencida || 0);

  if (!isFinalizada) {
    return base;
  }

  // Contagem finalizada: a referência fica visível ao funcionário.
  return {
    ...base,
    estoque_referencia: item.estoque_referencia !== undefined ? item.estoque_referencia : null,
    diferenca: item.diferenca !== undefined ? item.diferenca : null,
    situacao: item.situacao || null,
    sem_diferenca: item.diferenca === 0,
    estoque_antes_baixa_vencidos: item.estoque_antes_baixa_vencidos ?? null,
    quantidade_vencida_baixada: item.quantidade_vencida_baixada ?? null,
    quantidade_vencida_nao_descontada: Math.max(0, base.quantidade_vencida - Number(item.quantidade_vencida_baixada || 0)),
    estoque_apos_baixa_vencidos: item.estoque_antes_baixa_vencidos == null ? null : Math.max(0, Number(item.estoque_antes_baixa_vencidos) - Number(item.quantidade_vencida_baixada || 0))
  };
}

/**
 * Serializa fornecedores e seus itens de uma contagem
 */
function serializeFornecedor(fornecedor, usuario, isFinalizada, tipo = 'geral') {
  const itens = Array.isArray(fornecedor.produtos) ? fornecedor.produtos : [];
  return {
    id: fornecedor.id,
    fornecedor: fornecedor.fornecedor,
    ...(tipo === 'pecas_queijo' || !isFinalizada ? {} : { tem_diferenca: fornecedor.tem_diferenca }),
    contado_em: fornecedor.contado_em,
    produtos: itens.map(p => serializeItem(p, usuario, isFinalizada, tipo))
  };
}

/**
 * Serializa a contagem completa com fornecedores e itens
 */
function serializeContagemDetalhe(contagem, fornecedores = [], usuario) {
  const tipo = contagem.tipo || 'geral';
  const isFinalizada = contagem.status === 'finalizada';

  return {
    id: contagem.id,
    tipo,
    iniciado_em: contagem.iniciado_em,
    finalizado_em: contagem.finalizado_em,
    status: contagem.status,
    ...(tipo === 'pecas_queijo' || !isFinalizada ? {} : { tem_diferenca: contagem.tem_diferenca }),
    iniciado_por_nome: contagem.iniciado_por_nome,
    ...(tipo === 'pecas_queijo' || !isFinalizada ? {} : { total_vencidos: Number(contagem.total_vencidos ?? fornecedores.reduce((sum, f) => sum + (f.produtos || []).reduce((n, item) => n + Number(item.quantidade_vencida || 0), 0), 0)) }),
    fornecedores: fornecedores.map(f => serializeFornecedor(f, usuario, isFinalizada, tipo))
  };
}

module.exports = {
  isAdministrador,
  serializeItem,
  serializeFornecedor,
  serializeContagemDetalhe
};
