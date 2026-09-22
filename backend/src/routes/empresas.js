const express = require('express');
const router = express.Router();
const {
  registrar,
  provisionar,
  listar,
  obterMetricasSaaS,
  obterDetalhes,
  obterUsuarios,
  obterContagens,
  obterSessoesAuditoria,
  atualizar,
  alterarStatus,
  excluirEmpresa,
  impersonarEmpresa
} = require('../controllers/empresasController');
const sa = require('../validators/superAdminSchemas');
const auth = require('../middlewares/auth');
const { requireSuperAdmin } = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { registroSchema } = require('../validators/schemas');
const { recoveryLimiter } = require('../middlewares/rateLimiter');
const passwordReset = require('../controllers/passwordResetController');

// Métricas consolidadas do SaaS (Super Admin)
router.get('/metricas/saas', auth, requireSuperAdmin, obterMetricasSaaS);

// GET /api/empresas — lista todas as empresas (super_admin)
router.get('/', auth, requireSuperAdmin, validate(sa.listar), listar);

router.get('/:id/usuarios', auth, requireSuperAdmin, validate(sa.empresaPaginada), obterUsuarios);
router.get('/:id/contagens', auth, requireSuperAdmin, validate(sa.empresaPaginada), obterContagens);
router.get('/:id/sessoes-auditoria', auth, requireSuperAdmin, validate(sa.empresaPaginada), obterSessoesAuditoria);

// GET /api/empresas/:id — detalhes de uma empresa específica (super_admin)
router.get('/:id', auth, requireSuperAdmin, validate(sa.empresaPaginada), obterDetalhes);

// PUT /api/empresas/:id — atualização cadastral da empresa (super_admin)
router.put('/:id', auth, requireSuperAdmin, validate(sa.editar), atualizar);

// PATCH /api/empresas/:id/status — alternância rápida de status (super_admin)
router.patch('/:id/status', auth, requireSuperAdmin, validate(sa.status), alterarStatus);

// DELETE /api/empresas/:id — exclusão lógica com preservação de dados (super_admin)
router.delete('/:id', auth, requireSuperAdmin, validate(sa.excluir), excluirEmpresa);

// Compatibilidade: impersonation foi encerrado; a resposta orienta usar auditoria.
router.post('/:id/impersonar', auth, requireSuperAdmin, impersonarEmpresa);

router.post('/:id/administradores/:usuarioId/recuperacao', auth, requireSuperAdmin,
  recoveryLimiter, validate(sa.recuperar), passwordReset.solicitar);

// POST /api/empresas/registrar — onboarding de nova empresa + primeiro gestor
router.post('/registrar', loginLimiter, validate(registroSchema), registrar);
router.post('/', auth, requireSuperAdmin, validate(registroSchema), provisionar);

module.exports = router;
