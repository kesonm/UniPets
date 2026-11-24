export interface ServiceRegionChoice {
  id: string
  label: string
}

export const serviceRegions: readonly (ServiceRegionChoice & { cities: readonly ServiceRegionChoice[] })[]
