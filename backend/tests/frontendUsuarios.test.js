const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { criarUsuarioSchema } = require('../src/validators/schemas');
const { loadFrontendEvents } = require('./helpers/frontendEvents');

// Usa os IDs e eventos do HTML real para detectar divergências entre a tela e o módulo.
const html = fs.readFileSync(path.resolve(__dirname, '../../frontend/index.html'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/usuarios.js'), 'utf8');

describe('Formulário de funcionários no frontend', () => {
  let elements;
  let context;
  let usuarios;
  let api;
  let dispatch;

  beforeEach(() => {
    elements = new Map(
      [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [
        id,
        {
          value: '',
          textContent: '',
          innerHTML: '',
          style: {},
          disabled: false
        }
      ])
    );
    api = {
      post: jest.fn().mockResolvedValue({ success: true }),
      put: jest.fn().mockResolvedValue({ success: true })
    };
    context = vm.createContext({
      document: {
        getElementById: (id) => elements.get(id) || null,
        addEventListener: jest.fn()
      },
      API: api,
      showToast: jest.fn()
    });
    vm.runInContext(script + '\nglobalThis.usuarios = Usuarios;', context);
    usuarios = context.usuarios;
    usuarios.carregar = jest.fn();
    dispatch = loadFrontendEvents(context);
  });

  it('o botão Novo Funcionário abre o formulário vazio com senha temporária', () => {
    const button = html.match(/<button\b[^>]*>\s*<i[^>]*><\/i> Novo Funcionário/)[0];
    dispatch('click', button, { fromChild: true });
    expect(elements.get('modal-usuario').style.display).toBe('flex');
    expect(elements.get('user-nome').value).toBe('');
    expect(elements.get('user-email').disabled).toBe(false);
    expect(elements.get('user-senha-temp-group').style.display).toBe('block');
    expect(elements.get('user-papel').value).toBe('funcionario');
  });

  it('o botão da lista vazia também abre o formulário', () => {
    usuarios.renderizar();
    const button = elements.get('lista-usuarios').innerHTML.match(/<button\b[^>]*>/)[0];
    dispatch('click', button);
    expect(elements.get('modal-usuario').style.display).toBe('flex');
  });

  it('envia nome, email, senha temporária e perfis aceitos pela API', async () => {
    const select = html.match(/<select id="user-papel">([\s\S]*?)<\/select>/)[1];
    const roles = [...select.matchAll(/value="([^"]+)"/g)].map(([, role]) => role);
    expect(roles).toEqual(['funcionario', 'administrador']);
    for (const papel of roles) {
      usuarios.abrirModalCriar();
      elements.get('user-nome').value = 'Maria Teste';
      elements.get('user-email').value = 'maria@teste.test';
      elements.get('user-senha-temp').value = 'Temporaria@123';
      elements.get('user-papel').value = papel;
      await usuarios.salvar();
      const [url, body] = api.post.mock.calls.at(-1);
      expect(url).toBe('/usuarios');
      expect(body).toEqual({
        nome: 'Maria Teste',
        email: 'maria@teste.test',
        senha_temporaria: 'Temporaria@123',
        papel
      });
      expect(criarUsuarioSchema.body.safeParse(body).success).toBe(true);
      expect(elements.get('modal-usuario').style.display).toBe('none');
    }
  });

  it('a edição preenche os mesmos campos e preserva email e senha', async () => {
    usuarios.lista = [
      { id: 'usuario-teste', nome: 'Maria', email: 'maria@teste.test', papel: 'gestor' }
    ];
    usuarios.abrirModalEditar('usuario-teste');
    expect(elements.get('user-nome').value).toBe('Maria');
    expect(elements.get('user-email').disabled).toBe(true);
    expect(elements.get('user-senha-temp-group').style.display).toBe('none');
    expect(elements.get('user-papel').value).toBe('administrador');
    elements.get('user-nome').value = 'Maria Silva';
    await usuarios.salvar();
    expect(api.put).toHaveBeenCalledWith('/usuarios/usuario-teste', {
      nome: 'Maria Silva',
      papel: 'administrador'
    });
    expect(usuarios.carregar).toHaveBeenCalled();
  });
});
