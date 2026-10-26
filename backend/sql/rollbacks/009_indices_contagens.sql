-- Reversão de 009_indices_contagens.sql (só remove índices; nenhum dado é alterado).
DROP INDEX IF EXISTS idx_contagens_empresa_iniciado_em;
DROP INDEX IF EXISTS idx_contagem_itens_fornecedor_produto;
DELETE FROM schema_migrations WHERE nome = '009_indices_contagens.sql';
