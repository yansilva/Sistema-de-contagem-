# Peças de queijo, acompanhamento semanal e importação pelo funcionário

Data: 2026-09-28
Estado: funcionamento aprovado em conversa; documento aguardando revisão do usuário.

## Objetivo

Separar a contagem física de peças de queijo do estoque em quilos, mostrar quais produtores ainda precisam ser contados na semana e permitir ao funcionário atualizar o estoque pelo PDF do Tiny/Olist.

## Decisões aprovadas

- A contagem de queijos registra somente quantidade inteira de peças, sem peso individual ou total.
- Os SKUs desses queijos têm saldo em quilos no ERP. Peças são registradas separadamente e não geram comparação com esse saldo.
- O administrador marca no cadastro quais produtos são peças de queijo. Esses produtos aparecem somente na aba de peças, fora da contagem geral.
- Um produtor fica Contado quando todos os seus produtos ativos foram contados na semana; Parcial quando alguns foram contados; Pendente quando nenhum foi contado.
- O funcionário pode enviar o PDF do Tiny/Olist, conferir a prévia e confirmar a atualização dos SKUs cadastrados da sua empresa. O PDF não cadastra produtos.

## Abordagem

Reutilizar o fluxo de sessões, produtores, quantidades, salvamento, finalização e histórico. Acrescentar um modo explícito à sessão: Geral ou Peças de queijo. O modo determina a seleção dos produtos e a apuração; nunca inferir a unidade pelo nome do queijo.

Uma área de peças com armazenamento e fluxo totalmente independentes também é possível, mas exigiria manter outro salvamento e outro histórico. A abordagem aprovada reutiliza o motor existente e separa claramente as unidades.

Organizar a implementação em três entregas dependentes: modo de peças e classificação; acompanhamento semanal usando os dois modos; importação para funcionário com acesso próprio e revisão de permissões.

## 1. Contagem de peças de queijo

### Cadastro

- Administrador da empresa marca ou desmarca Peça de queijo no formulário do produto. Funcionário não pode alterar essa classificação.
- Produtos existentes começam como gerais. Não classificar automaticamente por nome, fornecedor, texto do PDF ou SKU.
- A classificação é mantida quando o estoque é importado. A atualização de saldo não altera a modalidade de contagem.
- O administrador pode consultar os produtos marcados para revisar sua seleção.

### Contagem

- A interface oferece abas Geral e Peças de queijo, com ação de iniciar uma sessão ou escolher uma sessão aberta da modalidade para continuar. Não trocar silenciosamente uma sessão por outra e não encerrar sessões ao mudar de aba.
- Geral seleciona produtos ativos não marcados. Peças de queijo seleciona produtos ativos marcados. Uma modalidade não mistura os itens da outra.
- Quantidade de peças é inteira e não negativa. Zero digitado é contagem válida; campo vazio é não contado.
- É possível contar apenas alguns produtores/produtos, salvar progresso e finalizar. Produtos vazios não são convertidos em zero.
- Uma sessão sem produtos compatíveis mostra uma orientação clara. Não criar uma sessão vazia com aparência de sucesso.
- Salvar progresso, adicionar produtos/produtores à sessão e finalizar respeitam o modo no servidor, além da interface.

### Resultado e histórico

- Uma sessão de peças finalizada mostra produtores, SKUs, produtos e quantidade de peças registrada, com indicação explícita da modalidade.
- Não apresenta estoque de referência em kg, falta, sobra, divergência ou mensagem de estoque conferido para peças.
- Não modifica estoque atual nem faz conversão entre kg e peças. Não oferece Excel de diferenças para uma modalidade que não apura diferenças.
- Geral preserva a regra atual: contagem cega durante a execução, referência e diferenças disponíveis ao funcionário após finalizar.
- Sessões antigas permanecem gerais, com seus snapshots, quantidades e resultados preservados.
- Alterar a classificação de um produto não reinterpreta sessões existentes. O modo e os itens capturados na sessão são estáveis.

## 2. Acompanhamento semanal

### Regra de cobertura

- A semana vai de segunda-feira às 00:00 até a segunda seguinte, no fuso America/Sao_Paulo. A tela mostra o intervalo de datas.
- Considerar somente itens com quantidade registrada, inclusive zero, em sessões finalizadas. Usar a data/hora de contagem do item dentro da semana.
- Combinar várias sessões finalizadas da empresa na mesma semana. Cada produto conta uma única vez para cobertura, mesmo com várias contagens.
- A modalidade registrada deve corresponder à classificação atual do produto: geral para produtos gerais; peças para produtos marcados. Uma contagem antiga em kg não satisfaz a obrigação atual de contar peças.
- O total esperado usa produtos ativos atuais de cada produtor. Novos produtos podem ampliar o total; desativados saem do total sem apagar seu histórico.
- Produtores sem produtos ativos não aparecem como pendentes. Dados de outras empresas nunca entram na consulta.

### Interface

