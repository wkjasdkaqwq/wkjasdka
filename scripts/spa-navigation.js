/* Preserve the running homepage while presenting settings as a same-document view. */
(function (window, document) {
  'use strict';

  const settingsLink = document.querySelector('.sidebar-settings');
  const homeNodes = ['navbar', 'sidebar', 'overlay', 'loadingScreen', 'mainContent']
    .map(id => document.getElementById(id));
  if (!settingsLink || homeNodes.some(node => !node) || !window.SettingsPage || !window.SiteI18n) return;

  const settingsUrl = new URL(settingsLink.href);
  const historyKey = '__wkjasdkaSpa';
  const homeMarker = document.createComment('spa-home-position');
  const homeFragment = document.createDocumentFragment();
  document.body.insertBefore(homeMarker, homeNodes[0]);

  let settingsPromise = null;
  let settingsView = null;
  let settingsStyle = null;
  let settingsController = null;
  let activeView = 'home';
  let navigationToken = 0;
  let homeSnapshot = null;
  let homeUrl = window.location.href;
  let returningHome = false;
  let backTraversalOutstanding = false;
  let returnFallbackTimer = null;
  let reopenSettingsAfterReturn = false;

  function loadSettings() {
    if (!settingsPromise) {
      settingsPromise = fetch(settingsUrl.href, { credentials: 'same-origin', cache: 'no-cache' })
        .then(response => {
          if (!response.ok) throw new Error(`Settings request failed (${response.status})`);
          return response.text();
        })
        .then(html => {
          const parsed = new DOMParser().parseFromString(html, 'text/html');
          const navbar = parsed.querySelector('body > nav.navbar');
          const main = parsed.querySelector('body > main');
          const modal = parsed.querySelector('body > .shortcuts-modal');
          const style = parsed.querySelector('head > style');
          if (!navbar || !main || !modal || !style) throw new Error('Settings page is missing required content');

          settingsView = document.createElement('div');
          settingsView.id = 'spa-settings-view';
          [navbar, main, modal].forEach(node => settingsView.appendChild(document.importNode(node, true)));
          settingsStyle = document.createElement('style');
          settingsStyle.dataset.spaSettings = '';
          settingsStyle.textContent = style.textContent;
        })
        .catch(error => {
          settingsPromise = null;
          throw error;
        });
    }
    return settingsPromise;
  }

  function stateWithView(view) {
    const previous = window.history.state;
    const state = previous && typeof previous === 'object' ? { ...previous } : {};
    state[historyKey] = { view };
    return state;
  }

  function restoreHome() {
    if (activeView !== 'settings') return;

    if (settingsController) {
      try { settingsController.deactivate(); }
      catch (error) { console.error('[spa] Could not fully clean up settings.', error); }
    }
    settingsView.remove();
    settingsStyle.remove();
    homeMarker.parentNode.insertBefore(homeFragment, homeMarker.nextSibling);
    document.body.classList.remove('spa-settings-active');
    document.body.style.overflow = homeSnapshot ? homeSnapshot.overflow : '';
    activeView = 'home';

    try {
      Promise.resolve(window.SiteI18n.init({ namespace: 'home', select: null, defaultLocale: 'en' }))
        .catch(error => console.error('[spa] Could not restore homepage translations.', error));
    } catch (error) {
      console.error('[spa] Could not restore homepage translations.', error);
    }
    if (homeSnapshot) {
      window.scrollTo(homeSnapshot.x, homeSnapshot.y);
      if (homeSnapshot.focus && homeSnapshot.focus.isConnected) {
        homeSnapshot.focus.focus({ preventScroll: true });
      }
    }
  }

  function isSettingsLocation() {
    const currentUrl = new URL(window.location.href);
    return currentUrl.origin === settingsUrl.origin && currentUrl.pathname === settingsUrl.pathname;
  }

  function finishReturnFallback() {
    if (!returningHome) return;
    returningHome = false;
    if (returnFallbackTimer !== null) window.clearTimeout(returnFallbackTimer);
    returnFallbackTimer = null;
    if (activeView === 'home' && isSettingsLocation()) {
      // Do not issue another history.back(): the first traversal may still arrive.
      // Replace only the stalled settings entry so the visible home and URL agree.
      try { window.history.replaceState(stateWithView('home'), '', homeUrl); }
      catch (error) {
        console.error('[spa] Could not repair the homepage history entry.', error);
        window.location.replace(homeUrl);
        return;
      }
    }
    if (reopenSettingsAfterReturn) {
      reopenSettingsAfterReturn = false;
      showSettings(true);
    }
  }

  function returnToHome() {
    if (returningHome || activeView !== 'settings') return;
    returningHome = true;
    // The homepage nodes were kept alive; restore them without waiting for I/O.
    restoreHome();
    if (backTraversalOutstanding) {
      // A previous traversal did not acknowledge completion; never queue another.
      finishReturnFallback();
      return;
    }
    backTraversalOutstanding = true;
    returnFallbackTimer = window.setTimeout(finishReturnFallback, 1500);
    try { window.history.back(); }
    catch (error) {
      console.error('[spa] Could not traverse back to the homepage.', error);
      backTraversalOutstanding = false;
      window.clearTimeout(returnFallbackTimer);
      finishReturnFallback();
    }
  }

  async function showSettings(pushHistory) {
    if (activeView === 'settings') return;
    const token = ++navigationToken;
    const sourceUrl = window.location.href;
    try {
      await loadSettings();
      if (token !== navigationToken || activeView !== 'home') return;
      const current = window.history.state && window.history.state[historyKey];
      if (pushHistory && (window.location.href !== sourceUrl || (current && current.view === 'settings'))) return;
      if (!pushHistory && (!current || current.view !== 'settings')) return;

      homeSnapshot = {
        x: window.scrollX,
        y: window.scrollY,
        overflow: document.body.style.overflow,
        focus: document.activeElement
      };
      if (pushHistory) {
        homeUrl = window.location.href;
        window.history.replaceState(stateWithView('home'), '', window.location.href);
        window.history.pushState({ [historyKey]: { view: 'settings' } }, '', settingsUrl.href);
      }

      homeNodes.forEach(node => homeFragment.appendChild(node));
      document.body.style.overflow = '';
      document.body.classList.add('spa-settings-active');
      document.head.appendChild(settingsStyle);
      document.body.appendChild(settingsView);
      activeView = 'settings';
      window.scrollTo(0, 0);

      if (!settingsController) {
        settingsController = window.SettingsPage.init(settingsView, {
          spa: true,
          onBack: returnToHome
        });
      } else {
        settingsController.activate();
      }
    } catch (error) {
      console.error('[spa] Could not open settings; falling back to normal navigation.', error);
      if (token === navigationToken) {
        if (window.location.href === settingsUrl.href) window.location.reload();
        else window.location.assign(settingsUrl.href);
      }
    }
  }

  settingsLink.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || settingsLink.target || settingsLink.hasAttribute('download')) return;
    event.preventDefault();
    if (returningHome) {
      reopenSettingsAfterReturn = true;
      return;
    }
    const current = window.history.state && window.history.state[historyKey];
    showSettings(!(current && current.view === 'settings'));
  });

  window.addEventListener('popstate', event => {
    navigationToken += 1;
    backTraversalOutstanding = false;
    if (returningHome && isSettingsLocation()) {
      // A same-document entry still points at settings: do not remount it.
      finishReturnFallback();
      return;
    }
    if (returnFallbackTimer !== null) window.clearTimeout(returnFallbackTimer);
    returnFallbackTimer = null;
    const reopen = returningHome && reopenSettingsAfterReturn;
    returningHome = false;
    reopenSettingsAfterReturn = false;
    const view = event.state && event.state[historyKey] && event.state[historyKey].view;
    if (view === 'settings') showSettings(false);
    else restoreHome();
    if (reopen && view !== 'settings') showSettings(true);
  });
})(window, document);
