const fs = require('fs');
const path = require('path');

// Normaliza CRLF: no Windows o checkout traz os arquivos do front com CRLF.
const read = (file) => fs.readFileSync(path.resolve(__dirname, '../../frontend/js', file), 'utf8').replace(/\r\n/g, '\n');

// Extrai pluralizar() de utils.js para exercitar a regra real sem carregar o arquivo todo (ele usa DOM).
function carregarPluralizar() {
  const fonte = read('utils.js');
  const inicio = fonte.indexOf('function pluralizar(');
  expect(inicio).toBeGreaterThan(-1);
  const fim = fonte.indexOf('\n}\n', inicio) + 3;
  return new Function(`${fonte.slice(inicio, fim)}\nreturn pluralizar;`)();
}

describe('Tela Semana: concordância de "produtor"', () => {
  it('pluralizar concorda singular e plural (base da correção)', () => {
    const pluralizar = carregarPluralizar();
    expect(pluralizar(1, 'produtor', 'produtores')).toBe('1 produtor');
    expect(pluralizar(0, 'produtor', 'produtores')).toBe('0 produtores');
    expect(pluralizar(2, 'produtor', 'produtores')).toBe('2 produtores');
  });

  it('não deixa "produtores contados/exibidos" fixo depois de um número interpolado', () => {
    const fonte = read('semana.js');
    expect(fonte).not.toMatch(/\}\s+produtores\s+(contados|exibidos)/);
  });

  it('usa pluralizar com o total e concorda o particípio com ele, como em contagens.js', () => {
    const fonte = read('semana.js');
    expect(fonte).toContain("de ${pluralizar(total, 'produtor', 'produtores')} ${total === 1 ? 'contado' : 'contados'}");
    expect(fonte).toContain("const totalProdutores = this.dados.produtores.length;");
    const definicoes = fonte.match(/de \$\{pluralizar\(totalProdutores, 'produtor', 'produtores'\)\} \$\{totalProdutores === 1 \? 'exibido' : 'exibidos'\}/g) || [];
    expect(definicoes).toHaveLength(1);
    // o texto visível e o anúncio para leitor de tela usam a mesma frase
    expect(fonte).toContain('resultado.textContent = textoExibidos;');
    expect(fonte).toContain('aviso.textContent = textoExibidos;');
  });
});
