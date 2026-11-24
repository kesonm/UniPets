export const legacyDistricts: Readonly<Record<string, string>>
export interface District {
  id: string
  name: string
  city?: string
  province?: string
}
export interface DistrictBoundary extends District {
  bounds: [number, number, number, number]
  polygons: [number, number][][][]
  size: number
}
export function districtAt(latitude: number, longitude: number, districts: readonly DistrictBoundary[]): District | undefined
