# Super Admin seguro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o console existente com gestão segura de empresas, métricas corretas, auditoria somente leitura e recuperação de senha sem exposição de credenciais.

**Architecture:** Manter Express/PostgreSQL e SPA existentes. Adicionar sessões de auditoria com endpoints próprios de consulta, sem assumir identidade de usuários. Reutilizar logs, validadores, serializadores e design tokens; migrar exclusão física para lógica e separar status de acesso do plano.

**Tech Stack:** Node.js, Express 4, pg, PostgreSQL, Zod, bcryptjs, jsonwebtoken, Jest/Supertest, HTML/CSS/JavaScript nativos.

**Spec:** [Proposta aprovada](../specs/2026-09-21-superadmin-auditoria-proposta.md).

## Estado da execução — atualização de 2026-09-22

| Etapa | Estado | Evidência resumida |
|---|---|---|
| 1 | Concluída | Sanitização recursiva e resposta serverless genérica cobertas por testes. |
| 2–4 | Concluídas | Migrações versionadas, organização da plataforma, exclusão lógica, versão de sessão e corte do impersonation validados em Jest e PostgreSQL isolado. |
| 5–7 | Concluídas | Sessões de auditoria somente leitura, métricas/listagens paginadas e empresa afetada nos logs validadas com dois tenants e dois operadores. |
| 8–9 | Concluídas | Console, detalhes e auditoria por aba implementados; temas claro/escuro e largura de 360 px verificados no navegador. |
| 10 | Concluída | Núcleo de recuperação com hash, expiração, consumo único e revogação de sessões validado no PostgreSQL isolado. |
| 11 | Bloqueada somente para transporte de e-mail | O provedor continua pendente. Como solução temporária aprovada em 2026-09-22, o Super Admin pode definir senha temporária apenas para o administrador escolhido, com troca obrigatória, corte das sessões do alvo e auditoria transacional. |
| 12 | Concluída no escopo disponível | Build sincronizado; 134 testes aprovados e 7 condicionais ignorados; lint com zero erros e 12 avisos preexistentes; 7 cenários aprovados no PostgreSQL isolado. A atualização temporária aguarda commit e deploy. |

O código-base foi integrado anteriormente à `main`. A atualização temporária de senha está na árvore local da `main` e ainda aguarda commit e deploy.

### Evidência final

- `npm run build` sincronizou `frontend/` e `public/`; a comparação entre as duas árvores não encontrou diferenças.
- `npm test`: 22 suítes aprovadas, 1 suíte PostgreSQL condicional ignorada na execução comum; 134 testes aprovados e 7 ignorados.
- PostgreSQL isolado: 7 de 7 cenários aprovados em banco temporário descartado ao final.
- `npm run lint`: zero erros e 12 avisos preexistentes.
- Navegador com dados sintéticos: métricas, lista, detalhes, usuários, status, auditoria somente leitura, restauração após recarga, saída da auditoria, temas claro/escuro, fechamento de modal por Escape e largura de 360 px conferidos.
- Revisão de segurança: nenhum token de usuário alvo é emitido; a rota antiga de impersonation responde 410; operações de status/exclusão exigem confirmação validada no servidor; a senha temporária altera somente o administrador selecionado; senhas, hashes e tokens não entram nos logs de auditoria.
- Limitação explícita: o transporte real de recuperação continua indisponível até a escolha de um provedor de e-mail. O fluxo por link foi preservado e não é simulado como entregue.

## Global Constraints

- Preservar contagem cega, permissões dos funcionários e componentes existentes.
- Não criar outra tabela de logs, de empresas ou de usuários.
- Toda gestão continua exigindo Super Admin ativo, verificado no servidor.
- Não gerar JWT de usuário alvo nem substituir access/refresh tokens da plataforma.
- Não oferecer exportação de dados de suporte nesta primeira versão.
- Preservar tokens esmeralda atuais, tipografia, ícones e ambos os temas.
- Paginação padrão 20; máximo 100. Sessão de auditoria e link de recuperação: 30 minutos.
- Métricas indisponíveis devem mostrar erro/repetir, nunca zero inventado.
- Não publicar nem migrar banco operacional como efeito da revisão.
- O serviço de e-mail ainda será definido pelo usuário. Concluir núcleo e interface sem depender dessa escolha; não declarar recuperação entregue antes de integrar e validar o transporte escolhido.
- Executar tarefas em ordem; nenhuma publicação intermediária. Cada tarefa precisa passar seus testes específicos. Executar a suíte completa uma vez ao concluir a fase de implementação.

## Review Focus

1. Repetição de migração sobre banco já inativado/excluído não pode reativar tenants nem reclassificar silenciosamente a plataforma — tarefa 2.
2. Duas abas, sessão expirada ou papel do operador revogado não podem devolver dados de outro tenant ou restaurar impersonation — tarefas 4, 5 e 9.
3. Dois resets ou duas exclusões concorrentes não podem consumir a mesma autorização nem produzir sucesso sem log — tarefas 3, 10 e 11.
4. Resposta lenta da empresa A chegando após seleção de B não pode trocar cabeçalho ou dados da empresa em foco — tarefas 8 e 9.
5. Email com falha, timeout ou pré-visualização de link não pode ser anunciado como recebido, consumir token por GET ou expor token em erro — tarefas 10 e 11.

