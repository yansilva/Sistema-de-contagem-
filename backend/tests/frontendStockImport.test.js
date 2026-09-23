const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frontend = path.resolve(__dirname, '../../frontend');
const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const importScript = fs.readFileSync(path.join(frontend, 'js/stock-import.js'), 'utf8');
const eventsScript = fs.readFileSync(path.join(frontend, 'js/events.js'), 'utf8');

describe('Importação de estoque pelo seletor de PDF', () => {
  let elements;
  let api;
  let context;
  let listeners;

  beforeEach(() => {
    elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
      style: {}, innerHTML: '', textContent: '', disabled: false, dataset: {}
    }]));
    api = {
      upload: jest.fn().mockResolvedValue({
        success: true,
        data: {
          nome_arquivo: 'estoque.pdf', produtos_encontrados: 2,
          produtos_correspondentes: 1, skus_nao_encontrados_total: 1,
          linhas_ignoradas: 0, produtos_para_atualizar: [{
            codigo: 'SKU-1', nome: 'Produto', fornecedor: 'Produtor',
            estoque_anterior: 3, estoque_novo: 5
          }],
          skus_nao_encontrados: [{ codigo: 'SKU-2', nome_relatorio: 'Outro', quantidade: 2 }]
        }
      }),
      post: jest.fn().mockResolvedValue({ success: true, message: 'Estoque atualizado com sucesso!', data: { produtos_atualizados: 1 } }),
      get: jest.fn().mockResolvedValue({ success: true, data: { historico: [] } })
    };
    context = vm.createContext({
      document: {
        getElementById: (id) => elements.get(id) || null,
        addEventListener: jest.fn()
      },
      FormData: class { append() {} },
      API: api,
      Produtos: { carregar: jest.fn() },
      escapeHtml: (value) => String(value),
      showToast: jest.fn()
    });
    vm.runInContext(importScript + '\nglobalThis.stockImport = StockImport;', context);
    vm.runInContext(eventsScript, context);
    listeners = new Map(context.document.addEventListener.mock.calls);
  });

  it('seleciona o PDF, mostra o processamento e a prévia antes de atualizar o estoque', async () => {
    const inputTag = html.match(/<input[^>]+accept="\.pdf"[^>]+data-change="action-51"[^>]*>/)[0];
    const action = inputTag.match(/data-change="([^"]+)"/)[1];
    const file = { name: 'estoque.pdf' };
    const input = {
      files: [file], value: 'estoque.pdf', disabled: false,
      getAttribute: () => action,
      closest: (selector) => selector === '[data-change]' ? input : null
    };

    listeners.get('change')({ target: input });
    expect(api.upload).toHaveBeenCalledWith('/estoque/upload-pdf', expect.anything());
    expect(elements.get('stock-upload-status').textContent).toMatch(/processando|enviando/i);
    await new Promise(setImmediate);
    expect(elements.get('stock-upload-status').textContent).toMatch(/prévia|analisado/i);
    expect(elements.get('painel-previa-estoque').innerHTML).toContain('Confirmar Atualização (1 produtos)');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('mantém o erro visível quando o servidor rejeita o PDF', async () => {
    api.upload.mockResolvedValueOnce({ success: false, message: 'PDF inválido.' });
    await context.stockImport.enviarPdf({ name: 'estoque.pdf' });
    expect(elements.get('stock-upload-status').textContent).toContain('PDF inválido.');
    expect(elements.get('stock-upload-status').style.display).toBe('block');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('informa quando nenhum SKU do PDF existe no cadastro', async () => {
    api.upload.mockResolvedValueOnce({
      success: true,
      data: {
        nome_arquivo: 'estoque.pdf', produtos_encontrados: 1,
        produtos_correspondentes: 0, skus_nao_encontrados_total: 1,
        linhas_ignoradas: 0, produtos_para_atualizar: [],
        skus_nao_encontrados: [{ codigo: 'SKU-2', nome_relatorio: 'Outro', quantidade: 2 }]
      }
    });
    await context.stockImport.enviarPdf({ name: 'estoque.pdf' });
    expect(elements.get('stock-upload-status').textContent).toMatch(/nenhum SKU cadastrado/i);
    expect(elements.get('painel-previa-estoque').innerHTML).toContain('disabled');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('aceita o PDF solto na área indicada e usa a mesma prévia', async () => {
    const areaTag = html.match(/<div id="stock-upload-area"[^>]*>/)[0];
    const action = areaTag.match(/data-drop="([^"]+)"/)[1];
    const area = {
      disabled: false,
      classList: { remove: jest.fn() },
      getAttribute: () => action,
      closest: (selector) => selector === '[data-drop]' ? area : null
    };
    const preventDefault = jest.fn();
    listeners.get('drop')({ target: area, dataTransfer: { files: [{ name: 'estoque.pdf' }] }, preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(api.upload).toHaveBeenCalledWith('/estoque/upload-pdf', expect.anything());
    await new Promise(setImmediate);
    expect(elements.get('painel-previa-estoque').innerHTML).toContain('SKU-1');
  });

  it('distingue prévia de estoque realmente atualizado após a confirmação', async () => {
    await context.stockImport.enviarPdf({ name: 'estoque.pdf' });
    expect(elements.get('stock-upload-status').textContent).toMatch(/nenhum estoque foi alterado/i);
    await context.stockImport.confirmarAtualizacao();
    expect(api.post).toHaveBeenCalledWith('/estoque/confirmar-atualizacao', expect.objectContaining({
      atualizacoes: [{ codigo: 'SKU-1', estoque_atual: 5 }]
    }));
    expect(elements.get('stock-upload-status').textContent).toMatch(/estoque atualizado/i);
  });
});
