// Offline self-check for the guided demo route.
//
//   node tools/route.selfcheck.mjs
//
// This is the check the demo actually depends on. The route in DEMO.route is a
// list of durations, and durations become DISTANCES via PLAYER.walkSpeed, so
// the route's safety is a claim about where the player ends up — and the one
// thing that must never happen is walking into a cone point. That would not
// crash anything; it would quietly hijack the demo into orbiting a column for
// ever, on a visitor's phone, with no way to notice from here.
//
// So the route is not inspected, it is WALKED: a real PlayerController, the
// real surface, the real resolveStep, the real edge gluings and the real
// cone-point capture, driven by the real AutoPlayer. The only fakes are a
// `document` that swallows event listeners and a `domElement` that is never
// used, because PlayerController registers keyboard and mouse handlers that
// nothing here will ever fire.
//
// `three` resolves through node_modules/three, which is a three-line alias to
// the same build the browser loads. See the comment in that file.
//
// It is walked at several frame rates, including deliberately awful and
// deliberately erratic ones, because a phone does not deliver steady frames and
// "safe at 60fps" is not the claim that needs to hold.

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// PlayerController attaches listeners to `document` in its constructor. Nothing
// here dispatches events — the demo drives the player by writing into
// `player.keys` directly, which is the whole point of its design — so these
// only have to exist.
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  pointerLockElement: null,
};

const THREE = await import('three');
const { PlayerController } = await import('../src/player.js');
const { createLShapeSurface } = await import('../src/surface.js');
const { createAutoPlayer } = await import('../src/autoplayer.js');
const { WORLD, PLAYER, DEMO, SINGULARITIES, SCULPTURES, sculpturePosition, sculptureRadius } =
  await import('../src/config.js');

const surface = createLShapeSurface(WORLD.tileSize);
const START = PLAYER.startPosition ?? [WORLD.tileSize * 0.5, WORLD.tileSize * 0.5];

function distanceToNearestCorner(x, z) {
  let best = Infinity;
  for (const [cx, cz] of surface.singularPositions) {
    best = Math.min(best, Math.hypot(x - cx, z - cz));
  }
  return best;
}

// Walks the route for `seconds` of simulated time, with frame deltas drawn from
// `nextDt`. Returns everything worth asserting about the trip.
function walk({ seconds, nextDt, sculptures = false }) {
  const camera = new THREE.PerspectiveCamera(PLAYER.fieldOfView, 1, 0.05, 1000);

  // The sculptures are only in the world under one texture set, and a phone
  // never presses T, so the demo runs with the set TEXTURES.active names. Both
  // cases are worth walking: with obstacles present, the route could be pushed
  // off its intended line and into a corner.
  const obstacles = sculptures
    ? [SCULPTURES.chair, SCULPTURES.table].map((spec) => {
        const [x, z] = sculpturePosition(spec);
        return { x, z, radius: sculptureRadius(spec) };
      })
    : [];

  const player = new PlayerController(camera, {}, surface, { obstacles });
  player.position.set(START[0], START[1]);

  const auto = createAutoPlayer(player, { start: START });

  let t = 0;
  let minCornerDistance = Infinity;
  let captured = false;
  let crossings = 0;
  let laps = 0;
  let wasRestarting = false;

  let previous = [player.position.x, player.position.y];

  while (t < seconds) {
    const dt = nextDt();
    t += dt;

    auto.update(dt);
    player.update(dt);

    const x = player.position.x;
    const z = player.position.y;

    if (player.mode === 'singularity') captured = true;
    minCornerDistance = Math.min(minCornerDistance, distanceToNearestCorner(x, z));

    // A portal crossing is the only way to move further in one frame than
    // walking could carry you. Generous factor so a slow frame is not counted.
    const step = Math.hypot(x - previous[0], z - previous[1]);
    const walkable = PLAYER.walkSpeed * PLAYER.runMultiplier * dt * 3 + 1e-6;
    if (step > walkable) crossings += 1;
    previous = [x, z];

    const restarting = auto.state().restarting;
    if (restarting && !wasRestarting) laps += 1;
    wasRestarting = restarting;
  }

  return { minCornerDistance, captured, crossings, laps, position: previous, player };
}

const fixed = (fps) => () => 1 / fps;

console.log('\ndemo route');

// ---------------------------------------------------------------------------
// The assumptions the route was drawn against. If either of these changes, the
// route's timings no longer correspond to the distances they were chosen for,
// and every check below is measuring the wrong world.
{
  check('WORLD.tileSize is still 3', WORLD.tileSize === 3, `is ${WORLD.tileSize}`);
  check('PLAYER.walkSpeed is still 2.5', PLAYER.walkSpeed === 2.5, `is ${PLAYER.walkSpeed}`);
  check(
    'the surface still has 8 identified corners',
    surface.singularPositions.length === 8,
    `${surface.singularPositions.length} corners`
  );
}

