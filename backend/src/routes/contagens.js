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
  detalhe
} = require('../controllers/contagensController');
const {
  idParamSchema,
  salvarProgressoContagemSchema,
  adicionarFornecedorSchema
} = require('../validators/schemas');

// Todas as rotas de contagem exigem autenticação e isolamento multi-tenant
router.use(auth, tenant);

// POST /api/contagens — Iniciar nova sessão de contagem cega com snapshot de estoque
router.post('/', iniciar);

// PUT /api/contagens/:id/salvar-progresso — Salvar contagem física por produtor (null vs 0)
router.put('/:id/salvar-progresso', validate(salvarProgressoContagemSchema), salvarProgresso);

// POST /api/contagens/:id/fornecedor — Registrar fornecedor contado (compatibilidade)
router.post('/:id/fornecedor', validate(adicionarFornecedorSchema), adicionarFornecedor);

// PUT /api/contagens/:id/finalizar — Finalizar contagem e apurar diferenças
router.put('/:id/finalizar', validate(idParamSchema), finalizar);

// GET /api/contagens — Listar histórico de contagens
router.get('/', listar);

// GET /api/contagens/:id — Detalhe da contagem (protegido por RBAC: funcionário só vê diferenças se finalizada)
router.get('/:id', validate(idParamSchema), detalhe);

module.exports = router;
