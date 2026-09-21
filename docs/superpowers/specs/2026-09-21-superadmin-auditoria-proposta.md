# Super Admin — auditoria e proposta de evolução

Data: 2026-09-21. Base examinada: commit `649e710`, árvore inicialmente limpa.
Status: proposta aprovada pelo usuário em 2026-09-21 (“pode prosseguir”); [plano detalhado disponível para revisão](../plans/2026-09-21-superadmin-seguro.md). Nenhuma alteração de produto ou banco aplicada.

## 1. Objetivo e limites

Evoluir o console existente para administrar empresas e investigar problemas com isolamento entre tenants, identidade real do operador, acesso de suporte somente leitura e trilha de auditoria confiável. Preservar contagem cega, permissões dos funcionários e componentes existentes.

O pedido atual prevalece sobre o design de 2026-09-18, que previa impersonation e exclusão permanente. Esses comportamentos já foram parcialmente implementados; não são funcionalidades ausentes a recriar.

O usuário informou que ainda precisa definir um serviço de e-mail. A entrega real de recuperação de senha depende dessa configuração. Não há provedor de autenticação externo identificado no código.

## 2. Arquitetura existente

| Camada | Implementação examinada |
|---|---|
| Frontend | SPA HTML, CSS e JavaScript sem framework em `frontend/`; `public/` é cópia gerada pelo build. |
| Navegação | `app.js`, telas por ID e eventos delegados em `events.js`. |
| Componentes | Botões, campos, badges, tabelas, modais, notificações, paginação, gaveta de empresa, barra de suporte. |
| Identidade visual | Tokens globais em `global.css`, temas claro/escuro, Plus Jakarta Sans e Tabler Icons; paleta atual verde esmeralda. Há estilos específicos do console em `superadmin.css`. |
| Backend | Node.js, Express 4, rotas/controllers, Zod, middleware de erros, Helmet e limites de requisições. |
| Banco | PostgreSQL via `pg`; schema SQL e migrações; mock em memória exclusivo de testes. |
| Autenticação | bcrypt, access JWT com duração padrão de 15 minutos, refresh opaco com hash SHA-256 e rotação. |
| Permissões | `super_admin`, `administrador`, `funcionario` e aliases legados `admin`/`gestor`; papel e empresa consultados no banco a cada requisição autenticada. |
| Tenancy | `empresa_id` nas entidades principais e filtros na aplicação; tabelas de itens vinculadas às contagens. Não foram encontradas políticas RLS no schema/migrações versionados. |
| Auditoria | `audit_logs`, `auditContext`, `auditService`, serializador, consulta filtrada/paginada e exportação CSV. |
| Publicação | Entrada Express serverless em `api/index.js`, configuração Vercel, Docker e execução local. |
| Testes | Jest, Supertest, banco simulado e testes de integração entre HTML e eventos. |

O Super Admin também pertence a uma empresa. O provisionamento restrito já cria empresa, administrador e evento de auditoria numa transação. Contagens, produtos, usuários, importações e relatórios têm módulos próprios; reaproveitar consultas e serializadores compatíveis, sem relaxar suas restrições.

O grafo Graphify existente foi usado como mapa. O executável e seu Python referenciado estavam indisponíveis; foi realizada leitura/travessia local do JSON com Node. O grafo é anterior às mudanças recentes do console e não prova seu comportamento atual. As conclusões abaixo vêm do código atual.

## 3. O que existe versus o que falta

| Requisito | Já existe | Trabalho necessário |
|---|---|---|
| Dashboard | Empresas por plano, usuários ativos, produtos e contagens | Corrigir definições; administradores, total de usuários, períodos recentes e atividade; agregação no SQL. |
| Empresas | Cadastro, tabela, busca local, filtros por plano e edição | Corrigir destino de renderização; admin responsável, última atividade, ordenação e paginação no servidor. |
| Detalhes | Gaveta com dados, usuários e totais de produtos/contagens | Página de empresa com visão geral, usuários, histórico de contagens, sessões de auditoria e logs. |
| Reset | Senha temporária definida pelo administrador dentro de seu tenant | Fluxo por link para admins de outra empresa, entrega por e-mail, uso único, expiração, revogação e auditoria transacional. |
| Suporte | Token como usuário alvo e banner com saída | Substituir por sessão de auditoria somente leitura mantendo identidade do Super Admin; início, fim e expiração persistidos. |
| Status | `plano` com ativo/trial/suspenso; API e botão | Separar acesso de plano, confirmar ação, motivo opcional, transação com log e bloquear login/refresh de empresas inativas. |
| Exclusão | Exclusão física em cascata e confirmação visual por nome | Adotar exclusão lógica, confirmação também na API, preservar vínculos e dados; retirar exclusão física desse fluxo. |
| Logs | Tabela, filtros, detalhes e CSV | Corrigir ligação da tela global, sanitização recursiva, autoria de suporte e empresa afetada nos eventos de plataforma/segurança. |
| UX | Temas, menu lateral, KPIs, filtros e gaveta | Consistência de tokens, estados de erro reais, foco/teclado, tabelas responsivas e confirmações. |

