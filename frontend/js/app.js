/**
 * Orquestrador Principal do Frontend (Inventory Management System)
 */

/**
 * Alterna a tela ativa do sistema
 * @param {string} screenId 
 */
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Ações contextuais por tela
  if (screenId === 'screen-backoffice') {
    Produtos.carregar();
  } else if (screenId === 'screen-home') {
    Auth.atualizarInterface();
  }
}

/**
 * Alterna abas dentro do Back-office (Produtos, Histórico, Configurações)
 * @param {string} tabId 
 */
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

  const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);

  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  if (tabId === 'produtos') {
    Produtos.carregar();
  } else if (tabId === 'historico') {
    Historico.carregar();
  }
}

/**
 * Alterna entre tema claro e escuro, persistindo em localStorage
 */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('inventory_theme', next);

  document.querySelectorAll('.btn-theme').forEach(b => {
    b.textContent = next === 'dark' ? '☀️' : '🌙';
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
  document.querySelectorAll('.btn-theme').forEach(b => {
    b.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  });

  // 2. Configurar busca de fornecedor com debounce
  const inputBusca = document.getElementById('busca-fornecedor');
  if (inputBusca) {
    inputBusca.addEventListener('input', debounce((e) => {
      Contagens.filtrarSugestoes(e.target.value);
    }, 250));
  }

  // 3. Fechar sugestões ao clicar fora
  document.addEventListener('click', (e) => {
    const box = document.getElementById('sugestoes-fornecedor');
    if (box && !e.target.closest('.fornecedor-search')) {
      box.classList.remove('show');
    }
  });

  // 4. Fechar modais com Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Produtos.fecharModal();
    }
  });

  // 5. Restaurar sessão ativa ou exibir login
  const logado = await Auth.restaurarSessao();
  if (logado) {
    showScreen('screen-home');
  } else {
    showScreen('screen-login');
  }
});
