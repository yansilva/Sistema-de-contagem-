# Especificação de Design — Console Super Admin & Gestão de Tenants SaaS

**Data:** 2026-09-18  
**Status:** Aprovado em Brainstorming  
**Autor:** Antigravity & Equipe de Engenharia  

---

## 1. Visão Geral e Motivação

O Super Admin anterior apresentava limitações funcionais e estéticas:
- Impossibilidade de excluir ou suspender empresas cadastradas (ausência de rotas e interface para ciclo de vida de tenants).
- Dificuldade de visualização de métricas detalhadas de cada empresa cliente (usuários, SKUs, contagens, status do trial).
- Ausência de mecanismo de suporte assistido (*Impersonation* de tenant).
- Duplicação de elementos no DOM (`#screen-empresas` duplicada) e visual com aspecto genérico de protótipo de IA.

Este documento estabelece a especificação completa do novo **Console SaaS do Super Admin**, dotado de arquitetura robusta, design inspirado em ferramentas líderes (Stripe, Linear, Vercel) e segurança corporativa auditável.

---

## 2. Requisitos e Regras de Negócio

### 2.1 Gestão do Ciclo de Vida da Empresa
1. **Opção Dupla**:
   - **Suspender / Reativar Acesso**: Alterna o plano da empresa entre `ativo`, `trial` e `suspenso`. Quando suspensa, nenhum usuário daquela empresa consegue logar (recebe erro `EMPRESA_SUSPENSA`).
   - **Excluir Permanentemente**: Remove a organização do banco de dados em cascata (produtos, contagens, histórico de estoque, usuários e refresh tokens). Requer confirmação explícita digitando exatamente o nome da empresa.
2. **Integridade de Auditoria na Exclusão**:
   - Para compatibilidade com a constraint de banco `audit_logs.empresa_id ON DELETE RESTRICT`, a operação de exclusão atualiza os registros de auditoria existentes daquela empresa para desvincular o `empresa_id` ou arquivá-los antes da remoção física, registrando um evento formal com escopo de plataforma (`empresa_excluida_permanentemente`).

### 2.2 Impersonation (Acesso como Suporte)
- O Super Admin pode assumir a identidade de administrador de qualquer empresa cliente com um clique.
- É gerado um token seguro de sessão temporária contendo `{ id: admin_da_empresa, empresa_id: target_empresa, impersonated_by: super_admin_id }`.
- Uma barra fixa de suporte é fixada no topo da interface:  
  `"Modo Suporte Ativo: Visualizando [Nome da Empresa] • [Encerrar Sessão de Suporte e Voltar ao Console]"`
- Todas as ações executadas durante a sessão de suporte são registradas na auditoria como originadas pelo Super Admin em modo impersonation.

### 2.3 Edição e Visualização Detalhada
- **Gaveta Lateral Deslizante (*Slide-Over Drawer*)**:
  - Exibe sem recarregar a tela: ID do tenant, data de criação, data de expiração do trial, contagem de SKUs, número de contagens já finalizadas e tabela dos usuários daquela empresa.
- **Edição de Dados**:
  - Permite atualizar nome da empresa, e-mail de contato, status do plano e data de expiração do trial.

---

## 3. Arquitetura de API (Backend)

Rotas montadas em `/api/empresas` e restritas com `auth` + `requireSuperAdmin`:

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/empresas` | Lista todas as empresas com métricas consolidadas (usuários, SKUs, contagens, status). |
| `GET` | `/api/empresas/:id` | Detalhes completos de uma empresa específica e seus usuários associados. |
| `PUT` | `/api/empresas/:id` | Atualização cadastral (nome, email_contato, plano, trial_expira_em). |
| `PATCH` | `/api/empresas/:id/status` | Alternância rápida de status (`ativo`, `trial`, `suspenso`). |
| `DELETE` | `/api/empresas/:id` | Exclusão definitiva com cascata e desvinculação segura de auditoria. |
| `POST` | `/api/empresas/:id/impersonar` | Emite credencial de suporte para navegação direta no tenant. |
| `GET` | `/api/empresas/metricas/saas` | Indicadores globais da plataforma para o dashboard do Super Admin. |

---

## 4. Design da Interface do Usuário (Frontend)

### 4.1 Estrutura do Layout (`#screen-superadmin-console`)
Substitui a visualização antiga do `#home-superadmin` e as telas duplicadas `#screen-empresas`:
- **Sidebar Fixa do Console**:
  - Logo e indicador de ambiente (*SaaS Operations Console*).
  - Itens de navegação:
    - 📊 **Visão Geral** (Métricas globais, volume de dados, saúde do SaaS).
    - 🏢 **Empresas & Tenants** (Gestão de clientes, planos e acessos).
    - 📜 **Auditoria Global** (Feed de atividades e segurança de toda a plataforma).
  - Rodapé com identificação do Super Admin logado e atalho para simulação do operador.
- **Área Central Dinâmica**:
  - Topbar contextual com busca instantânea e atalhos rápidos.
  - Seção ativa renderizada suavemente via transições CSS.

### 4.2 Tabela Moderna de Empresas
- Badges semânticos com design pill e indicador luminoso (`status-dot`):
  - Verde: *Ativo*
  - Azul/Âmbar: *Trial (Xd restantes)*
  - Vermelho: *Suspenso*
- Menu de Ações (⋮) em cada linha:
  - *Ver Detalhes* (dispara o Slide-Over Drawer)
  - *Acessar como Suporte (Impersonar)*
  - *Alterar Status (Ativar / Suspender)*
  - *Editar Informações*
  - *Excluir Empresa* (com destaque visual destrutivo e modal de validação)

### 4.3 Slide-Over Drawer
- Componente nativo HTML/CSS com abertura suave pela lateral direita.
- Backdrop translúcido com `backdrop-filter: blur(4px)`.
- Seções organizadas: Visão Geral do Tenant, Gestor Principal, Usuários da Empresa e Ações Rápidas.

---

## 5. Estratégia de Testes e Validação

1. **Testes Unitários e de Integração (Backend)**:
   - `empresas.test.js`:
     - Teste de listagem e detalhes com `requireSuperAdmin`.
     - Teste de atualização cadastral e bloqueio de emails duplicados.
     - Teste de suspensão e validação de login bloqueado para empresa suspensa.
     - Teste de exclusão definitiva com verificação de cascata e integridade dos logs.
     - Teste de impersonation emitindo token válido.
2. **Compatibilidade com Mock DB**:
   - Atualização de `mockDb.js` para simular os novos endpoints e operações em lote em ambiente de teste.
3. **Regressão Global**:
   - Garantir que todas as 17 suítes de testes pré-existentes continuem com 100% de aprovação.
