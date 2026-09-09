const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const tenant = require('../middlewares/tenant');
const validate = require('../middlewares/validate');
const { excelContagem } = require('../controllers/relatoriosController');
const { idParamSchema } = require('../validators/schemas');

// Todas as rotas de relatórios exigem autenticação, tenant e papel de gestor
router.use(auth, tenant, gestor);

// GET /api/relatorios/contagens/:id/excel — download Excel de diferenças
router.get('/contagens/:id/excel', validate(idParamSchema), excelContagem);

module.exports = router;
