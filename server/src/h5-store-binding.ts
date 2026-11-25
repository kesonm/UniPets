import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { parseStoreBindingCode, servicePhone, storeBindingQrPrefix } from '../../shared/h5-discovery.mjs'
import { requireAuth } from './auth.js'
import { db, rows, transaction } from './db.js'
import { coordinatesInput, districtForPoint, serviceCityInput } from './districts.js'
import { HttpError } from './errors.js'
import { renderQrCode } from './identity-codes.js'
import { mapPointToWgs84, wgs84ToMapPoint } from './map-coordinates.js'

export const h5StoreBindingRouter = Router()
const route = '/catalog/stores'
const bindingAttempts = rateLimit({
  windowMs: 60_000, limit: 18,
  standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '绑定操作过于频繁，请稍后再试' },
})
const bindingCodeInput = z.object({
  code: z.string().trim().max(64).transform(parseStoreBindingCode).refine(Boolean, '请输入有效的门店绑定码'),
}).strict()
const profileInput = z.object({
  name:z.string().trim().min(1,'请填写门店名称').max(120),
  address:z.string().trim().min(1,'请填写门店地址').max(160),
  phone:z.string().trim().max(40).refine(servicePhone,'请填写有效的联系电话'),
  location:coordinatesInput,
  cityCode:serviceCityInput.optional(),
}).strict()
const invalidCode = '绑定码无效或已被使用，请获取新的绑定码'

export interface StoreContact {
  area: string|null
  cityCode: string|null
  districtCode: string|null
  phone: string
}

export function hasStoreContact(store: StoreContact) {
  return Boolean((store.area || store.cityCode || store.districtCode) && servicePhone(store.phone))
}

export function listStoreBindingCodes() {
  return rows<{slot:number;code:string}>('SELECT slot,code FROM h5_store_binding_codes WHERE slot IS NOT NULL ORDER BY slot')
}

export async function storeBindingQr(slot: number) {
  const [active] = await rows<{code:string}>('SELECT code FROM h5_store_binding_codes WHERE slot=?',[slot])
  if (!active) throw new HttpError(404,'绑定码不存在')
  const qrCode = 'data:image/png;base64,'+(await renderQrCode(storeBindingQrPrefix+active.code)).toString('base64')
  return {slot,code:active.code,qrCode}
}

function isDuplicate(error: unknown) {
  return (error as {code?:string})?.code === 'ER_DUP_ENTRY'
}

async function replaceBindingCode(conn: PoolConnection, code: string, slot: number) {
  await conn.execute('UPDATE h5_store_binding_codes SET slot=NULL,used_at=UTC_TIMESTAMP(3) WHERE code=?',[code])
  for (let attempt = 0; attempt < 5; attempt++) {
    const nextCode = randomBytes(6).toString('hex').toUpperCase()
    try {
      await conn.execute('INSERT INTO h5_store_binding_codes (code,slot) VALUES (?,?)',[nextCode,slot])
      return
    } catch (error) {
      if (!isDuplicate(error)) throw error
    }
  }
  throw new HttpError(503,'生成绑定码失败，请稍后重试')
}

function storeLocation(point: z.infer<typeof coordinatesInput>) {
  const coordinates = mapPointToWgs84(point)
  return {coordinates,district:districtForPoint(coordinates.latitude,coordinates.longitude)}
}

function storeProfile({name,address,phone,location,cityCode}: z.infer<typeof profileInput>) {
  const {coordinates,district} = storeLocation(location)
  const city = district?.serviceCityCode ?? cityCode
  if (!city) throw new HttpError(400,'请补选门店所在城市')
  const identity = [name,address].map(value => value.normalize('NFKC').toLowerCase().replace(/\s+/g,''))
  const key = createHash('sha256').update(JSON.stringify([city,...identity])).digest()
  return [name,address,phone,district?.id ?? null,city,coordinates.latitude,coordinates.longitude,key] as const
}

h5StoreBindingRouter.get(route + '/mine', requireAuth, async (req,res) => {
  const stores = await rows<StoreContact & {id:string;name:string;address:string;enabled:number;latitude:number|null;longitude:number|null}>(`SELECT
    id,name,address,phone,enabled,area,city_code AS cityCode,district_code AS districtCode,
    CAST(latitude AS DOUBLE) AS latitude, CAST(longitude AS DOUBLE) AS longitude
    FROM h5_stores WHERE owner_user_id=? ORDER BY created_at DESC,id`, [req.user.id])
  res.json({stores:stores.map(({id,name,address,phone,enabled,latitude,longitude,...region}) => ({
    id,name,address,phone,enabled:Boolean(enabled),ready:hasStoreContact({...region,phone}),cityCode:region.cityCode,
    location:latitude === null || longitude === null ? null : wgs84ToMapPoint({latitude,longitude}),
  }))})
})

h5StoreBindingRouter.post(route + '/binding-code/check', requireAuth, bindingAttempts, async (req,res) => {
  const {code} = bindingCodeInput.parse(req.body)
  const [active] = await rows<{slot:number}>('SELECT slot FROM h5_store_binding_codes WHERE code=? AND slot IS NOT NULL',[code])
  if (!active) throw new HttpError(409,invalidCode)
  res.json({ok:true})
})

h5StoreBindingRouter.post(route + '/location', requireAuth, (req,res) => {
  const {district} = storeLocation(coordinatesInput.parse(req.body))
  res.json({district:district ?? null})
})

h5StoreBindingRouter.post(route + '/bind', requireAuth, bindingAttempts, async (req,res) => {
  const {code,...profile} = profileInput.merge(bindingCodeInput).parse(req.body)
  const fields = storeProfile(profile)
  const id = randomUUID()
  try {
    await transaction(async conn => {
      const [[active]] = await conn.execute<(RowDataPacket & {slot:number})[]>(
        'SELECT slot FROM h5_store_binding_codes WHERE code=? AND slot IS NOT NULL FOR UPDATE',[code])
      if (!active) throw new HttpError(409,invalidCode)
      await conn.execute(`INSERT INTO h5_stores
        (id,owner_user_id,name,address,phone,district_code,city_code,latitude,longitude,registration_key)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,[id,req.user.id,...fields])
      await replaceBindingCode(conn,code,active.slot)
    })
  } catch (error) {
    if (isDuplicate(error)) throw new HttpError(409,'同名同地址的门店已绑定，请核对门店资料')
    throw error
  }
  res.status(201).json({id})
})

h5StoreBindingRouter.put(route + '/mine/:id', requireAuth, async (req,res) => {
  const id = z.string().uuid().parse(req.params.id)
  const fields = storeProfile(profileInput.parse(req.body))
  try {
    const [result] = await db.execute<ResultSetHeader>(`UPDATE h5_stores
      SET name=?,address=?,phone=?,district_code=?,city_code=?,latitude=?,longitude=?,registration_key=?
      WHERE id=? AND owner_user_id=?`,[...fields,id,req.user.id])
    if (!result.affectedRows) throw new HttpError(404,'门店不存在')
  } catch (error) {
    if (isDuplicate(error)) throw new HttpError(409,'同名同地址的门店已绑定，请核对门店资料')
    throw error
  }
  res.json({ok:true})
})
