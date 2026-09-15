-- =============================================
-- Schema do SaaS: Inventory Management System
-- PostgreSQL
-- =============================================

-- Extensão para UUIDs e criptografia nativa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- Tabela: empresas
-- =============================================
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  email_contato VARCHAR(255) UNIQUE NOT NULL,
  plano VARCHAR(50) DEFAULT 'ativo' NOT NULL,
  trial_expira_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_empresas_plano CHECK (plano IN ('trial', 'ativo', 'suspenso'))
);

CREATE INDEX idx_empresas_plano ON empresas(plano);
CREATE INDEX idx_empresas_email_contato ON empresas(email_contato);

-- =============================================
-- Tabela: usuarios
-- =============================================
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  papel VARCHAR(20) DEFAULT 'funcionario' NOT NULL,
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  must_change_password BOOLEAN DEFAULT FALSE NOT NULL,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_usuarios_papel CHECK (papel IN ('super_admin', 'administrador', 'funcionario', 'gestor', 'admin'))
);

CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_empresa_ativo ON usuarios(empresa_id, ativo);

-- =============================================
-- Tabela: produtos
-- =============================================
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo VARCHAR(100) NOT NULL, -- SKU do Tiny / Produto
  nome VARCHAR(255) NOT NULL,
  fornecedor VARCHAR(255) NOT NULL, -- Produtor / Fornecedor
  estoque_atual INTEGER DEFAULT 0 NOT NULL, -- Estoque atual importado do relatório Tiny
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_produtos_empresa_ativo ON produtos(empresa_id, ativo);
CREATE INDEX idx_produtos_empresa_fornecedor ON produtos(empresa_id, fornecedor) WHERE ativo = TRUE;
CREATE INDEX idx_produtos_codigo ON produtos(empresa_id, codigo);

-- =============================================
-- Tabela: historico_importacao_estoque
-- Auditoria de uploads de relatórios PDF do Tiny ERP
-- =============================================
CREATE TABLE historico_importacao_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  confirmado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  produtos_encontrados INTEGER DEFAULT 0 NOT NULL,
  produtos_atualizados INTEGER DEFAULT 0 NOT NULL,
  skus_nao_encontrados JSONB DEFAULT '[]'::jsonb NOT NULL,
  linhas_ignoradas INTEGER DEFAULT 0 NOT NULL,
  status VARCHAR(50) DEFAULT 'concluido' NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historico_estoque_empresa ON historico_importacao_estoque(empresa_id, criado_em DESC);

-- =============================================
-- Tabela: contagens
-- =============================================
CREATE TABLE contagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  iniciado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  finalizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  reaberto_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo_reabertura VARCHAR(500),
  revisao INTEGER DEFAULT 1 NOT NULL,
  iniciado_em TIMESTAMPTZ DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  tem_diferenca BOOLEAN DEFAULT FALSE NOT NULL,
  status VARCHAR(20) DEFAULT 'em_andamento' NOT NULL,
  CONSTRAINT chk_contagens_status CHECK (status IN ('nao_iniciada', 'em_andamento', 'finalizada', 'cancelada'))
);

CREATE INDEX idx_contagens_empresa ON contagens(empresa_id);
CREATE INDEX idx_contagens_empresa_status ON contagens(empresa_id, status);
CREATE INDEX idx_contagens_finalizado_em ON contagens(empresa_id, finalizado_em DESC) WHERE status = 'finalizada';

-- =============================================
-- Tabela: contagem_fornecedores
-- =============================================
CREATE TABLE contagem_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id UUID NOT NULL REFERENCES contagens(id) ON DELETE CASCADE,
  fornecedor VARCHAR(255) NOT NULL,
  tem_diferenca BOOLEAN DEFAULT FALSE NOT NULL,
  contado_em TIMESTAMPTZ DEFAULT NOW(),
  -- Previne duplicidade do mesmo fornecedor na mesma sessão de contagem
  CONSTRAINT uq_contagem_fornecedor UNIQUE (contagem_id, fornecedor)
);

CREATE INDEX idx_contagem_fornecedores_contagem ON contagem_fornecedores(contagem_id);

-- =============================================
-- Tabela: contagem_itens
-- Contagem cega: estoque_referencia é snapshot interno
-- =============================================
CREATE TABLE contagem_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_fornecedor_id UUID NOT NULL REFERENCES contagem_fornecedores(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
  codigo VARCHAR(100) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  estoque_referencia INTEGER DEFAULT 0 NOT NULL, -- Snapshot imutável no momento da contagem
  quantidade_contada INTEGER NULL, -- NULL = não contado; 0 = contado zero unidades
  diferenca INTEGER NULL, -- quantidade_contada - estoque_referencia
  situacao VARCHAR(30) NULL, -- 'sem_diferenca', 'sobra', 'falta'
  contado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  contado_em TIMESTAMPTZ
);

CREATE INDEX idx_contagem_itens_fornecedor ON contagem_itens(contagem_fornecedor_id);
CREATE INDEX idx_contagem_itens_situacao ON contagem_itens(contagem_fornecedor_id, situacao);

-- =============================================
-- Tabela: refresh_tokens
-- Armazenamento seguro de hash SHA-256 e rotação
-- =============================================
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  revogado BOOLEAN DEFAULT FALSE NOT NULL,
  substituido_por VARCHAR(64),
  expira_em TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);

-- =============================================
-- Tabela: audit_logs
-- Trilha central de auditoria com integridade e escopos
-- =============================================
CREATE TABLE audit_logs (
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

CREATE INDEX idx_audit_logs_empresa_data
  ON audit_logs (empresa_id, criado_em DESC, id DESC)
  WHERE escopo = 'empresa';
CREATE INDEX idx_audit_logs_empresa_ator_data
  ON audit_logs (empresa_id, ator_id, criado_em DESC, id DESC)
  WHERE escopo = 'empresa';
CREATE INDEX idx_audit_logs_empresa_entidade
  ON audit_logs (empresa_id, entidade, entidade_id, criado_em DESC, id DESC);
CREATE INDEX idx_audit_logs_request
  ON audit_logs (request_id);
CREATE INDEX idx_audit_logs_global_data
  ON audit_logs (escopo, criado_em DESC, id DESC)
  WHERE escopo <> 'empresa';
