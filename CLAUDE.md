---
description: Regra Global Obrigatória e Inegociável — Segundo Cérebro Obsidian como Memória de Longo Prazo
globs: ["*"]
---

# 🧠 REGRA GLOBAL E INEGOVIÁVEL: MEMÓRIA DE LONGO PRAZO VIA SEGUNDO CÉREBRO

> Caminho Oficial do Cofre: `C:\Users\yansa\Yan\SEGUNDO CÉREBRO` (o caminho `/home/yan/Yan/SEGUNDO CÉREBRO` é o antigo, de Linux)

Esta regra é de execução **100% automática** e compulsória em **toda e qualquer tarefa**, em qualquer projeto ou repositório. O usuário **nunca precisará solicitar** a leitura ou o registro no Segundo Cérebro.

---

## 1. ANTES DE QUALQUER TAREFA NOVA (Leitura Automática)

Antes de propor planos, escrever código ou executar ações em qualquer projeto:

1. **Ler em camadas, parando quando já for suficiente** (siga o `Protocolo do Agente.md` do cofre; nunca ler o cofre inteiro de uma vez para não estourar contexto):
   - `🏠 ÍNDICE MESTRE.md`
   - Se a tarefa for de um projeto: o cartão dele em `📁 Projetos/<Projeto>/<Projeto>.md`. Índices de categoria (`_índice_decisões.md`, `_índice_padrões.md`, `_índice_stack.md`, `_índice_aprendizados.md`) só quando o tema da tarefa bater; o `_índice_preferências.md` em qualquer tarefa. Diários (`📁 Projetos/<Projeto>/Diário/`) só para histórico, lendo apenas o mês necessário.
2. **Identificar o contexto existente**:
   - Identificar decisões arquiteturais prévias, padrões consolidados, stacks homologadas e preferências aplicáveis à tarefa (mesmo que criadas em outros projetos).
   - Incorporar imediatamente esse contexto sem exigir que o usuário reexplique.
3. **Aviso Mandatório de Conflito**:
   - Se for identificada uma decisão, padrão ou preferência documentada no cofre que **conflite** com a instrução atual recebida, **AVISAR O USUÁRIO ANTES DE EXECUTAR**, explicando o histórico e o conflito, em vez de sobrescrever silenciosamente.

---

## 2. DEPOIS DE QUALQUER ENTREGA (Registro Automático)

Ao concluir qualquer tarefa ou fase de implementação, **registrar imediatamente e sem o usuário pedir**:

1. **Categorias de Registro**:
   - **📐 Padrões (`📐 Padrões/`)**: Padrões técnicos ou de código que funcionaram bem (ou que foram rejeitados, com justificativa).
   - **🎯 Decisões (`🎯 Decisões/`)**: Decisões técnicas/arquiteturais tomadas e o raciocínio por trás delas.
   - **⚙️ Preferências (`⚙️ Preferências/`)**: Estilo, ferramentas, workflow pessoal (atualizando notas antigas se o usuário mudar de ideia).
   - **📁 Projetos (`📁 Projetos/`)**: Registrar a entrega no diário do mês do projeto (`📁 Projetos/<Projeto>/Diário/`); atualizar o cartão só se mudou estado, pendência, decisão em vigor ou as últimas 5 entregas.
   - **🔧 Stack (`🔧 Stack/`)**: Tecnologias, versões e bibliotecas utilizadas.
   - **💡 Aprendizados (`💡 Aprendizados/`)**: Lições e insights técnicos reaproveitáveis em outros projetos.
2. **Diretrizes de Manutenção do Cofre**:
   - **Sem duplicação**: Se a nota do tema já existir, atualizar a nota existente em vez de criar arquivo duplicado; o histórico de um projeto vai no diário do mês, não no cartão.
   - **Links internos Obsidian**: Sempre conectar conceitos, projetos e decisões usando wikilinks bidirecionais (`[[Nome da Nota]]`).
   - **Atualização dos Índices**: Acrescentar uma linha curta (até 160 caracteres) ao topo de `## 🕒 Últimas Atualizações` do `🏠 ÍNDICE MESTRE.md`, mantendo no máximo 10 linhas (descartar a mais antiga), e atualizar o `_índice_<categoria>.md` correspondente; o detalhe vai para o diário.
   - **Padrão Visual e Cores**: Respeitar o frontmatter com `cssclass` (`nota-padrao`, `nota-decisao`, `nota-preferencia`, `nota-projeto`, `nota-stack`, `nota-aprendizado`), tags em formato pill e paleta de cores definida em `⚙️ Preferências/Cores e Estilização Visual do Cofre.md`.

---

## 3. REGRA INEGOCIÁVEL
O usuário nunca precisa pedir: "Consulte o segundo cérebro" ou "Registre no segundo cérebro". Esta rotina é o comportamento operacional nativo e obrigatório em todo ciclo de trabalho.
