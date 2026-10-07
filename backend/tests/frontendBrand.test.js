const fs = require('fs');
const path = require('path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = relative => fs.readFileSync(path.join(frontend, relative), 'utf8');

const luminance = hex => {
  const values = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = values.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (foreground, background) => {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

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

  test('mantém tokens completos e contraste AA nas mensagens de sucesso', () => {
    const global = read('css/global.css');
    const components = read('css/components.css');
    const successToast = components.match(/\.toast\.success\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i);

    for (const token of ['cor-texto-mutado', 'cor-fundo-cartao', 'sombra-sm']) {
      expect(global).toMatch(new RegExp(`--${token}:\\s*var\\(--`));
    }
    expect(successToast).not.toBeNull();
    expect(contrast('#ffffff', successToast[1])).toBeGreaterThanOrEqual(4.5);
  });

  test('mantém nomes acessíveis e semântica nativa nos controles operacionais', () => {
    const html = read('index.html');
    const contagens = read('js/contagens.js');

    expect(html).toMatch(/<input(?=[^>]*id="busca-rapida-func")(?=[^>]*aria-label="Buscar no catálogo por nome, SKU ou código de barras")[^>]*>/);
    for (const action of ['action-16', 'action-17', 'action-18']) {
      expect(html).toMatch(new RegExp(`<button[^>]+data-click="${action}"`));
    }
    expect(html).toMatch(/<button[^>]+data-click="action-105"[^>]+aria-label="Ver todas as organizações"/);
    expect(html).toMatch(/id="progresso-contagem-medidor"[^>]+role="progressbar"[^>]+aria-labelledby="progresso-contagem-texto"/);
    expect(contagens).toContain("progressoMedidor.setAttribute('aria-valuenow', String(totalContados))");
    for (const label of ['Fechar janela de produto', 'Fechar janela de usuário', 'Fechar detalhes da auditoria']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
