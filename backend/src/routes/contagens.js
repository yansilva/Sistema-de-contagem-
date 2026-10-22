const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const tenant = require('../middlewares/tenant');
const validate = require('../middlewares/validate');
const {
  iniciar,
  salvarProgresso,
  adicionarFornecedor,
  finalizar,
  listar,
  detalhe,
  semana,
  apagar,
  apagarEmAberto
} = require('../controllers/contagensController');
const { requireRole } = require('../middlewares/authorize');
const {
  idParamSchema,
  apagarContagemSchema,
  apagarContagensEmAbertoSchema,
  iniciarContagemSchema,
  listarContagensQuerySchema,
  salvarProgressoContagemSchema,
  adicionarFornecedorSchema
} = require('../validators/schemas');

// Todas as rotas de contagem exigem autenticação e isolamento multi-tenant
router.use(auth, tenant);

// POST /api/contagens — Iniciar nova sessão de contagem cega com snapshot de estoque
router.post('/', validate(iniciarContagemSchema), iniciar);

// PUT /api/contagens/:id/salvar-progresso — Salvar contagem física por produtor (null vs 0)
router.put('/:id/salvar-progresso', validate(salvarProgressoContagemSchema), salvarProgresso);

// POST /api/contagens/:id/fornecedor — Registrar fornecedor contado (compatibilidade)
router.post('/:id/fornecedor', validate(adicionarFornecedorSchema), adicionarFornecedor);

// PUT /api/contagens/:id/finalizar — Finalizar contagem e apurar diferenças
router.put('/:id/finalizar', validate(idParamSchema), finalizar);

// GET /api/contagens — Listar histórico de contagens
router.get('/', validate(listarContagensQuerySchema), listar);

// Cobertura semanal do catálogo atual, sem saldos ou estoque de referência.
router.get('/semana', semana);

// GET /api/contagens/:id — Detalhe da contagem (protegido por RBAC: funcionário só vê diferenças se finalizada)
router.get('/:id', validate(idParamSchema), detalhe);

// Apagar contagens: somente administrador da empresa (super_admin fica de fora de propósito).
// A rota fixa precisa vir ANTES de '/:id'.
const somenteAdministradorEmpresa = requireRole('administrador', 'gestor', 'admin');

// DELETE /api/contagens/em-andamento — Apagar várias contagens em aberto de uma vez
router.delete('/em-andamento', somenteAdministradorEmpresa, validate(apagarContagensEmAbertoSchema), apagarEmAberto);

// DELETE /api/contagens/:id — Apagar uma contagem em aberto
router.delete('/:id', somenteAdministradorEmpresa, validate(apagarContagemSchema), apagar);

module.exports = router;
