# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O usuário principal é o funcionário que realiza a contagem física de estoque, inclusive em celular e tablet. Administradores acompanham divergências, gerenciam catálogo e equipe e tomam decisões sobre o estoque. O Super Admin administra empresas e presta suporte de plataforma por auditoria somente leitura.

## Product Purpose

O Sistema de Estoque permite contar produtos, conciliar o físico com o saldo de referência e registrar o resultado. Sucesso significa concluir contagens com menos erros e manter rastreabilidade das divergências, com igual prioridade entre esses objetivos.

## Positioning

A contagem é cega para o funcionário: o saldo do sistema não aparece no catálogo nem durante a coleta. A comparação ocorre no fluxo de conciliação, preservando a independência da medição física e a trilha do resultado.

## Operating Context

- A equipe de loja inicia uma contagem, localiza produtos por produtor, catálogo ou SKU, registra quantidades e pode salvar progresso para continuar depois.
- A administração importa catálogo, acompanha contagens e divergências e utiliza relatórios Excel. Funcionários e administradores podem importar o saldo de referência por PDF do ERP dentro da própria empresa; a prévia do funcionário não revela o saldo anterior.
- Há contagem geral e contagem de peças, com regras próprias. Na contagem geral, produtos vencidos são registrados por SKU como parte do físico e baixados uma vez na finalização.
- O produto é usado em navegador de desktop, celular e tablet, nos temas claro e escuro.

## Capabilities and Constraints

- Perfis de funcionário, administrador e Super Admin têm navegação e permissões distintas. A API também valida cada operação.
- Dados de empresas são isolados por tenant. Cadastro de empresas é exclusivo do Super Admin.
- Importação de estoque atualiza apenas SKUs ativos já cadastrados e exige prévia e confirmação; não cria produtos a partir do arquivo.
- Resultado, histórico e exportação Excel preservam a trilha das contagens. A referência fica disponível ao funcionário depois da finalização.
- O nome exibido na interface é **Sistema de Estoque**. O repositório e parte da documentação usam **Sistema de Contagem**.
- A recuperação de senha por link depende de um provedor de e-mail ainda não definido; o fluxo vigente usa senha temporária de administrador com troca obrigatória.

## Brand Commitments

A identidade visual vigente, aprovada e publicada, usa cobalto e grafite e a marca S modular. Há suporte a temas claro e escuro e a movimento reduzido. O produto mantém o nome **Sistema de Estoque** na interface.

## Evidence on Hand

- A interface operacional e seus textos estão em `frontend/index.html`, com estilos em `frontend/css/` e marca em `frontend/assets/`.
- O `README.md` documenta arquitetura, perfis, operações e execução; decisões e histórico do projeto estão no Segundo Cérebro.
- Dados ilustrativos da página de prévia visual não devem ser tratados como resultados ou depoimentos reais.

## Product Principles

1. Facilitar a coleta física sem revelar o saldo de referência antes da finalização.
2. Reduzir erros de operação e preservar a autoria e o histórico das alterações.
3. Mostrar divergências de forma compreensível para que possam ser verificadas.
4. Respeitar as permissões de cada perfil e o isolamento entre empresas.
5. Permitir retomada segura de uma contagem interrompida.

## Accessibility & Inclusion

A interface deve funcionar com teclado, em telas pequenas e com preferência por movimento reduzido; esses comportamentos já aparecem na implementação existente.
