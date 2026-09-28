const db = require('../config/db');

// Os limites locais são calculados no banco e convertidos para instantes UTC.
// O catálogo atual define o denominador, o produtor e a modalidade requerida.
const consultaCobertura = `
  WITH semana_local AS (
    SELECT date_trunc('week', $2::timestamptz AT TIME ZONE 'America/Sao_Paulo') AS inicio
  ), limites AS (
    SELECT inicio AT TIME ZONE 'America/Sao_Paulo' AS inicio,
           (inicio + INTERVAL '7 days') AT TIME ZONE 'America/Sao_Paulo' AS fim
    FROM semana_local
  ), catalogo AS (
    SELECT id, codigo, nome, fornecedor,
           CASE WHEN contagem_em_pecas THEN 'pecas_queijo' ELSE 'geral' END AS tipo
    FROM produtos WHERE empresa_id = $1 AND ativo = TRUE
  ), contados AS (
    SELECT DISTINCT ci.produto_id
    FROM contagem_itens ci
    JOIN contagem_fornecedores cf ON cf.id = ci.contagem_fornecedor_id
    JOIN contagens c ON c.id = cf.contagem_id
    JOIN catalogo p ON p.id = ci.produto_id AND p.tipo = c.tipo
    CROSS JOIN limites l
    WHERE c.empresa_id = $1 AND c.status = 'finalizada'
      AND ci.quantidade_contada IS NOT NULL
      AND ci.contado_em >= l.inicio AND ci.contado_em < l.fim
  )
  SELECT l.inicio, l.fim, p.id, p.codigo, p.nome, p.fornecedor, p.tipo,
         ct.produto_id IS NOT NULL AS contado
  FROM limites l
  LEFT JOIN catalogo p ON TRUE
  LEFT JOIN contados ct ON ct.produto_id = p.id
  ORDER BY p.fornecedor, p.nome, p.codigo, p.id
`;

async function obterCoberturaSemanal(empresaId, agora = new Date()) {
  const { rows } = await db.query(consultaCobertura, [empresaId, agora]);
  const grupos = new Map();
  for (const item of rows) {
    if (!item.id) continue;
    if (!grupos.has(item.fornecedor)) {
      grupos.set(item.fornecedor, {
        fornecedor: item.fornecedor,
        total_produtos: 0,
        produtos_contados: 0,
        status: 'pendente',
        produtos_pendentes: []
      });
    }
    const produtor = grupos.get(item.fornecedor);
    produtor.total_produtos++;
    if (item.contado) produtor.produtos_contados++;
    else produtor.produtos_pendentes.push({ id: item.id, codigo: item.codigo, nome: item.nome, tipo: item.tipo });
  }
  const resumo = { contados: 0, parciais: 0, pendentes: 0 };
  const produtores = [...grupos.values()];
  for (const produtor of produtores) {
    if (produtor.produtos_contados === produtor.total_produtos) {
      produtor.status = 'contado';
      resumo.contados++;
    } else if (produtor.produtos_contados > 0) {
      produtor.status = 'parcial';
      resumo.parciais++;
    } else resumo.pendentes++;
  }
  return {
    semana: {
      inicio: new Date(rows[0].inicio).toISOString(),
      fim_exclusivo: new Date(rows[0].fim).toISOString(),
      fuso: 'America/Sao_Paulo'
    },
    resumo,
    produtores
  };
}

module.exports = { obterCoberturaSemanal };
