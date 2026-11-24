import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { ResultSetHeader } from 'mysql2/promise'
import { z } from 'zod'
import { parseStoreBindingCode, servicePhone, storeBindingQrPrefix } from '../../shared/h5-discovery.mjs'
import { requireAuth } from './auth.js'
import { db, rows } from './db.js'
import { HttpError } from './errors.js'
import { renderQrCode } from './identity-codes.js'

export const h5StoreBindingRouter = Router()
const route = '/catalog/stores'
const bindingAttempts = rateLimit({
  windowMs: 60_000, limit: 18,
  standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '绑定操作过于频繁，请稍后再试' },
})
const bindInput = z.object({
  code: z.string().trim().max(64).transform(parseStoreBindingCode).refine(Boolean, '请输入有效的门店码或扫描门店二维码'),
}).strict()

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
  const qrCode = 'data:image/png;base64,'+(await renderQrCode(storeBindingQrPrefix+code)).toString('base64')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const [result] = await db.execute<ResultSetHeader>(`UPDATE h5_stores
    SET binding_code_hash=?,binding_code_expires_at=?
    WHERE id=? AND owner_user_id IS NULL AND enabled=TRUE`,
  [codeHash(code),expiresAt,id])
  if (!result.affectedRows) throw new HttpError(409, '请选择尚未绑定且营业中的门店')
  return {code,qrCode,expiresAt}
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
