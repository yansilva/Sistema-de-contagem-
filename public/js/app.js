/**
 * Orquestrador Principal do Frontend (Inventory Management System)
 */

/** Elemento visível (display/visibility computados) */
function elementoVisivel(el) {
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/** Primeiro modal realmente visível (.modal ou .app-modal), ou null */
function modalAberto() {
  return [...document.querySelectorAll('.modal, .app-modal')].find(elementoVisivel) || null;
}

/** Ajuda contextual (modal-ajuda). Funciona logado e deslogado. */
const AJUDA_CONTEXTUAL = {
  'screen-contagem': [
    '"Digitado, falta salvar" quer dizer que você digitou a quantidade, mas ela ainda não foi gravada.',
    'Use Salvar e continuar para gravar. Dá para parar e retomar depois, do ponto em que ficou.'
  ],
  'screen-resultado': [
    'Sobra: foi contado mais do que o saldo de referência.',
    'Falta: foi contado menos do que o saldo de referência.'
  ],
  'screen-importar-estoque': [
    'O PDF do ERP atualiza só os SKUs ativos que já estão cadastrados.',
    'Você vê uma prévia e confirma antes de aplicar qualquer mudança.'
  ],
  'screen-backoffice:produtos': [
    'Importar catálogo (.xlsx) pode mesclar com o catálogo atual ou substituí-lo por completo.',
    'Mesclar atualiza e adiciona produtos sem excluir os outros. Substituir apaga o que não está na planilha.'
  ],
  'screen-backoffice:estoque': [
    'O PDF do ERP atualiza só os SKUs ativos que já estão cadastrados.',
    'Você vê uma prévia e confirma antes de aplicar qualquer mudança.'
  ],
  'screen-backoffice:atividades': [
    'Mostra quem fez o quê na sua empresa, com data e resultado.',
    'Use os filtros de data, ação e resultado para achar um registro.'
  ],
  'screen-empresas': [
    'Inativar uma empresa encerra na hora todas as sessões dela.',
    'Reativar libera novos acessos, mas as sessões antigas continuam inválidas.'
  ]
};

function preencherAjudaContextual() {
  const secao = document.getElementById('ajuda-contextual');
  const lista = document.getElementById('ajuda-contextual-lista');
  if (!secao || !lista) return;
  const tela = document.querySelector('.screen.active')?.id || '';
  const aba = tela === 'screen-backoffice'
    ? document.querySelector('#screen-backoffice .tab.active')?.getAttribute('data-tab')
    : '';
  const linhas = AJUDA_CONTEXTUAL[aba ? `${tela}:${aba}` : tela] || [];
  lista.textContent = '';
  linhas.forEach((texto) => {
    const li = document.createElement('li');
    li.textContent = texto;
    lista.appendChild(li);
  });
  secao.hidden = linhas.length === 0;
  // Super Admin não faz contagem: mostra só "Nesta tela" e os atalhos
  const superAdmin = typeof Auth !== 'undefined' && Auth.usuario?.papel === 'super_admin';
  const blocoContagem = document.getElementById('ajuda-contagem');
  if (blocoContagem) blocoContagem.hidden = superAdmin;
  const titulo = document.getElementById('modal-ajuda-titulo');
  if (titulo) titulo.textContent = superAdmin ? 'Ajuda' : 'Como funciona a contagem';
}

function abrirAjuda() {
  const modal = document.getElementById('modal-ajuda');
  if (!modal) return;
  preencherAjudaContextual();
  modal.hidden = false;
  modal.style.display = 'flex';
}

function fecharAjuda() {
  const modal = document.getElementById('modal-ajuda');
  if (!modal) return;
  modal.style.display = 'none';
  modal.hidden = true;
  // Se o gatilho original (botão da barra) está oculto, como no menu do celular, o gerenciador
  // não consegue devolver o foco: usa o botão do menu hambúrguer.
  setTimeout(() => {
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && document.contains(ativo) && elementoVisivel(ativo)) return;
    const toggle = document.getElementById('mobile-nav-toggle');
    if (toggle && !toggle.hidden && elementoVisivel(toggle)) toggle.focus();
  }, 0);
}

