const fs = require('fs');
const path = require('path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = relative => fs.readFileSync(path.join(frontend, relative), 'utf8');

describe('identidade do Sistema de Estoque', () => {
  test('usa uma marca local acessível no login e no cabeçalho', () => {
    const html = read('index.html');
    const logo = read('assets/logo-sistema-estoque.svg');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);

    expect(html).toContain('<title>Sistema de Estoque');
    expect(html).toMatch(/rel="icon"[^>]+href="\/assets\/logo-sistema-estoque\.svg"/);
    expect(html).toMatch(/<img[^>]+src="\/assets\/logo-sistema-estoque\.svg"[^>]+alt="[^"]+"/);
    expect(new Set(ids).size).toBe(ids.length);
    expect(logo).toMatch(/<svg[^>]+viewBox=/);
  });

  test('mantém o tema cobalto nos dois modos e respeita movimento reduzido', () => {
    const css = read('css/global.css');
    expect(css).toMatch(/--cor-primaria:\s*#2457d6/i);
    expect(css).toMatch(/\[data-theme="dark"\][\s\S]*--cor-primaria:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
