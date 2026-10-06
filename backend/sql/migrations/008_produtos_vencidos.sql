-- Vencidos são parte da quantidade física; sessões antigas começam com zero.
ALTER TABLE contagem_itens
  ADD COLUMN IF NOT EXISTS quantidade_vencida INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_antes_baixa_vencidos INTEGER NULL,
  ADD COLUMN IF NOT EXISTS quantidade_vencida_baixada INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'contagem_itens'::regclass AND conname = 'chk_contagem_itens_quantidade_vencida') THEN
    ALTER TABLE contagem_itens ADD CONSTRAINT chk_contagem_itens_quantidade_vencida CHECK (quantidade_vencida >= 0);
  END IF;
END $$;

-- Reversão manual: backend/sql/rollbacks/008_produtos_vencidos.sql.
