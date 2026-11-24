import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Router } from 'express'
import { z } from 'zod'
import type { District, DistrictBoundary } from '../../shared/h5-districts.mjs'

export const districtInput = z.string().regex(/^[a-zA-Z0-9-]{1,32}$/)
export const districtRouter = Router()
let dataset: DistrictBoundary[] | undefined

function boundaries() {
  if (!dataset) {
    const source = readFileSync(new URL('../data/china-districts.json.gz', import.meta.url))
    dataset = JSON.parse(gunzipSync(source).toString('utf8')) as DistrictBoundary[]
  }
  return dataset
}

export function listDistricts(query: string, id?: string): District[] {
  const words = query.toLowerCase().trim().split(/\s+/)
  return boundaries().filter(item => {
    if (id) return item.id === id
    const label = [item.province,item.city,item.name,item.id].join('').toLowerCase()
    return words.every(word => label.includes(word))
  }).slice(0, 40).map(({id, name, city, province}) => ({id, name, city, province}))
}

districtRouter.get('/catalog/district-boundaries', (req, res) => {
  const { x, y } = z.object({
    x: z.coerce.number().int().min(-180).max(180),
    y: z.coerce.number().int().min(-90).max(90),
  }).parse(req.query)
  const data = boundaries().filter(({bounds: [west,south,east,north]}) =>
    west <= x + 1 && east >= x && south <= y + 1 && north >= y)
  res.set('Cache-Control','public, max-age=86400').json({ boundaries: data })
})
