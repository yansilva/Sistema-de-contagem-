const express = require('express');
const router = express.Router();
const { registrar } = require('../controllers/empresasController');
const validate = require('../middlewares/validate');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { registroSchema } = require('../validators/schemas');

// POST /api/empresas/registrar — onboarding de nova empresa + primeiro gestor
router.post('/registrar', loginLimiter, validate(registroSchema), registrar);

module.exports = router;
