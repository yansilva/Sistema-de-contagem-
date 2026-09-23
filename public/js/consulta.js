/** Consultas do operador de contagem: leitura e Excel das diferenças finalizadas. */
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
        <button class="btn btn-outline btn-sm" data-produtor="${escapeHtml(nome)}" data-click="action-71">Ver produtos</button>
      </article>`).join('');
  },

  mudarPaginaHistorico(direcao) {
    if (direcao > 0 && !this.historicoTemProxima) return;
    this.paginaHistorico = Math.max(1, this.paginaHistorico + direcao);
    return this.carregarHistorico();
  },

  async carregarHistorico() {
    const requisicao = ++this.requisicaoHistorico;
    this.fecharDetalhe();
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
        <div class="table-toolbar">
          <button class="btn btn-outline btn-sm" data-id="${escapeHtml(c.id)}" data-click="action-72">Ver contagem</button>
          ${c.status === 'finalizada' && c.tem_diferenca ? `<button class="btn btn-outline btn-sm" data-id="${escapeHtml(c.id)}" data-click="action-123"><i class="ti ti-file-spreadsheet"></i> Excel</button>` : ''}
        </div>
      </article>`).join('');
  },

  async detalharContagem(id) {
    const detalhe = document.getElementById('consulta-historico-detalhe');
    detalhe.dataset.contagem = id;
    this.mensagem('consulta-historico-detalhe', 'Carregando detalhes...');
    if (!detalhe.open) detalhe.showModal();
    const res = await API.get(`/contagens/${encodeURIComponent(id)}`);
    if (detalhe.dataset.contagem !== id) return;
    if (!res?.success) {
      this.mensagem('consulta-historico-detalhe', 'Não foi possível carregar a contagem.');
      return;
    }
    const c = res.data.contagem;
    detalhe.innerHTML = `<div class="contagem-dialog-header"><div><span class="contagem-dialog-eyebrow">Histórico de contagens</span><h3>Quantidades registradas · ${escapeHtml(formatarData(c.iniciado_em))}</h3></div>
      <button type="button" class="btn btn-ghost btn-sm" data-click="action-122" aria-label="Fechar detalhes"><i class="ti ti-x"></i></button></div>
      ${c.status === 'finalizada' && c.tem_diferenca ? `<button class="btn btn-outline btn-sm" data-id="${escapeHtml(c.id)}" data-click="action-123"><i class="ti ti-file-spreadsheet"></i> Excel de diferenças</button>` : ''}
      <div class="consulta-detalhe-corpo">` +
      ((c.fornecedores || []).map(f => `<h3>${escapeHtml(f.fornecedor)}</h3><div class="consulta-lista">` +
        (f.produtos || []).map(p => {
          const diferenca = Number(p.diferenca);
          const situacao = c.status === 'finalizada' && p.diferenca != null
            ? `<span class="badge ${diferenca < 0 ? 'badge-danger' : diferenca > 0 ? 'badge-warning' : 'badge-sucesso'}">${diferenca < 0 ? `Falta de ${Math.abs(diferenca)}` : diferenca > 0 ? `Sobra de ${diferenca}` : 'Sem diferença'}</span>`
            : '';
          return `<article class="consulta-item"><strong>${escapeHtml(p.nome)}</strong>
            <p>SKU: ${escapeHtml(p.codigo)}</p><p>Quantidade contada: <strong>${p.quantidade_contada == null ? 'Não contado' : escapeHtml(p.quantidade_contada)}</strong></p>${situacao}
          </article>`;
        }).join('') + '</div>').join('') || '<p class="consulta-vazio">Nenhum produto registrado nesta contagem.</p>') + '</div>';
  },

  fecharDetalhe() {
    const detalhe = document.getElementById('consulta-historico-detalhe');
    if (detalhe.open) detalhe.close();
    detalhe.dataset.contagem = '';
  },

  baixarExcel(id) {
    const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
    return API.download(`/relatorios/contagens/${encodeURIComponent(id)}/excel`, `diferenca_estoque_${data}.xlsx`);
  }
};
