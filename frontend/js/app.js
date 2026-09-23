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
    Empresas.carregar({ containerId: 'empresas-lista-compat', page: 1 });
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
  // 1. Papel Funcionário
  if (!Auth.isAdmin()) {
    await Consulta.carregarResumo();
    // Renderiza contagens recentes do funcionário
    try {
      const resHist = await API.get('/contagens?limit=5');
      const container = document.getElementById('funcionario-recentes-container');
      if (container && resHist && resHist.data?.contagens) {
        const contagens = resHist.data.contagens;
        if (contagens.length === 0) {
          container.innerHTML = '<p style="padding:18px; text-align:center; color:var(--cor-texto-mudo); font-size:0.875rem;">Nenhuma contagem registrada ainda. Inicie sua primeira contagem no botão acima!</p>';
        } else {
          container.innerHTML = `
            <table class="dash-recent-table">
              <thead>
                <tr>
                  <th>Data e Hora</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                ${contagens.map(c => {
                  const dataStr = c.iniciado_em ? new Date(c.iniciado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                  const statusBadge = c.status === 'finalizada'
                    ? '<span class="badge badge-success"><i class="ti ti-check"></i> Finalizada</span>'
                    : '<span class="badge badge-warning"><i class="ti ti-clock"></i> Em andamento</span>';
                  return `
                    <tr>
                      <td><strong>${dataStr}</strong></td>
                      <td>${statusBadge}</td>
                      <td><button class="btn btn-outline btn-sm" data-id="${c.id}" data-click="action-72">Ver Detalhes</button></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `;
        }
      }
    } catch (e) {
      console.warn('[DASHBOARD_FUNC] Erro ao carregar contagens recentes:', e);
    }
    return;
  }

  // 2. Papel Super Admin (Console SaaS)
  if (Auth.usuario?.papel === 'super_admin') {
    const sessaoAuditoria = typeof Auditoria !== 'undefined' ? Auditoria.restaurarLocal() : null;
    if (sessaoAuditoria) {
      EmpresaDetalhes.abrir(sessaoAuditoria.empresaId, 'auditoria');
    } else {
      switchSaasTab('visao-geral');
    }
    return;
  }

  // 3. Papel Administrador da Empresa
  const homeUserEl = document.getElementById('home-user-name');
  if (homeUserEl) {
    homeUserEl.textContent = Auth.usuario?.nome || 'Usuário';
  }

  const dateEl = document.getElementById('home-current-date');
  if (dateEl) {
    const hoje = new Date();
    const opcoes = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dataFormatada = hoje.toLocaleDateString('pt-BR', opcoes);
    dateEl.innerHTML = `<i class="ti ti-calendar"></i> ${dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)} | Painel Operacional`;
  }

  try {
    const [resProd, resForn, resHist] = await Promise.all([
      API.get('/produtos?limit=1'),
      API.get('/produtos/fornecedores'),
      API.get('/contagens?limit=10')
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

    // Tabela de contagens recentes e alerta de divergência para Administrador
    if (resHist && resHist.data?.contagens) {
      const contagens = resHist.data.contagens;
      const tbody = document.getElementById('admin-recent-tbody');
      const alertCard = document.getElementById('admin-divergencia-alerta');

      if (contagens.length > 0) {
        // Alerta da última divergência
        const ultimaComDiferenca = contagens.find(c => c.tem_diferenca === true);
        if (ultimaComDiferenca && alertCard) {
          alertCard.style.display = 'flex';
          const tituloEl = document.getElementById('admin-divergencia-titulo');
          const descEl = document.getElementById('admin-divergencia-desc');
          const btnRel = document.getElementById('admin-divergencia-btn');
          if (tituloEl) tituloEl.textContent = 'Divergência detectada na última conferência de estoque';
          if (descEl) descEl.textContent = `A contagem realizada por ${ultimaComDiferenca.iniciado_por_nome || 'Operador'} apresentou sobras ou faltas em relação ao sistema.`;
          if (btnRel) btnRel.setAttribute('data-id', ultimaComDiferenca.id);
        } else if (alertCard) {
          alertCard.style.display = 'none';
        }

        // Tabela recente
        if (tbody) {
          tbody.innerHTML = contagens.slice(0, 5).map(c => {
            const dataStr = c.iniciado_em ? new Date(c.iniciado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
            const difBadge = c.tem_diferenca
              ? '<span class="badge badge-danger"><i class="ti ti-alert-triangle"></i> Com divergência</span>'
              : '<span class="badge badge-success"><i class="ti ti-check"></i> Sem diferença</span>';
            return `
              <tr>
                <td><strong>${dataStr}</strong></td>
                <td>${escapeHtml(c.iniciado_por_nome || 'Operador')}</td>
                <td>${difBadge}</td>
                <td><button class="btn btn-outline btn-sm" data-id="${c.id}" data-click="action-72">Conferir</button></td>
              </tr>
            `;
          }).join('');
        }
      } else {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--cor-texto-mudo);">Nenhuma conferência física registrada ainda.</td></tr>';
        }
        if (alertCard) alertCard.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('[DASHBOARD_ADMIN] Falha ao atualizar KPIs da loja:', err);
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
    estoque: { title: 'Importação de Estoque', subtitle: 'Importe e cruze relatórios em PDF do Tiny ou ERP da Olist' },
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
 * Alterna entre as abas do Console SaaS do Super Admin
 * @param {string} tabId - 'visao-geral' | 'tenants' | 'auditoria-global'
 */
function switchSaasTab(tabId) {
  const tabs = ['visao-geral', 'tenants', 'auditoria-global'];
  if (!tabs.includes(tabId)) tabId = 'visao-geral';

  // 1. Alternar classes dos botões da sidebar
  document.querySelectorAll('.saas-nav-btn[data-saas-tab]').forEach(btn => {
    if (btn.getAttribute('data-saas-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 2. Alternar visibilidade das seções
  tabs.forEach(t => {
    const sec = document.getElementById(`saas-tab-${t}`);
    if (sec) {
      sec.style.display = (t === tabId) ? 'block' : 'none';
    }
  });
  const detalhes = document.getElementById('saas-tab-detalhes');
  if (detalhes) detalhes.style.display = 'none';

  // 3. Atualizar Título e Descrição da página
  const titleEl = document.getElementById('saas-page-title');
  const descEl = document.getElementById('saas-page-desc');

  if (tabId === 'visao-geral') {
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-dashboard" style="color:var(--cor-primaria)"></i> Visão Geral da Plataforma';
    if (descEl) descEl.textContent = 'Métricas consolidadas de infraestrutura, clientes e volumetria do SaaS';
    if (typeof Empresas !== 'undefined' && Empresas.carregar) {
      Empresas.carregarMetricas();
      Empresas.carregar({ containerId: 'super-empresas-lista', page: 1, resumo: true });
    }
  } else if (tabId === 'tenants') {
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-buildings" style="color:var(--cor-primaria)"></i> Gestão de Organizações & Tenants';
    if (descEl) descEl.textContent = 'Administração de status, planos, auditoria de dados e suporte assistido';
    if (typeof Empresas !== 'undefined' && Empresas.carregar) {
      Empresas.carregar({ containerId: 'empresas-lista', page: 1 });
    }
  } else if (tabId === 'auditoria-global') {
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-shield-search" style="color:var(--cor-primaria)"></i> Trilha de Auditoria Global';
    if (descEl) descEl.textContent = 'Monitoramento contínuo de eventos de segurança, acessos e alterações da plataforma';
    if (typeof Atividades !== 'undefined' && Atividades.carregar) {
      Atividades.carregar();
    }
  }
}
window.switchSaasTab = switchSaasTab;

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
      if (typeof Usuarios !== 'undefined') {
        Usuarios.fecharModal();
        Usuarios.fecharModalReset();
      }
      if (typeof Atividades !== 'undefined') Atividades.fecharModal();
      if (typeof Empresas !== 'undefined') {
        Empresas.fecharModalExclusao();
        Empresas.fecharModalEdicao();
        Empresas.fecharModalStatus();
      }
      if (typeof EmpresaDetalhes !== 'undefined') EmpresaDetalhes.fecharSenhaTemporaria();
    }
    if (e.key === 'Tab') {
      const modal = document.querySelector('.modal.active, .app-modal.active');
      if (!modal) return;
      const focaveis = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
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
