// ============================================================================
// THE SURFACE
// ============================================================================
//
// A "translation surface" here is a simple polygon (CCW, in the XZ ground
// plane) whose boundary edges are identified in pairs by pure translation — no
// rotation, no reflection. That is the defining property: crossing an edge
// teleports you by that pair's translation vector with your orientation
// unchanged, which is why a ray can cross a boundary and simply keep going in
// the same direction.
//
// A surface definition is just:
//   vertices: [[x, z], ...]          CCW polygon, edge k = v[k] -> v[(k+1)%n]
//   gluings:  [[edgeA, edgeB], ...]  each pair identified by translation
//
// Everything downstream — the shader's uniforms, the singularity markers, the
// player's movement — is derived from that, so a different surface is a
// different vertex/gluing list and nothing else. buildSurface() is exported
// for exactly that purpose; note the shader's loops are sized for 8 edges
// (see EDGE_COUNT in raytracer.js).

function edgeVector(vertices, edgeIndex) {
  const n = vertices.length;
  const a = vertices[edgeIndex];
  const b = vertices[(edgeIndex + 1) % n];
  return [b[0] - a[0], b[1] - a[1]];
}

function edgeMidpoint(vertices, edgeIndex) {
  const n = vertices.length;
  const a = vertices[edgeIndex];
  const b = vertices[(edgeIndex + 1) % n];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// The classic 3-square L-shaped translation surface (an "L-tromino").
//
// Laid out to match the minimap, which draws +X to the right and +Z DOWN:
//
//     +-----+             tile 0 = [0,1] x [0,1]   top-left, where you start
//     |  0  |             tile 1 = [0,1] x [1,2]   bottom-left
//     +-----+-----+       tile 2 = [1,2] x [1,2]   bottom-right
//     |  1  |  2  |
//     +-----+-----+       the notch (missing square) is top-right
//
// The octagon below subdivides what would otherwise be a hexagon's two long
// edges at the point aligned with the notch, so every boundary edge has a
// same-length, opposite-facing partner elsewhere on the boundary (a
// requirement for pure-translation gluing). This is the standard construction
// (see e.g. Veech / Zorich "L-shaped table" surfaces); with all side lengths
// equal it has a single cone-point singularity of total angle 6*PI (three full
// turns), visible as the point where all 8 polygon corners are identified.
//
// Edge i runs vertices[i] -> vertices[(i+1)%8]:
//   e0: top of 0      e1: right of 0    e2: top of 2     e3: right of 2
//   e4: bottom of 2   e5: bottom of 1   e6: left of 1    e7: left of 0
//
// Each pair below is glued by the translation shown, which is what crossing
// the FIRST edge of the pair applies; crossing the second applies its negative.
const lShapeGluings = [
  [0, 5], // top of 0   <-> bottom of 1   (translation (0, +2))
  [1, 7], // right of 0 <-> left of 0     (translation (-1, 0))
  [2, 4], // top of 2   <-> bottom of 2   (translation (0, +1))
  [3, 6], // right of 2 <-> left of 1     (translation (-2, 0))
];

// `scale` multiplies every vertex coordinate (each unit square becomes
// `scale` units wide). Translations are derived from vertex positions, so
// they scale automatically — no separate scaling logic needed elsewhere.
export function createLShapeSurface(scale = 1) {
  const vertices = [
    [0, 0], // P0
    [1, 0], // P1
    [1, 1], // P2 (inner corner of the notch)
    [2, 1], // P3
    [2, 2], // P4
    [1, 2], // P5 (split of the long bottom edge, aligned with the notch)
    [0, 2], // P6
    [0, 1], // P7 (split of the long left edge, aligned with the notch)
  ].map(([x, z]) => [x * scale, z * scale]);

  return buildSurface(vertices, lShapeGluings);
}

// Signed polygon area via the shoelace formula; positive means the vertex list
// winds counterclockwise (treating [x, z] like a standard [x, y] math plane).
// CCW input is assumed downstream — the inward-normal sign in the traversal
// depends on it — so a CW (or degenerate) polygon must fail loudly here rather
// than silently invert the topology.
function signedArea(vertices) {
  let sum = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = vertices[i];
    const [x2, z2] = vertices[(i + 1) % n];
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

export function buildSurface(vertices, gluings) {
  const n = vertices.length;

  if (n < 3) throw new Error(`Surface polygon needs at least 3 vertices, got ${n}`);

  const area = signedArea(vertices);
  if (Math.abs(area) < 1e-9) {
    throw new Error('Surface polygon is degenerate (zero area) — check for duplicate/collinear vertices');
  }
  if (area < 0) {
    throw new Error(
      `Surface polygon winds clockwise (signed area ${area.toFixed(4)}); this codebase assumes CCW ` +
        '(the inward-normal sign used by the traversal depends on it). Reverse the vertex order.'
    );
  }

  // edgeInfo[i] = { other, translation } — translation maps a point on
  // edge i to the corresponding point on its glued partner edge.
  const edgeInfo = new Array(n);
  for (const [a, b] of gluings) {
    if (edgeInfo[a] || edgeInfo[b]) {
      throw new Error(`Edge ${edgeInfo[a] ? a : b} appears in more than one gluing pair`);
    }

    const va = edgeVector(vertices, a);
    const vb = edgeVector(vertices, b);
    const lenA = Math.hypot(...va);
    const lenB = Math.hypot(...vb);
    if (Math.abs(lenA - lenB) > 1e-6) {
      throw new Error(`Edges ${a} and ${b} have different lengths (${lenA.toFixed(4)} vs ${lenB.toFixed(4)}) — cannot be glued by pure translation`);
    }
    if (Math.hypot(va[0] + vb[0], va[1] + vb[1]) > 1e-6) {
      throw new Error(`Edges ${a} and ${b} are equal length but not opposite-facing — pure-translation gluing requires them to run in opposite directions around the boundary`);
    }

    const pa = vertices[a];
    const pb = vertices[(b + 1) % n]; // glued edge is traversed in reverse
    const translation = [pb[0] - pa[0], pb[1] - pa[1]];

    // Explicitly verify the translation maps *both* endpoints of edge a
    // onto the corresponding endpoints of edge b (not just the one it was
    // solved from) — this should follow automatically from the
    // equal-length/opposite-direction checks above, but a passing check
    // here catches any future refactor that breaks that implication.
    const aStart = vertices[a], aEnd = vertices[(a + 1) % n];
    const bStart = vertices[b], bEnd = vertices[(b + 1) % n];
    const mappedStart = [aStart[0] + translation[0], aStart[1] + translation[1]];
    const mappedEnd = [aEnd[0] + translation[0], aEnd[1] + translation[1]];
    if (Math.hypot(mappedStart[0] - bEnd[0], mappedStart[1] - bEnd[1]) > 1e-6 || Math.hypot(mappedEnd[0] - bStart[0], mappedEnd[1] - bStart[1]) > 1e-6) {
      throw new Error(`Translation for edges ${a}/${b} does not map endpoints onto the partner edge's endpoints`);
    }

    edgeInfo[a] = { other: b, translation };
    edgeInfo[b] = { other: a, translation: [-translation[0], -translation[1]] };
  }

  for (let i = 0; i < n; i++) {
    if (!edgeInfo[i]) throw new Error(`Edge ${i} has no gluing partner`);
  }

  // Under the gluings, ALL eight corners of the L are the same point of the
  // surface: a single cone point of total angle 6*PI. Marking every corner is
  // therefore marking one place eight times over — which is exactly what makes
  // the columns interesting to walk around.
  const singularPositions = vertices.map((v) => v);

  return {
    vertices,
    gluings,
    edgeInfo,
    edgeMidpoint: (i) => edgeMidpoint(vertices, i),
    singularPositions,
  };
}
