// Proof that the guided demo did not change the desktop experience.
//
//   node tools/desktop-unchanged.selfcheck.mjs
//
// The demo was added on the promise that desktop behaviour is untouched, and
// that promise is worth exactly what the evidence for it is worth. "Every new
// line is behind an `if (demoMode)`" is an argument, not evidence: it says
// nothing about a shared expression quietly reading a different property, or a
// CSS rule landing on a shared element. Both of those happened during this
// work and both were caught by hand; these checks exist so the next one is not.
//
// What it checks:
//   - the platform decision, including that a missing preflight means desktop
//   - that the desktop and demo pixel-ratio ceilings are separate values, and
//     that the mobile one is not somewhere it would be spread into both
//   - that every visualViewport read in app.js is gated on demoMode, so the
//     interactive path still measures what it always measured
//   - that the pointer-lock wiring survives verbatim
//   - that the one CSS rule touching shared elements declares only touch-only
//     properties, and that #blocker, the error screen, stays selectable
//   - that player.js contains no trace of the demo
//
// What it does NOT check: anything needing a GPU, and the runtime wiring of
// createApp() itself. app.js imports three.js as a module namespace, which
// cannot be substituted from outside without a loader hook, so the renderer
// cannot be stubbed here and createApp() cannot be called. These checks are
// therefore configuration plus source inspection. Source inspection is a weak
// form of test — it cannot notice a new ungated property read under a name it
// does not look for — so it is a backstop for reading the diff, not a
// replacement for it.

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\ndesktop unchanged');

// --- the decision, and the config it selects ----------------------------
{
  const { isTouchDevice } = await import('../src/errors.js');
  const { DEMO, RENDER } = await import('../src/config.js');

  // --- the decision ---
  globalThis.window = { Transurfia: { env: () => ({ touchOnly: false }) } };
  check('a desktop is not a demo device', isTouchDevice() === false);

  globalThis.window = { Transurfia: { env: () => ({ touchOnly: true }) } };
  check('a phone is a demo device', isTouchDevice() === true);

  globalThis.window = {};
  check('no preflight means desktop', isTouchDevice() === false);

  // --- the ceiling each one gets ---
  check(
    'desktop keeps its own, higher ceiling',
    RENDER.maxPixelRatio >= 2,
    `is ${RENDER.maxPixelRatio}`
  );
  check(
    'the demo ceiling is separate and lower',
    RENDER.mobileMaxPixelRatio < RENDER.maxPixelRatio,
    `${RENDER.mobileMaxPixelRatio} vs ${RENDER.maxPixelRatio}`
  );

  // --- the adaptive block, which BOTH share, must be unchanged ---
  // app.js spreads RENDER.adaptive into the quality controller. If the mobile
  // ceiling had been added in there instead of on RENDER, it would have been
  // spread into every controller including the desktop's.
  check(
    'the mobile ceiling is not inside RENDER.adaptive',
    !('mobileMaxPixelRatio' in RENDER.adaptive) &&
      !('maxPixelRatio' in RENDER.adaptive),
    Object.keys(RENDER.adaptive).join(', ')
  );

  // --- the demo can be switched off entirely ---
  check('the demo has an off switch', typeof DEMO.enabled === 'boolean');

  // It is currently OFF. The demo was not good enough to show, so Transurfia
  // is interactive everywhere and a device that cannot be driven is told so.
  // If this ever flips back to true, the checks below about turning touch
  // devices away stop being the right ones.
  check('the demo is currently disabled', DEMO.enabled === false);
}

