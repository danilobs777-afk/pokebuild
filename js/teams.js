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

  function formatLabel(team) {
    return GAME_VERSIONS.find(v => v.key === team.format)?.label || team.format || '-';
  }

  function dateLabel(ts) {
    return ts ? new Date(ts).toLocaleDateString('pt-BR') : '-';
  }

  function memberCount(team) {
    return (team.members || []).filter(m => m.name?.trim()).length;
  }

  function formatCountText(count) {
    return `${count} ${count === 1 ? 'membro' : 'membros'}`;
  }

  function renderSummary(visible) {
    const el = document.getElementById('mt-summary');
    if (!el) return;
    const total = teams.length;
    const showing = visible.length;
    const members = visible.reduce((sum, team) => sum + memberCount(team), 0);
    el.textContent = searchQuery.trim()
      ? `${showing} de ${total} times · ${members} Pokemon`
      : `${total} ${total === 1 ? 'time salvo' : 'times salvos'} · ${members} Pokemon`;
  }

  function categoryLabel(category) {
    if (category === 'physical') return 'Physical';
    if (category === 'special') return 'Special';
    return 'Status';
  }

  // ── Gallery ───────────────────────────────────────────────────
  async function refresh() {
    teams = await TeamStorage.getTeams();
    teams.sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
    renderGallery();
  }

  function filteredTeams() {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return teams;
    return teams.filter(team => {
      if (team.name?.toLowerCase().includes(q)) return true;
      if (formatLabel(team).toLowerCase().includes(q)) return true;
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
    renderSummary(visible);

    if (!visible.length) {
      gallery.innerHTML = '';
      empty.classList.remove('hidden');
      if (teams.length && searchQuery) {
        empty.innerHTML = `<p>Nenhum time encontrado para <strong>"${escHtml(searchQuery)}"</strong>.</p>`;
      } else {
        empty.innerHTML = '<p>Nenhum time salvo ainda.<br>Use o <strong>Team Builder</strong> para criar e salvar seu primeiro time!</p>';
      }
      return;
    }
    empty.classList.add('hidden');

    gallery.innerHTML = visible.map(team => {
      const members = team.members || [];
      const filled = members.filter(m => m.name?.trim());
      const format = formatLabel(team);
      const date = dateLabel(team.updated || team.created);

      return `<div class="team-card-saved" data-id="${team.id}" role="button" tabindex="0">
        <div class="team-card-top">
          <div>
            <div class="team-card-name">${escHtml(team.name || 'Time sem nome')}</div>
            <div class="team-card-format">${escHtml(format)} · Atualizado ${date}</div>
          </div>
          <span class="team-card-count">${formatCountText(filled.length)}</span>
        </div>
        <div class="team-card-sprites" id="tcs-sprites-${team.id}">
          ${filled.slice(0, 6).map((m, mi) =>
            `<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png"
              class="tc-sprite" data-member="${mi}" alt="${escHtml(m.name)}" loading="lazy">`
          ).join('')}
        </div>
        <div class="team-card-members">${filled.map(m => `<span>${escHtml(m.name)}</span>`).join('')}</div>
      </div>`;
    }).join('');

    gallery.querySelectorAll('.team-card-saved').forEach(card => {
      card.addEventListener('click', () => openDetail(parseInt(card.dataset.id)));
      card.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openDetail(parseInt(card.dataset.id));
      });
    });

    // Carrega sprites de forma assíncrona após renderizar o HTML
    visible.forEach(team => {
      const members = team.members || [];
      members.filter(m => m.name?.trim()).slice(0, 6).forEach((m, mi) => {
        if (!m.name) return;
        const _res = spriteApiName(m.name);
        const applyGallery = data => {
          const wrap = document.getElementById(`tcs-sprites-${team.id}`);
          if (!wrap) return;
          const img = wrap.querySelector(`[data-member="${mi}"]`);
          if (!img) return;
          img.src = PokeAPI.pixelSpriteUrl(data, !!m.shiny, m.gender === 'female');
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

    const format = formatLabel(team);
    const date   = dateLabel(team.created);
    const updated = team.updated && team.updated !== team.created ? ` · Atualizado ${dateLabel(team.updated)}` : '';
    const isChamp = team.isChampions || team.format === 'champions';
    const count = memberCount(team);

    document.getElementById('mt-detail-header').innerHTML = `
      <div class="mt-detail-title-row">
        <div>
          <div class="detail-name" id="mt-detail-name">${escHtml(team.name || 'Time sem nome')}</div>
          <div class="detail-meta">${escHtml(format)} · ${formatCountText(count)} · Salvo em ${date}${updated}</div>
        </div>
        <div id="mt-rename-form" class="mt-rename-form hidden">
          <input type="text" id="mt-rename-input" class="text-input" value="${escHtml(team.name || '')}" autocomplete="off">
          <button class="btn-secondary btn-sm" id="mt-rename-save" type="button">Salvar</button>
          <button class="btn-secondary btn-sm" id="mt-rename-cancel" type="button">Cancelar</button>
          <div id="mt-rename-status" class="mt-rename-status"></div>
        </div>
      </div>
    `;

    const members = (team.members || []).filter(m => m.name?.trim());
    document.getElementById('mt-detail-builds').innerHTML = members.map((m, i) => buildCard(m, i, isChamp)).join('');
    hydrateDetailMoveBadges();

    // Carrega sprites HD na view de detalhe
    members.forEach((m, i) => {
      if (!m.name) return;
      const _resD = spriteApiName(m.name);
      const applyHD = data => {
        const wrap = document.getElementById(`mt-detail-sprite-${i}`);
        if (!wrap) return;
        const src = PokeAPI.officialArtworkUrl(data, !!m.shiny);
        wrap.innerHTML = `<img src="${src}" class="build-sprite" alt="${escHtml(m.name)}">`;
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
    const itemIcon = m.item
      ? `<img class="mt-item-icon" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${PokeAPI.apiName(m.item)}.png" onerror="this.classList.add('hidden')" alt="">`
      : '';
    const evTotal = STAT_KEYS.reduce((sum, k) => sum + (m.evs?.[k] || 0), 0);

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
    const traits = [
      m.gender === 'female' ? 'Female' : '',
      m.shiny ? 'Shiny' : '',
      m.name?.endsWith('-Gmax') ? 'Gigantamax' : ''
    ].filter(Boolean);

    return `<div class="build-card">
      <div class="build-header">
        <div id="mt-detail-sprite-${idx}" class="build-sprite-wrap"></div>
        <div class="build-info">
          <div class="build-name">${escHtml(m.name)}</div>
          <div class="build-types">${typePills}</div>
          ${traits.length ? `<div class="mt-traits">${traits.map(t => `<span>${escHtml(t)}</span>`).join('')}</div>` : ''}
          ${m.item ? `<div class="build-item">${itemIcon}@ ${escHtml(m.item)}</div>` : ''}
        </div>
      </div>
      <div class="build-fields">
        ${m.ability ? `<div class="build-field"><span class="build-field-label">Habilidade:</span> ${escHtml(m.ability)}</div>` : ''}
        ${m.teraType ? `<div class="build-field"><span class="build-field-label">Tera Type:</span> <span class="tpill t-${escHtml(m.teraType)} mt-mini-pill">${escHtml(m.teraType)}</span></div>` : ''}
        ${m.nature ? `<div class="build-field"><span class="build-field-label">Nature:</span> ${escHtml(m.nature)}</div>` : ''}
        ${ivLine}
      </div>
      <div class="build-moves">
        ${moves.length ? moves.map(mv => `<div class="build-move" data-move="${escHtml(mv)}"><span class="mt-move-name">${escHtml(mv)}</span><span class="mt-move-badges"></span></div>`).join('') : '<div class="build-move muted">Sem moves</div>'}
      </div>
      <div class="build-ev-section">
        <div class="build-field-label">${evLabel}s · ${evTotal}</div>
        ${evBars}
      </div>
    </div>`;
  }

  function hydrateDetailMoveBadges() {
    const moveEls = [...document.querySelectorAll('#mt-detail-builds .build-move[data-move]')];
    const names = [...new Set(moveEls.map(el => el.dataset.move).filter(Boolean))];
    if (!names.length) return;
    PokeAPI.getMovesInfo(names).then(infoMap => {
      moveEls.forEach(el => {
        const info = infoMap[el.dataset.move];
        if (!info) return;
        const badgeEl = el.querySelector('.mt-move-badges');
        if (!badgeEl) return;
        badgeEl.innerHTML = `
          <span class="tc t-${info.type} tc-dim">${info.type}</span>
          <span class="tc tc-dim">${categoryLabel(info.category)}</span>
        `;
      });
    }).catch(() => {});
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
      const gen = GAME_VERSIONS.find(v => v.key === team.format)?.gen ?? 9;
      App.showExportModal(smogonTeamText(team.members || [], { isChampions: isChamp, gen }), team.name || 'time');
    });
  }

  function showRenameForm() {
    const form = document.getElementById('mt-rename-form');
    const input = document.getElementById('mt-rename-input');
    const name = document.getElementById('mt-detail-name');
    if (!form || !input) return;
    form.classList.remove('hidden');
    name?.classList.add('hidden');
    input.focus();
    input.select();
  }

  function hideRenameForm() {
    document.getElementById('mt-rename-form')?.classList.add('hidden');
    document.getElementById('mt-detail-name')?.classList.remove('hidden');
    const status = document.getElementById('mt-rename-status');
    if (status) status.textContent = '';
  }

  async function saveRename() {
    if (!currentTeamId) return;
    const input = document.getElementById('mt-rename-input');
    const status = document.getElementById('mt-rename-status');
    const trimmed = input?.value.trim() || '';
    if (!trimmed) {
      if (status) status.textContent = 'Digite um nome.';
      return;
    }
    const duplicate = teams.find(t =>
      t.id !== currentTeamId && t.name?.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      if (status) status.textContent = 'Ja existe um time com esse nome.';
      return;
    }
    await TeamStorage.updateTeam(currentTeamId, { name: trimmed });
    await refresh();
    await openDetail(currentTeamId);
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
    document.getElementById('mt-detail-rename-btn').addEventListener('click', showRenameForm);
    document.getElementById('mt-detail-export-btn').addEventListener('click', exportCurrentTeam);
    document.getElementById('mt-detail-edit-btn').addEventListener('click', editInBuilder);
    document.getElementById('mt-detail-delete-btn').addEventListener('click', deleteCurrentTeam);

    document.getElementById('mt-detail-header').addEventListener('click', e => {
      if (e.target.closest('#mt-rename-save')) saveRename();
      if (e.target.closest('#mt-rename-cancel')) hideRenameForm();
    });

    document.getElementById('mt-detail-header').addEventListener('keydown', e => {
      if (e.target.id !== 'mt-rename-input') return;
      if (e.key === 'Enter') saveRename();
      if (e.key === 'Escape') hideRenameForm();
    });

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
