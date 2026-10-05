-- Executar manualmente apenas quando a aplicação não depender destes campos.
-- A reversão descarta os valores de vencidos e preserva os demais snapshots.
ALTER TABLE contagem_itens
  DROP CONSTRAINT IF EXISTS chk_contagem_itens_quantidade_vencida,
  DROP COLUMN IF EXISTS quantidade_vencida,
  DROP COLUMN IF EXISTS estoque_antes_baixa_vencidos,
  DROP COLUMN IF EXISTS quantidade_vencida_baixada;
