# Damage Simulator

O Damage Simulator usa um bundle local do `@smogon/calc` para reproduzir a formula competitiva de dano com mais fidelidade. A ferramenta continua 100% client-side: o bundle fica em `vendor/smogon-calc/` e nao faz chamadas de rede em tempo de uso.

## O que ele calcula

- stats por especie, EV, IV, natureza, level e HP atual;
- geracao exata de calculo, de Gen 1 a Gen 9;
- Singles ou Doubles;
- golpe, categoria, base power e casos especiais conhecidos pelo Smogon Calc;
- itens, habilidades e modificadores de campo suportados pelo motor;
- critico, burn ofensivo, weather, terrain, screens, Aurora Veil, Helping Hand, Friend Guard, Protect e Gravity;
- Tera Type ofensivo e defensivo;
- rolls de dano, badges de 1HKO/2HKO/3HKO/Safe e notas de velocidade;
- chip end-of-turn de burn, poison, toxic, Leftovers e Black Sludge.

## Fallback interno

O calculo interno antigo permanece como rede de seguranca. Ele entra quando:

- o bundle local nao carregou;
- a especie ou o golpe nao foi resolvido na base do Smogon Calc;
- algum caso inesperado retorna um formato de dano que a camada adaptadora nao entende.

Quando o fallback entra, a UI mostra aviso e identifica o resultado como estimativa simplificada. Esse modo e util para nao quebrar a experiencia, mas nao deve ser tratado como simulacao cartucho-perfeita.

Regras do fallback:

- exige stats reais carregados para atacante e defensor;
- nao usa base stat generico como substituto silencioso;
- avisa quando controles avancados nao foram aplicados;
- usa formula moderna simplificada, nao regras exatas por cartucho;
- deve permanecer pequeno para nao virar um segundo motor competitivo paralelo.

## Camadas

- `vendor/smogon-calc/data/production.min.js`: dados competitivos do Smogon Calc.
- `vendor/smogon-calc/production.min.js`: motor de calculo.
- `js/smogonCalcAdapter.js`: traduz o estado do formulario para `Pokemon`, `Move`, `Field` e normaliza a resposta para a UI.
- `js/dmgCalc.js`: controla o formulario, autocompletes, fallback interno e renderizacao do resultado.

## Invariantes importantes

- O usuario deve selecionar o golpe pelo autocomplete antes de calcular.
- O motor Smogon usa a geracao exata do seletor do Damage Simulator, nao apenas o agrupamento da gen-bar.
- A gen-bar define o valor inicial do seletor de geracao do Damage Simulator, mas uma escolha manual do usuario e preservada.
- "Burn ofensivo" afeta o atacante; chip de burn de fim de turno e uma opcao separada.
- A efetividade manual existe apenas para o fallback interno. No motor Smogon, efetividade vem dos tipos, habilidades, itens e campo calculados pelo bundle.

## Ao adicionar regras novas

Prefira alimentar o `SmogonDamage` com mais estado do formulario em vez de duplicar regra no fallback. So amplie o fallback quando for uma protecao de UX ou quando o motor local nao suportar claramente o caso.
