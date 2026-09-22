const { getClient } = require('../config/db');
const audit = require('./auditService');
async function transacao(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { client.release(); }
}
function registrar(client, req, empresaId, acao, extra = {}) {
  return audit.registrar(client, req.auditContext, {
    escopo:'plataforma', atorTipo:'usuario_plataforma', atorId:req.usuario.id,
    atorPapel:req.usuario.papel, atorRotulo:req.usuario.email,
    empresaAfetadaId:empresaId, acao, entidade:'empresa', entidadeId:empresaId,
    eventoChave:acao, ...extra
  });
}
module.exports = {transacao,registrar};
