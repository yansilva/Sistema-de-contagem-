const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { transacao, registrar } = require('../services/plataformaService');
const auditService = require('../services/auditService');
const { AppError, NotFoundError, ConflictError } = require('../errors/AppError');

const SALT_ROUNDS = 12;
const ADMIN_ROLES = new Set(['administrador', 'gestor', 'admin']);

async function bloquear(client, id) {
  const { rows } = await client.query('SELECT * FROM empresas WHERE id = $1 FOR UPDATE', [id]);
  if (!rows.length) throw new NotFoundError('Empresa não encontrada.');
  return rows[0];
}
function proteger(empresa, req) {
  if (empresa.tipo === 'plataforma' || empresa.id === req.empresaId) {
    throw new AppError('A organização da plataforma é protegida.',400,'PLATAFORMA_PROTEGIDA');
  }
}
async function revogar(client, id) {
  await client.query('UPDATE usuarios SET versao_sessao=versao_sessao+1 WHERE empresa_id=$1',[id]);
  await client.query('UPDATE refresh_tokens SET revogado=TRUE WHERE usuario_id IN (SELECT id FROM usuarios WHERE empresa_id=$1)',[id]);
}
async function atualizar(req,res,next) {
  try {
    const empresa = await transacao(async client => {
      const antes = await bloquear(client,req.params.id);
      proteger(antes,req);
      if (antes.excluida_em) throw new AppError('Empresa excluída não pode ser editada.',409);
      const body=req.body;
      if(body.email_contato && body.email_contato!==antes.email_contato) {
        const duplicada=await client.query('SELECT id FROM empresas WHERE email_contato = $1 AND id != $2',[body.email_contato,antes.id]);
        if(duplicada.rowCount) throw new ConflictError('Já existe uma empresa com este email de contato.','EMPRESA_EXISTENTE');
      }
      const {rows}=await client.query(`UPDATE empresas SET nome=$1,email_contato=$2,plano=$3,trial_expira_em=$4
        WHERE id=$5 RETURNING *`,[body.nome??antes.nome,body.email_contato??antes.email_contato,
        body.plano??antes.plano,body.trial_expira_em===undefined?antes.trial_expira_em:body.trial_expira_em,antes.id]);
      await registrar(client,req,antes.id,'empresa_atualizada',{dadosAnteriores:antes,dadosNovos:rows[0]});
      return rows[0];
    });
    res.json({success:true,data:{empresa}});
  } catch(error){
    if(error.code==='23505') return next(new ConflictError('Já existe uma empresa com este email de contato.','EMPRESA_EXISTENTE'));
    next(error);
  }
}
async function alterarStatus(req,res,next) {
  try {
    const empresa = await transacao(async client=>{
      const antes=await bloquear(client,req.params.id);
      proteger(antes,req);
      if(antes.excluida_em) throw new AppError('Empresa excluída não pode ser reativada.',409);
      if(antes.status===req.body.status) return antes;
      const {rows}=await client.query(`UPDATE empresas SET status=$1::varchar,
        plano=CASE WHEN plano='suspenso' AND $1::varchar='ativa' THEN 'ativo' ELSE plano END WHERE id=$2 RETURNING *`,[req.body.status,antes.id]);
      if(req.body.status==='inativa') await revogar(client,antes.id);
      await registrar(client,req,antes.id,req.body.status==='ativa'?'empresa_ativada':'empresa_inativada',{
        dadosAnteriores:{status:antes.status},dadosNovos:{status:req.body.status},motivo:req.body.motivo
      });
      return rows[0];
    });
    res.json({success:true,data:{empresa}});
  }catch(error){next(error);}
}
async function excluirEmpresa(req,res,next) {
  try {
    const empresa=await transacao(async client=>{
      const antes=await bloquear(client,req.params.id);
      proteger(antes,req);
      if(req.body.nomeConfirmacao!==antes.nome.trim()) throw new AppError('Digite exatamente o nome da empresa.',400,'CONFIRMACAO_INVALIDA');
      if(antes.excluida_em) return antes;
      const {rows}=await client.query(`UPDATE empresas SET status='inativa',excluida_em=now(),excluida_por=$2,motivo_exclusao=$3
        WHERE id=$1 RETURNING *`,[antes.id,req.usuario.id,req.body.motivo||null]);
      await revogar(client,antes.id);
      const ended=await client.query(`UPDATE sessoes_auditoria SET encerrado_em=now(),motivo_encerramento='empresa_excluida'
        WHERE empresa_id=$1 AND encerrado_em IS NULL RETURNING *`,[antes.id]);
      for(const sessao of ended.rows) await registrar(client,req,antes.id,'auditoria_encerrada',{
        entidade:'sessao_auditoria',entidadeId:sessao.id,eventoChave:`encerrada_${sessao.id}`,motivo:'Empresa excluída',metadados:{ator_sessao:sessao.ator_id}
      });
      await registrar(client,req,antes.id,'empresa_excluida',{dadosAnteriores:{nome:antes.nome,status:antes.status},motivo:req.body.motivo});
      return rows[0];
    });
    res.json({success:true,data:{empresa},message:'Empresa excluída da operação. Dados e logs preservados.'});
  }catch(error){
    if(error.isOperational) {
      const exists=await query('SELECT id FROM empresas WHERE id=$1',[req.params.id]).catch(()=>({rows:[]}));
      if(exists.rows.length) await registrar(null,req,req.params.id,'empresa_exclusao_negada',{resultado:'negado',codigoErro:error.code}).catch(()=>{});
    }
    next(error);
  }
}
function impersonarEmpresa(req,res) {
  res.status(410).json({success:false,code:'IMPERSONATION_DESATIVADA',message:'Use o modo auditoria somente leitura.'});
}