## Organização e contratos comuns

Manter os controllers atuais; extrair apenas consultas compartilhadas de suporte para `backend/src/services/empresaConsultaService.js`. Novos arquivos de auditoria seguem o padrão routes/controller/service do projeto. `frontend/` é fonte; `public/` só é atualizado com `npm run build`.

Respostas mantêm `{ success: true, data }`; erros passam pelo middleware existente. Datas são ISO UTC e exibidas no fuso do navegador. UUIDs e corpos passam por Zod. Parâmetros SQL são posicionais; nomes de ordenação vêm de mapa fixo, nunca de interpolação livre.

Fixtures novas usam UUIDs reais: plataforma `11111111-1111-4111-8111-111111111111`, empresa A `22222222-2222-4222-8222-222222222222`, empresa B `33333333-3333-4333-8333-333333333333`. Adaptar os IDs fictícios atuais de `empresasSuperAdmin.test.js` antes de ativar validação UUID. O mock não substitui testes de constraints, locks e transações no PostgreSQL.

## Task 1: Sanitização de logs e erros públicos

**Files:** modificar `backend/src/services/auditService.js`, `backend/tests/auditService.test.js`, `api/index.js`; criar `backend/tests/serverlessErrors.test.js`.

**Interfaces:** preservar `sanitizarObjeto(obj, whitelist = null)` e `registrar(tx, contexto, evento)`. Lista permitida aplica-se ao objeto raiz; filtragem de segredos aplica-se a todos os níveis, incluindo elementos de arrays. Objeto raiz inválido continua retornando null. Não mutar a entrada.

- [ ] Escrever regressão para objetos/arrays aninhados, valores falsy e chaves de credenciais, incluindo `password`, `authorization`, `cookie`, `apiKey` e os termos já proibidos:

```js
expect(auditService.sanitizarObjeto({
  nome: 'A', dados: [{ token: 'segredo-sintetico', quantidade: 0 }],
  contexto: { password: 'segredo-sintetico', ativo: false }
})).toEqual({ nome: 'A', dados: [{ quantidade: 0 }], contexto: { ativo: false } });
```

- [ ] Rodar `npm --prefix backend test -- --runTestsByPath tests/auditService.test.js tests/serverlessErrors.test.js`; confirmar falha pela preservação do segredo e pela resposta de inicialização atual.
- [ ] Implementar travessia recursiva de valores JSON, com o mesmo predicado de chave sensível em cada objeto. Preservar arrays e primitivos seguros; descartar chaves perigosas e referências circulares. Não presumir que um texto livre está seguro apenas por sua chave: eventos de reset usarão somente metadados permitidos.

```js
// Aplicar dentro da travessia, após verificar a chave.
const valorSeguro = Array.isArray(valor)
  ? valor.map(item => item && typeof item === 'object' ? limpar(item) : item)
  : valor && typeof valor === 'object' ? limpar(valor) : valor;
```

`limpar(value)` é helper local da implementação; deve lidar também com arrays e ciclos, sem expor objetos originais.
- [ ] No handler serverless, responder apenas `success`, mensagem genérica e código; registrar diagnóstico interno sanitizado, sem mensagem/stack bruta na resposta.

```js
return res.end(JSON.stringify({
  success: false,
  message: 'Serviço temporariamente indisponível.',
  code: 'INICIALIZACAO_INDISPONIVEL'
}));
```

- [ ] Reexecutar os dois arquivos; verificar que resposta não contém `stack`, senha sintética, URI de banco nem erro bruto. Revisar diff e criar commit local restrito a esta tarefa.

## Task 2: Migração aditiva e classificação explícita da plataforma

**Files:** criar `backend/sql/migrations/002_superadmin_seguro.sql`, `backend/tests/superadminPostgres.test.js`; modificar `backend/sql/schema.sql`, `backend/src/scripts/migrate.js`, `backend/src/scripts/bootstrapSuperAdmin.js`, `backend/src/config/mockDb.js`.

**Interfaces:** empresas ganham `status`, `tipo`, `excluida_em`, `excluida_por`, `motivo_exclusao`; `tipo` aceita `cliente`/`plataforma`. Auditoria ganha `empresa_afetada_id`. Usuários ganham `versao_sessao` inteiro positivo. Sessões de suporte usam `sessoes_auditoria(id, ator_id, empresa_id, motivo, iniciado_em, expira_em, encerrado_em, motivo_encerramento)`; FKs com RESTRICT para empresa/ator.

- [ ] Criar teste PostgreSQL opt-in com `TEST_DATABASE_URL`: exigir banco com nome terminado em `_test`, sem carregar `.env` operacional; criar schema aleatório `sa_audit_<uuidsemhifen>`, configurar search_path em todas as conexões do teste, aplicar schema/migrações e removê-lo no finally. Se URL ausente, marcar teste pulado e reportar lacuna; não alegar validação real.
- [ ] Testar migração sobre schema anterior com empresas ativa/trial/suspensa, logs de empresa e superadmin; rodar migração duas vezes; exigir preservação de status alterado depois da primeira aplicação.

```js
expect(empresaSuspensa.status).toBe('inativa');
expect(empresaSuspensa.plano).toBe('suspenso');
expect(logAntigo.empresa_id).toBe(empresaSuspensa.id);
expect(segundaAplicacao.status).toBe('inativa');
```

