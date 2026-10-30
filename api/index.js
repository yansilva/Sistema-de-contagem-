// Handler Serverless da Vercel para o backend Express

// Descarta só o aviso [DEP0169] (url.parse) emitido pelo runtime da Vercel; outros avisos continuam visíveis.
try {
  require('../backend/src/config/avisos').ignorarAvisos(['DEP0169']);
} catch { /* o filtro é opcional: nunca deve impedir a função de subir */ }

if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
}

let app;
let initError;

try {
  app = require('../backend/src/app');
} catch (err) {
  initError = err;
  console.error('[SERVERLESS INIT ERROR]', { name: err.name });
}

module.exports = (req, res) => {
  // Se houve erro na inicialização, retornar detalhes ao invés de crash silencioso
  if (initError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: false,
      message: 'Erro na inicialização da função serverless.',
      code: 'INICIALIZACAO_INDISPONIVEL'
    }));
  }

  // Normalizar req.url para garantir que requisições roteadas via /api preservem o prefixo esperado pelos roteadores Express
  if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};
