/** Cobertura dos produtos ativos na semana, compartilhada pela equipe. */
const Semana = {
  dados: null,
  geracao: 0,
  produtorAberto: null,
  estado: 'vazio',

  async carregar() {
    const geracao = ++this.geracao;
    this.dados = null;
    this.produtorAberto = null;
    this.estado = 'carregando';
    this.renderizar();
    try {
      const res = await API.get('/contagens/semana');
      if (geracao !== this.geracao) return;
      if (!res?.success || !Array.isArray(res.data?.produtores) || !res.data?.semana || !res.data?.resumo) throw new Error('Cobertura indisponível');
      this.dados = res.data;
      this.estado = 'pronto';
    } catch (erro) {
      if (geracao !== this.geracao) return;
      this.estado = 'erro';
    }
    this.renderizar();
  },

  invalidar() {
    ++this.geracao;
    this.dados = null;
    this.produtorAberto = null;
    this.estado = 'vazio';
    this.renderizar();
  },

  abrirProdutor(fornecedor) {
    this.produtorAberto = this.produtorAberto === fornecedor ? null : fornecedor;
    const container = document.getElementById('semana-conteudo');
    container?.querySelectorAll?.('[data-click="semana-produtor"]').forEach(botao => {
      botao.setAttribute('aria-expanded', String(botao.dataset.produtor === this.produtorAberto));
    });
    this.renderizarPendencias();
  },

  renderizar() {
    const container = document.getElementById('semana-conteudo');
    const periodo = document.getElementById('semana-periodo');
    const pendencias = document.getElementById('semana-pendencias');
    if (!container) return;
    if (periodo) periodo.textContent = '';
    if (pendencias) pendencias.innerHTML = '';
    if (this.estado === 'carregando') {
      container.innerHTML = '<p><span class="spinner" aria-hidden="true"></span> Carregando semana atual...</p>';
      return;
    }
    if (this.estado === 'erro') {
      container.innerHTML = '<p>Não foi possível carregar a semana.</p><button class="btn btn-outline" data-click="semana-recarregar">Tentar novamente</button>';
      return;
    }
    if (!this.dados) { container.innerHTML = '<p>Atualize para consultar a semana atual.</p>'; return; }
    const { semana, resumo, produtores } = this.dados;
    const formatar = data => new Date(data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    if (periodo) periodo.textContent = `${formatar(semana.inicio)} a ${formatar(new Date(new Date(semana.fim_exclusivo).getTime() - 1))} • São Paulo`;
    if (!produtores.length) { container.innerHTML = '<p class="consulta-vazio">Nenhum produtor com produtos ativos nesta semana.</p>'; return; }
    const estados = { contado: ['Contado', 'ti-circle-check'], parcial: ['Parcial', 'ti-progress'], pendente: ['Pendente', 'ti-clock'] };
    container.innerHTML = `<div class="semana-resumo"><span>Contados: <strong>${resumo.contados}</strong></span><span>Parciais: <strong>${resumo.parciais}</strong></span><span>Pendentes: <strong>${resumo.pendentes}</strong></span></div><div class="semana-grid">${produtores.map(p => {
      const [nome, icone] = estados[p.status] || estados.pendente;
      return `<article class="semana-card"><h3>${escapeHtml(p.fornecedor)}</h3><p><i class="ti ${icone}" aria-hidden="true"></i> <strong>${nome}</strong></p><p>${p.produtos_contados} de ${p.total_produtos} produtos contados</p><button class="btn btn-outline" data-click="semana-produtor" data-produtor="${escapeHtml(p.fornecedor)}" aria-expanded="${this.produtorAberto === p.fornecedor}" aria-controls="semana-pendencias">Ver pendências (${p.produtos_pendentes.length})</button></article>`;
    }).join('')}</div>`;
    this.renderizarPendencias();
  },

  renderizarPendencias() {
    const pendencias = document.getElementById('semana-pendencias');
    if (!pendencias) return;
    pendencias.innerHTML = '';
    const produtor = this.dados?.produtores.find(p => p.fornecedor === this.produtorAberto);
    if (produtor && pendencias) pendencias.innerHTML = `<h3>Pendências de ${escapeHtml(produtor.fornecedor)}</h3>${produtor.produtos_pendentes.length ? `<ul class="semana-lista">${produtor.produtos_pendentes.map(p => `<li><strong>${escapeHtml(p.nome)}</strong><span>SKU: ${escapeHtml(p.codigo)}</span><span>${p.tipo === 'pecas_queijo' ? 'Peças de queijo' : 'Geral'}</span></li>`).join('')}</ul>` : '<p>Todos os produtos deste produtor estão contados nesta semana.</p>'}`;
  }
};
