const express = require('express');
const router = express.Router();
const { registrar, provisionar, listar } = require('../controllers/empresasController');
const auth = require('../middlewares/auth');
const { requireSuperAdmin } = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { registroSchema } = require('../validators/schemas');

// GET /api/empresas — lista todas as empresas (super_admin)
router.get('/', auth, requireSuperAdmin, listar);
// POST /api/empresas/registrar — onboarding de nova empresa + primeiro gestor
router.post('/registrar', loginLimiter, validate(registroSchema), registrar);
router.post('/', auth, requireSuperAdmin, validate(registroSchema), provisionar);

module.exports = router;