- [ ] Implementar colunas inicialmente anuláveis no upgrade, preencher somente ausentes e depois impor default/NOT NULL/check. O migrador consulta `to_regclass('empresas')`: em instalação vazia aplica schema base e depois migrações; em instalação existente aplica migrações antes do schema base atualizado. Usar `schema_migrations(nome TEXT PRIMARY KEY, aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now())` e lock transacional para registrar cada migração na mesma transação do seu SQL. Arquivos históricos não registrados são reaplicados uma vez somente se idempotentes; a migração 001 existente deve ser conferida para isso. Não confiar apenas em CREATE TABLE IF NOT EXISTS para alterar tabelas.

```sql
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS status VARCHAR(8);
UPDATE empresas SET status = CASE WHEN plano = 'suspenso' THEN 'inativa' ELSE 'ativa' END
WHERE status IS NULL;
ALTER TABLE empresas ALTER COLUMN status SET DEFAULT 'ativa';
ALTER TABLE empresas ALTER COLUMN status SET NOT NULL;
```

- [ ] Definir `tipo` inicialmente anulável: inferir plataforma somente para empresas que possuem superadmin e nenhum usuário com outro papel; abortar migração com diagnóstico de IDs em organizações mistas para evitar classificação ambígua. Demais empresas viram cliente. Preencher apenas `tipo IS NULL`; bootstrap passa a criar plataforma explicitamente. Impedir criação de empresa cliente pelo bootstrap acidentalmente.
- [ ] Adicionar exclusão lógica sem remover dependências; campo `empresa_afetada_id` em logs referencia empresas com RESTRICT. Backfill de logs de empresa usa `empresa_id`; eventos de empresa no escopo plataforma só usam `entidade_id` se existir empresa correspondente; deixar outros vínculos desconhecidos nulos.
- [ ] Criar sessões e índices por ator/empresa/data; `expira_em > iniciado_em`; estado encerrado exige motivo; armazenar ator independente do usuário do tenant. Versão de sessão inicia em 1.
- [ ] Atualizar mock apenas para queries efetivamente utilizadas; adicionar array de sessões, novos campos e rollback coerente. Rodar `npm --prefix backend test -- --runTestsByPath tests/superadminPostgres.test.js tests/db.test.js`; revisar SQL e commit local.

## Task 3: Cadastro, status e exclusão lógica com auditoria atômica

**Files:** modificar `backend/src/controllers/empresasController.js`, `backend/src/routes/empresas.js`, `backend/src/validators/schemas.js`, `backend/src/services/auditService.js`, `backend/src/serializers/auditSerializer.js`, `backend/tests/empresasSuperAdmin.test.js`, `backend/tests/superadminPostgres.test.js`, `backend/src/config/mockDb.js`.

**Interfaces:** `PATCH /empresas/:id/status` recebe `{status:'ativa'|'inativa', confirmar:true, motivo?:string}`; `DELETE /empresas/:id` recebe `{nomeConfirmacao:string, motivo?:string}`. `PUT` edita nome/email/plano/trial, sem aceitar status nem campos internos. Plano pode ser `ativo`/`trial`; valor legado suspenso permanece legível, mas não controla acesso. Para reativar legado, converter plano suspenso para ativo explicitamente. `registrar` ganha opção `empresaAfetadaId`; serializador expõe `empresa_afetada_id`.

- [ ] Adaptar fixtures UUID e adicionar casos de nome errado, corpo vazio, UUID inválido, motivo >500 caracteres, plataforma protegida, empresa excluída, email duplicado e erro de auditoria.

```js
const res = await request(app).delete(`/api/empresas/${targetEmpresaId}`)
  .set('Authorization', `Bearer ${superToken}`)
  .send({ nomeConfirmacao: 'Nome errado' });
expect(res.status).toBe(400);
expect(state.empresas.find(e => e.id === targetEmpresaId).excluida_em).toBeFalsy();
```

- [ ] Rodar `npm --prefix backend test -- --runTestsByPath tests/empresasSuperAdmin.test.js tests/auditService.test.js`; confirmar falhas pertinentes.
- [ ] Adicionar schemas `.strict()`, trim antes de tamanho, email normalizado, data ISO válida, corpo de edição não vazio; usar `validate` em todas as rotas novas de empresas. Confirmar exclusão pelo nome atual dentro do lock, comparação exata após trim.

```js
await client.query('BEGIN');
const result = await client.query('SELECT * FROM empresas WHERE id = $1 FOR UPDATE', [id]);
// Validar estado, tipo e confirmação sobre result.rows[0].
// UPDATE e auditService.registrar usam este mesmo client.
await client.query('COMMIT');
```

- [ ] Aplicar transação em atualização, status e exclusão. Status inativa revoga refresh tokens dos usuários e incrementa versão de sessão; exclusão também encerra sessões de auditoria existentes. Registrar `empresa_ativada`, `empresa_inativada`, `empresa_excluida` e `empresa_atualizada` com ator e empresa afetada. Retentativa de exclusão já aplicada retorna estado excluído, sem segundo evento de sucesso. Tentativa negada registra evento separado depois do rollback; sem alterar histórico anterior.
- [ ] Estender teste PostgreSQL: duas conexões concorrentes, falha forçada do INSERT de log e garantia de rollback de todos os efeitos. Preservar logs e linhas relacionadas após exclusão lógica. Reexecutar testes da tarefa; revisar e commit local.

