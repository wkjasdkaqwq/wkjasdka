/* Settings logic shared by the standalone page and the homepage SPA view. */
(function (window, document) {
  'use strict';

  function init(page = document, options = {}) {
    const root = document.documentElement;
    const themeOptions = page.querySelector('#themeOptions');
    const languageSelect = page.querySelector('#languageSelect');
    const languageSelectCard = page.querySelector('#languageSelectCard');
    const languagePicker = page.querySelector('#languagePicker');
    const languageDropdown = page.querySelector('#languageDropdown');
    const languageOptions = page.querySelector('#languageOptions');
    const languageNoResults = page.querySelector('#languageNoResults');
    const languageChoices = [...languageOptions.querySelectorAll('[role="option"]')];
    const languageOpen = page.querySelector('#languageOpen');
    const languageCurrent = page.querySelector('#languageCurrent');
    const languageModal = page.querySelector('#languageModal');
    const languageDialog = languageModal.querySelector('.language-dialog');
    const languageClose = page.querySelector('#languageClose');
    const languageForm = page.querySelector('#languageForm');
    const languageConfirm = page.querySelector('#languageConfirm');
    const languageActions = page.querySelector('.language-actions');
    const languageError = page.querySelector('#languageError');
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
    let languageReturnFocus = null;
    let languagePreviousBodyOverflow = '';
    let languageDialogVersion = 0;
    let languagePreviewRequest = 0;
    let languagePreviewTranslations = null;
    let languageSaving = false;
    let languageDraft = 'en';
    let activeLanguageChoice = null;
    let languageInputIsPreview = false;
    let languageComposing = false;
    let suppressCompositionSubmit = false;
    let suppressLanguageFocusOpen = false;
    let languageDialogLift = 0;
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

    function languageChoice(locale) {
      return languageChoices.find(choice => choice.dataset.value === locale);
    }

    function orderedLanguageChoices() {
      return [...languageOptions.querySelectorAll('[role="option"]')];
    }

    function setLanguageDraft(locale) {
      const choice = languageChoice(locale) || languageChoice('en') || languageChoices[0];
      if (!choice) return;
      languageDraft = choice.dataset.value;
      const label = choice.querySelector('.language-choice-text').textContent;
      if (languageDropdown.hidden) languageSelect.value = label;
      else languageSelect.placeholder = label;
      languageChoices.forEach(item => item.setAttribute('aria-selected', String(item === choice)));
    }

    function updateLanguageNames(locale) {
      languageChoices.forEach(item => {
        const localName = item.querySelector('.language-choice-local-name');
        if (localName) localName.hidden = item.dataset.value === locale;
      });
    }

    function setLanguageError(key) {
      languageError.hidden = !key;
      languageError.dataset.i18n = key || 'languageSaveError';
      if (key) {
        const translations = languagePreviewTranslations || {};
        SiteI18n.apply(languageError, { ...translations, namespace: 'settings' });
      }
      fitLanguageDropdown();
    }

    function resetLanguagePreview() {
      languagePreviewRequest += 1;
      languagePreviewTranslations = null;
      SiteI18n.apply(languageModal, { namespace: 'settings' });
      languageModal.lang = SiteI18n.locale;
      updateLanguageNames(SiteI18n.locale);
    }

    async function previewLanguage(locale) {
      const request = ++languagePreviewRequest;
      const dialogVersion = languageDialogVersion;
      languagePreviewTranslations = null;
      try {
        const translations = await SiteI18n.loadLocale(locale);
        if (request !== languagePreviewRequest || dialogVersion !== languageDialogVersion ||
            !languageModal.classList.contains('open') || languageDraft !== locale) return;
        languagePreviewTranslations = translations;
        SiteI18n.apply(languageModal, { ...translations, namespace: 'settings' });
        languageModal.lang = translations.locale;
        updateLanguageNames(translations.locale);
        if (!languageDropdown.hidden && !languageComposing) filterLanguageChoices();
      } catch (error) {
        if (request !== languagePreviewRequest || dialogVersion !== languageDialogVersion ||
            !languageModal.classList.contains('open') || languageDraft !== locale) return;
        console.warn('[settings] Could not load the language preview.', error);
        resetLanguagePreview();
        setLanguageError('languagePreviewError');
        if (!languageDropdown.hidden && !languageComposing) filterLanguageChoices();
      }
    }

    function syncLanguageDisplay(locale = SiteI18n.locale) {
      const choice = languageChoice(locale);
      if (choice) {
        languageCurrent.textContent = choice.querySelector('.language-choice-text').textContent;
        // Keep the applied language first, with the remaining choices in the
        // original Latin / Cyrillic / Han order, not the order of past selections.
        const choices = [choice, ...languageChoices.filter(item => item !== choice)];
        choices.forEach((item, index) => {
          const current = languageOptions.children[index];
          if (current !== item) languageOptions.insertBefore(item, current || null);
        });
      }
      updateLanguageNames(locale);
      languageModal.lang = locale;
      if (!languageModal.classList.contains('open')) setLanguageDraft(locale);
      else if (!languageSaving) previewLanguage(languageDraft);
      else {
        languagePreviewRequest += 1;
        languagePreviewTranslations = null;
      }
      if (!languageDropdown.hidden && !languageComposing) filterLanguageChoices();
    }

    function setActiveLanguageChoice(choice) {
      activeLanguageChoice = choice || null;
      languageChoices.forEach(item => item.classList.toggle('is-active', item === activeLanguageChoice));
      if (activeLanguageChoice) {
        languageSelect.setAttribute('aria-activedescendant', activeLanguageChoice.id);
        const item = activeLanguageChoice.getBoundingClientRect();
        const list = languageOptions.getBoundingClientRect();
        const styles = window.getComputedStyle(languageOptions);
        const top = list.top + parseFloat(styles.paddingTop);
        const bottom = list.bottom - parseFloat(styles.paddingBottom);
        if (item.top < top) languageOptions.scrollTop += item.top - top;
        else if (item.bottom > bottom) languageOptions.scrollTop += item.bottom - bottom;
      } else {
        languageSelect.removeAttribute('aria-activedescendant');
      }
    }

    function fitLanguageDropdown(event) {
      if (languageDropdown.hidden || !languageModal.classList.contains('open')) return;
      const viewport = window.visualViewport;
      const topLimit = (viewport ? viewport.offsetTop : 0) + 12;
      const bottomLimit = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 12;
      languageOptions.style.maxHeight = '204px';
      const viewportChanged = event && (event.type === 'resize' || event.type === 'scroll');
      for (let pass = 0; pass < 3; pass += 1) {
        const dialog = languageDialog.getBoundingClientRect();
        const list = languageOptions.getBoundingClientRect();
        const dropdown = languageDropdown.getBoundingClientRect();
        const transform = window.getComputedStyle(languageDialog).transform;
        const actualY = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
        const baseY = window.matchMedia('(max-height: 420px)').matches ? -8 : -30;
        const currentLift = baseY - actualY;
        const naturalTop = dialog.top + currentLift;
        const naturalBottom = Math.max(dialog.bottom, dropdown.bottom) + currentLift;
        const maxLift = Math.max(0, naturalTop - topLimit);
        const needed = Math.max(0, naturalBottom - bottomLimit);
        // Move the entire popup; only constrain the list if it still will not fit.
        const overflow = Math.max(0, needed - maxLift);
        const nextHeight = Math.max(1, list.height - overflow);
        if (overflow) languageOptions.style.maxHeight = `${nextHeight}px`;
        languageDialogLift = Math.min(maxLift, viewportChanged ? needed : Math.max(languageDialogLift, needed));
        languageDialog.style.setProperty('--language-dialog-lift', `${languageDialogLift}px`);
        if (!overflow || nextHeight >= list.height || list.height <= 1) break;
      }
    }

    function filterLanguageChoices() {
      const query = languageInputIsPreview ? '' : languageSelect.value.trim().toLocaleLowerCase();
      languageChoices.forEach(choice => {
        const name = choice.querySelector('.language-choice-text').textContent.toLocaleLowerCase();
        const localName = choice.querySelector('.language-choice-local-name');
        const translatedName = localName ? localName.textContent.toLocaleLowerCase() : '';
        choice.hidden = Boolean(query) && !name.includes(query) && !translatedName.includes(query) && !choice.dataset.value.toLocaleLowerCase().includes(query);
      });
      const visible = orderedLanguageChoices().filter(choice => !choice.hidden);
      languageNoResults.hidden = visible.length > 0;
      fitLanguageDropdown();
      if (!visible.includes(activeLanguageChoice)) {
        setActiveLanguageChoice(visible.find(choice => choice.dataset.value === languageDraft) || visible[0] || null);
      }
    }

    function openLanguageOptions() {
      if (languageSelect.disabled || !languageChoices.length || !languageDropdown.hidden) return;
      const choice = languageChoice(languageDraft) || languageChoice('en') || languageChoices[0];
      languageSelect.readOnly = false;
      languageSelect.placeholder = choice.querySelector('.language-choice-text').textContent;
      languageSelect.value = '';
      languageInputIsPreview = false;
      languageDropdown.hidden = false;
      languagePicker.classList.add('is-open');
      languageDropdown.append(languageError);
      languageSelect.setAttribute('aria-expanded', 'true');
      activeLanguageChoice = choice;
      filterLanguageChoices();
      setActiveLanguageChoice(activeLanguageChoice);
      window.setTimeout(fitLanguageDropdown, 240);
    }

    function closeLanguageOptions(restoreFocus = false) {
      if (languageDropdown.hidden) return;
      languageForm.insertBefore(languageError, languageActions);
      languageDropdown.hidden = true;
      languageOptions.style.removeProperty('max-height');
      languagePicker.classList.remove('is-open');
      languageSelect.setAttribute('aria-expanded', 'false');
      languageSelect.removeAttribute('aria-activedescendant');
      languageSelect.readOnly = true;
      languageSelect.placeholder = '';
      languageInputIsPreview = false;
      languageComposing = false;
      setLanguageDraft(languageDraft);
      languageChoices.forEach(choice => {
        choice.hidden = false;
        choice.classList.remove('is-active');
      });
      languageNoResults.hidden = true;
      activeLanguageChoice = null;
      if (restoreFocus && !languageSelect.disabled && languageModal.classList.contains('open')) {
        suppressLanguageFocusOpen = true;
        languageSelect.focus({ preventScroll: true });
        suppressLanguageFocusOpen = false;
      }
    }

    function chooseLanguage(choice) {
      if (!choice || choice.hidden || languageSelect.disabled) return;
      setLanguageDraft(choice.dataset.value);
      setLanguageError(null);
      languageSelect.value = choice.querySelector('.language-choice-text').textContent;
      languageInputIsPreview = true;
      activeLanguageChoice = choice;
      filterLanguageChoices();
      setActiveLanguageChoice(choice);
      // Keep the search input focused so the on-screen return key can confirm.
      languageSelect.focus({ preventScroll: true });
      previewLanguage(languageDraft);
    }

    function openLanguage() {
      if (languageModal.classList.contains('open')) return;
      languageDialogVersion += 1;
      languageReturnFocus = document.activeElement;
      languagePreviousBodyOverflow = document.body.style.overflow;
      setLanguageDraft(SiteI18n.locale);
      closeLanguageOptions();
      setLanguageError(null);
      resetLanguagePreview();
      languageModal.classList.add('open');
      languageModal.setAttribute('aria-hidden', 'false');
      languageOpen.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      const dialogVersion = languageDialogVersion;
      const focusLanguageClose = () => {
        if (dialogVersion === languageDialogVersion && languageModal.classList.contains('open') && !languageModal.contains(document.activeElement)) {
          languageClose.focus({ preventScroll: true });
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(focusLanguageClose));
      window.setTimeout(focusLanguageClose, 220);
    }

    function closeLanguage(restoreFocus = true) {
      if (!languageModal.classList.contains('open')) return;
      languageDialogVersion += 1;
      closeLanguageOptions();
      languageModal.classList.remove('open');
      languageDialog.style.removeProperty('--language-dialog-lift');
      languageDialogLift = 0;
      languageModal.setAttribute('aria-hidden', 'true');
      languageOpen.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = languagePreviousBodyOverflow;
      setLanguageError(null);
      resetLanguagePreview();
      syncLanguageDisplay();
      if (restoreFocus && languageReturnFocus && languageReturnFocus.isConnected) {
        languageReturnFocus.focus({ preventScroll: true });
      }
      languageReturnFocus = null;
    }

    async function confirmLanguage(event) {
      event.preventDefault();
      if (languageSaving || languageComposing || suppressCompositionSubmit) return;
      // Some mobile keyboards submit the form directly without a normal
      // keydown. A search must select an option before it can be applied.
      if (!languageDropdown.hidden && document.activeElement === languageSelect &&
          (!languageInputIsPreview || !activeLanguageChoice || activeLanguageChoice.hidden ||
           activeLanguageChoice.dataset.value !== languageDraft)) {
        chooseLanguage(activeLanguageChoice);
        return;
      }
      const selectedLocale = languageDraft;
      const dialogVersion = languageDialogVersion;
      languagePreviewRequest += 1;
      closeLanguageOptions();
      languageSaving = true;
      languageConfirm.disabled = true;
      languageSelect.disabled = true;
      languageModal.setAttribute('aria-busy', 'true');
      setLanguageError(null);
      try {
        const appliedLocale = await SiteI18n.setLocale(selectedLocale, { persistBeforeLoad: true, strictLocale: true });
        if (dialogVersion !== languageDialogVersion || !languageModal.classList.contains('open')) return;
        if (appliedLocale === selectedLocale) closeLanguage();
        else setLanguageError('languageSaveError');
      } catch (error) {
        console.error('[settings] Could not apply the selected language.', error);
        if (dialogVersion === languageDialogVersion && languageModal.classList.contains('open')) setLanguageError('languageSaveError');
      } finally {
        // A reopened dialog could not be edited while this save was pending.
        if (dialogVersion !== languageDialogVersion && languageModal.classList.contains('open')) setLanguageDraft(SiteI18n.locale);
        languageSaving = false;
        languageConfirm.disabled = false;
        languageSelect.disabled = false;
        languageModal.removeAttribute('aria-busy');
      }
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
      return SiteI18n.init({ namespace: 'settings', select: null, defaultLocale: 'en' })
        .then(() => syncLanguageDisplay())
        .catch(error => console.error('[settings] Could not initialize translations.', error));
    }
    languageOpen.setAttribute('aria-expanded', 'false');
    languageOpen.addEventListener('click', openLanguage);
    languageClose.addEventListener('click', () => closeLanguage());
    languageSelectCard.addEventListener('pointerdown', event => {
      if (event.target === languageSelect && languageDropdown.hidden && !languageSelect.disabled) languageSelect.readOnly = false;
    });
    languageSelectCard.addEventListener('pointercancel', () => {
      if (languageDropdown.hidden) languageSelect.readOnly = true;
    });
    languageSelect.addEventListener('focus', () => {
      if (!suppressLanguageFocusOpen && languageModal.classList.contains('open')) openLanguageOptions();
    });
    languageSelectCard.addEventListener('click', () => {
      if (languageSelect.disabled) return;
      openLanguageOptions();
      languageSelect.focus({ preventScroll: true });
    });
    languageSelect.addEventListener('keydown', event => {
      if (event.isComposing || languageComposing || event.keyCode === 229) {
        // Do not cancel the IME's key event; only block a same-event implicit submit.
        suppressCompositionSubmit = true;
        window.setTimeout(() => { suppressCompositionSubmit = false; }, 0);
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const wasClosed = languageDropdown.hidden;
        if (wasClosed) openLanguageOptions();
        const visible = orderedLanguageChoices().filter(choice => !choice.hidden);
        if (!wasClosed && visible.length) {
          const currentIndex = visible.indexOf(activeLanguageChoice);
          const nextIndex = Math.max(0, Math.min(visible.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)));
          setActiveLanguageChoice(visible[nextIndex]);
        }
      } else if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        if (event.repeat) return;
        if (languageDropdown.hidden) openLanguageOptions();
        else if (languageInputIsPreview && activeLanguageChoice && !activeLanguageChoice.hidden && activeLanguageChoice.dataset.value === languageDraft) {
          if (languageForm.requestSubmit) languageForm.requestSubmit(languageConfirm);
          else languageConfirm.click();
        } else chooseLanguage(activeLanguageChoice);
      } else if (languageDropdown.hidden && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete')) {
        openLanguageOptions();
      }
    });
    const prepareLanguageSearch = () => {
      if (!languageInputIsPreview) return;
      languageInputIsPreview = false;
      languageSelect.value = '';
    };
    languageSelect.addEventListener('beforeinput', prepareLanguageSearch);
    languageSelect.addEventListener('compositionstart', () => {
      prepareLanguageSearch();
      languageComposing = true;
    });
    languageSelect.addEventListener('compositionend', () => {
      languageComposing = false;
      if (!languageDropdown.hidden) filterLanguageChoices();
    });
    languageSelect.addEventListener('input', event => {
      languageInputIsPreview = false;
      if (!languageDropdown.hidden && !languageComposing && !event.isComposing) filterLanguageChoices();
    });
    languageOptions.addEventListener('click', event => {
      const choice = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
      if (choice && languageOptions.contains(choice)) chooseLanguage(choice);
    });
    languageDropdown.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[role="option"]')) return;
      closeLanguageOptions();
      languageSelect.blur();
    });
    document.addEventListener('click', event => {
      const inputSubmit = event.detail === 0 && document.activeElement === languageSelect && languageConfirm.contains(event.target);
      const composingSubmit = event.detail === 0 && (languageComposing || suppressCompositionSubmit);
      if (!inputSubmit && !composingSubmit && !languageDropdown.hidden && !languagePicker.contains(event.target)) {
        closeLanguageOptions();
        languageSelect.blur();
      }
    });
    languageForm.addEventListener('submit', confirmLanguage);
    languageModal.addEventListener('click', event => {
      if (event.target !== languageModal) return;
      if (!languageDropdown.hidden) {
        closeLanguageOptions();
        languageSelect.blur();
      } else closeLanguage();
    });
    languageDialog.addEventListener('transitionend', event => {
      if (event.target === languageDialog && event.propertyName === 'transform') fitLanguageDropdown();
    });
    window.addEventListener('resize', fitLanguageDropdown);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitLanguageDropdown);
      window.visualViewport.addEventListener('scroll', fitLanguageDropdown);
    }
    window.addEventListener('site:languagechange', event => syncLanguageDisplay(event.detail.locale));
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
      page.querySelectorAll('.theme-option.is-touch-highlighted').forEach(option => {
        option.classList.remove('is-touch-highlighted');
      });
    }
    [themeOptions, languageOpen, languageSelectCard, languageConfirm].forEach(container => {
      container.addEventListener('pointerdown', event => {
        if (!touchButtonMedia.matches || event.pointerType === 'mouse') return;
        const option = event.target.closest('.theme-option');
        if (!option || !container.contains(option)) return;
        releaseThemeTouchPress();
        pressedThemeOption = option;
        pressedThemePointer = event.pointerId;
        option.classList.add('is-touch-pressed');
      });
      container.addEventListener('click', event => {
        if (!touchButtonMedia.matches) return;
        const option = event.target.closest('.theme-option');
        if (!option || !container.contains(option)) return;
        clearThemeTouchHighlights();
        option.classList.add('is-touch-highlighted');
      });
    });
    ['pointerup', 'pointercancel'].forEach(type => {
      document.addEventListener(type, event => {
        if (event.pointerId === pressedThemePointer) releaseThemeTouchPress();
      });
    });
    document.addEventListener('pointerdown', event => {
      if (!touchButtonMedia.matches || !themeOptions.isConnected) return;
      const targetOption = event.target instanceof Element ? event.target.closest('.theme-option') : null;
      page.querySelectorAll('.theme-option.is-touch-highlighted').forEach(option => {
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
      if (languageModal.classList.contains('open')) {
        if (event.isComposing || languageComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          if (!languageDropdown.hidden) closeLanguageOptions(true);
          else closeLanguage();
          return;
        }
        if (event.key === 'Tab') {
          if (!languageDropdown.hidden) closeLanguageOptions();
          const focusable = [...languageModal.querySelectorAll('button:not([disabled]), input:not([disabled])')];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (first && event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
            event.preventDefault();
            last.focus();
          } else if (first && !event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
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
        closeLanguage(false);
        if (shortcutsModal.classList.contains('open')) closeShortcuts();
      }
    };
  }

  window.SettingsPage = Object.freeze({ init });
})(window, document);
