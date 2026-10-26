const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const { gerarAccessToken, verificarToken, hashToken } = require('../src/config/jwt');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { connect: jest.fn().mockRejectedValue(new Error('no local db')) }
}));

const app = require('../src/app');
const auth = require('../src/middlewares/auth');
const auditContext = require('../src/middlewares/auditContext');
const rateLimiter = require('../src/middlewares/rateLimiter');
const superAdminSchemas = require('../src/validators/superAdminSchemas');

const empresaId = '11111111-1111-1111-1111-111111111111';
const adminId = '22222222-2222-2222-2222-222222222222';
const funcId = '33333333-3333-3333-3333-333333333333';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function linhaUsuario(extra = {}) {
  return {
    id: adminId,
    nome: 'Admin',
    email: 'admin@empresa.test',
    papel: 'administrador',
    ativo: true,
    must_change_password: false,
    empresa_id: empresaId,
    plano: 'ativo',
    ...extra
  };
}

/** Cliente transacional que repassa ao mock db.query e registra o que foi executado. */
function instalarClienteTransacional(registro = []) {
  db.getClient.mockImplementation(() => ({
    query: (sql, params) => {
      const comando = String(sql).trim().toUpperCase();
      registro.push(comando.split(/\s+/)[0] === 'BEGIN' || ['COMMIT', 'ROLLBACK'].includes(comando) ? comando : String(sql));
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(comando)) return Promise.resolve({ rows: [] });
      return db.query(sql, params);
    },
    release: jest.fn()
  }));
  return registro;
}

