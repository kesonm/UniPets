import type { Listing } from '../../../src/h5/business'
import { api } from './client'

export async function searchListings(module: string, query: string, district?: string) {
  const { listings } = await api<{ listings: Listing[] }>(
    '/h5/catalog?module=' + encodeURIComponent(module) + '&q=' + encodeURIComponent(query.trim()) +
      (district ? '&district=' + encodeURIComponent(district) : ''),
  )
  return listings
}
