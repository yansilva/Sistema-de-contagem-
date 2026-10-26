#!/usr/bin/env node
/**
 * Build do frontend: frontend/ -> public/ (pasta servida pela Vercel).
 *
 * - Recria a pasta de saída do zero (não deixa arquivos órfãos).
 * - Calcula um hash do conteúdo de css/, js/ e assets/fonts/ e o aplica como ?v=HASH nas referências
 *   do HTML publicado (css, js, preload de fonte), no module-loader (via data-assets-v em <html>) e nas
 *   fontes referenciadas por fonts.css. Isso permite Cache-Control imutável (ver vercel.json).
 * - O HTML de origem (frontend/index.html) nunca é alterado.
 *
 * Uso: node scripts/build.js [--out=pasta]   (padrão: public)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const origem = path.join(raiz, 'frontend');
const argumentoSaida = process.argv.find((arg) => arg.startsWith('--out='));
const saida = path.resolve(raiz, argumentoSaida ? argumentoSaida.slice(6) : 'public');

const { verificar } = require('./verificar-icones');

function listar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    return entrada.isDirectory() ? listar(caminho) : [caminho];
  });
}

function calcularHash() {
  const hash = crypto.createHash('sha256');
  const arquivos = ['css', 'js', path.join('assets', 'fonts')]
    .flatMap((pasta) => (fs.existsSync(path.join(origem, pasta)) ? listar(path.join(origem, pasta)) : []))
    .sort();
  for (const arquivo of arquivos) {
    hash.update(path.relative(origem, arquivo).replace(/\\/g, '/'));
    hash.update(fs.readFileSync(arquivo));
  }
  return hash.digest('hex').slice(0, 10);
}

function versionarHtml(html, versao) {
  return html
    .replace(/(href|src)="(\/(?:css|js)\/[^"?#]+)"/g, `$1="$2?v=${versao}"`)
    .replace(/(href=")(\/assets\/fonts\/[^"?#]+)(?:\?[^"]*)?(")/g, `$1$2?v=${versao}$3`)
    .replace(/<html(?![^>]*data-assets-v)/, `<html data-assets-v="${versao}"`);
}

function versionarFontes(css, versao) {
  return css.replace(/url\('(\/assets\/fonts\/[^'?]+)(?:\?[^']*)?'\)/g, `url('$1?v=${versao}')`);
}

function build() {
  const { faltando } = verificar();
  if (faltando.length) {
    throw new Error(`Ícones sem glifo no subset local: ${faltando.join(', ')}`);
  }

  const versao = calcularHash();
  fs.rmSync(saida, { recursive: true, force: true });
  fs.cpSync(origem, saida, { recursive: true });

  for (const arquivo of fs.readdirSync(saida).filter((nome) => nome.endsWith('.html'))) {
    const caminho = path.join(saida, arquivo);
    fs.writeFileSync(caminho, versionarHtml(fs.readFileSync(caminho, 'utf8'), versao));
  }
  const fontesCss = path.join(saida, 'css', 'fonts.css');
  fs.writeFileSync(fontesCss, versionarFontes(fs.readFileSync(fontesCss, 'utf8'), versao));

  console.log(`[Build] ${path.relative(raiz, saida) || '.'} recriada a partir de frontend/ (assets v=${versao}).`);
  return versao;
}

if (require.main === module) build();

module.exports = { build, versionarHtml, versionarFontes };
