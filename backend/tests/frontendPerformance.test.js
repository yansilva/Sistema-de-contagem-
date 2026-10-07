const fs = require('fs');
const path = require('path');
const vm = require('vm');
const request = require('supertest');

const app = require('../src/app');
const frontend = path.join(__dirname, '../../frontend');

function carregarModuleLoader() {
  const scripts = [];
  const context = {
    Promise,
    document: {
      createElement() {
        return { dataset: {}, remove: jest.fn() };
      },
      body: {
        appendChild(script) {
          scripts.push(script);
        }
      }
    }
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(frontend, 'js/module-loader.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.FrontendModulesExport = FrontendModules;`, context);
  return { loader: context.FrontendModulesExport, scripts };
}

function carregarAuth({ moduleLoader = jest.fn().mockResolvedValue(undefined), loginResponse } = {}) {
  const elements = new Map([
    ['login-email', { value: 'funcionario@loja.test' }],
    ['login-senha', { value: 'Senha123' }],
    ['login-error', { textContent: '' }],
    ['btn-login', { disabled: false, innerHTML: '' }]
  ]);
  const events = [];
  const context = {
    console: { ...console, error: jest.fn() },
    API: {
      post: jest.fn().mockResolvedValue(loginResponse || {
        success: true,
        data: {
          accessToken: 'access', refreshToken: 'refresh',
          usuario: { id: 1, nome: 'Equipe', papel: 'funcionario' },
          empresa: { id: 1, nome: 'Loja' }, mustChangePassword: false
        }
      })
    },
    FrontendModules: { carregarParaPapel: jest.fn(async (papel) => {
      events.push(`modulos:${papel}`);
      return moduleLoader(papel);
    }) },
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: () => []
    },
    sessionStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
    localStorage: { removeItem: jest.fn() },
    showToast: jest.fn(),
    showScreen: jest.fn((screen) => events.push(`tela:${screen}`))
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(frontend, 'js/auth.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.AuthExport = Auth;`, context);
  return { Auth: context.AuthExport, context, elements, events };
}

function carregarModuloProdutos() {
  const scripts = [];
  const context = {
    console,
    Promise,
    Uint8Array,
    document: {
      createElement(tagName) {
        return { tagName };
      },
      head: {
        appendChild(script) {
          scripts.push(script);
        }
      }
    },
    showToast() {},
    escapeHtml(value) { return String(value); },
    API: {},
    Auth: { isAdmin: () => false }
  };

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/js/produtos.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.ProdutosExport = Produtos;`, context);
  return { Produtos: context.ProdutosExport, context, scripts };
}

describe('Performance do carregamento inicial', () => {
  it('mantém no HTML inicial somente os módulos essenciais', () => {
    const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);

    expect(scripts).toEqual([
      '/js/utils.js',
      '/js/api.js',
      '/js/module-loader.js',
      '/js/auth.js',
      '/js/events.js',
      '/js/mobile-nav.js',
      '/js/app.js'
    ]);
  });

  it.each([
    ['funcionario', ['consulta.js', 'contagens.js', 'semana.js', 'stock-import.js']],
    ['administrador', ['consulta.js', 'contagens.js', 'semana.js', 'stock-import.js', 'produtos.js', 'historico.js', 'usuarios.js', 'atividades.js']],
    ['super_admin', ['consulta.js', 'contagens.js', 'semana.js', 'stock-import.js', 'produtos.js', 'historico.js', 'usuarios.js', 'atividades.js', 'empresas.js', 'empresa-detalhes.js', 'auditoria.js']]
  ])('carrega somente os módulos necessários para %s', async (papel, esperados) => {
    const { loader, scripts } = carregarModuleLoader();
    const pending = loader.carregarParaPapel(papel);

    expect(scripts).toHaveLength(esperados.length);
    for (let i = 0; i < esperados.length; i += 1) {
      expect(scripts[i].src).toBe(`/js/${esperados[i]}`);
      scripts[i].onload();
    }

    await pending;
  });

  it('deduplica módulos e permite repetir uma carga que falhou', async () => {
    const { loader, scripts } = carregarModuleLoader();
    const primeira = loader.carregarScript('consulta.js');
    const duplicada = loader.carregarScript('consulta.js');
    expect(duplicada).toBe(primeira);
    expect(scripts).toHaveLength(1);

    scripts[0].onerror();
    await expect(primeira).rejects.toThrow('consulta.js');
    expect(scripts[0].remove).toHaveBeenCalled();

    const repetida = loader.carregarScript('consulta.js');
    expect(scripts).toHaveLength(2);
    scripts[1].onload();
    await expect(repetida).resolves.toBeUndefined();
  });

  it('aguarda os módulos do perfil antes de abrir a área autenticada', async () => {
    let liberar;
    const esperaDosModulos = new Promise((resolve) => { liberar = resolve; });
    const { Auth, context, events } = carregarAuth({
      moduleLoader: () => esperaDosModulos
    });

    const login = Auth.fazerLogin();
    await Promise.resolve();
    await Promise.resolve();
    expect(context.showScreen).not.toHaveBeenCalledWith('screen-home');

    liberar();
    await login;
    expect(events).toEqual(['modulos:funcionario', 'tela:screen-home']);
  });

  it('mantém a tela de login disponível se um módulo do perfil falhar', async () => {
    const { Auth, context, elements } = carregarAuth({
      moduleLoader: () => Promise.reject(new Error('Falha de rede no módulo'))
    });

    await Auth.fazerLogin();

    expect(context.showScreen).not.toHaveBeenCalledWith('screen-home');
    expect(elements.get('login-error').textContent).toBe('Falha de rede no módulo');
    expect(elements.get('btn-login').disabled).toBe(false);
  });

  it('não solicita o leitor de Excel antes de o usuário iniciar uma importação', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).not.toMatch(/<script[^>]+xlsx\.full\.min\.js/i);
  });

  it('carrega o leitor de Excel uma única vez sob demanda', async () => {
    const { Produtos, context, scripts } = carregarModuloProdutos();

    const primeiraCarga = Produtos.carregarLeitorExcel();
    const segundaCarga = Produtos.carregarLeitorExcel();

    expect(segundaCarga).toBe(primeiraCarga);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({
      src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      integrity: 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw',
      crossOrigin: 'anonymous',
      async: true
    });

    context.XLSX = { read() {}, utils: {} };
    scripts[0].onload();

    await expect(primeiraCarga).resolves.toBe(context.XLSX);
  });

  it('permite tentar novamente quando o leitor de Excel não carrega', async () => {
    const { Produtos, context, scripts } = carregarModuloProdutos();

    const primeiraCarga = Produtos.carregarLeitorExcel();
    scripts[0].onerror();
    await expect(primeiraCarga).rejects.toThrow('Não foi possível carregar o leitor de Excel.');

    const segundaCarga = Produtos.carregarLeitorExcel();
    expect(scripts).toHaveLength(2);

    context.XLSX = { read() {}, utils: {} };
    scripts[1].onload();
    await expect(segundaCarga).resolves.toBe(context.XLSX);
  });
});
