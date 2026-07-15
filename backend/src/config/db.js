const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper para queries parametrizadas
const query = (text, params) => pool.query(text, params);

// Helper para transações
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
