const fs = require('fs');
const path = require('path');
const vm = require('vm');
const script = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/mobile-nav.js'), 'utf8');

describe('Navegação compacta para celular', () => {
  let toggle, menu, events, resize;
  beforeEach(() => {
    events = {};
    toggle = {
      attrs: { 'aria-expanded': 'false' },
      setAttribute(key, value) { this.attrs[key] = value; },
      getAttribute(key) { return this.attrs[key]; },
      contains: target => target === toggle,
      addEventListener: (_type, handler) => { events.toggle = handler; },
      focus: jest.fn()
    };
    menu = { contains: target => target.insideMenu === true };
    vm.runInNewContext(script, {
      document: {
        getElementById: id => id === 'mobile-nav-toggle' ? toggle : menu,
        addEventListener: (type, handler) => { events[type] = handler; }
      },
      window: { matchMedia: () => ({ addEventListener: (_type, handler) => { resize = handler; } }) }
    });
  });

  it('abre e fecha pelo botão com estado acessível', () => {
    events.toggle();
    expect(toggle.attrs['aria-expanded']).toBe('true');
    expect(toggle.attrs['aria-label']).toBe('Fechar menu de navegação');
    events.toggle();
    expect(toggle.attrs['aria-expanded']).toBe('false');
  });
  it('fecha ao selecionar uma ação ou tocar fora', () => {
    for (const target of [{insideMenu:true,closest:()=>({})}, {insideMenu:false}]) {
      events.toggle();
      events.click({target});
      expect(toggle.attrs['aria-expanded']).toBe('false');
    }
  });
  it('Escape fecha e devolve o foco ao botão', () => {
    events.toggle();
    events.keydown({key:'Escape'});
    expect(toggle.attrs['aria-expanded']).toBe('false');
    expect(toggle.focus).toHaveBeenCalledTimes(1);
  });
  it('fecha ao sair pelo teclado ou mudar para o layout desktop', () => {
    events.toggle();
    events.focusin({target:{}});
    expect(toggle.attrs['aria-expanded']).toBe('false');
    events.toggle();
    resize();
    expect(toggle.attrs['aria-expanded']).toBe('false');
  });
});
