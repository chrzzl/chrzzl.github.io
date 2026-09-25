import * as THREE from 'three';

import { segmentIntersect, pointInPolygon } from './geometry.js';
import { PLAYER, SINGULARITIES } from './config.js';

// ============================================================================
// PLAYER
// ============================================================================
//
// Walking and mouse-look inside the fundamental domain.
//
// resolveMove() is the CPU counterpart of the shader's per-pixel traversal: it
// walks the same boundary edges and applies the same gluing translations, so
// what you walk through and what you see through always agree. Tuning lives in
// config.js under PLAYER.

// Default minimum clearance (world units) left between the player and an edge
// they just crossed. Orbiting overrides it — see ORBIT_EDGE_CLEARANCE.
//
// The ray tracer starts every camera ray at the player's position with no
// edge excluded (`standingOn = -1` — there is no "edge we came from" for a
// fresh ray). If the player were left sitting exactly on a boundary, roughly
// half the rays would detect that edge at t ~ 0 and immediately spend a
// crossing on it, so the whole frame would flicker between two copies as
// floating-point noise moved the player a hair either side. A small
// guaranteed push keeps the camera unambiguously inside the domain.
export const MIN_EDGE_CLEARANCE = 0.02;

// How close a crossing has to land to a corner to count as having gone through
// the cone point, and how far along the edge it is then slid to get clear of
// it. See the explanation inside resolveMove.
const VERTEX_EPS = 1e-6;
const VERTEX_NUDGE = 0.02;

