/**
 * Serializador Blindado para Produtos
 * Regra: Funcionário NUNCA recebe estoque_atual em listagens ou buscas.
 */

function isAdministrador(usuario = {}) {
  const p = (usuario.papel || '').toLowerCase();
  return p === 'administrador' || p === 'gestor' || p === 'admin' || p === 'super_admin';
}

function serializeProduto(produto, usuario) {
  if (!produto) return null;
  const admin = isAdministrador(usuario);

  const base = {
    id: produto.id,
    codigo: produto.codigo,
    nome: produto.nome,
    fornecedor: produto.fornecedor,
    ativo: produto.ativo,
    criado_em: produto.criado_em,
    atualizado_em: produto.atualizado_em
  };

  if (admin) {
    base.estoque_atual = produto.estoque_atual !== undefined ? produto.estoque_atual : 0;
  }

  return base;
}

function serializeProdutos(produtos = [], usuario) {
  return produtos.map(p => serializeProduto(p, usuario));
}

module.exports = {
  isAdministrador,
  serializeProduto,
  serializeProdutos
};
