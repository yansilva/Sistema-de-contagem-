function serializePreviaEstoque(previa, usuario) {
  if ((usuario.papel || '').toLowerCase() !== 'funcionario') return { ...previa };
  return {
    ...previa,
    produtos_para_atualizar: previa.produtos_para_atualizar.map(({ codigo, nome, fornecedor, estoque_novo }) =>
      ({ codigo, nome, fornecedor, estoque_novo }))
  };
}

module.exports = { serializePreviaEstoque };
