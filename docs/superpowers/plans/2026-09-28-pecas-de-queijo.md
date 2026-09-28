# Peças de queijo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classificar produtos e contar peças sem comparar sua quantidade com o saldo ERP em kg.

**Architecture:** Evoluir catálogo e sessões atuais, sem duplicar o motor de contagem. O modo persistido governa snapshot, salvamento, finalização, serialização e interface. Manter itens de sessões existentes estáveis mesmo após reclassificação do catálogo.

**Tech Stack:** PostgreSQL/pg, Express/Zod, JavaScript, Jest/Supertest e testes de frontend em VM existentes.

**Spec:** [Especificação](../specs/2026-09-28-pecas-semana-importacao-funcionario-design.md); [integração e publicação](2026-09-28-melhorias-operacionais.md).

## Global Constraints

- `contagem_em_pecas` default `false`; `tipo` default `'geral'`, valores `'geral'|'pecas_queijo'`.
- Quantidade inteira >= 0 ou `null`. Peças: referência, diferença e situação SQL `NULL`, sem mudança de `estoque_atual`.
- Classificação administrativa; produtos existentes/sessões antigas gerais. PDF/importação de catálogo preservam classificação existente.
- Geral permanece cega para funcionário enquanto aberta; após finalizar inclui referência/diferenças só de itens contados.
- Modo imutável e isolamento por empresa autenticada em todas as rotas.

## Review Focus

1. Reclassificar/desativar produto com sessão aberta não altera seu snapshot — tarefa 2.
2. Forçar item incompatível, outro produtor ou outra empresa por API deve falhar atomicamente — tarefa 2.
3. Salvar enquanto finaliza deve ser serializado pelo lock da sessão — tarefa 2.
4. Produto geral, peças zero e campo vazio não podem se misturar — tarefas 2 e 3.
5. Abas, sessões abertas fora da primeira página e histórico antigo devem continuar utilizáveis — tarefa 3.

### Tarefa 1: Migration e classificação administrativa

**Files:** criar `backend/sql/migrations/007_pecas_de_queijo.sql`, `backend/tests/pecasPostgres.test.js`; modificar `backend/sql/schema.sql`, `backend/src/validators/schemas.js`, `backend/src/controllers/produtosController.js`, `backend/src/serializers/produtoSerializer.js`, `backend/tests/produtos.test.js`, `backend/tests/funcionarioAccess.test.js`.

**Interfaces:** produtos retornam `contagem_em_pecas:boolean` para ambos os perfis. `criar(req,res,next)` e `editar(req,res,next)` aceitam a flag somente nas rotas administrativas atuais. `listarProdutosQuerySchema` ganha filtro booleano opcional `contagem_em_pecas`; aceitar somente strings `'true'/'false'`, sem coerção de `'false'` para verdadeiro.

- [ ] Escrever testes de criação/edição/filtro e migration. No teste PostgreSQL usar o padrão de `superadminPostgres.test.js`: `TEST_DATABASE_URL`, guarda `_test`, `Pool`, schema/migration e fixtures próprias; preservar um item geral com referência 17 anterior à migration. Assertivas nomeadas:
  ```js
  // 'migration preserva dados antigos e suporta referência ausente de peças'
  expect(produtoAntigo.contagem_em_pecas).toBe(false);
  expect(sessaoAntiga.tipo).toBe('geral');
  expect(itemAntigo.estoque_referencia).toBe(17);
  expect(itemDePecas.estoque_referencia).toBeNull();
  // 'administrador marca e desmarca; funcionário não edita classificação'
  expect(criado.body.data.produto.contagem_em_pecas).toBe(true);
  expect(editado.body.data.produto.contagem_em_pecas).toBe(false);
  expect(edicaoFuncionario.status).toBe(403);
  // 'filtro false seleciona gerais e importação mantém classificação'
  expect(listaGeral.body.data.produtos.every(p => !p.contagem_em_pecas)).toBe(true);
  expect(produtoDepoisDaImportacao.contagem_em_pecas).toBe(true);
  ```
- [ ] Rodar `npm test -- --runTestsByPath tests/produtos.test.js tests/funcionarioAccess.test.js tests/pecasPostgres.test.js`; esperar falha das novas assertivas antes de implementar. A suite PostgreSQL requer URL de teste; skip não comprova migration.
- [ ] Implementar coluna booleana, `tipo VARCHAR(20) NOT NULL DEFAULT 'geral'` com CHECK dos dois valores e remoção de NOT NULL de `estoque_referencia`; conservar valores existentes e default antigo para compatibilidade com backend geral durante publicação. SQL idempotente, runner numerado existente, sem alterar migrations já aplicadas. Atualizar schema para instalações novas e testar runner duas vezes. Propagar flag em SELECT/RETURNING, validação booleana e whitelist de auditoria do catálogo; inserts de catálogo usam default e conflitos não alteram classificação.
- [ ] Rodar os testes acima novamente, com PostgreSQL habilitado; esperar PASS incluindo segunda migration e integridade dos dados antigos.
- [ ] Commit dos arquivos desta tarefa: `feat: classificar produtos para contagem de pecas`.

