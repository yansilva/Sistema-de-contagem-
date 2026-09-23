-- A finalização antiga converteu itens não preenchidos em zero.
-- contado_em distingue esses itens dos produtos realmente registrados, inclusive zero explícito.
DO $$
DECLARE
  sessao RECORD;
BEGIN
  FOR sessao IN
    SELECT DISTINCT cf.contagem_id
    FROM contagem_itens AS ci
    JOIN contagem_fornecedores AS cf ON cf.id = ci.contagem_fornecedor_id
    JOIN contagens AS c ON c.id = cf.contagem_id
    WHERE c.status = 'finalizada'
      AND ci.quantidade_contada = 0
      AND ci.contado_em IS NULL
  LOOP
    UPDATE contagem_itens AS ci
    SET quantidade_contada = NULL, diferenca = NULL, situacao = NULL
    FROM contagem_fornecedores AS cf
    WHERE ci.contagem_fornecedor_id = cf.id
      AND cf.contagem_id = sessao.contagem_id
      AND ci.quantidade_contada = 0
      AND ci.contado_em IS NULL;

    UPDATE contagem_fornecedores AS cf
    SET tem_diferenca = EXISTS (
      SELECT 1 FROM contagem_itens AS ci
      WHERE ci.contagem_fornecedor_id = cf.id
        AND ci.quantidade_contada IS NOT NULL
        AND ci.diferenca <> 0
    )
    WHERE cf.contagem_id = sessao.contagem_id;

    UPDATE contagens AS c
    SET tem_diferenca = EXISTS (
      SELECT 1 FROM contagem_fornecedores AS cf
      WHERE cf.contagem_id = c.id AND cf.tem_diferenca
    )
    WHERE c.id = sessao.contagem_id;
  END LOOP;
END $$;
