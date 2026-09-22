# 🚀 Guia de Deploy na Vercel com Supabase — Sistema de Contagem

Este guia descreve o processo completo para implantar o **Sistema de Contagem** na plataforma **Vercel** utilizando o **Supabase** como banco de dados PostgreSQL em nuvem.

---

## 🏛️ Arquitetura na Vercel + Supabase

- **Frontend Estático:** Os arquivos de `frontend/` (`index.html`, `css/`, `js/`, `previa.html`) são servidos na raiz (`/`) com roteamento SPA e headers de segurança via `vercel.json`.
- **Backend Serverless:** As requisições direcionadas para `/api/*` e `/health` são roteadas para `api/index.js`, que encapsula a aplicação Express.
- **Banco de Dados Supabase:** Instância PostgreSQL gerenciada conectada via Connection Pooler (IPv4) com SSL/TLS automático.

---

## ⚡ Passo 1: Configurar o Projeto no Supabase

1. Acesse o **[Supabase](https://supabase.com/)** e faça login (ou crie uma conta gratuita).
2. Clique em **New Project** (Novo Projeto).
3. Defina:
   - **Name:** `sistema-de-contagem` (ou nome de sua preferência)
   - **Database Password:** Crie uma senha forte e **guarde-a** (será usada na conexão).
   - **Region:** Escolha `São Paulo (sa-east-1)` ou a região mais próxima de você.
4. Clique em **Create new project** e aguarde cerca de 1 minuto até a inicialização ser concluída.

---

## 🔑 Passo 2: Obter a Connection String do Supabase (Atenção ao Pooler)

> 💡 **Dica Crítica (IPv4 vs IPv6):**
> As funções serverless da Vercel necessitam de **IPv4**. O host direto do Supabase (`db.[ref].supabase.co`) na camada gratuita usa IPv6.
> Por isso, **sempre use a string do Connection Pooler**, que suporta IPv4 nativamente e evita estouro de limites de conexão!

1. No painel do seu projeto no Supabase, clique no ícone de engrenagem **Project Settings** (na barra lateral esquerda).
2. Acesse **Database**.
3. Role até a seção **Connection string** e clique na aba **URI**.
4. No seletor de modo, escolha **Session** (porta `5432`) ou **Transaction** (porta `6543`).
5. Copie a URL gerada, que terá o formato:
   ```text
   postgresql://postgres.[PROJECT-REF]:[SUA-SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
6. Substitua `[SUA-SENHA]` pela senha que você definiu ao criar o projeto.

---

## 🗄️ Passo 3: Aplicar o Schema e as Migrações

Use o migrador versionado para bancos novos e existentes. Ele aplica os arquivos de `backend/sql/migrations/` em ordem, registra cada versão em `schema_migrations` e usa um bloqueio do PostgreSQL para impedir duas execuções simultâneas.

Antes de atualizar um banco com dados, faça backup e valide a migração em uma cópia. No terminal local, informe a URL do Supabase e execute:

```powershell
# PowerShell:
$env:DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[SUA-SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
npm run migrate
```

Não execute somente `schema.sql` sobre um banco antigo. As migrações adicionam status e exclusão lógica, identificam a organização da plataforma, criam sessões de auditoria e cortam sessões legadas de forma coordenada. A migração `003_corte_sessoes_legadas.sql` revoga os refresh tokens existentes uma única vez.

---

## 👤 Passo 4: Criar o Super Administrador Inicial

Para criar a conta de Super Admin que gerenciará as empresas na plataforma:

```powershell
# PowerShell:
$env:DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[SUA-SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
$env:SUPER_ADMIN_EMAIL="admin@suaempresa.com"
$env:SUPER_ADMIN_SENHA="SuaSenhaForteSuperSegura123!"
npm run seed:superadmin
```

---

## 🚀 Passo 5: Importar o Projeto na Vercel

1. Acesse o painel da **[Vercel](https://vercel.com/)** e clique em **Add New... > Project**.
2. Conecte sua conta do GitHub e selecione o repositório `yansilva/Sistema-de-contagem-` (ou seu fork).
3. **Configurações do Projeto:**
   - **Framework Preset:** *Other*
   - **Root Directory:** `./` (raiz do repositório)
   - **Build Command:** `npm run build` (ou padrão)
   - **Output Directory:** Deixe vazio (o `vercel.json` orquestra as rotas)
4. Abra a seção **Environment Variables** e adicione:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Sua URL do Supabase Pooler: `postgresql://postgres.[REF]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres` |
| `JWT_SECRET` | Uma chave segura com mais de 32 caracteres (ex: `f8a4c9b2e1d047385960abcedf1234567890abcdef1234567890abcdef123456`) |
| `NODE_ENV` | `production` |
| `ALLOW_PUBLIC_REGISTRATION` | `false` |
| `JWT_EXPIRA_EM` | `15m` |
| `REFRESH_TOKEN_EXPIRA_DIAS` | `30` |
| `APP_PUBLIC_URL` | URL pública HTTPS do projeto, usada futuramente nos links de recuperação |

5. Clique em **Deploy**.

### Implantação coordenada desta evolução

Esta versão muda o contrato de autenticação e deve ser implantada em uma janela curta de manutenção:

1. Faça backup do banco e teste `npm run migrate` em uma cópia recente.
2. Pause operações administrativas durante a atualização.
3. Aplique as migrações e publique backend e frontend da mesma revisão.
4. Avise que todos precisarão entrar novamente. Tokens antigos não possuem a versão de sessão exigida pelo backend novo.
5. Verifique login do Super Admin, listagem de empresas, bloqueio de uma conta de teste autorizada e início/fim de auditoria somente leitura.

Não reverta para uma versão que restaure impersonation ou exclusão física. Se surgir um problema após a migração, aplique uma correção progressiva preservando as novas colunas e os registros de auditoria.

O transporte de e-mail ainda não está configurado. Até que um provedor seja escolhido e validado, o Super Admin pode definir uma senha temporária para um administrador da empresa. Somente a conta escolhida é alterada; suas sessões são encerradas e a troca da senha é obrigatória no próximo acesso. O fluxo por link permanece disponível no backend para futura configuração.

---

## 🔍 Verificação Pós-Deploy

Após a Vercel finalizar o deploy (cerca de 1 minuto):
1. **Health Check:** Acesse `https://seu-app.vercel.app/api/health`
   - Resposta esperada: `{"status":"ok", "database":"connected"}`.
2. **Sistema Web:** Acesse `https://seu-app.vercel.app/`
   - O login do **Sistema de Estoque** carregará instantaneamente.
3. **Acesso:** Faça login com o email e senha do Super Admin criados no Passo 4.
4. **Cadastrar Empresa:** No menu superior, clique em **Nova empresa** para cadastrar a primeira empresa cliente e seu administrador.

---

## 🩺 Solução de Problemas no Supabase

- **Erro `getaddrinfo ENOTFOUND`:** Você está usando a URL direta IPv6 (`db.[ref].supabase.co`). Mude para o **Connection Pooler** (`aws-0-[regiao].pooler.supabase.com:5432`).
- **Erro `self-signed certificate in certificate chain`:** O driver `backend/src/config/db.js` já está configurado com `ssl: { rejectUnauthorized: false }` para aceitar a terminação TLS do Supabase automaticamente.
- **Erro `password authentication failed`:** Certifique-se de que substituiu `[YOUR-PASSWORD]` pela senha real do usuário `postgres` definida na criação do projeto.
