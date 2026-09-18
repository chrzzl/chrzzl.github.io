// Offline self-check for the startup preflight.
//
//   node tools/preflight.selfcheck.mjs
//
// preflight.js keeps its platform sniffing (detect) apart from its decision
// (evaluate) precisely so the decision can be checked here: evaluate() is a
// pure function from an environment description to either null or a report, so
// every combination of browser capabilities can be enumerated without owning
// the browsers.
//
// What this canNOT check is detect() — whether `any-pointer: fine` really is
// absent on an iPad, whether a particular locked-down Chrome really does refuse
// a webgl2 context. Those are claims about browsers and only browsers can
// settle them. It also cannot check that the error screen looks right, only
// that the right one is chosen.
//
// The script is loaded in a sandbox with a fake window, which doubles as a test
// that it parses and runs as a classic ES5 script — if someone later
// modernises an arrow function into it, this fails loudly rather than silently
// on the old browsers it exists to serve.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- a browser, roughly -----------------------------------------------------

// A browser, modelled closely enough to matter.
//
// `media` is an explicit map of media query -> matches, because the thing that
// broke on real hardware was precisely the difference between `pointer: coarse`
// and `any-pointer: fine`. The first version of this file answered every query
// containing "coarse" the same way, which is exactly why it passed while a real
// Android phone failed. An unknown query now throws rather than guessing.
function fakeBrowser({
  touchPoints = 0,
  media = {},
  webgl2 = true,
  modules = true,
  userAgent = '',
  uaDataMobile = undefined,
  search = '',
} = {}) {
  const blocker = {
    innerHTML: '',
    className: '',
    classList: { remove() {}, add() {} },
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
  };

  const element = (tag) => {
    const node = {
      className: '',
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
      // Enough of a canvas to answer the WebGL2 probe.
      getContext: (name) => (name === 'webgl2' && webgl2 ? { getExtension: () => null } : null),
    };
    // How preflight.js tests for ES module support: a script element in a
    // browser that understands type="module" has a `noModule` property, and one
    // in a browser that does not, does not. The property has to be genuinely
    // absent to simulate the old browser, not merely false.
    if (tag === 'script' && modules) node.noModule = false;
    return node;
  };

  const document = {
    getElementById: (id) => (id === 'blocker' ? blocker : null),
    createElement: element,
    createTextNode: (text) => ({ text }),
  };

  const navigator = { maxTouchPoints: touchPoints, userAgent };
  if (uaDataMobile !== undefined) navigator.userAgentData = { mobile: uaDataMobile };

  const window = {
    document,
    navigator,
    location: { search },
    matchMedia: (query) => {
      const key = query.replace(/[()]/g, '').trim();
      if (!(key in media)) {
        throw new Error('the fake browser was not told about "' + query + '"');
      }
      return { matches: media[key] };
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    WebGL2RenderingContext: webgl2 ? function WebGL2RenderingContext() {} : undefined,
  };

  return { window, document, blocker };
}

// ---- the devices that matter ----------------------------------------------

// A plain desktop: mouse, no touch hardware at all.
const DESKTOP = {
  touchPoints: 0,
  media: { 'pointer: coarse': false, 'pointer: fine': true, 'any-pointer: fine': true },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130',
  uaDataMobile: false,
};

// Android Chrome. THE case this file previously got wrong: `any-pointer: fine`
// MATCHES, because the device can take a stylus and the query asks what the
// hardware is capable of. The old `coarse && !anyFine` test therefore returned
// false and the phone was handed the interactive version.
const ANDROID = {
  touchPoints: 5,
  media: { 'pointer: coarse': true, 'pointer: fine': false, 'any-pointer: fine': true },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile',
  uaDataMobile: true,
};

// The same phone with Chrome's "Desktop site" requested: userAgentData.mobile
// flips to false and the UA string becomes a desktop one. The hardware has not
// changed and it still cannot be played, so it must still get the demo.
const ANDROID_DESKTOP_SITE = {
  touchPoints: 5,
  media: { 'pointer: coarse': true, 'pointer: fine': false, 'any-pointer: fine': true },
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130',
  uaDataMobile: false,
};

// iOS Safari: no userAgentData at all.
const IPHONE = {
  touchPoints: 5,
  media: { 'pointer: coarse': true, 'pointer: fine': false, 'any-pointer: fine': false },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Safari',
};

// iPadOS claims to be a Mac and has no userAgentData, so the pointer query is
// the only thing that catches it.
const IPAD = {
  touchPoints: 5,
  media: { 'pointer: coarse': true, 'pointer: fine': false, 'any-pointer: fine': false },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari',
};

// A Windows laptop with a touchscreen AND a trackpad. Must get the real thing:
// the PRIMARY pointer is the trackpad. This is the case `any-pointer` was
// brought in to handle, and `pointer` handles it correctly on its own.
const TOUCH_LAPTOP = {
  touchPoints: 10,
  media: { 'pointer: coarse': false, 'pointer: fine': true, 'any-pointer: fine': true },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130',
  uaDataMobile: false,
};

function load(browser) {
  const source = readFileSync(new URL('../src/preflight.js', import.meta.url), 'utf8');
  const sandbox = {
    window: browser.window,
    document: browser.document,
    console: { error() {}, log() {}, info() {}, warn() {} },
    Element: { prototype: { requestPointerLock() {} } },
    HTMLScriptElement: undefined,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'preflight.js' });
  return browser.window.Transurfia;
}

