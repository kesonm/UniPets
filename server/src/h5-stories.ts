import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { ownedPet, photoThumbnail } from './assets.js'
import { requireAuth } from './auth.js'
import { db, rows, transaction } from './db.js'
import { HttpError } from './errors.js'
import { assertPetPhoto } from './h5-pet-records.js'
import { requirePublishingStore } from './h5-storefront.js'

export const h5StoriesRouter = Router()
const uuid = z.string().uuid()
const storyFields = `s.id,s.title,s.published_at AS publishedAt,p.name AS petName,u.display_name AS author,
  merchant.id AS storeId,merchant.name AS storeName,
  (a.id IS NOT NULL) AS hasCover, JSON_LENGTH(s.scenes) AS sceneCount,
  (SELECT COUNT(*) FROM h5_story_reactions r WHERE r.story_id=s.id AND kind='like') AS likes`
const storyFrom = `FROM h5_stories s JOIN pets p ON p.id=s.pet_id AND p.user_id=s.user_id
  JOIN users u ON u.id=s.user_id LEFT JOIN assets a ON a.id=s.cover_asset_id
    AND a.kind='photo' AND a.pet_id=s.pet_id AND a.user_id=s.user_id
  LEFT JOIN h5_stores merchant ON merchant.id=s.store_id AND merchant.owner_user_id=s.user_id AND merchant.enabled=TRUE`
const storyInput = z.object({title:z.string().trim().min(1,'请填写作品标题').max(100),
  scenes:z.array(z.string().trim().min(1).max(500)).min(1,'请写至少一个分镜').max(8),
  coverAssetId:uuid.nullable().default(null), publish:z.boolean().default(false),storeId:uuid.nullable().optional()}).strict()

type PublicStory = { id: string; title: string; publishedAt: Date; petName: string; author: string; hasCover: number; sceneCount: number; likes: number; storeId:string|null; storeName:string|null }

export function publicStories(q = '') {
  return rows<PublicStory>(`SELECT ${storyFields} ${storyFrom}
    WHERE s.published_at IS NOT NULL AND s.hidden_at IS NULL AND (?='' OR LOCATE(?,CONCAT_WS(' ',s.title,p.name,u.display_name))>0)
    ORDER BY s.published_at DESC,s.id LIMIT 60`, [q,q])
}

h5StoriesRouter.get('/stories', async (req,res) => {
  const {q} = z.object({q:z.string().trim().max(60).default('')}).parse(req.query)
  res.json({stories:await publicStories(q)})
})

h5StoriesRouter.get('/stories/:id', async (req,res) => {
  const [story] = await rows(`SELECT ${storyFields},s.scenes ${storyFrom}
    WHERE s.id=? AND s.published_at IS NOT NULL AND s.hidden_at IS NULL`, [uuid.parse(req.params.id)])
  if (!story) throw new HttpError(404, '作品未发布或已撤回')
  res.json({story})
})

h5StoriesRouter.get('/stories/:id/cover', async (req,res) => {
  const [cover] = await rows<{fileKey:string}>(`SELECT a.file_key AS fileKey ${storyFrom}
    WHERE s.id=? AND s.published_at IS NOT NULL AND s.hidden_at IS NULL`, [uuid.parse(req.params.id)])
  res.type('webp').send(await photoThumbnail(cover?.fileKey, 800))
})

h5StoriesRouter.get('/my-stories', requireAuth, async (req,res) => {
  const stories = await rows(`SELECT ${storyFields},s.pet_id AS petId,s.cover_asset_id AS coverAssetId,
    s.scenes,s.updated_at AS updatedAt,(s.hidden_at IS NOT NULL) AS hidden ${storyFrom}
    WHERE s.user_id=? ORDER BY s.updated_at DESC,s.id LIMIT 100`, [req.user.id])
  res.json({stories})
})

