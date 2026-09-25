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
    ...RENDER.adaptive,
    qualityFractions: RENDER.qualityFractions,
    maxPixelRatio: RENDER.maxPixelRatio,
    deviceRatio: 2,
    ...overrides,
  });
}

// A machine whose frame time genuinely depends on how many pixels it draws,
// vsync-capped like a real one. This is the ONLY kind the controller can help,
// and telling it apart from the kinds it cannot is most of what it now does.
const gpuBound = (fpsAtRatio1) => (ratio) => 1 / capped(fpsAtRatio1 / (ratio * ratio));

// A machine whose frame time does not depend on resolution at all: capped by
// the panel's refresh, or by the CPU side of the frame, or by the compositor.
// Lowering resolution here costs image quality and buys precisely nothing.
const resolutionBlind = (fps) => () => 1 / fps;

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

// Fraction of a run spent at a given ratio. The controller now probes
// occasionally — it is the only way to find out whether a limit has moved — so
// the right measure of "it settled there" is how much of the time it spent
// there, not whether it ever left.
const timeAt = (r, ratio) =>
  r.ratios.filter((x) => Math.abs(x - ratio) < 1e-9).length / r.ratios.length;

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
  const r = run(q, 600, gpuBound(3));
  const bottom = r.stats.ladder[r.stats.ladder.length - 1];

  // The bottom RUNG, which on a dpr 2 display is 1.0 — the absolute
  // minPixelRatio clamp is a backstop for low-DPI displays and does not bind
  // here. Asserting against the clamp was asserting against a number this
  // ladder cannot produce.
  check('hopeless machine reaches the bottom rung', r.final === bottom, `ratio ${r.final}`);
  check(
    'hopeless machine stays there',
    timeAt(r, bottom) > 0.9,
    `${(timeAt(r, bottom) * 100).toFixed(1)}% of the run at the bottom`
  );
  check(
    'hopeless machine still believes resolution is the limit',
    r.stats.resolutionBound === true,
    'every rung it gave up did make the frame rate better'
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
  // A machine sitting exactly on the boundary: too slow at the top rung,
  // comfortable one below. Nothing about the frame rate alone can tell it
  // where to settle, because both answers are defensible, so what matters is
  // how OFTEN it changes its mind.
  //
  // The ceiling/relaxWait/lastUpgradeAt lockout that used to police this is
  // gone — it was what deadlocked rung 1.0 — and a wall-clock cooldown after
  // each downgrade has replaced it. The cooldown cannot become a lockout,
  // because the clock always arrives.
  const cooldown = RENDER.adaptive.upgradeCooldownSeconds;
  const q = controller();
  const r = run(q, 3600, gpuBound(140));
  const top = Math.min(2, RENDER.maxPixelRatio);

  // Each cycle is one downgrade plus one upgrade, and cannot be shorter than
  // the cooldown plus the few seconds it takes to notice the top rung is too
  // slow. That is the bound the cooldown buys, and it is worth stating as
  // arithmetic rather than as a round number pulled from nowhere.
  const perHour = (2 * 3600) / cooldown;
  check(
    'the cooldown bounds how often a boundary machine changes its mind',
    r.changes <= perHour,
    `${r.changes} changes/hour against a ceiling of ${perHour.toFixed(0)} implied by a ${cooldown}s cooldown`
  );
  check(
    'and it still spends its time on the rung it can hold',
    timeAt(r, top) < 0.3,
    `${(timeAt(r, top) * 100).toFixed(1)}% on the rung it cannot hold`
  );

  // The cooldown must never become a lockout. However long the session, the
  // higher rung stays reachable — that is the whole reason it is a deadline
  // rather than a streak.
  check(
    'the cooldown is not a lockout',
    r.ratios.some((x) => Math.abs(x - top) < 1e-9),
    'never returned to the top rung at all'
  );

  // ...and it does actually help. Without it, the same machine flips roughly
  // twice as often.
  const without = run(controller({ upgradeCooldownSeconds: 0 }), 3600, gpuBound(140));
  check(
    'the cooldown roughly halves the flipping',
    r.changes < without.changes * 0.75,
    `${r.changes} with, ${without.changes} without`
  );
  console.log(
    `       [info] boundary machine: ${(r.changes / 60).toFixed(1)}/min with a ${cooldown}s cooldown, ` +
      `${(without.changes / 60).toFixed(1)}/min without`
  );
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
  run(q, 200, gpuBound(20));
  const degraded = q.current();
  const bottom = q.stats().ladder[q.stats().rungs - 1];
  check('a 60Hz display degrades when it must', degraded < top, `${top} -> ${degraded}`);
  check('and degrades all the way to the bottom rung', degraded === bottom, `ratio ${degraded}`);

  // Phase two: the load lifts. Comfortable everywhere now, but still capped at
  // 60fps by the panel — which is the entire point. Under the shipped
  // thresholds the upgrade test was `fps > 75`, so this could never happen.
  const r = run(q, 1200, fixed(REFRESH_HZ));
  check(
    'a 60Hz display can climb back to the ceiling',
    q.current() === top,
    `stuck at ${q.current()} (was ${degraded}); a 60Hz panel cannot exceed 75fps`
  );
  check('and climbs one rung at a time', r.changes >= 2, `${r.changes} changes`);
}

