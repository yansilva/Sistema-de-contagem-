const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFrontendEvents } = require('./helpers/frontendEvents');
const frontend = path.resolve(__dirname, '../../frontend');
const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');

describe('Área do funcionário de contagem', () => {
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
        scrollIntoView: jest.fn(),
        setAttribute: jest.fn(),
        removeAttribute: jest.fn(),
        focus: jest.fn(),
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
      localStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
      sessionStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
      URLSearchParams,
      API: api,
      Produtos: { carregar: jest.fn() },
      Historico: { carregar: jest.fn() },
      Usuarios: { carregar: jest.fn() },
      StockImport: { carregarHistorico: jest.fn(), limparSessao:jest.fn(), abrir:jest.fn() },
      Atividades: { carregar: jest.fn() }
    });
    context.Semana = { carregar: jest.fn(), invalidar: jest.fn() };
    for (const file of ['utils.js', 'auth.js', 'consulta.js', 'contagens.js', 'app.js']) {
      vm.runInContext(fs.readFileSync(path.join(frontend, 'js', file), 'utf8'), context);
    }
    vm.runInContext(
      'globalThis.auth = Auth; globalThis.consulta = Consulta; globalThis.contagens = Contagens;',
      context
    );
    context.showToast = jest.fn();
    dispatch = loadFrontendEvents(context);
    auth = context.auth;
    consulta = context.consulta;
    auth.usuario = { nome: 'Equipe', papel: 'funcionario', mustChangePassword: false };
    auth.empresa = { nome: 'Loja' };
  });

  it('mostra apenas a home operacional e oculta todos os blocos administrativos', () => {
    auth.atualizarInterface();
    expect(elements.get('home-funcionario').hidden).toBe(false);
    expect(elements.get('home-administrador').hidden).toBe(true);
    expect(elements.get('screen-backoffice').hidden).toBe(true);
    expect(elements.get('btn-nav-backoffice').style.display).toBe('none');
    expect(elements.get('btn-nova-empresa').style.display).toBe('none');
    for (const element of elements.values()) if (element.admin) expect(element.hidden).toBe(true);
    const home = html.split('id="home-funcionario"')[1].split('id="home-administrador"')[0];
    expect(home.match(/<button /g)).toHaveLength(6);
    expect(home).not.toMatch(/screen-backoffice|Sincroniza|Exporta/);
  });

  it('abre importação e limpa prévia por identidade', () => {
    context.showScreen('screen-importar-estoque');
    expect(elements.get('screen-importar-estoque').classes.has('active')).toBe(true);
    auth.atualizarInterface();
    expect(context.StockImport.limparSessao).toHaveBeenCalled();
    context.StockImport.limparSessao.mockClear();
    auth.atualizarInterface();
    expect(context.StockImport.limparSessao).not.toHaveBeenCalled();
    auth.usuario = { id: 99, papel: 'funcionario' };
    auth.atualizarInterface();
    expect(context.StockImport.limparSessao).toHaveBeenCalled();
  });

  it.each([
    ['sucesso antes da resposta', { success: true, data: { produtos_atualizados: 1 } }, 'Estoque atualizado', true],
    ['sucesso depois da resposta', { success: true, data: { produtos_atualizados: 1 } }, 'Estoque atualizado', false],
    ['falha antes da resposta', { success: false, message: 'Falha de gravação' }, 'Não foi possível', true],
    ['falha depois da resposta', { success: false, message: 'Falha de gravação' }, 'Não foi possível', false]
  ])('mantém resultado de %s ao sair e voltar durante confirmação', async (_, resultado, mensagem, reabrirAntes) => {
    auth.atualizarInterface();
    context.FormData = class { append() {} };
    vm.runInContext(fs.readFileSync(path.join(frontend, 'js/stock-import.js'), 'utf8') + '\nglobalThis.realStockImport = StockImport;', context);
    const stock = context.realStockImport;
    api.upload = jest.fn().mockResolvedValue({ success: true, data: {
      nome_arquivo: 'estoque.pdf', produtos_encontrados: 1, produtos_correspondentes: 1,
      produtos_para_atualizar: [{ codigo: 'SKU', nome: 'Produto', fornecedor: 'Produtor', estoque_novo: 5 }],
      skus_nao_encontrados: [], skus_nao_encontrados_total: 0, linhas_ignoradas: 0
    } });
    stock.abrir();
    await stock.enviarPdf({ name: 'estoque.pdf' });
    let resolve;
    api.post.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const pending = stock.confirmarAtualizacao();
    context.showScreen('screen-home');
    if (reabrirAntes) stock.abrir();
    resolve(resultado);
    await pending;
    if (!reabrirAntes) stock.abrir();
    expect(elements.get('stock-upload-status').textContent).toContain(mensagem);
    expect(elements.get('stock-upload-status').textContent).not.toContain('Atualizando');
    expect(api.post).toHaveBeenCalledTimes(1);
    if (!resultado.success) expect(stock.dadosPrevia).not.toBeNull();
  });

  it('descarta confirmação antiga ao trocar identidade durante saída', async () => {
    auth.atualizarInterface();
    vm.runInContext(fs.readFileSync(path.join(frontend, 'js/stock-import.js'), 'utf8') + '\nglobalThis.realStockImport = StockImport;', context);
    const stock = context.realStockImport;
    stock.dadosPrevia = { nome_arquivo: 'estoque.pdf', produtos_para_atualizar: [{codigo:'SKU', estoque_novo:5}] };
    stock.abrir();
    let resolve;
    api.post.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const pending = stock.confirmarAtualizacao();
    context.showScreen('screen-home');
    auth.usuario = { id: 99, papel: 'funcionario', nome: 'Outro' };
    auth.atualizarInterface();
    stock.abrir();
    resolve({success:true,data:{produtos_atualizados:1}});
    await pending;
    expect(stock.dadosPrevia).toBeNull();
    expect(elements.get('stock-upload-status').textContent).toBe('');
    expect(context.showToast).not.toHaveBeenCalledWith(expect.anything(), 'success');
  });

  it('logout limpa os dados de importação e a identidade', async () => {
    auth.atualizarInterface();
    context.StockImport.limparSessao.mockClear();
    await auth.deslogar();
    expect(context.StockImport.limparSessao).toHaveBeenCalled();
    expect(auth.usuario).toBeNull();
  });
  it('abre pelos eventos reais dos atalhos e menu existente', () => {
    for (const action of ['estoque-abrir', 'action-21', 'action-41']) {
      const tag = html.match(new RegExp('<button[^>]+data-click="' + action + '"[^>]*>'))[0];
      dispatch('click', tag);
    }
    expect(context.StockImport.abrir).toHaveBeenCalledTimes(3);
  });
  it('bloqueia navegação direta para back-office, cadastro de empresas e abas de gestão', () => {
    for (const target of ['screen-backoffice', 'screen-registro']) {
      context.showScreen(target);
      expect(elements.get(target).classes.has('active')).toBe(false);
      expect(elements.get('screen-home').classes.has('active')).toBe(true);
    }
    for (const tab of ['produtos', 'estoque', 'usuarios', 'atividades', 'historico'])
      context.switchTab(tab);
    expect(context.Produtos.carregar).not.toHaveBeenCalled();
    expect(context.Usuarios.carregar).not.toHaveBeenCalled();
    expect(context.StockImport.carregarHistorico).not.toHaveBeenCalled();
    expect(context.Atividades.carregar).not.toHaveBeenCalled();
    expect(context.Historico.carregar).not.toHaveBeenCalled();
  });

  it('separa os painéis do administrador e do superadmin e oculta ao mudar para funcionário', () => {
    auth.usuario.papel = 'administrador';
    auth.atualizarInterface();
    expect(elements.get('home-administrador').hidden).toBe(false);
    expect(elements.get('home-superadmin').hidden).toBe(true);
    expect(elements.get('home-funcionario').hidden).toBe(true);
    context.showScreen('screen-backoffice');
    expect(elements.get('screen-backoffice').classes.has('active')).toBe(true);

    auth.usuario.papel = 'super_admin';
    auth.atualizarInterface();
    expect(elements.get('home-administrador').hidden).toBe(true);
    expect(elements.get('home-superadmin').hidden).toBe(false);
    expect(elements.get('home-funcionario').hidden).toBe(true);
    context.showScreen('screen-backoffice');
    expect(elements.get('screen-backoffice').classes.has('active')).toBe(true);

    auth.usuario.papel = 'funcionario';
    auth.atualizarInterface();
    expect(elements.get('screen-backoffice').hidden).toBe(true);
  });

  it('consulta o catálogo sem exibir estoque ou ações de edição mesmo que o payload as contenha', async () => {
    api.get.mockResolvedValueOnce({
      success: true,
      data: {
        produtos: [
          { codigo: 'SKU', nome: '<Produto>', fornecedor: 'Produtor', estoque_atual: 987654 }
        ],
        pagination: { totalPages: 2 }
      }
    });
    await consulta.carregarCatalogo();
    const rendered = elements.get('consulta-catalogo-lista').innerHTML;
    expect(rendered).toContain('&lt;Produto&gt;');
    expect(rendered).not.toMatch(/987654|estoque_atual|Editar|Remover|Importar/);
    expect(elements.get('consulta-catalogo-proxima').disabled).toBe(false);
  });

  it('leva a busca rápida da home ao catálogo com o termo digitado', async () => {
    const input = html.match(/<input[^>]*id="busca-rapida-func"[^>]*>/)[0]
      .replace('>', ' value="Queijo azul">');

    dispatch('input', input);
    await Promise.resolve();

    expect(elements.get('screen-catalogo').classes.has('active')).toBe(true);
    expect(consulta.buscaCatalogo).toBe('Queijo azul');
    expect(elements.get('consulta-catalogo-busca').value).toBe('Queijo azul');
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('search=Queijo+azul'));
  });

  it('filtra produtores e abre catálogo por produtor sem montar código a partir do nome', async () => {
    api.get.mockResolvedValueOnce({ success: true, data: { fornecedores: ["D'Água", 'Outro'] } });
    await consulta.carregarProdutores();
    elements.get('consulta-produtores-busca').value = "D'Água";
    consulta.renderizarProdutores();
    const rendered = elements.get('consulta-produtores-lista').innerHTML;
    expect(rendered).toContain('D&#039;Água');
    expect(rendered).not.toContain('Outro');
    expect(rendered).not.toMatch(/\bonclick=/);
    const button = rendered.match(/<button\b[^>]*>/)[0];
    dispatch('click', button, { fromChild: true });
    expect(consulta.produtorFiltro).toBe("D'Água");
    expect(elements.get('screen-catalogo').classes.has('active')).toBe(true);
  });

  it('abre histórico em diálogo e mostra referência após finalizar', async () => {
    context.abrirHistoricoContagens();
    expect(elements.get('screen-historico-contagens').classes.has('active')).toBe(true);
    expect(context.Historico.carregar).not.toHaveBeenCalled();
    api.get.mockResolvedValueOnce({
      success: true,
      data: {
        contagem: {
          id: 'contagem-id',
          status: 'finalizada',
          tem_diferenca: true,
          iniciado_em: '2026-09-15T12:00:00Z',
          fornecedores: [
            {
              fornecedor: 'Produtor',
              produtos: [
                {
                  nome: 'Produto',
                  codigo: 'SKU',
                  quantidade_contada: 0,
                  diferenca: -3,
                  estoque_referencia: 876543,
                  quantidade_vencida: 2,
                  quantidade_vencida_baixada: 1,
                  estoque_antes_baixa_vencidos: 4
                },
                { nome: 'Igual', codigo: 'SKU2', quantidade_contada: 2, diferenca: 0 }
              ]
            }
          ]
        }
      }
    });
    await consulta.detalharContagem('contagem-id');
    const dialog = elements.get('consulta-historico-detalhe');
    const rendered = dialog.innerHTML;
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(rendered).toContain('<strong>0</strong>');
    expect(rendered).toContain('Falta de 3');
    expect(rendered).toContain('Excel');
    expect(rendered).toContain('Estoque de referência: <strong>876543</strong>');
    expect(rendered).toContain('Estoque antes da baixa: <strong>4</strong>');
    vm.runInContext(fs.readFileSync(path.join(frontend, 'js', 'historico.js'), 'utf8') + '\nglobalThis.Historico = Historico;', context);
    elements.set('hist-card-contagem-id', { classList: { contains: () => false, add: jest.fn() } });
    elements.set('hist-body-contagem-id', { innerHTML: '' });
    api.get.mockResolvedValueOnce({ success: true, data: { contagem: { id: 'contagem-id', status: 'finalizada', tipo: 'geral', fornecedores: [{ fornecedor: 'Produtor', produtos: [{ nome: 'Produto', codigo: 'SKU', quantidade_contada: 2, quantidade_vencida: 2, quantidade_vencida_baixada: 1, estoque_antes_baixa_vencidos: 4, diferenca: 0 }] }] } } });
    await context.Historico.toggleDetalhes('contagem-id');
    expect(elements.get('hist-body-contagem-id').innerHTML).toContain('Estoque antes da baixa: <strong>4</strong>');
    await consulta.baixarExcel('contagem-id');
    expect(api.download).toHaveBeenCalledWith('/relatorios/contagens/contagem-id/excel', expect.stringMatching(/\.xlsx$/));
    consulta.fecharDetalhe();
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it('distingue produtores concluídos, em andamento e pendentes sem depender só da cor', () => {
    context.contagens.dadosSessao = {
      fornecedores: [
        {
          fornecedor: 'Concluído',
          produtos: [{ quantidade_contada: 2 }]
        },
        {
          fornecedor: 'Em andamento',
          produtos: [{ quantidade_contada: 1 }, { quantidade_contada: null }]
        },
        {
          fornecedor: 'Pendente',
          produtos: [{ quantidade_contada: null }]
        }
      ]
    };

    context.contagens.renderizarListaProdutores();
    const rendered = elements.get('lista-produtores-cards').innerHTML;

    expect(rendered).toMatch(/contagem-produtor-card is-complete[\s\S]*badge-success[\s\S]*ti-check[\s\S]*Concluído/);
    expect(rendered).toMatch(/contagem-produtor-card is-progress[\s\S]*badge-warning[\s\S]*ti-clock[\s\S]*1\/2 contados/);
    expect(rendered).toMatch(/contagem-produtor-card is-pending[\s\S]*badge-neutral[\s\S]*ti-circle[\s\S]*Não iniciado/);
  });

  it('inicia a contagem pelo botão central, seleciona produtor e salva zero sem expor saldo', async () => {
    const c = {
      id: 'contagem-teste',
      status: 'em_andamento',
      fornecedores: [
        {
          fornecedor: "D'Água",
          produtos: [
            {
              id: 'item',
              produto_id: 'produto-id',
              codigo: 'SKU',
              nome: 'Produto',
              quantidade_contada: null,
              estoque_referencia: 999999
            }
          ]
        }
      ]
    };
    api.post.mockResolvedValue({ success: true, data: { contagem: { id: c.id } } });
    api.get.mockResolvedValue({ success: true, data: { contagem: c } });
    await context.contagens.iniciarNovaSessao();
    expect(api.post).toHaveBeenCalledWith('/contagens', { tipo: 'geral' });
    expect(elements.get('screen-contagem').classes.has('active')).toBe(true);
    context.contagens.selecionarFornecedor("D'Água");
    expect(elements.get('bloco-produtos-contagem').showModal).toHaveBeenCalledTimes(1);
    expect(elements.get('bloco-produtos-contagem').open).toBe(true);
    expect(elements.get('lista-produtos-produtor').innerHTML).not.toContain('999999');
    context.contagens.atualizarQuantidadeItem(0, '0');
    api.put.mockImplementation(async () => {
      c.fornecedores[0].produtos[0].quantidade_contada = 0;
      return { success: true };
    });
    await context.contagens.salvarProgressoAtual();
    expect(api.put).toHaveBeenCalledWith('/contagens/contagem-teste/salvar-progresso', {
      fornecedor: "D'Água",
      itens: [{ produto_id: 'produto-id', quantidade_contada: 0, quantidade_vencida: 0 }]
    });
    expect(elements.get('bloco-produtos-contagem').open).toBe(false);
    expect(context.showToast).toHaveBeenCalledWith('Contagem de D\'Água salva.', 'success');
    expect(elements.get('progresso-contagem-texto').textContent).toBe('1 de 1 produtos contados');
    expect(elements.get('btn-finalizar-contagem').disabled).toBe(false);
    expect(elements.get('bloco-produtos-contagem').close).toHaveBeenCalledTimes(1);
  });

  it('não anuncia contagem pronta quando os produtos não carregam', async () => {
    api.post.mockResolvedValue({ success: true, data: { contagem: { id: 'nova-contagem' } } });
    api.get.mockResolvedValue({ success: false, message: 'Falha ao buscar produtos' });

    await context.contagens.iniciarNovaSessao();

    expect(elements.get('screen-home').classes.has('active')).toBe(true);
    expect(context.showToast).toHaveBeenCalledWith('Falha ao buscar produtos', 'error');
    expect(context.showToast).not.toHaveBeenCalledWith(
      'Contagem iniciada. Escolha um produtor para registrar as quantidades.', 'info'
    );
  });

  it('informa vencidos inline, valida o físico e mantém o popup quando o salvamento falha', async () => {
    const produto = { id: 'item', produto_id: 'produto', codigo: 'SKU', nome: 'Produto', quantidade_contada: 5, quantidade_vencida: 2 };
    context.contagens.tipoAtual = 'geral';
    context.contagens.contagemId = 'sessao';
    context.contagens.dadosSessao = { fornecedores: [{ fornecedor: 'Produtor', produtos: [produto] }] };
    context.contagens.selecionarFornecedor('Produtor');
    expect(elements.get('lista-produtos-produtor').innerHTML).toContain('Quantidade vencida');
    expect(elements.get('lista-produtos-produtor').innerHTML).toContain('value="2"');
    context.contagens.atualizarQuantidadeItem(0, '1');
    expect(await context.contagens.salvarProgressoAtual()).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
    context.contagens.atualizarQuantidadeItem(0, '5');
    context.contagens.atualizarVencidos(0, '1.5');
    expect(await context.contagens.salvarProgressoAtual()).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
    context.contagens.atualizarVencidos(0, '2');
    api.put.mockResolvedValue({ success: false, message: 'Falha' });
    expect(await context.contagens.salvarProgressoAtual()).toBe(false);
    expect(elements.get('bloco-produtos-contagem').open).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/contagens/sessao/salvar-progresso', { fornecedor: 'Produtor', itens: [{ produto_id: 'produto', quantidade_contada: 5, quantidade_vencida: 2 }] });
  });

  it('preserva o físico inválido e seu erro ao revelar vencidos', async () => {
    const produto = { id: 'item', produto_id: 'produto', codigo: 'SKU', nome: 'Produto', quantidade_contada: 5, quantidade_vencida: 0 };
    context.contagens.tipoAtual = 'geral';
    context.contagens.dadosSessao = { fornecedores: [{ fornecedor: 'Produtor', produtos: [produto] }] };
    context.contagens.selecionarFornecedor('Produtor');
    context.contagens.atualizarQuantidadeItem(0, 'texto');
    context.contagens.abrirVencidos(0);
    const linha = elements.get('lista-produtos-produtor').innerHTML;
    expect(linha).toContain('value="texto"');
    expect(linha).toContain('aria-invalid="true"');
    expect(linha).toContain('Informe uma quantidade inteira maior ou igual a zero.');
    expect(await context.contagens.salvarProgressoAtual()).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('validação de vencidos não altera a mensagem de erro físico', () => {
    const produto = { id: 'item', produto_id: 'produto', codigo: 'SKU', nome: 'Produto', quantidade_contada: 5, quantidade_vencida: 0 };
    context.contagens.tipoAtual = 'geral';
    context.contagens.dadosSessao = { fornecedores: [{ fornecedor: 'Produtor', produtos: [produto] }] };
    context.contagens.selecionarFornecedor('Produtor');
    const erroFisico = { textContent: 'Informe uma quantidade inteira maior ou igual a zero.' };
    elements.set('erro-fisico-0', erroFisico);
    context.contagens.atualizarQuantidadeItem(0, 'texto');
    context.contagens.atualizarVencidos(0, '0');
    expect(erroFisico.textContent).toBe('Informe uma quantidade inteira maior ou igual a zero.');
    context.contagens.atualizarQuantidadeItem(0, '5');
    expect(erroFisico.textContent).toBe('');
    context.contagens.atualizarVencidos(0, '6');
    expect(erroFisico.textContent).toBe('');
  });

  it('exibe vencidos e Excel no resultado sem divergência', async () => {
    const c = { id: 'sessao', tipo: 'geral', status: 'finalizada', tem_diferenca: false, fornecedores: [{ fornecedor: 'Produtor', produtos: [{ nome: 'Produto', codigo: 'SKU', quantidade_contada: 5, quantidade_vencida: 2, quantidade_vencida_baixada: 1, estoque_antes_baixa_vencidos: 1, diferenca: 0 }] }] };
    api.get.mockResolvedValue({ success: true, data: { contagem: c } });
    await context.contagens.exibirResultado(c.id);
    expect(elements.get('resultado-status-card').innerHTML).toContain('Contagem conferida com produtos vencidos');
    expect(elements.get('resultado-status-card').innerHTML).toContain('Baixar relatório da contagem');
    expect(elements.get('resultado-metricas').innerHTML).toContain('Unidades vencidas');
    expect(elements.get('resultado-divergencias').innerHTML).toContain('Baixa limitada: 1');
  });

  it('salvamento bem-sucedido aceita diálogo simplificado sem método close', async () => {
    const dialog = elements.get('bloco-produtos-contagem');
    dialog.open = true;
    delete dialog.close;
    context.contagens.tipoAtual = 'geral';
    context.contagens.contagemId = 'sessao';
    context.contagens.fornecedorAtual = 'Produtor';
    context.contagens.itensFornecedor = [{ produto_id: 'produto', quantidade_contada: 1, quantidade_vencida: 0 }];
    context.contagens.itensTocados.add('produto');
    context.contagens.dadosSessao = { fornecedores: [{ fornecedor: 'Produtor', produtos: [{ produto_id: 'produto' }] }] };
    context.contagens.carregarDadosContagem = jest.fn();
    api.put.mockResolvedValue({ success: true });
    expect(await context.contagens.salvarProgressoAtual()).toBe(true);
  });

  it('abre a semana para funcionário e administrador e sempre recarrega', () => {
    const buttons = [...html.matchAll(/<button[^>]*data-click="semana-abrir"[^>]*>/g)];
    expect(buttons).toHaveLength(2);
    for (const papel of ['funcionario', 'administrador']) {
      auth.usuario.papel = papel;
      dispatch('click', buttons[0][0]);
      expect(elements.get('screen-semana-contagem').classes.has('active')).toBe(true);
    }
    expect(context.Semana.carregar).toHaveBeenCalledTimes(2);
  });

  it('invalida a semana somente após finalizar com sucesso em qualquer modalidade', async () => {
    context.contagens.contagemId = 'sessao';
    context.contagens.exibirResultado = jest.fn();
    api.put.mockResolvedValueOnce({ success: false }).mockResolvedValue({ success: true });
    await context.contagens.finalizarSessao();
    expect(context.Semana.invalidar).not.toHaveBeenCalled();
    for (const tipo of ['geral', 'pecas_queijo']) {
      context.contagens.tipoAtual = tipo;
      await context.contagens.finalizarSessao();
    }
    expect(context.Semana.invalidar).toHaveBeenCalledTimes(2);
  });

  it('entradas dos dois perfis abrem modalidades sem criar sessão', async () => {
    const button = html.match(/<button[^>]*data-click="action-11"[^>]*>/)[0];
    dispatch('click', button);
    await Promise.resolve();
    expect(elements.get('screen-modalidade-contagem').classes.has('active')).toBe(true);
    auth.usuario.papel = 'administrador';
    const adminButton = html.match(/<button[^>]*data-click="action-15"[^>]*>/)[0];
    dispatch('click', adminButton);
    await Promise.resolve();
    expect(elements.get('screen-modalidade-contagem').classes.has('active')).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('avisa que itens não contados ficam fora e resume somente produtos registrados', async () => {
    const c = {
      id: 'contagem-parcial', status: 'finalizada', tem_diferenca: true,
      fornecedores: [{ fornecedor: 'Produtor', produtos: [
        { nome: 'Registrado', codigo: 'SKU1', estoque_referencia: 2, quantidade_contada: 0, diferenca: -2, situacao: 'falta' }
      ] }]
    };
    context.contagens.contagemId = c.id;
    context.contagens.dadosSessao = { fornecedores: [{ produtos: [
      { quantidade_contada: 0 }, { quantidade_contada: null }
    ] }] };
    api.put.mockResolvedValue({ success: true });
    api.get.mockResolvedValue({ success: true, data: { contagem: c } });

    await context.contagens.finalizarSessao();
    expect(context.confirm).toHaveBeenCalledWith(expect.stringContaining('não entrará no resultado desta contagem'));
    await context.contagens.exibirResultado(c.id);
    expect(elements.get('resultado-metricas').innerHTML).toContain('Produtos contados');
    expect(elements.get('resultado-metricas').innerHTML).toContain('>1</div>');
    expect(elements.get('resultado-status-card').innerHTML).toContain('Baixar relatório de diferenças');
    expect(elements.get('resultado-divergencias').innerHTML).not.toContain('Não contado');
    expect(elements.get('resultado-divergencias').innerHTML).toContain('Saldo de referência: <strong>2</strong>');
  });
});
