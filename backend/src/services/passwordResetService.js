const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getClient } = require('../config/db');
const audit = require('./auditService');
const { AppError, NotFoundError, ForbiddenError } = require('../errors/AppError');

const ADMIN_ROLES = new Set(['administrador', 'gestor', 'admin']);
const EXPIRACAO_MS = 30 * 60 * 1000;
const SALT_ROUNDS = 12;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function urlRecuperacao(token) {
  if (!process.env.APP_PUBLIC_URL) {
    throw new AppError('A URL pública da aplicação não está configurada.', 503, 'APP_URL_NAO_CONFIGURADA');
  }
  let url;
  try {
    url = new URL('/#recuperacao', process.env.APP_PUBLIC_URL);
  } catch {
    throw new AppError('A URL pública da aplicação é inválida.', 503, 'APP_URL_INVALIDA');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new AppError('A URL pública da aplicação é inválida.', 503, 'APP_URL_INVALIDA');
  }
  url.hash = `recuperacao=${encodeURIComponent(token)}`;
  return url.toString();
}

async function transacao(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function eventoBase(ator, empresaId, contexto) {
  return {
    escopo: 'seguranca',
    empresaId,
    empresaAfetadaId: empresaId,
    atorTipo: ator ? 'usuario_plataforma' : 'sistema',
    atorId: ator?.id || null,
    atorPapel: ator?.papel || null,
    atorRotulo: ator?.email || 'sistema',
    entidade: 'usuario',
    resultado: 'sucesso',
    metadados: {},
    contexto
  };
}

async function solicitar({ empresaId, usuarioId, ator, contexto = {} }, enviarEmail) {
  if (!ator || ator.papel !== 'super_admin') throw new ForbiddenError('Acesso negado.');
  if (typeof enviarEmail !== 'function') {
    throw new AppError('O serviço de e-mail ainda não está configurado.', 503, 'EMAIL_NAO_CONFIGURADO');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiraEm = new Date(Date.now() + EXPIRACAO_MS);
  const link = urlRecuperacao(token);

  const solicitacao = await transacao(async (client) => {
    const { rows } = await client.query(
      `SELECT u.id,u.email,u.papel,u.ativo,u.empresa_id,e.excluida_em,e.tipo
       FROM usuarios u JOIN empresas e ON e.id=u.empresa_id
       WHERE u.id=$1 AND u.empresa_id=$2 FOR UPDATE OF u,e`,
      [usuarioId, empresaId]
    );
    const alvo = rows[0];
    if (!alvo) throw new NotFoundError('Administrador não encontrado.');
    if (!alvo.ativo || !ADMIN_ROLES.has(alvo.papel) || alvo.excluida_em || alvo.tipo !== 'cliente') {
      throw new AppError('Administrador indisponível para recuperação.', 409, 'RECUPERACAO_INDISPONIVEL');
    }
    const limites = (await client.query(
      `SELECT count(*) FILTER (WHERE criado_em>now()-interval '1 minute')::int AS minuto,
              count(*) FILTER (WHERE criado_em>now()-interval '1 hour')::int AS hora
       FROM password_reset_solicitacoes WHERE usuario_id=$1`,
      [usuarioId]
    )).rows[0];
    if (limites.minuto >= 1 || limites.hora >= 5) {
      throw new AppError('Aguarde antes de solicitar uma nova recuperação.', 429, 'LIMITE_RECUPERACAO');
    }
    await client.query(
      `UPDATE password_reset_solicitacoes SET invalidado_em=now()
       WHERE usuario_id=$1 AND consumido_em IS NULL AND invalidado_em IS NULL`,
      [usuarioId]
    );
    const inserida = (await client.query(
      `INSERT INTO password_reset_solicitacoes
       (empresa_id,usuario_id,solicitado_por,token_hash,expira_em)
       VALUES($1,$2,$3,$4,$5) RETURNING id,empresa_id,usuario_id,criado_em,expira_em,entrega`,
      [empresaId, usuarioId, ator.id, tokenHash, expiraEm]
    )).rows[0];
    await audit.registrar(client, contexto, {
      ...eventoBase(ator, empresaId),
      acao: 'recuperacao_solicitada',
      entidadeId: usuarioId,
      eventoChave: `recuperacao_solicitada_${inserida.id}`
    });
    return { ...inserida, destinatario: alvo.email };
  });

  try {
    await enviarEmail({ destinatario: solicitacao.destinatario, urlRecuperacao: link });
  } catch {
    await transacao(async (client) => {
      await client.query(
        `UPDATE password_reset_solicitacoes SET entrega='falhou',invalidado_em=COALESCE(invalidado_em,now())
         WHERE id=$1`,
        [solicitacao.id]
      );
      await audit.registrar(client, contexto, {
        ...eventoBase(ator, empresaId),
        acao: 'recuperacao_entrega_falhou',
        entidadeId: usuarioId,
        resultado: 'falha',
        eventoChave: `recuperacao_falhou_${solicitacao.id}`
      });
    });
    throw new AppError('Não foi possível entregar o e-mail de recuperação.', 502, 'EMAIL_NAO_ENTREGUE');
  }

  await transacao(async (client) => {
    await client.query("UPDATE password_reset_solicitacoes SET entrega='aceita' WHERE id=$1 AND entrega='pendente'", [solicitacao.id]);
    await audit.registrar(client, contexto, {
      ...eventoBase(ator, empresaId),
      acao: 'recuperacao_entrega_aceita',
      entidadeId: usuarioId,
      eventoChave: `recuperacao_aceita_${solicitacao.id}`
    });
  });
  return { id: solicitacao.id, entrega: 'aceita', expira_em: solicitacao.expira_em };
}

async function consumir({ token, novaSenha, contexto = {} }) {
  const tokenHash = hashToken(token);
  const novoHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
  return transacao(async (client) => {
    const { rows } = await client.query(
      `SELECT r.*,u.ativo,u.papel,e.excluida_em
       FROM password_reset_solicitacoes r
       JOIN usuarios u ON u.id=r.usuario_id
       JOIN empresas e ON e.id=r.empresa_id
       WHERE r.token_hash=$1 FOR UPDATE OF r,u`,
      [tokenHash]
    );
    const reset = rows[0];
    const invalido = !reset || reset.entrega !== 'aceita' || reset.consumido_em || reset.invalidado_em ||
      new Date(reset.expira_em) <= new Date() || !reset.ativo || reset.excluida_em;
    if (invalido) throw new AppError('Link de recuperação inválido ou expirado.', 400, 'RECUPERACAO_INVALIDA');

    await client.query(
      `UPDATE usuarios SET senha_hash=$1,must_change_password=FALSE,
       versao_sessao=versao_sessao+1,atualizado_em=now() WHERE id=$2`,
      [novoHash, reset.usuario_id]
    );
    await client.query('UPDATE refresh_tokens SET revogado=TRUE WHERE usuario_id=$1', [reset.usuario_id]);
    await client.query('UPDATE password_reset_solicitacoes SET consumido_em=now() WHERE id=$1', [reset.id]);
    await audit.registrar(client, contexto, {
      ...eventoBase(null, reset.empresa_id),
      acao: 'recuperacao_concluida',
      entidadeId: reset.usuario_id,
      eventoChave: `recuperacao_concluida_${reset.id}`
    });
    return { concluida: true };
  });
}

module.exports = { solicitar, consumir, hashToken, urlRecuperacao };
