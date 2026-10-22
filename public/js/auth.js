/**
 * Módulo de Autenticação e Gestão de Sessão do Usuário
 */
const Auth = {
  usuario: null,
  empresa: null,

  async carregarModulosDoPerfil() {
    if (typeof FrontendModules === 'undefined') return;
    await FrontendModules.carregarParaPapel(this.usuario?.papel);
  },

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

      try {
        await this.carregarModulosDoPerfil();
      } catch (err) {
        console.error('[MODULE_LOAD_ERROR]', err);
        showToast('Não foi possível preparar sua área. Verifique a conexão e tente novamente.', 'error');
        return false;
      }
      this.atualizarInterface();
      if (typeof Auditoria !== 'undefined') await Auditoria.restaurar();
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
      erroEl.textContent = 'Preencha e-mail e senha.';
      document.getElementById(email ? 'login-senha' : 'login-email').focus();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Entrando...';

    try {
      const res = await API.post('/auth/login', { email, senha });

      if (!res || !res.success) {
        if (res?.status === 429) {
          const seg = Number(res.retryAfter);
          const espera = seg > 0
            ? (seg <= 90 ? 'Aguarde um minuto' : `Aguarde ${Math.ceil(seg / 60)} minutos`)
            : 'Aguarde um minuto';
          erroEl.textContent = `Muitas tentativas. ${espera} e tente de novo.`;
          return;
        }
        erroEl.textContent = res?.message || 'E-mail ou senha incorretos. Confira os dados ou fale com o administrador da sua empresa.';
        const campoSenha = document.getElementById('login-senha');
        campoSenha.focus();
        campoSenha.select();
        return;
      }

      const { accessToken, refreshToken, usuario, empresa, mustChangePassword } = res.data;
      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('refreshToken', refreshToken);
      localStorage.removeItem('refreshToken');

      this.usuario = usuario;
      this.empresa = empresa;

      // Redireciona para troca obrigatória de senha se necessário
      if (mustChangePassword) {
        this.atualizarInterface();
        document.getElementById('troca-senha-atual').value = senha;
        showToast('Você precisa definir uma nova senha antes de continuar.', 'warning');
        showScreen('screen-troca-senha-obrigatoria');
        return;
      }

      await this.carregarModulosDoPerfil();
      this.atualizarInterface();

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

    const campos = {
      empresa_nome: document.getElementById('reg-empresa'),
      nome: document.getElementById('reg-nome'),
      email: document.getElementById('reg-email'),
      senha: document.getElementById('reg-senha')
    };
    const campoConfirmar = document.getElementById('reg-confirmar');
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const valido = validarCampos([
      [campos.empresa_nome,
        !empresa_nome ? 'Informe o nome da empresa.' : 'O nome da empresa deve ter pelo menos 2 caracteres.',
        empresa_nome.length < 2],
      [campos.nome,
        !nome ? 'Informe o nome do administrador.' : 'O nome deve ter pelo menos 2 caracteres.',
        nome.length < 2],
      [campos.email,
        !email ? 'Informe o e-mail de acesso.' : 'Informe um e-mail válido, como nome@empresa.com.',
        !emailValido],
      [campos.senha,
        !senha ? 'Informe a senha temporária.' : mensagemSenhaFraca(senha),
        !senha || !SENHA_FORTE_REGEX.test(senha)],
      [campoConfirmar,
        !confirmar ? 'Repita a senha.' : 'As senhas não coincidem.',
        !confirmar || senha !== confirmar]
    ]);
    if (!valido) return;

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
        if (res?.code === 'EMAIL_EXISTENTE' || res?.code === 'EMPRESA_EXISTENTE') {
          marcarErroCampo(campos.email, 'Este e-mail já está cadastrado. Use outro e-mail de acesso.');
          campos.email.focus();
        } else if (!aplicarErrosServidor(res, campos)) {
          erroEl.textContent = res?.message || 'Erro ao criar conta.';
        }
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

    const valido = validarCampos([
      [document.getElementById('troca-senha-atual'), 'Informe a senha temporária atual.', !senhaAtual],
      [document.getElementById('troca-nova-senha'),
        !novaSenha ? 'Informe a nova senha.' : mensagemSenhaFraca(novaSenha),
        !novaSenha || !SENHA_FORTE_REGEX.test(novaSenha)],
      [document.getElementById('troca-confirmar-senha'),
        !confirmar ? 'Repita a nova senha.' : 'As senhas não coincidem.',
        !confirmar || novaSenha !== confirmar]
    ]);
    if (!valido) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
      const res = await API.put('/auth/senha', { senhaAtual, novaSenha });

      if (!res || !res.success) {
        if (!aplicarErrosServidor(res, {
          senhaAtual: document.getElementById('troca-senha-atual'),
          novaSenha: document.getElementById('troca-nova-senha')
        })) {
          feedback.textContent = res?.message || 'Erro ao alterar senha.';
        }
        return;
      }

      for (const id of ['troca-senha-atual', 'troca-nova-senha', 'troca-confirmar-senha', 'login-senha']) {
        const campo = document.getElementById(id);
        if (campo) campo.value = '';
      }
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      this.usuario = null;
      this.empresa = null;
      this.atualizarInterface();
      showScreen('screen-login');
      showToast('Senha definida. Entre novamente para continuar.', 'success');
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

    const valido = validarCampos([
      [document.getElementById('senha-atual'), 'Informe a senha atual.', !senhaAtual],
      [document.getElementById('senha-nova'),
        !novaSenha ? 'Informe a nova senha.' : mensagemSenhaFraca(novaSenha),
        !novaSenha || !SENHA_FORTE_REGEX.test(novaSenha)]
    ]);
    if (!valido) return;

    const res = await API.put('/auth/senha', { senhaAtual, novaSenha });

    if (!res || !res.success) {
      const porCampo = aplicarErrosServidor(res, {
        senhaAtual: document.getElementById('senha-atual'),
        novaSenha: document.getElementById('senha-nova')
      });
      if (!porCampo) {
        feedback.className = 'msg-feedback show error';
        feedback.textContent = res?.message || 'Erro ao alterar senha.';
      }
      return;
    }

    feedback.className = 'msg-feedback show success';
    feedback.textContent = 'Senha alterada. Entre novamente para continuar.';
    document.getElementById('senha-atual').value = '';
    document.getElementById('senha-nova').value = '';
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    this.usuario = null;
    this.empresa = null;
    this.atualizarInterface();
    showScreen('screen-login');
    showToast('Senha alterada. Entre novamente para continuar.', 'success');
  },

  /**
   * Encerra a sessão do usuário
   */
  async deslogar() {
    if (typeof StockImport !== 'undefined' && StockImport.limparSessao) StockImport.limparSessao();
    const refreshToken = sessionStorage.getItem('refreshToken');
    if (refreshToken) {
      await API.post('/auth/logout', { refreshToken });
    }

    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('superAdminBackupToken');
    sessionStorage.removeItem('superAdminBackupUser');
    sessionStorage.removeItem('superAdminBackupEmpresa');
    sessionStorage.removeItem('superAdminAuditSession');
    if (typeof Auditoria !== 'undefined') Auditoria.limparLocal();
    localStorage.removeItem('refreshToken');
    this.usuario = null;
    this.empresa = null;
    this.atualizarInterface();
    for (const id of ['login-email', 'login-senha', 'reg-senha', 'reg-confirmar', 'troca-senha-atual', 'troca-nova-senha', 'troca-confirmar-senha']) {
      const campo = document.getElementById(id);
      if (campo) campo.value = '';
    }

    showScreen('screen-login');
    showToast('Você saiu da sua conta.', 'info');
    const emailLogin = document.getElementById('login-email');
    if (emailLogin) emailLogin.focus();
  },

  /**
   * Atualiza elementos da topbar com dados do usuário logado
   */
  atualizarInterface() {
    const identidade = JSON.stringify([this.usuario?.id, this.usuario?.nome, this.usuario?.papel, this.usuario?.empresa_id, this.empresa?.id, this.empresa?.nome]);
    if (this._identidadeImportacao !== identidade) {
      if (typeof StockImport !== 'undefined' && StockImport.limparSessao) StockImport.limparSessao();
      this._identidadeImportacao = identidade;
    }
    const admin = this.isAdmin();
    for (const id of ['mobile-nav-toggle', 'topbar-menu', 'topbar-sair']) {
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

    // Dashboard do Super Admin
    const homeSuper = document.getElementById('home-superadmin');
    const isSuperAdmin = this.usuario?.papel === 'super_admin';
    if (homeSuper) homeSuper.hidden = !this.usuario || !isSuperAdmin;
    const homeAdministrador = document.getElementById('home-administrador');
    if (homeAdministrador) homeAdministrador.hidden = !this.usuario || !admin || isSuperAdmin;

    const auditBar = document.getElementById('audit-session-bar');
    if (auditBar && !sessionStorage.getItem('superAdminAuditSession')) auditBar.style.display = 'none';

    // Atualiza nome da empresa no topo do cabeçalho
    const titleEl = document.getElementById('topbar-company-title');
    if (titleEl) {
      if (!this.usuario) {
        titleEl.textContent = 'Sistema de Estoque';
      } else if (isSuperAdmin) {
        titleEl.textContent = 'Plataforma SaaS';
      } else {
        titleEl.textContent = this.empresa?.nome || 'Sistema de Estoque';
      }
    }
    const badgeEl = document.getElementById('topbar-user-badge');
    const avatarEl = document.getElementById('topbar-avatar');
    const nomeEl = document.getElementById('topbar-user-name');
    const btnBackoffice = document.getElementById('btn-nav-backoffice');
    const btnNovaEmpresa = document.getElementById('btn-nova-empresa');
    // Super Admin: "Nova empresa" e "Empresas" ficam só no console (cabeçalho, KPI, barra lateral); sem duplicar na topbar
    if (btnNovaEmpresa) btnNovaEmpresa.style.display = 'none';
    const btnListarEmpresas = document.getElementById('btn-listar-empresas');
    if (btnListarEmpresas) btnListarEmpresas.style.display = 'none';

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
        btnBackoffice.style.display = admin && !isSuperAdmin ? 'inline-flex' : 'none';
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
