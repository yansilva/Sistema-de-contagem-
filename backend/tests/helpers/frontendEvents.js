const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(path.resolve(__dirname, '../../../frontend/js/events.js'), 'utf8');

// Executa o listener de produção, com atributos extraídos do HTML real.
function loadFrontendEvents(context) {
  const register = context.document.addEventListener;
  const start = register.mock.calls.length;
  vm.runInContext(script, context);
  const listeners = new Map(register.mock.calls.slice(start));

  return (type, tag, { fromChild = false } = {}) => {
    const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const attributes = Object.fromEntries(
      [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])
    );
    const element = {
      disabled: /\bdisabled(?:\s|>|=)/.test(tag),
      dataset: Object.fromEntries(Object.entries(attributes)
        .filter(([key]) => key.startsWith('data-'))
        .map(([key, value]) => [key.slice(5), value])),
      getAttribute: (name) => attributes[name] ?? null,
      closest: (selector) => selector === `[data-${type}]` ? element : null
    };
    const target = fromChild ? { closest: (selector) => element.closest(selector) } : element;
    listeners.get(type)({ target, stopPropagation: jest.fn() });
  };
}

module.exports = { loadFrontendEvents };
