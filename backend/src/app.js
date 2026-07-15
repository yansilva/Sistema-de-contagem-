const express = require('express');
const cors = require('cors');
const path = require('path');
const { apiLimiter } = require('./middlewares/rateLimiter');

// Rotas
const authRoutes = require('./routes/auth');
const empresasRoutes = require('./routes/empresas');
const produtosRoutes = require('./routes/produtos');
const contagensRoutes = require('./routes/contagens');
const relatoriosRoutes = require('./routes/relatorios');

const app = express();

// ===== MIDDLEWARES GLOBAIS =====

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// JSON parser (limite de 5MB para importações)
app.use(express.json({ limit: '5mb' }));

// Rate limiting geral
app.use('/api', apiLimiter);

// ===== SERVIR FRONTEND ESTÁTICO =====
app.use(express.static(path.join(__dirname, '../../frontend'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ===== ROTAS DA API =====
app.use('/api/auth', authRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/contagens', contagensRoutes);
app.use('/api/relatorios', relatoriosRoutes);

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== SPA FALLBACK — qualquer rota não-API retorna o frontend =====
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
  } else {
    res.status(404).json({ erro: 'ROTA_NAO_ENCONTRADA', mensagem: 'Endpoint não encontrado.' });
  }
});

// ===== HANDLER DE ERROS GLOBAL =====
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
});

module.exports = app;
