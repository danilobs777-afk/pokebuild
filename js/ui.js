'use strict';

/**
 * ui.js - Utilitarios compartilhados de interface
 * ------------------------------------------------
 * Centraliza comportamentos que aparecem em varios modulos:
 * autocomplete, escape de HTML, toast e modal de confirmacao.
 *
 * Este arquivo nao conhece regras de Pokemon nem estado de times. Ele so
 * manipula DOM e callbacks recebidos pelos modulos donos da regra.
 */

const PokeBuildUI = (() => {
  const autocompletePairs = new Map();
  let globalAutocompleteCloserBound = false;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function selectableItems(suggestEl) {
    return [...suggestEl.querySelectorAll('li')]
      .filter(li => !li.classList.contains('sug-loading') && !li.classList.contains('sug-error'));
  }

  function hideSuggestions(suggestEl) {
    suggestEl?.classList.add('hidden');
  }

  function typePills(types = [], pillClass = 'tpill') {
    return types
      .filter(Boolean)
      .map(type => `<span class="${pillClass} t-${escapeHtml(type)}">${escapeHtml(type)}</span>`)
      .join('');
  }

  function renderPokemonSuggestion(name, types = []) {
    return `<li data-name="${escapeHtml(name)}" class="ac-item-rich"><span>${escapeHtml(name)}</span><span class="ac-types">${typePills(types)}</span></li>`;
  }

  function moveCategoryLabel(category) {
    if (category === 'physical') return 'Physical';
    if (category === 'special') return 'Special';
    if (category === 'status') return 'Status';
    return '';
  }

  function renderMoveSuggestion(name, info = {}, opts = {}) {
    const type = info?.type;
    const category = moveCategoryLabel(info?.category);
    const typeBadge = type ? `<span class="tc t-${escapeHtml(type)} tc-dim">${escapeHtml(type)}</span>` : '';
    const categoryBadge = opts.showCategory && category ? `<span class="tc tc-dim">${category}</span>` : '';
    const meta = [typeBadge, categoryBadge].filter(Boolean).join(' ');
    const richClass = opts.rich ? ' class="ac-item-rich"' : '';
    return `<li data-name="${escapeHtml(name)}"${richClass}><span>${escapeHtml(name)}</span>${meta ? ` <span class="ac-types">${meta}</span>` : ''}</li>`;
  }

  function renderMoveSuggestions(names = [], infoMap = {}, opts = {}) {
    return names.map(name => renderMoveSuggestion(name, infoMap[name], opts)).join('');
  }

  function bindAutocompleteKeys(inputEl, suggestEl, onPick) {
    if (!inputEl || !suggestEl || inputEl.dataset.acKeysBound === 'true') return;
    inputEl.dataset.acKeysBound = 'true';
    let activeIndex = -1;

    function setActive(index) {
      const items = selectableItems(suggestEl);
      if (!items.length) {
        activeIndex = -1;
        return;
      }
      activeIndex = (index + items.length) % items.length;
      items.forEach((li, i) => {
        const active = i === activeIndex;
        li.classList.toggle('active', active);
        li.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    inputEl.addEventListener('keydown', e => {
      if (suggestEl.classList.contains('hidden')) return;
      const items = selectableItems(suggestEl);
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIndex - 1);
      } else if (e.key === 'Enter') {
        if (activeIndex < 0) return;
        e.preventDefault();
        onPick(items[activeIndex]);
        activeIndex = -1;
      } else if (e.key === 'Escape') {
        hideSuggestions(suggestEl);
        activeIndex = -1;
      }
    });

    inputEl.addEventListener('input', () => {
      activeIndex = -1;
    });
  }

  function bindAutocomplete(inputEl, suggestEl, options = {}) {
    if (!inputEl || !suggestEl) return;
    bindAutocompleteKeys(inputEl, suggestEl, options.onPick || (() => {}));
    autocompletePairs.set(suggestEl, { inputEl, suggestEl });

    if (inputEl.dataset.acBlurBound !== 'true') {
      inputEl.dataset.acBlurBound = 'true';
      inputEl.addEventListener('blur', () => {
        setTimeout(() => hideSuggestions(suggestEl), 150);
      });
    }
    enableAutocompleteAutoClose();
  }

  function enableAutocompleteAutoClose() {
    if (globalAutocompleteCloserBound) return;
    globalAutocompleteCloserBound = true;
    document.addEventListener('click', e => {
      for (const [key, pair] of autocompletePairs) {
        if (!pair.inputEl.isConnected || !pair.suggestEl.isConnected) {
          autocompletePairs.delete(key);
          continue;
        }
        if (pair.inputEl.contains(e.target) || pair.suggestEl.contains(e.target)) continue;
        hideSuggestions(pair.suggestEl);
      }
    });
  }

  function createConfirmController({ modal, messageEl, okBtn, cancelBtn }) {
    let pendingCallback = null;
    const close = () => {
      pendingCallback = null;
      modal?.classList.add('hidden');
    };
    okBtn?.addEventListener('click', () => {
      const onOk = pendingCallback;
      close();
      onOk?.();
    });
    cancelBtn?.addEventListener('click', close);
    modal?.addEventListener('click', e => {
      if (e.target === modal) close();
    });
    return {
      show(message, onOk) {
        if (messageEl) messageEl.textContent = message;
        pendingCallback = typeof onOk === 'function' ? onOk : null;
        modal?.classList.remove('hidden');
      },
      close,
    };
  }

  function showToast({ id = 'app-toast', message, actionLabel, onAction }) {
    if (document.getElementById(id)) return;
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'app-update-toast';
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => onAction?.());
      toast.appendChild(btn);
    }
    document.body.appendChild(toast);
  }

  return {
    bindAutocomplete,
    bindAutocompleteKeys,
    createConfirmController,
    enableAutocompleteAutoClose,
    escapeHtml,
    hideSuggestions,
    renderMoveSuggestion,
    renderMoveSuggestions,
    renderPokemonSuggestion,
    typePills,
    showToast,
  };
})();

window.PokeBuildUI = PokeBuildUI;
