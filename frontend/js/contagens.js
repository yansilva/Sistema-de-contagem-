/**
 * Módulo de Execução de Contagem Cega de Estoque e Conciliação
 *
 * REGRAS INEGOCIÁVEIS:
 * 1. Durante a contagem: funcionário NUNCA vê estoque Tiny, referência ou diferenças.
 * 2. Diferenciação de NULL (não contado) vs 0 (contado zero unidades fisicamente).
 * 3. Após finalização:
 *    - Após finalizar, funcionário e administrador veem também o estoque de referência.
 */
const MSG_VENCIDOS_INCLUIDOS = 'Vencidos já estão incluídos na quantidade física contada.';
const MSG_VENCIDOS_INVALIDOS = 'A quantidade vencida deve ficar entre zero e a quantidade física contada.';

const Contagens = {
  contagemId: null,
  resultadoId: null,
  tipoAtual: 'geral',
  tipoSelecao: 'geral',
  paginaSessoes: 1,
  requisicaoSessoes: 0,
  edicaoPendente: false,
  entradasInvalidas: new Set(),
  itensTocados: new Set(),

  async abrirModalidade(tipo = 'geral') {
    this.tipoSelecao = tipo === 'pecas_queijo' ? tipo : 'geral';
    showScreen('screen-modalidade-contagem');
    for (const modo of ['geral', 'pecas_queijo']) {
      const tab = document.getElementById(`contagem-aba-${modo}`);
      tab?.setAttribute('aria-selected', String(modo === this.tipoSelecao));
      if (tab) tab.tabIndex = modo === this.tipoSelecao ? 0 : -1;
    }
    document.getElementById('contagem-modalidade-painel')?.setAttribute('aria-labelledby', `contagem-aba-${this.tipoSelecao}`);
    document.getElementById(`contagem-aba-${this.tipoSelecao}`)?.focus?.();
    document.getElementById('contagem-modalidade-titulo').textContent = this.tipoSelecao === 'pecas_queijo' ? 'Peças de queijo' : 'Contagem geral';
    document.getElementById('contagem-modalidade-orientacao').textContent = this.tipoSelecao === 'pecas_queijo'
      ? 'Registre quantidades inteiras de peças. O saldo do ERP em kg não é comparado nesta modalidade.'
      : 'Registre as unidades encontradas sem ver o saldo do sistema. As diferenças aparecem após a finalização.';
    return this.carregarSessoesAbertas(1);
  },

  async carregarSessoesAbertas(pagina = this.paginaSessoes) {
    this.paginaSessoes = Math.max(1, Number(pagina) || 1);
    const requisicao = ++this.requisicaoSessoes;
    const lista = document.getElementById('contagem-sessoes-lista');
    lista.innerHTML = '<p class="consulta-vazio" role="status">Carregando sessões abertas...</p>';
    try {
      const res = await API.get(`/contagens?tipo=${this.tipoSelecao}&status=em_andamento&page=${this.paginaSessoes}&limit=20`);
      if (requisicao !== this.requisicaoSessoes) return;
      if (!res?.success) throw new Error('carregamento');
      const sessoes = res.data.contagens || [];
      const temProxima = res.data.pagination?.totalPages ? this.paginaSessoes < res.data.pagination.totalPages : sessoes.length === 20;
      lista.innerHTML = sessoes.map(c => `<article class="consulta-item table-toolbar"><div><strong>${escapeHtml(formatarData(c.iniciado_em))}</strong><p>${escapeHtml(c.iniciado_por_nome || 'Usuário')} · Em andamento</p></div><button class="btn btn-outline" data-click="contagem-continuar" data-id="${escapeHtml(c.id)}">Retomar contagem</button></article>`).join('') || '<div class="consulta-vazio contagem-vazio-acao"><p>Nenhuma sessão aberta nesta modalidade. Use o botão acima para iniciar uma nova contagem.</p></div>';
      if (sessoes.length || this.paginaSessoes > 1) lista.innerHTML += `<div class="pagination-controls"><button class="btn btn-outline btn-sm" data-click="contagem-sessoes-pagina" data-page="${this.paginaSessoes - 1}" ${this.paginaSessoes <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${this.paginaSessoes}</span><button class="btn btn-outline btn-sm" data-click="contagem-sessoes-pagina" data-page="${this.paginaSessoes + 1}" ${!temProxima ? 'disabled' : ''}>Próxima</button></div>`;
    } catch (err) {
      if (requisicao !== this.requisicaoSessoes) return;
      lista.innerHTML = `<p class="consulta-vazio">Não foi possível carregar as sessões abertas.</p><button class="btn btn-outline" data-click="contagem-sessoes-pagina" data-page="${this.paginaSessoes}">Tentar novamente</button>`;
    }
  },

  /**
   * Um administrador apagou a contagem: avisa uma vez, descarta o estado local e volta ao início.
   * Devolve true quando tratou a resposta (o chamador deve parar).
   */
  tratarContagemApagada(res) {
    if (!res || res.success || res.code !== 'CONTAGEM_APAGADA') return false;
    const dialogEdicao = document.getElementById('contagem-edicao-pendente');
    if (dialogEdicao?.open) dialogEdicao.close();
    this.fecharFornecedor();
    this.contagemId = null;
    this.resultadoId = null;
    this.dadosSessao = null;
    this.fornecedorAtual = null;
    this.itensFornecedor = [];
    this.edicaoPendente = false;
    this.acaoAposEdicao = null;
    this.entradasInvalidas.clear();
    this.itensTocados.clear();
    this.produtoresConcluidos.clear();
    showToast(res.message || 'Esta contagem foi apagada por um administrador. As quantidades não salvas foram perdidas.', 'error');
    if (typeof Semana !== 'undefined' && typeof Semana.invalidar === 'function') Semana.invalidar();
    showScreen('screen-home');
    return true;
  },

  protegerEdicao(acao) {
    if (this._salvando) return true;
    if (!this.edicaoPendente) return false;
    this.acaoAposEdicao = acao;
    const dialog = document.getElementById('contagem-edicao-pendente');
    if (!dialog.open) dialog.showModal();
    document.getElementById('contagem-edicao-salvar')?.focus();
    return true;
  },

  async resolverEdicao(escolha) {
    if (this._salvando) return;
    if (escolha === 'salvar' && !await this.salvarProgressoAtual()) return;
    if (escolha === 'descartar') {
      this.edicaoPendente = false;
      this.entradasInvalidas.clear();
      this.itensTocados.clear();
      if (this.fornecedorAtual) this.selecionarFornecedor(this.fornecedorAtual);
    }
    const acao = this.acaoAposEdicao;
    this.acaoAposEdicao = null;
    document.getElementById('contagem-edicao-pendente').close();
    if (escolha !== 'cancelar') await acao?.();
  },

  async continuarSessao(id) {
    if (this.protegerEdicao(() => this.continuarSessao(id))) return;
    if (this._carregandoSessao || this._iniciando) return;
    this._carregandoSessao = true;
    try {
      const res = await API.get(`/contagens/${encodeURIComponent(id)}`);
      if (this.tratarContagemApagada(res)) return;
      if (!res?.success || !res.data?.contagem) throw new Error('carregamento');
      if (res.data.contagem.status !== 'em_andamento') return this.exibirResultado(id);
      this.fecharFornecedor();
      Consulta.fecharDetalhe();
      this.contagemId = res.data.contagem.id;
      this.fornecedorAtual = null;
      this.itensFornecedor = [];
      this.itensTocados.clear();
      this.filtroProdutores = '';
      document.getElementById('busca-fornecedor').value = '';
      this.aplicarDadosSessao(res.data.contagem);
      showScreen('screen-contagem');
      document.getElementById('busca-fornecedor')?.focus();
    } catch (err) {
      showToast('Não foi possível abrir a sessão. Tente novamente.', 'error');
    } finally {
      this._carregandoSessao = false;
    }
  },
  fornecedoresLista: [],
  fornecedorAtual: null,
  itensFornecedor: [],
  produtoresConcluidos: new Set(),
  dadosSessao: null,
  filtroProdutores: '',

  /**
   * Inicia uma nova sessão de contagem cega com snapshot do estoque atual
   */
  async iniciarNovaSessao(tipo = 'geral') {
    if (this.protegerEdicao(() => this.iniciarNovaSessao(tipo))) return;
    if (this._iniciando || this._carregandoSessao) return;
    this.tipoAtual = tipo === 'pecas_queijo' ? tipo : 'geral';
    this._iniciando = true;

    this.contagemId = null;
    this.fornecedorAtual = null;
    this.itensFornecedor = [];
    this.itensTocados.clear();
    this.produtoresConcluidos.clear();
    this.dadosSessao = null;
    this.filtroProdutores = '';

    const buscaInput = document.getElementById('busca-fornecedor');
    if (buscaInput) buscaInput.value = '';
    const blocoProd = document.getElementById('bloco-produtos-contagem');
    if (blocoProd?.open) blocoProd.close();
    const progressoTexto = document.getElementById('progresso-contagem-texto');
    if (progressoTexto) progressoTexto.textContent = 'Carregando produtos...';
    const progressoMedidor = document.getElementById('progresso-contagem-medidor');
    if (progressoMedidor) {
      progressoMedidor.removeAttribute('aria-valuenow');
      progressoMedidor.setAttribute('aria-valuetext', 'Carregando produtos');
    }

    // Feedback visual instantâneo: navega imediatamente e exibe loader
    showScreen('screen-contagem');
    const container = document.getElementById('lista-produtores-cards');
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; color: var(--cor-texto-secundario);">
          <div class="spinner" style="margin: 0 auto 16px auto; width: 36px; height: 36px; border: 3px solid var(--cor-borda); border-top-color: var(--cor-primaria); border-radius: 50%;"></div>
          <p style="font-weight: 600; font-size: 1rem; color: var(--cor-texto);">Iniciando sessão de contagem...</p>
          <p style="font-size: 0.85rem; color: var(--cor-texto-mutado); margin-top: 4px;">Preparando produtos da modalidade selecionada</p>
        </div>
      `;
    }

    try {
      const res = await API.post('/contagens', { tipo: this.tipoAtual });
      if (!res || !res.success || !res.data?.contagem) {
        showToast(res?.message || 'Não foi possível iniciar a contagem. Tente novamente.', 'error');
        showScreen('screen-home');
        return;
      }

      this.contagemId = res.data.contagem.id;
      if (!await this.carregarDadosContagem()) {
        showScreen('screen-home');
        return;
      }

      showToast('Contagem iniciada. Escolha um produtor para registrar as quantidades.', 'info');
    } catch (err) {
      showToast('Não foi possível iniciar a contagem. Verifique sua conexão e tente novamente.', 'error');
      showScreen('screen-home');
    } finally {
      this._iniciando = false;
    }
  },

  /**
   * Carrega os dados da contagem em andamento
   */
  async carregarDadosContagem() {
    if (!this.contagemId) return;

    const res = await API.get(`/contagens/${this.contagemId}`);
    if (this.tratarContagemApagada(res)) return false;
    if (!res || !res.success || !res.data?.contagem) {
      showToast(res?.message || 'Não foi possível carregar os produtos da contagem.', 'error');
      return false;
    }

    this.aplicarDadosSessao(res.data.contagem);
    return true;
  },

  aplicarDadosSessao(contagem) {
    this.dadosSessao = contagem;
    this.tipoAtual = contagem.tipo || 'geral';
    document.getElementById('contagem-sessao-modalidade').textContent = this.tipoAtual === 'pecas_queijo' ? 'Peças de queijo' : 'Contagem geral';
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
    return true;
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
    const progressoMedidor = document.getElementById('progresso-contagem-medidor');
    const progressoBarra = document.getElementById('progresso-contagem-barra');
    const btnFinalizar = document.getElementById('btn-finalizar-contagem');

    if (progressoTexto) {
      progressoTexto.textContent = `${totalContados} de ${pluralizar(totalProdutos, 'produto')} ${totalProdutos === 1 ? 'contado' : 'contados'}`;
    }

    if (progressoMedidor) {
      progressoMedidor.setAttribute('aria-valuemax', String(Math.max(totalProdutos, 1)));
      progressoMedidor.setAttribute('aria-valuenow', String(totalContados));
      progressoMedidor.removeAttribute('aria-valuetext');
    }

    if (progressoBarra) {
      const perc = totalProdutos > 0 ? Math.round((totalContados / totalProdutos) * 100) : 0;
      progressoBarra.style.width = `${perc}%`;
    }

    if (btnFinalizar) {
      const semContagem = totalContados === 0;
      btnFinalizar.disabled = semContagem;
      const dicaFinalizar = document.getElementById('dica-finalizar-contagem');
      if (dicaFinalizar) dicaFinalizar.hidden = !semContagem;
      if (semContagem) {
        btnFinalizar.setAttribute?.('aria-describedby', 'dica-finalizar-contagem');
        btnFinalizar.setAttribute?.('title', 'Conte ao menos um produto para finalizar');
      } else {
        btnFinalizar.removeAttribute?.('aria-describedby');
        btnFinalizar.removeAttribute?.('title');
      }
    }
  },

  /**
   * Renderiza os cartões de produtores disponíveis na contagem
   */
  renderizarListaProdutores() {
    const container = document.getElementById('lista-produtores-cards');
    if (!container || !this.dadosSessao) return;

    const cards = (this.dadosSessao.fornecedores || [])
      .filter(f => f.fornecedor.toLocaleLowerCase('pt-BR').includes(this.filtroProdutores))
      .map((f) => {
      const isAtivo = this.fornecedorAtual === f.fornecedor;
      const total = f.produtos?.length || 0;
      const contados = f.produtos?.filter((p) => p.quantidade_contada !== null && p.quantidade_contada !== undefined).length || 0;
      const concluido = total > 0 && contados === total;
      const estado = concluido ? 'is-complete' : (contados > 0 ? 'is-progress' : 'is-pending');

      const badge = concluido
        ? '<span class="badge badge-success"><i class="ti ti-check"></i> Concluído</span>'
        : (contados > 0
          ? `<span class="badge badge-warning"><i class="ti ti-clock"></i> ${contados}/${total} contados</span>`
          : '<span class="badge badge-neutral"><i class="ti ti-circle"></i> Não iniciado</span>');

      return `
        <button type="button" class="quick-card contagem-produtor-card ${estado} ${isAtivo ? 'selected' : ''}" data-produtor="${escapeHtml(f.fornecedor)}" data-click="action-73">
          <div class="contagem-produtor-card__header">
            <h3 class="contagem-produtor-card__title"><i class="ti ti-truck" aria-hidden="true"></i> ${escapeHtml(f.fornecedor)}</h3>
            ${badge}
          </div>
          <p class="contagem-produtor-card__progress">${contados} de ${pluralizar(total, 'produto')} com contagem física registrada</p>
        </button>
      `;
    }).join('');

    container.innerHTML = cards || (this.filtroProdutores
      ? '<div class="consulta-vazio contagem-vazio-acao"><p role="status">Nenhum produtor encontrado para essa busca.</p><button type="button" class="btn btn-outline" data-click="contagem-limpar-busca"><i class="ti ti-x" aria-hidden="true"></i> Limpar busca</button></div>'
      : '<p class="consulta-vazio">Nenhum produtor encontrado nesta contagem.</p>');
  },

  filtrarProdutores(termo) {
    this.filtroProdutores = termo.trim().toLocaleLowerCase('pt-BR');
    this.renderizarListaProdutores();
  },

  /**
   * Seleciona um produtor e exibe seus produtos para contagem cega
   */
  selecionarFornecedor(fornecedor) {
    if (fornecedor !== this.fornecedorAtual && this.protegerEdicao(() => this.selecionarFornecedor(fornecedor))) return;
    if (fornecedor === this.fornecedorAtual && this.edicaoPendente) {
      const dialog = document.getElementById('bloco-produtos-contagem');
      if (!dialog.open) dialog.showModal();
      return;
    }
    const bloco = document.getElementById('bloco-produtos-contagem');
    const titulo = document.getElementById('titulo-produtor-ativo');

    if (titulo) titulo.textContent = fornecedor;

    const fornObj = (this.dadosSessao?.fornecedores || []).find((f) => f.fornecedor === fornecedor);
    if (!fornObj || !fornObj.produtos || fornObj.produtos.length === 0) {
      showToast('Este produtor não tem produtos nesta contagem.', 'error');
      return;
    }
    this.fornecedorAtual = fornecedor;
    this.itensTocados.clear();
    this.entradasInvalidas.clear();

    this.itensFornecedor = fornObj.produtos.map((p) => ({
      id: p.id,
      produto_id: p.produto_id,
      codigo: p.codigo,
      nome: p.nome,
      // Distinção: valor original pode ser null ou número
      quantidade_contada: p.quantidade_contada !== undefined ? p.quantidade_contada : null,
      quantidade_vencida: Number(p.quantidade_vencida || 0),
      vencidosAbertos: Number(p.quantidade_vencida || 0) > 0
    }));

    this.renderizarItensContagem();
    this.renderizarListaProdutores();
    this.aplicarInstrucao();
    if (bloco && !bloco.open) bloco.showModal();
    this.ajustarAlturaVisual();
    this.zerarRolagemProdutor(bloco);
  },

  /** A instrução do diálogo é recolhível; a escolha fica salva (sem armazenamento, vale só para esta abertura). */
  instrucaoRecolhida() {
    try {
      const salvo = globalThis.localStorage?.getItem('contagem-instrucao-recolhida');
      if (salvo === '1') return true;
      if (salvo === '0') return false;
    } catch (err) { /* sem armazenamento */ }
    // Sem escolha salva: no celular começa recolhida para sobrar espaço para os itens.
    try { return Boolean(globalThis.matchMedia?.('(max-width: 760px)')?.matches); } catch (err) { return false; }
  },

  aplicarInstrucao() {
    const recolhida = this.instrucaoRecolhida();
    const texto = document.getElementById('contagem-quantidade-ajuda');
    const botao = document.getElementById('contagem-instrucao-toggle');
    if (texto) texto.hidden = recolhida;
    const dicaVencidos = document.getElementById('contagem-instrucao-vencidos');
    if (dicaVencidos) dicaVencidos.hidden = this.tipoAtual !== 'geral';
    botao?.setAttribute?.('aria-expanded', String(!recolhida));
    botao?.setAttribute?.('title', recolhida ? 'Mostrar como contar' : 'Ocultar como contar');
  },

  alternarInstrucao() {
    const recolher = !this.instrucaoRecolhida();
    try { globalThis.localStorage?.setItem('contagem-instrucao-recolhida', recolher ? '1' : '0'); } catch (err) { /* sem armazenamento */ }
    this.aplicarInstrucao();
  },

  /**
   * Com o teclado aberto o navegador pode não encolher a janela (iOS, Chrome com resizes-visual):
   * limita o diálogo à área realmente visível para o botão Salvar nunca ficar atrás do teclado.
   */
  ajustarAlturaVisual() {
    const bloco = document.getElementById('bloco-produtos-contagem');
    const vv = globalThis.visualViewport;
    if (!bloco?.style?.setProperty || !vv) return;
    const aplicar = () => {
      bloco.style.setProperty('--vv-altura', `${Math.round(vv.height)}px`);
      bloco.style.setProperty('--vv-topo', `${Math.round(vv.offsetTop)}px`);
    };
    aplicar();
    if (this._vvOuvindo) return;
    this._vvOuvindo = true;
    vv.addEventListener?.('resize', aplicar);
    vv.addEventListener?.('scroll', aplicar);
  },

  limparBuscaProdutores() {
    const busca = document.getElementById('busca-fornecedor');
    if (busca) busca.value = '';
    this.filtroProdutores = '';
    this.renderizarListaProdutores();
    busca?.focus?.();
  },

  /** A lista do produtor abre sempre no topo, com foco no primeiro campo sem rolar de volta. */
  zerarRolagemProdutor(bloco) {
    if (!bloco) return;
    const lista = document.getElementById('lista-produtos-produtor');
    const rolavel = lista?.closest?.('.contagem-dialog-lista') || lista;
    const zerar = () => {
      bloco.scrollTop = 0;
      if (rolavel) rolavel.scrollTop = 0;
    };
    zerar();
    const primeiro = bloco.querySelector?.('.input-qtd-fisica:not([disabled])');
    try { primeiro?.focus?.({ preventScroll: true }); } catch (err) { primeiro?.focus?.(); }
    zerar();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(zerar);
  },

  /** Há quantidade digitada neste produtor que ainda não foi salva. */
  temDigitacaoPendente() {
    return Boolean(this.edicaoPendente || this.itensTocados?.size || this.entradasInvalidas?.size);
  },

  fecharFornecedor() {
    const bloco = document.getElementById('bloco-produtos-contagem');
    if (bloco?.open && typeof bloco.close === 'function') bloco.close();
  },

  /** Fechar pelo X, Esc ou fundo: confirma antes quando há digitação não salva. */
  async tentarFecharFornecedor() {
    const bloco = document.getElementById('bloco-produtos-contagem');
    if (!bloco?.open) return;
    if (this._confirmandoSaida) return;
    if (!this.temDigitacaoPendente() || this._salvando) return this.fecharFornecedor();
    this._confirmandoSaida = true;
    let sair = false;
    try {
      sair = await confirmarAcao({
        titulo: 'Sair sem salvar?',
        mensagem: 'As quantidades digitadas neste produtor ainda não foram salvas e serão mantidas apenas nesta tela até você salvar.',
        confirmar: 'Sair sem salvar',
        cancelar: 'Continuar editando',
        perigo: true
      });
    } finally {
      this._confirmandoSaida = false;
    }
    if (sair) {
      const produtor = this.fornecedorAtual;
      this.fecharFornecedor();
      this.focarCardProdutor(produtor);
      return;
    }
    const alvo = this._ultimoCampoEditado && document.getElementById(this._ultimoCampoEditado);
    const campo = alvo || bloco.querySelector?.('input:not([disabled])');
    campo?.focus?.();
  },

  /** Cartão da home do funcionário: sessão em andamento, sem saldo de referência (contagem cega). */
  async carregarCartaoEmAndamento() {
    const cartao = document.getElementById('func-contagem-aberta');
    if (!cartao) return;
    const requisicao = (this._reqCartao = (this._reqCartao || 0) + 1);
    cartao.setAttribute?.('aria-busy', 'true');
    // Reserva a altura do cartão (invisível) quando a última consulta teve contagem aberta: evita o salto do hero.
    let lembrado = false;
    try { lembrado = globalThis.localStorage?.getItem('func-cartao-aberto') === '1'; } catch (err) { lembrado = false; }
    if (lembrado && cartao.hidden) {
      cartao.hidden = false;
      cartao.classList?.add('func-aberta-reservando');
    }
    let sessao = null;
    try {
      const lista = await API.get('/contagens?status=em_andamento&limit=1');
      const primeira = lista?.success && lista.data?.contagens?.[0];
      if (primeira?.id) {
        const det = await API.get(`/contagens/${encodeURIComponent(primeira.id)}`);
        const contagem = det?.success && det.data?.contagem;
        if (contagem && contagem.status === 'em_andamento') {
          let total = 0;
          let contados = 0;
          (contagem.fornecedores || []).forEach((f) => (f.produtos || []).forEach((p) => {
            total++;
            if (p.quantidade_contada !== null && p.quantidade_contada !== undefined) contados++;
          }));
          sessao = { id: contagem.id, total, contados };
        }
      }
    } catch (err) {
      sessao = null;
    }
    if (requisicao !== this._reqCartao) return;
    cartao.setAttribute?.('aria-busy', 'false');
    cartao.classList?.remove('func-aberta-reservando');
    cartao.hidden = !sessao;
    try { globalThis.localStorage?.setItem('func-cartao-aberto', sessao ? '1' : '0'); } catch (err) { /* sem armazenamento */ }
    // Com o cartão "Retomar contagem" visível, o botão do hero passa a só iniciar uma nova contagem.
    const textoHero = document.getElementById('btn-iniciar-contagem-funcionario-texto');
    if (textoHero) textoHero.textContent = sessao ? 'Iniciar nova contagem' : 'Iniciar ou retomar contagem';
    if (!sessao) return;
    const texto = document.getElementById('func-contagem-aberta-texto');
    if (texto) texto.textContent = `Contagem em andamento: ${sessao.contados} de ${pluralizar(sessao.total, 'produto')} ${sessao.total === 1 ? 'contado' : 'contados'}`;
    const botao = document.getElementById('func-contagem-aberta-btn');
    if (botao) {
      botao.dataset = botao.dataset || {};
      botao.dataset.id = String(sessao.id);
      botao.setAttribute?.('data-id', String(sessao.id));
    }
  },

  /**
   * Badge de estado do item: corrigir, digitado (falta salvar), salvo ou pendente.
   * Não usa saldo de referência.
   */
  htmlStatusItem(p, invalido) {
    // Cada estado tem forma própria além da cor (no celular o selo vira um ponto): corrigir = "!", digitado = lápis,
    // salvo = check, pendente = anel vazio. O texto continua disponível para leitor de tela e como dica (title).
    if (invalido) return '<span class="badge badge-danger" data-estado="invalido" title="Corrigir quantidade"><i class="ti ti-alert-circle" aria-hidden="true"></i> Corrigir quantidade</span>';
    const preenchido = p.quantidade_contada !== null && p.quantidade_contada !== undefined;
    if (preenchido && this.itensTocados.has(p.produto_id)) {
      return '<span class="badge badge-warning" data-estado="digitado" title="Digitado, falta salvar"><i class="ti ti-pencil" aria-hidden="true"></i> Digitado, falta salvar</span>';
    }
    if (preenchido) {
      return `<span class="badge badge-success" data-estado="salvo" title="Salvo"><i class="ti ti-check" aria-hidden="true"></i><span class="sr-only">Salvo: </span>${p.quantidade_contada} ${this.tipoAtual === 'pecas_queijo' ? 'peças' : 'un'}</span>`;
    }
    return '<span class="badge badge-neutral" data-estado="pendente" title="Pendente">Pendente</span>';
  },

  /**
   * Renderiza a lista de produtos do produtor selecionado (CONTAGEM CEGA)
   * NUNCA renderiza saldo do sistema, referência ou diferenças!
   */
  renderizarItensContagem() {
    const container = document.getElementById('lista-produtos-produtor');
    if (!container) return;

    container.innerHTML = this.itensFornecedor.map((p, index) => {
      const valorInput = p.fisicoTexto ?? (p.quantidade_contada ?? '');
      const fisicoInvalido = this.entradasInvalidas.has(index);

      const statusItem = this.htmlStatusItem(p, fisicoInvalido);
      const vencidos = this.tipoAtual === 'geral' ? `
        <div class="contagem-vencidos">
          <button type="button" class="btn btn-ghost btn-sm contagem-vencidos-toggle" data-click="contagem-vencidos-abrir" data-index="${index}" aria-expanded="${Boolean(p.vencidosAbertos)}" aria-controls="contagem-vencidos-campo-${index}" title="${p.vencidosAbertos ? 'Ocultar vencidos' : 'Informar vencidos'}"><i class="ti ti-calendar-x" aria-hidden="true"></i><span class="contagem-vencidos-toggle-texto">${p.vencidosAbertos ? 'Ocultar vencidos' : 'Informar vencidos'}</span><span class="sr-only"> de ${escapeHtml(p.nome)}</span></button>
          ${p.quantidade_vencida > 0 ? `<span class="badge badge-warning contagem-vencidos-qtd">${p.quantidade_vencida} vencidas</span>` : ''}
          <div id="contagem-vencidos-campo-${index}" class="contagem-vencidos-campo" ${p.vencidosAbertos ? '' : 'hidden'}>
            <label for="qtd-vencida-${index}">Quantidade vencida</label>
            <input id="qtd-vencida-${index}" class="input-qtd-vencida" type="number" inputmode="numeric" min="0" step="1" max="${p.quantidade_contada ?? 0}" value="${escapeHtml(p.vencidosTexto ?? p.quantidade_vencida)}" ${this._salvando ? 'disabled' : ''} aria-label="Quantidade vencida, ${escapeHtml(p.nome)}" aria-describedby="dica-vencidos-${index} erro-vencidos-${index}" aria-invalid="${this.entradasInvalidas.has(`vencidos-${index}`)}" data-input="contagem-vencidos-alterar" data-index="${index}">
            <small id="dica-vencidos-${index}" class="contagem-vencidos-dica">${MSG_VENCIDOS_INCLUIDOS}</small>
            <small id="erro-vencidos-${index}" class="contagem-vencidos-erro" role="alert">${this.entradasInvalidas.has(`vencidos-${index}`) ? MSG_VENCIDOS_INVALIDOS : ''}</small>
          </div>
        </div>` : '';

      return `
        <div class="produto-item contagem-item" id="item-contagem-${index}">
          <div class="contagem-item-info">
            <div class="contagem-item-nome">${escapeHtml(p.nome)}</div>
            <div class="contagem-item-sku">SKU: <code>${escapeHtml(p.codigo)}</code><span class="contagem-item-produtor"> &bull; Produtor: <strong>${escapeHtml(this.fornecedorAtual)}</strong></span></div>
          </div>

          <div class="contagem-item-controls">
            <div id="status-item-${index}" class="contagem-item-status">${statusItem}</div>
            <div class="contagem-item-campo">
              <label for="qtd-fisica-${index}" class="contagem-item-rotulo">${this.tipoAtual === 'pecas_queijo' ? 'Peças encontradas' : 'Quantidade física'}</label>
              <input id="qtd-fisica-${index}" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="${index === this.itensFornecedor.length - 1 ? 'done' : 'next'}"
                     ${this._salvando ? 'disabled' : ''}
                     placeholder="Contar"
                     value="${escapeHtml(valorInput)}"
                     class="input-qtd-fisica"
                     aria-label="${this.tipoAtual === 'pecas_queijo' ? 'Peças encontradas' : 'Quantidade física'}, ${escapeHtml(p.nome)}"
                     aria-invalid="${fisicoInvalido}" aria-describedby="contagem-quantidade-ajuda erro-fisico-${index}"
                     data-input="action-74" data-keydown="contagem-qtd-enter" data-arg-0="${escapeHtml(String(index))}">
              <small id="erro-fisico-${index}" class="contagem-vencidos-erro" role="alert">${fisicoInvalido ? 'Informe uma quantidade inteira maior ou igual a zero.' : ''}</small>
            </div>
            ${vencidos}
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
    const item = this.itensFornecedor[index];
    if (!item) return;
    if (this._salvando) {
      const input = document.getElementById(`qtd-fisica-${index}`);
      if (input) input.value = item.quantidade_contada ?? '';
      return;
    }
    this.edicaoPendente = true;
    this._ultimoCampoEditado = `qtd-fisica-${index}`;
    // Um input explícito também confirma recontagem com a mesma quantidade.
    this.itensTocados.add(item.produto_id);
    const limpo = valorStr.trim();
    item.fisicoTexto = limpo;
    const num = Number(limpo);
    const valido = limpo === '' || (/^\d+$/.test(limpo) && Number.isSafeInteger(num));
    const input = document.getElementById(`qtd-fisica-${index}`);
    input?.setCustomValidity?.(valido ? '' : 'Informe uma quantidade inteira maior ou igual a zero.');
    input?.setAttribute?.('aria-invalid', String(!valido));
    const erroFisico = document.getElementById(`erro-fisico-${index}`);
    if (erroFisico) erroFisico.textContent = valido ? '' : 'Informe uma quantidade inteira maior ou igual a zero.';
    const statusEl = document.getElementById(`status-item-${index}`);
    if (!valido) {
      this.entradasInvalidas.add(index);
      if (statusEl) statusEl.innerHTML = this.htmlStatusItem(item, true);
      return;
    }
    this.entradasInvalidas.delete(index);
    item.quantidade_contada = limpo === '' ? null : num;
    if (statusEl) statusEl.innerHTML = this.htmlStatusItem(item, false);
    const vencidosInput = document.getElementById(`qtd-vencida-${index}`);
    if (vencidosInput) vencidosInput.max = String(item.quantidade_contada ?? 0);
    this.validarVencidos(index);
  },

  /** Mantém só dígitos no campo de quantidade, preservando o cursor. Decimais coladas seguem para a validação. */
  filtrarDigitos(input) {
    const original = String(input?.value ?? '');
    if (/^\d*$/.test(original) || /^\d+[.,]\d+$/.test(original)) return original;
    const limpo = original.replace(/\D/g, '');
    const pos = input.selectionStart;
    input.value = limpo;
    if (typeof pos === 'number' && typeof input.setSelectionRange === 'function') {
      const novaPos = original.slice(0, pos).replace(/\D/g, '').length;
      try { input.setSelectionRange(novaPos, novaPos); } catch (err) { /* campo sem seleção */ }
    }
    return limpo;
  },

  /** Rola até o primeiro campo inválido da lista, foca e deixa o erro visível junto dele. */
  focarPrimeiroCampoInvalido() {
    const ids = [];
    this.itensFornecedor.forEach((_, index) => {
      if (this.entradasInvalidas.has(index)) ids.push(`qtd-fisica-${index}`);
      if (this.entradasInvalidas.has(`vencidos-${index}`)) {
        const campo = document.getElementById(`contagem-vencidos-campo-${index}`);
        if (campo?.hidden) campo.hidden = false;
        ids.push(`qtd-vencida-${index}`);
      }
    });
    const alvo = ids.length ? document.getElementById(ids[0]) : null;
    if (!alvo) return;
    alvo.scrollIntoView?.({ block: 'center' });
    alvo.focus?.();
    const erro = document.getElementById(ids[0].replace('qtd-fisica-', 'erro-fisico-').replace('qtd-vencida-', 'erro-vencidos-'));
    if (erro && !erro.textContent) erro.textContent = ids[0].startsWith('qtd-vencida') ? MSG_VENCIDOS_INVALIDOS : 'Informe uma quantidade inteira maior ou igual a zero.';
  },

  abrirVencidos(index) {
    if (this.tipoAtual !== 'geral' || !this.itensFornecedor[index]) return;
    this.itensFornecedor[index].vencidosAbertos = !this.itensFornecedor[index].vencidosAbertos;
    this.renderizarItensContagem();
    if (this.itensFornecedor[index].vencidosAbertos) {
      const campo = document.getElementById(`qtd-vencida-${index}`);
      campo?.focus();
      if (campo?.value === '0') campo.select?.();
    }
  },

  atualizarVencidos(index, valorStr) {
    if (this.tipoAtual !== 'geral' || this._salvando) return;
    const item = this.itensFornecedor[index];
    if (!item) return;
    this.edicaoPendente = true;
    this._ultimoCampoEditado = `qtd-vencida-${index}`;
    this.itensTocados.add(item.produto_id);
    const limpo = valorStr.trim();
    const valor = Number(limpo);
    item.vencidosTexto = limpo;
    item.quantidade_vencida = limpo === '' ? 0 : valor;
    this.validarVencidos(index, limpo);
  },

  validarVencidos(index, texto) {
    const item = this.itensFornecedor[index];
    if (!item || this.tipoAtual !== 'geral') return true;
    const valor = item.quantidade_vencida;
    const digitado = texto === undefined ? item.vencidosTexto : texto;
    const valido = (digitado === undefined || digitado === '' || /^(0|[1-9]\d*)$/.test(digitado)) && Number.isSafeInteger(valor) && valor >= 0 && (valor === 0 || (item.quantidade_contada !== null && valor <= item.quantidade_contada));
    const mensagem = valido ? '' : MSG_VENCIDOS_INVALIDOS;
    const input = document.getElementById(`qtd-vencida-${index}`);
    input?.setCustomValidity?.(mensagem);
    input?.setAttribute?.('aria-invalid', String(!valido));
    const erro = document.getElementById(`erro-vencidos-${index}`);
    if (erro) erro.textContent = mensagem;
    if (valido) this.entradasInvalidas.delete(`vencidos-${index}`);
    else this.entradasInvalidas.add(`vencidos-${index}`);
    return valido;
  },

  /**
   * Salva o progresso da contagem do produtor atual
   */
  async salvarProgressoAtual() {
    if (this._salvando) return false;
    if (!this.fornecedorAtual) return false;
    this.itensFornecedor.forEach((_, index) => this.validarVencidos(index));
    if (this.entradasInvalidas.size) {
      this.focarPrimeiroCampoInvalido();
      showToast('Informe quantidades inteiras maiores ou iguais a zero.', 'error');
      return false;
    }
    if (this.itensTocados.size === 0) {
      showToast('Não há alterações para salvar. A janela foi fechada.', 'info');
      const produtorAtual = this.fornecedorAtual;
      this.fecharFornecedor();
      this.focarCardProdutor(produtorAtual);
      return true;
    }

    this._salvando = true;
    this.bloquearEdicaoDuranteSalvamento(true);
    const btn = document.getElementById('btn-salvar-progresso-produtor');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Salvando...';
    }

    const payload = {
      fornecedor: this.fornecedorAtual,
      itens: this.itensFornecedor.filter(p => this.itensTocados.has(p.produto_id)).map((p) => ({
        produto_id: p.produto_id,
        quantidade_contada: p.quantidade_contada,
        ...(this.tipoAtual === 'geral' ? { quantidade_vencida: p.quantidade_vencida } : {})
      }))
    };

    try {
      let res;
      try { res = await API.put(`/contagens/${this.contagemId}/salvar-progresso`, payload); }
      catch (err) { res = null; }
      if (this.tratarContagemApagada(res)) return false;
      if (!res || !res.success) {
        showToast(res?.message || 'Não foi possível salvar as quantidades. Tente novamente.', 'error');
        return false;
      }

      showToast(`Contagem de ${this.fornecedorAtual} salva.`, 'success');
      this.edicaoPendente = false;
      this.itensTocados.clear();
      // O snapshot local também passa a refletir o que o servidor confirmou.
      const fornecedor = this.dadosSessao?.fornecedores?.find(f => f.fornecedor === this.fornecedorAtual);
      for (const produto of fornecedor?.produtos || []) {
        const salvo = payload.itens.find(p => p.produto_id === produto.produto_id);
        if (salvo) { produto.quantidade_contada = salvo.quantidade_contada; if (this.tipoAtual === 'geral') produto.quantidade_vencida = salvo.quantidade_vencida; }
      }
      try { await this.carregarDadosContagem(); }
      catch (err) { showToast('As quantidades foram salvas, mas a tela não foi atualizada. Reabra a contagem para conferir.', 'error'); }
      const salvoFornecedor = payload.fornecedor;
      this.fecharFornecedor();
      this.focarCardProdutor(salvoFornecedor);
      return true;
    } finally {
      this._salvando = false;
      this.bloquearEdicaoDuranteSalvamento(false);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar contagem do produtor';
      }
    }
  },

  /**
   * Devolve o foco ao cartão do produtor salvo; se ele já está concluído, ao próximo
   * produtor pendente (a lista é redesenhada e o botão de origem some do DOM).
   */
  focarCardProdutor(fornecedor) {
    const cards = [...document.querySelectorAll('#lista-produtores-cards .contagem-produtor-card')];
    const indice = cards.findIndex((c) => c.dataset.produtor === fornecedor);
    let alvo = cards[indice] || null;
    if (alvo && alvo.classList.contains('is-complete')) {
      const proximo = [...cards.slice(indice + 1), ...cards.slice(0, indice)].find((c) => !c.classList.contains('is-complete'));
      if (proximo) alvo = proximo;
    }
    const destino = alvo || cards[0];
    if (!destino || typeof destino.focus !== 'function') return;
    destino.focus();
    // O fechamento do diálogo pode devolver o foco ao elemento antigo no mesmo ciclo: reforça depois.
    setTimeout(() => {
      const ativo = document.activeElement;
      if ((!ativo || ativo === document.body) && document.contains(destino)) destino.focus();
    }, 0);
  },

  bloquearEdicaoDuranteSalvamento(bloquear) {
    for (const selector of ['.input-qtd-fisica', '.input-qtd-vencida', '.contagem-vencidos button', '.contagem-edicao-acao']) {
      document.querySelectorAll(selector).forEach(element => { element.disabled = bloquear; });
    }
  },

  /**
   * Finaliza a sessão de contagem cega
   */
  async finalizarSessao() {
    if (!this.contagemId) return;
    if (this.protegerEdicao(() => this.finalizarSessao())) return;

    // Verificar se há itens não contados
    let totalNaoContados = 0;
    let totalVencidosInformados = 0;
    (this.dadosSessao?.fornecedores || []).forEach((f) => {
      (f.produtos || []).forEach((p) => {
        if (p.quantidade_contada === null || p.quantidade_contada === undefined) {
          totalNaoContados++;
        }
        if (this.tipoAtual !== 'pecas_queijo') totalVencidosInformados += Number(p.quantidade_vencida || 0);
      });
    });

    const pecas = this.tipoAtual === 'pecas_queijo';
    let confirmTitulo = 'Finalizar contagem?';
    let confirmMsg = pecas
      ? 'Depois de finalizar, as quantidades não poderão ser alteradas.'
      : 'Depois de finalizar, as quantidades não poderão ser alteradas e a comparação com o saldo do sistema será exibida.';
    if (totalNaoContados > 0) {
      confirmTitulo = totalNaoContados === 1
        ? 'Finalizar com 1 produto sem contar?'
        : `Finalizar com ${totalNaoContados} produtos sem contar?`;
      confirmMsg = `${totalNaoContados === 1 ? 'Ele não entrará' : 'Eles não entrarão'} no resultado desta contagem. Depois de finalizar, as quantidades não poderão ser alteradas.`;
    }
    if (totalVencidosInformados > 0) {
      confirmMsg += ` Você informou ${pluralizar(totalVencidosInformados, 'unidade vencida', 'unidades vencidas')}: elas viram baixa no saldo do sistema e isso não pode ser desfeito.`;
    }

    const confirmado = await confirmarAcao({
      titulo: confirmTitulo,
      mensagem: confirmMsg,
      confirmar: 'Finalizar contagem',
      cancelar: 'Continuar contando',
      perigo: totalNaoContados > 0 || totalVencidosInformados > 0
    });
    if (!confirmado) return;

    const btn = document.getElementById('btn-finalizar-contagem');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Finalizando e comparando...';
    }

    const res = await API.put(`/contagens/${this.contagemId}/finalizar`, {});

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-flag-check"></i> Finalizar e comparar';
    }

    if (this.tratarContagemApagada(res)) return;
    if (!res || !res.success) {
      showToast(res?.message || 'Não foi possível finalizar a contagem. Tente novamente.', 'error');
      return;
    }

    if (typeof Semana !== 'undefined') Semana.invalidar();
    showToast(this.tipoAtual === 'pecas_queijo'
      ? 'Contagem de peças finalizada. Confira as quantidades registradas.'
      : 'Contagem finalizada. Confira as diferenças encontradas.', 'success');
    const idFinalizada = this.contagemId;
    this.naoContadosResultado = { id: idFinalizada, total: totalNaoContados };
    this.resultadoId = idFinalizada;
    this.contagemId = null;
    this.exibirResultado(idFinalizada);
  },

  /**
   * Exibe tela de resultados adaptada estritamente ao perfil do usuário
   */
  async exibirResultado(contagemId) {
    const targetId = contagemId || this.resultadoId || this.contagemId;
    if (!targetId) return;

    const res = await API.get(`/contagens/${targetId}`);
    if (!res || !res.success || !res.data?.contagem) {
      showToast('Não foi possível carregar os resultados da contagem.', 'error');
      showScreen('screen-home');
      return;
    }

    const c = res.data.contagem;
    this.resultadoId = c.id || targetId;

    const cardEl = document.getElementById('resultado-status-card');
    const metricasEl = document.getElementById('resultado-metricas');
    const listaDivergenciasEl = document.getElementById('resultado-divergencias');

    const pecas = c.tipo === 'pecas_queijo';
    const produtos = (c.fornecedores || []).flatMap(f => f.produtos || []);
    const temDiferenca = (p) => !pecas && (p.situacao === 'falta' || p.situacao === 'sobra' || Number(p.diferenca) < 0 || Number(p.diferenca) > 0);
    const totalDivergentes = produtos.filter(temDiferenca).length;
    const temDif = !pecas && (c.tem_diferenca || totalDivergentes > 0);
    const totalVencidos = pecas ? 0 : produtos.reduce((n, p) => n + Number(p.quantidade_vencida || 0), 0);
    const totalBaixado = pecas ? 0 : produtos.reduce((n, p) => n + Number(p.quantidade_vencida_baixada || 0), 0);
    const temVencidos = totalVencidos > 0;
    // Filtro "Só diferenças" começa ligado quando há o que revisar.
    this.resultadoSoDiferencas = totalDivergentes > 0;

    if (cardEl) {
      cardEl.className = 'resultado-card neutro';
      const tituloDif = totalDivergentes === 1 ? 'Contagem finalizada: 1 item com diferença' : `Contagem finalizada: ${totalDivergentes} itens com diferença`;
      const botaoRelatorio = (primario) => `
          <button class="btn ${primario ? 'btn-primary' : 'btn-outline'}" data-click="action-75" data-arg-0="${escapeHtml(c.id)}">
            <i class="ti ti-file-spreadsheet" aria-hidden="true"></i> ${temDif ? 'Baixar relatório de diferenças' : 'Baixar relatório da contagem'} (.xlsx)
          </button>`;
      cardEl.innerHTML = pecas ? '<i class="ti ti-package" aria-hidden="true"></i><span class="resultado-eyebrow">Contagem finalizada</span><div role="status" aria-live="polite"><h2 tabindex="-1" aria-level="1">Peças de queijo</h2></div><p>Quantidades de peças registradas. O saldo em kg não é comparado.</p>' : `
        <i class="ti ${temDif ? 'ti-list-search' : 'ti-circle-check'}" aria-hidden="true"></i>
        <div role="status" aria-live="polite"><h2 tabindex="-1" aria-level="1">${temDif ? tituloDif : 'Contagem finalizada: sem diferenças'}</h2></div>
        <p>${temDif
          ? 'Algumas quantidades físicas não correspondem ao saldo do sistema. Revise as diferenças abaixo.'
          : temVencidos ? 'Contagem conferida com produtos vencidos: as quantidades conferem e as unidades vencidas registradas são detalhadas abaixo.' : 'Todas as quantidades registradas correspondem ao saldo do sistema.'}
        </p>
        ${temDif || temVencidos ? `<div class="resultado-acoes">
          ${temDif ? `<button class="btn btn-primary" data-click="resultado-revisar"><i class="ti ti-arrow-down" aria-hidden="true"></i> Revisar diferenças</button>` : ''}
          ${botaoRelatorio(!temDif)}
        </div>` : ''}
      `;
    }

    // Apuração das métricas
    let totalItens = 0;
    let totalFaltas = 0;
    let totalSobras = 0;
    let totalIguais = 0;
    const naoContados = this.naoContadosResultado && this.naoContadosResultado.id === (c.id || targetId)
      ? Number(this.naoContadosResultado.total || 0) : 0;

    (c.fornecedores || []).forEach((f) => {
      (f.produtos || []).forEach((p) => {
        totalItens++;
        if (p.situacao === 'falta' || p.diferenca < 0) totalFaltas++;
        else if (p.situacao === 'sobra' || p.diferenca > 0) totalSobras++;
        else totalIguais++;
      });
    });

    if (metricasEl) {
      metricasEl.innerHTML = pecas ? `<div class="metrica"><div class="metrica-valor">${totalItens}</div><div class="metrica-label">Itens Contados</div></div><div class="metrica"><div class="metrica-valor">${(c.fornecedores || []).flatMap(f => f.produtos || []).reduce((n, p) => n + Number(p.quantidade_contada || 0), 0)}</div><div class="metrica-label">Quantidade de peças</div></div>` : `
        <div class="metrica metrica-destaque${totalFaltas > 0 ? ' metrica-falta' : ''}">
          <div class="metrica-valor">${totalFaltas}</div>
          <div class="metrica-label">${totalFaltas === 1 ? 'Produto em falta' : 'Produtos em falta'}</div>
        </div>
        <div class="metrica metrica-destaque${totalSobras > 0 ? ' metrica-sobra' : ''}">
          <div class="metrica-valor">${totalSobras}</div>
          <div class="metrica-label">${totalSobras === 1 ? 'Produto com sobra' : 'Produtos com sobra'}</div>
        </div>
        <div class="metrica metrica-secundaria">
          <div class="metrica-valor">${totalIguais}</div>
          <div class="metrica-label">Sem diferença</div>
        </div>
        <div class="metrica metrica-secundaria">
          <div class="metrica-valor">${totalItens}</div>
          <div class="metrica-label">Produtos contados</div>
        </div>
        <div class="metrica metrica-secundaria">
          <div class="metrica-valor">${c.fornecedores?.length || 0}</div>
          <div class="metrica-label">${(c.fornecedores?.length || 0) === 1 ? 'Produtor' : 'Produtores'}</div>
        </div>
        <div class="metrica metrica-secundaria"><div class="metrica-valor">${totalVencidos}</div><div class="metrica-label">Unidades vencidas</div></div>
        ${totalVencidos > totalBaixado ? `<div class="metrica metrica-secundaria"><div class="metrica-valor">${totalBaixado}</div><div class="metrica-label">Baixa efetiva</div></div><div class="metrica metrica-secundaria"><div class="metrica-valor">${totalVencidos - totalBaixado}</div><div class="metrica-label">Não descontadas</div></div>` : ''}
        ${naoContados > 0 ? `<p class="metricas-resumo">${naoContados === 1 ? '1 produto não contado' : `${naoContados} produtos não contados`}, fora deste resultado.</p>` : ''}
      `;
    }

    // Renderização dos Itens (RESPEITANDO RBAC)
    if (listaDivergenciasEl) {
      // Divergentes primeiro, dentro de cada produtor e entre produtores (ordem original como desempate).
      const ordenados = (c.fornecedores || []).map((f, i) => ({
        f,
        i,
        produtos: (f.produtos || []).map((p, j) => ({ p, j })).sort((a, b) => (Number(temDiferenca(b.p)) - Number(temDiferenca(a.p))) || (a.j - b.j)).map((x) => x.p)
      })).sort((a, b) => (Number(b.produtos.some(temDiferenca)) - Number(a.produtos.some(temDiferenca))) || (a.i - b.i));
      const secoes = ordenados.map(({ f, produtos: listaOrdenada }) => {
        const produtosHtml = listaOrdenada.map((p) => {
          let badgeSituacao;
          if (pecas) { badgeSituacao = ''; } else if (p.diferenca === 0 || p.situacao === 'sem_diferenca') {
            badgeSituacao = '<span class="badge badge-success"><i class="ti ti-check"></i> Sem diferença</span>';
          } else if (p.diferenca > 0 || p.situacao === 'sobra') {
            badgeSituacao = `<span class="badge badge-warning"><i class="ti ti-arrow-up"></i> Sobra de ${p.diferenca} un</span>`;
          } else {
            badgeSituacao = `<span class="badge badge-danger"><i class="ti ti-arrow-down"></i> Falta de ${Math.abs(p.diferenca)} un</span>`;
          }

          const colunaReferencia = !pecas && c.status === 'finalizada' && p.estoque_referencia !== undefined
            ? `<span>Saldo de referência: <strong>${escapeHtml(p.estoque_referencia)}</strong></span>`
            : '';
          const vencidas = Number(p.quantidade_vencida || 0);
          const baixadas = Number(p.quantidade_vencida_baixada || 0);
          const saldoApos = p.estoque_antes_baixa_vencidos == null ? null : Number(p.estoque_antes_baixa_vencidos) - baixadas;
          const colunaVencidos = !pecas && c.status === 'finalizada' && vencidas > 0
            ? `<span>Vencidas: <strong>${vencidas}</strong></span><span>Baixa efetiva: <strong>${baixadas}</strong></span><span>Saldo após a baixa: <strong>${saldoApos ?? '—'}</strong></span>${vencidas > baixadas ? `<span class="badge badge-warning">Baixa limitada: ${vencidas - baixadas} não descontadas</span>` : ''}` : '';

          const divergente = temDiferenca(p);
          return `
            <div class="resultado-produto${divergente ? ' is-divergente' : ''}" data-divergente="${divergente ? '1' : '0'}"${this.resultadoSoDiferencas && !divergente ? ' hidden' : ''}>
              <div class="info">
                <strong>${escapeHtml(p.nome)}</strong>
                <div class="resultado-produto-sku">SKU: <code>${escapeHtml(p.codigo)}</code></div>
              </div>

              <div class="valores">
                ${colunaReferencia}
                <span>${pecas ? 'Quantidade de peças' : 'Quantidade física'}: <strong>${p.quantidade_contada !== null ? p.quantidade_contada : 0}</strong></span>
                ${colunaVencidos}
                <div>${badgeSituacao}</div>
              </div>
            </div>
          `;
        }).join('');

        const semDivergencia = this.resultadoSoDiferencas && !listaOrdenada.some(temDiferenca);
        return `
          <div class="resultado-fornecedor"${semDivergencia ? ' hidden' : ''}>
            <div class="resultado-fornecedor-header">
              <i class="ti ti-truck" aria-hidden="true"></i>
              <span>${escapeHtml(f.fornecedor)}</span>
            </div>
            ${produtosHtml}
          </div>
        `;
      }).join('');

      const barra = !pecas && totalDivergentes > 0 ? `
        <div class="resultado-lista-barra">
          <h3 id="resultado-lista-titulo" tabindex="-1">Itens contados</h3>
          <div class="resultado-filtro" role="group" aria-label="Filtrar itens do resultado">
            <button type="button" class="historico-chip" data-click="resultado-filtro" data-modo="diferencas" aria-pressed="true">Só diferenças (${totalDivergentes})</button>
            <button type="button" class="historico-chip" data-click="resultado-filtro" data-modo="todos" aria-pressed="false">Ver tudo (${produtos.length})</button>
          </div>
          <span id="resultado-filtro-contador" class="historico-contagem" role="status" aria-live="polite">Mostrando ${totalDivergentes} de ${produtos.length} itens</span>
        </div>` : '';
      listaDivergenciasEl.innerHTML = barra + secoes;
      this._resultadoTotais = { divergentes: totalDivergentes, total: produtos.length };
    }

    showScreen('screen-resultado');
    // Foco no título do resultado (o botão de finalizar saiu da tela)
    cardEl?.querySelector('h2')?.focus({ preventScroll: true });
  },

  /** Alterna "Só diferenças" / "Ver tudo" sem nova consulta: os itens já estão na tela. */
  filtrarResultado(modo) {
    const lista = document.getElementById('resultado-divergencias');
    if (!lista?.querySelectorAll) return;
    const soDiferencas = modo !== 'todos';
    this.resultadoSoDiferencas = soDiferencas;
    lista.querySelectorAll('.resultado-produto').forEach((linha) => {
      linha.hidden = soDiferencas && linha.dataset.divergente !== '1';
    });
    lista.querySelectorAll('.resultado-fornecedor').forEach((secao) => {
      secao.hidden = soDiferencas && !secao.querySelector('.resultado-produto[data-divergente="1"]');
    });
    lista.querySelectorAll('[data-click="resultado-filtro"]').forEach((botao) => {
      botao.setAttribute('aria-pressed', String((botao.dataset.modo === 'diferencas') === soDiferencas));
    });
    const totais = this._resultadoTotais || { divergentes: 0, total: 0 };
    const contador = document.getElementById('resultado-filtro-contador');
    if (contador) contador.textContent = `Mostrando ${soDiferencas ? totais.divergentes : totais.total} de ${totais.total} itens`;
  },

  /** "Revisar diferenças": rola até a lista e leva o foco ao título dela. */
  revisarDiferencas() {
    const alvo = document.getElementById('resultado-lista-titulo') || document.getElementById('resultado-divergencias');
    alvo?.scrollIntoView?.({ block: 'start' });
    try { alvo?.focus?.({ preventScroll: true }); } catch (err) { alvo?.focus?.(); }
  },

  async baixarExcelDiferencas(id) {
    const res = await API.get(`/contagens/${encodeURIComponent(id)}`);
    if (!res?.success || res.data?.contagem?.tipo === 'pecas_queijo') return;
    const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
    API.download(`/relatorios/contagens/${id}/excel`, `diferenca_estoque_${dataAtual}.xlsx`);
  }
};
