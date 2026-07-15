-- =============================================
-- Schema do SaaS de Contagem de Estoque
-- PostgreSQL
-- =============================================

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- Tabela: empresas
-- =============================================
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  email_contato VARCHAR(255) UNIQUE NOT NULL,
  plano VARCHAR(50) DEFAULT 'trial',
  trial_expira_em TIMESTAMP,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_empresas_plano ON empresas(plano);

-- =============================================
-- Tabela: usuarios
-- =============================================
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  papel VARCHAR(20) DEFAULT 'funcionario',
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX idx_usuarios_email ON usuarios(email);

-- =============================================
-- Tabela: produtos
-- =============================================
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  codigo VARCHAR(100) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  fornecedor VARCHAR(255) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE INDEX idx_produtos_empresa ON produtos(empresa_id);
CREATE INDEX idx_produtos_fornecedor ON produtos(empresa_id, fornecedor);

-- =============================================
-- Tabela: contagens
-- =============================================
CREATE TABLE contagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  iniciado_por UUID REFERENCES usuarios(id),
  iniciado_em TIMESTAMP DEFAULT NOW(),
  finalizado_em TIMESTAMP,
  tem_diferenca BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'em_andamento'
);

CREATE INDEX idx_contagens_empresa ON contagens(empresa_id);
CREATE INDEX idx_contagens_status ON contagens(empresa_id, status);

-- =============================================
-- Tabela: contagem_fornecedores
-- =============================================
CREATE TABLE contagem_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id UUID REFERENCES contagens(id) ON DELETE CASCADE,
  fornecedor VARCHAR(255) NOT NULL,
  tem_diferenca BOOLEAN DEFAULT FALSE,
  contado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contagem_fornecedores_contagem ON contagem_fornecedores(contagem_id);

-- =============================================
-- Tabela: contagem_itens
-- =============================================
CREATE TABLE contagem_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_fornecedor_id UUID REFERENCES contagem_fornecedores(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos(id),
  codigo VARCHAR(100) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  qty_tiny INTEGER,
  qty_contagem INTEGER,
  diferenca INTEGER DEFAULT 0,
  sem_diferenca BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_contagem_itens_fornecedor ON contagem_itens(contagem_fornecedor_id);

-- =============================================
-- Tabela: refresh_tokens
-- =============================================
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);
