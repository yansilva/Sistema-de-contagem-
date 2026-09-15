const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Instalação local opcional. Instâncias externas e containers usam DATABASE_URL normalmente.
const runtime = path.resolve(__dirname, '../../../.local');
const pgCtl = path.join(runtime, 'pgsql/bin/pg_ctl.exe');
const data = path.join(runtime, 'pgdata');
if (
  process.platform === 'win32' &&
  fs.existsSync(pgCtl) &&
  fs.existsSync(path.join(data, 'PG_VERSION'))
) {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const host = url?.hostname || process.env.DB_HOST || 'localhost';
  const port = url?.port || process.env.DB_PORT || '5432';
  if (['localhost', '127.0.0.1', '[::1]'].includes(host) && port === '5432') {
    const options = { windowsHide: true, encoding: 'utf8', stdio: 'ignore' };
    const status = spawnSync(pgCtl, ['status', '-D', data], options);
    if (status.status !== 0) {
      console.log('[DB] Iniciando PostgreSQL local...');
      const start = spawnSync(
        pgCtl,
        ['start', '-D', data, '-l', path.join(runtime, 'postgres.log'), '-w', '-t', '30'],
        options
      );
      if (start.status !== 0) {
        console.error('[DB] Não foi possível iniciar PostgreSQL. Consulte .local/postgres.log.');
        process.exit(1);
      }
    }
  }
}
