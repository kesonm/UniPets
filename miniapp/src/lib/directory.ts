import type { Listing } from '../../../src/h5/business'
import { api } from './client'

export async function searchListings(module: string, query: string, area: string) {
  const { listings } = await api<{ listings: Listing[] }>(
    '/h5/catalog?module=' + encodeURIComponent(module) + '&q=' + encodeURIComponent(query.trim()) +
      (area ? '&area=' + encodeURIComponent(area) : ''),
  )
  return listings
}