console.log('\npreflight');

// --- it is still ES5 --------------------------------------------------------
{
  const source = readFileSync(new URL('../src/preflight.js', import.meta.url), 'utf8');
  const code = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  check('no arrow functions', !/=>/.test(code));
  check('no template literals', !/`/.test(code));
  check('no let/const', !/\b(let|const)\s+\w+\s*=/.test(code));
  check('parses and runs as a classic script', typeof load(fakeBrowser(DESKTOP)) === 'object');
}

// --- the decision table -----------------------------------------------------

const { evaluate } = load(fakeBrowser(DESKTOP))._internals;

const ok = {
  modules: true,
  importMaps: true,
  pointerLock: true,
  touchOnly: false,
  webgl2: true,
};

const verdict = (overrides) => {
  const report = evaluate({ ...ok, ...overrides });
  return report === null ? 'pass' : report.code;
};

{
  check('a modern desktop passes', verdict({}) === 'pass', verdict({}));

  // Import map support is unknowable on Chrome 89-105, which HAS import maps.
  // Treating that as a failure would turn working browsers away.
  check(
    'unknown import map support still passes',
    verdict({ importMaps: null }) === 'pass',
    verdict({ importMaps: null })
  );

  check('no modules is rejected', verdict({ modules: false }) === 'browser-too-old');
  check(
    'a browser without modules is detected as such',
    load(fakeBrowser({ ...DESKTOP, modules: false }))._internals.detect().modules === false
  );
  check('no import maps is rejected', verdict({ importMaps: false }) === 'browser-too-old');
  check('no WebGL2 is rejected', verdict({ webgl2: false }) === 'no-webgl2');

  // Touch devices are ADMITTED now — they get the guided demo. This is the
  // check that would have failed before that change, and the one that must not
  // regress: a phone reaching the error screen means the demo is unreachable.
  check(
    'a touch-only device is admitted',
    verdict({ touchOnly: true, pointerLock: false }) === 'pass',
    verdict({ touchOnly: true, pointerLock: false })
  );

  // Neither pointer lock nor touch: nothing here can be driven or watched.
  check(
    'a browser with no usable input is rejected',
    verdict({ pointerLock: false, touchOnly: false }) === 'no-input'
  );

  // A broken browser is told what is broken, not what device it is. WebGL2 is
  // needed by the demo exactly as much as by the game.
  check(
    'a phone without WebGL2 hears about WebGL2',
    verdict({ touchOnly: true, pointerLock: false, webgl2: false }) === 'no-webgl2'
  );

  // Every report has to be worth reading.
  for (const broken of [{ modules: false }, { webgl2: false }, { pointerLock: false }]) {
    const report = evaluate({ ...ok, ...broken });
    check(
      `${report.code} has a title and an explanation`,
      report.title.length > 0 && report.lines.length > 0 && report.lines.every((l) => l.length > 20)
    );
  }
}

// --- detection on simulated devices ----------------------------------------
{
  const touchOnly = (profile) => load(fakeBrowser(profile))._internals.detect().touchOnly;

  check('a desktop gets the interactive version', touchOnly(DESKTOP) === false);

  // The regression. This is the check that would have caught the bug that
  // shipped: an Android phone shown a desktop welcome screen that does nothing
  // at all when tapped.
  check('an Android phone gets the demo', touchOnly(ANDROID) === true);
  check(
    'an Android phone gets the demo even in Desktop-site mode',
    touchOnly(ANDROID_DESKTOP_SITE) === true
  );
  check('an iPhone gets the demo', touchOnly(IPHONE) === true);
  check('an iPad gets the demo despite claiming to be a Mac', touchOnly(IPAD) === true);

  // The other direction, which must not regress while fixing the above.
  check(
    'a touchscreen laptop still gets the interactive version',
    touchOnly(TOUCH_LAPTOP) === false
  );

  // any-pointer must no longer be consulted at all: it is true on both a phone
  // and a laptop, so it cannot separate them, and believing it was the bug.
  const source = readFileSync(new URL('../src/preflight.js', import.meta.url), 'utf8');
  check('any-pointer is no longer consulted', !/any-pointer/.test(source.replace(/\/\/.*$/gm, '')));

  // Every profile must still find WebGL2, which the demo needs as much as the
  // interactive version does.
  for (const [name, profile] of Object.entries({ DESKTOP, ANDROID, IPHONE, IPAD })) {
    check(name + ' finds WebGL2', load(fakeBrowser(profile))._internals.detect().webgl2 === true);
  }
}

// --- the ?mode= override ----------------------------------------------------
{
  const env = (profile, search) => load(fakeBrowser({ ...profile, search }))._internals.detect();

  check(
    'a phone can be forced into the interactive version',
    env(ANDROID, '?mode=interactive').touchOnly === false
  );
  check('a desktop can be forced into the demo', env(DESKTOP, '?mode=demo').touchOnly === true);
  check(
    'an override is recorded, so the console can say so',
    env(DESKTOP, '?mode=demo').forcedMode === 'demo' &&
      env(DESKTOP, '?mode=demo').detectedTouchOnly === false
  );
  check('an unknown mode is ignored', env(ANDROID, '?mode=banana').touchOnly === true);
  check('no query string is ignored', env(ANDROID, '').forcedMode === null);
  check(
    'the override survives other query parameters',
    env(DESKTOP, '?foo=1&mode=demo&bar=2').touchOnly === true
  );
}

// --- the screen -------------------------------------------------------------
{
  // A rejected browser must actually have the overlay rewritten, and the
  // application must be told not to start.
  const browser = fakeBrowser({ ...DESKTOP, webgl2: false });
  const api = load(browser);
  check('a failed preflight reports not-ok', api.ok() === false);
  check('a failed preflight writes the overlay', browser.blocker.children.length === 1);
  check('the overlay is marked as an error', browser.blocker.className === 'error');

  // A passing browser must be left alone, welcome screen intact.
  const good = fakeBrowser(DESKTOP);
  const goodApi = load(good);
  check('a passing preflight reports ok', goodApi.ok() === true);
  check('a passing preflight leaves the welcome screen', good.blocker.children.length === 0);

  // app.js chooses interactive-vs-demo from this, so it has to be published
  // and it has to be right. Two definitions of "is this a phone" in two files
  // would eventually disagree; this is the single one.
  check('a desktop publishes touchOnly false', goodApi.env().touchOnly === false);

  const phone = load(fakeBrowser(ANDROID));
  check('a phone passes the preflight', phone.ok() === true);
  check('a phone publishes touchOnly true', phone.env().touchOnly === true);

  // A late failure still reaches the screen.
  goodApi.fail('renderer-failed', new Error('no context'));
  check('a late failure writes the overlay', good.blocker.children.length === 1);
  check('a late failure stops the app', goodApi.ok() === false);

  // ...and the first report wins, because a dying renderer emits several.
  goodApi.fail('startup-failed', new Error('and another'));
  check('only the first report is shown', good.blocker.children.length === 1);

  // An unknown code must still produce a screen rather than a blank one.
  const odd = fakeBrowser(DESKTOP);
  const oddApi = load(odd);
  oddApi.fail('something-nobody-defined', new Error('?'));
  check('an unknown failure code still explains itself', odd.blocker.children.length === 1);
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
