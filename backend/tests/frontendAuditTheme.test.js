const fs = require('fs');
const path = require('path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = file => fs.readFileSync(path.join(frontend, 'css', file), 'utf8');

const color = value => {
  if (value.startsWith('#')) return value;
  const [, r, g, b, alpha] = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
  const base = [23, 34, 52];
  return `#${[r, g, b].map((channel, index) => Math.round(Number(channel) * Number(alpha ?? 1) + base[index] * (1 - Number(alpha ?? 1))).toString(16).padStart(2, '0')).join('')}`;
};
const luminance = hex => {
  const rgb = hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

describe('tema acessível da interface', () => {
  test.each(['light', 'dark'])('badges semânticos atingem AA em %s', theme => {
    const css = read('global.css');
    const source = theme === 'dark' ? css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/)[1] : css.match(/:root\s*\{([^}]+)\}/)[1];
    const values = Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*(#[\da-f]{6}|rgba?\([^)]*\))/gi)].map(([, key, value]) => [key, value]));
    for (const [kind, bg] of [['sucesso', 'sucesso-bg'], ['aviso', 'aviso-bg'], ['perigo', 'perigo-bg']]) {
      expect(values[`--cor-${kind}-texto`]).toBeDefined();
      expect(contrast(color(values[`--cor-${kind}-texto`]), color(values[`--cor-${bg}`]))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('movimento reduzido remove deslocamento e preserva feedback de estado', () => {
    const css = read('global.css') + read('components.css') + read('pages.css') + read('superadmin.css') + read('backoffice.css');
    expect(css).not.toMatch(/animation-duration:\s*0\.01ms|transition-duration:\s*0\.01ms/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.btn:active[^}]*transform:\s*none/s);
  });
});
