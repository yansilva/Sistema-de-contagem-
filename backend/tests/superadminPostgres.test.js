const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const request = require('supertest');
const enabled = Boolean(process.env.TEST_DATABASE_URL);
const integration = enabled ? describe : describe.skip;
let mockPool;
jest.mock('../src/config/db', () => ({
  query: (...args) => mockPool.query(...args),
  getClient: () => mockPool.connect(),
  pool: { connect: () => mockPool.connect() }
}));

integration('Super Admin — PostgreSQL isolado', () => {
  let app;
  let token, segundoSuperToken, adminToken, empresaId, empresaBId, superId, adminId, plataformaId, contagemBId;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!url.pathname.endsWith('_test')) throw new Error('Banco de integração deve terminar em _test');
    mockPool = new Pool({ connectionString: url.href, max: 5 });
    await mockPool.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));
    await require('../src/scripts/migrate').runMigrations();
    app = require('../src/app');
    const bcrypt = require('bcryptjs');
    plataformaId = (await mockPool.query("INSERT INTO empresas(nome,email_contato,plano,tipo) VALUES('Plataforma','plataforma@teste.invalid','ativo','plataforma') RETURNING id")).rows[0].id;
    empresaId = (await mockPool.query("INSERT INTO empresas(nome,email_contato,plano) VALUES('Cliente A','cliente@teste.invalid','ativo') RETURNING id")).rows[0].id;
    empresaBId = (await mockPool.query("INSERT INTO empresas(nome,email_contato,plano) VALUES('Cliente B','clienteb@teste.invalid','ativo') RETURNING id")).rows[0].id;
    const hash = await bcrypt.hash('TesteSegura123', 4);
    superId = (await mockPool.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel) VALUES($1,'Super','super@teste.invalid',$2,'super_admin') RETURNING id", [plataformaId,hash])).rows[0].id;
    const segundoSuperId = (await mockPool.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel) VALUES($1,'Super Dois','super2@teste.invalid',$2,'super_admin') RETURNING id", [plataformaId,hash])).rows[0].id;
    adminId = (await mockPool.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel) VALUES($1,'Admin','admin@teste.invalid',$2,'administrador') RETURNING id", [empresaId,hash])).rows[0].id;
    await mockPool.query("INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel,ativo) VALUES($1,'Admin B','adminb@teste.invalid',$2,'gestor',FALSE)", [empresaBId,hash]);
    await mockPool.query("INSERT INTO contagens(empresa_id,status,finalizado_em) VALUES($1,'finalizada',now()),($1,'em_andamento',NULL)", [empresaId]);
    contagemBId = (await mockPool.query("INSERT INTO contagens(empresa_id,status) VALUES($1,'em_andamento') RETURNING id", [empresaBId])).rows[0].id;
    const { gerarAccessToken } = require('../src/config/jwt');
    token = gerarAccessToken({id:superId,empresa_id:plataformaId,versao_sessao:1});
    segundoSuperToken = gerarAccessToken({id:segundoSuperId,empresa_id:plataformaId,versao_sessao:1});
    adminToken = gerarAccessToken({id:adminId,empresa_id:empresaId,versao_sessao:1});
  }, 30000);
  afterAll(async () => { if (mockPool) await mockPool.end(); });

  it('migra novamente sem reativar empresa e mantém constraints dos logs', async () => {
    const empresa = (await mockPool.query("INSERT INTO empresas(nome,email_contato,plano) VALUES ('Teste','migracao@teste.invalid','ativo') RETURNING *")).rows[0];
    expect(empresa.status).toBe('ativa');
    expect(empresa.tipo).toBe('cliente');
    await mockPool.query("UPDATE empresas SET status = 'inativa' WHERE id=$1", [empresa.id]);
    const refreshHash = 'a'.repeat(64);
    await mockPool.query('INSERT INTO refresh_tokens(usuario_id,token_hash,expira_em) VALUES($1,$2,now()+interval \'1 day\')',[adminId,refreshHash]);
    await require('../src/scripts/migrate').runMigrations();
    expect((await mockPool.query('SELECT status FROM empresas WHERE id=$1', [empresa.id])).rows[0].status).toBe('inativa');
    const col = await mockPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='empresa_afetada_id'");
    expect(col.rowCount).toBe(1);
    const rls = await mockPool.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('schema_migrations','sessoes_auditoria','password_reset_solicitacoes') ORDER BY relname");
    expect(rls.rows).toEqual([
      { relname: 'password_reset_solicitacoes', relrowsecurity: true },
      { relname: 'schema_migrations', relrowsecurity: true },
      { relname: 'sessoes_auditoria', relrowsecurity: true }
    ]);
    expect((await mockPool.query('SELECT revogado FROM refresh_tokens WHERE token_hash=$1',[refreshHash])).rows[0].revogado).toBe(false);
  });

  it('calcula métricas e pagina empresas no PostgreSQL sem contar a plataforma', async () => {
    const metricas = await request(app).get('/api/empresas/metricas/saas').set('Authorization',`Bearer ${token}`);
    expect(metricas.status).toBe(200);
    expect(metricas.body.data).toMatchObject({
      totalEmpresas: 3,
      ativas: 2,
      inativas: 1,
      totalUsuarios: 2,
      usuariosAtivos: 1,
      totalAdmins: 2,
      totalContagens: 3,
      contagensFinalizadas: 1,
      contagensRecentes: 1
    });
    const lista = await request(app).get('/api/empresas?sort=nome&direction=asc&page=1&limit=2').set('Authorization',`Bearer ${token}`);
    expect(lista.status).toBe(200);
    expect(lista.body.data.empresas).toHaveLength(2);
    expect(lista.body.data.pagination).toMatchObject({total:3,page:1,limit:2,totalPages:2});
  });

  it('inativa com confirmação, impede login/API e mantém acesso administrativo', async () => {
    const missing = await request(app).patch(`/api/empresas/${empresaId}/status`).set('Authorization',`Bearer ${token}`).send({status:'inativa'});
    expect(missing.status).toBe(400);
    const changed = await request(app).patch(`/api/empresas/${empresaId}/status`).set('Authorization',`Bearer ${token}`).send({status:'inativa',confirmar:true,motivo:'Teste'});
    expect(changed.status).toBe(200);
    expect(changed.body.data.empresa.status).toBe('inativa');
    expect((await request(app).get('/api/produtos').set('Authorization',`Bearer ${adminToken}`)).status).toBeGreaterThanOrEqual(400);
    expect((await request(app).post('/api/auth/login').send({email:'admin@teste.invalid',senha:'TesteSegura123'})).status).toBe(403);
    expect((await request(app).get(`/api/empresas/${empresaId}`).set('Authorization',`Bearer ${token}`)).status).toBe(200);
    expect((await mockPool.query("SELECT * FROM audit_logs WHERE acao='empresa_inativada' AND empresa_afetada_id=$1",[empresaId])).rowCount).toBe(1);
  });

  it('desativa impersonation e mantém a autoria real em auditoria de empresa inativa', async () => {
    expect((await request(app).post(`/api/empresas/${empresaId}/impersonar`).set('Authorization',`Bearer ${token}`)).status).toBe(410);
    const start = await request(app).post('/api/auditoria/sessoes').set('Authorization',`Bearer ${token}`).send({empresa_id:empresaId});
    expect(start.status).toBe(201);
    const sessao = start.body.data.sessao;
    expect(sessao.ator_id).toBe(superId);
    expect(start.body.data.accessToken).toBeUndefined();
    expect((await request(app).get(`/api/auditoria/sessoes/${sessao.id}/usuarios`).set('Authorization',`Bearer ${token}`)).status).toBe(200);
    expect((await request(app).get(`/api/auditoria/sessoes/${sessao.id}/usuarios`).set('Authorization',`Bearer ${segundoSuperToken}`)).status).toBe(404);
    expect((await request(app).get(`/api/auditoria/sessoes/${sessao.id}/contagens/${contagemBId}`).set('Authorization',`Bearer ${token}`)).status).toBe(404);
    expect((await request(app).post(`/api/auditoria/sessoes/${sessao.id}/produtos`).set('Authorization',`Bearer ${token}`).send({nome:'Não criar'})).status).toBe(405);
    const ended = await Promise.all([1,2].map(()=>request(app).post(`/api/auditoria/sessoes/${sessao.id}/encerrar`).set('Authorization',`Bearer ${token}`)));
    expect(ended.map(r=>r.status)).toEqual([200,200]);
    expect((await mockPool.query("SELECT * FROM audit_logs WHERE acao='auditoria_encerrada' AND entidade_id=$1",[sessao.id])).rowCount).toBe(1);
    expect((await request(app).get(`/api/auditoria/sessoes/${sessao.id}/usuarios`).set('Authorization',`Bearer ${token}`)).status).toBe(403);
  });

  it('mantém recuperação indisponível sem e-mail e consome uma autorização somente uma vez', async () => {
    const indisponivel = await request(app)
      .post(`/api/empresas/${empresaId}/administradores/${adminId}/recuperacao`)
      .set('Authorization', `Bearer ${token}`)
      .send({confirmar:true});
    expect(indisponivel.status).toBe(503);
    expect(indisponivel.body.code).toBe('EMAIL_NAO_CONFIGURADO');
    expect((await mockPool.query('SELECT * FROM password_reset_solicitacoes')).rowCount).toBe(0);

    const anterior = process.env.APP_PUBLIC_URL;
    process.env.APP_PUBLIC_URL = 'https://app.teste.invalid';
    let link;
    try {
      const service = require('../src/services/passwordResetService');
      const solicitacao = await service.solicitar({
        empresaId,
        usuarioId: adminId,
        ator: {id:superId,papel:'super_admin',email:'super@teste.invalid'},
        contexto: {}
      }, async ({urlRecuperacao}) => { link = urlRecuperacao; });
      expect(solicitacao.entrega).toBe('aceita');
      const rawToken = new URL(link).hash.replace('#recuperacao=','');
      const registro = (await mockPool.query('SELECT * FROM password_reset_solicitacoes WHERE id=$1',[solicitacao.id])).rows[0];
      expect(registro.token_hash.trim()).not.toBe(rawToken);

      const resultados = await Promise.allSettled([1,2].map(() => service.consumir({token:rawToken,novaSenha:'NovaSenhaSegura123',contexto:{}})));
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const hashAtual = (await mockPool.query('SELECT senha_hash FROM usuarios WHERE id=$1',[adminId])).rows[0].senha_hash;
      expect(await require('bcryptjs').compare('NovaSenhaSegura123',hashAtual)).toBe(true);
    } finally {
      if (anterior === undefined) delete process.env.APP_PUBLIC_URL;
      else process.env.APP_PUBLIC_URL = anterior;
    }
  });

  it('define senha temporária somente para o administrador escolhido', async () => {
    const bcrypt = require('bcryptjs');
    const empresaCId = (await mockPool.query(
      "INSERT INTO empresas(nome,email_contato,plano) VALUES('Cliente C','clientec@teste.invalid','ativo') RETURNING id"
    )).rows[0].id;
    const hashAnterior = await bcrypt.hash('SenhaAnterior123', 4);
    const adminCId = (await mockPool.query(
      "INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel) VALUES($1,'Admin C','adminc@teste.invalid',$2,'administrador') RETURNING id",
      [empresaCId, hashAnterior]
    )).rows[0].id;
    const funcionarioCId = (await mockPool.query(
      "INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel) VALUES($1,'Funcionário C','funcionarioc@teste.invalid',$2,'funcionario') RETURNING id",
      [empresaCId, hashAnterior]
    )).rows[0].id;
    await mockPool.query(
      "INSERT INTO refresh_tokens(usuario_id,token_hash,expira_em) VALUES($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')",
      [adminCId, 'b'.repeat(64), funcionarioCId, 'c'.repeat(64)]
    );

    const resposta = await request(app)
      .post(`/api/empresas/${empresaCId}/administradores/${adminCId}/senha-temporaria`)
      .set('Authorization', `Bearer ${token}`)
      .send({novaSenhaTemporaria:'TemporariaNova123', confirmar:true});
    expect(resposta.status).toBe(200);

    const admin = (await mockPool.query(
      'SELECT senha_hash,must_change_password,versao_sessao FROM usuarios WHERE id=$1', [adminCId]
    )).rows[0];
    const funcionario = (await mockPool.query(
      'SELECT senha_hash,must_change_password,versao_sessao FROM usuarios WHERE id=$1', [funcionarioCId]
    )).rows[0];
    expect(await bcrypt.compare('TemporariaNova123', admin.senha_hash)).toBe(true);
    expect(admin.must_change_password).toBe(true);
    expect(admin.versao_sessao).toBe(2);
    expect(funcionario.senha_hash).toBe(hashAnterior);
    expect(funcionario.must_change_password).toBe(false);
    expect(funcionario.versao_sessao).toBe(1);
    expect((await mockPool.query('SELECT revogado FROM refresh_tokens WHERE usuario_id=$1',[adminCId])).rows[0].revogado).toBe(true);
    expect((await mockPool.query('SELECT revogado FROM refresh_tokens WHERE usuario_id=$1',[funcionarioCId])).rows[0].revogado).toBe(false);
    expect((await mockPool.query(
      "SELECT * FROM audit_logs WHERE acao='senha_temporaria_definida_superadmin' AND empresa_afetada_id=$1 AND entidade_id=$2",
      [empresaCId,adminCId]
    )).rowCount).toBe(1);
  });

  it('exclusão lógica confirma no servidor e preserva usuários e logs', async () => {
    expect((await request(app).delete(`/api/empresas/${empresaId}`).set('Authorization',`Bearer ${token}`).send({nomeConfirmacao:'Errada'})).status).toBe(400);
    const deleted = await request(app).delete(`/api/empresas/${empresaId}`).set('Authorization',`Bearer ${token}`).send({nomeConfirmacao:'Cliente A'});
    expect(deleted.status).toBe(200);
    expect((await mockPool.query('SELECT excluida_em FROM empresas WHERE id=$1',[empresaId])).rows[0].excluida_em).toBeTruthy();
    expect((await mockPool.query('SELECT id FROM usuarios WHERE id=$1',[adminId])).rowCount).toBe(1);
    expect((await mockPool.query("SELECT * FROM audit_logs WHERE acao='empresa_excluida' AND empresa_afetada_id=$1",[empresaId])).rowCount).toBe(1);
  });
});
