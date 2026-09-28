# Importação pelo funcionário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ao funcionário importar PDF Tiny/Olist e confirmar atualização de SKUs existentes da própria empresa.

**Architecture:** Ampliar somente permissão das três rotas de estoque, usando autenticação e tenant atuais. Serializar prévia por papel no servidor, mantendo saldo anterior privado. Mover a área existente de importação para uma tela operacional compartilhada, sem duplicar upload/IDs.

**Tech Stack:** Express/pg, Multer 10 MB, pdf-parse existente, Zod, JavaScript, Jest/Supertest.

**Spec:** [Especificação](../specs/2026-09-28-pecas-semana-importacao-funcionario-design.md); [plano raiz](2026-09-28-melhorias-operacionais.md).

## Global Constraints

- PDF não cadastra produtos, não arredonda saldo fracionário silenciosamente nem muda classificação.
- Somente confirmação grava; atualização de saldo não modifica snapshot existente.
- Funcionário vê saldo recebido do PDF, sem `estoque_anterior`/`diferenca_atualizacao`.
- Não liberar back-office, catálogo editável, usuários ou empresa diferente.
- Histórico/auditoria conservam responsável, empresa, arquivo e resultado efetivo.

## Review Focus

1. Mesmo SKU em duas empresas ou SKU desconhecido/inativo — tarefa 1.
2. Body com empresa/papel/saldo anterior forjados não muda autorização — tarefa 1.
3. PDF inválido, maior que 10 MB, duplicado/fracionário ou sem SKU — tarefa 1.
4. Erro durante confirmação faz rollback e não anuncia sucesso — tarefas 1 e 2.
5. Troca de perfil/tela, seleção repetida e envio por arrastar não criam IDs ou prévia obsoleta — tarefa 2.

### Tarefa 1: Permissão limitada e prévia por perfil

**Files:** modificar `backend/src/routes/estoque.js`, `backend/src/controllers/estoqueController.js`; criar `backend/src/serializers/estoqueSerializer.js`; estender `backend/tests/stockImport.test.js`, `backend/tests/funcionarioAccess.test.js`, `backend/tests/multitenancy.test.js` e, após peças, `backend/tests/pecasPostgres.test.js` para imutabilidade de referência/classificação.

**Interfaces:** rotas `/api/estoque/upload-pdf`, `/confirmar-atualizacao`, `/historico` continuam com mesmos contratos; substituir `gestor` global por `auth`, `tenant`, `requireRole('funcionario','administrador','gestor','admin')`. Superadmin de plataforma permanece em suas rotas próprias; não importar em nome de outra empresa. `serializePreviaEstoque(previa:object,usuario:object):object` exportado em novo serializer, sem mutar prévia original. Funcionário recebe whitelist de item `{codigo,nome,fornecedor,estoque_novo}`; administrador recebe campos existentes incluindo saldo anterior/delta. Metadados de arquivo, totais e listas de pendências existentes preservados.

- [ ] Escrever testes Supertest com JWT e produtos das duas empresas, PDF/mock parser conforme `stockImport.test.js`, e teste unitário da prévia:
  ```js
  // 'funcionário envia PDF e confirma SKUs próprios sem campos administrativos'
  expect(uploadFuncionario.status).toBe(200);
  expect(uploadFuncionario.body.data.produtos_para_atualizar[0]).toEqual({
    codigo:'SKU-1', nome:'Produto', fornecedor:'Produtor', estoque_novo:8});
  expect(confirmacaoFuncionario.body.data.produtos_atualizados).toBe(1);
  expect(edicaoCatalogoFuncionario.status).toBe(403);
  expect(previaAdmin.produtos_para_atualizar[0].estoque_anterior).toBe(17);
  // 'SKU desconhecido não insere, inativo não atualiza, snapshot não muda'
  expect(skuDesconhecidoCriado).toBe(false);
  expect(produtoInativoDepois.estoque_atual).toBe(produtoInativoAntes.estoque_atual);
  expect(itemDaSessaoDepois.estoque_referencia).toBe(17);
  expect(produtoDepois.contagem_em_pecas).toBe(produtoAntes.contagem_em_pecas);
  // 'falha de gravação reverte atualização e não grava sucesso'
  expect(resErro.status).toBe(500);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(resErro.body.success).toBe(false);
  ```
  Casos adicionais: sem token, funcionário inativo/tenant inativo, superadmin de plataforma, body tentando empresa B, prévia sem writes, cancelamento, payload fracionário na confirmação=400; parsing duplicado/semSKU/fracionário nas pendências; upload grande/malformado sem atualização; auditoria/registro usa ator autenticado. Ajustar os testes que negavam todas as rotas de estoque, preservando as negativas de catálogo/usuários.
