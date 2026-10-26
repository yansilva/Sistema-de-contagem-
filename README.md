# Sistema de Contagem de Estoque (SaaS)

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.22-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?style=flat-square&logo=docker&logoColor=white)

Plataforma multi-tenant para contagem física de estoque, conciliação com o saldo do ERP (Tiny, Bling etc.) e auditoria de divergências, com exportação para Excel (.xlsx).

## O que o sistema faz

- **Contagem cega:** o funcionário conta sem ver o saldo do sistema. O catálogo exibido a ele não traz o saldo.
- **Modalidades de contagem:** geral, peças de queijo e produtos vencidos.
- **Perfis:** `funcionario` (conta e consulta catálogo, produtores e histórico), `gestor`/`admin` (catálogo, importações, funcionários, atividades, relatórios) e `super_admin` (console da plataforma: empresas, auditoria somente leitura, senha temporária de administrador).
- **Multi-tenant:** as consultas são filtradas por `empresa_id` extraído do token.
- **Autenticação:** access token curto (15 min) e refresh token opaco com rotação e detecção de reúso; hash SHA-256 no banco.
- **Importação:** catálogo por Excel e saldo de referência por PDF.
- **API documentada** em OpenAPI/Swagger (`/api/docs`).

## Estrutura do repositório

| Caminho | O que é |
|---|---|
| `backend/` | API Express. Código em `src/`, SQL em `sql/` (`schema.sql`, `migrations/`, `rollbacks/`, `seed.sql` só para desenvolvimento), testes Jest em `tests/`. |
| `frontend/` | Fonte do frontend (HTML, CSS e JS sem framework). **É aqui que se edita.** |
| `public/` | Cópia gerada de `frontend/` por `npm run build`. A Vercel serve esta pasta. Não edite à mão. |
| `api/` | Entrada serverless da Vercel (`api/index.js` carrega o Express de `backend/`). |
| `docs/` | Guia de deploy (`VERCEL_DEPLOYMENT.md`), imagens e planos de trabalho. |
| `.github/workflows/ci.yml` | Pipeline de CI. |
| `Dockerfile`, `docker-compose.yml` | Imagem da aplicação (API + frontend) e stack local com PostgreSQL. |
| `vercel.json` | Roteamento, cabeçalhos e função da Vercel. |
| `.local/`, `.worktrees/`, `.tmp/`, `graphify-out/` | Uso local e ferramentas; ficam fora do Git ou são descartáveis. |

## Como rodar localmente

Pré-requisitos: Node.js 20+ e PostgreSQL 16 (ou Docker).

### Com Docker

```bash
cp .env.example .env        # preencha POSTGRES_PASSWORD e JWT_SECRET (mín. 32 caracteres)
docker compose up --build -d
docker compose --profile tools run --rm migrate   # aplica as migrações versionadas
```

- Aplicação: http://localhost:3002
- Swagger: http://localhost:3002/api/docs
- Health: http://localhost:3002/health

A porta 5432 do banco fica presa em `127.0.0.1`. O `seed.sql` montado no compose cria dados de demonstração e serve **apenas para desenvolvimento**; remova a linha correspondente em `docker-compose.yml` se o banco guardar dados reais.

### Com Node direto

```bash
npm install                      # na raiz (workspace backend)
cp backend/.env.example backend/.env   # ajuste DATABASE_URL e JWT_SECRET
npm run migrate                  # schema + migrações
npm run seed:superadmin          # lê SUPER_ADMIN_EMAIL/SENHA/NOME do .env
npm run dev                      # http://localhost:3002
```

O backend serve o `frontend/` diretamente. O cadastro público de empresas está desligado (`ALLOW_PUBLIC_REGISTRATION=false`): entre como super admin e use **Nova empresa**.

No Windows, `npm start`/`npm run dev` podem iniciar um PostgreSQL local portátil em `.local/` quando ele existe e o `.env` aponta para `localhost:5432`. Se a porta 3002 estiver ocupada (`EADDRINUSE`), encerre a instância anterior ou use `netstat -ano | findstr :3002`.

