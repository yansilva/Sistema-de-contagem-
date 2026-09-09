# SaaS de Contagem de Estoque

[![Secured by GitGuard](https://img.shields.io/badge/Secured%20by-GitGuard-success?style=flat-square)](https://www.gitguard.com.br/yansilva)

Sistema completo de contagem e controle de inventário de estoque com suporte multi-tenant, gestão de usuários, conciliação de saldos, importação e exportação em planilhas Excel.

---

## 🚀 Funcionalidades

- **Multi-tenant:** Isolamento completo por empresa com suporte a planos (trial, ativo, suspenso).
- **Autenticação Segura:** JWT com access tokens de curta duração e refresh tokens com rotação.
- **Contagem em Tempo Real:** Registro de contagem de itens agrupados por fornecedor com identificação de divergências.
- **Importação e Exportação:** Leitura e conciliação direta com planilhas Excel (.xlsx) e exportação de relatórios de diferença.
- **Back-office do Gestor:** Painel administrativo para gestão de produtos, histórico de contagens e auditoria.

---

## 🛠️ Tecnologias

- **Backend:** Node.js, Express, PostgreSQL (`pg` + `pgcrypto`), JSON Web Token (`jsonwebtoken`), ExcelJS, Express-Rate-Limit.
- **Frontend:** Single Page Application em HTML5, CSS moderno e Vanilla JavaScript.

---

## 📦 Instalação e Execução

1. Clone o repositório:
   ```bash
   git clone https://github.com/yansilva/Sistema-de-contagem-.git
   cd Sistema-de-contagem-
   ```

2. Configure o banco de dados PostgreSQL e as variáveis de ambiente no backend:
   ```bash
   cd backend
   npm install
   ```

3. Crie o arquivo `.env` na pasta `backend/`:
   ```env
   PORT=3000
   DATABASE_URL=postgres://usuario:senha@localhost:5432/estoque_saas
   JWT_SECRET=sua_chave_secreta_jwt_longa_e_aleatoria
   JWT_EXPIRA_EM=15m
   REFRESH_TOKEN_EXPIRA_DIAS=30
   FRONTEND_URL=http://localhost:3000
   ```

4. Execute o schema e o seed inicial:
   ```bash
   npm run seed
   ```

5. Inicie o servidor:
   ```bash
   npm run dev
   ```
   Ou no Windows, execute `iniciar-servidor.bat` na raiz.

---

## 🔒 Segurança

Auditoria de segurança realizada com **GitGuard**, garantindo correção de vulnerabilidades em dependências e conformidade com as regras SAST e OWASP.