### Tarefa 2: API por modalidade e snapshots estáveis

**Files:** modificar `backend/src/controllers/contagensController.js`, `backend/src/routes/contagens.js`, `backend/src/validators/schemas.js`, `backend/src/serializers/contagemSerializer.js`, `backend/src/controllers/relatoriosController.js`; criar `backend/tests/contagensPecas.test.js`; estender `backend/tests/pecasPostgres.test.js`, `backend/tests/contagens.test.js`, `backend/tests/blindCountInvariants.test.js`, `backend/tests/relatoriosContagem.test.js`.

**Interfaces:** `POST /api/contagens` recebe `{tipo?:'geral'|'pecas_queijo'}` (body ausente/{} = geral); validar schema na rota. GET lista aceita filtros opcionais `tipo`, `status` nos valores existentes e paginação atual. Todas as respostas de sessão incluem `tipo`. `serializeItem(item,usuario,isFinalizada,tipo='geral')`, `serializeFornecedor(fornecedor,usuario,isFinalizada,tipo='geral')` e `serializeContagemDetalhe(contagem,fornecedores=[],usuario)` propagam modo (fallback geral só para registros legados/mocks). Peças omitem `estoque_referencia`, `diferenca`, `situacao`, `sem_diferenca` e `tem_diferenca` no JSON. Relatório de diferenças de peças retorna 400, código `RELATORIO_NAO_APLICAVEL`.

- [ ] Adicionar testes API com fixtures de produtos gerais/peças, JWT de funcionário/admin e duas empresas; reutilizar mocks atuais. Teste unitário executável do serializador e assertivas dos cenários API/PG:
  ```js
  it('peças finalizadas não apresentam comparação com kg', () => {
    const { serializeItem } = require('../src/serializers/contagemSerializer');
    const item = serializeItem({quantidade_contada: 0, estoque_referencia: null},
      {papel: 'funcionario'}, true, 'pecas_queijo');
    expect(item.quantidade_contada).toBe(0);
    for (const key of ['estoque_referencia','diferenca','situacao','sem_diferenca'])
      expect(item).not.toHaveProperty(key);
  });
  // 'modo filtra snapshot e finalização parcial não altera saldo ERP'
  expect(criada.body.data.contagem.tipo).toBe('pecas_queijo');
  expect(itensPersistidos.map(i => i.estoque_referencia)).toEqual([null, null]);
  expect(finalizada.body.data.contagem.tipo).toBe('pecas_queijo');
  expect(itemVazio.quantidade_contada).toBeNull();
  expect(produtoDepois.estoque_atual).toBe(produtoAntes.estoque_atual);
  // 'negativo/fracionário/tipo inválido são recusados; geral antigo é preservado'
  expect(respostasInvalidas.map(r => r.status)).toEqual([400, 400, 400]);
  expect(snapshotGeralReclassificado.estoque_referencia).toBe(17);
  expect(relatorioPecas.body.code).toBe('RELATORIO_NAO_APLICAVEL');
  // 'item de fora falha sem salvar o primeiro item do mesmo lote'
  expect(progressoIncompativel.status).toBe(400);
  expect(quantidadeDepoisDoRollback).toBeNull();
  // 'finalizar primeiro impede gravação de progresso concorrente'
  expect(progressoDepoisDeFinalizar.status).toBe(404);
  expect(itemDepoisDaDisputa.quantidade_contada).toBe(itemFinalizado.quantidade_contada);
  ```
- [ ] Rodar `npm test -- --runTestsByPath tests/contagensPecas.test.js tests/contagens.test.js tests/blindCountInvariants.test.js tests/relatoriosContagem.test.js tests/pecasPostgres.test.js`; observar falhas novas.
- [ ] Implementar handlers existentes `iniciar`, `salvarProgresso`, `adicionarFornecedor`, `finalizar`, `listar`, `detalhe` com retorno `Promise<void>`. Snapshot seleciona ativos pelo modo; peças gravam referência explícita null. Sessão sem compatíveis dá 400 `SEM_PRODUTOS` e rollback. Salvar/finalizar começam transação antes de `SELECT ... FOR UPDATE` na sessão própria em andamento. Item já capturado respeita fornecedor do snapshot mesmo se catálogo mudou; não recapturar referência. Item novo exige catálogo ativo, empresa, fornecedor e modo compatíveis; incompatível dá 400 `ITEM_INCOMPATIVEL` e rollback do lote. Rota de compatibilidade atualiza somente itens do snapshot próprio e recusa códigos/IDs não correspondentes, sem usar referência/diferença enviada pelo cliente. Bodies de progresso/compatibilidade são strict: `tipo` não pode mudar sessão. Quantidade vazia continua null, timestamp null; zero tem timestamp. Peças finalizam apenas se há item contado, deixam diferença/situação null e flags internas falsas; geral mantém batch de diferenças. Registrar modo na auditoria e respostas, sem expor referência no modo peças. Bloquear relatório de peças antes de procurar divergências.
- [ ] Em PostgreSQL testar classificação alterada depois de iniciar, lote inválido, fornecedor errado, IDs de outra empresa e disputa salvar/finalizar com dois clients: o lock impede alteração de sessão já finalizada. Rodar a seleção acima; geral aberto cego, geral final com referência, peças e regressões devem passar.
- [ ] Commit: `feat: separar apuracao de pecas e estoque geral`.

