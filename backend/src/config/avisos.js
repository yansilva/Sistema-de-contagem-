/**
 * Filtro de avisos do Node por código.
 *
 * Na Vercel (Node 24) o ambiente da função chama `url.parse()` ao subir cada instância e o Node imprime
 * "[DEP0169] DeprecationWarning" nos logs. O projeto não chama `url.parse()` em nenhum ponto; o aviso é
 * inofensivo e vem do runtime. Em vez de desligar todos os avisos de depreciação, este filtro descarta
 * apenas os códigos listados e deixa todos os outros aparecerem normalmente.
 */
function ignorarAvisos(codigos = ['DEP0169']) {
  const ignorados = new Set(codigos);
  const original = process.emitWarning;

  process.emitWarning = function emitWarningFiltrado(aviso, ...args) {
    const opcoes = args[0];
    const codigo = opcoes && typeof opcoes === 'object' ? opcoes.code : args[1];
    if (codigo && ignorados.has(codigo)) return undefined;
    return original.call(process, aviso, ...args);
  };

  // Devolve uma função para desfazer o filtro (usada nos testes).
  return function restaurar() {
    process.emitWarning = original;
  };
}

module.exports = { ignorarAvisos };
