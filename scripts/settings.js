/* Settings logic shared by the standalone page and the homepage SPA view. */
(function (window, document) {
  'use strict';

  function init(page = document, options = {}) {
    const root = document.documentElement;
    const themeOptions = page.querySelector('#themeOptions');
    const languageSelect = page.querySelector('#languageSelect');
    const shortcutsModal = page.querySelector('#shortcutsModal');
    const shortcutsDialog = shortcutsModal.querySelector('.shortcuts-dialog');
    const shortcutsOpen = page.querySelector('#shortcutsOpen');
    const shortcutsClose = page.querySelector('#shortcutsClose');
    let shortcutsReturnFocus = null;
    let previousBodyOverflow = '';
    let shiftCycleTimeout = null;
    let shiftCycleInterval = null;
    let shiftCycleCard = null;
    let pinnedShortcutCard = null;
    let hoveredShortcutCard = null;
    let focusedShortcutCard = null;
    const THEME_STORAGE_KEY = 'wkjasdka-dark-mode';
    const darkPreference = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function resolveThemePreference() {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'true') return 'dark';
      if (saved === 'light' || saved === 'false') return 'light';
      return 'system';
    }

    function setThemePreference(preference, persist = true) {
      const selectedPreference = ['system', 'light', 'dark'].includes(preference) ? preference : 'system';
      const enabled = selectedPreference === 'dark' || (selectedPreference === 'system' && Boolean(darkPreference && darkPreference.matches));
      root.classList.toggle('dark-mode', enabled);
      root.classList.toggle('light-mode', !enabled);
      root.style.colorScheme = enabled ? 'dark' : 'light';
      themeOptions.querySelectorAll('input[name="themePreference"]').forEach(input => {
        input.checked = input.value === selectedPreference;
      });
      if (persist) localStorage.setItem(THEME_STORAGE_KEY, selectedPreference);
    }

    function openShortcuts() {
      shortcutsReturnFocus = document.activeElement;
      previousBodyOverflow = document.body.style.overflow;
      shortcutsModal.classList.add('open');
      shortcutsModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        if (shortcutsModal.classList.contains('open')) shortcutsClose.focus();
      });
    }

    function clearShiftCycle() {
      if (shiftCycleTimeout !== null) window.clearTimeout(shiftCycleTimeout);
      if (shiftCycleInterval !== null) window.clearInterval(shiftCycleInterval);
      shiftCycleTimeout = null;
      shiftCycleInterval = null;
    }

    function getPrimaryShortcutCard() {
      if (!shortcutsModal.classList.contains('open')) return null;
      return pinnedShortcutCard || hoveredShortcutCard || focusedShortcutCard;
    }

    function syncShiftCycle(card) {
      const shouldCycle = card && card.dataset.keys.split(' ').includes('Shift');
      if (!shouldCycle) {
        clearShiftCycle();
        shiftCycleCard = null;
        return;
      }
      if (shiftCycleCard === card && (shiftCycleTimeout !== null || shiftCycleInterval !== null)) return;

      clearShiftCycle();
      shiftCycleCard = card;
      const leftShift = page.querySelector('.keyboard-key[data-key="Shift"][data-side="left"]');
      const rightShift = page.querySelector('.keyboard-key[data-key="Shift"][data-side="right"]');
      shiftCycleTimeout = window.setTimeout(() => {
        shiftCycleTimeout = null;
        if (getPrimaryShortcutCard() !== card) {
          shiftCycleCard = null;
          return;
        }
        let leftIsLit = true;
        rightShift.classList.remove('is-highlighted');
        shiftCycleInterval = window.setInterval(() => {
          if (getPrimaryShortcutCard() !== card) {
            clearShiftCycle();
            shiftCycleCard = null;
            return;
          }
          leftIsLit = !leftIsLit;
          leftShift.classList.toggle('is-highlighted', leftIsLit);
          rightShift.classList.toggle('is-highlighted', !leftIsLit);
        }, 1000);
      }, 3000);
    }

    function updateShortcutHighlight() {
      const isOpen = shortcutsModal.classList.contains('open');
      const transientCard = isOpen ? (hoveredShortcutCard || focusedShortcutCard) : null;
      const primaryCard = isOpen ? (pinnedShortcutCard || transientCard) : null;
      const previewCard = pinnedShortcutCard && transientCard && transientCard !== pinnedShortcutCard ? transientCard : null;
      const primaryKeys = new Set(primaryCard ? primaryCard.dataset.keys.split(' ') : []);
      const previewKeys = new Set(previewCard ? previewCard.dataset.keys.split(' ') : []);

      shortcutsDialog.classList.toggle('has-selected-shortcut', Boolean(isOpen && pinnedShortcutCard));
      page.querySelectorAll('.shortcut-info-card').forEach(card => {
        const isSelected = isOpen && card === pinnedShortcutCard;
        card.classList.toggle('is-selected', isSelected);
        card.classList.toggle('is-active', isOpen && card === primaryCard);
        card.classList.toggle('is-preview', isOpen && card === previewCard);
        card.setAttribute('aria-pressed', String(isSelected));
      });
      page.querySelectorAll('.keyboard-key').forEach(key => {
        const isPrimaryKey = primaryKeys.has(key.dataset.key);
        key.classList.toggle('is-highlighted', isPrimaryKey);
        key.classList.toggle('is-preview-highlighted', !isPrimaryKey && previewKeys.has(key.dataset.key));
      });
      syncShiftCycle(primaryCard);
    }

    function closeShortcuts() {
      clearShiftCycle();
      shiftCycleCard = null;
      pinnedShortcutCard = null;
      hoveredShortcutCard = null;
      focusedShortcutCard = null;
      shortcutsDialog.classList.remove('has-selected-shortcut');
      page.querySelectorAll('.shortcut-info-card.is-active, .shortcut-info-card.is-selected, .shortcut-info-card.is-preview, .keyboard-key.is-highlighted, .keyboard-key.is-preview-highlighted').forEach(element => {
        element.classList.remove('is-active', 'is-selected', 'is-preview', 'is-highlighted', 'is-preview-highlighted');
      });
      page.querySelectorAll('.shortcut-info-card').forEach(card => card.setAttribute('aria-pressed', 'false'));
      shortcutsModal.classList.remove('open');
      shortcutsModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = previousBodyOverflow;
      if (shortcutsReturnFocus && typeof shortcutsReturnFocus.focus === 'function') shortcutsReturnFocus.focus();
    }

    function activate() {
      setThemePreference(resolveThemePreference(), false);
      return SiteI18n.init({ namespace: 'settings', select: languageSelect, defaultLocale: 'en' })
        .catch(error => console.error('[settings] Could not initialize translations.', error));
    }
    activate();
    themeOptions.addEventListener('change', event => {
      if (event.target.matches('input[name="themePreference"]')) setThemePreference(event.target.value);
    });
    const touchButtonMedia = window.matchMedia
      ? window.matchMedia('(hover: none), (pointer: coarse)')
      : { matches: false };
    let pressedThemeOption = null;
    let pressedThemePointer = null;
    function releaseThemeTouchPress() {
      if (pressedThemeOption) pressedThemeOption.classList.remove('is-touch-pressed');
      pressedThemeOption = null;
      pressedThemePointer = null;
    }
    function clearThemeTouchHighlights() {
      themeOptions.querySelectorAll('.theme-option.is-touch-highlighted').forEach(option => {
        option.classList.remove('is-touch-highlighted');
      });
    }
    themeOptions.addEventListener('pointerdown', event => {
      if (!touchButtonMedia.matches || event.pointerType === 'mouse') return;
      const option = event.target.closest('.theme-option');
      if (!option || !themeOptions.contains(option)) return;
      releaseThemeTouchPress();
      pressedThemeOption = option;
      pressedThemePointer = event.pointerId;
      option.classList.add('is-touch-pressed');
    });
    ['pointerup', 'pointercancel'].forEach(type => {
      document.addEventListener(type, event => {
        if (event.pointerId === pressedThemePointer) releaseThemeTouchPress();
      });
    });
    themeOptions.addEventListener('click', event => {
      if (!touchButtonMedia.matches) return;
      const option = event.target.closest('.theme-option');
      if (!option || !themeOptions.contains(option)) return;
      clearThemeTouchHighlights();
      option.classList.add('is-touch-highlighted');
    });
    document.addEventListener('pointerdown', event => {
      if (!touchButtonMedia.matches || !themeOptions.isConnected) return;
      const targetOption = event.target instanceof Element ? event.target.closest('.theme-option') : null;
      themeOptions.querySelectorAll('.theme-option.is-touch-highlighted').forEach(option => {
        if (option !== targetOption) option.classList.remove('is-touch-highlighted');
      });
    });
    window.addEventListener('storage', event => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setThemePreference(resolveThemePreference(), false);
    });
    if (darkPreference) {
      const syncSystemTheme = () => {
        if (resolveThemePreference() === 'system') setThemePreference('system', false);
      };
      if (darkPreference.addEventListener) darkPreference.addEventListener('change', syncSystemTheme);
      else if (darkPreference.addListener) darkPreference.addListener(syncSystemTheme);
    }
    shortcutsOpen.addEventListener('click', openShortcuts);
    shortcutsClose.addEventListener('click', closeShortcuts);
    shortcutsModal.addEventListener('click', event => {
      if (event.target.closest('.shortcut-info-card')) return;
      pinnedShortcutCard = null;
      hoveredShortcutCard = null;
      focusedShortcutCard = null;
      updateShortcutHighlight();
      if (event.target === shortcutsModal) closeShortcuts();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && shortcutsModal.classList.contains('open')) {
        event.preventDefault();
        closeShortcuts();
        return;
      }
      if (event.key === 'Tab' && shortcutsModal.classList.contains('open')) {
        const focusable = [...shortcutsModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    page.querySelectorAll('.shortcut-info-card').forEach(card => {
      card.addEventListener('click', () => {
        pinnedShortcutCard = card;
        updateShortcutHighlight();
      });
      card.addEventListener('pointerenter', () => {
        hoveredShortcutCard = card;
        updateShortcutHighlight();
      });
      card.addEventListener('pointerleave', () => {
        if (hoveredShortcutCard === card) hoveredShortcutCard = null;
        updateShortcutHighlight();
      });
      card.addEventListener('focus', () => {
        focusedShortcutCard = card;
        updateShortcutHighlight();
      });
      card.addEventListener('blur', () => {
        if (focusedShortcutCard === card) focusedShortcutCard = null;
        updateShortcutHighlight();
      });
    });

    page.querySelector('#logo').addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (typeof options.onBack === 'function') options.onBack();
      else if (window.history.length > 1) window.history.back();
      else window.location.assign(event.currentTarget.href);
    });

    if (!options.spa) {
    const loadingScreen = page.querySelector('#loadingScreen');
    const lightLoadingLogo = page.querySelector('#loadingLogoLight');
    const darkLoadingLogo = page.querySelector('#loadingLogoDark');
    const activeLoadingLogo = root.classList.contains('dark-mode') ? darkLoadingLogo : lightLoadingLogo;
    const footerLoadingLogo = loadingScreen.querySelector('.loading-footer-image');
    const waitForLoadingImage = image => new Promise(resolve => {
      if (!image) {
        resolve(false);
        return;
      }
      const finish = async () => {
        if (image.naturalWidth <= 0) {
          resolve(false);
          return;
        }
        try {
          if (typeof image.decode === 'function') await image.decode();
          requestAnimationFrame(() => resolve(image.naturalWidth > 0));
        } catch (_) {
          resolve(false);
        }
      };
      if (image.complete) {
        finish();
        return;
      }
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', () => resolve(false), { once: true });
    });

    const loadingImagesReady = Promise.all([waitForLoadingImage(activeLoadingLogo), waitForLoadingImage(footerLoadingLogo)])
      .then(([centerReady, footerReady]) => {
        if (centerReady && footerReady) loadingScreen.classList.add('loading-ready');
      });

    const finishLoading = () => loadingImagesReady.then(() => {
      loadingScreen.style.display = 'none';
      root.classList.remove('is-loading');
    });
    if (document.readyState === 'complete') finishLoading();
    else window.addEventListener('load', finishLoading, { once: true });
    }

    return {
      activate,
      deactivate() {
        releaseThemeTouchPress();
        clearThemeTouchHighlights();
        if (shortcutsModal.classList.contains('open')) closeShortcuts();
      }
    };
  }

  window.SettingsPage = Object.freeze({ init });
})(window, document);
