/**
 * Módulo de Execução de Contagem de Estoque e Conciliação
 */
const Contagens = {
  contagemId: null,
  fornecedoresLista: [],
  fornecedorAtual: null,
  itensFornecedor: [],
  fornecedoresContadosSessao: [],
  contagemTeveDiferencaGlobal: false,

  /**
   * Inicia uma nova sessão de contagem
   */
  async iniciarNovaSessao() {
    this.contagemId = null;
    this.fornecedorAtual = null;
    this.itensFornecedor = [];
    this.fornecedoresContadosSessao = [];
    this.contagemTeveDiferencaGlobal = false;

    // Inicia contagem no backend
    const res = await API.post('/contagens', {});
    if (res && res.success && res.data?.contagem) {
      this.contagemId = res.data.contagem.id;
    } else {
      showToast('Falha ao iniciar contagem no servidor.', 'error');
      return;
    }

    // Carrega fornecedores disponíveis
    await this.carregarFornecedores();

    this.limparFormulario();
    this.renderizarFornecedoresContados();
    showScreen('screen-contagem');
  },

  /**
   * Busca fornecedores únicos com produtos cadastrados
   */
  async carregarFornecedores() {
    const res = await API.get('/produtos/fornecedores');
    if (res && res.success && res.data?.fornecedores) {
      this.fornecedoresLista = res.data.fornecedores;
    } else {
      this.fornecedoresLista = [];
    }
  },

  /**
   * Filtra fornecedores para sugestão ao digitar
   */
  filtrarSugestoes(termo) {
    const box = document.getElementById('sugestoes-fornecedor');
    if (!box) return;

    const texto = termo.trim().toLowerCase();
    if (!texto) {
      box.classList.remove('show');
      return;
    }

    const disponiveis = this.fornecedoresLista.filter(
      f => f.toLowerCase().includes(texto) && !this.fornecedoresContadosSessao.includes(f)
    );

    if (disponiveis.length === 0) {
      box.innerHTML = '<div style="padding:10px 14px; color:var(--cor-texto-mudo); font-size:.85rem">Nenhum fornecedor encontrado ou já contado.</div>';
      box.classList.add('show');
      return;
    }

    box.innerHTML = disponiveis.map(f => `
      <div class="sugestao-item" onclick="Contagens.selecionarFornecedor('${escapeHtml(f)}')">
        <i class="ti ti-truck"></i> ${escapeHtml(f)}
      </div>
    `).join('');
    box.classList.add('show');
  },

  /**
   * Seleciona fornecedor e carrega seus produtos para contagem
   */
  async selecionarFornecedor(fornecedor) {
    this.fornecedorAtual = fornecedor;
    const inputBusca = document.getElementById('busca-fornecedor');
    if (inputBusca) inputBusca.value = fornecedor;

    const box = document.getElementById('sugestoes-fornecedor');
    if (box) box.classList.remove('show');

    // Carregar produtos deste fornecedor
    const res = await API.get(`/produtos?fornecedor=${encodeURIComponent(fornecedor)}&limit=100`);
    const bloco = document.getElementById('bloco-produtos');
    const container = document.getElementById('lista-produtos-contagem');
    const checkSemDif = document.getElementById('check-sem-diferenca');

    if (!res || !res.success || !res.data?.produtos || res.data.produtos.length === 0) {
      showToast(`Nenhum produto cadastrado para ${fornecedor}.`, 'error');
      if (bloco) bloco.classList.remove('show');
      return;
    }

    this.itensFornecedor = res.data.produtos.map(p => ({
      produto_id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      qty_tiny: 0,
      qty_contagem: 0,
      diferenca: 0,
      sem_diferenca: true
    }));

    if (checkSemDif) {
      checkSemDif.checked = true;
      document.getElementById('row-sem-dif')?.classList.remove('com-dif');
    }

    this.renderizarItensContagem();
    if (bloco) bloco.classList.add('show');
  },

  /**
   * Alterna modo sem diferença global para o fornecedor
   */
  toggleSemDiferenca(checked) {
    const row = document.getElementById('row-sem-dif');
    if (row) {
      if (checked) row.classList.remove('com-dif');
      else row.classList.add('com-dif');
    }

    this.itensFornecedor.forEach(item => {
      item.sem_diferenca = checked;
    });

    const camposList = document.querySelectorAll('.produto-campos');
    camposList.forEach(c => {
      if (checked) c.classList.add('hidden');
      else c.classList.remove('hidden');
    });
  },

  /**
   * Renderiza a lista de produtos com campos de quantidade
   */
  renderizarItensContagem() {
    const container = document.getElementById('lista-produtos-contagem');
    if (!container) return;

    const semDifGlobal = document.getElementById('check-sem-diferenca')?.checked ?? true;

    container.innerHTML = this.itensFornecedor.map((p, index) => `
      <div class="produto-item" id="item-contagem-${index}">
        <div class="produto-header">
          <div>
            <div class="produto-nome">${escapeHtml(p.nome)}</div>
            <div class="produto-codigo">SKU: ${escapeHtml(p.codigo)}</div>
          </div>
        </div>
        <div class="produto-campos ${semDifGlobal ? 'hidden' : ''}">
          <div class="form-group" style="margin-bottom:0">
            <div class="campo-label">Saldo Sistema (Tiny)</div>
            <input type="number" value="${p.qty_tiny}" min="0"
                   oninput="Contagens.atualizarQtd(${index}, 'qty_tiny', this.value)">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <div class="campo-label">Contagem Física</div>
            <input type="number" value="${p.qty_contagem}" min="0"
                   oninput="Contagens.atualizarQtd(${index}, 'qty_contagem', this.value)">
          </div>
          <div class="diff-badge ${this.getBadgeClass(p.diferenca)}" id="badge-diff-${index}">
            ${p.diferenca > 0 ? '+' : ''}${p.diferenca}
          </div>
        </div>
      </div>
    `).join('');
  },

  getBadgeClass(diff) {
    if (diff < 0) return 'badge-danger';
    if (diff > 0) return 'badge-success';
    return 'badge-neutral';
  },

  /**
   * Atualiza quantidades e recalcula diferença em tempo real
   */
  atualizarQtd(index, campo, valor) {
    const num = parseInt(valor, 10) || 0;
    this.itensFornecedor[index][campo] = num;

    const diff = this.itensFornecedor[index].qty_contagem - this.itensFornecedor[index].qty_tiny;
    this.itensFornecedor[index].diferenca = diff;
    this.itensFornecedor[index].sem_diferenca = (diff === 0);

    const badge = document.getElementById(`badge-diff-${index}`);
    if (badge) {
      badge.className = `diff-badge ${this.getBadgeClass(diff)}`;
      badge.textContent = `${diff > 0 ? '+' : ''}${diff}`;
    }
  },

  /**
   * Salva contagem do fornecedor atual no backend
   */
  async salvarFornecedor() {
    if (!this.fornecedorAtual) {
      showToast('Selecione um fornecedor para registrar.', 'error');
      return;
    }

    const semDifGlobal = document.getElementById('check-sem-diferenca')?.checked ?? true;
    let temDiferenca = false;

    if (!semDifGlobal) {
      temDiferenca = this.itensFornecedor.some(i => i.diferenca !== 0);
    } else {
      // Sem divergência: zera todas as diferenças
      this.itensFornecedor.forEach(i => {
        i.diferenca = 0;
        i.sem_diferenca = true;
      });
    }

    if (temDiferenca) {
      this.contagemTeveDiferencaGlobal = true;
    }

    const btn = document.getElementById('btn-salvar-fornecedor');
    if (btn) btn.disabled = true;

    try {
      const res = await API.post(`/contagens/${this.contagemId}/fornecedor`, {
        fornecedor: this.fornecedorAtual,
        tem_diferenca: temDiferenca,
        produtos: this.itensFornecedor
      });

      if (!res || !res.success) {
        showToast(res?.message || 'Erro ao registrar fornecedor.', 'error');
        return;
      }

      this.fornecedoresContadosSessao.push(this.fornecedorAtual);
      showToast(`Fornecedor ${this.fornecedorAtual} registrado com sucesso!`, 'success');

      this.limparFormulario();
      this.renderizarFornecedoresContados();
    } catch (err) {
      showToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  limparFormulario() {
    this.fornecedorAtual = null;
    this.itensFornecedor = [];
    const input = document.getElementById('busca-fornecedor');
    if (input) input.value = '';
    const bloco = document.getElementById('bloco-produtos');
    if (bloco) bloco.classList.remove('show');
  },

  /**
   * Renderiza chips de fornecedores já contados na sessão
   */
  renderizarFornecedoresContados() {
    const container = document.getElementById('lista-fornecedores-contados');
    const totalEl = document.getElementById('total-fornecedores-contados');
    const btnFinalizar = document.getElementById('btn-finalizar-contagem');

    if (totalEl) totalEl.textContent = this.fornecedoresContadosSessao.length;

    if (!container) return;

    if (this.fornecedoresContadosSessao.length === 0) {
      container.innerHTML = '<div style="color:var(--cor-texto-mudo); font-size:.85rem">Nenhum fornecedor contado até o momento nesta sessão.</div>';
      if (btnFinalizar) btnFinalizar.disabled = true;
      return;
    }

    if (btnFinalizar) btnFinalizar.disabled = false;

    container.innerHTML = this.fornecedoresContadosSessao.map(f => `
      <div class="fornecedor-contado">
        <i class="ti ti-circle-check" style="color:var(--cor-sucesso)"></i>
        <span class="nome">${escapeHtml(f)}</span>
        <span class="badge badge-success">Contado</span>
      </div>
    `).join('');
  },

  /**
   * Finaliza sessão completa de contagem e abre tela de resultado
   */
  async finalizarSessao() {
    if (this.fornecedoresContadosSessao.length === 0) {
      showToast('Registre ao menos um fornecedor antes de finalizar.', 'error');
      return;
    }

    if (!confirm('Deseja realmente finalizar esta sessão de contagem de estoque?')) return;

    const res = await API.put(`/contagens/${this.contagemId}/finalizar`, {});
    if (!res || !res.success) {
      showToast(res?.message || 'Erro ao finalizar contagem.', 'error');
      return;
    }

    showToast('Sessão de contagem finalizada com sucesso!', 'success');
    this.exibirResultado();
  },

  /**
   * Exibe tela de resultado com opção de exportar relatório Excel
   */
  async exibirResultado() {
    const res = await API.get(`/contagens/${this.contagemId}`);
    if (!res || !res.success || !res.data?.contagem) {
      showScreen('screen-home');
      return;
    }

    const c = res.data.contagem;
    const cardEl = document.getElementById('resultado-status-card');
    const metricasEl = document.getElementById('resultado-metricas');
    const listaDivergenciasEl = document.getElementById('resultado-divergencias');

    const temDif = c.tem_diferenca;

    if (cardEl) {
      cardEl.className = `resultado-card ${temDif ? 'erro' : 'sucesso'}`;
      cardEl.innerHTML = `
        <i class="ti ${temDif ? 'ti-alert-triangle' : 'ti-circle-check'}"></i>
        <h2>${temDif ? 'Divergências Encontradas' : 'Estoque 100% Conciliado'}</h2>
        <p>${temDif
          ? 'Foram identificadas divergências entre o saldo físico e o sistema.'
          : 'Todos os itens contados conferem perfeitamente com os registros do sistema.'}
        </p>
        ${temDif ? `
          <button class="btn btn-primary" onclick="Contagens.baixarExcelDiferencas('${escapeHtml(c.id)}')">
            <i class="ti ti-file-spreadsheet"></i> Baixar Relatório Excel (.xlsx)
          </button>
        ` : ''}
      `;
    }

    // Métricas
    const totalForn = c.fornecedores?.length || 0;
    let totalItens = 0;
    let itensComDif = 0;

    c.fornecedores?.forEach(f => {
      totalItens += f.produtos?.length || 0;
      itensComDif += f.produtos?.filter(p => !p.sem_diferenca && p.diferenca !== 0).length || 0;
    });

    if (metricasEl) {
      metricasEl.innerHTML = `
        <div class="metrica">
          <div class="metrica-valor">${totalForn}</div>
          <div class="metrica-label">Fornecedores</div>
        </div>
        <div class="metrica">
          <div class="metrica-valor">${totalItens}</div>
          <div class="metrica-label">Itens Verificados</div>
        </div>
        <div class="metrica">
          <div class="metrica-valor" style="color:${temDif ? 'var(--cor-perigo)' : 'var(--cor-sucesso)'}">${itensComDif}</div>
          <div class="metrica-label">Com Divergência</div>
        </div>
      `;
    }

    // Lista de fornecedores com divergência
    if (listaDivergenciasEl) {
      if (!temDif) {
        listaDivergenciasEl.innerHTML = '';
      } else {
        listaDivergenciasEl.innerHTML = c.fornecedores
          .filter(f => f.tem_diferenca)
          .map(f => `
            <div class="resultado-fornecedor">
              <div class="resultado-fornecedor-header">
                <i class="ti ti-truck" style="color:var(--cor-primaria)"></i>
                <span>${escapeHtml(f.fornecedor)}</span>
              </div>
              ${f.produtos.filter(p => !p.sem_diferenca && p.diferenca !== 0).map(p => `
                <div class="resultado-produto">
                  <div class="info">
                    <strong>${escapeHtml(p.nome)}</strong>
                    <div style="font-size:.75rem; color:var(--cor-texto-mudo)">Código: ${escapeHtml(p.codigo)}</div>
                  </div>
                  <div class="valores">
                    <span>Tiny: ${p.qty_tiny}</span>
                    <span>Contado: ${p.qty_contagem}</span>
                    <span class="badge ${p.diferenca > 0 ? 'badge-success' : 'badge-danger'}">
                      ${p.diferenca > 0 ? '+' : ''}${p.diferenca}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          `).join('');
      }
    }

    showScreen('screen-resultado');
  },

  baixarExcelDiferencas(id) {
    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
    API.download(`/relatorios/contagens/${id}/excel`, `diferenca_estoque_${dataAtual}.xlsx`);
  }
};
