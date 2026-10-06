# Plano de implementação: produtos vencidos e baixa de estoque

> Para o agente implementador: siga `superpowers:executing-plans` ou `superpowers:subagent-driven-development` tarefa por tarefa. Execute em TDD: escreva um teste que falha, implemente o mínimo, rode os testes e faça commit por etapa concluída.

**Objetivo:** permitir informar unidades vencidas por produto na contagem geral, persistir o dado com segurança, descontar apenas essas unidades do saldo vigente na finalização e apresentá-las no resultado, histórico e Excel.

**Abordagem:** estender o item de contagem e a transação PostgreSQL existente. A API calcula a baixa a partir do saldo atual e dos valores salvos; o cliente nunca fornece saldo ou baixa efetiva. Adicionar interação progressiva inline no popup existente e manter os artefatos publicados `public/` sincronizados com `frontend/`.

**Stack:** Node.js, Express, Zod, PostgreSQL, Jest, ExcelJS, HTML/CSS/JavaScript existentes.

**Especificação aprovada:** `docs/superpowers/specs/2026-10-05-produtos-vencidos-baixa-estoque-design.md`.

## Restrições globais

- Trabalhar somente na branch isolada `feat/produtos-vencidos` no worktree `.worktrees/produtos-vencidos`.
- Implementar exclusivamente para contagem geral; comportamento de peças de queijo permanece inalterado.
- Não revelar referência, saldo ou baixa antes de finalizar.
- Salvar quantidade física e vencida atomicamente; erro conserva os valores no popup e sucesso fecha o popup com confirmação.
- Finalização aplica baixa uma única vez sobre o saldo corrente, limitada a zero, e reverte tudo se qualquer item necessário falhar.
- Preservar o cálculo atual de diferença e a fotografia histórica de fornecedor/produto.
- Atualizar pares de arquivos correspondentes em `frontend/` e `public/`.
- Não executar migration em produção, publicar nem implantar.

## Foco da revisão

- Transação, isolamento por tenant, bloqueios/concorrência, repetição de finalização e rollback integral.
- Sigilo da contagem cega e ausência de campos de baixa antes de finalizar.
- Campo inline acessível e claro, limites e estados de validação; compatibilidade visual com a interface existente.
- Consistência dos contratos entre API, serializers, resultado/histórico e Excel.
- Cobertura de regressão da modalidade de peças e sessões antigas.

## Tarefa 1: migration e representação persistida

**Arquivos:** `backend/sql/migrations/008_produtos_vencidos.sql` (ou próximo número livre), `backend/sql/schema.sql`, schemas/fixtures de teste PostgreSQL.

1. No teste de integração PostgreSQL em `backend/tests/pecasPostgres.test.js`, adicione um teste que constrói/aplica a migration e verifica as três colunas: `quantidade_vencida` default zero e não negativa; `estoque_antes_baixa_vencidos` e `quantidade_vencida_baixada` anuláveis. Verifique também que itens legados recebem zero e que rollback remove apenas as colunas adicionadas.
2. Rode `npm test -- --runInBand tests/pecasPostgres.test.js -t "migration.*vencidos"` (ajuste o padrão ao nome do teste) e confirme que falha antes da migration.
3. Implemente migration reversível no padrão das migrations existentes e atualize `schema.sql` com a mesma definição e constraint.
4. Rode o teste focado e confirme que passa; rode novamente o teste existente de migration 007 para detectar regressão.
5. Commit: `feat(db): adiciona campos de produtos vencidos`.

## Tarefa 2: validação e salvamento atômico do progresso

**Arquivos:** `backend/src/validators/schemas.js`, `backend/src/controllers/contagensController.js`, `backend/src/serializers/contagemSerializer.js`, `backend/src/config/mockDb.js`, testes de contagens e mocks.

1. Acrescente testes para o schema/API: vencido zero e inteiro positivo aceitos; negativo, decimal, acima da quantidade física ou positivo com contagem `null` rejeitados; campo omitido compatível como zero; modalidade peças e produto fora do snapshot recusados.
2. Rode os testes direcionados e confirme falha inicial. Preserve as expectativas atuais de sigilo durante sessão em andamento.
3. Atualize o contrato para aceitar `quantidade_vencida` com default zero; dentro da transação existente, persistir junto a `quantidade_contada`, sempre verificando tenant, produtor, modalidade e estado da sessão.
4. Inclua quantidade vencida nos dados de detalhe em andamento sem incluir saldo atual, fotografia de baixa ou quantidade efetivamente retirada. Atualize serializers, mocks e fixtures para valores legados zero/nulos.
5. Rode `npm test -- --runInBand tests/contagens.test.js` e testes de serializer relevantes; confirme todos os novos casos e as garantias existentes de contagem cega.
6. Commit: `feat(api): salva unidades vencidas no progresso`.

## Tarefa 3: baixa transacional durante finalização

**Arquivos:** `backend/src/controllers/contagensController.js`, serviço/evento de auditoria existente, testes PostgreSQL em `backend/tests/pecasPostgres.test.js` e testes de contagens.