## Scripts

Na raiz:

| Comando | Efeito |
|---|---|
| `npm run build` | Copia `frontend/` para `public/` (espelho usado pela Vercel). |
| `npm start` / `npm run dev` | Sobe o backend (o `dev` recarrega ao salvar). |
| `npm test` | Testes Jest do backend. |
| `npm run lint` | ESLint do backend. |
| `npm run migrate` | Aplica `schema.sql` e as migrações pendentes (`backend/sql/migrations`). |
| `npm run seed:superadmin` | Cria o super admin a partir das variáveis do `.env`. |

No `backend/`: `npm run format` (Prettier) e `npm run seed` (dados de demonstração, só em desenvolvimento).

## Testes e qualidade

```bash
npm test                          # testes com banco em memória
cd backend && npm test -- --coverage   # com relatório de cobertura
```

- Os testes unitários e de rota usam um banco em memória (`NODE_ENV=test`).
- Os testes de integração com PostgreSQL só rodam se `TEST_DATABASE_URL` estiver definida; sem ela são ignorados. Use um banco descartável e rode `npm run migrate` apontando `DATABASE_URL` para ele antes.
- Política: toda correção de bug ou regra nova leva teste; o CI precisa passar antes de publicar.
- Cobertura medida hoje: cerca de 72% (linhas/instruções) e 56% (ramos). Piso sugerido para o `coverageThreshold` do Jest: 70% e 54%, para impedir regressão sem travar o dia a dia.

### CI (GitHub Actions)

A cada push/PR para `main`: instalação limpa, ESLint, `npm audit --omit=dev --audit-level=high`, `npm run migrate` em um PostgreSQL 16 de serviço, testes com cobertura e verificação de que `public/` espelha `frontend/`.

## Deploy na Vercel

- A Vercel serve a pasta `public/` (`outputDirectory`) e roda o Express como função em `api/index.js`.
- Antes de publicar, rode `npm run build` e confirme que `public/` está atualizado (o CI falha se divergir).
- Banco PostgreSQL gerenciado (Supabase etc.) com SSL; aplique migrações com `npm run migrate` apontando `DATABASE_URL` para ele.
- Passo a passo: [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md).

## Variáveis de ambiente (somente nomes)

Backend (`backend/.env`, modelo em `backend/.env.example`): `PORT`, `NODE_ENV`, `DATABASE_URL` (ou `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`), `DATABASE_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_POOL_MAX`, `JWT_SECRET`, `JWT_EXPIRA_EM`, `REFRESH_TOKEN_EXPIRA_DIAS`, `FRONTEND_URL`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_SENHA`, `SUPER_ADMIN_NOME`, `ALLOW_PUBLIC_REGISTRATION`, `TEST_DATABASE_URL` (testes).

Raiz (`.env`, usado pelo docker compose; modelo em `.env.example`): `POSTGRES_PASSWORD`, `JWT_SECRET`.

Nunca versione valores reais. Em produção, configure-os no painel do provedor.

## Principais endpoints

| Método | Endpoint | Acesso |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/refresh` | Público |
| POST | `/api/auth/logout` | Autenticado |
| GET/POST | `/api/empresas` | super_admin |
| POST | `/api/auditoria/sessoes` | super_admin (somente leitura, 30 min) |
| GET | `/api/produtos` | Autenticado |
| POST | `/api/produtos`, `/api/produtos/importar` | Gestor/admin |
| POST/GET | `/api/contagens` | Autenticado |
| GET | `/api/atividades` | Admin |
| GET | `/api/relatorios/excel` | Autenticado |
| GET | `/health` | Público |

A lista completa e os esquemas estão no Swagger (`/api/docs`).

## Autor

Desenvolvido por Yan Silva. Licença ainda não definida (não há arquivo `LICENSE` no repositório).
