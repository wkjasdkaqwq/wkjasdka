(function (window, document) {
  'use strict';

  const STORAGE_KEY = 'wkjasdka-language';
  const SESSION_STORAGE_KEY = `${STORAGE_KEY}-session`;
  const FULL_RELOAD_QUERY_PARAM = '_wkjasdka_full_reload';
  const DEFAULT_LOCALE = 'en';
  const SUPPORTED_LOCALES = ['en', 'zh-CN'];
  const LOCALE_TAGS = { en: 'en-GB', 'zh-CN': 'zh-CN' };
  const fullReloadToken = new URL(window.location.href).searchParams.get(FULL_RELOAD_QUERY_PARAM);
  const scriptElement = document.currentScript;
  const localeDirectory = scriptElement && scriptElement.src
    ? new URL('../locales/', scriptElement.src)
    : new URL('./locales/', document.baseURI);
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

  function normalizeLocale(locale) {
    if (locale === 'zh-CN' || /^zh(?:-|_|$)/i.test(String(locale || ''))) return 'zh-CN';
    if (locale === 'en' || /^en(?:-|_|$)/i.test(String(locale || ''))) return 'en';
    return DEFAULT_LOCALE;
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
      const tag = String(preference || '').trim().replace(/_/g, '-').toLowerCase();
      if (/^en(?:-|$)/.test(tag)) return 'en';
      if (/^zh(?:-|$)/.test(tag)) {
        const traditionalChinese = /(?:^|-)hant(?:-|$)/.test(tag) || /(?:^|-)(?:tw|hk|mo)(?:-|$)/.test(tag);
        if (!traditionalChinese) return 'zh-CN';
      }
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

  function loadDictionary(locale) {
    if (!dictionaryPromises.has(locale)) {
      const url = new URL(`${encodeURIComponent(locale)}.json`, localeDirectory);
      if (fullReloadToken) url.searchParams.set(FULL_RELOAD_QUERY_PARAM, fullReloadToken);
      const request = fetch(url, { credentials: 'same-origin', cache: fullReloadToken ? 'reload' : 'default' }).then(response => {
        if (!response.ok) throw new Error(`Could not load locale dictionary: ${url.pathname} (${response.status})`);
        return response.json();
      });
      dictionaryPromises.set(locale, request);
      request.catch(() => dictionaryPromises.delete(locale));
    }
    return dictionaryPromises.get(locale);
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
    const selector = '[data-i18n], [data-i18n-aria-label], [data-i18n-title], [data-i18n-tooltip], [data-i18n-placeholder], [data-i18n-alt]';
    const elements = [];
    if (scope.nodeType === 1 && scope.matches(selector)) elements.push(scope);
    if (typeof scope.querySelectorAll === 'function') elements.push(...scope.querySelectorAll(selector));

    let applied = 0;
    for (const element of elements) {
      const textKey = element.dataset.i18n;
      if (textKey) {
        const value = translatedValue(textKey, namespace);
        if (value !== undefined && value !== null) {
          element.textContent = String(value);
          applied += 1;
        }
      }

      for (const [dataAttribute, htmlAttribute] of Object.entries(translatedAttributes)) {
        const key = element.getAttribute(dataAttribute);
        if (!key) continue;
        const value = translatedValue(key, namespace);
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
    const thisRequest = ++requestId;
    let activeDictionary;
    let defaultDictionary;
    let resolvedLocale = selectedLocale;

    try {
      activeDictionary = await loadDictionary(selectedLocale);
    } catch (error) {
      if (selectedLocale === DEFAULT_LOCALE) throw error;
      console.warn('[i18n] Falling back to the default language.', error);
      resolvedLocale = DEFAULT_LOCALE;
      activeDictionary = await loadDictionary(DEFAULT_LOCALE);
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
      selectChangeHandler = () => setLocale(languageSelect.value);
      languageSelect.addEventListener('change', selectChangeHandler);
    }
  }

  async function init(options) {
    const settings = options || {};
    cleanFullReloadMarkerAfterLoad();
    if (settings.namespace !== undefined) currentNamespace = settings.namespace;
    if (settings.select) bindLanguageSelect(settings.select);

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
    get locale() { return currentLocale; },
    get storageKey() { return STORAGE_KEY; }
  });
})(window, document);
