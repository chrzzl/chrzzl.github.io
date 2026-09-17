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

function fakeBrowser({
  touchPoints = 0,
  fine = true,
  coarse = false,
  webgl2 = true,
  modules = true,
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

  const window = {
    document,
    navigator: { maxTouchPoints: touchPoints },
    matchMedia: (query) => ({ matches: query.includes('coarse') ? coarse : fine }),
    setTimeout: () => 1,
    clearTimeout: () => {},
    WebGL2RenderingContext: webgl2 ? function WebGL2RenderingContext() {} : undefined,
  };

  return { window, document, blocker };
}

function load(browser) {
  const source = readFileSync(new URL('../src/preflight.js', import.meta.url), 'utf8');
  const sandbox = {
    window: browser.window,
    document: browser.document,
    console: { error() {}, log() {} },
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
  check('parses and runs as a classic script', typeof load(fakeBrowser()) === 'object');
}

// --- the decision table -----------------------------------------------------

const { evaluate } = load(fakeBrowser())._internals;

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
    load(fakeBrowser({ modules: false }))._internals.detect().modules === false
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
  // A desktop: no touch points at all.
  const desktop = load(fakeBrowser({ touchPoints: 0, fine: true }))._internals.detect();
  check('desktop is not seen as touch-only', desktop.touchOnly === false);
  check('desktop finds WebGL2', desktop.webgl2 === true);

  // A tablet: touch points, coarse pointer, no fine pointer anywhere.
  const tablet = load(
    fakeBrowser({ touchPoints: 5, coarse: true, fine: false })
  )._internals.detect();
  check('tablet is seen as touch-only', tablet.touchOnly === true);

  // A touchscreen laptop: touch points AND a trackpad. Must be allowed through
  // — this is the false positive the check is deliberately biased against.
  const hybrid = load(
    fakeBrowser({ touchPoints: 10, coarse: true, fine: true })
  )._internals.detect();
  check('touchscreen laptop is NOT seen as touch-only', hybrid.touchOnly === false);

  // Hardware acceleration off.
  const noGpu = load(fakeBrowser({ webgl2: false }))._internals.detect();
  check('missing WebGL2 is detected', noGpu.webgl2 === false);
}

// --- the screen -------------------------------------------------------------
{
  // A rejected browser must actually have the overlay rewritten, and the
  // application must be told not to start.
  const browser = fakeBrowser({ webgl2: false });
  const api = load(browser);
  check('a failed preflight reports not-ok', api.ok() === false);
  check('a failed preflight writes the overlay', browser.blocker.children.length === 1);
  check('the overlay is marked as an error', browser.blocker.className === 'error');

  // A passing browser must be left alone, welcome screen intact.
  const good = fakeBrowser();
  const goodApi = load(good);
  check('a passing preflight reports ok', goodApi.ok() === true);
  check('a passing preflight leaves the welcome screen', good.blocker.children.length === 0);

  // app.js chooses interactive-vs-demo from this, so it has to be published
  // and it has to be right. Two definitions of "is this a phone" in two files
  // would eventually disagree; this is the single one.
  check('a desktop publishes touchOnly false', goodApi.env().touchOnly === false);

  const phone = load(fakeBrowser({ touchPoints: 5, coarse: true, fine: false }));
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
  const odd = fakeBrowser();
  const oddApi = load(odd);
  oddApi.fail('something-nobody-defined', new Error('?'));
  check('an unknown failure code still explains itself', odd.blocker.children.length === 1);
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
