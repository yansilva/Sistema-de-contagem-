const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * In-Memory Mock Database Engine para modo Demonstração / Portfolio
 * Ativado automaticamente quando não há PostgreSQL local ativo.
 */

const DEMO_EMPRESA_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const DEMO_USER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const state = {
  empresas: [
    {
      id: DEMO_EMPRESA_ID,
      nome: 'Loja Demo',
      email_contato: 'contato@lojademo.com',
      plano: 'trial',
      trial_expira_em: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      criado_em: new Date().toISOString()
    }
  ],
  usuarios: [
    {
      id: DEMO_USER_ID,
      empresa_id: DEMO_EMPRESA_ID,
      nome: 'Admin Demo',
      email: 'admin@demo.com',
      senha_hash: bcrypt.hashSync('AdminDemo@2026!', 10),
      papel: 'gestor',
      ativo: true,
      criado_em: new Date().toISOString()
    }
  ],
  produtos: [
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '001',
      nome: 'Camiseta Básica Branca',
      fornecedor: 'Têxtil Sul',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '002',
      nome: 'Camiseta Básica Preta',
      fornecedor: 'Têxtil Sul',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '003',
      nome: 'Calça Jeans Slim',
      fornecedor: 'Têxtil Sul',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '010',
      nome: 'Tênis Runner Pro',
      fornecedor: 'Calçados Express',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '011',
      nome: 'Sandália Comfort Flex',
      fornecedor: 'Calçados Express',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '020',
      nome: 'Mochila Urban 30L',
      fornecedor: 'Acessórios Prime',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '021',
      nome: 'Boné Snapback Classic',
      fornecedor: 'Acessórios Prime',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      empresa_id: DEMO_EMPRESA_ID,
      codigo: '022',
      nome: 'Óculos de Sol Aviador',
      fornecedor: 'Acessórios Prime',
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }
  ],
  contagens: [],
  fornecedoresContagem: [],
  itensContagem: [],
  refreshTokens: []
};