## 4. Achados prioritários

1. **Suporte perde autoria e permite escrita.** `empresasController.js` envia `impersonated_by`, mas `config/jwt.js:33` só aceita `id` e `empresa_id`. O middleware autentica o usuário alvo normalmente. Não há bloqueio somente leitura. A saída em `frontend/js/empresas.js:612` apenas restaura valores locais, sem evento de fim nem revogação no servidor. O refresh original continua armazenado, criando possibilidade de retorno à identidade da plataforma sem atualização coerente da tela.
2. **Exclusão incompatível com a integridade dos logs.** `empresasController.js:474` torna `audit_logs.empresa_id` nulo sem mudar `escopo`. O schema exige empresa não nula no escopo empresa. Assim, uma empresa com esses logs provoca violação de constraint no PostgreSQL. O mock não reproduz essa constraint. A API também não exige o nome digitado na confirmação.
3. **Mudanças administrativas e logs não são atômicos.** Atualização cadastral e status gravam antes do evento, sem transação. A falha do log pode deixar a alteração realizada com resposta de erro. O reset existente responde antes de tentar registrar auditoria.
4. **Sanitização não recursiva.** `auditService.js:24` filtra chaves apenas no primeiro nível. Verificação isolada com um segredo sintético dentro de objeto confirmou que ele é preservado.
5. **Telas com destinos incorretos.** `Empresas.carregar/renderizar` sempre prefere `super-empresas-lista`, mesmo na aba Empresas, cujo destino é `empresas-lista`. A aba global contém `atividades-lista`, mas `Atividades` escreve em `lista-atividades`, no backoffice. Reaproveitar os módulos passando o contexto de renderização.
6. **Indicadores enganosos.** O cartão “Contagens Concluídas” recebe todas as contagens. Falha da API de métricas vira zero contagens no fallback. A consulta de métricas carrega IDs de todas as linhas para contar em JavaScript.
7. **Suspensão incompleta.** O middleware impede requisições autenticadas da empresa suspensa, mas login e refresh ainda emitem tokens. A troca rápida não confirma a ação. A edição também permite alterar `plano`, devendo seguir as mesmas regras. A própria empresa da plataforma pode ser suspensa, impedindo acesso do operador.
8. **Empresa afetada pouco rastreável.** O serviço força `empresa_id = NULL` nos escopos plataforma/segurança; filtrar apenas por esse campo não recupera os eventos administrativos da empresa. Não preencher histórico inventando vínculos quando não houver evidência.
9. **Validação e saída de erros.** Rotas recentes de empresas não usam os schemas de UUID/corpo existentes. A entrada serverless devolve mensagem e stack do erro de inicialização ao cliente; remover detalhes internos da resposta.

As verificações não identificam exploração real nem provam falhas no banco implantado: o schema implantado não foi inspecionado e não houve operação destrutiva em ambiente real.

## 5. Alternativas de arquitetura

| Alternativa | Vantagem | Custo/risco |
|---|---|---|
| **A — Console atual com consultas de suporte explícitas (recomendada)** | Mantém identidade do operador; permite negar escrita por construção e reaproveitar componentes | Exige endpoints de leitura de suporte e sessão persistida. |
| B — Contexto de suporte nos endpoints operacionais existentes | Reutiliza mais rotas | Obriga auditar todos os handlers, exportações e uploads para evitar autorização implícita de escrita. |
| C — Nova aplicação administrativa e migração de autenticação | Separação maior | Duplica infraestrutura e introduz migração desnecessária para o objetivo atual. |

Escolha proposta: A. Manter monólito, autenticação própria e banco existente; mudanças pequenas e verificáveis. Não introduzir framework frontend, provedor de identidade ou RLS como condição desta entrega. RLS pode ser avaliada separadamente, considerando usuário de banco e contexto transacional do pool, sem alegar que existe hoje.

## 6. Modelo de dados proposto

Migrações aditivas e compatíveis com os dados atuais:

