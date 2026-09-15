const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

const SALT_ROUNDS = 12;

/**
 * Script de provisionamento seguro e controlado do super_admin da plataforma
 * Não utiliza senhas fixas no código; obtém de variáveis de ambiente.
 */
async function bootstrapSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const senha = process.env.SUPER_ADMIN_SENHA;
  const nome = process.env.SUPER_ADMIN_NOME || 'Super Administrador Plataforma';

  if (!email || !senha) {
    console.error('ERRO: As variáveis SUPER_ADMIN_EMAIL e SUPER_ADMIN_SENHA são obrigatórias.');
    if (require.main === module) process.exit(1);
    throw new Error('SUPER_ADMIN_EMAIL e SUPER_ADMIN_SENHA são obrigatórias');
  }

  const emailNorm = email.toLowerCase().trim();

  // 1. Garantir organização interna da plataforma
  const empresaPlataforma = await query(
    "SELECT id FROM empresas WHERE email_contato = 'plataforma@sistemadecontagem.internal'"
  );

  let empresaId;
  if (empresaPlataforma.rows.length === 0) {
    const empRes = await query(
      `INSERT INTO empresas (nome, email_contato, plano)
       VALUES ('Plataforma Sistema de Contagem', 'plataforma@sistemadecontagem.internal', 'ativo')
       RETURNING id`
    );
    empresaId = empRes.rows[0].id;
  } else {
    empresaId = empresaPlataforma.rows[0].id;
  }

  // 2. Verificar se usuário com este e-mail já existe
  const userCheck = await query('SELECT id, papel FROM usuarios WHERE email = $1', [emailNorm]);
  if (userCheck.rows.length > 0) {
    console.log(`[BOOTSTRAP] Usuário ${emailNorm} já cadastrado (papel=${userCheck.rows[0].papel}).`);
    return userCheck.rows[0];
  }

  const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
  const userRes = await query(
    `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, papel, ativo, must_change_password)
     VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)
     RETURNING id, nome, email, papel`,
    [empresaId, nome.trim(), emailNorm, senhaHash, 'super_admin']
  );

  console.log(`[BOOTSTRAP] Super admin provisionado com sucesso: ID=${userRes.rows[0].id}, Email=${userRes.rows[0].email}`);
  return userRes.rows[0];
}

if (require.main === module) {
  bootstrapSuperAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[BOOTSTRAP] Falha:', err.message);
      process.exit(1);
    });
}

module.exports = { bootstrapSuperAdmin };
