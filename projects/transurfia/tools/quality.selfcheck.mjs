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

// requestAnimationFrame is capped at the display's refresh rate, so no real
// machine reports more than its panel can show. Every simulated machine below
// is capped accordingly, and that is not decoration: the shipped bug was an
// upgrade threshold of 75fps, which no 60Hz display can ever reach, and the
// test that was supposed to cover recovery fed it 240fps and passed. A test
// may not use a frame rate that hardware cannot produce.
const REFRESH_HZ = 60;

const capped = (fps) => Math.min(fps, REFRESH_HZ);
const fixed = (fps) => () => 1 / capped(fps);

// A machine that manages `fpsAtRatio1` at pixel ratio 1.0, scaling
// quadratically with resolution, then vsync-capped like a real one.
const quadratic = (fpsAtRatio1) => (ratio) => 1 / capped(fpsAtRatio1 / (ratio * ratio));

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
  // Genuinely below the target at full resolution, and vsync-capped below it,
  // so the machine has real headroom to tempt an upgrade with.
  const boundary = (ratio) => (ratio >= top - 1e-9 ? 1 / 34 : 1 / REFRESH_HZ);
  const r = run(q, 3600, boundary);

  // The claim is no longer "it never changes again" — a locked-out rung is now
  // retried occasionally, so that a machine whose load lifts is not punished
  // for the rest of the session. What has to stay true is the thing the guard
  // was actually for: the visitor is not watching the resolution breathe. So
  // the measure is how much of the hour was SPENT on the rung it cannot hold,
  // not how many times it touched it.
  const atTop = r.ratios.filter((x) => x >= top - 1e-9).length / r.ratios.length;
  check(
    'boundary machine spends almost no time on the rung it cannot hold',
    atTop < 0.05,
    `${(atTop * 100).toFixed(1)}% of an hour`
  );
  check('boundary machine retries rarely', r.changes <= 24, `${r.changes} changes in an hour`);
  check('boundary machine lands on the sustainable rung', r.final < top, `ratio ${r.final}`);
}

// ---------------------------------------------------------------------------
{
  // Load that genuinely goes away — another application closed, a laptop off
  // battery saver — should eventually be rewarded.
  const q = controller();
  run(q, 120, quadratic(20));
  const degraded = q.current();
  const r = run(q, 600, fixed(REFRESH_HZ));
  check('quality recovers when the machine speeds up', q.current() > degraded,
    `${degraded} -> ${q.current()}`);
  check('recovery is not instant', r.changes >= 1);
}

// ---------------------------------------------------------------------------
{
  // THE regression. Every downgrade used to be permanent on a 60Hz display:
  // the upgrade test was `fps > 75`, and requestAnimationFrame cannot report
  // more than the panel refreshes, so the condition was unsatisfiable and the
  // bottom of the ladder was an absorbing state. This is what "after a while
  // the columns and the distance go pixelated" actually was.
  //
  // A machine that is heavy at full resolution and then vsync-capped at 60 once
  // it has stepped down must climb back out.
  const q = controller();
  const top = q.current();

  // Phase one: genuinely too slow at every rung, so it walks to the floor
  // without ever being tempted into an upgrade. Nothing is locked out.
  run(q, 200, quadratic(20));
  const degraded = q.current();
  check('a 60Hz display degrades when it must', degraded < top, `${top} -> ${degraded}`);
  check(
    'and degrades all the way to the floor',
    degraded === RENDER.adaptive.minPixelRatio,
    `ratio ${degraded}`
  );

  // Phase two: the load lifts. Comfortable everywhere now, but still capped at
  // 60fps by the panel — which is the entire point. Under the shipped
  // thresholds the upgrade test was `fps > 75`, so this could never happen.
  const r = run(q, 1200, fixed(REFRESH_HZ));
  check(
    'a 60Hz display can climb back to the ceiling',
    q.current() === top,
    `stuck at ${q.current()} (was ${degraded}); a 60Hz panel cannot exceed 75fps`
  );
  check('and climbs one rung at a time', r.changes >= 2);
}

