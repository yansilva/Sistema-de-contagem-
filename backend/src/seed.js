/**
 * Script de seed programático
 * Cria a empresa demo e o usuário admin com hash bcrypt correto
 *
 * Uso: npm run seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('./config/db');

const SALT_ROUNDS = 12;

async function seed() {
  try {
    console.log('🌱 Iniciando seed...');

    // Verificar se empresa demo já existe
    const existe = await query(
      "SELECT id FROM empresas WHERE email_contato = 'contato@lojademo.com'"
    );
    if (existe.rows.length > 0) {
      console.log('⚠️  Empresa demo já existe. Pulando seed.');
      process.exit(0);
    }

    // Criar empresa
    const trialExpira = new Date();
    trialExpira.setDate(trialExpira.getDate() + 14);

    const empresa = await query(
      `INSERT INTO empresas (nome, email_contato, plano, trial_expira_em)
       VALUES ('Loja Demo', 'contato@lojademo.com', 'trial', $1)
       RETURNING id`,
      [trialExpira]
    );
    const empresaId = empresa.rows[0].id;
    console.log(`✅ Empresa criada: ${empresaId}`);

    // Criar usuário gestor
    const senhaHash = await bcrypt.hash('AdminDemo@2026!', SALT_ROUNDS);
    await query(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel)
       VALUES ($1, 'Admin Demo', 'admin@demo.com', $2, 'gestor')
       RETURNING id`,
      [empresaId, senhaHash]
    );
    console.log(`✅ Usuário gestor criado: admin@demo.com / AdminDemo@2026!`);

    // Criar produtos demo
    const produtos = [
      { codigo: '001', nome: 'Camiseta Básica Branca', fornecedor: 'Têxtil Sul' },
      { codigo: '002', nome: 'Camiseta Básica Preta', fornecedor: 'Têxtil Sul' },
      { codigo: '003', nome: 'Calça Jeans Slim', fornecedor: 'Têxtil Sul' },
      { codigo: '010', nome: 'Tênis Runner Pro', fornecedor: 'Calçados Express' },
      { codigo: '011', nome: 'Sandália Comfort Flex', fornecedor: 'Calçados Express' },
      { codigo: '020', nome: 'Mochila Urban 30L', fornecedor: 'Acessórios Prime' },
      { codigo: '021', nome: 'Boné Snapback Classic', fornecedor: 'Acessórios Prime' },
      { codigo: '022', nome: 'Óculos de Sol Aviador', fornecedor: 'Acessórios Prime' }
    ];

    for (const p of produtos) {
      await query(
        `INSERT INTO produtos (empresa_id, codigo, nome, fornecedor)
         VALUES ($1, $2, $3, $4)`,
        [empresaId, p.codigo, p.nome, p.fornecedor]
      );
    }
    console.log(`✅ ${produtos.length} produtos criados`);

    console.log('\n🎉 Seed concluído com sucesso!');
    console.log('   Login: admin@demo.com / AdminDemo@2026!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro no seed:', err);
    process.exit(1);
  }
}

seed();