## Task 4: Autenticação coerente e encerramento do impersonation antigo

**Files:** modificar `backend/src/middlewares/auth.js`, `backend/src/controllers/authController.js`, `backend/src/config/jwt.js`, `backend/src/controllers/empresasController.js`, `backend/src/routes/empresas.js`, `backend/src/validators/schemas.js`, `backend/tests/auth.test.js`, `backend/tests/adminProtection.test.js`, `backend/tests/empresasSuperAdmin.test.js`, `backend/src/config/mockDb.js`; criar `backend/src/services/acessoService.js`, `backend/tests/tenantStatus.test.js`, `backend/sql/migrations/003_corte_sessoes_legadas.sql`.

**Interfaces:** `validarAcessoConta(usuario)` verifica ativo, status, exclusão e trial; utilizada no login, refresh e middleware. `gerarAccessToken({id,empresa_id,versao_sessao})` exige versão inteira e emite `sv`. Autenticação exige igualdade de `sv` com banco. JWT sem `sv` retorna 401 `SESSAO_INVALIDADA`; refresh antigo é revogado na migração de corte uma única vez, com marcador persistido de migração, nunca a cada inicialização.

- [ ] Testar login/refresh/API em ativa, inativa, excluída e trial expirado; acesso de plataforma a empresa inativa; token sem versão e versão anterior; reativação sem ressuscitar sessão antiga.

```js
expect(verificarToken(gerarAccessToken({ id, empresa_id, versao_sessao: 2 })).sv).toBe(2);
expect(respostaTokenSemVersao.status).toBe(401);
expect(respostaRefreshRevogado.status).toBe(401);
```

- [ ] Rodar `npm --prefix backend test -- --runTestsByPath tests/auth.test.js tests/tenantStatus.test.js tests/adminProtection.test.js` e confirmar falhas.
- [ ] Implementar serviço compartilhado, ampliar SELECTs de usuário/empresa, verificar status antes de emitir tokens e aplicar versão em todos os emissores: login, refresh, registro legado e fixtures. Na alteração da própria senha, transacionar hash, versão, revogação e auditoria antes da resposta; exigir novo login.
- [ ] Remover emissão de impersonation. A rota antiga deve retornar 410 `IMPERSONATION_DESATIVADA` depois de auth + requireSuperAdmin. Não aceitar `impersonated_by` como solução: tokens antigos são indistinguíveis e precisam do corte de sessão documentado.
- [ ] Adicionar migração 003 com `UPDATE refresh_tokens SET revogado = TRUE WHERE revogado = FALSE`, executada uma vez pelo registro `schema_migrations` da tarefa 2. A função nova deve tratar JWT sem versão como inválido imediatamente após implantação; janela de manutenção coordenada evita backend antigo emitindo tokens durante o corte. Sem rotação automática de JWT_SECRET. Testar que segunda execução do migrador não revoga um refresh token novo criado após o primeiro corte.
- [ ] Atualizar fixtures de JWT em todas as suítes afetadas, rodar testes da tarefa e confirmar chamadas existentes preservadas. Commit local; documentar necessidade de novo login na implantação.

## Task 5: Sessões de auditoria somente leitura

**Files:** criar `backend/src/routes/auditoria.js`, `backend/src/controllers/auditoriaController.js`, `backend/src/services/auditoriaService.js`, `backend/src/services/empresaConsultaService.js`, `backend/tests/auditoriaSessoes.test.js`; modificar `backend/src/app.js`, `backend/src/validators/schemas.js`, `backend/src/config/mockDb.js`, `backend/tests/superadminPostgres.test.js`.

**Interfaces:** `POST /auditoria/sessoes` recebe `{empresa_id,motivo?}` e retorna sessão; `GET /auditoria/sessoes` lista sessões próprias paginadas; `POST /auditoria/sessoes/:sessaoId/encerrar` encerra idempotentemente. GETs `/:sessaoId/resumo`, `/usuarios`, `/produtos`, `/contagens`, `/contagens/:id`, `/logs` leem somente a empresa vinculada. `auditoriaService.obterSessaoAtiva(client, sessaoId, atorId)` valida propriedade, prazo, empresa e estado. `empresaConsultaService` exporta `resumo(client,empresaId)`, `usuarios(client,empresaId,filtros)`, `produtos(client,empresaId,filtros)`, `contagens(client,empresaId,filtros)` e `contagem(client,empresaId,id,usuario)`.

- [ ] Criar fixtures com dois Super Admins e dois tenants. Testar acesso do segundo operador, sessão expirada/encerrada, troca de papel, produto/contagem alheios e parâmetros de tenant forjados; métodos de escrita nas rotas de dados não podem executar handlers operacionais.

```js
const res = await request(app).get(`/api/auditoria/sessoes/${sessaoA.id}/contagens/${contagemB.id}`)
  .set('Authorization', `Bearer ${superToken}`);
expect(res.status).toBe(404);
expect(res.body).not.toHaveProperty('data');
```

