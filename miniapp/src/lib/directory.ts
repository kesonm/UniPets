import type { Listing } from '../../../src/h5/business'
import { api } from './client'

export async function searchListings(module: string, query: string, district?: string, options?: {category?: string; local?: boolean}) {
  const { listings } = await api<{ listings: Listing[] }>(
    '/h5/catalog?module=' + encodeURIComponent(module) + '&q=' + encodeURIComponent(query.trim()) +
      (district ? '&district=' + encodeURIComponent(district) : '') +
      (options?.category ? '&category=' + encodeURIComponent(options.category) : '') +
      (options?.local && district ? '&local=1' : ''),
  )
  return listings
}
