/**
 * Utilitários gerais do sistema (Segurança XSS, Formatação e UI)
 */

/**
 * Sanitiza strings para prevenir Cross-Site Scripting (XSS)
 * Converte caracteres especiais em entidades HTML seguras
 * @param {string|number|null|undefined} str 
 * @returns {string} String devidamente escapada
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Exibe notificação toast na interface
 * @param {string} msg - Mensagem a ser exibida
 * @param {'success'|'error'|'warning'|'info'} [tipo='info'] - Tipo visual do toast
 */
function showToast(msg, tipo = 'info') {
  // Remove toast anterior se ainda estiver na tela
  const antigo = document.querySelector('.toast');
  if (antigo) antigo.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', tipo === 'error' ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');

  const iconMap = {
    success: 'ti-check',
    error: 'ti-alert-circle',
    warning: 'ti-alert-triangle',
    info: 'ti-info-circle'
  };
  const icon = iconMap[tipo] || 'ti-info-circle';

  // Criação segura de elementos sem innerHTML não sanitizado
  const iconEl = document.createElement('i');
  iconEl.className = `ti ${icon}`;
  iconEl.setAttribute('aria-hidden', 'true');
  const textNode = document.createTextNode(msg);

  toast.appendChild(iconEl);
  toast.appendChild(textNode);
  // Um <dialog> aberto com showModal() fica na camada superior e cobriria o toast no body:
  // dentro dele o aviso continua visível (position: fixed).
  const dialogAberto = document.querySelector('dialog[open]');
  (dialogAberto || document.body).appendChild(toast);
  if (dialogAberto && typeof dialogAberto.addEventListener === 'function') {
    // Se o diálogo fechar com o aviso dentro, o aviso migra para o body (erros persistem).
    dialogAberto.addEventListener('close', () => {
      if (toast.parentNode === dialogAberto && document.body) document.body.appendChild(toast);
    }, { once: true });
  }

  if (tipo === 'error') {
    // Erros permanecem até serem dispensados (botão Fechar aviso ou Esc com o foco no toast)
    toast.setAttribute('tabindex', '-1');
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'toast-close';
    botao.setAttribute('aria-label', 'Fechar aviso');
    botao.setAttribute('style', 'background:none; border:0; color:inherit; cursor:pointer; margin-left:12px; padding:4px; line-height:1');
    const x = document.createElement('i');
    x.className = 'ti ti-x';
    x.setAttribute('aria-hidden', 'true');
    botao.appendChild(x);
    botao.addEventListener?.('click', () => toast.remove());
    toast.appendChild(botao);
    toast.addEventListener?.('keydown', (e) => {
      if (e && e.key === 'Escape') { e.stopPropagation?.(); toast.remove(); }
    });
    return;
  }
  // Sucesso some em 5 s; aviso e informação em 8 s (WCAG 2.2.1). O tempo pausa com o ponteiro ou o foco no aviso.
  const duracao = tipo === 'success' ? 5000 : 8000;
  let restante = duracao;
  let inicio = Date.now();
  let timer = setTimeout(() => toast.remove(), restante);
  const pausar = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    restante = Math.max(restante - (Date.now() - inicio), 2000);
  };
  const retomar = () => {
    if (timer !== null) return;
    inicio = Date.now();
    timer = setTimeout(() => toast.remove(), restante);
  };
  toast.addEventListener?.('mouseenter', pausar);
  toast.addEventListener?.('mouseleave', retomar);
  toast.addEventListener?.('focusin', pausar);
  toast.addEventListener?.('focusout', retomar);
  // Aviso e informação também ganham o botão Fechar (dispensar sem esperar o tempo)
  if (tipo !== 'success') {
    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'toast-close';
    fechar.setAttribute('aria-label', 'Fechar aviso');
    fechar.setAttribute('style', 'background:none; border:0; color:inherit; cursor:pointer; margin-left:12px; padding:4px; line-height:1');
    const xi = document.createElement('i');
    xi.className = 'ti ti-x';
    xi.setAttribute('aria-hidden', 'true');
    fechar.appendChild(xi);
    fechar.addEventListener?.('click', () => { clearTimeout(timer); toast.remove(); });
    toast.appendChild(fechar);
  }
}

/** Texto para leitores de tela sem mudar o foco (região #anuncio-tela). */
function anunciarParaLeitor(texto) {
  const anuncio = typeof document !== 'undefined' && document.getElementById ? document.getElementById('anuncio-tela') : null;
  if (!anuncio) return;
  // Limpa antes: repetir o mesmo texto (ex.: iniciar de novo a auditoria) volta a ser anunciado
  anuncio.textContent = '';
  setTimeout(() => { anuncio.textContent = texto; }, 50);
}

