/**
 * Módulo de Gerenciamento de Produtos (Back-office)
 */
const Produtos = {
  paginaAtual: 1,
  limitePorPagina: 15,
  totalPaginas: 1,
  termoBusca: '',
  fornecedorFiltro: '',
  pecasFiltro: '',
  produtosCache: [],
  _leitorExcelPromise: null,

  carregarLeitorExcel() {
    if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
    if (this._leitorExcelPromise) return this._leitorExcelPromise;

    this._leitorExcelPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.onload = () => {
        if (globalThis.XLSX) {
          resolve(globalThis.XLSX);
          return;
        }
        this._leitorExcelPromise = null;
        reject(new Error('Não foi possível carregar o leitor de Excel.'));
      };
      script.onerror = () => {
        script.remove?.();
        this._leitorExcelPromise = null;
        reject(new Error('Não foi possível carregar o leitor de Excel.'));
      };
      document.head.appendChild(script);
    });

    return this._leitorExcelPromise;
  },

  /**
   * Carrega produtos do backend com paginação e filtros
   */
  async carregar() {
    const params = new URLSearchParams({
      page: this.paginaAtual,
      limit: this.limitePorPagina,
      ...(this.pecasFiltro !== '' ? { contagem_em_pecas: this.pecasFiltro } : {}),
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

    // Atualiza KPIs do backoffice de forma reativa
    if (typeof carregarBackofficeKPIs === 'function' && typeof Auth !== 'undefined' && Auth.isAdmin()) {
      carregarBackofficeKPIs(true);
    }

    if (produtos.length === 0) {
      const comFiltro = Boolean(this.termoBusca || this.fornecedorFiltro || this.pecasFiltro !== '');
      listaEl.innerHTML = comFiltro ? `
        <div style="text-align:center; padding:40px 20px; color:var(--cor-texto-secundario)">
          <i class="ti ti-package-off" style="font-size:2.5rem; margin-bottom:8px; display:block"></i>
          <p style="margin:0 0 12px">Nenhum resultado para os filtros atuais.</p>
          <button type="button" class="btn btn-outline btn-sm" id="produtos-limpar-filtros">Limpar filtros</button>
        </div>
      ` : `
        <div style="text-align:center; padding:40px 20px; color:var(--cor-texto-secundario)">
          <i class="ti ti-package-off" style="font-size:2.5rem; margin-bottom:8px; display:block"></i>
          <p style="margin:0 0 12px">Nenhum produto cadastrado ainda. Cadastre um produto ou importe sua planilha.</p>
          <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap">
            <label class="btn btn-outline btn-sm">
              <i class="ti ti-file-upload"></i> Importar Excel (.xlsx)
              <input type="file" class="sr-only" accept=".xlsx,.xls" data-change="action-47">
            </label>
            <button type="button" class="btn btn-primary btn-sm" data-click="action-48">
              <i class="ti ti-plus"></i> Novo Produto
            </button>
          </div>
        </div>
      `;
      document.getElementById('produtos-limpar-filtros')?.addEventListener('click', () => this.limparFiltros());
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    // Renderização segura com escapeHtml para prevenir XSS
    listaEl.innerHTML = produtos.map((p) => `
      <div class="produto-item" id="prod-card-${escapeHtml(p.id)}">
        <div class="produto-header">
          <div>
            <span class="produto-nome">${escapeHtml(p.nome)}</span> ${p.contagem_em_pecas ? '<span class="badge badge-info">Peças de queijo</span>' : ''}
            <div class="produto-codigo">
              SKU: <code>${escapeHtml(p.codigo)}</code> &bull; Produtor: <strong>${escapeHtml(p.fornecedor)}</strong> &bull; Estoque Atual: <strong style="color:var(--cor-primaria)">${p.estoque_atual !== undefined ? p.estoque_atual : 0} ${p.contagem_em_pecas ? 'kg (ERP)' : 'un'}</strong>
            </div>
          </div>
          <div style="display:flex; gap:6px">
            <button class="btn btn-outline btn-sm" data-click="action-78" data-arg-0="${escapeHtml(p.id)}">
              <i class="ti ti-edit"></i> Editar
            </button>
            <button class="btn btn-ghost btn-sm btn-trash" data-click="action-79" data-arg-0="${escapeHtml(p.id)}" aria-label="Desativar produto" title="Desativar produto">
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

      if (infoEl) infoEl.textContent = `Página ${pagination.page} de ${pagination.totalPages} (${pluralizar(pagination.total, 'produto')})`;
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

  limparFiltros() {
    this.termoBusca = '';
    this.fornecedorFiltro = '';
    this.pecasFiltro = '';
    this.paginaAtual = 1;
    const busca = document.getElementById('filtro-busca-produto');
    if (busca) busca.value = '';
    const pecas = document.getElementById('produto-filtro-pecas');
    if (pecas) pecas.value = '';
    return this.carregar();
  },

  aplicarFiltroBusca(termo) {
    this.termoBusca = termo.trim();
    this.paginaAtual = 1;
    this.carregar();
  },

  /**
   * Salva produto novo ou editado
   */
  filtrarPecas(valor) {
    this.pecasFiltro = valor;
    this.paginaAtual = 1;
    return this.carregar();
  },

  async salvar() {
    const contagem_em_pecas = document.getElementById('prod-contagem-em-pecas').checked;
    const id = document.getElementById('prod-id').value;
    const codigo = document.getElementById('prod-codigo').value.trim();
    const nome = document.getElementById('prod-nome').value.trim();
    const fornecedor = document.getElementById('prod-fornecedor').value.trim();
    const estoque_atual = parseInt(document.getElementById('prod-estoque-atual').value, 10) || 0;

    const valido = validarCampos([
      [document.getElementById('prod-codigo'), 'Informe o código ou SKU.', !codigo],
      [document.getElementById('prod-nome'), 'Informe o nome do produto.', !nome],
      [document.getElementById('prod-fornecedor'), 'Informe o produtor ou fornecedor.', !fornecedor]
    ]);
    if (!valido) return;

    let res;
    if (id) {
      res = await API.put(`/produtos/${id}`, { codigo, nome, fornecedor, estoque_atual, contagem_em_pecas });
    } else {
      res = await API.post('/produtos', { codigo, nome, fornecedor, estoque_atual, contagem_em_pecas });
    }

    if (!res || !res.success) {
      const campoCodigo = document.getElementById('prod-codigo');
      if (res?.code === 'CODIGO_DUPLICADO' || res?.code === 'DUPLICIDADE_REGISTRO' || /j[áa] (existe|cadastrad)/i.test(res?.message || '')) {
        marcarErroCampo(campoCodigo, res?.message && !/^Registro duplicado/i.test(res.message) ? res.message : 'Este código ou SKU já existe.');
        campoCodigo.focus();
      } else {
        aplicarErrosServidor(res, { codigo: campoCodigo, nome: document.getElementById('prod-nome'), fornecedor: document.getElementById('prod-fornecedor') });
      }
      showToast(res?.message || 'Erro ao salvar produto.', 'error');
      return;
    }

    showToast(id ? 'Produto atualizado!' : 'Produto cadastrado com sucesso!', 'success');
    this.fecharModal();
    this.carregar();
  },

  abrirNovo() {
    document.getElementById('modal-produto-titulo').textContent = 'Novo Produto';
    document.getElementById('prod-contagem-em-pecas').checked = false;
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-codigo').value = '';
    document.getElementById('prod-nome').value = '';
    document.getElementById('prod-fornecedor').value = '';
    document.getElementById('prod-estoque-atual').value = '0';
    ['prod-codigo', 'prod-nome', 'prod-fornecedor'].forEach((i) => limparErroCampo(document.getElementById(i)));
    document.getElementById('modal-produto').style.display = 'flex';
  },

  abrirEdicao(id) {
    const p = this.produtosCache.find((item) => item.id === id);
    if (!p) return;

    document.getElementById('modal-produto-titulo').textContent = 'Editar Produto';
    document.getElementById('prod-contagem-em-pecas').checked = Boolean(p.contagem_em_pecas);
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-codigo').value = p.codigo;
    document.getElementById('prod-nome').value = p.nome;
    document.getElementById('prod-fornecedor').value = p.fornecedor;
    document.getElementById('prod-estoque-atual').value = p.estoque_atual !== undefined ? p.estoque_atual : 0;
    ['prod-codigo', 'prod-nome', 'prod-fornecedor'].forEach((i) => limparErroCampo(document.getElementById(i)));
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
    const confirmado = await confirmarAcao({
      titulo: 'Desativar produto?',
      mensagem: 'O produto sairá do catálogo ativo e não aparecerá nas próximas contagens. O histórico é mantido.',
      confirmar: 'Desativar produto',
      perigo: true
    });
    if (!confirmado) return;

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

    let leitorExcel;
    try {
      leitorExcel = await this.carregarLeitorExcel();
    } catch {
      fileInput.value = '';
      showToast('Não foi possível carregar o leitor de Excel. Verifique sua conexão e tente novamente.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = leitorExcel.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = leitorExcel.utils.sheet_to_json(firstSheet);

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

        const modo = await confirmarAcao({
          titulo: 'Como importar a planilha?',
          mensagem: `A planilha tem ${produtosValidados.length === 1 ? '1 produto válido' : `${produtosValidados.length} produtos válidos`}. Mesclar atualiza e adiciona produtos sem excluir os outros. Substituir apaga o catálogo atual e usa só a planilha.`,
          cancelar: 'Cancelar importação',
          acoes: [
            { rotulo: 'Mesclar com o catálogo atual', valor: 'mesclar', padrao: true },
            { rotulo: 'Substituir catálogo completo', valor: 'substituir', perigo: true }
          ]
        });
        if (!modo) return;

        showToast(`Importando ${pluralizar(produtosValidados.length, 'produto')}...`, 'info');
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
