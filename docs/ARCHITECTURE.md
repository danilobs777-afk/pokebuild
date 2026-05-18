# Arquitetura do PokeBuild

Este documento explica como os modulos conversam entre si e quais invariantes devem ser preservadas durante manutencao.

## Fluxo de scripts

`index.html` carrega os scripts nesta ordem:

1. `data.js`
2. `generation.js`
3. `ui.js`
4. `api.js`
5. `storage.js`
6. modulos de tela
7. `app.js`

Essa ordem importa. Os modulos de tela assumem que dados locais, regras de geracao, helpers de UI, API e storage ja existem.

## Donos de responsabilidade

`data.js` guarda tabelas e helpers de dominio que nao dependem do DOM: tipos, type chart, naturezas, itens, formatos, parsing/export Smogon e dados locais de Pokemon.

`generation.js` transforma dados brutos em decisoes de produto. Ele responde quais tipos, jogos, version-groups e campos existem para a geracao ativa.

`ui.js` centraliza padroes de interface compartilhados: autocomplete com teclado, fechamento externo, escape HTML, toast e confirm modal.

`api.js` encapsula a PokeAPI e caches em memoria. Modulos de tela nao devem montar URLs da PokeAPI diretamente quando ja existe helper ali.

`storage.js` e o unico modulo que fala com IndexedDB. Outros modulos chamam `TeamStorage`.

`app.js` e o shell: navega views, inicializa modulos, troca geracao global e expoe modais globais.

## Estado

Cada modulo de tela possui seu proprio estado em memoria:

- Type Calc: Pokemon selecionado, tipos manuais, Tera e forma atual.
- Analyzer: seis slots simples para tipos, Tera e golpes.
- Builder: seis slots completos, modo Champions, time em edicao e draft local.
- My Teams: lista filtrada, time atual no detalhe.
- Damage Simulator: move carregado, stats carregados e modificadores do formulario.

Nao compartilhe objetos mutaveis de estado entre modulos. Quando um fluxo precisa transferir dados, use uma representacao serializavel e clara, como o draft Analyzer -> Builder.

## Gen-bar

A gen-bar atualiza `GenerationRules` via `App.setGen()`. Depois disso, os modulos recebem `rerender()` ou sincronizam selects/campos.

Invariantes:

- Gen 1 nao deve expor Steel, Dark ou Fairy.
- Gen 2-5 nao deve expor Fairy.
- Builder so deve mostrar jogos coerentes com a gen-bar.
- Campos de item, ability, nature e Tera devem seguir `GenerationRules.capabilitiesForGame()`.
- Legalidade de golpes no Builder deve usar `GenerationRules.moveVersionGroups()`.

## Autocomplete

Novos autocompletes devem usar `PokeBuildUI.bindAutocomplete(input, suggestions, { onPick })`.

Isso garante:

- setas para cima/baixo;
- Enter para selecionar;
- Escape para fechar;
- fechamento no blur;
- fechamento ao clicar fora;
- descarte de referencias antigas quando cards sao re-renderizados.

## Seguranca de DOM

Texto vindo de usuario ou storage local deve passar por `PokeBuildUI.escapeHtml()` antes de entrar em `innerHTML`.

Fontes tipicas de texto do usuario:

- nome do time;
- nomes importados via Smogon;
- apelidos;
- campos de importacao;
- nomes salvos no IndexedDB.

Quando possivel, prefira `textContent`. Use `innerHTML` apenas para templates que precisam de badges ou estrutura.

## Service worker

`sw.js` usa:

- network-first para HTML;
- cache-first para assets estaticos;
- versionamento por `CACHE_VERSION`;
- mensagem de ativacao com `isUpdate` para evitar toast falso em primeira instalacao.

Sempre incremente `CACHE_VERSION` quando adicionar/remover arquivos cacheados.