// --- nobody is turned away for being the wrong device ------------------------
{
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const app = read('../src/app.js');
  const preflight = read('../src/preflight.js');

  // The history here is three devices that could play and were refused: every
  // Android phone, a Surface Pro with its keyboard on, and then the same
  // Surface again by the check that was supposed to have fixed it. Each time
  // the detection was tightened and each time it was wrong somewhere else, so
  // the gate is gone rather than tuned once more.
  check(
    'app.js does not turn any device away',
    !/isTouchDevice\(\)\)\s*\{[\s\S]{0,200}reportFailure/.test(app),
    'a device-shaped rejection has come back'
  );
  check('there is no touch-device error screen left', !/'touch-device':/.test(preflight));
  check('there is no no-input error screen left', !/'no-input'/.test(preflight));

  // What may still reject: facts about the browser, where a wrong answer means
  // a blank screen whatever we do.
  check('WebGL2 can still reject', /'no-webgl2'/.test(preflight));
  check('an ancient browser can still reject', /'browser-too-old'/.test(preflight));

  // Only the renderer failing may stop the app now.
  const failures = [...app.matchAll(/reportFailure\('([a-z-]+)'/g)].map((m) => m[1]);
  check(
    'app.js only reports renderer failures',
    failures.every((f) => f === 'renderer-failed' || f === 'context-lost'),
    failures.join(', ')
  );
}

// --- the source-level guarantees -------------------------------------------
//
// Some of the promise is about what the code does NOT contain, which is checked
// most directly by reading it.
{
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  const app = read('../src/app.js');
  const css = read('../style.css');
  const player = read('../src/player.js');

  // Every use of visualViewport in app.js must be gated on demoMode, or the
  // desktop takes a different measurement than it used to.
  const viewportLines = app
    .split('\n')
    .filter((l) => l.includes('visualViewport') && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  check(
    'every visualViewport read is gated on demoMode',
    viewportLines.length > 0 && viewportLines.every((l) => /demoMode|if \(demoMode\)/.test(l) || /^\s*if \(window\.visualViewport\)/.test(l)),
    viewportLines.map((l) => l.trim()).join(' | ')
  );

  // The desktop sizing expression must still be the original one.
  check(
    'desktop still measures window.innerWidth/innerHeight',
    app.includes('viewport ? Math.round(viewport.width) : window.innerWidth') &&
      app.includes('viewport ? Math.round(viewport.height) : window.innerHeight')
  );

  // The original pointer-lock wiring must survive verbatim on the desktop
  // branch — this is the one the whole interactive experience hangs off.
  check(
    'pointer lock is still requested from the blocker',
    app.includes("blocker.addEventListener('click', () => player.requestLock())")
  );
  check(
    'the pointer lock change handler is unchanged',
    app.includes(
      "blocker.classList.toggle('hidden', document.pointerLockElement === renderer.domElement)"
    )
  );

  // user-select must not reach the whole document, or the preflight's error
  // screen becomes uncopyable — and someone reading an error is the person most
  // likely to want to copy it.
  //
  // Parsed into rules with comments stripped first. A substring search over raw
  // CSS reported a false failure here: the word "#blocker" appears in a comment
  // explaining that #blocker is deliberately left selectable, and the match ran
  // out of that comment and into the next rule.
  const rules = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => {
      const i = chunk.indexOf('{');
      if (i < 0) return null;
      return {
        selectors: chunk.slice(0, i).split(',').map((sel) => sel.trim()).filter(Boolean),
        body: chunk.slice(i + 1),
      };
    })
    .filter(Boolean);

  const suppresses = (rule) => /user-select:\s*none/.test(rule.body);
  const has = (rule, sel) => rule.selectors.includes(sel);
  const where = () => rules.filter(suppresses).map((r) => r.selectors.join(',')).join(' | ');

  check(
    'user-select is not applied document-wide',
    !rules.some((r) => suppresses(r) && (has(r, 'html') || has(r, 'body'))),
    where()
  );

  check(
    'the error screen stays selectable',
    !rules.some((r) => suppresses(r) && r.selectors.some((sel) => sel.startsWith('#blocker'))),
    where()
  );

  // ...and it IS applied where a selection would be a misfire.
  check('the canvas is not selectable', rules.some((r) => suppresses(r) && has(r, 'canvas')));

  // The one rule that lands on shared elements must declare nothing a mouse or
  // a keyboard can feel. This is the check that would have caught the
  // document-wide user-select before it shipped.
  const shared = rules.find((r) => has(r, 'html') && has(r, 'body') && has(r, '#app'));
  const TOUCH_ONLY = ['touch-action', 'overscroll-behavior', '-webkit-tap-highlight-color'];
  const declared = (shared ? shared.body : '')
    .split(';')
    .map((d) => d.split(':')[0].trim())
    .filter(Boolean);
  check(
    'the shared rule declares only touch-only properties',
    declared.length > 0 && declared.every((prop) => TOUCH_ONLY.includes(prop)),
    declared.join(', ')
  );

  // PlayerController must not know the demo exists.
  check('player.js never mentions the demo', !/DEMO|autoPlayer|autoplayer|demoMode/.test(player));
  check('player.js has no touch handling', !/touchstart|touchmove|touchend/.test(player));
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
