/** Gestão de empresas clientes do Console SaaS. */
const Empresas = {
  dados: [],
  metricas: null,
  filtroTexto: '',
  filtroStatus: 'todas',
  pagina: 1,
  paginacao: null,
  empresaExcluindoId: null,
  empresaExcluindoNome: null,
  empresaStatusId: null,
  empresaStatusDestino: null,
  focoAntesModal: null,
  requestIds: {},
  filtroTimer: null,

  async carregar({ containerId = 'empresas-lista', page = 1, resumo = false } = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const requestId = (this.requestIds[containerId] || 0) + 1;
    this.requestIds[containerId] = requestId;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>Carregando empresas…</p></div>';

    const query = new URLSearchParams({
      page: String(page),
      limit: resumo ? '5' : '20',
      sort: resumo ? 'criado_em' : 'nome',
      direction: resumo ? 'desc' : 'asc',
      status: resumo ? 'todas' : this.filtroStatus,
      tipo: 'cliente'
    });
    if (!resumo && this.filtroTexto) query.set('search', this.filtroTexto);

    try {
      const res = await API.get('/empresas?' + query.toString());
      if (this.requestIds[containerId] !== requestId) return;
      if (!res?.success) throw new Error(res?.message || 'Falha ao carregar empresas.');
      const empresas = res.data?.empresas || [];
      if (!resumo) {
        this.dados = empresas;
        this.pagina = page;
        this.paginacao = res.data?.pagination || null;
      }
      this.renderizar(containerId, empresas, res.data?.pagination, resumo);
    } catch (error) {
      if (this.requestIds[containerId] !== requestId) return;
      container.innerHTML = '<div class="empty-state" role="alert"><i class="ti ti-alert-circle"></i><p>Não foi possível carregar as empresas.</p><button class="btn btn-outline btn-sm" data-click="action-111" data-page="1">Tentar novamente</button></div>';
    } finally {
      if (this.requestIds[containerId] === requestId) container.setAttribute('aria-busy', 'false');
    }
  },

  async carregarMetricas() {
    const requestId = (this.requestIds.metricas || 0) + 1;
    this.requestIds.metricas = requestId;
    this.marcarMetricas('—', 'Calculando indicadores…');
    const res = await API.get('/empresas/metricas/saas');
    if (this.requestIds.metricas !== requestId) return;
    if (!res?.success) {
      this.metricas = null;
      this.marcarMetricas('Indisponível', 'Falha ao atualizar. Tente novamente.');
      return;
    }
    this.metricas = res.data;
    this.atualizarKPIs(res.data);
  },

  marcarMetricas(valor, subtitulo) {
    for (const id of ['super-kpi-empresas', 'super-kpi-usuarios', 'super-kpi-produtos', 'super-kpi-contagens']) {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    }
    const sub = document.getElementById('super-kpi-empresas-sub');
    if (sub) sub.textContent = subtitulo;
  },

  atualizarKPIs(m) {
    const valores = {
      'super-kpi-empresas': m.totalEmpresas,
      'super-kpi-usuarios': m.usuariosAtivos,
      'super-kpi-produtos': m.totalProdutos,
      'super-kpi-contagens': m.contagensFinalizadas
    };
    for (const [id, valor] of Object.entries(valores)) {
      const el = document.getElementById(id);
      if (el) el.textContent = valor ?? '—';
    }
    const sub = document.getElementById('super-kpi-empresas-sub');
    if (sub) sub.innerHTML = '<i class="ti ti-circle-check"></i> ' + Number(m.ativas || 0) + ' ativas • ' + Number(m.inativas || 0) + ' inativas';
  },

  filtrar(termo) {
    this.filtroTexto = String(termo || '').trim();
    clearTimeout(this.filtroTimer);
    this.filtroTimer = setTimeout(() => this.carregar({ page: 1 }), 250);
  },

  filtrarPorStatus(status) {
    this.filtroStatus = status || 'todas';
    document.querySelectorAll('.saas-tab-btn[data-status]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-status') === this.filtroStatus);
    });
    this.carregar({ page: 1 });
  },

  mudarPagina(page) {
    const total = this.paginacao?.totalPages || 1;
    const destino = Math.max(1, Math.min(Number(page) || 1, total));
    this.carregar({ page: destino });
  },

  renderizar(containerId, empresas, pagination, resumo) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!empresas.length) {
      container.innerHTML = '<div class="empty-state"><i class="ti ti-building-off"></i><p>Nenhuma empresa encontrada para estes filtros.</p></div>';
      return;
    }
    const linhas = empresas.map((empresa) => {
      const excluida = Boolean(empresa.excluida_em);
      const status = excluida ? 'excluida' : (empresa.status || 'ativa');
      const label = status === 'ativa' ? 'Ativa' : status === 'inativa' ? 'Inativa' : 'Excluída';
      const principal = empresa.administrador_principal;
      return `<tr>
        <td><button class="saas-company-link" data-click="action-90" data-id="${empresa.id}">${this.escapeHtml(empresa.nome)}</button><small>${this.escapeHtml(empresa.email_contato || '')}</small></td>
        <td><span class="status-pill ${status}"><span class="status-dot"></span>${label}</span></td>
        <td>${principal ? this.escapeHtml(principal.nome) + '<small>' + this.escapeHtml(principal.email) + '</small>' : '<span class="text-muted">Sem administrador ativo</span>'}</td>
        <td>${Number(empresa.total_usuarios || 0)}</td>
        <td>${empresa.ultima_atividade ? new Date(empresa.ultima_atividade).toLocaleString('pt-BR') : '—'}</td>
        <td class="saas-actions-cell">
          <button class="btn btn-outline btn-sm" data-click="action-90" data-id="${empresa.id}">Detalhes</button>
          ${excluida ? '' : '<button class="btn btn-ghost btn-sm" data-click="action-98" data-id="' + empresa.id + '"><i class="ti ti-shield-search"></i> Auditar</button>'}
          ${resumo || excluida ? '' : '<button class="btn btn-ghost btn-sm" data-click="action-103" data-id="' + empresa.id + '" data-status="' + status + '">' + (status === 'ativa' ? 'Inativar' : 'Reativar') + '</button>'}
        </td>
      </tr>`;
    }).join('');
    const paginador = !resumo && pagination && pagination.totalPages > 1
      ? `<div class="saas-pagination"><button class="btn btn-outline btn-sm" data-click="action-111" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${pagination.page} de ${pagination.totalPages}</span><button class="btn btn-outline btn-sm" data-click="action-111" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Próxima</button></div>`
      : '';
    container.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll"><table class="saas-table"><thead><tr><th>Empresa</th><th>Acesso</th><th>Administrador principal</th><th>Usuários</th><th>Última atividade</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table></div></div>${paginador}`;
  },

  abrirDrawer(id) {
    if (typeof EmpresaDetalhes !== 'undefined') EmpresaDetalhes.abrir(id);
  },

  fecharDrawer() {
    const backdrop = document.getElementById('slide-over-backdrop');
    if (backdrop) backdrop.classList.remove('active');
  },

  confirmarExclusao(id, nome) {
    this.empresaExcluindoId = id;
    this.empresaExcluindoNome = nome;
    const label = document.getElementById('delete-empresa-nome-label');
    const input = document.getElementById('delete-empresa-input');
    if (label) label.textContent = nome;
    if (input) input.value = '';
    this.verificarInputConfirmacaoExclusao('');
    this.abrirModal('modal-excluir-empresa', input);
  },

  verificarInputConfirmacaoExclusao(valor) {
    const btn = document.getElementById('btn-confirmar-exclusao-permanente');
    if (btn) btn.disabled = String(valor || '').trim() !== String(this.empresaExcluindoNome || '').trim();
  },

  fecharModalExclusao() {
    this.fecharModal('modal-excluir-empresa');
  },

  async executarExclusao() {
    if (!this.empresaExcluindoId) return;
    const input = document.getElementById('delete-empresa-input');
    const btn = document.getElementById('btn-confirmar-exclusao-permanente');
    if (btn) btn.disabled = true;
    const res = await API.delete('/empresas/' + this.empresaExcluindoId, { nomeConfirmacao: input?.value || '' });
    if (res?.success) {
      showToast('Empresa retirada da operação. Os dados e logs foram preservados.', 'success');
      this.fecharModalExclusao();
      if (EmpresaDetalhes?.empresaId === this.empresaExcluindoId) {
        EmpresaDetalhes.abrir(this.empresaExcluindoId, 'visao-geral');
      } else {
        this.carregar({ page: this.pagina });
      }
    } else {
      showToast(res?.message || 'Não foi possível excluir a empresa.', 'error');
      this.verificarInputConfirmacaoExclusao(input?.value || '');
    }
  },

  async abrirModalEdicao(id) {
    const local = this.dados.find((e) => e.id === id);
    const res = local ? { success: true, data: { empresa: local } } : await API.get('/empresas/' + id);
    if (!res?.success) return showToast(res?.message || 'Empresa não encontrada.', 'error');
    const empresa = res.data.empresa;
    document.getElementById('edit-emp-id').value = empresa.id;
    document.getElementById('edit-emp-nome').value = empresa.nome || '';
    document.getElementById('edit-emp-email').value = empresa.email_contato || '';
    document.getElementById('edit-emp-plano').value = empresa.plano === 'trial' ? 'trial' : 'ativo';
    this.abrirModal('modal-editar-empresa', document.getElementById('edit-emp-nome'));
  },

  fecharModalEdicao() {
    this.fecharModal('modal-editar-empresa');
  },

  async salvarEdicao(event) {
    event?.preventDefault?.();
    const id = document.getElementById('edit-emp-id')?.value;
    const body = {
      nome: document.getElementById('edit-emp-nome')?.value.trim(),
      email_contato: document.getElementById('edit-emp-email')?.value.trim(),
      plano: document.getElementById('edit-emp-plano')?.value
    };
    const res = await API.put('/empresas/' + id, body);
    if (!res?.success) return showToast(res?.message || 'Falha ao atualizar empresa.', 'error');
    showToast('Dados da empresa atualizados.', 'success');
    this.fecharModalEdicao();
    this.carregar({ page: this.pagina });
    if (EmpresaDetalhes?.empresaId === id) EmpresaDetalhes.abrir(id, EmpresaDetalhes.abaAtual);
  },

  alternarStatusRapido(id, statusAtual) {
    this.empresaStatusId = id;
    this.empresaStatusDestino = statusAtual === 'ativa' ? 'inativa' : 'ativa';
    const texto = this.empresaStatusDestino === 'inativa'
      ? 'O acesso será interrompido imediatamente e todas as sessões da empresa serão encerradas.'
      : 'A empresa poderá entrar novamente, mas sessões antigas continuarão inválidas.';
    const explicacao = document.getElementById('status-empresa-explicacao');
    if (explicacao) explicacao.textContent = texto;
    const motivo = document.getElementById('status-empresa-motivo');
    if (motivo) motivo.value = '';
    this.abrirModal('modal-status-empresa', motivo);
  },

  fecharModalStatus() {
    this.fecharModal('modal-status-empresa');
  },

  async executarStatus() {
    if (!this.empresaStatusId) return;
    const btn = document.getElementById('btn-confirmar-status');
    if (btn) btn.disabled = true;
    const res = await API.patch('/empresas/' + this.empresaStatusId + '/status', {
      status: this.empresaStatusDestino,
      confirmar: true,
      motivo: document.getElementById('status-empresa-motivo')?.value.trim() || undefined
    });
    if (btn) btn.disabled = false;
    if (!res?.success) return showToast(res?.message || 'Falha ao alterar acesso.', 'error');
    showToast(this.empresaStatusDestino === 'ativa' ? 'Empresa reativada.' : 'Empresa inativada.', 'success');
    this.fecharModalStatus();
    if (EmpresaDetalhes?.empresaId === this.empresaStatusId) {
      EmpresaDetalhes.abrir(this.empresaStatusId, EmpresaDetalhes.abaAtual);
    } else {
      this.carregar({ page: this.pagina });
    }
  },

  abrirModal(id, focoInicial) {
    this.focoAntesModal = document.activeElement;
    document.getElementById(id)?.classList.add('active');
    setTimeout(() => focoInicial?.focus(), 0);
  },

  fecharModal(id) {
    const modal = document.getElementById(id);
    if (!modal?.classList.contains('active')) return;
    modal.classList.remove('active');
    const foco = this.focoAntesModal;
    this.focoAntesModal = null;
    foco?.focus?.();
  },

  iniciarAuditoria(id) {
    if (typeof EmpresaDetalhes !== 'undefined') EmpresaDetalhes.abrir(id, 'auditoria');
  },

  toggleMenuAcoes() {},

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }
};