- [ ] Rodar `npm test -- --runTestsByPath tests/stockImport.test.js tests/funcionarioAccess.test.js tests/multitenancy.test.js tests/pdfStockWorker.test.js`; observar falhas novas de permissão/serialização.
- [ ] Implementar middleware e `serializePreviaEstoque`, chamando-o no `uploadPdf(req,res,next):Promise<void>`. Manter parser e confirmação por SKU ativo/tenant com transação e auditoria; garantir ator autenticado em `usuario_id`, `enviado_por`/`confirmado_por` onde compatível com histórico atual, sem assumir envio/confirmador diferente no protocolo stateless. Nunca atualizar flag, snapshot ou catálogo por PDF. Na confirmação, zero produtos realmente atualizados não pode ser anunciado como sucesso: rollback e 400 `SEM_ATUALIZACOES`; preservar contagens efetivas no histórico. Não confiar em tenant/papel ou saldo anterior fornecidos pelo body. Preservar tratamento de upload do servidor.
- [ ] Rodar os testes acima e o teste PostgreSQL de snapshots/classificação com URL isolada; confirmar API funcionário, negativas administrativas e resultados efetivos. Revisar segurança do upload e tenant antes de integrar.
- [ ] Commit: `feat: permitir importacao de estoque por funcionario`.

### Tarefa 2: Tela compartilhada e feedback de importação

**Files:** modificar `frontend/index.html`, `frontend/js/app.js`, `frontend/js/events.js`, `frontend/js/stock-import.js`, `frontend/js/auth.js`, `frontend/css/pages.css`, `frontend/css/mobile.css`, `backend/tests/frontendStockImport.test.js`, `backend/tests/frontendFuncionario.test.js`. Build atualiza `public/`.

**Interfaces:** `screen-importar-estoque` compartilhada; `StockImport.abrir():void` navega e carrega histórico existente. `showScreen` permite apenas esta nova tela ao funcionário, mantendo back-office bloqueado. Acesso operacional nos dois perfis e link do antigo menu administrativo apontam para a mesma tela. `renderizarPrevia():void` mantém SKU/nome/produtor/saldo PDF e inclui antigo/delta apenas se `Auth.isAdmin()`; backend já garante ausência no funcionário. Ações existentes de upload/confirmar/cancelar/drop continuam; nova `estoque-abrir`.

- [ ] Estender testes VM de importação e navegação/eventos reais:
  ```js
  // 'funcionário abre importação mas não administração'
  expect(telaImportacao.classList.contains('active')).toBe(true);
  expect(telaBackoffice.classList.contains('active')).toBe(false);
  // 'preview operacional não exibe colunas administrativas'
  expect(htmlFuncionario).toContain('Novo Estoque (PDF)');
  expect(htmlFuncionario).not.toMatch(/Estoque Anterior|Variação|NaN/);
  expect(htmlAdmin).toContain('Estoque Anterior');
  // 'upload compartilhado tem IDs únicos, arquivo pode ser selecionado novamente'
  expect((html.match(/id="stock-upload-area"/g) || []).length).toBe(1);
  expect((html.match(/id="painel-previa-estoque"/g) || []).length).toBe(1);
  expect(inputArquivo.value).toBe('');
  expect(statusErro.textContent).toContain('Não foi possível');
  expect(statusConfirmacao.textContent).toContain('Estoque atualizado');
  // 'troca de identidade limpa prévia e confirmar duas vezes envia uma operação'
  expect(context.StockImport.dadosPrevia).toBeNull(); // após logout
  expect(API.post).toHaveBeenCalledTimes(1); // duplo clique em confirmação pendente
  ```
  Testar arrastar, cancelamento sem API de confirmação, falha de processamento/confirmar, loading e proteção de duplo clique. Login/logout deve limpar prévia para não reutilizar arquivo de outro perfil/empresa.
- [ ] Rodar `npm test -- --runTestsByPath tests/frontendStockImport.test.js tests/frontendFuncionario.test.js`; observar falhas novas.
- [ ] Mover conteúdo de `tab-estoque` para tela própria, removendo marca administrativa dos elementos compartilhados. Implementar `StockImport.abrir`, integração de navegação e colunas condicionais sem duplicar IDs, inputs/listeners. Reiniciar prévia na troca de identidade/logout; travar confirmação concorrente e não reaproveitar prévia cancelada. Preservar mensagens persistentes de seleção, processamento, prévia sem escrita, confirmação, pendências e falha; resultados não desaparecem com toast. Erro não anuncia conclusão. Histórico mostra ator/arquivo/resultado da própria empresa.
- [ ] Rodar testes, build e verificações visuais do plano raiz; testar o PDF real Tiny/Olist mencionado pelo usuário se disponível, sem gravar saldos de produção durante QA.
- [ ] Commit: `feat: compartilhar tela de importacao com equipe operacional`.