h5StoriesRouter.get('/my-story-reactions', requireAuth, async (req,res) => {
  const [favorites, likes] = await Promise.all([
    rows(`SELECT ${storyFields} ${storyFrom} JOIN h5_story_reactions saved ON saved.story_id=s.id
      WHERE saved.user_id=? AND saved.kind='favorite' AND s.published_at IS NOT NULL AND s.hidden_at IS NULL
      ORDER BY s.published_at DESC,s.id LIMIT 100`, [req.user.id]),
    rows<{id:string}>(`SELECT r.story_id AS id FROM h5_story_reactions r JOIN h5_stories s ON s.id=r.story_id
      WHERE r.user_id=? AND r.kind='like' AND s.published_at IS NOT NULL AND s.hidden_at IS NULL`, [req.user.id]),
  ])
  res.json({favorites,likedIds:likes.map(like => like.id)})
})

h5StoriesRouter.post('/stories', requireAuth, async (req,res) => {
  const {petId, title, scenes, coverAssetId, publish, storeId} = storyInput.extend({petId:uuid}).parse(req.body)
  const userId = req.user.id
  await ownedPet(userId,petId)
  await assertPetPhoto(userId,petId,coverAssetId)
  const id = randomUUID()
  await transaction(async connection => {
    if (storeId) await requirePublishingStore(connection,storeId,userId)
    await connection.execute(`INSERT INTO h5_stories (id,pet_id,user_id,title,scenes,cover_asset_id,store_id,published_at)
      VALUES (?,?,?,?,?,?,?,IF(?,UTC_TIMESTAMP(3),NULL))`, [id,petId,userId,title,JSON.stringify(scenes),coverAssetId,storeId??null,publish])
  })
  res.status(201).json({id})
})

h5StoriesRouter.put('/stories/:id', requireAuth, async (req,res) => {
  const id = uuid.parse(req.params.id)
  const input = storyInput.parse(req.body)
  const [story] = await rows<{petId:string}>('SELECT pet_id AS petId FROM h5_stories WHERE id=? AND user_id=?', [id,req.user.id])
  if (!story) throw new HttpError(404, '作品不存在')
  await assertPetPhoto(req.user.id,story.petId,input.coverAssetId)
  await transaction(async connection => {
    if (input.storeId) await requirePublishingStore(connection,input.storeId,req.user.id)
    await connection.execute(`UPDATE h5_stories SET title=?,scenes=?,cover_asset_id=?,
      store_id=IF(?, ?, store_id),published_at=IF(?,COALESCE(published_at,UTC_TIMESTAMP(3)),NULL) WHERE id=? AND user_id=?`,
    [input.title,JSON.stringify(input.scenes),input.coverAssetId,input.storeId!==undefined,input.storeId??null,input.publish,id,req.user.id])
  })
  const [saved] = await rows<{hidden:number}>('SELECT hidden_at IS NOT NULL AS hidden FROM h5_stories WHERE id=? AND user_id=?',[id,req.user.id])
  res.json({id,hidden:Boolean(saved?.hidden)})
})

h5StoriesRouter.put('/stories/:id/reaction', requireAuth, async (req,res) => {
  const id = uuid.parse(req.params.id)
  const {kind,active} = z.object({kind:z.enum(['like','favorite']),active:z.boolean()}).strict().parse(req.body)
  const likes = await transaction(async conn => {
    const [[story]] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM h5_stories WHERE id=? AND published_at IS NOT NULL AND hidden_at IS NULL FOR SHARE', [id])
    if (!story) throw new HttpError(404, '作品未发布或已撤回')
    const params = [id,req.user.id,kind]
    if (active) await conn.execute(`INSERT INTO h5_story_reactions (story_id,user_id,kind) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE kind=kind`, params)
    else await conn.execute('DELETE FROM h5_story_reactions WHERE story_id=? AND user_id=? AND kind=?',params)
    const [[result]] = await conn.execute<RowDataPacket[]>("SELECT COUNT(*) AS likes FROM h5_story_reactions WHERE story_id=? AND kind='like'",[id])
    return Number(result.likes)
  })
  res.json({likes})
})
