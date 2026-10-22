const fs = require('fs');
const path = require('path');

const frontend = path.resolve(__dirname, '../../frontend');
const ler = (arquivo) => fs.readFileSync(path.join(frontend, arquivo), 'utf8');

describe('rodada 9: toast sobre dialog, contagem e home do funcionario', () => {
  it('toast e anexado ao dialog aberto e migra para o body se ele fechar', () => {
    const utils = ler('js/utils.js');
    expect(utils).toMatch(/document\.querySelector\('dialog\[open\]'\)/);
    expect(utils).toMatch(/\(dialogAberto \|\| document\.body\)\.appendChild\(toast\)/);
    expect(utils).toMatch(/addEventListener\('close'/);
  });

  it('campos de quantidade tem nome acessivel por produto e a lista abre no topo', () => {
    const js = ler('js/contagens.js');
    expect(js).toMatch(/aria-label="\$\{this\.tipoAtual === 'pecas_queijo' \? 'Peças encontradas' : 'Quantidade física'\}, \$\{escapeHtml\(p\.nome\)\}"/);
    expect(js).toContain('aria-label="Quantidade vencida, ${escapeHtml(p.nome)}"');
    expect(js).toMatch(/preventScroll: true/);
    expect(js).toContain('Vencidos já estão incluídos na quantidade física contada.');
  });

  it('digitos: filtra letras, preserva decimais coladas para a validacao', () => {
    const fonte = ler('js/contagens.js');
    const trecho = fonte.match(/filtrarDigitos\(input\) \{[\s\S]*?\n  \},/)[0];
    const filtrar = new Function(`return { ${trecho.replace(/,$/, '')} }`)().filtrarDigitos;
    const campo = { value: 'a-1x', selectionStart: 3, setSelectionRange: jest.fn() };
    expect(filtrar(campo)).toBe('1');
    expect(campo.value).toBe('1');
    expect(campo.setSelectionRange).toHaveBeenCalledWith(1, 1);
    expect(filtrar({ value: '1.5' })).toBe('1.5');
    expect(filtrar({ value: '42' })).toBe('42');
  });

  it('finalizar e botao primario com motivo do estado desabilitado; relatorio nao e vermelho', () => {
    const html = ler('index.html');
    expect(html).toMatch(/<button class="btn btn-primary btn-sm" id="btn-finalizar-contagem"[^>]*aria-describedby="dica-finalizar-contagem"/);
    expect(html).toContain('Conte ao menos um produto para finalizar');
    expect(html).toMatch(/id="admin-divergencia-btn"/);
    expect(html).not.toMatch(/btn-danger" id="admin-divergencia-btn"/);
    expect(html).not.toContain('Consultar sessões e quantidades registradas');
  });
});
