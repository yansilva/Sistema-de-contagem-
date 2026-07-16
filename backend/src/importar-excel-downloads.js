/**
 * Script para importar produtos diretamente de uma planilha Excel
 * Caminho do arquivo: C:\Users\User\Downloads\Produtos.xlsx
 *
 * Execução: node src/importar-excel-downloads.js
 */
const path = require('path');
const ExcelJS = require('exceljs');
require('dotenv').config();
const { query, pool } = require('./config/db');

async function importar() {
  try {
    console.log('🚀 Iniciando importação de produtos do Excel...');

    // 1. Verificar a empresa Demo no banco de dados
    const empresaResult = await query("SELECT id FROM empresas WHERE email_contato = 'contato@lojademo.com'");
    if (empresaResult.rows.length === 0) {
      console.error('❌ Empresa demo (Loja Demo) não encontrada no banco de dados.');
      process.exit(1);
    }
    const empresaId = empresaResult.rows[0].id;
    console.log(`🏢 Empresa de destino identificada: Loja Demo (ID: ${empresaId})`);

    // 2. Carregar o arquivo Excel
    const filePath = 'C:\\Users\\User\\Downloads\\Produtos.xlsx';
    const workbook = new ExcelJS.Workbook();
    
    console.log(`📁 Lendo arquivo: ${filePath}`);
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(1); // primeira aba
    console.log(`📊 Planilha identificada: "${worksheet.name}" com ${worksheet.rowCount} linhas.`);

    // 3. Mapear os cabeçalhos
    const firstRow = worksheet.getRow(1).values;
    let skuIdx = -1;
    let produtoIdx = -1;
    let produtorIdx = -1;

    for (let i = 1; i < firstRow.length; i++) {
      const val = firstRow[i] ? firstRow[i].toString().trim().toLowerCase() : '';
      if (val === 'sku') {
        skuIdx = i;
      } else if (val.startsWith('produtor') || val.startsWith('fornecedor')) {
        produtorIdx = i;
      } else if (val.startsWith('produto')) {
        produtoIdx = i;
      }
    }

    if (skuIdx === -1 || produtoIdx === -1 || produtorIdx === -1) {
      console.log('⚠️  Cabeçalhos mapeados:', { skuIdx, produtoIdx, produtorIdx });
      console.log('Valores da linha 1:', firstRow);
      console.error('❌ Não foi possível mapear as colunas necessárias (Sku, Produto, Produtor/Fornecedor) na linha 1.');
      process.exit(1);
    }

    console.log(`🔍 Colunas identificadas: Sku (coluna ${skuIdx}), Produto (coluna ${produtoIdx}), Produtor (coluna ${produtorIdx})`);

    // 4. Ler produtos e realizar upsert
    let adicionados = 0;
    let pulados = 0;

    // Usaremos transação para garantir consistência
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        
        const sku = row.getCell(skuIdx).value ? row.getCell(skuIdx).value.toString().trim() : '';
        const nome = row.getCell(produtoIdx).value ? row.getCell(produtoIdx).value.toString().trim() : '';
        const fornecedor = row.getCell(produtorIdx).value ? row.getCell(produtorIdx).value.toString().trim() : '';

        // Ignorar linhas vazias ou incompletas
        if (!sku || !nome || !fornecedor) {
          pulados++;
          continue;
        }

        await client.query(
          `INSERT INTO produtos (empresa_id, codigo, nome, fornecedor, ativo)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (empresa_id, codigo) DO UPDATE SET
             nome = EXCLUDED.nome,
             fornecedor = EXCLUDED.fornecedor,
             ativo = TRUE`,
          [empresaId, sku, nome, fornecedor]
        );
        adicionados++;
      }

      await client.query('COMMIT');
      console.log(`\n✅ Importação concluída com sucesso!`);
      console.log(`   - Produtos importados/atualizados: ${adicionados}`);
      console.log(`   - Linhas puladas (vazias ou inválidas): ${pulados}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Fechar pool de conexão
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro durante a importação:', error);
    process.exit(1);
  }
}

importar();
