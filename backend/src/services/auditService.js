const crypto = require('crypto');
const { query: defaultQuery } = require('../config/db');

// Lista negra absoluta de chaves sensíveis que NUNCA podem ser salvas nos logs
const SENSITIVE_KEYS = new Set([
  'senha',
  'senhahash',
  'senhatemporaria',
  'novasenhatemporaria',
  'novasenha',
  'senhaatual',
  'token',
  'tokenhash',
  'refreshtoken',
  'accesstoken',
  'secret',
  'jwtsecret',
  'salt'
]);

/**
 * Remove recursivamente quaisquer chaves sensíveis e filtra por whitelist se fornecida
 */
function sanitizarObjeto(obj, whitelist = null, seen = new WeakSet()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }

  if (seen.has(obj)) return null;
  seen.add(obj);
  const limpar = (valor) => {
    if (Array.isArray(valor)) {
      if (seen.has(valor)) return null;
      seen.add(valor);
      const result = valor.map(limpar);
      seen.delete(valor);
      return result;
    }
    return valor && typeof valor === 'object' ? sanitizarObjeto(valor, null, seen) : valor;
  };
  const sanitizado = {};
  for (const [chave, valor] of Object.entries(obj)) {
    const chaveNorm = chave.toLowerCase().replace(/[-_]/g, '');
    if (
      SENSITIVE_KEYS.has(chaveNorm) ||
      chaveNorm.includes('senha') ||
      chaveNorm.includes('token') ||
      chaveNorm.includes('secret') ||
      chaveNorm.includes('hash') ||
      chaveNorm.includes('salt') ||
      /password|authorization|cookie|apikey|credential|privatekey/.test(chaveNorm) ||
      ['__proto__', 'constructor', 'prototype'].includes(chave)
    ) {
      continue; // descarta segredos
    }

    if (whitelist && !whitelist.includes(chave)) {
      continue; // descarta campos não autorizados
    }

    if (valor !== undefined) {
      sanitizado[chave] = limpar(valor);
    }
  }

  seen.delete(obj);
  return Object.keys(sanitizado).length > 0 ? sanitizado : null;
}

/**
 * Registra um evento de auditoria dentro de uma transação ativa (Garante atomicidade estrita)
 * Se este INSERT falhar, a transação chamadora DEVE sofrer ROLLBACK.
 *
 * @param {object} tx - Cliente da transação (pg.Client ou getClient())
 * @param {object} contexto - Contexto HTTP seguro coletado pelo auditContext middleware
 * @param {object} evento - Dados do evento a ser auditado
 */
async function registrar(tx, contexto = {}, evento = {}) {
  const {
    escopo = 'empresa',
    empresaId = null,
    atorTipo = 'usuario_empresa',
    atorId = null,
    atorPapel = null,
    atorRotulo = null,
    acao,
    entidade,
    entidadeId = null,
    resultado = 'sucesso',
    dadosAnteriores = null,
    dadosNovos = null,
    metadados = {},
    motivo = null,
    codigoErro = null,
    eventoChave = 'padrao',
    whitelistCampos = null
  } = evento;

  if (!acao || !entidade) {
    throw new Error('[AUDIT] "acao" e "entidade" são campos obrigatórios para auditoria.');
  }

  // Validação estrita de escopo
  if (escopo === 'empresa' && !empresaId) {
    throw new Error('[AUDIT] Evento no escopo "empresa" exige "empresaId" preenchido.');
  }
  const empresaIdFinal = escopo === 'empresa' ? empresaId : null;

  // Sanitização de dados anteriores, novos e metadados
  const antesSanitizado = sanitizarObjeto(dadosAnteriores, whitelistCampos);
  const novosSanitizado = sanitizarObjeto(dadosNovos, whitelistCampos);
  const metaSanitizado = sanitizarObjeto(metadados) || {};

  const ip = contexto.ip || '127.0.0.1';
  const userAgent = (contexto.userAgent || 'Desconhecido').slice(0, 512);
  const requestId = contexto.requestId || crypto.randomUUID();
  const operacaoId = contexto.operacaoId || crypto.randomUUID();

  const sql = `
    INSERT INTO audit_logs (
      escopo, empresa_id,
      ator_tipo, ator_id, ator_papel, ator_rotulo,
      acao, entidade, entidade_id, resultado,
      dados_anteriores, dados_novos, metadados,
      motivo, codigo_erro,
      ip, user_agent, request_id, operacao_id, evento_chave
    ) VALUES (
      $1, $2,
      $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13,
      $14, $15,
      $16, $17, $18, $19, $20
    )
    RETURNING id, criado_em
  `;

  const params = [
    escopo,
    empresaIdFinal,
    atorTipo,
    atorId,
    atorPapel,
    atorRotulo,
    acao,
    entidade,
    entidadeId,
    resultado,
    antesSanitizado ? JSON.stringify(antesSanitizado) : null,
    novosSanitizado ? JSON.stringify(novosSanitizado) : null,
    JSON.stringify(metaSanitizado),
    motivo ? String(motivo).slice(0, 500) : null,
    codigoErro ? String(codigoErro).slice(0, 64) : null,
    ip,
    userAgent,
    requestId,
    operacaoId,
    eventoChave
  ];

  const dbClient = tx && typeof tx.query === 'function' ? tx : { query: defaultQuery };
  return dbClient.query(sql, params);
}

/**
 * Registra eventos fora de transação de negócio (ex: tentativas de login falhas ou acessos negados)
 */
async function registrarForaDaTransacao(contexto = {}, evento = {}) {
  return registrar(null, contexto, evento);
}

module.exports = {
  registrar,
  registrarForaDaTransacao,
  sanitizarObjeto
};
