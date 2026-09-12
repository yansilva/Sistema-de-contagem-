const express = require('express');
const router = express.Router();
const {
  listar,
  criar,
  editar,
  alternarStatus,
  resetarSenha
} = require('../controllers/usuariosController');
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const validate = require('../middlewares/validate');
const {
  criarUsuarioSchema,
  editarUsuarioSchema,
  statusUsuarioSchema,
  resetSenhaUsuarioSchema
} = require('../validators/schemas');

// Todas as rotas de gestão de usuários exigem autenticação e perfil de administrador
router.use(auth);
router.use(gestor);

// GET /api/usuarios — Listar usuários da empresa
router.get('/', listar);

// POST /api/usuarios — Criar usuário com senha temporária
router.post('/', validate(criarUsuarioSchema), criar);

// PUT /api/usuarios/:id — Editar nome e papel
router.put('/:id', validate(editarUsuarioSchema), editar);

// PATCH /api/usuarios/:id/status — Ativar / Desativar usuário
router.patch('/:id/status', validate(statusUsuarioSchema), alternarStatus);

// POST /api/usuarios/:id/reset-senha — Redefinir senha temporária
router.post('/:id/reset-senha', validate(resetSenhaUsuarioSchema), resetarSenha);

module.exports = router;
