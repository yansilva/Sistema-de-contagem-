// Handler Serverless da Vercel para o backend Express
if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
}

const app = require('../backend/src/app');

module.exports = (req, res) => {
  // Normalizar req.url para garantir que requisições roteadas via /api preservem o prefixo esperado pelos roteadores Express
  if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};
