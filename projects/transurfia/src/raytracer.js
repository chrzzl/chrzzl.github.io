import * as THREE from 'three';

import {
  WORLD, COLORS, SKY, FOG, LIGHTING, RENDER, SINGULARITIES, SCULPTURES, TEXTURES,
  rgb, rgbLinear, sculpturePosition, sculpturesVisible,
} from './config.js';
import { surfaceUniforms } from './traversal.js';

// ============================================================================
// GPU RAY TRACER
// ============================================================================
//
// The whole world is drawn by ONE fullscreen quad. There is no scene graph, no
// portal geometry and no render targets: the fragment shader builds a camera
// ray per pixel and walks it through the translation surface analytically.
//
// Each step of that walk asks two questions:
//
//   1. How far along this ray does it leave the fundamental domain?
//   2. Does any geometry (floor, singularity column) come before that?
//
// If geometry is closer, shade it and stop. Otherwise cross the boundary,
// add that edge's pure XZ translation, keep the direction exactly as it was,
// and repeat — at most WORLD.maxCrossings times, then return sky.
//
// Every intersection is a closed-form solve (segment, plane, quadric). There is
// no SDF and no ray marching anywhere.
//
// The traversal below is the GLSL transcription of traceMirror() in
// traversal.js, which is checked against an independent CPU tracer in
// traversal.selfcheck.mjs. If you change the loop here, change traceMirror()
// the same way and re-run `npm run check`.

export const DEBUG_MODES = [
  'normal',
  'crossing count',
  'tile ID',
  'translation X',
  'translation Z',
  'last edge ID',
];

