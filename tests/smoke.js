'use strict';

localStorage.removeItem('pokebuild_builder_draft_v1');
localStorage.removeItem('az_team_draft');

const smokePanel = document.createElement('div');
smokePanel.id = 'smoke-results';
smokePanel.style.cssText = [
  'position:fixed',
  'left:12px',
  'bottom:12px',
  'z-index:1000',
  'width:min(380px,calc(100vw - 24px))',
  'max-height:55vh',
  'overflow:auto',
  'padding:12px',
  'border:1px solid #2a2a3a',
  'border-radius:8px',
  'background:#12121a',
  'box-shadow:0 18px 48px rgba(0,0,0,.45)',
  'font:13px system-ui,sans-serif',
  'color:#e2e2f0'
].join(';');
function ensurePanel() {
  if (!smokePanel.isConnected) document.body.appendChild(smokePanel);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensurePanel);
else ensurePanel();

const results = [];

function paint() {
  smokePanel.innerHTML = '<strong>PokeBuild smoke tests</strong>' + results.map(r => {
    const color = r.status === 'pass' ? '#22c55e' : r.status === 'fail' ? '#ef4444' : '#eab308';
    return `<div style="margin-top:8px;color:${color}"><strong>${r.status.toUpperCase()}</strong> ${escapeHtml(r.name)}${r.detail ? `<br><small>${escapeHtml(r.detail)}</small>` : ''}</div>`;
  }).join('');
}

