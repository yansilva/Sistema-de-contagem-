const { ignorarAvisos } = require('../src/config/avisos');

describe('Filtro de avisos do Node (DEP0169)', () => {
  let emitOriginal;
  let espiao;
  let restaurar;

  beforeEach(() => {
    emitOriginal = process.emitWarning;
    espiao = jest.fn();
    process.emitWarning = espiao; // o filtro envolve o que estiver ativo no momento
    restaurar = ignorarAvisos(['DEP0169']);
  });

  afterEach(() => {
    restaurar();
    process.emitWarning = emitOriginal;
  });

  it('descarta o aviso DEP0169 (forma posicional)', () => {
    process.emitWarning('url.parse() não padronizado', 'DeprecationWarning', 'DEP0169');
    expect(espiao).not.toHaveBeenCalled();
  });

  it('descarta o aviso DEP0169 (forma com objeto de opções)', () => {
    process.emitWarning('url.parse() não padronizado', { type: 'DeprecationWarning', code: 'DEP0169' });
    expect(espiao).not.toHaveBeenCalled();
  });

  it('mantém visíveis os demais avisos', () => {
    process.emitWarning('outra coisa', 'DeprecationWarning', 'DEP9999');
    process.emitWarning('aviso comum');
    process.emitWarning('com opções', { type: 'Warning', code: 'XYZ1' });
    expect(espiao).toHaveBeenCalledTimes(3);
    expect(espiao.mock.calls[0]).toEqual(['outra coisa', 'DeprecationWarning', 'DEP9999']);
  });

  it('restaura o comportamento original ao desfazer o filtro', () => {
    restaurar();
    expect(process.emitWarning).toBe(espiao);
    process.emitWarning('url.parse()', 'DeprecationWarning', 'DEP0169');
    expect(espiao).toHaveBeenCalledTimes(1);
    restaurar = ignorarAvisos(['DEP0169']);
  });
});