describe('Hardening de segurança do backend', () => {
  const tokenAdmin = gerarAccessToken({ id: adminId, empresa_id: empresaId });
  const tokenFunc = gerarAccessToken({ id: funcId, empresa_id: empresaId });

  beforeEach(() => {
    jest.resetAllMocks();
    db.pool.connect.mockRejectedValue(new Error('no local db'));
    rateLimiter.resetarFalhasLogin();
    instalarClienteTransacional();
  });

  describe('1. Troca de senha obrigatória não é contornável', () => {
    const pendente = () => linhaUsuario({ id: funcId, papel: 'funcionario', must_change_password: true });

    it.each([
      ['query string com /auth/me', '/api/produtos?x=/auth/me'],
      ['query string com /auth/senha', '/api/produtos?next=/auth/senha'],
      ['query string com /auth/logout', '/api/usuarios?/auth/logout'],
      ['segmento extra depois de /auth/me', '/api/produtos/auth/me']
    ])('bloqueia GET com %s (403)', async (_nome, url) => {
      db.query.mockResolvedValueOnce({ rows: [pendente()] });
      const res = await request(app).get(url).set('Authorization', `Bearer ${tokenFunc}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('TROCA_SENHA_OBRIGATORIA');
    });

    it('continua permitindo GET /api/auth/me e POST /api/auth/logout', async () => {
      db.query.mockResolvedValueOnce({ rows: [pendente()] });
      const me = await request(app).get('/api/auth/me?qualquer=coisa').set('Authorization', `Bearer ${tokenFunc}`);
      expect(me.statusCode).toBe(200);

      db.query.mockResolvedValue({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [pendente()] });
      const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${tokenFunc}`).send({});
      expect(logout.statusCode).toBe(200);
    });

    it('whitelist exata por método + baseUrl + path', () => {
      const permitido = auth.isAllowedDuringPasswordChange;
      expect(permitido({ method: 'GET', baseUrl: '/api/auth', path: '/me' })).toBe(true);
      expect(permitido({ method: 'PUT', baseUrl: '/api/auth', path: '/senha' })).toBe(true);
      expect(permitido({ method: 'POST', baseUrl: '/api/auth', path: '/logout' })).toBe(true);
      expect(permitido({ method: 'POST', baseUrl: '/api/auth', path: '/me' })).toBe(false);
      expect(permitido({ method: 'GET', baseUrl: '/api/auth', path: '/senha' })).toBe(false);
      expect(permitido({ method: 'GET', baseUrl: '/api/produtos', path: '/me' })).toBe(false);
      expect(permitido({ method: 'GET', baseUrl: '/api/auth', path: '/me/' })).toBe(false);
    });
  });

  describe('2. JWT fixo em HS256 e sem segredo de fallback', () => {
    it('rejeita token assinado com outro algoritmo', async () => {
      const segredo = process.env.JWT_SECRET;
      const hs512 = jwt.sign({ id: adminId, empresa_id: empresaId, sv: 1 }, segredo, { algorithm: 'HS512' });
      expect(() => verificarToken(hs512)).toThrow();
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${hs512}`);
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('TOKEN_INVALIDO');
    });

    it('rejeita token alg=none', () => {
      const semAssinatura = jwt.sign({ id: adminId, sv: 1 }, '', { algorithm: 'none' });
      expect(() => verificarToken(semAssinatura)).toThrow();
    });

    it('emite tokens HS256', () => {
      expect(jwt.decode(tokenAdmin, { complete: true }).header.alg).toBe('HS256');
    });

    it('exige JWT_SECRET (sem fallback dev-secret)', () => {
      const original = process.env.JWT_SECRET;
      try {
        delete process.env.JWT_SECRET;
        expect(() => gerarAccessToken({ id: adminId, empresa_id: empresaId })).toThrow(/JWT_SECRET/);
        process.env.JWT_SECRET = 'curto';
        expect(() => verificarToken(tokenAdmin)).toThrow(/JWT_SECRET/);
      } finally {
        process.env.JWT_SECRET = original;
      }
    });
  });

  describe('3. Refresh token atômico e logout', () => {
    const raw = 'refresh_token_de_teste_com_mais_de_dez_chars';
    const linhaRefresh = (extra = {}) => ({
      id: 'rt-1',
      usuario_id: adminId,
      revogado: false,
      expira_em: new Date(Date.now() + 86400000).toISOString(),
      empresa_id: empresaId,
      ativo: true,
      ...extra
    });

    it('rotação usa transação, FOR UPDATE e consumo condicional', async () => {
      const registro = instalarClienteTransacional([]);
      db.query
        .mockResolvedValueOnce({ rows: [linhaRefresh()] })
        .mockResolvedValueOnce({ rows: [{ id: 'rt-1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: raw });
      expect(res.statusCode).toBe(200);
      expect(registro[0]).toBe('BEGIN');
      expect(registro).toContain('COMMIT');
      expect(registro.some((s) => /FOR UPDATE OF rt/.test(s))).toBe(true);
      expect(registro.some((s) => /SET revogado = TRUE WHERE id = \$1 AND revogado = FALSE RETURNING id/.test(s))).toBe(true);
    });

    it('perder a corrida (nenhuma linha consumida) trata a sessão como comprometida', async () => {
      const registro = instalarClienteTransacional([]);
      db.query
        .mockResolvedValueOnce({ rows: [linhaRefresh()] })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE condicional não consumiu nada
        .mockResolvedValue({ rows: [] });
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: raw });
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('SESSAO_COMPROMETIDA');
      expect(registro).toContain('COMMIT'); // a revogação geral é confirmada
      expect(registro).not.toContain('ROLLBACK');
      expect(registro.some((s) => /INSERT INTO refresh_tokens/.test(s))).toBe(false);
    });

    it('token inexistente faz ROLLBACK e retorna 401', async () => {
      const registro = instalarClienteTransacional([]);
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: raw });
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('REFRESH_INVALIDO');
      expect(registro).toContain('ROLLBACK');
    });

    it('logout mantém tokens revogados (só limpa os expirados) para detectar reutilização', async () => {
      const sqls = [];
      db.query.mockImplementation((sql) => {
        sqls.push(String(sql));
        return Promise.resolve({ rows: sqls.length === 1 ? [linhaUsuario()] : [] });
      });
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ refreshToken: raw });
      expect(res.statusCode).toBe(200);
      const apagar = sqls.find((s) => /DELETE FROM refresh_tokens/.test(s));
      expect(apagar).toBeDefined();
      expect(apagar).toMatch(/expira_em < NOW\(\)/);
      expect(apagar).not.toMatch(/revogado/);
      expect(sqls.some((s) => /UPDATE refresh_tokens SET revogado = TRUE WHERE token_hash/.test(s))).toBe(true);
      expect(hashToken(raw)).toHaveLength(64);
    });
  });

  describe('4. Regras de senha', () => {
    it('PUT /api/auth/senha rejeita nova senha igual à atual (400)', async () => {
      const hash = await bcrypt.hash('SenhaAtual123', 4);
      db.query
        .mockResolvedValueOnce({ rows: [linhaUsuario()] })
        .mockResolvedValueOnce({ rows: [{ senha_hash: hash, must_change_password: false }] });
      const res = await request(app)
        .put('/api/auth/senha')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ senhaAtual: 'SenhaAtual123', novaSenha: 'SenhaAtual123' });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('DADOS_INVALIDOS');
    });

    const longa = `Aa1${'x'.repeat(70)}`; // 73 bytes

    it('PUT /api/auth/senha rejeita nova senha acima de 72 bytes', async () => {
      db.query.mockResolvedValueOnce({ rows: [linhaUsuario()] });
      const res = await request(app)
        .put('/api/auth/senha')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ senhaAtual: 'qualquer', novaSenha: longa });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/usuarios exige senha temporária forte (8+, maiúscula, minúscula, número, até 72 bytes)', async () => {
      for (const senha of ['abc123', 'semmaiuscula1', 'SEMMINUSCULA1', 'SemNumeroAqui', longa]) {
        db.query.mockResolvedValueOnce({ rows: [linhaUsuario()] });
        const res = await request(app)
          .post('/api/usuarios')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ nome: 'Func Teste', email: 'func@empresa.test', papel: 'funcionario', senha_temporaria: senha });
        expect(res.statusCode).toBe(400);
      }
    });

    it('POST /api/usuarios/:id/reset-senha exige a mesma regra forte', async () => {
      db.query.mockResolvedValueOnce({ rows: [linhaUsuario()] });
      const res = await request(app)
        .post(`/api/usuarios/${funcId}/reset-senha`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ novaSenhaTemporaria: 'fraca12' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('5. Limite de falhas de login por e-mail', () => {
    it('bloqueia a conta após 10 falhas e não afeta outros e-mails', async () => {
      db.query.mockResolvedValue({ rows: [] });
      for (let i = 0; i < 10; i += 1) {
        const r = await request(app).post('/api/auth/login').send({ email: 'Vitima@Empresa.test', senha: 'Errada123' });
        expect(r.statusCode).toBe(401);
      }
      const bloqueada = await request(app).post('/api/auth/login').send({ email: 'vitima@empresa.test', senha: 'Errada123' });
      expect(bloqueada.statusCode).toBe(429);
      expect(bloqueada.body.code).toBe('RATE_LIMIT_CONTA');

      const outra = await request(app).post('/api/auth/login').send({ email: 'outra@empresa.test', senha: 'Errada123' });
      expect(outra.statusCode).toBe(401);
    }, 60000);

    it('login com sucesso zera as falhas da conta', async () => {
      const hash = await bcrypt.hash('SenhaCerta123', 4);
      for (let i = 0; i < 5; i += 1) rateLimiter.registrarFalhaLogin('ok@empresa.test');
      db.query.mockResolvedValue({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [linhaUsuario({ email: 'ok@empresa.test', senha_hash: hash, empresa_nome: 'E' })] });
      const res = await request(app).post('/api/auth/login').send({ email: 'ok@empresa.test', senha: 'SenhaCerta123' });
      expect(res.statusCode).toBe(200);
      for (let i = 0; i < 9; i += 1) rateLimiter.registrarFalhaLogin('ok@empresa.test');
      const ainda = await request(app).post('/api/auth/login').send({ email: 'ok@empresa.test', senha: 'Errada123' });
      expect(ainda.statusCode).not.toBe(429);
    });
  });

  describe('6. CORS e Swagger', () => {
    const originalEnv = { ...process.env };
    afterEach(() => {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
      if (originalEnv.CORS_ALLOWED_ORIGINS === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
      else process.env.CORS_ALLOWED_ORIGINS = originalEnv.CORS_ALLOWED_ORIGINS;
    });

    it('não libera sufixo .vercel.app nem origem arbitrária', async () => {
      const res = await request(app).get('/api/health').set('Origin', 'https://qualquer-app.vercel.app');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('libera apenas origens da lista exata CORS_ALLOWED_ORIGINS, sem credentials', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.exemplo.com, https://painel.exemplo.com/';
      const ok = await request(app).get('/api/health').set('Origin', 'https://painel.exemplo.com');
      expect(ok.headers['access-control-allow-origin']).toBe('https://painel.exemplo.com');
      expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
      const sub = await request(app).get('/api/health').set('Origin', 'https://x.app.exemplo.com');
      expect(sub.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('localhost só é aceito fora de produção', async () => {
      const dev = await request(app).get('/api/health').set('Origin', 'http://localhost:3000');
      expect(dev.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      process.env.NODE_ENV = 'production';
      const prod = await request(app).get('/api/health').set('Origin', 'http://localhost:3000');
      expect(prod.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('Swagger responde fora de produção e 404 em produção', async () => {
      const dev = await request(app).get('/api/docs/');
      expect(dev.statusCode).toBe(200);
      process.env.NODE_ENV = 'production';
      const prod = await request(app).get('/api/docs/');
      expect(prod.statusCode).toBe(404);
    });
  });

  describe('7. Contexto de auditoria', () => {
    it('ignora X-Operation-Id enviado pelo cliente e gera UUID novo', () => {
      const forjado = '11111111-2222-4333-8444-555555555555';
      const req = { headers: { 'x-operation-id': forjado, 'user-agent': 'jest' }, ip: '203.0.113.9', socket: {} };
      const res = { setHeader: jest.fn() };
      auditContext(req, res, jest.fn());
      expect(req.auditContext.operacaoId).not.toBe(forjado);
      expect(req.auditContext.operacaoId).toMatch(UUID_RE);
      expect(req.auditContext.requestId).toMatch(UUID_RE);
    });

    it('usa req.ip (trust proxy) e não lê X-Forwarded-For por conta própria', () => {
      const req = {
        headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'jest' },
        ip: '203.0.113.9',
        socket: { remoteAddress: '10.0.0.1' }
      };
      auditContext(req, { setHeader: jest.fn() }, jest.fn());
      expect(req.auditContext.ip).toBe('203.0.113.9');
    });
  });

  describe('8. Auditoria de usuários dentro da transação', () => {
    it('se a auditoria falhar, a criação do usuário sofre ROLLBACK e retorna erro', async () => {
      const registro = instalarClienteTransacional([]);
      db.query.mockImplementation((sql) => {
        const s = String(sql);
        if (/FROM usuarios u/.test(s)) return Promise.resolve({ rows: [linhaUsuario()] });
        if (/SELECT id FROM usuarios WHERE email/.test(s)) return Promise.resolve({ rows: [] });
        if (/INSERT INTO usuarios/.test(s)) {
          return Promise.resolve({ rows: [{ id: funcId, nome: 'Func', email: 'f@empresa.test', papel: 'funcionario' }] });
        }
        if (/INSERT INTO audit_logs/.test(s)) return Promise.reject(new Error('falha de auditoria'));
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nome: 'Func Teste', email: 'f@empresa.test', papel: 'funcionario', senha_temporaria: 'TempSenha123' });
      expect(res.statusCode).toBe(500);
      expect(registro).toContain('ROLLBACK');
      expect(registro).not.toContain('COMMIT');
    });

    it('alterar status registra a auditoria na mesma transação (COMMIT depois do INSERT em audit_logs)', async () => {
      const registro = instalarClienteTransacional([]);
      db.query.mockImplementation((sql) => {
        const s = String(sql);
        if (/FROM usuarios u/.test(s)) return Promise.resolve({ rows: [linhaUsuario()] });
        if (/UPDATE usuarios/.test(s)) return Promise.resolve({ rows: [{ id: funcId, nome: 'F', papel: 'funcionario', ativo: true }] });
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .patch(`/api/usuarios/${funcId}/status`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ ativo: true });
      expect(res.statusCode).toBe(200);
      const iAudit = registro.findIndex((s) => /INSERT INTO audit_logs/.test(s));
      expect(iAudit).toBeGreaterThan(0);
      expect(registro.indexOf('COMMIT')).toBeGreaterThan(iAudit);
    });
  });

  describe('9. Motivo da sessão de auditoria do Super Admin', () => {
    const schema = superAdminSchemas.iniciarAuditoria.body;
    it('é obrigatório e exige no mínimo 10 caracteres', () => {
      expect(schema.safeParse({ empresa_id: empresaId }).success).toBe(false);
      expect(schema.safeParse({ empresa_id: empresaId, motivo: '         ' }).success).toBe(false);
      expect(schema.safeParse({ empresa_id: empresaId, motivo: 'curto' }).success).toBe(false);
      expect(schema.safeParse({ empresa_id: empresaId, motivo: 'chamado 1234 de suporte' }).success).toBe(true);
    });
  });
});
