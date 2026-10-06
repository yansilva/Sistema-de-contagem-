const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFrontendEvents } = require('./helpers/frontendEvents');
const frontend = path.resolve(__dirname, '../../frontend');
const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');

describe('Modalidade de peças', () => {
  let context;
  let elements;
  let api;
  let auth;
  let consulta;
  let dispatch;

  beforeEach(() => {
    elements = new Map();
    for (const [, tag, id] of html.matchAll(/(<[^>]*\bid="([^"]+)"[^>]*>)/g)) {
      const classes = new Set((tag.match(/class="([^"]*)"/)?.[1] || '').split(' '));
      elements.set(id, {
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        dataset: {},
        hidden: /\bhidden(?:\s|>)/.test(tag),
        admin: tag.includes('data-admin-only'),
        classes,
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          contains: (c) => classes.has(c)
        },
        scrollIntoView: jest.fn(), focus: jest.fn(), setAttribute: jest.fn(),
        open: false,
        showModal: jest.fn(function () { this.open = true; }),
        close: jest.fn(function () { this.open = false; })
      });
    }
    api = {
      get: jest
        .fn()
        .mockResolvedValue({
          success: true,
          data: { produtos: [], fornecedores: [], contagens: [], pagination: { total: 0 } }
        }),
      post: jest.fn(),
      put: jest.fn(),
      download: jest.fn()
    };
    context = vm.createContext({
      document: {
        getElementById: (id) => elements.get(id) || null,
        querySelectorAll: (selector) =>
          [...elements.values()].filter((e) =>
            selector === '[data-admin-only]' ? e.admin : e.classes.has(selector.slice(1))
          ),
        querySelector: () => null,
        addEventListener: jest.fn()
      },
      window: { scrollTo: jest.fn() },
      confirm: jest.fn(() => true),
      localStorage: { getItem: jest.fn(), setItem: jest.fn() },
      sessionStorage: { getItem: jest.fn(), setItem: jest.fn() },
      URLSearchParams,
      API: api,
      Produtos: { carregar: jest.fn() },
      Historico: { carregar: jest.fn() },
      Usuarios: { carregar: jest.fn() },
      StockImport: { carregarHistorico: jest.fn() },
      Atividades: { carregar: jest.fn() }
    });
    for (const file of ['utils.js', 'auth.js', 'consulta.js', 'contagens.js', 'app.js', 'produtos.js', 'historico.js']) {
      vm.runInContext(fs.readFileSync(path.join(frontend, 'js', file), 'utf8'), context);
    }
    vm.runInContext(
      'globalThis.auth = Auth; globalThis.consulta = Consulta; globalThis.contagens = Contagens; globalThis.produtos = Produtos; globalThis.historico = Historico;',
      context
    );
    context.showToast = jest.fn();
    dispatch = loadFrontendEvents(context);
    auth = context.auth;
    consulta = context.consulta;
    auth.usuario = { nome: 'Equipe', papel: 'funcionario', mustChangePassword: false };
    auth.empresa = { nome: 'Loja' };
  });

  const session = (tipo = 'pecas_queijo', id = 'pecas') => ({ id, tipo, status: 'em_andamento', fornecedores: [{ fornecedor: 'Produtor', produtos: [{ produto_id: 'sku', nome: 'Queijo', codigo: 'Q', quantidade_contada: null }] }] });
  it('explica data por produto e usa contêineres e legendas compatíveis com os valores exibidos', () => {
    expect(html).toContain('produtos ativos com quantidade registrada nesta semana em sessões finalizadas');
    for (const id of ['screen-semana-contagem', 'screen-importar-estoque']) {
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*>\\s*<div class="container consulta-container">`));
    }
    expect(html).toContain('Sessões recentes');
    expect(html.includes('Sessões disponíveis no painel')).toBe(true);
    expect(html).toContain('Última sessão disponível');
    expect(html).toContain('Sessões exibidas:');
    expect(html).not.toContain('Total de contagens finalizadas:');
  });
  it('retomada envia somente registros tocados, incluindo mesmo valor, zero e limpeza', async () => {
    const c = session();
    c.fornecedores[0].produtos = [
      { produto_id: 'antigo', codigo: 'A', nome: 'Antigo', quantidade_contada: 5 },
      { produto_id: 'novo', codigo: 'B', nome: 'Novo', quantidade_contada: null },
      { produto_id: 'limpar', codigo: 'C', nome: 'Limpar', quantidade_contada: 9 }
    ];
    api.get.mockResolvedValue({ success: true, data: { contagem: c } });
    api.put.mockImplementation(async (url, payload) => {
      for (const item of payload.itens) {
        c.fornecedores[0].produtos.find(p => p.produto_id === item.produto_id).quantidade_contada = item.quantidade_contada;
      }
      return { success: true };
    });
    await context.contagens.continuarSessao(c.id);
    expect(elements.get('screen-contagem').classes.has('active')).toBe(true);
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(1, '0');
    await context.contagens.salvarProgressoAtual();
    expect(elements.get('bloco-produtos-contagem').open).toBe(false);
    expect(context.showToast).toHaveBeenCalledWith('Progresso salvo para Produtor!', 'success');
    expect(api.put).toHaveBeenLastCalledWith('/contagens/pecas/salvar-progresso', {
      fornecedor: 'Produtor', itens: [{ produto_id: 'novo', quantidade_contada: 0 }]
    });
    api.put.mockClear();
    context.contagens.selecionarFornecedor('Produtor');
    const modal = elements.get('bloco-produtos-contagem');
    const closesBeforeNoop = modal.close.mock.calls.length;
    await context.contagens.salvarProgressoAtual();
    expect(api.put).not.toHaveBeenCalled();
    expect(modal.close).toHaveBeenCalledTimes(closesBeforeNoop + 1);
    expect(modal.open).toBe(false);
    expect(context.showToast).toHaveBeenCalledWith('Nenhuma alteração pendente para este produtor.', 'info');
    context.contagens.atualizarQuantidadeItem(0, '5');
    context.contagens.atualizarQuantidadeItem(2, '');
    await context.contagens.salvarProgressoAtual();
    expect(api.put).toHaveBeenLastCalledWith('/contagens/pecas/salvar-progresso', {
      fornecedor: 'Produtor', itens: [
        { produto_id: 'antigo', quantidade_contada: 5 },
        { produto_id: 'limpar', quantidade_contada: null }
      ]
    });
  });
  it('falha e cancelamento conservam os registros tocados; descarte limpa a intenção', async () => {
    const c = session();
    c.fornecedores[0].produtos.push({ produto_id: 'intocado', codigo: 'I', nome: 'Intocado', quantidade_contada: 8 });
    api.get.mockResolvedValue({ success: true, data: { contagem: c } });
    await context.contagens.continuarSessao(c.id);
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(0, '0');
    api.put.mockResolvedValueOnce({ success: false });
    expect(elements.get('bloco-produtos-contagem').open).toBe(true);
    expect(await context.contagens.salvarProgressoAtual()).toBe(false);
    expect(elements.get('bloco-produtos-contagem').open).toBe(true);
    context.contagens.protegerEdicao(() => {});
    await context.contagens.resolverEdicao('cancelar');
    api.put.mockResolvedValueOnce({ success: true });
    await context.contagens.salvarProgressoAtual();
    expect(api.put).toHaveBeenLastCalledWith('/contagens/pecas/salvar-progresso', {
      fornecedor: 'Produtor', itens: [{ produto_id: 'sku', quantidade_contada: 0 }]
    });
    context.contagens.atualizarQuantidadeItem(1, '8');
    context.contagens.protegerEdicao(() => {});
    await context.contagens.resolverEdicao('descartar');
    api.put.mockClear();
    await context.contagens.salvarProgressoAtual();
    expect(api.put).not.toHaveBeenCalled();
  });
  it('fecha o produtor após PUT confirmado mesmo se a recarga da sessão falhar', async () => {
    const c = session();
    api.get.mockResolvedValueOnce({ success: true, data: { contagem: c } })
      .mockRejectedValueOnce(new Error('offline'));
    api.put.mockResolvedValue({ success: true });
    await context.contagens.continuarSessao(c.id);
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(0, '0');

    expect(await context.contagens.salvarProgressoAtual()).toBe(true);

    expect(elements.get('bloco-produtos-contagem').open).toBe(false);
    expect(context.showToast).toHaveBeenCalledWith('Progresso salvo para Produtor!', 'success');
    expect(context.showToast).toHaveBeenCalledWith('Progresso salvo, mas não foi possível atualizar a tela.', 'error');
  });
  it.each(['em_andamento', 'finalizada'])('admin distingue peças %s em cartão, detalhe e recentes', async status => {
    auth.usuario.papel = 'administrador';
    const c = session();
    c.status = status;
    const estado = status === 'finalizada' ? 'Finalizada' : 'Em andamento';
    const classe = status === 'finalizada' ? 'badge-success' : 'badge-warning';
    context.historico.contagens = [c];
    context.historico.renderizar();
    const card = elements.get('lista-historico').innerHTML;
    expect(card).toContain('Peças de queijo');
    expect(card).toContain(estado);
    expect(card).toContain(classe);
    if (status === 'em_andamento') expect(card).toContain('ti-clock');
    elements.set('hist-card-pecas', { classList: { contains: () => false, add: jest.fn() } });
    elements.set('hist-body-pecas', { innerHTML: '' });
    api.get.mockImplementation(async url => ({ success: true, data: url === '/contagens/pecas' ? { contagem: c } : { contagens: [c] } }));
    await context.historico.toggleDetalhes(c.id);
    const detalhe = elements.get('hist-body-pecas').innerHTML;
    expect(detalhe).toContain('Peças de queijo');
    expect(detalhe).toContain(estado);
    expect(detalhe).toContain(classe);
    await vm.runInContext('carregarDashboard()', context);
    const recentes = elements.get('admin-recent-tbody').innerHTML;
    expect(recentes).toContain('Peças de queijo');
    expect(recentes).toContain(estado);
    expect(recentes).toContain(classe);
    for (const rendered of [card, detalhe, recentes]) expect(rendered).not.toMatch(/Estoque:|diferença|divergência|Excel|kg/i);
  });
  it('troca de aba por evento preserva sessão e não cria ou finaliza contagem', async () => {
    context.contagens.contagemId = 'geral-ativa';
    await context.contagens.abrirModalidade('geral');
    dispatch('click', '<button data-click="contagem-modalidade" data-tipo="pecas_queijo">');
    await Promise.resolve();
    expect(context.contagens.contagemId).toBe('geral-ativa');
    expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith('/contagens?tipo=pecas_queijo&status=em_andamento&page=1&limit=20');
  });
  it('nova sessão envia modalidade e continuar restaura tipo persistido', async () => {
    api.post.mockResolvedValue({ success: true, data: { contagem: session() } });
    api.get.mockResolvedValue({ success: true, data: { contagem: session() } });
    await context.contagens.iniciarNovaSessao('pecas_queijo');
    expect(api.post).toHaveBeenCalledWith('/contagens', { tipo: 'pecas_queijo' });
    expect(context.contagens.tipoAtual).toBe('pecas_queijo');
    api.get.mockResolvedValue({ success: true, data: { contagem: session('geral', 'antiga') } });
    await context.contagens.continuarSessao('antiga');
    expect(context.contagens.tipoAtual).toBe('geral');
  });
  it('página dois e falha de carregamento permitem repetir', async () => {
    await context.contagens.abrirModalidade('pecas_queijo');
    api.get.mockRejectedValueOnce(new Error('offline'));
    await context.contagens.carregarSessoesAbertas(2);
    expect(api.get).toHaveBeenCalledWith('/contagens?tipo=pecas_queijo&status=em_andamento&page=2&limit=20');
    expect(elements.get('contagem-sessoes-lista').innerHTML).toContain('Tentar novamente');
  });
  it('frações impedem salvamento e troca oferece salvar ou descartar', async () => {
    api.get.mockResolvedValue({ success: true, data: { contagem: session() } });
    await context.contagens.continuarSessao('pecas');
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(0, '1.5');
    await context.contagens.salvarProgressoAtual();
    expect(api.put).not.toHaveBeenCalled();
    await context.contagens.continuarSessao('outra');
    expect(context.contagens.contagemId).toBe('pecas');
    expect(elements.get('contagem-edicao-pendente').open).toBe(true);
  });
  it('salvar antes de continuar mantém a sessão quando falha e envia zero ao recuperar', async () => {
    const c = session();
    api.get.mockImplementation(async url => ({success: true, data: {contagem: url.endsWith('/outra') ? session('geral', 'outra') : c}}));
    await context.contagens.continuarSessao(c.id);
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(0, '0');
    await context.contagens.continuarSessao('outra');
    api.put.mockResolvedValueOnce({success: false});
    await context.contagens.resolverEdicao('salvar');
    expect(context.contagens.contagemId).toBe(c.id);
    expect(elements.get('contagem-edicao-pendente').open).toBe(true);
    api.put.mockResolvedValueOnce({success: true});
    await context.contagens.resolverEdicao('salvar');
    expect(api.put).toHaveBeenLastCalledWith('/contagens/pecas/salvar-progresso', {fornecedor: 'Produtor', itens: [{produto_id: 'sku', quantidade_contada: 0}]});
    expect(context.contagens.contagemId).toBe('outra');
    expect(context.contagens.tipoAtual).toBe('geral');
  });
  it('bloqueia entrada e troca de sessão até PUT e recarregamento terminarem', async () => {
    const c = session();
    api.get.mockResolvedValue({success: true, data: {contagem: c}});
    await context.contagens.continuarSessao(c.id);
    context.contagens.selecionarFornecedor('Produtor');
    const input = {value: '3', disabled: false, classes: new Set(['input-qtd-fisica'])};
    elements.set('qtd-fisica-0', input);
    context.contagens.atualizarQuantidadeItem(0, '3');
    let finishPut, finishGet;
    api.put.mockImplementationOnce(() => new Promise(resolve => { finishPut = resolve; }));
    api.get.mockImplementationOnce(() => new Promise(resolve => { finishGet = resolve; }));
    const save = context.contagens.salvarProgressoAtual();
    expect(input.disabled).toBe(true);
    context.contagens.atualizarQuantidadeItem(0, '4');
    expect(context.contagens.itensFornecedor[0].quantidade_contada).toBe(3);
    await context.contagens.continuarSessao('outra');
    expect(context.contagens.contagemId).toBe(c.id);
    finishPut({success: true});
    await new Promise(setImmediate);
    expect(input.disabled).toBe(true);
    await context.contagens.iniciarNovaSessao('geral');
    expect(api.post).not.toHaveBeenCalled();
    context.contagens.atualizarQuantidadeItem(0, '4');
    expect(context.contagens.itensFornecedor[0].quantidade_contada).toBe(3);
    finishGet({success: true, data: {contagem: c}});
    await save;
    expect(input.disabled).toBe(false);
    context.contagens.atualizarQuantidadeItem(0, '4');
    expect(context.contagens.itensFornecedor[0].quantidade_contada).toBe(4);
    expect(context.contagens.edicaoPendente).toBe(true);
  });
  it('descartar durante salvar e continuar não troca o contexto da resposta pendente', async () => {
    const c = session();
    api.get.mockImplementation(async url => ({success: true, data: {contagem: url.endsWith('/outra') ? session('geral', 'outra') : c}}));
    await context.contagens.continuarSessao(c.id);
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(0, '3');
    await context.contagens.continuarSessao('outra');
    let finishPut;
    api.put.mockImplementationOnce(() => new Promise(resolve => { finishPut = resolve; }));
    const saveAndContinue = context.contagens.resolverEdicao('salvar');
    await context.contagens.resolverEdicao('descartar');
    expect(context.contagens.contagemId).toBe(c.id);
    expect(context.contagens.edicaoPendente).toBe(true);
    expect(elements.get('contagem-edicao-pendente').open).toBe(true);
    finishPut({success: true});
    await saveAndContinue;
    expect(context.contagens.contagemId).toBe('outra');
    expect(context.contagens.tipoAtual).toBe('geral');
    expect(context.contagens.itensFornecedor).toHaveLength(0);
    expect(c.fornecedores[0].produtos[0].quantidade_contada).toBe(3);
  });
  it('cancelar conserva edição, descartar permite troca sem PUT e vazio permanece null', async () => {
    api.get.mockImplementation(async url => ({success: true, data: {contagem: session('pecas_queijo', url.split('/').pop())}}));
    await context.contagens.continuarSessao('pecas');
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(0, '');
    expect(context.contagens.itensFornecedor[0].quantidade_contada).toBeNull();
    await context.contagens.continuarSessao('outra');
    await context.contagens.resolverEdicao('cancelar');
    expect(context.contagens.edicaoPendente).toBe(true);
    expect(context.contagens.contagemId).toBe('pecas');
    await context.contagens.continuarSessao('outra');
    await context.contagens.resolverEdicao('descartar');
    expect(api.put).not.toHaveBeenCalled();
    expect(context.contagens.contagemId).toBe('outra');
  });
  it('eventos de continuar e repetir operam os botões renderizados', async () => {
    api.get.mockResolvedValueOnce({success: true, data: {contagens: [session()]}});
    await context.contagens.abrirModalidade('pecas_queijo');
    const button = elements.get('contagem-sessoes-lista').innerHTML.match(/<button[^>]*data-click="contagem-continuar"[^>]*>/)[0];
    api.get.mockResolvedValueOnce({success: true, data: {contagem: session()}});
    dispatch('click', button, {fromChild: true});
    await new Promise(setImmediate);
    expect(api.get).toHaveBeenLastCalledWith('/contagens/pecas');
    expect(context.showToast).not.toHaveBeenCalled();
    expect(context.contagens.contagemId).toBe('pecas');
    api.get.mockRejectedValueOnce(new Error('offline'));
    await context.contagens.carregarSessoesAbertas(2);
    const retry = elements.get('contagem-sessoes-lista').innerHTML.match(/<button[^>]*>/)[0];
    api.get.mockResolvedValueOnce({success: true, data: {contagens: []}});
    dispatch('click', retry); await new Promise(setImmediate);
    expect(elements.get('contagem-sessoes-lista').innerHTML).toContain('Nenhuma sessão aberta');
  });
  it('resultados e histórico de peças omitem comparação e bloqueiam downloads', async () => {
    const c = session(); c.status = 'finalizada'; c.fornecedores[0].produtos[0].quantidade_contada = 0;
    api.get.mockResolvedValue({ success: true, data: { contagem: c } });
    await context.contagens.exibirResultado(c.id);
    const result = ['resultado-status-card', 'resultado-metricas', 'resultado-divergencias'].map(id => elements.get(id).innerHTML).join('');
    expect(result).toContain('Peças de queijo'); expect(result).toContain('Quantidade de peças');
    expect(result).not.toMatch(/Estoque de referência|Sem diferença|Sobra|Falta|Excel/i);
    await consulta.detalharContagem(c.id);
    expect(elements.get('consulta-historico-detalhe').innerHTML).toContain('Quantidade de peças');
    expect(elements.get('consulta-historico-detalhe').innerHTML).not.toMatch(/Estoque de referência|Sem diferença|Excel/i);
    context.historico.contagens = [c]; context.historico.renderizar();
    expect(elements.get('lista-historico').innerHTML).toContain('Peças de queijo');
    expect(elements.get('lista-historico').innerHTML).not.toMatch(/Conciliado|divergência|Excel/i);
    elements.set('hist-card-pecas', {classList: {contains: () => false, add: jest.fn()}});
    elements.set('hist-body-pecas', {innerHTML: ''});
    await context.historico.toggleDetalhes(c.id);
    expect(elements.get('hist-body-pecas').innerHTML).toContain('Quantidade de peças');
    expect(elements.get('hist-body-pecas').innerHTML).not.toMatch(/Estoque|divergência|NaN|undefined/i);
    await context.contagens.baixarExcelDiferencas(c.id); await consulta.baixarExcel(c.id); await context.historico.baixarExcel(c.id);
    expect(api.download).not.toHaveBeenCalled();
  });
  it('classificação administrativa é restaurada, enviada e filtrada', async () => {
    const produtos = context.produtos;
    produtos.abrirNovo(); expect(elements.get('prod-contagem-em-pecas').checked).toBe(false);
    produtos.produtosCache = [{id: 'p', codigo: 'Q', nome: 'Queijo', fornecedor: 'Produtor', contagem_em_pecas: true}];
    produtos.abrirEdicao('p'); expect(elements.get('prod-contagem-em-pecas').checked).toBe(true);
    api.put.mockResolvedValue({success: true});
    await produtos.salvar();
    expect(api.put).toHaveBeenCalledWith('/produtos/p', expect.objectContaining({contagem_em_pecas: true}));
    elements.get('prod-contagem-em-pecas').checked = false;
    await produtos.salvar();
    expect(api.put).toHaveBeenLastCalledWith('/produtos/p', expect.objectContaining({contagem_em_pecas: false}));
    await produtos.filtrarPecas('true');
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('contagem_em_pecas=true'));
  });
});
