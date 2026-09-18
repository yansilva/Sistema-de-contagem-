# Console Super Admin & Gestão de Tenants SaaS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o novo Console SaaS do Super Admin com sidebar dedicada, gestão completa do ciclo de vida de tenants (exclusão permanente com confirmação, suspensão/reativação, edição cadastral), slide-over drawer de detalhes, modo de suporte assistido (impersonation) e visual de alto padrão eliminando o aspecto genérico de IA.

**Architecture:** 
- Backend: Expansão do `empresasController.js` e `routes/empresas.js` com rotas protegidas por `requireSuperAdmin` para obter detalhes, atualizar, alternar status (`PATCH`), deletar em cascata tratando referências de auditoria (`DELETE`) e gerar credenciais temporárias de impersonation (`POST`).
- Frontend: Substituição das telas genéricas e duplicadas (`#screen-empresas` duplicada e `#home-superadmin` básico) por um Console SaaS completo (`#screen-superadmin-console`) com sidebar de navegação, tabela de tenants com menu de contexto (⋮), slide-over drawer para inspeção profunda, modal com confirmação de digitação para exclusão definitiva e barra fixa de modo suporte.
- Design: Nova folha de estilos `frontend/css/superadmin.css` com paleta Linear/Safira, dark/light mode e animações fluidas.

**Tech Stack:** Node.js, Express, PostgreSQL, Jest, Vanilla HTML5/CSS3/JavaScript, Tabler Icons.