// Resolves a straight-line move on the translation surface, applying edge
// teleports (translations) whenever the path crosses a glued boundary edge.
// Orientation never changes — only position jumps — because gluings are pure
// translations.
export function resolveMove(surface, start, end, maxTeleports = 4, clearance = MIN_EDGE_CLEARANCE) {
  let s = start.slice();
  let e = end.slice();
  const { vertices, edgeInfo } = surface;
  const n = vertices.length;

  for (let iter = 0; iter < maxTeleports; iter++) {
    let best = null;
    let bestEdge = -1;
    for (let i = 0; i < n; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const hit = segmentIntersect(s, e, a, b);
      if (hit && (!best || hit.t < best.t)) {
        best = hit;
        bestEdge = i;
      }
    }
    if (!best) break;

    // Did the path merely TOUCH a corner, rather than leave through it?
    //
    // A segment passing exactly through a vertex registers as hitting both
    // edges that meet there, at the same instant — but at a 270 degree corner
    // like the notch, walking straight through the cone point comes out on the
    // far side of the SAME copy and never leaves the domain at all. Treating
    // that as a crossing teleports the player for no reason, and the leftover
    // motion then heads out through the edge they were just glued to, which
    // ends the step outside the domain and freezes them there.
    //
    // So a corner counts as a crossing only if the path really does come out
    // the other side of the boundary.
    const onVertex = vertices.some(
      ([vx, vz]) => Math.hypot(best.point[0] - vx, best.point[1] - vz) < VERTEX_EPS
    );
    if (onVertex && pointInPolygon(vertices, e[0], e[1])) break;

    const [tx, tz] = edgeInfo[bestEdge].translation;
    // Nudge the crossing point slightly past the edge (in translated
    // space) so the next iteration's intersection tests don't re-trigger
    // on the same edge due to floating point noise.
    let nx = best.point[0] + tx;
    let nz = best.point[1] + tz;

    let dirX = e[0] - best.point[0];
    let dirZ = e[1] - best.point[1];

    // Guarantee clearance PERPENDICULAR to the crossed edge specifically
    // (not just total leftover-motion length) — see MIN_EDGE_CLEARANCE's
    // comment above. Rescaling the whole leftover vector to length
    // MIN_EDGE_CLEARANCE (the previous approach) still leaves the player
    // almost coplanar with the wall whenever the crossing is shallow —
    // e.g. strafing along a wall while barely poking through it — since
    // then nearly all of that length is PARALLEL to the wall and barely
    // moves the player away from its plane. Decomposing into perpendicular
    // vs. parallel components and topping up only the perpendicular one
    // fixes this regardless of crossing angle, while leaving sideways
    // motion untouched.
    const ea = vertices[bestEdge];
    const eb = vertices[(bestEdge + 1) % n];
    const edgeLen = Math.hypot(eb[0] - ea[0], eb[1] - ea[1]);
    if (edgeLen > 1e-9) {
      // Edge direction, rotated 90° to get the outward-ish normal.
      const normalX = -(eb[1] - ea[1]) / edgeLen;
      const normalZ = (eb[0] - ea[0]) / edgeLen;

      // Which side to push towards comes from the direction of TRAVEL, not
      // from the leftover. The two point the same way — the leftover is the
      // tail of the same straight segment — except when the segment ends
      // exactly on the edge, where the leftover is the zero vector and its
      // sign is whatever `< 0` happens to say about 0. That pushed the player
      // backwards through the wall they had just crossed, which for walking is
      // a measure-zero coincidence but for orbiting is reached exactly: the
      // orbit meets each edge at a right angle, so an angular step that divides
      // the wedge evenly lands right on it.
      const travelPerp = (e[0] - s[0]) * normalX + (e[1] - s[1]) * normalZ;
      const perpSign = travelPerp < 0 ? -1 : 1;

      const perp = dirX * normalX + dirZ * normalZ;
      if (Math.abs(perp) < clearance) {
        const deficit = perpSign * clearance - perp;
        dirX += normalX * deficit;
        dirZ += normalZ * deficit;
      }
    }

    // Walking exactly into a CORNER, i.e. straight into the cone point.
    //
    // Both edges meeting there were crossed at the same instant, so which one
    // the player goes through has no answer: three sheets of surface meet here
    // and any of them continues the path correctly. Picking one is fine. What
    // is not fine is where picking one can leave the player — on the partner
    // edge's own endpoint, which is another corner, still exactly on the
    // boundary, with the leftover motion heading straight back out. The next
    // iteration cannot resolve THAT crossing either, because its segment starts
    // on an edge's endpoint. resolveMove returns a point outside the domain,
    // resolveStep refuses the step to protect the invariant, and it refuses it
    // again on every following frame: the player freezes solid a centimetre
    // short of the corner, permanently, with no way out. Since leaving the mode
    // leaves you facing the column, holding W is the obvious thing to do and
    // walked right into it.
    //
    // Sliding a little along the partner edge, away from its endpoints, commits
    // to one of the sheets and puts the player on the interior of an edge,
    // where the ordinary logic works again. It is applied only when the plain
    // answer is genuinely unusable, so every crossing that already resolved
    // keeps resolving exactly as it did.
    if (onVertex && !pointInPolygon(vertices, nx + dirX, nz + dirZ)) {
      const partner = edgeInfo[bestEdge].other;
      const pa = vertices[partner];
      const pb = vertices[(partner + 1) % n];
      const mx = (pa[0] + pb[0]) / 2 - nx;
      const mz = (pa[1] + pb[1]) / 2 - nz;
      const mlen = Math.hypot(mx, mz);
      if (mlen > 1e-9) {
        nx += (mx / mlen) * VERTEX_NUDGE;
        nz += (mz / mlen) * VERTEX_NUDGE;
      }
    }

    s = [nx, nz];
    e = [nx + dirX, nz + dirZ];
  }
  return { position: e, teleportOffset: [e[0] - end[0], e[1] - end[1]] };
}

// Pushes a point out of every obstacle it is inside. Pure, so the self-check
// can exercise it without a browser.
export function pushOutOfObstacles(obstacles, playerRadius, x, z) {
  for (const o of obstacles) {
    const dx = x - o.x;
    const dz = z - o.z;
    const minDist = o.radius + playerRadius;
    const dist = Math.hypot(dx, dz);
    if (dist < minDist && dist > 1e-6) {
      const push = minDist - dist;
      x += (dx / dist) * push;
      z += (dz / dist) * push;
    }
  }
  return [x, z];
}

