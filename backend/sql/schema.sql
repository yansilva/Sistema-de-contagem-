-- =============================================
-- Schema do SaaS: Inventory Management System
-- PostgreSQL
-- =============================================

-- Extensão para UUIDs e criptografia nativa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- Tabela: empresas
-- =============================================
CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  email_contato VARCHAR(255) UNIQUE NOT NULL,
  plano VARCHAR(50) DEFAULT 'ativo' NOT NULL,
  status VARCHAR(8) DEFAULT 'ativa' NOT NULL,
  tipo VARCHAR(12) DEFAULT 'cliente' NOT NULL,
  trial_expira_em TIMESTAMPTZ,
  excluida_em TIMESTAMPTZ,
  motivo_exclusao VARCHAR(500),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_empresas_plano CHECK (plano IN ('trial', 'ativo', 'suspenso')),
  CONSTRAINT chk_empresas_status CHECK (status IN ('ativa', 'inativa')),
  CONSTRAINT chk_empresas_tipo CHECK (tipo IN ('cliente', 'plataforma'))
);

CREATE INDEX IF NOT EXISTS idx_empresas_plano ON empresas(plano);
CREATE INDEX IF NOT EXISTS idx_empresas_email_contato ON empresas(email_contato);
CREATE INDEX IF NOT EXISTS idx_empresas_status_criado
  ON empresas(status, criado_em DESC, id) WHERE excluida_em IS NULL;

-- =============================================
-- Tabela: usuarios
-- =============================================
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  papel VARCHAR(20) DEFAULT 'funcionario' NOT NULL,
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  versao_sessao INTEGER DEFAULT 1 NOT NULL CHECK (versao_sessao > 0),
  must_change_password BOOLEAN DEFAULT FALSE NOT NULL,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_usuarios_papel CHECK (papel IN ('super_admin', 'administrador', 'funcionario', 'gestor', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_ativo ON usuarios(empresa_id, ativo);

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS excluida_por UUID REFERENCES usuarios(id) ON DELETE RESTRICT;

-- =============================================
-- Tabela: produtos
-- =============================================
CREATE TABLE IF NOT EXISTS produtos (
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

CREATE INDEX IF NOT EXISTS idx_produtos_empresa_ativo ON produtos(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa_fornecedor ON produtos(empresa_id, fornecedor) WHERE ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos(empresa_id, codigo);

-- =============================================
-- Tabela: historico_importacao_estoque
-- Auditoria de uploads de relatórios PDF do Tiny ERP
-- =============================================
CREATE TABLE IF NOT EXISTS historico_importacao_estoque (
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

CREATE INDEX IF NOT EXISTS idx_historico_estoque_empresa ON historico_importacao_estoque(empresa_id, criado_em DESC);

-- =============================================
-- Tabela: contagens
-- =============================================
CREATE TABLE IF NOT EXISTS contagens (
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

CREATE INDEX IF NOT EXISTS idx_contagens_empresa ON contagens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contagens_empresa_status ON contagens(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_contagens_finalizado_em ON contagens(empresa_id, finalizado_em DESC) WHERE status = 'finalizada';

-- =============================================
-- Tabela: contagem_fornecedores
-- =============================================
CREATE TABLE IF NOT EXISTS contagem_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id UUID NOT NULL REFERENCES contagens(id) ON DELETE CASCADE,
  fornecedor VARCHAR(255) NOT NULL,
  tem_diferenca BOOLEAN DEFAULT FALSE NOT NULL,
  contado_em TIMESTAMPTZ DEFAULT NOW(),
  -- Previne duplicidade do mesmo fornecedor na mesma sessão de contagem
  CONSTRAINT uq_contagem_fornecedor UNIQUE (contagem_id, fornecedor)
);

CREATE INDEX IF NOT EXISTS idx_contagem_fornecedores_contagem ON contagem_fornecedores(contagem_id);

-- =============================================
-- Tabela: contagem_itens
-- Contagem cega: estoque_referencia é snapshot interno
-- =============================================
CREATE TABLE IF NOT EXISTS contagem_itens (
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

CREATE INDEX IF NOT EXISTS idx_contagem_itens_fornecedor ON contagem_itens(contagem_fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_contagem_itens_situacao ON contagem_itens(contagem_fornecedor_id, situacao);

-- =============================================
-- Tabela: refresh_tokens
-- Armazenamento seguro de hash SHA-256 e rotação
-- =============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  revogado BOOLEAN DEFAULT FALSE NOT NULL,
  substituido_por VARCHAR(64),
  expira_em TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);

-- =============================================
-- Tabela: audit_logs
-- Trilha central de auditoria com integridade e escopos
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo VARCHAR(16) NOT NULL
    CHECK (escopo IN ('empresa', 'plataforma', 'seguranca')),
  empresa_id UUID REFERENCES empresas(id) ON DELETE RESTRICT,
  empresa_afetada_id UUID REFERENCES empresas(id) ON DELETE RESTRICT,

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

CREATE INDEX IF NOT EXISTS idx_audit_logs_empresa_data
  ON audit_logs (empresa_id, criado_em DESC, id DESC)
  WHERE escopo = 'empresa';
CREATE INDEX IF NOT EXISTS idx_audit_logs_empresa_ator_data
  ON audit_logs (empresa_id, ator_id, criado_em DESC, id DESC)
  WHERE escopo = 'empresa';
CREATE INDEX IF NOT EXISTS idx_audit_logs_empresa_entidade
  ON audit_logs (empresa_id, entidade, entidade_id, criado_em DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request
  ON audit_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_global_data
  ON audit_logs (escopo, criado_em DESC, id DESC)
  WHERE escopo <> 'empresa';

CREATE INDEX IF NOT EXISTS idx_audit_empresa_afetada
  ON audit_logs (empresa_afetada_id, criado_em DESC, id DESC);

-- Sessões temporárias de suporte, sempre vinculadas ao operador real da plataforma.
CREATE TABLE IF NOT EXISTS sessoes_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  motivo VARCHAR(500),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  encerrado_em TIMESTAMPTZ,
  motivo_encerramento VARCHAR(30),
  CHECK (expira_em > iniciado_em),
  CHECK ((encerrado_em IS NULL AND motivo_encerramento IS NULL)
      OR (encerrado_em IS NOT NULL AND motivo_encerramento IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_sessoes_auditoria_ator
  ON sessoes_auditoria (ator_id, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sessoes_auditoria_empresa
  ON sessoes_auditoria (empresa_id, iniciado_em DESC);

CREATE TABLE IF NOT EXISTS password_reset_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  solicitado_por UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  token_hash CHAR(64) UNIQUE NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL,
  consumido_em TIMESTAMPTZ,
  invalidado_em TIMESTAMPTZ,
  entrega VARCHAR(10) NOT NULL DEFAULT 'pendente',
  CHECK (expira_em > criado_em),
  CHECK (entrega IN ('pendente', 'aceita', 'falhou'))
);

CREATE INDEX IF NOT EXISTS idx_password_reset_usuario_data
  ON password_reset_solicitacoes (usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_ativos
  ON password_reset_solicitacoes (token_hash, expira_em)
  WHERE consumido_em IS NULL AND invalidado_em IS NULL;
