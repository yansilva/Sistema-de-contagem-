const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const request = require('supertest');
let mockPool;
jest.mock('../src/config/db', () => ({query:(...args)=>mockPool.query(...args),getClient:()=>mockPool.connect(),pool:{connect:()=>mockPool.connect()}}));
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('Classificação de peças — PostgreSQL isolado', () => {
  let app, empresaId, produtoId, sessaoId, itemId, adminToken, funcionarioToken;
  const empresasDaFixture=[];
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!url.pathname.endsWith('_test')) throw new Error('Banco de integração deve terminar em _test');
    mockPool = new Pool({connectionString:url.href,max:5});
    // Reconstrói o schema anterior somente no banco de testes isolado.
    await mockPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const schema = fs.readFileSync(path.join(__dirname,'../sql/schema.sql'),'utf8')
      .replace(/  contagem_em_pecas BOOLEAN[^\n]*\n/, '')
      .replace(/  tipo VARCHAR\(20\) NOT NULL DEFAULT 'geral'[^\n]*\n/, '')
      .replace(/  (quantidade_vencida|estoque_antes_baixa_vencidos|quantidade_vencida_baixada) INTEGER[^\n]*\n/g, '')
      .replace('estoque_referencia INTEGER DEFAULT 0,','estoque_referencia INTEGER DEFAULT 0 NOT NULL,');
    await mockPool.query(schema);
    const colunasAntigas = (await mockPool.query(`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND (
        (table_name='produtos' AND column_name='contagem_em_pecas') OR
        (table_name='contagens' AND column_name='tipo') OR
        (table_name='contagem_itens' AND column_name='estoque_referencia')
      )
    `)).rows;
    expect(colunasAntigas).toEqual([
      { table_name: 'contagem_itens', column_name: 'estoque_referencia', is_nullable: 'NO' }
    ]);
    empresaId=(await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('Peças','pecas@teste.invalid') RETURNING id")).rows[0].id;
    empresasDaFixture.push(empresaId);
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
  afterAll(async()=>{
    if (!mockPool) return;
    try {
      // Limpa somente IDs gerados por esta suíte no banco descartável validado no beforeAll.
      await mockPool.query('DELETE FROM audit_logs WHERE empresa_id=ANY($1::uuid[]) OR empresa_afetada_id=ANY($1::uuid[])',[empresasDaFixture]);
      // Remove sessões antes dos usuários referenciados em contado_por.
      await mockPool.query('DELETE FROM contagens WHERE empresa_id=ANY($1::uuid[])', [empresasDaFixture]);
      await mockPool.query('DELETE FROM empresas WHERE id=ANY($1::uuid[])',[empresasDaFixture]);
    } finally { await mockPool.end(); }
  });
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
  it('migration de vencidos preserva itens legados e permite rollback isolado', async () => {
    const migration = fs.readFileSync(path.join(__dirname, '../sql/migrations/008_produtos_vencidos.sql'), 'utf8');
    const rollback = fs.readFileSync(path.join(__dirname, '../sql/rollbacks/008_produtos_vencidos.sql'), 'utf8');
    const client = await mockPool.connect();
    try {
      await client.query('BEGIN');
      const original = (await client.query('SELECT * FROM contagem_itens WHERE id=$1', [itemId])).rows[0];
      const legado = { ...original };
      for (const column of ['quantidade_vencida', 'estoque_antes_baixa_vencidos', 'quantidade_vencida_baixada']) delete legado[column];
      await client.query(rollback);
      const columnsBefore = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='contagem_itens' ORDER BY ordinal_position")).rows;
      expect((await client.query('SELECT * FROM contagem_itens WHERE id=$1', [itemId])).rows[0]).toEqual(legado);
      await client.query(migration);
      await client.query(migration);
      expect((await client.query('SELECT * FROM contagem_itens WHERE id=$1', [itemId])).rows[0]).toEqual({
        ...legado, quantidade_vencida: 0, estoque_antes_baixa_vencidos: null, quantidade_vencida_baixada: null
      });
      const columns = (await client.query(`SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns
        WHERE table_schema='public' AND table_name='contagem_itens' AND column_name IN
        ('quantidade_vencida','estoque_antes_baixa_vencidos','quantidade_vencida_baixada') ORDER BY column_name`)).rows;
      expect(columns).toEqual([
        { column_name: 'estoque_antes_baixa_vencidos', is_nullable: 'YES', data_type: 'integer', column_default: null },
        { column_name: 'quantidade_vencida', is_nullable: 'NO', data_type: 'integer', column_default: '0' },
        { column_name: 'quantidade_vencida_baixada', is_nullable: 'YES', data_type: 'integer', column_default: null }
      ]);
      const novo = (await client.query(`INSERT INTO contagem_itens(contagem_fornecedor_id,codigo,nome)
        VALUES($1,'VENCIDOS','Vencidos') RETURNING *`, [legado.contagem_fornecedor_id])).rows[0];
      expect(novo).toMatchObject({ quantidade_vencida: 0, estoque_antes_baixa_vencidos: null, quantidade_vencida_baixada: null });
      for (const [value, code] of [[-1, '23514'], [null, '23502']]) {
        await client.query('SAVEPOINT invalid_quantity');
        await expect(client.query('UPDATE contagem_itens SET quantidade_vencida=$1 WHERE id=$2', [value, itemId])).rejects.toMatchObject({ code });
        await client.query('ROLLBACK TO SAVEPOINT invalid_quantity');
      }
      await client.query('UPDATE contagem_itens SET quantidade_vencida=3,estoque_antes_baixa_vencidos=17,quantidade_vencida_baixada=3 WHERE id=$1', [itemId]);
      expect((await client.query('SELECT quantidade_vencida,estoque_antes_baixa_vencidos,quantidade_vencida_baixada FROM contagem_itens WHERE id=$1', [itemId])).rows[0]).toEqual({ quantidade_vencida: 3, estoque_antes_baixa_vencidos: 17, quantidade_vencida_baixada: 3 });
      await client.query(rollback);
      expect((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='contagem_itens' ORDER BY ordinal_position")).rows).toEqual(columnsBefore);
      expect((await client.query('SELECT * FROM contagem_itens WHERE id=$1', [itemId])).rows[0]).toEqual(legado);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
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

  async function produto(codigo,pecas=false,fornecedor='Queijaria',empresa=empresaId) {
    return (await mockPool.query('INSERT INTO produtos(empresa_id,codigo,nome,fornecedor,estoque_atual,contagem_em_pecas) VALUES($1,$2,$2,$3,17,$4) RETURNING *',[empresa,codigo,fornecedor,pecas])).rows[0];
  }
  it('confirmação com SKU repetido normalizado não grava saldo, histórico ou auditoria',async()=>{
    const p=await produto('PDF_DUPLICADO');
    const logsAntes=(await mockPool.query("SELECT count(*)::int AS total FROM audit_logs WHERE empresa_id=$1 AND acao='estoque_atualizado'",[empresaId])).rows[0].total;
    for(const codigo of [p.codigo,' '+p.codigo+' ',p.codigo.toLowerCase()]) {
      const r=await api('post','/api/estoque/confirmar-atualizacao',{nome_arquivo:'duplicado.pdf',atualizacoes:[{codigo:p.codigo,estoque_atual:8},{codigo,estoque_atual:9}]});
      expect(r.status).toBe(400);expect(r.body.success).toBe(false);
      expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1',[p.id])).rows[0].estoque_atual).toBe(17);
    }
    expect((await mockPool.query("SELECT id FROM historico_importacao_estoque WHERE nome_arquivo='duplicado.pdf'")).rows).toHaveLength(0);
    expect((await mockPool.query("SELECT count(*)::int AS total FROM audit_logs WHERE empresa_id=$1 AND acao='estoque_atualizado'",[empresaId])).rows[0].total).toBe(logsAntes);
  });
  it('funcionário confirma estoque próprio sem mudar snapshots ou classificação',async()=>{
    const p=await produto('PDF_PROPRIO');const id=await iniciar('geral');
    await mockPool.query('UPDATE produtos SET contagem_em_pecas=true WHERE id=$1',[p.id]);
    const inativo=await produto('PDF_INATIVO');await mockPool.query('UPDATE produtos SET ativo=false WHERE id=$1',[inativo.id]);
    const empresa2=(await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('PDF externa','pdfexterna@teste.invalid') RETURNING id")).rows[0].id;empresasDaFixture.push(empresa2);
    const externo=await produto(p.codigo,false,'Queijaria',empresa2);
    const r=await api('post','/api/estoque/confirmar-atualizacao',{nome_arquivo:'tiny.pdf',empresa_id:empresa2,usuario_id:null,papel:'administrador',atualizacoes:[{codigo:p.codigo,estoque_atual:8,estoque_anterior:0,contagem_em_pecas:false},{codigo:inativo.codigo,estoque_atual:9},{codigo:'PDF_DESCONHECIDO',estoque_atual:99}]});
    expect(r.status).toBe(200);expect(r.body.data.produtos_atualizados).toBe(1);
    expect((await mockPool.query('SELECT estoque_atual,contagem_em_pecas FROM produtos WHERE id=$1',[p.id])).rows[0]).toEqual({estoque_atual:8,contagem_em_pecas:true});
    for(const produtoId of [inativo.id,externo.id]) expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1',[produtoId])).rows[0].estoque_atual).toBe(17);
    expect((await mockPool.query("SELECT id FROM produtos WHERE codigo='PDF_DESCONHECIDO'")).rows).toHaveLength(0);
    expect((await itens(id)).find(i=>i.produto_id===p.id).estoque_referencia).toBe(17);
    const historico=(await mockPool.query("SELECT * FROM historico_importacao_estoque WHERE nome_arquivo='tiny.pdf'")).rows[0];
    const ator=(await mockPool.query("SELECT id FROM usuarios WHERE empresa_id=$1 AND papel='funcionario'",[empresaId])).rows[0].id;
    expect(historico).toMatchObject({empresa_id:empresaId,usuario_id:ator,produtos_atualizados:1});
    expect((await mockPool.query("SELECT ator_id,empresa_id FROM audit_logs WHERE acao='estoque_atualizado' AND empresa_id=$1",[empresaId])).rows[0]).toMatchObject({ator_id:ator,empresa_id:empresaId});
  });
  function api(method,path,body,token=funcionarioToken) {
    const req=request(app)[method](path).set('Authorization','Bearer '+token);
    return body===undefined?req:req.send(body);
  }
  async function iniciar(tipo='pecas_queijo') {
    const r=await api('post','/api/contagens',{tipo});expect(r.status).toBe(201);expect(r.body.data.contagem.tipo).toBe(tipo);return r.body.data.contagem.id;
  }
  async function itens(id) { return (await mockPool.query('SELECT ci.* FROM contagem_itens ci JOIN contagem_fornecedores cf ON cf.id=ci.contagem_fornecedor_id WHERE cf.contagem_id=$1 ORDER BY ci.codigo',[id])).rows; }
  it('retomada semanal preserva data e ator intocados e registra recontagem com mesmo valor', async () => {
    const vm = require('vm');
    const cobertura = require('../src/services/coberturaSemanalService').obterCoberturaSemanal;
    const a = await produto('SEMANA_A', false, 'Semana temporal');
    const b = await produto('SEMANA_B', false, 'Semana temporal');
    const agora = (await mockPool.query('SELECT NOW() AS agora')).rows[0].agora;
    const semana = (await cobertura(empresaId, agora)).semana;
    const domingo = new Date(new Date(semana.inicio).getTime() - 1000);
    const atorAntigo = (await mockPool.query("SELECT id FROM usuarios WHERE empresa_id=$1 AND papel='administrador'", [empresaId])).rows[0].id;

    async function retomar() {
      const id = await iniciar('geral');
      await mockPool.query('UPDATE contagem_itens SET quantidade_contada=5,contado_em=$1,contado_por=$2 WHERE produto_id=$3 AND contagem_fornecedor_id IN (SELECT id FROM contagem_fornecedores WHERE contagem_id=$4)', [domingo, atorAntigo, a.id, id]);
      const node = { value: '', textContent: '', open: false, showModal() { this.open = true; }, style: {} };
      const context = vm.createContext({
        document: { getElementById: () => node, querySelectorAll: () => [] },
        showToast() {},
        API: {
          get: async route => (await api('get', '/api' + route)).body,
          put: async (route, body) => {
            const r = await api('put', '/api' + route, body);
            expect(r.status).toBe(200);
            return r.body;
          }
        }
      });
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../../frontend/js/contagens.js'), 'utf8') + '\nglobalThis.contagens = Contagens;', context);
      const contagens = context.contagens;
      contagens.renderizarListaProdutores = () => {};
      contagens.renderizarItensContagem = () => {};
      contagens.atualizarBarraProgresso = () => {};
      contagens.contagemId = id;
      await contagens.carregarDadosContagem();
      contagens.selecionarFornecedor('Semana temporal');
      return { id, contagens };
    }

    const primeira = await retomar();
    const indexB = primeira.contagens.itensFornecedor.findIndex(p => p.produto_id === b.id);
    primeira.contagens.atualizarQuantidadeItem(indexB, '0');
    expect(await primeira.contagens.salvarProgressoAtual()).toBe(true);
    const preservado = (await itens(primeira.id)).find(p => p.produto_id === a.id);
    expect(preservado.contado_em).toEqual(domingo);
    expect(preservado.contado_por).toBe(atorAntigo);
    expect(preservado.quantidade_contada).toBe(5);
    expect((await api('put', '/api/contagens/' + primeira.id + '/finalizar')).status).toBe(200);
    const parcial = (await cobertura(empresaId, agora)).produtores.find(p => p.fornecedor === 'Semana temporal');
    expect(parcial).toMatchObject({ status: 'parcial', produtos_contados: 1, total_produtos: 2 });
    expect(parcial.produtos_pendentes.map(p => p.id)).toEqual([a.id]);

    const segunda = await retomar();
    const indexA = segunda.contagens.itensFornecedor.findIndex(p => p.produto_id === a.id);
    segunda.contagens.atualizarQuantidadeItem(indexA, '5');
    expect(await segunda.contagens.salvarProgressoAtual()).toBe(true);
    const recontado = (await itens(segunda.id)).find(p => p.produto_id === a.id);
    expect(recontado.quantidade_contada).toBe(5);
    expect(recontado.contado_em.getTime()).toBeGreaterThanOrEqual(new Date(semana.inicio).getTime());
    expect((await api('put', '/api/contagens/' + segunda.id + '/finalizar')).status).toBe(200);
    const completo = (await cobertura(empresaId, agora)).produtores.find(p => p.fornecedor === 'Semana temporal');
    expect(completo).toMatchObject({ status: 'contado', produtos_contados: 2, produtos_pendentes: [] });
  });
  it('modalidade filtra snapshot, zero conta e finalização parcial mantém saldo ERP',async()=>{
    const p1=await produto('PECA1',true),p2=await produto('PECA2',true),geral=await produto('GERAL2');
    const id=await iniciar();const snap=await itens(id);
    const criadoLog=(await mockPool.query("SELECT dados_novos FROM audit_logs WHERE entidade_id=$1 AND acao='contagem_criada'",[id])).rows[0];expect(criadoLog.dados_novos.tipo).toBe('pecas_queijo');
    expect(snap.every(i=>i.estoque_referencia===null)).toBe(true);expect(snap.some(i=>i.produto_id===geral.id)).toBe(false);
    const r=await api('put','/api/contagens/'+id+'/salvar-progresso',{fornecedor:'Queijaria',itens:[{produto_id:p1.id,quantidade_contada:0},{produto_id:p2.id,quantidade_contada:null}]});expect(r.status).toBe(200);
    const finalizada=await api('put','/api/contagens/'+id+'/finalizar');expect(finalizada.status).toBe(200);expect(finalizada.body.data.contagem.tipo).toBe('pecas_queijo');expect(finalizada.body.data.contagem).not.toHaveProperty('tem_diferenca');
    const sessaoPersistida=(await mockPool.query('SELECT tem_diferenca FROM contagens WHERE id=$1',[id])).rows[0];expect(sessaoPersistida.tem_diferenca).toBe(false);
    const flags=(await mockPool.query('SELECT tem_diferenca FROM contagem_fornecedores WHERE contagem_id=$1',[id])).rows;expect(flags.every(f=>f.tem_diferenca===false)).toBe(true);
    const logs=(await mockPool.query("SELECT dados_novos,metadados FROM audit_logs WHERE entidade_id=$1 AND acao IN ('contagem_progresso_salvo','contagem_finalizada')",[id])).rows;expect(logs.every(l=>(l.dados_novos?.tipo||l.metadados?.tipo)==='pecas_queijo')).toBe(true);
    const depois=await itens(id);expect(depois.find(i=>i.produto_id===p2.id).quantidade_contada).toBeNull();expect(depois.find(i=>i.produto_id===p2.id).contado_em).toBeNull();expect(depois.find(i=>i.produto_id===p1.id).contado_em).not.toBeNull();
    expect(depois.every(i=>i.diferenca===null&&i.situacao===null)).toBe(true);
    expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1',[p1.id])).rows[0].estoque_atual).toBe(17);
    for(const token of [adminToken,funcionarioToken]) {
      const detalhe=await api('get','/api/contagens/'+id,undefined,token);const c=detalhe.body.data.contagem;expect(c.tipo).toBe('pecas_queijo');expect(c).not.toHaveProperty('tem_diferenca');
      const item=c.fornecedores.find(f=>f.fornecedor==='Queijaria').produtos.find(i=>i.produto_id===p1.id);expect(item.quantidade_contada).toBe(0);for(const key of ['estoque_referencia','diferenca','situacao','sem_diferenca']) expect(item).not.toHaveProperty(key);
    }
    const rel=await api('get','/api/relatorios/contagens/'+id+'/excel');expect(rel.status).toBe(400);expect(rel.body.code).toBe('RELATORIO_NAO_APLICAVEL');
    const lista=await api('get','/api/contagens?tipo=pecas_queijo&status=finalizada');expect(lista.body.data.contagens.some(c=>c.id===id)).toBe(true);expect(lista.body.data.contagens.every(c=>c.tipo==='pecas_queijo'&&c.status==='finalizada')).toBe(true);
  });
  it('snapshot permanece após reclassificação, desativação e troca de produtor',async()=>{
    const p=await produto('ESTAVEL');const id=await iniciar('geral');
    await mockPool.query("UPDATE produtos SET contagem_em_pecas=true,ativo=false,fornecedor='Outro' WHERE id=$1",[p.id]);
    const r=await api('put','/api/contagens/'+id+'/salvar-progresso',{fornecedor:'Queijaria',itens:[{produto_id:p.id,quantidade_contada:3}]});expect(r.status).toBe(200);
    expect((await itens(id)).find(i=>i.produto_id===p.id)).toMatchObject({estoque_referencia:17,quantidade_contada:3});
    const errado=await api('put','/api/contagens/'+id+'/salvar-progresso',{fornecedor:'Outro',itens:[{produto_id:p.id,quantidade_contada:8}]});expect(errado.status).toBe(400);expect(errado.body.code).toBe('ITEM_INCOMPATIVEL');
    expect((await itens(id)).find(i=>i.produto_id===p.id).quantidade_contada).toBe(3);
    expect((await api('put','/api/contagens/'+id+'/finalizar')).status).toBe(200);
    const det=await api('get','/api/contagens/'+id);expect(det.body.data.contagem.tipo).toBe('geral');expect(det.body.data.contagem.fornecedores.flatMap(f=>f.produtos).find(i=>i.produto_id===p.id)).toMatchObject({estoque_referencia:17,diferenca:-14});
  });
  it('lote com item incompatível, produtor errado ou outra empresa falha atomicamente',async()=>{
    const p=await produto('ATOMICO',true);const id=await iniciar();const geral=await produto('NOVOGERAL');const outro=await produto('OUTROPROD',true,'Outro');
    const empresa2=(await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('Outra','outra@teste.invalid') RETURNING id")).rows[0].id;empresasDaFixture.push(empresa2);const externo=await produto('EXTERNO',true,'Queijaria',empresa2);
    for(const invalid of [geral,outro,externo]) {
      const r=await api('put','/api/contagens/'+id+'/salvar-progresso',{fornecedor:'Queijaria',itens:[{produto_id:p.id,quantidade_contada:9},{produto_id:invalid.id,quantidade_contada:1}]});
      expect(r.status).toBe(400);expect(r.body.code).toBe('ITEM_INCOMPATIVEL');expect((await itens(id)).find(i=>i.produto_id===p.id).quantidade_contada).toBeNull();
    }
    const nova=await produto('NOVAPECA',true);expect((await api('put','/api/contagens/'+id+'/salvar-progresso',{fornecedor:'Queijaria',itens:[{produto_id:nova.id,quantidade_contada:null}]})).status).toBe(200);expect((await itens(id)).find(i=>i.produto_id===nova.id).estoque_referencia).toBeNull();
    const empresa2Token=require('../src/config/jwt').gerarAccessToken({id:(await mockPool.query('INSERT INTO usuarios(empresa_id,nome,email,senha_hash,papel) VALUES($1,$2,$3,$4,$5) RETURNING id',[empresa2,'Outro','externo@teste.invalid','hash','funcionario'])).rows[0].id,empresa_id:empresa2,versao_sessao:1});
    for(const [method,route,body] of [['get','',undefined],['put','/finalizar',undefined],['put','/salvar-progresso',{fornecedor:'Queijaria',itens:[{produto_id:p.id,quantidade_contada:1}]}],['post','/fornecedor',{fornecedor:'Queijaria',produtos:[{codigo:p.codigo,nome:p.nome,quantidade_contada:1}]}]]) expect((await api(method,'/api/contagens/'+id+route,body,empresa2Token)).status).toBe(404);
  });
  it('compatibilidade exige ID e código correspondentes ao mesmo snapshot',async()=>{
    const p=await produto('COMPAT',true),outro=await produto('COMPAT2',true);const id=await iniciar();
    const r=await api('post','/api/contagens/'+id+'/fornecedor',{fornecedor:'Queijaria',produtos:[{produto_id:p.id,codigo:outro.codigo,nome:p.nome,quantidade_contada:5}]});expect(r.status).toBe(400);expect(r.body.code).toBe('ITEM_INCOMPATIVEL');
    expect((await itens(id)).find(i=>i.produto_id===p.id).quantidade_contada).toBeNull();
    expect((await api('post','/api/contagens/'+id+'/fornecedor',{fornecedor:'Queijaria',produtos:[{produto_id:p.id,codigo:p.codigo,nome:p.nome,quantidade_contada:null,qty_contagem:7,qty_tiny:100,diferenca:100}]})).status).toBe(201);expect((await itens(id)).find(i=>i.produto_id===p.id).quantidade_contada).toBeNull();
  });
  it('lock da sessão serializa progresso concorrente com finalização',async()=>{
    const p=await produto('LOCK',true);const id=await iniciar();expect((await api('put','/api/contagens/'+id+'/salvar-progresso',{fornecedor:'Queijaria',itens:[{produto_id:p.id,quantidade_contada:2}]})).status).toBe(200);
    const blocker=await mockPool.connect();let finalPromise,savePromise;
    async function esperando() {
      for(let i=0;i<100;i++) {
        const locks=(await mockPool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM contagens%FOR UPDATE%'")).rows[0].n;
        if(locks>0)return;await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw Error('Operação não aguardou lock da sessão');
    }
    try {
      await blocker.query('BEGIN');await blocker.query('SELECT id FROM contagens WHERE id=$1 FOR UPDATE',[id]);
      finalPromise=api('put','/api/contagens/'+id+'/finalizar').then(r=>r);await esperando();
      savePromise=api('put','/api/contagens/'+id+'/salvar-progresso',{fornecedor:'Queijaria',itens:[{produto_id:p.id,quantidade_contada:99}]}).then(r=>r);
      // Enfileira progresso atrás da finalização; nenhuma gravação pode escapar do lock.
      let progressoBloqueado=false;
      for(let i=0;i<100;i++) { const n=(await mockPool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows[0].n;if(n>=2){progressoBloqueado=true;break;}await new Promise(resolve=>setTimeout(resolve,10)); }
      expect(progressoBloqueado).toBe(true);
      await blocker.query('COMMIT');const [finalizada,progresso]=await Promise.all([finalPromise,savePromise]);expect(finalizada.status).toBe(200);expect(progresso.status).toBe(404);expect((await itens(id)).find(i=>i.produto_id===p.id).quantidade_contada).toBe(2);
    } finally {await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled([finalPromise,savePromise].filter(Boolean));}
  },15000);

  it('sem produtos compatíveis faz rollback e peças sem quantidade não finalizam',async()=>{
    const empresa=(await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('Vazia','vazia@teste.invalid') RETURNING id")).rows[0].id;
    empresasDaFixture.push(empresa);
    await produto('SO_GERAL',false,'Queijaria',empresa);
    const {iniciar: iniciarController}=require('../src/controllers/contagensController');let error;
    await iniciarController({empresaId:empresa,usuario:{id:null},body:{tipo:'pecas_queijo'}},{status:()=>{throw Error('não deveria iniciar');}},e=>{error=e;});
    expect(error.code).toBe('SEM_PRODUTOS');expect((await mockPool.query('SELECT id FROM contagens WHERE empresa_id=$1',[empresa])).rows).toHaveLength(0);
    const id=await iniciar('pecas_queijo');
    expect((await api('put','/api/contagens/'+id+'/finalizar')).body.code).toBe('SEM_ITENS_CONTADOS');
  });

  it('body ausente ou vazio inicia geral e paginação mantém o filtro por modalidade',async()=>{
    for(const body of [undefined,{}]) {
      const r=await api('post','/api/contagens',body);expect(r.status).toBe(201);expect(r.body.data.contagem.tipo).toBe('geral');
      const snap=await itens(r.body.data.contagem.id);expect(snap.length).toBeGreaterThan(0);const catalogo=(await mockPool.query('SELECT id,estoque_atual FROM produtos WHERE empresa_id=$1 AND ativo=true AND contagem_em_pecas=false',[empresaId])).rows;expect(snap.map(i=>i.produto_id).sort()).toEqual(catalogo.map(p=>p.id).sort());expect(snap.every(i=>i.estoque_referencia===catalogo.find(p=>p.id===i.produto_id).estoque_atual)).toBe(true);
    }
    const r=await api('get','/api/contagens?tipo=pecas_queijo&status=em_andamento&page=2&limit=1');expect(r.status).toBe(200);expect(r.body.data.contagens).toHaveLength(1);expect(r.body.data.contagens[0]).toMatchObject({tipo:'pecas_queijo',status:'em_andamento'});
  });

  it('baixa vencidos do saldo corrente uma vez e registra limite e auditoria', async () => {
    const p = await produto('VENCIDOS_CORRENTE', false, 'Vencidos corrente');
    const id = await iniciar('geral');
    const salvar = await api('put', `/api/contagens/${id}/salvar-progresso`, { fornecedor: 'Vencidos corrente', itens: [{ produto_id: p.id, quantidade_contada: 17, quantidade_vencida: 4 }] });
    expect(salvar.status).toBe(200);
    const aberto = await api('get', `/api/contagens/${id}`);
    const itemAberto = aberto.body.data.contagem.fornecedores.flatMap(f => f.produtos).find(i => i.produto_id === p.id);
    expect(itemAberto.quantidade_vencida).toBe(4);
    expect(itemAberto).not.toHaveProperty('estoque_antes_baixa_vencidos');
    await mockPool.query("UPDATE produtos SET estoque_atual=1, atualizado_em='2020-01-01' WHERE id=$1", [p.id]);
    const fim = await api('put', `/api/contagens/${id}/finalizar`);
    expect(fim.status).toBe(200);
    expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1', [p.id])).rows[0].estoque_atual).toBe(0);
    expect((await mockPool.query('SELECT atualizado_em FROM produtos WHERE id=$1', [p.id])).rows[0].atualizado_em.getFullYear()).toBeGreaterThan(2020);
    expect((await itens(id)).find(i => i.produto_id === p.id)).toMatchObject({ quantidade_vencida: 4, estoque_antes_baixa_vencidos: 1, quantidade_vencida_baixada: 1, diferenca: 0 });
    const finalItem = (await api('get', `/api/contagens/${id}`)).body.data.contagem.fornecedores.flatMap(f => f.produtos).find(i => i.produto_id === p.id);
    expect(finalItem).toMatchObject({ quantidade_vencida_nao_descontada: 3, estoque_apos_baixa_vencidos: 0 });
    expect((await api('put', `/api/contagens/${id}/finalizar`)).status).toBe(404);
    expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1', [p.id])).rows[0].estoque_atual).toBe(0);
    const audit = (await mockPool.query("SELECT dados_novos FROM audit_logs WHERE entidade_id=$1 AND acao='contagem_finalizada'", [id])).rows[0].dados_novos;
    expect(audit).toMatchObject({ total_vencidos: 4, total_baixado: 1, total_nao_descontado: 3 });
  });

  it('falha em item posterior reverte baixa anterior e finalização', async () => {
    const a = await produto('VENCIDOS_ROLLBACK_A', false, 'Vencidos rollback');
    const b = await produto('VENCIDOS_ROLLBACK_B', false, 'Vencidos rollback');
    const id = await iniciar('geral');
    expect((await api('put', `/api/contagens/${id}/salvar-progresso`, { fornecedor: 'Vencidos rollback', itens: [a, b].map(p => ({ produto_id: p.id, quantidade_contada: 17, quantidade_vencida: 2 })) })).status).toBe(200);
    await mockPool.query('DELETE FROM produtos WHERE id=$1', [b.id]);
    expect((await api('put', `/api/contagens/${id}/finalizar`)).status).toBe(409);
    expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1', [a.id])).rows[0].estoque_atual).toBe(17);
    expect((await mockPool.query('SELECT status FROM contagens WHERE id=$1', [id])).rows[0].status).toBe('em_andamento');
    expect((await itens(id)).filter(i => i.produto_id === a.id).every(i => i.diferenca == null && i.quantidade_vencida_baixada == null)).toBe(true);
  });

  it('finalizações concorrentes não duplicam a baixa', async () => {
    const p = await produto('VENCIDOS_CONCORRENTE', false, 'Vencidos concorrente');
    const id = await iniciar('geral');
    expect((await api('put', `/api/contagens/${id}/salvar-progresso`, { fornecedor: 'Vencidos concorrente', itens: [{ produto_id: p.id, quantidade_contada: 17, quantidade_vencida: 2 }] })).status).toBe(200);
    const [a, b] = await Promise.all([api('put', `/api/contagens/${id}/finalizar`), api('put', `/api/contagens/${id}/finalizar`)]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
    expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1', [p.id])).rows[0].estoque_atual).toBe(15);
  });

  it('não baixa produto de outra empresa mesmo se o snapshot for adulterado', async () => {
    const empresaExterna = (await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('Vencidos externa','vencidosexterna@teste.invalid') RETURNING id")).rows[0].id;
    empresasDaFixture.push(empresaExterna);
    const externo = await produto('VENCIDOS_EXTERNO', false, 'Vencidos tenant', empresaExterna);
    const proprio = await produto('VENCIDOS_PROPRIO', false, 'Vencidos tenant');
    const id = await iniciar('geral');
    expect((await api('put', `/api/contagens/${id}/salvar-progresso`, { fornecedor: 'Vencidos tenant', itens: [{ produto_id: proprio.id, quantidade_contada: 17, quantidade_vencida: 2 }] })).status).toBe(200);
    await mockPool.query('UPDATE contagem_itens SET produto_id=$1 WHERE produto_id=$2 AND contagem_fornecedor_id IN (SELECT id FROM contagem_fornecedores WHERE contagem_id=$3)', [externo.id, proprio.id, id]);
    expect((await api('put', `/api/contagens/${id}/finalizar`)).status).toBe(409);
    expect((await mockPool.query('SELECT estoque_atual FROM produtos WHERE id=$1', [externo.id])).rows[0].estoque_atual).toBe(17);
    expect((await mockPool.query('SELECT status FROM contagens WHERE id=$1', [id])).rows[0].status).toBe('em_andamento');
  });
});
