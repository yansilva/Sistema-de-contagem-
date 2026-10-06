/**
 * Módulo de Histórico de Contagens e Auditoria (Back-office)
 */
const Historico = {
  contagens: [],

  /**
   * Carrega histórico de contagens do backend
   */
  async carregar() {
    const listaEl = document.getElementById('lista-historico');
    const counterEl = document.getElementById('historico-counter-total');

    if (listaEl) {
      listaEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--cor-texto-mudo)"><span class="spinner"></span> Carregando histórico...</div>';
    }

    const res = await API.get('/contagens');

    if (!res || !res.success || !res.data) {
      if (listaEl) {
        listaEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--cor-texto-mudo)">Erro ao carregar histórico de contagens.</div>';
      }
      return;
    }

    this.contagens = res.data.contagens || [];

    if (counterEl) {
      counterEl.textContent = this.contagens.length;
    }

    if (this.contagens.length === 0) {
      if (listaEl) {
        listaEl.innerHTML = `
          <div style="text-align:center; padding:40px 20px; color:var(--cor-texto-secundario)">
            <i class="ti ti-history-off" style="font-size:2.5rem; margin-bottom:8px; display:block"></i>
            Nenhuma sessão de contagem disponível até o momento.
          </div>
        `;
      }
      return;
    }

    this.renderizar();
  },

  /**
   * Renderiza os cards expansíveis do histórico com proteção XSS
   */
  renderizar() {
    const listaEl = document.getElementById('lista-historico');
    if (!listaEl) return;

    listaEl.innerHTML = this.contagens.map(c => {
      const dataFormatada = formatarData(c.finalizado_em || c.iniciado_em);
      const pecas = c.tipo === 'pecas_queijo';
      const finalizada = c.status === 'finalizada';
      const temDif = !pecas && finalizada && c.tem_diferenca;
      const totalVencidos = !pecas && finalizada ? Number(c.total_vencidos || 0) : 0;
      const statusIcon = !finalizada ? 'ti-clock' : temDif ? 'ti-alert-triangle' : 'ti-circle-check';
      const statusColor = !finalizada ? 'var(--cor-aviso)' : temDif ? 'var(--cor-perigo)' : 'var(--cor-sucesso)';
      const statusTexto = pecas ? `Peças de queijo · ${finalizada ? 'Finalizada' : 'Em andamento'}` : !finalizada ? 'Geral · Em andamento' : temDif ? 'Divergências Encontradas' : totalVencidos ? 'Contagem conferida com produtos vencidos' : 'Conciliado 100%';
      const badgeClass = !finalizada ? 'badge-warning' : temDif ? 'badge-danger' : 'badge-success';

      const fornecedores = Array.isArray(c.fornecedores) ? c.fornecedores : [];

      return `
        <div class="hist-card" id="hist-card-${escapeHtml(c.id)}">
          <div class="hist-card-header" data-click="action-76" data-arg-0="${escapeHtml(c.id)}">
            <i class="ti ${statusIcon} status-icon" style="color:${statusColor}"></i>
            <div class="hist-card-info">
              <div class="data">${dataFormatada}</div>
              <div class="resumo">
                Iniciado por: <strong>${escapeHtml(c.iniciado_por_nome || 'Usuário')}</strong> • 
                <span class="badge ${badgeClass}">${statusTexto}</span>
                ${totalVencidos ? `<span class="badge badge-warning">${totalVencidos} unidades vencidas</span>` : ''}
              </div>
              <div class="hist-chips">
                ${fornecedores.map(f => `
                  <span class="hist-chip">
                    ${escapeHtml(f.fornecedor)} ${pecas || c.status !== 'finalizada' ? '' : f.tem_diferenca ? '⚠️' : '✓'}
                  </span>
                `).join('')}
              </div>
            </div>
            <div class="hist-actions">
              ${temDif || totalVencidos ? `
                <button class="btn btn-outline btn-sm" title="Baixar relatório Excel"
                        data-click="action-77" data-arg-0="${escapeHtml(c.id)}">
                  <i class="ti ti-file-spreadsheet"></i> Excel
                </button>
              ` : ''}
              <i class="ti ti-chevron-down hist-chevron"></i>
            </div>
          </div>
          <div class="hist-card-body" id="hist-body-${escapeHtml(c.id)}">
            <div style="padding:12px 0; color:var(--cor-texto-mudo); text-align:center">
              <span class="spinner"></span> Carregando detalhes dos itens...
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Expande/recolhe card e busca detalhes via API
   */
  async toggleDetalhes(id) {
    const card = document.getElementById(`hist-card-${id}`);
    const body = document.getElementById(`hist-body-${id}`);
    if (!card || !body) return;

    const expandido = card.classList.contains('expanded');

    if (expandido) {
      card.classList.remove('expanded');
    } else {
      card.classList.add('expanded');

      // Buscar detalhes completos no backend
      const res = await API.get(`/contagens/${id}`);
      if (!res || !res.success || !res.data?.contagem) {
        body.innerHTML = '<div style="padding:10px; color:var(--cor-perigo)">Erro ao carregar itens da contagem.</div>';
        return;
      }

      const c = res.data.contagem;
      const pecas = c.tipo === 'pecas_queijo';
      const fornecedores = c.fornecedores || [];

      if (fornecedores.length === 0) {
        body.innerHTML = '<div style="padding:10px; color:var(--cor-texto-mudo)">Nenhum fornecedor registrado.</div>';
        return;
      }

      body.innerHTML = fornecedores.map(f => `
        <div class="grupo-fornecedor">
          <div class="grupo-header">
            <span><i class="ti ti-truck"></i> ${escapeHtml(f.fornecedor)}</span>
            <span class="badge ${c.status !== 'finalizada' ? 'badge-warning' : !pecas && f.tem_diferenca ? 'badge-danger' : 'badge-success'}">
              ${pecas ? `Peças de queijo · ${c.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}` : c.status !== 'finalizada' ? 'Em andamento' : f.tem_diferenca ? 'Com Divergência' : 'Sem Divergência'}
            </span>
          </div>
          <div class="grupo-body">
            ${(f.produtos || []).map(p => `
              <div class="grupo-produto">
                <div>
                  <strong>${escapeHtml(p.nome)}</strong>
                  <span style="color:var(--cor-texto-mudo); font-size:.8rem; margin-left:6px">SKU: ${escapeHtml(p.codigo)}</span>
                </div>
                <div style="display:flex; gap:12px; align-items:center; font-size:.8125rem">
                  ${!pecas && c.status === 'finalizada' ? `<span>Estoque: <strong>${p.estoque_referencia ?? '—'}</strong></span>` : ''}
                  <span>${pecas ? 'Quantidade de peças' : 'Físico'}: <strong>${p.quantidade_contada ?? '—'}</strong></span>
                  ${!pecas && c.status === 'finalizada' && Number(p.quantidade_vencida || 0) > 0 ? `<span>Vencidas: <strong>${Number(p.quantidade_vencida)}</strong></span><span>Baixa efetiva: <strong>${Number(p.quantidade_vencida_baixada || 0)}</strong></span><span>Estoque antes da baixa: <strong>${p.estoque_antes_baixa_vencidos ?? '—'}</strong></span><span>Saldo após a baixa: <strong>${p.estoque_antes_baixa_vencidos == null ? '—' : Number(p.estoque_antes_baixa_vencidos) - Number(p.quantidade_vencida_baixada || 0)}</strong></span>${Number(p.quantidade_vencida) > Number(p.quantidade_vencida_baixada || 0) ? `<span>Não descontadas: <strong>${Number(p.quantidade_vencida) - Number(p.quantidade_vencida_baixada || 0)}</strong></span>` : ''}` : ''}
                  ${!pecas && c.status === 'finalizada' ? `<span class="badge ${p.diferenca === 0 ? 'badge-neutral' : (p.diferenca > 0 ? 'badge-success' : 'badge-danger')}">
                    ${p.diferenca > 0 ? '+' : ''}${p.diferenca}
                  </span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    }
  },

  /**
   * Dispara o download da planilha Excel de divergências
   */
  async baixarExcel(id) {
    const res = await API.get(`/contagens/${encodeURIComponent(id)}`);
    if (!res?.success || res.data?.contagem?.tipo === 'pecas_queijo') return;
    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
    API.download(`/relatorios/contagens/${id}/excel`, `relatorio_divergencias_${dataAtual}.xlsx`);
  }
};