// One frame of movement: walk from `start` toward `end`, then settle out of any
// obstacle — with BOTH treated as movement across the surface.
//
// Running the obstacle push through resolveMove is the whole point. It used to
// be applied directly to the resolved position, which meant an obstacle whose
// clearance circle reached past a portal edge could shove the player straight
// through the wall WITHOUT applying that edge's translation. The player ended
// up outside the fundamental domain, where the traversal has no meaning: the
// world empties out, the minimap marker leaves the map, and there is no way
// back. A sculpture standing 0.60 from an edge with a 0.62 clearance circle did
// exactly that.
export function resolveStep(surface, start, end, obstacles, playerRadius) {
  let pos = resolveMove(surface, start, end).position;

  // A push can teleport the player, landing them inside a different obstacle,
  // so settle a few times. It converges immediately in the ordinary case.
  for (let i = 0; i < 3; i++) {
    const pushed = pushOutOfObstacles(obstacles, playerRadius, pos[0], pos[1]);
    if (pushed[0] === pos[0] && pushed[1] === pos[1]) break;
    pos = resolveMove(surface, pos, pushed).position;
  }

  // Backstop, not a fix. The above should keep the player inside; if some
  // future obstacle arrangement still manages to eject them, refusing the step
  // costs one frame of movement, whereas accepting it costs the session.
  // Assumes `start` is inside, which holds because no step that leaves is ever
  // accepted and the configured start position is inside.
  if (!pointInPolygon(surface.vertices, pos[0], pos[1])) return start.slice();

  return pos;
}

// ============================================================================
// SINGULARITY MODE
// ============================================================================
//
// Walking up to a column stops the player walking and makes them a point on a
// circle around it: the mouse sweeps them around the column, which stays fixed
// and stays centred in view, and W puts them back on their feet.
//
// All eight corners of the domain are the SAME point of the surface, so there
// is one singularity with eight representatives. Everything below asks the
// topological question - "where am I relative to the cone point?" - of the
// player's DOMAIN COORDINATES and the CPU corner list, never of what the
// renderer happens to be drawing. The shader draws that one point many times
// over through the portals; none of those copies exist here.
//
// That distinction is what makes orbiting work at all. A circle around this
// point is three times longer than a circle should be, because there is 6*PI
// of angle here rather than 2*PI: the orbit leaves the domain through an edge
// eight times on its way round, and each time the gluing hands it to a
// different corner, which it carries on around. Three full sweeps of the mouse
// bring the player back to where they started.

// Radius of the circle the player orbits on.
export function orbitRadius() {
  return SINGULARITIES.radius + SINGULARITIES.orbitClearance;
}

// Distance used to probe which side of a corner is the interior.
const INWARD_PROBE = 1e-3;

// The largest angle stepped in one go while orbiting. A fast mouse flick can
// ask for a big jump, and each step below is a CHORD of the orbit circle: taken
// whole, a large one would cut across the inside of the circle and could pass
// the wrong side of the corner. Subdividing keeps every chord hugging the arc.
const MAX_ORBIT_STEP = 0.15;

// Clearance left past an edge crossed while ORBITING, rather than walking.
//
// Walking needs MIN_EDGE_CLEARANCE (0.02) because a shallow crossing — strafing
// along a wall while barely poking through it — otherwise leaves the camera
// nearly coplanar with that wall for many frames on end. The orbit has neither
// problem: it meets every edge at a right angle and keeps moving. What it does
// have is a scale, and 0.02 of arc at this radius is nearly four degrees, so
// paying the walking clearance would lurch the player forward by that much at
// each of the eight crossings it takes to go round — about 30 degrees of orbit
// lost per circuit. This is small enough to be invisible and still thousands of
// float32 ulps clear of the boundary.
const ORBIT_EDGE_CLEARANCE = 1e-3;

