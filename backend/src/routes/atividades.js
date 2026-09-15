const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const tenant = require('../middlewares/tenant');
const { requireAdmin } = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const {
  listar,
  obterPorId,
  exportar
} = require('../controllers/atividadesController');
const {
  idParamSchema,
  listarAtividadesQuerySchema,
  exportarAtividadesSchema
} = require('../validators/schemas');

// Acesso à trilha de auditoria restrito exclusivamente a administradores e super_admin (RBAC)
router.use(auth, tenant, requireAdmin);

// GET /api/atividades — Listagem paginada e filtrada de logs de auditoria
router.get('/', validate(listarAtividadesQuerySchema), listar);

// POST /api/atividades/exportacoes — Exportação CSV segura com proteção contra injeção de fórmulas
router.post('/exportacoes', validate(exportarAtividadesSchema), exportar);

// GET /api/atividades/:id — Detalhe e inspeção de diff antes/depois
router.get('/:id', validate(idParamSchema), obterPorId);

module.exports = router;