/**
 * Gerenciador genérico de modais: role/aria, foco inicial e retorno de foco.
 * Reage só a class/style; os atributos que ele mesmo define não disparam o observer.
 */
function iniciarGerenciadorModais() {
  const estado = new WeakMap(); // modal -> { visivel, anterior }
  const SELETOR_FOCAVEL = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

  const ao_mudar = (modal) => {
    const visivel = elementoVisivel(modal);
    const st = estado.get(modal) || { visivel: false, anterior: null };
    if (visivel === st.visivel) return;
    st.visivel = visivel;
    estado.set(modal, st);

    if (visivel) {
      st.anterior = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      if (!modal.hasAttribute('aria-labelledby') && !modal.hasAttribute('aria-label')) {
        const titulo = modal.querySelector('h2, h3');
        if (titulo) {
          if (titulo.id) modal.setAttribute('aria-labelledby', titulo.id);
          else if (titulo.textContent.trim()) modal.setAttribute('aria-label', titulo.textContent.trim());
        }
      }
      // Prioridade: foco explícito (data-foco-inicial), depois primeiro campo, por fim qualquer focável
      const marcado = modal.querySelector('[data-foco-inicial]');
      const campo = (marcado && elementoVisivel(marcado) ? marcado : null)
        || [...modal.querySelectorAll('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')].find(elementoVisivel)
        || [...modal.querySelectorAll(SELETOR_FOCAVEL)].find(elementoVisivel);
      if (campo) {
        campo.focus();
      } else {
        if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
        modal.focus();
      }
    } else {
      const anterior = st.anterior;
      st.anterior = null;
      if (anterior && document.contains(anterior) && typeof anterior.focus === 'function') anterior.focus();
    }
  };

  const observer = new MutationObserver((muts) => {
    muts.forEach(m => ao_mudar(m.target));
  });
  const registrar = (modal) => {
    if (estado.has(modal)) return;
    estado.set(modal, { visivel: elementoVisivel(modal), anterior: null });
    observer.observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });
  };
  document.querySelectorAll('.modal, .app-modal').forEach(registrar);

  // Modais criados depois do carregamento
  new MutationObserver((muts) => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches('.modal, .app-modal')) registrar(n);
      n.querySelectorAll && n.querySelectorAll('.modal, .app-modal').forEach(registrar);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Diálogo de confirmação próprio (substitui window.confirm).
 * Sem `acoes`: devolve Promise<boolean> (true = confirmou). Foco inicial em "Cancelar".
 * Com `acoes: [{rotulo, valor, perigo, padrao}]`: devolve o `valor` da ação escolhida,
 * ou false se cancelar/Esc. A ação com `padrao: true` recebe o foco inicial.
 */
