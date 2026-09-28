const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const request = require('supertest');
let mockPool;
jest.mock('../src/config/db', () => ({query:(...args)=>mockPool.query(...args),getClient:()=>mockPool.connect(),pool:{connect:()=>mockPool.connect()}}));
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('Classificação de peças — PostgreSQL isolado', () => {
  let app, empresaId, produtoId, sessaoId, itemId, adminToken, funcionarioToken;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!url.pathname.endsWith('_test')) throw new Error('Banco de integração deve terminar em _test');
    mockPool = new Pool({connectionString:url.href,max:5});
    // Reconstrói o schema anterior somente no banco de testes isolado.
    await mockPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const schema = fs.readFileSync(path.join(__dirname,'../sql/schema.sql'),'utf8')
      .replace(/  contagem_em_pecas BOOLEAN[^\n]*\n/, '')
      .replace(/  tipo VARCHAR\(20\) NOT NULL DEFAULT 'geral'[^\n]*\n/, '')
      .replace('estoque_referencia INTEGER DEFAULT 0,','estoque_referencia INTEGER DEFAULT 0 NOT NULL,');
    await mockPool.query(schema);
    empresaId=(await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('Peças','pecas@teste.invalid') RETURNING id")).rows[0].id;
    produtoId=(await mockPool.query("INSERT INTO produtos(empresa_id,codigo,nome,fornecedor,estoque_atual) VALUES($1,'ANTIGO','Antigo','Queijaria',17) RETURNING id",[empresaId])).rows[0].id;
    sessaoId=(await mockPool.query('INSERT INTO contagens(empresa_id) VALUES($1) RETURNING id',[empresaId])).rows[0].id;
    const fornecedorId=(await mockPool.query("INSERT INTO contagem_fornecedores(contagem_id,fornecedor) VALUES($1,'Queijaria') RETURNING id",[sessaoId])).rows[0].id;
    itemId=(await mockPool.query("INSERT INTO contagem_itens(contagem_fornecedor_id,produto_id,codigo,nome,estoque_referencia) VALUES($1,$2,'ANTIGO','Antigo',17) RETURNING id",[fornecedorId,produtoId])).rows[0].id;
    await require('../src/scripts/migrate').runMigrations();
    app=require('../src/app');
    const hash=await require('bcryptjs').hash('TesteSegura123',4);
    const {gerarAccessToken}=require('../src/config/jwt');
    for (const papel of ['administrador','funcionario']) {
      const usuario=(await mockPool.query('INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel) VALUES($1,$2,$3,$4,$2) RETURNING id',[empresaId,papel,papel+'@pecas.invalid',hash])).rows[0];
      const token=gerarAccessToken({id:usuario.id,empresa_id:empresaId,versao_sessao:1});
      if(papel==='administrador') adminToken=token; else funcionarioToken=token;
    }
  },30000);
  afterAll(async()=>{if(mockPool) await mockPool.end();});
  it('migration preserva dados antigos e suporta referência ausente de peças',async()=>{
    await require('../src/scripts/migrate').runMigrations();
    const produtoAntigo=(await mockPool.query('SELECT * FROM produtos WHERE id=$1',[produtoId])).rows[0];
    const sessaoAntiga=(await mockPool.query('SELECT * FROM contagens WHERE id=$1',[sessaoId])).rows[0];
    const itemAntigo=(await mockPool.query('SELECT * FROM contagem_itens WHERE id=$1',[itemId])).rows[0];
    expect(produtoAntigo.contagem_em_pecas).toBe(false);
    expect(sessaoAntiga.tipo).toBe('geral');
    expect(itemAntigo.estoque_referencia).toBe(17);
    const sessao=(await mockPool.query("INSERT INTO contagens(empresa_id,tipo) VALUES($1,'pecas_queijo') RETURNING id",[empresaId])).rows[0];
    const fornecedor=(await mockPool.query("INSERT INTO contagem_fornecedores(contagem_id,fornecedor) VALUES($1,'Queijaria') RETURNING id",[sessao.id])).rows[0];
    const itemDePecas=(await mockPool.query("INSERT INTO contagem_itens(contagem_fornecedor_id,codigo,nome,estoque_referencia) VALUES($1,'PECA','Peça',NULL) RETURNING *",[fornecedor.id])).rows[0];
    expect(itemDePecas.estoque_referencia).toBeNull();
    await expect(mockPool.query("INSERT INTO contagens(empresa_id,tipo) VALUES($1,'invalido')",[empresaId])).rejects.toMatchObject({code:'23514'});
    await mockPool.query(fs.readFileSync(path.join(__dirname,'../sql/migrations/007_pecas_de_queijo.sql'),'utf8'));
  });
  it('administrador marca e desmarca; funcionário não edita classificação',async()=>{
    const criado=await request(app).post('/api/produtos').set('Authorization','Bearer '+adminToken).send({codigo:'NOVO',nome:'Novo',fornecedor:'Queijaria',contagem_em_pecas:true});
    expect(criado.status).toBe(201);
    expect(criado.body.data.produto.contagem_em_pecas).toBe(true);
    const id=criado.body.data.produto.id;
    const editado=await request(app).put('/api/produtos/'+id).set('Authorization','Bearer '+adminToken).send({contagem_em_pecas:false});
    expect(editado.status).toBe(200);
    expect(editado.body.data.produto.contagem_em_pecas).toBe(false);
    const edicaoFuncionario=await request(app).put('/api/produtos/'+id).set('Authorization','Bearer '+funcionarioToken).send({contagem_em_pecas:true});
    expect(edicaoFuncionario.status).toBe(403);
    const logs=(await mockPool.query("SELECT dados_novos FROM audit_logs WHERE entidade_id=$1 AND acao IN ('produto_criado','produto_editado') ORDER BY criado_em",[id])).rows;
    expect(logs.map(l=>l.dados_novos.contagem_em_pecas)).toEqual([true,false]);
  });
  it('filtro false seleciona gerais e importação mantém classificação',async()=>{
    await request(app).put('/api/produtos/'+produtoId).set('Authorization','Bearer '+adminToken).send({contagem_em_pecas:true});
    for(const modo of ['mesclar','substituir']) {
      const imported=await request(app).post('/api/produtos/importar').set('Authorization','Bearer '+adminToken).send({modo,produtos:[{codigo:'ANTIGO',nome:'Atualizado',fornecedor:'Queijaria'},{codigo:'GERAL',nome:'Geral',fornecedor:'Queijaria',contagem_em_pecas:true}]});
      expect(imported.status).toBe(200);
      const produtoDepoisDaImportacao=(await mockPool.query('SELECT * FROM produtos WHERE id=$1',[produtoId])).rows[0];
      expect(produtoDepoisDaImportacao.contagem_em_pecas).toBe(true);
    }
    for(const token of [adminToken,funcionarioToken]) {
      const listaGeral=await request(app).get('/api/produtos?contagem_em_pecas=false').set('Authorization','Bearer '+token);
      expect(listaGeral.status).toBe(200);
      expect(listaGeral.body.data.produtos).toHaveLength(1);
      expect(listaGeral.body.data.produtos.every(p=>!p.contagem_em_pecas)).toBe(true);
      const pecas=await request(app).get('/api/produtos?contagem_em_pecas=true').set('Authorization','Bearer '+token);
      expect(pecas.body.data.produtos).toHaveLength(1);
      expect(pecas.body.data.produtos[0].contagem_em_pecas).toBe(true);
    }
    expect((await request(app).get('/api/produtos?contagem_em_pecas=0').set('Authorization','Bearer '+adminToken)).status).toBe(400);
    expect((await request(app).put('/api/produtos/'+produtoId).set('Authorization','Bearer '+adminToken).send({contagem_em_pecas:'false'})).status).toBe(400);
  });
});
