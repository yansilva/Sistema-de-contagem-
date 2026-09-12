/**
 * Módulo de Importação de Estoque Atual via Relatório PDF do Tiny ERP
 * Fluxo em 2 etapas:
 * 1. Upload e Prévia (sem alterar o banco)
 * 2. Confirmação explícita pelo administrador
 */
const StockImport = {
  dadosPrevia: null,

  /**
   * Dispara o envio do arquivo PDF selecionado
   */
  async enviarPdf(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Por favor, selecione um arquivo no formato PDF.', 'error');
      inputEl.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('arquivo', file);

    const containerPrevia = document.getElementById('painel-previa-estoque');
    const containerHistorico = document.getElementById('painel-historico-estoque');
    if (containerPrevia) {
      containerPrevia.style.display = 'block';
      containerPrevia.innerHTML = `
        <div class="card" style="padding:24px; text-align:center">
          <span class="spinner" style="width:32px; height:32px; margin-bottom:12px"></span>
          <h4>Processando relatório PDF do Tiny...</h4>
          <p class="text-muted">Extraindo SKUs, quantidades e cruzando com o catálogo cadastrado.</p>
        </div>
      `;
    }

    const res = await API.upload('/estoque/upload-pdf', formData);
    inputEl.value = '';

    if (!res || !res.success) {
      if (containerPrevia) containerPrevia.style.display = 'none';
      showToast(res?.message || 'Falha ao processar arquivo PDF.', 'error');
      return;
    }

    this.dadosPrevia = res.data;
    this.renderizarPrevia();
  },

  /**
   * Renderiza os dados da prévia na tela
   */
  renderizarPrevia() {
    const container = document.getElementById('painel-previa-estoque');
    if (!container || !this.dadosPrevia) return;

    const {
      nome_arquivo,
      produtos_encontrados,
      produtos_correspondentes,
      skus_nao_encontrados_total,
      linhas_ignoradas,
      produtos_para_atualizar,
      skus_nao_encontrados
    } = this.dadosPrevia;

    const rowsAtualizacao = produtos_para_atualizar.map((p) => {
      const diff = p.estoque_novo - p.estoque_anterior;
      const diffBadge = diff > 0
        ? `<span class="badge badge-sucesso">+${diff}</span>`
        : (diff < 0 ? `<span class="badge badge-danger">${diff}</span>` : '<span class="badge badge-neutro">0</span>');

      return `
        <tr>
          <td><code>${escapeHtml(p.codigo)}</code></td>
          <td>${escapeHtml(p.nome)}</td>
          <td>${escapeHtml(p.fornecedor)}</td>
          <td style="text-align:center">${p.estoque_anterior}</td>
          <td style="text-align:center; font-weight:700">${p.estoque_novo}</td>
          <td style="text-align:center">${diffBadge}</td>
        </tr>
      `;
    }).join('');

    const rowsPendencias = skus_nao_encontrados.slice(0, 50).map((p) => `
      <tr>
        <td><code>${escapeHtml(p.codigo)}</code></td>
        <td>${escapeHtml(p.nome_relatorio || 'Item não identificado')}</td>
        <td style="text-align:center">${p.quantidade}</td>
        <td style="color:var(--cor-aviso)"><i class="ti ti-alert-triangle"></i> SKU não cadastrado na empresa</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="card" style="margin-bottom:20px; border-top:4px solid var(--cor-primaria)">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
          <div>
            <h3 style="margin:0; font-size:1.25rem"><i class="ti ti-file-analytics"></i> Prévia da Atualização de Estoque</h3>
            <p style="margin:4px 0 0 0; color:var(--cor-texto-mutado); font-size:0.875rem">Arquivo: <strong>${escapeHtml(nome_arquivo)}</strong></p>
          </div>
          <div style="display:flex; gap:8px">
            <button class="btn btn-outline" onclick="StockImport.cancelarPrevia()">Cancelar</button>
            <button class="btn btn-primary" id="btn-confirmar-estoque" onclick="StockImport.confirmarAtualizacao()">
              <i class="ti ti-check"></i> Confirmar Atualização (${produtos_correspondentes} produtos)
            </button>
          </div>
        </div>

        <!-- Cards de Métricas da Prévia -->
        <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom:20px">
          <div class="kpi-card kpi-indigo" style="padding:14px">
            <span class="kpi-title">Identificados no PDF</span>
            <div class="kpi-value" style="font-size:1.5rem">${produtos_encontrados}</div>
          </div>
          <div class="kpi-card kpi-emerald" style="padding:14px">
            <span class="kpi-title">Correspondentes no Sistema</span>
            <div class="kpi-value" style="font-size:1.5rem">${produtos_correspondentes}</div>
          </div>
          <div class="kpi-card kpi-amber" style="padding:14px">
            <span class="kpi-title">SKUs Não Cadastrados</span>
            <div class="kpi-value" style="font-size:1.5rem">${skus_nao_encontrados_total}</div>
          </div>
          <div class="kpi-card kpi-cyan" style="padding:14px">
            <span class="kpi-title">Linhas Ignoradas</span>
            <div class="kpi-value" style="font-size:1.5rem">${linhas_ignoradas}</div>
          </div>
        </div>

        <!-- Tabela de Produtos que Serão Atualizados -->
        <h4 style="margin:16px 0 8px 0"><i class="ti ti-refresh"></i> Produtos Prontos para Atualização</h4>
        <div style="max-height:300px; overflow-y:auto; border:1px solid var(--cor-borda); border-radius:6px; margin-bottom:16px">
          <table class="data-table" style="margin:0">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nome</th>
                <th>Produtor</th>
                <th style="text-align:center">Estoque Anterior</th>
                <th style="text-align:center">Novo Estoque (Tiny)</th>
                <th style="text-align:center">Variação</th>
              </tr>
            </thead>
            <tbody>
              ${rowsAtualizacao || '<tr><td colspan="6" style="text-align:center; padding:20px">Nenhum produto cadastrado correspondeu aos SKUs do PDF.</td></tr>'}
            </tbody>
          </table>
        </div>

        ${skus_nao_encontrados_total > 0 ? `
          <h4 style="margin:16px 0 8px 0; color:var(--cor-aviso)"><i class="ti ti-alert-triangle"></i> Pendências: SKUs Encontrados no PDF mas Não Cadastrados</h4>
          <p style="font-size:0.85rem; color:var(--cor-texto-mutado); margin-bottom:8px">
            Estes produtos foram encontrados no relatório do Tiny, mas não constam no cadastro do sistema. Eles <strong>NÃO</strong> serão adicionados automaticamente.
          </p>
          <div style="max-height:200px; overflow-y:auto; border:1px solid var(--cor-borda); border-radius:6px">
            <table class="data-table" style="margin:0">
              <thead>
                <tr>
                  <th>SKU Pendente</th>
                  <th>Descrição no Relatório</th>
                  <th style="text-align:center">Quantidade no PDF</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                ${rowsPendencias}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `;
  },

  cancelarPrevia() {
    this.dadosPrevia = null;
    const container = document.getElementById('painel-previa-estoque');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  },

  /**
   * Confirma a atualização do estoque no banco
   */
  async confirmarAtualizacao() {
    if (!this.dadosPrevia || !this.dadosPrevia.produtos_para_atualizar) return;

    const btn = document.getElementById('btn-confirmar-estoque');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Gravando alterações no banco...';
    }

    const payload = {
      nome_arquivo: this.dadosPrevia.nome_arquivo,
      produtos_encontrados: this.dadosPrevia.produtos_encontrados,
      linhas_ignoradas: this.dadosPrevia.linhas_ignoradas,
      skus_nao_encontrados: this.dadosPrevia.skus_nao_encontrados,
      atualizacoes: this.dadosPrevia.produtos_para_atualizar.map((p) => ({
        codigo: p.codigo,
        estoque_atual: p.estoque_novo
      }))
    };

    const res = await API.post('/estoque/confirmar-atualizacao', payload);

    if (!res || !res.success) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-check"></i> Confirmar Atualização';
      }
      showToast(res?.message || 'Erro ao confirmar atualização de estoque.', 'error');
      return;
    }

    showToast(res.message || 'Estoque atualizado com sucesso!', 'success');
    this.cancelarPrevia();
    this.carregarHistorico();

    // Recarrega lista de produtos se estiver visível
    if (typeof Produtos !== 'undefined' && Produtos.carregar) {
      Produtos.carregar();
    }
  },

  /**
   * Carrega o histórico de importações de estoque
   */
  async carregarHistorico() {
    const container = document.getElementById('lista-historico-estoque');
    if (!container) return;

    container.innerHTML = '<div class="loading"><span class="spinner"></span> Carregando histórico...</div>';

    const res = await API.get('/estoque/historico');
    if (!res || !res.success) {
      container.innerHTML = '<p class="text-muted">Não foi possível carregar o histórico de importações.</p>';
      return;
    }

    const lista = res.data.historico || [];
    if (lista.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-file-text" style="font-size:2rem; color:var(--cor-texto-mutado)"></i>
          <p>Nenhuma importação de estoque registrada até o momento.</p>
        </div>
      `;
      return;
    }

    const cards = lista.map((h) => {
      const dataFormatada = new Date(h.criado_em).toLocaleString('pt-BR');
      const skusPendentes = Array.isArray(h.skus_nao_encontrados)
        ? h.skus_nao_encontrados.length
        : 0;

      return `
        <div class="card" style="margin-bottom:12px; padding:16px">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <div>
              <strong style="font-size:1rem"><i class="ti ti-file-check" style="color:var(--cor-sucesso)"></i> ${escapeHtml(h.nome_arquivo)}</strong>
              <div style="font-size:0.8rem; color:var(--cor-texto-mutado)">
                Importado em ${dataFormatada} por <strong>${escapeHtml(h.usuario_nome || 'Administrador')}</strong>
              </div>
            </div>
            <span class="badge badge-sucesso"><i class="ti ti-check"></i> ${h.status}</span>
          </div>

          <div style="display:flex; gap:16px; margin-top:12px; font-size:0.875rem; color:var(--cor-texto)">
            <div><strong>${h.produtos_atualizados}</strong> produtos atualizados</div>
            <div><strong>${h.produtos_encontrados}</strong> encontrados no PDF</div>
            <div><strong style="color:var(--cor-aviso)">${skusPendentes}</strong> SKUs pendentes</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = cards;
  }
};
