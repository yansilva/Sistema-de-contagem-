const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/auditoria.js'), 'utf8');

describe('Contrato da auditoria no navegador', () => {
  it('guarda apenas o contexto da sessão e conserva os tokens principais', () => {
    expect(source).toContain("storageKey: 'superAdminAuditSession'");
    expect(source).toContain("const tokenAntes = sessionStorage.getItem('accessToken')");
    expect(source).not.toMatch(/setItem\(['"]accessToken/);
    expect(source).not.toMatch(/setItem\(['"]refreshToken/);
  });

  it('consulta exclusivamente endpoints de auditoria e apresenta modo somente leitura', () => {
    expect(source).toContain('/auditoria/sessoes');
    expect(source).not.toContain('/impersonar');
    expect(source).toContain('Somente leitura');
    expect(source).toContain('requestId');
  });
});
