-- Compatível com sessões e produtos anteriores à classificação.
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS contagem_em_pecas BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contagens ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'geral';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'contagens'::regclass AND conname = 'chk_contagens_tipo') THEN
    ALTER TABLE contagens ADD CONSTRAINT chk_contagens_tipo CHECK (tipo IN ('geral', 'pecas_queijo'));
  END IF;
END $$;
ALTER TABLE contagem_itens ALTER COLUMN estoque_referencia DROP NOT NULL;
