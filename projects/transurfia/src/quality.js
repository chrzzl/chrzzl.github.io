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
// therefore almost exactly linear in pixel count. Halving the pixel ratio is
// close to halving the frame time, which makes it both the strongest dial
// available and the most predictable one. There is no render target and no
// portal buffer to scale separately; the drawing buffer IS the render
// resolution.
//
// That also means resolution is the only ANTIALIASING available. MSAA does
// nothing to a fragment-shader image over a single quad — it antialiases
// geometry edges, and there is one piece of geometry. Supersampling is what the
// pixel ratio is. So every rung below the top is a real, visible cost.
//
// ---------------------------------------------------------------------------
// WHAT THIS CONTROLLER MEASURES, AND WHY IT IS NOT THE FRAME RATE
// ---------------------------------------------------------------------------
//
// Cost here depends on where the camera is LOOKING. A ray aimed along a
// corridor of repeats crosses a dozen portals before it finishes; one aimed at
// the floor nearby finishes at once. The frame rate therefore swings by tens of
// percent as the player turns, with no change in the machine's capability at
// all.
//
// An earlier version made decisions from a half-second exponential average,
// which tracks that swing almost exactly. The consequences were measured, not
// guessed:
//
//   - It downgraded on the worst view rather than the typical one. At a rung
//     averaging 58fps it still spent 10% of the time under the 40fps target,
//     which was enough to keep stepping down past resolutions that were
//     perfectly comfortable.
//   - Recovery needed an UNBROKEN streak above the upgrade threshold. At a rung
//     averaging 75fps, the longest unbroken streak above 55fps in ten minutes
//     was 21 seconds — and the lock that had to be cleared needed 180. So the
//     upgrade path was, in practice, dead.
//
// Decisions are now made from a percentile over a window of seconds: the frame
// rate that `decisionPercentile` of frames fail to beat. A dear view moves that
// number a little; it does not reset anything. The short average is still
// computed, but only for display.

// Builds the ladder of pixel ratios the controller may sit on.
//
// `fractions` are of the TOP rung, which is itself min(devicePixelRatio, the
// configured ceiling). Expressing rungs this way rather than as absolute
// numbers is what keeps them clean: at fractions 1, 3/4, 2/3, 1/2 every rung is
// a simple ratio of the DEVICE's own pixels, so the browser's final scale to
// the display is a simple one rather than an arbitrary resample.
//
// It also behaves sensibly at both ends of the DPI range, which no absolute
// ladder does:
//
//   dpr 2, ceiling 2.0  ->  2.0  1.5  1.333  1.0     (never below 1.0 CSS)
//   dpr 1, ceiling 2.0  ->  1.0  0.75  0.667  0.5    (still four rungs)
function buildLadder(top, fractions, floor) {
  const rungs = [];

  for (const fraction of fractions) {
    const ratio = top * fraction;
    if (ratio < floor - 1e-9) break;

    // Skip a rung indistinguishable from the one above it.
    if (rungs.length && ratio > rungs[rungs.length - 1] * 0.98) continue;

    rungs.push(ratio);
  }

  if (!rungs.length) rungs.push(Math.max(top, floor));
  return rungs;
}