/** Preferências por navegador: localStorage pode lançar exceção (modo privado, dados bloqueados). */
function lerPreferencia(chave, padrao = null) {
  try {
    const valor = localStorage.getItem(chave);
    return valor === null || valor === undefined ? padrao : valor;
  } catch (e) { return padrao; }
}
function gravarPreferencia(chave, valor) {
  try { localStorage.setItem(chave, valor); return true; } catch (e) { return false; }
}

/**
 * Ícones Tabler são decorativos (o texto ao lado diz o mesmo): esconde de leitores de tela,
 * inclusive os gerados depois pelo JS. Ícone sozinho continua nomeado pelo botão (aria-label).
 */
function ocultarIconesDecorativos(raiz) {
  try {
    const base = raiz && raiz.querySelectorAll ? raiz : document;
    if (raiz && raiz.nodeType === 1 && raiz.matches && raiz.matches('i.ti:not([aria-hidden])')) raiz.setAttribute('aria-hidden', 'true');
    base.querySelectorAll('i.ti:not([aria-hidden])').forEach((el) => el.setAttribute('aria-hidden', 'true'));
  } catch (e) { /* ambiente sem DOM completo */ }
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', () => {
    ocultarIconesDecorativos(document);
    try {
      if (typeof MutationObserver !== 'function' || !document.body) return;
      new MutationObserver((muts) => {
        for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) ocultarIconesDecorativos(n); });
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* sem observer */ }
  });
}

/**
 * Rótulos únicos (vocabulário do sistema) para estado da contagem, papel, ação de auditoria e resultado.
 * Funções puras: não dependem do DOM.
 */
const Rotulos = {
  _capitalizar(cod) {
    const texto = String(cod || '').replace(/_/g, ' ').trim();
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
  },

  /**
   * @param {string} status - em_andamento | finalizada | apagada (aceita variações)
   * @param {{divergencias?:number, total_divergencias?:number, com_divergencia?:boolean}|number|boolean} [resumo]
   *   quando informado e a contagem está finalizada, acrescenta " · Com divergência" / " · Sem divergência"
   */
  statusContagem(status, resumo) {
    const s = String(status || '').toLowerCase();
    if (s === 'apagada' || s === 'excluida' || s === 'excluída') return 'Apagada';
    if (s === 'em_andamento' || s === 'andamento' || s === 'aberta') return 'Em andamento';
    if (s === 'finalizada' || s === 'concluida' || s === 'concluída') {
      let div = null;
      if (typeof resumo === 'number') div = resumo > 0;
      else if (typeof resumo === 'boolean') div = resumo;
      else if (resumo && typeof resumo === 'object') {
        if (typeof resumo.com_divergencia === 'boolean') div = resumo.com_divergencia;
        else {
          const n = resumo.divergencias ?? resumo.total_divergencias;
          if (n !== undefined && n !== null) div = Number(n) > 0;
        }
      }
      if (div === null) return 'Finalizada';
      return div ? 'Finalizada · Com divergência' : 'Finalizada · Sem divergência';
    }
    return Rotulos._capitalizar(s);
  },

  papel(p) {
    const mapa = { funcionario: 'Funcionário', administrador: 'Administrador', admin: 'Administrador', gestor: 'Administrador', super_admin: 'Super Admin' };
    const cod = String(p || '');
    return mapa[cod] || Rotulos._capitalizar(cod);
  },

  ENTIDADES: { sessao: 'Sessão', contagem: 'Contagem', usuario: 'Usuário', empresa: 'Empresa', produto: 'Produto', estoque: 'Estoque' },

  entidade(e) {
    const cod = String(e || '');
    return Rotulos.ENTIDADES[cod] || Rotulos._capitalizar(cod);
  },

  ACOES_AUDITORIA: {
    login_sucesso: 'Login realizado',
    login_falha: 'Falha no login',
    logout: 'Saída do sistema',
    sessao_comprometida: 'Sessão comprometida',
    senha_alterada: 'Senha alterada',
    senha_redefinida: 'Senha redefinida',
    senha_temporaria_definida_superadmin: 'Senha temporária definida pelo Super Admin',
    recuperacao_solicitada: 'Recuperação de senha solicitada',
    recuperacao_entrega_aceita: 'E-mail de recuperação enviado',
    recuperacao_entrega_falhou: 'Falha no envio do e-mail de recuperação',
    recuperacao_concluida: 'Recuperação de senha concluída',
    usuario_criado: 'Usuário criado',
    usuario_editado: 'Usuário editado',
    produto_criado: 'Produto criado',
    produto_editado: 'Produto editado',
    produto_desativado: 'Produto desativado',
    catalogo_importado: 'Catálogo importado',
    contagem_criada: 'Contagem criada',
    contagem_progresso_salvo: 'Progresso da contagem salvo',
    contagem_finalizada: 'Contagem finalizada',
    contagem_reaberta: 'Contagem reaberta',
    contagem_apagada: 'Contagem apagada',
    estoque_pdf_recebido: 'PDF de estoque recebido',
    estoque_atualizado: 'Estoque atualizado',
    empresa_criada: 'Empresa criada',
    empresa_atualizada: 'Empresa atualizada',
    empresa_excluida: 'Empresa excluída',
    empresa_exclusao_negada: 'Exclusão de empresa negada',
    auditoria_iniciada: 'Auditoria assistida iniciada',
    auditoria_encerrada: 'Auditoria assistida encerrada',
    auditoria_expirada: 'Auditoria assistida expirada'
  },

  acaoAuditoria(a) {
    const cod = String(a || '');
    if (Rotulos.ACOES_AUDITORIA[cod]) return Rotulos.ACOES_AUDITORIA[cod];
    return Rotulos._capitalizar(cod.includes('.') ? cod.split('.').pop() : cod);
  },

  resultado(r) {
    const cod = String(r || '').toLowerCase();
    if (cod === 'sucesso') return 'Sucesso';
    if (cod === 'falha') return 'Falha';
    return Rotulos._capitalizar(cod);
  }
};

