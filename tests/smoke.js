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

function setValue(selector, value) {
  const el = document.querySelector(selector);
  assert(el, `Campo nao encontrado: ${selector}`);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el;
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

  await step('Gen-bar filtra tipos da Gen 1', async () => {
    click('.gen-btn[data-gen="gen1"]');
    await waitFor(() => ![...document.querySelectorAll('#tc-type1 option')].some(o => o.value === 'Fairy'), 'Fairy removido');
    assert(![...document.querySelectorAll('#tc-type1 option')].some(o => o.value === 'Steel'), 'Steel nao deveria aparecer na Gen 1');
  });

  await step('Builder filtra formatos e mostra preview de importacao', async () => {
    click('.gen-btn[data-gen="gen6plus"]');
    click('.nav-btn[data-view="builder"]');
    await waitFor(() => document.querySelector('#view-builder.active'), 'Builder ativo');
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
    click('.nav-btn[data-view="damage-sim"]');
    await waitFor(() => document.querySelector('#view-damage-sim.active'), 'Damage ativo');
    click('#dmg-calc-btn');
    const validation = document.querySelector('#dmg-validation')?.textContent || '';
    assert(validation.includes('Selecione um golpe'), 'Validacao de golpe obrigatorio nao apareceu');
  });

  await step('Damage Simulator usa motor Smogon local', async () => {
    setValue('#dmg-atk-name', 'Charizard');
    setValue('#dmg-def-name', 'Toxapex');
    setValue('#dmg-move-input', 'Earthquake');
    await waitFor(() => document.querySelector('#dmg-move-suggestions li[data-name="Earthquake"]'), 'sugestao Earthquake', 15000);
    click('#dmg-move-suggestions li[data-name="Earthquake"]');
    await waitFor(() => document.querySelector('#dmg-move-info:not(.hidden)'), 'golpe carregado', 15000);
    click('#dmg-calc-btn');
    await waitFor(() => (document.querySelector('#dmg-validation')?.textContent || '').includes('Smogon Calc local'), 'motor Smogon', 15000);
    const result = document.querySelector('#dmg-results')?.textContent || '';
    assert(result.includes('Smogon Calc local'), 'Nota do motor Smogon nao apareceu');
    assert(result.includes('guaranteed 3HKO'), 'Descricao do Smogon nao apareceu');
  });

  await step('My Teams carrega galeria e resumo', async () => {
    click('.nav-btn[data-view="my-teams"]');
    await waitFor(() => document.querySelector('#view-my-teams.active'), 'My Teams ativo');
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
