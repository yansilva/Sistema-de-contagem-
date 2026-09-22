const fs = require('fs');
const path = require('path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8');

describe('Contrato da interface do Super Admin', () => {
  it('mantém IDs únicos e destinos explícitos para cada listagem', () => {
    const html = read('index.html');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const empresas = read('js/empresas.js');
    expect(empresas).toContain("containerId = 'empresas-lista'");
    expect(empresas).not.toContain("getElementById('super-empresas-lista') ||");
  });

  it('não inventa zero quando as métricas falham e usa contagens finalizadas', () => {
    const empresas = read('js/empresas.js');
    expect(empresas).toContain("this.marcarMetricas('Indisponível'");
    expect(empresas).toContain("'super-kpi-contagens': m.contagensFinalizadas");
    expect(empresas).not.toContain('atualizarKPIsFallback');
  });

  it('envia confirmação de exclusão no corpo e descreve preservação dos dados', () => {
    expect(read('js/api.js')).toContain('body: JSON.stringify(data)');
    expect(read('js/empresas.js')).toContain("nomeConfirmacao: input?.value");
    expect(read('index.html')).toContain('Usuários, contagens, produtos e logs serão preservados');
  });

  it('remove redefinição direta de senha e o fluxo de impersonation', () => {
    const bundle = [read('index.html'), read('js/empresas.js'), read('js/empresa-detalhes.js'), read('js/auditoria.js')].join('\n');
    expect(bundle).not.toContain('reset-senha-admin');
    expect(bundle).not.toContain('/impersonar');
    expect(bundle).not.toContain('Nova Senha do Administrador');
    expect(bundle).toContain('E-mail não configurado');
  });

  it('mantém modais do console ocultos até serem ativados', () => {
    const css = read('css/superadmin.css');
    expect(css).toMatch(/\.modal\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.modal\.active\s*\{[^}]*display:\s*flex/s);
  });

  it('fecha os modais por teclado e restaura o foco anterior', () => {
    const html = read('index.html');
    const app = read('js/app.js');
    const empresas = read('js/empresas.js');
    expect((html.match(/role="dialog"/g) || [])).toHaveLength(3);
    expect(app).toContain('Empresas.fecharModalExclusao()');
    expect(app).toContain('Empresas.fecharModalEdicao()');
    expect(app).toContain('Empresas.fecharModalStatus()');
    expect(empresas).toContain('focoAntesModal');
  });

  it('restaura uma auditoria usando apenas o endpoint da sessão', () => {
    const detalhes = read('js/empresa-detalhes.js');
    expect(detalhes).toContain("document.body.classList.contains('audit-mode')");
    expect(detalhes).toContain('/auditoria/sessoes/');
  });
});