/** Concorda número e substantivo: pluralizar(1, 'produto') = "1 produto"; pluralizar(2, 'item', 'itens') = "2 itens". */
function pluralizar(n, singular, plural = `${singular}s`) {
  return `${n} ${Number(n) === 1 ? singular : plural}`;
}

/** Mesma regra do backend (senhaForteRegex): 8+ caracteres, maiúscula, minúscula e número. */
const SENHA_FORTE_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const DICA_SENHA_FORTE = 'Mínimo de 8 caracteres, com letra maiúscula, minúscula e número.';

/**
 * Diz o que falta numa senha nova, ou '' se atende à regra do servidor.
 * @param {string} senha
 * @returns {string}
 */
function mensagemSenhaFraca(senha) {
  if (SENHA_FORTE_REGEX.test(senha)) return '';
  const falta = [];
  if (senha.length < 8) falta.push(`faltam ${8 - senha.length} caractere${8 - senha.length === 1 ? '' : 's'} (mínimo de 8)`);
  if (!/[A-Z]/.test(senha)) falta.push('uma letra maiúscula');
  if (!/[a-z]/.test(senha)) falta.push('uma letra minúscula');
  if (!/\d/.test(senha)) falta.push('um número');
  if (falta.length === 1 && senha.length >= 8) return `Falta ${falta[0]}.`;
  return `A senha precisa de: ${falta.join(', ')}.`;
}

/**
 * Mapeia erros por campo devolvidos pelo servidor (res.details = [{campo, mensagem}])
 * para marcarErroCampo. `mapa` liga nome do campo no servidor ao input.
 * Devolve true se ao menos um erro foi marcado (e foca o primeiro).
 */
function aplicarErrosServidor(res, mapa) {
  const detalhes = Array.isArray(res?.details) ? res.details : [];
  let primeiro = null;
  for (const d of detalhes) {
    const input = mapa[d.campo];
    if (!input || !d.mensagem) continue;
    marcarErroCampo(input, d.mensagem);
    if (!primeiro) primeiro = input;
  }
  if (primeiro) primeiro.focus();
  return !!primeiro;
}

/**
 * Formata data no padrão brasileiro dd/mm/aaaa às hh:mm
 * @param {string|Date} dataStr 
 * @returns {string}
 */
function formatarData(dataStr) {
  if (!dataStr) return '—';
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return '—';

  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  return `${dia}/${mes}/${ano} às ${hora}:${min}`;
}

/**
 * Função debounce para otimização de inputs de busca
 * @param {Function} func 
 * @param {number} wait 
 * @returns {Function}
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Marca um campo como inválido, mostra a mensagem inline logo abaixo dele
 * e liga aria-invalid/aria-describedby. Limpa sozinho quando o usuário digita.
 * @param {HTMLInputElement} input
 * @param {string} msg
 */
