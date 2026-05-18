# Damage Simulator

O Damage Simulator e uma calculadora pratica para comparar ranges, nao uma copia completa de Pokemon Showdown.

## O que ele calcula

- stats reais por base stat, EV, IV, natureza e level;
- categoria do golpe pela PokeAPI;
- rolls de dano 85-100%;
- STAB, incluindo Adaptability;
- efetividade por tipo usando a gen-bar ativa;
- critico;
- burn reduzindo Atk fisico;
- clima e terrain principais;
- alguns modificadores comuns de item e habilidade;
- chip end-of-turn de burn, poison, toxic, Leftovers e Black Sludge;
- badges de 1HKO, 2HKO, 3HKO ou Safe.

## Invariantes importantes

- O usuario deve selecionar o golpe pelo autocomplete antes de calcular.
- Se atacante ou defensor nao tiver stats carregados pela PokeAPI, o calculo usa fallback e mostra aviso.
- STAB e efetividade sao recalculados quando atacante, defensor ou golpe mudam.
- "Burn ofensivo" reduz Atk; chip de burn e um modificador separado.

## Limites conhecidos

Esta ferramenta nao tenta cobrir todos os detalhes oficiais:

- ordem exata de arredondamentos de todos os modifiers de cartucho;
- habilidades raras ou condicionais;
- itens com regras muito especificas;
- golpes com formulas especiais;
- spread moves, doubles targeting, screens e Helping Hand;
- interacoes completas de abilities que anulam dano ou mudam tipo.

Quando for adicionar uma regra nova, prefira uma funcao pequena e nomeada, com comentario explicando:

- qual condicao ativa a regra;
- qual multiplicador ou ajuste e aplicado;
- qual caso competitivo motivou a regra;
- qual limite ainda nao esta modelado.
