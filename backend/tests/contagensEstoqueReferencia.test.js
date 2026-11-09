const request = require('supertest');
const { gerarAccessToken } = require('../src/config/jwt');
const { state, resetMockDb } = require('../src/config/mockDb');
const app = require('../src/app');

/**
 * Referência de estoque por item e pausa da contagem.
 * Usa o mock em memória (NODE_ENV=test), que guarda o estado entre as chamadas HTTP.
 * O SQL real (UPDATE com referência condicional e consulta de situação) é validado contra o Postgres local.
 */

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const FUNCIONARIO = '33333333-3333-3333-3333-333333333333';
const CONTAGEM = '44444444-4444-4444-4444-444444444444';
const FORNECEDOR = '66666666-6666-4666-8666-666666666666';
const P1 = '11111111-aaaa-4aaa-8aaa-111111111111';
const P2 = '22222222-aaaa-4aaa-8aaa-222222222222';
const HORA = 60 * 60 * 1000;

let token;

const ha = (ms) => new Date(Date.now() - ms);

function produto(id, codigo, nome, estoque) {
  return { id, empresa_id: EMPRESA, codigo, nome, fornecedor: 'Produtor', estoque_atual: estoque, ativo: true, criado_em: ha(0).toISOString(), atualizado_em: ha(0).toISOString() };
}

/**
 * Monta uma contagem em andamento com dois itens.
 * `iniciadaHa`: quando a sessão começou. `itens`: sobrescreve campos de cada item pelo produto_id.
 */
function semear({ iniciadaHa = 0, tipo = 'geral', itens = {} } = {}) {
  resetMockDb();
  state.empresas.push({ id: EMPRESA, nome: 'Empresa Teste', email_contato: 'empresa@teste.com', plano: 'ativo', status: 'ativa', tipo: 'cliente', trial_expira_em: null, excluida_em: null, criado_em: ha(0).toISOString() });
  state.usuarios.push({ id: FUNCIONARIO, empresa_id: EMPRESA, nome: 'Funcionário', email: 'func@teste.com', senha_hash: 'x', papel: 'funcionario', ativo: true, versao_sessao: 1, must_change_password: false, criado_em: ha(0).toISOString(), atualizado_em: ha(0).toISOString() });
  state.produtos.push(produto(P1, 'P1', 'Queijo Tulha', 10), produto(P2, 'P2', 'Queijo Regente', 10));
  state.contagens.push({ id: CONTAGEM, empresa_id: EMPRESA, iniciado_por: FUNCIONARIO, status: 'em_andamento', tipo, tem_diferenca: false, iniciado_em: ha(iniciadaHa), finalizado_em: null });
  state.contagemFornecedores.push({ id: FORNECEDOR, contagem_id: CONTAGEM, fornecedor: 'Produtor', tem_diferenca: false, contado_em: ha(0).toISOString() });
  for (const p of [P1, P2]) {
    state.contagemItens.push({
      id: `item-${p}`, contagem_fornecedor_id: FORNECEDOR, produto_id: p,
      codigo: p === P1 ? 'P1' : 'P2', nome: p === P1 ? 'Queijo Tulha' : 'Queijo Regente',
      estoque_referencia: tipo === 'pecas_queijo' ? null : 10,
      quantidade_contada: null, quantidade_vencida: 0, diferenca: null, situacao: null, contado_em: null,
      ...itens[p]
    });
  }
}

const item = (produtoId) => state.contagemItens.find((i) => i.produto_id === produtoId);
const contagem = () => state.contagens.find((c) => c.id === CONTAGEM);
const estoqueDe = (produtoId, estoque) => { state.produtos.find((p) => p.id === produtoId).estoque_atual = estoque; };

const salvar = (itens) => request(app)
  .put(`/api/contagens/${CONTAGEM}/salvar-progresso`)
  .set('Authorization', `Bearer ${token}`)
  .send({ fornecedor: 'Produtor', itens });

const detalhe = () => request(app)
  .get(`/api/contagens/${CONTAGEM}`)
  .set('Authorization', `Bearer ${token}`);

