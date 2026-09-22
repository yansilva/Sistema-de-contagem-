-- Executada apenas uma vez pelo registro schema_migrations.
-- Implantar junto ao backend que exige a claim sv; todos precisam entrar novamente.
UPDATE refresh_tokens SET revogado=TRUE WHERE revogado=FALSE;
