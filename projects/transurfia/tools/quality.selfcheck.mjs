// Offline self-check for the adaptive quality controller.
//
//   node tools/quality.selfcheck.mjs
//
// quality.js takes frame deltas in and hands pixel ratios back, and touches
// neither three.js nor the DOM. That is what makes this possible: a simulated
// GPU whose frame time is a function of the pixel ratio lets every behaviour
// the controller claims — degrade under load, hold still when happy, clamp at
// the floor, refuse to oscillate — be checked in a few milliseconds, against
// hours of simulated play, without a browser.
//
// The machine model is frameTime = k * ratio^2: cost linear in pixel count,
// pixel count quadratic in the ratio. That is very nearly true of this renderer
// (one fullscreen quad, one full traversal per pixel, no culling and no level
// of detail), which is the reason resolution is the dial the controller turns.

import { createQualityController } from '../src/quality.js';
import { RENDER } from '../src/config.js';

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function controller(overrides = {}) {
  return createQualityController({
    maxPixelRatio: RENDER.maxPixelRatio,
    deviceRatio: 2,
    ...RENDER.adaptive,
    ...overrides,
  });
}

// Runs `seconds` of simulated frames through the controller. `frameTimeFor`
// turns the current pixel ratio into the time that frame took.
function run(q, seconds, frameTimeFor) {
  const ratios = [];
  let changes = 0;
  let t = 0;
  let guard = 0;

  while (t < seconds && guard++ < 5_000_000) {
    const dt = frameTimeFor(q.current());
    t += dt;
    ratios.push(q.current());
    if (q.frame(dt) !== null) changes += 1;
  }

  return { changes, ratios, final: q.current(), stats: q.stats() };
}

const fixed = (fps) => () => 1 / fps;

// A machine that manages `fpsAtRatio1` at pixel ratio 1.0, scaling
// quadratically with resolution.
const quadratic = (fpsAtRatio1) => (ratio) => (ratio * ratio) / fpsAtRatio1;

console.log('\nadaptive quality');

// ---------------------------------------------------------------------------
{
  // A fast desktop must be left completely alone. Any downgrade here is the
  // controller making a working machine worse.
  const q = controller();
  const r = run(q, 300, fixed(144));
  check('fast machine is never touched', r.changes === 0, `${r.changes} changes`);
  check(
    'fast machine renders at the ceiling',
    r.final === Math.min(2, RENDER.maxPixelRatio),
    `ratio ${r.final}`
  );
}

// ---------------------------------------------------------------------------
{
  // Roughly a 4K laptop on integrated graphics: ~34 fps at full ratio, which is
  // comfortably playable once the resolution comes down.
  const q = controller();
  const r = run(q, 300, quadratic(75));
  check('slow machine degrades', r.final < RENDER.maxPixelRatio, `ratio ${r.final}`);
  check(
    'slow machine ends above the target frame rate',
    1 / quadratic(75)(r.final) >= RENDER.adaptive.targetFps,
    `${(1 / quadratic(75)(r.final)).toFixed(1)} fps at ratio ${r.final}`
  );
  check('slow machine settles', r.changes <= 4, `${r.changes} changes`);
}

// ---------------------------------------------------------------------------
{
  // Software rendering: hopeless at every resolution. The controller must give
  // up at the floor rather than chase the target down to nothing.
  const q = controller();
  const r = run(q, 600, quadratic(3));
  check(
    'hopeless machine clamps at the floor',
    r.final === RENDER.adaptive.minPixelRatio,
    `ratio ${r.final}`
  );
  check(
    'hopeless machine stops trying once floored',
    r.stats.index === r.stats.rungs - 1,
    `index ${r.stats.index} of ${r.stats.rungs}`
  );
}

