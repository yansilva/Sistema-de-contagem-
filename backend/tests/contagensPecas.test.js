const request = require('supertest');
const db = require('../src/config/db');
const { gerarAccessToken } = require('../src/config/jwt');
const { serializeItem, serializeContagemDetalhe } = require('../src/serializers/contagemSerializer');
jest.mock('../src/config/db', () => ({ query:jest.fn(), getClient:jest.fn(), pool:{connect:jest.fn().mockRejectedValue(new Error('no local db'))} }));
const app = require('../src/app');
const empresaId='11111111-1111-4111-8111-111111111111', usuarioId='22222222-2222-4222-8222-222222222222';
const contagemId='33333333-3333-4333-8333-333333333333';
let token;
beforeAll(()=>{token=gerarAccessToken({id:usuarioId,empresa_id:empresaId});});
beforeEach(()=>{jest.resetAllMocks();db.getClient.mockResolvedValue({query:jest.fn().mockResolvedValue({rows:[]}),release:jest.fn()});db.query.mockResolvedValueOnce({rows:[{id:usuarioId,empresa_id:empresaId,papel:'funcionario',ativo:true,plano:'ativo'}]});});
test.each(['administrador','funcionario'])('peças omitem comparação com kg para %s',papel=>{
  for(const finalizada of [false,true]) {
    const item=serializeItem({quantidade_contada:0,estoque_referencia:17,diferenca:-17,situacao:'falta'},{papel},finalizada,'pecas_queijo');
    expect(item.quantidade_contada).toBe(0);
    for(const key of ['estoque_referencia','diferenca','situacao','sem_diferenca','tem_diferenca']) expect(item).not.toHaveProperty(key);
    const c=serializeContagemDetalhe({tipo:'pecas_queijo',status:finalizada?'finalizada':'em_andamento',tem_diferenca:true},[{tem_diferenca:true,produtos:[{quantidade_contada:null}]}],{papel});
    expect(c.tipo).toBe('pecas_queijo');expect(c).not.toHaveProperty('tem_diferenca');expect(c.fornecedores[0]).not.toHaveProperty('tem_diferenca');
    expect(c.fornecedores[0].produtos[0].quantidade_contada).toBeNull();
  }
});
test('tipo inválido na criação e filtros inválidos são recusados',async()=>{
  const criar=await request(app).post('/api/contagens').set('Authorization','Bearer '+token).send({tipo:'kg'});
  expect(criar.status).toBe(400);expect(db.getClient).not.toHaveBeenCalled();
  for(const query of ['tipo=kg','status=desconhecido']) {
    db.query.mockResolvedValueOnce({rows:[{id:usuarioId,empresa_id:empresaId,papel:'funcionario',ativo:true,plano:'ativo'}]});
    expect((await request(app).get('/api/contagens?'+query).set('Authorization','Bearer '+token)).status).toBe(400);
  }
});
test.each([-1,1.5])('quantidade inválida %s é recusada',async quantidade_contada=>{
  const r=await request(app).put('/api/contagens/'+contagemId+'/salvar-progresso').set('Authorization','Bearer '+token).send({fornecedor:'Queijaria',itens:[{produto_id:usuarioId,quantidade_contada}]});
  expect(r.status).toBe(400);expect(db.getClient).not.toHaveBeenCalled();
});
test('corpos de progresso e compatibilidade não permitem mudar modalidade',async()=>{
  for(const route of ['salvar-progresso','fornecedor']) {
    if(route==='fornecedor') db.query.mockResolvedValueOnce({rows:[{id:usuarioId,empresa_id:empresaId,papel:'funcionario',ativo:true,plano:'ativo'}]});
    const req=route==='fornecedor'?request(app).post('/api/contagens/'+contagemId+'/'+route):request(app).put('/api/contagens/'+contagemId+'/'+route);
    const r=await req.set('Authorization','Bearer '+token).send({fornecedor:'Queijaria',tipo:'pecas_queijo',...(route==='fornecedor'?{produtos:[{codigo:'A',nome:'A',quantidade_contada:0}]}:{itens:[{produto_id:usuarioId,quantidade_contada:0}]})});
    expect(r.status).toBe(400);
  }
});
