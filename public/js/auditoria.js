const Auditoria = {
  storageKey: 'superAdminAuditSession',
  sessao: null,
  empresaId: null,
  empresaNome: null,
  container: null,
  requestId: 0,

  restaurarLocal() {
    try {
      const value = JSON.parse(sessionStorage.getItem(this.storageKey) || 'null');
      return value?.id ? value : null;
    } catch {
      sessionStorage.removeItem(this.storageKey);
      return null;
    }
  },

  async restaurar() {
    this.sessao = this.restaurarLocal();
    if (!this.sessao) return false;
    const res = await API.get(`/auditoria/sessoes/${this.sessao.id}/resumo?page=1&limit=1`);
    if (!res?.success) {
      this.limparLocal();
      return false;
    }
    this.mostrarBarra();
    return true;
  },

  async renderizar(empresaId, empresaNome, container) {
    this.empresaId = empresaId;
    this.empresaNome = empresaNome;
    this.container = container;
    this.sessao = this.restaurarLocal();
    if (!this.sessao || this.sessao.empresaId !== empresaId) {
      this.esconderBarra();
      container.innerHTML = `<div class="audit-start-card"><i class="ti ti-shield-search"></i><h4>Auditoria segura e somente leitura</h4><p>Você continuará identificado como Super Admin. Nenhuma ação operacional da empresa ficará disponível.</p><label for="audit-session-motivo">Motivo opcional</label><textarea id="audit-session-motivo" maxlength="500" rows="3" placeholder="Ex.: análise de chamado de suporte"></textarea><button class="btn btn-primary" data-click="action-114"><i class="ti ti-eye"></i> Iniciar auditoria</button></div>`;
      return;
    }
    await this.validarERenderizar();
  },

  async iniciar() {
    const motivo = document.getElementById('audit-session-motivo')?.value.trim() || undefined;
    const tokenAntes = sessionStorage.getItem('accessToken');
    const refreshAntes = sessionStorage.getItem('refreshToken');
    const res = await API.post('/auditoria/sessoes', { empresa_id: this.empresaId, motivo });
    if (!res?.success) return showToast(res?.message || 'Não foi possível iniciar a auditoria.', 'error');
    const s = res.data.sessao;
    this.sessao = { id: s.id, empresaId: s.empresa_id, empresaNome: s.empresa_nome || this.empresaNome, expiraEm: s.expira_em };
    sessionStorage.setItem(this.storageKey, JSON.stringify(this.sessao));
    if (tokenAntes !== sessionStorage.getItem('accessToken') || refreshAntes !== sessionStorage.getItem('refreshToken')) {
      sessionStorage.removeItem(this.storageKey);
      return showToast('A sessão principal mudou. Entre novamente.', 'error');
    }
    await this.validarERenderizar();
  },

  async validarERenderizar() {
    const requestId = ++this.requestId;
    if (this.container) {
      this.container.setAttribute('aria-busy', 'true');
      this.container.innerHTML = '<div class="loading-state" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><p>Validando sessão de auditoria...</p></div>';
    }
    let res;
    try {
      res = await API.get(`/auditoria/sessoes/${this.sessao.id}/resumo?page=1&limit=20`);
    } finally {
      this.container?.removeAttribute('aria-busy');
    }
    if (requestId !== this.requestId) return;
    if (!res?.success) {
      this.limparLocal();
      if (this.container) this.container.innerHTML = '<div class="empty-state" role="alert"><p>A sessão foi encerrada ou expirou.</p><button class="btn btn-outline" data-click="action-114">Iniciar outra auditoria</button></div>';
      return;
    }
    this.mostrarBarra();
    const empresa = res.data.empresa;
    this.container.innerHTML = `<div class="audit-readonly-note"><i class="ti ti-lock"></i><div><strong>Somente leitura</strong><p>Empresa: ${Empresas.escapeHtml(empresa.nome)} · expira em ${new Date(this.sessao.expiraEm).toLocaleString('pt-BR')}</p></div></div><div class="empresa-detail-tabs audit-resource-tabs">${['resumo','usuarios','produtos','contagens','logs'].map((r) => `<button class="empresa-detail-tab" data-click="action-115" data-resource="${r}">${{ resumo: 'Resumo', usuarios: 'Usuários', produtos: 'Produtos', contagens: 'Contagens', logs: 'Logs' }[r]}</button>`).join('')}</div><div id="audit-resource-content"></div>`;
    await this.carregar('resumo');
  },

  async carregar(recurso) {
    if (!this.sessao) return;
    document.querySelectorAll('.audit-resource-tabs [data-resource]').forEach((button) => button.classList.toggle('active', button.dataset.resource === recurso));
    const target = document.getElementById('audit-resource-content');
    if (!target) return;
    const requestId = ++this.requestId;
    target.setAttribute('aria-busy', 'true');
    target.innerHTML = '<div class="loading-state" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><p>Consultando dados...</p></div>';
    let res;
    try {
      res = await API.get(`/auditoria/sessoes/${this.sessao.id}/${recurso}?page=1&limit=20`);
    } finally {
      target.removeAttribute('aria-busy');
    }
    if (requestId !== this.requestId) return;
    if (!res?.success) {
      if (['AUDITORIA_ENCERRADA', 'NAO_ENCONTRADO'].includes(res?.code)) this.limparLocal();
      target.innerHTML = '<div class="empty-state" role="alert"><p>Não foi possível consultar este recurso.</p></div>';
      return;
    }
    if (recurso === 'resumo') {
      const e = res.data.empresa;
      target.innerHTML = `<div class="detail-stat-grid"><article><span>Usuários</span><strong>${e.total_usuarios}</strong></article><article><span>Produtos ativos</span><strong>${e.total_produtos}</strong></article><article><span>Contagens</span><strong>${e.total_contagens}</strong></article><article><span>Situação</span><strong>${e.excluida_em ? 'Excluída' : e.status === 'inativa' ? 'Inativa' : 'Ativa'}</strong></article></div>`;
      return;
    }
    const items = res.data.items || [];
    if (!items.length) return void (target.innerHTML = '<div class="empty-state"><p>Nenhum registro encontrado.</p></div>');
    const colunas = recurso === 'usuarios' ? ['nome','email','papel','ativo'] : recurso === 'produtos' ? ['codigo','nome','fornecedor','estoque_atual'] : recurso === 'contagens' ? ['iniciado_em','status','finalizado_em','tem_diferenca'] : ['criado_em','acao','resultado','motivo'];
    const rotulos = { usuarios: 'usuários', produtos: 'produtos', contagens: 'contagens', logs: 'registros de auditoria' };
    target.innerHTML = `<div class="saas-table-card"><div class="saas-table-scroll" tabindex="0" role="region" aria-label="Tabela de ${rotulos[recurso] || 'registros'} da empresa"><table class="saas-table tabela-acoes-fixas"><thead><tr>${colunas.map((c) => `<th scope="col">${this.cabecalho(c)}</th>`).join('')}</tr></thead><tbody>${items.map((item) => `<tr>${colunas.map((c, i) => `<td${i === 0 ? ' class="cartao-principal"' : ` data-label="${this.cabecalho(c).replace(/\?$/, '')}"`}>${this.valor(item[c], c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  },

  CABECALHOS: {
    nome: 'Nome', email: 'E-mail', papel: 'Papel', ativo: 'Ativo', codigo: 'Código', fornecedor: 'Fornecedor',
    estoque_atual: 'Estoque atual', iniciado_em: 'Início', finalizado_em: 'Finalização', status: 'Situação',
    tem_diferenca: 'Com divergência?', criado_em: 'Data', acao: 'Ação', resultado: 'Resultado', motivo: 'Motivo'
  },

  cabecalho(coluna) {
    return this.CABECALHOS[coluna] || this.rotulo({}, String(coluna).replaceAll('_', ' '));
  },

  ROTULOS_PAPEL: { super_admin: 'Super Admin', funcionario: 'Funcionário', administrador: 'Administrador', admin: 'Administrador', gestor: 'Gestor' },
  ROTULOS_ENTIDADE: { sessao: 'Sessão', contagem: 'Contagem', usuario: 'Usuário', empresa: 'Empresa', produto: 'Produto', estoque: 'Estoque' },

  rotulo(mapa, codigo) {
    const cod = String(codigo || '');
    if (mapa[cod]) return mapa[cod];
    const texto = cod.replace(/_/g, ' ').trim();
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  },

  valor(value, coluna) {
    if (value === null || value === undefined) return '—';
    if (coluna === 'papel') return `<span title="${Empresas.escapeHtml(value)}">${Empresas.escapeHtml(typeof Rotulos !== 'undefined' && Rotulos.papel ? Rotulos.papel(value) : this.rotulo(this.ROTULOS_PAPEL, value))}</span>`;
    if (coluna === 'status') return Empresas.escapeHtml(typeof Rotulos !== 'undefined' && Rotulos.statusContagem ? Rotulos.statusContagem(value) : this.rotulo({ finalizada: 'Finalizada', em_andamento: 'Em andamento', apagada: 'Apagada' }, value));
    if (coluna === 'resultado') return Empresas.escapeHtml(typeof Rotulos !== 'undefined' && Rotulos.resultado ? Rotulos.resultado(value) : this.rotulo({ sucesso: 'Sucesso', falha: 'Falha' }, value));
    if (coluna === 'entidade') return `<span title="${Empresas.escapeHtml(value)}">${Empresas.escapeHtml(this.rotulo(this.ROTULOS_ENTIDADE, value))}</span>`;
    if (coluna === 'acao' && typeof Atividades !== 'undefined') return `<span title="${Empresas.escapeHtml(value)}">${Empresas.escapeHtml(Atividades.rotuloAcao(value))}</span>`;
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return new Date(value).toLocaleString('pt-BR');
    return Empresas.escapeHtml(value);
  },

  async encerrar() {
    if (!this.sessao) return;
    const res = await API.post(`/auditoria/sessoes/${this.sessao.id}/encerrar`, {});
    if (!res?.success) return showToast(res?.message || 'Não foi possível encerrar agora.', 'error');
    this.limparLocal();
    showToast('Auditoria encerrada.', 'success');
    if (EmpresaDetalhes?.empresaId) await EmpresaDetalhes.mudarAba('auditoria');
    // O botão "Encerrar auditoria" sumiu com a barra: o foco vai ao título da tela
    const titulo = document.querySelector('#empresa-detalhes .empresa-detail-title h3') || document.getElementById('saas-page-title');
    if (titulo) {
      if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
      try { titulo.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
    }
  },

  mostrarBarra() {
    const bar = document.getElementById('audit-session-bar');
    const name = document.getElementById('audit-session-tenant-nome');
    if (bar) bar.style.display = 'block';
    if (name) name.textContent = this.sessao?.empresaNome || this.empresaNome || 'Empresa';
    document.body.classList.add('audit-mode');
  },

  esconderBarra() {
    const bar = document.getElementById('audit-session-bar');
    if (bar) bar.style.display = 'none';
    document.body.classList.remove('audit-mode');
  },

  limparLocal() {
    this.requestId++;
    sessionStorage.removeItem(this.storageKey);
    this.sessao = null;
    this.esconderBarra();
  }
};

/**
 * Rodada 10: busca e filtros da Auditoria global (aba do console do Super Admin).
 * Reaproveita o módulo Atividades (filtros, painel recolhível, paginação, exportação) para não duplicar regra.
 * Os controles vêm de um <template> e só entram no DOM para o Super Admin, para os ids
 * (filtro-audit-*) não colidirem com os do back-office do administrador.
 */
const AuditoriaGlobal = {
  montado: false,

  MODELO: `<div class="audit-toolbar saas-audit-toolbar">
    <div class="audit-filters">
      <div class="audit-linha-topo">
        <div class="audit-campo audit-campo-busca"><label for="filtro-audit-busca">Busca</label><input type="text" id="filtro-audit-busca" aria-label="Buscar atividade por ator, ação ou motivo" placeholder="Ator, ação ou motivo"></div>
        <button type="button" class="btn btn-outline btn-sm audit-filtros-toggle" id="btn-audit-filtros" data-click="audit-filtros-alternar" aria-expanded="true" aria-controls="audit-filtros-painel"><i class="ti ti-filter" aria-hidden="true"></i> Filtros</button>
        <span class="audit-filtros-resumo" id="audit-filtros-resumo" role="status" aria-live="polite"></span>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-audit-limpar" data-click="action-58" hidden><i class="ti ti-refresh" aria-hidden="true"></i> Limpar</button>
      </div>
      <div class="audit-filtros-painel" id="audit-filtros-painel" role="group" aria-label="Filtros da auditoria global">
        <div class="audit-campo"><label for="filtro-audit-inicio">De</label><input type="date" id="filtro-audit-inicio" title="Data inicial"></div>
        <div class="audit-campo"><label for="filtro-audit-fim">Até</label><input type="date" id="filtro-audit-fim" title="Data final"></div>
        <div class="audit-campo"><label for="filtro-audit-acao">Ação</label><select id="filtro-audit-acao" title="Filtrar por ação" data-change="action-57"><option value="">Todas as ações</option></select></div>
        <div class="audit-campo"><label for="filtro-audit-resultado">Resultado</label><select id="filtro-audit-resultado" title="Filtrar por resultado" data-change="action-57"><option value="">Todos os resultados</option><option value="sucesso">Sucesso</option><option value="falha">Falha</option></select></div>
        <button type="button" class="btn btn-primary btn-sm" data-click="action-57"><i class="ti ti-filter" aria-hidden="true"></i> Filtrar</button>
      </div>
    </div>
    <button type="button" class="btn btn-outline btn-sm" id="btn-audit-exportar" data-click="action-59"><i class="ti ti-file-export" aria-hidden="true"></i> Exportar CSV</button>
  </div>`,

  montarFiltros() {
    if (this.montado) return;
    const host = document.getElementById('saas-audit-filtros-host');
    if (!host) return;
    host.innerHTML = this.MODELO;
    this.montado = true;
    const acoes = typeof Rotulos !== 'undefined' && Rotulos.ACOES_AUDITORIA
      ? Rotulos.ACOES_AUDITORIA
      : (typeof Atividades !== 'undefined' && Atividades.ROTULOS_ACAO) || {};
    const select = document.getElementById('filtro-audit-acao');
    if (select) {
      Object.entries(acoes)
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
        .forEach(([codigo, rotulo]) => select.add(new Option(rotulo, codigo)));
    }
  }
};

// A aba chama Atividades.carregar(); o Super Admin ganha os filtros antes da primeira carga
if (typeof Atividades !== 'undefined' && typeof Atividades.carregar === 'function') {
  const carregarAtividades = Atividades.carregar;
  Atividades.carregar = function (...args) {
    if (typeof Auth !== 'undefined' && Auth.usuario?.papel === 'super_admin') AuditoriaGlobal.montarFiltros();
    return carregarAtividades.apply(this, args);
  };
}
