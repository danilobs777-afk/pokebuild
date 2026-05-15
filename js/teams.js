'use strict';

/**
 * teams.js — Galeria e visualização de times salvos
 * --------------------------------------------------
 * Lê times do IndexedDB via TeamStorage e os exibe em dois modos:
 *   - Galeria (cards com sprite e nome dos membros)
 *   - Detalhe (build completa com EVs, natureza, moves e sprite HD)
 *
 * Sprites são carregados de forma assíncrona após renderização do HTML,
 * exibindo placeholder enquanto o fetch não conclui.
 *
 * Dependências: data.js (STAT_KEYS, STAT_LABELS, GAME_VERSIONS, POKEMON_DB),
 *   storage.js (TeamStorage), api.js (PokeAPI), app.js (App.showExportModal/showConfirm).
 */

const TeamsView = (() => {
  let teams = [];
  let currentTeamId = null;
  let searchQuery = '';

  // ── Gallery ───────────────────────────────────────────────────
  async function refresh() {
    teams = await TeamStorage.getTeams();
    renderGallery();
  }

  function filteredTeams() {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return teams;
    return teams.filter(team => {
      if (team.name?.toLowerCase().includes(q)) return true;
      return (team.members || []).some(m => m.name?.toLowerCase().includes(q));
    });
  }

  function renderGallery() {
    const gallery = document.getElementById('mt-gallery');
    const empty   = document.getElementById('mt-empty');
    const detail  = document.getElementById('mt-detail');

    detail.classList.add('hidden');
    gallery.classList.remove('hidden');
    empty.classList.add('hidden');

    const visible = filteredTeams();

    if (!visible.length) {
      gallery.innerHTML = '';
      empty.classList.remove('hidden');
      if (teams.length && searchQuery) {
        empty.innerHTML = `<p>Nenhum time encontrado para <strong>"${escHtml(searchQuery)}"</strong>.</p>`;
      }
      return;
    }
    empty.classList.add('hidden');

    gallery.innerHTML = visible.map(team => {
      const members = team.members || [];
      const spritePromises = members.slice(0, 6).map(m => m.name);
      const format = GAME_VERSIONS.find(v => v.key === team.format)?.label || team.format || '—';
      const date = team.created ? new Date(team.created).toLocaleDateString('pt-BR') : '';

      return `<div class="team-card-saved" data-id="${team.id}">
        <div class="team-card-name">${escHtml(team.name)}</div>
        <div class="team-card-format">${escHtml(format)} · ${date}</div>
        <div class="team-card-sprites" id="tcs-sprites-${team.id}">
          ${members.slice(0, 6).map(m =>
            `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png"
              class="tc-sprite" data-name="${escHtml(m.name)}" alt="${escHtml(m.name)}" loading="lazy">`
          ).join('')}
        </div>
        <div class="team-card-members">${members.map(m => escHtml(m.name)).join(', ')}</div>
      </div>`;
    }).join('');

    gallery.querySelectorAll('.team-card-saved').forEach(card => {
      card.addEventListener('click', () => openDetail(parseInt(card.dataset.id)));
    });

    // Carrega sprites de forma assíncrona após renderizar o HTML
    visible.forEach(team => {
      const members = team.members || [];
      members.slice(0, 6).forEach(m => {
        if (!m.name) return;
        const _res = spriteApiName(m.name);
        const applyGallery = data => {
          const wrap = document.getElementById(`tcs-sprites-${team.id}`);
          if (!wrap) return;
          const img = wrap.querySelector(`[data-name="${m.name}"]`);
          if (!img) return;
          const sp = data.sprites;
          img.src = m.shiny
            ? (sp.front_shiny   || PokeAPI.spriteUrl(data.id, false, true))
            : (sp.front_default || PokeAPI.spriteUrl(data.id, false, false));
        };
        PokeAPI.getPokemon(_res).then(applyGallery)
          .catch(() => _res !== m.name
            ? PokeAPI.getPokemon(m.name).then(applyGallery).catch(() => {})
            : null);
      });
    });
  }

  // ── Detail view ───────────────────────────────────────────────
  async function openDetail(id) {
    currentTeamId = id;
    const team = await TeamStorage.getTeam(id);
    if (!team) return;

    const gallery = document.getElementById('mt-gallery');
    const detail  = document.getElementById('mt-detail');
    const empty   = document.getElementById('mt-empty');

    gallery.classList.add('hidden');
    empty.classList.add('hidden');
    detail.classList.remove('hidden');

    const format = GAME_VERSIONS.find(v => v.key === team.format)?.label || team.format || '—';
    const date   = team.created ? new Date(team.created).toLocaleDateString('pt-BR') : '';
    const isChamp = team.isChampions || team.format === 'champions';

    document.getElementById('mt-detail-header').innerHTML = `
      <div class="detail-name">${escHtml(team.name)}</div>
      <div class="detail-meta">${escHtml(format)} · Salvo em ${date}</div>
    `;

    const members = team.members || [];
    document.getElementById('mt-detail-builds').innerHTML = members.map((m, i) => buildCard(m, i, isChamp)).join('');

    // Carrega sprites HD na view de detalhe
    members.forEach((m, i) => {
      if (!m.name) return;
      const _resD = spriteApiName(m.name);
      const applyHD = data => {
        const wrap = document.getElementById(`mt-detail-sprite-${i}`);
        if (!wrap) return;
        const oa  = data.sprites?.other?.['official-artwork'];
        const src = m.shiny
          ? (oa?.front_shiny    || data.sprites?.front_shiny    || PokeAPI.spriteUrl(data.id, true, true))
          : (oa?.front_default  || PokeAPI.spriteUrl(data.id, true, false));
        wrap.innerHTML = `<img src="${src}" class="build-sprite" alt="${m.name}">`;
      };
      PokeAPI.getPokemon(_resD).then(applyHD)
        .catch(() => _resD !== m.name
          ? PokeAPI.getPokemon(m.name).then(applyHD).catch(() => {})
          : null);
    });

    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildCard(m, idx, isChamp) {
    const evLabel = isChamp ? 'SP' : 'EV';
    const evMax   = isChamp ? 32 : 252;

    const types = POKEMON_DB[m.name] || [];
    const typePills = types.filter(Boolean).map(t => `<span class="tpill t-${t}">${t}</span>`).join('');

    const evBars = STAT_KEYS.map(k => {
      const val = m.evs?.[k] || 0;
      const pct = Math.min((val / evMax) * 100, 100);
      return `<div class="ev-row">
        <span class="ev-stat-label">${STAT_LABELS[k]}</span>
        <div class="ev-bar-wrap"><div class="ev-bar-fill" style="width:${pct}%"></div></div>
        <span class="ev-num">${val} ${evLabel}</span>
      </div>`;
    }).join('');

    const ivLine = isChamp ? '' :
      `<div class="build-field"><span class="build-field-label">IVs:</span> ${
        STAT_KEYS.filter(k => (m.ivs?.[k] ?? 31) !== 31)
          .map(k => `${m.ivs[k]} ${STAT_LABELS[k]}`).join(' / ') || '31 todos'
      }</div>`;

    const moves = (m.moves || []).filter(mv => mv.trim());

    return `<div class="build-card">
      <div class="build-header">
        <div id="mt-detail-sprite-${idx}" class="build-sprite-wrap"></div>
        <div class="build-info">
          <div class="build-name">${escHtml(m.name)}</div>
          <div class="build-types">${typePills}</div>
          ${m.item ? `<div class="build-item">@ ${escHtml(m.item)}</div>` : ''}
        </div>
      </div>
      <div class="build-fields">
        ${m.ability ? `<div class="build-field"><span class="build-field-label">Habilidade:</span> ${escHtml(m.ability)}</div>` : ''}
        ${m.teraType ? `<div class="build-field"><span class="build-field-label">Tera Type:</span> <span class="tpill t-${escHtml(m.teraType)}" style="font-size:0.75em;padding:1px 7px">${escHtml(m.teraType)}</span></div>` : ''}
        ${m.nature ? `<div class="build-field"><span class="build-field-label">Nature:</span> ${escHtml(m.nature)}</div>` : ''}
        ${ivLine}
      </div>
      <div class="build-moves">
        ${moves.map(mv => `<div class="build-move">— ${escHtml(mv)}</div>`).join('')}
      </div>
      <div class="build-ev-section">
        <div class="build-field-label">${evLabel}s</div>
        ${evBars}
      </div>
    </div>`;
  }

  /**
   * Escapa caracteres HTML em strings vindas do usuário antes de inserir no DOM.
   * Necessário porque nomes de times e Pokémon são renderizados via innerHTML.
   */
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function exportCurrentTeam() {
    if (!currentTeamId) return;
    TeamStorage.getTeam(currentTeamId).then(team => {
      if (!team) return;
      const isChamp = team.isChampions || team.format === 'champions';
      const lines = [];
      (team.members || []).forEach(m => {
        if (isChamp) {
          lines.push(`${m.name} @ ${m.item || '(sem item)'}`);
          lines.push(`Ability: ${m.ability || '—'}`);
          if (m.teraType) lines.push(`Tera Type: ${m.teraType}`);
          lines.push(`Nature: ${m.nature}`);
          lines.push(`SP Spread: ${STAT_KEYS.map(k => `${STAT_LABELS[k]} ${m.evs?.[k] || 0}`).join(' / ')}`);
          (m.moves || []).filter(mv => mv).forEach(mv => lines.push(`- ${mv}`));
        } else {
          lines.push(`${m.name} @ ${m.item || '(sem item)'}`);
          lines.push(`Ability: ${m.ability || '—'}`);
          if (m.teraType) lines.push(`Tera Type: ${m.teraType}`);
          lines.push(`Level: ${m.level || 50}`);
          const evParts = STAT_KEYS.filter(k => (m.evs?.[k] || 0) > 0).map(k => `${m.evs[k]} ${STAT_LABELS[k]}`);
          if (evParts.length) lines.push(`EVs: ${evParts.join(' / ')}`);
          lines.push(`${m.nature} Nature`);
          const ivParts = STAT_KEYS.filter(k => (m.ivs?.[k] ?? 31) !== 31).map(k => `${m.ivs[k]} ${STAT_LABELS[k]}`);
          if (ivParts.length) lines.push(`IVs: ${ivParts.join(' / ')}`);
          (m.moves || []).filter(mv => mv).forEach(mv => lines.push(`- ${mv}`));
        }
        lines.push('');
      });
      App.showExportModal(lines.join('\n'), team.name || 'time');
    });
  }

  function renameCurrentTeam() {
    if (!currentTeamId) return;
    TeamStorage.getTeam(currentTeamId).then(team => {
      if (!team) return;
      const newName = prompt('Novo nome do time:', team.name || '');
      if (newName === null) return;
      const trimmed = newName.trim();
      if (!trimmed) return;
      TeamStorage.updateTeam(currentTeamId, { name: trimmed }).then(() => {
        refresh();
        openDetail(currentTeamId);
      });
    });
  }

  function deleteCurrentTeam() {
    if (!currentTeamId) return;
    App.showConfirm('Excluir este time permanentemente?', async () => {
      await TeamStorage.deleteTeam(currentTeamId);
      currentTeamId = null;
      await refresh();
    });
  }

  function editInBuilder() {
    if (!currentTeamId) return;
    TeamStorage.getTeam(currentTeamId).then(team => {
      if (!team) return;
      Builder.loadTeam(team);
      App.navigate('builder');
    });
  }

  function init() {
    document.getElementById('mt-back-btn').addEventListener('click', renderGallery);
    document.getElementById('mt-detail-rename-btn').addEventListener('click', renameCurrentTeam);
    document.getElementById('mt-detail-export-btn').addEventListener('click', exportCurrentTeam);
    document.getElementById('mt-detail-edit-btn').addEventListener('click', editInBuilder);
    document.getElementById('mt-detail-delete-btn').addEventListener('click', deleteCurrentTeam);

    const searchEl = document.getElementById('mt-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        searchQuery = searchEl.value;
        renderGallery();
      });
    }
  }

  return { init, refresh };
})();
