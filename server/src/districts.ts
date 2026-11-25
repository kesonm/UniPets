import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Router } from 'express'
import { z } from 'zod'
import { districtAt, legacyDistricts, type District, type DistrictBoundary } from '../../shared/h5-districts.mjs'
import { serviceRegions } from '../../shared/h5-service-regions.mjs'
import { mapPointToWgs84 } from './map-coordinates.js'

export const districtInput = z.string().regex(/^[a-zA-Z0-9-]{1,32}$/)
export const coordinatesInput = z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().gt(-180).max(180),
}).strict()
export const districtRouter = Router()
const provinces = new Map(serviceRegions.map(province => [province.label, province]))
const provinceCodes = new Set(serviceRegions.map(province => province.id))
const cities = new Set(serviceRegions.flatMap(province => province.cities.length ? province.cities.map(city => city.id) : [province.id]))
export const serviceRegionInput = z.string().refine(code => provinceCodes.has(code) || cities.has(code), '请选择有效地区')
export const serviceCityInput = z.string().refine(code => cities.has(code), '请选择有效的服务城市')
const legacyCityNames: Record<string, string> = {
  南通县: '南通市', 莱芜市: '济南市', 巢湖市: '合肥市', 吐鲁番地区: '吐鲁番市', 儋县: '儋州市',
}
let dataset: DistrictBoundary[] | undefined
let districtIndex: Map<string, District> | undefined

function boundaries() {
  if (!dataset) {
    const source = readFileSync(new URL('../data/china-districts.json.gz', import.meta.url))
    dataset = JSON.parse(gunzipSync(source).toString('utf8')) as DistrictBoundary[]
  }
  return dataset
}

function serviceCity(district: District) {
  const province = provinces.get(district.province ?? '')
  if (!province) return undefined
  if (!province.cities.length) return province.id
  const name = district.city || district.name
  return province.cities.find(city => city.label === name)?.id ??
    province.cities.find(city => city.label === (legacyCityNames[name] ?? name.replace(/地区$/, '市')))?.id
}

export function districtForPoint(latitude: number, longitude: number) {
  const district = districtAt(latitude,longitude,boundaries())
  return district && {...district,serviceCityCode:serviceCity(district)}
}

export function districtById(area: string | null | undefined) {
  if (!area) return undefined
  districtIndex ??= new Map(boundaries().map(({id,name,city,province}) => [
    id, {id,name,city,province,serviceCityCode:serviceCity({id,name,city,province})},
  ]))
  const id = Object.hasOwn(legacyDistricts, area) ? legacyDistricts[area] : area
  return districtIndex.get(id)
}

export const knownDistrictInput = districtInput.refine(id => districtById(id)?.id === id, '请在地图选择有效区县')

export function districtAreaIds(ids: readonly string[]) {
  const districts = new Set(ids)
  return [...districts, ...Object.keys(legacyDistricts).filter(area => districts.has(legacyDistricts[area]))]
}

export function withDistrict<T extends {area: string | null}>(item: T) {
  return {...item, district: districtById(item.area) ?? null}
}

export function districtsInServiceRegion(code: string) {
  return boundaries().filter(district => provinceCodes.has(code)
    ? provinces.get(district.province ?? '')?.id === code : serviceCity(district) === code).map(district => district.id)
}

districtRouter.post('/catalog/map-location', (req, res) => {
  const coordinates = mapPointToWgs84(coordinatesInput.parse(req.body))
  res.json({coordinates,district:districtForPoint(coordinates.latitude,coordinates.longitude) ?? null})
})

districtRouter.get('/catalog/district-boundaries', (req, res) => {
  const { x, y } = z.object({
    x: z.coerce.number().int().min(-180).max(180),
    y: z.coerce.number().int().min(-90).max(90),
  }).parse(req.query)
  const data = boundaries().filter(({bounds: [west,south,east,north]}) =>
    west <= x + 1 && east >= x && south <= y + 1 && north >= y)
  res.set('Cache-Control','public, max-age=86400').json({ boundaries: data })
})
