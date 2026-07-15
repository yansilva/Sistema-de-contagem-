const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const tenant = require('../middlewares/tenant');
const {
  listar, listarFornecedores, criar, editar, desativar, importar
} = require('../controllers/produtosController');

// Todas as rotas exigem autenticação + isolamento de tenant
router.use(auth, tenant);

// GET /api/produtos — listar todos (funcionário+)
router.get('/', listar);

// GET /api/produtos/fornecedores — lista fornecedores únicos (funcionário+)
router.get('/fornecedores', listarFornecedores);

// POST /api/produtos — criar produto (gestor only)
router.post('/', gestor, criar);

// POST /api/produtos/importar — importar em massa (gestor only)
router.post('/importar', gestor, importar);

// PUT /api/produtos/:id — editar produto (gestor only)
router.put('/:id', gestor, editar);

// DELETE /api/produtos/:id — desativar produto (gestor only)
router.delete('/:id', gestor, desativar);

module.exports = router;
