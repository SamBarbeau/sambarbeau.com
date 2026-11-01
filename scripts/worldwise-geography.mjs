// Decorative card silhouettes, not territorial or area comparisons.
// Keep geographically separated possessions from shrinking the familiar outline.
export const displayExtents = {
  FRA: [-6, 41, 10, 52], // Metropolitan France, including Corsica.
  USA: [-126, 24, -66, 50], // Contiguous United States.
  NOR: [4, 57, 32, 72], // Mainland Norway, excluding Svalbard/Jan Mayen.
  ECU: [-82, -6, -74, 2], // Mainland Ecuador, excluding the Galápagos.
  NZL: [165, -48, 180, -33], // North and South islands and nearby islands.
};
export function ringArea(ring) {
  return Math.abs(ring.reduce((sum, p, i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + p[0] * next[1] - next[0] * p[1];
  }, 0) / 2);
}
export function chooseRings(geometry, id) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let rings = polygons.map(p => p[0]);
  const extent = displayExtents[id];
  if (extent) rings = rings.filter(r => r.every(([x, y]) => x >= extent[0] && x <= extent[2] && y >= extent[1] && y <= extent[3]));
  if (!rings.length) throw new Error(`No outline in display extent for ${id}`);
  // Unwrap date-line fragments without drawing a line across the whole world.
  const xs = rings.flatMap(r => r.map(p => p[0]));
  if (Math.max(...xs) - Math.min(...xs) > 300) rings = rings.map(r => r.map(([x, y]) => [x < 0 ? x + 360 : x, y]));
  const largest = Math.max(...rings.map(ringArea));
  return rings.filter(r => ringArea(r) >= largest * .005);
}
function distanceToSegment(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let largest = tolerance, split = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i], points[0], points.at(-1));
    if (distance > largest) { largest = distance; split = i; }
  }
  return split < 0 ? [points[0], points.at(-1)] : [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)];
}
export function makeSilhouette(rings) {
  const flat = rings.flat(), xs = flat.map(p => p[0]), ys = flat.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const longitudeScale = Math.cos((minY + maxY) / 2 * Math.PI / 180);
  const width = (maxX - minX) * longitudeScale, height = maxY - minY;
  const scale = Math.min(220 / Math.max(width, .001), 140 / Math.max(height, .001));
  const dx = (240 - width * scale) / 2, dy = (160 - height * scale) / 2;
  return rings.map(ring => {
    const projected = ring.map(([x, y]) => [(x - minX) * longitudeScale * scale + dx, (maxY - y) * scale + dy]);
    const reduced = simplify(projected, .45);
    const points = reduced.length >= 4 ? reduced : projected;
    return 'M' + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
  }).join(' ');
}
