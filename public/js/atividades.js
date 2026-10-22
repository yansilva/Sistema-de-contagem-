/**
 * Módulo de Atividades e Trilha de Auditoria (Painel Administrativo)
 */
const Atividades = {
  paginaAtual: 1,
  totalPaginas: 1,
  carregando: false,

  /**
   * Obtém os filtros preenchidos na interface
   */
  obterFiltros() {
    const inicio = document.getElementById('filtro-audit-inicio')?.value || '';
    const fim = document.getElementById('filtro-audit-fim')?.value || '';
    const acao = document.getElementById('filtro-audit-acao')?.value || '';
    const resultado = document.getElementById('filtro-audit-resultado')?.value || '';
    const search = document.getElementById('filtro-audit-busca')?.value.trim() || '';

    const filtros = {};
    if (inicio) filtros.data_inicio = inicio;
    if (fim) filtros.data_fim = fim;
    if (acao) filtros.acao = acao;
    if (resultado) filtros.resultado = resultado;
    if (search) filtros.search = search;
    return filtros;
  },

  /**
   * Carrega lista paginada de logs de auditoria
   */
  async carregar(page = 1) {
    if (!Auth.isAdmin()) {
      showToast('Acesso restrito a administradores.', 'error');
      return;
    }

    this.paginaAtual = page;
    const container = this.obterContainer();
    if (!container) return;

    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '<div role="status" aria-live="polite" style="text-align:center; padding:30px"><span class="spinner" aria-hidden="true"></span> Carregando atividades...</div>';

    const filtros = this.obterFiltros();
    const queryParams = new URLSearchParams({
      page: String(page),
      limit: '20',
      ...filtros
    });

    try {
      const res = await API.get(`/atividades?${queryParams.toString()}`);
      if (!res || !res.success) {
        const mensagem = escapeHtml(res?.message || 'Erro ao carregar atividades.');
        container.innerHTML = this.htmlErro(mensagem);
        return;
      }

      const { atividades, pagination } = res.data;
      this.totalPaginas = pagination.totalPages || 1;
      this.renderizarTabela(atividades, pagination);
      this.atualizarPaginacao(pagination);
    } catch (err) {
      container.innerHTML = this.htmlErro('Falha na conexão com o servidor.');
    } finally {
      container.removeAttribute('aria-busy');
    }
  },

  /**
   * Lista que pertence ao contexto visível: Super Admin usa a aba
   * "Auditoria Global" (#atividades-lista); administrador usa o back-office (#lista-atividades).
   */
  obterContainer() {
    const ehSuper = Auth.usuario?.papel === 'super_admin';
    return document.getElementById(ehSuper ? 'atividades-lista' : 'lista-atividades')
      || document.getElementById('atividades-lista')
      || document.getElementById('lista-atividades');
  },

  htmlErro(mensagem) {
    return `
      <div class="card" role="alert" style="color:var(--cor-perigo); text-align:center; padding:20px">
        <p style="margin-bottom:10px">${mensagem}</p>
        <button type="button" class="btn btn-outline btn-sm" data-click="action-57">Tentar de novo</button>
      </div>`;
  },

  /**
   * Rótulo legível para o código da ação (o filtro continua usando o código original)
   */
  rotuloAcao(codigo) {
    const cod = String(codigo || '');
    if (this.ROTULOS_ACAO[cod]) return this.ROTULOS_ACAO[cod];
    const semPrefixo = cod.includes('.') ? cod.split('.').pop() : cod;
    const texto = semPrefixo.replace(/_/g, ' ').trim();
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
  },

  ROTULOS_ENTIDADE: {
    sessao: 'Sessão',
    contagem: 'Contagem',
    usuario: 'Usuário',
    empresa: 'Empresa',
    produto: 'Produto',
    estoque: 'Estoque'
  },

  ROTULOS_PAPEL: {
    super_admin: 'Super Admin',
    funcionario: 'Funcionário',
    administrador: 'Administrador',
    admin: 'Administrador',
    gestor: 'Gestor'
  },

  rotuloDe(mapa, codigo) {
    const cod = String(codigo || '');
    if (!cod) return '';
    if (mapa[cod]) return mapa[cod];
    const texto = cod.replace(/_/g, ' ').trim();
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  },

  rotuloEntidade(codigo) { return this.rotuloDe(this.ROTULOS_ENTIDADE, codigo); },
  rotuloPapel(codigo) { return this.rotuloDe(this.ROTULOS_PAPEL, codigo); },

  ROTULOS_ACAO: {
    login_sucesso: 'Login realizado',
    login_falha: 'Falha no login',
    logout: 'Saída do sistema',
    sessao_comprometida: 'Sessão comprometida',
    senha_alterada: 'Senha alterada',
    senha_redefinida: 'Senha redefinida',
    senha_temporaria_definida_superadmin: 'Senha temporária definida pelo Super Admin',
    recuperacao_solicitada: 'Recuperação de senha solicitada',
    recuperacao_entrega_aceita: 'E-mail de recuperação enviado',
    recuperacao_entrega_falhou: 'Falha no envio do e-mail de recuperação',
    recuperacao_concluida: 'Recuperação de senha concluída',
    usuario_criado: 'Usuário criado',
    usuario_editado: 'Usuário editado',
    produto_criado: 'Produto criado',
    produto_editado: 'Produto editado',
    produto_desativado: 'Produto desativado',
    catalogo_importado: 'Catálogo importado',
    contagem_criada: 'Contagem criada',
    contagem_progresso_salvo: 'Progresso da contagem salvo',
    contagem_finalizada: 'Contagem finalizada',
    contagem_reaberta: 'Contagem reaberta',
    estoque_pdf_recebido: 'PDF de estoque recebido',
    estoque_atualizado: 'Estoque atualizado',
    empresa_criada: 'Empresa criada',
    empresa_atualizada: 'Empresa atualizada',
    empresa_excluida: 'Empresa excluída',
    empresa_exclusao_negada: 'Exclusão de empresa negada',
    auditoria_iniciada: 'Auditoria assistida iniciada',
    auditoria_encerrada: 'Auditoria assistida encerrada',
    auditoria_expirada: 'Auditoria assistida expirada'
  },

  /**
   * Renderiza a tabela de atividades
   */
  renderizarTabela(atividades, pagination) {
    const container = this.obterContainer();
    if (!container) return;

    if (!atividades || atividades.length === 0) {
      const comFiltro = Object.keys(this.obterFiltros()).length > 0;
      container.innerHTML = comFiltro ? `
        <div class="card" style="text-align:center; padding:40px; color:var(--cor-texto-secundario)">
          <i class="ti ti-shield-check" style="font-size:2.5rem; color:var(--cor-primaria); margin-bottom:10px; display:inline-block"></i>
          <p style="font-weight:600; margin-bottom:8px">Nenhum resultado para os filtros atuais.</p>
          <button type="button" class="btn btn-outline btn-sm" data-click="action-58">Limpar filtros</button>
        </div>
      ` : `
        <div class="card" style="text-align:center; padding:40px; color:var(--cor-texto-secundario)">
          <i class="ti ti-shield-check" style="font-size:2.5rem; color:var(--cor-primaria); margin-bottom:10px; display:inline-block"></i>
          <p style="font-weight:600; margin-bottom:4px">Nenhuma atividade registrada ainda.</p>
          <p style="font-size:0.85rem">As ações feitas no sistema aparecem aqui conforme acontecem.</p>
        </div>
      `;
      return;
    }

    let rowsHtml = '';
    for (const log of atividades) {
      const dataFormatada = log.criado_em
        ? new Date(log.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
        : '—';

      const statusBadge = log.resultado === 'sucesso'
        ? '<span class="badge-audit sucesso"><i class="ti ti-check"></i> Sucesso</span>'
        : '<span class="badge-audit falha"><i class="ti ti-x"></i> Falha</span>';

      const acaoBadge = `<span class="badge-audit acao" title="${escapeHtml(log.acao || '')}">${escapeHtml(this.rotuloAcao(log.acao))}</span>`;
      const atorLabel = escapeHtml(log.ator?.rotulo || 'Sistema');
      const atorPapel = log.ator?.papel
        ? `<span title="${escapeHtml(log.ator.papel)}">${escapeHtml(this.rotuloPapel(log.ator.papel))}</span>`
        : '';
      const entidade = log.entidade
        ? `<span title="${escapeHtml(log.entidade)}">${escapeHtml(this.rotuloEntidade(log.entidade))}</span>`
        : '—';
      const logId = escapeHtml(log.id || '');

      rowsHtml += `
        <tr role="row">
          <td role="cell" class="au-data">${escapeHtml(dataFormatada)}</td>
          <td role="cell" class="au-ator">
            <strong>${atorLabel}</strong>
            <span class="ator-papel">${atorPapel}</span>
          </td>
          <td role="cell" class="au-acao">${acaoBadge}</td>
          <td role="cell" class="au-entidade" data-label="Entidade"><span class="au-entidade-valor">${entidade}</span></td>
          <td role="cell" class="au-res">${statusBadge}</td>
          <td role="cell" class="au-det">
            <button class="btn btn-ghost btn-sm" title="Ver detalhes e diff" data-click="action-70" data-arg-0="${escapeHtml(String(logId))}">
              <i class="ti ti-eye"></i> Detalhes
            </button>
          </td>
        </tr>
      `;
    }

    container.innerHTML = `
      <div class="audit-table-wrapper" tabindex="0" role="region" aria-label="Log de atividades">
        <table class="audit-table audit-cards" role="table" aria-label="Log de atividades">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader">Data/Hora</th>
              <th role="columnheader">Ator</th>
              <th role="columnheader">Ação</th>
              <th role="columnheader">Entidade</th>
              <th role="columnheader">Resultado</th>
              <th role="columnheader" class="au-det">Detalhes</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  },

  /**
   * Atualiza os controles de paginação
   */
  atualizarPaginacao(pagination) {
    const paginacaoEl = document.getElementById('audit-pagination');
    const infoEl = document.getElementById('audit-paginacao-info');
    const btnAnt = document.getElementById('btn-audit-ant');
    const btnProx = document.getElementById('btn-audit-prox');

    if (Auth.usuario?.papel === 'super_admin') {
      // A aba Auditoria Global não tem controles próprios: paginação dentro da lista
      const lista = this.obterContainer();
      if (lista && pagination.totalPages > 1) {
        lista.insertAdjacentHTML('beforeend', `
          <div class="pagination-controls" style="margin-top:16px">
            <button type="button" class="btn btn-outline btn-sm" data-click="action-60" ${pagination.page <= 1 ? 'disabled' : ''}><i class="ti ti-chevron-left" aria-hidden="true"></i> Anterior</button>
            <span>Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} registros)</span>
            <button type="button" class="btn btn-outline btn-sm" data-click="action-61" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Próxima <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
          </div>`);
      }
      return;
    }

    if (!paginacaoEl || !infoEl) return;

    if (pagination.totalPages <= 1) {
      paginacaoEl.style.display = 'none';
      return;
    }

    paginacaoEl.style.display = 'flex';
    infoEl.textContent = `Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} registros)`;
    if (btnAnt) btnAnt.disabled = pagination.page <= 1;
    if (btnProx) btnProx.disabled = pagination.page >= pagination.totalPages;
  },

  /**
   * Navega entre páginas
   */
  mudarPagina(delta) {
    const novaPagina = this.paginaAtual + delta;
    if (novaPagina >= 1 && novaPagina <= this.totalPaginas) {
      this.carregar(novaPagina);
    }
  },

  /**
   * Aplica filtros e reinicia da primeira página
   */
  aplicarFiltros() {
    this.carregar(1);
  },

  /**
   * Limpa filtros de busca
   */
  limparFiltros() {
    const inputs = ['filtro-audit-inicio', 'filtro-audit-fim', 'filtro-audit-acao', 'filtro-audit-resultado', 'filtro-audit-busca'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this.carregar(1);
    document.getElementById('filtro-audit-busca')?.focus();
  },

  /**
   * Abre modal de detalhe com comparativo diff
   */
  async abrirDetalhes(id) {
    const modal = document.getElementById('modal-audit-detalhe');
    if (!modal) return;

    try {
      const res = await API.get(`/atividades/${id}`);
      if (!res || !res.success) {
        showToast('Não foi possível carregar os detalhes do registro.', 'error');
        return;
      }

      const log = res.data;

      document.getElementById('audit-det-id').textContent = log.id;
      document.getElementById('audit-det-acao').textContent = log.acao;
      document.getElementById('audit-det-entidade').textContent = `${this.rotuloEntidade(log.entidade)} (ID: ${log.entidade_id || 'N/A'})`;
      document.getElementById('audit-det-data').textContent = new Date(log.criado_em).toLocaleString('pt-BR');
      document.getElementById('audit-det-ator').textContent = `${log.ator?.rotulo || 'Sistema'}, papel: ${this.rotuloPapel(log.ator?.papel) || 'N/A'}`;
      document.getElementById('audit-det-ip').textContent = log.ip || '—';
      document.getElementById('audit-det-ua').textContent = log.user_agent || '—';
      document.getElementById('audit-det-request-id').textContent = log.request_id || '—';
      document.getElementById('audit-det-operacao-id').textContent = log.operacao_id || '—';
      document.getElementById('audit-det-motivo').textContent = log.motivo || 'Nenhum motivo informado';

      // Formatação dos dados anteriores e novos (Diff)
      const antEl = document.getElementById('audit-det-anterior');
      const novEl = document.getElementById('audit-det-novo');

      if (antEl) {
        antEl.textContent = log.dados_anteriores ? JSON.stringify(log.dados_anteriores, null, 2) : 'Nenhum estado anterior registrado';
      }
      if (novEl) {
        novEl.textContent = log.dados_novos ? JSON.stringify(log.dados_novos, null, 2) : 'Nenhum estado novo registrado';
      }

      modal.style.display = 'flex';
    } catch (err) {
      showToast('Erro ao abrir detalhes.', 'error');
    }
  },

  /**
   * Fecha o modal de detalhes
   */
  fecharModal() {
    const modal = document.getElementById('modal-audit-detalhe');
    if (modal) modal.style.display = 'none';
  },

  /**
   * Exporta os registros filtrados em arquivo CSV sanitizado
   */
  async exportarCsv() {
    const filtros = this.obterFiltros();
    const btn = document.getElementById('btn-audit-exportar');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Exportando...';
    }

    try {
      const token = sessionStorage.getItem('accessToken');
      const res = await fetch('/api/atividades/exportacoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(filtros)
      });

      if (!res.ok) {
        throw new Error('Falha ao exportar relatório.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria_atividades_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast('Relatório CSV exportado com sucesso!', 'success');
    } catch (err) {
      showToast('Erro ao exportar relatório CSV.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-file-export"></i> Exportar CSV';
      }
    }
  }
};

// Enter no campo de busca aplica o filtro (mesma ação do botão "Filtrar")
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'filtro-audit-busca') {
    e.preventDefault();
    Atividades.aplicarFiltros();
  }
});