- Painel Semana de contagem acessível a funcionário e administrador, com total de produtores contados, parciais e pendentes.
- Cada produtor mostra quantidade concluída e esperada, por exemplo 8 de 12, e estado em texto: Contado, Parcial ou Pendente.
- Cores e ícones complementam o texto, sem serem a única indicação. Manter cobalto/grafite e os temas atuais.
- Ao abrir um produtor, mostrar produtos ainda pendentes e sua modalidade, sem saldo de referência de uma contagem em andamento.
- Atualizar o painel após finalizar uma sessão. Loading, vazio, erro e nova tentativa têm estados explícitos; falha não deve parecer semana concluída.
- Usabilidade em desktop, tablet e celular, incluindo nomes longos e catálogo com centenas de produtos.

### Exemplos

- Produtor com 12 produtos e 8 contados em duas sessões finalizadas: Parcial, 8 de 12.
- Os 4 restantes são contados e finalizados: Contado, 12 de 12.
- Um dos produtos é recontado: continua 12 de 12, sem duplicação.
- Nenhuma contagem finalizada na semana: Pendente, 0 de 12.

## 3. Importação de estoque pelo funcionário

- Disponibilizar um acesso Importar estoque na área operacional, sem liberar o back-office de administração.
- Reutilizar a importação PDF do Tiny/Olist, com seleção/arrastar arquivo, processamento, prévia, confirmação e resultado persistente.
- Permitir ao funcionário ativo da empresa enviar e confirmar o arquivo. Cadastro/edição de produtos, classificação de peças, gestão de usuários e acesso de outras empresas continuam fora dessa permissão.
- Na prévia do funcionário, mostrar SKU, produto, saldo recebido do arquivo e pendências. Colunas de saldo anterior e diferença de atualização permanecem administrativas; a tela de contagem continua cega.
- Atualizar apenas produtos ativos cujo SKU já existe na empresa. SKUs desconhecidos não criam produtos. Itens sem código, repetidos ou com saldo fracionário continuam sinalizados conforme a importação atual, sem arredondamento silencioso.
- Confirmar a operação é a única etapa que grava os saldos. Cancelamento, erro de leitura e prévia não alteram estoque.
- Registrar usuário responsável, empresa, arquivo e resultado no histórico/auditoria. Falhas de gravação não devem anunciar sucesso.
- Importar estoque não altera snapshots de contagens iniciadas anteriormente. As novas contagens gerais capturam o saldo atualizado.
- Não duplicar os elementos de upload ou seus IDs ao compartilhar a tela entre perfis.

## Dados e compatibilidade

- Evolução por migration: classificação de peças nos produtos, modo da sessão e referência não aplicável em sessões de peças.
- Backfill conserva produtos e sessões existentes como gerais. Referência não aplicável deve ser representada como ausência, nunca como um zero fictício usado para calcular diferença.
- Quantidade física permanece separada do saldo ERP. Persistência de peças usa inteiro; não altera a unidade ou o valor do estoque importado.
- Serializadores, relatórios, salvamento, finalização e histórico usam o modo persistido da sessão. Cliente não pode trocar o modo de uma sessão já criada.
- Novas consultas e mutações exigem empresa autenticada e isolamento por tenant. Marcação de produto continua administrativa.
- Catálogo, snapshots e contagens anteriores permanecem recuperáveis e não são recalculados pela nova classificação.

## Critérios de aceite e validação

1. Administrador marca um produto; uma nova sessão de peças o inclui e uma nova sessão geral o exclui. Funcionário não pode marcar produtos nem enviar alteração por API.
2. Quantidades de peças zero e positivas são salvas; vazio continua não contado; valores negativos, fracionários e modalidade incompatível são recusados.
3. Finalização de peças não gera diferenças com kg e não altera saldo. Resultado e histórico indicam peças e omitem comparação de estoque.
4. Finalização geral mantém os resultados atuais e só inclui produtos contados. Funcionário não recebe referência durante contagem aberta.
5. Painel semanal cobre sessões diferentes sem duplicar produto, distingue os três estados e respeita a virada de semana no fuso definido.
6. Sessões abertas não produzem cobertura semanal. Classificação alterada, produto novo/desativado e produtor sem produtos ativos respeitam as regras acima.
7. Funcionário importa PDF da própria empresa, vê prévia e confirma somente SKUs cadastrados. Outra empresa, gestão de catálogo e acesso administrativo são recusados.
8. Importação posterior ao início de uma sessão não modifica seu snapshot. Falha ou cancelamento da importação não grava saldo.
9. Testes automatizados para modos, permissões, tenant, semana e regressões; verificação visual dos estados nos tamanhos de desktop/tablet/celular; suíte completa, lint e build antes de integração.

## Fora do escopo

Peso de peças, conversão kg/peça, previsão de consumo, metas por funcionário, notificações semanais, integração ao vivo com o ERP, cadastro por PDF e mudança geral do estoque ERP para números fracionários. A nova área registra peças físicas; essas extensões exigem decisões próprias.

## Publicação

Implementar em branch isolada, revisar permissões de importação e consultas multiempresa e validar migration antes de aplicá-la. Migrar de forma compatível antes de publicar o código dependente dos novos campos. Se for necessário rollback depois de existirem sessões de peças, desabilitar novas sessões e preservar a leitura correta das existentes; não voltar a interpretar essas sessões como gerais. Conferir a API e os fluxos depois do deploy, distinguindo testes locais de verificação autenticada em produção.
