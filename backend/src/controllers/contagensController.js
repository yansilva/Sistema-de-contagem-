const { query, getClient } = require('../config/db');
const { AppError, NotFoundError, ValidationError } = require('../errors/AppError');
const auditService = require('../services/auditService');
const { serializeContagemDetalhe } = require('../serializers/contagemSerializer');

/**
 * POST /api/contagens
 * Inicia nova sessão de contagem cega.
 * Captura o snapshot imutável de estoque_referencia para todos os produtos ativos da empresa.
 */
async function iniciar(req, res, next) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Criar a sessão de contagem
    const contagemRes = await client.query(
      `INSERT INTO contagens (empresa_id, iniciado_por, status)
       VALUES ($1, $2, 'em_andamento')
       RETURNING id, iniciado_em, status`,
      [req.empresaId, req.usuario.id]
    );
    const contagem = contagemRes.rows[0];

    // 2. Buscar todos os produtos ativos da empresa para snapshot
    const produtosRes = await client.query(
      `SELECT id, codigo, nome, fornecedor, estoque_atual
       FROM produtos
       WHERE empresa_id = $1 AND ativo = TRUE
       ORDER BY fornecedor ASC, nome ASC`,
      [req.empresaId]
    );

    const produtos = produtosRes.rows;

    if (produtos.length === 0) {
      throw new ValidationError(
        'Nenhum produto ativo cadastrado na empresa para contagem. Cadastre produtos antes de iniciar.',
        'SEM_PRODUTOS'
      );
    }

    // 3. Agrupar produtos por produtor/fornecedor
    const mapaFornecedores = new Map();
    for (const p of produtos) {
      const forn = p.fornecedor.trim();
      if (!mapaFornecedores.has(forn)) {
        mapaFornecedores.set(forn, []);
      }
      mapaFornecedores.get(forn).push(p);
    }

    // 4. Batch INSERT de fornecedores (1 query em vez de N)
    const fornecedoresArr = [...mapaFornecedores.keys()];
    const fornValues = fornecedoresArr.map((_, i) => "($1, $" + (i + 2) + ", FALSE)").join(', ');
    const fornRes = await client.query(
      `INSERT INTO contagem_fornecedores (contagem_id, fornecedor, tem_diferenca)
       VALUES ${fornValues}
       RETURNING id, fornecedor`,
      [contagem.id, ...fornecedoresArr]
    );

    // Mapeia fornecedor -> id retornado
    const fornecedorIdMap = new Map();
    for (const row of fornRes.rows) {
      fornecedorIdMap.set(row.fornecedor, row.id);
    }

    // 5. Batch INSERT de itens do snapshot (1 query em vez de N*M)
    const itensValues = [];
    const itensParams = [];
    let paramIdx = 1;
    for (const p of produtos) {
      const fornId = fornecedorIdMap.get(p.fornecedor.trim());
      itensValues.push("($" + paramIdx + ", $" + (paramIdx + 1) + ", $" + (paramIdx + 2) + ", $" + (paramIdx + 3) + ", $" + (paramIdx + 4) + ", NULL, NULL, NULL)");
      itensParams.push(fornId, p.id, p.codigo, p.nome, p.estoque_atual || 0);
      paramIdx += 5;
    }

    await client.query(
      `INSERT INTO contagem_itens
       (contagem_fornecedor_id, produto_id, codigo, nome, estoque_referencia, quantidade_contada, diferenca, situacao)
       VALUES ${itensValues.join(', ')}`,
      itensParams
    );

    // Auditoria: contagem iniciada
    await auditService.registrar(client, req.auditContext || {}, {
      empresaId: req.empresaId,
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'contagem_criada',
      entidade: 'contagem',
      entidadeId: contagem.id,
      dadosNovos: { total_fornecedores: mapaFornecedores.size, total_produtos: produtos.length },
      whitelistCampos: ['total_fornecedores', 'total_produtos'],
      eventoChave: `contagem_criada_${contagem.id}`
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Sessão de contagem iniciada com sucesso. Snapshot de referência registrado.',
      data: {
        contagem: {
          id: contagem.id,
          iniciado_em: contagem.iniciado_em,
          status: contagem.status,
          total_fornecedores: mapaFornecedores.size,
          total_produtos: produtos.length
        }
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/contagens/:id/salvar-progresso
 * Salva a contagem física informada pelo funcionário para um produtor/fornecedor.
 * Suporta NULL (não contado) e 0 (zero unidades contadas fisicamente).
 */
async function salvarProgresso(req, res, next) {
  const client = await getClient();

  try {
    const { id } = req.params;
    const { fornecedor, itens } = req.body;

    // Verificar se contagem pertence à empresa e está em andamento
    const contagemCheck = await client.query(
      `SELECT id FROM contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'`,
      [id, req.empresaId]
    );

    if (contagemCheck.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada, já finalizada ou sem permissão.',
        'CONTAGEM_INVALIDA'
      );
    }

    await client.query('BEGIN');

    // Localizar fornecedor na contagem
    let fornRes = await client.query(
      `SELECT id FROM contagem_fornecedores WHERE contagem_id = $1 AND fornecedor = $2`,
      [id, fornecedor.trim()]
    );

    let fornecedorId;
    if (fornRes.rows.length === 0) {
      const novoForn = await client.query(
        `INSERT INTO contagem_fornecedores (contagem_id, fornecedor, tem_diferenca)
         VALUES ($1, $2, FALSE) RETURNING id`,
        [id, fornecedor.trim()]
      );
      fornecedorId = novoForn.rows[0].id;
    } else {
      fornecedorId = fornRes.rows[0].id;
    }

    // Atualizar cada item informado
    let itensSalvos = 0;
    for (const item of itens) {
      const qtd = item.quantidade_contada === null || item.quantidade_contada === undefined
        ? null
        : parseInt(item.quantidade_contada, 10);

      const upd = await client.query(
        `UPDATE contagem_itens
         SET quantidade_contada = $1, contado_em = CASE WHEN $1::integer IS NULL THEN NULL ELSE NOW() END
         WHERE contagem_fornecedor_id = $2 AND produto_id = $3
         RETURNING id`,
        [qtd, fornecedorId, item.produto_id]
      );

      if (upd.rows.length > 0) {
        itensSalvos++;
      } else {
        // Se item não estava no snapshot original, busca no catálogo e insere
        const prod = await client.query(
          `SELECT id, codigo, nome, estoque_atual FROM produtos WHERE id = $1 AND empresa_id = $2`,
          [item.produto_id, req.empresaId]
        );
        if (prod.rows.length > 0) {
          const p = prod.rows[0];
          await client.query(
            `INSERT INTO contagem_itens
             (contagem_fornecedor_id, produto_id, codigo, nome, estoque_referencia, quantidade_contada, contado_em)
             VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::integer IS NULL THEN NULL ELSE NOW() END)`,
            [fornecedorId, p.id, p.codigo, p.nome, p.estoque_atual || 0, qtd]
          );
          itensSalvos++;
        }
      }
    }

    // Auditoria: progresso salvo
    await auditService.registrar(client, req.auditContext || {}, {
      empresaId: req.empresaId,
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'contagem_progresso_salvo',
      entidade: 'contagem',
      entidadeId: id,
      metadados: { fornecedor: fornecedor.trim(), itens_salvos: itensSalvos },
      eventoChave: `progresso_${id}_${fornecedorId}`
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Progresso salvo com sucesso para o produtor '${fornecedor}' (${itensSalvos} itens).`,
      data: {
        fornecedor_id: fornecedorId,
        itens_salvos: itensSalvos
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/contagens/:id/fornecedor (Compatibilidade)
 * Registra contagem de um fornecedor calculando diferenças no servidor
 */
async function adicionarFornecedor(req, res, next) {
  const client = await getClient();

  try {
    const { id } = req.params;
    const { fornecedor, produtos } = req.body;

    const contagemCheck = await client.query(
      `SELECT id FROM contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'`,
      [id, req.empresaId]
    );

    if (contagemCheck.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada, finalizada ou sem permissão de acesso.',
        'CONTAGEM_INVALIDA'
      );
    }

    await client.query('BEGIN');

    // Verificar se fornecedor já existe
    let fornRes = await client.query(
      `SELECT id FROM contagem_fornecedores WHERE contagem_id = $1 AND fornecedor = $2`,
      [id, fornecedor.trim()]
    );

    let fornecedorId;
    if (fornRes.rows.length === 0) {
      const ins = await client.query(
        `INSERT INTO contagem_fornecedores (contagem_id, fornecedor, tem_diferenca)
         VALUES ($1, $2, FALSE) RETURNING id`,
        [id, fornecedor.trim()]
      );
      fornecedorId = ins.rows[0].id;
    } else {
      fornecedorId = fornRes.rows[0].id;
    }

    for (const p of produtos) {
      const qtd = p.quantidade_contada !== undefined && p.quantidade_contada !== null
        ? parseInt(p.quantidade_contada, 10)
        : (p.qty_contagem !== undefined ? parseInt(p.qty_contagem, 10) : null);

      await client.query(
        `UPDATE contagem_itens
         SET quantidade_contada = $1, contado_em = CASE WHEN $1 IS NULL THEN NULL ELSE NOW() END
         WHERE contagem_fornecedor_id = $2 AND (produto_id = $3 OR codigo = $4)`,
        [qtd, fornecedorId, p.produto_id || null, p.codigo.trim()]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Contagem do produtor '${fornecedor}' registrada com sucesso.`,
      data: {
        contagem_fornecedor_id: fornecedorId
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/contagens/:id/finalizar
 * Finaliza a contagem cega: calcula internamente diferenças e situação para cada item.
 */
async function finalizar(req, res, next) {
  const client = await getClient();

  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const contagemCheck = await client.query(
      `SELECT id FROM contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento' FOR UPDATE`,
      [id, req.empresaId]
    );

    if (contagemCheck.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada ou já finalizada.',
        'CONTAGEM_NAO_ENCONTRADA'
      );
    }

    // Apura somente quantidades registradas; NULL permanece não contado.
    const itensRes = await client.query(
      `UPDATE contagem_itens AS ci
       SET diferenca = ci.quantidade_contada - ci.estoque_referencia,
           situacao = CASE
             WHEN ci.quantidade_contada > ci.estoque_referencia THEN 'sobra'
             WHEN ci.quantidade_contada < ci.estoque_referencia THEN 'falta'
             ELSE 'sem_diferenca'
           END
       FROM contagem_fornecedores AS cf
       WHERE ci.contagem_fornecedor_id = cf.id
         AND cf.contagem_id = $1
         AND ci.quantidade_contada IS NOT NULL
       RETURNING ci.contagem_fornecedor_id, ci.diferenca`,
      [id]
    );

    if (itensRes.rows.length === 0) {
      throw new AppError(
        'Registre pelo menos um produto antes de finalizar a contagem.',
        400,
        'SEM_ITENS_CONTADOS'
      );
    }

    const fornecedoresComDiferenca = new Set(
      itensRes.rows.filter(item => Number(item.diferenca) !== 0).map(item => item.contagem_fornecedor_id)
    );
    const temDiferencaGlobal = fornecedoresComDiferenca.size > 0;

    await client.query(
      `UPDATE contagem_fornecedores AS cf
       SET tem_diferenca = cf.id = ANY($2::uuid[])
       WHERE cf.contagem_id = $1`,
      [id, [...fornecedoresComDiferenca]]
    );

    // Finalizar contagem
    const finalResult = await client.query(
      `UPDATE contagens
       SET status = 'finalizada', finalizado_em = NOW(), tem_diferenca = $1
       WHERE id = $2
       RETURNING id, iniciado_em, finalizado_em, tem_diferenca, status`,
      [temDiferencaGlobal, id]
    );

    // Auditoria: contagem finalizada
    await auditService.registrar(client, req.auditContext || {}, {
      empresaId: req.empresaId,
      atorId: req.usuario.id,
      atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email,
      acao: 'contagem_finalizada',
      entidade: 'contagem',
      entidadeId: id,
      dadosNovos: { tem_diferenca: temDiferencaGlobal, total_itens: itensRes.rows.length, fornecedores_com_diferenca: fornecedoresComDiferenca.size },
      whitelistCampos: ['tem_diferenca', 'total_itens', 'fornecedores_com_diferenca'],
      eventoChave: `contagem_finalizada_${id}`
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Contagem finalizada com sucesso. Diferenças apuradas.',
      data: {
        contagem: finalResult.rows[0]
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/contagens
 * Lista histórico de contagens com agregação JSON
 */
async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const sql = `
      SELECT c.id, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
             u.nome AS iniciado_por_nome,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', cf.id,
                   'fornecedor', cf.fornecedor,
                   'tem_diferenca', cf.tem_diferenca,
                   'contado_em', cf.contado_em
                 ) ORDER BY cf.fornecedor ASC
               ) FILTER (WHERE cf.id IS NOT NULL),
               '[]'
             ) AS fornecedores
      FROM contagens c
      LEFT JOIN usuarios u ON u.id = c.iniciado_por
      LEFT JOIN contagem_fornecedores cf ON cf.contagem_id = c.id
        AND (c.status <> 'finalizada' OR EXISTS (
          SELECT 1 FROM contagem_itens ci
          WHERE ci.contagem_fornecedor_id = cf.id AND ci.quantidade_contada IS NOT NULL
        ))
      WHERE c.empresa_id = $1
      GROUP BY c.id, u.nome
      ORDER BY c.iniciado_em DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [req.empresaId, limitNum, offset]);

    res.json({
      success: true,
      data: {
        contagens: result.rows.map(contagem => serializeContagemDetalhe(contagem, contagem.fornecedores || [], req.usuario))
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/contagens/:id
 * Detalhes da contagem protegidos por RBAC e Status:
 * - Durante contagem (em_andamento): NUNCA retorna estoque_referencia nem diferenca.
 * - Após finalização:
 *    - Funcionário e administrador: veem estoque_referencia, quantidade_contada,
 *      diferenca e situacao dos produtos contados.
 */
async function detalhe(req, res, next) {
  try {
    const { id } = req.params;
    const contagemRes = await query(
      `SELECT c.id, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
              u.nome AS iniciado_por_nome
       FROM contagens c
       LEFT JOIN usuarios u ON u.id = c.iniciado_por
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [id, req.empresaId]
    );

    if (contagemRes.rows.length === 0) {
      throw new NotFoundError('Contagem não encontrada.', 'CONTAGEM_NAO_ENCONTRADA');
    }

    const contagem = contagemRes.rows[0];
    const isFinalizada = contagem.status === 'finalizada';

    // Buscar fornecedores com seus respectivos itens
    const sql = `
      SELECT cf.id, cf.fornecedor, cf.tem_diferenca, cf.contado_em,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', ci.id,
                   'produto_id', ci.produto_id,
                   'codigo', ci.codigo,
                   'nome', ci.nome,
                   'quantidade_contada', ci.quantidade_contada,
                   'contado_em', ci.contado_em,
                   'estoque_referencia', ci.estoque_referencia,
                   'diferenca', ci.diferenca,
                   'situacao', ci.situacao
                 ) ORDER BY ci.nome ASC
               ) FILTER (WHERE ci.id IS NOT NULL),
               '[]'
             ) AS produtos
      FROM contagem_fornecedores cf
      LEFT JOIN contagem_itens ci ON ci.contagem_fornecedor_id = cf.id
        AND ($2::boolean = FALSE OR ci.quantidade_contada IS NOT NULL)
      WHERE cf.contagem_id = $1
      GROUP BY cf.id
      HAVING ($2::boolean = FALSE OR COUNT(ci.id) > 0)
      ORDER BY cf.fornecedor ASC
    `;

    const fornecedoresRes = await query(sql, [id, isFinalizada]);

    const contagemSerializada = serializeContagemDetalhe(
      contagem,
      fornecedoresRes.rows,
      req.usuario
    );

    res.json({
      success: true,
      data: {
        contagem: contagemSerializada
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  iniciar,
  salvarProgresso,
  adicionarFornecedor,
  finalizar,
  listar,
  detalhe
};
