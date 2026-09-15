-- ==========================================================
-- Migration 001: Auditoria, Rastreabilidade e Autoria Operacional
-- PostgreSQL / pgcrypto
-- ==========================================================

-- Atualizar CHECK de papéis para incluir super_admin
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_papel;
ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_papel 
  CHECK (papel IN ('super_admin', 'administrador', 'funcionario', 'gestor', 'admin'));

-- Tabela audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escopo VARCHAR(16) NOT NULL
        CHECK (escopo IN ('empresa', 'plataforma', 'seguranca')),
    empresa_id UUID REFERENCES empresas(id) ON DELETE RESTRICT,

    ator_tipo VARCHAR(24) NOT NULL
        CHECK (ator_tipo IN ('usuario_empresa', 'usuario_plataforma', 'sistema', 'anonimo')),
    ator_id UUID,
    ator_papel VARCHAR(32),
    ator_rotulo VARCHAR(160),
    acao VARCHAR(80) NOT NULL,
    entidade VARCHAR(64) NOT NULL,
    entidade_id UUID,
    resultado VARCHAR(16) NOT NULL
        CHECK (resultado IN ('sucesso', 'falha', 'negado')),

    dados_anteriores JSONB,
    dados_novos JSONB,
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    motivo VARCHAR(500),
    codigo_erro VARCHAR(64),
    ip INET,
    user_agent VARCHAR(512),
    request_id UUID NOT NULL,
    operacao_id UUID NOT NULL,
    evento_chave VARCHAR(160) NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CHECK ((escopo = 'empresa' AND empresa_id IS NOT NULL)
        OR (escopo IN ('plataforma', 'seguranca') AND empresa_id IS NULL)),
    CHECK ((ator_tipo IN ('usuario_empresa', 'usuario_plataforma')
            AND ator_id IS NOT NULL)
        OR (ator_tipo IN ('sistema', 'anonimo') AND ator_id IS NULL)),
    CHECK (dados_anteriores IS NULL OR jsonb_typeof(dados_anteriores) = 'object'),
    CHECK (dados_novos IS NULL OR jsonb_typeof(dados_novos) = 'object'),
    CHECK (jsonb_typeof(metadados) = 'object'),
    UNIQUE (operacao_id, evento_chave)
);

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

-- Autoria Operacional em Produtos
ALTER TABLE produtos
    ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS atualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Autoria Operacional em Usuários
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS atualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Autoria Operacional e Revisões em Contagens
ALTER TABLE contagens
    ADD COLUMN IF NOT EXISTS finalizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reaberto_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo_reabertura VARCHAR(500),
    ADD COLUMN IF NOT EXISTS revisao INTEGER DEFAULT 1 NOT NULL;

-- Autoria Operacional em Itens de Contagem
ALTER TABLE contagem_itens
    ADD COLUMN IF NOT EXISTS contado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Autoria Operacional em Histórico de Importação de Estoque
ALTER TABLE historico_importacao_estoque
    ADD COLUMN IF NOT EXISTS enviado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
