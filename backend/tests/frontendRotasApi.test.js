const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frontend = path.resolve(__dirname, '../../frontend');
const ler = (arquivo) => fs.readFileSync(path.join(frontend, 'js', arquivo), 'utf8');

function sandboxBase(extra = {}) {
  return vm.createContext({
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: jest.fn()
    },
    window: { scrollTo: jest.fn(), addEventListener: jest.fn(), location: { hash: '' } },
    localStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
    sessionStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
    URLSearchParams,
    ...extra
  });
}

describe('api.js parseResponse', () => {
  it('repassa status e retryAfter e converte mensagem em message num 429', async () => {
    const context = sandboxBase();
    vm.runInContext(ler('api.js') + '\nglobalThis.apiReal = API;', context);
    const res = {
      ok: false,
      status: 429,
      headers: { get: (nome) => ({ 'content-type': 'application/json', 'retry-after': '60' }[nome] || null) },
      json: async () => ({ erro: 'rate_limit', mensagem: 'Muitas tentativas.' })
    };
    const corpo = await context.apiReal.parseResponse(res);
    expect(corpo).toMatchObject({
      success: false,
      status: 429,
      retryAfter: 60,
      message: 'Muitas tentativas.'
    });
  });
});

describe('app.js: rotas e ajuda contextual', () => {
  let context;

  beforeAll(() => {
    context = sandboxBase();
    vm.runInContext(
      ler('utils.js') + '\n' + ler('app.js') + '\nglobalThis.rotas = ROTAS_TELAS; globalThis.ajuda = AJUDA_CONTEXTUAL;',
      context
    );
  });

  it('ROTAS_TELAS tem hash e título únicos por tela', () => {
    const entradas = Object.values(context.rotas);
    expect(entradas.length).toBeGreaterThan(5);
    const hashes = entradas.map(([hash]) => hash).filter(Boolean);
    const titulos = entradas.map(([, titulo]) => titulo);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(new Set(titulos).size).toBe(titulos.length);
    for (const [hash, titulo] of entradas) {
      if (hash) expect(hash).toMatch(/^#[a-z0-9-]+$/);
      expect(titulo.trim()).not.toBe('');
    }
    // Só o login fica com URL limpa.
    expect(Object.keys(context.rotas).filter((id) => !context.rotas[id][0])).toEqual(['screen-login']);
  });

  it('a ajuda da tela de contagem não manda consultar o saldo antes de finalizar', () => {
    const texto = context.ajuda['screen-contagem'].join(' ').toLowerCase();
    expect(texto).not.toContain('saldo de referência');
    expect(texto).not.toMatch(/saldo|consult/);
    expect(texto).toContain('salvar e continuar');
  });
});
