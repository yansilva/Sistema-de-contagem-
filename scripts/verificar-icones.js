#!/usr/bin/env node
/**
 * Garante que todo ícone `ti-*` usado no frontend existe no subset local (frontend/css/fonts.css).
 * Uso: node scripts/verificar-icones.js   (sai com código 1 se faltar algum glifo)
 *
 * Para incluir um ícone novo: acrescente a classe em fonts.css e regere o woff2 do subset
 * (pyftsubset sobre o tabler-icons.woff2 3.46.0 com os codepoints de fonts.css).
 */
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', 'frontend');

function listar(dir, extensoes) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return listar(caminho, extensoes);
    return extensoes.includes(path.extname(entrada.name)) ? [caminho] : [];
  });
}

function verificar() {
  const css = fs.readFileSync(path.join(frontend, 'css', 'fonts.css'), 'utf8');
  const definidos = new Set([...css.matchAll(/\.(ti-[a-z0-9-]+):before/g)].map((m) => m[1]));
  // Nomes montados em tempo de execução (usuarios.js: ti-${ativo ? 'user-x' : 'user-check'}).
  const dinamicos = ['ti-user-x', 'ti-user-check'];

  const usados = new Set(dinamicos);
  const fontes = [
    path.join(frontend, 'index.html'),
    path.join(frontend, 'previa.html'),
    ...listar(path.join(frontend, 'js'), ['.js'])
  ];
  for (const arquivo of fontes) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    // Só classes dentro de class="..." / className / 'ti ti-x' / literais: qualquer token ti-nome.
    for (const m of texto.matchAll(/(?<![\w-])ti-[a-z0-9]+(?:-[a-z0-9]+)*/g)) usados.add(m[0]);
  }

  const faltando = [...usados].filter((classe) => !definidos.has(classe)).sort();
  return { usados: usados.size, definidos: definidos.size, faltando };
}

if (require.main === module) {
  const { usados, definidos, faltando } = verificar();
  console.log(`[Ícones] usados: ${usados} | no subset: ${definidos}`);
  if (faltando.length) {
    console.error(`[Ícones] FALTAM no subset local: ${faltando.join(', ')}`);
    process.exit(1);
  }
  console.log('[Ícones] OK: todos os ícones usados existem no subset local.');
}

module.exports = { verificar };