- [ ] Rodar `npm --prefix backend test -- --runTestsByPath tests/auditoriaSessoes.test.js`; confirmar rotas ausentes.
- [ ] Início: transação, verificar cliente não excluído (inativo permitido), inserir sessão com prazo calculado no servidor, registrar `auditoria_iniciada`, commit. Fim: lock da sessão, validar proprietário, marcar e registrar uma única vez. Não exigir que exista administrador ativo do tenant.

```sql
SELECT * FROM sessoes_auditoria
WHERE id = $1 AND ator_id = $2
FOR UPDATE;
```

- [ ] Leitura: auth + requireSuperAdmin, carregar sessão e empresa; negar expirada imediatamente. Reconciliar expirações do ator em transação durante início/listagem/acesso com evento `auditoria_expirada` único, data efetiva em `expira_em`. Não usar timers em memória ou depender do navegador para segurança. Registrar separadamente encerramento por exclusão.
- [ ] Consultas usam empresa da sessão, campos explícitos e serializadores existentes; nunca selecionar senha_hash/token. Manter restrições de contagens abertas dos serializadores atuais. Respostas sem cache compartilhado (`Cache-Control: no-store`). Logs restritos por empresa original/afetada.
- [ ] Provar isolamento e ausência de escrita com testes HTTP; teste PostgreSQL de dois encerramentos simultâneos produz um evento. Reexecutar arquivos da tarefa, revisar e commit local.

## Task 6: Métricas, empresas e detalhes paginados

**Files:** modificar `backend/src/controllers/empresasController.js`, `backend/src/routes/empresas.js`, `backend/src/services/empresaConsultaService.js`, `backend/src/validators/schemas.js`, `backend/tests/empresasSuperAdmin.test.js`, `backend/tests/superadminPostgres.test.js`, `backend/src/config/mockDb.js`.

**Interfaces:** métricas mantêm `totalEmpresas`, `totalUsuarios`, `totalContagens`, acrescentam `ativas`, `inativas`, `totalAdmins`, `usuariosAtivos`, `contagensFinalizadas`, `contagensRecentes`, `empresasRecentes`, `atividadesRecentes`, `geradoEm`. `totalContagens` é total de sessões, e cartão de concluídas usa exclusivamente `contagensFinalizadas`. Indicadores operacionais excluem `tipo=plataforma` e empresas logicamente excluídas. Usuários totais incluem ativos/inativos; admins incluem aliases administrativos, sem superadmins.

`GET /empresas` aceita `search,status,tipo,page,limit,sort,direction`; status `todas|ativa|inativa|excluida`, tipo default cliente. Ordenação permitida `nome|criado_em|ultima_atividade|total_usuarios`, desempate id. Retorno `{empresas,total,pagination}`. Empresa inclui `administrador_principal`, `total_admins`, `total_usuarios`, `ultima_atividade`, status, tipo e exclusão. `GET /empresas/:id` preserva `{empresa,usuarios}` com usuários limitados e paginação própria; subrotas `/usuarios`, `/contagens`, `/sessoes-auditoria` são paginadas.

- [ ] Testar um tenant de cada status, plataforma, usuário inativo, dois admins e contagens abertas/finalizadas, incluindo fronteira exata de sete dias e data nula. Testar busca com aspas/%/_, limites e ordenação inválida, página vazia.

```js
expect(res.body.data.contagensFinalizadas).toBe(2);
expect(res.body.data.totalContagens).toBe(3);
expect(res.body.data.totalAdmins).toBe(2);
expect(lista.body.data.empresas).toHaveLength(20);
```

- [ ] Rodar testes de empresas e confirmar falhas dos campos/contratos novos.
- [ ] Contar no SQL, sem carregar todos os IDs. Contagens recentes são finalizadas em intervalo móvel de sete dias, usando um único instante de referência. Limitar listas recentes a cinco. Última atividade é maior timestamp de evento com empresa original/afetada; ausência continua null.

```sql
SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE c.status = 'finalizada')::int AS finalizadas
FROM contagens c JOIN empresas e ON e.id = c.empresa_id
WHERE e.tipo = 'cliente' AND e.excluida_em IS NULL;
```

- [ ] Listagem agrega usuários/produtos/contagens separadamente para evitar multiplicação por joins. Admin principal é primeiro ativo por criado_em/id; exclui superadmin; total de administradores adicionais explícito. Limitar usuário de detalhe e reutilizar serviço de consultas da tarefa 5.
- [ ] Executar testes PostgreSQL de totais, paginação e filtros com dados sintéticos; testes unitários de proteção RBAC. Revisar planos de consulta para índices utilizados, sem benchmark fictício; commit local.

## Task 7: Logs globais e contexto correto de empresa

**Files:** modificar `backend/src/controllers/atividadesController.js`, `backend/src/validators/schemas.js`, `backend/src/serializers/auditSerializer.js`, `backend/tests/audit.test.js`, `backend/src/config/mockDb.js`.

**Interfaces:** preservar rotas `/atividades`; Super Admin pode filtrar por empresa afetada, administradores comuns continuam vendo exclusivamente eventos de escopo empresa da sua própria empresa. Não ampliar a visibilidade de logs de segurança para admins comuns. Rotas de auditoria usam filtro obrigatório de tenant, mesmo com ator Super Admin.

