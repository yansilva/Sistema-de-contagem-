const { z } = require('zod');

// Regex de validação de senha forte: min 8 chars, 1 maiúscula, 1 minúscula, 1 número
const senhaForteRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const mensagemSenhaForte =
  'A senha deve conter no mínimo 8 caracteres, incluindo pelo menos uma letra maiúscula, uma minúscula e um número.';

// ===== AUTH SCHEMAS =====
const loginSchema = {
  body: z.object({
    email: z.string().email('Email inválido').trim().toLowerCase(),
    senha: z.string().min(1, 'Senha é obrigatória')
  })
};

const registroSchema = {
  body: z.object({
    empresa_nome: z.string().min(2, 'Nome da empresa deve ter pelo menos 2 caracteres').trim(),
    nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').trim(),
    email: z.string().email('Email inválido').trim().toLowerCase(),
    senha: z.string().regex(senhaForteRegex, mensagemSenhaForte)
  })
};

const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(10, 'Refresh token inválido')
  })
};

const alterarSenhaSchema = {
  body: z.object({
    senhaAtual: z.string().min(1, 'Senha atual é obrigatória'),
    novaSenha: z.string().regex(senhaForteRegex, mensagemSenhaForte)
  })
};

// ===== PRODUTOS SCHEMAS =====
const criarProdutoSchema = {
  body: z.object({
    codigo: z.string().min(1, 'Código é obrigatório').trim(),
    nome: z.string().min(1, 'Nome é obrigatório').trim(),
    fornecedor: z.string().min(1, 'Fornecedor é obrigatório').trim()
  })
};

const editarProdutoSchema = {
  params: z.object({
    id: z.string().uuid('ID de produto inválido')
  }),
  body: z.object({
    codigo: z.string().min(1, 'Código não pode ser vazio').trim().optional(),
    nome: z.string().min(1, 'Nome não pode ser vazio').trim().optional(),
    fornecedor: z.string().min(1, 'Fornecedor não pode ser vazio').trim().optional()
  })
};

const idParamSchema = {
  params: z.object({
    id: z.string().uuid('ID inválido')
  })
};

const listarProdutosQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    fornecedor: z.string().trim().optional(),
    sort: z.enum(['nome', 'codigo', 'fornecedor', 'criado_em']).default('fornecedor'),
    order: z.enum(['asc', 'desc']).default('asc')
  })
};

const importarProdutosSchema = {
  body: z.object({
    modo: z.enum(['mesclar', 'substituir']).default('mesclar'),
    produtos: z
      .array(
        z.object({
          codigo: z.string().min(1, 'Código obrigatório').trim(),
          nome: z.string().min(1, 'Nome obrigatório').trim(),
          fornecedor: z.string().min(1, 'Fornecedor obrigatório').trim()
        })
      )
      .min(1, 'O catálogo para importação deve conter pelo menos um produto.')
  })
};

// ===== CONTAGENS SCHEMAS =====
const adicionarFornecedorSchema = {
  params: z.object({
    id: z.string().uuid('ID de contagem inválido')
  }),
  body: z.object({
    fornecedor: z.string().min(1, 'Nome do fornecedor é obrigatório').trim(),
    tem_diferenca: z.boolean().default(false),
    produtos: z
      .array(
        z.object({
          produto_id: z.string().uuid().nullable().optional(),
          codigo: z.string().min(1, 'Código é obrigatório'),
          nome: z.string().min(1, 'Nome é obrigatório'),
          qty_tiny: z.number().int().default(0),
          qty_contagem: z
            .number()
            .int()
            .min(0, 'Quantidade contada não pode ser negativa')
            .default(0),
          diferenca: z.number().int().default(0),
          sem_diferenca: z.boolean().default(true)
        })
      )
      .min(1, 'Deve conter pelo menos um item para contagem.')
  })
};

module.exports = {
  loginSchema,
  registroSchema,
  refreshSchema,
  alterarSenhaSchema,
  criarProdutoSchema,
  editarProdutoSchema,
  idParamSchema,
  listarProdutosQuerySchema,
  importarProdutosSchema,
  adicionarFornecedorSchema
};
