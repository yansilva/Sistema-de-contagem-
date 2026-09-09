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

      const { accessToken, refreshToken, usuario, empresa } = res.data;
      sessionStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      this.usuario = usuario;
      this.empresa = empresa;

      this.atualizarInterface();
      showToast(`Bem-vindo, ${usuario.nome}!`, 'success');
      showScreen('screen-home');
    } catch (err) {
      erroEl.textContent = 'Erro ao conectar com o servidor.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-login"></i> Entrar';
    }
  },

  /**
   * Cadastro de nova empresa e usuário gestor
   */
  async fazerRegistro() {
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
      const res = await API.post('/empresas/registrar', {
        empresa_nome,
        nome,
        email,
        senha
      });

      if (!res || !res.success) {
        erroEl.textContent = res?.message || 'Erro ao criar conta.';
        return;
      }

      const { accessToken, refreshToken, usuario, empresa } = res.data;
      sessionStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      this.usuario = usuario;
      this.empresa = empresa;

      this.atualizarInterface();
      showToast('Conta criada com sucesso! 14 dias de teste ativados.', 'success');
      showScreen('screen-home');
    } catch (err) {
      erroEl.textContent = 'Falha ao registrar empresa.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-user-plus"></i> Criar conta';
    }
  },

  /**
   * Login temporário de demonstração (sandbox segura)
   */
  async loginGuest() {
    const btn = document.getElementById('btn-guest');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Acessando demo...';
    }

    try {
      const res = await API.get('/auth/guest');
      if (!res || !res.success) {
        showToast(res?.message || 'Não foi possível acessar a demonstração.', 'error');
        return;
      }

      const { accessToken, usuario, empresa } = res.data;
      sessionStorage.setItem('accessToken', accessToken);
      localStorage.removeItem('refreshToken'); // Guest não possui refresh token persistido

      this.usuario = usuario;
      this.empresa = empresa;

      this.atualizarInterface();
      showToast('Acesso de demonstração ativado (modo sandbox).', 'info');
      showScreen('screen-home');
    } catch (err) {
      showToast('Erro ao iniciar acesso de demonstração.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-player-play"></i> Testar sem cadastro (Demo)';
      }
    }
  },

  /**
   * Altera a senha do usuário autenticado
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
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      await API.post('/auth/logout', { refreshToken });
    }

    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    this.usuario = null;
    this.empresa = null;

    showScreen('screen-login');
    showToast('Você saiu da sua conta.', 'info');
  },

  /**
   * Atualiza elementos da topbar com dados do usuário logado
   */
  atualizarInterface() {
    const badgeEl = document.getElementById('topbar-user-badge');
    const avatarEl = document.getElementById('topbar-avatar');
    const nomeEl = document.getElementById('topbar-user-name');
    const btnBackoffice = document.getElementById('btn-nav-backoffice');

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

      // Mostra botão de back-office apenas para gestores ou admin
      if (btnBackoffice) {
        btnBackoffice.style.display = (this.usuario.papel === 'gestor' || this.usuario.papel === 'admin') ? 'inline-flex' : 'none';
      }
    } else {
      if (badgeEl) badgeEl.style.display = 'none';
      if (btnBackoffice) btnBackoffice.style.display = 'none';
    }
  }
};
