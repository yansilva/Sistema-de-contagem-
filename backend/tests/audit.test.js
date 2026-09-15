const request = require('supertest');
const { gerarAccessToken } = require('../src/config/jwt');
jest.mock('../src/config/db', () => require('../src/config/mockDb'));
const app = require('../src/app');
const { state, resetMockDb } = require('../src/config/mockDb');
const { sanitizeCsvValue } = require('../src/controllers/atividadesController');

const usuariosTeste = [];

function createToken(payload) {
  usuariosTeste.push({ ...payload, ativo: true, must_change_password: false });
  return gerarAccessToken(payload);
}

describe('Auditoria e Rastreabilidade — Rotas /api/atividades e Segurança', () => {
  const empresaIdA = '11111111-1111-1111-1111-111111111111';
  const empresaIdB = '22222222-2222-2222-2222-222222222222';

  const adminTokenA = createToken({
    id: 'aaaa1111-1111-1111-1111-111111111111',
    empresa_id: empresaIdA,
    nome: 'Admin Loja A',
    email: 'admin@lojaa.com',
    papel: 'administrador'
  });

  createToken({
    id: 'bbbb2222-2222-2222-2222-222222222222',
    empresa_id: empresaIdB,
    nome: 'Admin Loja B',
    email: 'admin@lojab.com',
    papel: 'admin'
  });

  const funcTokenA = createToken({
    id: 'cccc3333-3333-3333-3333-333333333333',
    empresa_id: empresaIdA,
    nome: 'Funcionario Loja A',
    email: 'func@lojaa.com',
    papel: 'funcionario'
  });

  const superAdminToken = createToken({
    id: '99999999-9999-9999-9999-999999999999',
    empresa_id: empresaIdA,
    nome: 'Super Admin Plataforma',
    email: 'super@sistema.com',
    papel: 'super_admin'
  });

  beforeEach(() => {
    resetMockDb();
    state.usuarios.push(...usuariosTeste.map((usuario) => ({ ...usuario })));

    state.empresas.push(
      { id: empresaIdA, nome: 'Empresa A', email_contato: 'lojaA@email.com', plano: 'ativo' },
      { id: empresaIdB, nome: 'Empresa B', email_contato: 'lojaB@email.com', plano: 'ativo' }
    );

    // Inserir logs de teste
    state.auditLogs.push(
      {
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        escopo: 'empresa',
        empresa_id: empresaIdA,
        ator_tipo: 'usuario',
        ator_id: 'aaaa1111-1111-1111-1111-111111111111',
        ator_papel: 'administrador',
        ator_rotulo: 'Admin Loja A',
        acao: 'produto.criado',
        entidade: 'produto',
        entidade_id: 'prod-001',
        resultado: 'sucesso',
        dados_anteriores: null,
        dados_novos: { codigo: 'SKU-01', nome: 'Camiseta' },
        metadados: {},
        motivo: 'Cadastro inicial',
        codigo_erro: null,
        ip: '127.0.0.1',
        user_agent: 'TestAgent/1.0',
        request_id: 'req-001',
        operacao_id: 'op-001',
        evento_chave: 'evt-001',
        criado_em: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'bbbbbbbb-2222-4222-8222-222222222222',
        escopo: 'empresa',
        empresa_id: empresaIdB,
        ator_tipo: 'usuario',
        ator_id: 'bbbb2222-2222-2222-2222-222222222222',
        ator_papel: 'admin',
        ator_rotulo: 'Admin Loja B',
        acao: 'contagem.finalizada',
        entidade: 'contagem',
        entidade_id: 'cont-002',
        resultado: 'sucesso',
        dados_anteriores: null,
        dados_novos: { total_itens: 15 },
        metadados: {},
        motivo: null,
        codigo_erro: null,
        ip: '192.168.1.1',
        user_agent: 'TestAgent/1.0',
        request_id: 'req-002',
        operacao_id: 'op-002',
        evento_chave: 'evt-002',
        criado_em: new Date().toISOString()
      }
    );
  });

  describe('1. Controle de Acesso Baseado em Papéis (RBAC)', () => {
    it('deve bloquear funcionário com 403 Forbidden ao tentar listar atividades', async () => {
      const res = await request(app)
        .get('/api/atividades')
        .set('Authorization', `Bearer ${funcTokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('deve bloquear funcionário com 403 Forbidden ao tentar obter detalhe de atividade', async () => {
      const res = await request(app)
        .get('/api/atividades/aaaaaaaa-1111-4111-8111-111111111111')
        .set('Authorization', `Bearer ${funcTokenA}`);

      expect(res.status).toBe(403);
    });

    it('deve bloquear funcionário com 403 Forbidden ao tentar exportar relatório CSV', async () => {
      const res = await request(app)
        .post('/api/atividades/exportacoes')
        .set('Authorization', `Bearer ${funcTokenA}`)
        .send({});

      expect(res.status).toBe(403);
    });
  });

  describe('2. Isolamento Multi-Tenant Rigoroso', () => {
    it('administrador da Empresa A não deve enxergar registros da Empresa B na listagem', async () => {
      const res = await request(app)
        .get('/api/atividades')
        .set('Authorization', `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.atividades).toHaveLength(1);
      expect(res.body.data.atividades[0].id).toBe('aaaaaaaa-1111-4111-8111-111111111111');
      expect(res.body.data.atividades[0].empresa_id).toBe(empresaIdA);
    });

    it('administrador da Empresa A recebe 404 ao tentar acessar detalhe de log da Empresa B', async () => {
      const res = await request(app)
        .get('/api/atividades/bbbbbbbb-2222-4222-8222-222222222222')
        .set('Authorization', `Bearer ${adminTokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LOG_NAO_ENCONTRADO');
    });

    it('super_admin tem visão de atividades da plataforma e de empresas', async () => {
      const res = await request(app)
        .get('/api/atividades')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.atividades.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('3. Detalhes de Auditoria e Serialização', () => {
    it('deve retornar detalhes e diff antes/depois para o administrador legítimo', async () => {
      const res = await request(app)
        .get('/api/atividades/aaaaaaaa-1111-4111-8111-111111111111')
        .set('Authorization', `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        acao: 'produto.criado',
        entidade: 'produto',
        resultado: 'sucesso',
        dados_novos: { codigo: 'SKU-01', nome: 'Camiseta' },
        request_id: 'req-001',
        ip: '127.0.0.1'
      });
      // Jamais deve conter campos de senha ou hash
      expect(res.body.data.senha).toBeUndefined();
      expect(res.body.data.senha_hash).toBeUndefined();
    });
  });

  describe('4. Exportação CSV com Proteção Contra Injeção de Fórmulas (CSV Injection)', () => {
    it('função sanitizeCsvValue deve neutralizar prefixos executáveis em planilhas', () => {
      expect(sanitizeCsvValue('=cmd|"/C calc"!A0')).toBe('"\'=cmd|""/C calc""!A0"');
      expect(sanitizeCsvValue('+12345')).toBe("'+12345");
      expect(sanitizeCsvValue('-500')).toBe("'-500");
      expect(sanitizeCsvValue('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
      expect(sanitizeCsvValue('\tTAB')).toBe("'\tTAB");
      expect(sanitizeCsvValue('Texto Normal')).toBe('Texto Normal');
    });

    it('deve gerar arquivo CSV com headers apropriados para download seguro', async () => {
      const res = await request(app)
        .post('/api/atividades/exportacoes')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="auditoria_atividades_/);
      expect(res.text).toContain('ID;Data e Hora (ISO);Escopo;Acao;Entidade');
      expect(res.text).toContain('aaaaaaaa-1111-4111-8111-111111111111');
      // Não deve conter log da Empresa B
      expect(res.text).not.toContain('bbbbbbbb-2222-4222-8222-222222222222');
    });
  });
});