function report(name, status, detail = '') {
  results.push({ name, status, detail });
  paint();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(fn, label, timeout = 6000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await wait(80);
  }
  throw new Error(`Timeout: ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function click(selector) {
  const el = document.querySelector(selector);
  assert(el, `Elemento nao encontrado: ${selector}`);
  el.click();
  return el;
}

function confirmIfNeeded() {
  if (!document.querySelector('#confirm-modal')?.classList.contains('hidden')) {
    click('#confirm-ok-btn');
  }
}

async function openView(viewId, label) {
  click(`.nav-btn[data-view="${viewId}"]`);
  confirmIfNeeded();
  await waitFor(() => document.querySelector(`#view-${viewId}.active`), label);
}

function setValue(selector, value) {
  const el = document.querySelector(selector);
  assert(el, `Campo nao encontrado: ${selector}`);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el;
}

function setSelect(selector, value) {
  const el = setValue(selector, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el;
}

async function loadMove(name) {
  const expectedPower = { Earthquake: '100', 'Flare Blitz': '120', 'Drain Punch': '75' }[name];
  setValue('#dmg-move-input', name);
  await waitFor(() => document.querySelector(`#dmg-move-suggestions li[data-name="${name}"]`), `sugestao ${name}`, 15000);
  click(`#dmg-move-suggestions li[data-name="${name}"]`);
  await waitFor(() => {
    const info = document.querySelector('#dmg-move-info:not(.hidden)');
    const power = document.querySelector('#dmg-move-bp')?.textContent?.trim();
    return info && (!expectedPower || power === expectedPower);
  }, `golpe ${name} carregado`, 15000);
}

async function cleanupSmokeTeams() {
  if (typeof TeamStorage === 'undefined') return;
  const teams = await TeamStorage.getTeams();
  await Promise.all((teams || [])
    .filter(team => String(team.name || '').startsWith('__Smoke Pokebuild'))
    .map(team => TeamStorage.deleteTeam(team.id)));
}

async function step(name, fn) {
  report(name, 'run');
  try {
    await fn();
    results[results.length - 1] = { name, status: 'pass', detail: '' };
    paint();
  } catch (err) {
    results[results.length - 1] = { name, status: 'fail', detail: err.message };
    paint();
    throw err;
  }
}

async function runSmoke() {
  await waitFor(() => document.querySelector('#view-type-calc.active') && document.querySelector('#dmg-atk-name'), 'app inicializar');
  await cleanupSmokeTeams();

  await step('Gen-bar filtra tipos da Gen 1', async () => {
    click('.gen-btn[data-gen="gen1"]');
    await waitFor(() => ![...document.querySelectorAll('#tc-type1 option')].some(o => o.value === 'Fairy'), 'Fairy removido');
    assert(![...document.querySelectorAll('#tc-type1 option')].some(o => o.value === 'Steel'), 'Steel nao deveria aparecer na Gen 1');
  });

  await step('Builder filtra formatos e mostra preview de importacao', async () => {
    click('.gen-btn[data-gen="gen6plus"]');
    await openView('builder', 'Builder ativo');
    const formats = [...document.querySelectorAll('#bld-format option')].map(o => o.value);
    assert(formats.includes('scarlet-violet'), 'SV deveria aparecer na Gen 6+');
    assert(!formats.includes('red-blue'), 'RBY nao deveria aparecer na Gen 6+');
    click('#bld-import-btn');
    setValue('#bld-smogon-text', [
      'Pikachu @ Light Ball',
      'Ability: Static',
      'EVs: 252 SpA / 4 HP / 252 Spe',
      'Timid Nature',
      '- Thunderbolt',
      '- Volt Switch'
    ].join('\n'));
    await waitFor(() => document.querySelector('#bld-import-preview')?.textContent.includes('Preview: 1 Pokemon'), 'preview do import');
    click('#bld-import-cancel');
  });

  await step('Damage Simulator bloqueia calculo sem golpe carregado', async () => {
    await openView('damage-sim', 'Damage ativo');
    click('#dmg-calc-btn');
    const validation = document.querySelector('#dmg-validation')?.textContent || '';
    assert(validation.includes('Selecione um golpe'), 'Validacao de golpe obrigatorio nao apareceu');
  });

  await step('Damage Simulator usa motor Smogon local', async () => {
    setValue('#dmg-atk-name', 'Charizard');
    setValue('#dmg-def-name', 'Toxapex');
    await loadMove('Earthquake');
    click('#dmg-calc-btn');
    await waitFor(() => (document.querySelector('#dmg-validation')?.textContent || '').includes('Smogon Calc local'), 'motor Smogon', 15000);
    const result = document.querySelector('#dmg-results')?.textContent || '';
    const detail = document.querySelector('#dmg-engine-detail')?.textContent || '';
    assert(result.includes('Smogon Calc local'), 'Nota do motor Smogon nao apareceu');
    assert(detail.includes('Linha Smogon'), 'Linha detalhada do Smogon nao apareceu');
    assert(detail.includes('KO contextual'), 'Leitura contextual de KO nao apareceu');
    assert(detail.includes('guaranteed 3HKO'), 'Descricao do Smogon nao apareceu');
  });

  await step('Damage Simulator trava mecanicas por geracao', async () => {
    setSelect('#dmg-calc-gen', '7');
    await waitFor(() => !document.querySelector('#dmg-use-z')?.disabled && document.querySelector('#dmg-use-max')?.disabled, 'travas Gen 7');
    assert(document.querySelector('#dmg-atk-tera')?.disabled, 'Tera deveria ficar bloqueado na Gen 7');
    assert((document.querySelector('#dmg-format-notes')?.textContent || '').includes('Gen 7'), 'Nota de formato da Gen 7 nao apareceu');

    setSelect('#dmg-calc-gen', '8');
    await waitFor(() => !document.querySelector('#dmg-use-max')?.disabled && document.querySelector('#dmg-use-z')?.disabled, 'travas Gen 8');
    assert(!document.querySelector('#dmg-atk-dynamax')?.disabled, 'Dynamax deveria ficar liberado na Gen 8');

    setSelect('#dmg-calc-gen', '9');
    await waitFor(() => !document.querySelector('#dmg-atk-tera')?.disabled && document.querySelector('#dmg-use-max')?.disabled, 'travas Gen 9');
    assert(document.querySelector('#dmg-use-z')?.disabled, 'Z-Move deveria ficar bloqueado na Gen 9');
  });

  await step('Damage Simulator mostra pos-turno e KO contextual avancado', async () => {
    setSelect('#dmg-calc-gen', '9');
    click('[data-dmg-preset="hazards"]');
    setSelect('#dmg-def-status', 'toxic');
    setValue('#dmg-toxic-counter', '2');
    setSelect('#dmg-def-passive-item', 'black-sludge-poison');
    click('#dmg-calc-btn');
    await waitFor(() => (document.querySelector('#dmg-engine-detail')?.textContent || '').includes('after Stealth Rock'), 'KO contextual com hazards', 15000);
    const postTurn = document.querySelector('#dmg-postturn')?.textContent || '';
    assert(postTurn.includes('HP final estimado'), 'Barra pos-turno nao apareceu');
    assert(postTurn.includes('Toxic 2/16'), 'Toxic exato nao apareceu no pos-turno');
  });

  await step('Damage Simulator mostra recoil e recovery do motor', async () => {
    setSelect('#dmg-calc-gen', '9');
    setValue('#dmg-def-name', 'Blissey');
    await loadMove('Flare Blitz');
    click('#dmg-calc-btn');
    await waitFor(() => (document.querySelector('#dmg-engine-detail')?.textContent || '').includes('Recoil'), 'recoil Smogon', 15000);

    await loadMove('Drain Punch');
    click('#dmg-calc-btn');
    await waitFor(() => (document.querySelector('#dmg-engine-detail')?.textContent || '').includes('Recovery'), 'recovery Smogon', 15000);
  });

  await step('Analyzer importa Smogon e envia ao Builder', async () => {
    await openView('analyzer', 'Analyzer ativo');
    click('#az-import-btn');
    setValue('#az-smogon-text', [
      'Pikachu @ Light Ball',
      'Ability: Static',
      'Tera Type: Electric',
      'EVs: 252 SpA / 4 HP / 252 Spe',
      'Timid Nature',
      '- Thunderbolt',
      '- Volt Switch'
    ].join('\n'));
    click('#az-smogon-import');
    await waitFor(() => !document.querySelector('#az-to-builder-btn')?.disabled, 'botao para Builder liberado');
    click('#az-to-builder-btn');
    await waitFor(() => document.querySelector('#view-builder.active'), 'Builder recebeu Analyzer');
    assert(document.querySelector('.bld-pkmn-input[data-slot="0"]')?.value === 'Pikachu', 'Pokemon nao chegou ao Builder');
    assert(document.querySelector('.bld-move[data-slot="0"][data-move="0"]')?.value === 'Thunderbolt', 'Move nao chegou ao Builder');
  });

  await step('My Teams abre detalhe e exporta time salvo', async () => {
    const teamName = `__Smoke Pokebuild ${Date.now()}`;
    const id = await TeamStorage.saveTeam({
      name: teamName,
      format: 'scarlet-violet',
      isChampions: false,
      members: [{
        name: 'Pikachu',
        item: 'Light Ball',
        ability: 'Static',
        nature: 'Timid',
        teraType: 'Electric',
        moves: ['Thunderbolt', 'Volt Switch', '', ''],
        evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        level: 50,
        shiny: false,
        gender: 'male'
      }]
    });
    try {
      await openView('my-teams', 'My Teams ativo');
      await waitFor(() => document.querySelector(`.team-card-saved[data-id="${id}"]`), 'card do time smoke');
      click(`.team-card-saved[data-id="${id}"]`);
      await waitFor(() => !document.querySelector('#mt-detail')?.classList.contains('hidden'), 'detalhe aberto');
      assert((document.querySelector('#mt-detail-name')?.textContent || '').includes(teamName), 'Detalhe nao mostra o time criado');
      click('#mt-detail-export-btn');
      await waitFor(() => !document.querySelector('#export-modal')?.classList.contains('hidden'), 'modal de export');
      const exportText = document.querySelector('#export-text')?.value || '';
      assert(exportText.includes('Pikachu @ Light Ball'), 'Export Smogon nao contem Pikachu');
      click('#modal-copy-btn');
      await waitFor(() => (document.querySelector('#modal-copy-btn')?.textContent || '').includes('Copiado'), 'copiar export');
      click('#modal-close-btn');
    } finally {
      await TeamStorage.deleteTeam(id);
    }
  });

  await step('My Teams carrega galeria e resumo', async () => {
    await openView('my-teams', 'My Teams ativo');
    assert(document.querySelector('#mt-gallery'), 'Galeria nao encontrada');
    assert(document.querySelector('#mt-summary'), 'Resumo nao encontrado');
  });

  await step('Mobile 390px nao cria overflow horizontal global', async () => {
    document.documentElement.style.width = '390px';
    document.body.style.width = '390px';
    click('.nav-btn[data-view="builder"]');
    await wait(250);
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    assert(overflow <= 4, `Overflow horizontal: ${overflow}px`);
    document.documentElement.style.width = '';
    document.body.style.width = '';
  });

  await cleanupSmokeTeams();

  window.__POKEBUILD_SMOKE_DONE__ = { ok: true, results };
  document.body.dataset.smokeDone = 'ok';
}

function startSmoke() {
  ensurePanel();
  report('Inicializacao', 'run');
  runSmoke()
    .then(() => {
      results[0] = { name: 'Inicializacao', status: 'pass', detail: '' };
      paint();
    })
    .catch(err => {
      window.__POKEBUILD_SMOKE_DONE__ = { ok: false, error: err.message, results };
      document.body.dataset.smokeDone = 'fail';
      document.body.dataset.smokeError = err.message;
      console.error('[smoke]', err);
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startSmoke);
else startSmoke();
