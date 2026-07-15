require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
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
