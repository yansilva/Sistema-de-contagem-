---
title: Produtos vencidos na contagem geral e baixa de estoque
status: Aguardando revisão do usuário
date: 2026-10-05
---

# Produtos vencidos na contagem geral e baixa de estoque

## Contexto e objetivo

Durante a contagem cega, o funcionário precisa registrar quantas unidades vencidas encontrou de cada produto. A quantidade vencida faz parte da quantidade física contada. Depois da finalização, o sistema deve retirar do estoque somente as unidades vencidas, preservar a diferença normal da contagem para análise e permitir consultar o resultado na tela, no histórico e no Excel.

O fluxo atual já reúne o popup por produtor, o salvamento de progresso e a finalização em transações PostgreSQL. Os itens guardam uma fotografia do estoque de referência e a quantidade física; as diferenças são apuradas ao finalizar. O relatório Excel atual inclui apenas divergências. A nova informação deve ser persistida por item de contagem para continuar disponível mesmo depois que o cadastro de produto mudar.

## Decisões aprovadas

- O escopo cobre somente **contagem geral**. A modalidade **Peças de queijo** permanece sem campo de vencidos, baixa automática e relatório de diferenças.
- A quantidade vencida é um subconjunto da quantidade física. Exemplo: contagem física 10, das quais 2 vencidas. A diferença de estoque continua usando as 10 unidades físicas.
- O funcionário informa vencidos por produto dentro do popup do produtor. Se não abrir o campo, o valor é zero.
- Vencidos não podem ser registrados sem uma quantidade física e não podem ultrapassá-la.
- Salvar o progresso não altera o saldo do catálogo. A baixa acontece uma única vez ao finalizar a sessão.
- Na finalização, desconta-se somente a quantidade vencida do saldo atual do produto. A diferença normal entre saldo de referência e contagem física continua apenas na apuração/relatório.
- A baixa limitada a zero é permitida. Se o saldo atual for menor que o vencido informado, o estoque termina em zero e a parte que não pôde ser descontada é exibida como baixa limitada.
- A informação permanece disponível na tela de resultado, no histórico e no Excel.
- Produto fisicamente removido ou sem registro de estoque elegível para a baixa cancela toda a finalização. Nenhum produto pode ficar parcialmente baixado.
- Datas de validade, lotes, motivo, descarte, pendência de aprovação e baixa automática de divergências ficam fora deste escopo.

## Fluxo no popup

1. Cada linha de produto da contagem geral mostra uma ação secundária **Informar vencidos**.
2. Ao acioná-la, a própria linha revela um campo inteiro **Quantidade vencida**. Não há um segundo diálogo.
3. O campo aceita zero ou inteiro positivo. Negativos, decimais e texto são inválidos. O limite superior é a quantidade física atual da mesma linha.
4. Se a quantidade física for apagada ou reduzida abaixo do número de vencidos, a interface mostra o erro e impede o salvamento até a correção.
5. A linha identifica visualmente a quantidade registrada como vencida. Não se revela estoque de referência, saldo atual ou diferença enquanto a sessão estiver em andamento.
6. O botão existente **Salvar progresso deste produtor** envia quantidade física e vencida no mesmo pedido. A gravação das duas ocorre junta. Falha preserva o diálogo e os valores; sucesso confirma e fecha o diálogo.
7. Ao retomar uma sessão, o campo e o indicador são reconstruídos com os valores persistidos. Valores antigos sem registro de vencidos aparecem como zero.

O payload de cada item passa a aceitar `produto_id`, `quantidade_contada` e `quantidade_vencida`. Para compatibilidade, campo ausente é interpretado como zero. `quantidade_contada` continua aceitando `null` para item ainda não contado; nesse caso `quantidade_vencida` precisa ser zero.

## Persistência e API

Adicionar em `contagem_itens`:

- `quantidade_vencida INTEGER NOT NULL DEFAULT 0`, não negativa;
- `estoque_antes_baixa_vencidos INTEGER NULL`, fotografia do saldo lido durante a finalização;
- `quantidade_vencida_baixada INTEGER NULL`, quantidade realmente retirada do saldo.

Os campos históricos de baixa ficam nulos quando não houver vencidos naquele item. Para contagens antigas, a nova quantidade usa zero e o histórico de baixa permanece nulo.

O endpoint atual de salvar progresso valida no servidor que a sessão está em andamento, é de tipo geral e pertence à empresa autenticada; que o produto pertence ao produtor e à empresa no snapshot da sessão; que as quantidades são inteiros não negativos; e que vencidos não superam a contagem física. A gravação ocorre dentro da transação que já atualiza as quantidades por produtor. Repetir um salvamento atualiza o valor informado sem movimentar o estoque.

