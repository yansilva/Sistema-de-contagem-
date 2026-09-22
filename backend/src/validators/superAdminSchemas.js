const { z } = require('zod');
const id = z.string().uuid();
const motivo = z.string().trim().max(500).optional();
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const pagination = z.object({ page, limit });
const empresaPaginada = { params: z.object({ id }), query: pagination.strict() };
module.exports = {
  empresaId: { params: z.object({ id }) },
  empresaPaginada,
  listar: { query: pagination.extend({
    search: z.string().trim().max(160).default(''),
    status: z.enum(['todas','ativa','inativa','excluida']).default('todas'),
    tipo: z.enum(['cliente','plataforma','todas']).default('cliente'),
    sort: z.enum(['nome','criado_em','ultima_atividade','total_usuarios']).default('criado_em'),
    direction: z.enum(['asc','desc']).default('desc')
  }).strict() },
  editar: { params: z.object({id}), body: z.object({
    nome: z.string().trim().min(2).max(255).optional(),
    email_contato: z.string().trim().toLowerCase().email().max(255).optional(),
    plano: z.enum(['ativo','trial']).optional(),
    trial_expira_em: z.string().datetime({offset:true}).nullable().optional()
  }).strict().refine(v=>Object.keys(v).length>0,'Informe uma alteração') },
  status: { params: z.object({id}), body: z.object({status:z.enum(['ativa','inativa']),confirmar:z.literal(true),motivo}).strict() },
  excluir: { params: z.object({id}), body:z.object({nomeConfirmacao:z.string().trim().min(1).max(255),motivo}).strict() },
  iniciarAuditoria: { body: z.object({empresa_id:id,motivo}).strict() },
  sessao: {params:z.object({sessaoId:id})},
  sessaoDetalhe: {params:z.object({sessaoId:id,id})},
  paginacao: {query:pagination.strict()},
  recuperar: {params:z.object({id,usuarioId:id}),body:z.object({confirmar:z.literal(true)}).strict()}
};
