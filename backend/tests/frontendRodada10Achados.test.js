const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ler = (arq) => fs.readFileSync(path.join(__dirname, '../../frontend', arq), 'utf8');

describe('Rodada 10: achados da verificação independente', () => {
  it('CSV de auditoria sai com data ISO, cabeçalho "Ação" e ação legível, sem mudar a ordem das colunas', () => {
    const ctx = vm.createContext({ document: { addEventListener: () => {} }, window: {} });
    vm.runInContext(ler('js/utils.js') + '\n' + ler('js/atividades.js') + '\nglobalThis.A = Atividades;', ctx);
    const entrada = '﻿ID;Data e Hora (ISO);Escopo;Acao;Entidade\r\n1;Fri Oct 23 2026 10:00:00 GMT+0000 (Coordinated Universal Time);empresa;auditoria_encerrada;"a;b"';
    const saida = ctx.A.ajustarCsv(entrada).split('\r\n');
    expect(saida[0]).toBe('﻿ID;Data e Hora (ISO);Escopo;Ação;Entidade');
    expect(saida[1]).toBe('1;2026-10-23T10:00:00.000Z;empresa;Auditoria assistida encerrada;"a;b"');
  });

  it('nomes acessíveis contextuais nas listas repetidas', () => {
    expect(ler('js/consulta.js')).toContain('aria-label="Ver produtos de ${escapeHtml(nome)}"');
    expect(ler('js/consulta.js')).toContain('Baixar relatório da contagem de ${formatarData(c.iniciado_em)}');
    expect(ler('js/semana.js')).toContain("'Ver situação'} de ${p.fornecedor}");
    expect(ler('js/empresas.js')).toContain('aria-label="Gerenciar senhas de ');
    expect(ler('js/empresas.js')).toContain("'Inativar ' : 'Reativar '");
  });

  it('busca de empresas usa o campo padrão e "Retirar da operação" é perigo em contorno', () => {
    const html = ler('index.html');
    expect(html).toMatch(/<input[^>]*id="empresas-busca"(?![^>]*delete-confirm-input)[^>]*>/);
    expect(ler('js/empresa-detalhes.js')).toContain('btn btn-outline-danger btn-sm" data-click="action-92"');
  });

  it('Voltar vem antes do título em Semana e Importar estoque', () => {
    const html = ler('index.html');
    expect(html).toMatch(/btn-voltar" data-click="action-8">[\s\S]{0,160}<\/button>\s*<h2[^>]*>Semana de contagem<\/h2>/);
    expect(html).toMatch(/id="estoque-voltar-rotulo">Voltar ao painel<\/span><\/button>\s*<h2>Importar estoque<\/h2>/);
  });
});