- [ ] Escrever teste com log de plataforma cujo `empresa_id` é null e `empresa_afetada_id` é A: Super Admin filtrando A recebe; admin A não recebe; sessão de auditoria B não recebe; exportação mantém mesmo filtro e sanitização CSV.

```js
expect(logsDoSuper.map(x => x.id)).toContain(logPlataformaA.id);
expect(logsDoAdmin.map(x => x.id)).not.toContain(logPlataformaA.id);
expect(logsAuditoriaB.map(x => x.id)).not.toContain(logPlataformaA.id);
```

- [ ] Executar `npm --prefix backend test -- --runTestsByPath tests/audit.test.js tests/auditoriaSessoes.test.js` antes de alterar filtros.
- [ ] Atualizar filtro parametrizado com agrupamento correto:

```sql
WHERE (empresa_id = $1 OR empresa_afetada_id = $1)
```

Aplicar esse ramo apenas a plataforma/suporte autorizado; manter o ramo de admin empresarial limitado. Paginar com `criado_em DESC, id DESC`; evitar duplicação do mesmo evento quando ambos os campos apontam para a empresa.
- [ ] Testar detalhe por ID e CSV com os mesmos limites, sanitização recursiva do serializador e evento sem empresa conhecida. Reexecutar testes, revisar e commit local.

## Task 8: Dashboard, listagem e página de detalhes

**Files:** modificar `frontend/index.html`, `frontend/js/empresas.js`, `frontend/js/app.js`, `frontend/js/events.js`, `frontend/js/atividades.js`, `frontend/js/api.js`, `frontend/css/superadmin.css`; criar `backend/tests/frontendSuperadmin.test.js` e `frontend/js/empresa-detalhes.js`.

**Interfaces:** `Empresas.carregar({containerId='empresas-lista',page=1}={})`; `Atividades.carregar(page=1, contexto={})` com `containerId`, `paginationId`, `empresaId`, `endpoint`. Preservar defaults do backoffice. `EmpresaDetalhes.abrir(id)` e `EmpresaDetalhes.mudarAba(aba)` controlam visão geral/usuários/contagens/auditoria/logs. `API.delete(path,data)` envia JSON para confirmação.

- [ ] Usar harness VM/DOM do projeto para testar destino da renderização em ambas as abas, IDs únicos e eventos reais. Testar falha de métricas sem zero inventado e resposta antiga ignorada depois de trocar empresa.

```js
expect(htmlEmpresas).toContain('Empresa A');
expect(htmlDashboard).not.toContain('Resultado filtrado exclusivo');
expect(cardFalha).toContain('Indisponível');
expect(empresaExibidaDepoisDaRespostaLenta).toBe('Empresa B');
```

- [ ] Rodar `npm --prefix backend test -- --runTestsByPath tests/frontendSuperadmin.test.js`; confirmar falhas na ligação atual.
- [ ] Separar carregamento de métricas e listagem, sem criar segundo renderer. Passar contexto explícito aos módulos; geração incremental por requisição descarta respostas antigas. Busca com debounce 250 ms; mudança de filtro reinicia página; tabelas usam dados paginados do servidor.

```js
const requestId = ++this.requestId;
const res = await API.get(url);
if (requestId !== this.requestId) return;
```

- [ ] Dashboard usa somente definições da tarefa 6. Tela de detalhes tem empresa identificada e voltar à lista preservando filtros. Lista de admins oferece solicitar recuperação, inicialmente indisponível se transporte não configurado. Não inserir senhas em inputs administrativos.
- [ ] Criar modais de status/exclusão/reset reaproveitando estilos; status mostra efeito e motivo; exclusão envia nome atual ao backend. Não permitir editar status pelo formulário de plano. Retirar rótulos de exclusão permanente e suporte como usuário.
- [ ] Labels, foco inicial/restaurado, contenção de Tab e Escape nos diálogos; `aria-live` para carregamento/erro; ações acessíveis em 360 px; temas existentes e movimento reduzido. Adicionar estilos aos tokens atuais, sem paleta paralela. Reexecutar testes de UI e usuários; revisar e commit local.

## Task 9: Interface de auditoria e sessões por aba

**Files:** criar `frontend/js/auditoria.js`, `backend/tests/frontendAuditoria.test.js`; modificar `frontend/index.html`, `frontend/js/auth.js`, `frontend/js/app.js`, `frontend/js/events.js`, `frontend/js/empresas.js`, `frontend/css/superadmin.css`.

**Interfaces:** `Auditoria.iniciar(empresaId,motivo)`, `Auditoria.restaurar()`, `Auditoria.carregar(recurso)`, `Auditoria.encerrar()`. SessionStorage guarda apenas ID/contexto da sessão de auditoria, mantendo tokens normais da plataforma. Toda consulta usa endpoints da tarefa 5; API sem esse contexto nunca é usada pela tela de suporte.

- [ ] Testar início/encerramento mantendo accessToken e refreshToken idênticos; reload revalida servidor; duas abas com IDs independentes; sessão 403/404/expirada remove dados e bloqueia tela; resposta lenta de sessão antiga é ignorada.

```js
expect(sessionStorage.getItem('accessToken')).toBe(tokenOriginal);
expect(sessionStorage.getItem('refreshToken')).toBe(refreshOriginal);
expect(chamadas.some(url => url.endsWith('/impersonar'))).toBe(false);
expect(banner.textContent).toContain('Somente leitura');
```

