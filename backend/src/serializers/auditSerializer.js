/**
 * Serializador Blindado para Logs de Auditoria
 * Formata os registros da trilha para consumo na tela de Atividades.
 */

function serializeAuditLog(log) {
  if (!log) return null;

  return {
    id: log.id,
    escopo: log.escopo,
    empresa_id: log.empresa_id,
    ator: {
      tipo: log.ator_tipo,
      id: log.ator_id,
      papel: log.ator_papel,
      rotulo: log.ator_rotulo
    },
    acao: log.acao,
    entidade: log.entidade,
    entidade_id: log.entidade_id,
    resultado: log.resultado,
    dados_anteriores: typeof log.dados_anteriores === 'string' ? JSON.parse(log.dados_anteriores) : log.dados_anteriores,
    dados_novos: typeof log.dados_novos === 'string' ? JSON.parse(log.dados_novos) : log.dados_novos,
    metadados: typeof log.metadados === 'string' ? JSON.parse(log.metadados) : log.metadados,
    motivo: log.motivo,
    codigo_erro: log.codigo_erro,
    ip: log.ip,
    user_agent: log.user_agent,
    request_id: log.request_id,
    operacao_id: log.operacao_id,
    evento_chave: log.evento_chave,
    criado_em: log.criado_em
  };
}

function serializeAuditLogs(logs = []) {
  return logs.map(serializeAuditLog);
}

module.exports = {
  serializeAuditLog,
  serializeAuditLogs
};
