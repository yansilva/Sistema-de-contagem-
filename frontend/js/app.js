/**
 * Orquestrador Principal do Frontend (Inventory Management System)
 */

/** Elemento visível (display/visibility computados) */
function elementoVisivel(el) {
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/** Primeiro modal realmente visível (.modal ou .app-modal), ou null */
function modalAberto() {
  return [...document.querySelectorAll('.modal, .app-modal')].find(elementoVisivel) || null;
}

/** Ajuda contextual (modal-ajuda). Funciona logado e deslogado. */
const AJUDA_CONTEXTUAL = {
  'screen-contagem': [
    '"Digitado, falta salvar" quer dizer que você digitou a quantidade, mas ela ainda não foi gravada.',
    'Use Salvar contagem do produtor para gravar. Dá para parar e retomar depois, do ponto em que ficou.',
    'Escolha o produtor ou use a busca, conte o físico e digite a quantidade. Ao finalizar, você vê as sobras e faltas.',
    'Informar vencidos (só na contagem geral, não na de peças de queijo): o vencido já está incluído na quantidade física contada.'
  ],
  'screen-resultado': [
    'Sobra: foi contado mais do que o saldo de referência.',
    'Falta: foi contado menos do que o saldo de referência.'
  ],
  'screen-importar-estoque': [
    'Passo 1: escolha o PDF do relatório de estoque do ERP.',
    'Passo 2: confira a prévia. Só os SKUs ativos já cadastrados são atualizados e nada é criado.',
    'Passo 3: confirme para aplicar.',
    'Quem tem permissão de administrador importa o catálogo (.xlsx) na aba Produtos, onde pode mesclar ou substituir.'
  ],
  'screen-home': [
    'Aqui você inicia uma contagem nova ou retoma uma que ficou em andamento.',
    'Catálogo, Produtores, Semana e Histórico ficam nos atalhos desta tela.'
  ],
  'screen-home:admin': [
    'Inicie uma contagem nova ou retome uma em andamento. Na contagem, o saldo do sistema só aparece depois de finalizar.',
    'Importe o saldo de estoque (PDF) e o catálogo de produtos (.xlsx) pelos atalhos de importação.',
    'No Back-office, a aba Histórico permite apagar contagens em aberto.'
  ],
  'screen-home:visao-geral': [
    'Mostra as métricas gerais das empresas clientes da plataforma.',
    'Use os atalhos desta tela para ir às empresas e à auditoria global.'
  ],
  'screen-home:tenants': [
    'Crie uma empresa nova e abra os detalhes de cada uma pela lista.',
    'Inativar uma empresa encerra na hora todas as sessões dela.'
  ],
  'screen-modalidade-contagem': [
    'Escolha a modalidade: Produtos gerais ou Peças de queijo.',
    'Inicie uma sessão nova ou retome uma sessão aberta da lista. Você pode parar e continuar depois.'
  ],
  'screen-catalogo': [
    'Lista os produtos cadastrados com código, nome e produtor.',
    'Busque por código ou nome. Você também pode filtrar por produtor.'
  ],
  'screen-produtores': [
    'Lista os produtores cadastrados.',
    'Use a busca para achar um produtor e ver os produtos dele no Catálogo.'
  ],
  'screen-historico-contagens': [
    'Mostra as contagens recentes, as finalizadas e as que ainda estão em andamento.',
    'Abra uma contagem para ver os detalhes. Use Anterior e Próxima para navegar entre as páginas.'
  ],
  'screen-semana-contagem': [
    'Mostra o que já foi contado na semana, em sessões finalizadas.',
    'Use Atualizar semana para recarregar os dados.'
  ],
  'screen-backoffice:usuarios': [
    'Crie funcionários e use Redefinir senha temporária quando alguém esquecer a senha.',
    'Desativar um funcionário bloqueia o acesso dele ao sistema.'
  ],
  'screen-backoffice:historico': [
    'Lista as contagens da empresa, finalizadas e em andamento.',
    'Contagens em andamento têm o botão Apagar. Apagar é definitivo e o progresso do funcionário se perde.'
  ],
  'screen-backoffice:config': [
    'Aqui você altera a senha da sua conta.',
    'Use uma senha nova que você não use em outros lugares.'
  ],
  'screen-home:auditoria-global': [
    'Mostra eventos de segurança, acessos e alterações de toda a plataforma.',
    'Use os filtros para achar um registro e Exportar CSV para levar a lista.'
  ],
  'screen-backoffice:produtos': [
    'Importar catálogo (.xlsx) pode mesclar com o catálogo atual ou substituí-lo por completo.',
    'Mesclar atualiza e adiciona produtos sem excluir os outros. Substituir apaga o que não está na planilha.'
  ],
  'screen-backoffice:estoque': [
    'O PDF do ERP atualiza só os SKUs ativos que já estão cadastrados.',
    'Você vê uma prévia e confirma antes de aplicar qualquer mudança.'
  ],
  'screen-backoffice:atividades': [
    'Mostra quem fez o quê na sua empresa, com data e resultado.',
    'Use os filtros de data, ação e resultado para achar um registro.'
  ],
  'screen-empresas': [
    'Inativar uma empresa encerra na hora todas as sessões dela.',
    'Reativar libera novos acessos, mas as sessões antigas continuam inválidas.'
  ]
};

function preencherAjudaContextual() {
  const secao = document.getElementById('ajuda-contextual');
  const lista = document.getElementById('ajuda-contextual-lista');
  if (!secao || !lista) return;
  const tela = document.querySelector('.screen.active')?.id || '';
  let aba = '';
  if (tela === 'screen-backoffice') {
    aba = document.querySelector('#screen-backoffice .tab.active')?.getAttribute('data-tab') || '';
  } else if (tela === 'screen-home') {
    // Mesma tela para três perfis: funcionário (sem sufixo), administrador e abas do console
    const papel = typeof Auth !== 'undefined' ? Auth.usuario?.papel : '';
    if (papel === 'super_admin') aba = document.querySelector('.saas-nav-btn.active[data-saas-tab]')?.getAttribute('data-saas-tab') || '';
    else if (typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin()) aba = 'admin';
  }
  let linhas = AJUDA_CONTEXTUAL[aba ? `${tela}:${aba}` : tela] || [];
  // Importar catálogo (.xlsx) é da administração: o funcionário vê só o passo a passo do PDF
  const ehAdmin = typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin();
  if (tela === 'screen-importar-estoque' && !ehAdmin) linhas = linhas.filter((l) => !/\.xlsx/.test(l));
  lista.textContent = '';
  linhas.forEach((texto) => {
    const li = document.createElement('li');
    li.textContent = texto;
    lista.appendChild(li);
  });
  secao.hidden = linhas.length === 0;
  // Super Admin não faz contagem: mostra só "Nesta tela" e os atalhos
  const superAdmin = typeof Auth !== 'undefined' && Auth.usuario?.papel === 'super_admin';
  const blocoContagem = document.getElementById('ajuda-contagem');
  // Na tela de contagem o bloco "Nesta tela" já traz os passos: o resumo repetiria a informação
  if (blocoContagem) blocoContagem.hidden = superAdmin || tela === 'screen-contagem';
  const atalhoContagem = document.getElementById('ajuda-atalho-contagem');
  if (atalhoContagem) atalhoContagem.hidden = superAdmin;
  const titulo = document.getElementById('modal-ajuda-titulo');
  if (titulo) titulo.textContent = superAdmin ? 'Ajuda' : 'Como funciona a contagem';
}

/** Campos de quantidade com "0": ao focar, seleciona o conteúdo para que digitar substitua o zero. */
document.addEventListener('focusin', (event) => {
  const campo = event.target;
  const classes = campo && campo.classList;
  if (!classes || !(classes.contains('input-qtd-vencida') || classes.contains('input-qtd-fisica'))) return;
  if (campo.value !== '0' || typeof campo.select !== 'function') return;
  try { campo.select(); } catch (e) { /* tipo sem seleção */ }
});

/** Sugere os produtores já cadastrados no campo do modal Novo Produto (a entrada continua livre). */
document.addEventListener('focusin', async (event) => {
  if (event.target?.id !== 'prod-fornecedor') return;
  const datalist = document.getElementById('lista-produtores');
  if (!datalist || typeof API === 'undefined') return;
  const res = await API.get('/produtos/fornecedores');
  const nomes = res?.data?.fornecedores;
  if (!Array.isArray(nomes)) return;
  datalist.textContent = '';
  nomes.forEach((nome) => {
    const texto = typeof nome === 'string' ? nome : nome?.fornecedor || nome?.nome;
    if (!texto) return;
    const opcao = document.createElement('option');
    opcao.value = texto;
    datalist.appendChild(opcao);
  });
});

function abrirAjuda() {
  const modal = document.getElementById('modal-ajuda');
  if (!modal) return;
  preencherAjudaContextual();
  modal.hidden = false;
  modal.style.display = 'flex';
}

function fecharAjuda() {
  const modal = document.getElementById('modal-ajuda');
  if (!modal) return;
  modal.style.display = 'none';
  modal.hidden = true;
  // Se o gatilho original (botão da barra) está oculto, como no menu do celular, o gerenciador
  // não consegue devolver o foco: usa o botão do menu hambúrguer.
  setTimeout(() => {
    const ativo = document.activeElement;
    if (ativo && ativo !== document.body && document.contains(ativo) && elementoVisivel(ativo)) return;
    const toggle = document.getElementById('mobile-nav-toggle');
    if (toggle && !toggle.hidden && elementoVisivel(toggle)) toggle.focus();
  }, 0);
}

/**
 * Gerenciador genérico de modais: role/aria, foco inicial e retorno de foco.
 * Reage só a class/style; os atributos que ele mesmo define não disparam o observer.
 */
function iniciarGerenciadorModais() {
  const estado = new WeakMap(); // modal -> { visivel, anterior }
  const SELETOR_FOCAVEL = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

  const ao_mudar = (modal) => {
    const visivel = elementoVisivel(modal);
    const st = estado.get(modal) || { visivel: false, anterior: null };
    if (visivel === st.visivel) return;
    st.visivel = visivel;
    estado.set(modal, st);

    if (visivel) {
      st.anterior = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      if (!modal.hasAttribute('aria-labelledby') && !modal.hasAttribute('aria-label')) {
        const titulo = modal.querySelector('h2, h3');
        if (titulo) {
          if (titulo.id) modal.setAttribute('aria-labelledby', titulo.id);
          else if (titulo.textContent.trim()) modal.setAttribute('aria-label', titulo.textContent.trim());
        }
      }
      // Prioridade: foco explícito (data-foco-inicial), depois primeiro campo, por fim qualquer focável
      const marcado = modal.querySelector('[data-foco-inicial]');
      const campo = (marcado && elementoVisivel(marcado) ? marcado : null)
        || [...modal.querySelectorAll('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')].find(elementoVisivel)
        || [...modal.querySelectorAll(SELETOR_FOCAVEL)].find(elementoVisivel);
      if (campo) {
        campo.focus();
      } else {
        if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
        modal.focus();
      }
    } else {
      const anterior = st.anterior;
      st.anterior = null;
      if (anterior && document.contains(anterior) && typeof anterior.focus === 'function') anterior.focus();
    }
  };

  const observer = new MutationObserver((muts) => {
    muts.forEach(m => ao_mudar(m.target));
  });
  const registrar = (modal) => {
    if (estado.has(modal)) return;
    estado.set(modal, { visivel: elementoVisivel(modal), anterior: null });
    observer.observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });
  };
  document.querySelectorAll('.modal, .app-modal').forEach(registrar);

  // Modais criados depois do carregamento
  new MutationObserver((muts) => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches('.modal, .app-modal')) registrar(n);
      n.querySelectorAll && n.querySelectorAll('.modal, .app-modal').forEach(registrar);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Diálogo de confirmação próprio (substitui window.confirm).
 * Sem `acoes`: devolve Promise<boolean> (true = confirmou). Foco inicial em "Cancelar".
 * Com `acoes: [{rotulo, valor, perigo, padrao}]`: devolve o `valor` da ação escolhida,
 * ou false se cancelar/Esc. A ação com `padrao: true` recebe o foco inicial.
 */
