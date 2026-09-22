# Identidade visual do Sistema de Estoque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a nova identidade no Figma e aplicá-la ao SaaS sem alterar os fluxos e permissões existentes.

**Architecture:** O Figma estabelece logo, tokens, componentes e telas para aprovação visual. No produto, um SVG local fornece a marca, os tokens de `frontend/css/global.css` definem claro/escuro e as folhas atuais recebem a composição por área. `frontend/` continua sendo a fonte; `public/` é gerado por `npm run build`.

**Tech Stack:** Figma; HTML5, CSS e JavaScript vanilla; Jest e ESLint existentes; build Node.js.

**Spec:** `docs/superpowers/specs/2026-09-22-identidade-visual-sistema-estoque-design.md`

## Global Constraints

- Nome do produto: **Sistema de Estoque**; não mudar autenticação, banco, regras de negócio ou permissões.
- Paleta inicial: cobalto `#2457D6`, grafite `#101827`, fundo claro `#F7F9FD`, fundo escuro `#0D1422`, apoio `#E9F0FF`; azul `#67D9F4` apenas em detalhes decorativos/progresso. Ajustar tonalidades quando o contraste exigir.
- Símbolo: “S” vetorial formado por módulos de contagem, legível em 24 px; versões principal, monocromática e invertida.
- Manter Plus Jakarta Sans, os IDs e atributos `data-click`, o sistema de temas e a estrutura `frontend/` → `public/`; não adicionar framework ou dependência de animação.
- Cobrir acesso, funcionário/contagem, back-office e Super Admin em desktop/celular e claro/escuro, com estados normal, ativo, carregando, erro e vazio relevantes.
- Interações em 120–180 ms; mudança de tela/seção em 220–300 ms; respeitar `prefers-reduced-motion: reduce`; foco visível e alvos de toque de pelo menos 44 px.

## Review Focus

1. Senha incorreta e troca obrigatória: erro e campos continuam legíveis e utilizáveis em ambas as cores e no celular — validar nas telas Figma e no navegador na Tarefa 4.
2. Funcionário sem permissão administrativa: a nova navegação não expõe gestão; o botão de iniciar contagem continua dominante — rodar `frontendFuncionario.test.js` e revisar a tela na Tarefa 5.
3. Tabelas com nomes, SKUs e números longos: não cortar conteúdo operacional em 320 px, com rolagem horizontal onde necessário — verificar na Tarefa 6.
4. Dados indisponíveis, carregando e listas vazias: nenhum indicador sugere valor zero ou progresso fictício — verificar no Figma na Tarefa 2 e no navegador na Tarefa 6.
5. Preferência de movimento reduzido, foco de teclado e toque: estados continuam perceptíveis sem deslocamento animado e com alvos de 44 px — verificar na Tarefa 6.

---

## File map

- `frontend/assets/logo-sistema-estoque.svg` — marca única vetorial usada na interface e favicon.
- `frontend/index.html` — referências ao logo, composição semântica das telas; preservar IDs, permissões e ações.
- `frontend/css/global.css` — cores, tipografia, superfícies, sombras, duração e movimento reduzido.
- `frontend/css/components.css` e `frontend/css/layout.css` — botões, cartões, navegação e geometria compartilhada.
- `frontend/css/pages.css` — acesso, funcionário, contagem e telas de consulta.
- `frontend/css/backoffice.css` e `frontend/css/superadmin.css` — áreas administrativas.
- `frontend/css/mobile.css` — adaptações móveis e alvos de toque.
- `backend/tests/frontendBrand.test.js` — contrato significativo da marca e acessibilidade sem acoplar testes a pixels.
- `public/` — saída gerada, sem edições manuais.

### Task 1: Fundação da marca no Figma

**Files:** arquivo Figma novo **Sistema de Estoque — Identidade visual**; páginas `01 Marca` e `02 Fundamentos`.

**Interfaces:** produz logo vetorial, cores, tipografia e espaçamento que as tarefas seguintes usam; consome a especificação aprovada.

- [ ] **Step 1: Criar o arquivo com o plugin Figma ou pela interface do Figma.** Conferir que o arquivo está na conta conectada e guardar o link no registro da tarefa.
- [ ] **Step 2: Desenhar o “S” modular em vetores editáveis.** Preparar símbolos de 24 px e 64 px, versões principal, monocromática e invertida; colocar o nome por extenso ao lado em uma composição horizontal.
- [ ] **Step 3: Definir estilos reutilizáveis.** Cores da seção Global Constraints, superfícies para claro/escuro, hierarquia Plus Jakarta Sans, espaçamento, raios e estados de ação. Avaliar contraste de texto normal (alvo 4,5:1) e de controles/foco (alvo 3:1), corrigindo somente tons necessários.
- [ ] **Step 4: Revisar visualmente.** Conferir leitura do S em 24 px, em fundo claro e escuro, e ausência de texto transformado em imagem. Guardar captura ou link dos quadros e registrar correções feitas.

