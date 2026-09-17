// ============================================================================
// AUTOPLAYER — the guided demo
// ============================================================================
//
// Drives the player along a fixed route, for devices that cannot play.
//
// The whole design rests on one decision: this module does not move the player.
// It presses the player's keys.
//
// PlayerController already reads movement from a Set of key codes and a yaw
// angle, and everything interesting happens downstream of that — resolveStep,
// the edge gluings, the cone-point capture, the sculpture collisions. So the
// demo writes into `player.keys` and adds to `player.yaw`, then lets
// player.update() run exactly as it does for a human. No portal mathematics is
// reimplemented here, there is no second movement path to keep in sync, and
// PlayerController itself needed no changes at all. What the demo shows is
// therefore the real thing, not an animation of it.
//
// The cost of that choice is that movement is ON OR OFF, because a keyboard is:
// a leg's `forward: 0.6` cannot walk at 60% speed. Legs are timed in seconds
// instead, which is the honest unit for a route anyway.

import { DEMO } from './config.js';

const DEG = Math.PI / 180;

// A leg's defaults. `turn` and `pitch` are TOTALS for the leg in degrees, not
// rates — a leg says "turn 90° over 2.5 seconds", and the controller works out
// the per-frame share. Stating it as a total is what makes the route
// frame-rate independent and reproducible: the same route always ends facing
// the same way, whatever the frame times were.
const LEG = { seconds: 1, forward: 0, strafe: 0, turn: 0, pitch: 0, label: '' };

export function createAutoPlayer(player, { start, route = DEMO.route } = {}) {
  if (!route.length) throw new Error('DEMO.route is empty');

  const legs = route.map((leg) => ({ ...LEG, ...leg }));
  const total = legs.reduce((sum, leg) => sum + leg.seconds, 0);

  const startPosition = start;
  const startYaw = DEMO.startYaw * DEG;

  let legIndex = 0;
  let elapsedInLeg = 0;
  let pausing = 0;
  let strayWarned = false;

  // Only the four keys the route can press. Assigned rather than toggled so a
  // leg change cannot leave a key stuck down — a stuck key would keep walking
  // through every later leg, which is exactly the sort of bug that would be
  // invisible until the route reached a corner.
  function setKeys({ forward, strafe }) {
    const held = {
      KeyW: forward > 0.5,
      KeyS: forward < -0.5,
      KeyA: strafe < -0.5,
      KeyD: strafe > 0.5,
    };
    for (const code of Object.keys(held)) {
      if (held[code]) player.keys.add(code);
      else player.keys.delete(code);
    }
  }

  function releaseKeys() {
    setKeys({ forward: 0, strafe: 0 });
  }

  function restart() {
    legIndex = 0;
    elapsedInLeg = 0;
    releaseKeys();
    player.position.set(startPosition[0], startPosition[1]);
    player.yaw = startYaw;
    player.pitch = 0;
  }

  restart();

  // Walks the schedule forward by `dt`, which may span more than one leg on a
  // slow frame. Returns the accumulated yaw and pitch for the frame and leaves
  // `legIndex` on the leg that is current when the frame ends.
  //
  // Rotation is accumulated as a FRACTION of each leg crossed, so a frame that
  // straddles a boundary gets the right share of both legs' turns and no
  // rotation is ever lost or double-counted. Walking is not subdivided the same
  // way — player.update() is called once per frame with the whole dt — so a
  // straddling frame walks according to whichever leg it ends in. At any
  // plausible frame rate that is a few milliseconds of travel; treating it
  // exactly would mean calling the whole movement resolver twice in one frame,
  // which is real cost for an invisible gain.
  function advance(dt) {
    let remaining = dt;
    let yaw = 0;
    let pitch = 0;

    while (remaining > 0 && legIndex < legs.length) {
      const leg = legs[legIndex];
      const used = Math.min(remaining, leg.seconds - elapsedInLeg);
      const share = leg.seconds > 0 ? used / leg.seconds : 0;

      yaw += leg.turn * DEG * share;
      pitch += leg.pitch * DEG * share;

      elapsedInLeg += used;
      remaining -= used;

      if (elapsedInLeg >= leg.seconds - 1e-9) {
        legIndex += 1;
        elapsedInLeg = 0;
      }
    }

    return { yaw, pitch };
  }

  return {
    // Called once per frame, BEFORE player.update(dt).
    update(dt) {
      // The route is verified against the real physics not to touch a cone
      // point (tools/route.selfcheck.mjs), so arriving here means the route or
      // the world geometry has been edited since. Orbiting forever would be a
      // silent, permanent failure, so the demo uses the player's own documented
      // way out — W — and starts again.
      if (player.mode === 'singularity') {
        if (!strayWarned) {
          strayWarned = true;
          console.warn(
            '[transurfia] the demo route walked into a cone point; restarting. ' +
              'Run tools/route.selfcheck.mjs — DEMO.route no longer suits the world geometry.'
          );
        }
        player.keys.clear();
        player.keys.add('KeyW'); // player.update() reads this as "walk away"
        legIndex = legs.length;
        pausing = DEMO.restartPauseSeconds;
        return;
      }

      // Between loops: standing still, so the reset lands on a frame where
      // nothing is moving and reads as a restart rather than as a teleport.
      if (pausing > 0) {
        pausing -= dt;
        releaseKeys();
        if (pausing <= 0) restart();
        return;
      }

      if (legIndex >= legs.length) {
        pausing = DEMO.restartPauseSeconds;
        releaseKeys();
        return;
      }

      const { yaw, pitch } = advance(dt);
      player.yaw += yaw;
      player.pitch += pitch;

      // Same clamp the mouse handler in player.js applies. Kept here rather
      // than borrowed, because a route with no pitch legs never needs it and
      // this is the only place it could be exceeded.
      const limit = Math.PI / 2 - 0.01;
      player.pitch = Math.max(-limit, Math.min(limit, player.pitch));

      setKeys(legIndex < legs.length ? legs[legIndex] : LEG);
    },

    // What the demo is currently showing. `label` is the line the HUD prints,
    // and is empty for legs that are not worth narrating.
    state() {
      const leg = legIndex < legs.length ? legs[legIndex] : null;
      return {
        label: leg ? leg.label : '',
        legIndex,
        legCount: legs.length,
        totalSeconds: total,
        restarting: pausing > 0,
      };
    },

    // For the self-check, which needs to know when a lap has completed.
    restart,
  };
}
