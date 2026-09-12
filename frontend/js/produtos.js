/**
 * Módulo de Gerenciamento de Produtos (Back-office)
 */
const Produtos = {
  paginaAtual: 1,
  limitePorPagina: 15,
  totalPaginas: 1,
  termoBusca: '',
  fornecedorFiltro: '',
  produtosCache: [],

  /**
   * Carrega produtos do backend com paginação e filtros
   */
  async carregar() {
    const params = new URLSearchParams({
      page: this.paginaAtual,
      limit: this.limitePorPagina,
      ...(this.termoBusca ? { search: this.termoBusca } : {}),
      ...(this.fornecedorFiltro ? { fornecedor: this.fornecedorFiltro } : {})
    });

    const res = await API.get(`/produtos?${params.toString()}`);
    const listaEl = document.getElementById('lista-produtos');
    const paginationEl = document.getElementById('produtos-pagination');

    if (!res || !res.success || !res.data) {
      if (listaEl) {
        listaEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--cor-texto-mutado)">Erro ao carregar produtos.</div>';
      }
      return;
    }

    const { produtos, pagination } = res.data;
    this.produtosCache = produtos;
    this.totalPaginas = pagination.totalPages;

    if (produtos.length === 0) {
      listaEl.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:var(--cor-texto-secundario)">
          <i class="ti ti-package-off" style="font-size:2.5rem; margin-bottom:8px; display:block"></i>
          Nenhum produto cadastrado ou encontrado com os filtros atuais.
        </div>
      `;
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    // Renderização segura com escapeHtml para prevenir XSS
    listaEl.innerHTML = produtos.map((p) => `
      <div class="produto-item" id="prod-card-${escapeHtml(p.id)}">
        <div class="produto-header">
          <div>
            <span class="produto-nome">${escapeHtml(p.nome)}</span>
            <div class="produto-codigo">
              SKU: <code>${escapeHtml(p.codigo)}</code> &bull; Produtor: <strong>${escapeHtml(p.fornecedor)}</strong> &bull; Estoque Atual: <strong style="color:var(--cor-primaria)">${p.estoque_atual !== undefined ? p.estoque_atual : 0} un</strong>
            </div>
          </div>
          <div style="display:flex; gap:6px">
            <button class="btn btn-outline btn-sm" onclick="Produtos.abrirEdicao('${escapeHtml(p.id)}')">
              <i class="ti ti-edit"></i> Editar
            </button>
            <button class="btn btn-danger btn-sm" onclick="Produtos.remover('${escapeHtml(p.id)}')">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Atualizar barra de paginação
    if (paginationEl) {
      paginationEl.style.display = 'flex';
      const infoEl = document.getElementById('paginacao-info');
      const btnAnt = document.getElementById('btn-pag-anterior');
      const btnProx = document.getElementById('btn-pag-proxima');

      if (infoEl) infoEl.textContent = `Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} produtos)`;
      if (btnAnt) btnAnt.disabled = pagination.page <= 1;
      if (btnProx) btnProx.disabled = pagination.page >= pagination.totalPages;
    }
  },

  mudarPagina(direcao) {
    this.paginaAtual += direcao;
    if (this.paginaAtual < 1) this.paginaAtual = 1;
    if (this.paginaAtual > this.totalPaginas) this.paginaAtual = this.totalPaginas;
    this.carregar();
  },

  aplicarFiltroBusca(termo) {
    this.termoBusca = termo.trim();
    this.paginaAtual = 1;
    this.carregar();
  },

  /**
   * Salva produto novo ou editado
   */
  async salvar() {
    const id = document.getElementById('prod-id').value;
    const codigo = document.getElementById('prod-codigo').value.trim();
    const nome = document.getElementById('prod-nome').value.trim();
    const fornecedor = document.getElementById('prod-fornecedor').value.trim();
    const estoque_atual = parseInt(document.getElementById('prod-estoque-atual').value, 10) || 0;

    if (!codigo || !nome || !fornecedor) {
      showToast('Preencha código/SKU, nome e produtor/fornecedor.', 'error');
      return;
    }

    let res;
    if (id) {
      res = await API.put(`/produtos/${id}`, { codigo, nome, fornecedor, estoque_atual });
    } else {
      res = await API.post('/produtos', { codigo, nome, fornecedor, estoque_atual });
    }

    if (!res || !res.success) {
      showToast(res?.message || 'Erro ao salvar produto.', 'error');
      return;
    }

    showToast(id ? 'Produto atualizado!' : 'Produto cadastrado com sucesso!', 'success');
    this.fecharModal();
    this.carregar();
  },

  abrirNovo() {
    document.getElementById('modal-produto-titulo').textContent = 'Novo Produto';
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-codigo').value = '';
    document.getElementById('prod-nome').value = '';
    document.getElementById('prod-fornecedor').value = '';
    document.getElementById('prod-estoque-atual').value = '0';
    document.getElementById('modal-produto').style.display = 'flex';
  },

  abrirEdicao(id) {
    const p = this.produtosCache.find((item) => item.id === id);
    if (!p) return;

    document.getElementById('modal-produto-titulo').textContent = 'Editar Produto';
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-codigo').value = p.codigo;
    document.getElementById('prod-nome').value = p.nome;
    document.getElementById('prod-fornecedor').value = p.fornecedor;
    document.getElementById('prod-estoque-atual').value = p.estoque_atual !== undefined ? p.estoque_atual : 0;
    document.getElementById('modal-produto').style.display = 'flex';
  },

  fecharModal() {
    const modal = document.getElementById('modal-produto');
    if (modal) modal.style.display = 'none';
  },

  /**
   * Desativa produto (soft delete)
   */
  async remover(id) {
    if (!confirm('Deseja realmente desativar este produto do catálogo?')) return;

    const res = await API.delete(`/produtos/${id}`);
    if (res && res.success) {
      showToast('Produto desativado com sucesso.', 'success');
      this.carregar();
    } else {
      showToast(res?.message || 'Erro ao desativar produto.', 'error');
    }
  },

  /**
   * Importação de catálogo Excel (.xlsx)
   */
  async importarExcel(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet);

        if (rows.length === 0) {
          showToast('A planilha selecionada está vazia.', 'error');
          return;
        }

        // Mapeamento dinâmico de colunas
        const produtosValidados = [];
        for (const row of rows) {
          const keys = Object.keys(row);
          const colCodigo = keys.find((k) => /codigo|código|sku/i.test(k));
          const colNome = keys.find((k) => /nome|produto|descri/i.test(k));
          const colFornecedor = keys.find((k) => /fornecedor|produtor|marca/i.test(k));
          const colEstoque = keys.find((k) => /estoque|saldo|qtd/i.test(k));

          const codigo = colCodigo ? String(row[colCodigo]).trim() : '';
          const nome = colNome ? String(row[colNome]).trim() : '';
          const fornecedor = colFornecedor ? String(row[colFornecedor]).trim() : '';
          const estoque_atual = colEstoque ? parseInt(row[colEstoque], 10) || 0 : 0;

          if (codigo && nome && fornecedor) {
            produtosValidados.push({ codigo, nome, fornecedor, estoque_atual });
          }
        }

        if (produtosValidados.length === 0) {
          showToast('Não foi possível identificar as colunas (Código, Nome, Fornecedor) na planilha.', 'error');
          return;
        }

        const modoSubstituir = confirm(
          `Foram identificados ${produtosValidados.length} produtos válidos na planilha.\n\n` +
          `Deseja SUBSTITUIR todo o catálogo existente?\n\n` +
          `[OK] = Substituir catálogo completo\n` +
          `[Cancelar] = Mesclar/Atualizar sem excluir os outros produtos`
        );

        const modo = modoSubstituir ? 'substituir' : 'mesclar';

        showToast(`Importando ${produtosValidados.length} produto(s)...`, 'info');
        const res = await API.post('/produtos/importar', {
          modo,
          produtos: produtosValidados
        });

        if (res && res.success) {
          showToast(`Sucesso: ${res.message}`, 'success');
          this.carregar();
        } else {
          showToast(res?.message || 'Falha ao importar produtos.', 'error');
        }
      } catch (err) {
        console.error('Erro na leitura do Excel:', err);
        showToast('Erro ao processar o arquivo Excel.', 'error');
      } finally {
        fileInput.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  }
};
