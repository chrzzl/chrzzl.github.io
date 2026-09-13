// ============================================================================
// SURFACE TRAVERSAL
// ============================================================================
//
// The topology half of the ray tracer, with no three.js and no rendering.
//
//   surfaceUniforms(surface) — flattens the surface into the arrays the
//     fragment shader consumes as uniforms.
//
//   traceMirror(...) — a line-for-line JS mirror of the shader's traversal
//     loop. It exists so the GPU traversal can be validated on the CPU, against
//     the independent tracer in referenceTracer.js, without a GPU readback.
//     See traversal.selfcheck.mjs (`npm run check`).
//
// The mirror deliberately does NOT copy referenceTracer.js's implementation
// (finite far-segment plus a point-in-polygon nudge search): those are exactly
// the parts that cannot be ported to a fragment shader. It uses the infinite
// ray / no-nudge formulation the shader uses, and the self-check asserts the
// two agree anyway on the crossing sequence.

// After a crossing the ray sits exactly ON the partner edge, so that
// edge would otherwise be re-detected at t ~ 0 every iteration. The
// obvious fix — reject t below some epsilon — makes the epsilon a
// blind spot: a genuine next-crossing closer than it (which is exactly
// what happens when a crossing lands near a cone point, where the
// adjacent edge is only microns away) is swallowed, and the ray
// escapes. Measured at 1e-3 against traceSurfaceRay: 17 rays in 20000.
//
// So the traversal excludes the partner edge BY INDEX instead, and this
// epsilon only has to reject exactly-backward hits. That exclusion is
// exact rather than approximate: a straight ray starting on a straight
// segment meets that segment's line only at t = 0, so a legitimate
// second crossing of the same edge cannot exist.
export const CROSS_EPS = 1e-7;

// Flat arrays sized for the shader's fixed 8-edge loops. Deliberately
// not generalized past the L-shape's octagon — the shader's loop bounds
// are compile-time constants, so a different polygon means editing both
// files anyway.
export function surfaceUniforms(surface) {
  const n = surface.vertices.length;
  if (n !== 8) {
    throw new Error(`traversal: shader is hard-coded for an 8-edge surface, got ${n}`);
  }

  const verts = new Float32Array(n * 2);
  const edgeTrans = new Float32Array(n * 2);

  for (let i = 0; i < n; i++) {
    verts[i * 2] = surface.vertices[i][0];
    verts[i * 2 + 1] = surface.vertices[i][1];
    const [tx, tz] = surface.edgeInfo[i].translation;
    edgeTrans[i * 2] = tx;
    edgeTrans[i * 2 + 1] = tz;
  }

  return { edgeCount: n, verts, edgeTrans };
}

// Intersection of the infinite 2D ray p + t*d with the segment a->b.
// Returns t > CROSS_EPS, or -1 when there is no forward hit. Same
// accept/reject semantics as geometry.js segmentIntersect, except the
// ray is infinite (no far endpoint) so `t` is an absolute distance in
// units of |d| rather than a fraction of a far-segment.
//
// The u tolerance is deliberately generous relative to CROSS_EPS: a
// crossing that lands a hair outside the [0,1] span of the correct edge
// (float32 noise at a shared corner) should still be accepted rather
// than leave the ray with nothing ahead of it.
function rayEdge(px, pz, dx, dz, ax, az, bx, bz) {
  const ex = bx - ax;
  const ez = bz - az;
  const denom = dx * ez - dz * ex;
  if (Math.abs(denom) < 1e-12) return -1;
  const apx = ax - px;
  const apz = az - pz;
  const t = (apx * ez - apz * ex) / denom;
  const u = (apx * dz - apz * dx) / denom;
  if (t <= CROSS_EPS || u < -1e-6 || u > 1 + 1e-6) return -1;
  return t;
}

// Mirror of the shader's traversal loop, in the XZ plane.
//
// `direction` is NOT normalized internally: the shader passes the XZ
// projection of a 3D ray direction, so `t` values stay in 3D-ray
// parameter units and can be compared directly against 3D geometry
// hits. Pass a normalized direction to get plain 2D distances.
//
// Returns { crossings, translation, crossedEdges, position, escaped }.
// `position` is in the final copy's LOCAL coordinates (add
// `translation` for the unfolded-plane position), matching
// traceSurfaceRay's convention.
export function traceMirror(surface, origin, direction, maxCrossings) {
  const { vertices, edgeInfo } = surface;
  const n = vertices.length;

  let px = origin[0];
  let pz = origin[1];
  const dx = direction[0];
  const dz = direction[1];

  let tx = 0;
  let tz = 0;
  const crossedEdges = [];

  // Index of the edge the ray is currently sitting on (the partner of
  // the edge just crossed); -1 on the first hop, where the origin is a
  // genuine interior point.
  let standingOn = -1;

  for (let hop = 0; hop < maxCrossings; hop++) {
    let bestT = Infinity;
    let bestEdge = -1;

    for (let i = 0; i < n; i++) {
      if (i === standingOn) continue;
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const t = rayEdge(px, pz, dx, dz, a[0], a[1], b[0], b[1]);
      if (t > 0 && t < bestT) {
        bestT = t;
        bestEdge = i;
      }
    }

    if (bestEdge < 0) {
      return { crossings: hop, translation: [tx, tz], crossedEdges, position: [px, pz], escaped: true };
    }

    const [ex, ez] = edgeInfo[bestEdge].translation;

    // Land exactly on the partner edge — no nudge into the interior.
    // The next iteration skips that edge by index (see `standingOn`),
    // so nothing has to be pushed off the boundary to stay unambiguous.
    // This is what makes the traversal cheap and branch-free enough to
    // run per-pixel; traceSurfaceRay's pointInPolygon nudge-candidate
    // search has no fragment-shader equivalent.
    px = px + dx * bestT + ex;
    pz = pz + dz * bestT + ez;
    tx += ex;
    tz += ez;
    crossedEdges.push(bestEdge);
    standingOn = edgeInfo[bestEdge].other;
  }

  return { crossings: maxCrossings, translation: [tx, tz], crossedEdges, position: [px, pz], escaped: false };
}
