const pg = require('pg');
const { AppError } = require('../errors/AppError');

// Dados em memória são exclusivos dos testes. Nunca substituem o banco operacional.
const isTest = process.env.NODE_ENV === 'test';
const mockDb = isTest ? require('./mockDb') : null;
const pool = isTest
  ? null
  : new pg.Pool({
      ...(process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            database: process.env.DB_NAME || 'estoque_db',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD
          }),
      connectionTimeoutMillis: 3000
    });

function databaseError(error) {
  const unavailable = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    '28P01',
    '3D000',
    '57P01'
  ];
  if (
    unavailable.includes(error.code) ||
    /^08/.test(error.code || '') ||
    /timeout|connection terminated/i.test(error.message)
  ) {
    return new AppError(
      'Banco de dados indisponível. Contate a administração para restabelecer o acesso.',
      503,
      'BANCO_INDISPONIVEL'
    );
  }
  return error;
}

if (pool) {
  pool.on('error', () => console.error('[DB] Conexão PostgreSQL interrompida.'));
}

async function query(text, params) {
  if (isTest) return mockDb.executeMockQuery(text, params);
  try {
    return await pool.query(text, params);
  } catch (error) {
    throw databaseError(error);
  }
}

async function getClient() {
  if (isTest) return mockDb.getMockClient();
  try {
    return await pool.connect();
  } catch (error) {
    throw databaseError(error);
  }
}

module.exports = { pool, query, getClient };
