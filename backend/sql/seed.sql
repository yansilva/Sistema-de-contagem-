-- =============================================
-- Seed: Dados de demonstração
-- Inventory Management System
-- =============================================

-- Empresa Demo Oficial
INSERT INTO empresas (id, nome, email_contato, plano, trial_expira_em)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Loja Demo',
  'contato@lojademo.com',
  'trial',
  NOW() + INTERVAL '30 days'
)
ON CONFLICT (email_contato) DO NOTHING;

-- Usuário gestor demo
-- Senha do admin: AdminDemo@2026! (hash gerado dinamicamente via pgcrypto)
INSERT INTO usuarios (id, empresa_id, nome, email, senha_hash, papel)
VALUES (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Admin Demo',
  'admin@demo.com',
  crypt('AdminDemo@2026!', gen_salt('bf', 12)),
  'gestor'
)
ON CONFLICT (email) DO NOTHING;

-- Produtos de demonstração (3 fornecedores, 8 produtos)
INSERT INTO produtos (empresa_id, codigo, nome, fornecedor) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '001', 'Camiseta Básica Branca', 'Têxtil Sul'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '002', 'Camiseta Básica Preta', 'Têxtil Sul'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '003', 'Calça Jeans Slim', 'Têxtil Sul'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '010', 'Tênis Runner Pro', 'Calçados Express'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '011', 'Sandália Comfort Flex', 'Calçados Express'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '020', 'Mochila Urban 30L', 'Acessórios Prime'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '021', 'Boné Snapback Classic', 'Acessórios Prime'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '022', 'Óculos de Sol Aviador', 'Acessórios Prime')
ON CONFLICT (empresa_id, codigo) DO NOTHING;
