import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader } from 'mysql2/promise'
import { z } from 'zod'
import { ownedAsset, ownedPet } from './assets.js'
import { requireAuth } from './auth.js'
import { db, rows } from './db.js'
import { HttpError } from './errors.js'
import { engagementSelect } from './h5-directory.js'

export const h5PetRecordsRouter = Router()
const uuid = z.string().uuid()
export async function assertPetPhoto(userId: string, petId: string, assetId: string|null) {
  if (!assetId) return
  const asset = await ownedAsset(userId,assetId)
  if (asset.kind !== 'photo' || asset.petId !== petId) throw new HttpError(400, '请选择这只宠物的照片')
}

h5PetRecordsRouter.get('/pet-records/:id', requireAuth, async (req,res) => {
  const petId = uuid.parse(req.params.id)
  await ownedPet(req.user.id,petId)
  const [health,engagements,posts,stories,memorials,tributes] = await Promise.all([
    rows(`SELECT id,kind,title,note,DATE_FORMAT(happened_on,'%Y-%m-%d') AS happenedOn FROM h5_pet_health
      WHERE pet_id=? ORDER BY happened_on DESC,id DESC LIMIT 100`, [petId]),
    rows(`${engagementSelect} WHERE r.pet_id=? AND r.user_id=?
      ORDER BY r.created_at DESC,r.id LIMIT 100`, [petId,req.user.id]),
    rows(`SELECT id,title,created_at AS createdAt FROM h5_posts WHERE pet_id=? AND user_id=?
      ORDER BY created_at DESC,id LIMIT 100`, [petId,req.user.id]),
    rows(`SELECT id,title,published_at AS publishedAt,updated_at AS updatedAt FROM h5_stories WHERE pet_id=? AND user_id=?
      ORDER BY updated_at DESC,id LIMIT 100`, [petId,req.user.id]),
    rows(`SELECT title,remembrance,cover_asset_id AS coverAssetId,updated_at AS updatedAt
      FROM h5_memorials WHERE pet_id=?`, [petId]),
    rows(`SELECT id,kind,body,created_at AS createdAt FROM h5_memorial_entries
      WHERE pet_id=? ORDER BY created_at DESC,id LIMIT 100`, [petId]),
  ])
  res.json({health,engagements,posts,stories,memorial:memorials[0] ?? null,tributes})
})

h5PetRecordsRouter.post('/pet-records/:id/health', requireAuth, async (req,res) => {
  const petId = uuid.parse(req.params.id)
  const data = z.object({kind:z.enum(['exam','consultation','medicine','care']), happenedOn:z.string().date(),
    title:z.string().trim().min(1,'请填写健康记录标题').max(100),
    note:z.string().trim().max(1500).default('')}).strict().parse(req.body)
  await ownedPet(req.user.id,petId)
  const id = randomUUID()
  await db.execute('INSERT INTO h5_pet_health (id,pet_id,kind,happened_on,title,note) VALUES (?,?,?,?,?,?)',
    [id,petId,data.kind,data.happenedOn,data.title,data.note])
  res.status(201).json({record:{...data,id}})
})

h5PetRecordsRouter.put('/pet-records/:id/memorial', requireAuth, async (req,res) => {
  const petId = uuid.parse(req.params.id)
  const data = z.object({title:z.string().trim().min(1,'请填写纪念馆名称').max(100),
    remembrance:z.string().trim().max(3000).default(''), coverAssetId:uuid.nullable().default(null)}).strict().parse(req.body)
  await ownedPet(req.user.id,petId)
  await assertPetPhoto(req.user.id,petId,data.coverAssetId)
  const values = [data.title,data.remembrance,data.coverAssetId]
  await db.execute(`INSERT INTO h5_memorials (pet_id,title,remembrance,cover_asset_id) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE title=?,remembrance=?,cover_asset_id=?`, [petId,...values,...values])
  res.json({ok:true})
})

h5PetRecordsRouter.post('/pet-records/:id/memorial/tributes', requireAuth, async (req,res) => {
  const petId = uuid.parse(req.params.id)
  const {kind,body} = z.object({kind:z.enum(['candle','tribute','message']),
    body:z.string().trim().max(500).default('')}).strict()
    .refine(input => input.kind !== 'message' || Boolean(input.body), '请填写留言内容').parse(req.body)
  await ownedPet(req.user.id,petId)
  const [result] = await db.execute<ResultSetHeader>(`INSERT INTO h5_memorial_entries (id,pet_id,kind,body)
    SELECT ?,pet_id,?,? FROM h5_memorials WHERE pet_id=?`, [randomUUID(),kind,body,petId])
  if (!result.affectedRows) throw new HttpError(404, '请先创建纪念馆')
  res.status(201).json({ok:true})
})

h5PetRecordsRouter.get('/wallet', requireAuth, async (req,res) => {
  const petId = z.object({petId:uuid.optional()}).parse(req.query).petId ?? null
  if (petId) await ownedPet(req.user.id,petId)
  const ownerFilter = 'user_id=? AND (? IS NULL OR pet_id=?)'
  const args = [req.user.id,petId,petId]
  const [totals,entries] = await Promise.all([
    rows<{currency:'points'|'coins';balance:string}>(`SELECT currency,SUM(quantity) AS balance
      FROM h5_wallet_entries WHERE ${ownerFilter} GROUP BY currency`, args),
    rows(`SELECT id,pet_id AS petId,currency,quantity,label,created_at AS createdAt FROM h5_wallet_entries
      WHERE ${ownerFilter} ORDER BY created_at DESC,id LIMIT 100`, args),
  ])
  const balances = {points:0,coins:0}
  for (const total of totals) balances[total.currency] = Number(total.balance)
  res.json({balances,entries})
})
