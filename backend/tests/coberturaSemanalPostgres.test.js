const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
let mockPool;
jest.mock('../src/config/db', () => ({ query: (...args) => mockPool.query(...args) }));
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration('Cobertura semanal — PostgreSQL isolado', () => {
  let cobertura, empresaA, empresaB, produtos, aberta;
  const empresas = [];
  const agora = new Date('2026-09-30T12:00:00Z');
  async function produto(codigo, empresa = empresaA, fornecedor = 'Nome antigo') {
    return (await mockPool.query('INSERT INTO produtos(empresa_id,codigo,nome,fornecedor) VALUES($1,$2,$2,$3) RETURNING *', [empresa, codigo, fornecedor])).rows[0];
  }
  async function sessao(ids, status = 'finalizada', tipo = 'geral', timestamp = '2026-09-30T12:00:00Z', quantidade = 1, empresa = empresaA) {
    const c = (await mockPool.query('INSERT INTO contagens(empresa_id,status,tipo,finalizado_em) VALUES($1,$2,$3,$4) RETURNING id', [empresa, status, tipo, agora])).rows[0].id;
    const f = (await mockPool.query("INSERT INTO contagem_fornecedores(contagem_id,fornecedor) VALUES($1,'Snapshot antigo') RETURNING id", [c])).rows[0].id;
    for (const id of ids) await mockPool.query("INSERT INTO contagem_itens(contagem_fornecedor_id,produto_id,codigo,nome,quantidade_contada,contado_em) VALUES($1,$2,'snapshot','Snapshot',$3,$4)", [f, id, quantidade, timestamp]);
    return c;
  }
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!url.pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Exige banco local _test');
    mockPool = new Pool({ connectionString: url.href });
    await mockPool.query(fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8'));
    cobertura = require('../src/services/coberturaSemanalService').obterCoberturaSemanal;
  });
  beforeEach(async () => {
    empresaA = (await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('Cobertura',$1) RETURNING id", ['a-' + require('crypto').randomUUID() + '@test.invalid'])).rows[0].id;
    empresaB = (await mockPool.query("INSERT INTO empresas(nome,email_contato) VALUES('Outra',$1) RETURNING id", ['b-' + require('crypto').randomUUID() + '@test.invalid'])).rows[0].id;
    empresas.push(empresaA, empresaB);
    produtos = [];
    for (let i = 0; i < 12; i++) produtos.push(await produto('P' + String(i).padStart(2, '0')));
    await sessao(produtos.slice(0, 4).map(p => p.id));
    await sessao(produtos.slice(3, 8).map(p => p.id));
    await sessao([produtos[0].id], 'finalizada', 'geral', '2026-09-30T12:00:00Z', 0);
    aberta = await sessao(produtos.slice(8).map(p => p.id), 'em_andamento');
    const externo = await produto('P08', empresaB);
    await sessao([externo.id, produtos[8].id], 'finalizada', 'geral', undefined, 1, empresaB);
  });
  afterAll(async () => {
    if (!mockPool) return;
    try { await mockPool.query('DELETE FROM empresas WHERE id=ANY($1::uuid[])', [empresas]); } finally { await mockPool.end(); }
  });
  it('combina finalizadas sem duplicação e ignora abertas e outra empresa', async () => {
    const r = await cobertura(empresaA, agora);
    expect(r.semana).toEqual({ inicio: '2026-09-28T03:00:00.000Z', fim_exclusivo: '2026-10-05T03:00:00.000Z', fuso: 'America/Sao_Paulo' });
    expect(r.produtores[0]).toMatchObject({ total_produtos: 12, produtos_contados: 8, status: 'parcial' });
    expect(r.produtores[0].produtos_pendentes).toHaveLength(4);
    expect(r.resumo).toEqual({ contados: 0, parciais: 1, pendentes: 0 });
    await mockPool.query('UPDATE contagem_itens SET quantidade_contada=0 WHERE produto_id=$1', [produtos[0].id]);
    expect((await cobertura(empresaA, agora)).produtores[0].produtos_contados).toBe(8);
  });
  it('domingo local não começa semana nova', async () => {
    expect((await cobertura(empresaA, new Date('2026-10-05T02:59:59Z'))).semana.inicio).toBe('2026-09-28T03:00:00.000Z');
    expect((await cobertura(empresaA, new Date('2026-10-05T03:00:00Z'))).produtores[0]).toMatchObject({ status: 'pendente', produtos_contados: 0 });
  });
  it('fecha 12 de 12 e recontagem não aumenta total', async () => {
    await mockPool.query("UPDATE contagens SET status='finalizada' WHERE id=$1", [aberta]);
    await sessao(produtos.map(p => p.id));
    const r = await cobertura(empresaA, agora);
    expect(r.produtores[0]).toMatchObject({ total_produtos: 12, produtos_contados: 12, status: 'contado', produtos_pendentes: [] });
    expect(r.resumo).toEqual({ contados: 1, parciais: 0, pendentes: 0 });
  });
  it('reclassificação exige modo peças', async () => {
    await mockPool.query('UPDATE produtos SET contagem_em_pecas=true WHERE id=$1', [produtos[0].id]);
    expect((await cobertura(empresaA, agora)).produtores[0].produtos_contados).toBe(7);
    await sessao([produtos[0].id], 'finalizada', 'pecas_queijo');
    const r = await cobertura(empresaA, agora);
    expect(r.produtores[0].produtos_contados).toBe(8);
    await mockPool.query('UPDATE produtos SET contagem_em_pecas=true WHERE id=$1', [produtos[8].id]);
    expect((await cobertura(empresaA, agora)).produtores[0].produtos_pendentes[0].tipo).toBe('pecas_queijo');
  });
  it('novo/desativado/renomeado usa catálogo atual', async () => {
    const novo = await produto('Novo');
    expect((await cobertura(empresaA, agora)).produtores[0].total_produtos).toBe(13);
    await mockPool.query('UPDATE produtos SET ativo=false WHERE id=$1', [novo.id]);
    await mockPool.query("UPDATE produtos SET fornecedor='Nome novo' WHERE empresa_id=$1", [empresaA]);
    const r = await cobertura(empresaA, agora);
    expect(r.produtores[0]).toMatchObject({ fornecedor: 'Nome novo', total_produtos: 12, produtos_contados: 8 });
    expect(r.produtores.some(p => p.fornecedor === 'Nome antigo')).toBe(false);
    await produto('A', empresaA, 'A produtor');
    expect((await cobertura(empresaA, agora)).produtores.map(p => p.fornecedor)).toEqual(['A produtor', 'Nome novo']);
  });
  it('finalização tardia usa timestamp do item', async () => {
    await mockPool.query('UPDATE contagem_itens SET contado_em=$1 WHERE produto_id=ANY($2::uuid[])', ['2026-09-28T02:59:59Z', produtos.map(p => p.id)]);
    expect((await cobertura(empresaA, agora)).produtores[0].produtos_contados).toBe(0);
  });
  it('bordas incluem início, excluem fim e ignoram quantidade null', async () => {
    await sessao([produtos[8].id], 'finalizada', 'geral', '2026-09-28T03:00:00Z', 0);
    await sessao([produtos[9].id], 'finalizada', 'geral', '2026-10-05T03:00:00Z');
    await sessao([produtos[10].id], 'finalizada', 'geral', '2026-09-30T12:00:00Z', null);
    await sessao([produtos[11].id], 'cancelada');
    expect((await cobertura(empresaA, agora)).produtores[0].produtos_contados).toBe(9);
  });
  it('empresa sem ativos retorna resumo zerado', async () => {
    await mockPool.query('UPDATE produtos SET ativo=false WHERE empresa_id=$1', [empresaA]);
    expect(await cobertura(empresaA, agora)).toMatchObject({ resumo: { contados: 0, parciais: 0, pendentes: 0 }, produtores: [] });
  });
  it('mede plano em catálogo com centenas de produtos', async () => {
    await mockPool.query("INSERT INTO produtos(empresa_id,codigo,nome,fornecedor) SELECT $1,'L'||n,'Produto '||n,'Escala' FROM generate_series(1,800) n", [empresaA]);
    const ids = (await mockPool.query('SELECT id FROM produtos WHERE empresa_id=$1', [empresaA])).rows.map(p => p.id);
    await sessao(ids);
    await mockPool.query('ANALYZE produtos; ANALYZE contagens; ANALYZE contagem_fornecedores; ANALYZE contagem_itens');
    const db = require('../src/config/db');
    const spy = jest.spyOn(db, 'query');
    await cobertura(empresaA, agora);
    const [sql, params] = spy.mock.calls[0];
    spy.mockRestore();
    const plan = (await mockPool.query('EXPLAIN (ANALYZE, BUFFERS) ' + sql, params)).rows.map(r => r['QUERY PLAN']).join('\n');
    console.log('Cobertura EXPLAIN:\n' + plan);
    expect((await cobertura(empresaA, agora)).produtores.find(p => p.fornecedor === 'Escala')).toMatchObject({ total_produtos: 800, produtos_contados: 800 });
  });
});
