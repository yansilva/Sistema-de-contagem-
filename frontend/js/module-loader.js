/** Carrega somente os módulos usados pelo perfil autenticado. */
const FrontendModules = (() => {
  const funcionario = ['consulta.js', 'contagens.js', 'semana.js', 'stock-import.js'];
  const administrador = [...funcionario, 'produtos.js', 'historico.js', 'usuarios.js', 'atividades.js'];
  const grupos = {
    funcionario,
    gestor: administrador,
    admin: administrador,
    administrador,
    super_admin: [...administrador, 'empresas.js', 'empresa-detalhes.js', 'auditoria.js']
  };
  const carregados = new Set();
  const pendentes = new Map();

  function carregarScript(arquivo) {
    if (carregados.has(arquivo)) return Promise.resolve();
    if (pendentes.has(arquivo)) return pendentes.get(arquivo);

    const carregamento = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `/js/${arquivo}`;
      script.async = false;
      script.dataset.frontendModule = arquivo;
      script.onload = () => {
        carregados.add(arquivo);
        pendentes.delete(arquivo);
        resolve();
      };
      script.onerror = () => {
        pendentes.delete(arquivo);
        script.remove();
        reject(new Error(`Não foi possível carregar o módulo ${arquivo}.`));
      };
      document.body.appendChild(script);
    });

    pendentes.set(arquivo, carregamento);
    return carregamento;
  }

  async function carregarParaPapel(papel) {
    await Promise.all((grupos[papel] || []).map(carregarScript));
  }

  return { carregarScript, carregarParaPapel };
})();
