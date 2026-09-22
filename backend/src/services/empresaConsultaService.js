const {NotFoundError}=require('../errors/AppError');
const {serializeAuditLogs}=require('../serializers/auditSerializer');
const {serializeContagemDetalhe}=require('../serializers/contagemSerializer');
async function resumo(client,empresaId) {
  const {rows}=await client.query(`SELECT e.*,
    (SELECT count(*)::int FROM usuarios WHERE empresa_id=e.id) total_usuarios,
    (SELECT count(*)::int FROM produtos WHERE empresa_id=e.id AND ativo) total_produtos,
    (SELECT count(*)::int FROM contagens WHERE empresa_id=e.id) total_contagens
    FROM empresas e WHERE e.id=$1`,[empresaId]);
  if(!rows.length) throw new NotFoundError('Empresa não encontrada.');
  return rows[0];
}
async function listar(client,empresaId,recurso,{page=1,limit=20}={}) {
  const consultas={
    usuarios:['usuarios','id,nome,email,papel,ativo,criado_em','empresa_id = $1','criado_em DESC,id DESC'],
    produtos:['produtos','id,codigo,nome,fornecedor,ativo,estoque_atual','empresa_id = $1','nome,id'],
    contagens:['contagens','id,iniciado_em,finalizado_em,status,tem_diferenca','empresa_id = $1','iniciado_em DESC,id DESC'],
    logs:['audit_logs','*','(empresa_id = $1 OR empresa_afetada_id = $1)','criado_em DESC,id DESC'],
    'sessoes-auditoria':['sessoes_auditoria','id,ator_id,motivo,iniciado_em,expira_em,encerrado_em,motivo_encerramento','empresa_id = $1','iniciado_em DESC,id DESC']
  };
  const [tabela,campos,filtro,ordem]=consultas[recurso];
  const total=Number((await client.query(`SELECT count(*)::int AS total FROM ${tabela} WHERE ${filtro}`,[empresaId])).rows[0].total);
  const {rows}=await client.query(`SELECT ${campos} FROM ${tabela} WHERE ${filtro} ORDER BY ${ordem} LIMIT $2 OFFSET $3`,[empresaId,limit,(page-1)*limit]);
  return {items:recurso==='logs'?serializeAuditLogs(rows):rows,pagination:{total,page,limit,totalPages:Math.ceil(total/limit)}};
}
async function contagem(client,empresaId,id,usuario) {
  const {rows}=await client.query('SELECT * FROM contagens WHERE id=$1 AND empresa_id=$2',[id,empresaId]);
  if(!rows.length) throw new NotFoundError('Contagem não encontrada.');
  const fornecedores=await client.query(`SELECT cf.*,COALESCE(json_agg(ci) FILTER(WHERE ci.id IS NOT NULL),'[]') produtos
    FROM contagem_fornecedores cf LEFT JOIN contagem_itens ci ON ci.contagem_fornecedor_id=cf.id
    WHERE cf.contagem_id=$1 GROUP BY cf.id ORDER BY cf.fornecedor`,[id]);
  return serializeContagemDetalhe(rows[0],fornecedores.rows,usuario);
}
module.exports={resumo,listar,contagem};
