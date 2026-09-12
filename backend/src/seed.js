/**
 * Script de Inicialização do Banco de Dados
 *
 * Em conformidade com as regras de segurança e produção:
 * Não são criadas empresas de demonstração nem usuários com senhas padrão.
 * O primeiro acesso deve ser realizado via fluxo de Onboarding na aplicação web
 * ou diretamente via requisição:
 *   POST /api/auth/registro
 */
require('dotenv').config();

console.log('🚀 Sistema configurado para operação limpa e produção.');
console.log('ℹ️  Nenhuma credencial padrão ou empresa demo foi injetada.');
console.log('👉 Acesse a aplicação web para criar a primeira empresa e conta de administrador.');
