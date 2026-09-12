/**
 * Módulo de Execução de Contagem Cega de Estoque e Conciliação
 *
 * REGRAS INEGOCIÁVEIS:
 * 1. Durante a contagem: funcionário NUNCA vê estoque Tiny, referência ou diferenças.
 * 2. Diferenciação de NULL (não contado) vs 0 (contado zero unidades fisicamente).
 * 3. Após finalização:
 *    - Funcionário vê SOMENTE produto, quantidade contada, diferença e situação.
 *    - Administrador visualiza auditoria completa com estoque de referência.
 */
const Contagens = {
  contagemId: null,
  fornecedoresLista: [],
  fornecedorAtual: null,
  itensFornecedor: [],
  produtoresConcluidos: new Set(),
  dadosSessao: null,

  /**
   * Inicia uma nova sessão de contagem cega com snapshot do estoque atual
   */
  async iniciarNovaSessao() {
    this.contagemId = null;
    this.fornecedorAtual = null;
    this.itensFornecedor = [];
    this.produtoresConcluidos.clear();
    this.dadosSessao = null;

    const res = await API.post('/contagens', {});
    if (!res || !res.success || !res.data?.contagem) {
      showToast(res?.message || 'Falha ao iniciar contagem no servidor.', 'error');
      return;
    }

    this.contagemId = res.data.contagem.id;
    await this.carregarDadosContagem();

    showToast('Sessão de contagem cega iniciada. O estoque de referência foi congelado.', 'info');
    showScreen('screen-contagem');
  },

  /**
   * Carrega os dados da contagem em andamento
   */
  async carregarDadosContagem() {
    if (!this.contagemId) return;

    const res = await API.get(`/contagens/${this.contagemId}`);
    if (!res || !res.success || !res.data?.contagem) return;

    this.dadosSessao = res.data.contagem;
    this.fornecedoresLista = (this.dadosSessao.fornecedores || []).map((f) => f.fornecedor);

    // Mapeia produtores que já possuem itens contados
    this.produtoresConcluidos.clear();
    (this.dadosSessao.fornecedores || []).forEach((f) => {
      const todosContados = (f.produtos || []).length > 0 &&
        (f.produtos || []).every((p) => p.quantidade_contada !== null && p.quantidade_contada !== undefined);
      if (todosContados) {
        this.produtoresConcluidos.add(f.fornecedor);
      }
    });

    this.atualizarBarraProgresso();
    this.renderizarListaProdutores();

    if (this.fornecedorAtual) {
      this.selecionarFornecedor(this.fornecedorAtual);
    }
  },

  /**
   * Atualiza indicador de progresso global da contagem
   */
  atualizarBarraProgresso() {
    if (!this.dadosSessao) return;

    let totalProdutos = 0;
    let totalContados = 0;

    (this.dadosSessao.fornecedores || []).forEach((f) => {
      (f.produtos || []).forEach((p) => {
        totalProdutos++;
        if (p.quantidade_contada !== null && p.quantidade_contada !== undefined) {
          totalContados++;
        }
      });
    });

    const progressoTexto = document.getElementById('progresso-contagem-texto');
    const progressoBarra = document.getElementById('progresso-contagem-barra');
    const btnFinalizar = document.getElementById('btn-finalizar-contagem');

    if (progressoTexto) {
      progressoTexto.textContent = `${totalContados} de ${totalProdutos} produtos contados`;
    }

    if (progressoBarra) {
      const perc = totalProdutos > 0 ? Math.round((totalContados / totalProdutos) * 100) : 0;
      progressoBarra.style.width = `${perc}%`;
    }

    if (btnFinalizar) {
      btnFinalizar.disabled = totalContados === 0;
    }
  },

  /**
   * Renderiza os cartões de produtores disponíveis na contagem
   */
  renderizarListaProdutores() {
    const container = document.getElementById('lista-produtores-cards');
    if (!container || !this.dadosSessao) return;

    const cards = (this.dadosSessao.fornecedores || []).map((f) => {
      const isAtivo = this.fornecedorAtual === f.fornecedor;
      const total = f.produtos?.length || 0;
      const contados = f.produtos?.filter((p) => p.quantidade_contada !== null && p.quantidade_contada !== undefined).length || 0;
      const concluido = total > 0 && contados === total;

      const badge = concluido
        ? '<span class="badge badge-sucesso"><i class="ti ti-check"></i> Concluído</span>'
        : (contados > 0 ? `<span class="badge badge-warning">${contados}/${total} contados</span>` : '<span class="badge badge-neutro">Não iniciado</span>');

      return `
        <div class="quick-card ${isAtivo ? 'selected' : ''}" style="cursor:pointer; padding:14px; border:2px solid ${isAtivo ? 'var(--cor-primaria)' : 'var(--cor-borda)'}" onclick="Contagens.selecionarFornecedor('${escapeHtml(f.fornecedor)}')">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <h4 style="margin:0; font-size:1rem"><i class="ti ti-truck"></i> ${escapeHtml(f.fornecedor)}</h4>
            ${badge}
          </div>
          <p style="margin:6px 0 0 0; font-size:0.8rem; color:var(--cor-texto-mutado)">${contados} de ${total} produtos com contagem física registrada</p>
        </div>
      `;
    }).join('');

    container.innerHTML = cards;
  },

  /**
   * Seleciona um produtor e exibe seus produtos para contagem cega
   */
  selecionarFornecedor(fornecedor) {
    this.fornecedorAtual = fornecedor;
    const bloco = document.getElementById('bloco-produtos-contagem');
    const titulo = document.getElementById('titulo-produtor-ativo');

    if (titulo) titulo.textContent = fornecedor;

    const fornObj = (this.dadosSessao?.fornecedores || []).find((f) => f.fornecedor === fornecedor);
    if (!fornObj || !fornObj.produtos || fornObj.produtos.length === 0) {
      if (bloco) bloco.style.display = 'none';
      return;
    }

    this.itensFornecedor = fornObj.produtos.map((p) => ({
      id: p.id,
      produto_id: p.produto_id,
      codigo: p.codigo,
      nome: p.nome,
      // Distinção: valor original pode ser null ou número
      quantidade_contada: p.quantidade_contada !== undefined ? p.quantidade_contada : null
    }));

    this.renderizarItensContagem();
    this.renderizarListaProdutores();
    if (bloco) bloco.style.display = 'block';
  },

  /**
   * Renderiza a lista de produtos do produtor selecionado (CONTAGEM CEGA)
   * NUNCA renderiza saldo do sistema, referência ou diferenças!
   */
  renderizarItensContagem() {
    const container = document.getElementById('lista-produtos-produtor');
    if (!container) return;

    container.innerHTML = this.itensFornecedor.map((p, index) => {
      const valorInput = p.quantidade_contada !== null && p.quantidade_contada !== undefined
        ? p.quantidade_contada
        : '';

      const statusItem = p.quantidade_contada !== null && p.quantidade_contada !== undefined
        ? `<span class="badge badge-sucesso"><i class="ti ti-check"></i> ${p.quantidade_contada} un</span>`
        : '<span class="badge badge-neutro">Pendente</span>';

      return `
        <div class="produto-item" id="item-contagem-${index}" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--cor-borda)">
          <div style="flex:1">
            <div style="font-weight:700; font-size:1rem; color:var(--cor-texto)">${escapeHtml(p.nome)}</div>
            <div style="font-size:0.8rem; color:var(--cor-texto-mutado)">SKU: <code>${escapeHtml(p.codigo)}</code> &bull; Produtor: <strong>${escapeHtml(this.fornecedorAtual)}</strong></div>
          </div>

          <div style="display:flex; align-items:center; gap:12px">
            <div>${statusItem}</div>
            <div style="width:130px">
              <label style="font-size:0.75rem; display:block; margin-bottom:2px; color:var(--cor-texto-mutado)">Qtd Física:</label>
              <input type="number" min="0" step="1"
                     placeholder="Não contado"
                     value="${valorInput}"
                     class="input-qtd-fisica"
                     oninput="Contagens.atualizarQuantidadeItem(${index}, this.value)">
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Atualiza a quantidade do item na memória
   * Vazio = null (não contado)
   * '0' ou número >= 0 = zero ou número contado
   */
  atualizarQuantidadeItem(index, valorStr) {
    const limpo = valorStr.trim();
    if (limpo === '') {
      this.itensFornecedor[index].quantidade_contada = null;
    } else {
      const num = parseInt(limpo, 10);
      this.itensFornecedor[index].quantidade_contada = isNaN(num) || num < 0 ? 0 : num;
    }
  },

  /**
   * Salva o progresso da contagem do produtor atual
   */
  async salvarProgressoAtual() {
    if (!this.fornecedorAtual) return;

    const btn = document.getElementById('btn-salvar-progresso-produtor');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Salvando...';
    }

    const payload = {
      fornecedor: this.fornecedorAtual,
      itens: this.itensFornecedor.map((p) => ({
        produto_id: p.produto_id,
        quantidade_contada: p.quantidade_contada
      }))
    };

    const res = await API.put(`/contagens/${this.contagemId}/salvar-progresso`, payload);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar Progresso Deste Produtor';
    }

    if (!res || !res.success) {
      showToast(res?.message || 'Erro ao salvar progresso.', 'error');
      return;
    }

    showToast(`Progresso salvo para ${this.fornecedorAtual}!`, 'success');
    await this.carregarDadosContagem();
  },

  /**
   * Finaliza a sessão de contagem cega
   */
  async finalizarSessao() {
    if (!this.contagemId) return;

    // Verificar se há itens não contados
    let totalNaoContados = 0;
    (this.dadosSessao?.fornecedores || []).forEach((f) => {
      (f.produtos || []).forEach((p) => {
        if (p.quantidade_contada === null || p.quantidade_contada === undefined) {
          totalNaoContados++;
        }
      });
    });

    let confirmMsg = 'Deseja realmente finalizar esta contagem?';
    if (totalNaoContados > 0) {
      confirmMsg = `Atenção: existem ${totalNaoContados} produto(s) ainda não contados (ficarão registrados como 0 unidades).\n\nDeseja confirmar a finalização da contagem e apurar as diferenças?`;
    }

    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('btn-finalizar-contagem');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Finalizando e apurando...';
    }

    const res = await API.put(`/contagens/${this.contagemId}/finalizar`, {});

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-flag-check"></i> Finalizar Contagem';
    }

    if (!res || !res.success) {
      showToast(res?.message || 'Erro ao finalizar contagem.', 'error');
      return;
    }

    showToast('Contagem finalizada! Diferenças calculadas.', 'success');
    this.exibirResultado(this.contagemId);
  },

  /**
   * Exibe tela de resultados adaptada estritamente ao perfil do usuário
   */
  async exibirResultado(contagemId) {
    const targetId = contagemId || this.contagemId;
    if (!targetId) return;

    const res = await API.get(`/contagens/${targetId}`);
    if (!res || !res.success || !res.data?.contagem) {
      showToast('Não foi possível carregar os resultados da contagem.', 'error');
      showScreen('screen-home');
      return;
    }

    const c = res.data.contagem;
    const isAdmin = Auth.usuario?.papel === 'administrador' || Auth.usuario?.papel === 'gestor' || Auth.usuario?.papel === 'admin';

    const cardEl = document.getElementById('resultado-status-card');
    const metricasEl = document.getElementById('resultado-metricas');
    const listaDivergenciasEl = document.getElementById('resultado-divergencias');

    const temDif = c.tem_diferenca;

    if (cardEl) {
      cardEl.className = `resultado-card ${temDif ? 'erro' : 'sucesso'}`;
      cardEl.innerHTML = `
        <i class="ti ${temDif ? 'ti-alert-triangle' : 'ti-circle-check'}"></i>
        <h2>${temDif ? 'Divergências Identificadas' : 'Estoque 100% Conciliado'}</h2>
        <p>${temDif
          ? 'Foram identificadas sobras ou faltas físicas em relação ao estoque registrado.'
          : 'A contagem física conferiu exatamente com o estoque registrado no sistema.'}
        </p>
        ${isAdmin ? `
          <button class="btn btn-primary" onclick="Contagens.baixarExcelDiferencas('${escapeHtml(c.id)}')">
            <i class="ti ti-file-spreadsheet"></i> Exportar Relatório Excel (.xlsx)
          </button>
        ` : ''}
      `;
    }

    // Apuração das métricas
    let totalItens = 0;
    let totalFaltas = 0;
    let totalSobras = 0;
    let totalIguais = 0;

    (c.fornecedores || []).forEach((f) => {
      (f.produtos || []).forEach((p) => {
        totalItens++;
        if (p.situacao === 'falta' || p.diferenca < 0) totalFaltas++;
        else if (p.situacao === 'sobra' || p.diferenca > 0) totalSobras++;
        else totalIguais++;
      });
    });

    if (metricasEl) {
      metricasEl.innerHTML = `
        <div class="metrica">
          <div class="metrica-valor">${c.fornecedores?.length || 0}</div>
          <div class="metrica-label">Produtores</div>
        </div>
        <div class="metrica">
          <div class="metrica-valor">${totalItens}</div>
          <div class="metrica-label">Itens Contados</div>
        </div>
        <div class="metrica">
          <div class="metrica-valor" style="color:var(--cor-perigo)">${totalFaltas}</div>
          <div class="metrica-label">Itens em Falta</div>
        </div>
        <div class="metrica">
          <div class="metrica-valor" style="color:var(--cor-aviso)">${totalSobras}</div>
          <div class="metrica-label">Itens com Sobra</div>
        </div>
        <div class="metrica">
          <div class="metrica-valor" style="color:var(--cor-sucesso)">${totalIguais}</div>
          <div class="metrica-label">Sem Diferença</div>
        </div>
      `;
    }

    // Renderização dos Itens (RESPEITANDO RBAC)
    if (listaDivergenciasEl) {
      const secoes = (c.fornecedores || []).map((f) => {
        const produtosHtml = (f.produtos || []).map((p) => {
          let badgeSituacao;
          if (p.diferenca === 0 || p.situacao === 'sem_diferenca') {
            badgeSituacao = '<span class="badge badge-sucesso"><i class="ti ti-check"></i> Sem diferença</span>';
          } else if (p.diferenca > 0 || p.situacao === 'sobra') {
            badgeSituacao = `<span class="badge badge-warning"><i class="ti ti-arrow-up"></i> Sobra de ${p.diferenca} un</span>`;
          } else {
            badgeSituacao = `<span class="badge badge-danger"><i class="ti ti-arrow-down"></i> Falta de ${Math.abs(p.diferenca)} un</span>`;
          }

          // Se for ADMINISTRADOR: mostra estoque de referência
          // Se for FUNCIONÁRIO: NUNCA mostra estoque de referência
          const colunaReferenciaAdmin = isAdmin
            ? `<span>Estoque Ref: <strong>${p.estoque_referencia !== undefined ? p.estoque_referencia : '-'}</strong></span>`
            : '';

          return `
            <div class="resultado-produto" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:1px solid var(--cor-borda)">
              <div class="info">
                <strong>${escapeHtml(p.nome)}</strong>
                <div style="font-size:0.8rem; color:var(--cor-texto-mutado)">SKU: <code>${escapeHtml(p.codigo)}</code></div>
              </div>

              <div class="valores" style="display:flex; align-items:center; gap:16px; font-size:0.875rem">
                ${colunaReferenciaAdmin}
                <span>Físico Contado: <strong>${p.quantidade_contada !== null ? p.quantidade_contada : 0}</strong></span>
                <div>${badgeSituacao}</div>
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="resultado-fornecedor" style="margin-bottom:16px; border:1px solid var(--cor-borda); border-radius:8px; overflow:hidden">
            <div class="resultado-fornecedor-header" style="background:var(--cor-fundo-cartao); padding:10px 14px; font-weight:700; display:flex; align-items:center; gap:8px">
              <i class="ti ti-truck" style="color:var(--cor-primaria)"></i>
              <span>${escapeHtml(f.fornecedor)}</span>
            </div>
            ${produtosHtml}
          </div>
        `;
      }).join('');

      listaDivergenciasEl.innerHTML = secoes;
    }

    showScreen('screen-resultado');
  },

  baixarExcelDiferencas(id) {
    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
    API.download(`/relatorios/contagens/${id}/excel`, `diferenca_estoque_${dataAtual}.xlsx`);
  }
};
