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

  // Is this a device that cannot be played on?
  //
  // Two attempts at this were wrong on real hardware, both times by trusting a
  // pointer media query to describe the device:
  //
  //   `any-pointer: fine` must be false      -> broke every Android phone.
  //      The query asks what the hardware CAN do, and a phone can take a
  //      stylus, so it matched and the phone was sent to the desktop version.
  //
  //   `pointer: coarse` must be true         -> broke the Surface Pro.
  //      Windows reports a coarse primary pointer on a Surface even with the
  //      Type Cover attached, so a real computer with a real keyboard and
  //      trackpad was sent to the demo.
  //
  // The lesson is that the pointer queries do not answer the question being
  // asked. They describe input hardware, hedged by what might be plugged in or
  // clipped on later, and every device in the awkward middle reports something
  // defensible that happens to be useless here. What actually decides whether
  // there is a keyboard and a mouse is the OPERATING SYSTEM: Android and iOS
  // cannot be played on, Windows and macOS can.
  //
  // So the OS is decided first, from platform strings, and the pointer queries
  // are consulted only afterwards, as a tie-breaker among desktop-class
  // systems. `coarse && !anyFine` is a perfectly good test down there — it was
  // only ever poisoned by the Android stylus case, which by then has been
  // ruled out.
  //
  // Platform sniffing is unfashionable, and it is the right tool for exactly
  // this: the question is which OS this is, and that is what platform strings
  // are for. It is still a guess about the world, so there is also a visible
  // way out in both directions — see forcedMode() and #demo-switch.

  function isMobileOS() {
    var nav = global.navigator || {};
    var ua = nav.userAgent || '';
    var uaData = nav.userAgentData;
    var platform = (uaData && typeof uaData.platform === 'string' && uaData.platform) || '';

    // Chromium's structured answer, where it exists (Chrome/Edge 90+, secure
    // contexts). Preferred over the UA string because it survives the UA
    // reduction that is steadily hollowing that string out.
    if (platform === 'Android') return true;

    if (/Android|iPhone|iPod/i.test(ua)) return true;
    if (/iPad/i.test(ua)) return true;

    // iPadOS 13 and later report themselves as a Mac, and no other signal
    // catches them. A Mac with a touchscreen does not exist, so touch points on
    // something claiming to be a Mac mean an iPad.
    if ((/Mac/i.test(platform) || /Macintosh/i.test(ua)) && (nav.maxTouchPoints || 0) > 1) {
      return true;
    }

    // Last: the mobile flag. It is a weaker signal than the platform — Chrome's
    // "Desktop site" switch clears it on a phone whose hardware has not changed
    // — so it only ever adds a yes, never a no.
    if (uaData && uaData.mobile === true) return true;

    return false;
  }

  function isTouchOnly() {
    if (isMobileOS()) return true;

    // A desktop-class OS. Almost always playable, with one real exception: a
    // Windows or ChromeOS tablet with nothing attached to it. Both queries are
    // required, and they are asking different things — is the pointer the user
    // is EXPECTED to use a coarse one, and is there no fine pointer anywhere on
    // the device at all. A Surface with its keyboard on answers yes then yes,
    // and so stays interactive.
    var touchPoints = (global.navigator && global.navigator.maxTouchPoints) || 0;
    if (touchPoints === 0) return false;
    if (!global.matchMedia) return false;

    return (
      global.matchMedia('(pointer: coarse)').matches &&
      !global.matchMedia('(any-pointer: fine)').matches
    );
  }

  // ?mode=demo and ?mode=interactive override the detection.
  //
  // Any inference from browser capabilities will be wrong for somebody — a
  // phone with a Bluetooth mouse and keyboard can genuinely play, and some
  // device will misreport itself in a way nobody here has seen. This is the
  // escape hatch for both, and it is what makes a bug report answerable
  // without a debug build.
  function forcedMode() {
    var search = (global.location && global.location.search) || '';
    var match = /[?&]mode=(demo|interactive)/.exec(search);
    return match ? match[1] : null;
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
    var forced = forcedMode();
    var detected = isTouchOnly();
    var nav = global.navigator || {};
    var uaData = nav.userAgentData;

    return {
      modules: supportsModules(),
      importMaps: supportsImportMaps(),
      pointerLock: supportsPointerLock(),
      touchOnly: forced === null ? detected : forced === 'demo',
      detectedTouchOnly: detected,
      forcedMode: forced,
      mobileOS: isMobileOS(),
      // Recorded purely so that a report of "wrong mode on my device" can be
      // answered from the console line below instead of from a second device.
      platform: (uaData && uaData.platform) || '',
      webgl2: probeWebGL2(),
    };
  }

  // ---- the decision -------------------------------------------------------
  //
  // Pure: an environment object in, either null (go ahead) or a report out.
  // `code` is for tests and the console; `title` and `lines` are what the user
  // reads.
  //
  // Touch devices are NOT rejected. They used to be, when walking the surface
  // was the only thing on offer; they now get the guided demo instead (see
  // DEMO in config.js), which needs exactly the same browser features as the
  // interactive version and none of the input. So `touchOnly` is no longer a
  // verdict here — it is reported in env() and app.js reads it to decide which
  // of the two experiences to start.
  //
  // What remains a rejection is having NEITHER usable input: no touch and no
  // Pointer Lock means nothing here can be driven or watched.

  function evaluate(env) {
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

    if (!env.touchOnly && !env.pointerLock) {
      return {
        code: 'no-input',
        title: 'This browser cannot be driven',
        lines: [
          'Transurfia needs either Pointer Lock, to walk the surface with a ' +
            'mouse and keyboard, or a touch screen, to watch the guided demo. ' +
            'This browser reports neither.',
          'A current version of Chrome, Edge, Firefox or Safari will work.',
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
  var lastEnv = null;

  // Run once, now. The script tag sits after #blocker in the document so the
  // element is already there to write into.
  function run() {
    var env = detect();
    lastEnv = env;

    // Logged on every load, at one line. This bug — an Android phone served
    // the desktop version — cost a round trip to a real device to identify,
    // because nothing anywhere said what the browser had actually reported.
    console.info(
      '[transurfia] ' +
        (env.touchOnly ? 'guided demo' : 'interactive') +
        (env.forcedMode ? ' (forced by ?mode=' + env.forcedMode + ')' : '') +
        ' | touch=' + env.detectedTouchOnly +
        ' mobileOS=' + env.mobileOS +
        ' platform=' + (env.platform || '?') +
        ' webgl2=' + env.webgl2 +
        ' | override with ?mode=demo or ?mode=interactive'
    );

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

    // What the checks found. app.js reads `touchOnly` from here to choose
    // between the interactive experience and the guided demo, rather than
    // asking the same media queries a second time in a second file and risking
    // the two disagreeing about what a phone is.
    env: function () {
      return lastEnv;
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
