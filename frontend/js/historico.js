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
            Nenhuma sessão de contagem finalizada até o momento.
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
      const temDif = c.tem_diferenca;
      const statusIcon = temDif ? 'ti-alert-triangle' : 'ti-circle-check';
      const statusColor = temDif ? 'var(--cor-perigo)' : 'var(--cor-sucesso)';
      const statusTexto = temDif ? 'Divergências Encontradas' : 'Conciliado 100%';
      const badgeClass = temDif ? 'badge-danger' : 'badge-success';

      const fornecedores = Array.isArray(c.fornecedores) ? c.fornecedores : [];

      return `
        <div class="hist-card" id="hist-card-${escapeHtml(c.id)}">
          <div class="hist-card-header" onclick="Historico.toggleDetalhes('${escapeHtml(c.id)}')">
            <i class="ti ${statusIcon} status-icon" style="color:${statusColor}"></i>
            <div class="hist-card-info">
              <div class="data">${dataFormatada}</div>
              <div class="resumo">
                Iniciado por: <strong>${escapeHtml(c.iniciado_por_nome || 'Usuário')}</strong> • 
                <span class="badge ${badgeClass}">${statusTexto}</span>
              </div>
              <div class="hist-chips">
                ${fornecedores.map(f => `
                  <span class="hist-chip">
                    ${escapeHtml(f.fornecedor)} ${f.tem_diferenca ? '⚠️' : '✓'}
                  </span>
                `).join('')}
              </div>
            </div>
            <div class="hist-actions">
              ${temDif ? `
                <button class="btn btn-outline btn-sm" title="Baixar relatório Excel"
                        onclick="event.stopPropagation(); Historico.baixarExcel('${escapeHtml(c.id)}')">
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
      const fornecedores = c.fornecedores || [];

      if (fornecedores.length === 0) {
        body.innerHTML = '<div style="padding:10px; color:var(--cor-texto-mudo)">Nenhum fornecedor registrado.</div>';
        return;
      }

      body.innerHTML = fornecedores.map(f => `
        <div class="grupo-fornecedor">
          <div class="grupo-header">
            <span><i class="ti ti-truck"></i> ${escapeHtml(f.fornecedor)}</span>
            <span class="badge ${f.tem_diferenca ? 'badge-danger' : 'badge-success'}">
              ${f.tem_diferenca ? 'Com Divergência' : 'Sem Divergência'}
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
                  <span>Tiny: <strong>${p.qty_tiny}</strong></span>
                  <span>Físico: <strong>${p.qty_contagem}</strong></span>
                  <span class="badge ${p.diferenca === 0 ? 'badge-neutral' : (p.diferenca > 0 ? 'badge-success' : 'badge-danger')}">
                    ${p.diferenca > 0 ? '+' : ''}${p.diferenca}
                  </span>
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
  baixarExcel(id) {
    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
    API.download(`/relatorios/contagens/${id}/excel`, `relatorio_divergencias_${dataAtual}.xlsx`);
  }
};
