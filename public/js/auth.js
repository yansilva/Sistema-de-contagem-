/**
 * Módulo de Autenticação e Gestão de Sessão do Usuário
 */
const Auth = {
  usuario: null,
  empresa: null,

  /**
   * Restaura sessão ao carregar a página
   */
  async restaurarSessao() {
    const token = sessionStorage.getItem('accessToken');
    if (!token) return false;

    const res = await API.get('/auth/me');
    if (res && res.success && res.data) {
      this.usuario = res.data.usuario;
      this.empresa = res.data.empresa;

      // Se o usuário precisa trocar a senha, redireciona
      if (this.usuario.mustChangePassword) {
        this.atualizarInterface();
        showScreen('screen-troca-senha-obrigatoria');
        return true;
      }

      this.atualizarInterface();
      return true;
    }
    return false;
  },

  /**
   * Realiza login com email e senha
   */
  async fazerLogin() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const erroEl = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    erroEl.textContent = '';
    if (!email || !senha) {
      erroEl.textContent = 'Preencha email e senha.';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Entrando...';

    try {
      const res = await API.post('/auth/login', { email, senha });

      if (!res || !res.success) {
        erroEl.textContent = res?.message || 'Email ou senha incorretos.';
        return;
      }

      const { accessToken, refreshToken, usuario, empresa, mustChangePassword } = res.data;
      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('refreshToken', refreshToken);
      localStorage.removeItem('refreshToken');

      this.usuario = usuario;
      this.empresa = empresa;

      this.atualizarInterface();

      // Redireciona para troca obrigatória de senha se necessário
      if (mustChangePassword) {
        document.getElementById('troca-senha-atual').value = senha;
        showToast('Você precisa definir uma nova senha antes de continuar.', 'warning');
        showScreen('screen-troca-senha-obrigatoria');
        return;
      }

      showToast(`Bem-vindo, ${usuario.nome}!`, 'success');
      showScreen('screen-home');
    } catch (err) {
      console.error('[LOGIN_ERROR]', err);
      erroEl.textContent = err?.message || 'Erro ao conectar com o servidor.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-login"></i> Entrar';
    }
  },

  /**
   * Cadastro de nova empresa e usuário administrador
   */
  async fazerRegistro() {
    if (this.usuario?.papel !== 'super_admin') {
      showToast('Cadastro de empresas restrito ao superadmin.', 'warning');
      return;
    }
    const empresa_nome = document.getElementById('reg-empresa').value.trim();
    const nome = document.getElementById('reg-nome').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const senha = document.getElementById('reg-senha').value;
    const confirmar = document.getElementById('reg-confirmar').value;
    const erroEl = document.getElementById('reg-error');
    const btn = document.getElementById('btn-registro');

    erroEl.textContent = '';

    if (!empresa_nome || !nome || !email || !senha) {
      erroEl.textContent = 'Preencha todos os campos obrigatórios.';
      return;
    }

    if (senha !== confirmar) {
      erroEl.textContent = 'As senhas digitadas não coincidem.';
      return;
    }

    if (senha.length < 8) {
      erroEl.textContent = 'A senha deve ter pelo menos 8 caracteres.';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Criando conta...';

    try {
      const res = await API.post('/empresas', {
        empresa_nome,
        nome,
        email,
        senha
      });

      if (!res || !res.success) {
        erroEl.textContent = res?.message || 'Erro ao criar conta.';
        return;
      }

      for (const id of ['reg-empresa', 'reg-nome', 'reg-email', 'reg-senha', 'reg-confirmar']) {
        document.getElementById(id).value = '';
      }
      showToast('Empresa cadastrada! O administrador deverá trocar a senha temporária no primeiro acesso.', 'success');
      showScreen('screen-home');
    } catch (err) {
      erroEl.textContent = 'Falha ao registrar empresa.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-building-store"></i> Cadastrar empresa';
    }
  },

  /**
   * Troca obrigatória de senha (primeiro acesso com senha temporária)
   */
  async trocarSenhaObrigatoria() {
    const senhaAtual = document.getElementById('troca-senha-atual').value;
    const novaSenha = document.getElementById('troca-nova-senha').value;
    const confirmar = document.getElementById('troca-confirmar-senha').value;
    const feedback = document.getElementById('troca-senha-error');
    const btn = document.getElementById('btn-troca-senha');

    feedback.textContent = '';

    if (!senhaAtual || !novaSenha || !confirmar) {
      feedback.textContent = 'Preencha todos os campos.';
      return;
    }

    if (novaSenha !== confirmar) {
      feedback.textContent = 'As senhas não coincidem.';
      return;
    }

    if (novaSenha.length < 8) {
      feedback.textContent = 'A nova senha deve ter pelo menos 8 caracteres.';
      return;
    }

    // Validação: maiúscula, minúscula e número
    if (!/[A-Z]/.test(novaSenha) || !/[a-z]/.test(novaSenha) || !/[0-9]/.test(novaSenha)) {
      feedback.textContent = 'A senha deve conter maiúscula, minúscula e número.';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
      const res = await API.put('/auth/senha', { senhaAtual, novaSenha });

      if (!res || !res.success) {
        feedback.textContent = res?.message || 'Erro ao alterar senha.';
        return;
      }

      // Atualiza flag local
      if (this.usuario) {
        this.usuario.mustChangePassword = false;
      }
      for (const id of ['troca-senha-atual', 'troca-nova-senha', 'troca-confirmar-senha']) {
        document.getElementById(id).value = '';
      }

      showToast('Senha definida com sucesso! Bem-vindo(a)!', 'success');
      showScreen('screen-home');
    } catch (err) {
      feedback.textContent = 'Erro ao conectar com o servidor.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-check"></i> Definir Nova Senha';
    }
  },

  /**
   * Altera a senha do usuário autenticado (via configurações)
   */
  async alterarSenha() {
    const senhaAtual = document.getElementById('senha-atual').value;
    const novaSenha = document.getElementById('senha-nova').value;
    const feedback = document.getElementById('msg-senha');

    feedback.className = 'msg-feedback';
    feedback.textContent = '';

    if (!senhaAtual || !novaSenha) {
      feedback.className = 'msg-feedback show error';
      feedback.textContent = 'Preencha a senha atual e a nova senha.';
      return;
    }

    if (novaSenha.length < 8) {
      feedback.className = 'msg-feedback show error';
      feedback.textContent = 'A nova senha deve ter no mínimo 8 caracteres.';
      return;
    }

    const res = await API.put('/auth/senha', { senhaAtual, novaSenha });

    if (!res || !res.success) {
      feedback.className = 'msg-feedback show error';
      feedback.textContent = res?.message || 'Erro ao alterar senha.';
      return;
    }

    feedback.className = 'msg-feedback show success';
    feedback.textContent = 'Senha alterada com sucesso!';
    document.getElementById('senha-atual').value = '';
    document.getElementById('senha-nova').value = '';
    showToast('Senha alterada com sucesso!', 'success');
  },

  /**
   * Encerra a sessão do usuário
   */
  async deslogar() {
    const refreshToken = sessionStorage.getItem('refreshToken');
    if (refreshToken) {
      await API.post('/auth/logout', { refreshToken });
    }

    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    localStorage.removeItem('refreshToken');
    this.usuario = null;
    this.empresa = null;
    this.atualizarInterface();
    for (const id of ['login-senha', 'reg-senha', 'reg-confirmar', 'troca-senha-atual', 'troca-nova-senha', 'troca-confirmar-senha']) {
      document.getElementById(id).value = '';
    }

    showScreen('screen-login');
    showToast('Você saiu da sua conta.', 'info');
  },

  /**
   * Atualiza elementos da topbar com dados do usuário logado
   */
  atualizarInterface() {
    const admin = this.isAdmin();
    for (const id of ['mobile-nav-toggle', 'topbar-menu']) {
      const element = document.getElementById(id);
      if (element) element.hidden = !this.usuario;
    }
    document.querySelectorAll('[data-admin-only]').forEach((element) => {
      element.hidden = !admin;
    });
    const homeFuncionario = document.getElementById('home-funcionario');
    if (homeFuncionario) homeFuncionario.hidden = !this.usuario || admin;
    const funcionarioNome = document.getElementById('funcionario-home-nome');
    if (funcionarioNome) funcionarioNome.textContent = this.usuario?.nome || 'equipe';
    const badgeEl = document.getElementById('topbar-user-badge');
    const avatarEl = document.getElementById('topbar-avatar');
    const nomeEl = document.getElementById('topbar-user-name');
    const btnBackoffice = document.getElementById('btn-nav-backoffice');
    const btnNovaEmpresa = document.getElementById('btn-nova-empresa');
    if (btnNovaEmpresa) btnNovaEmpresa.style.display = this.usuario?.papel === 'super_admin' ? 'inline-flex' : 'none';
    const btnListarEmpresas = document.getElementById('btn-listar-empresas');
    if (btnListarEmpresas) btnListarEmpresas.style.display = this.usuario?.papel === 'super_admin' ? 'inline-flex' : 'none';

    if (this.usuario) {
      const iniciais = (this.usuario.nome || 'U')
        .split(' ')
        .map(p => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      if (avatarEl) avatarEl.textContent = iniciais;
      if (nomeEl) {
        nomeEl.textContent = `${this.usuario.nome} (${this.empresa?.nome || 'Empresa'})`;
      }
      if (badgeEl) badgeEl.style.display = 'flex';

      // Mostra botão de back-office para administrador, gestor ou admin
      if (btnBackoffice) {
        btnBackoffice.style.display = admin ? 'inline-flex' : 'none';
      }
    } else {
      if (badgeEl) badgeEl.style.display = 'none';
      if (btnBackoffice) btnBackoffice.style.display = 'none';
    }
  },

  /**
   * Verifica se o usuário logado é administrador/gestor/super_admin
   */
  isAdmin() {
    return ['gestor', 'admin', 'administrador', 'super_admin'].includes(this.usuario?.papel);
  }
};