const vertexShader = /* glsl */ `
  // The quad is already in clip space, so no camera transform is applied here.
  // Camera rays are constructed per-pixel in the fragment shader instead.
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  // Number of boundary edges of the fundamental domain. The L-shape is an
  // octagon; this is fixed rather than general because GLSL loop bounds must be
  // compile-time constants.
  #define EDGE_COUNT 8

  // MAX_CROSSINGS is injected from WORLD.maxCrossings via ShaderMaterial's
  // defines, for the same reason.

  uniform vec2  uResolution;

  // Camera basis and lens. The ray origin is in the fundamental domain's own
  // coordinates; the basis vectors are world-space and never change with it.
  uniform vec3  uCamPos;
  uniform vec3  uCamRight;
  uniform vec3  uCamUp;
  uniform vec3  uCamFwd;
  uniform float uTanHalfFov;
  uniform float uAspect;

  // Closed ring of the polygon's corners: uVerts[EDGE_COUNT] repeats
  // uVerts[0], so edge i runs uVerts[i] -> uVerts[i+1] and both indices stay
  // "constant index expressions". GLSL ES 1.00 cannot index a uniform array by
  // an arbitrary int and has no integer % operator, so the usual (i+1) % n is
  // unavailable.
  uniform vec2  uVerts[EDGE_COUNT + 1];

  // Per edge: .xy = the pure XZ translation applied when crossing it,
  //           .z  = index of its glued partner edge, stored as a float so this
  //                 stays one array instead of two.
  uniform vec3  uEdgeData[EDGE_COUNT];

  uniform float uTileSize;
  uniform float uCylRadius;    // 0 removes the singularity columns entirely
  uniform float uCylHeight;

  // One texture per tile. UVs are derived analytically from the unfolded hit
  // position (see tileUV), so there are no UV attributes and no geometry.
  // Uploaded as sRGB, which means these fetches return LINEAR values.
  uniform sampler2D uTileTex0;
  uniform sampler2D uTileTex1;
  uniform sampler2D uTileTex2;

  // Linear-light, to mix correctly with the decoded texture samples above.
  uniform vec3  uSkyHorizonLinear;
  uniform vec3  uSkyZenithLinear;
  uniform float uSkyExponent;
  uniform float uFogDistance;      // 0 disables fog
  uniform float uFogFalloff;       // higher = clearer near the camera
  uniform vec3  uCylLinear;
  uniform vec3  uLightDir;
  uniform float uAmbient;

  // Display (sRGB) values, used only by the tile-ID debug view, which is
  // written to the framebuffer verbatim.
  uniform vec3  uDebugTile0;
  uniform vec3  uDebugTile1;
  uniform vec3  uDebugTile2;

  // Sculptures: two fixed objects standing on the floor. There are no meshes in
  // this renderer, so the chair is a handful of axis-aligned boxes and the table
  // is a stack of truncated cones — the same closed-form intersections as the
  // rest of the world.
  uniform float uSculptures;       // 0 hides them
  uniform vec2  uChairPos;
  uniform float uChairHeight;
  uniform vec3  uChairLinear;
  uniform vec2  uTablePos;
  uniform float uTableHeight;
  uniform vec3  uTableLinear;

  uniform float uShowGrid;
  uniform float uGridWidth;
  uniform float uGridDarkness;

  uniform int   uDebugMode;

  // Only has to reject exactly-backward hits. The edge the ray stands on after
  // a crossing is excluded by INDEX rather than by distance — see the
  // standingOn comment in the traversal loop for why that matters.
  const float CROSS_EPS = 1e-7;
  const float FAR = 1e20;

  #define KIND_NONE 0
  #define KIND_FLOOR 1
  #define KIND_CYLINDER 2
  #define KIND_SCULPTURE 3

  // Infinite 2D ray p + t*d against the segment a->b. Returns t, or -1.0 when
  // there is no forward hit.
  //
  // d is the XZ projection of the normalised 3D direction and is deliberately
  // NOT re-normalised, so t comes back in the same units as the 3D geometry
  // hits and the two are directly comparable.
  float rayEdge(vec2 p, vec2 d, vec2 a, vec2 b) {
    vec2 e = b - a;
    float denom = d.x * e.y - d.y * e.x;
    if (abs(denom) < 1e-12) return -1.0;          // ray is parallel to the edge
    vec2 ap = a - p;
    float t = (ap.x * e.y - ap.y * e.x) / denom;
    float u = (ap.x * d.y - ap.y * d.x) / denom;  // position along the edge
    if (t <= CROSS_EPS || u < -1e-6 || u > 1.000001) return -1.0;
    return t;
  }

  // Which of the three tiles a point of the fundamental domain lies in.
  // With +Z downward (see surface.js) the L is
  //   tile 0 = [0,s] x [0,s]    top-left
  //   tile 1 = [0,s] x [s,2s]   bottom-left
  //   tile 2 = [s,2s] x [s,2s]  bottom-right
  // so z < s already implies tile 0 and needs no x test.
  int tileAt(vec2 p) {
    if (p.y < uTileSize) return 0;
    return p.x < uTileSize ? 1 : 2;
  }

  // 1/v, but never dividing by zero. The slab test below relies on infinities
  // behaving sensibly for a ray exactly parallel to an axis; what it cannot
  // survive is 0 * inf, which is NaN.
  float safeInv(float v) {
    return 1.0 / (abs(v) < 1e-8 ? (v < 0.0 ? -1e-8 : 1e-8) : v);
  }

  // Ray against an axis-aligned box, by the slab method. Updates tBest/nBest
  // and returns whether it did.
  bool hitBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, float tMax,
              inout float tBest, inout vec3 nBest) {
    vec3 inv = vec3(safeInv(rd.x), safeInv(rd.y), safeInv(rd.z));
    vec3 ta = (bmin - ro) * inv;
    vec3 tb = (bmax - ro) * inv;
    vec3 lo = min(ta, tb);
    vec3 hi = max(ta, tb);
    float tNear = max(max(lo.x, lo.y), lo.z);
    float tFar = min(min(hi.x, hi.y), hi.z);
    if (tFar < tNear) return false;

    float t = tNear > CROSS_EPS ? tNear : tFar;   // tFar when the ray starts inside
    if (t <= CROSS_EPS || t >= tMax || t >= tBest) return false;

    tBest = t;
    // The entry face is whichever slab produced the largest near distance.
    nBest = -sign(rd) * step(lo.yzx, lo.xyz) * step(lo.zxy, lo.xyz);
    return true;
  }

  // Ray against a truncated cone with a vertical axis at c, running from radius
  // r0 at height y0 to r1 at y1: the lateral surface plus both end discs.
  //
  // Substituting the ray into (x^2 + z^2) = r(y)^2, with r linear in y, stays
  // quadratic in t, so this is still a closed-form solve — no marching.
  bool hitFrustum(vec3 ro, vec3 rd, vec2 c, float y0, float r0, float y1, float r1,
                  float tMax, inout float tBest, inout vec3 nBest) {
    vec2 oc = ro.xz - c;
    float k = (r1 - r0) / max(y1 - y0, 1e-6);   // radius change per unit height
    float R0 = r0 + k * (ro.y - y0);            // radius at the ray's own origin
    float K = k * rd.y;

    float A = dot(rd.xz, rd.xz) - K * K;
    float B = dot(oc, rd.xz) - R0 * K;
    float C = dot(oc, oc) - R0 * R0;

    float ta = FAR, tb = FAR;
    if (abs(A) < 1e-9) {
      // Ray parallel to the cone's surface: one root, not two.
      if (abs(B) > 1e-12) ta = -0.5 * C / B;
    } else {
      float disc = B * B - A * C;
      if (disc >= 0.0) {
        float sq = sqrt(disc);
        float u0 = (-B - sq) / A;
        float u1 = (-B + sq) / A;
        // A can be negative, which flips the order, so sort rather than assume.
        ta = min(u0, u1);
        tb = max(u0, u1);
      }
    }

    bool got = false;
    for (int i = 0; i < 2; i++) {
      float t = (i == 0) ? ta : tb;
      if (t >= FAR) continue;
      if (t <= CROSS_EPS || t >= tMax || t >= tBest) continue;
      float y = ro.y + t * rd.y;
      if (y < y0 || y > y1) continue;
      float r = r0 + k * (y - y0);
      if (r <= 0.0) continue;
      vec2 q = oc + t * rd.xz;
      tBest = t;
      // Gradient of (q.q - r(y)^2): outward in XZ, tilted by the cone's slope.
      nBest = normalize(vec3(q.x, -r * k, q.y));
      got = true;
      break;                                     // ta <= tb, so the first is nearest
    }

    // End discs. Between stacked segments these coincide exactly and are
    // sealed inside the solid, so they are never actually seen.
    if (abs(rd.y) > 1e-9) {
      for (int e = 0; e < 2; e++) {
        float yc = (e == 0) ? y0 : y1;
        float rc = (e == 0) ? r0 : r1;
        float t = (yc - ro.y) / rd.y;
        if (t <= CROSS_EPS || t >= tMax || t >= tBest) continue;
        vec2 q = oc + t * rd.xz;
        if (dot(q, q) > rc * rc) continue;
        tBest = t;
        nBest = vec3(0.0, (e == 0) ? -1.0 : 1.0, 0.0);
        got = true;
      }
    }
    return got;
  }

  // Cheap reject: if the ray misses this sphere, or the sphere is entirely
  // behind the current best hit, the whole object can be skipped. One quadratic
  // instead of a dozen intersections, for every ray that is not looking at it.
  bool boundsMiss(vec3 ro, vec3 rd, vec3 centre, float radius, float tMax, float tBest) {
    vec3 oc = ro - centre;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - radius * radius;
    float disc = b * b - c;
    if (disc < 0.0) return true;
    float sq = sqrt(disc);
    if (-b + sq <= CROSS_EPS) return true;          // sphere is behind the ray
    float tEnter = -b - sq;
    return tEnter >= tMax || tEnter >= tBest;       // negative means we are inside it
  }

  // The round table, as five truncated cones given explicitly as
  // (y0, r0, y1, r1) — all fractions of its overall height.
  //
  // Given as whole segments rather than a list of control points because the
  // profile is deliberately DISCONTINUOUS: the top starts at radius 0.46 where
  // the pedestal below it ends at 0.16. That step is the overhang, and
  // hitFrustum's end discs draw it as the underside of the tabletop, which is
  // what makes it read as a table rather than a mushroom.
  //
  // An if-chain because GLSL ES 1.00 cannot index an array with a runtime int.
  vec4 tableSegment(int i) {
    if (i == 0) return vec4(0.00, 0.300, 0.04, 0.280);   // foot
    if (i == 1) return vec4(0.04, 0.280, 0.10, 0.075);   // taper into the pedestal
    if (i == 2) return vec4(0.10, 0.075, 0.88, 0.065);   // pedestal
    if (i == 3) return vec4(0.88, 0.065, 0.93, 0.160);   // flare beneath the top
    return vec4(0.93, 0.460, 1.00, 0.460);               // the round top
  }

  // Nearest geometry hit strictly before tMax, the distance at which the ray
  // leaves the fundamental domain.
  //
  // That clip is what keeps each copy drawing only its own share of the world:
  // anything beyond tMax belongs to the next copy and will be found there,
  // after the translation is applied. It also means no point-in-polygon test is
  // needed — a hit closer than tMax is inside the domain by construction.
  void traceGeometry(vec3 ro, vec3 rd, float tMax, out float tBest, out vec3 nBest,
                     out int kind, out vec3 albedo) {
    tBest = FAR;
    nBest = vec3(0.0, 1.0, 0.0);
    kind = KIND_NONE;
    albedo = vec3(0.0);            // unused for the floor, which is textured

    // ---- floor: the y = 0 plane ----
    if (rd.y < -1e-9) {
      float t = -ro.y / rd.y;
      if (t > CROSS_EPS && t < tMax) {
        tBest = t;
        nBest = vec3(0.0, 1.0, 0.0);
        kind = KIND_FLOOR;
      }
    }

    // ---- singularity columns: one per corner of the domain ----
    //
    // All eight corners are the same cone point, so these are eight wedges of
    // a single column. Each copy shows only the part falling inside the domain
    // (the tMax clip does that for free) and the rest arrives through portal
    // crossings.
    for (int i = 0; i < EDGE_COUNT; i++) {
      vec2 oc = ro.xz - uVerts[i];
      float a = dot(rd.xz, rd.xz);
      if (a < 1e-12) continue;                 // vertical ray: misses the side
      float b = dot(oc, rd.xz);
      float c = dot(oc, oc) - uCylRadius * uCylRadius;
      float disc = b * b - a * c;
      if (disc <= 0.0) continue;
      float sq = sqrt(disc);

      // Near root first, then the far one so the inside of a column still
      // shades rather than showing through.
      for (int r = 0; r < 2; r++) {
        float t = (r == 0) ? (-b - sq) / a : (-b + sq) / a;
        if (t <= CROSS_EPS || t >= tMax || t >= tBest) continue;
        float y = ro.y + t * rd.y;
        if (y < 0.0 || y > uCylHeight) continue;
        vec2 q = oc + t * rd.xz;
        tBest = t;
        nBest = normalize(vec3(q.x, 0.0, q.y));
        kind = KIND_CYLINDER;
        break;
      }

      // Top cap. There is no bottom cap: it is coplanar with the floor and can
      // never be seen from above it.
      if (rd.y < -1e-9) {
        float t = (uCylHeight - ro.y) / rd.y;
        if (t > CROSS_EPS && t < tMax && t < tBest) {
          vec2 q = oc + t * rd.xz;
          if (dot(q, q) <= uCylRadius * uCylRadius) {
            tBest = t;
            nBest = vec3(0.0, 1.0, 0.0);
            kind = KIND_CYLINDER;
          }
        }
      }
    }
    if (kind == KIND_CYLINDER) albedo = uCylLinear;

    if (uSculptures < 0.5) return;

    // ---- the round table: a stack of truncated cones ----
    //
    // Tested before the chair, so that if both are in front of the ray the
    // chair's nearer hit simply overwrites this one.
    float th = uTableHeight;
    if (!boundsMiss(ro, rd, vec3(uTablePos.x, 0.5 * th, uTablePos.y), 0.72 * th, tMax, tBest)) {
      bool tableHit = false;
      for (int i = 0; i < 5; i++) {
        vec4 seg = tableSegment(i);
        if (hitFrustum(ro, rd, uTablePos, seg.x * th, seg.y * th, seg.z * th, seg.w * th,
                       tMax, tBest, nBest)) {
          tableHit = true;
        }
      }
      if (tableHit) {
        kind = KIND_SCULPTURE;
        albedo = uTableLinear;
      }
    }

    // ---- the chair: six axis-aligned boxes ----
    float ch = uChairHeight;
    if (!boundsMiss(ro, rd, vec3(uChairPos.x, 0.5 * ch, uChairPos.y), 0.70 * ch, tMax, tBest)) {
      float halfSeat = 0.240 * ch;  // half the seat's footprint ('half' is reserved in GLSL)
      float seatY0 = 0.400 * ch;
      float seatY1 = 0.460 * ch;
      float legR = 0.045 * ch;
      float legOff = 0.185 * ch;
      float backZ = -0.190 * ch;   // the backrest sits along -Z
      float backT = 0.050 * ch;

      bool chairHit = false;

      // Four legs.
      for (int i = 0; i < 4; i++) {
        float sx = (i == 0 || i == 1) ? -1.0 : 1.0;
        float sz = (i == 0 || i == 2) ? -1.0 : 1.0;
        vec2 p = uChairPos + vec2(sx * legOff, sz * legOff);
        if (hitBox(ro, rd, vec3(p.x - legR, 0.0, p.y - legR),
                           vec3(p.x + legR, seatY0, p.y + legR), tMax, tBest, nBest)) {
          chairHit = true;
        }
      }

      // Seat.
      if (hitBox(ro, rd, vec3(uChairPos.x - halfSeat, seatY0, uChairPos.y - halfSeat),
                         vec3(uChairPos.x + halfSeat, seatY1, uChairPos.y + halfSeat),
                 tMax, tBest, nBest)) {
        chairHit = true;
      }

      // Backrest.
      if (hitBox(ro, rd, vec3(uChairPos.x - halfSeat, seatY1, uChairPos.y + backZ - backT),
                         vec3(uChairPos.x + halfSeat, ch, uChairPos.y + backZ + backT),
                 tMax, tBest, nBest)) {
        chairHit = true;
      }

      if (chairHit) {
        kind = KIND_SCULPTURE;
        albedo = uChairLinear;
      }
    }
  }

  // Analytic tile UVs — no UV attributes, no geometry, nothing interpolated.
  //
  // Deliberately NOT wrapped with fract(): the caller passes the UNFOLDED hit
  // position, and wrapping is left to the sampler's REPEAT mode. That ordering
  // is the whole point. A fragment shader's mip level is chosen from
  // screen-space derivatives, which the GPU obtains by differencing the UVs of
  // neighbouring pixels in a 2x2 quad; any wrap applied here would be a
  // discontinuity in that difference. Wrapping inside the sampler happens
  // AFTER the derivative is taken, so the mip level stays correct.
  //
  // V is flipped because three.js uploads images with flipY, which puts the
  // image's TOP row at v = 1; meanwhile world +Z runs "downward" across the
  // floor when seen from above. Without the flip each tile would appear
  // mirrored north-to-south. Expressed as (s - z)/s rather than 1 - fract(z/s)
  // so it stays continuous, and the two agree modulo 1.
  vec2 tileUV(vec2 p) {
    return vec2(p.x, uTileSize - p.y) / uTileSize;
  }

  // All three tiles are fetched and then selected, rather than branching to one
  // fetch. Texture LOD comes from screen-space derivatives, which are only
  // meaningful when every pixel of a quad performs the fetch; branching per
  // pixel makes the mip choice undefined right where tiles meet.
  vec3 tileTexel(int tileId, vec2 uv) {
    vec3 c0 = texture2D(uTileTex0, uv).rgb;
    vec3 c1 = texture2D(uTileTex1, uv).rgb;
    vec3 c2 = texture2D(uTileTex2, uv).rgb;
    return tileId == 0 ? c0 : (tileId == 1 ? c1 : c2);
  }

  // Exact sRGB encode. A raw ShaderMaterial never receives three.js's own
  // output-colour-space conversion, so the linear->display step has to happen
  // here. Using the precise piecewise curve (not a 2.2 power) means an unlit
  // colour round-trips back to exactly the hex value in config.js.
  vec3 linearToSRGB(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }

  // Vertical sky gradient, evaluated straight from the ray direction — there is
  // no sky dome and no geometry, only a different answer for rays that hit
  // nothing.
  //
  // rd.y runs 0 at the horizon to 1 at the zenith. It is clamped at 0 because
  // a ray can finish below the horizon and still miss everything: a shallow
  // downward ray can spend its whole crossing budget before reaching the floor.
  // Those belong at the horizon colour, which is where clamping puts them.
  vec3 skyColor(vec3 rd) {
    float t = pow(max(rd.y, 0.0), uSkyExponent);
    return mix(uSkyHorizonLinear, uSkyZenithLinear, t);
  }

  // How much of the sky has taken over at distance d. An exponential of a
  // power of the distance, so it starts imperceptibly and has no visible onset
  // edge the way a linear start/end fog does.
  //
  // uFogFalloff is what keeps the near field clear: the higher it is, the
  // longer the curve stays flat near the camera before turning up. The far
  // field is unaffected either way, because the exponential has saturated
  // there regardless of the exponent.
  float fogFactor(float d) {
    if (uFogDistance <= 0.0) return 0.0;
    float x = d / uFogDistance;
    return 1.0 - exp(-pow(x, uFogFalloff));
  }

  // Thin darker seam along tile boundaries. Not a texture — an analytic
  // distance-to-nearest-multiple-of-tileSize, widened with distance so it stays
  // roughly a pixel wide instead of aliasing into noise.
  float gridSeam(vec2 p, float t) {
    if (uShowGrid < 0.5) return 0.0;
    vec2 f = abs(fract(p / uTileSize + 0.5) - 0.5) * uTileSize;
    float d = min(f.x, f.y);
    float w = max(uGridWidth, t * 0.004);
    return 1.0 - smoothstep(w * 0.5, w, d);
  }

  // Eight well-separated hues for the last-edge debug view. An if-chain because
  // GLSL ES 1.00 cannot index an array with a runtime int.
  vec3 debugColorForEdge(int edge) {
    if (edge < 0) return vec3(0.0);
    if (edge == 0) return vec3(1.00, 0.20, 0.20);
    if (edge == 1) return vec3(1.00, 0.60, 0.10);
    if (edge == 2) return vec3(0.95, 0.95, 0.15);
    if (edge == 3) return vec3(0.30, 0.90, 0.25);
    if (edge == 4) return vec3(0.15, 0.85, 0.85);
    if (edge == 5) return vec3(0.25, 0.45, 1.00);
    if (edge == 6) return vec3(0.65, 0.30, 0.95);
    return vec3(1.00, 0.35, 0.80);
  }

  // Signed ramp for the translation-component debug views. Translations on this
  // surface are always multiples of the tile size, so the steps land on
  // discrete readable shades: negative red, positive green, zero near-black.
  vec3 debugColorForTranslation(float v) {
    float n = clamp(v / (float(MAX_CROSSINGS) * uTileSize), -1.0, 1.0);
    float m = 0.15 + 0.85 * abs(n);
    if (n < 0.0) return vec3(m, 0.05, 0.05);
    if (n > 0.0) return vec3(0.05, m, 0.05);
    return vec3(0.08);
  }

  void main() {
    vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
    vec3 rd = normalize(
      uCamFwd +
      uCamRight * (ndc.x * uAspect * uTanHalfFov) +
      uCamUp * (ndc.y * uTanHalfFov)
    );
    vec3 ro = uCamPos;

    // Traversal state. All of it also feeds the debug views.
    vec2 cumTranslation = vec2(0.0);
    int crossings = 0;
    int lastEdge = -1;
    int standingOn = -1;   // edge the ray sits on; -1 at the camera itself

    // What the ray finally hit. Shading is deliberately deferred until AFTER
    // the loop: the texture fetch must sit in straight-line code so its mip
    // level is well defined (see tileTexel).
    // Distance travelled from the camera, summed across every copy the ray
    // passes through. Each hop's own t is measured from that copy's entry
    // point, so it has to be accumulated: fog needs the distance the light
    // actually travelled, not how far into the last tile it got.
    float travelled = 0.0;

    bool hit = false;
    int hitKind = KIND_NONE;
    vec3 hitAlbedo = vec3(0.0);
    vec2 hitXZ = vec2(0.0);
    float hitDist = 0.0;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    int tileId = -1;

    // One more ray segment than crossings.
    for (int hop = 0; hop <= MAX_CROSSINGS; hop++) {

      // ---- 0. Can anything still be hit? ----
      //
      // The floor is at y = 0 and the columns stop at uCylHeight, so a ray that
      // is already above the columns and still climbing has nothing left to
      // reach, however many more copies it crosses. It is sky; say so now.
      //
      // This is worth far more than it looks. Roughly half of a level frame is
      // sky, and without this every one of those pixels grinds through the
      // whole crossing budget doing boundary intersections whose results are
      // then thrown away. It is what makes raising WORLD.maxCrossings
      // affordable, since the extra depth then only costs the pixels that can
      // actually use it.
      if (rd.y > 0.0 && ro.y >= uCylHeight) break;

      // ---- 1. Where does the ray leave the fundamental domain? ----
      float tBound = FAR;
      int bestEdge = -1;
      vec2 bestTrans = vec2(0.0);
      int bestPartner = -1;

      for (int i = 0; i < EDGE_COUNT; i++) {
        // Skip the edge the ray is standing on. After a crossing the ray sits
        // exactly ON the partner edge, which would otherwise be re-detected at
        // t ~ 0 forever. Rejecting by index rather than by a distance epsilon
        // is EXACT — a straight ray starting on a straight segment meets that
        // segment only at t = 0 — and leaves no blind spot near the corners,
        // where the true next crossing can be microns away.
        if (i == standingOn) continue;

        float t = rayEdge(ro.xz, rd.xz, uVerts[i], uVerts[i + 1]);
        if (t > 0.0 && t < tBound) {
          tBound = t;
          bestEdge = i;
          bestTrans = uEdgeData[i].xy;
          bestPartner = int(uEdgeData[i].z);
        }
      }

      // ---- 2. Does geometry inside this copy come first? ----
      float tg;
      vec3 ng;
      int kind;
      vec3 alb;
      traceGeometry(ro, rd, tBound, tg, ng, kind, alb);

      if (kind != KIND_NONE) {
        hit = true;
        hitKind = kind;
        hitAlbedo = alb;
        normal = ng;
        hitDist = travelled + tg;
        hitXZ = ro.xz + rd.xz * tg;
        tileId = tileAt(hitXZ);
        break;
      }

      // ---- 3. Nothing hit. Either the crossing budget is spent, or no
      //         boundary was found at all (the ray went exactly through the
      //         cone point — measure-zero, and degenerate for any tracer).
      //         Both fall through to sky.
      if (bestEdge < 0) break;
      if (hop == MAX_CROSSINGS) break;

      // ---- 4. Cross: advance to the boundary and apply the pure XZ
      //         translation. The direction is untouched — that is exactly what
      //         makes this a TRANSLATION surface.
      travelled += tBound;
      ro += rd * tBound;
      ro.xz += bestTrans;
      cumTranslation += bestTrans;
      lastEdge = bestEdge;
      standingOn = bestPartner;
      crossings++;
    }

    // The UNFOLDED hit position: where this ray landed in the flat plane the
    // surface unrolls onto, rather than where it landed inside the fundamental
    // domain. The traversal keeps local coordinates by ADDING each crossed
    // edge's translation (ro.xz += bestTrans, cumTranslation += bestTrans), so
    // undoing that is a subtraction.
    //
    // This is what fixes texturing across a portal. hitXZ JUMPS by a whole
    // gluing translation between two neighbouring pixels that landed in
    // different copies, so differencing it gives a huge bogus derivative and
    // the GPU drops to a near-1x1 mip — a bright washed line one quad wide,
    // right along the seam. The unfolded position has no such jump: the ray is
    // a straight line in the unfolded plane, so its floor hit moves smoothly
    // as the pixel moves.
    //
    // The sampled texel is unchanged, because every gluing translation on this
    // surface is an exact multiple of uTileSize (asserted in createRayTracer),
    // so the two positions agree modulo one tile — modulo exactly what the
    // sampler's REPEAT mode discards.
    vec2 unfoldedXZ = hitXZ - cumTranslation;

    // Sampled unconditionally, in straight-line code, so every pixel of every
    // 2x2 quad performs the fetch and the derived mip level is meaningful. The
    // result is discarded for sky and column pixels.
    vec3 floorTexel = tileTexel(tileId, tileUV(unfoldedXZ));

    // Debug views are diagnostics, not photographs. They are written to the
    // framebuffer verbatim — no lighting, no colour management — so a pixel can
    // be read back and compared against an exact expected value (verify.js
    // does exactly that).
    if (uDebugMode > 0) {
      vec3 dbg = vec3(0.0);
      if (uDebugMode == 1) {
        dbg = vec3(float(crossings) / float(MAX_CROSSINGS));
      } else if (uDebugMode == 2) {
        dbg = tileId == 0 ? uDebugTile0 : (tileId == 1 ? uDebugTile1 : (tileId == 2 ? uDebugTile2 : vec3(0.0)));
      } else if (uDebugMode == 3) {
        dbg = debugColorForTranslation(cumTranslation.x);
      } else if (uDebugMode == 4) {
        dbg = debugColorForTranslation(cumTranslation.y);
      } else if (uDebugMode == 5) {
        dbg = debugColorForEdge(lastEdge);
      }
      gl_FragColor = vec4(dbg, 1.0);
      return;
    }

    // ---- normal rendering, computed in linear light ----
    vec3 linear;

    if (!hit) {
      linear = skyColor(rd);
    } else {
      // Only the floor is textured; everything else carries its own colour out
      // of traceGeometry.
      vec3 base = hitKind == KIND_FLOOR
        ? mix(floorTexel, floorTexel * uGridDarkness, gridSeam(hitXZ, hitDist))
        : hitAlbedo;
      // One diffuse term over a flat ambient floor. No shadows, no attenuation
      // — nothing that could hide a traversal mistake behind nice shading.
      float lambert = max(dot(normal, uLightDir), 0.0);
      linear = base * (uAmbient + (1.0 - uAmbient) * lambert);

      // Fade toward the sky THIS RAY would have shown, not a flat fog colour.
      // Where the crossing budget runs out the floor is replaced by exactly
      // that sky, so if fog has saturated by then the cutoff is not merely
      // softened, it is invisible.
      linear = mix(linear, skyColor(rd), fogFactor(hitDist));
    }

    gl_FragColor = vec4(linearToSRGB(linear), 1.0);
  }
`;