// ---------------------------------------------------------------------------
{
  const total = DEMO.route.reduce((sum, leg) => sum + leg.seconds, 0);
  check('the route lasts 20-40 seconds', total >= 20 && total <= 40, `${total}s`);
  check('every leg has a duration', DEMO.route.every((leg) => leg.seconds > 0));
  check(
    'at least half the legs are narrated',
    DEMO.route.filter((leg) => leg.label).length >= DEMO.route.length / 2
  );
}

// ---------------------------------------------------------------------------
// The one that matters. Walked at every frame rate a phone might produce.
{
  const rates = [144, 60, 30, 20, 12, 6];
  for (const fps of rates) {
    const trip = walk({ seconds: 40, nextDt: fixed(fps) });
    check(
      `never captured by a cone point at ${fps}fps`,
      !trip.captured,
      'the demo would orbit a column for ever'
    );
    check(
      `keeps clear of every corner at ${fps}fps`,
      trip.minCornerDistance > SINGULARITIES.enterRadius * 2,
      `came within ${trip.minCornerDistance.toFixed(3)} of a corner ` +
        `(capture at ${SINGULARITIES.enterRadius})`
    );
  }
}

// ---------------------------------------------------------------------------
{
  // Erratic frames, which is what a phone actually delivers: a steady rate with
  // occasional long stalls. Run long enough to cover many laps.
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const jittery = () => (random() < 0.06 ? 0.05 + random() * 0.25 : 1 / 45 + random() * 0.02);

  const trip = walk({ seconds: 400, nextDt: jittery });
  check('never captured across 400s of erratic frames', !trip.captured);
  check(
    'keeps clear of every corner on erratic frames',
    trip.minCornerDistance > SINGULARITIES.enterRadius * 2,
    `came within ${trip.minCornerDistance.toFixed(3)}`
  );
  check('the route loops', trip.laps >= 8, `${trip.laps} laps in 400s`);
}

// ---------------------------------------------------------------------------
{
  // With the sculptures standing, in case a collision push nudges the route.
  const trip = walk({ seconds: 120, nextDt: fixed(60), sculptures: true });
  check('never captured with the sculptures present', !trip.captured);
  check(
    'keeps clear of every corner with the sculptures present',
    trip.minCornerDistance > SINGULARITIES.enterRadius * 2,
    `came within ${trip.minCornerDistance.toFixed(3)}`
  );
}

// ---------------------------------------------------------------------------
{
  // A tour that never crosses a portal would be a tour of an ordinary room.
  const trip = walk({ seconds: DEMO.route.reduce((s, l) => s + l.seconds, 0), nextDt: fixed(60) });
  check('the route crosses portals', trip.crossings >= 6, `${trip.crossings} crossings in one lap`);
}

// ---------------------------------------------------------------------------
{
  // Laps must be identical, not merely similar: the reset is what guarantees a
  // visitor arriving at minute ten sees the same tour as one arriving at
  // minute one, and stops any drift from accumulating for ever.
  const lapSeconds = DEMO.route.reduce((s, l) => s + l.seconds, 0) + DEMO.restartPauseSeconds;

  const first = walk({ seconds: lapSeconds - 0.5, nextDt: fixed(60) });
  const second = walk({ seconds: lapSeconds * 2 - 0.5, nextDt: fixed(60) });

  const drift = Math.hypot(
    first.position[0] - second.position[0],
    first.position[1] - second.position[1]
  );
  check('lap two ends where lap one did', drift < 0.05, `drifted ${drift.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
{
  // The stray-recovery path, which should be dead code. Forced by starting the
  // player on top of a corner: the demo must notice, use W to get out, and
  // restart rather than orbit.
  const camera = new THREE.PerspectiveCamera(PLAYER.fieldOfView, 1, 0.05, 1000);
  const player = new PlayerController(camera, {}, surface, { obstacles: [] });
  const auto = createAutoPlayer(player, { start: START });

  const [cx, cz] = surface.singularPositions[2];
  player.position.set(cx, cz);
  player.update(1 / 60); // captured

  check('a stray start really is captured', player.mode === 'singularity');

  const warn = console.warn;
  let warned = false;
  console.warn = () => {
    warned = true;
  };
  for (let i = 0; i < 400; i++) {
    auto.update(1 / 60);
    player.update(1 / 60);
  }
  console.warn = warn;

  check('the demo recovers from a stray capture', player.mode === 'moving');
  check('and says so in the console', warned);
  check(
    'and is back on the route',
    distanceToNearestCorner(player.position.x, player.position.y) >
      SINGULARITIES.enterRadius * 2,
    `at ${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}`
  );
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