async function definirSenhaTemporaria(req,res,next) {
  try {
    const senhaHash = await bcrypt.hash(req.body.novaSenhaTemporaria, SALT_ROUNDS);
    const usuario = await transacao(async client => {
      const { rows } = await client.query(
        `SELECT u.id,u.nome,u.email,u.papel,u.ativo,u.empresa_id,e.tipo,e.excluida_em
         FROM usuarios u JOIN empresas e ON e.id=u.empresa_id
         WHERE u.id = $1 AND u.empresa_id = $2 FOR UPDATE OF u,e`,
        [req.params.usuarioId, req.params.id]
      );
      const alvo = rows[0];
      if (!alvo || alvo.empresa_id !== req.params.id) {
        throw new NotFoundError('Administrador não encontrado nesta empresa.');
      }
      if (!alvo.ativo || !ADMIN_ROLES.has(alvo.papel) || alvo.tipo !== 'cliente' || alvo.excluida_em) {
        throw new AppError('Administrador indisponível para redefinição.',409,'ADMINISTRADOR_INDISPONIVEL');
      }
      const atualizado = (await client.query(
        `UPDATE usuarios
         SET senha_hash = $1, must_change_password = TRUE,
             versao_sessao = versao_sessao + 1, atualizado_em = NOW()
         WHERE id = $2 AND empresa_id = $3
         RETURNING id,nome,email,papel,must_change_password,versao_sessao`,
        [senhaHash, alvo.id, alvo.empresa_id]
      )).rows[0];
      await client.query('UPDATE refresh_tokens SET revogado = TRUE WHERE usuario_id = $1', [alvo.id]);
      await auditService.registrar(client, req.auditContext || {}, {
        escopo:'plataforma',
        empresaAfetadaId:alvo.empresa_id,
        atorTipo:'usuario_plataforma',
        atorId:req.usuario.id,
        atorPapel:req.usuario.papel,
        atorRotulo:req.usuario.email,
        acao:'senha_temporaria_definida_superadmin',
        entidade:'usuario',
        entidadeId:alvo.id,
        resultado:'sucesso',
        metadados:{alvo_nome:alvo.nome,alvo_email:alvo.email},
        eventoChave:`senha_temporaria_admin_${alvo.id}`
      });
      return atualizado;
    });
    res.json({
      success:true,
      message:'Senha temporária definida. O administrador deverá alterá-la no próximo acesso.',
      data:{usuario:{id:usuario.id,nome:usuario.nome,email:usuario.email,mustChangePassword:true}}
    });
  } catch(error) { next(error); }
}

module.exports={atualizar,alterarStatus,excluirEmpresa,impersonarEmpresa,definirSenhaTemporaria};
