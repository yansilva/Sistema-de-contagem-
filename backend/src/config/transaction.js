const db = require('./db');

/**
 * Executa `fn(client)` dentro de uma transação.
 *
 * - BEGIN fica fora do try da regra de negócio: se falhar, não há o que reverter, só liberar o cliente.
 * - Em erro, o ROLLBACK é protegido: se a própria conexão estiver quebrada, o erro original não é
 *   mascarado e o cliente é liberado com `release(err)` para o pool descartá-lo em vez de reutilizá-lo.
 * - O cliente é liberado exatamente uma vez.
 *
 * Fica fora de config/db.js de propósito: vários testes substituem db.js por um mock com apenas
 * { query, getClient }. Como o helper chama `db.getClient()` em tempo de execução, ele funciona com
 * esses mocks e com o mockDb sem alterar o contrato dos testes.
 */
async function withTransaction(fn) {
  const client = await db.getClient();
  let liberado = false;
  const liberar = (erroDeConexao) => {
    if (liberado) return;
    liberado = true;
    if (client && typeof client.release === 'function') client.release(erroDeConexao);
  };

  try {
    await client.query('BEGIN');
  } catch (err) {
    liberar(err);
    throw err;
  }

  try {
    const resultado = await fn(client);
    await client.query('COMMIT');
    liberar();
    return resultado;
  } catch (err) {
    let conexaoQuebrada;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      conexaoQuebrada = rollbackErr;
    }
    liberar(conexaoQuebrada);
    throw err;
  }
}

module.exports = { withTransaction };
