/**
 * Módulo de Gestão de Empresas da Plataforma (Super Admin)
 * Permite ao super_admin visualizar todas as empresas cadastradas com estatísticas.
 */
const Empresas = {
  dados: [],
  filtroAtual: '',

  /**
   * Carrega a lista de empresas da API e renderiza na tela
   */
  async carregar() {
    const container = document.getElementById('empresas-lista');
    if (!container) return;

    container.innerHTML = `
      <div class="loading-state">
        <span class="spinner"></span>
        <p>Carregando empresas cadastradas...</p>
      </div>
    `;

    try {
      const res = await API.get('/empresas');

      if (!res || !res.success) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="ti ti-alert-circle" style="font-size:2rem; color:var(--cor-aviso)"></i>
            <p>Erro ao carregar empresas.</p>
          </div>
        `;
        return;
      }

      this.dados = res.data.empresas || [];
      this.filtroAtual = '';
      const inputBusca = document.getElementById('empresas-busca');
      if (inputBusca) inputBusca.value = '';
      this.renderizar();
    } catch (err) {
      console.error('[EMPRESAS] Erro ao carregar:', err);
      container.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-wifi-off" style="font-size:2rem; color:var(--cor-perigo)"></i>
          <p>Falha na conexão com o servidor.</p>
        </div>
      `;
    }
  },

  /**
   * Filtra empresas localmente pelo termo digitado
   * @param {string} termo
   */
  filtrar(termo) {
    this.filtroAtual = (termo || '').toLowerCase().trim();
    this.renderizar();
  },

  /**
   * Renderiza os KPIs e a tabela de empresas
   */
  renderizar() {
    const container = document.getElementById('empresas-lista');
    const statsContainer = document.getElementById('empresas-stats');
    if (!container) return;

    const filtradas = this.filtroAtual
      ? this.dados.filter(
          (e) =>
            e.nome.toLowerCase().includes(this.filtroAtual) ||
            e.email_contato.toLowerCase().includes(this.filtroAtual)
        )
      : this.dados;

    // Renderizar KPIs
    if (statsContainer) {
      const total = this.dados.length;
      const ativas = this.dados.filter((e) => e.plano === 'ativo').length;
      const trial = this.dados.filter((e) => e.plano === 'trial').length;
      const suspensas = this.dados.filter((e) => e.plano === 'suspenso').length;

      statsContainer.innerHTML = `
        <div class="kpi-card kpi-emerald empresas-kpi">
          <div class="kpi-top">
            <span class="kpi-title">Total</span>
            <div class="kpi-icon"><i class="ti ti-building-community"></i></div>
          </div>
          <div class="kpi-value">${total}</div>
          <div class="kpi-badge neutral"><i class="ti ti-buildings"></i> Empresas cadastradas</div>
        </div>
        <div class="kpi-card kpi-cyan empresas-kpi">
          <div class="kpi-top">
            <span class="kpi-title">Ativas</span>
            <div class="kpi-icon"><i class="ti ti-circle-check"></i></div>
          </div>
          <div class="kpi-value">${ativas}</div>
          <div class="kpi-badge positive"><i class="ti ti-check"></i> Plano ativo</div>
        </div>
        <div class="kpi-card kpi-amber empresas-kpi">
          <div class="kpi-top">
            <span class="kpi-title">Trial</span>
            <div class="kpi-icon"><i class="ti ti-clock"></i></div>
          </div>
          <div class="kpi-value">${trial}</div>
          <div class="kpi-badge warning"><i class="ti ti-hourglass"></i> Período de avaliação</div>
        </div>
        <div class="kpi-card kpi-rose empresas-kpi">
          <div class="kpi-top">
            <span class="kpi-title">Suspensas</span>
            <div class="kpi-icon"><i class="ti ti-ban"></i></div>
          </div>
          <div class="kpi-value">${suspensas}</div>
          <div class="kpi-badge negative"><i class="ti ti-alert-triangle"></i> Acesso bloqueado</div>
        </div>
      `;
    }

    // Sem resultados
    if (filtradas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-building-community" style="font-size:2.5rem; color:var(--cor-texto-mudo)"></i>
          <p>${this.filtroAtual ? 'Nenhuma empresa encontrada para esta busca.' : 'Nenhuma empresa cadastrada na plataforma.'}</p>
        </div>
      `;
      return;
    }

    // Tabela de empresas
    const linhas = filtradas
      .map((e) => {
        const planoClass = {
          ativo: 'badge-plano-ativo',
          trial: 'badge-plano-trial',
          suspenso: 'badge-plano-suspenso'
        }[e.plano] || 'badge-plano-ativo';

        const planoLabel = {
          ativo: 'Ativo',
          trial: 'Trial',
          suspenso: 'Suspenso'
        }[e.plano] || e.plano;

        const dataCriacao = e.criado_em
          ? new Date(e.criado_em).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })
          : '—';

        let trialInfo = '';
        if (e.plano === 'trial' && e.trial_expira_em) {
          const expira = new Date(e.trial_expira_em);
          const agora = new Date();
          const diasRestantes = Math.ceil((expira - agora) / (1000 * 60 * 60 * 24));
          if (diasRestantes > 0) {
            trialInfo = `<span class="empresas-trial-info">${diasRestantes}d restantes</span>`;
          } else {
            trialInfo = `<span class="empresas-trial-info expirado">Expirado</span>`;
          }
        }

        return `
          <tr class="empresas-row">
            <td class="empresas-nome-cell">
              <div class="empresas-nome-wrapper">
                <div class="empresas-avatar">${(e.nome || 'E').charAt(0).toUpperCase()}</div>
                <div>
                  <strong>${this.escapeHtml(e.nome)}</strong>
                  <span class="empresas-email">${this.escapeHtml(e.email_contato)}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="badge ${planoClass}">${planoLabel}</span>
              ${trialInfo}
            </td>
            <td class="empresas-metric">
              <i class="ti ti-users" style="color:var(--cor-primaria)"></i>
              ${e.total_usuarios}
            </td>
            <td class="empresas-metric">
              <i class="ti ti-package" style="color:var(--cor-sucesso)"></i>
              ${e.total_produtos}
            </td>
            <td class="empresas-data">${dataCriacao}</td>
          </tr>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="empresas-table-wrapper">
        <table class="empresas-table">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Plano</th>
              <th>Usuários</th>
              <th>Produtos</th>
              <th>Criada em</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>
      </div>
      <div class="empresas-footer">
        <span>${filtradas.length} empresa${filtradas.length !== 1 ? 's' : ''} ${this.filtroAtual ? 'encontrada' + (filtradas.length !== 1 ? 's' : '') : ''}</span>
      </div>
    `;
  },

  /**
   * Escapa HTML para evitar XSS
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