- `empresas.status`: ativa/inativa, independente de plano. Backfill: suspenso → inativa; ativo/trial → ativa. Empresas trial expiradas continuam sujeitas à regra de expiração existente. Campo de plano deixa de controlar suspensão após a transição compatível.
- `empresas.excluida_em`, `excluida_por`, `motivo_exclusao`: exclusão lógica. Preservar email único e registros relacionados; não liberar identificadores de empresas excluídas silenciosamente.
- `sessoes_auditoria`: UUID, Super Admin responsável, empresa alvo, motivo opcional, início, expiração, encerramento e motivo de encerramento. Índices por ator e por empresa/data.
- `audit_logs.empresa_afetada_id`: referência independente para eventos de plataforma/segurança, mantendo os escopos existentes. Índice por empresa/data. Backfill apenas quando o vínculo puder ser obtido com certeza; novos eventos sempre o informam quando aplicável.
- `password_reset_tokens`: usuário alvo, solicitante, hash do token, expiração, consumo e estado de entrega. Token aleatório somente no link enviado; não armazenar texto puro, incluir no retorno administrativo ou em logs.
- `usuarios.versao_sessao`: invalidar access tokens anteriores após reset/troca sensível, além de revogar refresh tokens. JWTs novos incluem a versão; política explícita para tokens legados durante a implantação.

Não criar outra tabela de logs, de empresas ou de usuários. Autor/data/motivo de mudanças de status ficam na trilha existente. A ordem das migrações deve respeitar que o migrador reaplica o schema e os arquivos SQL; validar idempotência e banco com dados anteriores.

## 7. Permissões e modo auditoria

- Toda gestão continua exigindo Super Admin ativo, verificado no servidor. Proteger a organização da plataforma contra autoexclusão e bloqueio acidental.
- Criar sessão por endpoint específico; registrar criação e evento de início na mesma transação. Não gerar JWT de usuário alvo nem substituir access/refresh tokens da plataforma.
- Endpoints de leitura sob `/api/auditoria/sessoes/:sessaoId/...`: validar ator, papel atual, vínculo da sessão, tenant, prazo e encerramento em cada requisição. O ID de sessão não é autorização por si só.
- Permitir somente consultas de resumo, usuários sem segredos, produtos, contagens e logs da empresa fixada na sessão. Nenhum tenant livre vindo do corpo substitui esse vínculo. Consultas por ID também incluem filtro de empresa.
- Somente iniciar/encerrar sessão modifica o controle administrativo; endpoints de dados de suporte não oferecem operações de escrita. Não oferecer exportação de dados de suporte nesta primeira versão.
- Expiração proposta: 30 minutos. Encerramento explícito é idempotente e auditado. Após expirar, negar acesso imediatamente mesmo antes de registrar o evento de expiração; registrar esse encerramento ao reconciliar sessões em consultas/início, sem depender de navegador aberto. Não chamar expiração de logout explícito.
- A empresa inativa permanece acessível ao console e à auditoria da plataforma. Empresas excluídas ficam fora do modo operacional; metadados e logs administrativos continuam consultáveis.
- Bloquear entrada, renovação e operações normais de empresas inativas/excluídas. Reativação não deve ressuscitar refresh tokens revogados.
- Desativar o endpoint antigo de impersonation e invalidar tokens legados num corte controlado de sessões, pois eles não carregam marcador que permita distingui-los de tokens normais. Planejar novo login para usuários afetados no momento da implantação, sem alterar segredos agora.

## 8. Reset de senha e exclusão

### Reset

O Super Admin escolhe um administrador ativo da empresa e confirma o envio ao email já cadastrado. O servidor verifica vínculo e papel, aplica limite de solicitações e registra a solicitação. O usuário define sua senha numa tela de recuperação usando token opaco, com validade proposta de 30 minutos e consumo único atômico. Nova solicitação invalida as anteriores. Após o consumo, revogar refresh tokens e incrementar a versão de sessão na mesma transação da senha e auditoria.

O transporte de e-mail precisa ser definido pelo usuário; não fingir envio quando ausente. Serviço sem configuração deve devolver indisponibilidade explícita. Distinguir solicitação, aceitação pelo serviço de envio e falha; aceitação não comprova recebimento. O link usa origem configurada e confiável, não o header Host da requisição. Não consumir token em GET de pré-visualização de email. Não registrar URLs com tokens, senha ou respostas brutas do serviço.

### Exclusão

Usar exclusão lógica com nome exato confirmado tanto na interface quanto no servidor. Transação bloqueia a empresa, verifica estado/nome, marca exclusão, revoga sessões e registra o evento. Registrar tentativas negadas com metadados mínimos. Preservar dados e vínculos de auditoria. A empresa não aparece na operação normal; disponibilizar filtro administrativo de excluídas.

Remoção física não será disponibilizada nesta etapa. Uma futura purga requer estratégia separada de retenção, backup, tratamento de dependências e confirmação específica. A solicitação atual autoriza projetar esse caminho, não executar exclusão de qualquer empresa existente.

## 9. UX/UI proposta

Preservar tokens esmeralda atuais, tipografia, ícones e ambos os temas. As notas antigas citam azul/índigo; não reverter o código atual com base nessas notas. Evitar cores hardcoded e um segundo design system.

