const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  uploadPdf,
  confirmarAtualizacao,
  listarHistorico
} = require('../controllers/estoqueController');
const auth = require('../middlewares/auth');
const gestor = require('../middlewares/gestor');
const validate = require('../middlewares/validate');
const { confirmarAtualizacaoEstoqueSchema } = require('../validators/schemas');
const { ValidationError } = require('../errors/AppError');

// Configuração segura do Multer para PDF em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new ValidationError('Apenas arquivos no formato PDF são permitidos.', 'FORMATO_INVALIDO'), false);
    }
  }
});

// Acesso restrito a administradores
router.use(auth);
router.use(gestor);

// POST /api/estoque/upload-pdf — Upload e retorno da prévia de atualização
router.post('/upload-pdf', upload.single('arquivo'), uploadPdf);

// POST /api/estoque/confirmar-atualizacao — Confirmação e atualização atômica no banco
router.post('/confirmar-atualizacao', validate(confirmarAtualizacaoEstoqueSchema), confirmarAtualizacao);

// GET /api/estoque/historico — Histórico de importações
router.get('/historico', listarHistorico);

module.exports = router;
