CREATE TABLE IF NOT EXISTS password_reset_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  solicitado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  token_hash CHAR(64) UNIQUE NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  consumido_em TIMESTAMPTZ,
  invalidado_em TIMESTAMPTZ,
  entrega VARCHAR(10) NOT NULL DEFAULT 'pendente',
  CHECK (expira_em > criado_em),
  CHECK (entrega IN ('pendente','aceita','falhou'))
);

CREATE INDEX IF NOT EXISTS idx_password_reset_usuario_data
  ON password_reset_solicitacoes(usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_ativos
  ON password_reset_solicitacoes(token_hash, expira_em)
  WHERE consumido_em IS NULL AND invalidado_em IS NULL;
