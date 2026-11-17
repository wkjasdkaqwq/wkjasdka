(function (window, document) {
  'use strict';

  const STORAGE_KEY = 'wkjasdka-language';
  const SESSION_STORAGE_KEY = `${STORAGE_KEY}-session`;
  const FULL_RELOAD_QUERY_PARAM = '_wkjasdka_full_reload';
  const DEFAULT_LOCALE = 'en';
  const DICTIONARY_TIMEOUT_MS = 45000;
  const SUPPORTED_LOCALES = ['en', 'zh-CN', 'ru', 'de', 'fr', 'zh-HK', 'zh-TW', 'zh-MO'];
  const LOCALE_TAGS = { en: 'en-GB', 'zh-CN': 'zh-CN', ru: 'ru', de: 'de', fr: 'fr', 'zh-HK': 'zh-HK', 'zh-TW': 'zh-TW', 'zh-MO': 'zh-MO' };
  const fullReloadToken = new URL(window.location.href).searchParams.get(FULL_RELOAD_QUERY_PARAM);
  const scriptElement = document.currentScript;
  const scriptSource = scriptElement && scriptElement.dataset.i18nSource
    ? new URL(scriptElement.dataset.i18nSource, document.baseURI)
    : scriptElement && scriptElement.src ? new URL(scriptElement.src) : null;
  const dictionaryVersion = scriptSource
    ? scriptSource.searchParams.get('v')
    : null;
  const localeDirectory = scriptSource
    ? new URL('../resource/language/', scriptSource)
    : new URL('./resource/language/', document.baseURI);
  const dictionaryPromises = new Map();
  const translatedAttributes = {
    'data-i18n-aria-label': 'aria-label',
    'data-i18n-title': 'title',
    'data-i18n-tooltip': 'data-tooltip',
    'data-i18n-placeholder': 'placeholder',
    'data-i18n-alt': 'alt'
  };

  let currentLocale = DEFAULT_LOCALE;
  let currentNamespace = '';
  let currentDictionary = {};
  let fallbackDictionary = {};
  let languageSelect = null;
  let selectChangeHandler = null;
  let storageListenerBound = false;
  let firstVisitDetectionScheduled = false;
  let reloadMarkerCleanupScheduled = false;
  let requestId = 0;
  let optimisticLocaleWrite = null;

  function matchSupportedLocale(locale) {
    const tag = String(locale || '').trim().replace(/_/g, '-').toLowerCase();
    const parts = tag.split('-');
    if (parts[0] === 'zh') {
      // An explicit simplified script takes precedence over the region.
      if (parts.includes('hans')) return 'zh-CN';
      for (const region of ['hk', 'tw', 'mo']) {
        if (parts.includes(region)) return `zh-${region.toUpperCase()}`;
      }
      return parts.includes('hant') ? 'zh-TW' : 'zh-CN';
    }
    return ['en', 'ru', 'de', 'fr'].includes(parts[0]) ? parts[0] : null;
  }

  function normalizeLocale(locale) {
    return matchSupportedLocale(locale) || DEFAULT_LOCALE;
  }

  function readStoredLocale() {
    try {
      const locale = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED_LOCALES.includes(locale) ? locale : null;
    } catch (_) {
      return null;
    }
  }

  function saveLocale(locale) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readSessionLocale() {
    try {
      const locale = sessionStorage.getItem(SESSION_STORAGE_KEY);
      return SUPPORTED_LOCALES.includes(locale) ? locale : null;
    } catch (_) {
      return null;
    }
  }

  function saveSessionLocale(locale) {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, locale);
      return true;
    } catch (_) {
      return false;
    }
  }

  function cleanFullReloadMarkerAfterLoad() {
    if (reloadMarkerCleanupScheduled) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(FULL_RELOAD_QUERY_PARAM)) return;

    reloadMarkerCleanupScheduled = true;
    const cleanUrl = () => {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete(FULL_RELOAD_QUERY_PARAM);
      window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    };

    if (document.readyState === 'complete') window.setTimeout(cleanUrl, 0);
    else window.addEventListener('load', cleanUrl, { once: true });
  }

  function forceFullPageReload() {
    const url = new URL(window.location.href);
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    url.searchParams.set(FULL_RELOAD_QUERY_PARAM, nonce);
    window.location.replace(url.href);
  }

  function detectSystemLocale() {
    const preferences = [];
    if (window.navigator && window.navigator.languages) preferences.push(...window.navigator.languages);
    if (window.navigator && window.navigator.language) preferences.push(window.navigator.language);

    for (const preference of preferences) {
      const locale = matchSupportedLocale(preference);
      if (locale) return locale;
    }
    return null;
  }

  function scheduleFirstVisitLanguageDetection(fallbackLocale) {
    if (firstVisitDetectionScheduled) return;
    firstVisitDetectionScheduled = true;

    const detectAfterLoad = () => {
      // A user may have changed the language while the page was loading.
      if (readStoredLocale() || readSessionLocale()) return;

      const detectedLocale = detectSystemLocale();
      const selectedLocale = detectedLocale || fallbackLocale;
      const savedLocally = saveLocale(selectedLocale);
      const savedForSession = saveSessionLocale(selectedLocale);

      if (!detectedLocale) return;
      if (!savedLocally && !savedForSession) {
        // Storage is unavailable; apply the language without risking a reload loop.
        setLocale(detectedLocale, { persist: false }).catch(error => {
          console.warn('[i18n] Could not apply the detected system language.', error);
        });
        return;
      }

      // A unique document URL forces a fresh full-page request and avoids a reload loop.
      forceFullPageReload();
    };

    if (document.readyState === 'complete') window.setTimeout(detectAfterLoad, 0);
    else window.addEventListener('load', detectAfterLoad, { once: true });
  }

  async function parseDictionaryResponse(response, locale) {
    const reportProgress = window.__communityProgressObserver;
    if (typeof reportProgress !== 'function' || !response.body || !response.body.getReader || typeof TextDecoder !== 'function') {
      const dictionary = await response.json();
      if (typeof reportProgress === 'function') reportProgress(locale, 1);
      return dictionary;
    }

    const encoding = response.headers.get('content-encoding');
    const length = Number(response.headers.get('content-length'));
    const measurable = length > 0 && (!encoding || encoding.toLowerCase() === 'identity');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let text = '';
    let received = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      text += decoder.decode(part.value, { stream: true });
      received += part.value.byteLength;
      if (measurable) reportProgress(locale, Math.min(0.99, received / length));
    }
    text += decoder.decode();
    const dictionary = JSON.parse(text);
    reportProgress(locale, 1);
    return dictionary;
  }

  function loadDictionary(locale) {
    if (!dictionaryPromises.has(locale)) {
      // Keep locale IDs stable for stored preferences and article translations.
      const filenameLocale = locale === 'en' ? 'en-gb' : locale.toLowerCase();
      const url = new URL(`${encodeURIComponent(filenameLocale)}.json`, localeDirectory);
      if (dictionaryVersion) url.searchParams.set('v', dictionaryVersion);
      if (fullReloadToken) url.searchParams.set(FULL_RELOAD_QUERY_PARAM, fullReloadToken);
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let timeoutId;
      const deadline = new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error(`Locale dictionary request timed out: ${url.pathname}`));
        }, DICTIONARY_TIMEOUT_MS);
      });
      const fetchOptions = { credentials: 'same-origin', cache: fullReloadToken ? 'reload' : 'default' };
      if (controller) fetchOptions.signal = controller.signal;
      const responsePromise = fetch(url, fetchOptions).then(response => {
        if (!response.ok) throw new Error(`Could not load locale dictionary: ${url.pathname} (${response.status})`);
        return parseDictionaryResponse(response, locale);
      });
      const request = Promise.race([responsePromise, deadline]).finally(() => window.clearTimeout(timeoutId));
      dictionaryPromises.set(locale, request);
      request.catch(() => dictionaryPromises.delete(locale));
    }
    return dictionaryPromises.get(locale);
  }

  // Load a locale for a scoped preview without changing or persisting the site locale.
  async function loadLocale(locale) {
    const selectedLocale = normalizeLocale(locale);
    const dictionary = await loadDictionary(selectedLocale);
    let defaultDictionary = dictionary;
    if (selectedLocale !== DEFAULT_LOCALE) {
      try {
        defaultDictionary = await loadDictionary(DEFAULT_LOCALE);
      } catch (_) {
        defaultDictionary = {};
      }
    }
    return {
      locale: selectedLocale,
      dictionaries: { [DEFAULT_LOCALE]: defaultDictionary, [selectedLocale]: dictionary }
    };
  }

  function getValue(dictionary, key) {
    return String(key).split('.').reduce((value, part) => {
      if (value == null || typeof value !== 'object') return undefined;
      return value[part];
    }, dictionary);
  }

  function resolveKey(key, namespace) {
    if (!key) return '';
    if (key.includes('.')) return key;
    return namespace ? `${namespace}.${key}` : key;
  }

  function translatedValue(key, namespace) {
    const fullKey = resolveKey(key, namespace);
    const value = getValue(currentDictionary, fullKey);
    if (value !== undefined && value !== null) return value;
    return getValue(fallbackDictionary, fullKey);
  }

  function apply(root, options) {
    const scope = typeof root === 'string' ? document.querySelector(root) : (root || document);
    if (!scope) return 0;

    const settings = options || {};
    const namespace = settings.namespace === undefined ? currentNamespace : settings.namespace;
    const dictionaries = settings.dictionaries;
    const locale = settings.locale === undefined ? currentLocale : normalizeLocale(settings.locale);
    const getTranslation = key => {
      if (!dictionaries) return translatedValue(key, namespace);
      const fullKey = resolveKey(key, namespace);
      const value = getValue(dictionaries[locale] || {}, fullKey);
      return value !== undefined && value !== null
        ? value
        : getValue(dictionaries[DEFAULT_LOCALE] || {}, fullKey);
    };
    const selector = '[data-i18n], [data-i18n-aria-label], [data-i18n-title], [data-i18n-tooltip], [data-i18n-placeholder], [data-i18n-alt]';
    const elements = [];
    if (scope.nodeType === 1 && scope.matches(selector)) elements.push(scope);
    if (typeof scope.querySelectorAll === 'function') elements.push(...scope.querySelectorAll(selector));

    let applied = 0;
    for (const element of elements) {
      const textKey = element.dataset.i18n;
      if (textKey) {
        const value = getTranslation(textKey);
        if (value !== undefined && value !== null) {
          element.textContent = String(value);
          applied += 1;
        }
      }

      for (const [dataAttribute, htmlAttribute] of Object.entries(translatedAttributes)) {
        const key = element.getAttribute(dataAttribute);
        if (!key) continue;
        const value = getTranslation(key);
        if (value !== undefined && value !== null) {
          element.setAttribute(htmlAttribute, String(value));
          applied += 1;
        }
      }
    }
    return applied;
  }

  async function setLocale(locale, options) {
    const settings = options || {};
    if (settings.namespace !== undefined) currentNamespace = settings.namespace;
    const selectedLocale = normalizeLocale(locale);
    const persistBeforeLoad = settings.persistBeforeLoad && settings.persist !== false;
    const previousStoredLocale = persistBeforeLoad ? readStoredLocale() : null;
    const previousSessionLocale = persistBeforeLoad ? readSessionLocale() : null;
    const optimisticWrite = persistBeforeLoad
      ? { locale: selectedLocale, previousStoredLocale, previousSessionLocale, previousCurrentLocale: currentLocale }
      : null;
    if (persistBeforeLoad) {
      optimisticLocaleWrite = optimisticWrite;
      saveLocale(selectedLocale);
      saveSessionLocale(selectedLocale);
    }
    // Initializations started during this save may observe its provisional value.
    // Keep the transaction they saw even if the save later rolls back.
    const observedWrite = optimisticLocaleWrite && optimisticLocaleWrite.locale === selectedLocale
      ? optimisticLocaleWrite : null;
    const thisRequest = ++requestId;
    let activeDictionary;
    let defaultDictionary;
    let resolvedLocale = selectedLocale;

    try {
      try {
        activeDictionary = await loadDictionary(selectedLocale);
      } catch (error) {
        if (selectedLocale === DEFAULT_LOCALE || settings.strictLocale) throw error;
        const previousLocale = observedWrite && [observedWrite.previousCurrentLocale, observedWrite.previousStoredLocale, observedWrite.previousSessionLocale]
          .find(candidate => candidate && candidate !== selectedLocale);
        resolvedLocale = previousLocale || DEFAULT_LOCALE;
        console.warn('[i18n] Falling back after a language load failure.', error);
        try {
          activeDictionary = await loadDictionary(resolvedLocale);
        } catch (fallbackError) {
          if (resolvedLocale === DEFAULT_LOCALE) throw fallbackError;
          resolvedLocale = DEFAULT_LOCALE;
          activeDictionary = await loadDictionary(DEFAULT_LOCALE);
        }
      }

      if (resolvedLocale === DEFAULT_LOCALE) {
        defaultDictionary = activeDictionary;
      } else {
        try {
          defaultDictionary = await loadDictionary(DEFAULT_LOCALE);
        } catch (error) {
          console.warn('[i18n] Default fallback dictionary could not be loaded.', error);
          defaultDictionary = {};
        }
      }
    } catch (error) {
      if (optimisticWrite && optimisticLocaleWrite === optimisticWrite) {
        try {
          if (readStoredLocale() === selectedLocale) {
            if (previousStoredLocale) localStorage.setItem(STORAGE_KEY, previousStoredLocale);
            else localStorage.removeItem(STORAGE_KEY);
          }
        } catch (_) {}
        try {
          if (readSessionLocale() === selectedLocale) {
            if (previousSessionLocale) sessionStorage.setItem(SESSION_STORAGE_KEY, previousSessionLocale);
            else sessionStorage.removeItem(SESSION_STORAGE_KEY);
          }
        } catch (_) {}
        optimisticLocaleWrite = null;
      }
      throw error;
    }

    if (thisRequest !== requestId) return currentLocale;

    currentLocale = resolvedLocale;
    currentDictionary = activeDictionary;
    fallbackDictionary = defaultDictionary;
    document.documentElement.lang = LOCALE_TAGS[currentLocale] || currentLocale;
    if (languageSelect) languageSelect.value = currentLocale;
    apply(document);

    if (settings.persist !== false) {
      saveLocale(currentLocale);
      saveSessionLocale(currentLocale);
    }
    if (optimisticLocaleWrite && (optimisticLocaleWrite === optimisticWrite || optimisticLocaleWrite.locale === currentLocale)) optimisticLocaleWrite = null;
    window.dispatchEvent(new CustomEvent('site:languagechange', { detail: { locale: currentLocale } }));
    return currentLocale;
  }

  function bindLanguageSelect(select) {
    const nextSelect = typeof select === 'string' ? document.querySelector(select) : select;
    if (languageSelect && selectChangeHandler) {
      languageSelect.removeEventListener('change', selectChangeHandler);
    }
    languageSelect = nextSelect || null;
    selectChangeHandler = null;
    if (languageSelect) {
      selectChangeHandler = () => {
        const selectedLocale = normalizeLocale(languageSelect.value);
        saveLocale(selectedLocale);
        saveSessionLocale(selectedLocale);
        setLocale(selectedLocale).catch(error => console.error('[i18n] Could not change language.', error));
      };
      languageSelect.addEventListener('change', selectChangeHandler);
    }
  }

  async function init(options) {
    const settings = options || {};
    cleanFullReloadMarkerAfterLoad();
    if (settings.namespace !== undefined) currentNamespace = settings.namespace;
    if (Object.prototype.hasOwnProperty.call(settings, 'select')) bindLanguageSelect(settings.select);

    if (!storageListenerBound) {
      window.addEventListener('storage', event => {
        if (event.key === STORAGE_KEY || event.key === null) {
          setLocale(readStoredLocale() || settings.defaultLocale || DEFAULT_LOCALE, { persist: false });
        }
      });
      storageListenerBound = true;
    }

    const storedLocale = readStoredLocale();
    const sessionLocale = readSessionLocale();
    const initialLocale = storedLocale || sessionLocale || settings.defaultLocale || DEFAULT_LOCALE;
    if (!storedLocale && !sessionLocale) {
      scheduleFirstVisitLanguageDetection(normalizeLocale(settings.defaultLocale || DEFAULT_LOCALE));
    }
    return setLocale(initialLocale, { persist: false });
  }

  window.SiteI18n = Object.freeze({
    init,
    setLocale,
    apply,
    loadLocale,
    get locale() { return currentLocale; },
    get storageKey() { return STORAGE_KEY; }
  });
})(window, document);