function marcarErroCampo(input, msg, regiaoExistente) {
  if (!input) return;
  // regiaoExistente: mensagem que já existe na página (ex.: #login-error); ela é ligada ao campo, não criada nem removida
  const idErro = regiaoExistente ? regiaoExistente.id : `${input.id}-erro`;
  let erro = regiaoExistente || document.getElementById(idErro);
  if (!erro) {
    erro = document.createElement('small');
    erro.className = 'field-error';
    erro.id = idErro;
    erro.setAttribute('role', 'alert');
    const alvo = input.closest('.input-senha-wrap') || input;
    alvo.insertAdjacentElement('afterend', erro);
  }
  erro.textContent = msg;
  input.setAttribute('aria-invalid', 'true');
  const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!ids.includes(idErro)) ids.push(idErro);
  input.setAttribute('aria-describedby', ids.join(' '));
  if (regiaoExistente) input.dataset.erroExistenteId = idErro;
  if (!input.dataset.erroLigado) {
    input.dataset.erroLigado = '1';
    input.addEventListener('input', () => limparErroCampo(input));
  }
}

/**
 * Remove a marcação de erro de um campo.
 * @param {HTMLInputElement} input
 */
function limparErroCampo(input) {
  if (!input) return;
  input.removeAttribute('aria-invalid');
  const idExistente = input.dataset && input.dataset.erroExistenteId;
  const idErro = idExistente || `${input.id}-erro`;
  const erro = document.getElementById(idErro);
  // Região pré-existente só perde o vínculo; o texto some quando quem a criou o limpar
  if (erro && !idExistente) erro.remove();
  if (idExistente) delete input.dataset.erroExistenteId;
  const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter((i) => i && i !== idErro);
  if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
  else input.removeAttribute('aria-describedby');
}

/**
 * Valida uma lista de [input, mensagem, falhou]; marca todos os inválidos
 * e foca o primeiro. Retorna true se tudo estiver válido.
 */
function validarCampos(regras) {
  let primeiro = null;
  for (const [input, msg, falhou] of regras) {
    if (falhou) {
      marcarErroCampo(input, msg);
      if (!primeiro) primeiro = input;
    } else {
      limparErroCampo(input);
    }
  }
  if (primeiro) primeiro.focus();
  return !primeiro;
}

/**
 * Liga botões "mostrar senha" (.btn-ver-senha[data-alvo]).
 */
function nomeBotaoSenha(btn, mostrar) {
  const verbo = mostrar ? 'Mostrar' : 'Ocultar';
  const rotulo = document.querySelector?.(`label[for="${btn.dataset.alvo}"]`)?.textContent?.replace(/[:*]/g, '').trim().toLocaleLowerCase('pt-BR') || '';
  if (!rotulo) return `${verbo} senha`;
  return /senha/.test(rotulo) ? `${verbo} ${rotulo}` : `${verbo} senha: ${rotulo}`;
}

function iniciarMostrarSenha() {
  document.querySelectorAll('.btn-ver-senha').forEach((btn) => {
    if (btn.dataset.ligado) return;
    btn.dataset.ligado = '1';
    btn.setAttribute('aria-label', nomeBotaoSenha(btn, true));
    btn.addEventListener('click', () => {
      const campo = document.getElementById(btn.dataset.alvo);
      if (!campo) return;
      const mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(mostrar));
      btn.setAttribute('aria-label', nomeBotaoSenha(btn, !mostrar));
      const icone = btn.querySelector('i');
      if (icone) icone.className = `ti ${mostrar ? 'ti-eye-off' : 'ti-eye'}`;
    });
  });
}
document.addEventListener('DOMContentLoaded', iniciarMostrarSenha);

/**
 * Avisa inline, enquanto digita, se a confirmação não coincide com a nova senha.
 */
document.addEventListener('DOMContentLoaded', () => {
  for (const [idNova, idConf] of [['troca-nova-senha', 'troca-confirmar-senha'], ['reg-senha', 'reg-confirmar']]) {
    const nova = document.getElementById(idNova);
    const conf = document.getElementById(idConf);
    if (!nova || !conf) continue;
    // Evita o auto-limpar de marcarErroCampo: aqui só checar() decide quando o aviso some
    conf.dataset.erroLigado = '1';
    const checar = () => {
      if (conf.value && nova.value !== conf.value) marcarErroCampo(conf, 'As senhas não coincidem.');
      else limparErroCampo(conf);
    };
    conf.addEventListener('input', checar);
    nova.addEventListener('input', () => { if (conf.value) checar(); });
  }
});