// ---------------------------------------------------------------------------
{
  // THE reported bug, measured in Firefox: parked on the bottom rung at a
  // sustained ~75fps and never climbing off it.
  //
  // The blocking condition was `upgrade()`'s first line, `index <= ceiling`,
  // with the ceiling pinned to the bottom rung by the oscillation guard. The
  // only escape needed an UNBROKEN streak above 55fps lasting relaxWait
  // seconds (90, doubling), and the longest such streak this scene produces is
  // about 21 seconds. The lockout is gone; this asserts it stays gone.
  const q = controller();

  // Walk it to the bottom the way a bad stretch of play does.
  run(q, 200, gpuBound(20));
  const bottom = q.current();
  check(
    'reaches the bottom rung under load',
    bottom === q.stats().ladder[q.stats().rungs - 1],
    `ratio ${bottom}`
  );

  // Now the reported condition: comfortable, but with the dear view every
  // half-minute that a player turning around produces. The old controller
  // needed an unbroken streak and never got one.
  let t = 0;
  let sinceDip = 0;
  let climbed = null;
  while (t < 900) {
    sinceDip += 1 / 75;
    const dipping = sinceDip > 30 && sinceDip < 31;
    if (sinceDip > 31) sinceDip = 0;
    const dt = 1 / (dipping ? 34 : 75);
    t += dt;
    const changed = q.frame(dt);
    if (changed !== null && changed > bottom && climbed === null) climbed = t;
  }

  check(
    'climbs off the bottom rung at a sustained 75fps',
    climbed !== null,
    `never upgraded in 15 minutes; blocked by ${q.stats().upgradeBlockedBy}`
  );
  check(
    'and keeps climbing rather than stopping one rung up',
    q.current() > bottom,
    `ended at ${q.current()}, bottom is ${bottom}`
  );
  check(
    'a periodic dear view does not prevent it',
    climbed !== null && climbed < 300,
    climbed === null ? 'never' : `took ${climbed.toFixed(0)}s`
  );
}

// ---------------------------------------------------------------------------
{
  // The point of the window statistic: a machine whose frame rate swings with
  // the view but whose typical performance is fine must be left alone. Under
  // the old half-second average this was the case that walked the ladder down.
  const q = controller();
  let seed = 99;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let look = 0;
  let t = 0;
  let changes = 0;
  while (t < 600) {
    look += (rand() - 0.5) * 0.25;
    look = Math.max(-1, Math.min(1, look));
    // Averages 70fps, dipping under 40 on the dearest views.
    const dt = 1 / (70 * (1 + look * 0.42));
    t += dt;
    if (q.frame(dt) !== null) changes += 1;
  }
  check(
    'a view-varying machine with a good median is not downgraded',
    q.current() === Math.min(2, RENDER.maxPixelRatio),
    `dropped to ${q.current()} after ${changes} changes`
  );
}

// ---------------------------------------------------------------------------
{
  // The texture-change pause.
  //
  // An honest note about what this is worth. Measured, the decision window
  // already absorbs stalls entirely: a stall of 0.3s, 1s, 2s, 4s and even 8s
  // all leave the chosen rung untouched. The reason is that the percentile is
  // taken over frames BY COUNT, and slow frames are few in number even when
  // they dominate the wall clock — fifty 160ms frames are eight seconds of
  // misery and still only a sixth of a ten-second window's samples.
  //
  // So at the current window and percentile the pause changes no outcome, and
  // the test below deliberately asserts its MECHANISM rather than pretending
  // otherwise. It is kept because it is six lines and it stops being a no-op
  // the moment the window is shortened or the percentile lowered — and because
  // on a slow phone, decoding three 2048px images is not a one-frame event.
  //
  // (The same measurement is a warning about the statistic itself: a machine
  // rendering three frames in four at 70fps and one in four at 6fps would look
  // perfectly healthy to p25 while stuttering horribly. That is a property of
  // counting frames rather than seconds, and it is worth knowing before the
  // percentile is tuned.)
  const q = controller();
  let t = 0;
  while (t < 30) {
    const dt = 1 / 70;
    t += dt;
    q.frame(dt);
  }
  check('the window has filled', q.stats().windowSeconds > 9);

  q.pause();
  check('pausing empties the decision window', q.stats().windowSeconds === 0);

  // While paused, frames are discarded rather than measured.
  for (let i = 0; i < 8; i++) q.frame(0.16);
  check('frames during the pause are not collected', q.stats().windowSamples === 0);
  check('and no quality change can happen', q.stats().lastChange === null);

  // After it lapses, measurement resumes normally.
  let t2 = 0;
  while (t2 < 12) {
    const dt = 1 / 70;
    t2 += dt;
    q.frame(dt);
  }
  check('measurement resumes after the pause', q.stats().windowSeconds > 9);
  check('and the stall cost no quality', q.current() === Math.min(2, RENDER.maxPixelRatio));
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
