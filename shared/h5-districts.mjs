export const legacyDistricts = {
  'beijing-chaoyang': '1815402',
  'shanghai-xuhui': '1787956',
  'guangzhou-tianhe': '6571342',
  'shenzhen-nanshan': '6571327',
  'hangzhou-xihu': '6607381',
}

function insideRing(x, y, points) {
  let inside = false
  for (let i = 0, last = points.length - 1; i < points.length; last = i++) {
    const [a, b] = points[i]
    const [c, d] = points[last]
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside
  }
  return inside
}

export function districtAt(latitude, longitude, districts) {
  let match
  for (const item of districts) {
    const [west, south, east, north] = item.bounds
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue
    if (match && match.size <= item.size) continue
    const contains = item.polygons.some(([shell, ...holes]) => insideRing(longitude, latitude, shell) &&
      !holes.some(hole => insideRing(longitude, latitude, hole)))
    if (contains) match = item
  }
  if (!match) return undefined
  const { id, name, city, province } = match
  return { id, name, city, province }
}
