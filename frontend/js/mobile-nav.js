(() => {
  const toggle = document.getElementById('mobile-nav-toggle');
  const menu = document.getElementById('topbar-menu');
  const mobile = window.matchMedia('(max-width: 1100px)');

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
  }

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', event => {
    if (toggle.contains(event.target)) return;
    if (!menu.contains(event.target) || event.target.closest('[data-click]')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  // Fecha também ao navegar pelo teclado para fora do menu.
  document.addEventListener('focusin', event => {
    if (!toggle.contains(event.target) && !menu.contains(event.target)) setOpen(false);
  });
  mobile.addEventListener('change', () => setOpen(false));
})();
