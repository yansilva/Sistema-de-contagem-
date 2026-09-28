# Melhorias operacionais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar contagem de peças, cobertura semanal e importação de estoque pelo funcionário.

**Architecture:** Três planos com entregas testáveis, reutilizando os fluxos atuais. Executar peças antes da cobertura semanal; a importação é independente. Evitar agentes editando simultaneamente os arquivos compartilhados de navegação, HTML, eventos e testes de funcionário.

**Tech Stack:** Express, PostgreSQL/pg, Zod, JavaScript sem framework, Jest/Supertest, Multer e pdf-parse existentes. Sem novas dependências.

**Spec:** [Especificação aprovada](../specs/2026-09-28-pecas-semana-importacao-funcionario-design.md).

## Global Constraints

- Peças são inteiras, sem conversão ou comparação com kg; PDF atualiza somente SKUs cadastrados.
- Zero é contado; vazio é não contado. Finalização parcial permanece válida.
- Semana: segunda-feira às 00:00 até a segunda seguinte em `America/Sao_Paulo`.
- Funcionário mantém contagem geral cega enquanto aberta; referência visível após finalizar.
- Toda consulta/mutação usa a empresa autenticada; classificação continua administrativa.
- Preservar sessões antigas, snapshots, temas cobalto/grafite e arquivos alheios `.maestri/`.

## Review Focus

1. Sessão antiga com produto reclassificado: preservar modo e referência — plano de peças, tarefa 2.
2. Zero, vazio e salvamento simultâneo à finalização: não converter vazio nem alterar sessão encerrada — peças, tarefa 2.
3. Virada de semana, recontagem e empresa diferente: cobertura sem duplicação/vazamento — semana, tarefa 1.
4. Prévia de funcionário e importação após iniciar contagem: não expor saldo anterior nem mudar snapshot — importação, tarefa 1.
5. Falha de rede, nomes longos e tablet: erro recuperável e navegação acessível — tarefas de interface dos três planos.

## Ordem e contratos comuns

1. [Peças de queijo e classificação](2026-09-28-pecas-de-queijo.md): migration, catálogo, sessão por modalidade, resultado/histórico.
2. [Semana de contagem](2026-09-28-cobertura-semanal.md): consulta de cobertura e painel operacional.
3. [Importação pelo funcionário](2026-09-28-importacao-funcionario.md): permissão específica, prévia por perfil e tela compartilhada.

Contrato persistido: `produtos.contagem_em_pecas: boolean` (default `false`); `contagens.tipo: 'geral' | 'pecas_queijo'` (default `'geral'`). A referência de itens de peças é SQL `NULL`. Modo da sessão é imutável. Cada subplano declara seus arquivos, interfaces e testes; ler também esta especificação e este plano raiz antes de executar.

## Integração e publicação

- [ ] Criar/reutilizar worktree adequado pelo fluxo Superpowers; branch `codex/melhorias-operacionais`. Partir do estado local que inclui a especificação e estes planos; não perder commits de documentação ainda não enviados.
- [ ] Após cada tarefa, registrar evidência dos testes e revisão. Revisão de segurança cobre upload, permissões e tenant; QA cobre zero/vazio, parcial, semana e fluxos dos dois modos. Consultar a preferência de coordenação no Segundo Cérebro.
- [ ] Executar `npm test`, depois `npm run lint`, depois `npm run build`. Esperado: todos os testes executados passam, zero erros de lint, frontend sincronizado em `public/`. Registrar skips e avisos existentes. Não anunciar testes PostgreSQL como validados se `TEST_DATABASE_URL` não foi configurada.
- [ ] Executar os testes PostgreSQL dos subplanos em banco isolado cujo nome termina `_test`, incluindo migration repetida. Usar a configuração existente; não usar produção como banco de testes. `npm run migrate -- --dry-run` apenas lista arquivos, não valida SQL.
- [ ] Verificar visualmente 390, 768, 1024 e 1440 px: peças/geral, seleção de sessão, resultado/histórico, semana, PDF, estados de vazio/erro/carregamento, teclado e temas. Registrar teste de iPad físico separadamente de emulação.
- [ ] Revisar diff final, arquivos publicados e compatibilidade. Atualizar Segundo Cérebro com entregas, limites e validações efetivas.
- [ ] Aplicar migrations compatíveis pelo runner existente antes do deploy dependente. Confirmar projeto Supabase e esquema; não imprimir credenciais. Verificar campos e uma sessão geral preservada. Se não houver acesso, guardar scripts e declarar a publicação bloqueada pela migration, sem publicar código incompatível.
- [ ] Integrar commits revisados ao `main`, enviar ao GitHub e verificar resultado do deploy conforme autorização já dada na conversa. Depois conferir saúde da API e recursos publicados; somente afirmar validação autenticada de produção quando realizada.
- [ ] Rollback preserva campos e sessões de peças. Se necessário, desabilitar criação de sessões de peças mantendo leitura correta; não publicar versão antiga que as interprete como gerais.

## Revisão do plano

Cobertura: os critérios 1–4 pertencem a peças; 5–6 à semana; 7–8 à importação; 9 à integração. Plano revisado contra a especificação. Código, migration e deploy ainda não executados nesta fase. Aguardar revisão do usuário e escolha entre execução com subagentes ou execução nesta sessão.
