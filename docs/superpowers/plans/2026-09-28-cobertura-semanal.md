# Cobertura semanal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar produtores Contados, Parciais e Pendentes conforme cobertura dos produtos ativos na semana.

**Architecture:** Consulta agregada única por tenant com produtos atuais e contagens finalizadas. PostgreSQL calcula limites da semana no fuso definido; o servidor monta totais e pendências sem saldo de estoque. Painel compartilhado pelos perfis operacionais.

**Tech Stack:** PostgreSQL/pg, Express, JavaScript, Jest/Supertest e VM de frontend.

**Spec:** [Especificação](../specs/2026-09-28-pecas-semana-importacao-funcionario-design.md); [plano raiz](2026-09-28-melhorias-operacionais.md). Depende do contrato `tipo`/`contagem_em_pecas` do [plano de peças](2026-09-28-pecas-de-queijo.md).

## Global Constraints

- Segunda 00:00 inclusiva até segunda seguinte exclusiva, `America/Sao_Paulo`.
- Sessão finalizada + quantidade não null + `contado_em` do item no período + modalidade compatível com catálogo atual.
- Zero conta, produto distinto conta uma vez. Denominador: produtos ativos atuais. Produtor vazio não aparece.
- Empresa autenticada, sem estoque de referência ou saldo na resposta.

## Review Focus

1. Domingo UTC que ainda é domingo em São Paulo — tarefa 1.
2. Várias sessões/recontagens e zero físico — tarefa 1.
3. Reclassificação, ativação/desativação e fornecedor renomeado — tarefa 1.
4. Item de semana anterior finalizado agora ou sessão ainda aberta — tarefa 1.
5. Resposta atrasada/erro após finalização e catálogo grande — tarefa 2.

### Tarefa 1: Consulta de cobertura isolada por empresa

**Files:** criar `backend/src/services/coberturaSemanalService.js`, `backend/tests/coberturaSemanal.test.js`, `backend/tests/coberturaSemanalPostgres.test.js`; modificar `backend/src/controllers/contagensController.js`, `backend/src/routes/contagens.js`, `backend/sql/schema.sql`; criar `backend/sql/migrations/008_indice_cobertura_semanal.sql` se plano da consulta demonstrar necessidade do índice descrito abaixo.

**Interfaces:** exportar `obterCoberturaSemanal(empresaId:string, agora:Date=new Date()):Promise<CoberturaSemanal>`; handler `semana(req,res,next):Promise<void>` retorna `{success:true,data:CoberturaSemanal}` em `GET /api/contagens/semana`, antes de `/:id`, com `auth,tenant` já existentes. O relógio `agora` só é injetável no serviço/testes, não pela URL. Resposta:
```ts
type CoberturaSemanal = {
  semana: {inicio:string; fim_exclusivo:string; fuso:'America/Sao_Paulo'};
  resumo: {contados:number; parciais:number; pendentes:number};
  produtores: Array<{fornecedor:string; total_produtos:number; produtos_contados:number;
    status:'contado'|'parcial'|'pendente';
    produtos_pendentes:Array<{id:string; codigo:string; nome:string; tipo:'geral'|'pecas_queijo'}>}>;
};
```

- [ ] Preparar teste de PostgreSQL com guarda `_test` e fixtures próprias de 12 produtos, duas sessões finalizadas cobrindo 8 distintos (um zero, um repetido), sessão aberta cobrindo restantes e tenant B com mesmo SKU. Assertivas:
  ```js
  // 'combina finalizadas sem duplicação e ignora abertas e outra empresa'
  const r = await obterCoberturaSemanal(empresaA, new Date('2026-09-30T12:00:00Z'));
  expect(r.semana).toEqual({inicio:'2026-09-28T03:00:00.000Z',
    fim_exclusivo:'2026-10-05T03:00:00.000Z', fuso:'America/Sao_Paulo'});
  expect(r.produtores[0]).toMatchObject({total_produtos:12, produtos_contados:8, status:'parcial'});
  expect(r.produtores[0].produtos_pendentes).toHaveLength(4);
  expect(r.resumo).toEqual({contados:0, parciais:1, pendentes:0});
  // 'domingo local não começa semana nova'
  const domingo = await obterCoberturaSemanal(empresaA, new Date('2026-10-05T02:59:59Z'));
  expect(domingo.semana.inicio).toBe('2026-09-28T03:00:00.000Z');
  const segunda = await obterCoberturaSemanal(empresaA, new Date('2026-10-05T03:00:00Z'));
  expect(segunda.produtores[0].status).toBe('pendente');
  expect(segunda.produtores[0].produtos_contados).toBe(0);
  // 'reclassificação, catálogo atual e finalização tardia'
  expect(aposMarcarPecas.produtores[0].produtos_contados).toBe(7);
  expect(aposNovoProduto.produtores[0].total_produtos).toBe(13);
  expect(aposDesativarNovo.produtores[0].total_produtos).toBe(12);
  expect(aposRenomear.produtores.some(p => p.fornecedor === 'Nome antigo')).toBe(false);
  expect(finalizacaoTardia.produtores[0].produtos_contados).toBe(0);
  expect(semAtivos).toMatchObject({resumo:{contados:0,parciais:0,pendentes:0},produtores:[]});
  ```
  Adicionar casos nomeados “fecha 12 de 12 e recontagem não aumenta total”, “reclassificação exige modo peças”, “novo/desativado/renomeado usa catálogo atual”, “finalização tardia usa timestamp do item” e “empresa sem ativos retorna resumo zerado”. Fixar bordas exatamente no início/fim, quantidade null e produtor sem ativos. Teste HTTP sem token=401, tenant usa identidade autenticada, sem propriedades de saldo em toda a resposta.
