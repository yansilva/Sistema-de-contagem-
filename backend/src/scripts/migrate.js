/**
 * Script de Migração Automatizada para PostgreSQL
 * Executa schema.sql e migrações pendentes em backend/sql/migrations/
 * Compatível com ambientes locais, Docker e bancos em nuvem (Neon, Supabase, Vercel Postgres).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { getClient } = require('../config/db');

async function runMigrations() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`[Migrate] Iniciando processo de migração${isDryRun ? ' (MODO SIMULAÇÃO)' : ''}...`);

  const sqlDir = path.resolve(__dirname, '../../sql');
  const schemaFile = path.join(sqlDir, 'schema.sql');
  const migrationsDir = path.join(sqlDir, 'migrations');

  if (!fs.existsSync(schemaFile)) {
    console.error(`[Migrate] Erro: Arquivo schema.sql não encontrado em ${schemaFile}`);
    process.exit(1);
  }

  const client = await getClient();
  try {
    console.log('[Migrate] Conexão com o banco de dados estabelecida.');

    if (isDryRun) {
      console.log(`[Migrate] [DRY-RUN] Lendo ${schemaFile}... OK`);
      if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        console.log(`[Migrate] [DRY-RUN] ${files.length} migrações encontradas:`, files.join(', '));
      }
      console.log('[Migrate] Simulação concluída com sucesso!');
      return;
    }

    // 1. Executar schema.sql base dentro de transação
    console.log('[Migrate] Aplicando schema base (schema.sql)...');
    const schemaSql = fs.readFileSync(schemaFile, 'utf8');
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('[Migrate] Schema base aplicado com sucesso.');

    // 2. Executar migrações adicionais
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        console.log(`[Migrate] Aplicando migração: ${file}...`);
        const migrationSql = fs.readFileSync(filePath, 'utf8');
        await client.query('BEGIN');
        await client.query(migrationSql);
        await client.query('COMMIT');
        console.log(`[Migrate] Migração ${file} concluída.`);
      }
    }

    console.log('[Migrate] Todas as migrações foram aplicadas com sucesso!');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Migrate] Falha durante a execução das migrações:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] Erro fatal:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
