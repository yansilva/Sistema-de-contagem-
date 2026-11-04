-- Reversão de 010_remove_indices_duplicados_audit.sql (recria os índices duplicados; normalmente desnecessário).
CREATE INDEX IF NOT EXISTS audit_logs_empresa_data_idx
    ON audit_logs (empresa_id, criado_em DESC, id DESC)
    WHERE escopo = 'empresa';
CREATE INDEX IF NOT EXISTS audit_logs_empresa_ator_data_idx
    ON audit_logs (empresa_id, ator_id, criado_em DESC, id DESC)
    WHERE escopo = 'empresa';
CREATE INDEX IF NOT EXISTS audit_logs_empresa_entidade_idx
    ON audit_logs (empresa_id, entidade, entidade_id, criado_em DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_request_idx ON audit_logs (request_id);
CREATE INDEX IF NOT EXISTS audit_logs_global_data_idx
    ON audit_logs (escopo, criado_em DESC, id DESC)
    WHERE escopo <> 'empresa';
DELETE FROM schema_migrations WHERE nome = '010_remove_indices_duplicados_audit.sql';
