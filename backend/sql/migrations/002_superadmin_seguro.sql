ALTER TABLE empresas ADD COLUMN IF NOT EXISTS status VARCHAR(8);
UPDATE empresas SET status = CASE WHEN plano = 'suspenso' THEN 'inativa' ELSE 'ativa' END WHERE status IS NULL;
ALTER TABLE empresas ALTER COLUMN status SET DEFAULT 'ativa';
ALTER TABLE empresas ALTER COLUMN status SET NOT NULL;
ALTER TABLE empresas DROP CONSTRAINT IF EXISTS chk_empresas_status;
ALTER TABLE empresas ADD CONSTRAINT chk_empresas_status CHECK (status IN ('ativa','inativa'));
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS tipo VARCHAR(12);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM empresas e WHERE e.tipo IS NULL
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.empresa_id=e.id AND u.papel='super_admin')
    AND EXISTS (SELECT 1 FROM usuarios u WHERE u.empresa_id=e.id AND u.papel<>'super_admin')) THEN
    RAISE EXCEPTION 'Organização com perfis mistos: classifique explicitamente empresas.tipo antes de migrar';
  END IF;
END $$;
UPDATE empresas e SET tipo=CASE WHEN EXISTS(SELECT 1 FROM usuarios u WHERE u.empresa_id=e.id AND u.papel='super_admin')
  THEN 'plataforma' ELSE 'cliente' END WHERE tipo IS NULL;
ALTER TABLE empresas ALTER COLUMN tipo SET DEFAULT 'cliente';
ALTER TABLE empresas ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE empresas DROP CONSTRAINT IF EXISTS chk_empresas_tipo;
ALTER TABLE empresas ADD CONSTRAINT chk_empresas_tipo CHECK (tipo IN ('cliente','plataforma'));
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS excluida_em TIMESTAMPTZ;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS excluida_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS motivo_exclusao VARCHAR(500);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS versao_sessao INTEGER NOT NULL DEFAULT 1 CHECK (versao_sessao > 0);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS empresa_afetada_id UUID REFERENCES empresas(id) ON DELETE RESTRICT;
UPDATE audit_logs SET empresa_afetada_id=empresa_id WHERE empresa_afetada_id IS NULL AND empresa_id IS NOT NULL;
UPDATE audit_logs l SET empresa_afetada_id=l.entidade_id WHERE l.empresa_afetada_id IS NULL AND l.entidade='empresa'
  AND EXISTS(SELECT 1 FROM empresas e WHERE e.id=l.entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_empresa_afetada ON audit_logs(empresa_afetada_id,criado_em DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_empresas_status_criado ON empresas(status,criado_em DESC,id) WHERE excluida_em IS NULL;
CREATE TABLE IF NOT EXISTS sessoes_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  motivo VARCHAR(500), iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT now()+interval '30 minutes',
  encerrado_em TIMESTAMPTZ, motivo_encerramento VARCHAR(30),
  CHECK(expira_em>iniciado_em),
  CHECK((encerrado_em IS NULL AND motivo_encerramento IS NULL) OR (encerrado_em IS NOT NULL AND motivo_encerramento IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_sessoes_auditoria_ator ON sessoes_auditoria(ator_id,iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sessoes_auditoria_empresa ON sessoes_auditoria(empresa_id,iniciado_em DESC);