// Builds the fullscreen quad and its uniform block.
//
// `surface` is a buildSurface() result. Its corners and edge gluings are
// uploaded verbatim, so the shader traverses exactly the topology defined in
// surface.js rather than a re-derived copy of it.
export function createRayTracer(surface) {
  const { edgeCount, verts, edgeTrans } = surfaceUniforms(surface);

  // Closed ring of corners — see the uVerts comment in the shader.
  const vertRing = [];
  for (let i = 0; i <= edgeCount; i++) {
    const k = i % edgeCount;
    vertRing.push(new THREE.Vector2(verts[k * 2], verts[k * 2 + 1]));
  }

  const edgeData = [];
  for (let i = 0; i < edgeCount; i++) {
    edgeData.push(new THREE.Vector3(edgeTrans[i * 2], edgeTrans[i * 2 + 1], surface.edgeInfo[i].other));
  }

  // The shader derives tile UVs from the UNFOLDED hit position so that they
  // stay continuous across a portal crossing. That only samples the same texel
  // as the local position if every gluing translation is a whole number of
  // tiles — otherwise the texture would visibly shift each time a ray crossed
  // an edge. True for this surface by construction; checked rather than
  // assumed, because a new surface could silently break it.
  for (let i = 0; i < edgeCount; i++) {
    for (const component of [edgeTrans[i * 2], edgeTrans[i * 2 + 1]]) {
      const tiles = component / WORLD.tileSize;
      if (Math.abs(tiles - Math.round(tiles)) > 1e-6) {
        throw new Error(
          `Edge ${i}'s gluing translation (${edgeTrans[i * 2]}, ${edgeTrans[i * 2 + 1]}) is not a ` +
            `whole number of tiles of size ${WORLD.tileSize}. The shader's unfolded-coordinate ` +
            'tile UVs assume it is; see tileUV in the fragment shader.'
        );
      }
    }
  }

  const [t0, t1, t2] = COLORS.tiles.map(rgb);

  const chairPos = sculpturePosition(SCULPTURES.chair);
  const tablePos = sculpturePosition(SCULPTURES.table);

  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },

    uCamPos: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uTanHalfFov: { value: 1 },
    uAspect: { value: 1 },

    uVerts: { value: vertRing },
    uEdgeData: { value: edgeData },
    uTileSize: { value: WORLD.tileSize },

    uCylRadius: { value: SINGULARITIES.radius },
    uCylHeight: { value: SINGULARITIES.height },

    // Filled in by setTileTextures(); null is a valid initial sampler value in
    // three.js, which binds a 1x1 placeholder until a real texture arrives.
    uTileTex0: { value: null },
    uTileTex1: { value: null },
    uTileTex2: { value: null },

    uSkyHorizonLinear: { value: new THREE.Vector3(...rgbLinear(SKY.horizon)) },
    uSkyZenithLinear: { value: new THREE.Vector3(...rgbLinear(SKY.zenith)) },
    uSkyExponent: { value: SKY.exponent },
    uFogDistance: { value: FOG.distance },
    uFogFalloff: { value: FOG.falloff },

    // The starting texture set decides whether they are there; app.js keeps
    // this in step as T cycles.
    uSculptures: { value: sculpturesVisible(TEXTURES.active) ? 1 : 0 },
    uChairPos: { value: new THREE.Vector2(chairPos[0], chairPos[1]) },
    uChairHeight: { value: SCULPTURES.chair.height },
    uChairLinear: { value: new THREE.Vector3(...rgbLinear(SCULPTURES.chair.color)) },
    uTablePos: { value: new THREE.Vector2(tablePos[0], tablePos[1]) },
    uTableHeight: { value: SCULPTURES.table.height },
    uTableLinear: { value: new THREE.Vector3(...rgbLinear(SCULPTURES.table.color)) },
    uCylLinear: { value: new THREE.Vector3(...rgbLinear(COLORS.singularity)) },
    uLightDir: { value: new THREE.Vector3(...LIGHTING.direction).normalize() },
    uAmbient: { value: LIGHTING.ambient },

    uDebugTile0: { value: new THREE.Vector3(...t0) },
    uDebugTile1: { value: new THREE.Vector3(...t1) },
    uDebugTile2: { value: new THREE.Vector3(...t2) },

    uShowGrid: { value: RENDER.grid ? 1 : 0 },
    uGridWidth: { value: RENDER.gridWidth },
    uGridDarkness: { value: RENDER.gridDarkness },

    uDebugMode: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    // GLSL loop bounds must be compile-time constants, so the crossing budget
    // is a #define rather than a uniform.
    defines: { MAX_CROSSINGS: WORLD.maxCrossings },
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false; // its clip-space position ignores the camera

  const scene = new THREE.Scene();
  scene.add(quad);

  // gl_Position is written directly, so this camera never projects anything —
  // it only satisfies renderer.render()'s signature.
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  return {
    scene,
    camera: quadCamera,
    material,
    uniforms,

    // `camera` is an ordinary PerspectiveCamera positioned in the fundamental
    // domain's coordinates. Only its position, basis, fov and aspect are read;
    // its projection matrix is never used.
    setCamera(camera) {
      camera.updateMatrixWorld();
      camera.matrixWorld.extractBasis(right, up, fwd);
      uniforms.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      uniforms.uCamRight.value.copy(right);
      uniforms.uCamUp.value.copy(up);
      uniforms.uCamFwd.value.copy(fwd).negate(); // three.js cameras look down -Z
      uniforms.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      uniforms.uAspect.value = camera.aspect;
    },

    setSize(width, height, pixelRatio) {
      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    },

    setDebugMode(mode) {
      uniforms.uDebugMode.value = mode;
    },

    setGrid(on) {
      uniforms.uShowGrid.value = on ? 1 : 0;
    },

    // Radius 0 makes every column miss every ray, which removes them from the
    // world without a separate branch in the shader.
    setSingularityRadius(radius) {
      uniforms.uCylRadius.value = radius;
    },

    setSculptures(on) {
      uniforms.uSculptures.value = on ? 1 : 0;
    },

    // `textures` is [tile0, tile1, tile2] from textures.js. Swapping them is a
    // uniform assignment — no shader recompile, nothing about the traversal
    // changes.
    setTileTextures(textures) {
      uniforms.uTileTex0.value = textures[0];
      uniforms.uTileTex1.value = textures[1];
      uniforms.uTileTex2.value = textures[2];
    },
  };
}
