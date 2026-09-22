# Sistema de Estoque — identidade visual “Precisão em movimento”

Data: 2026-09-22. Estado: proposta visual aprovada em conversa; implementação e arquivo Figma ainda não iniciados.

## Objetivo

Dar ao SaaS uma marca mais reconhecível e contemporânea, mantendo o nome **Sistema de Estoque**. A identidade deve servir aos três públicos existentes: funcionário que conta produtos, administrador da empresa e Super Admin. O usuário escolheu cobalto e grafite, um símbolo de precisão e uma presença mais ousada no logo, nas formas, no layout e no movimento. O uso diário precisa continuar claro e rápido.

## Base existente

O produto é uma SPA em HTML, CSS e JavaScript sem framework. `frontend/` é a fonte e `public/` é gerado pelo build. `frontend/css/global.css` contém tokens, temas claro e escuro e a fonte Plus Jakarta Sans; `pages.css`, `backoffice.css`, `superadmin.css` e `mobile.css` tratam das telas. A identidade publicada usa verde esmeralda, apesar de registros anteriores no Segundo Cérebro para azul suave e índigo. Esta proposta aprovada substitui essas escolhas de cor para o trabalho novo.

## Direção de marca

- **Logo:** símbolo vetorial próprio em forma de “S”, construído com módulos alinhados que lembram marcas de contagem. Deve permanecer legível como favicon e avatar de 24 px e funcionar ao lado do nome completo no cabeçalho e na tela de acesso. Criar versões principal, monocromática e invertida.
- **Geometria:** o espaçamento entre módulos do símbolo define um ritmo visual reutilizado nos indicadores de seção, barras de progresso e blocos de destaque. Usar esse motivo em poucos pontos de alto valor, preservando a leitura de tabelas, formulários e números.
- **Paleta inicial:** cobalto `#2457D6` como ação e reconhecimento; grafite `#101827` como estrutura; fundo claro `#F7F9FD`; fundo escuro `#0D1422`; azul gelo `#E9F0FF` em superfícies de apoio. Um azul luminoso `#67D9F4` pode acentuar ilustrações e progresso, sem substituir a cor de textos ou ações principais. Sucesso, aviso e erro mantêm significados próprios. Ajustar somente os valores necessários para cumprir contraste após avaliação no Figma e no navegador.
- **Tipografia:** manter Plus Jakarta Sans e tornar mais distinta a hierarquia de título, dado e legenda. Usar números tabulares onde totais e contagens precisam ser comparados. Não adicionar outra fonte nesta fase.
- **Tom visual:** marca assertiva, superfícies sóbrias, contornos definidos, espaços generosos nas telas iniciais e densidade controlada nas áreas de operação.

## Aplicação por tela

1. **Acesso:** composição com logo forte e painel de marca no desktop; formulário em primeiro plano e ordem simples no celular. Mensagens de erro e troca obrigatória de senha permanecem visíveis.
2. **Funcionário e contagem:** início com ação de nova contagem dominante, progresso de sessão evidente e catálogo/histórico como escolhas secundárias. A contagem cega mantém seus dados e permissões atuais. Cartões e transições devem reforçar o estado da tarefa.
3. **Back-office:** cabeçalho de seção e números mais fortes; navegação e controles com estado ativo claro. Tabelas, filtros, formulários, importações e alertas preservam sua capacidade operacional e legibilidade.
4. **Super Admin:** painel de empresas e indicadores com a mesma assinatura modular; ações administrativas importantes continuam explícitas. Auditoria e estados de acesso permanecem distinguíveis visualmente.

Cada tela será desenhada em tema claro e escuro. Haverá ao menos uma versão móvel por tela, cobrindo o fluxo principal e a navegação correspondente.

## Movimento e interação

Entradas de tela e mudança de seção podem usar deslocamento e opacidade por cerca de 220–300 ms. Botões e cartões acionáveis respondem em 120–180 ms. Progresso de contagem pode animar quando o valor muda; números não devem simular progresso quando a API ainda não respondeu. Evitar movimento contínuo. `prefers-reduced-motion: reduce` remove deslocamentos e reduz transições sem esconder mudanças de estado. Foco visível, teclado e alvos de toque de pelo menos 44 px continuam obrigatórios.

## Entrega no Figma

Criar um arquivo novo chamado **Sistema de Estoque — Identidade visual** com páginas para: fundamento da marca; logo e variações; cores, tipografia e componentes; acesso; funcionário/contagem; Back-office; Super Admin. Os elementos devem ser editáveis, com nomes claros e estilos/tokens reutilizáveis. A proposta visual será revisada antes de ser aplicada ao produto.

O arquivo terá, no mínimo, os quatro fluxos principais em desktop e celular e os dois temas. Apresentar o logo em tamanho de aplicação e favicon. Mostrar estados normais, ativos, carregando, erro e vazio dos componentes que aparecem nesses fluxos. Não representar dados de produção nem credenciais no design.

## Implementação posterior

Após a revisão visual, gerar o logo como SVG do próprio repositório, atualizar tokens em `frontend/css/global.css` e aplicar os componentes nas folhas de estilo existentes. Ajustar HTML e JavaScript somente quando a nova composição ou transição exigir, preservando IDs, eventos delegados, rotas, regras de acesso e respostas de erro. Gerar `public/` pelo build. Não adicionar framework ou dependência de animação.

## Verificação e aceite

- Logo reconhecível em 24 px e no cabeçalho; nome Sistema de Estoque preservado.
- Quatro áreas coerentes em claro, escuro e celular; texto e controles com contraste adequado, inclusive em estados de foco, erro e desabilitado.
- Navegação, contagem, importação, gestão de usuários e empresas mantêm seus fluxos existentes.
- Movimento respeita preferência por redução e não atrasa uma operação repetida.
- Suíte completa do projeto, lint, build e inspeção visual em larguras móveis e desktop antes de publicar.

## Limites

Esta fase não altera autenticação, banco, regras de negócio ou permissões. Também não muda o nome do produto, cria nova funcionalidade ou redefine a experiência de e-mail. O Figma é a referência visual a ser aprovada antes da implementação no site.
