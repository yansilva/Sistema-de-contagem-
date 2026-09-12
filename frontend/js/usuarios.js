/**
 * Módulo de Gestão de Usuários e Funcionários (Painel do Administrador)
 */
const Usuarios = {
  lista: [],
  usuarioEditandoId: null,

  /**
   * Carrega e renderiza a lista de usuários da empresa
   */
  async carregar() {
    const container = document.getElementById('lista-usuarios');
    if (!container) return;

    container.innerHTML = '<div class="loading"><span class="spinner"></span> Carregando usuários...</div>';

    const res = await API.get('/usuarios');
    if (!res || !res.success) {
      container.innerHTML = '<p class="text-muted">Não foi possível carregar os usuários.</p>';
      return;
    }

    this.lista = res.data.usuarios || [];
    this.renderizar();
  },

  /**
   * Renderiza a tabela de usuários com proteção contra XSS
   */
  renderizar() {
    const container = document.getElementById('lista-usuarios');
    if (!container) return;

    if (this.lista.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-users" style="font-size:2.5rem; color:var(--cor-texto-mutado)"></i>
          <p>Nenhum funcionário cadastrado ainda.</p>
          <button class="btn btn-primary btn-sm" onclick="Usuarios.abrirModalCriar()">
            <i class="ti ti-user-plus"></i> Cadastrar Primeiro Funcionário
          </button>
        </div>
      `;
      return;
    }

    const rows = this.lista.map((u) => {
      const isEu = Auth.usuario && Auth.usuario.id === u.id;
      const papelLabel = u.papel === 'administrador' || u.papel === 'gestor' || u.papel === 'admin'
        ? '<span class="badge badge-admin"><i class="ti ti-shield"></i> Administrador</span>'
        : '<span class="badge badge-funcionario"><i class="ti ti-user"></i> Funcionário</span>';

      const statusBadge = u.ativo
        ? '<span class="badge badge-sucesso"><i class="ti ti-check"></i> Ativo</span>'
        : '<span class="badge badge-danger"><i class="ti ti-ban"></i> Inativo</span>';

      const trocaPendente = u.must_change_password
        ? '<span class="badge badge-warning" title="Deve alterar senha no primeiro login"><i class="ti ti-key"></i> Senha Provisória</span>'
        : '';

      const btnStatus = isEu
        ? ''
        : `<button class="btn btn-ghost btn-sm" onclick="Usuarios.alternarStatus('${u.id}', ${u.ativo})" title="${u.ativo ? 'Desativar usuário' : 'Ativar usuário'}">
            <i class="ti ti-${u.ativo ? 'user-x' : 'user-check'}"></i>
          </button>`;

      const btnReset = `<button class="btn btn-ghost btn-sm" onclick="Usuarios.abrirModalReset('${u.id}', '${escapeHtml(u.nome)}')" title="Redefinir Senha Temporária">
        <i class="ti ti-rotate-2"></i>
      </button>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(u.nome)}</strong> ${isEu ? '<span class="badge" style="background:var(--cor-borda)">(Você)</span>' : ''}
            <div style="font-size:0.8rem; color:var(--cor-texto-mutado)">${escapeHtml(u.email)}</div>
          </td>
          <td>${papelLabel}</td>
          <td>${statusBadge} ${trocaPendente}</td>
          <td style="text-align:right">
            <div style="display:inline-flex; gap:4px">
              <button class="btn btn-ghost btn-sm" onclick="Usuarios.abrirModalEditar('${u.id}')" title="Editar dados">
                <i class="ti ti-edit"></i>
              </button>
              ${btnReset}
              ${btnStatus}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Nome / Email</th>
            <th>Papel</th>
            <th>Situação</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  },

  /**
   * Abre modal para cadastrar novo usuário
   */
  abrirModalCriar() {
    this.usuarioEditandoId = null;
    document.getElementById('modal-usuario-titulo').textContent = 'Cadastrar Novo Usuário';
    document.getElementById('user-nome').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-email').disabled = false;
    document.getElementById('user-papel').value = 'funcionario';
    document.getElementById('user-senha-temp-group').style.display = 'block';
    document.getElementById('user-senha-temp').value = '';
    document.getElementById('modal-usuario-error').textContent = '';
    document.getElementById('modal-usuario').style.display = 'flex';
  },

  /**
   * Abre modal para editar usuário existente
   */
  abrirModalEditar(id) {
    const u = this.lista.find((item) => item.id === id);
    if (!u) return;

    this.usuarioEditandoId = id;
    document.getElementById('modal-usuario-titulo').textContent = 'Editar Usuário';
    document.getElementById('user-nome').value = u.nome;
    document.getElementById('user-email').value = u.email;
    document.getElementById('user-email').disabled = true;
    document.getElementById('user-papel').value = u.papel === 'gestor' || u.papel === 'admin' ? 'administrador' : u.papel;
    document.getElementById('user-senha-temp-group').style.display = 'none';
    document.getElementById('modal-usuario-error').textContent = '';
    document.getElementById('modal-usuario').style.display = 'flex';
  },

  fecharModal() {
    document.getElementById('modal-usuario').style.display = 'none';
  },

  /**
   * Salva usuário (criação ou edição)
   */
  async salvar() {
    const nome = document.getElementById('user-nome').value.trim();
    const papel = document.getElementById('user-papel').value;
    const erroEl = document.getElementById('modal-usuario-error');
    erroEl.textContent = '';

    if (!nome) {
      erroEl.textContent = 'Informe o nome completo do usuário.';
      return;
    }

    if (this.usuarioEditandoId) {
      // Edição
      const res = await API.put(`/usuarios/${this.usuarioEditandoId}`, { nome, papel });
      if (!res || !res.success) {
        erroEl.textContent = res?.message || 'Erro ao atualizar usuário.';
        return;
      }
      showToast('Usuário atualizado com sucesso!', 'success');
    } else {
      // Criação com senha temporária
      const email = document.getElementById('user-email').value.trim();
      const senha_temporaria = document.getElementById('user-senha-temp').value;

      if (!email || !senha_temporaria) {
        erroEl.textContent = 'Preencha email e senha temporária.';
        return;
      }

      if (senha_temporaria.length < 6) {
        erroEl.textContent = 'A senha temporária deve ter pelo menos 6 caracteres.';
        return;
      }

      const res = await API.post('/usuarios', {
        nome,
        email,
        papel,
        senha_temporaria
      });

      if (!res || !res.success) {
        erroEl.textContent = res?.message || 'Erro ao cadastrar usuário.';
        return;
      }

      showToast('Funcionário cadastrado com sucesso! A troca de senha será exigida no primeiro acesso.', 'success');
    }

    this.fecharModal();
    this.carregar();
  },

  /**
   * Ativa ou desativa um usuário
   */
  async alternarStatus(id, statusAtual) {
    const novoStatus = !statusAtual;
    const acao = novoStatus ? 'ativar' : 'desativar';

    if (!confirm(`Tem certeza que deseja ${acao} este usuário?`)) return;

    const res = await API.patch(`/usuarios/${id}/status`, { ativo: novoStatus });
    if (!res || !res.success) {
      showToast(res?.message || `Erro ao ${acao} usuário.`, 'error');
      return;
    }

    showToast(`Usuário ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`, 'success');
    this.carregar();
  },

  /**
   * Modal de redefinição de senha temporária
   */
  abrirModalReset(id, nome) {
    this.usuarioEditandoId = id;
    document.getElementById('reset-user-nome').textContent = nome;
    document.getElementById('reset-nova-senha').value = '';
    document.getElementById('modal-reset-error').textContent = '';
    document.getElementById('modal-reset-senha').style.display = 'flex';
  },

  fecharModalReset() {
    document.getElementById('modal-reset-senha').style.display = 'none';
  },

  async confirmarResetSenha() {
    const novaSenhaTemporaria = document.getElementById('reset-nova-senha').value;
    const erroEl = document.getElementById('modal-reset-error');
    erroEl.textContent = '';

    if (!novaSenhaTemporaria || novaSenhaTemporaria.length < 6) {
      erroEl.textContent = 'A senha temporária deve ter no mínimo 6 caracteres.';
      return;
    }

    const res = await API.post(`/usuarios/${this.usuarioEditandoId}/reset-senha`, {
      novaSenhaTemporaria
    });

    if (!res || !res.success) {
      erroEl.textContent = res?.message || 'Erro ao redefinir senha temporária.';
      return;
    }

    showToast('Nova senha temporária definida. O usuário precisará alterá-la ao entrar.', 'success');
    this.fecharModalReset();
    this.carregar();
  }
};
