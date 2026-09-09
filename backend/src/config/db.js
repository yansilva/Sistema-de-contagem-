const pg = require('pg');
const { executeMockQuery, getMockClient } = require('./mockDb');

let pool = null;
let isPostgresAvailable = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 2000
    });
  } catch (err) {
    console.warn('[DB] Falha ao instanciar pool PostgreSQL. Usando Mock DB.', err.message);
  }
}

// Helper para queries parametrizadas com fallback automático
const query = async (text, params) => {
  if (pool && isPostgresAvailable !== false) {
    try {
      const res = await pool.query(text, params);
      isPostgresAvailable = true;
      return res;
    } catch (err) {
      if (
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.message.includes('connect')
      ) {
        isPostgresAvailable = false;
        console.warn('[DB] PostgreSQL indisponível. Alternando para Sandbox / Mock DB em memória.');
        return executeMockQuery(text, params);
      }
      throw err;
    }
  }
  return executeMockQuery(text, params);
};

// Helper para transações com fallback
const getClient = async () => {
  if (pool && isPostgresAvailable !== false) {
    try {
      const client = await pool.connect();
      isPostgresAvailable = true;
      return client;
    } catch {
      isPostgresAvailable = false;
      return getMockClient();
    }
  }
  return getMockClient();
};

module.exports = { pool, query, getClient };
