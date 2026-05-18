# PokeBuild

PokeBuild e uma ferramenta competitiva de Pokemon feita em HTML, CSS e JavaScript puro. O app roda 100% no browser, consulta a PokeAPI para dados dinamicos e salva times localmente no IndexedDB.

## Modulos

- Type Calc: calcula efetividade defensiva e ofensiva por Pokemon, tipos manuais e Tera Type.
- Team Analyzer: monta uma visao rapida de cobertura, matchup, fraquezas e sinergia defensiva.
- Team Builder: cria times completos, valida habilidades/golpes via PokeAPI e exporta/importa formato Smogon.
- My Teams: lista, filtra, detalha, exporta, edita e exclui times salvos localmente.
- Damage Simulator: calcula ranges de dano com rolls 85-100%, STAB, efetividade, campo, itens, habilidades e status principais.

## Regras globais

A gen-bar e uma regra de produto global, nao apenas visual. Ela afeta:

- tipos disponiveis;
- tabela de efetividade;
- sprites/arte exibidos;
- formatos de jogo disponiveis no Builder;
- campos de Builder que existem em cada geracao;
- filtros de legalidade de golpes por version-group da PokeAPI.

Use `GenerationRules` para consultar essas regras. Evite espalhar checks como `gen >= 3` em modulos novos.

## Estrutura

- `index.html`: marcação dos modulos e registro do service worker.
- `css/style.css`: layout, componentes e responsividade.
- `js/data.js`: tabelas locais e helpers puros de dominio.
- `js/generation.js`: contrato central da gen-bar, formatos e capacidades por geracao.
- `js/ui.js`: helpers compartilhados de interface, autocomplete, toast, confirm e escape HTML.
- `js/api.js`: acesso a PokeAPI e caches em memoria.
- `js/storage.js`: IndexedDB para times salvos.
- `js/typeCalc.js`: Type Calc.
- `js/analyzer.js`: Team Analyzer.
- `js/builder.js`: Team Builder.
- `js/teams.js`: My Teams.
- `js/dmgCalc.js`: Damage Simulator.
- `sw.js`: cache PWA.
- `tests/smoke.js`: smoke tests de navegador.

## Como testar

Abra o app localmente e rode:

```text
http://127.0.0.1:4174/?smoke=1
```

O painel no canto inferior esquerdo deve mostrar `PASS` em todos os fluxos.

## Notas de manutencao

- Prefira `PokeBuildUI.bindAutocomplete()` para novos autocompletes.
- Use `PokeBuildUI.escapeHtml()` antes de inserir texto do usuario via `innerHTML`.
- Use `GenerationRules.capabilitiesForGame()` para campos condicionais do Builder.
- Use `GenerationRules.moveVersionGroups()` para filtrar golpes por jogo/formato.
- O Damage Simulator e uma calculadora pratica, nao uma reimplementacao completa de Pokemon Showdown.