// A unit vector pointing from corner `index` into the domain, along the
// bisector of the corner's INTERIOR angle.
//
// The bisector is the sum of the two unit edge directions leaving the corner -
// but that sum bisects the smaller of the two angles between them, which is the
// interior one only at a convex corner. At the notch (a 270 degree corner) it
// points straight out of the domain, and at the two split points (180 degrees,
// mid-edge, present only because the gluing needs them) the two directions
// cancel outright. Rather than case-analysing the three shapes, the result is
// TESTED against the polygon and flipped if it came out wrong, so a change to
// the domain cannot silently produce a direction that leaves it.
//
// Only needed for the degenerate entry below, where the player is exactly on a
// corner and there is no approach direction left to recover.
export function interiorDirection(surface, index) {
  const { vertices } = surface;
  const n = vertices.length;
  const v = vertices[index];

  const unitFrom = (to) => {
    const dx = to[0] - v[0];
    const dz = to[1] - v[1];
    const len = Math.hypot(dx, dz);
    return [dx / len, dz / len];
  };
  const [ax, az] = unitFrom(vertices[(index + n - 1) % n]);
  const [bx, bz] = unitFrom(vertices[(index + 1) % n]);

  let dx = ax + bx;
  let dz = az + bz;
  if (Math.hypot(dx, dz) < 1e-6) {
    // Collinear edges: no bisector exists, so step off the edge at right
    // angles instead.
    dx = -bz;
    dz = bx;
  }
  const len = Math.hypot(dx, dz);
  dx /= len;
  dz /= len;

  if (!pointInPolygon(vertices, v[0] + dx * INWARD_PROBE, v[1] + dz * INWARD_PROBE)) {
    dx = -dx;
    dz = -dz;
  }
  return [dx, dz];
}

// One interior direction per corner, fixed for the life of the surface.
export function interiorDirections(surface) {
  return surface.singularPositions.map((_, i) => interiorDirection(surface, i));
}

// The nearest representative of the cone point to (x, z), or null if the
// surface has none.
export function nearestSingularity(positions, x, z) {
  let index = -1;
  let distance = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = Math.hypot(x - positions[i][0], z - positions[i][1]);
    if (d < distance) {
      distance = d;
      index = i;
    }
  }
  return index < 0 ? null : { index, distance };
}

// Where the player stands at orbit angle `angle` around corner `index`.
export function orbitPoint(surface, index, angle, radius = orbitRadius()) {
  const [cx, cz] = surface.singularPositions[index];
  return [cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius];
}

// The yaw that looks radially OUTWARD, along the normal, with the column at the
// player's back.
//
// Facing the column instead would waste the mode: a grey cylinder a hand's
// breadth away fills the middle of the screen and, being a featureless surface
// of revolution, looks identical from every angle — so sweeping round it gives
// no sense of moving at all. Facing outward puts the whole world in view and
// the sweep becomes the thing it is meant to be: standing at the cone point and
// turning, for three full turns.
//
// It also makes the mouse behave normally. Facing the centre, stepping to your
// right turns your head LEFT to keep the column in view; facing outward, body
// and head turn the same way, so the mouse does what a mouse does everywhere
// else. See the sign in _orbit.
//
// The camera looks down -Z at yaw 0, so its forward vector is
// (-sin yaw, -cos yaw), and the outward direction is (cos angle, sin angle).
// Matching the two gives this.
export function orbitYaw(angle) {
  return Math.atan2(-Math.cos(angle), -Math.sin(angle));
}

// Moving -> singularity. Returns { index, angle, position }, or null if the
// player is not close enough to any corner.
//
// The angle comes from the direction the player is ALREADY standing in, so
// entering only slides them along that radius onto the orbit circle - at most
// enterRadius - orbitRadius of movement, and never around the column. Walk up
// to it from the south and you stay south of it.
export function enterSingularity(surface, directions, x, z) {
  // Switched off in config: the player is never taken off their feet, and
  // walking stays walking. The column is still solid — pushOffSingularity
  // below still runs every frame — so the only thing lost is the orbit.
  if (!SINGULARITIES.capture) return null;

  const near = nearestSingularity(surface.singularPositions, x, z);
  if (!near || near.distance > SINGULARITIES.enterRadius) return null;
  return placeOnOrbit(surface, directions, near.index, x, z);
}

// Puts (x, z) on the orbit circle of corner `index`, keeping the direction it
// is already in. Shared by entering the mode and by the solid-column push
// below, so both put the player in exactly the same place.
function placeOnOrbit(surface, directions, index, x, z) {
  const [cx, cz] = surface.singularPositions[index];
  const dx = x - cx;
  const dz = z - cz;

  // Standing exactly on the corner leaves no direction to preserve, so face
  // out along the interior bisector instead.
  const angle = Math.hypot(dx, dz) < 1e-6
    ? Math.atan2(directions[index][1], directions[index][0])
    : Math.atan2(dz, dx);

  return { index, angle, position: orbitPoint(surface, index, angle) };
}

