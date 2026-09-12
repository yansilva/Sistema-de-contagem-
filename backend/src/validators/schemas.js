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

// ===== USUÁRIOS SCHEMAS =====
const criarUsuarioSchema = {
  body: z.object({
    nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').trim(),
    email: z.string().email('Email inválido').trim().toLowerCase(),
    papel: z.enum(['administrador', 'funcionario']).default('funcionario'),
    senha_temporaria: z.string().min(6, 'Senha temporária deve ter pelo menos 6 caracteres')
  })
};

const editarUsuarioSchema = {
  params: z.object({
    id: z.string().uuid('ID de usuário inválido')
  }),
  body: z.object({
    nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').trim().optional(),
    papel: z.enum(['administrador', 'funcionario']).optional()
  })
};

const statusUsuarioSchema = {
  params: z.object({
    id: z.string().uuid('ID de usuário inválido')
  }),
  body: z.object({
    ativo: z.boolean()
  })
};

const resetSenhaUsuarioSchema = {
  params: z.object({
    id: z.string().uuid('ID de usuário inválido')
  }),
  body: z.object({
    novaSenhaTemporaria: z.string().min(6, 'Nova senha temporária deve ter pelo menos 6 caracteres')
  })
};

// ===== PRODUTOS SCHEMAS =====
const criarProdutoSchema = {
  body: z.object({
    codigo: z.string().min(1, 'Código / SKU é obrigatório').trim(),
    nome: z.string().min(1, 'Nome é obrigatório').trim(),
    fornecedor: z.string().min(1, 'Produtor / Fornecedor é obrigatório').trim(),
    estoque_atual: z.number().int().optional().default(0)
  })
};

const editarProdutoSchema = {
  params: z.object({
    id: z.string().uuid('ID de produto inválido')
  }),
  body: z.object({
    codigo: z.string().min(1, 'Código não pode ser vazio').trim().optional(),
    nome: z.string().min(1, 'Nome não pode ser vazio').trim().optional(),
    fornecedor: z.string().min(1, 'Fornecedor não pode ser vazio').trim().optional(),
    estoque_atual: z.number().int().optional()
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
    sort: z.enum(['nome', 'codigo', 'fornecedor', 'criado_em', 'estoque_atual']).default('fornecedor'),
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
          fornecedor: z.string().min(1, 'Fornecedor obrigatório').trim(),
          estoque_atual: z.number().int().optional().default(0)
        })
      )
      .min(1, 'O catálogo para importação deve conter pelo menos um produto.')
  })
};

// ===== ESTOQUE / PDF SCHEMAS =====
const confirmarAtualizacaoEstoqueSchema = {
  body: z.object({
    nome_arquivo: z.string().min(1, 'Nome do arquivo é obrigatório'),
    produtos_encontrados: z.number().int().default(0),
    linhas_ignoradas: z.number().int().default(0),
    skus_nao_encontrados: z.array(z.any()).default([]),
    atualizacoes: z
      .array(
        z.object({
          codigo: z.string().min(1, 'SKU é obrigatório'),
          estoque_atual: z.number().int('Estoque deve ser inteiro')
        })
      )
      .min(1, 'Nenhuma atualização de estoque fornecida para confirmação.')
  })
};

// ===== CONTAGENS SCHEMAS =====
const iniciarContagemSchema = {
  body: z.object({}).optional()
};

const salvarProgressoContagemSchema = {
  params: z.object({
    id: z.string().uuid('ID de contagem inválido')
  }),
  body: z.object({
    fornecedor: z.string().min(1, 'Nome do produtor/fornecedor é obrigatório').trim(),
    itens: z
      .array(
        z.object({
          produto_id: z.string().uuid('ID do produto inválido'),
          // Quantidade física: NULL = ainda não contado; 0 = contado zero unidades
          quantidade_contada: z.number().int().min(0, 'Quantidade não pode ser negativa').nullable()
        })
      )
      .min(1, 'Pelo menos um item deve ser informado.')
  })
};

// Compatibilidade com adicionarFornecedor original
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
          qty_tiny: z.number().int().default(0).optional(),
          qty_contagem: z
            .number()
            .int()
            .min(0, 'Quantidade contada não pode ser negativa')
            .default(0),
          quantidade_contada: z.number().int().min(0).nullable().optional(),
          diferenca: z.number().int().default(0).optional(),
          sem_diferenca: z.boolean().default(true).optional()
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
  criarUsuarioSchema,
  editarUsuarioSchema,
  statusUsuarioSchema,
  resetSenhaUsuarioSchema,
  criarProdutoSchema,
  editarProdutoSchema,
  idParamSchema,
  listarProdutosQuerySchema,
  importarProdutosSchema,
  confirmarAtualizacaoEstoqueSchema,
  iniciarContagemSchema,
  salvarProgressoContagemSchema,
  adicionarFornecedorSchema
};
