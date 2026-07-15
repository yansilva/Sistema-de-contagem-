const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const tenant = require('../middlewares/tenant');
const {
  iniciar, adicionarFornecedor, finalizar, listar, detalhe
} = require('../controllers/contagensController');

// Todas as rotas exigem autenticação + tenant
router.use(auth, tenant);

// POST /api/contagens — iniciar contagem (funcionário+)
router.post('/', iniciar);

// POST /api/contagens/:id/fornecedor — adicionar fornecedor contado (funcionário+)
router.post('/:id/fornecedor', adicionarFornecedor);

// PUT /api/contagens/:id/finalizar — finalizar contagem (funcionário+)
router.put('/:id/finalizar', finalizar);

// GET /api/contagens — lista histórico (gestor only)
router.get('/', gestor, listar);

// GET /api/contagens/:id — detalhe (gestor only)
router.get('/:id', gestor, detalhe);

module.exports = router;
