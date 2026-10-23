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
  let marcarErroCampo;
  let limparErroCampo;

  beforeEach(() => {
    elements = new Map(
      [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [
        id,
        {
          value: '',
          textContent: '',
          innerHTML: '',
          style: {},
          disabled: false,
          classList: { add: jest.fn(), remove: jest.fn() },
          focus: jest.fn()
        }
      ])
    );
    api = {
      post: jest.fn().mockResolvedValue({ success: true }),
      put: jest.fn().mockResolvedValue({ success: true })
    };
    // Stubs fiéis aos helpers de frontend/js/utils.js (validarCampos marca os inválidos e devolve true só se nenhum falhar).
    marcarErroCampo = jest.fn();
    limparErroCampo = jest.fn();
    const validarCampos = (regras) => {
      let invalido = false;
      for (const [input, msg, falhou] of regras) {
        if (falhou) { marcarErroCampo(input, msg); invalido = true; } else limparErroCampo(input);
      }
      return !invalido;
    };
    context = vm.createContext({
      marcarErroCampo,
      limparErroCampo,
      validarCampos,
      document: {
        getElementById: (id) => elements.get(id) || null,
        addEventListener: jest.fn(),
        activeElement: { focus: jest.fn() }
      },
      Auth: { usuario: { id: 'admin-atual' }, isAdmin: () => true },
      escapeHtml: (value) => String(value),
      Rotulos: { papel: (p) => ({ funcionario: 'Funcionário', administrador: 'Administrador', super_admin: 'Super Admin' }[p] || p) },
      mensagemSenhaFraca: (s) => (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(s) ? '' : 'senha fraca'),
      DICA_SENHA_FORTE: 'dica',
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

  it('salvar com nome vazio marca o erro no campo e não chama a API', async () => {
    usuarios.abrirModalCriar();
    elements.get('user-nome').value = '   ';
    elements.get('user-email').value = 'maria@teste.test';
    elements.get('user-senha-temp').value = 'Temporaria@123';
    await usuarios.salvar();
    expect(marcarErroCampo).toHaveBeenCalledWith(elements.get('user-nome'), 'Informe o nome completo do usuário.');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(elements.get('modal-usuario').style.display).toBe('flex');
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

  it('abre a redefinição de senha pelo botão da lista e envia a senha temporária', async () => {
    usuarios.lista = [
      { id: '11111111-1111-4111-8111-111111111111', nome: 'Gabriel', email: 'gabriel@teste.test', papel: 'funcionario', ativo: true }
    ];
    usuarios.renderizar();
    const button = elements.get('lista-usuarios').innerHTML.match(/<button\b[^>]*data-click="action-84"[^>]*>/)[0];

    dispatch('click', button, { fromChild: true });

    expect(elements.get('modal-reset-senha').style.display).toBe('flex');
    expect(elements.get('reset-user-nome').textContent).toBe('Gabriel');
    expect(elements.get('modal-reset-senha').classList.add).toHaveBeenCalledWith('active');
    expect(elements.get('reset-nova-senha').focus).toHaveBeenCalled();
    elements.get('reset-nova-senha').value = 'Temporaria123';
    dispatch('click', html.match(/<button\b[^>]*data-click="action-107"[^>]*>/)[0]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(api.post).toHaveBeenCalledWith('/usuarios/11111111-1111-4111-8111-111111111111/reset-senha', {
      novaSenhaTemporaria: 'Temporaria123'
    });
    expect(elements.get('btn-confirmar-reset-senha').disabled).toBe(false);
  });
});