let _confirmacaoPendente = null;
function confirmarAcao({ titulo = 'Confirmar ação', mensagem = '', confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false, acoes = null } = {}) {
  const modal = document.getElementById('modal-confirmacao');
  if (!modal) return Promise.resolve(false);
  if (_confirmacaoPendente) _confirmacaoPendente(false);

  return new Promise((resolve) => {
    const area = document.getElementById('modal-confirmacao-acoes');
    document.getElementById('modal-confirmacao-titulo').textContent = titulo;
    document.getElementById('modal-confirmacao-mensagem').textContent = mensagem;
    area.textContent = '';
    modal.querySelectorAll('[data-foco-inicial]').forEach(el => el.removeAttribute('data-foco-inicial'));

    const lista = Array.isArray(acoes) && acoes.length
      ? acoes
      : [{ rotulo: confirmar, valor: true, perigo: !!perigo }];
    const temPadrao = lista.some(a => a.padrao);

    // Um <dialog> aberto com showModal() fica na top layer e deixa o resto da página inerte:
    // o confirmar precisa viver dentro dele enquanto estiver aberto.
    const origem = modal.parentNode;
    const abertos = document.querySelectorAll ? [...document.querySelectorAll('dialog[open]')] : [];
    const dialogAberto = abertos.length ? abertos[abertos.length - 1] : null;
    const aoCancelarDialog = (e) => e.preventDefault();

    const fechar = (valor) => {
      document.removeEventListener('keydown', aoTeclar, true);
      document.removeEventListener('cancel', aoCancelarDialog, true);
      _confirmacaoPendente = null;
      modal.style.display = 'none';
      if (dialogAberto && modal.parentNode === dialogAberto && origem && origem !== dialogAberto) origem.appendChild(modal);
      resolve(valor);
    };
    const aoTeclar = (e) => {
      if (e.key === 'Tab') {
        const botoes = [...modal.querySelectorAll('button:not(:disabled)')].filter(elementoVisivel);
        if (!botoes.length) return;
        const primeiro = botoes[0];
        const ultimo = botoes[botoes.length - 1];
        const ativo = document.activeElement;
        if (!modal.contains(ativo)) { e.preventDefault(); primeiro.focus(); }
        else if (e.shiftKey && ativo === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus(); }
        return;
      }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      fechar(false);
    };
    const criar = (rotulo, valor, classe, foco) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${classe}`;
      b.textContent = rotulo;
      if (foco) b.setAttribute('data-foco-inicial', '');
      b.addEventListener('click', () => fechar(valor));
      area.appendChild(b);
      return b;
    };

    criar(cancelar, false, 'btn-outline', !temPadrao);
    lista.forEach(a => criar(a.rotulo, a.valor, a.perigo ? 'btn-danger' : 'btn-primary', !!a.padrao));

    _confirmacaoPendente = fechar;
    document.addEventListener('keydown', aoTeclar, true);
    document.addEventListener('cancel', aoCancelarDialog, true);
    modal.setAttribute('role', 'alertdialog');
    if (dialogAberto && dialogAberto.appendChild) dialogAberto.appendChild(modal);
    // O gerenciador de modais guarda o foco anterior e foca [data-foco-inicial]
    modal.style.display = 'flex';
  });
}

// Mapa id da tela -> [hash, título]. Login não tem hash (URL limpa).
const ROTAS_TELAS = {
  'screen-login': ['', 'Entrar'],
  'screen-registro': ['#cadastro', 'Cadastrar empresa'],
  'screen-troca-senha-obrigatoria': ['#nova-senha', 'Definir nova senha'],
  'screen-home': ['#inicio', 'Início'],
  'screen-modalidade-contagem': ['#nova-contagem', 'Iniciar contagem'],
  'screen-contagem': ['#contagem', 'Contagem'],
  'screen-resultado': ['#resultado', 'Resultado da contagem'],
  'screen-historico-contagens': ['#historico', 'Histórico de contagens'],
  'screen-semana-contagem': ['#semana', 'Semana de contagem'],
  'screen-catalogo': ['#catalogo', 'Catálogo de produtos'],
  'screen-produtores': ['#produtores', 'Produtores'],
  'screen-empresas': ['#empresas', 'Empresas clientes'],
  'screen-backoffice': ['#backoffice', 'Painel de gestão'],
  'screen-importar-estoque': ['#estoque', 'Importar estoque']
};
// Subabas por tela: id da tela -> { idDaAba: [hash, título] }. A primeira é a padrão.
// O idDaAba é o data-tab (back-office) ou data-saas-tab (console do Super Admin).
// A aba "Importar estoque" do back-office tem tela própria (#estoque).
const ROTAS_ABAS = {
  'screen-backoffice': {
    'produtos': ['#backoffice/produtos', 'Produtos'],
    'usuarios': ['#backoffice/funcionarios', 'Funcionários'],
    'historico': ['#backoffice/historico', 'Histórico'],
    'atividades': ['#backoffice/atividades', 'Atividades'],
    'config': ['#backoffice/configuracoes', 'Configurações']
  },
  'screen-home': {
    'visao-geral': ['#inicio', 'Visão geral'],
    'tenants': ['#inicio/empresas', 'Empresas'],
    'auditoria-global': ['#inicio/auditoria', 'Auditoria global']
  }
};
let _telaAtualId = null;
let _primeiraTela = true;
let _pushRecente = false;
let _abaPedida = null;
// Empresa aberta no detalhe do console do Super Admin (rota #inicio/empresas/<id>), ou null
let _detalheEmpresaRota = null;

/** Id da empresa em um hash #inicio/empresas/<id> (UUID: minúsculas, dígitos e hífen), ou null */
function idEmpresaDoHash(hash) {
  const m = typeof hash === 'string' ? /^#inicio\/empresas\/([a-z0-9-]+)$/.exec(hash) : null;
  return m ? m[1] : null;
}

/** Registra a rota do detalhe da empresa (título "Detalhes da empresa · Início") */
function registrarRotaDetalheEmpresa(id, semHistorico) {
  if (!/^[a-z0-9-]+$/.test(String(id || '')) || !abasDaTela('screen-home')) return;
  _detalheEmpresaRota = String(id);
  atualizarRota('screen-home', semHistorico, 'tenants');
  const anuncio = document.getElementById('anuncio-tela');
  const rota = rotaDaTela('screen-home', 'tenants');
  if (anuncio && rota) anuncio.textContent = rota.titulo;
}

/** Empresa desconhecida ou sem acesso: volta o endereço para a lista de empresas, sem nova entrada */
function limparRotaDetalheEmpresa() {
  if (!_detalheEmpresaRota) return;
  _detalheEmpresaRota = null;
  atualizarRota('screen-home', true, 'tenants');
}

/**
 * Voltar/Avançar dentro do console do Super Admin entre a lista e o detalhe de uma empresa.
 * Devolve true quando tratou a mudança.
 */
function sincronizarDetalheEmpresa(aba, detalheId) {
  if (typeof EmpresaDetalhes === 'undefined' || !abasDaTela('screen-home')) return false;
  const aberto = EmpresaDetalhes.empresaId;
  if (detalheId) {
    _detalheEmpresaRota = detalheId;
    const secao = document.getElementById('saas-tab-detalhes');
    const detalheVisivel = !!secao && !!secao.style && secao.style.display === 'block';
    // Detalhe já na tela: só reafirma a rota. Se a aba Auditoria o escondeu (Voltar), reabre o detalhe.
    if (aberto === detalheId && detalheVisivel) { rotearAba('screen-home', 'tenants', { semHistorico: true }); return true; }
    switchSaasTab('tenants', { semHistorico: true, manterDetalhe: true });
    EmpresaDetalhes.abrir(detalheId, 'visao-geral', { semHistorico: true });
    return true;
  }
  if (aberto && aba) {
    EmpresaDetalhes.requestId++;
    EmpresaDetalhes.empresaId = null;
    EmpresaDetalhes.empresa = null;
    switchSaasTab(aba, { semHistorico: true, focar: true });
    return true;
  }
  return false;
}

function hashAtual() {
  try { return (typeof window !== 'undefined' && window.location && window.location.hash) || ''; } catch (e) { return ''; }
}

/** Abas válidas da tela para o perfil atual, ou null (a home só tem abas no console do Super Admin) */
function abasDaTela(screenId) {
  const abas = ROTAS_ABAS[screenId];
  if (!abas) return null;
  if (screenId === 'screen-home' && !(typeof Auth !== 'undefined' && Auth.usuario?.papel === 'super_admin')) return null;
  return abas;
}

function telaDoHash(hash) {
  const exata = Object.keys(ROTAS_TELAS).find(id => ROTAS_TELAS[id][0] && ROTAS_TELAS[id][0] === hash);
  if (exata) return exata;
  const base = typeof hash === 'string' && hash.includes('/') ? hash.split('/')[0] : '';
  return base ? Object.keys(ROTAS_ABAS).find(id => ROTAS_TELAS[id][0] === base) || null : null;
}

/** Aba indicada pelo hash; hash de aba inválido ou sem aba cai na primeira aba. Null se a tela não tem abas. */
function abaDoHash(screenId, hash) {
  const abas = abasDaTela(screenId);
  if (!abas) return null;
  if (screenId === 'screen-home' && idEmpresaDoHash(hash)) return 'tenants';
  return Object.keys(abas).find(id => abas[id][0] === hash) || Object.keys(abas)[0];
}

/** Aba ativa hoje no DOM da tela, ou null */
function abaAtivaDe(screenId) {
  if (!abasDaTela(screenId)) return null;
  const sel = screenId === 'screen-backoffice' ? '#screen-backoffice .tab.active' : '.saas-nav-btn.active[data-saas-tab]';
  const el = document.querySelector(sel);
  const id = el && el.getAttribute(screenId === 'screen-backoffice' ? 'data-tab' : 'data-saas-tab');
  return id && ROTAS_ABAS[screenId][id] ? id : Object.keys(ROTAS_ABAS[screenId])[0];
}

/** { hash, titulo } da tela, com a aba quando houver: "<Aba> · <Tela>" */
function rotaDaTela(screenId, aba) {
  const rota = ROTAS_TELAS[screenId];
  if (!rota) return null;
  const abas = abasDaTela(screenId);
  const rotaAba = abas && abas[aba];
  if (!rotaAba) return { hash: rota[0], titulo: rota[1] };
  if (screenId === 'screen-home' && aba === 'tenants' && _detalheEmpresaRota) {
    return { hash: `${rotaAba[0]}/${_detalheEmpresaRota}`, titulo: `Detalhes da empresa · ${rota[1]}` };
  }
  return { hash: rotaAba[0], titulo: `${rotaAba[1]} · ${rota[1]}` };
}

/** Telas que dependem de uma sessão de contagem em andamento */
function telaExigeContagem(id) {
  return id === 'screen-contagem' || id === 'screen-resultado';
}

function atualizarRota(screenId, semHistorico, aba) {
  const rota = rotaDaTela(screenId, aba);
  if (!rota) return;
  if (typeof document !== 'undefined') document.title = `${rota.titulo} · Sistema de Estoque`;
  try {
    if (typeof history === 'undefined' || !history.pushState || !history.replaceState) return;
    const hash = rota.hash;
    if (hashAtual() === hash) return;
    const base = `${window.location.pathname}${window.location.search}`;
    const url = hash ? base + hash : base;
    // Trocar de tela e de aba no mesmo gesto gera uma entrada só no histórico
    const usarPush = !semHistorico && hash && !_primeiraTela && !_pushRecente;
    if (usarPush) {
      history.pushState({ tela: screenId, aba: aba || null }, '', url);
      _pushRecente = true;
      Promise.resolve().then(() => { _pushRecente = false; });
    } else {
      history.replaceState({ tela: screenId, aba: aba || null }, '', url);
    }
  } catch (e) { /* ambiente sem histórico */ }
}

/**
 * Registra a rota da aba (hash, título e anúncio) depois de trocar de aba.
 * opcoes.semHistorico: veio de Voltar/Avançar ou da abertura da tela, sem nova entrada.
 * opcoes.focar: leva o foco ao título da aba (navegação pelo histórico, em que o gatilho some).
 */
function rotearAba(screenId, aba, opcoes) {
  const tela = document.getElementById(screenId);
  if (!tela || !tela.classList || !tela.classList.contains('active') || !abasDaTela(screenId)) return;
  const semHistorico = !!(opcoes && opcoes.semHistorico);
  atualizarRota(screenId, semHistorico, aba);
  const rota = rotaDaTela(screenId, aba);
  const anuncio = document.getElementById('anuncio-tela');
  if (anuncio && rota) anuncio.textContent = rota.titulo;
  if (opcoes && opcoes.focar) {
    const alvo = document.getElementById(screenId === 'screen-backoffice' ? 'bo-page-title' : 'saas-page-title');
    if (alvo && alvo.focus) {
      if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
      try { alvo.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
    }
  }
  // Voltar/Avançar: a rolagem guardada pelo navegador não vale para a aba restaurada
  if (semHistorico || (opcoes && opcoes.focar)) {
    try { if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); } catch (e) { /* sem rolagem */ }
  }
}

function moverFocoParaTela(target, screenId) {
  const rota = rotaDaTela(screenId, _abaPedida || abaAtivaDe(screenId));
  const anuncio = document.getElementById('anuncio-tela');
  if (anuncio && rota) anuncio.textContent = rota.titulo;
  if (_primeiraTela || screenId === 'screen-login' || !target || !target.querySelectorAll) return;
  const visivel = (el) => !el.getClientRects || el.getClientRects().length > 0;
  const alvo = [...target.querySelectorAll('h1, h2')].find(visivel) || target;
  if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
  try { alvo.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
}

/** Tela sem abas para o perfil, mas com hash de aba (ex.: #inicio/empresas): volta ao hash da tela */
function normalizarHash(screenId) {
  const rota = rotaDaTela(screenId, null);
  if (!rota || !rota.hash || hashAtual() === rota.hash) return;
  try {
    if (typeof history === 'undefined' || !history.replaceState) return;
    history.replaceState({ tela: screenId, aba: null }, '', `${window.location.pathname}${window.location.search}${rota.hash}`);
  } catch (e) { /* ambiente sem histórico */ }
}

/** Volta/avança do navegador: abre a tela do hash sem criar nova entrada */
function aoMudarHistorico() {
  let id = telaDoHash(hashAtual());
  const contagensOk = typeof Contagens !== 'undefined';
  const temSessao = id === 'screen-resultado'
    ? !!(contagensOk && Contagens.resultadoId)
    : !!(contagensOk && Contagens.contagemId);
  if (!id || (telaExigeContagem(id) && !temSessao)) id = 'screen-home';
  const aba = abaDoHash(id, hashAtual());
  if (id === _telaAtualId) {
    // Mesma tela: só a aba mudou (Voltar/Avançar entre abas), sem nova entrada no histórico
    if (id === 'screen-home' && sincronizarDetalheEmpresa(aba, idEmpresaDoHash(hashAtual()))) return;
    if (aba && aba !== abaAtivaDe(id))trocarAbaDaTela(id, aba, { semHistorico: true, focar: true });
    else if (aba) rotearAba(id, aba, { semHistorico: true });
    else normalizarHash(id);
    return;
  }
  showScreen(id, { semHistorico: true, aba });
}

/** Troca a aba de uma tela com abas (back-office ou console do Super Admin) */
function trocarAbaDaTela(screenId, aba, opcoes) {
  if (screenId === 'screen-backoffice') switchTab(aba, opcoes);
  else if (screenId === 'screen-home') switchSaasTab(aba, opcoes);
}

/**
 * Alterna a tela ativa do sistema
 * @param {string} screenId
 * @param {{semHistorico?: boolean}} [opcoes]
 */
function showScreen(screenId, opcoes) {
  const publicScreens = ['screen-login', 'screen-troca-senha-obrigatoria'];
  const employeeScreens = ['screen-home', 'screen-modalidade-contagem', 'screen-contagem', 'screen-resultado', 'screen-catalogo', 'screen-produtores', 'screen-historico-contagens', 'screen-semana-contagem', 'screen-importar-estoque'];
  if (!Auth.usuario && screenId !== 'screen-login') {
    screenId = 'screen-login';
  } else if (Auth.usuario?.mustChangePassword && screenId !== 'screen-login') {
    screenId = 'screen-troca-senha-obrigatoria';
  } else if (!Auth.isAdmin() && !publicScreens.includes(screenId) && !employeeScreens.includes(screenId)) {
    screenId = 'screen-home';
  }
  if ((screenId === 'screen-registro' || screenId === 'screen-empresas') && Auth.usuario?.papel !== 'super_admin') {
    screenId = Auth.usuario ? 'screen-home' : 'screen-login';
  }
  if (screenId !== 'screen-importar-estoque' && document.getElementById('screen-importar-estoque')?.classList.contains('active')) {
    if (typeof StockImport !== 'undefined' && StockImport.cancelarPrevia && !StockImport._confirmando) StockImport.cancelarPrevia(true);
  }
  // Qualquer saída do back-office fecha a gaveta (sem devolver o foco: a tela vai trocar)
  if (screenId !== 'screen-backoffice') fecharBoSidebar(true);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  // Ajuda da barra no celular: só com sessão (sem login existe o link "Como funciona?")
  const ajudaRapida = document.getElementById('btn-ajuda-topbar-rapido');
  if (ajudaRapida) ajudaRapida.hidden = !Auth.usuario;
  const ajudaMenu = document.getElementById('btn-ajuda-topbar');
  if (ajudaMenu && ajudaMenu.setAttribute) {
    ajudaMenu.setAttribute('aria-label', Auth.usuario?.papel === 'super_admin' ? 'Abrir ajuda' : 'Abrir ajuda: como funciona a contagem');
  }
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    const reduzirMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduzirMovimento ? 'auto' : 'smooth' });
    // Aba pedida só vale se a tela (já corrigida pelo perfil) tem essa aba
    const abas = abasDaTela(screenId);
    _abaPedida = abas && opcoes && opcoes.aba && abas[opcoes.aba] ? opcoes.aba : null;
    // F5/Voltar/Avançar com #inicio/empresas/<id>: o detalhe é aberto depois, em carregarDashboard
    _detalheEmpresaRota = screenId === 'screen-home' && _abaPedida === 'tenants' ? idEmpresaDoHash(hashAtual()) : null;
    atualizarRota(screenId, opcoes && opcoes.semHistorico, _abaPedida || abaAtivaDe(screenId));
    moverFocoParaTela(target, screenId);
    _telaAtualId = screenId;
    _primeiraTela = false;
  }

  // Ações contextuais por tela
  if (screenId === 'screen-backoffice') {
    if (_abaPedida && _abaPedida !== abaAtivaDe(screenId)) {
      // F5, hash ou Voltar do navegador: abre a aba da URL (sem nova entrada)
      const aba = _abaPedida;
      _abaPedida = null;
      switchTab(aba, { semHistorico: true });
    } else {
      _abaPedida = null;
      Produtos.carregar();
      carregarBackofficeKPIs();
    }
  } else if (screenId === 'screen-home') {
    Auth.atualizarInterface();
    carregarDashboard();
  } else if (screenId === 'screen-empresas') {
    Empresas.carregar({ containerId: 'empresas-lista-compat', page: 1 });
  } else if (screenId === 'screen-catalogo') {
    Consulta.carregarCatalogo();
  } else if (screenId === 'screen-produtores') {
    Consulta.carregarProdutores();
  } else if (screenId === 'screen-semana-contagem') {
    Semana.carregar();
  } else if (screenId === 'screen-historico-contagens') {
    Consulta.carregarHistorico();
  } else if (screenId === 'screen-registro') {
    document.getElementById('reg-empresa')?.focus();
  } else if (screenId === 'screen-importar-estoque') {
    // Aberta por F5, hash ou Voltar do navegador (fora de StockImport.abrir)
    if (typeof StockImport !== 'undefined' && !StockImport._viaAbrir) {
      if (StockImport.definirOrigem) StockImport.definirOrigem('home');
      if (StockImport.carregarHistorico) StockImport.carregarHistorico();
    }
  }
  atualizarMenuMovel();
}

/**
 * Esconde o hambúrguer quando o menu não tem item próprio visível: Ajuda e Sair já ficam na barra
 * no celular, então sem Back-office (funcionário, Super Admin) o painel abriria vazio.
 */
function atualizarMenuMovel() {
  try {
    const toggle = document.getElementById('mobile-nav-toggle');
    const menu = document.getElementById('topbar-menu');
    if (!toggle || !menu || !menu.querySelectorAll || !Auth.usuario) return;
    const itens = [...menu.querySelectorAll('button')].filter((b) => b.id !== 'btn-ajuda-topbar'
      && !(b.classList && b.classList.contains('topbar-menu-sair'))
      && !b.hidden && !(b.style && b.style.display === 'none'));
    toggle.hidden = itens.length === 0;
  } catch (e) { /* ambiente sem DOM completo */ }
}

/**
 * Carrega dados contextuais e KPIs do dashboard da Home
 */
async function carregarDashboard() {
  // 1. Papel Funcionário
  if (!Auth.isAdmin()) {
    await Consulta.carregarResumo();
    // Renderiza contagens recentes do funcionário
    try {
      const resHist = await API.get('/contagens?limit=5');
      const container = document.getElementById('funcionario-recentes-container');
      if (container && resHist && resHist.data?.contagens) {
        const contagens = resHist.data.contagens;
        if (contagens.length === 0) {
          container.innerHTML = '<p style="padding:18px; text-align:center; color:var(--cor-texto-mudo); font-size:0.875rem;">Nenhuma contagem registrada ainda. Inicie sua primeira contagem no botão acima!</p>';
        } else {
          container.innerHTML = `
            <table class="dash-recent-table">
              <thead>
                <tr>
                  <th scope="col">Data e Hora</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                ${contagens.map(c => {
                  const dataStr = c.iniciado_em ? new Date(c.iniciado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                  const statusBadge = c.status === 'finalizada'
                    ? '<span class="badge badge-success"><i class="ti ti-check"></i> Finalizada</span>'
                    : '<span class="badge badge-warning"><i class="ti ti-clock"></i> Em andamento</span>';
                  return `
                    <tr>
                      <td><strong>${dataStr}</strong></td>
                      <td>${statusBadge}<br>${c.tipo === 'pecas_queijo' ? 'Peças de queijo' : 'Geral'}</td>
                      <td><button class="btn btn-outline btn-sm" data-id="${c.id}" data-click="action-72">Ver Detalhes</button></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `;
        }
      }
    } catch (e) {
      console.warn('[DASHBOARD_FUNC] Erro ao carregar contagens recentes:', e);
    }
    return;
  }

  // 2. Papel Super Admin (Console SaaS)
  if (Auth.usuario?.papel === 'super_admin') {
    const sessaoAuditoria = typeof Auditoria !== 'undefined' ? Auditoria.restaurarLocal() : null;
    const abaInicial = _abaPedida;
    _abaPedida = null;
    const detalheDaUrl = _detalheEmpresaRota;
    if (sessaoAuditoria) {
      EmpresaDetalhes.abrir(sessaoAuditoria.empresaId, 'auditoria');
    } else if (detalheDaUrl && typeof EmpresaDetalhes !== 'undefined') {
      switchSaasTab('tenants', { semHistorico: true, manterDetalhe: true });
      EmpresaDetalhes.abrir(detalheDaUrl, 'visao-geral', { semHistorico: true });
    } else {
      // A rota já foi registrada pelo showScreen: não cria outra entrada no histórico
      switchSaasTab(abaInicial || 'visao-geral', { semHistorico: true });
    }
    return;
  }

  // 3. Papel Administrador da Empresa
  const homeUserEl = document.getElementById('home-user-name');
  if (homeUserEl) {
    homeUserEl.textContent = Auth.usuario?.nome || 'Usuário';
  }

  const dateEl = document.getElementById('home-current-date');
  if (dateEl) {
    const hoje = new Date();
    const opcoes = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dataFormatada = hoje.toLocaleDateString('pt-BR', opcoes);
    dateEl.innerHTML = `<i class="ti ti-calendar"></i> ${dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)}`;
  }

  try {
    const [resProd, resForn, resHist] = await Promise.all([
      API.get('/produtos?limit=1'),
      API.get('/produtos/fornecedores'),
      API.get('/contagens?limit=10')
    ]);

    const kpiProd = document.getElementById('kpi-total-produtos');
    if (kpiProd && resProd && resProd.data?.pagination) {
      kpiProd.textContent = resProd.data.pagination.total ?? 0;
    }

    const kpiForn = document.getElementById('kpi-total-fornecedores');
    if (kpiForn && resForn && resForn.data?.fornecedores) {
      kpiForn.textContent = resForn.data.fornecedores.length ?? 0;
    }

    const kpiCont = document.getElementById('kpi-total-contagens');
    if (kpiCont && resHist && resHist.data) {
      kpiCont.textContent = resHist.data.total ?? (resHist.data.contagens?.length ?? 0);
    }

    // Tabela de contagens recentes e alerta de divergência para Administrador
    if (resHist && resHist.data?.contagens) {
      const contagens = resHist.data.contagens;
      const tbody = document.getElementById('admin-recent-tbody');
      const alertCard = document.getElementById('admin-divergencia-alerta');

      if (contagens.length > 0) {
        // Alerta da última divergência
        const ultimaComDiferenca = contagens.find(c => c.tem_diferenca === true);
        if (ultimaComDiferenca && alertCard) {
          alertCard.style.display = 'flex';
          const tituloEl = document.getElementById('admin-divergencia-titulo');
          const descEl = document.getElementById('admin-divergencia-desc');
          const btnRel = document.getElementById('admin-divergencia-btn');
          if (tituloEl) tituloEl.textContent = 'Divergência detectada na última conferência de estoque';
          if (descEl) descEl.textContent = `A contagem realizada por ${ultimaComDiferenca.iniciado_por_nome || 'Operador'} apresentou sobras ou faltas em relação ao sistema.`;
          if (btnRel) btnRel.setAttribute('data-id', ultimaComDiferenca.id);
        } else if (alertCard) {
          alertCard.style.display = 'none';
        }

        // Tabela recente
        if (tbody) {
          garantirRolesDeTabela(document.getElementById('admin-recent-table'));
          tbody.innerHTML = contagens.slice(0, 5).map(c => {
            const dataStr = c.iniciado_em ? new Date(c.iniciado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
            const difBadge = c.tipo === 'pecas_queijo' ? `<span class="badge ${c.status === 'finalizada' ? 'badge-success' : 'badge-warning'}">Peças de queijo · ${c.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}</span>` : c.status !== 'finalizada' ? '<span class="badge badge-neutral"><i class="ti ti-clock" aria-hidden="true"></i> Geral · Em andamento</span>' : c.tem_diferenca
              ? '<span class="badge badge-warning"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Com divergência</span>'
              : '<span class="badge badge-success"><i class="ti ti-check" aria-hidden="true"></i> Sem divergência</span>';
            return `
              <tr role="row">
                <td role="cell" class="cartao-principal" data-label="Data e hora"><strong>${dataStr}</strong></td>
                <td role="cell" data-label="Operador">${escapeHtml(c.iniciado_por_nome || 'Operador')}</td>
                <td role="cell" data-label="Estoque">${difBadge}</td>
                <td role="cell" class="cartao-acoes"><button class="btn btn-outline btn-sm" data-id="${c.id}" data-click="action-72" aria-label="Conferir contagem de ${dataStr}">Conferir</button></td>
              </tr>
            `;
          }).join('');
        }
      } else {
        if (tbody) {
          tbody.innerHTML = '<tr role="row"><td role="cell" colspan="4" style="text-align:center; padding:24px; color:var(--cor-texto-mudo);">Nenhuma contagem finalizada ainda. Inicie uma contagem para ela aparecer aqui.</td></tr>';
        }
        if (alertCard) alertCard.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('[DASHBOARD_ADMIN] Falha ao atualizar KPIs da loja:', err);
  }
}

/**
 * Roles explícitos de tabela: no celular a tabela vira cartões (display:block) e perderia a semântica
 */
function garantirRolesDeTabela(tabela) {
  if (!tabela || !tabela.setAttribute || !tabela.querySelectorAll) return;
  tabela.setAttribute('role', 'table');
  tabela.querySelectorAll('thead, tbody').forEach((el) => el.setAttribute('role', 'rowgroup'));
  tabela.querySelectorAll('thead tr').forEach((el) => el.setAttribute('role', 'row'));
  tabela.querySelectorAll('thead th').forEach((el) => el.setAttribute('role', 'columnheader'));
}

/**
 * Alterna abas dentro do Back-office
 * @param {string} tabId
 * @param {{semHistorico?: boolean, focar?: boolean}} [opcoes]
 */
function switchTab(tabId, opcoes) {
  if (!Auth.isAdmin() || Auth.usuario?.mustChangePassword) return;
  if (tabId === 'estoque') { fecharBoSidebar(); StockImport.abrir('backoffice'); return; }
  if (!ROTAS_ABAS['screen-backoffice'][tabId]) tabId = 'produtos';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

  const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);

  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  const kpisBo = document.getElementById('bo-kpis');
  if (kpisBo) kpisBo.hidden = tabId !== 'produtos';

  fecharBoSidebar();
  if (tabId === 'produtos') carregarBackofficeKPIs();

  const titles = {
    produtos: { title: 'Catálogo de Produtos', subtitle: 'Gerenciamento completo de itens, SKUs e saldos' },
    estoque: { title: 'Importação de Estoque', subtitle: 'Importe e cruze relatórios em PDF do Tiny ou ERP da Olist' },
    usuarios: { title: 'Equipe & Funcionários', subtitle: 'Gerenciamento de acessos e permissões do sistema' },
    historico: { title: 'Histórico de Contagens', subtitle: 'Consulte inventários passados e relatórios' },
    atividades: { title: 'Log de Auditoria', subtitle: 'Rastreabilidade e histórico de ações no sistema' },
    config: { title: 'Configurações de Acesso', subtitle: 'Segurança e credenciais da conta' }
  };
  const titleEl = document.getElementById('bo-page-title');
  const subEl = document.getElementById('bo-page-subtitle');
  if (titleEl && titles[tabId]) titleEl.textContent = titles[tabId].title;
  if (subEl && titles[tabId]) subEl.textContent = titles[tabId].subtitle;

  // Carregamento contextual por aba
  if (tabId === 'produtos') {
    Produtos.carregar();
  } else if (tabId === 'historico') {
    Historico.carregar();
  } else if (tabId === 'usuarios' && typeof Usuarios !== 'undefined') {
    Usuarios.carregar();
  } else if (tabId === 'atividades' && typeof Atividades !== 'undefined') {
    Atividades.carregar();
  }
  rotearAba('screen-backoffice', tabId, opcoes);
  // Sem isto, o foco/scroll da troca deixa a página rolada e esconde o título e o botão "Seções" sob a barra fixa
  try { if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); } catch (e) { /* sem rolagem */ }
}

/**
 * Controla o Drawer (Sidebar mobile) do Back-office
 */
function toggleBoSidebar() {
  const sidebar = document.getElementById('bo-sidebar');
  const backdrop = document.getElementById('bo-sidebar-backdrop');
  const menuBtn = document.getElementById('bo-menu-btn');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('active', isOpen);
  if (menuBtn) menuBtn.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    const primeiro = sidebar.querySelector('.bo-nav-item, .bo-sidebar-nav button, button:not(.bo-sidebar-close)') || sidebar.querySelector('button');
    // Foco no quadro seguinte: o item só deixa de ser visibility:hidden depois do estilo recalculado
    const focarPrimeiro = (tentativa) => {
      if (!sidebar.classList.contains('open') || !primeiro || !primeiro.focus) return;
      try { primeiro.focus({ preventScroll: true }); } catch (e) { /* sem foco */ }
      if (tentativa < 1 && document.activeElement !== primeiro && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => focarPrimeiro(tentativa + 1));
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => focarPrimeiro(0));
    else focarPrimeiro(1);
  } else if (menuBtn && menuBtn.focus) {
    menuBtn.focus({ preventScroll: true });
  }
}

function fecharBoSidebar(semFoco) {
  const sidebar = document.getElementById('bo-sidebar');
  const backdrop = document.getElementById('bo-sidebar-backdrop');
  const menuBtn = document.getElementById('bo-menu-btn');
  // Devolve o foco ao botão "Seções" só se o foco estava dentro da gaveta aberta
  if (!semFoco && sidebar &&sidebar.classList.contains('open') && menuBtn && menuBtn.focus && sidebar.contains(document.activeElement)) {
    menuBtn.focus({ preventScroll: true });
  }
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

/**
 * Carrega KPIs executivos no cabeçalho do Back-office
 */
let _boKpisUltimaCarga = 0;
async function carregarBackofficeKPIs(forcar = false) {
  if (!Auth.isAdmin()) return;
  if (forcar) _boKpisUltimaCarga = 0;
  const wrapperKpis = document.getElementById('bo-kpis');
  if (wrapperKpis && wrapperKpis.hidden) return;
  if (Date.now() - _boKpisUltimaCarga < 30000) return;
  _boKpisUltimaCarga = Date.now();
  try {
    const [resProd, resForn, resHist, resUsers] = await Promise.allSettled([
      API.get('/produtos?limit=1'),
      API.get('/produtos/fornecedores'),
      API.get('/contagens?limit=1'),
      API.get('/usuarios')
    ]);

    const kpiProd = document.getElementById('bo-kpi-produtos');
    if (kpiProd && resProd.status === 'fulfilled' && resProd.value.data?.pagination) {
      kpiProd.textContent = resProd.value.data.pagination.total ?? 0;
    }

    const kpiForn = document.getElementById('bo-kpi-fornecedores');
    if (kpiForn && resForn.status === 'fulfilled' && resForn.value.data?.fornecedores) {
      kpiForn.textContent = resForn.value.data.fornecedores.length ?? 0;
    }

    const kpiCont = document.getElementById('bo-kpi-contagens');
    if (kpiCont && resHist.status === 'fulfilled' && resHist.value.data) {
      const ultima = resHist.value.data.contagens?.[0];
      const dataUltima = ultima ? new Date(ultima.finalizado_em || ultima.iniciado_em) : null;
      if (dataUltima && !Number.isNaN(dataUltima.getTime())) {
        kpiCont.textContent = dataUltima.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        kpiCont.classList.add('bo-kpi-value--texto');
      } else {
        kpiCont.textContent = 'Nenhuma contagem ainda';
        kpiCont.classList.add('bo-kpi-value--texto');
      }
    }

    const kpiUsers = document.getElementById('bo-kpi-usuarios');
    if (kpiUsers && resUsers.status === 'fulfilled' && resUsers.value.data?.usuarios) {
      kpiUsers.textContent = resUsers.value.data.usuarios.length ?? 0;
    }
  } catch (err) {
    console.warn('[BACKOFFICE] Falha ao carregar KPIs executivos:', err);
  }
}

/** Leva o foco ao envio de catálogo (.xlsx) da aba Produtos, sem abrir o seletor de arquivos */
function focarImportarCatalogo() {
  const campo = document.getElementById('input-importar-catalogo');
  if (!campo || !campo.focus) return;
  try { campo.focus(); } catch (e) { /* sem foco */ }
}

function abrirHistoricoContagens() {
  if (Auth.isAdmin()) {
    showScreen('screen-backoffice');
    switchTab('historico');
  } else {
    showScreen('screen-historico-contagens');
  }
}

/**
 * Alterna entre as abas do Console SaaS do Super Admin
 * @param {string} tabId - 'visao-geral' | 'tenants' | 'auditoria-global'
 * @param {{semHistorico?: boolean, focar?: boolean}} [opcoes]
 */
function switchSaasTab(tabId, opcoes) {
  const tabs = ['visao-geral', 'tenants', 'auditoria-global'];
  if (!tabs.includes(tabId)) tabId = 'visao-geral';
  // Trocar de aba encerra a rota do detalhe da empresa (exceto ao restaurá-lo pela URL)
  if (!(opcoes && opcoes.manterDetalhe)) _detalheEmpresaRota = null;

  // 1. Alternar classes dos botões da sidebar
  document.querySelectorAll('.saas-nav-btn[data-saas-tab]').forEach(btn => {
    if (btn.getAttribute('data-saas-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 2. Alternar visibilidade das seções
  tabs.forEach(t => {
    const sec = document.getElementById(`saas-tab-${t}`);
    if (sec) {
      sec.style.display = (t === tabId) ? 'block' : 'none';
    }
  });
  const detalhes = document.getElementById('saas-tab-detalhes');
  if (detalhes) detalhes.style.display = 'none';

  // 3. Atualizar Título e Descrição da página
  const titleEl = document.getElementById('saas-page-title');
  const descEl = document.getElementById('saas-page-desc');
  // O estado de erro do detalhe esconde o cabeçalho; qualquer troca de aba o devolve
  if (titleEl) titleEl.hidden = false;
  if (descEl) descEl.hidden = false;

  if (tabId === 'visao-geral') {
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-dashboard" style="color:var(--cor-primaria)"></i> Visão Geral da Plataforma';
    if (descEl) descEl.textContent = 'Métricas consolidadas de infraestrutura, clientes e volumetria do SaaS';
    if (typeof Empresas !== 'undefined' && Empresas.carregar) {
      Empresas.carregarMetricas();
      Empresas.carregar({ containerId: 'super-empresas-lista', page: 1, resumo: true });
    }
  } else if (tabId === 'tenants') {
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-buildings" style="color:var(--cor-primaria)"></i> Gestão de empresas';
    if (descEl) descEl.textContent = 'Administração de status, planos, auditoria de dados e suporte assistido';
    if (typeof Empresas !== 'undefined' && Empresas.carregar) {
      Empresas.carregar({ containerId: 'empresas-lista', page: 1 });
    }
  } else if (tabId === 'auditoria-global') {
    if (titleEl) titleEl.innerHTML = '<i class="ti ti-shield-search" style="color:var(--cor-primaria)"></i> Trilha de Auditoria Global';
    if (descEl) descEl.textContent = 'Monitoramento contínuo de eventos de segurança, acessos e alterações da plataforma';
    if (typeof Atividades !== 'undefined' && Atividades.carregar) {
      Atividades.carregar();
    }
  }
  rotearAba('screen-home', tabId, opcoes);
}
window.switchSaasTab = switchSaasTab;

/**
 * Alterna entre tema claro e escuro, persistindo em localStorage
 */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('inventory_theme', next);

  atualizarIconeTema(next);
}

function atualizarIconeTema(tema) {
  document.querySelectorAll('.btn-theme').forEach(b => {
    b.innerHTML = `<i class="ti ${tema === 'dark' ? 'ti-sun' : 'ti-moon'}" aria-hidden="true"></i>`;
  });
}

/**
 * Inicialização global da aplicação ao carregar a página
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializar tema
  const savedTheme = localStorage.getItem('inventory_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', savedTheme);
  atualizarIconeTema(savedTheme);

  // 2. Configurar busca de fornecedor com debounce
  const inputBusca = document.getElementById('busca-fornecedor');
  if (inputBusca) {
    inputBusca.addEventListener('input', debounce((e) => {
      Contagens.filtrarProdutores(e.target.value);
    }, 250));
  }

  // 3. Fechar sugestões ao clicar fora
  document.addEventListener('click', (e) => {
    const box = document.getElementById('sugestoes-fornecedor');
    if (box && !e.target.closest('.fornecedor-search')) {
      box.classList.remove('show');
    }
  });

  // 3b. Gerenciador genérico de modais (role, foco, retorno de foco)
  iniciarGerenciadorModais();

  // 4. Fechar modais com Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modalAberto()) fecharBoSidebar();
      fecharAjuda();
      if (typeof Produtos !== 'undefined') Produtos.fecharModal();
      if (typeof Usuarios !== 'undefined') {
        Usuarios.fecharModal();
        Usuarios.fecharModalReset();
      }
      if (typeof Atividades !== 'undefined') Atividades.fecharModal();
      if (typeof Empresas !== 'undefined') {
        Empresas.fecharModalExclusao();
        Empresas.fecharModalEdicao();
        Empresas.fecharModalStatus();
      }
      if (typeof EmpresaDetalhes !== 'undefined') EmpresaDetalhes.fecharSenhaTemporaria();
    }
    // Atalho "?" abre a ajuda, fora de campos de digitação
    // (e.key '?' ou Shift+Barra, para layouts em que a tecla Barra produz outro caractere)
    const teclaAjuda = e.key === '?' || (e.code === 'Slash' && e.shiftKey);
    if (teclaAjuda && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !e.repeat && !e.defaultPrevented) {
      const digitandoAjuda = e.target && e.target.closest && e.target.closest('input, textarea, select, [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])');
      if (!digitandoAjuda && !modalAberto()) {
        e.preventDefault();
        abrirAjuda();
      }
    }
    // Atalho "/" foca a primeira busca visível, fora de campos de digitação
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !e.repeat) {
      const alvo = e.target;
      const digitando = alvo.closest && alvo.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      if (!digitando && !modalAberto()) {
        const busca = [...document.querySelectorAll('input[type="search"], #busca-fornecedor, #filtro-busca-produto, #filtro-busca-usuario, #filtro-audit-busca')]
          .find(el => el.offsetParent !== null);
        if (busca) {
          e.preventDefault();
          busca.focus();
        }
      }
    }
    if (e.key === 'Tab') {
      const modal = modalAberto();
      if (!modal) return;
      const focaveis = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  });

  // 4b. Botão Voltar/Avançar do navegador
  try {
    if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch (e) { /* ambiente sem histórico */ }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('popstate', aoMudarHistorico);
    window.addEventListener('hashchange', aoMudarHistorico);
  }

  // 5. Restaurar sessão ativa ou exibir login
  const logado = await Auth.restaurarSessao();
  if (logado) {
    // Se mustChangePassword, a tela já foi redirecionada em restaurarSessao()
    if (!Auth.usuario?.mustChangePassword) {
      let inicial = telaDoHash(hashAtual());
      // Telas sem sessão de contagem em andamento ou públicas voltam ao início
      if (!inicial || telaExigeContagem(inicial) || inicial === 'screen-login' || inicial === 'screen-troca-senha-obrigatoria') inicial = 'screen-home';
      // F5 mantém a aba da URL; o showScreen descarta a aba que o perfil não tem
      showScreen(inicial, { aba: abaDoHash(inicial, hashAtual()) });
    }
  } else {
    showScreen('screen-login');
  }
});
