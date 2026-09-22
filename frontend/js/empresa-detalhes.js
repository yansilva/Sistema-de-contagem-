const EmpresaDetalhes = {
  empresaId: null,
  empresa: null,
  abaAtual: 'visao-geral',
  requestId: 0,
  recuperacaoConfigurada: false,

  async abrir(id, aba = 'visao-geral') {
    this.empresaId = id;
    this.abaAtual = aba;
    const requestId = ++this.requestId;
    document.querySelectorAll('.saas-tab-section').forEach((sec) => { sec.style.display = 'none'; });
    const section = document.getElementById('saas-tab-detalhes');
    if (section) section.style.display = 'block';
    const title = document.getElementById('saas-page-title');
    if (title) title.innerHTML = '<i class="ti ti-building" style="color:var(--cor-primaria)"></i> Detalhes da empresa';
    const desc = document.getElementById('saas-page-desc');
    if (desc) desc.textContent = 'Dados administrativos e auditoria segura';
    const container = document.getElementById('empresa-detalhes');
    if (container) container.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>Carregando empresa…</p></div>';

    const sessaoAuditoria = typeof Auditoria !== 'undefined' ? Auditoria.restaurarLocal() : null;
    const emAuditoria = document.body.classList.contains('audit-mode') && sessaoAuditoria?.empresaId === id;
    const [res, statusReset] = await Promise.all([
      emAuditoria
        ? API.get('/auditoria/sessoes/' + sessaoAuditoria.id + '/resumo?page=1&limit=20')
        : API.get('/empresas/' + id + '?page=1&limit=20'),
      emAuditoria ? Promise.resolve(null) : API.get('/auth/recuperacao/status').catch(() => null)
    ]);
    if (requestId !== this.requestId || id !== this.empresaId) return;
    if (!res?.success) {
      if (container) container.innerHTML = '<div class="empty-state" role="alert"><p>Não foi possível abrir esta empresa.</p><button class="btn btn-outline" data-click="action-113">Voltar</button></div>';
      return;
    }
    this.empresa = res.data.empresa;
    this.recuperacaoConfigurada = Boolean(statusReset?.data?.configurado);
    this.renderizarEstrutura();
    await this.mudarAba(aba, { dadosIniciais: emAuditoria ? null : res.data });
  },

  renderizarEstrutura() {
    const empresa = this.empresa;
    const excluida = Boolean(empresa.excluida_em);
    const status = excluida ? 'Excluída' : empresa.status === 'inativa' ? 'Inativa' : 'Ativa';
    const container = document.getElementById('empresa-detalhes');
    if (!container) return;
    container.innerHTML = `
      <div class="empresa-detail-header">
        <button class="btn btn-ghost btn-sm" data-click="action-113"><i class="ti ti-arrow-left"></i> Voltar às empresas</button>
        <div class="empresa-detail-title"><div><h3>${this.escape(empresa.nome)}</h3><p>${this.escape(empresa.email_contato)}</p></div><span class="status-pill ${excluida ? 'excluida' : empresa.status}">${status}</span></div>
        <div class="empresa-detail-actions">
          ${excluida ? '' : `<button class="btn btn-outline btn-sm" data-click="action-94" data-id="${empresa.id}"><i class="ti ti-edit"></i> Editar</button>
          <button class="btn btn-outline btn-sm" data-click="action-103" data-id="${empresa.id}" data-status="${empresa.status}">${empresa.status === 'ativa' ? 'Inativar' : 'Reativar'}</button>
          <button class="btn btn-danger btn-sm" data-click="action-92" data-id="${empresa.id}" data-nome="${this.escape(empresa.nome)}"><i class="ti ti-archive"></i> Retirar da operação</button>`}
        </div>
      </div>
      <div class="empresa-detail-tabs" role="tablist">
        ${this.botaoAba('visao-geral', 'Visão geral')}
        ${this.botaoAba('usuarios', 'Usuários')}
        ${this.botaoAba('contagens', 'Contagens')}
        ${this.botaoAba('auditoria', 'Auditoria')}
        ${this.botaoAba('logs', 'Logs')}
      </div>
      <div id="empresa-detalhes-conteudo" class="empresa-detail-content" aria-live="polite"></div>`;
  },

  botaoAba(id, label) {
    return `<button class="empresa-detail-tab" role="tab" data-click="action-112" data-tab="${id}">${label}</button>`;
  },

  async mudarAba(aba, { dadosIniciais = null } = {}) {
    if (!this.empresaId) return;
    this.abaAtual = aba;
    document.querySelectorAll('.empresa-detail-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === aba));
    const content = document.getElementById('empresa-detalhes-conteudo');
    if (!content) return;
    const requestId = ++this.requestId;
    content.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>Carregando…</p></div>';

    try {
      if (aba === 'visao-geral') {
        this.renderizarResumo(content);
        return;
      }
      if (aba === 'auditoria') {
        if (typeof Auditoria !== 'undefined') await Auditoria.renderizar(this.empresaId, this.empresa.nome, content);
        return;
      }
      let res;
      if (aba === 'usuarios' && dadosIniciais) {
        res = { success: true, data: { items: dadosIniciais.usuarios, pagination: dadosIniciais.pagination } };
      } else if (aba === 'logs') {
        res = await API.get('/atividades?empresa_id=' + encodeURIComponent(this.empresaId) + '&page=1&limit=20');
      } else {
        res = await API.get('/empresas/' + this.empresaId + '/' + aba + '?page=1&limit=20');
      }
      if (requestId !== this.requestId) return;
      if (!res?.success) throw new Error(res?.message || 'Falha');
      if (aba === 'usuarios') this.renderizarUsuarios(content, res.data.items || []);
      else if (aba === 'contagens') this.renderizarContagens(content, res.data.items || []);
      else this.renderizarLogs(content, res.data.atividades || []);
    } catch {
      if (requestId === this.requestId) content.innerHTML = '<div class="empty-state" role="alert"><p>Não foi possível carregar esta seção.</p></div>';
    }
  },

  renderizarResumo(content) {
    const e = this.empresa;
    content.innerHTML = `<div class="detail-stat-grid">
      <article><span>Plano</span><strong>${this.escape(e.plano || '—')}</strong></article>
      <article><span>Usuários</span><strong>${Number(e.total_usuarios || 0)}</strong></article>
      <article><span>Produtos ativos</span><strong>${Number(e.total_produtos || 0)}</strong></article>
      <article><span>Contagens</span><strong>${Number(e.total_contagens || 0)}</strong></article>
    </div>${e.excluida_em ? '<div class="audit-readonly-note"><i class="ti ti-archive"></i><div><strong>Empresa preservada para auditoria</strong><p>Os dados permanecem disponíveis somente para consulta administrativa.</p></div></div>' : ''}`;
  },

  renderizarUsuarios(content, usuarios) {
    if (!usuarios.length) return void (content.innerHTML = '<div class="empty-state"><p>Nenhum usuário cadastrado.</p></div>');
    content.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll"><table class="saas-table"><thead><tr><th>Usuário</th><th>Papel</th><th>Status</th><th>Recuperação</th></tr></thead><tbody>${usuarios.map((u) => {
      const administrativo = ['administrador', 'gestor', 'admin'].includes(u.papel);
      const acao = administrativo
        ? `<button class="btn btn-outline btn-sm" data-click="action-116" data-user-id="${u.id}" ${this.recuperacaoConfigurada ? '' : 'disabled title="Serviço de e-mail não configurado"'}>${this.recuperacaoConfigurada ? 'Enviar link' : 'E-mail não configurado'}</button>`
        : '—';
      return `<tr><td><strong>${this.escape(u.nome)}</strong><small>${this.escape(u.email)}</small></td><td>${this.escape(u.papel)}</td><td>${u.ativo ? 'Ativo' : 'Inativo'}</td><td>${acao}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  },

  renderizarContagens(content, contagens) {
    if (!contagens.length) return void (content.innerHTML = '<div class="empty-state"><p>Nenhuma contagem registrada.</p></div>');
    content.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll"><table class="saas-table"><thead><tr><th>Início</th><th>Status</th><th>Finalização</th><th>Divergência</th></tr></thead><tbody>${contagens.map((c) => `<tr><td>${this.data(c.iniciado_em)}</td><td>${this.escape(c.status)}</td><td>${this.data(c.finalizado_em)}</td><td>${c.tem_diferenca ? 'Sim' : 'Não'}</td></tr>`).join('')}</tbody></table></div></div>`;
  },

  renderizarLogs(content, logs) {
    if (!logs.length) return void (content.innerHTML = '<div class="empty-state"><p>Nenhum evento encontrado.</p></div>');
    content.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll"><table class="saas-table"><thead><tr><th>Data</th><th>Ação</th><th>Ator</th><th>Resultado</th></tr></thead><tbody>${logs.map((log) => `<tr><td>${this.data(log.criado_em)}</td><td>${this.escape(log.acao)}</td><td>${this.escape(log.ator?.rotulo || 'Sistema')}</td><td>${this.escape(log.resultado)}</td></tr>`).join('')}</tbody></table></div></div>`;
  },

  voltar() {
    this.requestId++;
    this.empresaId = null;
    this.empresa = null;
    switchSaasTab('tenants');
  },

  async solicitarRecuperacao(usuarioId) {
    if (!this.recuperacaoConfigurada) return showToast('Configure primeiro um serviço de e-mail.', 'warning');
    if (!window.confirm('Enviar um link de recuperação para o e-mail já cadastrado deste administrador?')) return;
    const res = await API.post(`/empresas/${this.empresaId}/administradores/${usuarioId}/recuperacao`, { confirmar: true });
    showToast(res?.success ? 'Solicitação aceita pelo serviço de e-mail.' : (res?.message || 'Falha ao enviar recuperação.'), res?.success ? 'success' : 'error');
  },

  data(value) { return value ? new Date(value).toLocaleString('pt-BR') : '—'; },
  escape(value) { return Empresas.escapeHtml(value); }
};
