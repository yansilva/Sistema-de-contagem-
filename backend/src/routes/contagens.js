const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const tenant = require('../middlewares/tenant');
const validate = require('../middlewares/validate');
const {
  iniciar,
  adicionarFornecedor,
  finalizar,
  listar,
  detalhe
} = require('../controllers/contagensController');
const { idParamSchema, adicionarFornecedorSchema } = require('../validators/schemas');

// Todas as rotas de contagem exigem autenticação e isolamento multi-tenant
router.use(auth, tenant);

// POST /api/contagens — iniciar contagem
router.post('/', iniciar);

// POST /api/contagens/:id/fornecedor — registrar fornecedor contado
router.post('/:id/fornecedor', validate(adicionarFornecedorSchema), adicionarFornecedor);

// PUT /api/contagens/:id/finalizar — finalizar contagem
router.put('/:id/finalizar', validate(idParamSchema), finalizar);

// GET /api/contagens — lista histórico (gestor only)
router.get('/', gestor, listar);

// GET /api/contagens/:id — detalhe completo da contagem (gestor only)
router.get('/:id', gestor, validate(idParamSchema), detalhe);

module.exports = router;
