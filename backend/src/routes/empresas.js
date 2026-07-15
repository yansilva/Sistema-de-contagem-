const express = require('express');
const router = express.Router();
const { registrar } = require('../controllers/empresasController');
const { loginLimiter } = require('../middlewares/rateLimiter');

// POST /api/empresas/registrar — onboarding
router.post('/registrar', loginLimiter, registrar);

module.exports = router;
