/**
 * Módulo de Gestão de Empresas e Console SaaS (Super Admin)
 * Interface Linear/Stripe com Slide-Over Drawer, Exclusão Segura e Impersonation
 */
const Empresas = {
  dados: [],
  metricas: null,
  filtroTexto: '',
  filtroStatus: 'todas',
  empresaEmFoco: null,
  empresaExcluindoId: null,
  empresaExcluindoNome: null,

  /**
   * Carrega lista de empresas e métricas da plataforma
   */
  async carregar() {
    const container = document.getElementById('super-empresas-lista') || document.getElementById('empresas-lista');
    if (container) {
      container.innerHTML = `
        <div class="loading-state" style="padding: 32px; text-align: center; color: var(--cor-texto-mudo);">
          <span class="spinner" style="margin-bottom: 8px;"></span>
          <p style="font-size: 0.85rem;">Carregando dados das empresas clientes...</p>
        </div>
      `;
    }

    try {
      const [resEmpresas, resMetricas] = await Promise.all([
        API.get('/empresas'),
        API.get('/empresas/metricas/saas').catch(() => null)
      ]);

      if (resEmpresas && resEmpresas.success) {
        this.dados = resEmpresas.data?.empresas || [];
      } else {
        this.dados = [];
      }

      if (resMetricas && resMetricas.success) {
        this.metricas = resMetricas.data;
        this.atualizarKPIs(this.metricas);
      } else {
        this.atualizarKPIsFallback();
      }

      this.renderizar();
    } catch (err) {
      console.error('[EMPRESAS] Erro ao carregar console superadmin:', err);
      if (container) {
        container.innerHTML = `
          <div class="empty-state" style="padding: 24px; text-align: center;">
            <i class="ti ti-alert-circle" style="font-size: 2rem; color: var(--cor-perigo);"></i>
            <p style="margin-top: 8px; font-size: 0.875rem;">Erro ao conectar com a API de empresas.</p>
          </div>
        `;
      }
    }
  },

  /**
   * Atualiza os cartões de KPIs do Console SaaS
   */
  atualizarKPIs(m) {
    if (!m) return;
    const elEmp = document.getElementById('super-kpi-empresas');
    if (elEmp) elEmp.textContent = m.totalEmpresas ?? 0;

    const elUser = document.getElementById('super-kpi-usuarios');
    if (elUser) elUser.textContent = m.totalUsuarios ?? 0;

    const elProd = document.getElementById('super-kpi-produtos');
    if (elProd) elProd.textContent = m.totalProdutos ?? 0;

    const elCont = document.getElementById('super-kpi-contagens');
    if (elCont) elCont.textContent = m.totalContagens ?? 0;

    // Subtítulos ou contadores detalhados
    const elEmpSub = document.getElementById('super-kpi-empresas-sub');
    if (elEmpSub) {
      elEmpSub.innerHTML = `<i class="ti ti-circle-check"></i> ${m.ativas || 0} ativas • ${m.trial || 0} trial • ${m.suspensas || 0} suspensas`;
    }
  },

  /**
   * Fallback de KPIs calculando a partir de this.dados
   */
  atualizarKPIsFallback() {
    const total = this.dados.length;
    let totalUsers = 0;
    let totalProds = 0;
    let ativas = 0;
    let trial = 0;
    let suspensas = 0;

    this.dados.forEach((e) => {
      totalUsers += Number(e.total_usuarios || 0);
      totalProds += Number(e.total_produtos || 0);
      if (e.plano === 'ativo') ativas++;
      else if (e.plano === 'trial') trial++;
      else if (e.plano === 'suspenso') suspensas++;
    });

    this.atualizarKPIs({
      totalEmpresas: total,
      totalUsuarios: totalUsers,
      totalProdutos: totalProds,
      totalContagens: 0,
      ativas,
      trial,
      suspensas
    });
  },

  /**
   * Filtra empresas por texto
   */
  filtrar(termo) {
    this.filtroTexto = (termo || '').toLowerCase().trim();
    this.renderizar();
  },

  /**
   * Filtra empresas por aba de status
   */
  filtrarPorStatus(status) {
    this.filtroStatus = status || 'todas';
    document.querySelectorAll('.saas-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-status') === this.filtroStatus);
    });
    this.renderizar();
  },

  /**
   * Renderiza a tabela de empresas com layout moderno e menu de ações
   */
  renderizar() {
    const container = document.getElementById('super-empresas-lista') || document.getElementById('empresas-lista');
    if (!container) return;

    let filtradas = [...this.dados];

    if (this.filtroStatus && this.filtroStatus !== 'todas') {
      filtradas = filtradas.filter((e) => e.plano === this.filtroStatus);
    }

    if (this.filtroTexto) {
      filtradas = filtradas.filter(
        (e) =>
          (e.nome && e.nome.toLowerCase().includes(this.filtroTexto)) ||
          (e.email_contato && e.email_contato.toLowerCase().includes(this.filtroTexto))
      );
    }

    if (filtradas.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 48px 16px; text-align: center; color: var(--cor-texto-mudo);">
          <i class="ti ti-buildings" style="font-size: 2.5rem; opacity: 0.5; margin-bottom: 12px;"></i>
          <p style="font-weight: 600; color: var(--cor-texto);">Nenhuma organização encontrada</p>
          <p style="font-size: 0.85rem; margin-top: 4px;">Tente alterar os termos de busca ou filtros selecionados.</p>
        </div>
      `;
      return;
    }

    const rowsHtml = filtradas
      .map((e) => {
        const statusClass = e.plano === 'ativo' ? 'active' : e.plano === 'trial' ? 'trial' : 'suspended';
        const statusLabel = e.plano === 'ativo' ? 'Ativo' : e.plano === 'trial' ? 'Trial' : 'Suspenso';
        const inicial = (e.nome || 'E').charAt(0).toUpperCase();

        const criadoEmStr = e.criado_em
          ? new Date(e.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : '—';

        let trialBadge = '';
        if (e.plano === 'trial' && e.trial_expira_em) {
          const exp = new Date(e.trial_expira_em);
          const dias = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
          trialBadge = dias > 0 ? ` <small>(${dias}d restantes)</small>` : ` <small>(Expirado)</small>`;
        }

        return `
          <tr class="tenant-row" data-id="${e.id}">
            <td>
              <div class="tenant-identity">
                <div class="tenant-avatar">${inicial}</div>
                <div class="tenant-meta">
                  <span class="tenant-name">${this.escapeHtml(e.nome)}</span>
                  <span class="tenant-email">${this.escapeHtml(e.email_contato || '—')}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="status-pill ${statusClass}">
                <span class="status-dot"></span>
                <span>${statusLabel}${trialBadge}</span>
              </span>
            </td>
            <td>
              <span style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
                <i class="ti ti-users" style="color: var(--cor-primaria); font-size: 1rem;"></i>
                ${e.total_usuarios || 0}
              </span>
            </td>
            <td>
              <span style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
                <i class="ti ti-packages" style="color: var(--cor-sucesso); font-size: 1rem;"></i>
                ${e.total_produtos || 0}
              </span>
            </td>
            <td style="color: var(--cor-texto-secundario); font-size: 0.8rem;">${criadoEmStr}</td>
            <td class="saas-actions-cell">
              <button class="saas-action-menu-btn" data-click="action-102" data-id="${e.id}" title="Opções da empresa" aria-label="Ações">
                <i class="ti ti-dots-vertical"></i>
              </button>
              <div class="saas-dropdown-menu" id="dropdown-${e.id}" style="display: none;">
                <button class="saas-dropdown-item" data-click="action-90" data-id="${e.id}">
                  <i class="ti ti-id-badge-2" style="color: var(--cor-primaria)"></i> Ver Detalhes
                </button>
                <button class="saas-dropdown-item" data-click="action-98" data-id="${e.id}">
                  <i class="ti ti-shield-check" style="color: #3b82f6"></i> Entrar como Suporte
                </button>
                <button class="saas-dropdown-item" data-click="action-94" data-id="${e.id}">
                  <i class="ti ti-edit" style="color: var(--cor-texto-secundario)"></i> Editar Informações
                </button>
                <button class="saas-dropdown-item" data-click="action-103" data-id="${e.id}" data-status="${e.plano}">
                  <i class="ti ti-power" style="color: ${e.plano === 'suspenso' ? 'var(--cor-sucesso)' : '#d97706'}"></i>
                  ${e.plano === 'suspenso' ? 'Reativar Acesso' : 'Suspender Empresa'}
                </button>
                <div class="saas-dropdown-divider"></div>
                <button class="saas-dropdown-item danger" data-click="action-92" data-id="${e.id}" data-nome="${this.escapeHtml(e.nome)}">
                  <i class="ti ti-trash"></i> Excluir Permanentemente
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="saas-table-card">
        <table class="saas-table">
          <thead>
            <tr>
              <th>Organização / Empresa</th>
              <th>Status do Plano</th>
              <th>Usuários</th>
              <th>SKUs no Estoque</th>
              <th>Criada em</th>
              <th style="text-align: right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      <div style="padding: 12px 16px; font-size: 0.8rem; color: var(--cor-texto-mudo); text-align: right;">
        Exibindo ${filtradas.length} de ${this.dados.length} organizações cadastradas
      </div>
    `;
  },

  /**
   * Abre/fecha o menu dropdown de ações na linha da tabela
   */
  toggleMenuAcoes(id, event) {
    if (event) event.stopPropagation();
    const allMenus = document.querySelectorAll('.saas-dropdown-menu');
    const targetMenu = document.getElementById(`dropdown-${id}`);

    allMenus.forEach((menu) => {
      if (menu !== targetMenu) menu.style.display = 'none';
    });

    if (targetMenu) {
      targetMenu.style.display = targetMenu.style.display === 'none' ? 'flex' : 'none';
    }
  },

  /**
   * Abre o Slide-Over Drawer com dados profundos da empresa
   */
  async abrirDrawer(id) {
    this.fecharTodosMenus();
    const backdrop = document.getElementById('slide-over-backdrop');
    if (!backdrop) return;

    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    const drawerNome = document.getElementById('drawer-empresa-nome');
    const drawerEmail = document.getElementById('drawer-empresa-email');
    const drawerStatus = document.getElementById('drawer-empresa-status');
    const drawerUsersList = document.getElementById('drawer-users-list');
    const drawerTotalProds = document.getElementById('drawer-stat-prods');
    const drawerTotalConts = document.getElementById('drawer-stat-conts');
    const drawerCriadoEm = document.getElementById('drawer-stat-criado');

    if (drawerNome) drawerNome.textContent = 'Carregando...';
    if (drawerUsersList) {
      drawerUsersList.innerHTML = '<p style="padding: 12px; color: var(--cor-texto-mudo); font-size: 0.8rem;">Carregando usuários...</p>';
    }

    try {
      const res = await API.get(`/empresas/${id}`);
      if (!res || !res.success || !res.data?.empresa) {
        showToast('Não foi possível carregar os detalhes da empresa.', 'error');
        this.fecharDrawer();
        return;
      }

      const { empresa, usuarios } = res.data;
      this.empresaEmFoco = empresa;

      if (drawerNome) drawerNome.textContent = empresa.nome;
      if (drawerEmail) drawerEmail.textContent = empresa.email_contato || 'Sem e-mail cadastrado';

      if (drawerStatus) {
        const stClass = empresa.plano === 'ativo' ? 'active' : empresa.plano === 'trial' ? 'trial' : 'suspended';
        const stLabel = empresa.plano === 'ativo' ? 'Ativo' : empresa.plano === 'trial' ? 'Trial' : 'Suspenso';
        drawerStatus.className = `status-pill ${stClass}`;
        drawerStatus.innerHTML = `<span class="status-dot"></span> <span>${stLabel}</span>`;
      }

      if (drawerTotalProds) drawerTotalProds.textContent = empresa.total_produtos ?? 0;
      if (drawerTotalConts) drawerTotalConts.textContent = empresa.total_contagens ?? 0;
      if (drawerCriadoEm) {
        drawerCriadoEm.textContent = empresa.criado_em
          ? new Date(empresa.criado_em).toLocaleDateString('pt-BR')
          : '—';
      }

      // Renderizar usuários da empresa no drawer
      if (drawerUsersList) {
        if (!usuarios || usuarios.length === 0) {
          drawerUsersList.innerHTML = '<p style="font-size: 0.8rem; color: var(--cor-texto-mudo); padding: 8px;">Nenhum usuário cadastrado nesta empresa.</p>';
        } else {
          drawerUsersList.innerHTML = usuarios
            .map(
              (u) => `
                <div class="drawer-user-item">
                  <div class="drawer-user-info">
                    <span class="drawer-user-nome">${this.escapeHtml(u.nome)}</span>
                    <span class="drawer-user-email">${this.escapeHtml(u.email)}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="badge ${u.papel === 'administrador' ? 'badge-primary' : 'badge-neutral'}" style="font-size: 0.7rem;">
                      ${u.papel}
                    </span>
                    ${u.ativo ? '<span style="color: var(--cor-sucesso); font-size: 0.75rem;" title="Ativo">●</span>' : '<span style="color: var(--cor-perigo); font-size: 0.75rem;" title="Inativo">●</span>'}
                  </div>
                </div>
              `
            )
            .join('');
        }
      }

      // Configurar botões de ação do rodapé do drawer
      const btnImpersonar = document.getElementById('drawer-btn-impersonar');
      if (btnImpersonar) {
        btnImpersonar.setAttribute('data-id', empresa.id);
      }
      const btnEditar = document.getElementById('drawer-btn-editar');
      if (btnEditar) {
        btnEditar.setAttribute('data-id', empresa.id);
      }
      const btnStatus = document.getElementById('drawer-btn-status');
      if (btnStatus) {
        btnStatus.setAttribute('data-id', empresa.id);
        btnStatus.setAttribute('data-status', empresa.plano);
        btnStatus.innerHTML = `<i class="ti ti-power"></i> ${empresa.plano === 'suspenso' ? 'Reativar' : 'Suspender'}`;
      }
      const btnExcluir = document.getElementById('drawer-btn-excluir');
      if (btnExcluir) {
        btnExcluir.setAttribute('data-id', empresa.id);
        btnExcluir.setAttribute('data-nome', empresa.nome);
      }
    } catch (err) {
      console.error('[DRAWER_ERROR]', err);
      showToast('Erro ao abrir painel de detalhes.', 'error');
      this.fecharDrawer();
    }
  },

  /**
   * Fecha o Slide-Over Drawer
   */
  fecharDrawer() {
    const backdrop = document.getElementById('slide-over-backdrop');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    this.empresaEmFoco = null;
  },

  /**
   * Alterna rapidamente o status da empresa (ativo <-> suspenso)
   */
  async alternarStatusRapido(id, statusAtual) {
    this.fecharTodosMenus();
    const novoStatus = statusAtual === 'suspenso' ? 'ativo' : 'suspenso';
    const acaoTexto = novoStatus === 'suspenso' ? 'suspender' : 'reativar';

    try {
      const res = await API.patch(`/empresas/${id}/status`, { plano: novoStatus });
      if (res && res.success) {
        showToast(`Empresa ${novoStatus === 'suspenso' ? 'suspensa' : 'reativada'} com sucesso.`, 'info');
        await this.carregar();
        if (this.empresaEmFoco && this.empresaEmFoco.id === id) {
          this.abrirDrawer(id);
        }
      } else {
        showToast(res?.message || `Falha ao ${acaoTexto} empresa.`, 'error');
      }
    } catch (err) {
      console.error('[STATUS_ERROR]', err);
      showToast(`Erro ao ${acaoTexto} empresa.`, 'error');
    }
  },

  /**
   * Abre o modal de edição de informações da empresa
   */
  async abrirModalEdicao(id) {
    this.fecharTodosMenus();
    let empresa = this.dados.find((e) => e.id === id) || this.empresaEmFoco;
    if (!empresa) {
      const res = await API.get(`/empresas/${id}`);
      empresa = res?.data?.empresa;
    }
    if (!empresa) return;

    const modal = document.getElementById('modal-editar-empresa');
    if (!modal) return;

    document.getElementById('edit-emp-id').value = empresa.id;
    document.getElementById('edit-emp-nome').value = empresa.nome || '';
    document.getElementById('edit-emp-email').value = empresa.email_contato || '';
    document.getElementById('edit-emp-plano').value = empresa.plano || 'ativo';

    modal.classList.add('active');
  },

  /**
   * Fecha o modal de edição
   */
  fecharModalEdicao() {
    const modal = document.getElementById('modal-editar-empresa');
    if (modal) modal.classList.remove('active');
  },

  /**
   * Salva alterações cadastrais da empresa
   */
  async salvarEdicao(event) {
    if (event) event.preventDefault();
    const id = document.getElementById('edit-emp-id').value;
    const nome = document.getElementById('edit-emp-nome').value.trim();
    const email_contato = document.getElementById('edit-emp-email').value.trim();
    const plano = document.getElementById('edit-emp-plano').value;

    if (!nome || !email_contato) {
      showToast('Preencha o nome e o email de contato.', 'warning');
      return;
    }

    try {
      const res = await API.put(`/empresas/${id}`, { nome, email_contato, plano });
      if (res && res.success) {
        showToast('Empresa atualizada com sucesso!', 'success');
        this.fecharModalEdicao();
        await this.carregar();
        if (this.empresaEmFoco && this.empresaEmFoco.id === id) {
          this.abrirDrawer(id);
        }
      } else {
        showToast(res?.message || 'Falha ao atualizar dados.', 'error');
      }
    } catch (err) {
      console.error('[EDIT_ERROR]', err);
      showToast('Erro ao atualizar empresa.', 'error');
    }
  },

  /**
   * Abre o modal de confirmação de exclusão com trava de digitação
   */
  confirmarExclusao(id, nome) {
    this.fecharTodosMenus();
    this.empresaExcluindoId = id;
    this.empresaExcluindoNome = (nome || '').trim();

    const modal = document.getElementById('modal-excluir-empresa');
    if (!modal) return;

    const labelNome = document.getElementById('delete-empresa-nome-label');
    if (labelNome) labelNome.textContent = this.empresaExcluindoNome;

    const input = document.getElementById('delete-empresa-input');
    if (input) {
      input.value = '';
      input.classList.remove('match');
    }

    const btnConfirm = document.getElementById('btn-confirmar-exclusao-permanente');
    if (btnConfirm) btnConfirm.disabled = true;

    modal.classList.add('active');
  },

  /**
   * Valida digitação no input do modal de exclusão
   */
  verificarInputConfirmacaoExclusao(val) {
    const btnConfirm = document.getElementById('btn-confirmar-exclusao-permanente');
    const input = document.getElementById('delete-empresa-input');
    const match = (val || '').trim() === (this.empresaExcluindoNome || '').trim();

    if (btnConfirm) btnConfirm.disabled = !match;
    if (input) input.classList.toggle('match', match);
  },

  /**
   * Fecha modal de exclusão
   */
  fecharModalExclusao() {
    const modal = document.getElementById('modal-excluir-empresa');
    if (modal) modal.classList.remove('active');
    this.empresaExcluindoId = null;
    this.empresaExcluindoNome = null;
  },

  /**
   * Executa a exclusão definitiva da empresa após confirmação
   */
  async executarExclusao() {
    if (!this.empresaExcluindoId) return;

    const btn = document.getElementById('btn-confirmar-exclusao-permanente');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Excluindo...';
    }

    try {
      const res = await API.delete(`/empresas/${this.empresaExcluindoId}`);
      if (res && res.success) {
        showToast('Empresa e todos os dados foram excluídos definitivamente.', 'success');
        this.fecharModalExclusao();
        this.fecharDrawer();
        await this.carregar();
      } else {
        showToast(res?.message || 'Falha ao excluir empresa.', 'error');
      }
    } catch (err) {
      console.error('[DELETE_ERROR]', err);
      showToast('Erro de comunicação ao excluir empresa.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-trash"></i> Excluir Permanentemente';
      }
    }
  },

  /**
   * Inicia o modo de suporte assistido (Impersonation)
   */
  async iniciarImpersonation(id) {
    this.fecharTodosMenus();
    try {
      const res = await API.post(`/empresas/${id}/impersonar`);
      if (!res || !res.success || !res.data?.accessToken) {
        showToast(res?.message || 'Não foi possível assumir identidade deste tenant.', 'error');
        return;
      }

      // Salva sessão do Super Admin
      sessionStorage.setItem('superAdminBackupToken', sessionStorage.getItem('accessToken'));
      sessionStorage.setItem('superAdminBackupUser', JSON.stringify(Auth.usuario));
      sessionStorage.setItem('superAdminBackupEmpresa', JSON.stringify(Auth.empresa));

      // Sobrescreve com credenciais do tenant
      sessionStorage.setItem('accessToken', res.data.accessToken);
      Auth.usuario = res.data.usuario;
      Auth.empresa = res.data.empresa;

      // Exibe barra de aviso superior de suporte
      const bar = document.getElementById('impersonation-bar');
      const nomeEl = document.getElementById('impersonation-tenant-nome');
      if (bar) bar.style.display = 'block';
      if (nomeEl) nomeEl.textContent = res.data.empresa.nome;

      this.fecharDrawer();
      showToast(`Modo Suporte Ativo: Conectado a ${res.data.empresa.nome}`, 'info');

      // Atualiza interface com os dados da empresa acessada
      Auth.atualizarInterface();
      showScreen('screen-home');
    } catch (err) {
      console.error('[IMPERSONATION_ERROR]', err);
      showToast('Falha ao iniciar modo de suporte.', 'error');
    }
  },

  /**
   * Encerra a sessão de suporte e restaura a conta de Super Admin
   */
  encerrarImpersonation() {
    const backupToken = sessionStorage.getItem('superAdminBackupToken');
    const backupUser = sessionStorage.getItem('superAdminBackupUser');
    const backupEmpresa = sessionStorage.getItem('superAdminBackupEmpresa');

    if (!backupToken || !backupUser) {
      showToast('Sessão original do superadmin expirou. Faça login novamente.', 'warning');
      Auth.deslogar();
      return;
    }

    sessionStorage.setItem('accessToken', backupToken);
    Auth.usuario = JSON.parse(backupUser);
    Auth.empresa = backupEmpresa ? JSON.parse(backupEmpresa) : null;

    sessionStorage.removeItem('superAdminBackupToken');
    sessionStorage.removeItem('superAdminBackupUser');
    sessionStorage.removeItem('superAdminBackupEmpresa');

    const bar = document.getElementById('impersonation-bar');
    if (bar) bar.style.display = 'none';

    showToast('Modo de suporte encerrado. Retornado ao Console Super Admin.', 'success');
    Auth.atualizarInterface();
    showScreen('screen-home');
  },

  /**
   * Fecha qualquer menu dropdown aberto
   */
  fecharTodosMenus() {
    document.querySelectorAll('.saas-dropdown-menu').forEach((menu) => {
      menu.style.display = 'none';
    });
  },

  /**
   * Escapa HTML para prevenir injeção XSS
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

// Fecha menus dropdown ao clicar fora
document.addEventListener('click', (e) => {
  if (!e.target.closest('.saas-actions-cell')) {
    Empresas.fecharTodosMenus();
  }
});
