interface Coordinates { latitude: number; longitude: number }
export interface H5Area extends Coordinates { id: string; label: string; cityCode: string }
export const h5Areas: readonly H5Area[]
export function areaDistance(from: Coordinates, to: Coordinates): number