// The column is SOLID. A walking player can never end a frame inside the orbit
// circle; anything that would put them there slides them back out to it, along
// the radius they are already on.
//
// Ordinarily the mode takes over well before this matters — enterRadius is
// outside the orbit circle, so walking up to a column is caught long before
// reaching it. The gap this closes is the moment just after W, when the player
// is standing at the orbit radius and deliberately held un-catchable so that W
// is not undone: without this they could turn around and walk straight into the
// column, and see the inside of it.
export function pushOffSingularity(surface, directions, x, z) {
  const near = nearestSingularity(surface.singularPositions, x, z);
  if (!near || near.distance >= orbitRadius()) return [x, z];
  return placeOnOrbit(surface, directions, near.index, x, z).position;
}

// One step around the orbit, by `delta` radians.
//
// The step is MOVEMENT ACROSS THE SURFACE, not arithmetic on a circle: it goes
// through the same resolveMove() that walking uses, so when the orbit runs off
// the edge of the domain the gluing applies and the player comes back in at the
// partner edge. There they are the same distance from a DIFFERENT corner - the
// translation carries one corner exactly onto the other - so the orbit simply
// continues around that one. This is the whole reason going round once takes
// 6*PI: the circle is assembled out of eight wedges, one per corner.
//
// Re-deriving the angle from the resolved position, and rebuilding the position
// from that angle, also keeps the radius exact. Without it the chord steps would
// eat into the radius and the player would spiral slowly inward.
export function orbitStep(surface, index, angle, delta) {
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / MAX_ORBIT_STEP));
  const piece = delta / steps;

  let at = index;
  let a = angle;
  for (let i = 0; i < steps; i++) {
    const from = orbitPoint(surface, at, a);
    const to = orbitPoint(surface, at, a + piece);
    const moved = resolveMove(surface, from, to, 4, ORBIT_EDGE_CLEARANCE).position;

    const near = nearestSingularity(surface.singularPositions, moved[0], moved[1]);
    const [cx, cz] = surface.singularPositions[near.index];
    at = near.index;
    a = Math.atan2(moved[1] - cz, moved[0] - cx);
  }

  return { index: at, angle: a, position: orbitPoint(surface, at, a) };
}

// Is the player far enough from every corner to be caught by one again?
//
// W leaves them standing at the orbit radius, which is well inside enterRadius,
// so without this they would be caught again on the very next frame and W would
// appear to do nothing at all.
export function clearOfSingularities(surface, x, z) {
  const near = nearestSingularity(surface.singularPositions, x, z);
  return !near || near.distance > SINGULARITIES.exitGraceRadius;
}

