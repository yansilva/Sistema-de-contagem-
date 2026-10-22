const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frontend = path.resolve(__dirname, '../../frontend');
const ler = (arquivo) => fs.readFileSync(path.join(frontend, arquivo), 'utf8');
const html = ler('index.html');

describe('Rodada 7: home e diálogo do funcionário', () => {
  let context;
  let elements;
  let api;

  const el = () => ({
    innerHTML: '', textContent: '', hidden: true, disabled: false, style: {}, dataset: {},
    setAttribute: jest.fn(), removeAttribute: jest.fn(), focus: jest.fn(),
    open: false, close: jest.fn(function () { this.open = false; }),
    querySelector: jest.fn(() => null)
  });
  const sessao = (produtos) => ({
    success: true,
    data: { contagem: { id: 'c1', status: 'em_andamento', fornecedores: [{ fornecedor: 'A', produtos }] } }
  });
  const prod = (id, qtd) => ({ id, produto_id: id, quantidade_contada: qtd });

  function preparar(lista, detalhe) {
    api.get.mockImplementation(async (url) => {
      if (url.startsWith('/contagens?status=em_andamento')) return { success: true, data: { contagens: lista } };
      if (url.startsWith('/contagens/')) return detalhe;
      return { success: false };
    });
  }

  beforeEach(() => {
    elements = new Map(['func-contagem-aberta', 'func-contagem-aberta-texto', 'func-contagem-aberta-btn', 'bloco-produtos-contagem', 'qtd-fisica-0']
      .map((id) => [id, el()]));
    api = { get: jest.fn() };
    context = vm.createContext({
      document: { getElementById: (id) => elements.get(id) || null, querySelectorAll: () => [], addEventListener: jest.fn() },
      API: api,
      showToast: jest.fn(),
      showScreen: jest.fn(),
      confirmarAcao: jest.fn().mockResolvedValue(true),
      Semana: { invalidar: jest.fn() },
      Consulta: { fecharDetalhe: jest.fn() }
    });
    vm.runInContext(ler('js/utils.js'), context);
    vm.runInContext(ler('js/contagens.js') + '\nglobalThis.Contagens = Contagens;', context);
  });

  describe('cartão de contagem em andamento', () => {
    it('declara o cartão acessível e escondido por padrão, com botão que reaproveita a ação de retomar', () => {
      const tag = html.match(/<div id="func-contagem-aberta"[^>]*>/)[0];
      expect(tag).toContain('role="status"');
      expect(tag).toContain('aria-busy');
      expect(tag).toContain('hidden');
      const botao = html.match(/<button[^>]*id="func-contagem-aberta-btn"[^>]*>/)[0];
      expect(botao).toContain('data-click="contagem-continuar"');
      expect(botao).toContain('btn-primary');
      expect(html).toMatch(/id="func-contagem-aberta-btn"[^>]*>\s*Retomar contagem/);
    });

    it('mostra X de Y produtos contados no plural e aponta o botão para a sessão', async () => {
      preparar([{ id: 'c1' }], sessao([prod(1, 5), prod(2, null), prod(3, 0)]));
      await context.Contagens.carregarCartaoEmAndamento();
      expect(elements.get('func-contagem-aberta').hidden).toBe(false);
      expect(elements.get('func-contagem-aberta-texto').textContent).toBe('Contagem em andamento: 2 de 3 produtos contados');
      expect(elements.get('func-contagem-aberta-btn').dataset.id).toBe('c1');
      expect(api.get).toHaveBeenCalledWith('/contagens?status=em_andamento&limit=1');
    });

    it('usa o singular com um único produto', async () => {
      preparar([{ id: 'c1' }], sessao([prod(1, 4)]));
      await context.Contagens.carregarCartaoEmAndamento();
      expect(elements.get('func-contagem-aberta-texto').textContent).toBe('Contagem em andamento: 1 de 1 produto contado');
    });

    it('não mostra cartão sem sessão aberta nem quando a busca falha', async () => {
      preparar([], null);
      await context.Contagens.carregarCartaoEmAndamento();
      expect(elements.get('func-contagem-aberta').hidden).toBe(true);
      api.get.mockRejectedValue(new Error('rede'));
      await expect(context.Contagens.carregarCartaoEmAndamento()).resolves.toBeUndefined();
      expect(elements.get('func-contagem-aberta').hidden).toBe(true);
      expect(elements.get('func-contagem-aberta').setAttribute).toHaveBeenLastCalledWith('aria-busy', 'false');
    });

    it('não expõe saldo de referência na resposta usada pelo cartão', async () => {
      preparar([{ id: 'c1' }], sessao([prod(1, 2)]));
      await context.Contagens.carregarCartaoEmAndamento();
      expect(elements.get('func-contagem-aberta-texto').textContent).not.toMatch(/saldo|refer|diferen/i);
    });
  });

  describe('fechar o diálogo do produtor', () => {
    beforeEach(() => { elements.get('bloco-produtos-contagem').open = true; });

    it('com digitação pendente pede confirmação perigosa e mantém aberto se cancelar', async () => {
      context.Contagens.edicaoPendente = true;
      context.Contagens._ultimoCampoEditado = 'qtd-fisica-0';
      context.confirmarAcao.mockResolvedValue(false);
      await context.Contagens.tentarFecharFornecedor();
      expect(context.confirmarAcao).toHaveBeenCalledWith(expect.objectContaining({
        titulo: 'Sair sem salvar?', confirmar: 'Sair sem salvar', cancelar: 'Continuar editando', perigo: true
      }));
      expect(elements.get('bloco-produtos-contagem').close).not.toHaveBeenCalled();
      expect(elements.get('qtd-fisica-0').focus).toHaveBeenCalled();
    });

    it('com digitação pendente fecha quando o usuário confirma', async () => {
      context.Contagens.edicaoPendente = true;
      await context.Contagens.tentarFecharFornecedor();
      expect(elements.get('bloco-produtos-contagem').close).toHaveBeenCalled();
    });

    it('sem pendência fecha direto, sem perguntar', async () => {
      await context.Contagens.tentarFecharFornecedor();
      expect(context.confirmarAcao).not.toHaveBeenCalled();
      expect(elements.get('bloco-produtos-contagem').close).toHaveBeenCalled();
    });

    it('X e fundo usam o fluxo com confirmação e Esc é interceptado', () => {
      const events = ler('js/events.js');
      expect(events).toMatch(/'action-121':[\s\S]*?Contagens\.tentarFecharFornecedor\(\)/);
      // O padding interno do <dialog> também reporta target === dialog: só vale clique fora da caixa (fundo) ou no botão X
      expect(events).toMatch(/'action-121':[\s\S]*?foraDaCaixa[\s\S]*?Contagens\.tentarFecharFornecedor\(\)/);
      expect(events).toMatch(/addEventListener\('cancel'[\s\S]*tentarFecharFornecedor\(\)[\s\S]*true\)/);
    });
  });

  it('o botão Retomar do histórico tem nome acessível e alvo de 44px', () => {
    expect(ler('js/consulta.js')).toMatch(/btn-alvo-44"[^`]*data-click="contagem-continuar"[^`]*aria-label="Retomar contagem de/);
    expect(ler('css/pages.css')).toMatch(/\.btn-alvo-44\s*\{\s*min-height:\s*44px/);
  });

  it('carregarResumo aciona o cartão sem depender dele', () => {
    expect(ler('js/consulta.js')).toMatch(/typeof Contagens\.carregarCartaoEmAndamento === 'function'\) Contagens\.carregarCartaoEmAndamento\(\)/);
  });
});
