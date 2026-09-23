# Contagem parcial, resultado e relatório

## Comportamento esperado

- Uma sessão pode conter o catálogo inteiro como referência, mas apenas itens com `quantidade_contada` preenchida entram na finalização. Zero preenchido é uma contagem válida; `NULL` continua não contado.
- Resultado e histórico de uma sessão finalizada exibem somente os produtores e itens contados. A tela de contagem em andamento continua mostrando o snapshot disponível.
- Finalizar não deve executar uma consulta por produto. A operação continua transacional, isolada por empresa e com auditoria.
- Funcionários podem baixar Excel das diferenças após a finalização, sem coluna de estoque de referência. Administradores continuam com a visão completa.
- No histórico do funcionário, os detalhes aparecem em uma janela acima da lista, com opção de fechar.
- O registro de produção finalizado indevidamente pode ser corrigido quando `quantidade_contada = 0` e `contado_em IS NULL`, pois o fluxo antigo gerava esses zeros na finalização sem registrar horário de contagem.
