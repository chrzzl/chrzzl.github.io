// Reproduce a reported controller state and print every variable behind it.
//
//   node tools/quality.diagnose.mjs
//
// Not a test — nothing here asserts. It exists because "it sat at 1.0 for ever
// despite 75fps" is a claim about a state machine with eleven pieces of state,
// and the only honest way to answer it is to run the machine and read them.
//
// The machine modelled is the one measured in Firefox:
//
//   rung 2.0   -> ~45 fps
//   rung 1.5   -> ~58 fps
//   rung 1.333 -> ~65 fps
//   rung 1.0   -> ~75 fps
//
// Note what that says before any simulation runs: 45fps at the TOP rung is
// already above targetFps (40), so a steady 45 can never produce a downgrade
// at all. Whatever drove the descent was not the steady-state frame rate, so
// the second scenario below adds the thing that is missing from the first —
// frame cost that varies with where the player is looking.

import { createQualityController } from '../src/quality.js';
import { RENDER } from '../src/config.js';

const MEASURED = { 2: 45, 1.5: 58, [4 / 3]: 65, 1: 75 };

function fpsAt(ratio) {
  // Nearest measured rung.
  let best = null;
  let bestD = Infinity;
  for (const key of Object.keys(MEASURED)) {
    const d = Math.abs(Number(key) - ratio);
    if (d < bestD) {
      bestD = d;
      best = MEASURED[key];
    }
  }
  return best;
}

function make() {
  return createQualityController({
    ...RENDER.adaptive,
    qualityFractions: RENDER.qualityFractions,
    maxPixelRatio: RENDER.maxPixelRatio,
    deviceRatio: 2,
  });
}

function header(title) {
  console.log('\n' + title);
  console.log('-'.repeat(title.length));
}

function line(t, q, note = '') {
  const s = q.stats();
  console.log(
    `  t=${t.toFixed(0).padStart(5)}s  rung ${s.pixelRatio.toFixed(3)}` +
      `  p${Math.round(RENDER.adaptive.decisionPercentile * 100)} ${s.decisionFps.toFixed(1).padStart(5)}` +
      `  med ${s.medianFps.toFixed(1).padStart(5)}` +
      `  ema ${s.fps.toFixed(1).padStart(5)}` +
      `  below ${s.belowFor.toFixed(1)}  above ${s.aboveFor.toFixed(1)}` +
      `  win ${s.windowSeconds.toFixed(1)}s` +
      `  bound ${s.resolutionBound ? 'Y' : 'N'}` +
      (note ? `   ${note}` : '')
  );
}

// ---------------------------------------------------------------------------
header('The thresholds in play');
{
  const a = RENDER.adaptive;
  console.log(`  targetFps  ${a.targetFps}   (below this for ${a.downgradeAfterSeconds}s -> downgrade)`);
  console.log(`  upgradeFps ${a.upgradeFps}   (above this for ${a.upgradeAfterSeconds}s -> upgrade)`);
  console.log(`  dead band  ${a.targetFps}..${a.upgradeFps}  (nothing happens)`);
  console.log(`  window     ${a.decisionWindowSeconds}s, decisions from the p${Math.round(a.decisionPercentile*100)} frame rate`);
  console.log();
  for (const [ratio, fps] of Object.entries(MEASURED)) {
    const a2 = RENDER.adaptive;
    const verdict =
      fps < a2.targetFps ? 'DOWNGRADE' : fps > a2.upgradeFps ? 'upgrade' : 'dead band, hold';
    console.log(`  rung ${Number(ratio).toFixed(3)} at ${fps}fps -> ${verdict}`);
  }
}

