const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const tenant = require('../middlewares/tenant');
const { requireRole } = require('../middlewares/authorize');
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

// Trilha de auditoria: administradores leem os logs da própria empresa. O super_admin lê SOMENTE os
// logs de escopo plataforma/segurança (a "Auditoria global"); logs de tenant só via
// /api/auditoria/sessoes/:id/logs, com motivo registrado.
router.use(auth, tenant, requireRole('administrador', 'gestor', 'admin', 'super_admin'));

// GET /api/atividades — Listagem paginada e filtrada de logs de auditoria
router.get('/', validate(listarAtividadesQuerySchema), listar);

// POST /api/atividades/exportacoes — Exportação CSV segura com proteção contra injeção de fórmulas
router.post('/exportacoes', validate(exportarAtividadesSchema), exportar);

// GET /api/atividades/:id — Detalhe e inspeção de diff antes/depois
router.get('/:id', validate(idParamSchema), obterPorId);

module.exports = router;
