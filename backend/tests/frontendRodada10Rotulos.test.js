const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/utils.js'), 'utf8');
const ctx = vm.createContext({ document: { addEventListener: () => {} } });
vm.runInContext(src + '\nglobalThis.R = Rotulos;', ctx);
const R = ctx.R;

describe('Rotulos (rodada 10)', () => {
  it('status da contagem', () => {
    expect(R.statusContagem('em_andamento')).toBe('Em andamento');
    expect(R.statusContagem('finalizada')).toBe('Finalizada');
    expect(R.statusContagem('finalizada', true)).toBe('Finalizada · Com divergência');
    expect(R.statusContagem('finalizada', { divergencias: 0 })).toBe('Finalizada · Sem divergência');
    expect(R.statusContagem('apagada')).toBe('Apagada');
  });
  it('papel, ação e resultado', () => {
    expect(R.papel('funcionario')).toBe('Funcionário');
    expect(R.papel('gestor')).toBe('Administrador');
    expect(R.papel('super_admin')).toBe('Super Admin');
    expect(R.acaoAuditoria('login_sucesso')).toBe('Login realizado');
    expect(R.acaoAuditoria('algo_novo_feito')).toBe('Algo novo feito');
    expect(R.resultado('sucesso')).toBe('Sucesso');
    expect(R.resultado('falha')).toBe('Falha');
  });
});
