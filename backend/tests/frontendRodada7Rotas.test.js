const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frontend = path.resolve(__dirname, '../../frontend');
const ler = (arquivo) => fs.readFileSync(path.join(frontend, arquivo), 'utf8');

function criarContexto(hash = '') {
  const elementos = {};
  return vm.createContext({
    document: {
      getElementById: (id) => elementos[id] || null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: jest.fn(),
      title: ''
    },
    window: { scrollTo: jest.fn(), addEventListener: jest.fn(), location: { hash, pathname: '/', search: '' } },
    localStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
    sessionStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
    URLSearchParams
  });
}

describe('rodada 7: rotas por aba, ajuda contextual e atalho', () => {
  let context;

  beforeAll(() => {
    context = criarContexto();
    vm.runInContext(
      ler('js/utils.js') + '\n' + ler('js/app.js') +
        '\nglobalThis.abas = ROTAS_ABAS; globalThis.telas = ROTAS_TELAS; globalThis.ajuda = AJUDA_CONTEXTUAL;',
      context
    );
  });

  it('rotas de aba sao unicas, validas e nao colidem com as de outras telas', () => {
    const hashes = [];
    const titulos = [];
    for (const [tela, abas] of Object.entries(context.abas)) {
      expect(context.telas[tela]).toBeDefined();
      for (const [, [hash, titulo]] of Object.entries(abas)) {
        expect(hash).toMatch(/^#[a-z0-9/-]+$/);
        expect(titulo.trim()).not.toBe('');
        hashes.push(hash);
        titulos.push(`${titulo} · ${context.telas[tela][1]}`);
      }
    }
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(new Set(titulos).size).toBe(titulos.length);
    const hashesTelas = Object.entries(context.telas).map(([, [hash]]) => hash).filter(Boolean);
    // A primeira aba do console reaproveita o hash da propria tela (#inicio)
    for (const hash of hashes) {
      if (hash !== '#inicio') expect(hashesTelas).not.toContain(hash);
    }
    expect(hashes).toEqual(expect.arrayContaining([
      '#backoffice/produtos', '#backoffice/funcionarios', '#backoffice/historico',
      '#backoffice/atividades', '#backoffice/configuracoes', '#inicio/empresas', '#inicio/auditoria'
    ]));
  });

  it('tem entrada de ajuda para cada tela listada e nenhuma manda consultar saldo', () => {
    const chaves = [
      'screen-home', 'screen-catalogo', 'screen-produtores', 'screen-historico-contagens',
      'screen-semana-contagem', 'screen-modalidade-contagem', 'screen-backoffice:usuarios',
      'screen-backoffice:historico', 'screen-backoffice:config', 'screen-home:auditoria-global',
      'screen-importar-estoque'
    ];
    for (const chave of chaves) {
      expect(Array.isArray(context.ajuda[chave])).toBe(true);
      expect(context.ajuda[chave].length).toBeGreaterThanOrEqual(2);
    }
    // Telas do funcionario: sem qualquer menção a saldo ou consulta de saldo
    for (const chave of ['screen-home', 'screen-modalidade-contagem', 'screen-contagem']) {
      expect(context.ajuda[chave].join(' ').toLowerCase()).not.toMatch(/saldo|consult/);
    }
    expect(context.ajuda['screen-backoffice:historico'].join(' ')).toContain('Apagar é definitivo');
    const importar = context.ajuda['screen-importar-estoque'].join(' ');
    expect(importar).toMatch(/Passo 1.*PDF/);
    expect(importar).toMatch(/\.xlsx/);
  });

  it('hash de aba invalido cai na primeira aba e aba valida e respeitada', () => {
    context.Auth = { usuario: { papel: 'admin' }, isAdmin: () => true };
    expect(context.abaDoHash('screen-backoffice', '#backoffice/xyz')).toBe('produtos');
    expect(context.abaDoHash('screen-backoffice', '#backoffice')).toBe('produtos');
    expect(context.abaDoHash('screen-backoffice', '#backoffice/historico')).toBe('historico');
    expect(context.abaDoHash('screen-backoffice', '#backoffice/funcionarios')).toBe('usuarios');
    // Perfil sem console: a home nao tem abas
    expect(context.abaDoHash('screen-home', '#inicio/empresas')).toBeNull();
    context.Auth = { usuario: { papel: 'super_admin' }, isAdmin: () => true };
    expect(context.abaDoHash('screen-home', '#inicio/empresas')).toBe('tenants');
    expect(context.abaDoHash('screen-home', '#inicio/auditoria')).toBe('auditoria-global');
    expect(context.abaDoHash('screen-home', '#inicio/lixo')).toBe('visao-geral');
    expect(context.telaDoHash('#backoffice/lixo')).toBe('screen-backoffice');
  });

  it('popstate de aba invalida abre a primeira aba sem nova entrada de historico', () => {
    context.Auth = { usuario: { papel: 'admin' }, isAdmin: () => true };
    context.window.location.hash = '#backoffice/nao-existe';
    const chamadas = [];
    context.showScreen = (id, opcoes) => chamadas.push([id, opcoes]);
    context.aoMudarHistorico();
    expect(chamadas).toEqual([['screen-backoffice', { semHistorico: true, aba: 'produtos' }]]);
  });

  it('o titulo da rota segue o formato "Aba · Tela"', () => {
    context.Auth = { usuario: { papel: 'admin' }, isAdmin: () => true };
    expect(context.rotaDaTela('screen-backoffice', 'historico')).toEqual({
      hash: '#backoffice/historico', titulo: 'Histórico · Painel de gestão'
    });
    expect(context.rotaDaTela('screen-catalogo')).toEqual({
      hash: '#catalogo', titulo: 'Catálogo de produtos'
    });
  });

  it('o atalho "?" cobre Shift+Barra e nao dispara em campos nem em modais', () => {
    const app = ler('js/app.js');
    expect(app).toMatch(/e\.key === '\?' \|\| \(e\.code === 'Slash' && e\.shiftKey\)/);
    expect(app).toMatch(/digitandoAjuda[\s\S]{0,260}!modalAberto\(\)/);
  });

  it('topbar tem botao de ajuda visivel, atalho de importar foca o catalogo e o menu esconde o duplicado', () => {
    const html = ler('index.html');
    expect(html).toMatch(/id="btn-ajuda-topbar-rapido"[^>]*aria-label="Abrir ajuda"/);
    expect(html).toMatch(/id="input-importar-catalogo"/);
    expect(ler('js/events.js')).toMatch(/'action-22':[^\n]*focarImportarCatalogo\(\)/);
    expect(ler('css/mobile.css')).toMatch(/\.topbar-menu #btn-ajuda-topbar \{ display: none; \}/);
  });
});
