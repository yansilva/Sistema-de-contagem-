const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Salvamento por item (autosave), fila de salvamentos e "Verificar de novo" da contagem.
 * Executa o contagens.js de produção num contexto vm com stubs de DOM e de API.
 */

const script = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/contagens.js'), 'utf8')
  + '\nthis.Contagens = Contagens;';

function criarTela() {
  const elementos = {};
  const elemento = (id) => (elementos[id] ||= {
    id, hidden: false, disabled: false, innerHTML: '', textContent: '', value: '',
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, removeAttribute() {}, focus() {}
  });
  const campos = [{ disabled: false }, { disabled: false }];
  return {
    elementos,
    campos,
    document: {
      getElementById: (id) => elemento(id),
      querySelectorAll: (seletor) => (seletor.includes('.input-qtd-fisica') ? campos : []),
      addEventListener() {}
    }
  };
}

function carregar(respostas = {}) {
  const tela = criarTela();
  const api = {
    put: jest.fn(respostas.put || (async () => ({ success: true }))),
    get: jest.fn(respostas.get || (async () => ({ success: true, data: { contagem: { estoque_desatualizado: false } } })))
  };
  const ctx = {
    document: tela.document, API: api, showToast: jest.fn(), showScreen: jest.fn(),
    escapeHtml: (s) => String(s), pluralizar: (n, s, p) => n + ' ' + (n === 1 ? s : p), console
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  const C = ctx.Contagens;
  C.renderizarItensContagem = jest.fn();
  C.aplicarDadosSessao = jest.fn();
  C.contagemId = 'contagem-1';
  C.fornecedorAtual = 'Produtor';
  C.tipoAtual = 'geral';
  C.dadosSessao = { fornecedores: [{ fornecedor: 'Produtor', produtos: [
    { produto_id: 'p1', quantidade_contada: null, quantidade_vencida: 0 },
    { produto_id: 'p2', quantidade_contada: null, quantidade_vencida: 0 }
  ] }] };
  C.itensFornecedor = [
    { produto_id: 'p1', codigo: 'P1', nome: 'Queijo 1', quantidade_contada: null, salvoQuantidade: null, quantidade_vencida: 0 },
    { produto_id: 'p2', codigo: 'P2', nome: 'Queijo 2', quantidade_contada: null, salvoQuantidade: null, quantidade_vencida: 0 }
  ];
  return { C, api, ctx, tela };
}

const digitar = (C, index, valor) => {
  C.itensFornecedor[index].quantidade_contada = valor;
  C.itensTocados.add(C.itensFornecedor[index].produto_id);
};

describe('Salvamento por item (autosave) da contagem', () => {
  it('ao sair do campo envia só aquele item, sem redesenhar a lista', async () => {
    const { C, api } = carregar();
    digitar(C, 0, 5);

    const ok = await C.salvarItemAutomatico(0);

    expect(ok).toBe(true);
    expect(api.put).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.put.mock.calls[0];
    expect(url).toBe('/contagens/contagem-1/salvar-progresso');
    expect(corpo).toEqual({ fornecedor: 'Produtor', itens: [{ produto_id: 'p1', quantidade_contada: 5, quantidade_vencida: 0 }] });
    expect(C.renderizarItensContagem).not.toHaveBeenCalled();
    expect(C.itensTocados.has('p1')).toBe(false);
    expect(C.dadosSessao.fornecedores[0].produtos[0].quantidade_contada).toBe(5);
    expect(C.edicaoPendente).toBe(false);
  });

  it('não envia quando o valor é igual ao último salvo nem quando é inválido', async () => {
    const { C, api } = carregar();
    C.itensFornecedor[0].salvoQuantidade = 5;
    digitar(C, 0, 5);
    expect(await C.salvarItemAutomatico(0)).toBe(false);

    digitar(C, 1, 3);
    C.entradasInvalidas.add(1);
    expect(await C.salvarItemAutomatico(1)).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('fila: dois autosaves não rodam ao mesmo tempo e a segunda requisição espera a primeira', async () => {
    let liberar;
    const primeira = new Promise((resolve) => { liberar = resolve; });
    const { C, api } = carregar({ put: jest.fn()
      .mockImplementationOnce(() => primeira)
      .mockImplementationOnce(async () => ({ success: true })) });
    digitar(C, 0, 1);
    digitar(C, 1, 2);

    const a = C.salvarItemAutomatico(0);
    const b = C.salvarItemAutomatico(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(api.put).toHaveBeenCalledTimes(1);

    liberar({ success: true });
    await Promise.all([a, b]);
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(api.put.mock.calls[1][1].itens[0].produto_id).toBe('p2');
  });

  it('409 ESTOQUE_DESATUALIZADO: trava a digitação, mantém o valor digitado e não envia de novo', async () => {
    const { C, api, tela } = carregar({ put: async () => ({ success: false, code: 'ESTOQUE_DESATUALIZADO', message: 'parada' }) });
    digitar(C, 0, 7);

    expect(await C.salvarItemAutomatico(0)).toBe(false);

    expect(C.estoqueDesatualizado).toBe(true);
    expect(tela.document.getElementById('contagem-aviso-estoque').hidden).toBe(false);
    expect(C.itensFornecedor[0].quantidade_contada).toBe(7);
    expect(C.itensTocados.has('p1')).toBe(true);
    expect(await C.salvarItemAutomatico(1)).toBe(false);
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('erro de rede no autosave não perde o valor nem marca como salvo', async () => {
    const { C } = carregar({ put: async () => { throw new Error('offline'); } });
    digitar(C, 0, 4);
    expect(await C.salvarItemAutomatico(0)).toBe(false);
    expect(C.itensFornecedor[0].quantidade_contada).toBe(4);
    expect(C.itensFornecedor[0].salvoQuantidade).toBeNull();
    expect(C.itensTocados.has('p1')).toBe(true);
  });
});

describe('"Verificar de novo" no aviso de estoque desatualizado', () => {
  it('se o gestor já importou, destrava sem recarregar e mantém os valores digitados', async () => {
    const respostas = [
      { success: true, data: { contagem: { estoque_desatualizado: true } } },
      { success: true, data: { contagem: { estoque_desatualizado: false } } }
    ];
    const { C, api, tela } = carregar({ get: async () => respostas.shift() });
    C.estoqueDesatualizado = true;
    digitar(C, 0, 9);

    await C.verificarEstoqueNovamente();
    expect(C.estoqueDesatualizado).toBe(true);
    expect(tela.document.getElementById('contagem-aviso-estoque').hidden).toBe(false);

    await C.verificarEstoqueNovamente();
    expect(api.get).toHaveBeenLastCalledWith('/contagens/contagem-1');
    expect(C.estoqueDesatualizado).toBe(false);
    expect(tela.document.getElementById('contagem-aviso-estoque').hidden).toBe(true);
    expect(C.itensFornecedor[0].quantidade_contada).toBe(9);
    expect(C.itensTocados.has('p1')).toBe(true);
    // não reaplica os dados do servidor: a digitação não some
    expect(C.aplicarDadosSessao).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('ao sair de uma sessão travada, campos e botão voltam ao normal (sem resíduo da sessão anterior)', () => {
    const { C, tela } = carregar();
    C.estoqueDesatualizado = true;
    C.atualizarAvisoEstoque();
    expect(tela.campos.every((c) => c.disabled)).toBe(true);
    expect(tela.document.getElementById('btn-salvar-progresso-produtor').disabled).toBe(true);

    C.estoqueDesatualizado = false;
    C.atualizarAvisoEstoque();
    expect(tela.campos.every((c) => c.disabled)).toBe(false);
    expect(tela.document.getElementById('btn-salvar-progresso-produtor').disabled).toBe(false);
    expect(tela.document.getElementById('contagem-aviso-estoque').hidden).toBe(true);
  });

  it('depois de destravar, o próximo salvamento volta a funcionar', async () => {
    const { C, api } = carregar();
    C.estoqueDesatualizado = true;
    C.atualizarAvisoEstoque();
    C.estoqueDesatualizado = false;
    digitar(C, 1, 6);
    expect(await C.salvarItemAutomatico(1)).toBe(true);
    expect(api.put.mock.calls[0][1].itens[0]).toMatchObject({ produto_id: 'p2', quantidade_contada: 6 });
  });
});