**Spec:** [docs/superpowers/specs/2026-09-18-superadmin-console-design.md](file:///c:/Users/yansa/Yan/Sistema-de-contagem-/docs/superpowers/specs/2026-09-18-superadmin-console-design.md)

## Global Constraints
- Todas as rotas de empresas devem exigir autenticação e papel `super_admin`.
- Na exclusão de empresa, a constraint `ON DELETE RESTRICT` de `audit_logs` deve ser tratada atualizando ou desvinculando `empresa_id` antes da exclusão física, registrando auditoria de plataforma.
- Confirmação de exclusão permanente no frontend deve exigir a digitação exata do nome da empresa.
- Todos os 111 testes pré-existentes devem continuar passando sem regressão.

---

### Task 1: Backend — Rotas de Detalhes, Atualização, Status e Métricas do SaaS

**Files:**
- Modify: `backend/src/routes/empresas.js`
- Modify: `backend/src/controllers/empresasController.js`
- Create: `backend/tests/empresasSuperAdmin.test.js`

**Interfaces:**
- Consumes: `requireSuperAdmin`, `auditService`, `query`, `getClient`
- Produces:
  - `GET /api/empresas/metricas/saas` -> `{ success: true, data: { totalEmpresas, ativas, trial, suspensas, totalUsuarios, totalProdutos, totalContagens } }`
  - `GET /api/empresas/:id` -> `{ success: true, data: { empresa, usuarios: [...] } }`
  - `PUT /api/empresas/:id` -> `{ success: true, data: { empresa } }`
  - `PATCH /api/empresas/:id/status` -> `{ success: true, data: { empresa } }`

- [ ] **Step 1: Escrever testes automatizados que falham para as novas rotas**
Criar `backend/tests/empresasSuperAdmin.test.js` cobrindo consulta de métricas, busca de empresa por ID, atualização cadastral e alteração de status (`ativo` -> `suspenso`).
- [ ] **Step 2: Executar testes para confirmar que falham**
Executar `npx jest backend/tests/empresasSuperAdmin.test.js` e verificar que retornam 404/não implementado.
- [ ] **Step 3: Implementar métodos no `empresasController.js` e registrar rotas em `empresas.js`**
Adicionar `obterDetalhes`, `atualizar`, `alterarStatus` e `obterMetricasSaaS` com devida validação e auditoria.
- [ ] **Step 4: Executar testes para validar aprovação**
Executar `npx jest backend/tests/empresasSuperAdmin.test.js` e verificar aprovação.
- [ ] **Step 5: Commit**
`git add backend/src/routes/empresas.js backend/src/controllers/empresasController.js backend/tests/empresasSuperAdmin.test.js; git commit -m "feat(backend): rotas de detalhes, status e metricas do super admin"`

---

### Task 2: Backend — Exclusão em Cascata e Impersonation (Modo Suporte)

**Files:**
- Modify: `backend/src/controllers/empresasController.js`
- Modify: `backend/src/routes/empresas.js`
- Modify: `backend/tests/empresasSuperAdmin.test.js`

**Interfaces:**
- Produces:
  - `DELETE /api/empresas/:id` -> `{ success: true, message: "Empresa excluída com sucesso." }`
  - `POST /api/empresas/:id/impersonar` -> `{ success: true, data: { accessToken, usuario, empresa, impersonated: true } }`

- [ ] **Step 1: Adicionar testes de exclusão e impersonation ao arquivo de testes**
Testar exclusão definitiva (verificando que produtos/usuários são limpos e auditoria de plataforma é registrada) e teste de emissão de token de suporte.
- [ ] **Step 2: Executar testes para confirmar a falha**
Executar `npx jest backend/tests/empresasSuperAdmin.test.js`.
- [ ] **Step 3: Implementar `excluirEmpresa` e `impersonarEmpresa` no controller**
Garantir desvinculação segura dos `audit_logs` que apontam para a empresa (`UPDATE audit_logs SET empresa_id = NULL WHERE empresa_id = $1`), remoção em cascata (`DELETE FROM empresas WHERE id = $1`) e emissão de token de impersonation para o primeiro administrador ativo da empresa.
- [ ] **Step 4: Executar testes para validar sucesso**
Executar `npx jest backend/tests/empresasSuperAdmin.test.js`.
- [ ] **Step 5: Commit**
`git add backend/src/routes/empresas.js backend/src/controllers/empresasController.js backend/tests/empresasSuperAdmin.test.js; git commit -m "feat(backend): exclusao definitiva e impersonation de empresas"`

---

### Task 3: Mock DB & Compatibilidade da Suíte de Testes

**Files:**
- Modify: `backend/src/config/mockDb.js`

**Interfaces:**
- Suportar consultas de `DELETE FROM empresas`, `UPDATE audit_logs SET empresa_id = NULL`, queries de agregação de métricas globais do SaaS e seleção de administradores de tenant.

- [ ] **Step 1: Atualizar handlers de SQL no `mockDb.js`**
Adicionar suporte para as novas queries do `empresasController` no mock em memória.
- [ ] **Step 2: Rodar a suíte inteira de testes do projeto**
Executar `npm test` e verificar aprovação completa (todas as 18 suítes).
- [ ] **Step 3: Commit**
`git add backend/src/config/mockDb.js; git commit -m "feat(backend): mockDb atualizado para suporte ao console superadmin"`

---

### Task 4: Frontend — Estrutura HTML do Console Super Admin e Limpeza de Duplicatas

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/js/app.js`

**Interfaces:**
- Remove: Telas `#screen-empresas` duplicadas e `#home-superadmin` rudimentar.
- Insere: `#screen-superadmin` com layout `.saas-console-layout` (Sidebar com Visão Geral, Empresas, Auditoria Global, Área Central com Topbar e KPIs).

- [ ] **Step 1: Remover as seções duplicadas de `#screen-empresas` em `frontend/index.html`**
- [ ] **Step 2: Inserir a nova marcação do Console SaaS do Super Admin**
Estruturar Sidebar do Super Admin, abas de visualização, tabela rica de empresas, slide-over drawer e modais de confirmação.
- [ ] **Step 3: Conectar navegação no `frontend/js/app.js`**
Garantir que ao logar como `super_admin`, o sistema exiba o console SaaS completo e gerencie abas internas.
- [ ] **Step 4: Commit**
`git add frontend/index.html frontend/js/app.js; git commit -m "feat(frontend): estrutura do console superadmin e correcao de telas duplicadas"`

---

### Task 5: Frontend — Módulo JavaScript de Gestão de Empresas e Drawer Lateral

**Files:**
- Modify: `frontend/js/empresas.js`

**Interfaces:**
- `Empresas.carregar()`
- `Empresas.abrirDrawer(empresaId)`
- `Empresas.fecharDrawer()`
- `Empresas.alterarStatus(empresaId, novoStatus)`
- `Empresas.confirmarExclusao(empresaId, empresaNome)`
- `Empresas.executarExclusao(empresaId)`
- `Empresas.abrirModalEdicao(empresaId)`
- `Empresas.salvarEdicao(event)`

- [ ] **Step 1: Implementar renderização moderna da tabela com menu de ações (⋮) e badges semânticos**
- [ ] **Step 2: Implementar slide-over drawer com dados detalhados e lista de usuários**
- [ ] **Step 3: Implementar modal de confirmação de exclusão com validação do nome digitado**
- [ ] **Step 4: Implementar alternância de status e modal de edição rápida**
- [ ] **Step 5: Commit**
`git add frontend/js/empresas.js; git commit -m "feat(frontend): modulo empresas com drawer, exclusao e edicao"`

---

### Task 6: Frontend — Modo Suporte (Impersonation) com Barra Superior Flutuante

**Files:**
- Modify: `frontend/js/auth.js`
- Modify: `frontend/js/empresas.js`
- Modify: `frontend/index.html`

**Interfaces:**
- `Empresas.iniciarImpersonation(empresaId)`: Salva token original do Super Admin no `sessionStorage`, substitui credencial ativa e direciona para a tela do tenant com banner fixo.
- `Auth.encerrarImpersonation()`: Restaura credencial do Super Admin e retorna imediatamente ao console da plataforma.

- [ ] **Step 1: Adicionar barra de suporte no topo do `index.html`**
Barra persistente com identificador visual do tenant e botão "Encerrar Suporte e Voltar".
- [ ] **Step 2: Implementar fluxo de troca e restauração de credencial em `auth.js` e `empresas.js`**
- [ ] **Step 3: Commit**
`git add frontend/js/auth.js frontend/js/empresas.js frontend/index.html; git commit -m "feat(frontend): modo suporte impersonation com retorno seguro"`

---

### Task 7: CSS — Folha de Estilos Dedicada `superadmin.css`

**Files:**
- Create: `frontend/css/superadmin.css`
- Modify: `frontend/index.html`

**Interfaces:**
- Classes: `.saas-console-layout`, `.saas-sidebar`, `.saas-content`, `.tenant-table`, `.slide-over-drawer`, `.impersonation-bar`, `.status-pill`.

- [ ] **Step 1: Criar estilos com paleta Índigo/Safira, Dark Mode e Light Mode**
- [ ] **Step 2: Estilizar gaveta lateral (*slide-over drawer*) com animação fluida e backdrop blur**
- [ ] **Step 3: Estilizar menu de contexto (⋮), modal de exclusão e barra de impersonation**
- [ ] **Step 4: Importar `superadmin.css` em `frontend/index.html`**
- [ ] **Step 5: Commit**
`git add frontend/css/superadmin.css frontend/index.html; git commit -m "style: folha de estilos do console superadmin com drawer e badges"`

---

### Task 8: Sincronização, Validação End-to-End e Segundo Cérebro

**Files:**
- Run: `npm run build`
- Run: `npm test`
- Vault: Atualização das notas do Segundo Cérebro

- [ ] **Step 1: Sincronizar frontend para produção (`npm run build`)**
- [ ] **Step 2: Executar bateria de testes automatizados e certificar 100% de sucesso**
- [ ] **Step 3: Registrar entrega, decisões e padrões no Segundo Cérebro Obsidian**
- [ ] **Step 4: Commit final**