### Task 2: Componentes e telas no Figma

**Files:** mesmo arquivo Figma; páginas `03 Componentes`, `04 Acesso`, `05 Funcionário e contagem`, `06 Back-office`, `07 Super Admin`.

**Interfaces:** consome os estilos e a marca da Tarefa 1; produz referência visual aprovada para as Tarefas 3–6.

- [ ] **Step 1: Construir componentes editáveis.** Botões primário/secundário/destrutivo, campos, foco/erro, cartões, KPIs, progresso, navegação, tabela e modal. Incluir estados normal, ativo, carregando, vazio e erro apenas onde o componente os usa.
- [ ] **Step 2: Desenhar as quatro áreas.** Cada uma terá desktop e celular, em claro e escuro. Acesso inclui erro e troca obrigatória; funcionário prioriza iniciar contagem; back-office mostra tabela/filtros; Super Admin mostra empresas e indicadores.
- [ ] **Step 3: Revisar conteúdo e operações.** Usar dados fictícios, conferir que contagem cega não revela saldo, que estados sem resposta não mostram zero fictício, e que ações administrativas aparecem apenas nos perfis correspondentes.
- [ ] **Step 4: Fazer revisão visual com o usuário.** Entregar link navegável do arquivo e vistas principais; registrar ajustes pedidos e só iniciar a aplicação no site após a proposta visual estar aceita.

### Task 3: Marca e tokens no produto

**Files:** Create `frontend/assets/logo-sistema-estoque.svg`, `backend/tests/frontendBrand.test.js`; Modify `frontend/index.html`, `frontend/css/global.css`.

**Interfaces:** o HTML usa `/assets/logo-sistema-estoque.svg`; CSS expõe os tokens `--cor-*` já usados pelas outras folhas. Não introduzir nomes novos para substituir a API visual existente.

- [ ] **Step 1: Criar um teste de contrato antes da edição.** Em `backend/tests/frontendBrand.test.js`, ler `frontend/index.html` e o SVG e verificar: título Sistema de Estoque, favicon local, marca com texto alternativo, nenhuma duplicação de IDs e SVG com `viewBox`.

```js
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../frontend');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('marca acessível e favicon local', () => {
  const html = read('index.html');
  const logo = read('assets/logo-sistema-estoque.svg');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  expect(html).toContain('<title>Sistema de Estoque');
  expect(html).toMatch(/rel="icon"[^>]+href="\/assets\/logo-sistema-estoque\.svg"/);
  expect(html).toMatch(/<img[^>]+src="\/assets\/logo-sistema-estoque\.svg"[^>]+alt="[^"]+"/);
  expect(new Set(ids).size).toBe(ids.length);
  expect(logo).toMatch(/<svg[^>]+viewBox=/);
});
```

- [ ] **Step 2: Rodar `npm --prefix backend test -- --runTestsByPath tests/frontendBrand.test.js`.** Esperado: falha pela ausência do SVG/favicon, não por erro de sintaxe.
- [ ] **Step 3: Exportar o logo aprovado do Figma como SVG editável e adicionar `rel="icon"` no `<head>`; substituir o ícone genérico no topo e no acesso por `<img>` com `alt` apropriado.** Usar o mesmo arquivo local; não embutir raster ou recurso remoto.
- [ ] **Step 4: Atualizar em `frontend/css/global.css` os valores dos tokens claros e escuros existentes.** Manter cores semânticas de sucesso, aviso e erro; atualizar foco, gradientes e sombras que ainda contenham o verde anterior. Usar os tons finais conferidos no Figma, não uma substituição global de texto.
- [ ] **Step 5: Reexecutar o teste específico e conferir manualmente o logo em 24 px, no login e na barra superior.** Fazer commit `feat(ui): add modular brand and cobalt tokens`.

### Task 4: Acesso e componentes compartilhados

**Files:** Modify `frontend/index.html`, `frontend/css/components.css`, `frontend/css/layout.css`, `frontend/css/pages.css`; Test `backend/tests/frontendBrand.test.js` e `backend/tests/auth.test.js`.

