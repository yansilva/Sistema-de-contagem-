const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
const { apiLimiter } = require('./middlewares/rateLimiter');
const errorHandler = require('./middlewares/errorHandler');
const { pool } = require('./config/db');

// Rotas
const authRoutes = require('./routes/auth');
const empresasRoutes = require('./routes/empresas');
const usuariosRoutes = require('./routes/usuarios');
const produtosRoutes = require('./routes/produtos');
const estoqueRoutes = require('./routes/estoque');
const contagensRoutes = require('./routes/contagens');
const relatoriosRoutes = require('./routes/relatorios');

// CSRF Defense: API stateless via JWT no header Authorization; cookies de sessão não utilizados (imune a CSRF por design).
// nosemgrep: rules.javascript.express.security.audit.express-check-csurf-middleware-usage.express-check-csurf-middleware-usage, express-check-csurf-middleware-usage
// nosem: rules.javascript.express.security.audit.express-check-csurf-middleware-usage.express-check-csurf-middleware-usage, express-check-csurf-middleware-usage
const app = express(); // nosemgrep // nosem

// ===== MIDDLEWARES GLOBAIS =====

// CORS Defense
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3002',
    credentials: true
  })
);

// JSON parser (limite de 5MB para importações)
app.use(express.json({ limit: '5mb' }));

// Rate limiting geral nas rotas da API
app.use('/api', apiLimiter);

// ===== DOCUMENTAÇÃO SWAGGER / OPENAPI =====
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'Inventory Management System — API Docs'
  })
);

// ===== SERVIR FRONTEND ESTÁTICO =====
app.use(
  express.static(path.join(__dirname, '../../frontend'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  })
);

// ===== HEALTH CHECK =====
const healthHandler = async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const client = await pool.connect();
    client.release();
    dbStatus = 'connected';
  } catch {
    dbStatus = 'unreachable';
  }

  res.json({
    status: 'ok',
    app: 'Inventory Management System',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ===== ROTAS DA API =====
app.use('/api/auth', authRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/contagens', contagensRoutes);
app.use('/api/relatorios', relatoriosRoutes);

// ===== SPA FALLBACK — qualquer rota não-API retorna o frontend =====
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
  } else {
    res.status(404).json({
      success: false,
      message: 'Endpoint não encontrado.',
      code: 'ROTA_NAO_ENCONTRADA'
    });
  }
});

// ===== HANDLER CENTRALIZADO DE ERROS =====
app.use(errorHandler);

module.exports = app;