- [ ] Rodar `npm --prefix backend test -- --runTestsByPath tests/frontendAuditoria.test.js` e observar falhas do fluxo ausente.
- [ ] Implementar banner com empresa, prazo e saída; navegação de suporte sem editar/importar/reset/excluir/exportar. Entrada em suporte não muda `Auth.usuario`. Ocultar administração durante a tela de auditoria e exigir saída explícita para ações administrativas. O servidor continua sendo autoridade para consultas da sessão.
- [ ] Encerrar chama API e só anuncia sucesso após confirmação; falha de rede mostra opção tentar novamente e permite abandonar visualização com aviso de que sessão expira no servidor. Limpar dados locais em logout e remover chaves antigas `superAdminBackup*`; nunca restaurar tokens antigos.
- [ ] Testar labels/teclado e ausência de handlers de escrita na tela. Reexecutar testes de frontend/funcionário; revisar e commit local.

## Task 10: Recuperação segura — núcleo independente de transporte

**Files:** criar `backend/sql/migrations/004_password_reset.sql`, `backend/src/services/passwordResetService.js`, `backend/src/controllers/passwordResetController.js`, `backend/tests/passwordReset.test.js`; modificar `backend/sql/schema.sql`, `backend/src/routes/auth.js`, `backend/src/routes/empresas.js`, `backend/src/validators/schemas.js`, `backend/src/middlewares/rateLimiter.js`, `backend/src/config/mockDb.js`, `backend/tests/superadminPostgres.test.js`.

**Interfaces:** `POST /empresas/:id/administradores/:usuarioId/recuperacao` exige Super Admin; corpo `{confirmar:true}`. Retorna 202 com ID/estado da solicitação, nunca token/link/senha. `POST /auth/recuperacao/confirmar` recebe `{token,novaSenha}` e não emite sessão. `passwordResetService.solicitar({empresaId,usuarioId,ator,contexto}, enviarEmail)` e `consumir({token,novaSenha,contexto})`; `enviarEmail({destinatario,urlRecuperacao})` só será ligado ao transporte real na tarefa 11.

- [ ] Criar tabela com id, empresa_id, usuario_id, solicitado_por, token_hash único, criado_em, expira_em, consumido_em, invalidado_em e entrega (`pendente|aceita|falhou`). Sem token/link bruto. Validar papel administrativo alvo, vínculo, usuário ativo, empresa não excluída, operador autorizado e sessão fora do modo de suporte na interface.
- [ ] Testar segredo ausente da resposta/logs, hash diferente do token, expiração, segunda solicitação invalidando anterior, senha inválida, dois consumos simultâneos, GET que não consome e falha do log revertendo senha/consumo.

```js
expect(JSON.stringify(res.body)).not.toContain(tokenEnviado);
expect(registro.token_hash).not.toBe(tokenEnviado);
expect(resultadosConcorrentes.filter(r => r.status === 200)).toHaveLength(1);
expect(await senhaAntigaAindaValidaAposRollback()).toBe(true);
```

`senhaAntigaAindaValidaAposRollback()` é helper local de teste: SELECT senha_hash e bcrypt.compare com senha sintética anterior.
- [ ] Rodar `npm --prefix backend test -- --runTestsByPath tests/passwordReset.test.js`; confirmar falhas.
- [ ] Token `crypto.randomBytes(32).toString('hex')`, hash SHA-256, expiração servidor 30 minutos. Solicitação bloqueia usuário, invalida anteriores, insere token e evento numa transação. Limite persistido de uma solicitação/minuto e cinco/hora por usuário alvo; limite HTTP adicional por operador/IP.
- [ ] Enviar só depois do commit; no retorno registrar aceitação pelo provedor ou falha em segunda transação. Falha conhecida invalida token; timeout gera estado falhou e invalidação conservadora, sem nova tentativa automática. Se a gravação de resultado falhar, retornar erro genérico e nunca declarar entrega. Não persistir token bruto para retries.
- [ ] Consumir bloqueia usuário e token em ordem consistente, verifica validade/entrega, grava hash bcrypt, consumo, versão+1, revogação de refresh e log atômicos. Retornar erro genérico para inválido/expirado/usado. Remover payloads sensíveis de logs HTTP. Tokens pendentes/falhos não podem ser consumidos.
- [ ] Sem transporte configurado, solicitação retorna 503 `EMAIL_NAO_CONFIGURADO` antes de criar token. Testes usam callback capturando token sintético; nunca entrega manual de link ao operador. Executar concorrência no PostgreSQL isolado; revisar e commit local.

## Task 11: Transporte escolhido e interface de recuperação

**Dependência externa explícita:** usuário precisa escolher/configurar serviço de e-mail e remetente. Não comprar serviço, criar conta ou enviar mensagem a destinatário real sem autorização específica. Esta tarefa permanece bloqueada por essa informação; tarefas 1–10 e 12 não precisam aguardar.

**Files:** criar `backend/src/services/emailService.js`, `backend/tests/emailService.test.js`, `frontend/js/recuperacao.js`; modificar `backend/src/controllers/passwordResetController.js`, `frontend/index.html`, `frontend/js/events.js`, `frontend/js/auth.js`, `frontend/js/app.js`, `frontend/js/empresa-detalhes.js`, `backend/.env.example`, `README.md`, `backend/tests/frontendSuperadmin.test.js`.