async function executeMockQuery(sql, params = []) {
  const norm = sql.trim().replace(/\s+/g, ' ');

  // 1. SELECT empresas (guest ou por email/id/nome)
  if (norm.includes('FROM empresas')) {
    if (
      norm.includes('email_contato =') ||
      norm.includes("nome = 'Loja Demo'") ||
      norm.includes('LIMIT 1')
    ) {
      const emp = state.empresas[0];
      return { rows: [emp] };
    }
    if (norm.includes('WHERE id = $1')) {
      const emp = state.empresas.find((e) => e.id === params[0]) || state.empresas[0];
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

  // 2. SELECT usuarios JOIN empresas
  if (norm.includes('FROM usuarios') && norm.includes('JOIN empresas')) {
    if (norm.includes('u.email = $1')) {
      const email = String(params[0]).toLowerCase();
      const user = state.usuarios.find((u) => u.email.toLowerCase() === email);
      if (!user) return { rows: [] };
      const emp = state.empresas.find((e) => e.id === user.empresa_id) || state.empresas[0];
      return {
        rows: [
          {
            id: user.id,
            nome: user.nome,
            email: user.email,
            senha_hash: user.senha_hash,
            papel: user.papel,
            empresa_id: emp.id,
            empresa_nome: emp.nome,
            plano: emp.plano,
            trial_expira_em: emp.trial_expira_em
          }
        ]
      };
    }
    if (norm.includes('u.id = $1')) {
      const userId = params[0];
      const user = state.usuarios.find((u) => u.id === userId) || state.usuarios[0];
      if (!user) return { rows: [] };
      const emp = state.empresas.find((e) => e.id === user.empresa_id) || state.empresas[0];
      return {
        rows: [
          {
            id: user.id,
            nome: user.nome,
            email: user.email,
            papel: user.papel,
            empresa_id: emp.id,
            empresa_nome: emp.nome,
            plano: emp.plano,
            trial_expira_em: emp.trial_expira_em
          }
        ]
      };
    }
  }

  // 3. SELECT usuarios simples
  if (norm.includes('FROM usuarios') && norm.includes('WHERE email = $1')) {
    const user = state.usuarios.find(
      (u) => u.email.toLowerCase() === String(params[0]).toLowerCase()
    );
    return { rows: user ? [user] : [] };
  }

  // 4. INSERT INTO refresh_tokens
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

  // 5. SELECT refresh_tokens
  if (norm.includes('FROM refresh_tokens rt')) {
    const tokenHash = params[0];
    const rt = state.refreshTokens.find((r) => r.token_hash === tokenHash && !r.revogado);
    if (!rt) return { rows: [] };
    const user = state.usuarios.find((u) => u.id === rt.usuario_id) || state.usuarios[0];
    return {
      rows: [
        {
          id: rt.id,
          usuario_id: rt.usuario_id,
          revogado: rt.revogado,
          expira_em: rt.expira_em,
          empresa_id: user.empresa_id,
          papel: user.papel,
          nome: user.nome,
          email: user.email
        }
      ]
    };
  }

  // 6. UPDATE refresh_tokens (revogar)
  if (norm.includes('UPDATE refresh_tokens SET revogado = TRUE')) {
    const target = params[0];
    state.refreshTokens.forEach((r) => {
      if (r.token_hash === target || r.usuario_id === target) r.revogado = true;
    });
    return { rows: [] };
  }

  // 7. PRODUTOS - Fornecedores únicos
  if (norm.includes('SELECT DISTINCT fornecedor FROM produtos')) {
    const empresaId = params[0];
    const forns = [
      ...new Set(
        state.produtos.filter((p) => p.empresa_id === empresaId && p.ativo).map((p) => p.fornecedor)
      )
    ].sort();
    return { rows: forns.map((f) => ({ fornecedor: f })) };
  }

  // 8. PRODUTOS - Count
  if (norm.includes('SELECT COUNT(*)::int AS total FROM produtos')) {
    const empresaId = params[0];
    const total = state.produtos.filter((p) => p.empresa_id === empresaId && p.ativo).length;
    return { rows: [{ total }] };
  }

  // 9. PRODUTOS - Listagem
  if (norm.includes('FROM produtos') && norm.includes('SELECT id, codigo, nome, fornecedor')) {
    const empresaId = params[0];
    let list = state.produtos.filter((p) => p.empresa_id === empresaId && p.ativo);
    return { rows: list };
  }

  // 10. PRODUTOS - Criar
  if (norm.startsWith('INSERT INTO produtos')) {
    const novo = {
      id: crypto.randomUUID(),
      empresa_id: params[0],
      codigo: params[1],
      nome: params[2],
      fornecedor: params[3],
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };
    state.produtos.push(novo);
    return { rows: [novo] };
  }

  // 11. PRODUTOS - Editar
  if (norm.startsWith('UPDATE produtos') && norm.includes('WHERE id =')) {
    const id = params[3];
    const prod = state.produtos.find((p) => p.id === id);
    if (prod) {
      if (params[0]) prod.codigo = params[0];
      if (params[1]) prod.nome = params[1];
      if (params[2]) prod.fornecedor = params[2];
      prod.atualizado_em = new Date().toISOString();
      return { rows: [prod] };
    }
    return { rows: [] };
  }

  // 12. PRODUTOS - Desativar
  if (norm.startsWith('UPDATE produtos SET ativo = FALSE')) {
    const id = params[0];
    const prod = state.produtos.find((p) => p.id === id);
    if (prod) {
      prod.ativo = false;
      return { rows: [{ id }] };
    }
    return { rows: [] };
  }

  // 13. CONTAGENS - Listar ativas
  if (norm.includes('FROM contagens c') && norm.includes("c.status = 'em_andamento'")) {
    const empresaId = params[0];
    const ativas = state.contagens.filter(
      (c) => c.empresa_id === empresaId && c.status === 'em_andamento'
    );
    return { rows: ativas };
  }

  // 14. CONTAGENS - Iniciar nova contagem
  if (norm.startsWith('INSERT INTO contagens')) {
    const numero = state.contagens.length + 1;
    const nova = {
      id: crypto.randomUUID(),
      empresa_id: params[0],
      usuario_id: params[1],
      numero,
      status: 'em_andamento',
      tem_diferenca: false,
      criado_em: new Date().toISOString(),
      finalizado_em: null
    };
    state.contagens.push(nova);
    return { rows: [nova] };
  }

  // 15. CONTAGENS - Adicionar fornecedor à contagem
  if (norm.startsWith('INSERT INTO fornecedores_contagem')) {
    const forn = {
      id: crypto.randomUUID(),
      contagem_id: params[0],
      fornecedor: params[1],
      status: 'pendente'
    };
    state.fornecedoresContagem.push(forn);
    return { rows: [forn] };
  }

  // 16. CONTAGENS - Obter fornecedores de uma contagem
  if (norm.includes('FROM fornecedores_contagem fc') && norm.includes('fc.contagem_id = $1')) {
    const contagemId = params[0];
    const list = state.fornecedoresContagem.filter((f) => f.contagem_id === contagemId);
    return {
      rows: list.map((f) => ({
        ...f,
        total_produtos: state.produtos.filter((p) => p.fornecedor === f.fornecedor && p.ativo)
          .length,
        total_contados: 0,
        tem_divergencia: false
      }))
    };
  }

  // 17. CONTAGENS - Histórico
  if (norm.includes('FROM contagens c') && norm.includes("c.status = 'finalizada'")) {
    const empresaId = params[0];
    const hist = state.contagens.filter(
      (c) => c.empresa_id === empresaId && c.status === 'finalizada'
    );
    return {
      rows: hist.map((c) => ({
        ...c,
        usuario_nome: 'Admin Demo',
        fornecedores_resumo: 'Todos',
        total_divergencias: 0
      }))
    };
  }

  // Default fallback for transactions / miscellaneous
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
  getMockClient: () => new MockClient(),
  state
};
