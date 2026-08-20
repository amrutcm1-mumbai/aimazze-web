/*
  brand-loader.js — AIMAZZE branded loading transition (marketing site).

  Companion to the BRAND SYSTEM block in chambers.css. The overlay markup
  lives inline as the first child of <body> on every page (so it paints on the
  first frame, before this script has even run); this file owns when it shows
  and when it goes away.

  No asset paths here. The mark and wordmark are the --brand-mark /
  --brand-wordmark tokens in chambers.css — that is the single swap point.

  -- WHERE IT TRIGGERS -------------------------------------------------------
    1. Initial page load — overlay is already on screen from the markup; this
       script decides when to take it down.
    2. Internal link clicks — same-origin anchors, intercepted so the overlay
       comes up while the next document is still being fetched. Because every
       page ships the same overlay in the same position, the outgoing and
       incoming overlays line up and the navigation reads as one continuous
       transition rather than two separate flashes.
    3. Form submissions — same treatment as a link.
    4. Programmatic navigation — not detectable generically, so it opts in via
       window.AimazzeBrandLoader.show() before setting location.
    5. Back/forward — a bfcache restore (pageshow.persisted) hides the overlay
       immediately, since nothing is actually loading.

  -- TIMING ------------------------------------------------------------------
  Two problems to avoid, pulling in opposite directions: flashing on a fast
  load, and looking stuck on a slow one. Four numbers handle both.

    showDelay   120ms  Grace period. A navigation that resolves faster than
                       this never shows the overlay at all — that is what
                       prevents the flash, rather than trying to smooth over
                       a flash after the fact.
    minVisible  520ms  Once the overlay IS up, it stays up this long even if
                       the page is ready sooner, so it cannot blink in and out.
                       Measured from when it became visible.
    slowNote   2500ms  Reveals the "still loading" line. Silence past a couple
                       of seconds is what reads as broken.
    maxVisible 8000ms  Hard cap. The overlay comes down and reveals whatever
                       has painted so far. A permanently-covered page is worse
                       than a half-painted one.

  These four numbers are deliberately identical to BRAND_TRANSITION in the
  desktop app (aimazze-app/src/config/brand.ts) so the same navigation feels
  the same on the site and in the app. That file is the source of truth for
  the mechanic; if it changes, change these to match.

  Timing is also mirrored in chambers.css (:root) for the no-JS backstop.
  Change all three together.
*/
(function () {
  "use strict";

  var BRAND_LOADER = {
    timing: {
      showDelay: 120,
      minVisible: 520,
      slowNote: 2500,
      maxVisible: 8000
    },
    selectors: {
      overlay: ".brand-loader",
      armed: "brand-loader--armed"
    },
    classes: {
      ready: "brand-ready",
      slow: "brand-slow"
    }
  };

  var root = document.documentElement;
  var overlay = document.querySelector(BRAND_LOADER.selectors.overlay);
  if (!overlay) return;

  // JS is alive — take ownership of timing and disarm the CSS-only backstop.
  overlay.classList.remove(BRAND_LOADER.selectors.armed);

  var t = BRAND_LOADER.timing;
  var shownAt = performance.now();   // overlay is visible from first paint
  var visible = true;
  var timers = [];

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }
  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }

  function hide() {
    clearTimers();
    visible = false;
    root.classList.add(BRAND_LOADER.classes.ready);
    root.classList.remove(BRAND_LOADER.classes.slow);
  }

  /* Hide respecting minVisible, so the overlay never blinks. graceOnly is for
     the initial load: if the document was ready inside the show-delay window
     it was effectively instant, and holding it to minVisible would manufacture
     a delay the user would otherwise never have seen. */
  function release(graceOnly) {
    if (!visible) return;
    var up = performance.now() - shownAt;
    if (graceOnly && up < t.showDelay) return hide();
    if (up >= t.minVisible) return hide();
    later(hide, t.minVisible - up);
  }

  function show() {
    clearTimers();
    if (!visible) {
      visible = true;
      shownAt = performance.now();
      root.classList.remove(BRAND_LOADER.classes.ready);
    }
    var up = performance.now() - shownAt;
    later(function () { root.classList.add(BRAND_LOADER.classes.slow); },
          Math.max(0, t.slowNote - up));
    later(hide, Math.max(0, t.maxVisible - up));
  }

  /* Same as show(), but only if the thing we are waiting on outlasts the grace
     period — used for navigation, where a fast response should show nothing. */
  var pendingShow = null;
  function showAfterGrace() {
    if (pendingShow || visible) return;
    pendingShow = setTimeout(function () {
      pendingShow = null;
      show();
    }, t.showDelay);
  }
  function cancelPendingShow() {
    if (pendingShow) { clearTimeout(pendingShow); pendingShow = null; }
  }

  /* -- 1. Initial load ---------------------------------------------------- */

  // Arm the slow-note and hard cap for the initial load too.
  later(function () { root.classList.add(BRAND_LOADER.classes.slow); }, t.slowNote);
  later(hide, t.maxVisible);

  if (document.readyState === "complete") {
    release(true);
  } else {
    window.addEventListener("load", function () { release(true); }, { once: true });
  }

  /* -- 2. Internal links -------------------------------------------------- */

  function isPlainLeftClick(e) {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  }

  function shouldIntercept(a) {
    if (!a || !a.getAttribute("href")) return false;
    if (a.hasAttribute("download")) return false;
    if (a.dataset.brandLoader === "off") return false;
    if (a.target && a.target !== "" && a.target !== "_self") return false;
    if ((a.getAttribute("rel") || "").indexOf("external") !== -1) return false;

    // mailto:, tel:, javascript:, and anything else non-navigational
    if (a.protocol !== "http:" && a.protocol !== "https:") return false;

    // cross-origin — we do not own the destination paint, so no transition
    if (a.origin !== window.location.origin) return false;

    // In-page anchor: this site scrolls smoothly to it, nothing loads.
    if (a.pathname === window.location.pathname &&
        a.search === window.location.search &&
        a.hash) return false;

    return true;
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || !isPlainLeftClick(e)) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (shouldIntercept(a)) showAfterGrace();
  }, true);

  /* -- 3. Form submissions ------------------------------------------------ */

  document.addEventListener("submit", function (e) {
    if (e.defaultPrevented) return;               // handled by fetch, not a nav
    var form = e.target;
    if (form && form.dataset && form.dataset.brandLoader === "off") return;
    showAfterGrace();
  }, true);

  /* -- 5. Back/forward ---------------------------------------------------- */

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {          // restored from bfcache — nothing is loading
      cancelPendingShow();
      hide();
    }
  });

  /* A navigation the browser declined to make (blocked popup, cancelled
     download, a link that turned out to be a file) leaves us sitting here with
     the overlay up. Bail out when the tab is shown again. */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && visible) release(false);
  });

  /* -- 4. Public API, for programmatic navigation ------------------------- */

  window.AimazzeBrandLoader = {
    show: show,                 // call before location.href = ... redirects
    hide: function () { cancelPendingShow(); hide(); },
    timing: t
  };
})();
