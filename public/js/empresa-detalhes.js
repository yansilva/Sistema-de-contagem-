const EmpresaDetalhes = {
  empresaId: null,
  empresa: null,
  abaAtual: 'visao-geral',
  /** De onde o detalhe foi aberto: 'console' (aba Empresas) ou 'compat' (/#empresas). */
  origem: 'console',
  requestId: 0,
  usuarioSenhaTemporaria: null,
  focoAntesSenhaTemporaria: null,
  salvandoSenhaTemporaria: false,

  async abrir(id, aba = 'visao-geral', opcoes = {}) {
    // A tela /#empresas não contém a área de detalhes: leva ao console, onde ela é visível, e lembra de onde veio.
    if (document.getElementById('screen-empresas')?.classList?.contains('active')) {
      this.origem = 'compat';
      showScreen('screen-home');
    } else if (!this.empresaId) {
      this.origem = 'console';
    }
    this.empresaId = id;
    this.abaAtual = aba;
    // Rota própria #inicio/empresas/<id>: F5, Voltar e Avançar restauram o detalhe
    if (typeof registrarRotaDetalheEmpresa === 'function') registrarRotaDetalheEmpresa(id, !!(opcoes && opcoes.semHistorico));
    const requestId = ++this.requestId;
    document.querySelectorAll('.saas-tab-section').forEach((sec) => { sec.style.display = 'none'; });
    const section = document.getElementById('saas-tab-detalhes');
    if (section) section.style.display = 'block';
    const title = document.getElementById('saas-page-title');
    if (title) title.innerHTML = '<i class="ti ti-building" style="color:var(--cor-primaria)"></i> Detalhes da empresa';
    const desc = document.getElementById('saas-page-desc');
    if (desc) desc.textContent = 'Dados administrativos e auditoria segura';
    if (title) title.hidden = false;
    if (desc) desc.hidden = false;
    // Foco no título do detalhe em toda abertura (o botão que abriu some da tela)
    if (title && title.focus) {
      if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
      try { title.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
    }
    const container = document.getElementById('empresa-detalhes');
    if (container) container.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>Carregando empresa…</p></div>';

    const sessaoAuditoria = typeof Auditoria !== 'undefined' ? Auditoria.restaurarLocal() : null;
    const emAuditoria = document.body.classList.contains('audit-mode') && sessaoAuditoria?.empresaId === id;
    const res = emAuditoria
      ? await API.get('/auditoria/sessoes/' + sessaoAuditoria.id + '/resumo?page=1&limit=20')
      : await API.get('/empresas/' + id + '?page=1&limit=20');
    if (requestId !== this.requestId || id !== this.empresaId) return;
    if (!res?.success) {
      // Id desconhecido ou sem acesso: o endereço volta para #inicio/empresas
      if (typeof limparRotaDetalheEmpresa === 'function') limparRotaDetalheEmpresa();
      // Estado de erro: título coerente e sem o cabeçalho "Detalhes da empresa"
      document.title = 'Empresa não encontrada · Início · Sistema de Estoque';
      const anuncioErro = document.getElementById('anuncio-tela');
      if (anuncioErro) anuncioErro.textContent = 'Empresa não encontrada · Início';
      if (title) title.hidden = true;
      if (desc) desc.hidden = true;
      if (container) container.innerHTML = '<div class="empty-state" role="alert"><p>Não foi possível abrir esta empresa.</p><button class="btn btn-outline" data-click="action-113">Voltar</button></div>';
      const botaoVoltar = container && container.querySelector ? container.querySelector('button') : null;
      if (botaoVoltar && botaoVoltar.focus) { try { botaoVoltar.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
      return;
    }
    this.empresa = res.data.empresa;
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
        <div class="empresa-detail-title"><div><h3 aria-level="2">${this.escape(empresa.nome)}</h3><p>${this.escape(empresa.email_contato)}</p></div><span class="status-pill ${excluida ? 'excluida' : empresa.status}">${status}</span></div>
        <div class="empresa-detail-actions">
          ${excluida ? '' : `<button class="btn btn-outline btn-sm" data-click="action-94" data-id="${empresa.id}"><i class="ti ti-edit"></i> Editar</button>
          <button class="btn btn-outline btn-sm" data-click="action-103" data-id="${empresa.id}" data-status="${empresa.status}">${empresa.status === 'ativa' ? 'Inativar' : 'Reativar'}</button>
          <button class="btn btn-outline-danger btn-sm" data-click="action-92" data-id="${empresa.id}" data-nome="${this.escape(empresa.nome)}"><i class="ti ti-archive"></i> Retirar da operação</button>`}
        </div>
      </div>
      <div class="empresa-detail-tabs" role="tablist" aria-label="Seções da empresa">
        ${this.botaoAba('visao-geral', 'Visão geral')}
        ${this.botaoAba('usuarios', 'Usuários')}
        ${this.botaoAba('contagens', 'Contagens')}
        ${this.botaoAba('auditoria', 'Auditoria')}
      </div>
      <div id="empresa-detalhes-conteudo" class="empresa-detail-content" role="tabpanel" aria-labelledby="empresa-aba-${this.abaAtual}" aria-live="polite"></div>`;
  },

  /** Aba com padrão WAI-ARIA: id, aria-controls, tabindex móvel (só a ativa entra na ordem de Tab) e setas via events.js */
  botaoAba(id, label) {
    const rotuloAcessivel = id === 'visao-geral' ? ' aria-label="Visão geral da empresa"' : '';
    const ativa = id === this.abaAtual;
    return `<button type="button" id="empresa-aba-${id}" class="empresa-detail-tab" role="tab" aria-selected="${ativa}" aria-controls="empresa-detalhes-conteudo" tabindex="${ativa ? '0' : '-1'}" data-click="action-112" data-keydown="empresa-aba-teclado" data-tab="${id}"${rotuloAcessivel}>${label}</button>`;
  },

  /** Rótulos legíveis: usa Rotulos (utils.js) quando existir; o fallback é equivalente. */
  capitalizar(cod) {
    const texto = String(cod || '').replace(/_/g, ' ').trim();
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
  },
  rotuloPapel(papel) {
    if (typeof Rotulos !== 'undefined' && Rotulos.papel) return Rotulos.papel(papel);
    const mapa = { funcionario: 'Funcionário', administrador: 'Administrador', admin: 'Administrador', gestor: 'Administrador', super_admin: 'Super Admin' };
    return mapa[papel] || this.capitalizar(papel);
  },
  rotuloAcao(acao) {
    if (typeof Rotulos !== 'undefined' && Rotulos.acaoAuditoria) return Rotulos.acaoAuditoria(acao);
    if (typeof Atividades !== 'undefined' && Atividades.rotuloAcao) return Atividades.rotuloAcao(acao);
    return this.capitalizar(acao);
  },
  rotuloResultado(resultado) {
    if (typeof Rotulos !== 'undefined' && Rotulos.resultado) return Rotulos.resultado(resultado);
    const mapa = { sucesso: 'Sucesso', falha: 'Falha' };
    return mapa[String(resultado || '').toLowerCase()] || this.capitalizar(resultado);
  },
  rotuloStatusContagem(status) {
    if (typeof Rotulos !== 'undefined' && Rotulos.statusContagem) return Rotulos.statusContagem(status);
    const mapa = { finalizada: 'Finalizada', em_andamento: 'Em andamento', apagada: 'Apagada' };
    return mapa[status] || this.capitalizar(status);
  },

  async mudarAba(aba, { dadosIniciais = null } = {}) {
    if (!this.empresaId) return;
    this.abaAtual = aba;
    document.querySelectorAll('.empresa-detail-tab[data-tab]').forEach((button) => {
      const ativa = button.dataset.tab === aba;
      button.classList.toggle('active', ativa);
      button.setAttribute('aria-selected', ativa ? 'true' : 'false');
      button.setAttribute('tabindex', ativa ? '0' : '-1');
      // Celular: as abas rolam na horizontal; a ativa fica sempre visível
      const faixa = button.parentElement;
      if (ativa && faixa && faixa.scrollWidth > faixa.clientWidth) faixa.scrollLeft = button.offsetLeft - (faixa.clientWidth - button.offsetWidth) / 2;
    });
    const content = document.getElementById('empresa-detalhes-conteudo');
    if (!content) return;
    content.setAttribute('aria-labelledby', `empresa-aba-${aba}`);
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
    const situacao = e.excluida_em ? 'Excluída' : e.status === 'inativa' ? 'Inativa' : 'Ativa';
    // "Plano: ativo" repetia a Situação; o plano só aparece quando traz informação própria (teste)
    const plano = e.plano === 'trial' ? '<article><span>Plano</span><strong>Período de teste</strong></article>' : '';
    content.innerHTML = `<div class="detail-stat-grid">
      <article><span>Situação</span><strong>${situacao}</strong></article>
      ${plano}
      <article><span>Usuários</span><strong>${Number(e.total_usuarios || 0)}</strong></article>
      <article><span>Produtos ativos</span><strong>${Number(e.total_produtos || 0)}</strong></article>
      <article><span>Contagens</span><strong>${Number(e.total_contagens || 0)}</strong></article>
    </div>${e.excluida_em ? '<div class="audit-readonly-note"><i class="ti ti-archive"></i><div><strong>Empresa preservada para auditoria</strong><p>Os dados permanecem disponíveis somente para consulta administrativa.</p></div></div>' : ''}`;
  },

  renderizarUsuarios(content, usuarios) {
    if (!usuarios.length) return void (content.innerHTML = '<div class="empty-state"><p>Nenhum usuário cadastrado.</p></div>');
    content.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll" tabindex="0" role="region" aria-label="Tabela de usuários da empresa"><table class="saas-table tabela-acoes-fixas"><thead><tr><th scope="col">Usuário</th><th scope="col">Papel</th><th scope="col">Situação</th><th scope="col">Recuperação de senha</th></tr></thead><tbody>${usuarios.map((u) => {
      const administrativo = ['administrador', 'gestor', 'admin'].includes(u.papel);
      const acao = administrativo && u.ativo
        ? `<button class="btn btn-outline btn-sm" data-click="action-116" data-user-id="${u.id}" data-user-name="${this.escape(u.nome)}" data-user-email="${this.escape(u.email)}">Definir senha temporária</button>`
        : administrativo ? 'Administrador inativo' : '—';
      return `<tr><td class="cartao-principal"><strong>${this.escape(u.nome)}</strong><small>${this.escape(u.email)}</small></td><td data-label="Papel">${this.escape(this.rotuloPapel(u.papel))}</td><td data-label="Situação">${u.ativo ? 'Ativo' : 'Inativo'}</td><td data-label="Recuperação de senha" class="${administrativo && u.ativo ? 'cartao-acoes' : ''}">${acao}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  },

  renderizarContagens(content, contagens) {
    if (!contagens.length) return void (content.innerHTML = '<div class="empty-state"><p>Nenhuma contagem registrada.</p></div>');
    content.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll" tabindex="0" role="region" aria-label="Tabela de contagens da empresa"><table class="saas-table tabela-acoes-fixas"><thead><tr><th scope="col">Início</th><th scope="col">Situação</th><th scope="col">Finalização</th><th scope="col">Com divergência?</th></tr></thead><tbody>${contagens.map((c) => {
      const finalizada = String(c.status || '').toLowerCase() === 'finalizada';
      const divergencia = finalizada ? (c.tem_diferenca ? 'Sim' : 'Não') : '—';
      return `<tr><td class="cartao-principal">${this.data(c.iniciado_em)}</td><td data-label="Situação">${this.escape(this.rotuloStatusContagem(c.status))}</td><td data-label="Finalização">${this.data(c.finalizado_em)}</td><td data-label="Com divergência">${divergencia}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  },

  renderizarLogs(content, logs) {
    if (!logs.length) return void (content.innerHTML = '<div class="empty-state"><p>Nenhum evento encontrado.</p></div>');
    content.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll" tabindex="0" role="region" aria-label="Tabela de registros de atividade da empresa"><table class="saas-table tabela-acoes-fixas"><thead><tr><th scope="col">Data</th><th scope="col">Ação</th><th scope="col">Ator</th><th scope="col">Resultado</th></tr></thead><tbody>${logs.map((log) => `<tr><td class="cartao-principal">${this.data(log.criado_em)}</td><td data-label="Ação" title="${this.escape(log.acao)}">${this.escape(this.rotuloAcao(log.acao))}</td><td data-label="Ator">${this.escape(log.ator?.rotulo || 'Sistema')}</td><td data-label="Resultado">${this.escape(this.rotuloResultado(log.resultado))}</td></tr>`).join('')}</tbody></table></div></div>`;
  },

  voltar() {
    this.requestId++;
    this.empresaId = null;
    this.empresa = null;
    if (this.origem === 'compat') {
      this.origem = 'console';
      showScreen('screen-empresas');
      return;
    }
    switchSaasTab('tenants');
  },

  abrirSenhaTemporaria(usuarioId, nome, email) {
    this.focoAntesSenhaTemporaria = document.activeElement;
    this.usuarioSenhaTemporaria = { id:usuarioId, nome, email };
    const modal = document.getElementById('modal-senha-temporaria-admin');
    const alvo = document.getElementById('senha-temporaria-admin-alvo');
    const senha = document.getElementById('senha-temporaria-admin');
    const confirmar = document.getElementById('confirmar-senha-temporaria-admin');
    const erro = document.getElementById('senha-temporaria-admin-error');
    if (alvo) alvo.textContent = `${nome} (${email})`;
    if (senha) senha.value = '';
    if (confirmar) confirmar.value = '';
    if (erro) erro.textContent = '';
    if (modal) modal.classList.add('active');
    senha?.focus();
  },

  fecharSenhaTemporaria() {
    const modal = document.getElementById('modal-senha-temporaria-admin');
    const senha = document.getElementById('senha-temporaria-admin');
    const confirmar = document.getElementById('confirmar-senha-temporaria-admin');
    if (senha) senha.value = '';
    if (confirmar) confirmar.value = '';
    if (modal) modal.classList.remove('active');
    this.usuarioSenhaTemporaria = null;
    this.focoAntesSenhaTemporaria?.focus?.();
    this.focoAntesSenhaTemporaria = null;
  },

  async salvarSenhaTemporaria() {
    if (this.salvandoSenhaTemporaria || !this.usuarioSenhaTemporaria || !this.empresaId) return;
    const senhaInput = document.getElementById('senha-temporaria-admin');
    const confirmarInput = document.getElementById('confirmar-senha-temporaria-admin');
    const botao = document.getElementById('btn-salvar-senha-temporaria-admin');
    const senha = senhaInput?.value || '';
    const confirmarSenha = confirmarInput?.value || '';
    const erro = document.getElementById('senha-temporaria-admin-error');
    for (const input of [senhaInput, confirmarInput]) input?.setAttribute('aria-invalid', 'false');
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(senha)) {
      if (erro) erro.textContent = 'Use ao menos 8 caracteres, com letra maiúscula, minúscula e número.';
      senhaInput?.setAttribute('aria-invalid', 'true');
      return;
    }
    if (new TextEncoder().encode(senha).length > 72) {
      if (erro) erro.textContent = 'A senha temporária é longa demais.';
      senhaInput?.setAttribute('aria-invalid', 'true');
      return;
    }
    if (senha !== confirmarSenha) {
      if (erro) erro.textContent = 'As senhas não coincidem.';
      confirmarInput?.setAttribute('aria-invalid', 'true');
      return;
    }
    this.salvandoSenhaTemporaria = true;
    for (const input of [senhaInput, confirmarInput, botao]) if (input) input.disabled = true;
    try {
      const res = await API.post(
        `/empresas/${this.empresaId}/administradores/${this.usuarioSenhaTemporaria.id}/senha-temporaria`,
        { novaSenhaTemporaria:senha, confirmar:true }
      );
      if (!res?.success) {
        if (erro) erro.textContent = res?.message || 'Não foi possível definir a senha temporária.';
        return;
      }
      this.fecharSenhaTemporaria();
      showToast('Senha temporária definida. O administrador trocará a senha no próximo acesso.', 'success');
    } finally {
      this.salvandoSenhaTemporaria = false;
      for (const input of [senhaInput, confirmarInput, botao]) if (input) input.disabled = false;
    }
  },

  data(value) { return value ? new Date(value).toLocaleString('pt-BR') : '—'; },
  escape(value) { return Empresas.escapeHtml(value); }
};
