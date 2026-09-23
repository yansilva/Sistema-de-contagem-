const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const tenant = require('../middlewares/tenant');
const validate = require('../middlewares/validate');
const { excelContagem } = require('../controllers/relatoriosController');
const { idParamSchema } = require('../validators/schemas');

// O relatório de diferenças está disponível aos usuários da própria empresa.
router.use(auth, tenant);

// GET /api/relatorios/contagens/:id/excel — download Excel de diferenças
router.get('/contagens/:id/excel', validate(idParamSchema), excelContagem);

module.exports = router;
