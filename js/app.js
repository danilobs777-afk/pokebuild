'use strict';

/**
 * app.js — Shell principal da aplicação
 * --------------------------------------
 * Responsável por: navegação entre views, sistema de tabs, modais globais
 * (exportação e confirmação) e inicialização de todos os módulos.
 *
 * Ordem de inicialização (deve respeitar a ordem de <script> no HTML):
 *   data.js → generation.js → ui.js → api.js → storage.js → typeCalc.js
 *   → analyzer.js → builder.js → teams.js → dmgCalc.js → app.js
 *
 * Dependências: todos os módulos acima (TypeCalc, Analyzer, Builder,
 *   TeamsView, DmgCalc, PokeAPI, GenerationRules, PokeBuildUI).
 */

const App = (() => {
  const views = ['type-calc', 'analyzer', 'builder', 'my-teams', 'damage-sim'];
  let confirmController = null;

  /**
   * Ativa a view indicada e desativa as demais.
   * Efeitos colaterais: TeamsView.refresh() e Builder.loadDraft() são
   * chamados ao navegar para suas respectivas views.
   */
  function navigate(viewId) {
    views.forEach(v => {
      document.getElementById('view-' + v)?.classList.toggle('active', v === viewId);
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });
    if (viewId === 'my-teams') TeamsView.refresh();
    if (viewId === 'builder') Builder.loadDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function requestNavigate(viewId, options = {}) {
    const runNavigation = () => {
      options.beforeNavigate?.();
      navigate(viewId);
    };
    const leavingBuilder = document.getElementById('view-builder')?.classList.contains('active') && viewId !== 'builder';
    if (leavingBuilder && Builder.hasUnsavedChanges?.()) {
      showConfirm('Voce tem alteracoes nao salvas no Builder. Sair mesmo assim?', runNavigation);
      return false;
    }
    runNavigation();
    return true;
  }

  function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => requestNavigate(btn.dataset.view));
    });
  }

  function initTabs() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn-ui[data-tab]');
      if (!btn) return;
      const container = btn.closest('.tabs')?.nextElementSibling?.parentElement || btn.closest('.view') || document;
      const tabId = btn.dataset.tab;
      btn.closest('.tabs').querySelectorAll('.tab-btn-ui').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
    });

    document.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn-ui[data-sub]');
      if (!btn) return;
      const subId = btn.dataset.sub;
      btn.closest('.tabs').querySelectorAll('.tab-btn-ui').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const panels = btn.closest('.tab-panel')?.querySelectorAll('.sub-panel') ||
                     btn.closest('.view')?.querySelectorAll('.sub-panel');
      panels?.forEach(p => p.classList.toggle('active', p.id === subId));
    });
  }

  function initModals() {
    const exportModal = document.getElementById('export-modal');
    document.getElementById('modal-close-btn').addEventListener('click', () => exportModal.classList.add('hidden'));
    document.getElementById('modal-copy-btn').addEventListener('click', async () => {
      const ta = document.getElementById('export-text');
      ta.select();
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(ta.value);
        else document.execCommand('copy');
      } catch {
        document.execCommand('copy');
      }
      document.getElementById('modal-copy-btn').textContent = 'Copiado!';
      setTimeout(() => { document.getElementById('modal-copy-btn').textContent = 'Copiar para Área de Transferência'; }, 1800);
    });
    document.getElementById('modal-download-btn').addEventListener('click', () => {
      const text = document.getElementById('export-text').value;
      if (!text) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = _exportFilename + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      document.getElementById('modal-download-btn').textContent = 'Arquivo salvo';
      setTimeout(() => { document.getElementById('modal-download-btn').textContent = 'Salvar .txt'; }, 1800);
    });
    exportModal.addEventListener('click', e => { if (e.target === exportModal) exportModal.classList.add('hidden'); });

    const confirmModal = document.getElementById('confirm-modal');
    confirmController = PokeBuildUI.createConfirmController({
      modal: confirmModal,
      messageEl: document.getElementById('confirm-msg'),
      okBtn: document.getElementById('confirm-ok-btn'),
      cancelBtn: document.getElementById('confirm-cancel-btn'),
    });
  }

  // ── Seletor de geração ────────────────────────────────────────
  let _currentGen = 'gen6plus';

  function setGen(gen) {
    _currentGen = gen;
    GenerationRules.setActive(gen);
    document.querySelectorAll('.gen-btn').forEach(b => b.classList.toggle('active', b.dataset.gen === gen));
    TypeCalc.rerender();
    Analyzer.rerender();
    Builder.syncWithGlobalGen?.();
    DmgCalc.rerender?.();
  }

  function initGenSelector() {
    document.querySelectorAll('.gen-btn').forEach(btn => {
      btn.addEventListener('click', () => setGen(btn.dataset.gen));
    });
  }

  function initAffiliateRailScroll() {
    const rails = Array.from(document.querySelectorAll('.affiliate-rail'));
    if (!rails.length) return;

    const desktopRails = window.matchMedia('(min-width: 1421px)');
    let scrollFrame = 0;

    const syncRails = () => {
      if (!desktopRails.matches) {
        rails.forEach(rail => { rail.scrollTop = 0; });
        return;
      }
      const page = document.documentElement;
      const pageMax = Math.max(1, page.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / pageMax));
      rails.forEach(rail => {
        const railMax = Math.max(0, rail.scrollHeight - rail.clientHeight);
        rail.scrollTop = Math.round(railMax * progress);
      });
    };

    const requestSync = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        syncRails();
      });
    };

    window.addEventListener('scroll', requestSync, { passive: true });
    window.addEventListener('resize', requestSync);
    desktopRails.addEventListener?.('change', requestSync);
    requestSync();
  }

  let _exportFilename = 'time';

  function showExportModal(text, filename) {
    _exportFilename = (filename || 'time').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'time';
    document.getElementById('export-text').value = text;
    document.getElementById('modal-copy-btn').textContent = 'Copiar para Ãrea de TransferÃªncia';
    document.getElementById('modal-download-btn').textContent = 'Salvar .txt';
    document.getElementById('export-modal').classList.remove('hidden');
  }

  function showConfirm(msg, onOk) {
    confirmController?.show(msg, onOk);
  }

  function init() {
    initNav();
    initTabs();
    initModals();
    initGenSelector();
    initAffiliateRailScroll();
    TypeCalc.init();
    Analyzer.init();
    Builder.init();
    TeamsView.init();
    DmgCalc.init();
    // Pré-carrega lista de golpes em background para que autocomplete responda imediatamente
    PokeAPI.ensureMoveList().then(list => { MOVE_NAMES = list; }).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, requestNavigate, showExportModal, showConfirm, getGen: () => _currentGen, setGen };
})();
