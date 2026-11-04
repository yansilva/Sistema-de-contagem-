-- 010: remove os índices de audit_logs duplicados pela migração 001 (idênticos aos idx_audit_logs_*
-- definidos em schema.sql, que permanecem). Idempotente (IF EXISTS). Nenhum dado é alterado.
-- Reversão: backend/sql/rollbacks/010_remove_indices_duplicados_audit.sql.
DROP INDEX IF EXISTS audit_logs_empresa_data_idx;
DROP INDEX IF EXISTS audit_logs_empresa_ator_data_idx;
DROP INDEX IF EXISTS audit_logs_empresa_entidade_idx;
DROP INDEX IF EXISTS audit_logs_request_idx;
DROP INDEX IF EXISTS audit_logs_global_data_idx;
