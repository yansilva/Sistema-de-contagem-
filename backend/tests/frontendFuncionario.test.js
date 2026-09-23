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
    expect(home.match(/<button /g)).toHaveLength(4);
    expect(home).not.toMatch(/screen-backoffice|Importar|Sincroniza|Exporta/);
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

  it('abre histórico em diálogo e permite Excel de diferenças sem mostrar estoque de referência', async () => {
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
                  estoque_referencia: 876543
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
    expect(rendered).not.toMatch(/876543|Estoque de Referência|Estoque Ref/);
    consulta.baixarExcel('contagem-id');
    expect(api.download).toHaveBeenCalledWith('/relatorios/contagens/contagem-id/excel', expect.stringMatching(/\.xlsx$/));
    consulta.fecharDetalhe();
    expect(dialog.close).toHaveBeenCalledTimes(1);
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
    expect(api.post).toHaveBeenCalledWith('/contagens', {});
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
      itens: [{ produto_id: 'produto-id', quantidade_contada: 0 }]
    });
    expect(elements.get('progresso-contagem-texto').textContent).toBe('1 de 1 produtos contados');
    expect(elements.get('btn-finalizar-contagem').disabled).toBe(false);
    expect(elements.get('bloco-produtos-contagem').showModal).toHaveBeenCalledTimes(1);
    context.contagens.fecharFornecedor();
    expect(elements.get('bloco-produtos-contagem').open).toBe(false);
  });

  it('não anuncia contagem pronta quando os produtos não carregam', async () => {
    api.post.mockResolvedValue({ success: true, data: { contagem: { id: 'nova-contagem' } } });
    api.get.mockResolvedValue({ success: false, message: 'Falha ao buscar produtos' });

    await context.contagens.iniciarNovaSessao();

    expect(elements.get('screen-home').classes.has('active')).toBe(true);
    expect(context.showToast).toHaveBeenCalledWith('Falha ao buscar produtos', 'error');
    expect(context.showToast).not.toHaveBeenCalledWith(
      'Contagem iniciada. Selecione um produtor para contar.', 'info'
    );
  });

  it('avisa que itens não contados ficam fora e resume somente produtos registrados', async () => {
    const c = {
      id: 'contagem-parcial', status: 'finalizada', tem_diferenca: true,
      fornecedores: [{ fornecedor: 'Produtor', produtos: [
        { nome: 'Registrado', codigo: 'SKU1', quantidade_contada: 0, diferenca: -2, situacao: 'falta' }
      ] }]
    };
    context.contagens.contagemId = c.id;
    context.contagens.dadosSessao = { fornecedores: [{ produtos: [
      { quantidade_contada: 0 }, { quantidade_contada: null }
    ] }] };
    api.put.mockResolvedValue({ success: true });
    api.get.mockResolvedValue({ success: true, data: { contagem: c } });

    await context.contagens.finalizarSessao();
    expect(context.confirm).toHaveBeenCalledWith(expect.stringContaining('ficarão fora desta apuração'));
    await context.contagens.exibirResultado(c.id);
    expect(elements.get('resultado-metricas').innerHTML).toContain('Itens Contados');
    expect(elements.get('resultado-metricas').innerHTML).toContain('>1</div>');
    expect(elements.get('resultado-status-card').innerHTML).toContain('Exportar Relatório Excel');
    expect(elements.get('resultado-divergencias').innerHTML).not.toContain('Não contado');
  });
});
