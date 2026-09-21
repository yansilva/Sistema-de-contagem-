const express = require('express');
const router = express.Router();
const {
  registrar,
  provisionar,
  listar,
  obterMetricasSaaS,
  obterDetalhes,
  atualizar,
  alterarStatus,
  excluirEmpresa,
  impersonarEmpresa,
  resetSenhaAdmin
} = require('../controllers/empresasController');
const auth = require('../middlewares/auth');
const { requireSuperAdmin } = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { registroSchema, resetSenhaAdminSchema } = require('../validators/schemas');

// Métricas consolidadas do SaaS (Super Admin)
router.get('/metricas/saas', auth, requireSuperAdmin, obterMetricasSaaS);

// GET /api/empresas — lista todas as empresas (super_admin)
router.get('/', auth, requireSuperAdmin, listar);

// GET /api/empresas/:id — detalhes de uma empresa específica (super_admin)
router.get('/:id', auth, requireSuperAdmin, obterDetalhes);

// PUT /api/empresas/:id — atualização cadastral da empresa (super_admin)
router.put('/:id', auth, requireSuperAdmin, atualizar);

// PATCH /api/empresas/:id/status — alternância rápida de status (super_admin)
router.patch('/:id/status', auth, requireSuperAdmin, alterarStatus);

// DELETE /api/empresas/:id — exclusão definitiva com cascata (super_admin)
router.delete('/:id', auth, requireSuperAdmin, excluirEmpresa);

// POST /api/empresas/:id/impersonar — sessão de suporte do super admin no tenant
router.post('/:id/impersonar', auth, requireSuperAdmin, impersonarEmpresa);

// POST /api/empresas/:id/reset-senha-admin — redefinir senha do administrador (super_admin)
router.post('/:id/reset-senha-admin', auth, requireSuperAdmin, validate(resetSenhaAdminSchema), resetSenhaAdmin);

// POST /api/empresas/registrar — onboarding de nova empresa + primeiro gestor
router.post('/registrar', loginLimiter, validate(registroSchema), registrar);
router.post('/', auth, requireSuperAdmin, validate(registroSchema), provisionar);

module.exports = router;