// ---------------------------------------------------------------------------
header('Scenario A: the measured frame rates, held steady');
{
  const q = make();
  let t = 0;
  let last = q.current();
  line(t, q, 'start');
  while (t < 600) {
    const dt = 1 / fpsAt(q.current());
    t += dt;
    const changed = q.frame(dt);
    if (changed !== null) {
      line(t, q, q.stats().lastChange.reason);
      last = changed;
    }
  }
  line(t, q, 'end');
  console.log(`  -> settles at ${last.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
header('Scenario B: the same rungs, but frame cost varies with the view');
{
  // The missing ingredient. This renderer's cost depends on where the camera
  // looks: a ray aimed along a corridor of repeats crosses many portals before
  // it finishes, one aimed at the floor two metres away finishes immediately.
  // So the frame rate swings around the measured average as the player turns.
  //
  // The measured numbers are averages. A view 35% cheaper or dearer than
  // average is entirely ordinary in this world.
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const q = make();
  let t = 0;
  let look = 0;
  let changes = 0;

  while (t < 900) {
    look += (rand() - 0.5) * 0.25;
    look = Math.max(-1, Math.min(1, look));
    const factor = 1 + look * 0.35;

    const dt = 1 / (fpsAt(q.current()) * factor);
    t += dt;
    if (q.frame(dt) !== null) {
      changes += 1;
      if (changes <= 12) line(t, q, q.stats().lastChange.reason);
    }
  }

  line(t, q, 'end');
  const s2 = q.stats();
  console.log(`  -> ${changes} changes in 15 minutes, ending at ${q.current().toFixed(3)}`);
  console.log(`  -> upgrade blocked by: ${s2.upgradeBlockedBy ?? 'nothing'}`);
}

// ---------------------------------------------------------------------------
header('Scenario C: how rung 1.0 becomes a trap');
{
  // Build the reported state deliberately rather than hoping to stumble into
  // it. The sequence that locks the ceiling onto the bottom rung is:
  //
  //   sit at 1.0, comfortable      -> aboveFor climbs, upgrade to 1.333
  //   the player turns to a dear view at 1.333, fps falls under 40
  //   downgrade back to 1.0 within oscillationGuardSeconds of that upgrade
  //   -> ceiling = 3, the bottom rung. Upgrading is now impossible.
  //
  // After that the only way out is the relaxation, which needs `relaxWait`
  // seconds of UNINTERRUPTED time above upgradeFps.
  const q = make();
  let t = 0;
  let phase = 'descend';
  let upgradedAt = null;

  // Costs per rung; the dear view is applied only while `dear` is true.
  const cheap = (r) => fpsAt(r);
  const dear = (r) => fpsAt(r) * 0.55;

  let dearUntil = -1;
  let sinceDear = 0;

  while (t < 2400) {
    let fps;
    if (phase === 'descend') {
      // Drive it to the bottom the way a bad stretch of play would: dear views
      // at every rung, and genuinely resolution-sensitive so the probe agrees.
      fps = dear(q.current());
      if (q.current() <= 1.0 + 1e-9) {
        phase = 'hold';
        line(t, q, 'reached the bottom rung');
      }
    } else {
      // Comfortable, with one dear view every 30 seconds — a player turning to
      // look down a corridor. Each is about a second long.
      sinceDear += 1 / 75;
      if (sinceDear > 30) {
        dearUntil = t + 1.2;
        sinceDear = 0;
      }
      fps = t < dearUntil ? dear(q.current()) : cheap(q.current());
    }

    const dt = 1 / fps;
    t += dt;
    const changed = q.frame(dt);
    if (changed !== null) {
      line(t, q, q.stats().lastChange.reason);
      if (phase === 'hold' && changed > 1.0 && upgradedAt === null) upgradedAt = t;
    }
  }

  const s3 = q.stats();
  console.log();
  console.log(`  after 40 minutes: rung ${s3.pixelRatio.toFixed(3)}`);
  console.log(`  decision fps ${s3.decisionFps.toFixed(1)} (p25), median ${s3.medianFps.toFixed(1)}`);
  console.log(`  upgrade blocked by: ${s3.upgradeBlockedBy ?? 'nothing'}`);
}

// ---------------------------------------------------------------------------
header('The structural asymmetry');
{
  // Why the controller drifts down and not up, stated as a measurement rather
  // than an opinion. Under the same varying load, how often does a streak long
  // enough to DOWNGRADE occur, versus one long enough to UPGRADE?
  //
  // A downgrade needs downgradeAfterSeconds below target. An upgrade needs
  // upgradeAfterSeconds above upgradeFps, and the ceiling relaxation needs
  // relaxWait of it. Bad views are short and common; long unbroken good
  // streaks are rare. The thresholds are not symmetric and neither is the
  // world they are measuring.
  const a = RENDER.adaptive;
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  let look = 0;
  let below = 0;
  let above = 0;
  let downgradeStreaks = 0;
  let upgradeStreaks = 0;

  let longestAbove = 0;

  const AVG = 65; // a comfortable rung
  for (let t = 0; t < 3600; t += 1 / 60) {
    look += (rand() - 0.5) * 0.25;
    look = Math.max(-1, Math.min(1, look));
    const fps = AVG * (1 + look * 0.35);

    if (fps < a.targetFps) {
      below += 1 / 60;
      above = 0;
      if (below >= a.downgradeAfterSeconds) {
        downgradeStreaks += 1;
        below = 0;
      }
    } else if (fps > a.upgradeFps) {
      above += 1 / 60;
      below = 0;
      longestAbove = Math.max(longestAbove, above);
      if (above >= a.upgradeAfterSeconds) upgradeStreaks += 1;
  
    } else {
      below = 0;
      above = 0;
    }
  }

  console.log(`  one hour at ~${AVG}fps average, +-35% with the view:`);
  console.log(`    streaks long enough to downgrade (${a.downgradeAfterSeconds}s under ${a.targetFps}): ${downgradeStreaks}`);
  console.log(`    longest unbroken streak above ${a.upgradeFps}fps: ${longestAbove.toFixed(1)}s`);
  console.log(`    ...needed to relax the ceiling: ${a.ceilingRelaxSeconds}s (and it doubles)`);
  console.log();
  console.log('  The dead band resets BOTH timers, so any view of middling cost');
  console.log('  erases the progress an upgrade had accumulated, while a downgrade');
  console.log('  only needs one bad stretch of 1.5s.');
}

console.log();