export class PlayerController {
  constructor(camera, domElement, surface, {
    eyeHeight = PLAYER.eyeHeight,
    speed = PLAYER.walkSpeed,
    runMultiplier = PLAYER.runMultiplier,
    radius = PLAYER.radius,
    mouseSensitivity = PLAYER.mouseSensitivity,
    obstacles = [],
  } = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.surface = surface;
    this.eyeHeight = eyeHeight;
    this.speed = speed;
    this.runMultiplier = runMultiplier;
    this.obstacles = obstacles; // [{ x, z, radius }], mutated by the O toggle
    this.playerRadius = radius;
    this.mouseSensitivity = mouseSensitivity;

    // 'moving' or 'singularity'. In singularity mode the walk code below is
    // switched off entirely and the mouse drives the player's position around
    // the column instead. See SINGULARITY MODE above.
    this.mode = 'moving';

    // Null, or { index, angle } while orbiting: which of the eight corners is
    // being orbited, and where on its circle the player is. The corners are all
    // the same point of the surface, but not the same place on the map.
    this.singularity = null;
    this._interiorDirections = interiorDirections(surface);

    // Cleared on leaving the cone point, set again once the player is clear of
    // it, so that W cannot be undone by the same column on the next frame.
    this._armed = true;

    // x,z on the ground plane, in the fundamental domain's own coordinates.
    // app.js overwrites this with the configured start position.
    this.position = new THREE.Vector2(0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.locked = false;

    this._onKeyDown = (e) => this.keys.add(e.code);
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.locked) return;

      // Horizontal mouse means two different things in the two modes. Walking,
      // it turns the head. Orbiting, it moves the PLAYER around the column,
      // and the yaw is no longer free — it is whatever looks back at the
      // centre. Vertical mouse is the same either way.
      if (this.mode === 'singularity') {
        // Positive, not negative: facing outward, moving the mouse right has to
        // carry the player round to their right AND turn the view right, which
        // are the same sense. See orbitYaw.
        this._orbit(e.movementX * SINGULARITIES.orbitSensitivity);
      } else {
        this.yaw -= e.movementX * this.mouseSensitivity;
      }

      this.pitch -= e.movementY * this.mouseSensitivity;
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    };
    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.domElement;
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);

    this._syncCamera();
  }

  requestLock() {
    this.domElement.requestPointerLock();
  }

  update(dt) {
    // Orbiting: the mouse owns the player's position, and the only thing left
    // for the keyboard to do is let go. Nothing else in this method runs, which
    // is what stops the walk resolver from dragging the player off the circle
    // at the same time as the mouse is moving them around it.
    if (this.mode === 'singularity') {
      if (this.keys.has('KeyW')) this._exitSingularity();
      this._syncCamera();
      return;
    }

    let moveX = 0, moveZ = 0;
    if (this.keys.has('KeyW')) moveZ -= 1;
    if (this.keys.has('KeyS')) moveZ += 1;
    if (this.keys.has('KeyA')) moveX -= 1;
    if (this.keys.has('KeyD')) moveX += 1;

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.hypot(moveX, moveZ);
      moveX /= len;
      moveZ /= len;

      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      // Camera looks down -Z at yaw=0; forward/right in world XZ:
      const forwardX = -sinY, forwardZ = -cosY;
      const rightX = cosY, rightZ = -sinY;

      const speed = this.speed * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? this.runMultiplier : 1);
      const dx = (rightX * moveX + forwardX * -moveZ) * speed * dt;
      const dz = (rightZ * moveX + forwardZ * -moveZ) * speed * dt;

      const start = [this.position.x, this.position.y];
      const end = [this.position.x + dx, this.position.y + dz];
      const [nx, nz] = resolveStep(
        this.surface, start, end, this.obstacles, this.playerRadius
      );

      this.position.set(nx, nz);
    }

    // Run every frame rather than only after a step: where the player is
    // relative to the cone point is a question about position, and it has to be
    // answered on the frame they spawn as well as on the frames they walk.
    if (!this._armed) {
      this._armed = clearOfSingularities(this.surface, this.position.x, this.position.y);
    } else {
      const entered = enterSingularity(
        this.surface, this._interiorDirections, this.position.x, this.position.y
      );
      if (entered) {
        this.mode = 'singularity';
        this.singularity = { index: entered.index, angle: entered.angle };
        this.position.set(entered.position[0], entered.position[1]);
        this.yaw = orbitYaw(entered.angle);
      }
    }

    // Last word, whatever happened above: never inside a column.
    if (this.mode === 'moving') {
      const clear = pushOffSingularity(
        this.surface, this._interiorDirections, this.position.x, this.position.y
      );
      this.position.set(clear[0], clear[1]);
    }

    this._syncCamera();
  }

  // Mouse-driven movement around the column. The position comes back from the
  // surface rather than from trigonometry alone — see orbitStep.
  _orbit(delta) {
    const next = orbitStep(this.surface, this.singularity.index, this.singularity.angle, delta);
    this.singularity = { index: next.index, angle: next.angle };
    this.position.set(next.position[0], next.position[1]);
    this.yaw = orbitYaw(next.angle);
  }

  // W. The player keeps exactly the position and the view they had and starts
  // walking from there — and since the view faces outward, holding W simply
  // carries them away from the column, which is what the key is for.
  _exitSingularity() {
    this.mode = 'moving';
    this.singularity = null;
    this._armed = false;
  }

  _syncCamera() {
    this.camera.position.set(this.position.x, this.eyeHeight, this.position.y);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
