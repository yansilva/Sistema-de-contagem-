/** Consultas do operador de contagem: sem edição, importação ou exportação. */
const Consulta = {
  paginaCatalogo: 1,
  paginasCatalogo: 1,
  buscaCatalogo: '',
  produtorFiltro: '',
  produtores: [],
  paginaHistorico: 1,
  historicoTemProxima: false,
  limite: 15,
  requisicaoCatalogo: 0,
  requisicaoHistorico: 0,

  mensagem(id, texto) {
    document.getElementById(id).innerHTML = `<p class="consulta-vazio">${escapeHtml(texto)}</p>`;
  },

  async carregarResumo() {
    const [produtos, produtores] = await Promise.all([
      API.get('/produtos?limit=1'), API.get('/produtos/fornecedores')
    ]);
    document.getElementById('funcionario-total-produtos').textContent = produtos?.data?.pagination?.total ?? '—';
    document.getElementById('funcionario-total-produtores').textContent = produtores?.data?.fornecedores?.length ?? '—';
  },

  abrirCatalogo(produtor = '') {
    this.produtorFiltro = produtor;
    this.buscaCatalogo = '';
    this.paginaCatalogo = 1;
    document.getElementById('consulta-catalogo-busca').value = '';
    showScreen('screen-catalogo');
  },

  buscarCatalogo(termo) {
    this.buscaCatalogo = termo.trim();
    this.paginaCatalogo = 1;
    return this.carregarCatalogo();
  },

  mudarPaginaCatalogo(direcao) {
    this.paginaCatalogo = Math.max(1, Math.min(this.paginasCatalogo, this.paginaCatalogo + direcao));
    return this.carregarCatalogo();
  },

  async carregarCatalogo() {
    const requisicao = ++this.requisicaoCatalogo;
    const params = new URLSearchParams({ page: this.paginaCatalogo, limit: this.limite });
    if (this.buscaCatalogo) params.set('search', this.buscaCatalogo);
    if (this.produtorFiltro) params.set('fornecedor', this.produtorFiltro);
    document.getElementById('consulta-produtor-filtro').hidden = !this.produtorFiltro;
    document.getElementById('consulta-produtor-selecionado').textContent = `Produtor: ${this.produtorFiltro}`;
    this.mensagem('consulta-catalogo-lista', 'Carregando catálogo...');
    const res = await API.get(`/produtos?${params}`);
    if (requisicao !== this.requisicaoCatalogo) return;
    if (!res?.success) {
      this.mensagem('consulta-catalogo-lista', 'Não foi possível carregar o catálogo.');
      return;
    }
    const { produtos = [], pagination = {} } = res.data;
    this.paginasCatalogo = Math.max(1, pagination.totalPages || 1);
    document.getElementById('consulta-catalogo-anterior').disabled = this.paginaCatalogo <= 1;
    document.getElementById('consulta-catalogo-proxima').disabled = this.paginaCatalogo >= this.paginasCatalogo;
    document.getElementById('consulta-catalogo-pagina').textContent = `Página ${this.paginaCatalogo} de ${this.paginasCatalogo}`;
    if (!produtos.length) {
      this.mensagem('consulta-catalogo-lista', 'Nenhum produto encontrado.');
      return;
    }
    document.getElementById('consulta-catalogo-lista').innerHTML = produtos.map(p => `
      <article class="consulta-item">
        <strong>${escapeHtml(p.nome)}</strong>
        <p>Código / SKU: <code>${escapeHtml(p.codigo)}</code></p>
        <p>Produtor: ${escapeHtml(p.fornecedor)}</p>
      </article>`).join('');
  },

  async carregarProdutores() {
    this.produtores = [];
    this.mensagem('consulta-produtores-lista', 'Carregando produtores...');
    const res = await API.get('/produtos/fornecedores');
    if (!res?.success) {
      this.mensagem('consulta-produtores-lista', 'Não foi possível carregar os produtores.');
      return;
    }
    this.produtores = res.data.fornecedores || [];
    this.renderizarProdutores();
  },

  renderizarProdutores() {
    const termo = document.getElementById('consulta-produtores-busca').value.trim().toLocaleLowerCase('pt-BR');
    const produtores = this.produtores.filter(nome => nome.toLocaleLowerCase('pt-BR').includes(termo));
    if (!produtores.length) {
      this.mensagem('consulta-produtores-lista', 'Nenhum produtor encontrado.');
      return;
    }
    document.getElementById('consulta-produtores-lista').innerHTML = produtores.map(nome => `
      <article class="consulta-item table-toolbar">
        <strong>${escapeHtml(nome)}</strong>
        <button class="btn btn-outline btn-sm" data-produtor="${escapeHtml(nome)}" onclick="Consulta.abrirCatalogo(this.dataset.produtor)">Ver produtos</button>
      </article>`).join('');
  },

  mudarPaginaHistorico(direcao) {
    if (direcao > 0 && !this.historicoTemProxima) return;
    this.paginaHistorico = Math.max(1, this.paginaHistorico + direcao);
    return this.carregarHistorico();
  },

  async carregarHistorico() {
    const requisicao = ++this.requisicaoHistorico;
    document.getElementById('consulta-historico-detalhe').hidden = true;
    this.mensagem('consulta-historico-lista', 'Carregando contagens...');
    const res = await API.get(`/contagens?page=${this.paginaHistorico}&limit=${this.limite}`);
    if (requisicao !== this.requisicaoHistorico) return;
    if (!res?.success) {
      this.mensagem('consulta-historico-lista', 'Não foi possível carregar o histórico.');
      return;
    }
    const contagens = res.data.contagens || [];
    this.historicoTemProxima = contagens.length === this.limite;
    document.getElementById('consulta-historico-anterior').disabled = this.paginaHistorico <= 1;
    document.getElementById('consulta-historico-proxima').disabled = !this.historicoTemProxima;
    document.getElementById('consulta-historico-pagina').textContent = `Página ${this.paginaHistorico}`;
    if (!contagens.length) {
      this.mensagem('consulta-historico-lista', 'Nenhuma contagem nesta página.');
      return;
    }
    document.getElementById('consulta-historico-lista').innerHTML = contagens.map(c => `
      <article class="consulta-item">
        <div class="table-toolbar"><strong>${escapeHtml(formatarData(c.iniciado_em))}</strong>
          <span class="badge badge-neutro">${c.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}</span></div>
        <p>Iniciada por: ${escapeHtml(c.iniciado_por_nome || 'Usuário')}</p>
        <p>Produtores: ${(c.fornecedores || []).length}</p>
        <button class="btn btn-outline btn-sm" data-id="${escapeHtml(c.id)}" onclick="Consulta.detalharContagem(this.dataset.id)">Ver contagem</button>
      </article>`).join('');
  },

  async detalharContagem(id) {
    const detalhe = document.getElementById('consulta-historico-detalhe');
    detalhe.hidden = false;
    detalhe.dataset.contagem = id;
    this.mensagem('consulta-historico-detalhe', 'Carregando detalhes...');
    const res = await API.get(`/contagens/${encodeURIComponent(id)}`);
    if (detalhe.dataset.contagem !== id) return;
    if (!res?.success) {
      this.mensagem('consulta-historico-detalhe', 'Não foi possível carregar a contagem.');
      return;
    }
    const c = res.data.contagem;
    detalhe.innerHTML = `<h3>Quantidades registradas · ${escapeHtml(formatarData(c.iniciado_em))}</h3>` +
      (c.fornecedores || []).map(f => `<h3>${escapeHtml(f.fornecedor)}</h3><div class="consulta-lista">` +
        (f.produtos || []).map(p => `<article class="consulta-item"><strong>${escapeHtml(p.nome)}</strong>
          <p>SKU: ${escapeHtml(p.codigo)}</p><p>Quantidade contada: <strong>${p.quantidade_contada == null ? 'Não contado' : escapeHtml(p.quantidade_contada)}</strong></p>
        </article>`).join('') + '</div>').join('');
    detalhe.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
