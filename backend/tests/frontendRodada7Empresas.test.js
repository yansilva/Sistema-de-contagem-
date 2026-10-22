const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frontend = path.resolve(__dirname, '../../frontend');
const fonte = fs.readFileSync(path.join(frontend, 'js/empresa-detalhes.js'), 'utf8');

function criarContexto({ telaCompatAtiva }) {
  const chamadas = [];
  const secoes = {};
  const el = (id) => (secoes[id] = secoes[id] || { id, style: {}, innerHTML: '', textContent: '', classList: { contains: () => false, toggle() {} } });
  el('screen-empresas').classList.contains = (c) => c === 'active' && telaCompatAtiva;
  const context = vm.createContext({
    document: {
      getElementById: (id) => el(id),
      querySelectorAll: () => [],
      body: { classList: { contains: () => false } }
    },
    API: { get: jest.fn().mockResolvedValue({ success: false }) },
    showScreen: jest.fn((id) => chamadas.push('showScreen:' + id)),
    switchSaasTab: jest.fn((id) => chamadas.push('switchSaasTab:' + id)),
    Empresas: { escapeHtml: (v) => String(v) }
  });
  vm.runInContext(fonte + '\nthis.EmpresaDetalhes = EmpresaDetalhes;', context);
  return { context, chamadas, secoes };
}

describe('Detalhes de empresa a partir de /#empresas', () => {
  it('leva ao console antes de exibir o detalhe quando a tela compat está ativa', async () => {
    const { context, chamadas, secoes } = criarContexto({ telaCompatAtiva: true });
    await context.EmpresaDetalhes.abrir('emp-1');
    expect(chamadas[0]).toBe('showScreen:screen-home');
    expect(secoes['saas-tab-detalhes'].style.display).toBe('block');
    expect(context.EmpresaDetalhes.origem).toBe('compat');
  });

  it('não navega para o console quando já está na aba Empresas do console', async () => {
    const { context, chamadas } = criarContexto({ telaCompatAtiva: false });
    await context.EmpresaDetalhes.abrir('emp-1');
    expect(chamadas).not.toContain('showScreen:screen-home');
    expect(context.EmpresaDetalhes.origem).toBe('console');
  });

  it('Voltar retorna a /#empresas quando o detalhe veio de lá', async () => {
    const { context, chamadas } = criarContexto({ telaCompatAtiva: true });
    await context.EmpresaDetalhes.abrir('emp-1');
    chamadas.length = 0;
    context.EmpresaDetalhes.voltar();
    expect(chamadas).toEqual(['showScreen:screen-empresas']);
    expect(context.EmpresaDetalhes.origem).toBe('console');
  });

  it('Voltar retorna à aba Empresas do console quando o detalhe veio dela', async () => {
    const { context, chamadas } = criarContexto({ telaCompatAtiva: false });
    await context.EmpresaDetalhes.abrir('emp-1');
    chamadas.length = 0;
    context.EmpresaDetalhes.voltar();
    expect(chamadas).toEqual(['switchSaasTab:tenants']);
  });
});