let _confirmacaoPendente = null;
function confirmarAcao({ titulo = 'Confirmar ação', mensagem = '', confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false, acoes = null } = {}) {
  const modal = document.getElementById('modal-confirmacao');
  if (!modal) return Promise.resolve(false);
  if (_confirmacaoPendente) _confirmacaoPendente(false);

  return new Promise((resolve) => {
    const area = document.getElementById('modal-confirmacao-acoes');
    document.getElementById('modal-confirmacao-titulo').textContent = titulo;
    document.getElementById('modal-confirmacao-mensagem').textContent = mensagem;
    area.textContent = '';
    modal.querySelectorAll('[data-foco-inicial]').forEach(el => el.removeAttribute('data-foco-inicial'));

    const lista = Array.isArray(acoes) && acoes.length
      ? acoes
      : [{ rotulo: confirmar, valor: true, perigo: !!perigo }];
    const temPadrao = lista.some(a => a.padrao);

    const fechar = (valor) => {
      document.removeEventListener('keydown', aoTeclar, true);
      _confirmacaoPendente = null;
      modal.style.display = 'none';
      resolve(valor);
    };
    const aoTeclar = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      fechar(false);
    };
    const criar = (rotulo, valor, classe, foco) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${classe}`;
      b.textContent = rotulo;
      if (foco) b.setAttribute('data-foco-inicial', '');
      b.addEventListener('click', () => fechar(valor));
      area.appendChild(b);
      return b;
    };

    criar(cancelar, false, 'btn-outline', !temPadrao);
    lista.forEach(a => criar(a.rotulo, a.valor, a.perigo ? 'btn-danger' : 'btn-primary', !!a.padrao));

    _confirmacaoPendente = fechar;
    document.addEventListener('keydown', aoTeclar, true);
    // O gerenciador de modais guarda o foco anterior e foca [data-foco-inicial]
    modal.style.display = 'flex';
  });
}

// Mapa id da tela -> [hash, título]. Login não tem hash (URL limpa).
const ROTAS_TELAS = {
  'screen-login': ['', 'Entrar'],
  'screen-registro': ['#cadastro', 'Cadastrar empresa'],
  'screen-troca-senha-obrigatoria': ['#nova-senha', 'Definir nova senha'],
  'screen-home': ['#inicio', 'Início'],
  'screen-modalidade-contagem': ['#nova-contagem', 'Iniciar contagem'],
  'screen-contagem': ['#contagem', 'Contagem'],
  'screen-resultado': ['#resultado', 'Resultado da contagem'],
  'screen-historico-contagens': ['#historico', 'Histórico de contagens'],
  'screen-semana-contagem': ['#semana', 'Semana de contagem'],
  'screen-catalogo': ['#catalogo', 'Catálogo de produtos'],
  'screen-produtores': ['#produtores', 'Produtores'],
  'screen-empresas': ['#empresas', 'Empresas clientes'],
  'screen-backoffice': ['#backoffice', 'Painel de gestão'],
  'screen-importar-estoque': ['#estoque', 'Importar estoque']
};
let _telaAtualId = null;
let _primeiraTela = true;

function hashAtual() {
  try { return (typeof window !== 'undefined' && window.location && window.location.hash) || ''; } catch (e) { return ''; }
}

function telaDoHash(hash) {
  return Object.keys(ROTAS_TELAS).find(id => ROTAS_TELAS[id][0] && ROTAS_TELAS[id][0] === hash) || null;
}

/** Telas que dependem de uma sessão de contagem em andamento */
function telaExigeContagem(id) {
  return id === 'screen-contagem' || id === 'screen-resultado';
}

function atualizarRota(screenId, semHistorico) {
  const rota = ROTAS_TELAS[screenId];
  if (!rota) return;
  if (typeof document !== 'undefined') document.title = `${rota[1]} · Sistema de Estoque`;
  try {
    if (typeof history === 'undefined' || !history.pushState || !history.replaceState) return;
    const hash = rota[0];
    if (hashAtual() === hash) return;
    const base = `${window.location.pathname}${window.location.search}`;
    const url = hash ? base + hash : base;
    const usarPush = !semHistorico && hash && !_primeiraTela;
    if (usarPush) history.pushState({ tela: screenId }, '', url);
    else history.replaceState({ tela: screenId }, '', url);
  } catch (e) { /* ambiente sem histórico */ }
}

function moverFocoParaTela(target, screenId) {
  const rota = ROTAS_TELAS[screenId];
  const anuncio = document.getElementById('anuncio-tela');
  if (anuncio && rota) anuncio.textContent = rota[1];
  if (_primeiraTela || screenId === 'screen-login' || !target || !target.querySelectorAll) return;
  const visivel = (el) => !el.getClientRects || el.getClientRects().length > 0;
  const alvo = [...target.querySelectorAll('h1, h2')].find(visivel) || target;
  if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
  try { alvo.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
}

/** Volta/avança do navegador: abre a tela do hash sem criar nova entrada */
function aoMudarHistorico() {
  let id = telaDoHash(hashAtual());
  const contagensOk = typeof Contagens !== 'undefined';
  const temSessao = id === 'screen-resultado'
    ? !!(contagensOk && Contagens.resultadoId)
    : !!(contagensOk && Contagens.contagemId);
  if (!id || (telaExigeContagem(id) && !temSessao)) id = 'screen-home';
  if (id === _telaAtualId) return;
  showScreen(id, { semHistorico: true });
}

/**
 * Alterna a tela ativa do sistema
 * @param {string} screenId
 * @param {{semHistorico?: boolean}} [opcoes]
 */
function showScreen(screenId, opcoes) {
  const publicScreens = ['screen-login', 'screen-troca-senha-obrigatoria'];
  const employeeScreens = ['screen-home', 'screen-modalidade-contagem', 'screen-contagem', 'screen-resultado', 'screen-catalogo', 'screen-produtores', 'screen-historico-contagens', 'screen-semana-contagem', 'screen-importar-estoque'];
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
  if (screenId !== 'screen-importar-estoque' && document.getElementById('screen-importar-estoque')?.classList.contains('active')) {
    if (typeof StockImport !== 'undefined' && StockImport.cancelarPrevia && !StockImport._confirmando) StockImport.cancelarPrevia(true);
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    const reduzirMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduzirMovimento ? 'auto' : 'smooth' });
    atualizarRota(screenId, opcoes && opcoes.semHistorico);
    moverFocoParaTela(target, screenId);
    _telaAtualId = screenId;
    _primeiraTela = false;
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
  } else if (screenId === 'screen-semana-contagem') {
    Semana.carregar();
  } else if (screenId === 'screen-historico-contagens') {
    Consulta.carregarHistorico();
  } else if (screenId === 'screen-registro') {
    document.getElementById('reg-empresa')?.focus();
  } else if (screenId === 'screen-importar-estoque') {
    // Aberta por F5, hash ou Voltar do navegador (fora de StockImport.abrir)
    if (typeof StockImport !== 'undefined' && !StockImport._viaAbrir) {
      if (StockImport.definirOrigem) StockImport.definirOrigem('home');
      if (StockImport.carregarHistorico) StockImport.carregarHistorico();
    }
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
                      <td>${statusBadge}<br>${c.tipo === 'pecas_queijo' ? 'Peças de queijo' : 'Geral'}</td>
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
    dateEl.innerHTML = `<i class="ti ti-calendar"></i> ${dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)}`;
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
            const difBadge = c.tipo === 'pecas_queijo' ? `<span class="badge ${c.status === 'finalizada' ? 'badge-success' : 'badge-warning'}">Peças de queijo · ${c.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}</span>` : c.status !== 'finalizada' ? '<span class="badge badge-warning">Geral · Em andamento</span>' : c.tem_diferenca
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
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--cor-texto-mudo);">Nenhuma contagem finalizada ainda. Inicie uma contagem para ela aparecer aqui.</td></tr>';
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
  if (tabId === 'estoque') { fecharBoSidebar(); StockImport.abrir('backoffice'); return; }
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

  const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);

  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  const kpisBo = document.getElementById('bo-kpis');
  if (kpisBo) kpisBo.hidden = tabId !== 'produtos';

  fecharBoSidebar();
  if (tabId === 'produtos') carregarBackofficeKPIs();

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
  if (isOpen) {
    const primeiro = sidebar.querySelector('.bo-nav-item, .bo-sidebar-nav button, button:not(.bo-sidebar-close)') || sidebar.querySelector('button');
    if (primeiro && primeiro.focus) primeiro.focus();
  } else if (menuBtn && menuBtn.focus) {
    menuBtn.focus();
  }
}

function fecharBoSidebar() {
  const sidebar = document.getElementById('bo-sidebar');
  const backdrop = document.getElementById('bo-sidebar-backdrop');
  const menuBtn = document.getElementById('bo-menu-btn');
  // Devolve o foco ao botão "Seções" só se o foco estava dentro da gaveta aberta
  if (sidebar && sidebar.classList.contains('open') && menuBtn && menuBtn.focus && sidebar.contains(document.activeElement)) {
    menuBtn.focus();
  }
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

/**
 * Carrega KPIs executivos no cabeçalho do Back-office
 */
let _boKpisUltimaCarga = 0;
async function carregarBackofficeKPIs(forcar = false) {
  if (!Auth.isAdmin()) return;
  if (forcar) _boKpisUltimaCarga = 0;
  const wrapperKpis = document.getElementById('bo-kpis');
  if (wrapperKpis && wrapperKpis.hidden) return;
  if (Date.now() - _boKpisUltimaCarga < 30000) return;
  _boKpisUltimaCarga = Date.now();
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
      const ultima = resHist.value.data.contagens?.[0];
      const dataUltima = ultima ? new Date(ultima.finalizado_em || ultima.iniciado_em) : null;
      if (dataUltima && !Number.isNaN(dataUltima.getTime())) {
        kpiCont.textContent = dataUltima.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        kpiCont.classList.add('bo-kpi-value--texto');
      } else {
        kpiCont.textContent = 'Nenhuma contagem ainda';
        kpiCont.classList.add('bo-kpi-value--texto');
      }
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
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-buildings" style="color:var(--cor-primaria)"></i> Gestão de empresas';
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

  atualizarIconeTema(next);
}

function atualizarIconeTema(tema) {
  document.querySelectorAll('.btn-theme').forEach(b => {
    b.innerHTML = `<i class="ti ${tema === 'dark' ? 'ti-sun' : 'ti-moon'}" aria-hidden="true"></i>`;
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
  atualizarIconeTema(savedTheme);

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

  // 3b. Gerenciador genérico de modais (role, foco, retorno de foco)
  iniciarGerenciadorModais();

  // 4. Fechar modais com Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modalAberto()) fecharBoSidebar();
      fecharAjuda();
      if (typeof Produtos !== 'undefined') Produtos.fecharModal();
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
    // Atalho "?" abre a ajuda, fora de campos de digitação
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !e.repeat) {
      const digitandoAjuda = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      if (!digitandoAjuda && !modalAberto()) {
        e.preventDefault();
        abrirAjuda();
      }
    }
    // Atalho "/" foca a primeira busca visível, fora de campos de digitação
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !e.repeat) {
      const alvo = e.target;
      const digitando = alvo.closest && alvo.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      if (!digitando && !modalAberto()) {
        const busca = [...document.querySelectorAll('input[type="search"], #busca-fornecedor, #filtro-busca-produto, #filtro-busca-usuario, #filtro-audit-busca')]
          .find(el => el.offsetParent !== null);
        if (busca) {
          e.preventDefault();
          busca.focus();
        }
      }
    }
    if (e.key === 'Tab') {
      const modal = modalAberto();
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

  // 4b. Botão Voltar/Avançar do navegador
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('popstate', aoMudarHistorico);
    window.addEventListener('hashchange', aoMudarHistorico);
  }

  // 5. Restaurar sessão ativa ou exibir login
  const logado = await Auth.restaurarSessao();
  if (logado) {
    // Se mustChangePassword, a tela já foi redirecionada em restaurarSessao()
    if (!Auth.usuario?.mustChangePassword) {
      let inicial = telaDoHash(hashAtual());
      // Telas sem sessão de contagem em andamento ou públicas voltam ao início
      if (!inicial || telaExigeContagem(inicial) || inicial === 'screen-login' || inicial === 'screen-troca-senha-obrigatoria') inicial = 'screen-home';
      showScreen(inicial);
    }
  } else {
    showScreen('screen-login');
  }
});
