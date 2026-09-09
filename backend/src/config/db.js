const pg = require('pg');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper para queries parametrizadas
// nosemgrep: javascript.lang.security.audit.sqli.node-postgres-sqli.node-postgres-sqli
const query = (text, params) => pool.query(text, params);

// Helper para transações
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };

