-- Tabelas internas ficam no schema public do Supabase, mas não são expostas pela Data API.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_solicitacoes ENABLE ROW LEVEL SECURITY;
