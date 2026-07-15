const express = require('express');
const router = express.Router();
const { login, refresh, logout, me, alterarSenha, guest } = require('../controllers/authController');
const auth = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/rateLimiter');

// GET /api/auth/guest — login silencioso (funcionário)
router.get('/guest', guest);

// POST /api/auth/login — autenticar
router.post('/login', loginLimiter, login);

// POST /api/auth/refresh — renovar access token
router.post('/refresh', refresh);

// POST /api/auth/logout — invalidar refresh token
router.post('/logout', auth, logout);

// GET /api/auth/me — dados do usuário logado (para restaurar sessão)
router.get('/me', auth, me);

// PUT /api/auth/senha — alterar senha
router.put('/senha', auth, alterarSenha);

module.exports = router;
