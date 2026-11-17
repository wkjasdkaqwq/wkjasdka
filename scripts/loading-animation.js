/* Shared implementation of resource/loading customization.html. */
(function (window, document) {
  'use strict';

  const STYLE_ID = 'wkjasdka-loading-animation-style';
  const animationStyles = `
    .wkjasdka-loading-animation { position: fixed; top: 0; left: 0; width: 100%; height: 8px; overflow: hidden; pointer-events: none; }
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
    let stopped = false;
    let frameId = null;
    let barFrameId = null;
    let checkFrameId = null;
    let replayTimer = null;
    let geometry;
    let progressNew;

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
      if (progressNew) progressNew.style.width = `${barWidth}px`;
    }

    function cycle() {
      if (stopped) return;
      container.innerHTML = '<div class="progress-container"><div class="progress-bar"></div></div>' +
        '<div class="progress-container-new"><div class="progress-bar-new"></div></div>' +
        '<div class="ball"></div><div class="ball-slow"></div>';
      const ball = container.querySelector('.ball');
      const ballSlow = container.querySelector('.ball-slow');
      const progressBar = container.querySelector('.progress-bar');
      progressNew = container.querySelector('.progress-bar-new');
      let progressTriggered = false;
      let slowBallTriggered = false;
      let newProgressTriggered = false;
      const cycleStartedAt = performance.now();
      let shrinkStartedAt = 0;
      updateGeometry();

      function finishCycle() {
        if (stopped) return;
        window.dispatchEvent(new Event('wkjasdka:loading-finished'));
        if (typeof options.onCycle === 'function') options.onCycle();
        if (options.loop) replayTimer = window.setTimeout(cycle, 150);
      }

      function startBarAnimation(startTime) {
        progressNew.style.left = `${geometry.barStart}px`;
        function animate(currentTime) {
          if (stopped) return;
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / geometry.barDuration, 1);
          progressNew.style.left = `${geometry.barStart + geometry.barDistance * progress}px`;
          if (progress < 1) barFrameId = window.requestAnimationFrame(animate);
          else {
            progressNew.style.left = '100%';
            finishCycle();
          }
        }
        barFrameId = window.requestAnimationFrame(animate);
      }

      function startBallAnimation() {
        const startTime = performance.now();
        ballSlow.style.left = `${geometry.ballStart}px`;
        function animate(currentTime) {
          if (stopped) return;
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / geometry.ballDuration, 1);
          ballSlow.style.left = `${geometry.ballStart + geometry.ballDistance * progress}px`;
          if (!newProgressTriggered) {
            startBarAnimation(startTime);
            newProgressTriggered = true;
          }
          if (progress < 1) frameId = window.requestAnimationFrame(animate);
          else ballSlow.style.left = 'calc(100% + 8px)';
        }
        frameId = window.requestAnimationFrame(animate);
      }

      function monitorProgressShrink() {
        if (stopped || slowBallTriggered) return;
        const width = parseFloat(window.getComputedStyle(progressBar).width);
        const fullWidth = parseFloat(window.getComputedStyle(container.querySelector('.progress-container')).width);
        if ((fullWidth > 0 && width < fullWidth * .4) || performance.now() - shrinkStartedAt > 1600) {
          ballSlow.classList.add('active');
          slowBallTriggered = true;
          startBallAnimation();
        } else checkFrameId = window.requestAnimationFrame(monitorProgressShrink);
      }

      function checkBallPosition() {
        if (stopped || progressTriggered) return;
        const ballLeft = parseFloat(window.getComputedStyle(ball).left);
        if (geometry.containerWidth - ballLeft < geometry.triggerDistance || performance.now() - cycleStartedAt > 1200) {
          progressBar.classList.add('active');
          progressTriggered = true;
          shrinkStartedAt = performance.now();
          monitorProgressShrink();
        }
        if (!progressTriggered) checkFrameId = window.requestAnimationFrame(checkBallPosition);
      }
      checkBallPosition();
    }

    window.addEventListener('resize', updateGeometry);
    try {
      cycle();
    } catch (error) {
      stopped = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (barFrameId !== null) window.cancelAnimationFrame(barFrameId);
      if (checkFrameId !== null) window.cancelAnimationFrame(checkFrameId);
      if (replayTimer !== null) window.clearTimeout(replayTimer);
      window.removeEventListener('resize', updateGeometry);
      container.remove();
      throw error;
    }
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        if (barFrameId !== null) window.cancelAnimationFrame(barFrameId);
        if (checkFrameId !== null) window.cancelAnimationFrame(checkFrameId);
        if (replayTimer !== null) window.clearTimeout(replayTimer);
        window.removeEventListener('resize', updateGeometry);
        container.remove();
      }
    };
  }

  window.SiteLoadingAnimation = { start };
})(window, document);
