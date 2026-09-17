// Handler Serverless da Vercel para o backend Express
if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
}

let app;
let initError;

try {
  app = require('../backend/src/app');
} catch (err) {
  initError = err;
  console.error('[SERVERLESS INIT ERROR]', err.message, err.stack);
}

module.exports = (req, res) => {
  // Se houve erro na inicialização, retornar detalhes ao invés de crash silencioso
  if (initError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: false,
      message: 'Erro na inicialização da função serverless.',
      error: initError.message,
      stack: initError.stack
    }));
  }

  // Normalizar req.url para garantir que requisições roteadas via /api preservem o prefixo esperado pelos roteadores Express
  if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};
