/**
 * Orquestrador Principal do Frontend (Inventory Management System)
 */

/**
 * Alterna a tela ativa do sistema
 * @param {string} screenId 
 */
function showScreen(screenId) {
  const publicScreens = ['screen-login', 'screen-troca-senha-obrigatoria'];
  const employeeScreens = ['screen-home', 'screen-contagem', 'screen-resultado', 'screen-catalogo', 'screen-produtores', 'screen-historico-contagens'];
  if (!Auth.usuario && screenId !== 'screen-login') {
    screenId = 'screen-login';
  } else if (Auth.usuario?.mustChangePassword && screenId !== 'screen-login') {
    screenId = 'screen-troca-senha-obrigatoria';
  } else if (!Auth.isAdmin() && !publicScreens.includes(screenId) && !employeeScreens.includes(screenId)) {
    screenId = 'screen-home';
  }
  if ((screenId === 'screen-registro' || screenId === 'screen-empresas') && Auth.usuario?.papel !== 'super_admin') {
    screenId = Auth.usuario ? 'screen-home' : 'screen-login';
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Ações contextuais por tela
  if (screenId === 'screen-backoffice') {
    Produtos.carregar();
    carregarBackofficeKPIs();
  } else if (screenId === 'screen-home') {
    Auth.atualizarInterface();
    carregarDashboard();
  } else if (screenId === 'screen-empresas') {
    Empresas.carregar();
  } else if (screenId === 'screen-catalogo') {
    Consulta.carregarCatalogo();
  } else if (screenId === 'screen-produtores') {
    Consulta.carregarProdutores();
  } else if (screenId === 'screen-historico-contagens') {
    Consulta.carregarHistorico();
  }
}

/**
 * Carrega dados contextuais e KPIs do dashboard da Home
 */
async function carregarDashboard() {
  if (!Auth.isAdmin()) {
    await Consulta.carregarResumo();
    return;
  }
  // 1. Atualiza dados de boas-vindas
  const homeUserEl = document.getElementById('home-user-name');
  if (homeUserEl) {
    homeUserEl.textContent = Auth.usuario?.nome || 'Usuário';
  }

  // 2. Formata data atual
  const dateEl = document.getElementById('home-current-date');
  if (dateEl) {
    const hoje = new Date();
    const opcoes = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dataFormatada = hoje.toLocaleDateString('pt-BR', opcoes);
    dateEl.innerHTML = `<i class="ti ti-calendar"></i> ${dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)} | Painel Operacional`;
  }

  // 3. Busca KPIs em paralelo
  try {
    const [resProd, resForn, resHist] = await Promise.all([
      API.get('/produtos?limit=1'),
      API.get('/produtos/fornecedores'),
      API.get('/contagens?limit=100')
    ]);

    const kpiProd = document.getElementById('kpi-total-produtos');
    if (kpiProd && resProd && resProd.data?.pagination) {
      kpiProd.textContent = resProd.data.pagination.total ?? 0;
    }

    const kpiForn = document.getElementById('kpi-total-fornecedores');
    if (kpiForn && resForn && resForn.data?.fornecedores) {
      kpiForn.textContent = resForn.data.fornecedores.length ?? 0;
    }

    const kpiCont = document.getElementById('kpi-total-contagens');
    if (kpiCont && resHist && resHist.data) {
      kpiCont.textContent = resHist.data.total ?? (resHist.data.contagens?.length ?? 0);
    }
  } catch (err) {
    console.warn('[DASHBOARD] Falha ao atualizar KPIs em tempo real:', err);
  }
}

/**
 * Alterna abas dentro do Back-office
 * @param {string} tabId 
 */
function switchTab(tabId) {
  if (!Auth.isAdmin() || Auth.usuario?.mustChangePassword) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

  const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);

  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  fecharBoSidebar();
  carregarBackofficeKPIs();

  const titles = {
    produtos: { title: 'Catálogo de Produtos', subtitle: 'Gerenciamento completo de itens, SKUs e saldos' },
    estoque: { title: 'Importação de Estoque', subtitle: 'Importe e cruze relatórios em PDF do Tiny ERP' },
    usuarios: { title: 'Equipe & Funcionários', subtitle: 'Gerenciamento de acessos e permissões do sistema' },
    historico: { title: 'Histórico de Contagens', subtitle: 'Consulte inventários passados e relatórios' },
    atividades: { title: 'Log de Auditoria', subtitle: 'Rastreabilidade e histórico de ações no sistema' },
    config: { title: 'Configurações de Acesso', subtitle: 'Segurança e credenciais da conta' }
  };
  const titleEl = document.getElementById('bo-page-title');
  const subEl = document.getElementById('bo-page-subtitle');
  if (titleEl && titles[tabId]) titleEl.textContent = titles[tabId].title;
  if (subEl && titles[tabId]) subEl.textContent = titles[tabId].subtitle;

  // Carregamento contextual por aba
  if (tabId === 'produtos') {
    Produtos.carregar();
  } else if (tabId === 'historico') {
    Historico.carregar();
  } else if (tabId === 'usuarios' && typeof Usuarios !== 'undefined') {
    Usuarios.carregar();
  } else if (tabId === 'estoque' && typeof StockImport !== 'undefined') {
    StockImport.carregarHistorico();
  } else if (tabId === 'atividades' && typeof Atividades !== 'undefined') {
    Atividades.carregar();
  }
}