- **Dashboard:** empresas cadastradas, ativas/inativas, usuários e administradores; contagens finalizadas totais e nos últimos sete dias. Listas curtas de empresas novas e atividades recentes. Contagens abertas mostradas separadamente se úteis. Excluir empresas técnicas da plataforma dos indicadores de clientes usando classificação explícita, nunca nome/email. Definir essa classificação na migração antes de alterar os totais.
- **Empresas:** nome, administrador principal (primeiro admin ativo por criação, com indicação de admins adicionais), quantidade de usuários, status, criação, última atividade registrada e ações. Busca por nome/email; status; ordenação permitida; paginação de 20 com limite máximo de 100.
- **Detalhes:** página própria com voltar à lista e empresa identificada; abas Visão Geral, Usuários, Contagens, Auditoria e Logs. Auditoria lista sessões de suporte; Logs lista eventos. Gaveta existente pode continuar como resumo rápido, sem duplicar gestão completa.
- **Auditoria:** seleção da empresa e início; banner fixo “Modo auditoria · Somente leitura · Nome da empresa”, prazo e botão “Encerrar auditoria”. Navegação exclusiva de consultas dentro desse contexto; ações administrativas ficam fora dele.
- **Logs:** reutilizar Atividades com contexto/container explícitos, filtros por empresa, ação, período e resultado. Diferenciar erro de carregamento de lista vazia.
- **Configurações:** apenas opções reais da conta e estado disponível do envio de email; não construir telas vazias nem exibir credenciais.
- **Confirmações:** modal de status com impacto, nome da empresa e motivo opcional; exclusão lógica com nome digitado e explicação da retenção; reset com destinatário e confirmação.
- **Acessibilidade:** foco inicial e devolvido ao acionador, Escape, foco contido nos diálogos, nomes acessíveis e navegação por teclado; estados anunciados e movimento reduzido. No celular, ações e identificação da empresa permanecem acessíveis.

Métricas indisponíveis devem mostrar erro/repetir, nunca zero inventado. “Última atividade” significa último evento registrado, não presença online. Sem dados suficientes, mostrar “Sem atividade registrada”. Gráficos só após existir série temporal útil; nenhum gráfico decorativo nesta etapa. Figma é opcional, sem necessidade de criar projeto externo para esta proposta.

## 10. Ordem incremental recomendada

1. **Fundação de segurança:** testes que reproduzam falhas; sanitização recursiva, schemas de entrada, atomicidade administrativa e erros sem stack pública. Testar constraints em PostgreSQL isolado.
2. **Ciclo de vida:** migração de status/exclusão lógica e empresa afetada; autenticação coerente em login/refresh/API; confirmação no servidor; proteção da plataforma; testes de rollback e concorrência.
3. **Auditoria somente leitura:** sessão persistida, consultas isoladas, eventos de início/fim/expiração; retirar impersonation e definir corte dos tokens antigos. Validar acesso negado para outro operador, outra empresa e sessão encerrada.
4. **Consulta administrativa:** agregações SQL, métricas com definições explícitas, paginação/ordenação, admins e última atividade, detalhes/histórico. Reutilizar módulos de domínio.
5. **Interface:** corrigir containers; implementar telas e estados propostos com tokens atuais; confirmar ações e testar temas, teclado e dispositivos estreitos. Gerar `public/` pelo build.
6. **Recuperação:** após definição do transporte, implementar envio, consumo único, expiração, limites, revogação e rastreabilidade; testar falhas de entrega sem expor segredos.
7. **Revisão final:** suíte completa, lint, integração PostgreSQL, testes de isolamento e suporte, verificação visual e atualização de documentação/memória. Não publicar nem migrar banco operacional como efeito da revisão.

Cada etapa termina com validação específica; execução detalhada será registrada no plano após revisão desta proposta. Implementação não deve seguir o plano de 2026-09-18 sem revisá-lo, pois suas premissas de suporte/exclusão conflitam com o objetivo atual.

## 11. Evidência e critérios de aceite

Nesta auditoria: 120 testes aprovados em 18 suítes; lint com zero erros e 12 avisos preexistentes. Verificações isoladas confirmaram descarte de `impersonated_by` e sanitização rasa. Não foram executadas migrações, testes destrutivos no PostgreSQL operacional, envio real de email ou verificação visual em navegador autenticado.

Antes da entrega de produto, demonstrar: funcionário/admin sem acesso à gestão da plataforma; consultas de suporte sem leitura de outro tenant ou escrita; início/fim/expiração auditados com ator real; inativação bloqueando sessões; exclusão preservando dados/logs e exigindo confirmação no servidor; reset sem segredo em API/logs e sem reutilização; falha de log revertendo ação; cards e listagens consistentes com SQL; estados acessíveis nas duas paletas e em telas pequenas.
