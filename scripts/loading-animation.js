/* Shared implementation of resource/loading customization.html. */
(function (window, document) {
  'use strict';

  const STYLE_ID = 'wkjasdka-loading-animation-style';
  const REPLAY_PROGRESS = 0.8;
  const animationStyles = `
    .wkjasdka-loading-animation { position: fixed; top: 0; left: 0; width: 100%; height: 8px; overflow: hidden; pointer-events: none; }
    .wkjasdka-loading-animation .wkjasdka-loading-cycle { position: absolute; inset: 0; overflow: hidden; }
    .wkjasdka-loading-animation .progress-container,
    .wkjasdka-loading-animation .progress-container-new { position: absolute; top: 0; left: 0; width: 100%; height: 8px; overflow: hidden; }
    .wkjasdka-loading-animation .progress-bar { position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: #ff8000; border-radius: 4px; animation: none; }
    .wkjasdka-loading-animation .progress-bar.active { animation: wkLoadingSlideProgress .5s linear forwards, wkLoadingStayProgress .8s linear .8s forwards, wkLoadingShrinkProgress .6s linear .7s forwards; animation-fill-mode: forwards; }
    .wkjasdka-loading-animation .progress-bar-new { position: absolute; top: 0; left: calc(-600px - 20px); width: 600px; height: 100%; background: #ff8000; border-radius: 4px; animation: none; }
    .wkjasdka-loading-animation .ball, .wkjasdka-loading-animation .ball-slow { position: absolute; top: 0; left: -20px; width: 8px; height: 8px; background: #ff8000; border-radius: 50%; }
    .wkjasdka-loading-animation .ball { animation: wkLoadingSlideBall .9s linear forwards; }
    .wkjasdka-loading-animation .ball-slow { opacity: 0; }
    .wkjasdka-loading-animation .ball-slow.active { opacity: 1; }
    @keyframes wkLoadingSlideBall { 0% { left: -20px; } 100% { left: calc(100% + 8px); } }
    @keyframes wkLoadingSlideProgress { 0% { left: -100%; } 100% { left: 0; } }
    @keyframes wkLoadingStayProgress { 0%, 100% { left: 0; width: 100%; } }
    @keyframes wkLoadingShrinkProgress { 0% { width: 100%; left: 0; } 100% { width: 0; left: 100%; } }
  `;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = animationStyles;
    document.head.appendChild(style);
  }

  // The caller may supply the reference page's existing container or let this
  // component create one. No network requests are made when playback starts.
  function start(parent, options = {}) {
    installStyles();
    const container = options.container || document.createElement('div');
    container.classList.add('animation-container', 'wkjasdka-loading-animation');
    container.setAttribute('aria-hidden', 'true');
    if (!container.isConnected) parent.appendChild(container);
    const mobileLayout = window.matchMedia('(max-width: 768px), (max-width: 1024px) and (pointer: coarse)');
    const activeCycles = new Set();
    let stopped = false;
    let finishing = false;
    let idleNotified = false;
    let cycleCount = 0;
    let geometry;
    let retainedCycle = null;

    function updateGeometry() {
      const containerWidth = Math.max(document.documentElement.clientWidth, 1);
      const scale = mobileLayout.matches ? containerWidth / 1440 : 1;
      const baseSpeed = 2.5 * scale;
      const fixedDistance = 170 * scale;
      const ballStart = mobileLayout.matches ? -Math.max(8, 30 * scale) : -30;
      const ballEnd = containerWidth + 8;
      const ballDistance = ballEnd - ballStart;
      const barWidth = 600 * scale;
      const barStart = ballStart - fixedDistance - barWidth;
      const barEnd = containerWidth + barWidth;
      const barDistance = barEnd - barStart;
      geometry = {
        containerWidth, triggerDistance: 430 * scale,
        ballStart, ballDistance, ballDuration: ballDistance / baseSpeed,
        barWidth, barStart, barDistance, barDuration: barDistance / baseSpeed
      };
      activeCycles.forEach(cycle => { cycle.progressNew.style.width = `${barWidth}px`; });
      if (retainedCycle) retainedCycle.progressNew.style.width = `${barWidth}px`;
    }

    function notifyIdle() {
      if (stopped || idleNotified || activeCycles.size || (!finishing && options.loop)) return;
      idleNotified = true;
      if (typeof options.onIdle === 'function') {
        try { options.onIdle(); }
        catch (error) { console.error('[loading] Idle callback failed.', error); }
      }
    }

    function cycle() {
      if (stopped || finishing) return;
      const layer = document.createElement('div');
      layer.className = 'wkjasdka-loading-cycle';
      layer.dataset.cycleIndex = String(++cycleCount);
      layer.innerHTML = '<div class="progress-container"><div class="progress-bar"></div></div>' +
        '<div class="progress-container-new"><div class="progress-bar-new"></div></div>' +
        '<div class="ball"></div><div class="ball-slow"></div>';
      container.appendChild(layer);
      const ball = layer.querySelector('.ball');
      const ballSlow = layer.querySelector('.ball-slow');
      const progressBar = layer.querySelector('.progress-bar');
      const state = {
        layer, index: cycleCount, progressNew: layer.querySelector('.progress-bar-new'),
        frameId: null, barFrameId: null, checkFrameId: null,
        startedAt: performance.now(), completed: false, nextStarted: false
      };
      activeCycles.add(state);
      let progressTriggered = false;
      let slowBallTriggered = false;
      let newProgressTriggered = false;
      let shrinkStartedAt = 0;
      updateGeometry();

      function finishCycle() {
        if (stopped || state.completed) return;
        state.completed = true;
        window.dispatchEvent(new Event('wkjasdka:loading-finished'));
        if (stopped) return;
        if (typeof options.onCycle === 'function') {
          try { options.onCycle(); }
          catch (error) { console.error('[loading] Cycle callback failed.', error); }
        }
        if (stopped) return;
        activeCycles.delete(state);
        if (options.loop) layer.remove();
        else retainedCycle = state;
        // The first run finishes completely before the second one starts.
        if (options.loop && state.index === 1 && !finishing) cycle();
        notifyIdle();
      }

      function startBarAnimation(startTime) {
        // A resize updates positions and lengths, but not this cycle's deadline.
        const barDuration = geometry.barDuration;
        state.progressNew.style.left = `${geometry.barStart}px`;
        function animate(currentTime) {
          if (stopped || state.completed) return;
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / barDuration, 1);
          state.progressNew.style.left = `${geometry.barStart + geometry.barDistance * progress}px`;
          // Include the earlier ball and bar phases when measuring the whole
          // animation, rather than starting the next run at 80% of just the tail.
          const fullDuration = startTime - state.startedAt + barDuration;
          if (options.loop && state.index > 1 && !finishing && !state.nextStarted &&
              currentTime - state.startedAt >= fullDuration * REPLAY_PROGRESS) {
            state.nextStarted = true;
            cycle();
          }
          if (progress < 1) state.barFrameId = window.requestAnimationFrame(animate);
          else {
            state.progressNew.style.left = '100%';
            state.barFrameId = null;
            finishCycle();
          }
        }
        state.barFrameId = window.requestAnimationFrame(animate);
      }

      function startBallAnimation() {
        const startTime = performance.now();
        ballSlow.style.left = `${geometry.ballStart}px`;
        function animate(currentTime) {
          if (stopped || state.completed) return;
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / geometry.ballDuration, 1);
          ballSlow.style.left = `${geometry.ballStart + geometry.ballDistance * progress}px`;
          if (!newProgressTriggered) {
            startBarAnimation(startTime);
            newProgressTriggered = true;
          }
          if (progress < 1) state.frameId = window.requestAnimationFrame(animate);
          else {
            state.frameId = null;
            ballSlow.style.left = 'calc(100% + 8px)';
          }
        }
        state.frameId = window.requestAnimationFrame(animate);
      }

      function monitorProgressShrink() {
        if (stopped || state.completed || slowBallTriggered) return;
        const width = parseFloat(window.getComputedStyle(progressBar).width);
        const fullWidth = parseFloat(window.getComputedStyle(layer.querySelector('.progress-container')).width);
        if ((fullWidth > 0 && width < fullWidth * .4) || performance.now() - shrinkStartedAt > 1600) {
          state.checkFrameId = null;
          ballSlow.classList.add('active');
          slowBallTriggered = true;
          startBallAnimation();
        } else state.checkFrameId = window.requestAnimationFrame(monitorProgressShrink);
      }

      function checkBallPosition() {
        if (stopped || state.completed || progressTriggered) return;
        const ballLeft = parseFloat(window.getComputedStyle(ball).left);
        if (geometry.containerWidth - ballLeft < geometry.triggerDistance || performance.now() - state.startedAt > 1200) {
          state.checkFrameId = null;
          progressBar.classList.add('active');
          progressTriggered = true;
          shrinkStartedAt = performance.now();
          monitorProgressShrink();
        }
        if (!progressTriggered) state.checkFrameId = window.requestAnimationFrame(checkBallPosition);
      }
      checkBallPosition();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      activeCycles.forEach(state => {
        if (state.frameId !== null) window.cancelAnimationFrame(state.frameId);
        if (state.barFrameId !== null) window.cancelAnimationFrame(state.barFrameId);
        if (state.checkFrameId !== null) window.cancelAnimationFrame(state.checkFrameId);
      });
      activeCycles.clear();
      window.removeEventListener('resize', updateGeometry);
      container.remove();
    }

    window.addEventListener('resize', updateGeometry);
    try {
      container.innerHTML = '';
      cycle();
    } catch (error) {
      stop();
      throw error;
    }
    return {
      // Stop scheduling new cycles but let every already-visible cycle finish.
      finish() {
        if (stopped || finishing) return;
        finishing = true;
        notifyIdle();
      },
      stop
    };
  }

  window.SiteLoadingAnimation = { start };
})(window, document);
