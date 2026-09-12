const express = require('express');
const router = express.Router();
const {
  login,
  refresh,
  logout,
  me,
  alterarSenha,
  registro
} = require('../controllers/authController');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { loginSchema, refreshSchema, alterarSenhaSchema, registroSchema } = require('../validators/schemas');

// POST /api/auth/registro — Onboarding inicial da empresa + primeiro administrador
router.post('/registro', loginLimiter, validate(registroSchema), registro);

// POST /api/auth/login — autenticar email e senha
router.post('/login', loginLimiter, validate(loginSchema), login);

// POST /api/auth/refresh — renovar access token com rotação de refresh token
router.post('/refresh', loginLimiter, validate(refreshSchema), refresh);

// POST /api/auth/logout — invalidar refresh token
router.post('/logout', auth, logout);

// GET /api/auth/me — restaurar sessão do usuário autenticado
router.get('/me', auth, me);

// PUT /api/auth/senha — alterar senha do usuário autenticado
router.put('/senha', auth, validate(alterarSenhaSchema), alterarSenha);

module.exports = router;
