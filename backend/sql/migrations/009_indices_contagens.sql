-- 009: apoio à listagem paginada de contagens e às atualizações em lote de itens.
-- Idempotente (IF NOT EXISTS). Índice de itens é NÃO único de propósito: a unicidade
-- (contagem_fornecedor_id, produto_id) não é garantida em bancos antigos e uma migração
-- automática não pode falhar por dados legados.
CREATE INDEX IF NOT EXISTS idx_contagens_empresa_iniciado_em
  ON contagens(empresa_id, iniciado_em DESC);

CREATE INDEX IF NOT EXISTS idx_contagem_itens_fornecedor_produto
  ON contagem_itens(contagem_fornecedor_id, produto_id);

-- Reversão manual: backend/sql/rollbacks/009_indices_contagens.sql.