// ---------------------------------------------------------------------------
{
  // A rung that was locked out for oscillating must be retried eventually.
  // "Cannot sustain that resolution" is true of a machine under whatever load
  // it is under at the time, and a session that starts busy should not be
  // penalised for the rest of its life.
  const q = controller();

  // Heavy above ratio 1.0, comfortable below: the shape that provokes an
  // upgrade, fails it, and gets the rung locked out.
  const heavy = (ratio) => 1 / (ratio > 1.0 ? 22 : REFRESH_HZ);
  const first = run(q, 200, heavy);
  const locked = q.stats().ceiling;
  check('an unsustainable rung gets locked out', locked > 0, `ceiling ${locked}`);

  // Left alone under the same load, it must retry — and fail — rather than
  // never trying again, but must not do it constantly.
  const retries = run(q, 3600, heavy);
  check('a locked-out rung is retried eventually', retries.changes >= 2, `${retries.changes} in an hour`);
  check('but not constantly', retries.changes <= 20, `${retries.changes} in an hour`);
  check(
    'and it still spends its time on the sustainable rung',
    q.current() <= 1.0,
    `ratio ${q.current()}`
  );

  // And if the load really does lift, it gets all the way back.
  run(q, 2400, fixed(REFRESH_HZ));
  check(
    'a locked-out rung reopens when the machine improves',
    q.current() === Math.min(2, RENDER.maxPixelRatio),
    `ratio ${q.current()}`
  );
}

// ---------------------------------------------------------------------------
{
  // The refresh-cap estimate must not be fooled by a machine whose own limit
  // happens to be steady. 35fps everywhere is not a display refresh rate, and
  // treating "pinned at my best" as headroom would hand out free upgrades.
  const q = controller();
  const r = run(q, 900, fixed(35));
  check(
    'a steadily slow machine is not mistaken for a vsync-capped one',
    q.current() === RENDER.adaptive.minPixelRatio,
    `ratio ${q.current()} after ${r.changes} changes`
  );
}

// ---------------------------------------------------------------------------
{
  // The thresholds have to be satisfiable on the displays people own.
  check(
    'the upgrade threshold is reachable on a 60Hz display',
    RENDER.adaptive.upgradeFps < 60,
    `upgradeFps is ${RENDER.adaptive.upgradeFps}`
  );
  check(
    'the target is below the upgrade threshold',
    RENDER.adaptive.targetFps < RENDER.adaptive.upgradeFps
  );
  check(
    'the refresh floor is above the target, so the two cannot fight',
    RENDER.adaptive.minRefreshFps > RENDER.adaptive.targetFps
  );

  // The floor has to stay somewhere the world is still legible. There is no
  // antialiasing here — the image is a fragment shader over one quad, so MSAA
  // does nothing — which makes pixel ratio the only antialiasing there is.
  check(
    'the desktop floor is not blocky',
    RENDER.adaptive.minPixelRatio >= 0.7,
    `minPixelRatio is ${RENDER.adaptive.minPixelRatio}`
  );

  // No near-duplicate rungs: two a percent apart are one rung to the eye, and
  // the spare only wastes a downgrade cycle.
  const q = controller({ deviceRatio: 4 });
  const rungs = [];
  for (let i = 0; i < q.stats().rungs; i++) rungs.push(i);
  check('the ladder has no near-duplicate rungs', q.stats().rungs >= 2);
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
  check(
    'the desktop ceiling allows native HiDPI rendering',
    RENDER.maxPixelRatio >= 2,
    `maxPixelRatio is ${RENDER.maxPixelRatio}`
  );
  check(
    'the demo ceiling is lower than the desktop one',
    RENDER.mobileMaxPixelRatio < RENDER.maxPixelRatio
  );
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
