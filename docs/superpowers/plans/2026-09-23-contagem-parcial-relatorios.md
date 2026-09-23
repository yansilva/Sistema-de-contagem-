# Contagem parcial e relatórios — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans para executar as tarefas abaixo em sequência, com teste antes da implementação.

**Goal:** Finalizar apenas produtos efetivamente contados, acelerar a apuração e disponibilizar resultado, histórico e Excel corretos para funcionários.

**Architecture:** O backend preserva `NULL` para itens não contados e calcula divergências em uma única atualização SQL. A consulta de sessões finalizadas devolve somente itens contados. A exportação usa os campos reais do banco e omite a referência para funcionários; a interface apresenta o histórico em uma janela.

**Tech Stack:** Express, PostgreSQL, ExcelJS, JavaScript, CSS, Jest.

**Spec:** `docs/superpowers/specs/2026-09-23-contagem-parcial-relatorios.md`

## Global Constraints

- Isolamento por `empresa_id` em todas as consultas autenticadas.
- Funcionário não vê `estoque_referencia` nem saldo do sistema.
- Zero digitado conta; campo vazio não conta.
- Uma sessão sem nenhum item contado não pode ser finalizada.

## Review Focus

- Produtor com alguns produtos contados: apenas esses produtos entram na apuração e no resultado.
- Quantidade zero digitada: diferença válida, distinta de `NULL`.
- Sessão de outra empresa e sessão aberta: Excel negado.
- Sessão finalizada sem diferenças: interface não oferece exportação vazia.
- Histórico em tela pequena: detalhe visível imediatamente e fechável.

### Task 1: Apuração parcial e rápida

**Files:** `backend/src/controllers/contagensController.js`, `backend/tests/contagens.test.js`, `backend/src/config/mockDb.js`.

- [ ] Testar finalização com item contado, zero explícito e item `NULL`; confirmar que não há consulta por item.
- [ ] Rodar o teste e observar a falha.
- [ ] Implementar atualização em lote e flags por produtor; recusar sessão sem itens contados.
- [ ] Filtrar produtores e itens não contados nas consultas de sessões finalizadas.
- [ ] Rodar os testes focados.

### Task 2: Excel seguro para funcionário

**Files:** `backend/src/routes/relatorios.js`, `backend/src/controllers/relatoriosController.js`, `backend/src/services/excel.js`, `backend/tests/funcionarioAccess.test.js`, novo teste de relatório.

- [ ] Testar acesso do funcionário à sessão finalizada da própria empresa, bloqueio de sessão aberta/outra empresa e ausência da coluna de referência.
- [ ] Rodar o teste e observar a falha.
- [ ] Corrigir consulta e planilha; expor apenas a rota autenticada de Excel.
- [ ] Rodar os testes focados.

### Task 3: Resultado e histórico visíveis

**Files:** `frontend/js/contagens.js`, `frontend/js/consulta.js`, `frontend/index.html`, `frontend/css/pages.css`, `frontend/js/events.js`, `backend/tests/frontendFuncionario.test.js`.

- [ ] Testar aviso de finalização parcial, métricas só dos contados, botão Excel e abertura do histórico em janela.
- [ ] Rodar o teste e observar a falha.
- [ ] Implementar interface e sincronizar `public/`.
- [ ] Rodar os testes focados.

### Task 4: Corrigir os zeros históricos gerados automaticamente

**Files:** `backend/sql/migrations/006_corrigir_contagens_parciais.sql`.

- [ ] Confirmar critério com consulta somente leitura no banco de produção.
- [ ] Criar migração idempotente para restaurar `NULL` quando `contado_em IS NULL` e atualizar flags.
- [ ] Validar a migração e aplicar em produção após a nova aplicação estar publicada.
- [ ] Verificar contagens e divergências do registro afetado.

### Task 5: Entrega

- [ ] Rodar suíte completa, lint, build e checagem de diferenças.
- [ ] Publicar na `main`, conferir CI e arquivos servidos.
- [ ] Registrar diagnóstico, decisão e resultado no Segundo Cérebro.
