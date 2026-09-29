/** Cobertura dos produtos ativos na semana, compartilhada pela equipe. */
const Semana = {
  dados: null,
  geracao: 0,
  produtorAberto: null,
  filtro: 'todos',
  busca: '',
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
    this.filtro = 'todos';
    this.busca = '';
    this.estado = 'vazio';
    this.renderizar();
  },

  abrirProdutor(fornecedor) {
    this.produtorAberto = this.produtorAberto === fornecedor ? null : fornecedor;
    this.renderizarPendencias();
  },

  filtrar(status) {
    if (!['todos', 'contado', 'parcial', 'pendente'].includes(status)) return;
    this.filtro = status;
    document.getElementById('semana-filtros')?.querySelectorAll?.('[data-click="semana-filtro"]').forEach(botao => {
      botao.setAttribute('aria-pressed', String(botao.dataset.status === status));
    });
    this.renderizarCards();
  },

  buscar(valor) {
    this.busca = String(valor || '');
    this.renderizarCards();
  },

  renderizar() {
    const container = document.getElementById('semana-conteudo');
    const periodo = document.getElementById('semana-periodo');
    if (!container) return;
    if (periodo) periodo.textContent = '';
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
    const total = produtores.length;
    const contados = Math.max(0, Math.min(total, Number(resumo.contados) || 0));
    const percentual = Math.round(contados / total * 100);
    const totais = [['todos', 'Todos', total, 'ti-layout-grid'], ['contado', 'Contados', resumo.contados, 'ti-circle-check'], ['parcial', 'Parciais', resumo.parciais, 'ti-progress'], ['pendente', 'Pendentes', resumo.pendentes, 'ti-clock']];
    container.innerHTML = `<div class="semana-visao-geral"><div class="semana-visao-texto"><span class="semana-eyebrow">VISÃO DA SEMANA</span><h3>${contados} de ${total} produtores contados</h3><p>Veja o andamento da equipe e encontre o que ainda falta contar.</p></div><div class="semana-medidor" role="progressbar" aria-label="Produtores contados na semana" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${contados}" style="--semana-progresso:${percentual}%"><strong>${percentual}%</strong><span>concluído</span></div></div>
      <div class="semana-controles"><div id="semana-filtros" class="semana-filtros" role="group" aria-label="Filtrar produtores por situação">${totais.map(([status, rotulo, quantidade, icone]) => `<button type="button" class="semana-filtro semana-filtro--${status}" data-click="semana-filtro" data-status="${status}" aria-pressed="${this.filtro === status}"><i class="ti ${icone}" aria-hidden="true"></i><span>${rotulo}</span><strong>${Number(quantidade) || 0}</strong></button>`).join('')}</div><label class="semana-busca"><i class="ti ti-search" aria-hidden="true"></i><input id="semana-busca" type="search" placeholder="Buscar produtor" aria-label="Buscar produtor" data-input="semana-busca" value="${escapeHtml(this.busca)}" autocomplete="off"></label></div>
      <p id="semana-resultado" class="semana-resultado" role="status" aria-live="polite"></p><div id="semana-grade" class="semana-grid"></div>`;
    this.renderizarCards();
  },

  renderizarCards() {
    const grade = document.getElementById('semana-grade');
    if (!grade || !this.dados) return;
    const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    const busca = normalizar(this.busca.trim());
    const visiveis = this.dados.produtores.map((produtor, indice) => ({ produtor, indice })).filter(({ produtor }) => (this.filtro === 'todos' || produtor.status === this.filtro) && normalizar(produtor.fornecedor).includes(busca));
    const resultado = document.getElementById('semana-resultado');
    if (resultado) resultado.textContent = `${visiveis.length} de ${this.dados.produtores.length} produtores exibidos`;
    if (!visiveis.some(({ produtor }) => produtor.fornecedor === this.produtorAberto)) this.produtorAberto = null;
    if (!visiveis.length) { grade.innerHTML = '<div class="semana-vazio"><i class="ti ti-search-off" aria-hidden="true"></i><p>Nenhum produtor encontrado para este filtro.</p></div>'; return; }
    const estados = { contado: ['Contado', 'ti-circle-check'], parcial: ['Parcial', 'ti-progress'], pendente: ['Pendente', 'ti-clock'] };
    grade.innerHTML = visiveis.map(({ produtor: p, indice }) => {
      const [nome, icone] = estados[p.status] || estados.pendente;
      const total = Math.max(0, Number(p.total_produtos) || 0);
      const feitos = Math.max(0, Math.min(total, Number(p.produtos_contados) || 0));
      const percentual = total ? Math.round(feitos / total * 100) : 0;
      const pendentes = Array.isArray(p.produtos_pendentes) ? p.produtos_pendentes.length : 0;
      return `<article class="semana-card semana-card--${estados[p.status] ? p.status : 'pendente'}"><div class="semana-card-corpo" data-click="semana-produtor-card" data-produtor="${escapeHtml(p.fornecedor)}"><div class="semana-card-top"><span class="semana-card-ordinal">${String(indice + 1).padStart(2, '0')}</span><span class="semana-status"><i class="ti ${icone}" aria-hidden="true"></i>${nome}</span></div><h3>${escapeHtml(p.fornecedor)}</h3><div class="semana-card-progresso"><span>${feitos} de ${total} produtos contados</span><strong>${percentual}%</strong></div><div class="semana-card-barra" role="progressbar" aria-label="Produtos de ${escapeHtml(p.fornecedor)} contados" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${feitos}"><span style="width:${percentual}%"></span></div></div><button type="button" class="semana-card-acao" data-click="semana-produtor" data-produtor="${escapeHtml(p.fornecedor)}" data-indice="${indice}" aria-expanded="${this.produtorAberto === p.fornecedor}" aria-controls="semana-detalhe-${indice}"><span>${pendentes ? 'Ver produtos pendentes' : 'Ver situação'} ${pendentes ? `<strong>${pendentes}</strong>` : ''}</span><i class="ti ti-chevron-down" aria-hidden="true"></i></button><div id="semana-detalhe-${indice}" class="semana-detalhe" role="region" aria-label="Pendências de ${escapeHtml(p.fornecedor)}" hidden></div></article>`;
    }).join('');
    this.renderizarPendencias();
  },

  renderizarPendencias() {
    const grade = document.getElementById('semana-grade');
    if (!grade || !this.dados) return;
    grade.querySelectorAll?.('[data-click="semana-produtor"]').forEach(botao => {
      const aberto = botao.dataset.produtor === this.produtorAberto;
      botao.setAttribute('aria-expanded', String(aberto));
      const indice = botao.dataset.indice ?? this.dados.produtores.findIndex(p => p.fornecedor === botao.dataset.produtor);
      const detalhe = document.getElementById(`semana-detalhe-${indice}`);
      if (!detalhe) return;
      detalhe.hidden = !aberto;
      if (!aberto) { detalhe.innerHTML = ''; return; }
      const produtor = this.dados.produtores[indice];
      const pendentes = Array.isArray(produtor?.produtos_pendentes) ? produtor.produtos_pendentes : [];
      detalhe.innerHTML = `<div class="semana-detalhe-titulo"><h4>Pendências de ${escapeHtml(produtor.fornecedor)}</h4><span>${pendentes.length} produtos</span></div>${pendentes.length ? `<ul class="semana-lista">${pendentes.map(p => `<li><strong>${escapeHtml(p.nome)}</strong><span>SKU: ${escapeHtml(p.codigo)}</span><span>${p.tipo === 'pecas_queijo' ? 'Peças de queijo' : 'Geral'}</span></li>`).join('')}</ul>` : `<p>${produtor.status === 'contado' ? 'Todos os produtos deste produtor estão contados nesta semana.' : 'Nenhuma pendência detalhada disponível para este produtor.'}</p>`}`;
    });
  }
};
