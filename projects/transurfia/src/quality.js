// ============================================================================
// ADAPTIVE RENDER QUALITY
// ============================================================================
//
// Watches frame times and moves the render resolution up and down to hold a
// target frame rate.
//
// Why resolution and nothing else: the entire frame is one fullscreen quad, and
// every physical pixel pays for a complete ray traversal through the surface —
// up to WORLD.maxCrossings hops, each testing all eight edges. Cost is
// therefore almost exactly linear in pixel count and almost independent of
// where the player is standing or looking. Halving the pixel ratio is close to
// halving the frame time, which makes it both the strongest dial available and
// the most predictable one. There is no render target and no portal buffer to
// scale separately; the drawing buffer IS the render resolution.
//
// Nothing about the rendering ALGORITHM changes here. Same shader, same
// traversal, same crossing budget — only how many pixels run it.
//
// This module is deliberately free of three.js and of the DOM: it takes frame
// deltas in and hands pixel ratios back, which is what lets
// tools/quality.selfcheck.mjs drive years of synthetic frames through it in a
// few milliseconds.

// Builds the ladder of pixel ratios the controller is allowed to sit on, from
// `top` down to `min`, each step `step` times the one above.
//
// A discrete ladder rather than a continuous dial, because every distinct value
// the controller can choose is a value it might oscillate between, and a short
// ladder makes the whole state space small enough to reason about — and to
// enumerate in a test.
function buildLadder(top, min, step) {
  const ladder = [top];
  let r = top;
  while (r * step > min) {
    r *= step;
    ladder.push(r);
  }
  // The floor is always reachable exactly, however the steps happen to land.
  if (ladder[ladder.length - 1] > min) ladder.push(min);
  return ladder;
}

