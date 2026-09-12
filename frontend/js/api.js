/**
 * Cliente HTTP da API REST com interceptação de tokens e auto-refresh
 */
const API = {
  baseURL: '/api',
  isRefreshing: false,
  refreshSubscribers: [],

  subscribeTokenRefresh(cb) {
    this.refreshSubscribers.push(cb);
  },

  onRefreshed(token) {
    this.refreshSubscribers.forEach((cb) => cb(token));
    this.refreshSubscribers = [];
  },

  /**
   * Executa requisições HTTP com autenticação JWT e auto-renovação
   */
  async request(path, options = {}) {
    const token = sessionStorage.getItem('accessToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const res = await fetch(this.baseURL + path, {
        ...options,
        headers
      });

      // Se token expirou (401), tenta renovação transparente via refresh token
      if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
        const novoToken = await this.refreshToken();
        if (novoToken) {
          headers['Authorization'] = `Bearer ${novoToken}`;
          return fetch(this.baseURL + path, { ...options, headers });
        } else {
          Auth.deslogar();
          return null;
        }
      }

      return res;
    } catch (err) {
      console.error('[API ERROR]', path, err);
      showToast('Erro de conexão com o servidor. Verifique se o backend está ativo.', 'error');
      return null;
    }
  },

  /**
   * Renova o access token usando o refresh token com rotação de segurança
   */
  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;

    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.subscribeTokenRefresh((token) => resolve(token));
      });
    }

    this.isRefreshing = true;

    try {
      const res = await fetch(this.baseURL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!res.ok) {
        localStorage.removeItem('refreshToken');
        sessionStorage.removeItem('accessToken');
        return null;
      }

      const json = await res.json();
      const novoAccessToken = json.data?.accessToken || json.accessToken;
      const novoRefreshToken = json.data?.refreshToken || json.refreshToken;

      if (novoAccessToken) {
        sessionStorage.setItem('accessToken', novoAccessToken);
      }
      if (novoRefreshToken) {
        localStorage.setItem('refreshToken', novoRefreshToken);
      }

      this.onRefreshed(novoAccessToken);
      return novoAccessToken;
    } catch (err) {
      console.error('[API REFRESH ERROR]:', err);
      return null;
    } finally {
      this.isRefreshing = false;
    }
  },

  async get(path) {
    const res = await this.request(path, { method: 'GET' });
    if (!res) return null;
    return res.json();
  },

  async post(path, data) {
    const res = await this.request(path, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (!res) return null;
    return res.json();
  },

  async put(path, data) {
    const res = await this.request(path, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!res) return null;
    return res.json();
  },

  async patch(path, data) {
    const res = await this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    if (!res) return null;
    return res.json();
  },

  async delete(path) {
    const res = await this.request(path, { method: 'DELETE' });
    if (!res) return null;
    return res.json();
  },

  /**
   * Upload multipart/form-data (ex: relatórios PDF)
   */
  async upload(path, formData) {
    const token = sessionStorage.getItem('accessToken');
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    try {
      const res = await fetch(this.baseURL + path, {
        method: 'POST',
        headers,
        body: formData
      });

      if (res.status === 401) {
        const novoToken = await this.refreshToken();
        if (novoToken) {
          headers['Authorization'] = `Bearer ${novoToken}`;
          const retryRes = await fetch(this.baseURL + path, {
            method: 'POST',
            headers,
            body: formData
          });
          return retryRes.json();
        } else {
          Auth.deslogar();
          return null;
        }
      }

      return res.json();
    } catch (err) {
      console.error('[API UPLOAD ERROR]', path, err);
      showToast('Erro de conexão ao enviar o arquivo.', 'error');
      return null;
    }
  },

  /**
   * Baixa arquivos binários (ex: relatórios Excel .xlsx)
   */
  async download(path, nomeArquivo) {
    const token = sessionStorage.getItem('accessToken');
    try {
      const res = await fetch(this.baseURL + path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const erro = await res.json();
        showToast(erro.message || 'Erro ao gerar download do arquivo.', 'error');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[API DOWNLOAD ERROR]:', err);
      showToast('Falha no download do relatório.', 'error');
    }
  }
};
