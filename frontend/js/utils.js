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
 * @param {'success'|'error'|'info'} [tipo='info'] - Tipo visual do toast
 */
function showToast(msg, tipo = 'info') {
  // Remove toast anterior se ainda estiver na tela
  const antigo = document.querySelector('.toast');
  if (antigo) antigo.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;

  const iconMap = {
    success: 'ti-check',
    error: 'ti-alert-circle',
    info: 'ti-info-circle'
  };
  const icon = iconMap[tipo] || 'ti-info-circle';

  // Criação segura de elementos sem innerHTML não sanitizado
  const iconEl = document.createElement('i');
  iconEl.className = `ti ${icon}`;
  const textNode = document.createTextNode(msg);

  toast.appendChild(iconEl);
  toast.appendChild(textNode);
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
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
