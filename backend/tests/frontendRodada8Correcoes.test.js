const fs = require('fs');
const path = require('path');

const frontend = path.resolve(__dirname, '../../frontend');
const ler = (arquivo) => fs.readFileSync(path.join(frontend, arquivo), 'utf8');

describe('rodada 8: confirmar sobre dialog, F5 com aba, ajuda e toast', () => {
  it('confirmarAcao vive dentro do dialog aberto e volta ao body ao fechar', () => {
    const app = ler('js/app.js');
    expect(app).toMatch(/querySelectorAll\('dialog\[open\]'\)/);
    expect(app).toMatch(/dialogAberto\.appendChild\(modal\)/);
    expect(app).toMatch(/origem\.appendChild\(modal\)/);
    expect(app).toMatch(/setAttribute\('role', 'alertdialog'\)/);
    expect(app).toMatch(/e\.key === 'Tab'/);
  });

  it('F5 repassa a aba do hash ao showScreen inicial', () => {
    expect(ler('js/app.js')).toMatch(/showScreen\(inicial, \{ aba: abaDoHash\(inicial, hashAtual\(\)\) \}\)/);
  });

  it('ha ajuda contextual para home do administrador e do Super Admin', () => {
    const app = ler('js/app.js');
    for (const chave of ['screen-home:admin', 'screen-home:visao-geral', 'screen-home:tenants']) {
      expect(app).toContain(`'${chave}': [`);
    }
    expect(app).toMatch(/Quem tem permissão de administrador importa o catálogo \(\.xlsx\)/);
    expect(app).toContain("'Abrir ajuda' : 'Abrir ajuda: como funciona a contagem'");
    expect(ler('index.html')).toContain('id="ajuda-atalho-contagem"');
  });

  it('toast no celular fica no topo e o botao Fechar tem 44px', () => {
    const css = ler('css/components.css');
    expect(css).toMatch(/\.toast \{ top: calc\(env\(safe-area-inset-top, 0px\) \+ 8px\); left: 12px; right: 12px; \}/);
    expect(css).toMatch(/\.toast \.toast-close \{[^}]*min-width: 44px; min-height: 44px/);
  });

  it('foco volta ao cartao do produtor ao sair e o hamburguer some sem itens', () => {
    expect(ler('js/contagens.js')).toMatch(/this\.fecharFornecedor\(\);\s*this\.focarCardProdutor\(produtor\)/);
    expect(ler('js/app.js')).toMatch(/function atualizarMenuMovel\(\)/);
  });
});
