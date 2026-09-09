const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const tenant = require('../middlewares/tenant');
const validate = require('../middlewares/validate');
const {
  listar,
  listarFornecedores,
  criar,
  editar,
  desativar,
  importar
} = require('../controllers/produtosController');
const {
  listarProdutosQuerySchema,
  criarProdutoSchema,
  editarProdutoSchema,
  idParamSchema,
  importarProdutosSchema
} = require('../validators/schemas');

// Todas as rotas de produtos exigem autenticação e isolamento multi-tenant
router.use(auth, tenant);

// GET /api/produtos — listar produtos com paginação, busca e filtros
router.get('/', validate(listarProdutosQuerySchema), listar);

// GET /api/produtos/fornecedores — lista fornecedores únicos
router.get('/fornecedores', listarFornecedores);

// POST /api/produtos — criar produto (gestor only)
router.post('/', gestor, validate(criarProdutoSchema), criar);

// POST /api/produtos/importar — importar catálogo com suporte a modos mesclar/substituir (gestor only)
router.post('/importar', gestor, validate(importarProdutosSchema), importar);

// PUT /api/produtos/:id — editar produto (gestor only)
router.put('/:id', gestor, validate(editarProdutoSchema), editar);

// DELETE /api/produtos/:id — desativar produto (gestor only)
router.delete('/:id', gestor, validate(idParamSchema), desativar);

module.exports = router;