### Tarefa 3: Cadastro, abas e histórico por modalidade

**Files:** modificar `frontend/index.html`, `frontend/js/produtos.js`, `frontend/js/contagens.js`, `frontend/js/consulta.js`, `frontend/js/historico.js`, `frontend/js/app.js`, `frontend/js/events.js`, `frontend/css/pages.css`, `frontend/css/mobile.css`; criar `backend/tests/frontendPecas.test.js`; estender `backend/tests/frontendFuncionario.test.js`. Sincronizar `public/` pelo build.

**Interfaces:** `Contagens.tipoAtual='geral'`, `abrirModalidade(tipo):Promise<void>`, `continuarSessao(id):Promise<void>`, `iniciarNovaSessao(tipo='geral'):Promise<void>`. Abrir modalidade mostra abas Geral/Peças de queijo, iniciar e sessões abertas filtradas/paginadas (`limit=20`); continuar carrega detalhe e usa seu modo persistido. Não POST nem finalização ao trocar aba. Alterações não salvas exigem salvar/descartar antes de carregar outra sessão. `Produtos.salvar()` envia checkbox `prod-contagem-em-pecas`; criar/editar restauram seu estado; lista administrativa mostra marca e filtro.

- [ ] Criar testes VM pelos padrões de `frontendFuncionario.test.js` e eventos reais de `helpers/frontendEvents.js`:
  ```js
  // 'troca de aba preserva sessão e não cria/finaliza contagem'
  expect(API.post).not.toHaveBeenCalled();
  expect(API.put).not.toHaveBeenCalled();
  // 'nova sessão de peças envia modo; continuar restaura o servidor'
  expect(API.post).toHaveBeenCalledWith('/contagens', {tipo: 'pecas_queijo'});
  expect(context.Contagens.tipoAtual).toBe('pecas_queijo');
  // 'resultado e histórico de peças mostram quantidade sem divergência'
  expect(htmlResultado).toContain('Peças de queijo');
  expect(htmlResultado).toContain('Quantidade de peças');
  expect(htmlResultado).not.toMatch(/Estoque de referência|Sem diferença|Sobra|Falta|Excel de diferenças/i);
  expect(htmlHistorico).not.toMatch(/Estoque de referência|Sem diferença|Excel de diferenças/i);
  // 'sessões além da primeira página e falha de carregamento são recuperáveis'
  expect(API.get).toHaveBeenCalledWith('/contagens?tipo=pecas_queijo&status=em_andamento&page=2&limit=20');
  expect(htmlErro).toContain('Tentar novamente');
  // 'peças não arredondam entrada e não descartam edição ao trocar sessão'
  expect(API.put).not.toHaveBeenCalled(); // entrada fracionária rejeitada
  expect(context.Contagens.contagemId).toBe(sessaoComEdicaoPendente);
  ```
- [ ] Rodar `npm test -- --runTestsByPath tests/frontendPecas.test.js tests/frontendFuncionario.test.js`; observar falha de comportamento novo.
- [ ] Implementar interfaces acima sem duplicar tela de contagem/modal de produtor. Entradas de ambos perfis abrem seletor de modalidade; cartões recentes, histórico dos dois perfis e dashboard distinguem peças, evitando selo “Sem diferença” onde comparação não existe. Peças usam label explícito, omitindo referência e Excel, inclusive guardas nos métodos de download. Campo numérico não arredonda frações silenciosamente. Registrar novas ações com nomes `contagem-modalidade`, `contagem-continuar`, `contagem-sessoes-pagina`, `produto-filtro-pecas`, sem handlers inline. Estados vazio/orientação, carregamento, erro/repetir; foco e abas acessíveis, texto de produtor com cor explícita para Safari/iPad. Preservar APIs antigas sem argumento como modo geral.
- [ ] Rodar testes acima, `npm run build` e verificar visualmente os estados/módulos nos tamanhos do plano raiz. Testar marca/desmarca, zero/vazio, troca com edição pendente, continuar, parcial, histórico geral antigo e peças.
- [ ] Commit: `feat: adicionar aba de pecas e resultados por modalidade`.