- [ ] Rodar `npm test -- --runTestsByPath tests/coberturaSemanal.test.js tests/coberturaSemanalPostgres.test.js`; observar falhas novas; PostgreSQL habilitado obrigatório para comprovar query/fuso.
- [ ] Implementar serviço e rota. Limites: `date_trunc('week', $2::timestamptz AT TIME ZONE 'America/Sao_Paulo')`, converter início e início + 7 dias de volta para timestamptz com mesmo fuso. CTE catálogo ativo da empresa; EXISTS ou conjunto DISTINCT por `produto_id`, join sessão/fornecedor, ambos tenant e tipo compatível; filtrar `contado_em >= inicio AND contado_em < fim`. Usar produtor atual, não nome antigo no snapshot. Ordenar produtores/produtos por nome, agrupar em memória, derivar estados de `0`, `0<contados<total` e `contados=total`; datas ISO normalizadas. Não query por produtor/item. Medir `EXPLAIN (ANALYZE, BUFFERS)` em catálogo de teste com centenas de produtos; se necessário adicionar índice parcial `(produto_id, contado_em)` onde `quantidade_contada IS NOT NULL`, idempotente e refletido no schema; registrar resultado sem impor índice redundante.
- [ ] Rodar testes acima e todos os testes de contagens; confirmar os estados 0/12, 8/12, 12/12, mudanças do catálogo, fuso e isolamento. Testar segunda execução da migration se criada.
- [ ] Commit: `feat: calcular cobertura semanal de produtores`.

### Tarefa 2: Painel operacional semanal

**Files:** criar `frontend/js/semana.js`, `backend/tests/frontendSemana.test.js`; modificar `frontend/index.html`, `frontend/js/app.js`, `frontend/js/events.js`, `frontend/js/contagens.js`, `frontend/css/pages.css`, `frontend/css/mobile.css`, `backend/tests/frontendFuncionario.test.js`. Build atualiza `public/`.

**Interfaces:** objeto global `Semana` com `carregar():Promise<void>`, `renderizar():void`, `abrirProdutor(fornecedor:string):void`, `invalidar():void`. Tela `screen-semana-contagem`, permitida em `showScreen` ao funcionário e administrador; ações `semana-abrir`, `semana-recarregar`, `semana-produtor`. `Contagens.finalizarSessao()` chama `Semana.invalidar()` somente após sucesso; entrada na tela sempre busca semana atual. Não depende de saldo ou lista administrativa.

- [ ] Testes VM/eventos reais para 8/12, estados mistos, zero produtores, erro e respostas fora de ordem:
  ```js
  // 'mostra estados textuais e abre quatro pendências com modalidade'
  expect(html).toContain('8 de 12');
  expect(html).toContain('Parcial');
  expect(htmlPendencias).toContain('Peças de queijo');
  expect(htmlPendencias).not.toMatch(/estoque de referência|saldo anterior/i);
  // 'falha não parece conclusão e resposta antiga não sobrescreve a nova'
  expect(htmlErro).toContain('Tentar novamente');
  expect(htmlErro).not.toContain('Todos os produtores contados');
  expect(htmlDepoisDasDuasRespostas).toContain('12 de 12');
  expect(context.Semana.invalidar).toHaveBeenCalledTimes(1); // finalização bem-sucedida
  // 'catálogo grande mantém nomes escapados e pendências acessíveis'
  expect(context.Semana.dados.produtores[0].produtos_pendentes).toHaveLength(300);
  expect(htmlPendencias).toContain('&lt;Produtor&gt;');
  ```
- [ ] Rodar `npm test -- --runTestsByPath tests/frontendSemana.test.js tests/frontendFuncionario.test.js`; observar falhas novas.
- [ ] Implementar interfaces, propriedade `Semana.dados:CoberturaSemanal|null`, script carregado antes de `events.js`, cards/resumo com Contado/Parcial/Pendente em texto e ícone, datas exibidas em fuso São Paulo e data final visual domingo (fim exclusivo menos um instante). Expandir pendências escapando nomes/SKUs; não HTML por nome sem escape. Controle de geração de request impede resposta antiga de sobrescrever recente. Loading/vazio/erro/repetir explícitos, `aria-live` e botões acessíveis. Layout adapta nomes longos e 300 produtos sem overflow; não marcar sucesso com falha de API.
- [ ] Rodar testes e build; verificar visualmente tamanhos do plano raiz, temas, teclado, primeira semana vazia e painel atualizado depois de finalizar geral e peças.
- [ ] Commit: `feat: exibir semana de contagem para equipe`.
