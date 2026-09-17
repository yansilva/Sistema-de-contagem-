(() => {
  const root = document.getElementById('estoque-estilos');
  const design = document.getElementById('preview-design');
  const motion = document.getElementById('preview-motion');
  const theme = document.getElementById('es-theme');
  const dialog = document.getElementById('preview-dialog');
  const descriptions = {
    sober: 'Superfícies neutras, bordas delicadas e azul concentrado nos botões e ícones.',
    depth: 'Fundos levemente azulados, gradientes discretos e sombras suaves. Opção recomendada.',
    accents: 'Azul principal com pequenos acentos de sálvia, lavanda e areia para diferenciar funções.'
  };

  function render() {
    root.dataset.design = design.value;
    root.dataset.motion = String(motion.checked);
    document.getElementById('es-option').textContent = design.selectedOptions[0].textContent;
    document.getElementById('preview-description').textContent = descriptions[design.value];
    theme.textContent = root.dataset.theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
  }

  design.addEventListener('change', render);
  motion.addEventListener('change', render);
  theme.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    render();
  });
  root.querySelectorAll('.es-action, #es-new').forEach(button => {
    button.addEventListener('click', () => {
      const title = button.querySelector('strong')?.textContent || button.textContent.trim();
      document.getElementById('preview-dialog-title').textContent = title;
      dialog.showModal();
    });
  });
  document.getElementById('preview-close').addEventListener('click', () => dialog.close());
  render();
})();
