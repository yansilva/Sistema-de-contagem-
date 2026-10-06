const { query, getClient } = require('../config/db');
const { AppError, NotFoundError } = require('../errors/AppError');
const auditService = require('../services/auditService');
const { obterCoberturaSemanal } = require('../services/coberturaSemanalService');
const { serializeContagemDetalhe } = require('../serializers/contagemSerializer');

/**
 * POST /api/contagens
 * Inicia nova sessão de contagem cega.
 * Captura o snapshot imutável de estoque_referencia para todos os produtos ativos da empresa.
 * @returns {Promise<void>}
 */
async function iniciar(req, res, next) {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const tipo = req.body?.tipo || 'geral';

    // 1. Criar a sessão de contagem
    const contagemRes = await client.query(
      `INSERT INTO contagens (empresa_id, iniciado_por, status, tipo)
       VALUES ($1, $2, 'em_andamento', $3)
       RETURNING id, iniciado_em, status, tipo`,
      [req.empresaId, req.usuario.id, tipo]
    );
    const contagem = contagemRes.rows[0];

    // 2. Buscar todos os produtos ativos da empresa para snapshot
    const produtosRes = await client.query(
      `SELECT id, codigo, nome, fornecedor, estoque_atual
       FROM produtos
       WHERE empresa_id = $1 AND ativo = TRUE AND contagem_em_pecas = $2
       ORDER BY fornecedor ASC, nome ASC`,
      [req.empresaId, tipo === 'pecas_queijo']
    );

    const produtos = produtosRes.rows;

    if (produtos.length === 0) {
      throw new AppError(
        'Nenhum produto ativo compatível com esta modalidade. Cadastre produtos antes de iniciar.',
        400,
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
      itensParams.push(fornId, p.id, p.codigo, p.nome, tipo === 'pecas_queijo' ? null : (p.estoque_atual ?? 0));
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
      dadosNovos: { tipo, total_fornecedores: mapaFornecedores.size, total_produtos: produtos.length },
      whitelistCampos: ['tipo', 'total_fornecedores', 'total_produtos'],
      eventoChave: `contagem_criada_${contagem.id}`
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Sessão de contagem iniciada com sucesso.',
      data: {
        contagem: {
          id: contagem.id,
          tipo,
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
 * @returns {Promise<void>}
 */
async function salvarProgresso(req, res, next) {
  const client = await getClient();

  try {
    const { id } = req.params;
    const { fornecedor, itens } = req.body;

    await client.query('BEGIN');

    // Verificar se contagem pertence à empresa e está em andamento
    const contagemCheck = await client.query(
      `SELECT id, tipo FROM contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento' FOR UPDATE`,
      [id, req.empresaId]
    );

    if (contagemCheck.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada, já finalizada ou sem permissão.',
        'CONTAGEM_INVALIDA'
      );
    }

    const tipo = contagemCheck.rows[0].tipo || 'geral';

    if (tipo === 'pecas_queijo' && itens.some(item => item.quantidade_vencida !== undefined)) {
      throw new AppError('Produtos vencidos não se aplicam à contagem de peças.', 400, 'ITEM_INCOMPATIVEL');
    }

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
        : item.quantidade_contada;

      const upd = await client.query(
        `UPDATE contagem_itens
         SET quantidade_contada = $1, quantidade_vencida = $4, contado_em = CASE WHEN $1::integer IS NULL THEN NULL ELSE NOW() END
         WHERE contagem_fornecedor_id = $2 AND produto_id = $3
         RETURNING id`,
        [qtd, fornecedorId, item.produto_id, item.quantidade_vencida || 0]
      );

      if (upd.rows.length > 0) {
        itensSalvos++;
      } else {
        // Item fora do snapshot não pode ser registrado durante a contagem.
        if (tipo === 'geral') throw new AppError('Produto não pertence ao snapshot da contagem.', 400, 'ITEM_INCOMPATIVEL');
        // Compatibilidade da modalidade de peças com inclusão dinâmica.
        const prod = await client.query(
          `SELECT id, codigo, nome, estoque_atual FROM produtos
           WHERE id = $1 AND empresa_id = $2 AND ativo = TRUE
             AND fornecedor = $3 AND contagem_em_pecas = $4
             AND NOT EXISTS (
               SELECT 1 FROM contagem_itens ci JOIN contagem_fornecedores cf ON cf.id = ci.contagem_fornecedor_id
               WHERE cf.contagem_id = $5 AND ci.produto_id = produtos.id
             )`,
          [item.produto_id, req.empresaId, fornecedor.trim(), tipo === 'pecas_queijo', id]
        );
        if (prod.rows.length > 0) {
          const p = prod.rows[0];
          await client.query(
            `INSERT INTO contagem_itens
             (contagem_fornecedor_id, produto_id, codigo, nome, estoque_referencia, quantidade_contada, contado_em)
             VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::integer IS NULL THEN NULL ELSE NOW() END)`,
            [fornecedorId, p.id, p.codigo, p.nome, tipo === 'pecas_queijo' ? null : (p.estoque_atual ?? 0), qtd]
          );
          itensSalvos++;
        } else {
          throw new AppError('Produto incompatível com a modalidade, empresa ou produtor da contagem.', 400, 'ITEM_INCOMPATIVEL');
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
      metadados: { tipo, fornecedor: fornecedor.trim(), itens_salvos: itensSalvos },
      eventoChave: `progresso_${id}_${fornecedorId}`
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Progresso salvo com sucesso para o produtor '${fornecedor}' (${itensSalvos} itens).`,
      data: {
        tipo,
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
 * @returns {Promise<void>}
 */
async function adicionarFornecedor(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { fornecedor, produtos } = req.body;
    await client.query('BEGIN');
    const contagemCheck = await client.query(
      `SELECT id, tipo FROM contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento' FOR UPDATE`,
      [id, req.empresaId]
    );
    if (contagemCheck.rows.length === 0) {
      throw new NotFoundError('Contagem não encontrada, finalizada ou sem permissão de acesso.', 'CONTAGEM_INVALIDA');
    }
    const tipo = contagemCheck.rows[0].tipo || 'geral';
    const fornRes = await client.query(
      'SELECT id FROM contagem_fornecedores WHERE contagem_id = $1 AND fornecedor = $2',
      [id, fornecedor.trim()]
    );
    if (!fornRes.rows.length) throw new AppError('Produtor não pertence ao snapshot da contagem.', 400, 'ITEM_INCOMPATIVEL');
    const fornecedorId = fornRes.rows[0].id;
    for (const p of produtos) {
      const qtd = p.quantidade_contada !== undefined ? p.quantidade_contada : (p.qty_contagem ?? null);
      const upd = await client.query(
        `UPDATE contagem_itens
         SET quantidade_contada = $1, contado_em = CASE WHEN $1::integer IS NULL THEN NULL ELSE NOW() END
         WHERE contagem_fornecedor_id = $2 AND codigo = $4
           AND ($3::uuid IS NULL OR produto_id = $3)
         RETURNING id`,
        [qtd, fornecedorId, p.produto_id || null, p.codigo.trim()]
      );
      if (!upd.rows.length) throw new AppError('ID ou código não corresponde ao snapshot deste produtor.', 400, 'ITEM_INCOMPATIVEL');
    }
    await auditService.registrar(client, req.auditContext || {}, {
      empresaId: req.empresaId, atorId: req.usuario.id, atorPapel: req.usuario.papel,
      atorRotulo: req.usuario.email, acao: 'contagem_progresso_salvo', entidade: 'contagem', entidadeId: id,
      metadados: { tipo, fornecedor: fornecedor.trim(), itens_salvos: produtos.length },
      eventoChave: `progresso_${id}_${fornecedorId}`
    });
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: `Contagem do produtor '${fornecedor}' registrada com sucesso.`, data: { tipo, contagem_fornecedor_id: fornecedorId } });
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
 * @returns {Promise<void>}
 */
async function finalizar(req, res, next) {
  const client = await getClient();

  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const contagemCheck = await client.query(
      `SELECT id, tipo FROM contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento' FOR UPDATE`,
      [id, req.empresaId]
    );

    if (contagemCheck.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada ou já finalizada.',
        'CONTAGEM_NAO_ENCONTRADA'
      );
    }

    const tipo = contagemCheck.rows[0].tipo || 'geral';

    // Apura somente quantidades registradas; NULL permanece não contado.
    const itensRes = await client.query(
      tipo === 'pecas_queijo'
        ? `UPDATE contagem_itens AS ci
           SET diferenca = NULL, situacao = NULL
           FROM contagem_fornecedores AS cf
           WHERE ci.contagem_fornecedor_id = cf.id AND cf.contagem_id = $1
             AND ci.quantidade_contada IS NOT NULL
           RETURNING ci.contagem_fornecedor_id, ci.diferenca`
        : `UPDATE contagem_itens AS ci
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

    let totalVencidos = 0;
    let totalBaixado = 0;
    if (tipo === 'geral') {
      const vencidosRes = await client.query(
        `SELECT ci.id, ci.produto_id, ci.quantidade_vencida
         FROM contagem_itens ci
         JOIN contagem_fornecedores cf ON cf.id = ci.contagem_fornecedor_id
         WHERE cf.contagem_id = $1 AND ci.quantidade_contada IS NOT NULL AND ci.quantidade_vencida > 0
         ORDER BY ci.produto_id`, [id]
      );
      for (const item of vencidosRes.rows) {
        const quantidade = Number(item.quantidade_vencida);
        const produtoRes = await client.query(
          'SELECT estoque_atual FROM produtos WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
          [item.produto_id, req.empresaId]
        );
        if (produtoRes.rows.length !== 1 || produtoRes.rows[0].estoque_atual == null) {
          throw new AppError('Produto sem estoque elegível para baixa.', 409, 'PRODUTO_BAIXA_INDISPONIVEL');
        }
        const anterior = Number(produtoRes.rows[0].estoque_atual);
        const baixada = Math.min(quantidade, Math.max(anterior, 0));
        const saldo = Math.max(anterior - quantidade, 0);
        const atualizado = await client.query(
          'UPDATE produtos SET estoque_atual = $1, atualizado_em = NOW() WHERE id = $2 AND empresa_id = $3 RETURNING id',
          [saldo, item.produto_id, req.empresaId]
        );
        if (atualizado.rows.length !== 1) throw new AppError('Produto sem estoque elegível para baixa.', 409, 'PRODUTO_BAIXA_INDISPONIVEL');
        const historico = await client.query(
          'UPDATE contagem_itens SET estoque_antes_baixa_vencidos = $1, quantidade_vencida_baixada = $2 WHERE id = $3 RETURNING id',
          [anterior, baixada, item.id]
        );
        if (historico.rows.length !== 1) throw new AppError('Falha ao registrar baixa de vencidos.', 409, 'BAIXA_INCOMPLETA');
        totalVencidos += quantidade;
        totalBaixado += baixada;
      }
    }

    const fornecedoresComDiferenca = new Set(
      itensRes.rows.filter(item => tipo === 'geral' && Number(item.diferenca) !== 0).map(item => item.contagem_fornecedor_id)
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
       RETURNING id, tipo, iniciado_em, finalizado_em, tem_diferenca, status`,
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
      dadosNovos: { tipo, tem_diferenca: temDiferencaGlobal, total_itens: itensRes.rows.length, fornecedores_com_diferenca: fornecedoresComDiferenca.size, total_vencidos: totalVencidos, total_baixado: totalBaixado, total_nao_descontado: totalVencidos - totalBaixado },
      whitelistCampos: ['tipo', 'tem_diferenca', 'total_itens', 'fornecedores_com_diferenca', 'total_vencidos', 'total_baixado', 'total_nao_descontado'],
      eventoChave: `contagem_finalizada_${id}`
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: tipo === 'pecas_queijo' ? 'Contagem de peças finalizada com sucesso.' : 'Contagem finalizada com sucesso. Diferenças apuradas.',
      data: {
        contagem: serializeContagemDetalhe({ ...finalResult.rows[0], tipo, total_vencidos: totalVencidos }, [], req.usuario)
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
 * @returns {Promise<void>}
 */
async function listar(req, res, next) {
  try {
    const { page = 1, limit = 20, tipo, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const sql = `
      SELECT c.id, c.tipo, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
             u.nome AS iniciado_por_nome,
             (SELECT COALESCE(SUM(ci.quantidade_vencida), 0) FROM contagem_itens ci JOIN contagem_fornecedores cfv ON cfv.id = ci.contagem_fornecedor_id WHERE cfv.contagem_id = c.id AND ci.quantidade_contada IS NOT NULL) AS total_vencidos,
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
        AND ($4::varchar IS NULL OR c.tipo = $4)
        AND ($5::varchar IS NULL OR c.status = $5)
      GROUP BY c.id, u.nome
      ORDER BY c.iniciado_em DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [req.empresaId, limitNum, offset, tipo || null, status || null]);

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
 * @returns {Promise<void>}
 */
async function detalhe(req, res, next) {
  try {
    const { id } = req.params;
    const contagemRes = await query(
      `SELECT c.id, c.tipo, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status,
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
                   'quantidade_vencida', ci.quantidade_vencida,
                   'estoque_antes_baixa_vencidos', ci.estoque_antes_baixa_vencidos,
                   'quantidade_vencida_baixada', ci.quantidade_vencida_baixada,
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

async function semana(req, res, next) {
  try {
    res.json({ success: true, data: await obterCoberturaSemanal(req.empresaId) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  semana,
  iniciar,
  salvarProgresso,
  adicionarFornecedor,
  finalizar,
  listar,
  detalhe
};
