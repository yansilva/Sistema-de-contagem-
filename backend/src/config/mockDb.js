const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * In-Memory Mock Database Engine para Testes e Desenvolvimento
 * Fornece isolamento multi-tenant real e reflete o schema do PostgreSQL.
 */

const state = {
  empresas: [],
  usuarios: [],
  produtos: [],
  contagens: [],
  contagemFornecedores: [],
  contagemItens: [],
  historicoImportacaoEstoque: [],
  refreshTokens: [],
  auditLogs: []
};

function resetMockDb() {
  state.empresas = [];
  state.usuarios = [];
  state.produtos = [];
  state.contagens = [];
  state.contagemFornecedores = [];
  state.contagemItens = [];
  state.historicoImportacaoEstoque = [];
  state.refreshTokens = [];
  state.auditLogs = [];
}

async function executeMockQuery(sql, params = []) {
  const norm = sql.trim().replace(/\s+/g, ' ');

  // ===== EMPRESAS =====
  if (norm.startsWith('INSERT INTO empresas')) {
    const novaEmpresa = {
      id: crypto.randomUUID(),
      nome: params[0],
      email_contato: params[1],
      plano: params[2] || 'ativo',
      trial_expira_em: params[3] ? new Date(params[3]).toISOString() : null,
      criado_em: new Date().toISOString()
    };
    state.empresas.push(novaEmpresa);
    return {
      rows: [
        {
          id: novaEmpresa.id,
          nome: novaEmpresa.nome,
          plano: novaEmpresa.plano
        }
      ]
    };
  }

  if (norm.includes('FROM empresas')) {
    if (norm.includes('email_contato = $1')) {
      const email = String(params[0]).toLowerCase();
      const emp = state.empresas.find((e) => e.email_contato.toLowerCase() === email);
      return { rows: emp ? [emp] : [] };
    }
    if (norm.includes('WHERE id = $1')) {
      const emp = state.empresas.find((e) => e.id === params[0]);
      return {
        rows: emp
          ? [
              {
                id: emp.id,
                empresa_nome: emp.nome,
                nome: emp.nome,
                plano: emp.plano,
                trial_expira_em: emp.trial_expira_em
              }
            ]
          : []
      };
    }
  }

  // ===== USUARIOS =====
  if (norm.startsWith('INSERT INTO usuarios')) {
    const novoUsuario = {
      id: crypto.randomUUID(),
      empresa_id: params[0],
      nome: params[1],
      email: String(params[2]).toLowerCase(),
      senha_hash: params[3],
      papel: params[4] || 'funcionario',
      ativo: params[5] !== undefined ? Boolean(params[5]) : true,
      must_change_password: params[6] !== undefined ? Boolean(params[6]) : false,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    state.usuarios.push(novoUsuario);
    return {
      rows: [
        {
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          email: novoUsuario.email,
          papel: novoUsuario.papel,
          ativo: novoUsuario.ativo,
          must_change_password: novoUsuario.must_change_password,
          criado_em: novoUsuario.criado_em
        }
      ]
    };
  }

  // SELECT usuarios JOIN empresas
  if (norm.includes('FROM usuarios') && norm.includes('JOIN empresas')) {
    if (norm.includes('u.email = $1')) {
      const email = String(params[0]).toLowerCase();
      const user = state.usuarios.find((u) => u.email.toLowerCase() === email);
      if (!user) return { rows: [] };
      const emp = state.empresas.find((e) => e.id === user.empresa_id);
      return {
        rows: [
          {
            id: user.id,
            nome: user.nome,
            email: user.email,
            senha_hash: user.senha_hash,
            papel: user.papel,
            ativo: user.ativo !== false,
            must_change_password: Boolean(user.must_change_password),
            empresa_id: user.empresa_id,
            empresa_nome: emp ? emp.nome : 'Empresa',
            plano: emp ? emp.plano : 'ativo',
            trial_expira_em: emp ? emp.trial_expira_em : null
          }
        ]
      };
    }

    if (norm.includes('u.id = $1')) {
      const userId = params[0];
      const user = state.usuarios.find((u) => u.id === userId);
      if (!user) return { rows: [] };
      const emp = state.empresas.find((e) => e.id === user.empresa_id);
      return {
        rows: [
          {
            id: user.id,
            nome: user.nome,
            email: user.email,
            papel: user.papel,
            ativo: user.ativo !== false,
            must_change_password: Boolean(user.must_change_password),
            empresa_id: user.empresa_id,
            empresa_nome: emp ? emp.nome : 'Empresa',
            plano: emp ? emp.plano : 'ativo',
            trial_expira_em: emp ? emp.trial_expira_em : null
          }
        ]
      };
    }
  }

  // SELECT usuarios simples por email
  if (norm.includes('FROM usuarios WHERE email = $1') || norm.includes('FROM usuarios WHERE u.email = $1')) {
    const user = state.usuarios.find(
      (u) => u.email.toLowerCase() === String(params[0]).toLowerCase()
    );
    return { rows: user ? [user] : [] };
  }

  // SELECT usuarios simples por id
  if (norm.includes('FROM usuarios WHERE id = $1')) {
    const user = state.usuarios.find((u) => u.id === params[0]);
    return { rows: user ? [user] : [] };
  }

  // SELECT COUNT(*)::int AS total FROM usuarios WHERE empresa_id = $1 AND ativo = TRUE AND papel IN ...
  if (norm.includes('FROM usuarios WHERE empresa_id = $1 AND ativo = TRUE') && norm.includes('papel IN')) {
    const empresaId = params[0];
    const adminRoles = ['administrador', 'gestor', 'admin'];
    const count = state.usuarios.filter(
      (u) =>
        u.empresa_id === empresaId &&
        u.ativo !== false &&
        adminRoles.includes((u.papel || '').toLowerCase())
    ).length;
    return { rows: [{ total: count }] };
  }

  // SELECT usuarios da empresa (gestão de usuários)
  if (norm.includes('FROM usuarios WHERE empresa_id = $1') || norm.includes('SELECT id, nome, email, papel, ativo')) {
    const empresaId = params[0];
    let list = state.usuarios.filter((u) => u.empresa_id === empresaId);
    if (norm.includes('COUNT(*)::int')) {
      return { rows: [{ total: list.length }] };
    }
    return { rows: list };
  }

  // UPDATE usuarios (alterar senha ou status ou dados)
  if (norm.startsWith('UPDATE usuarios')) {
    if (norm.includes('SET senha_hash = $1, must_change_password = FALSE')) {
      const novoHash = params[0];
      const userId = params[1];
      const user = state.usuarios.find((u) => u.id === userId);
      if (user) {
        user.senha_hash = novoHash;
        user.must_change_password = false;
        user.atualizado_em = new Date().toISOString();
        return { rows: [user] };
      }
      return { rows: [] };
    }

    if (norm.includes('SET ativo = $1')) {
      const ativo = Boolean(params[0]);
      const userId = params[1];
      const empresaId = params[2];
      const user = state.usuarios.find((u) => u.id === userId && u.empresa_id === empresaId);
      if (user) {
        user.ativo = ativo;
        user.atualizado_em = new Date().toISOString();
        return { rows: [user] };
      }
      return { rows: [] };
    }

    if (norm.includes('SET senha_hash = $1, must_change_password = TRUE')) {
      const novoHash = params[0];
      const userId = params[1];
      const empresaId = params[2];
      const user = state.usuarios.find((u) => u.id === userId && u.empresa_id === empresaId);
      if (user) {
        user.senha_hash = novoHash;
        user.must_change_password = true;
        user.atualizado_em = new Date().toISOString();
        return { rows: [user] };
      }
      return { rows: [] };
    }

    if (norm.includes('WHERE id = $1 AND empresa_id = $2')) {
      const userId = params[0];
      const empresaId = params[1];
      const user = state.usuarios.find((u) => u.id === userId && u.empresa_id === empresaId);
      if (user) {
        if (norm.includes('papel = $')) {
          const match = norm.match(/papel = \$(\d+)/);
          if (match && params[parseInt(match[1], 10) - 1]) {
            user.papel = params[parseInt(match[1], 10) - 1];
          }
        }
        if (norm.includes('nome = $')) {
          const match = norm.match(/nome = \$(\d+)/);
          if (match && params[parseInt(match[1], 10) - 1]) {
            user.nome = params[parseInt(match[1], 10) - 1];
          }
        }
        user.atualizado_em = new Date().toISOString();
        return { rows: [user] };
      }
      return { rows: [] };
    }
  }

  // ===== REFRESH TOKENS =====
  if (norm.startsWith('INSERT INTO refresh_tokens')) {
    state.refreshTokens.push({
      id: crypto.randomUUID(),
      usuario_id: params[0],
      token_hash: params[1],
      expira_em: params[2],
      revogado: false
    });
    return { rows: [] };
  }

  if (norm.includes('FROM refresh_tokens rt')) {
    const tokenHash = params[0];
    const rt = state.refreshTokens.find((r) => r.token_hash === tokenHash);
    if (!rt) return { rows: [] };
    const user = state.usuarios.find((u) => u.id === rt.usuario_id);
    return {
      rows: [
        {
          id: rt.id,
          usuario_id: rt.usuario_id,
          revogado: rt.revogado,
          expira_em: rt.expira_em,
          empresa_id: user ? user.empresa_id : null,
          papel: user ? user.papel : 'funcionario',
          nome: user ? user.nome : '',
          email: user ? user.email : '',
          ativo: user ? user.ativo !== false : true,
          must_change_password: user ? Boolean(user.must_change_password) : false
        }
      ]
    };
  }

  if (norm.includes('UPDATE refresh_tokens SET revogado = TRUE')) {
    const target = params[0];
    state.refreshTokens.forEach((r) => {
      if (r.token_hash === target || r.usuario_id === target || r.id === target) {
        r.revogado = true;
      }
    });
    return { rows: [] };
  }

  if (norm.startsWith('DELETE FROM refresh_tokens')) {
    const userId = params[0];
    state.refreshTokens = state.refreshTokens.filter((r) => r.usuario_id !== userId);
    return { rows: [] };
  }

  // ===== PRODUTOS =====
  if (norm.includes('SELECT DISTINCT fornecedor FROM produtos')) {
    const empresaId = params[0];
    const forns = [
      ...new Set(
        state.produtos.filter((p) => p.empresa_id === empresaId && p.ativo).map((p) => p.fornecedor)
      )
    ].sort();
    return { rows: forns.map((f) => ({ fornecedor: f })) };
  }

  if (norm.includes('SELECT COUNT(*)::int AS total FROM produtos')) {
    const empresaId = params[0];
    const total = state.produtos.filter((p) => p.empresa_id === empresaId && p.ativo).length;
    return { rows: [{ total }] };
  }

  if (norm.includes('FROM produtos') && norm.includes('SELECT id, codigo, nome, fornecedor')) {
    const empresaId = params[0];
    let list = state.produtos.filter((p) => p.empresa_id === empresaId && p.ativo);
    return { rows: list };
  }

  if (norm.startsWith('INSERT INTO produtos')) {
    const novo = {
      id: crypto.randomUUID(),
      empresa_id: params[0],
      codigo: params[1],
      nome: params[2],
      fornecedor: params[3],
      estoque_atual: params[4] !== undefined ? parseInt(params[4], 10) : 0,
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    state.produtos.push(novo);
    return { rows: [novo] };
  }

  if (norm.startsWith('UPDATE produtos') && norm.includes('SET estoque_atual = $1')) {
    const estoque = parseInt(params[0], 10) || 0;
    const empresaId = params[1];
    const codigo = params[2];
    const prod = state.produtos.find(
      (p) => p.empresa_id === empresaId && p.codigo.toUpperCase() === codigo.toUpperCase() && p.ativo
    );
    if (prod) {
      prod.estoque_atual = estoque;
      prod.atualizado_em = new Date().toISOString();
      return { rows: [prod] };
    }
    return { rows: [] };
  }

  if (norm.startsWith('UPDATE produtos SET ativo = FALSE')) {
    const id = params[0];
    const prod = state.produtos.find((p) => p.id === id);
    if (prod) {
      prod.ativo = false;
      return { rows: [{ id }] };
    }
    return { rows: [] };
  }

  if (norm.startsWith('UPDATE produtos') && norm.includes('WHERE id = $1 AND empresa_id = $2')) {
    const id = params[0];
    const empresaId = params[1];
    const prod = state.produtos.find((p) => p.id === id && p.empresa_id === empresaId);
    if (prod) {
      return { rows: [prod] };
    }
    return { rows: [] };
  }

  // ===== HISTORICO IMPORTACAO ESTOQUE =====
  if (norm.startsWith('INSERT INTO historico_importacao_estoque')) {
    const hist = {
      id: crypto.randomUUID(),
      empresa_id: params[0],
      usuario_id: params[1],
      nome_arquivo: params[2],
      produtos_encontrados: params[3] || 0,
      produtos_atualizados: params[4] || 0,
      skus_nao_encontrados: params[5] || '[]',
      linhas_ignoradas: params[6] || 0,
      status: params[7] || 'concluido',
      criado_em: new Date().toISOString()
    };
    state.historicoImportacaoEstoque.push(hist);
    return { rows: [hist] };
  }

  if (norm.includes('FROM historico_importacao_estoque')) {
    const empresaId = params[0];
    const list = state.historicoImportacaoEstoque
      .filter((h) => h.empresa_id === empresaId)
      .map((h) => {
        const u = state.usuarios.find((user) => user.id === h.usuario_id);
        return {
          ...h,
          usuario_nome: u ? u.nome : 'Administrador'
        };
      });
    return { rows: list };
  }

  // ===== CONTAGENS =====
  if (norm.startsWith('INSERT INTO contagens')) {
    const nova = {
      id: crypto.randomUUID(),
      empresa_id: params[0],
      iniciado_por: params[1],
      status: 'em_andamento',
      tem_diferenca: false,
      iniciado_em: new Date().toISOString(),
      finalizado_em: null
    };
    state.contagens.push(nova);
    return { rows: [nova] };
  }

  if (norm.startsWith('INSERT INTO contagem_fornecedores')) {
    const forn = {
      id: crypto.randomUUID(),
      contagem_id: params[0],
      fornecedor: params[1],
      tem_diferenca: false,
      contado_em: new Date().toISOString()
    };
    state.contagemFornecedores.push(forn);
    return { rows: [forn] };
  }

  if (norm.startsWith('INSERT INTO contagem_itens')) {
    const item = {
      id: crypto.randomUUID(),
      contagem_fornecedor_id: params[0],
      produto_id: params[1],
      codigo: params[2],
      nome: params[3],
      estoque_referencia: params[4] !== undefined ? params[4] : 0,
      quantidade_contada: params[5] !== undefined ? params[5] : null,
      diferenca: params[6] !== undefined ? params[6] : null,
      situacao: params[7] !== undefined ? params[7] : null,
      contado_em: null
    };
    state.contagemItens.push(item);
    return { rows: [item] };
  }

  // SELECT contagens WHERE id = $1 AND empresa_id = $2 AND status = 'em_andamento'
  if (norm.includes('FROM contagens') && norm.includes("status = 'em_andamento'")) {
    const id = params[0];
    const empresaId = params[1];
    const c = state.contagens.find((x) => x.id === id && x.empresa_id === empresaId && x.status === 'em_andamento');
    return { rows: c ? [c] : [] };
  }

  // SELECT contagem_fornecedores WHERE contagem_id = $1 AND fornecedor = $2
  if (norm.includes('FROM contagem_fornecedores WHERE contagem_id = $1 AND fornecedor = $2')) {
    const contagemId = params[0];
    const fornecedor = params[1];
    const f = state.contagemFornecedores.find((x) => x.contagem_id === contagemId && x.fornecedor === fornecedor);
    return { rows: f ? [f] : [] };
  }

  // UPDATE contagem_itens
  if (norm.startsWith('UPDATE contagem_itens SET quantidade_contada = $1, contado_em = NOW()')) {
    const qtd = params[0];
    const fornId = params[1];
    const prodId = params[2];
    const item = state.contagemItens.find((i) => i.contagem_fornecedor_id === fornId && i.produto_id === prodId);
    if (item) {
      item.quantidade_contada = qtd;
      item.contado_em = new Date().toISOString();
      return { rows: [item] };
    }
    return { rows: [] };
  }

  // SELECT ci.id, ci.contagem_fornecedor_id, ci.estoque_referencia, ci.quantidade_contada FROM contagem_itens
  if (norm.includes('FROM contagem_itens ci JOIN contagem_fornecedores cf ON cf.id = ci.contagem_fornecedor_id')) {
    const contagemId = params[0];
    const fornIds = state.contagemFornecedores.filter((f) => f.contagem_id === contagemId).map((f) => f.id);
    const itens = state.contagemItens.filter((i) => fornIds.includes(i.contagem_fornecedor_id));
    return { rows: itens };
  }

  if (norm.startsWith('UPDATE contagem_itens SET quantidade_contada = $1, diferenca = $2, situacao = $3 WHERE id = $4')) {
    const qtd = params[0];
    const dif = params[1];
    const sit = params[2];
    const itemId = params[3];
    const item = state.contagemItens.find((i) => i.id === itemId);
    if (item) {
      item.quantidade_contada = qtd;
      item.diferenca = dif;
      item.situacao = sit;
      return { rows: [item] };
    }
    return { rows: [] };
  }

  if (norm.startsWith('UPDATE contagens SET status = \'finalizada\'')) {
    const temDif = params[0];
    const id = params[1];
    const c = state.contagens.find((x) => x.id === id);
    if (c) {
      c.status = 'finalizada';
      c.finalizado_em = new Date().toISOString();
      c.tem_diferenca = temDif;
      return { rows: [c] };
    }
    return { rows: [] };
  }

  // SELECT contagens detalhe
  if (norm.includes('SELECT c.id, c.iniciado_em, c.finalizado_em, c.tem_diferenca, c.status') && norm.includes('FROM contagens c')) {
    const id = params[0];
    const empresaId = params[1];
    const c = state.contagens.find((x) => x.id === id && x.empresa_id === empresaId);
    if (!c) return { rows: [] };
    const u = state.usuarios.find((user) => user.id === c.iniciado_por);
    return {
      rows: [
        {
          ...c,
          iniciado_por_nome: u ? u.nome : 'Administrador'
        }
      ]
    };
  }

  // SELECT cf.id, cf.fornecedor, cf.tem_diferenca, cf.contado_em, COALESCE(json_agg(...) FROM contagem_fornecedores cf
  if (norm.includes('FROM contagem_fornecedores cf LEFT JOIN contagem_itens ci')) {
    const contagemId = params[0];
    const forns = state.contagemFornecedores.filter((f) => f.contagem_id === contagemId);
    const rows = forns.map((f) => {
      const itens = state.contagemItens.filter((i) => i.contagem_fornecedor_id === f.id);
      return {
        id: f.id,
        fornecedor: f.fornecedor,
        tem_diferenca: f.tem_diferenca,
        contado_em: f.contado_em,
        produtos: itens.map((i) => ({
          id: i.id,
          produto_id: i.produto_id,
          codigo: i.codigo,
          nome: i.nome,
          quantidade_contada: i.quantidade_contada,
          contado_em: i.contado_em,
          estoque_referencia: i.estoque_referencia,
          diferenca: i.diferenca,
          situacao: i.situacao
        }))
      };
    });
    return { rows };
  }

  // ===== AUDIT_LOGS =====
  if (norm.startsWith('INSERT INTO audit_logs')) {
    const log = {
      id: crypto.randomUUID(),
      escopo: params[0],
      empresa_id: params[1],
      ator_tipo: params[2],
      ator_id: params[3],
      ator_papel: params[4],
      ator_rotulo: params[5],
      acao: params[6],
      entidade: params[7],
      entidade_id: params[8],
      resultado: params[9],
      dados_anteriores: params[10] ? JSON.parse(params[10]) : null,
      dados_novos: params[11] ? JSON.parse(params[11]) : null,
      metadados: params[12] ? JSON.parse(params[12]) : {},
      motivo: params[13],
      codigo_erro: params[14],
      ip: params[15],
      user_agent: params[16],
      request_id: params[17],
      operacao_id: params[18],
      evento_chave: params[19],
      criado_em: new Date().toISOString()
    };
    // Verificar unicidade (operacao_id, evento_chave)
    const dup = state.auditLogs.find(
      (l) => l.operacao_id === log.operacao_id && l.evento_chave === log.evento_chave
    );
    if (dup) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = '23505';
      throw err;
    }
    state.auditLogs.push(log);
    return { rows: [{ id: log.id, criado_em: log.criado_em }] };
  }

  if (norm.includes('FROM audit_logs')) {
    // Busca por ID específico
    if (norm.includes('WHERE id = $1') || norm.includes('WHERE id = $')) {
      const targetId = params[0];
      const found = state.auditLogs.find((l) => l.id === targetId);
      return { rows: found ? [found] : [] };
    }

    let logs = [...state.auditLogs];

    // Se houver filtros parametrizados
    if (params && params.length > 0) {
      if (norm.includes('empresa_id = $')) {
        const m = norm.match(/empresa_id = \$(\d+)/);
        if (m) {
          const empId = params[parseInt(m[1], 10) - 1];
          logs = logs.filter((l) => l.empresa_id === empId);
        }
      }
      if (norm.includes('criado_em >= $')) {
        const m = norm.match(/criado_em >= \$(\d+)/);
        if (m) {
          const d = new Date(params[parseInt(m[1], 10) - 1]);
          logs = logs.filter((l) => new Date(l.criado_em) >= d);
        }
      }
      if (norm.includes('criado_em <= $')) {
        const m = norm.match(/criado_em <= \$(\d+)/);
        if (m) {
          const d = new Date(params[parseInt(m[1], 10) - 1]);
          logs = logs.filter((l) => new Date(l.criado_em) <= d);
        }
      }
      if (norm.includes('ator_id = $')) {
        const m = norm.match(/ator_id = \$(\d+)/);
        if (m) {
          const atId = params[parseInt(m[1], 10) - 1];
          logs = logs.filter((l) => l.ator_id === atId);
        }
      }
      if (norm.includes('acao = $')) {
        const m = norm.match(/acao = \$(\d+)/);
        if (m) {
          const ac = params[parseInt(m[1], 10) - 1];
          logs = logs.filter((l) => l.acao === ac);
        }
      }
      if (norm.includes('entidade = $')) {
        const m = norm.match(/entidade = \$(\d+)/);
        if (m) {
          const ent = params[parseInt(m[1], 10) - 1];
          logs = logs.filter((l) => l.entidade === ent);
        }
      }
      if (norm.includes('resultado = $')) {
        const m = norm.match(/resultado = \$(\d+)/);
        if (m) {
          const res = params[parseInt(m[1], 10) - 1];
          logs = logs.filter((l) => l.resultado === res);
        }
      }
      if (norm.includes('ILIKE $')) {
        const m = norm.match(/ILIKE \$(\d+)/);
        if (m) {
          const term = String(params[parseInt(m[1], 10) - 1]).replace(/%/g, '').toLowerCase();
          logs = logs.filter(
            (l) =>
              (l.ator_rotulo && l.ator_rotulo.toLowerCase().includes(term)) ||
              (l.acao && l.acao.toLowerCase().includes(term)) ||
              (l.motivo && l.motivo.toLowerCase().includes(term))
          );
        }
      }
    }

    if (norm.includes('COUNT(*)')) {
      return { rows: [{ total: logs.length }] };
    }

    logs.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

    // LIMIT e OFFSET
    if (norm.includes('LIMIT $') && norm.includes('OFFSET $')) {
      const matchLimit = norm.match(/LIMIT \$(\d+) OFFSET \$(\d+)/);
      if (matchLimit) {
        const limitVal = Number(params[parseInt(matchLimit[1], 10) - 1]);
        const offsetVal = Number(params[parseInt(matchLimit[2], 10) - 1]);
        logs = logs.slice(offsetVal, offsetVal + limitVal);
      }
    } else if (norm.includes('LIMIT 5000')) {
      logs = logs.slice(0, 5000);
    }

    return { rows: logs };
  }

  // Fallback genérico para BEGIN, COMMIT, ROLLBACK
  return { rows: [] };
}

class MockClient {
  async query(text, params) {
    return executeMockQuery(text, params);
  }
  release() {}
}

module.exports = {
  executeMockQuery,
  query: executeMockQuery,
  getClient: () => new MockClient(),
  getMockClient: () => new MockClient(),
  state,
  resetMockDb
};
