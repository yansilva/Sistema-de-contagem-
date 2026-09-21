const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { getClient } = require('../config/db');
async function runMigrations() {
  const dir = path.resolve(__dirname, '../../sql');
  const files = fs.readdirSync(path.join(dir, 'migrations')).filter(f => f.endsWith('.sql')).sort();
  if (process.argv.includes('--dry-run')) { console.log('[Migrate] Arquivos:', files.join(', ')); return; }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(739214)');
    const existing = await client.query("SELECT to_regclass('empresas') AS tabela");
    const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
    if (!existing.rows[0].tabela) await client.query(schema);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(nome TEXT PRIMARY KEY, aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const file of files) {
      const applied = await client.query('SELECT nome FROM schema_migrations WHERE nome=$1', [file]);
      if (applied.rowCount) continue;
      await client.query(fs.readFileSync(path.join(dir, 'migrations', file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(nome) VALUES($1)', [file]);
    }
    if (existing.rows[0].tabela) await client.query(schema);
    await client.query('COMMIT');
    console.log('[Migrate] Migrações verificadas.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch(error => {
    console.error('[Migrate] Falha:', error.code || error.name);
    process.exit(1);
  });
}
module.exports = { runMigrations };
