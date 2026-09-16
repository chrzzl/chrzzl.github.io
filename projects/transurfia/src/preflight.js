// ============================================================================
// PREFLIGHT
// ============================================================================
//
// Decides whether this browser can run Transurfia at all, and if not, says so
// on screen instead of leaving the welcome overlay up forever.
//
// Two deliberate oddities, both forced by what this file has to survive:
//
// 1. It is a CLASSIC script, not a module, and it is written in ES5 — no
//    const, no arrow functions, no template literals. One of the failures it
//    exists to report is "this browser is too old to load the application at
//    all". A reporter written in the syntax under suspicion would fail to parse
//    in exactly the case it was needed, and the user would be back to a dead
//    welcome screen. ES5 parses everywhere.
//
// 2. It talks to the application through a global, `window.Transurfia`. A
//    classic script cannot be imported by a module, and a module cannot be
//    relied upon to run here, so a global is the only channel that exists in
//    both directions.
//
// It knows nothing about three.js, the surface, or the renderer. The only
// contract with the app is the four functions published at the bottom.

(function (global) {
  'use strict';

  var BLOCKER_ID = 'blocker';

  // How long the application is given to reach ready() before we assume it is
  // never going to. This is the catch-all: import maps unsupported on a browser
  // too old to admit it, a 404 on the three.js build, a syntax error in a
  // module, a network stall. Every one of those ends with main.js never running
  // and no error anywhere the user can see.
  //
  // Generous, because it is racing a cold cache fetching ~600 KB of three.js
  // plus three tile textures on a slow connection. A false positive here would
  // tell a working browser it is broken, which is worse than a few extra
  // seconds of welcome screen.
  var STARTUP_TIMEOUT_MS = 12000;

  // ---- environment detection ---------------------------------------------
  //
  // Split from the decision below so the rules can be tested without a browser:
  // detect() is the only part that touches the platform, evaluate() is pure.

  function supportsModules() {
    // The standard test. A browser that understands type="module" also
    // understands the `nomodule` attribute, and one that does not, does not.
    return 'noModule' in document.createElement('script');
  }

  function supportsImportMaps() {
    // HTMLScriptElement.supports is itself newer (Chrome 106+) than import map
    // support (Chrome 89+), so a `false` from a browser that HAS the method is
    // trustworthy but its ABSENCE proves nothing — Chrome 89-105 would look
    // unsupported and get told to upgrade for no reason.
    //
    // So: only a definite "no" counts. Everything else is left to the startup
    // watchdog, which catches a genuinely missing import map anyway by noticing
    // that the app never started.
    if (typeof HTMLScriptElement === 'undefined') return null;
    if (typeof HTMLScriptElement.supports !== 'function') return null;
    try {
      return HTMLScriptElement.supports('importmap');
    } catch (e) {
      return null;
    }
  }

  function supportsPointerLock() {
    return typeof Element !== 'undefined' && 'requestPointerLock' in Element.prototype;
  }

  // Touch-ONLY, which is not the same question as "is this a phone".
  //
  // Deliberately conservative: all three signals must agree before we refuse to
  // start. A touchscreen laptop reports coarse pointers and a positive
  // maxTouchPoints just as a tablet does, and the thing that separates them is
  // `any-pointer: fine` — a mouse or trackpad somewhere on the device. Being
  // wrong in this direction shows a working desktop an error screen it cannot
  // dismiss, so the check errs toward letting a device through.
  function isTouchOnly() {
    var touchPoints = (global.navigator && global.navigator.maxTouchPoints) || 0;
    if (touchPoints === 0) return false;
    if (!global.matchMedia) return false;
    var coarse = global.matchMedia('(pointer: coarse)').matches;
    var fine = global.matchMedia('(any-pointer: fine)').matches;
    return coarse && !fine;
  }

  // Does a real WebGL2 context come back?
  //
  // three.js r163 dropped WebGL1 entirely and its renderer asks for 'webgl2'
  // and nothing else, so this is pass/fail rather than a quality setting. The
  // probe context is thrown away immediately — browsers cap how many live
  // contexts a page may hold, and leaking one here could be the reason the
  // renderer's own context request fails later.
  function probeWebGL2() {
    if (!global.WebGL2RenderingContext) return false;
    var canvas = document.createElement('canvas');
    var gl = null;
    try {
      gl = canvas.getContext('webgl2');
    } catch (e) {
      gl = null;
    }
    if (!gl) return false;
    var lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  }

  function detect() {
    return {
      modules: supportsModules(),
      importMaps: supportsImportMaps(),
      pointerLock: supportsPointerLock(),
      touchOnly: isTouchOnly(),
      webgl2: probeWebGL2(),
    };
  }

  // ---- the decision -------------------------------------------------------
  //
  // Pure: an environment object in, either null (go ahead) or a report out.
  // `code` is for tests and the console; `title` and `lines` are what the user
  // reads.
  //
  // Order matters. The device check comes before the WebGL one so that a tablet
  // — which may well have perfectly good WebGL2 — is told the real reason it
  // cannot play rather than being sent off to enable hardware acceleration.

  function evaluate(env) {
    if (env.touchOnly || !env.pointerLock) {
      return {
        code: 'touch-device',
        title: 'Desktop only, for now',
        lines: [
          'Mobile and touch devices are not currently supported.',
          'Transurfia needs a mouse and a keyboard: you look with the pointer ' +
            'locked to the window and walk with W, A, S and D.',
        ],
      };
    }

    if (env.modules === false || env.importMaps === false) {
      return {
        code: 'browser-too-old',
        title: 'This browser is too old',
        lines: [
          'This experience requires a modern desktop browser with WebGL2.',
          'Chrome or Edge 89+, Firefox 108+, or Safari 16.4+ will work.',
        ],
      };
    }

    if (!env.webgl2) {
      return {
        code: 'no-webgl2',
        title: 'WebGL2 is unavailable',
        lines: [
          'WebGL2 could not be initialized. Please enable hardware ' +
            'acceleration or try another browser.',
          'Remote desktop sessions and virtual machines often have no GPU to ' +
            'offer, which has the same effect.',
        ],
      };
    }

    return null;
  }

  // Reports that did not come from evaluate(): the application failed after the
  // environment had already been cleared. Kept here so there is exactly one
  // place that knows what an error screen looks like.
  var LATE_FAILURES = {
    'renderer-failed': {
      title: 'The renderer could not start',
      lines: [
        'WebGL2 could not be initialized. Please enable hardware ' +
          'acceleration or try another browser.',
        'The browser reported WebGL2 as available, but refused to create a ' +
          'context for it.',
      ],
    },
    'context-lost': {
      title: 'The graphics context was lost',
      lines: [
        'The browser took the GPU back — usually a driver reset, or a tab ' +
          'left in the background too long.',
        'Reloading the page will start it again.',
      ],
    },
    'startup-failed': {
      title: 'Transurfia could not start',
      lines: [
        'Something went wrong while loading. Reloading the page may help.',
        'This experience requires a modern desktop browser with WebGL2.',
      ],
    },
  };

  // ---- the screen ---------------------------------------------------------

  var reported = false;

  function render(report) {
    // First report wins. A failing renderer tends to produce several errors in
    // a row, and the first is invariably the informative one.
    if (reported) return;
    reported = true;

    cancelWatchdog();

    var blocker = document.getElementById(BLOCKER_ID);
    if (!blocker) return;

    // Built with DOM calls rather than innerHTML because some of this text
    // ends up carrying a browser's own error message, which is not ours to
    // trust as markup.
    var panel = document.createElement('div');

    var heading = document.createElement('h1');
    heading.appendChild(document.createTextNode(report.title));
    panel.appendChild(heading);

    for (var i = 0; i < report.lines.length; i++) {
      var line = document.createElement('p');
      line.className = 'reason';
      line.appendChild(document.createTextNode(report.lines[i]));
      panel.appendChild(line);
    }

    blocker.innerHTML = '';
    blocker.appendChild(panel);

    // The welcome screen is a button — it asks for pointer lock when clicked.
    // This one is not, and saying so with the cursor keeps anyone from clicking
    // at it waiting for something to happen.
    blocker.className = 'error';
    blocker.classList.remove('hidden');
  }

  // ---- the startup watchdog ----------------------------------------------

  var watchdog = null;

  function cancelWatchdog() {
    if (watchdog !== null) {
      global.clearTimeout(watchdog);
      watchdog = null;
    }
  }

  function startWatchdog() {
    watchdog = global.setTimeout(function () {
      watchdog = null;
      console.error(
        '[transurfia] the application did not start within ' +
          STARTUP_TIMEOUT_MS +
          'ms. The module script most likely failed to load or execute — ' +
          'check the network and console tabs.'
      );
      render(LATE_FAILURES['startup-failed']);
    }, STARTUP_TIMEOUT_MS);
  }

  // ---- public surface -----------------------------------------------------

  var passed = false;

  // Run once, now. The script tag sits after #blocker in the document so the
  // element is already there to write into.
  function run() {
    var env = detect();
    var report = evaluate(env);

    if (report) {
      console.error('[transurfia] preflight failed: ' + report.code, env);
      render(report);
      return false;
    }

    startWatchdog();
    return true;
  }

  global.Transurfia = {
    // False once a check has failed. main.js reads this and does not build the
    // application — "do not start" is the whole point of a preflight.
    ok: function () {
      return passed && !reported;
    },

    // Called by main.js once the application is alive. Stops the watchdog.
    ready: function () {
      cancelWatchdog();
    },

    // Called by the application when it fails after preflight passed. `code` is
    // one of LATE_FAILURES; `error` is kept for the console only, never shown,
    // so that a user is not handed a raw stack trace.
    fail: function (code, error) {
      if (error) console.error('[transurfia] ' + code + ':', error);
      render(LATE_FAILURES[code] || LATE_FAILURES['startup-failed']);
    },

    // Exposed for the offline self-check in tools/preflight.selfcheck.mjs,
    // which drives evaluate() over synthetic environments. Nothing in the
    // application calls these.
    _internals: { detect: detect, evaluate: evaluate },
  };

  passed = run();
}(window));