// ---------------------------------------------------------------------------
{
  // Never below the floor and never above the ceiling, whatever happens.
  const q = controller();
  const r = run(q, 600, (ratio) => (Math.random() < 0.5 ? 1 / 200 : ratio * ratio));
  const top = Math.min(2, RENDER.maxPixelRatio);
  check(
    'ratio stays within [min, max] under random load',
    r.ratios.every((x) => x >= RENDER.adaptive.minPixelRatio - 1e-9 && x <= top + 1e-9),
    `saw ${Math.min(...r.ratios)}..${Math.max(...r.ratios)}`
  );
}

// ---------------------------------------------------------------------------
{
  // The startup burst — shader compile, texture decode — must not be mistaken
  // for a slow GPU. Four seconds of 8 fps, then 144 fps forever.
  const q = controller();
  let t = 0;
  let changes = 0;
  while (t < 60) {
    const dt = t < RENDER.adaptive.warmupSeconds ? 1 / 8 : 1 / 144;
    t += dt;
    if (q.frame(dt) !== null) changes += 1;
  }
  check('warm-up frames do not cause a downgrade', changes === 0, `${changes} changes`);
}

// ---------------------------------------------------------------------------
{
  // A tab asleep for two minutes arrives as one enormous delta. It says nothing
  // about rendering cost and must be discarded, not acted on.
  const q = controller();
  const before = q.current();
  for (let i = 0; i < 2000; i++) q.frame(1 / 144);
  q.frame(120);
  for (let i = 0; i < 200; i++) q.frame(1 / 144);
  check('a huge stall is rejected as an outlier', q.current() === before);
}

// ---------------------------------------------------------------------------
{
  // The oscillation case, and the one this design exists for: a machine sitting
  // exactly on the boundary, fast enough to tempt an upgrade and too slow to
  // keep it. Without the guard it would breathe between two resolutions for as
  // long as the page is open. It is allowed to try once; it must then stop.
  const q = controller();
  const top = Math.min(2, RENDER.maxPixelRatio);
  const boundary = (ratio) => (ratio >= top - 1e-9 ? 1 / 40 : 1 / 90);
  const r = run(q, 3600, boundary);
  check('boundary machine stops oscillating', r.changes <= 3, `${r.changes} changes in an hour`);
  check('boundary machine lands on the sustainable rung', r.final < top, `ratio ${r.final}`);
}

// ---------------------------------------------------------------------------
{
  // Load that genuinely goes away — another application closed, a laptop off
  // battery saver — should eventually be rewarded.
  const q = controller();
  run(q, 120, quadratic(20));
  const degraded = q.current();
  const r = run(q, 600, fixed(240));
  check('quality recovers when the machine speeds up', q.current() > degraded,
    `${degraded} -> ${q.current()}`);
  check('recovery is not instant', r.changes >= 1);
}

// ---------------------------------------------------------------------------
{
  // Dragging the window from a HiDPI screen to a 1x one. The ladder is rebuilt
  // around the device ratio, and nothing may end up above it.
  const q = controller();
  run(q, 60, fixed(144));
  q.setDeviceRatio(1);
  check('device ratio caps the ladder', q.current() <= 1 + 1e-9, `ratio ${q.current()}`);
  const r = run(q, 300, fixed(144));
  check('still stable after the display changes', r.changes === 0, `${r.changes} changes`);
}

// ---------------------------------------------------------------------------
{
  // A deliberately constrained configuration, as the brief asks for: pinned low
  // and given no room to move.
  const q = controller({ maxPixelRatio: 0.5, minPixelRatio: 0.5, deviceRatio: 2 });
  const r = run(q, 300, quadratic(5));
  check('a pinned-low configuration holds', r.final === 0.5 && r.changes === 0,
    `ratio ${r.final}, ${r.changes} changes`);
}

// ---------------------------------------------------------------------------
{
  // The off switch has to mean off. app.js builds no controller at all when
  // enabled is false, so this only asserts the config still says so.
  check('adaptive quality can be disabled from config',
    typeof RENDER.adaptive.enabled === 'boolean');
  check('ceiling is the documented 1.5', RENDER.maxPixelRatio === 1.5);
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