// Importação de estoque do ERP registrada depois de `ha(atrasoMs)`: horário explícito, sem depender do relógio do teste.
function importacaoEm(criadoEm) {
  state.historicoImportacaoEstoque.push({ id: `imp-${criadoEm.getTime()}`, empresa_id: EMPRESA, usuario_id: null, nome_arquivo: 'estoque.pdf', produtos_encontrados: 2, produtos_atualizados: 2, skus_nao_encontrados: '[]', linhas_ignoradas: 0, status: 'concluido', criado_em: criadoEm.toISOString() });
}

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo_de_teste_super_seguro_1234567890';
  token = gerarAccessToken({ id: FUNCIONARIO, empresa_id: EMPRESA });
});

describe('Referência de estoque por item (salvar-progresso)', () => {
  it('(a) item salvo depois de uma importação usa o estoque novo; o salvo antes mantém o antigo', async () => {
    semear();
    const antes = await salvar([{ produto_id: P1, quantidade_contada: 5 }]);
    expect(antes.status).toBe(200);
    expect(item(P1).estoque_referencia).toBe(10);

    // O gestor importa o PDF: o estoque muda e a importação fica depois da última atividade.
    estoqueDe(P1, 15);
    estoqueDe(P2, 15);
    importacaoEm(new Date(Date.now() + 1000));

    const depois = await salvar([{ produto_id: P2, quantidade_contada: 3 }]);
    expect(depois.status).toBe(200);
    expect(item(P2).estoque_referencia).toBe(15);
    expect(item(P1).estoque_referencia).toBe(10);
  });

  it('(d) quantidade igual à gravada não muda a referência; quantidade diferente pega o estoque do instante', async () => {
    semear({ itens: { [P1]: { quantidade_contada: 5, estoque_referencia: 10, contado_em: ha(1000) } } });
    estoqueDe(P1, 15);

    const mesma = await salvar([{ produto_id: P1, quantidade_contada: 5 }]);
    expect(mesma.status).toBe(200);
    expect(item(P1).estoque_referencia).toBe(10);

    const outra = await salvar([{ produto_id: P1, quantidade_contada: 6 }]);
    expect(outra.status).toBe(200);
    expect(item(P1).quantidade_contada).toBe(6);
    expect(item(P1).estoque_referencia).toBe(15);
  });

  it('(d) peças não recebem referência de estoque', async () => {
    semear({ tipo: 'pecas_queijo' });
    const res = await salvar([{ produto_id: P1, quantidade_contada: 4 }]);
    expect(res.status).toBe(200);
    expect(item(P1).quantidade_contada).toBe(4);
    expect(item(P1).estoque_referencia).toBeNull();
  });
});

