require('dotenv').config();

const { obterJwtSecret } = require('./config/jwt');

try {
  obterJwtSecret();
} catch (error) {
  console.error(`[Servidor] ${error.message}`);
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3002;

const server = app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   🏪 Estoque SaaS — Servidor iniciado   ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║   API:      http://localhost:${PORT}/api    ║`);
  console.log(`  ║   Frontend: http://localhost:${PORT}        ║`);
  console.log('  ║   Health:   /api/health                  ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n[Servidor] A porta ${PORT} ja esta em uso.`);
    console.error(`Se o sistema ja estiver aberto, acesse http://localhost:${PORT}.`);
    console.error('Para reiniciar, encerre a instancia anterior com Ctrl+C no terminal dela.');
    console.error(`No Windows, identifique o processo com: netstat -ano | findstr :${PORT}`);
    process.exit(1);
  }

  throw error;
});
