const db=require('../config/db');
const {transacao,registrar}=require('../services/plataformaService');
const consulta=require('../services/empresaConsultaService');
const {AppError,NotFoundError,ForbiddenError}=require('../errors/AppError');
async function expirar(client,req) {
  const {rows}=await client.query(`UPDATE sessoes_auditoria SET encerrado_em=expira_em,motivo_encerramento='expirada'
    WHERE ator_id=$1 AND encerrado_em IS NULL AND expira_em<=now() RETURNING *`,[req.usuario.id]);
  for(const s of rows) await registrar(client,req,s.empresa_id,'auditoria_expirada',{
    entidade:'sessao_auditoria',entidadeId:s.id,eventoChave:`expirada_${s.id}`
  });
}
async function iniciar(req,res,next){
  try{
    const sessao=await transacao(async client=>{
      await expirar(client,req);
      const empresa=(await client.query('SELECT * FROM empresas WHERE id=$1 FOR UPDATE',[req.body.empresa_id])).rows[0];
      if(!empresa||empresa.excluida_em) throw new NotFoundError('Empresa não disponível para auditoria.');
      if(empresa.tipo==='plataforma') throw new AppError('Selecione uma empresa cliente.',400);
      const {rows}=await client.query('INSERT INTO sessoes_auditoria(ator_id,empresa_id,motivo) VALUES($1,$2,$3) RETURNING *',[req.usuario.id,empresa.id,req.body.motivo||null]);
      await registrar(client,req,empresa.id,'auditoria_iniciada',{entidade:'sessao_auditoria',entidadeId:rows[0].id,motivo:req.body.motivo});
      return {...rows[0],empresa_nome:empresa.nome};
    });
    res.status(201).json({success:true,data:{sessao}});
  }catch(error){next(error);}
}
async function encerrar(req,res,next){
  try{
    await transacao(async client=>{
      const {rows}=await client.query('SELECT * FROM sessoes_auditoria WHERE id=$1 AND ator_id=$2 FOR UPDATE',[req.params.sessaoId,req.usuario.id]);
      if(!rows.length) throw new NotFoundError('Sessão não encontrada.');
      if(rows[0].encerrado_em) return;
      await expirar(client,req);
      const ended=await client.query("UPDATE sessoes_auditoria SET encerrado_em=now(),motivo_encerramento='manual' WHERE id=$1 AND encerrado_em IS NULL RETURNING *",[rows[0].id]);
      if(ended.rowCount) await registrar(client,req,rows[0].empresa_id,'auditoria_encerrada',{entidade:'sessao_auditoria',entidadeId:rows[0].id});
    });
    res.json({success:true});
  }catch(error){next(error);}
}
async function listar(req,res,next){
  try{
    await transacao(client=>expirar(client,req));
    const {page,limit}=req.query;
    const total=Number((await db.query('SELECT count(*) AS total FROM sessoes_auditoria WHERE ator_id=$1',[req.usuario.id])).rows[0].total);
    const {rows}=await db.query(`SELECT s.*,e.nome empresa_nome FROM sessoes_auditoria s JOIN empresas e ON e.id=s.empresa_id
      WHERE ator_id=$1 ORDER BY iniciado_em DESC,s.id DESC LIMIT $2 OFFSET $3`,[req.usuario.id,limit,(page-1)*limit]);
    res.json({success:true,data:{items:rows,pagination:{total,page,limit,totalPages:Math.ceil(total/limit)}}});
  }catch(error){next(error);}
}
function ler(recurso){return async(req,res,next)=>{
  try{
    await transacao(client=>expirar(client,req));
    const {rows}=await db.query(`SELECT s.*,e.nome empresa_nome,e.excluida_em FROM sessoes_auditoria s
      JOIN empresas e ON e.id=s.empresa_id WHERE s.id=$1 AND s.ator_id=$2`,[req.params.sessaoId,req.usuario.id]);
    const sessao=rows[0];
    if(!sessao) throw new NotFoundError('Sessão não encontrada.');
    if(sessao.encerrado_em||sessao.excluida_em||new Date(sessao.expira_em)<=new Date()) throw new ForbiddenError('Sessão encerrada ou expirada.','AUDITORIA_ENCERRADA');
    const client={query:db.query};
    let data;
    if(recurso==='resumo') data={empresa:await consulta.resumo(client,sessao.empresa_id),sessao};
    else if(recurso==='contagem') data={contagem:await consulta.contagem(client,sessao.empresa_id,req.params.id,req.usuario)};
    else data=await consulta.listar(client,sessao.empresa_id,recurso,req.query);
    res.set('Cache-Control','no-store').json({success:true,data});
  }catch(error){next(error);}
};}
module.exports={iniciar,encerrar,listar,ler};
