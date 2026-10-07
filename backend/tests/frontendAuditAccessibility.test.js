const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '../../frontend/js', file), 'utf8');
const readFrontend = (file) => fs.readFileSync(path.resolve(__dirname, '../../frontend', file), 'utf8');

describe('Acessibilidade das interfaces de auditoria', () => {
  it('usa botão de expansão separado do download no histórico e sincroniza estado', () => {
    const source = read('historico.js');
    expect(source).toMatch(/<button[^>]*class="hist-card-toggle"[^>]*aria-expanded=/);
    expect(source).toMatch(/aria-controls="hist-body-/);
    expect(source).toMatch(/class="hist-card-body"[^>]*hidden/);
    expect(source).toMatch(/body\.hidden = false/);
    expect(source).toMatch(/body\.hidden = true/);
    expect(source).not.toMatch(/<div class="hist-card-header"[^>]*data-click/);
  });

  it('sincroniza o estado do histórico e ignora resposta após recolher', async () => {
    let expanded = false;
    let concluir;
    const toggle = { setAttribute: jest.fn() };
    const card = {
      classList: {
        contains: () => expanded,
        add: () => { expanded = true; },
        remove: () => { expanded = false; }
      },
      querySelector: () => toggle
    };
    const body = { hidden: true, innerHTML: '' };
    const context = vm.createContext({
      document: { getElementById: id => id === 'hist-card-7' ? card : body },
      API: { get: jest.fn(() => new Promise(resolve => { concluir = resolve; })) }
    });
    vm.runInContext(read('historico.js') + '\nglobalThis.HistoricoTeste = Historico;', context);

    const carregamento = context.HistoricoTeste.toggleDetalhes('7');
    expect(body.hidden).toBe(false);
    expect(toggle.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'true');
    await context.HistoricoTeste.toggleDetalhes('7');
    expect(body.hidden).toBe(true);
    expect(toggle.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');

    concluir({ success: true, data: { contagem: { fornecedores: [{ fornecedor: 'Loja', produtos: [] }] } } });
    await carregamento;
    expect(body.hidden).toBe(true);
  });

  it('mantém somente o botão nativo como acionador dos detalhes semanais', () => {
    const source = read('semana.js');
    expect(source).not.toContain('data-click="semana-produtor-card"');
    expect(source).toMatch(/class="semana-card-acao"[^>]*aria-expanded=/);
    expect(source).toMatch(/aria-controls="semana-detalhe-/);
  });

  it('expõe tabelas roláveis em regiões nomeadas', () => {
    for (const file of ['empresas.js', 'empresa-detalhes.js', 'auditoria.js']) {
      const source = read(file);
      expect(source).toMatch(/class="saas-table-scroll"[^>]*tabindex="0"[^>]*role="region"[^>]*aria-label=/);
    }
    expect(read('atividades.js')).toMatch(/class="audit-table-wrapper" tabindex="0" role="region" aria-label="Log de atividades"/);
  });

  it('nomeia buscas e fechamentos e mantém navegação nativa no HTML', () => {
    const html = readFrontend('index.html');
    for (const id of ['filtro-busca-produto', 'filtro-busca-usuario', 'filtro-audit-busca', 'delete-empresa-input']) {
      expect(html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0]).toMatch(/aria-label=/);
    }
    for (const action of ['action-96', 'action-97']) {
      expect(html.match(new RegExp(`<button[^>]*data-click="${action}"[^>]*>`))?.[0]).toMatch(/aria-label=/);
    }
    expect(html).toMatch(/<a[^>]*href="#screen-home"[^>]*data-click="action-8"/);
    expect(html).toMatch(/class="table-scroll" role="region" aria-label="Contagens recentes" tabindex="0"/);
  });

  it('desativa a rolagem suave quando o usuário reduz movimento', () => {
    const source = read('app.js');
    expect(source).toContain("matchMedia?.('(prefers-reduced-motion: reduce)').matches");
    expect(source).toContain("behavior: reduzirMovimento ? 'auto' : 'smooth'");
  });
});