O endpoint de detalhe retorna `quantidade_vencida` durante a sessão para restaurar o formulário, sem acrescentar nenhum campo de estoque, referência ou baixa antes da finalização. Depois da finalização, o detalhe e o histórico incluem também a fotografia do estoque antes da baixa e a quantidade efetivamente baixada. A quantidade não descontada por limite pode ser derivada como `quantidade_vencida - quantidade_vencida_baixada`.

## Finalização e atualização do saldo

A finalização estende a transação atual e deve aplicar as operações nesta ordem lógica:

1. Bloquear a linha da sessão enquanto confirma empresa, tipo e estado `em_andamento`; a mesma sessão não pode ser finalizada duas vezes em paralelo.
2. Manter a apuração atual da diferença usando `quantidade_contada - estoque_referencia`. A baixa de vencidos não altera `diferenca`, `situacao` nem `tem_diferenca`.
3. Para cada item com vencidos maiores que zero, bloquear a linha do produto do mesmo tenant e ler o saldo vigente naquele momento. O saldo vigente no início da contagem não substitui o saldo no momento da finalização.
4. Guardar esse saldo em `estoque_antes_baixa_vencidos`; calcular `quantidade_vencida_baixada = LEAST(quantidade_vencida, GREATEST(estoque_atual, 0))`; atualizar o saldo para `GREATEST(estoque_atual - quantidade_vencida, 0)`; e guardar a baixa efetiva no item.
5. Se qualquer produto necessário estiver ausente, sem vínculo válido com o tenant ou não puder ser atualizado, reverter a transação inteira, incluindo apuração e baixas anteriores.
6. Registrar evento de auditoria com a sessão, o total de unidades vencidas, o total efetivamente baixado e o total não descontado por falta de saldo. Não incluir dados sensíveis desnecessários.
7. Alterar o estado da sessão para finalizada e confirmar a transação. A resposta de sucesso só ocorre depois do `COMMIT`.

O bloqueio e a condição de sessão em andamento fazem uma segunda solicitação de finalização falhar antes de uma nova baixa. A baixa é aplicada ao saldo corrente no momento da finalização, inclusive se esse saldo tiver sido alterado depois do snapshot da contagem. A associação histórica do fornecedor permanece a do snapshot da sessão; o produto não precisa continuar ativo nem com o mesmo nome de fornecedor para que o saldo do item existente no mesmo tenant seja ajustado.

### Exemplo de baixa limitada

Se o saldo atual for 1 e houver 4 vencidos, a transação guarda saldo anterior 1, baixa efetiva 1, estoque final 0 e quantidade não descontada 3. O resultado e o Excel mostram as quatro unidades encontradas e avisam que três não puderam ser retiradas do estoque.

## Resultado, histórico e Excel

### Tela de resultado

- Mostrar a métrica **Unidades vencidas** com a soma dos valores informados.
- Quando alguma baixa for limitada, mostrar **Baixa efetiva** e o total que não pôde ser descontado.
- Para cada produto vencido, mostrar quantidade física, vencidos informados, baixa efetiva e saldo após a baixa (`estoque_antes_baixa_vencidos - quantidade_vencida_baixada`).
- Preservar os indicadores atuais de diferença, falta e sobra como reconciliação baseada no snapshot de referência.
- Se não houver diferença, mas houver vencidos, comunicar **Contagem conferida com produtos vencidos**, sem apresentar o resultado como uma conciliação completa sem ressalvas.
- Mostrar também um caso sem diferença e sem vencidos como hoje.
- O Excel fica disponível se a sessão finalizada tiver divergências ou vencidos.

### Histórico

- Os cartões/listagens mostram um indicador e o total de vencidos para sessões finalizadas que tenham vencidos.
- O detalhe da sessão identifica produtor, produto, SKU, quantidade física, diferença, vencidos informados, baixa efetiva e eventual quantidade não descontada.
- A exportação fica disponível no histórico se houver diferença ou vencidos. Contagens antigas continuam com comportamento atual.

### Arquivo Excel

Adicionar as colunas **Unidades vencidas**, **Baixa efetiva**, **Estoque antes da baixa**, **Estoque após a baixa** e **Observação** às colunas atuais de fornecedor, código/SKU, produto, estoque de referência, contagem física e diferença.

O arquivo inclui cada produto contado que tenha `diferenca <> 0` **ou** `quantidade_vencida > 0`. Assim, um produto sem divergência continua presente quando houver unidades vencidas. A observação identifica uma baixa limitada e a quantidade não descontada. Se uma sessão antiga não tiver as colunas preenchidas, elas aparecem como zero ou vazias conforme sejam valores contados ou campos de baixa não aplicáveis.

## Segurança, falhas e compatibilidade

