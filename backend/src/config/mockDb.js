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
  auditLogs: [],
  sessoesAuditoria: []
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
  state.sessoesAuditoria = [];
}

async function executeMockQuery(sql, params = []) {
  const norm = sql.trim().replace(/\s+/g, ' ');

  if (norm.startsWith('WITH referencia AS')) {
    const clientes = state.empresas.filter((e) => (e.tipo || 'cliente') === 'cliente' && !e.excluida_em);
    const ids = new Set(clientes.map((e) => e.id));
    const usuarios = state.usuarios.filter((u) => ids.has(u.empresa_id));
    const contagens = state.contagens.filter((c) => ids.has(c.empresa_id));
    const agora = new Date();
    const seteDias = new Date(agora.getTime() - 7 * 86400000);
    return { rows: [{
      total_empresas: clientes.length,
      ativas: clientes.filter((e) => (e.status || 'ativa') === 'ativa').length,
      inativas: clientes.filter((e) => e.status === 'inativa').length,
      total_usuarios: usuarios.length,
      usuarios_ativos: usuarios.filter((u) => u.ativo !== false).length,
      total_admins: usuarios.filter((u) => ['administrador', 'gestor', 'admin'].includes(u.papel)).length,
      total_produtos: state.produtos.filter((p) => ids.has(p.empresa_id) && p.ativo !== false).length,
      total_contagens: contagens.length,
      contagens_finalizadas: contagens.filter((c) => c.status === 'finalizada').length,
      contagens_recentes: contagens.filter((c) => c.status === 'finalizada' && c.finalizado_em && new Date(c.finalizado_em) >= seteDias && new Date(c.finalizado_em) <= agora).length,
      empresas_recentes: clientes.slice().sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0, 5),
      atividades_recentes: state.auditLogs.filter((l) => ids.has(l.empresa_afetada_id || l.empresa_id)).slice().sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0, 5),
      gerado_em: agora.toISOString()
    }] };
  }

  // ===== EMPRESAS =====
  if (norm.startsWith('INSERT INTO empresas')) {
    const novaEmpresa = {
      id: crypto.randomUUID(),
      nome: params[0],
      email_contato: params[1],
      plano: params[2] || 'ativo',
      status: 'ativa',
      tipo: norm.includes("'plataforma'") ? 'plataforma' : 'cliente',
      trial_expira_em: params[3] ? new Date(params[3]).toISOString() : null,
      excluida_em: null,
      excluida_por: null,
      motivo_exclusao: null,
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

  if (norm.startsWith('SELECT') && norm.includes('FROM empresas')) {
    if (norm.startsWith('SELECT e.*') && norm.includes('WHERE e.id=$1')) {
      const emp = state.empresas.find((e) => e.id === params[0]);
      if (!emp) return { rows: [] };
      return { rows: [{
        ...emp,
        total_usuarios: state.usuarios.filter((u) => u.empresa_id === emp.id).length,
        total_produtos: state.produtos.filter((p) => p.empresa_id === emp.id && p.ativo !== false).length,
        total_contagens: state.contagens.filter((c) => c.empresa_id === emp.id).length
      }] };
    }
    if (norm.startsWith('SELECT count(*)::int AS total FROM empresas e')) {
      let empresas = [...state.empresas];
      if (norm.includes("e.tipo = $")) empresas = empresas.filter((e) => (e.tipo || 'cliente') === params[0]);
      if (norm.includes('e.excluida_em IS NULL')) empresas = empresas.filter((e) => !e.excluida_em);
      if (norm.includes('e.excluida_em IS NOT NULL')) empresas = empresas.filter((e) => Boolean(e.excluida_em));
      return { rows: [{ total: empresas.length }] };
    }
    if (norm.includes('email_contato = $1 AND id != $2')) {
      const email = String(params[0]).toLowerCase();
      const id = params[1];
      const emp = state.empresas.find(
        (e) => e.email_contato.toLowerCase() === email && e.id !== id
      );
      return { rows: emp ? [emp] : [] };
    }
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
                email_contato: emp.email_contato,
                plano: emp.plano,
                status: emp.status || 'ativa',
                tipo: emp.tipo || 'cliente',
                excluida_em: emp.excluida_em || null,
                excluida_por: emp.excluida_por || null,
                motivo_exclusao: emp.motivo_exclusao || null,
                trial_expira_em: emp.trial_expira_em,
                criado_em: emp.criado_em
              }
            ]
          : []
      };
    }
    if (norm.includes('FROM empresas e') && norm.includes('AS total_usuarios') && norm.includes('AS total_produtos')) {
      let empresas = [...state.empresas];
      if (norm.includes("e.tipo = $")) empresas = empresas.filter((e) => (e.tipo || 'cliente') === params[0]);
      if (norm.includes('e.excluida_em IS NULL')) empresas = empresas.filter((e) => !e.excluida_em);
      const rows = empresas.map((e) => {
        const totalUsuarios = state.usuarios.filter((u) => u.empresa_id === e.id && u.ativo !== false).length;
        const totalProdutos = state.produtos.filter((p) => p.empresa_id === e.id && p.ativo !== false).length;
        const admins = state.usuarios.filter((u) => u.empresa_id === e.id && ['administrador','gestor','admin'].includes(u.papel));
        return {
          id: e.id,
          nome: e.nome,
          email_contato: e.email_contato,
          plano: e.plano,
          status: e.status || 'ativa',
          tipo: e.tipo || 'cliente',
          excluida_em: e.excluida_em || null,
          trial_expira_em: e.trial_expira_em,
          criado_em: e.criado_em,
          total_usuarios: totalUsuarios,
          total_admins: admins.length,
          total_produtos: totalProdutos,
          total_contagens: state.contagens.filter((c) => c.empresa_id === e.id).length,
          administrador_principal: admins.find((u) => u.ativo !== false) || null,
          ultima_atividade: state.auditLogs.filter((l) => l.empresa_id === e.id || l.empresa_afetada_id === e.id).sort((a,b)=>new Date(b.criado_em)-new Date(a.criado_em))[0]?.criado_em || null
        };
      });
      const limit = Number(params[params.length - 2]);
      const offset = Number(params[params.length - 1]);
      return { rows: Number.isFinite(limit) && Number.isFinite(offset) ? rows.slice(offset, offset + limit) : rows };
    }
    if (norm === 'SELECT id, plano FROM empresas') {
      return { rows: state.empresas.map((e) => ({ id: e.id, plano: e.plano })) };
    }
  }

  // UPDATE empresas
  if (norm.startsWith('UPDATE empresas')) {
    if (norm.includes('SET status=$1::varchar')) {
      const emp = state.empresas.find((e) => e.id === params[1]);
      if (!emp) return { rows: [] };
      emp.status = params[0];
      if (emp.plano === 'suspenso' && params[0] === 'ativa') emp.plano = 'ativo';
      return { rows: [emp], rowCount: 1 };
    }
    if (norm.includes("SET status='inativa',excluida_em=now()")) {
      const emp = state.empresas.find((e) => e.id === params[0]);
      if (!emp) return { rows: [] };
      emp.status = 'inativa';
      emp.excluida_em = new Date().toISOString();
      emp.excluida_por = params[1];
      emp.motivo_exclusao = params[2] || null;
      return { rows: [emp], rowCount: 1 };
    }
    if (norm.includes('SET plano = $1 WHERE id = $2')) {
      const plano = params[0];
      const id = params[1];
      const emp = state.empresas.find((e) => e.id === id);
      if (emp) {
        emp.plano = plano;
        return { rows: [emp] };
      }
      return { rows: [] };
    }
    if (norm.includes('SET nome = $1') || norm.includes('SET nome=$1')) {
      const [nome, email, plano, trial, id] = params;
      const emp = state.empresas.find((e) => e.id === id);
      if (emp) {
        emp.nome = nome;
        emp.email_contato = email;
        emp.plano = plano;
        emp.trial_expira_em = trial;
        return { rows: [emp] };
      }
      return { rows: [] };
    }
  }

  // DELETE FROM empresas
  if (norm.startsWith('DELETE FROM empresas WHERE id = $1')) {
    const id = params[0];
    const idx = state.empresas.findIndex((e) => e.id === id);
    if (idx !== -1) {
      state.empresas.splice(idx, 1);
      state.usuarios = state.usuarios.filter((u) => u.empresa_id !== id);
      state.produtos = state.produtos.filter((p) => p.empresa_id !== id);
      state.contagens = state.contagens.filter((c) => c.empresa_id !== id);
    }
    return { rows: [] };
  }

  // UPDATE audit_logs (desvincular empresa_id na exclusão)
  if (norm.startsWith('UPDATE audit_logs SET empresa_id = NULL WHERE empresa_id = $1')) {
    const id = params[0];
    for (const log of state.auditLogs) {
      if (log.empresa_id === id) {
        log.empresa_id = null;
      }
    }
    return { rows: [] };
  }

  // Métricas globais SaaS
  if (norm === 'SELECT id FROM usuarios WHERE ativo = TRUE') {
    return { rows: state.usuarios.filter((u) => u.ativo !== false).map((u) => ({ id: u.id })) };
  }
  if (norm === 'SELECT id FROM produtos WHERE ativo = TRUE') {
    return { rows: state.produtos.filter((p) => p.ativo !== false).map((p) => ({ id: p.id })) };
  }
  if (norm === 'SELECT id FROM contagens') {
    return { rows: state.contagens.map((c) => ({ id: c.id })) };
  }

  // Contagens por empresa
  if (norm.includes('FROM produtos WHERE empresa_id = $1 AND ativo = TRUE') && norm.includes('COUNT(*)')) {
    const empresaId = params[0];
    const count = state.produtos.filter((p) => p.empresa_id === empresaId && p.ativo !== false).length;
    return { rows: [{ total: count }] };
  }
  if (norm.includes('FROM contagens WHERE empresa_id = $1') && norm.includes('COUNT(*)')) {
    const empresaId = params[0];
    const count = state.contagens.filter((c) => c.empresa_id === empresaId).length;
    return { rows: [{ total: count }] };
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
      versao_sessao: 1,
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
            versao_sessao: user.versao_sessao || 1,
            must_change_password: Boolean(user.must_change_password),
            empresa_id: user.empresa_id,
            empresa_nome: emp ? emp.nome : 'Empresa',
            plano: emp ? emp.plano : 'ativo',
            trial_expira_em: emp ? emp.trial_expira_em : null,
            status: emp ? emp.status || 'ativa' : 'ativa',
            excluida_em: emp ? emp.excluida_em || null : null,
            tipo: emp ? emp.tipo || 'cliente' : 'cliente'
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
            versao_sessao: user.versao_sessao || 1,
            must_change_password: Boolean(user.must_change_password),
            empresa_id: user.empresa_id,
            empresa_nome: emp ? emp.nome : 'Empresa',
            plano: emp ? emp.plano : 'ativo',
            trial_expira_em: emp ? emp.trial_expira_em : null,
            status: emp ? emp.status || 'ativa' : 'ativa',
            excluida_em: emp ? emp.excluida_em || null : null,
            tipo: emp ? emp.tipo || 'cliente' : 'cliente'
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
    if (norm.includes('SET versao_sessao=versao_sessao+1 WHERE empresa_id=$1')) {
      state.usuarios.filter((u) => u.empresa_id === params[0]).forEach((u) => { u.versao_sessao = (u.versao_sessao || 1) + 1; });
      return { rows: [] };
    }
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
        user.versao_sessao = (user.versao_sessao || 1) + 1;
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
    // Suporta batch: params = [contagem_id, fornecedor1, fornecedor2, ...]
    const contagemId = params[0];
    const fornecedoresNomes = params.slice(1);
    const rows = [];
    for (const fornNome of fornecedoresNomes) {
      const forn = {
        id: crypto.randomUUID(),
        contagem_id: contagemId,
        fornecedor: fornNome,
        tem_diferenca: false,
        contado_em: new Date().toISOString()
      };
      state.contagemFornecedores.push(forn);
      rows.push(forn);
    }
    return { rows };
  }

  if (norm.startsWith('INSERT INTO contagem_itens')) {
    // Suporta batch: params em grupos de 5 [fornId, prodId, codigo, nome, estoque, ...]
    const rows = [];
    for (let i = 0; i < params.length; i += 5) {
      const item = {
        id: crypto.randomUUID(),
        contagem_fornecedor_id: params[i],
        produto_id: params[i + 1],
        codigo: params[i + 2],
        nome: params[i + 3],
        estoque_referencia: params[i + 4] !== undefined ? params[i + 4] : 0,
        quantidade_contada: null,
        diferenca: null,
        situacao: null,
        contado_em: null
      };
      state.contagemItens.push(item);
      rows.push(item);
    }
    return { rows };
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
  if (norm.startsWith('UPDATE contagem_itens SET quantidade_contada = $1, contado_em = CASE')) {
    const qtd = params[0];
    const fornId = params[1];
    const prodId = params[2];
    const item = state.contagemItens.find((i) => i.contagem_fornecedor_id === fornId && i.produto_id === prodId);
    if (item) {
      item.quantidade_contada = qtd;
      item.contado_em = qtd === null ? null : new Date().toISOString();
      return { rows: [item] };
    }
    return { rows: [] };
  }

  if (norm.startsWith('UPDATE contagem_itens AS ci SET diferenca = ci.quantidade_contada')) {
    const fornIds = state.contagemFornecedores.filter(f => f.contagem_id === params[0]).map(f => f.id);
    const itens = state.contagemItens.filter(i => fornIds.includes(i.contagem_fornecedor_id) && i.quantidade_contada !== null);
    return { rows: itens.map(i => {
      i.diferenca = i.quantidade_contada - i.estoque_referencia;
      i.situacao = i.diferenca > 0 ? 'sobra' : i.diferenca < 0 ? 'falta' : 'sem_diferenca';
      return { contagem_fornecedor_id: i.contagem_fornecedor_id, diferenca: i.diferenca };
    }) };
  }

  if (norm.startsWith('UPDATE contagem_fornecedores AS cf SET tem_diferenca')) {
    const [contagemId, ids] = params;
    state.contagemFornecedores.filter(f => f.contagem_id === contagemId)
      .forEach(f => { f.tem_diferenca = ids.includes(f.id); });
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
    const onlyCounted = params[1] === true;
    const forns = state.contagemFornecedores.filter((f) => f.contagem_id === contagemId && (
      !onlyCounted || state.contagemItens.some((i) => i.contagem_fornecedor_id === f.id && i.quantidade_contada !== null)
    ));
    const rows = forns.map((f) => {
      const itens = state.contagemItens.filter((i) => i.contagem_fornecedor_id === f.id && (
        !onlyCounted || i.quantidade_contada !== null
      ));
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
      empresa_afetada_id: params[20] || null,
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
      const found = state.auditLogs.find((l) => l.id === targetId && (
        !norm.includes('empresa_id = $2') || (l.escopo === 'empresa' && l.empresa_id === params[1])
      ));
      return { rows: found ? [found] : [] };
    }

    let logs = [...state.auditLogs];

    // Se houver filtros parametrizados
    if (params && params.length > 0) {
      if (norm.includes('empresa_id = $')) {
        const m = norm.match(/empresa_id = \$(\d+)/);
        if (m) {
          const empId = params[parseInt(m[1], 10) - 1];
          logs = norm.includes('OR empresa_afetada_id')
            ? logs.filter((l) => l.empresa_id === empId || l.empresa_afetada_id === empId)
            : logs.filter((l) => l.empresa_id === empId);
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

  // ===== SESSOES DE AUDITORIA =====
  if (norm.startsWith('INSERT INTO sessoes_auditoria')) {
    const iniciado = new Date();
    const sessao = {
      id: crypto.randomUUID(),
      ator_id: params[0],
      empresa_id: params[1],
      motivo: params[2] || null,
      iniciado_em: iniciado.toISOString(),
      expira_em: new Date(iniciado.getTime() + 30 * 60000).toISOString(),
      encerrado_em: null,
      motivo_encerramento: null
    };
    state.sessoesAuditoria.push(sessao);
    return { rows: [sessao], rowCount: 1 };
  }
  if (norm.includes('FROM sessoes_auditoria')) {
    let rows = [...state.sessoesAuditoria];
    if (norm.includes('id=$1')) rows = rows.filter((s) => s.id === params[0]);
    if (norm.includes('ator_id=$2')) rows = rows.filter((s) => s.ator_id === params[1]);
    else if (norm.includes('ator_id=$1')) rows = rows.filter((s) => s.ator_id === params[0]);
    if (norm.includes('empresa_id=$1')) rows = rows.filter((s) => s.empresa_id === params[0]);
    if (norm.includes('count(*)')) return { rows: [{ total: rows.length }] };
    return { rows, rowCount: rows.length };
  }
  if (norm.startsWith('UPDATE sessoes_auditoria')) {
    let rows = state.sessoesAuditoria;
    if (norm.includes('WHERE ator_id=$1')) rows = rows.filter((s) => s.ator_id === params[0] && !s.encerrado_em && new Date(s.expira_em) <= new Date());
    else if (norm.includes('WHERE empresa_id=$1')) rows = rows.filter((s) => s.empresa_id === params[0] && !s.encerrado_em);
    else if (norm.includes('WHERE id=$1')) rows = rows.filter((s) => s.id === params[0] && !s.encerrado_em);
    for (const sessao of rows) {
      sessao.encerrado_em = norm.includes('encerrado_em=expira_em') ? sessao.expira_em : new Date().toISOString();
      sessao.motivo_encerramento = norm.includes("'expirada'") ? 'expirada' : norm.includes("'empresa_excluida'") ? 'empresa_excluida' : 'manual';
    }
    return { rows, rowCount: rows.length };
  }

  // Fallback genérico para BEGIN, COMMIT, ROLLBACK
  return { rows: [] };
}

class MockClient {
  constructor() { this.snapshot = null; }
  async query(text, params) {
    const command = String(text).trim().toUpperCase();
    if (command === 'BEGIN') {
      this.snapshot = structuredClone(state);
      return { rows: [] };
    }
    if (command === 'ROLLBACK') {
      if (this.snapshot) {
        for (const key of Object.keys(state)) state[key] = this.snapshot[key];
      }
      this.snapshot = null;
      return { rows: [] };
    }
    if (command === 'COMMIT') {
      this.snapshot = null;
      return { rows: [] };
    }
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
