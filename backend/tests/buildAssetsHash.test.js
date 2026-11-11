const fs = require('fs');
const os = require('os');
const path = require('path');

const { calcularHash } = require('../../scripts/build.js');

function criarFrontend(fimDeLinha, { fonte = Buffer.from([0x00, 0x0d, 0x0a, 0xff, 0x0d, 0x0a, 0x7f]) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-hash-'));
  const gravar = (relativo, conteudo) => {
    const destino = path.join(dir, relativo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo);
  };
  const texto = (linhas) => linhas.join(fimDeLinha);
  gravar('css/a.css', texto(['body {', '  color: red;', '}', '']));
  gravar('js/b.js', texto(['const x = 1;', 'console.log(x);', '']));
  gravar('assets/fonts/f.woff2', fonte); // binário: CRLF dentro dele é dado, não fim de linha
  return dir;
}

describe('Build: versão de assets não depende do fim de linha (Windows CRLF x Linux LF)', () => {
  const pastas = [];
  const novo = (...args) => { const d = criarFrontend(...args); pastas.push(d); return d; };
  afterAll(() => pastas.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  it('css e js com CRLF e com LF geram a mesma versão (o CI roda em LF)', () => {
    expect(calcularHash(novo('\r\n'))).toBe(calcularHash(novo('\n')));
  });

  it('o hash tem 10 caracteres hexadecimais', () => {
    expect(calcularHash(novo('\n'))).toMatch(/^[0-9a-f]{10}$/);
  });

  it('mudar o conteúdo de texto muda a versão', () => {
    const base = novo('\n');
    const antes = calcularHash(base);
    fs.appendFileSync(path.join(base, 'js', 'b.js'), 'console.log(2);\n');
    expect(calcularHash(base)).not.toBe(antes);
  });

  it('arquivo binário continua em bytes brutos: trocar CRLF por LF dentro da fonte muda a versão', () => {
    const comCrlf = novo('\n', { fonte: Buffer.from([0x00, 0x0d, 0x0a, 0xff]) });
    const comLf = novo('\n', { fonte: Buffer.from([0x00, 0x0a, 0xff]) });
    expect(calcularHash(comCrlf)).not.toBe(calcularHash(comLf));
  });

  it('o CI audita as dependências do backend sem procurar lockfile na raiz do workspace', () => {
    const ci = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
    expect(ci).toContain('npm audit --omit=dev --audit-level=high --workspaces=false');
  });
});
