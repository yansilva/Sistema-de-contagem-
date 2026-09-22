const router=require('express').Router();
const auth=require('../middlewares/auth');
const {requireSuperAdmin}=require('../middlewares/authorize');
const validate=require('../middlewares/validate');
const schemas=require('../validators/superAdminSchemas');
const controller=require('../controllers/auditoriaController');
router.use(auth,requireSuperAdmin);
router.post('/sessoes',validate(schemas.iniciarAuditoria),controller.iniciar);
router.get('/sessoes',validate(schemas.paginacao),controller.listar);
router.post('/sessoes/:sessaoId/encerrar',validate(schemas.sessao),controller.encerrar);
router.get('/sessoes/:sessaoId/contagens/:id',validate(schemas.sessaoDetalhe),controller.ler('contagem'));
for(const recurso of ['resumo','usuarios','produtos','contagens','logs']) {
  router.get(`/sessoes/:sessaoId/${recurso}`,validate(schemas.sessao),validate(schemas.paginacao),controller.ler(recurso));
}
router.use((req,res)=>res.status(405).json({success:false,code:'AUDITORIA_SOMENTE_LEITURA',message:'Operação não permitida no modo auditoria.'}));
module.exports=router;
