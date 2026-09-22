const { query } = require('../config/db');
const consulta = require('../services/empresaConsultaService');

const SORTS = {
  nome: 'e.nome',
  criado_em: 'e.criado_em',
  ultima_atividade: 'ultima_atividade',
  total_usuarios: 'total_usuarios'
};

function buscaLiteral(value) {
  return `%${String(value || '').replace(/[\\%_]/g, '\\$&')}%`;
}

function filtrosLista(filtros) {
  const clauses = [];
  const params = [];
  if (filtros.search) {
    params.push(buscaLiteral(filtros.search));
    clauses.push(`(e.nome ILIKE $${params.length} ESCAPE '\\' OR e.email_contato ILIKE $${params.length} ESCAPE '\\')`);
  }
  if (filtros.tipo !== 'todas') {
    params.push(filtros.tipo);
    clauses.push(`e.tipo = $${params.length}`);
  }
  if (filtros.status === 'excluida') {
    clauses.push('e.excluida_em IS NOT NULL');
  } else {
    clauses.push('e.excluida_em IS NULL');
    if (filtros.status !== 'todas') {
      params.push(filtros.status);
      clauses.push(`e.status = $${params.length}`);
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function listar(req, res, next) {
  try {
    const filtros = req.query;
    const { where, params } = filtrosLista(filtros);
    const total = Number((await query(`SELECT count(*)::int AS total FROM empresas e ${where}`, params)).rows[0].total);
    const sort = SORTS[filtros.sort];
    const direction = filtros.direction === 'asc' ? 'ASC' : 'DESC';
    const listParams = [...params, filtros.limit, (filtros.page - 1) * filtros.limit];
    const result = await query(
      `SELECT e.id,e.nome,e.email_contato,e.plano,e.status,e.tipo,e.trial_expira_em,
              e.excluida_em,e.motivo_exclusao,e.criado_em,
              COALESCE(us.total_usuarios,0)::int AS total_usuarios,
              COALESCE(us.total_admins,0)::int AS total_admins,
              COALESCE(ps.total_produtos,0)::int AS total_produtos,
              COALESCE(cs.total_contagens,0)::int AS total_contagens,
              adm.administrador_principal,
              act.ultima_atividade
       FROM empresas e
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS total_usuarios,
                count(*) FILTER (WHERE papel IN ('administrador','gestor','admin'))::int AS total_admins
         FROM usuarios WHERE empresa_id=e.id
       ) us ON TRUE
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS total_produtos FROM produtos WHERE empresa_id=e.id AND ativo=TRUE
       ) ps ON TRUE
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS total_contagens FROM contagens WHERE empresa_id=e.id
       ) cs ON TRUE
       LEFT JOIN LATERAL (
         SELECT jsonb_build_object('id',id,'nome',nome,'email',email,'papel',papel) AS administrador_principal
         FROM usuarios WHERE empresa_id=e.id AND ativo=TRUE AND papel IN ('administrador','gestor','admin')
         ORDER BY criado_em,id LIMIT 1
       ) adm ON TRUE
       LEFT JOIN LATERAL (
         SELECT max(criado_em) AS ultima_atividade FROM audit_logs
         WHERE empresa_id=e.id OR empresa_afetada_id=e.id
       ) act ON TRUE
       ${where}
       ORDER BY ${sort} ${direction} NULLS LAST,e.id ASC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    res.json({
      success: true,
      data: {
        empresas: result.rows,
        total,
        pagination: {
          total,
          page: filtros.page,
          limit: filtros.limit,
          totalPages: Math.ceil(total / filtros.limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function obterMetricasSaaS(req, res, next) {
  try {
    const { rows } = await query(`
      WITH referencia AS (SELECT clock_timestamp() AS agora),
      clientes AS (SELECT id FROM empresas WHERE tipo='cliente' AND excluida_em IS NULL),
      empresas_recentes AS (
        SELECT id,nome,status,plano,criado_em FROM empresas
        WHERE tipo='cliente' AND excluida_em IS NULL ORDER BY criado_em DESC,id DESC LIMIT 5
      ),
      atividades_recentes AS (
        SELECT l.id,l.acao,l.resultado,l.ator_rotulo,l.criado_em,
               COALESCE(l.empresa_afetada_id,l.empresa_id) AS empresa_id
        FROM audit_logs l
        WHERE COALESCE(l.empresa_afetada_id,l.empresa_id) IN (SELECT id FROM clientes)
        ORDER BY l.criado_em DESC,l.id DESC LIMIT 5
      )
      SELECT
        (SELECT count(*)::int FROM clientes) AS total_empresas,
        (SELECT count(*)::int FROM empresas e JOIN clientes c ON c.id=e.id WHERE e.status='ativa') AS ativas,
        (SELECT count(*)::int FROM empresas e JOIN clientes c ON c.id=e.id WHERE e.status='inativa') AS inativas,
        (SELECT count(*)::int FROM usuarios u JOIN clientes c ON c.id=u.empresa_id) AS total_usuarios,
        (SELECT count(*)::int FROM usuarios u JOIN clientes c ON c.id=u.empresa_id WHERE u.ativo=TRUE) AS usuarios_ativos,
        (SELECT count(*)::int FROM usuarios u JOIN clientes c ON c.id=u.empresa_id
          WHERE u.papel IN ('administrador','gestor','admin')) AS total_admins,
        (SELECT count(*)::int FROM produtos p JOIN clientes c ON c.id=p.empresa_id WHERE p.ativo=TRUE) AS total_produtos,
        (SELECT count(*)::int FROM contagens ct JOIN clientes c ON c.id=ct.empresa_id) AS total_contagens,
        (SELECT count(*)::int FROM contagens ct JOIN clientes c ON c.id=ct.empresa_id WHERE ct.status='finalizada') AS contagens_finalizadas,
        (SELECT count(*)::int FROM contagens ct JOIN clientes c ON c.id=ct.empresa_id,referencia r
          WHERE ct.status='finalizada' AND ct.finalizado_em>=r.agora-interval '7 days' AND ct.finalizado_em<=r.agora) AS contagens_recentes,
        COALESCE((SELECT jsonb_agg(to_jsonb(er) ORDER BY er.criado_em DESC,er.id DESC) FROM empresas_recentes er),'[]'::jsonb) AS empresas_recentes,
        COALESCE((SELECT jsonb_agg(to_jsonb(ar) ORDER BY ar.criado_em DESC,ar.id DESC) FROM atividades_recentes ar),'[]'::jsonb) AS atividades_recentes,
        (SELECT agora FROM referencia) AS gerado_em
    `);
    const row = rows[0];
    res.json({
      success: true,
      data: {
        totalEmpresas: row.total_empresas,
        ativas: row.ativas,
        inativas: row.inativas,
        totalUsuarios: row.total_usuarios,
        usuariosAtivos: row.usuarios_ativos,
        totalAdmins: row.total_admins,
        totalProdutos: row.total_produtos,
        totalContagens: row.total_contagens,
        contagensFinalizadas: row.contagens_finalizadas,
        contagensRecentes: row.contagens_recentes,
        empresasRecentes: row.empresas_recentes,
        atividadesRecentes: row.atividades_recentes,
        geradoEm: row.gerado_em
      }
    });
  } catch (error) {
    next(error);
  }
}

async function obterDetalhes(req, res, next) {
  try {
    const client = { query };
    const empresa = await consulta.resumo(client, req.params.id);
    const usuarios = await consulta.listar(client, req.params.id, 'usuarios', req.query);
    res.json({ success: true, data: { empresa, usuarios: usuarios.items, pagination: usuarios.pagination } });
  } catch (error) {
    next(error);
  }
}

function listarRecurso(recurso) {
  return async (req, res, next) => {
    try {
      await consulta.resumo({ query }, req.params.id);
      const data = await consulta.listar({ query }, req.params.id, recurso, req.query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  listar,
  obterMetricasSaaS,
  obterDetalhes,
  obterUsuarios: listarRecurso('usuarios'),
  obterContagens: listarRecurso('contagens'),
  obterSessoesAuditoria: listarRecurso('sessoes-auditoria')
};