export function createQualityController(options) {
  const {
    maxPixelRatio,
    minPixelRatio,
    deviceRatio = 1,
    qualityFractions,
    startPixelRatio = null,

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
    vsyncMargin,
    minRefreshFps,
    bestFpsDecaySeconds,
    probeSeconds,
    probeGain,
    reprobeSeconds,
    floorProbeMaxSeconds,
    upgradeCooldownSeconds,
    textureChangePauseSeconds,

    // The decision window. See the note at the top of the file.
    decisionWindowSeconds,
    minDecisionSeconds,
    decisionPercentile,
  } = options;

  let deviceRatioNow = deviceRatio;
  let ladder = [];
  let index = 0;

  function rebuild(preferredRatio) {
    const top = Math.max(minPixelRatio, Math.min(deviceRatioNow, maxPixelRatio));
    ladder = buildLadder(top, qualityFractions, minPixelRatio);

    // Keep the resolution the player is currently looking at, as closely as the
    // new ladder allows.
    let best = 0;
    for (let i = 1; i < ladder.length; i++) {
      if (Math.abs(ladder[i] - preferredRatio) < Math.abs(ladder[best] - preferredRatio)) best = i;
    }
    index = best;
  }

  // ---- the decision window -------------------------------------------------
  //
  // Frame times for the last `decisionWindowSeconds`, oldest first. Cleared on
  // every quality change: samples taken at the previous resolution say nothing
  // about this one, and leaving them in would have the controller judging a
  // rung partly by the rung it just left.
  let samples = [];
  let cached = { at: -Infinity, low: 0, median: 0 };

  function addSample(dt) {
    samples.push({ at: clock, dt });
    const cutoff = clock - decisionWindowSeconds;
    let drop = 0;
    while (drop < samples.length && samples[drop].at < cutoff) drop += 1;
    if (drop) samples = samples.slice(drop);
  }

  function windowSeconds() {
    if (samples.length < 2) return 0;
    return samples[samples.length - 1].at - samples[0].at;
  }

  // The frame rate that `decisionPercentile` of the window's frames fail to
  // beat, and the median, both recomputed at most a few times a second — the
  // statistic moves slowly and sorting several hundred samples every frame
  // would be the most expensive thing in this file.
  function statistics() {
    if (clock - cached.at < 0.25) return cached;

    const times = samples.map((s) => s.dt).sort((a, b) => a - b);
    const n = times.length;
    if (!n) return { at: clock, low: 0, median: 0 };

    const lowIndex = Math.min(n - 1, Math.floor((1 - decisionPercentile) * n));
    cached = {
      at: clock,
      low: 1 / times[lowIndex],
      median: 1 / times[Math.floor(n / 2)],
    };
    return cached;
  }

  // Rolling frame time, exponentially smoothed. Display only — see the note at
  // the top of the file for why it is no longer what decisions are made from.
  let avgFrameTime = 0;

  // Estimate of the cap the display imposes. requestAnimationFrame cannot fire
  // faster than the panel refreshes, so a machine with enormous headroom on a
  // 60Hz monitor reports exactly 60 — the same as one with none to spare.
  //
  // Rises instantly to any new high, decays slowly toward a sustained lower
  // rate. It used to be a plain running maximum that never came down, so a
  // laptop dropping from 144Hz to 30Hz on battery kept the stale 144 for ever.
  let bestFps = 0;

  let belowFor = 0;
  let aboveFor = 0;
  let settleFor = 0;
  let warmedFor = 0;
  let spikeRun = 0;
  let clock = 0;

  // Is the frame rate actually limited by how many pixels are being drawn?
  //
  // Not always. It can equally be capped by the display's refresh, by the CPU
  // side of the frame, or by the browser's compositor — and when it is,
  // lowering the resolution costs image quality and buys nothing at all. So a
  // downgrade is run as an experiment: the frame rate before it is remembered,
  // and once the change has settled the two are compared. If nothing improved,
  // the downgrade is undone and further downgrades are suspended.
  let resolutionBound = true;
  let unboundFor = 0;
  let probe = null;

  // How long we have sat on the bottom rung still short of the target, and how
  // long to wait before testing whether that rung is still needed.
  let flooredFor = 0;
  let floorProbeWait = reprobeSeconds;

  // No upgrade before this moment. Set when a downgrade happens.
  //
  // This is all that is left of the anti-oscillation machinery, and it is
  // deliberately the dumbest possible form of it: a wall-clock timestamp. The
  // mechanism it replaces — a lockout cleared only by an UNBROKEN streak above
  // the upgrade threshold — could not be satisfied in a scene whose cost swings
  // with the view, so it never cleared and the bottom rung became a trap. A
  // deadline cannot have that failure mode: the clock always reaches it.
  let noUpgradeBefore = 0;

  // Decisions are suspended while this is positive — currently only just after
  // a texture change. See pause().
  let pausedFor = 0;

  function resetWindow() {
    samples = [];
    cached = { at: -Infinity, low: 0, median: 0 };
    avgFrameTime = 0;
  }

  function resetTimers() {
    belowFor = 0;
    aboveFor = 0;
    settleFor = settleSeconds;
    resetWindow();
  }

  let lastChange = null;

  function record(reason, from) {
    lastChange = { from, to: ladder[index], reason, atSeconds: clock };
  }

  function downgrade(beforeFps, reason) {
    if (index >= ladder.length - 1) return false;
    const from = ladder[index];
    index += 1;
    probe = { beforeFps, at: clock, direction: 'down' };
    noUpgradeBefore = clock + upgradeCooldownSeconds;
    resetTimers();
    record(reason, from);
    return true;
  }

  function upgrade(reason) {
    if (index <= 0) return false;
    const from = ladder[index];
    index -= 1;
    probe = null;
    resetTimers();
    record(reason, from);
    return true;
  }

  rebuild(startPixelRatio === null ? Infinity : startPixelRatio);

  return {
    current() {
      return ladder[index];
    },

    stats() {
      const stat = statistics();
      return {
        pixelRatio: ladder[index],
        index,
        rungs: ladder.length,
        ladder: ladder.slice(),

        // The number decisions are made from, and the short average, which is
        // only for display. They differ by a lot while the player is turning,
        // and that difference is the whole point.
        decisionFps: stat.low,
        medianFps: stat.median,
        fps: avgFrameTime > 0 ? 1 / avgFrameTime : 0,
        frameTimeMs: avgFrameTime * 1000,

        windowSeconds: windowSeconds(),
        windowSamples: samples.length,
        bestFps,
        resolutionBound,
        probing: probe !== null,
        belowFor,
        aboveFor,
        lastChange,

        cooldownRemaining: Math.max(0, noUpgradeBefore - clock),
        paused: pausedFor > 0,

        upgradeBlockedBy:
          index === 0
            ? 'already at the top rung'
            : clock < noUpgradeBefore
              ? `cooldown, ${(noUpgradeBefore - clock).toFixed(1)}s left`
              : windowSeconds() < decisionWindowSeconds * 0.9
              ? `window only ${windowSeconds().toFixed(1)}s of ${decisionWindowSeconds}s`
              : aboveFor < upgradeAfterSeconds
                ? `aboveFor ${aboveFor.toFixed(1)}s of ${upgradeAfterSeconds}s`
                : null,
      };
    },

    // Stop judging for a moment, and throw away what is in the window.
    //
    // Called when something happens that is known to cost frames without
    // saying anything about the cost of RENDERING at this resolution — at
    // present, switching tile texture sets, which uploads new images and
    // regenerates their mipmaps. Without this, pressing T looked exactly like
    // a machine that had suddenly become too slow, and could spend a rung of
    // image quality on a stall that was already over.
    pause(seconds = textureChangePauseSeconds) {
      pausedFor = Math.max(pausedFor, seconds);
      resetWindow();
    },

    setDeviceRatio(ratio) {
      if (ratio === deviceRatioNow) return false;
      const before = ladder[index];
      deviceRatioNow = ratio;
      rebuild(before);
      resolutionBound = true;
      unboundFor = 0;
      probe = null;
      resetTimers();
      return ladder[index] !== before;
    },

    // One rendered frame, `dt` seconds after the previous one. Returns the new
    // pixel ratio if quality changed, or null if it did not.
    frame(dt) {
      if (!(dt > 0)) return null;

      // An outsized frame is ambiguous. It might be a stall that says nothing
      // about rendering cost — a backgrounded tab, a breakpoint, a collection
      // pause — or it might be the honest frame time of a machine falling back
      // to software rendering. What separates them is repetition: a stall is
      // one enormous gap followed by ordinary frames, a slow GPU produces long
      // frames continuously.
      if (dt > spikeSeconds) {
        spikeRun += 1;
        if (spikeRun < spikeToleranceFrames) return null;
        dt = Math.min(dt, maxMeasuredSeconds);
      } else {
        spikeRun = 0;
      }

      clock += dt;

      // Suspended, and the frames are not merely ignored but discarded: a
      // texture change uploads several megabytes and stalls a frame or two,
      // which says nothing about whether this resolution is affordable.
      if (pausedFor > 0) {
        pausedFor -= dt;
        return null;
      }

      // Shader compilation, texture decode and the first pipeline warm-up are
      // slow on every machine alive.
      if (warmedFor < warmupSeconds) {
        warmedFor += dt;
        return null;
      }

      // A resize costs a frame or two by itself.
      if (settleFor > 0) {
        settleFor -= dt;
        return null;
      }

      addSample(dt);

      const alpha = 1 - Math.exp(-dt / smoothingSeconds);
      avgFrameTime = avgFrameTime === 0 ? dt : avgFrameTime + alpha * (dt - avgFrameTime);

      const stat = statistics();
      const decisionFps = stat.low;
      const held = windowSeconds();

      // Rise instantly, fall slowly.
      const decay = 1 - Math.exp(-dt / bestFpsDecaySeconds);
      bestFps = Math.max(stat.median, bestFps + decay * (stat.median - bestFps));

      // Judge the outstanding experiment, in whichever direction it was run.
      // Medians on both sides, so the comparison is like for like and a change
      // of view between the two readings cannot decide it on its own.
      if (probe && clock - probe.at >= probeSeconds && held > 0) {
        const { beforeFps, direction } = probe;
        const from = ladder[index];
        probe = null;

        if (direction === 'down') {
          if (stat.median < beforeFps * probeGain) {
            // Giving up that resolution bought no frame rate, so whatever is
            // holding this frame back is not the pixel count. Put it back.
            resolutionBound = false;
            unboundFor = 0;
            index = Math.max(0, index - 1);
            resetTimers();
            record('downgrade bought nothing', from);
            return ladder[index];
          }
          resolutionBound = true;
        } else {
          // The mirror image: we gave ourselves a rung back to find out whether
          // the floor was still needed.
          if (stat.median < beforeFps / probeGain) {
            resolutionBound = true;
            floorProbeWait = Math.min(floorProbeWait * 2, floorProbeMaxSeconds);
            index = Math.min(ladder.length - 1, index + 1);
            resetTimers();
            record('the floor is still needed', from);
            return ladder[index];
          }
          resolutionBound = false;
          unboundFor = 0;
          floorProbeWait = reprobeSeconds;
        }
      }

      // Let resolution be blamed again eventually: a machine that was
      // refresh-limited a minute ago may be genuinely GPU-bound now.
      if (!resolutionBound) {
        unboundFor += dt;
        if (unboundFor >= reprobeSeconds) {
          resolutionBound = true;
          unboundFor = 0;
        }
      }

      // Nothing is decided from a window too short to mean anything. The
      // downgrade path is allowed to act on a partial one — a machine in
      // trouble should not wait ten seconds for relief — while an upgrade,
      // which spends performance rather than saving it, waits for a full one.
      if (held < minDecisionSeconds) return null;
      const windowFull = held >= decisionWindowSeconds * 0.9;

      // Being pinned at the refresh cap is itself a signal worth acting on: the
      // frame finished early and slept waiting for vsync, which is exactly the
      // headroom an upgrade needs. Without it, a 50Hz panel could never satisfy
      // an upgrade threshold of 55.
      const vsyncLimited = bestFps >= minRefreshFps && decisionFps >= bestFps * vsyncMargin;

      if (!resolutionBound) {
        // Resolution is free right now, so there is no reason to be anywhere
        // but the top of the ladder.
        aboveFor += dt;
        belowFor = 0;
      } else if (decisionFps < targetFps) {
        belowFor += dt;
        aboveFor = 0;
      } else if (decisionFps > upgradeFps || vsyncLimited) {
        aboveFor += dt;
        belowFor = 0;
      } else {
        // The dead band, which is where a well-matched machine spends its
        // whole life. Neither timer runs, so sitting here is a stable state.
        belowFor = 0;
        aboveFor = 0;
      }

      // `!probe`: one experiment at a time, or the next downgrade overwrites a
      // pending probe before it can be judged and the controller walks the
      // whole ladder down before discovering none of it helped.
      if (belowFor >= downgradeAfterSeconds && resolutionBound && !probe) {
        if (downgrade(stat.median, 'below target')) return ladder[index];
        belowFor = 0;
      }

      if (aboveFor >= upgradeAfterSeconds && windowFull && clock >= noUpgradeBefore) {
        const why = !resolutionBound
          ? 'resolution is not the limit'
          : vsyncLimited
            ? 'vsync headroom'
            : 'above target';
        if (upgrade(why)) return ladder[index];
      }

      // Sitting on the bottom rung, still short of the target.
      //
      // Being slow here does not prove resolution is irrelevant — a machine
      // managing 3fps at full resolution gets faster at every rung, it just
      // runs out of ladder. But the bottom rung is the most expensive place to
      // be wrong, so it is worth occasionally spending one rung to ask whether
      // it is still needed: the limit may have moved while the ladder stayed
      // where the old limit put it.
      if (index === ladder.length - 1 && decisionFps < targetFps) {
        flooredFor += dt;
        if (flooredFor >= floorProbeWait && !probe && windowFull && clock >= noUpgradeBefore) {
          flooredFor = 0;
          const before = stat.median;
          if (upgrade('testing whether the floor is still needed')) {
            probe = { beforeFps: before, at: clock, direction: 'up' };
            return ladder[index];
          }
        }
      } else {
        flooredFor = 0;
      }

      return null;
    },
  };
}
