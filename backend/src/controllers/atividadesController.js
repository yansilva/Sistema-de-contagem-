const { query } = require('../config/db');
const { serializeAuditLog, serializeAuditLogs } = require('../serializers/auditSerializer');

/**
 * Sanitiza valores contra CSV Formula Injection (OWASP)
 */
function sanitizeCsvValue(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Se começar com caracteres interpretados como fórmulas por Excel/Calc, neutraliza com apóstrofo
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  // Se contiver aspas duplas, vírgulas ou quebra de linha, envolve em aspas duplas escapadas
  if (/[",;\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Monta condições SQL e parâmetros parametrizados dinamicamente
 */
function buildQueryFilters(usuario, filtros = {}) {
  const whereClauses = [];
  const params = [];

  // Multi-tenancy: super_admin pode ver todos ou filtrar por empresa; demais veem apenas sua empresa
  if (usuario.papel !== 'super_admin') {
    params.push(usuario.empresa_id);
    whereClauses.push(`escopo = 'empresa' AND empresa_id = $${params.length}`);
  } else if (filtros.empresa_id) {
    params.push(filtros.empresa_id);
    whereClauses.push(`(empresa_id = $${params.length} OR empresa_afetada_id = $${params.length})`);
  }

  if (filtros.data_inicio) {
    params.push(new Date(filtros.data_inicio).toISOString());
    whereClauses.push(`criado_em >= $${params.length}`);
  }

  if (filtros.data_fim) {
    // Adiciona final do dia se não houver horário
    const fimDate = new Date(filtros.data_fim);
    if (filtros.data_fim.length <= 10) {
      fimDate.setUTCHours(23, 59, 59, 999);
    }
    params.push(fimDate.toISOString());
    whereClauses.push(`criado_em <= $${params.length}`);
  }

  if (filtros.ator_id) {
    params.push(filtros.ator_id);
    whereClauses.push(`ator_id = $${params.length}`);
  }

  if (filtros.acao) {
    params.push(filtros.acao);
    whereClauses.push(`acao = $${params.length}`);
  }

  if (filtros.entidade) {
    params.push(filtros.entidade);
    whereClauses.push(`entidade = $${params.length}`);
  }

  if (filtros.resultado) {
    params.push(filtros.resultado);
    whereClauses.push(`resultado = $${params.length}`);
  }

  if (filtros.search) {
    params.push(`%${filtros.search}%`);
    const idx = params.length;
    whereClauses.push(`(ator_rotulo ILIKE $${idx} OR acao ILIKE $${idx} OR motivo ILIKE $${idx})`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params };
}

/**
 * GET /api/atividades — Listagem paginada com filtros
 */
async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20, ...filtros } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const { whereSql, params } = buildQueryFilters(req.usuario, filtros);

    // Contagem total
    const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${whereSql}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Busca paginada
    const listParams = [...params, Number(limit), offset];
    const listQuery = `
      SELECT * FROM audit_logs
      ${whereSql}
      ORDER BY criado_em DESC, id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
    `;
    const listResult = await query(listQuery, listParams);

    const atividades = serializeAuditLogs(listResult.rows);

    return res.json({
      success: true,
      data: {
        atividades,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/atividades/:id — Detalhe completo de um registro de auditoria
 */
async function obterPorId(req, res, next) {
  try {
    const { id } = req.params;
    const params = [id];
    let scope = '';
    if (req.usuario.papel !== 'super_admin') {
      params.push(req.usuario.empresa_id);
      scope = ` AND escopo = 'empresa' AND empresa_id = $2`;
    }
    const result = await query(`SELECT * FROM audit_logs WHERE id = $1${scope}`, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Registro de atividade não encontrado.',
        code: 'LOG_NAO_ENCONTRADO'
      });
    }

    const log = result.rows[0];

    return res.json({
      success: true,
      data: serializeAuditLog(log)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/atividades/exportacoes — Exportação CSV sanitizada contra injeção de fórmulas
 */
async function exportar(req, res, next) {
  try {
    const filtros = req.body || {};
    const { whereSql, params } = buildQueryFilters(req.usuario, filtros);

    // Limite preventivo de 5000 registros para exportação em streaming seguro
    const exportQuery = `
      SELECT * FROM audit_logs
      ${whereSql}
      ORDER BY criado_em DESC, id DESC
      LIMIT 5000
    `;
    const result = await query(exportQuery, params);

    const cabecalho = [
      'ID',
      'Data e Hora (ISO)',
      'Escopo',
      'Acao',
      'Entidade',
      'ID Entidade',
      'Resultado',
      'Ator Tipo',
      'Ator Nome',
      'Ator Papel',
      'IP',
      'Request ID',
      'Motivo'
    ];

    const linhas = [cabecalho.map(sanitizeCsvValue).join(';')];

    for (const log of result.rows) {
      const linha = [
        sanitizeCsvValue(log.id),
        sanitizeCsvValue(log.criado_em),
        sanitizeCsvValue(log.escopo),
        sanitizeCsvValue(log.acao),
        sanitizeCsvValue(log.entidade),
        sanitizeCsvValue(log.entidade_id),
        sanitizeCsvValue(log.resultado),
        sanitizeCsvValue(log.ator_tipo),
        sanitizeCsvValue(log.ator_rotulo),
        sanitizeCsvValue(log.ator_papel),
        sanitizeCsvValue(log.ip),
        sanitizeCsvValue(log.request_id),
        sanitizeCsvValue(log.motivo)
      ];
      linhas.push(linha.join(';'));
    }

    const csvContent = '\uFEFF' + linhas.join('\r\n');
    const filename = `auditoria_atividades_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listar,
  obterPorId,
  exportar,
  sanitizeCsvValue,
  buildQueryFilters
};
