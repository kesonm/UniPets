import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { areaDistance } from '../../shared/h5-areas.mjs'
import { servicePhone, type ServiceCoordinates } from '../../shared/h5-discovery.mjs'
import { requireAuth } from './auth.js'
import { db, rows } from './db.js'
import { coordinatesInput, districtForPoint, serviceCityInput } from './districts.js'
import { HttpError } from './errors.js'
import { mapPointToWgs84 } from './map-coordinates.js'

export const h5StoreBindingRouter = Router()
const route = '/catalog/stores'
const bindingAttempts = rateLimit({
  windowMs: 60_000, limit: 18,
  standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '绑定操作过于频繁，请稍后再试' },
})
const bindInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-F0-9]{12}$/, '请输入 12 位门店绑定码'),
}).strict()
const phoneInput = z.string().trim().max(40).refine(value => Boolean(servicePhone(value)), '请填写有效的门店联系电话')
const addressInput = z.string().trim().min(1,'请填写门店详细地址').max(160)
const mapSelection = z.object({location:coordinatesInput,cityCode:serviceCityInput.optional()})
const mapBinding = z.union([
  mapSelection.extend({storeId:z.string().uuid(),phone:phoneInput.optional()}).strict(),
  mapSelection.extend({name:z.string().trim().min(1,'请填写门店名称').max(120),address:addressInput,phone:phoneInput}).strict(),
])
const nearbyRadiusKm = 0.15
const storeColumns = `id,name,address,phone,enabled,area,city_code AS cityCode,district_code AS districtCode,
  owner_user_id AS ownerId,CAST(latitude AS DOUBLE) AS latitude,CAST(longitude AS DOUBLE) AS longitude`

interface StoreLocation extends StoreContact, RowDataPacket {
  id: string
  name: string
  address: string
  enabled: number
  ownerId: string|null
  latitude: number|null
  longitude: number|null
}

export interface StoreContact {
  area: string|null
  cityCode: string|null
  districtCode: string|null
  phone: string
}

export function hasStoreContact(store: StoreContact) {
  return Boolean((store.area || store.cityCode || store.districtCode) && servicePhone(store.phone))
}

function codeHash(code: string) {
  return createHash('sha256').update(code, 'ascii').digest()
}

export async function issueStoreBindingCode(id: string) {
  const code = randomBytes(6).toString('hex').toUpperCase()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const [result] = await db.execute<ResultSetHeader>(`UPDATE h5_stores
    SET binding_code_hash=?,binding_code_expires_at=?
    WHERE id=? AND owner_user_id IS NULL AND enabled=TRUE`,
  [codeHash(code),expiresAt,id])
  if (!result.affectedRows) throw new HttpError(409, '请选择尚未绑定且营业中的门店')
  return {code,expiresAt}
}

h5StoreBindingRouter.get(route + '/mine', requireAuth, async (req,res) => {
  const stores = await rows<StoreContact & {id:string;name:string;address:string;enabled:number}>(`SELECT
    id,name,address,phone,enabled,area,city_code AS cityCode,district_code AS districtCode
    FROM h5_stores WHERE owner_user_id=? ORDER BY created_at DESC,id`, [req.user.id])
  res.json({stores:stores.map(({id,name,address,phone,enabled,...region}) => ({
    id,name,address,phone,enabled:Boolean(enabled),ready:hasStoreContact({...region,phone}),
  }))})
})

h5StoreBindingRouter.post(route + '/bind', requireAuth, bindingAttempts, async (req,res) => {
  const {code} = bindInput.parse(req.body)
  const [result] = await db.execute<ResultSetHeader>(`UPDATE h5_stores
    SET owner_user_id=?,binding_code_hash=NULL,binding_code_expires_at=NULL
    WHERE binding_code_hash=? AND binding_code_expires_at>UTC_TIMESTAMP(3)
      AND owner_user_id IS NULL AND enabled=TRUE`, [req.user.id,codeHash(code)])
  if (!result.affectedRows) throw new HttpError(409, '绑定码无效、已使用或已过期')
  res.json({ok:true})
})

function storeDistance(point: ServiceCoordinates, store: StoreLocation) {
  const {latitude, longitude} = store
  return latitude === null || longitude === null ? Infinity : areaDistance(point,{latitude,longitude})
}

async function findStoresAt(point: ServiceCoordinates, details?: {name:string;address:string}, runner: Pick<PoolConnection,'execute'> = db) {
  const latWindow = 0.002
  const lngWindow = latWindow / Math.max(0.1, Math.cos(point.latitude * Math.PI/180))
  const [stores] = await runner.execute<StoreLocation[]>(`SELECT ${storeColumns} FROM h5_stores
    WHERE (latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?)
    ${details ? 'OR name=? OR address=?' : ''}`,
  [point.latitude-latWindow,point.latitude+latWindow,point.longitude-lngWindow,point.longitude+lngWindow,
    ...(details ? [details.name,details.address] : [])])
  return stores
}