/**
 * Controla o Drawer (Sidebar mobile) do Back-office
 */
function toggleBoSidebar() {
  const sidebar = document.getElementById('bo-sidebar');
  const backdrop = document.getElementById('bo-sidebar-backdrop');
  const menuBtn = document.getElementById('bo-menu-btn');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('active', isOpen);
  if (menuBtn) menuBtn.setAttribute('aria-expanded', String(isOpen));
}

function fecharBoSidebar() {
  const sidebar = document.getElementById('bo-sidebar');
  const backdrop = document.getElementById('bo-sidebar-backdrop');
  const menuBtn = document.getElementById('bo-menu-btn');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

/**
 * Carrega KPIs executivos no cabeçalho do Back-office
 */
async function carregarBackofficeKPIs() {
  if (!Auth.isAdmin()) return;
  try {
    const [resProd, resForn, resHist, resUsers] = await Promise.allSettled([
      API.get('/produtos?limit=1'),
      API.get('/produtos/fornecedores'),
      API.get('/contagens?limit=1'),
      API.get('/usuarios')
    ]);

    const kpiProd = document.getElementById('bo-kpi-produtos');
    if (kpiProd && resProd.status === 'fulfilled' && resProd.value.data?.pagination) {
      kpiProd.textContent = resProd.value.data.pagination.total ?? 0;
    }

    const kpiForn = document.getElementById('bo-kpi-fornecedores');
    if (kpiForn && resForn.status === 'fulfilled' && resForn.value.data?.fornecedores) {
      kpiForn.textContent = resForn.value.data.fornecedores.length ?? 0;
    }

    const kpiCont = document.getElementById('bo-kpi-contagens');
    if (kpiCont && resHist.status === 'fulfilled' && resHist.value.data) {
      kpiCont.textContent = resHist.value.data.total ?? (resHist.value.data.contagens?.length ?? 0);
    }

    const kpiUsers = document.getElementById('bo-kpi-usuarios');
    if (kpiUsers && resUsers.status === 'fulfilled' && resUsers.value.data?.usuarios) {
      kpiUsers.textContent = resUsers.value.data.usuarios.length ?? 0;
    }
  } catch (err) {
    console.warn('[BACKOFFICE] Falha ao carregar KPIs executivos:', err);
  }
}

function abrirHistoricoContagens() {
  if (Auth.isAdmin()) {
    showScreen('screen-backoffice');
    switchTab('historico');
  } else {
    showScreen('screen-historico-contagens');
  }
}

/**
 * Alterna entre tema claro e escuro, persistindo em localStorage
 */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('inventory_theme', next);

  document.querySelectorAll('.btn-theme').forEach(b => {
    b.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

/**
 * Inicialização global da aplicação ao carregar a página
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializar tema
  const savedTheme = localStorage.getItem('inventory_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', savedTheme);
  document.querySelectorAll('.btn-theme').forEach(b => {
    b.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  });

  // 2. Configurar busca de fornecedor com debounce
  const inputBusca = document.getElementById('busca-fornecedor');
  if (inputBusca) {
    inputBusca.addEventListener('input', debounce((e) => {
      Contagens.filtrarProdutores(e.target.value);
    }, 250));
  }

  // 3. Fechar sugestões ao clicar fora
  document.addEventListener('click', (e) => {
    const box = document.getElementById('sugestoes-fornecedor');
    if (box && !e.target.closest('.fornecedor-search')) {
      box.classList.remove('show');
    }
  });

  // 4. Fechar modais com Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Produtos.fecharModal();
      if (typeof Usuarios !== 'undefined') Usuarios.fecharModal();
      if (typeof Atividades !== 'undefined') Atividades.fecharModal();
    }
  });

  // 5. Restaurar sessão ativa ou exibir login
  const logado = await Auth.restaurarSessao();
  if (logado) {
    // Se mustChangePassword, a tela já foi redirecionada em restaurarSessao()
    if (!Auth.usuario?.mustChangePassword) {
      showScreen('screen-home');
    }
  } else {
    showScreen('screen-login');
  }
});