describe('Pausa de 1 hora sem salvar (ESTOQUE_DESATUALIZADO)', () => {
  it('(b) salvar depois de mais de 60 min sem importação posterior devolve 409 e não grava nada', async () => {
    semear({ iniciadaHa: 3 * HORA, itens: { [P1]: { quantidade_contada: 5, contado_em: ha(2 * HORA) } } });

    const res = await salvar([{ produto_id: P2, quantidade_contada: 2 }]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ESTOQUE_DESATUALIZADO');
    expect(res.body.message).toMatch(/parada por mais de 1 hora/);
    expect(item(P2).quantidade_contada).toBeNull();
    expect(item(P2).estoque_referencia).toBe(10);
    expect(contagem().status).toBe('em_andamento');
  });

  it('(b) sessão sem nenhum item salvo conta a pausa a partir do início', async () => {
    semear({ iniciadaHa: 2 * HORA });
    const res = await salvar([{ produto_id: P1, quantidade_contada: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ESTOQUE_DESATUALIZADO');
  });

  it('(c) depois de mais de 60 min, mas com importação posterior à última atividade, libera e usa o estoque novo', async () => {
    semear({ iniciadaHa: 3 * HORA, itens: { [P1]: { quantidade_contada: 5, contado_em: ha(2 * HORA) } } });
    estoqueDe(P2, 12);
    importacaoEm(ha(HORA));

    const res = await salvar([{ produto_id: P2, quantidade_contada: 2 }]);

    expect(res.status).toBe(200);
    expect(item(P2).estoque_referencia).toBe(12);
    expect(item(P1).estoque_referencia).toBe(10);
  });

  it('importação anterior à última atividade não libera a sessão parada', async () => {
    semear({ iniciadaHa: 4 * HORA, itens: { [P1]: { quantidade_contada: 5, contado_em: ha(2 * HORA) } } });
    importacaoEm(ha(3 * HORA));

    const res = await salvar([{ produto_id: P2, quantidade_contada: 2 }]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ESTOQUE_DESATUALIZADO');
  });

  it('dentro de 60 min não há bloqueio, mesmo sem importação', async () => {
    semear({ iniciadaHa: 2 * HORA, itens: { [P1]: { quantidade_contada: 5, contado_em: ha(30 * 60 * 1000) } } });
    const res = await salvar([{ produto_id: P2, quantidade_contada: 2 }]);
    expect(res.status).toBe(200);
  });
});

describe('Salvamento por item (autosave) e pausa', () => {
  it('atividade contínua com autosave não bloqueia: último item salvo há 10 min, contagem iniciada há 2 h', async () => {
    semear({ iniciadaHa: 2 * HORA, itens: { [P1]: { quantidade_contada: 5, estoque_referencia: 10, contado_em: ha(10 * 60 * 1000) } } });

    const res = await salvar([{ produto_id: P2, quantidade_contada: 2 }]);

    expect(res.status).toBe(200);
    expect(item(P2).quantidade_contada).toBe(2);
    expect(item(P2).estoque_referencia).toBe(10);
  });

  it('salvamento de um item só grava apenas esse item e não mexe nos demais', async () => {
    semear({ itens: { [P1]: { quantidade_contada: 5, estoque_referencia: 10, contado_em: ha(1000) } } });
    estoqueDe(P2, 15);

    const res = await salvar([{ produto_id: P2, quantidade_contada: 4 }]);

    expect(res.status).toBe(200);
    expect(res.body.data.itens_salvos).toBe(1);
    expect(item(P2)).toMatchObject({ quantidade_contada: 4, estoque_referencia: 15 });
    expect(item(P1)).toMatchObject({ quantidade_contada: 5, estoque_referencia: 10 });
  });
});

describe('Indicador de estoque desatualizado e contagem cega', () => {
  it('detalhe de sessão parada informa estoque_desatualizado e a última atividade', async () => {
    semear({ iniciadaHa: 3 * HORA, itens: { [P1]: { quantidade_contada: 5, contado_em: ha(2 * HORA) } } });

    const res = await detalhe();

    expect(res.status).toBe(200);
    expect(res.body.data.contagem.estoque_desatualizado).toBe(true);
    expect(typeof res.body.data.contagem.ultima_atividade).toBe('string');
    expect(new Date(res.body.data.contagem.ultima_atividade).getTime()).toBe(item(P1).contado_em.getTime());
  });

  it('detalhe com importação posterior informa estoque_desatualizado false', async () => {
    semear({ iniciadaHa: 3 * HORA, itens: { [P1]: { quantidade_contada: 5, contado_em: ha(2 * HORA) } } });
    importacaoEm(ha(HORA));
    const res = await detalhe();
    expect(res.body.data.contagem.estoque_desatualizado).toBe(false);
  });

  it('(e) a referência não aparece para o funcionário enquanto a contagem está em andamento', async () => {
    semear({ itens: { [P1]: { quantidade_contada: 5, estoque_referencia: 10, contado_em: ha(1000) } } });
    estoqueDe(P1, 15);
    await salvar([{ produto_id: P1, quantidade_contada: 6 }]);
    expect(item(P1).estoque_referencia).toBe(15);

    const res = await detalhe();
    const corpo = JSON.stringify(res.body);

    expect(res.status).toBe(200);
    expect(corpo).not.toMatch(/estoque_referencia/);
    expect(corpo).not.toMatch(/"diferenca"/);
    expect(corpo).not.toMatch(/"situacao"/);
    expect(corpo).not.toMatch(/"sem_diferenca"/);
    expect(res.body.data.contagem.produtos).toBeUndefined();
    const produtos = res.body.data.contagem.fornecedores[0].produtos;
    expect(produtos.find((p) => p.produto_id === P1).quantidade_contada).toBe(6);
  });
});
