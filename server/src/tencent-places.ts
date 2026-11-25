import { z } from 'zod'
import type { MapPlace, MapPlaceSuggestion, ServiceCoordinates } from '../../shared/h5-discovery.mjs'
import { config } from './config.js'
import { HttpError } from './errors.js'

const text = z.string().trim().max(240)
const poi = z.object({
  id: text.nullish(), title: text.min(1), address: text.nullish(),
  location: z.object({lat:z.number().min(-90).max(90),lng:z.number().gt(-180).max(180)}),
})
const addressResult = z.object({
  address: text.optional(),
  formatted_addresses: z.object({standard_address:text.optional(),recommend:text.optional()}).optional(),
  address_component: z.object({street:text.optional(),street_number:text.optional()}).optional(),
  pois: z.array(z.unknown()).optional(),
})
const nearbyPoi = poi.extend({_distance:z.number().min(0).max(25)})

function coordinateParam({latitude,longitude}: ServiceCoordinates) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`
}

async function callTencent(path: string, params: Record<string,string>) {
  if (!config.tencentMapKey) throw new HttpError(503,'地点搜索暂不可用，可拖动地图或点选地点')
  const url = new URL(path,'https://apis.map.qq.com')
  url.search = new URLSearchParams({...params,key:config.tencentMapKey}).toString()
  try {
    const response = await fetch(url,{signal:AbortSignal.timeout(4000)})
    if (!response.ok) throw new Error('Map service unavailable')
    const payload = z.object({status:z.literal(0),result:z.unknown().optional(),data:z.unknown().optional()}).safeParse(await response.json())
    if (!payload.success) throw new Error('Invalid map response')
    return payload.data
  } catch {
    throw new HttpError(502,'地点服务暂不可用，请稍后重试')
  }
}

export async function searchTencentPlaces(keyword: string, center?: ServiceCoordinates, city?: string) {
  const {data} = await callTencent('/ws/place/v1/suggestion',{
    keyword,region_fix:'0',page_size:'10',page_index:'1',
    ...(city ? {region:city} : {}),
    ...(center ? {location:coordinateParam(center)} : {}),
  })
  if (!Array.isArray(data)) throw new HttpError(502,'地点服务暂未返回搜索结果，请稍后重试')
  const places = new Map<string,MapPlaceSuggestion>()
  for (const item of data.slice(0,10)) {
    const parsed = poi.safeParse(item)
    if (!parsed.success) continue
    const {title,address,location} = parsed.data
    const point = {latitude:location.lat,longitude:location.lng}
    const id = parsed.data.id || `${coordinateParam(point)}:${title}`
    places.set(id,{id,point,name:title,address:address || ''})
  }
  return [...places.values()]
}

export async function resolveTencentPlace(point: ServiceCoordinates): Promise<MapPlace|null> {
  if (!config.tencentMapKey) return null
  try {
    const {result} = await callTencent('/ws/geocoder/v1/',{
      location:coordinateParam(point),get_poi:'1',poi_options:'radius=150;policy=2',
    })
    const parsed = addressResult.safeParse(result)
    if (!parsed.success) return null
    const {address,address_component,formatted_addresses,pois} = parsed.data
    const number = address_component?.street_number
    const street = address_component?.street
    const door = number && street && !number.startsWith(street) ? street+number : number
    const standard = formatted_addresses?.standard_address
    const nearest = (pois ?? []).flatMap(item => {
      const parsedPoi = nearbyPoi.safeParse(item)
      return parsedPoi.success ? [parsedPoi.data] : []
    }).sort((a,b) => a._distance-b._distance)[0]
    const name = nearest?.title || door || standard || formatted_addresses?.recommend || address
    if (!name) return null
    return {name,address:nearest?.address || standard || address || ''}
  } catch {
    return null
  }
}
