const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const tenant = require('../middlewares/tenant');
const { excelContagem } = require('../controllers/relatoriosController');

// Todas as rotas: auth + tenant + gestor
router.use(auth, tenant, gestor);

// GET /api/relatorios/contagens/:id/excel — download Excel de diferenças
router.get('/contagens/:id/excel', excelContagem);

module.exports = router;