export function createQualityController(options) {
  const {
    // Ceiling from config, and the display's own ratio. The ladder starts at
    // whichever is lower: rendering above the device's ratio buys nothing
    // visible and costs the difference squared.
    maxPixelRatio,
    minPixelRatio,
    deviceRatio = 1,

    // Where to begin, before any frame has been measured. Null means "at the
    // top": a fast machine then never spends a second looking soft, and a slow
    // one is measured and corrected within downgradeAfterSeconds.
    startPixelRatio = null,

    step,
    targetFps,
    upgradeFps,
    downgradeAfterSeconds,
    upgradeAfterSeconds,
    settleSeconds,
    warmupSeconds,
    spikeSeconds,
    spikeToleranceFrames,
    maxMeasuredSeconds,
    smoothingSeconds,
    oscillationGuardSeconds,
  } = options;

  let deviceRatioNow = deviceRatio;
  let ladder = [];
  let index = 0;

  // The highest rung the controller may climb back to. Lowered for good when an
  // upgrade turns out to have been a mistake — see the guard in downgrade().
  let ceiling = 0;

  function rebuild(preferredRatio) {
    const top = Math.max(minPixelRatio, Math.min(deviceRatioNow, maxPixelRatio));
    ladder = buildLadder(top, minPixelRatio, step);
    ceiling = Math.min(ceiling, ladder.length - 1);

    // Keep the resolution the player is currently looking at, as closely as the
    // new ladder allows.
    let best = 0;
    for (let i = 1; i < ladder.length; i++) {
      if (Math.abs(ladder[i] - preferredRatio) < Math.abs(ladder[best] - preferredRatio)) best = i;
    }
    index = Math.max(best, ceiling);
  }

  // Rolling frame time, exponentially smoothed. An average over a window would
  // do as well, but this needs no buffer and its time constant is stated in
  // seconds rather than in frames, which is the unit everything else here is in.
  let avgFrameTime = 0;

  let belowFor = 0;
  let aboveFor = 0;
  let settleFor = 0;
  let warmedFor = 0;
  let spikeRun = 0;
  let clock = 0;
  let lastUpgradeAt = -Infinity;

  function resetTimers() {
    belowFor = 0;
    aboveFor = 0;
    avgFrameTime = 0;
    settleFor = settleSeconds;
  }

  function downgrade() {
    if (index >= ladder.length - 1) return false;

    // If we are climbing back down from a rung we only just climbed up to, that
    // rung is not sustainable on this machine, and trying it again would give
    // exactly the same answer a few seconds later. Nail the ceiling below it.
    // This is what stops the controller breathing between two resolutions for
    // as long as the page is open.
    if (clock - lastUpgradeAt < oscillationGuardSeconds) ceiling = index + 1;

    index += 1;
    resetTimers();
    return true;
  }

  function upgrade() {
    if (index <= ceiling) return false;
    index -= 1;
    lastUpgradeAt = clock;
    resetTimers();
    return true;
  }

  rebuild(startPixelRatio === null ? Infinity : startPixelRatio);

  return {
    // The pixel ratio to render at right now.
    current() {
      return ladder[index];
    },

    // Diagnostics for debug.html and the self-check; not used by the app.
    stats() {
      return {
        pixelRatio: ladder[index],
        index,
        ceiling,
        rungs: ladder.length,
        fps: avgFrameTime > 0 ? 1 / avgFrameTime : 0,
      };
    },

    // The display changed — a different monitor, or a browser zoom. Rebuilds
    // the ladder around the resolution currently on screen.
    setDeviceRatio(ratio) {
      if (ratio === deviceRatioNow) return false;
      const before = ladder[index];
      deviceRatioNow = ratio;
      rebuild(before);
      return ladder[index] !== before;
    },

    // One rendered frame, `dt` seconds after the previous one. Returns the new
    // pixel ratio if quality changed, or null if it did not — so the caller can
    // treat a change as an event rather than polling.
    frame(dt) {
      if (!(dt > 0)) return null;

      // An outsized frame is ambiguous, and getting the ambiguity wrong breaks
      // the controller in one direction or the other.
      //
      // It might be a stall that says nothing about rendering cost — a
      // backgrounded tab, a breakpoint, a garbage collection pause — and acting
      // on those would hand out downgrades for things the renderer did not do.
      // But it might equally be the honest frame time of a machine falling back
      // to software rendering, where two frames a second is simply what this
      // shader costs. Rejecting every long frame outright would leave the
      // slowest machines of all — the ones with the most to gain — pinned at
      // full resolution, because every single measurement looked like a stall.
      //
      // What separates them is repetition. A stall is one enormous gap followed
      // by ordinary frames; a slow GPU produces long frames continuously. So a
      // long frame is given the benefit of the doubt, and only believed once
      // `spikeToleranceFrames` of them have arrived in a row.
      if (dt > spikeSeconds) {
        spikeRun += 1;
        if (spikeRun < spikeToleranceFrames) return null;

        // Believed, but not at face value: a tab asleep for two minutes would
        // otherwise drag the average somewhere it takes an age to climb back
        // from. Clamped, it still reads as "far too slow", which is all the
        // decision below needs.
        dt = Math.min(dt, maxMeasuredSeconds);
      } else {
        spikeRun = 0;
      }

      clock += dt;

      // The opening frames are shader compilation, texture decode and the first
      // pipeline warm-up, and they are slow on every machine alive. Judging the
      // GPU by them would drop a fast desktop to the bottom rung before the
      // player had finished reading the welcome screen.
      if (warmedFor < warmupSeconds) {
        warmedFor += dt;
        return null;
      }

      // A resize costs a frame or two by itself. Measuring the new setting with
      // those included would immediately condemn it.
      if (settleFor > 0) {
        settleFor -= dt;
        return null;
      }

      const alpha = 1 - Math.exp(-dt / smoothingSeconds);
      avgFrameTime = avgFrameTime === 0 ? dt : avgFrameTime + alpha * (dt - avgFrameTime);
      const fps = 1 / avgFrameTime;

      if (fps < targetFps) {
        belowFor += dt;
        aboveFor = 0;
      } else if (fps > upgradeFps) {
        aboveFor += dt;
        belowFor = 0;
      } else {
        // The dead band between the two thresholds, which is where a
        // well-tuned machine spends its whole life. Neither timer runs, so
        // sitting here forever is a stable state rather than a slow drift.
        belowFor = 0;
        aboveFor = 0;
      }

      if (belowFor >= downgradeAfterSeconds && downgrade()) return ladder[index];
      if (aboveFor >= upgradeAfterSeconds && upgrade()) return ladder[index];
      return null;
    },
  };
}
