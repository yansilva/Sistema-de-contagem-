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
  plano VARCHAR(50) DEFAULT 'trial' NOT NULL,
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
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_usuarios_papel CHECK (papel IN ('gestor', 'funcionario', 'admin'))
);

CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX idx_usuarios_email ON usuarios(email);

-- =============================================
-- Tabela: produtos
-- =============================================
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo VARCHAR(100) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  fornecedor VARCHAR(255) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_produtos_empresa_ativo ON produtos(empresa_id, ativo);
CREATE INDEX idx_produtos_empresa_fornecedor ON produtos(empresa_id, fornecedor) WHERE ativo = TRUE;
CREATE INDEX idx_produtos_codigo ON produtos(empresa_id, codigo);

-- =============================================
-- Tabela: contagens
-- =============================================
CREATE TABLE contagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  iniciado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  iniciado_em TIMESTAMPTZ DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  tem_diferenca BOOLEAN DEFAULT FALSE NOT NULL,
  status VARCHAR(20) DEFAULT 'em_andamento' NOT NULL,
  CONSTRAINT chk_contagens_status CHECK (status IN ('em_andamento', 'finalizada', 'cancelada'))
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
-- =============================================
CREATE TABLE contagem_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_fornecedor_id UUID NOT NULL REFERENCES contagem_fornecedores(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
  codigo VARCHAR(100) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  qty_tiny INTEGER DEFAULT 0 NOT NULL,
  qty_contagem INTEGER DEFAULT 0 NOT NULL,
  diferenca INTEGER DEFAULT 0 NOT NULL,
  sem_diferenca BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE INDEX idx_contagem_itens_fornecedor ON contagem_itens(contagem_fornecedor_id);
CREATE INDEX idx_contagem_itens_diferenca ON contagem_itens(contagem_fornecedor_id, sem_diferenca);

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
