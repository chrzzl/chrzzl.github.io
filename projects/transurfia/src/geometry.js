// Small shared 2D helpers, kept in their own module so player.js and
// referenceTracer.js can both use them without depending on each other.

export function segmentIntersect(p1, p2, p3, p4) {
  const [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3, [x4, y4] = p4;
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  if (t <= 1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
  return { t, point: [x1 + t * (x2 - x1), y1 + t * (y2 - y1)] };
}

export function pointInPolygon(vertices, x, z) {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = vertices[i];
    const [xj, zj] = vertices[j];
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