**Interfaces:** preserva `login-email`, `login-senha`, `login-error`, `btn-login`, `screen-troca-senha-obrigatoria` e seus `data-click`; mantém os componentes CSS compartilhados para as demais áreas.

- [ ] **Step 1: Rodar os testes existentes de login e os contratos de HTML antes da edição.** `npm --prefix backend test -- --runTestsByPath tests/auth.test.js tests/frontendBrand.test.js` deve passar.
- [ ] **Step 2: Aplicar a composição aprovada no Figma ao acesso e à troca de senha.** Editar somente contêineres e classes; não alterar os identificadores e as ações. Ajustar `auth-wrapper`, `auth-card`, topo, botão, campo, foco e mensagem de erro com o sistema de cores aprovado.
- [ ] **Step 3: Conferir no navegador o cenário de credencial incorreta e a tela de troca obrigatória a 320 px e 1280 px, em claro/escuro.** Verificar erro visível, tabulação e formulário sem corte; registrar captura dos quatro contextos.
- [ ] **Step 4: Reexecutar os testes específicos.** Fazer commit `feat(ui): apply identity to access and shared controls`.

### Task 5: Funcionário, back-office e Super Admin

**Files:** Modify `frontend/index.html`, `frontend/css/pages.css`, `frontend/css/backoffice.css`, `frontend/css/superadmin.css`, `frontend/css/layout.css`; Test `backend/tests/frontendFuncionario.test.js`, `backend/tests/frontendSuperadmin.test.js`, `backend/tests/frontendUsuarios.test.js`.

**Interfaces:** preservar `home-funcionario`, `home-administrador`, `home-superadmin`, `screen-backoffice`, `btn-iniciar-contagem-funcionario` e atributos `data-admin-only`/`data-click`.

- [ ] **Step 1: Rodar os testes de interface existentes e anotar o resultado base.** `npm --prefix backend test -- --runTestsByPath tests/frontendFuncionario.test.js tests/frontendSuperadmin.test.js tests/frontendUsuarios.test.js`.
- [ ] **Step 2: Aplicar a assinatura modular e hierarquia do Figma ao início do funcionário e à contagem.** A ação principal continua dominante; KPIs e progresso usam números tabulares; catálogos e histórico continuam secundários, sem saldo para funcionário.
- [ ] **Step 3: Aplicar a mesma marca ao back-office e ao Super Admin.** Refinar cabeçalhos, navegação, KPIs, tabelas, filtros e estados ativos; preservar texto, modais, ações e mensagens de falha existentes.
- [ ] **Step 4: Verificar em navegador com perfis de teste ou simulação local de interface, sem usar dados/credenciais de produção.** Conferir home de funcionário, contagem, gestão e empresas em 320/768/1280 px; nomes e valores longos; estados vazio, carregando e falha sem zero fictício.
- [ ] **Step 5: Reexecutar os três testes específicos e corrigir regressões.** Fazer commit `feat(ui): apply brand across role dashboards`.

### Task 6: Responsividade, movimento e verificação final

**Files:** Modify `frontend/css/global.css`, `frontend/css/mobile.css`, `frontend/css/pages.css`, `frontend/css/backoffice.css`, `frontend/css/superadmin.css`; Test `backend/tests/frontendMobileNav.test.js` e suíte completa.

**Interfaces:** usa `prefers-reduced-motion` do navegador; mantém navegação móvel e temas atuais. A saída final vem de `npm run build`.

- [ ] **Step 1: Ajustar transições conforme a especificação.** Entrada de tela de 220–300 ms, resposta de controles de 120–180 ms, sem pulsação contínua decorativa. Em `@media (prefers-reduced-motion: reduce)`, zerar deslocamento e encurtar transições, mantendo estado ativo e foco visíveis.

```css
@media (prefers-reduced-motion: reduce) {
  .screen.active, .btn, .card, .kpi-card { animation: none; transition-duration: 0.01ms; }
}
```

- [ ] **Step 2: Conferir 320, 768 e 1280 px em ambos os temas.** Verificar rolagem de tabelas, textos longos, alvos de 44 px, navegação por teclado e preferência de movimento reduzido; comparar com o Figma aprovado e corrigir discrepâncias.
- [ ] **Step 3: Rodar `npm test`, `npm run lint` e `npm run build`.** Confirmar saída sem falhas; conferir `public/index.html` e `public/assets/logo-sistema-estoque.svg` após o build.
- [ ] **Step 4: Revisar o diff completo e a interface final antes de publicar.** Fazer commit `feat(ui): finish responsive visual identity`; informar link do Figma, capturas, testes e qualquer limite observado. Registrar a entrega no Segundo Cérebro.
