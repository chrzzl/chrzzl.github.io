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
  // If the last computed rung already sits within a few percent of it, that
  // rung is replaced rather than followed by a near-duplicate: two rungs a
  // percent apart are one rung as far as the eye is concerned, and all the
  // second one can do is spend a downgrade cycle achieving nothing.
  const last = ladder[ladder.length - 1];
  if (last > min) {
    if (last < min * 1.05) ladder[ladder.length - 1] = min;
    else ladder.push(min);
  }

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
    vsyncMargin,
    minRefreshFps,
    ceilingRelaxSeconds,
    ceilingRelaxMaxSeconds,
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

  // Highest smoothed frame rate seen this session, which is an estimate of the
  // display's refresh rate — see the note at the upgrade test below.
  let bestFps = 0;

  let belowFor = 0;
  let aboveFor = 0;
  let settleFor = 0;
  let warmedFor = 0;
  let spikeRun = 0;
  let clock = 0;
  let lastUpgradeAt = -Infinity;

  // How long a locked-out rung stays locked out. Doubles each time the lockout
  // has to be reapplied, so a machine that really cannot sustain the rung is
  // asked about it ever more rarely instead of for ever.
  let relaxWait = ceilingRelaxSeconds;

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
    //
    // Not for ever, though — see the relaxation in frame(). "Cannot sustain
    // this rung" is a statement about the machine AS IT IS NOW, and the thing
    // that made it true is often temporary: another application, a video call,
    // a laptop on battery saver. A permanent verdict means a session that
    // starts under load is stuck with the consequences hours later. So the
    // lockout expires, and `relaxWait` doubles each time it has to be
    // reimposed, which is what keeps a genuinely incapable machine from
    // retrying on a loop.
    if (clock - lastUpgradeAt < oscillationGuardSeconds) {
      ceiling = index + 1;
      relaxWait = Math.min(relaxWait * 2, ceilingRelaxMaxSeconds);

      // Forget the upgrade that just failed. Otherwise the clock keeps running
      // and the "this upgrade has survived the guard window" test in frame()
      // would eventually fire for an upgrade that did not survive it at all.
      lastUpgradeAt = -Infinity;
    }

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
        // The estimated refresh cap, so a HUD can say whether a low frame rate
        // is the GPU struggling or just the display's own limit.
        bestFps,
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

      // requestAnimationFrame is capped at the display's refresh rate, so the
      // frame rate measured here has a ceiling that has nothing to do with the
      // GPU: a machine with an enormous amount of headroom on a 60Hz monitor
      // reports exactly 60, the same as a machine with none to spare.
      //
      // This is not a detail. The upgrade test used to be `fps > 75`, which on
      // any 60Hz or 75Hz display is a condition that CANNOT BE TRUE, so every
      // downgrade was permanent for the rest of the session and quality only
      // ever ratcheted downward. That is the bug behind "after a while the
      // columns and the distance go pixelated": not one bad decision but an
      // absorbing state at the bottom of the ladder.
      //
      // Being pinned at the refresh rate is itself the signal worth acting on —
      // it means the frame finished early and went to sleep waiting for vsync,
      // which is exactly the headroom an upgrade needs. So the highest rate
      // ever seen is taken as an estimate of that cap, and sitting within
      // `vsyncMargin` of it counts as comfortable however low the cap happens
      // to be. That works on 60Hz, on 144Hz, and on a throttled tab, none of
      // which an absolute threshold can cover at once.
      bestFps = Math.max(bestFps, fps);

      // `bestFps` is only evidence of a refresh cap if it is high enough to BE
      // one. A machine that has never exceeded 35fps is sitting at its own
      // limit, not the display's, and without this guard it would qualify as
      // "pinned at its best, so it has headroom" and be handed upgrades it
      // cannot pay for — the same mistake as before, inverted.
      const vsyncLimited = bestFps >= minRefreshFps && fps >= bestFps * vsyncMargin;

      if (fps < targetFps) {
        belowFor += dt;
        aboveFor = 0;
      } else if (fps > upgradeFps || vsyncLimited) {
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

      // An upgrade that has outlived the oscillation guard is evidence that
      // the machine genuinely improved, rather than that it briefly looked
      // like it had. The patience accumulated from earlier failures was a
      // response to conditions that no longer hold, so it is handed back —
      // without this, a session that spent its first ten minutes under load
      // would still be waiting half an hour per rung long after the load went
      // away.
      if (lastUpgradeAt > -Infinity && clock - lastUpgradeAt > oscillationGuardSeconds) {
        relaxWait = ceilingRelaxSeconds;
      }

      // Sustained comfort with nowhere to go means the ceiling above is the
      // only thing holding quality down. Open it by one rung and let the
      // ordinary upgrade path have another go; if the rung still cannot be
      // held, downgrade() will shut it again and wait twice as long.
      if (ceiling > 0 && aboveFor >= relaxWait) {
        ceiling -= 1;
        aboveFor = 0;
      }

      return null;
    },
  };
}