const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'')
function matchingStore(stores: StoreLocation[], point: ServiceCoordinates, details: {name:string;address:string}, cityCode?: string) {
  const name = normalized(details.name)
  const address = normalized(details.address)
  const named = stores.filter(store => normalized(store.name) === name)
  const exact = named.filter(store => normalized(store.address) === address &&
    (!store.cityCode || !cityCode || store.cityCode === cityCode))
  const matches = exact.length ? exact : named.filter(store => storeDistance(point,store) <= nearbyRadiusKm)
  if (matches.length > 1) throw new HttpError(409,'找到多家同名门店，请从地图附近的门店中选择')
  return matches[0]
}

async function bindAtPoint(input: z.infer<typeof mapBinding>, userId: string) {
  const point = mapPointToWgs84(input.location)
  const district = districtForPoint(point.latitude,point.longitude)
  const cityCode = district?.serviceCityCode ?? input.cityCode
  const conn = await db.getConnection()
  let locked = false
  try {
    // Serialize lookup and registration so two map submissions cannot create duplicate matches.
    const [[lock]] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK('petcloud_store_map_binding',5) AS acquired")
    locked = Number(lock.acquired) === 1
    if (!locked) throw new HttpError(503,'门店绑定繁忙，请稍后重试')
    await conn.beginTransaction()
    try {
      const id = 'storeId' in input ? input.storeId
        : matchingStore(await findStoresAt(point,input,conn),point,input,cityCode)?.id
      const result = id ? await claimStore(conn,id,point,input,userId,cityCode,district?.id)
        : await addStore(conn,input,userId,point,cityCode,district?.id)
      await conn.commit()
      return result
    } catch (error) {
      await conn.rollback()
      throw error
    }
  } finally {
    if (locked) {
      try { await conn.query("SELECT RELEASE_LOCK('petcloud_store_map_binding')") }
      catch { conn.destroy() }
    }
    conn.release()
  }
}

async function claimStore(conn: PoolConnection, id: string, point: ServiceCoordinates,
  input: z.infer<typeof mapBinding>, userId: string, cityCode?: string, districtCode?: string) {
  const [[store]] = await conn.execute<StoreLocation[]>(`SELECT ${storeColumns} FROM h5_stores WHERE id=? FOR UPDATE`,[id])
  if (!store || ('storeId' in input ? storeDistance(point,store) > nearbyRadiusKm
    : !matchingStore([store],point,input,cityCode))) {
    throw new HttpError(409,'门店位置已变更，请重新选点')
  }
  if (!store.enabled) throw new HttpError(409,'这家门店已停用')
  if (store.ownerId && store.ownerId !== userId) throw new HttpError(409,'这家门店已被其他账号绑定')
  const phone = servicePhone(store.phone) ? store.phone : input.phone
  if (!phone) throw new HttpError(400,'请补充门店联系电话')
  await conn.execute(`UPDATE h5_stores SET owner_user_id=?,binding_code_hash=NULL,binding_code_expires_at=NULL,
    city_code=COALESCE(city_code,?),district_code=COALESCE(district_code,?),
    latitude=COALESCE(latitude,?),longitude=COALESCE(longitude,?),phone=?,
    address=IF(address='',?,address) WHERE id=?`,
  [userId,cityCode ?? null,districtCode ?? null,point.latitude,point.longitude,phone,
    'address' in input ? input.address : '',id])
  return {id,created:false}
}

async function addStore(conn: PoolConnection, input: z.infer<typeof mapBinding>, userId: string,
  point: ServiceCoordinates, cityCode?: string, districtCode?: string) {
  if ('storeId' in input) throw new HttpError(409,'请重新选择门店位置')
  if (!cityCode && !districtCode) throw new HttpError(400,'请确认门店所在城市')
  const id = randomUUID()
  await conn.execute(`INSERT INTO h5_stores
    (id,name,address,phone,city_code,district_code,latitude,longitude,owner_user_id) VALUES (?,?,?,?,?,?,?,?,?)`,
  [id,input.name,input.address,input.phone,cityCode ?? null,districtCode ?? null,point.latitude,point.longitude,userId])
  return {id,created:true}
}

h5StoreBindingRouter.post(route + '/map/preview', requireAuth, bindingAttempts, async (req,res) => {
  const {location} = z.object({location:coordinatesInput}).strict().parse(req.body)
  const point = mapPointToWgs84(location)
  const district = districtForPoint(point.latitude,point.longitude)
  const stores = (await findStoresAt(point))
    .map(store => ({store,distance:storeDistance(point,store)}))
    .filter(item => item.distance <= nearbyRadiusKm)
    .sort((left,right) => left.distance-right.distance)
    .slice(0,10)
    .map(({store}) => ({
      id:store.id,name:store.name,address:store.address,
      state:!store.enabled ? 'disabled' : store.ownerId === req.user.id ? 'mine' : store.ownerId ? 'bound' : 'available',
      needsPhone:!servicePhone(store.phone),
    }))
  res.json({district:[...new Set([district?.province,district?.city,district?.name].filter(Boolean))].join(' · '),
    cityCode:district?.serviceCityCode || '',stores})
})

h5StoreBindingRouter.post(route + '/map/bind', requireAuth, bindingAttempts, async (req,res) => {
  const result = await bindAtPoint(mapBinding.parse(req.body),req.user.id)
  res.status(result.created ? 201 : 200).json(result)
})
