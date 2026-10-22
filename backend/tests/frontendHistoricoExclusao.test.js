const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadFrontendEvents } = require('./helpers/frontendEvents');

const frontend = path.resolve(__dirname, '../../frontend');
const ler = (arquivo) => fs.readFileSync(path.join(frontend, arquivo), 'utf8');
const html = ler('index.html');

describe('Exclusão de contagens em andamento (frontend)', () => {
  let context;
  let elements;
  let api;
  let dispatch;

  const el = () => ({
    innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {},
    setAttribute: jest.fn(), removeAttribute: jest.fn(), focus: jest.fn(),
    open: false, close: jest.fn(function () { this.open = false; })
  });
  const contagem = (id, status, nome = 'Maria') => ({
    id, status, tipo: 'geral', iniciado_por_nome: nome, iniciado_em: '2026-10-01T10:00:00Z', fornecedores: []
  });
  const botoesApagar = () => [...elements.get('lista-historico').innerHTML.matchAll(/<button[^>]*data-click="historico-apagar"[^>]*>/g)].map((m) => m[0]);

  function preparar(papel, lista, emAberto) {
    api.get.mockImplementation(async (url) => {
      if (url.startsWith('/contagens?status=em_andamento')) {
        return { success: true, data: { contagens: emAberto ?? lista.filter((c) => c.status === 'em_andamento') } };
      }
      return { success: true, data: { contagens: lista } };
    });
    context.Auth.usuario = { papel };
  }

  beforeEach(() => {
    elements = new Map(['lista-historico', 'historico-counter-total', 'historico-lote', 'historico-lote-texto', 'btn-historico-apagar-em-aberto', 'contagem-edicao-pendente', 'bloco-produtos-contagem']
      .map((id) => [id, el()]));
    api = { get: jest.fn(), delete: jest.fn().mockResolvedValue({ success: true, data: {} }) };
    context = vm.createContext({
      document: {
        getElementById: (id) => elements.get(id) || null,
        querySelectorAll: () => [],
        addEventListener: jest.fn()
      },
      API: api,
      Auth: { usuario: null },
      showToast: jest.fn(),
      showScreen: jest.fn(),
      confirmarAcao: jest.fn().mockResolvedValue(true),
      carregarBackofficeKPIs: jest.fn(),
      carregarDashboard: jest.fn(),
      Semana: { invalidar: jest.fn() },
      Consulta: { fecharDetalhe: jest.fn() },
      Produtos: {}, StockImport: {}
    });
    vm.runInContext(ler('js/utils.js'), context);
    vm.runInContext(ler('js/historico.js') + '\nglobalThis.Historico = Historico;', context);
    vm.runInContext(ler('js/contagens.js') + '\nglobalThis.Contagens = Contagens;', context);
    context.showToast = jest.fn();
    dispatch = loadFrontendEvents(context);
  });

  it('mostra Apagar somente em contagens em andamento, com rótulo acessível', async () => {
    preparar('administrador', [contagem('a', 'em_andamento'), contagem('b', 'finalizada')]);
    await context.Historico.carregar();
    const botoes = botoesApagar();
    expect(botoes).toHaveLength(1);
    expect(botoes[0]).toContain('data-id="a"');
    expect(botoes[0]).toContain('title="Apagar contagem"');
    expect(botoes[0]).toMatch(/aria-label="Apagar contagem iniciada por Maria em /);
    expect(elements.get('lista-historico').innerHTML).toContain('ti ti-trash');
  });

  it.each(['funcionario', 'super_admin'])('não mostra Apagar nem lote para %s', async (papel) => {
    preparar(papel, [contagem('a', 'em_andamento')]);
    await context.Historico.carregar();
    expect(botoesApagar()).toHaveLength(0);
    expect(elements.get('historico-lote').hidden).toBe(true);
  });

  it.each(['gestor', 'admin'])('papel legado %s também apaga', async (papel) => {
    preparar(papel, [contagem('a', 'em_andamento')]);
    await context.Historico.carregar();
    expect(botoesApagar()).toHaveLength(1);
  });

  it('o clique no botão não abre o detalhe e aciona apagar com o id', async () => {
    preparar('administrador', [contagem('a', 'em_andamento')]);
    await context.Historico.carregar();
    context.Historico.apagar = jest.fn();
    dispatch('click', botoesApagar()[0]);
    expect(context.Historico.apagar).toHaveBeenCalledWith('a', expect.anything());
  });

  it('pede confirmação perigosa e cancelar não chama a API', async () => {
    preparar('administrador', [contagem('a', 'em_andamento')]);
    await context.Historico.carregar();
    context.confirmarAcao.mockResolvedValue(false);
    await context.Historico.apagar('a');
    expect(context.confirmarAcao).toHaveBeenCalledWith(expect.objectContaining({ perigo: true, titulo: 'Apagar contagem em andamento?', confirmar: 'Apagar contagem' }));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('sucesso chama DELETE, recarrega lista, KPIs, dashboard e semana', async () => {
    preparar('administrador', [contagem('a', 'em_andamento')]);
    await context.Historico.carregar();
    api.get.mockClear();
    await context.Historico.apagar('a');
    expect(api.delete).toHaveBeenCalledWith('/contagens/a');
    expect(context.showToast).toHaveBeenCalledWith('Contagem apagada.', 'success');
    expect(api.get).toHaveBeenCalledWith('/contagens');
    expect(context.carregarBackofficeKPIs).toHaveBeenCalledWith(true);
    expect(context.carregarDashboard).toHaveBeenCalled();
    expect(context.Semana.invalidar).toHaveBeenCalled();
  });

  it('trata 409 e 404 com mensagem clara', async () => {
    preparar('administrador', [contagem('a', 'em_andamento')]);
    await context.Historico.carregar();
    api.delete.mockResolvedValueOnce({ success: false, status: 409, code: 'CONTAGEM_NAO_EM_ANDAMENTO', message: 'x' });
    await context.Historico.apagar('a');
    expect(context.showToast).toHaveBeenCalledWith('Esta contagem já foi finalizada e não pode ser apagada.', 'error');
    api.delete.mockResolvedValueOnce({ success: false, status: 404, code: 'CONTAGEM_NAO_ENCONTRADA', message: 'x' });
    await context.Historico.apagar('a');
    expect(context.showToast).toHaveBeenCalledWith('Contagem não encontrada.', 'error');
  });

  it('lote: botão com N, singular/plural no título e DELETE com ids', async () => {
    const lista = [contagem('a', 'em_andamento'), contagem('b', 'em_andamento'), contagem('c', 'finalizada')];
    preparar('administrador', lista);
    await context.Historico.carregar();
    expect(api.get).toHaveBeenCalledWith('/contagens?status=em_andamento&limit=100');
    expect(elements.get('historico-lote').hidden).toBe(false);
    expect(elements.get('historico-lote-texto').textContent).toBe('Apagar contagens em aberto (2)');
    api.delete.mockResolvedValue({ success: true, data: { apagadas: 2, ids: ['a', 'b'], ignoradas: [] } });
    await context.Historico.apagarEmAberto();
    expect(context.confirmarAcao).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Apagar 2 contagens em andamento?', perigo: true, confirmar: 'Apagar contagens' }));
    expect(api.delete).toHaveBeenCalledWith('/contagens/em-andamento', { ids: ['a', 'b'] });
    expect(context.carregarBackofficeKPIs).toHaveBeenCalledWith(true);
    expect(context.carregarDashboard).toHaveBeenCalled();

    preparar('administrador', [contagem('z', 'em_andamento')]);
    await context.Historico.carregar();
    await context.Historico.apagarEmAberto();
    expect(context.confirmarAcao).toHaveBeenLastCalledWith(expect.objectContaining({ titulo: 'Apagar 1 contagem em andamento?' }));
  });

  it('lote: avisa quantas foram mantidas e oculta o botão quando N = 0', async () => {
    preparar('administrador', [contagem('a', 'em_andamento'), contagem('b', 'em_andamento')]);
    await context.Historico.carregar();
    api.delete.mockResolvedValue({ success: true, data: { apagadas: 1, ids: ['a'], ignoradas: ['b'] } });
    await context.Historico.apagarEmAberto();
    expect(context.showToast).toHaveBeenCalledWith('1 contagem apagada. 1 contagem já tinha sido finalizada ou apagada e foi mantida.', 'info');

    preparar('administrador', [contagem('a', 'finalizada')]);
    await context.Historico.carregar();
    expect(elements.get('historico-lote').hidden).toBe(true);
  });

  it('lote: cancelar não chama a API e erro mostra toast', async () => {
    preparar('administrador', [contagem('a', 'em_andamento')]);
    await context.Historico.carregar();
    context.confirmarAcao.mockResolvedValueOnce(false);
    await context.Historico.apagarEmAberto();
    expect(api.delete).not.toHaveBeenCalled();
    api.delete.mockResolvedValueOnce({ success: false, message: 'Falhou' });
    await context.Historico.apagarEmAberto();
    expect(context.showToast).toHaveBeenCalledWith('Falhou', 'error');
  });

  it('rótulo de auditoria e opção do filtro existem', () => {
    expect(ler('js/atividades.js')).toContain("contagem_apagada: 'Contagem apagada'");
    expect(html).toContain('<option value="contagem_apagada">Contagem apagada</option>');
  });

  it('funcionário: CONTAGEM_APAGADA limpa a sessão, avisa uma vez e volta ao início', async () => {
    const c = context.Contagens;
    const msg = 'Esta contagem foi apagada por um administrador. As quantidades não salvas foram perdidas.';
    c.contagemId = 'x'; c.itensTocados.add('p');
    api.get.mockResolvedValue({ success: false, status: 404, code: 'CONTAGEM_APAGADA', message: msg });
    await c.continuarSessao('x');
    expect(context.showToast).toHaveBeenCalledTimes(1);
    expect(context.showToast).toHaveBeenCalledWith(msg, 'error');
    expect(c.contagemId).toBeNull();
    expect(c.itensTocados.size).toBe(0);
    expect(context.showScreen).toHaveBeenCalledWith('screen-home');

    context.showToast.mockClear();
    c.contagemId = 'x'; c.fornecedorAtual = 'P'; c.itensFornecedor = [{ produto_id: 'p', quantidade_contada: 1, quantidade_vencida: 0 }]; c.itensTocados.add('p'); c.edicaoPendente = true;
    api.put = jest.fn().mockResolvedValue({ success: false, status: 404, code: 'CONTAGEM_APAGADA', message: msg });
    expect(await c.salvarProgressoAtual()).toBe(false);
    expect(context.showToast).toHaveBeenCalledTimes(1);
    expect(c.contagemId).toBeNull();
    expect(c.edicaoPendente).toBe(false);
    expect(c._salvando).toBe(false);

    context.showToast.mockClear();
    c.contagemId = 'x';
    await c.finalizarSessao();
    expect(context.showToast).toHaveBeenCalledTimes(1);
    expect(context.showToast).toHaveBeenCalledWith(msg, 'error');
    expect(c.contagemId).toBeNull();
  });
});