1. Adicione primeiro testes PostgreSQL que cubram: saldo atual igual/maior/menor que vencidos; saldo atual negativo tratado como zero disponível; snapshot inicial diferente do saldo corrente; duas finalizações concorrentes; retry de sessão já finalizada; produto inexistente/vínculo inválido; falha em item posterior revertendo baixa anterior, apuração e estado da sessão. Verifique evento de auditoria com totais encontrados, baixados e não descontados.
2. Rode casos focados e confirme que falham por falta da baixa/colunas.
3. Dentro da transação de finalização, após bloquear e validar a sessão, apure diferenças como hoje; bloqueie cada produto elegível do mesmo tenant, registre saldo imediatamente anterior e baixa efetiva, atualize estoque com limite zero e marque a sessão finalizada somente no mesmo commit. Não exija produto ativo nem fornecedor atual igual ao snapshot, apenas produto válido no tenant.
4. Faça erro em qualquer atualização abortar e reverter transação inteira; não aceitar valores de estoque/baixa do cliente. Grave auditoria sem dados desnecessários.
5. Rode testes focados de finalização e concorrência PostgreSQL, mais `npm test -- --runInBand tests/contagens.test.js`.
6. Commit: `feat(inventory): baixa produtos vencidos ao finalizar contagem`.

## Tarefa 4: interação acessível no popup de contagem geral

**Arquivos:** `frontend/index.html`, `frontend/js/contagens.js`, estilos associados, pares em `public/`, testes `backend/tests/frontendFuncionario.test.js` e `backend/tests/frontendPecas.test.js`.

1. Adicione testes da interface para: ação “Informar vencidos” por linha geral revela campo inteiro inline; valor é restaurado ao reabrir; zero permanece padrão; validação impede valor maior que físico e vencidos sem quantidade física; modalidade peças não exibe o recurso; request envia ambos os valores; erro mantém popup/campos; sucesso confirma e fecha.
2. Rode os testes direcionados e observe falhas antes da implementação.
3. Implemente divulgação progressiva no contexto da linha do produto, sem abrir outro diálogo. Garanta label associado, teclado/foco, mensagens de validação próximas do campo, atualização do limite quando quantidade física muda e indicação discreta de unidades vencidas. Manter densidade e vocabulário dos controles existentes (direção Impeccable Operate: previsibilidade e clareza para tarefa operacional; sem decoração ou modal adicional).
4. Integrar o payload ao salvamento atual. Não limpar nem fechar em erro; em sucesso preservar confirmação e fechar o popup. Restaurar estado do backend ao retomar sessão.
5. Espelhar as mudanças de interface em `public/` e verificar igualdade dos pares correspondentes.
6. Rode os testes direcionados, incluindo toda a suíte de frontend de peças e funcionário.
7. Commit: `feat(ui): informa produtos vencidos na contagem geral`.

## Tarefa 5: serializer, resultado e histórico

**Arquivos:** `backend/src/serializers/contagemSerializer.js`, `backend/src/controllers/contagensController.js`, `frontend/js/contagens.js`, `frontend/js/historico.js`, `frontend/js/consulta.js`, pares em `public/`, testes de frontend e de histórico.

1. Adicione testes para sessão finalizada mostrando quantidade física, vencidos, baixa efetiva, saldo após baixa e unidades não descontadas; totalizadores; mensagem “Contagem conferida com produtos vencidos” quando não houver diferença; botão Excel visível se houver apenas vencidos; itens legados sem baixa com zero/nulo compatível. Confirme que, em andamento, campos de estoque e baixa não são serializados.
2. Rode testes e confirme as falhas esperadas.
3. Estenda serialização/detalhe/listagem com os campos apropriados conforme estado da sessão; derivar não descontado como vencido menos baixa efetiva. Exibir indicador e total no histórico e detalhes por produto, preservando indicadores de divergência baseados no snapshot.
4. Espelhar os JS/CSS publicados em `public/` e verificar diferenças.
5. Rode `npm test -- --runInBand tests/frontendFuncionario.test.js tests/frontendPecas.test.js tests/contagens.test.js` e testes de listagem/detalhe pertinentes.
6. Commit: `feat(ui): exibe vencidos nos resultados e histórico`.

## Tarefa 6: Excel

**Arquivos:** `backend/src/controllers/relatoriosController.js`, `backend/src/services/excel.js`, testes `backend/tests/relatoriosContagem.test.js`.

1. Crie testes que abram o `.xlsx` gerado via ExcelJS e verifiquem cabeçalhos, valores e observação de baixa limitada; produto sem diferença com vencidos incluído; produto sem diferença e sem vencidos omitido; botão/endpoint disponível quando só houver vencidos; histórico legado com campos vazios/zero; isolamento de tenant e modalidade peças mantidos.
2. Rode `npm test -- --runInBand tests/relatoriosContagem.test.js` e confirme falha antes da alteração.
3. Acrescente as colunas `Unidades vencidas`, `Baixa efetiva`, `Estoque antes da baixa`, `Estoque após a baixa` e `Observação`. Exportar itens contados com diferença ou vencidos. Indicar claramente quantidade não descontada por limite; calcular estoque após como anterior menos baixa efetiva.
4. Rode a suíte de relatórios e inspecione os valores lendo o workbook com ExcelJS.
5. Commit: `feat(reports): inclui baixa de vencidos no Excel`.

## Tarefa 7: revisão integrada e verificação

1. Execute do diretório `backend`: `npm test -- --runInBand` e `npm run lint`; resolva falhas relacionadas à mudança e repita comandos necessários.
2. Execute/valide migration e rollback apenas no banco de teste. Não executar contra produção.
3. Compare arquivos espelhados relevantes em `frontend/` e `public/`; procure diferenças inesperadas com `git diff --no-index` ou `git diff` conforme o padrão de publicação do projeto.
4. Faça revisão de segurança/code review independente da transação e do escopo por tenant; faça QA dos critérios de aceite para geral, peças, popup retomado, rollback, concorrência, histórico e Excel.
5. Revise `git diff --check`, `git status --short` e o diff final para confirmar que não há arquivos gerados ou mudanças alheias.
6. Commit final de ajustes, se houver, e informe os comandos/testes executados e qualquer pendência. Não fazer deploy nem migration de produção.
