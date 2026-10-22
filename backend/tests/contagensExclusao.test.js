const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const app = require('../src/app');

describe('Exclusão de contagens em andamento pelo administrador da empresa', () => {
  const empresaId = '11111111-1111-1111-1111-111111111111';
  const adminId = '22222222-2222-2222-2222-222222222222';
  const funcionarioId = '33333333-3333-3333-3333-333333333333';
  const superId = '55555555-5555-5555-5555-555555555555';
  const contagemId = '44444444-4444-4444-4444-444444444444';
  const contagemId2 = '44444444-4444-4444-4444-444444444445';
  const contagemFinalizadaId = '44444444-4444-4444-4444-444444444446';

  let adminToken;
  let funcionarioToken;
  let superToken;

  const usuarios = {};

  function usuario(id, papel) {
    return {
      id, nome: papel, email: `${papel}@teste.com`, papel, ativo: true,
      must_change_password: false, empresa_id: empresaId, plano: 'ativo'
    };
  }

  function autenticarComo(papel) {
    db.query.mockImplementationOnce(async () => ({ rows: [usuarios[papel]] }));
  }

  /**
   * Cliente de transação simulado: responde pelo texto do SQL e registra a ordem das chamadas.
   * `respostas` permite sobrescrever por trecho de SQL (valor ou função).
   */
  function criarClient(respostas = {}) {
    const client = {
      release: jest.fn(),
      query: jest.fn(async (sql, params) => {
        for (const [trecho, resp] of Object.entries(respostas)) {
          if (sql.includes(trecho)) {
            if (resp instanceof Error) throw resp;
            return typeof resp === 'function' ? resp(sql, params) : resp;
          }
        }
        return { rows: [] };
      })
    };
    db.getClient.mockResolvedValueOnce(client);
    return client;
  }

  const sqls = (client) => client.query.mock.calls.map(([sql]) => String(sql));
  const indiceDe = (client, trecho) => sqls(client).findIndex((s) => s.includes(trecho));
  const chamada = (client, trecho) => client.query.mock.calls.find(([sql]) => String(sql).includes(trecho));

  const contagemAberta = (id, tipo = 'geral') => ({
    id, tipo, status: 'em_andamento', iniciado_por: funcionarioId,
    // O driver pg entrega timestamp como objeto Date; a auditoria precisa serializá-lo (bug real já visto)
    iniciado_em: new Date('2026-10-01T10:00:00.000Z'), iniciado_por_nome: 'Maria'
  });

  const resumo = {
    rows: [{ total_fornecedores: '2', total_itens: '10', itens_contados: '4', total_vencidos: '3' }]
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo_de_teste_super_seguro_1234567890';
    adminToken = gerarAccessToken({ id: adminId, empresa_id: empresaId });
    funcionarioToken = gerarAccessToken({ id: funcionarioId, empresa_id: empresaId });
    superToken = gerarAccessToken({ id: superId, empresa_id: empresaId });
    usuarios.administrador = usuario(adminId, 'administrador');
    usuarios.funcionario = usuario(funcionarioId, 'funcionario');
    usuarios.super_admin = usuario(superId, 'super_admin');
  });

  beforeEach(() => {
    jest.resetAllMocks();
    db.pool.connect.mockRejectedValue(new Error('no local db'));
  });

  describe('DELETE /api/contagens/:id', () => {
    it('administrador apaga contagem da própria empresa, auditando antes do DELETE', async () => {
      autenticarComo('administrador');
      const client = criarClient({
        'FOR UPDATE OF c': { rows: [contagemAberta(contagemId)] },
        'COUNT(DISTINCT cf.id)': resumo
      });

      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ motivo: 'Contagem iniciada por engano' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Contagem apagada.', data: { id: contagemId } });

      const iAudit = indiceDe(client, 'INSERT INTO audit_logs');
      const iDelete = indiceDe(client, 'DELETE FROM contagens');
      expect(iAudit).toBeGreaterThan(-1);
      expect(iDelete).toBeGreaterThan(iAudit);
      expect(indiceDe(client, 'COMMIT')).toBeGreaterThan(iDelete);
      expect(sqls(client)).not.toContain('ROLLBACK');

      const [, p] = chamada(client, 'INSERT INTO audit_logs');
      // escopo, empresa_id, ator_tipo, ator_id, ator_papel, ator_rotulo, acao, entidade, entidade_id, resultado
      expect(p[0]).toBe('empresa');
      expect(p[1]).toBe(empresaId);
      expect(p[3]).toBe(adminId);
      expect(p[6]).toBe('contagem_apagada');
      expect(p[7]).toBe('contagem');
      expect(p[8]).toBe(contagemId);
      expect(JSON.parse(p[10])).toEqual({
        tipo: 'geral', status: 'em_andamento', iniciado_por: funcionarioId,
        iniciado_por_nome: 'Maria', iniciado_em: '2026-10-01T10:00:00.000Z',
        total_fornecedores: 2, total_itens: 10, itens_contados: 4, total_vencidos: 3
      });
      expect(JSON.parse(p[12])).toEqual({ lote: false });
      expect(p[13]).toBe('Contagem iniciada por engano');
      expect(p[19]).toBe(`contagem_apagada_${contagemId}`);

      const [, pDel] = chamada(client, 'DELETE FROM contagens');
      expect(pDel).toEqual([contagemId, empresaId]);
      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('funciona sem corpo (motivo opcional)', async () => {
      autenticarComo('administrador');
      criarClient({
        'FOR UPDATE OF c': { rows: [contagemAberta(contagemId)] },
        'COUNT(DISTINCT cf.id)': resumo
      });
      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
    });

    it('contagem de outra empresa (ou inexistente) retorna 404 usando o empresa_id do token', async () => {
      autenticarComo('administrador');
      const client = criarClient({ 'FOR UPDATE OF c': { rows: [] } });

      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('CONTAGEM_NAO_ENCONTRADA');
      const [, p] = chamada(client, 'FOR UPDATE OF c');
      expect(p).toEqual([contagemId, empresaId]);
      expect(indiceDe(client, 'DELETE FROM contagens')).toBe(-1);
      expect(indiceDe(client, 'INSERT INTO audit_logs')).toBe(-1);
      expect(sqls(client)).toContain('ROLLBACK');
    });

    it('funcionário recebe 403', async () => {
      autenticarComo('funcionario');
      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${funcionarioToken}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('ACESSO_NEGADO_PAPEL');
      expect(db.getClient).not.toHaveBeenCalled();
    });

    it('Super Admin recebe 403 (não apaga contagens de empresas)', async () => {
      autenticarComo('super_admin');
      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('ACESSO_NEGADO_PAPEL');
      expect(db.getClient).not.toHaveBeenCalled();
    });

    it('contagem finalizada retorna 409 com ROLLBACK e sem DELETE', async () => {
      autenticarComo('administrador');
      const client = criarClient({
        'FOR UPDATE OF c': { rows: [{ ...contagemAberta(contagemFinalizadaId), status: 'finalizada' }] }
      });

      const res = await request(app)
        .delete(`/api/contagens/${contagemFinalizadaId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('CONTAGEM_NAO_EM_ANDAMENTO');
      expect(sqls(client)).toContain('ROLLBACK');
      expect(indiceDe(client, 'DELETE FROM contagens')).toBe(-1);
      expect(indiceDe(client, 'INSERT INTO audit_logs')).toBe(-1);
    });

    it('id inválido retorna 400', async () => {
      autenticarComo('administrador');
      const res = await request(app)
        .delete('/api/contagens/nao-e-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(400);
      expect(db.getClient).not.toHaveBeenCalled();
    });

    it('motivo com mais de 500 caracteres retorna 400', async () => {
      autenticarComo('administrador');
      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ motivo: 'x'.repeat(501) });
      expect(res.statusCode).toBe(400);
    });

    it('peças de queijo: auditoria sem total_vencidos', async () => {
      autenticarComo('administrador');
      const client = criarClient({
        'FOR UPDATE OF c': { rows: [contagemAberta(contagemId, 'pecas_queijo')] },
        'COUNT(DISTINCT cf.id)': resumo
      });

      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const [, p] = chamada(client, 'INSERT INTO audit_logs');
      const antes = JSON.parse(p[10]);
      expect(antes.tipo).toBe('pecas_queijo');
      expect(antes).not.toHaveProperty('total_vencidos');
      expect(antes.itens_contados).toBe(4);
    });

    it('falha na auditoria faz ROLLBACK e nada é apagado', async () => {
      autenticarComo('administrador');
      const client = criarClient({
        'FOR UPDATE OF c': { rows: [contagemAberta(contagemId)] },
        'COUNT(DISTINCT cf.id)': resumo,
        'INSERT INTO audit_logs': new Error('falha simulada no audit_logs')
      });

      const res = await request(app)
        .delete(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(sqls(client)).toContain('ROLLBACK');
      expect(sqls(client)).not.toContain('COMMIT');
      expect(indiceDe(client, 'DELETE FROM contagens')).toBe(-1);
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /api/contagens/em-andamento (lote)', () => {
    it('apaga as em andamento e devolve as ignoradas, com operacao_id compartilhado', async () => {
      autenticarComo('administrador');
      const client = criarClient({
        'FOR UPDATE OF c': { rows: [contagemAberta(contagemId), contagemAberta(contagemId2)] },
        'COUNT(DISTINCT cf.id)': resumo
      });

      const res = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [contagemId, contagemId2, contagemFinalizadaId, contagemId], motivo: 'Limpeza' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        apagadas: 2,
        ids: [contagemId, contagemId2],
        ignoradas: [contagemFinalizadaId]
      });

      const [, pSel] = chamada(client, 'FOR UPDATE OF c');
      expect(pSel[0]).toBe(empresaId);
      expect(pSel[1]).toEqual([contagemId, contagemId2, contagemFinalizadaId]); // deduplicado
      expect(String(chamada(client, 'FOR UPDATE OF c')[0])).toContain('ORDER BY c.id');

      const audits = client.query.mock.calls.filter(([s]) => String(s).includes('INSERT INTO audit_logs'));
      const deletes = client.query.mock.calls.filter(([s]) => String(s).includes('DELETE FROM contagens'));
      expect(audits).toHaveLength(2);
      expect(deletes).toHaveLength(2);
      expect(audits.map(([, p]) => p[8])).toEqual([contagemId, contagemId2]);
      expect(audits.every(([, p]) => JSON.parse(p[12]).lote === true)).toBe(true);
      expect(audits[0][1][18]).toBe(audits[1][1][18]); // operacao_id
      expect(audits[0][1][19]).not.toBe(audits[1][1][19]); // evento_chave distinto
      expect(sqls(client)).toContain('COMMIT');
    });

    it('nenhuma encontrada: 200 com tudo ignorado', async () => {
      autenticarComo('administrador');
      criarClient({ 'FOR UPDATE OF c': { rows: [] } });
      const res = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [contagemId] });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({ apagadas: 0, ids: [], ignoradas: [contagemId] });
    });

    it('mais de 100 ids retorna 400', async () => {
      autenticarComo('administrador');
      const ids = Array.from({ length: 101 }, (_, i) =>
        `44444444-4444-4444-4444-${String(i).padStart(12, '0')}`);
      const res = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids });
      expect(res.statusCode).toBe(400);
      expect(db.getClient).not.toHaveBeenCalled();
    });

    it('lista vazia ou id inválido retorna 400', async () => {
      autenticarComo('administrador');
      const vazio = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] });
      expect(vazio.statusCode).toBe(400);

      autenticarComo('administrador');
      const invalido = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: ['abc'] });
      expect(invalido.statusCode).toBe(400);
    });

    it('funcionário e Super Admin recebem 403', async () => {
      autenticarComo('funcionario');
      const f = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${funcionarioToken}`)
        .send({ ids: [contagemId] });
      expect(f.statusCode).toBe(403);

      autenticarComo('super_admin');
      const s = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ ids: [contagemId] });
      expect(s.statusCode).toBe(403);
      expect(db.getClient).not.toHaveBeenCalled();
    });

    it('falha na auditoria de uma contagem desfaz o lote inteiro', async () => {
      autenticarComo('administrador');
      const client = criarClient({
        'FOR UPDATE OF c': { rows: [contagemAberta(contagemId), contagemAberta(contagemId2)] },
        'COUNT(DISTINCT cf.id)': resumo,
        'INSERT INTO audit_logs': new Error('falha simulada')
      });
      const res = await request(app)
        .delete('/api/contagens/em-andamento')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [contagemId, contagemId2] });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(sqls(client)).toContain('ROLLBACK');
      expect(indiceDe(client, 'DELETE FROM contagens')).toBe(-1);
    });
  });

  describe('Auditoria continua somente leitura', () => {
    it('DELETE em /api/auditoria/sessoes/... retorna 405', async () => {
      autenticarComo('super_admin');
      const res = await request(app)
        .delete('/api/auditoria/sessoes/66666666-6666-6666-6666-666666666666/contagens')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.statusCode).toBe(405);
      expect(res.body.code).toBe('AUDITORIA_SOMENTE_LEITURA');
    });
  });

  describe('Funcionário com a contagem aberta que foi apagada', () => {
    const apagadaRes = { rows: [{ '?column?': 1 }] };

    it('salvar-progresso responde 404 CONTAGEM_APAGADA quando há registro de exclusão', async () => {
      autenticarComo('funcionario');
      const client = criarClient({
        "status = 'em_andamento' FOR UPDATE": { rows: [] },
        'FROM audit_logs': apagadaRes
      });

      const res = await request(app)
        .put(`/api/contagens/${contagemId}/salvar-progresso`)
        .set('Authorization', `Bearer ${funcionarioToken}`)
        .send({ fornecedor: 'Fazenda A', itens: [{ produto_id: '11111111-2222-3333-4444-555555555555', quantidade_contada: 1 }] });

      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('CONTAGEM_APAGADA');
      expect(res.body.message).toBe('Esta contagem foi apagada por um administrador. As quantidades não salvas foram perdidas.');
      const [sql, p] = chamada(client, 'FROM audit_logs');
      expect(sql).toContain("acao = 'contagem_apagada'");
      expect(p).toEqual([contagemId, empresaId]);
    });

    it('finalizar responde 404 CONTAGEM_APAGADA quando há registro de exclusão', async () => {
      autenticarComo('funcionario');
      criarClient({
        "status = 'em_andamento' FOR UPDATE": { rows: [] },
        'FROM audit_logs': apagadaRes
      });
      const res = await request(app)
        .put(`/api/contagens/${contagemId}/finalizar`)
        .set('Authorization', `Bearer ${funcionarioToken}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('CONTAGEM_APAGADA');
    });

    it('detalhe responde 404 CONTAGEM_APAGADA quando a contagem não existe e foi apagada', async () => {
      autenticarComo('funcionario');
      db.query
        .mockResolvedValueOnce({ rows: [] }) // SELECT contagem
        .mockResolvedValueOnce(apagadaRes); // audit_logs
      const res = await request(app)
        .get(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${funcionarioToken}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('CONTAGEM_APAGADA');
    });

    it('sem registro de exclusão, salvar-progresso continua com CONTAGEM_INVALIDA', async () => {
      autenticarComo('funcionario');
      criarClient({
        "status = 'em_andamento' FOR UPDATE": { rows: [] },
        'FROM audit_logs': { rows: [] }
      });
      const res = await request(app)
        .put(`/api/contagens/${contagemId}/salvar-progresso`)
        .set('Authorization', `Bearer ${funcionarioToken}`)
        .send({ fornecedor: 'Fazenda A', itens: [{ produto_id: '11111111-2222-3333-4444-555555555555', quantidade_contada: 1 }] });
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('CONTAGEM_INVALIDA');
    });

    it('sem registro de exclusão, detalhe continua com CONTAGEM_NAO_ENCONTRADA', async () => {
      autenticarComo('funcionario');
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .get(`/api/contagens/${contagemId}`)
        .set('Authorization', `Bearer ${funcionarioToken}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('CONTAGEM_NAO_ENCONTRADA');
    });
  });
});