**Interfaces:** `emailService.enviarRecuperacao({destinatario,urlRecuperacao})` resolve somente quando o transporte aceita o envio e rejeita com erro interno sanitizado; `configurado()` retorna booleano sem credenciais. Provedor real e dependência serão definidos após a resposta, sem simular implementação de SMTP ou inventar API.

- [ ] Antes de implementar adaptador, consultar documentação oficial do serviço escolhido; definir variáveis de ambiente, timeout, autenticação e resposta de aceitação; acrescentar esses detalhes a esta tarefa para revisão. Não é necessário reabrir o design de autenticação/tenant.
- [ ] Testar ausência de configuração, aceitação, timeout e rejeição com transporte simulado. Nenhum teste automatizado envia email real. Construir link usando `APP_PUBLIC_URL` validada, nunca Host; token em fragmento reduz exposição em logs de requisição.

```js
const url = new URL('/#recuperacao', process.env.APP_PUBLIC_URL);
url.hash = `recuperacao=${encodeURIComponent(token)}`;
```

- [ ] Tela pública reconhece fragmento, guarda token só em memória e limpa URL com `history.replaceState`. Input de nova senha/confirmar, validação e submissão explícita; GET não consome token. Depois de sucesso, limpar segredo e pedir login. Estados inválido/expirado não mostram conta alvo.
- [ ] Modal do Super Admin confirma destinatário já cadastrado; exibir “Solicitação aceita pelo serviço de e-mail” somente após aceitação, e mensagem de falha real em caso contrário. Configurações mostra disponível/não configurado, sem chave ou senha SMTP.
- [ ] Rodar testes de reset/email/frontend. Validar mensagem e link com caixa de teste explicitamente autorizada, se disponível; registrar limitação caso não. Commit local e documentação de configuração sem credenciais.

## Task 12: Integração, revisão e entrega verificável

**Files:** modificar `README.md`, `docs/VERCEL_DEPLOYMENT.md`, este plano e status da spec; regenerar `public/`; atualizar notas/índices/mapa do Segundo Cérebro após a entrega.

- [ ] Executar `npm run build`; comparar arquivos gerados com `frontend/`, sem editar cópia manualmente.
- [ ] Executar `npm test` e `npm run lint` uma vez ao fechar a fase. Se houver falhas, investigar causa, corrigir e repetir apenas o necessário antes da validação consolidada final. Anotar resultados atuais; não reutilizar os 120 testes da auditoria como prova da implementação.
- [ ] Executar integração PostgreSQL via `TEST_DATABASE_URL` isolada. Confirmar migração repetida, constraints, rollback, concorrência de exclusão/reset/fim de auditoria. Sem ambiente de teste real, reportar explicitamente e não declarar validação de banco concluída.
- [ ] Verificar navegador com dados sintéticos: desktop e 360 px, claro/escuro, teclado, fluxo de empresa inativa, excluída, logs, reset indisponível/disponível e entrada/saída de auditoria. Não cadastrar nem excluir empresa de produção para testar.
- [ ] Revisar diffs de autorização: cada ID consultado limitado ao tenant/sessão; nenhum token alvo gerado; nenhum segredo em respostas/logs; todas as ações destrutivas confirmadas na API. Revisão independente apenas conforme método escolhido pelo usuário.
- [ ] Documentar implantação coordenada: backup, validar migração em cópia, janela de manutenção, migrações/corte de sessão/backend/frontend juntos, novo login obrigatório e smoke test. Rollback nunca pode restaurar impersonation nem exclusão física; escolher correção progressiva se versão antiga violar as novas garantias. Não executar deploy neste plano sem autorização própria.
- [ ] Atualizar checklist somente com evidência, documentar qualquer tarefa de email bloqueada, registrar notas existentes do Segundo Cérebro e mapa. Criar commit local final após revisão; push/PR/deploy fora do escopo desta etapa.

## Cobertura e transferência para execução

| Requisito da spec | Tarefas |
|---|---|
| Segurança, logs e autoria | 1, 3, 4, 5, 7 |
| Banco/compatibilidade | 2, 3, 4, 10, 12 |
| Dashboard e empresas | 6, 8 |
| Detalhes/histórico | 5, 6, 8 |
| Auditoria somente leitura | 4, 5, 9 |
| Status/exclusão | 2, 3, 4, 8 |
| Reset | 10, 11 |
| UX, responsividade, acessibilidade | 8, 9, 11, 12 |
| Testes/revisão/documentação | Todas, consolidação em 12 |

Plano revisado quanto à cobertura, nomes de contratos, dependências e cinco condições de revisão. Código de exemplos é orientação para os testes/implementação, não funcionalidade já escrita. O único contrato externo ainda não definido é o transporte de email, dependência informada pelo usuário e isolada na tarefa 11.

**Método recomendado:** execução direta nesta sessão, seguindo a sequência e validando cada tarefa. Os contratos de autenticação, migração e frontend são interdependentes; manter um implementador reduz divergências. Alternativa: execução com subagentes e revisão por tarefa, com custo maior. A escolha do método e a revisão deste plano antecedem a implementação conforme a skill solicitada.
