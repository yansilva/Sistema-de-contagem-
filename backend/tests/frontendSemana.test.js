const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFrontendEvents } = require('./helpers/frontendEvents');
const root = path.resolve(__dirname, '../../frontend');
describe('Cobertura semanal operacional', () => {
  let context, elements, semana, dispatch;
  const dados = (contados = 8, pendencias = 4) => ({
    semana: { inicio: '2026-09-28T03:00:00Z', fim_exclusivo: '2026-10-05T03:00:00Z' },
    resumo: { contados: 1, parciais: 1, pendentes: 1 },
    produtores: [{ fornecedor: '<Produtor>', total_produtos: 12, produtos_contados: contados, status: contados === 12 ? 'contado' : 'parcial', produtos_pendentes: Array.from({ length: pendencias }, (_, i) => ({ nome: '<Queijo>', codigo: `SKU${i}`, tipo: 'pecas_queijo' })) },
      { fornecedor: 'Completo', total_produtos: 1, produtos_contados: 1, status: 'contado', produtos_pendentes: [] },
      { fornecedor: 'Novo', total_produtos: 1, produtos_contados: 0, status: 'pendente', produtos_pendentes: [] }]
  });
  beforeEach(() => {
    elements = new Map(['semana-conteudo', 'semana-periodo', 'semana-grade', 'semana-filtros', 'semana-resultado', 'semana-busca', 'semana-detalhe-0', 'semana-detalhe-1', 'semana-detalhe-2'].map(id => [id, { innerHTML: '', textContent: '' }]));
    elements.get('semana-grade').querySelectorAll = () => ['<Produtor>', 'Completo', 'Novo'].map((produtor, indice) => ({ dataset: { produtor, indice: String(indice) }, setAttribute: jest.fn() }));
    context = vm.createContext({ document: { getElementById: id => elements.get(id), addEventListener: jest.fn() }, API: { get: jest.fn() }, showScreen: jest.fn() });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8'), context);
    const file = path.join(root, 'js/semana.js');
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8') + '\nglobalThis.semana = Semana;', context);
    semana = context.semana;
    dispatch = loadFrontendEvents(context);
  });
  it('mostra estados textuais e abre quatro pendências com modalidade pelos eventos reais', async () => {
    expect(semana).toBeDefined();
    context.API.get.mockResolvedValue({ success: true, data: dados() });
    await semana.carregar();
    const html = elements.get('semana-grade').innerHTML;
    expect(html).toContain('8 de 12');
    for (const status of ['Contado', 'Parcial', 'Pendente']) expect(html).toContain(status);
    dispatch('click', html.match(/<button[^>]*data-click="semana-produtor"[^>]*>/)[0], { fromChild: true });
    const pendencias = elements.get('semana-detalhe-0').innerHTML;
    expect(pendencias).toContain('&lt;Produtor&gt;');
    expect(pendencias).toContain('Peças de queijo');
    expect(pendencias.match(/<li>/g)).toHaveLength(4);
    expect(pendencias).not.toMatch(/estoque de referência|saldo anterior/i);
    expect(elements.get('semana-periodo').textContent).toContain('04/10/2026');
  });
  it('exibe vazio explícito e erro com nova tentativa sem conclusão falsa', async () => {
    expect(semana).toBeDefined();
    context.API.get.mockResolvedValueOnce({ success: true, data: { ...dados(), produtores: [] } }).mockRejectedValueOnce(new Error('offline'));
    await semana.carregar();
    expect(elements.get('semana-conteudo').innerHTML).toContain('Nenhum produtor');
    await semana.carregar();
    const html = elements.get('semana-conteudo').innerHTML;
    expect(html).toContain('Tentar novamente');
    expect(html).not.toContain('Todos os produtores contados');
    expect(semana.dados).toBeNull();
  });
  it('ignora respostas antigas e invalida solicitações em andamento', async () => {
    expect(semana).toBeDefined();
    let antiga;
    context.API.get.mockImplementationOnce(() => new Promise(resolve => { antiga = resolve; })).mockResolvedValueOnce({ success: true, data: dados(12, 0) });
    const primeira = semana.carregar();
    await semana.carregar();
    antiga({ success: true, data: dados() });
    await primeira;
    expect(elements.get('semana-grade').innerHTML).toContain('12 de 12');
    context.API.get.mockImplementationOnce(() => new Promise(resolve => { antiga = resolve; }));
    const terceira = semana.carregar();
    semana.invalidar();
    antiga({ success: true, data: dados() });
    await terceira;
    expect(semana.dados).toBeNull();
  });
  it('mantém 300 pendências acessíveis e escapadas', async () => {
    expect(semana).toBeDefined();
    context.API.get.mockResolvedValue({ success: true, data: dados(8, 300) });
    await semana.carregar();
    semana.abrirProdutor('<Produtor>');
    expect(semana.dados.produtores[0].produtos_pendentes).toHaveLength(300);
    expect(elements.get('semana-detalhe-0').innerHTML).toContain('SKU299');
    expect(elements.get('semana-detalhe-0').innerHTML).toContain('&lt;Queijo&gt;');
  });
  it('preserva o botão focado ao abrir e fechar pendências', async () => {
    context.API.get.mockResolvedValue({ success: true, data: dados() });
    await semana.carregar();
    const container = elements.get('semana-grade');
    let html = container.innerHTML;
    const botao = { dataset: { produtor: '<Produtor>' }, setAttribute: jest.fn() };
    context.document.activeElement = botao;
    container.querySelectorAll = () => [botao];
    // Como no DOM, substituir os filhos remove o controle e devolve o foco ao body.
    Object.defineProperty(container, 'innerHTML', {
      get: () => html,
      set: value => { html = value; context.document.activeElement = null; }
    });
    semana.abrirProdutor('<Produtor>');
    expect(context.document.activeElement).toBe(botao);
    expect(botao.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'true');
    expect(elements.get('semana-detalhe-0').innerHTML).toContain('SKU0');
    semana.abrirProdutor('<Produtor>');
    expect(context.document.activeElement).toBe(botao);
    expect(botao.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');
    expect(elements.get('semana-detalhe-0').innerHTML).toBe('');
  });

  it('abre as pendências ao tocar o corpo do cartão do produtor', async () => {
    context.API.get.mockResolvedValue({ success: true, data: dados() });
    await semana.carregar();
    const corpo = elements.get('semana-grade').innerHTML.match(/<div[^>]*data-click="semana-produtor-card"[^>]*>/)?.[0];
    expect(corpo).toBeDefined();
    dispatch('click', corpo);
    expect(elements.get('semana-detalhe-0').innerHTML).toContain('SKU0');
    dispatch('click', corpo);
    expect(elements.get('semana-detalhe-0').innerHTML).toBe('');
  });

  it('filtra por situação sem mudar os totais da semana e permite voltar a todos', async () => {
    context.API.get.mockResolvedValue({ success: true, data: dados() });
    await semana.carregar();
    const resumo = elements.get('semana-conteudo').innerHTML;
    expect(resumo).toContain('1 de 3');
    dispatch('click', '<button data-click="semana-filtro" data-status="pendente">Pendentes</button>');
    expect(elements.get('semana-grade').innerHTML).toContain('Novo');
    expect(elements.get('semana-grade').innerHTML).not.toContain('Completo');
    expect(elements.get('semana-grade').innerHTML).not.toContain('&lt;Produtor&gt;');
    expect(elements.get('semana-conteudo').innerHTML).toContain('1 de 3');
    dispatch('click', '<button data-click="semana-filtro" data-status="todos">Todos</button>');
    expect(elements.get('semana-grade').innerHTML).toContain('Completo');
  });

  it('busca produtores ignorando caixa e acentos, mantendo o campo focado', async () => {
    const exemplo = dados();
    exemplo.produtores[2].fornecedor = 'Águas do Norte';
    context.API.get.mockResolvedValue({ success: true, data: exemplo });
    await semana.carregar();
    const busca = elements.get('semana-busca');
    context.document.activeElement = busca;
    dispatch('input', '<input data-input="semana-busca" value="aguas">');
    expect(elements.get('semana-grade').innerHTML).toContain('Águas do Norte');
    expect(elements.get('semana-grade').innerHTML).not.toContain('Completo');
    expect(context.document.activeElement).toBe(busca);
    dispatch('input', '<input data-input="semana-busca" value="inexistente">');
    expect(elements.get('semana-grade').innerHTML).toContain('Nenhum produtor encontrado');
  });
});
