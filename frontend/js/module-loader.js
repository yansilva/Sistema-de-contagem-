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
  // CSS sob demanda: o funcionário não baixa o CSS do back-office nem do console do Super Admin.
  // Os <link> entram no fim do <head>, preservando a ordem de cascata original (backoffice antes de superadmin).
  const estilosAdmin = ['backoffice.css'];
  const estilos = {
    gestor: estilosAdmin,
    admin: estilosAdmin,
    administrador: estilosAdmin,
    super_admin: [...estilosAdmin, 'superadmin.css']
  };
  const carregados = new Set();
  const pendentes = new Map();
  // O build coloca data-assets-v (hash do conteúdo) em <html>; em desenvolvimento não há versão.
  const comVersao = (url) => {
    const versao = document.documentElement?.dataset?.assetsV;
    return versao ? `${url}?v=${encodeURIComponent(versao)}` : url;
  };
  const estilosPendentes = new Map();

  function carregarEstilo(arquivo) {
    const href = `/css/${arquivo}`;
    if (estilosPendentes.has(arquivo)) return estilosPendentes.get(arquivo);
    const existente = document.querySelector(`link[rel="stylesheet"][href^="${href}"]`);
    if (existente && existente.sheet) return Promise.resolve();

    const carregamento = new Promise((resolve) => {
      const link = existente || document.createElement('link');
      link.onload = () => resolve();
      // CSS ausente não deve travar a entrada no sistema; a interface apenas fica sem o estilo.
      link.onerror = () => {
        console.warn(`[CSS_LOAD_ERROR] ${arquivo}`);
        resolve();
      };
      if (!existente) {
        link.rel = 'stylesheet';
        link.href = comVersao(href);
        document.head.appendChild(link);
      }
    });
    estilosPendentes.set(arquivo, carregamento);
    return carregamento;
  }

  function carregarScript(arquivo) {
    if (carregados.has(arquivo)) return Promise.resolve();
    if (pendentes.has(arquivo)) return pendentes.get(arquivo);

    const carregamento = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = comVersao(`/js/${arquivo}`);
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
    await Promise.all([
      ...(estilos[papel] || []).map(carregarEstilo),
      ...(grupos[papel] || []).map(carregarScript)
    ]);
  }

  return { carregarScript, carregarParaPapel };
})();
