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
    const container = document.getElementById('lista-atividades');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:30px"><span class="spinner"></span> Carregando atividades...</div>';

    const filtros = this.obterFiltros();
    const queryParams = new URLSearchParams({
      page: String(page),
      limit: '20',
      ...filtros
    });

    try {
      const res = await API.get(`/atividades?${queryParams.toString()}`);
      if (!res || !res.success) {
        container.innerHTML = `<div class="card" style="color:var(--cor-perigo); text-align:center; padding:20px">${res?.message || 'Erro ao carregar atividades.'}</div>`;
        return;
      }

      const { atividades, pagination } = res.data;
      this.totalPaginas = pagination.totalPages || 1;
      this.renderizarTabela(atividades, pagination);
      this.atualizarPaginacao(pagination);
    } catch (err) {
      container.innerHTML = '<div class="card" style="color:var(--cor-perigo); text-align:center; padding:20px">Falha na conexão com o servidor.</div>';
    }
  },

  /**
   * Renderiza a tabela de atividades
   */
  renderizarTabela(atividades, pagination) {
    const container = document.getElementById('lista-atividades');
    if (!container) return;

    if (!atividades || atividades.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px; color:var(--cor-texto-secundario)">
          <i class="ti ti-shield-check" style="font-size:2.5rem; color:var(--cor-primaria); margin-bottom:10px; display:inline-block"></i>
          <p style="font-weight:600; margin-bottom:4px">Nenhuma atividade registrada encontrada</p>
          <p style="font-size:0.85rem">Ajuste os filtros acima para refinar a busca.</p>
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

      const acaoBadge = `<span class="badge-audit acao">${log.acao}</span>`;
      const atorLabel = log.ator?.rotulo || 'Sistema';
      const atorPapel = log.ator?.papel ? `(${log.ator.papel})` : '';

      rowsHtml += `
        <tr>
          <td style="white-space:nowrap; font-size:0.8rem; color:var(--cor-texto-secundario)">${dataFormatada}</td>
          <td>
            <strong>${atorLabel}</strong>
            <span style="font-size:0.75rem; color:var(--cor-texto-mudo); display:block">${atorPapel}</span>
          </td>
          <td>${acaoBadge}</td>
          <td><span style="font-size:0.85rem; font-weight:500">${log.entidade || '—'}</span></td>
          <td>${statusBadge}</td>
          <td style="text-align:right">
            <button class="btn btn-ghost btn-sm" title="Ver detalhes e diff" onclick="Atividades.abrirDetalhes('${log.id}')">
              <i class="ti ti-eye"></i> Detalhes
            </button>
          </td>
        </tr>
      `;
    }

    container.innerHTML = `
      <div class="audit-table-wrapper">
        <table class="audit-table">
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Ator</th>
              <th>Ação</th>
              <th>Entidade</th>
              <th>Resultado</th>
              <th style="text-align:right">Ações</th>
            </tr>
          </thead>
          <tbody>
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
      document.getElementById('audit-det-entidade').textContent = `${log.entidade || ''} (ID: ${log.entidade_id || 'N/A'})`;
      document.getElementById('audit-det-data').textContent = new Date(log.criado_em).toLocaleString('pt-BR');
      document.getElementById('audit-det-ator').textContent = `${log.ator?.rotulo || 'Sistema'} — Papel: ${log.ator?.papel || 'N/A'}`;
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