- Validar as regras na interface e no servidor. A validação do cliente é somente conveniência.
- Escopar cada leitura e atualização de saldo ao tenant autenticado e ao `produto_id` da contagem. Não aceitar saldo, quantidade efetiva ou valores de baixa vindos do cliente.
- Rejeitar contagem de vencidos em sessão de peças, item não contado, item de outro produtor/tenant e sessão já finalizada.
- Preservar o sigilo de estoque e diferença antes da finalização.
- Usar transação, locks de linhas de sessão/produtos e atualizações condicionais para evitar repetição e concorrência entre finalizações e operações de estoque.
- Qualquer erro antes do commit cancela todos os ajustes daquela finalização.
- Colunas novas têm defaults compatíveis; código, serializers, testes, mocks e banco de testes devem representar os defaults sem alterar sessões históricas.
- Criar migration reversível ou com rollback documentado, sem executar em produção como parte desta tarefa de implementação.

## Critérios de aceite

1. Funcionário consegue abrir o campo de vencidos por produto no popup da contagem geral e salvar junto com o físico.
2. Campo fechado corresponde a zero; retomar a sessão restaura valores anteriores.
3. Campo e API aceitam zero e inteiros positivos; rejeitam negativo, decimal, texto, vencido acima do físico e vencido sem quantidade física.
4. Falha ao salvar mantém popup e valores para nova tentativa; sucesso confirma e fecha.
5. A modalidade de peças não mostra, aceita, salva, baixa ou exporta vencidos.
6. Antes da finalização, a API/UI não revela referência, saldo vigente ou quantia baixada.
7. Finalizar mantém cálculo da diferença atual e desconta somente vencidos do saldo corrente, com estoque mínimo zero.
8. Baixa limitada registra quantidade encontrada, quantidade efetiva e quantidade não descontada.
9. Duas finalizações concorrentes não produzem baixa duplicada; repetição após finalizar não reduz o saldo novamente.
10. Falha em qualquer baixa reverte todas as baixas, apuração e finalização da transação.
11. Resultado imediato e histórico mostram os campos por produto e os totais de vencidos/baixa limitada.
12. Excel inclui colunas novas e linhas com diferença **ou** vencidos; exportação segue disponível quando houver apenas vencidos.
13. Sessões antigas carregam com zero vencidos, sem mudar dados existentes.
14. Testes cobrem isolamento entre tenants, produto ausente, concorrência, retry, peças, exibição cega, reabertura do popup, histórico, arquivo Excel e rollback.

## Escopo técnico previsto

- Front-end: `frontend/index.html`, `frontend/js/contagens.js`, `frontend/js/historico.js`, `frontend/js/consulta.js` e estilos do popup/resultado conforme necessário.
- Artefatos publicados espelhados: arquivos correspondentes em `public/`.
- Back-end: `backend/src/validators/schemas.js`, `backend/src/controllers/contagensController.js`, `backend/src/controllers/relatoriosController.js`, `backend/src/services/excel.js`, `backend/src/serializers/contagemSerializer.js`, auditoria e mocks de banco.
- Banco: nova migration em `backend/sql/migrations/`, `backend/sql/schema.sql` e fixtures/schemas usados pelos testes.
- Testes: UI do popup, endpoint de progresso, finalização com PostgreSQL, serializers, auditoria, listagem/detalhe do histórico e leitura do `.xlsx` gerado.

## Plano de revisão e entrega

Depois que o usuário revisar esta especificação, será escrito um plano de implementação. A execução deve acontecer em branch isolada e seguir TDD. Como a finalização altera saldo de estoque, incluir revisão independente de código, QA e Segurança. Validar a suíte, lint e build, comparar os arquivos espelhados em `frontend/` e `public/`, validar a migration em banco de teste e inspecionar o conteúdo do Excel. Não aplicar migration em produção nem publicar produção sem a autorização apropriada e a verificação correspondente.

## Referências do código atual

- Popup e linhas de contagem: `frontend/index.html` e `frontend/js/contagens.js` (`selecionarFornecedor`, `renderizarItensContagem`, `salvarProgressoAtual`).
- Validação e endpoint: `backend/src/validators/schemas.js` (`salvarProgressoContagemSchema`) e `backend/src/controllers/contagensController.js` (`salvarProgresso`).
- Apuração, finalização e detalhe: `backend/src/controllers/contagensController.js` (`finalizar`, `detalhe`) e `backend/src/serializers/contagemSerializer.js`.
- Snapshot e itens: `backend/sql/schema.sql` (`contagens`, `contagem_fornecedores`, `contagem_itens`). Migration vigente mais recente: `backend/sql/migrations/007_pecas_de_queijo.sql`.
- Histórico: `frontend/js/historico.js` e `frontend/js/consulta.js`.
- Relatório: `backend/src/controllers/relatoriosController.js` e `backend/src/services/excel.js`.
