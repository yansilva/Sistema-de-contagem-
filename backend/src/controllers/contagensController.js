const { query, getClient } = require('../config/db');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../errors/AppError');

/**
 * Helper para verificar se usuário é administrador
 */
function isAdministrador(usuario) {
  const p = (usuario.papel || '').toLowerCase();
  return p === 'administrador' || p === 'gestor' || p === 'admin';
}

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

    // 4. Criar registros de fornecedores e itens com o snapshot de estoque_referencia
    for (const [fornecedor, prods] of mapaFornecedores.entries()) {
      const fornRes = await client.query(
        `INSERT INTO contagem_fornecedores (contagem_id, fornecedor, tem_diferenca)
         VALUES ($1, $2, FALSE)
         RETURNING id`,
        [contagem.id, fornecedor]
      );
      const fornecedorId = fornRes.rows[0].id;

      for (const prod of prods) {
        await client.query(
          `INSERT INTO contagem_itens
           (contagem_fornecedor_id, produto_id, codigo, nome, estoque_referencia, quantidade_contada, diferenca, situacao)
           VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL)`,
          [
            fornecedorId,
            prod.id,
            prod.codigo,
            prod.nome,
            prod.estoque_atual || 0 // Snapshot imutável
          ]
        );
      }
    }

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
         SET quantidade_contada = $1, contado_em = NOW()
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
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [fornecedorId, p.id, p.codigo, p.nome, p.estoque_atual || 0, qtd]
          );
          itensSalvos++;
        }
      }
    }

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
         SET quantidade_contada = $1, contado_em = NOW()
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

    const contagemCheck = await client.query(
      `SELECT id FROM contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'`,
      [id, req.empresaId]
    );

    if (contagemCheck.rows.length === 0) {
      throw new NotFoundError(
        'Contagem não encontrada ou já finalizada.',
        'CONTAGEM_NAO_ENCONTRADA'
      );
    }

    await client.query('BEGIN');

    // Buscar todos os itens da contagem
    const itensRes = await client.query(
      `SELECT ci.id, ci.contagem_fornecedor_id, ci.estoque_referencia, ci.quantidade_contada
       FROM contagem_itens ci
       JOIN contagem_fornecedores cf ON cf.id = ci.contagem_fornecedor_id
       WHERE cf.contagem_id = $1`,
      [id]
    );

    if (itensRes.rows.length === 0) {
      throw new ValidationError(
        'Nenhum item foi encontrado nesta contagem.',
        'SEM_ITENS'
      );
    }

    let temDiferencaGlobal = false;
    const fornecedoresComDiferenca = new Set();

    for (const item of itensRes.rows) {
      // Regra: se quantidade_contada for null (não contado), considera como 0 na apuração final
      const qtdContada = item.quantidade_contada === null ? 0 : item.quantidade_contada;
      const ref = item.estoque_referencia;
      const diferenca = qtdContada - ref;

      let situacao = 'sem_diferenca';
      if (diferenca > 0) {
        situacao = 'sobra';
        temDiferencaGlobal = true;
        fornecedoresComDiferenca.add(item.contagem_fornecedor_id);
      } else if (diferenca < 0) {
        situacao = 'falta';
        temDiferencaGlobal = true;
        fornecedoresComDiferenca.add(item.contagem_fornecedor_id);
      }

      await client.query(
        `UPDATE contagem_itens
         SET quantidade_contada = $1, diferenca = $2, situacao = $3
         WHERE id = $4`,
        [qtdContada, diferenca, situacao, item.id]
      );
    }

    // Atualizar flags de fornecedores
    for (const fornId of fornecedoresComDiferenca) {
      await client.query(
        `UPDATE contagem_fornecedores SET tem_diferenca = TRUE WHERE id = $1`,
        [fornId]
      );
    }

    // Finalizar contagem
    const finalResult = await client.query(
      `UPDATE contagens
       SET status = 'finalizada', finalizado_em = NOW(), tem_diferenca = $1
       WHERE id = $2
       RETURNING id, iniciado_em, finalizado_em, tem_diferenca, status`,
      [temDiferencaGlobal, id]
    );

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
      WHERE c.empresa_id = $1
      GROUP BY c.id, u.nome
      ORDER BY c.iniciado_em DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [req.empresaId, limitNum, offset]);

    res.json({
      success: true,
      data: {
        contagens: result.rows
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
 *    - Funcionário: Vê SOMENTE produto, quantidade_contada, diferenca, situacao.
 *                   NUNCA vê estoque_referencia!
 *    - Administrador: Vê visão completa com estoque_referencia, diferenca e situacao.
 */
async function detalhe(req, res, next) {
  try {
    const { id } = req.params;
    const admin = isAdministrador(req.usuario);

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
      WHERE cf.contagem_id = $1
      GROUP BY cf.id
      ORDER BY cf.fornecedor ASC
    `;

    const fornecedoresRes = await query(sql, [id]);

    // Sanitizar campos conforme RBAC e status (Blind Count Protection)
    const fornecedoresSanitizados = fornecedoresRes.rows.map((forn) => {
      const produtosSanitizados = forn.produtos.map((p) => {
        // Base para todos
        const base = {
          id: p.id,
          produto_id: p.produto_id,
          codigo: p.codigo,
          nome: p.nome,
          quantidade_contada: p.quantidade_contada,
          contado_em: p.contado_em
        };

        // Compatibilidade de campos
        base.qty_contagem = p.quantidade_contada || 0;

        if (!isFinalizada) {
          // Durante a contagem: NENHUM usuário (nem funcionário) vê estoque de referência nem diferenças parciais
          if (admin) {
            // Admin pode ver estoque_referencia se quiser, mas funcionário NUNCA
            base.estoque_referencia = p.estoque_referencia;
          }
          return base;
        }

        // Se finalizada:
        if (admin) {
          // Admin vê tudo
          return {
            ...base,
            estoque_referencia: p.estoque_referencia,
            diferenca: p.diferenca,
            situacao: p.situacao,
            sem_diferenca: p.diferenca === 0
          };
        }

        // Funcionário após finalização: VÊ SOMENTE a diferença e a situação. NUNCA estoque_referencia!
        return {
          ...base,
          diferenca: p.diferenca,
          situacao: p.situacao,
          sem_diferenca: p.diferenca === 0
        };
      });

      return {
        ...forn,
        produtos: produtosSanitizados
      };
    });

    res.json({
      success: true,
      data: {
        contagem: {
          ...contagem,
          fornecedores: fornecedoresSanitizados
        }
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
