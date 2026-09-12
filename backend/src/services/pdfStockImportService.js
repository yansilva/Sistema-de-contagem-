const pdfParse = require('pdf-parse');

/**
 * Serviço de Importação e Atualização de Estoque via Relatório PDF do Tiny ERP
 *
 * Responsabilidades:
 * 1. Extração de texto do buffer PDF
 * 2. Parsing de linhas tabulares de produtos e SKUs
 * 3. Filtragem de cabeçalhos, rodapés e metadados irrelevantes
 * 4. Cruzamento com os produtos cadastrados da empresa no banco
 * 5. Geração de prévia detalhada (produtos correspondentes, pendências e linhas ignoradas)
 */

/**
 * Normaliza strings para comparação robusta de SKU
 */
function normalizarSku(sku) {
  if (!sku) return '';
  return String(sku).trim().toUpperCase();
}

/**
 * Converte strings numéricas (ex: "15", "12,00", "1.250", "-3") em inteiro
 */
function parseQuantidade(valorStr) {
  if (typeof valorStr === 'number') return Math.round(valorStr);
  if (!valorStr) return 0;
  // Remove pontos de milhar e substitui vírgula decimal por ponto
  const limpo = String(valorStr)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : Math.round(num);
}

/**
 * Verifica se a linha é cabeçalho, rodapé ou linha informativa irrelevante
 */
function isLinhaIgnoravel(linha) {
  const l = linha.toLowerCase().trim();
  if (l.length < 3) return true;
  if (/^[-=_*.\s]{3,}$/.test(l)) return true;
  if (l.includes('página') || l.includes('pagina') || l.includes('emissão') || l.includes('emissao')) return true;
  if (l.includes('relatório de estoque') || l.includes('relatorio de estoque')) return true;
  if (l.includes('tiny erp') || l.includes('cnpj') || l.includes('razão social') || l.includes('razao social')) return true;
  if (l.includes('código') && (l.includes('descrição') || l.includes('saldo') || l.includes('estoque'))) return true;
  if (l.startsWith('total') || l.includes('totais gerais') || l.includes('subtotal')) return true;
  return false;
}

/**
 * Analisa uma linha de texto do relatório do Tiny para extrair SKU, Descrição e Estoque.
 * Padrões comuns no Tiny:
 * 1. "001 Camiseta Basica Branca UN 15"
 * 2. "SKU-102 | Queijo Tulha 250g | 12,00"
 * 3. "12345 Queijo Canastra Real 20,00"
 * 4. "003 Calça Jeans Slim Têxtil Sul 10"
 */
function extrairLinhaTiny(linha) {
  const limpa = linha.trim().replace(/\t+/g, ' ');
  if (isLinhaIgnoravel(limpa)) return null;

  // Regex 1: Formato com SKU inicial, descrição no meio, e quantidade numérica no final
  // Ex: "001 Camiseta Basica Branca UN 15" ou "PROD-10 Queijo Minas 12,00"
  const matchFimNumero = limpa.match(/^([A-Za-z0-9_\-./]+)\s+(.+?)(?:\s+(?:UN|PC|CX|KG|LT|G|M|PAR|FD|PCT))?\s+([+-]?\d+(?:[.,]\d+)?)$/i);
  if (matchFimNumero) {
    const sku = matchFimNumero[1];
    const descricao = matchFimNumero[2].trim();
    const qtd = parseQuantidade(matchFimNumero[3]);
    return { codigo: sku, nome: descricao, quantidade: qtd };
  }

  // Regex 2: Formato com delimitadores comuns (pipe, tab, ponto-e-vírgula)
  const partes = limpa.split(/[|;]/).map((p) => p.trim()).filter(Boolean);
  if (partes.length >= 3) {
    const sku = partes[0];
    const descricao = partes[1];
    const qtdCandidate = partes[partes.length - 1].replace(/[^\d.,+-]/g, '');
    if (qtdCandidate) {
      return { codigo: sku, nome: descricao, quantidade: parseQuantidade(qtdCandidate) };
    }
  }

  // Regex 3: SKU no início e valor numérico no final, ignorando formato de unidade intermediário
  const matchGenerico = limpa.match(/^([A-Za-z0-9_\-./]{2,})\s+(.{3,}?)\s+([+-]?\d+(?:[.,]\d+)?)$/);
  if (matchGenerico) {
    return {
      codigo: matchGenerico[1],
      nome: matchGenerico[2].trim(),
      quantidade: parseQuantidade(matchGenerico[3])
    };
  }

  return null;
}

/**
 * Processa o arquivo PDF e gera a prévia de atualização contra o banco de dados da empresa
 *
 * @param {Buffer} pdfBuffer - Conteúdo binário do PDF
 * @param {string} nomeArquivo - Nome original do arquivo enviado
 * @param {Array} produtosCadastrados - Lista de produtos da empresa já no banco
 */
async function processarPdfEstoque(pdfBuffer, nomeArquivo, produtosCadastrados) {
  const data = await pdfParse(pdfBuffer);
  const textoCompleto = data.text || '';
  const linhas = textoCompleto.split(/\r?\n/);

  const mapaProdutosDb = new Map();
  produtosCadastrados.forEach((p) => {
    mapaProdutosDb.set(normalizarSku(p.codigo), p);
  });

  const skusVistos = new Set();
  const produtosParaAtualizar = [];
  const skusNaoEncontrados = [];
  let produtosEncontrados = 0;
  let linhasIgnoradas = 0;

  for (const linha of linhas) {
    const parsed = extrairLinhaTiny(linha);
    if (!parsed) {
      linhasIgnoradas++;
      continue;
    }

    const skuNorm = normalizarSku(parsed.codigo);
    if (!skuNorm || skusVistos.has(skuNorm)) {
      linhasIgnoradas++;
      continue;
    }
    skusVistos.add(skuNorm);
    produtosEncontrados++;

    if (mapaProdutosDb.has(skuNorm)) {
      const prodDb = mapaProdutosDb.get(skuNorm);
      produtosParaAtualizar.push({
        produto_id: prodDb.id,
        codigo: prodDb.codigo,
        nome: prodDb.nome,
        fornecedor: prodDb.fornecedor,
        estoque_anterior: prodDb.estoque_atual || 0,
        estoque_novo: parsed.quantidade,
        diferenca_atualizacao: parsed.quantidade - (prodDb.estoque_atual || 0)
      });
    } else {
      skusNaoEncontrados.push({
        codigo: parsed.codigo,
        nome_relatorio: parsed.nome,
        quantidade: parsed.quantidade
      });
    }
  }

  return {
    nome_arquivo: nomeArquivo,
    produtos_encontrados: produtosEncontrados,
    produtos_correspondentes: produtosParaAtualizar.length,
    skus_nao_encontrados_total: skusNaoEncontrados.length,
    linhas_ignoradas: linhasIgnoradas,
    produtos_para_atualizar: produtosParaAtualizar,
    skus_nao_encontrados: skusNaoEncontrados
  };
}

module.exports = {
  processarPdfEstoque,
  extrairLinhaTiny,
  normalizarSku,
  parseQuantidade
};
