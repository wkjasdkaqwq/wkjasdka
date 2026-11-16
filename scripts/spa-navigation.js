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

  function loadSettings() {
    if (!settingsPromise) {
      settingsPromise = fetch(settingsUrl.href, { credentials: 'same-origin' })
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

    if (settingsController) settingsController.deactivate();
    settingsView.remove();
    settingsStyle.remove();
    homeMarker.parentNode.insertBefore(homeFragment, homeMarker.nextSibling);
    document.body.classList.remove('spa-settings-active');
    document.body.style.overflow = homeSnapshot ? homeSnapshot.overflow : '';
    activeView = 'home';

    window.SiteI18n.init({ namespace: 'home', select: null, defaultLocale: 'en' })
      .catch(error => console.error('[spa] Could not restore homepage translations.', error));
    if (homeSnapshot) {
      window.scrollTo(homeSnapshot.x, homeSnapshot.y);
      if (homeSnapshot.focus && homeSnapshot.focus.isConnected) {
        homeSnapshot.focus.focus({ preventScroll: true });
      }
    }
  }

  async function showSettings(pushHistory) {
    if (activeView === 'settings') return;
    const token = ++navigationToken;
    try {
      await loadSettings();
      if (token !== navigationToken) return;

      homeSnapshot = {
        x: window.scrollX,
        y: window.scrollY,
        overflow: document.body.style.overflow,
        focus: document.activeElement
      };
      if (pushHistory) {
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
          onBack: () => window.history.back()
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
    showSettings(true);
  });

  window.addEventListener('popstate', event => {
    navigationToken += 1;
    const view = event.state && event.state[historyKey] && event.state[historyKey].view;
    if (view === 'settings') showSettings(false);
    else restoreHome();
  });
})(window, document);
