const auditService = require('../src/services/auditService');

describe('Fase 2: Serviço de Auditoria e Sanitização Estrita', () => {
  describe('sanitizarObjeto()', () => {
    it('Descarta chaves sensíveis como senha, senha_hash, token, secret', () => {
      const entrada = {
        nome: 'Yan Silva',
        email: 'yan@empresa.com',
        senha: 'senhaSuperSecreta123',
        senha_hash: '$2b$10$abcdef123456',
        token: 'jwt.token.aqui',
        refreshToken: 'refresh.token.aqui',
        jwt_secret: 'segredo123',
        papel: 'administrador'
      };

      const resultado = auditService.sanitizarObjeto(entrada);

      expect(resultado).toEqual({
        nome: 'Yan Silva',
        email: 'yan@empresa.com',
        papel: 'administrador'
      });
      expect(resultado).not.toHaveProperty('senha');
      expect(resultado).not.toHaveProperty('senha_hash');
      expect(resultado).not.toHaveProperty('token');
      expect(resultado).not.toHaveProperty('refreshToken');
      expect(resultado).not.toHaveProperty('jwt_secret');
    });

    it('Filtra campos pela whitelist quando fornecida', () => {
      const entrada = {
        codigo: 'SKU-01',
        nome: 'Melato de Figo',
        fornecedor: 'Araci',
        campo_interno_indesejado: 'ocultar',
        outro_campo: 'ignorar'
      };

      const whitelist = ['codigo', 'nome', 'fornecedor'];
      const resultado = auditService.sanitizarObjeto(entrada, whitelist);

      expect(resultado).toEqual({
        codigo: 'SKU-01',
        nome: 'Melato de Figo',
        fornecedor: 'Araci'
      });
      expect(resultado).not.toHaveProperty('campo_interno_indesejado');
      expect(resultado).not.toHaveProperty('outro_campo');
    });

    it('Retorna null para objetos vazios ou tipos inválidos', () => {
      expect(auditService.sanitizarObjeto(null)).toBeNull();
      expect(auditService.sanitizarObjeto(undefined)).toBeNull();
      expect(auditService.sanitizarObjeto('string')).toBeNull();
      expect(auditService.sanitizarObjeto(123)).toBeNull();
      expect(auditService.sanitizarObjeto({ senha: '123' })).toBeNull();
    });
  });

  describe('registrar() — Validações de Escopo e Contrato Transacional', () => {
    it('Exige "acao" e "entidade" obrigatórios', async () => {
      const tx = { query: jest.fn() };
      await expect(
        auditService.registrar(tx, {}, { escopo: 'empresa', empresaId: 'emp-1' })
      ).rejects.toThrow('[AUDIT] "acao" e "entidade" são campos obrigatórios');
    });

    it('Exige "empresaId" no escopo "empresa"', async () => {
      const tx = { query: jest.fn() };
      await expect(
        auditService.registrar(tx, {}, { escopo: 'empresa', acao: 'teste', entidade: 'produto' })
      ).rejects.toThrow('[AUDIT] Evento no escopo "empresa" exige "empresaId" preenchido');
    });

    it('Executa query no client transacional fornecido com parâmetros sanitizados', async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{ id: 'audit-uuid-1', criado_em: new Date().toISOString() }]
      });
      const tx = { query: mockQuery };

      const contexto = {
        ip: '192.168.1.10',
        userAgent: 'Mozilla/5.0 TestBrowser',
        requestId: 'req-uuid-1',
        operacaoId: 'op-uuid-1'
      };

      const evento = {
        escopo: 'empresa',
        empresaId: 'emp-uuid-1',
        atorTipo: 'usuario_empresa',
        atorId: 'user-uuid-1',
        atorPapel: 'administrador',
        atorRotulo: 'admin@empresa.com',
        acao: 'produto_editado',
        entidade: 'produto',
        entidadeId: 'prod-uuid-1',
        resultado: 'sucesso',
        dadosAnteriores: { codigo: 'SKU-01', senha_temporaria: 'proibido' },
        dadosNovos: { codigo: 'SKU-02', token: 'proibido' },
        whitelistCampos: ['codigo'],
        eventoChave: 'produto_editado_prod-uuid-1'
      };

      await auditService.registrar(tx, contexto, evento);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params[0]).toBe('empresa'); // escopo
      expect(params[1]).toBe('emp-uuid-1'); // empresa_id
      expect(params[6]).toBe('produto_editado'); // acao
      expect(params[7]).toBe('produto'); // entidade
      expect(params[10]).toBe(JSON.stringify({ codigo: 'SKU-01' })); // dados_anteriores sanitizado
      expect(params[11]).toBe(JSON.stringify({ codigo: 'SKU-02' })); // dados_novos sanitizado
      expect(params[15]).toBe('192.168.1.10'); // ip
      expect(params[16]).toBe('Mozilla/5.0 TestBrowser'); // userAgent
      expect(params[17]).toBe('req-uuid-1'); // request_id
      expect(params[18]).toBe('op-uuid-1'); // operacao_id
      expect(params[19]).toBe('produto_editado_prod-uuid-1'); // evento_chave
    });
  });
});
