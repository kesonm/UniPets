import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader } from 'mysql2/promise'
import sharp from 'sharp'
import { z } from 'zod'
import { availableCatClip, catClips, catDefaultAction, catIdleGroups, catInteractiveActions, catSleepAction, type CatClipId, type CatKeyAction, type CatManifest } from '../../shared/cat-motion.mjs'
import { areaDistance, h5Areas } from '../../shared/h5-areas.mjs'
import { postPetTypes, type PostPetType } from '../../shared/h5-discovery.mjs'
import { ownedAsset, ownedPet, photoThumbnail, storagePath, type Asset } from './assets.js'
import { optionalAuth, requireAuth } from './auth.js'
import { config } from './config.js'
import { db, rows, transaction } from './db.js'
import { HttpError } from './errors.js'
import { getMotionAssets, getMotionPoses } from './motion-batches.js'
import { h5ProgramsRouter } from './h5-programs.js'
import { h5DirectoryRouter } from './h5-directory.js'
import { h5OrdersRouter } from './h5-orders.js'
import { h5PetRecordsRouter } from './h5-pet-records.js'
import { h5StoriesRouter } from './h5-stories.js'
import { h5SocialPagesRouter } from './h5-social-pages.js'
import { h5OperationsRouter } from './h5-operations.js'
import { h5ServicePostsRouter, servicePosts } from './h5-service-posts.js'
import { recommendedPosts, type PublicPost } from './h5-recommendations.js'
import { districtInput, districtRouter } from './districts.js'

export const h5Router = Router()
h5Router.use('/operations',h5OperationsRouter)
h5Router.use(districtRouter,h5ServicePostsRouter,h5ProgramsRouter,h5DirectoryRouter,h5OrdersRouter,h5PetRecordsRouter,h5StoriesRouter,h5SocialPagesRouter)
const uuid = z.string().uuid()
const area = z.string().refine(id => h5Areas.some(item => item.id === id), '请选择已有商圈')
const species = z.enum(['cat','dog','other'])
const topics = z.enum(['daily','travel','rescue','help'])
const petTypeInput = z.enum(postPetTypes)
const pageSize = 18

const demoCover = `LEFT JOIN assets image ON image.id=p.avatar_asset_id AND image.user_id=p.user_id
  AND image.pet_id=p.id AND image.kind='photo'`
const demoActions = [...catIdleGroups.flatMap(group => group.actions),...catInteractiveActions]
const previewTileSize = 160
const roomTileSize = 144
const roomActions: readonly CatClipId[] = [
  catDefaultAction,
  'start_left','walk_left','stop_left','turn_right','start_right','walk_right','stop_right','turn_left',
  'lower_to_crouch','crouch_to_lie','lie_to_sleep',catSleepAction,'wake_up','lie_to_stand','jump',
]

h5Router.get('/demo-pets', async (_req, res) => {
  const pets = config.h5DemoOwnerId ? await rows<{id:string;species:string}>(`SELECT p.id,p.name,p.species,p.breed,p.gender,
    DATE_FORMAT(p.birthday,'%Y-%m-%d') AS birthday, (image.id IS NOT NULL) AS hasCover,
    (SELECT identity_number FROM pet_identities WHERE pet_id=p.id) AS identityNumber
    FROM pets p ${demoCover} WHERE p.user_id=? ORDER BY (p.id=?) DESC,p.created_at DESC,p.id DESC`,
  [config.h5DemoOwnerId,config.h5DemoMotionPetId]) : []
  res.json({pets:pets.map(pet => pet.id===config.h5DemoMotionPetId && pet.species==='cat' ?
    {...pet,interactiveRoom:true} : pet)})
})

h5Router.get('/demo-pets/:id/cover', async (req, res) => {
  const [cover] = await rows<{fileKey:string}>(`SELECT image.file_key AS fileKey FROM pets p ${demoCover}
    WHERE p.id=? AND p.user_id=? AND image.id IS NOT NULL`, [uuid.parse(req.params.id),config.h5DemoOwnerId])
  res.type('webp').send(await photoThumbnail(cover?.fileKey, 600))
})

async function demoMotionLibrary(petId: string): Promise<CatManifest<Asset>> {
  await ownedPet(config.h5DemoOwnerId,petId)
  if (petId !== config.h5DemoMotionPetId) return {poses:{},assets:[]}
  const [poses,assets] = await Promise.all([getMotionPoses(petId),getMotionAssets(config.h5DemoOwnerId,petId)])
  return {poses,assets:assets.filter(asset => asset.kind==='sprite' && asset.frames>1)}
}

function demoClip(action: CatKeyAction, library: CatManifest<Asset>) {
  return availableCatClip(action,library) ??
    (action===catSleepAction ? availableCatClip('sleep_breathe',library) : undefined)
}

function roomClip(action: CatClipId, library: CatManifest<Asset>) {
  const fallback = action===catDefaultAction ? 'stand_idle' : action===catSleepAction ? 'sleep_breathe' : undefined
  return availableCatClip(action,library,true) ?? (fallback && availableCatClip(fallback,library,true))
}

function previewMotion(action: CatClipId, asset: Asset, path: string) {
  const {id,frames,columns,rows,fps,imageVersion,motionJoinable,backgroundRemoved} = asset
  return {id,action,name:catClips[action].label,frames,columns,rows,fps,imageVersion,motionJoinable,backgroundRemoved,
    imagePath:`${path}/${id}/image?v=${imageVersion}`}
}

async function demoMotionImage(assetId: string, tileSize: number) {
  const asset = await ownedAsset(config.h5DemoOwnerId,assetId)
  try {
    return await sharp(storagePath(asset.fileKey),{limitInputPixels:25_000_000}).resize({
      width:Math.min(asset.width,asset.columns*tileSize),
      height:Math.min(asset.height,asset.rows*tileSize),
      fit:'fill',
    }).webp({quality:84}).toBuffer()
  } catch {
    throw new HttpError(404,'预览素材不存在')
  }
}

h5Router.get('/demo-pets/:id/motions', async (req,res) => {
  const petId = uuid.parse(req.params.id)
  const library = await demoMotionLibrary(petId)
  const assets = demoActions.flatMap(action => {
    const asset = demoClip(action,library)
    return asset ? [previewMotion(action,asset,`/h5/demo-pets/${petId}/motions`)] : []
  })
  res.json({poses:{},assets})
})

h5Router.get('/demo-pets/:id/motions/:assetId/image', async (req,res) => {
  const petId = uuid.parse(req.params.id)
  const assetId = uuid.parse(req.params.assetId)
  const library = await demoMotionLibrary(petId)
  if (!demoActions.some(action => demoClip(action,library)?.id===assetId)) throw new HttpError(404,'预览素材不存在')
  res.set('Cache-Control','private, max-age=300').type('webp').send(await demoMotionImage(assetId,previewTileSize))
})

h5Router.get('/demo-pets/:id/room', async (req,res) => {
  const petId = uuid.parse(req.params.id)
  if (petId!==config.h5DemoMotionPetId) throw new HttpError(404,'这个宠物还没有开放互动房间')
  const library = await demoMotionLibrary(petId)
  const assets = roomActions.flatMap(action => {
    const asset = roomClip(action,library)
    return asset ? [previewMotion(action,asset,`/h5/demo-pets/${petId}/room`)] : []
  })
  res.json({assets})
})

h5Router.get('/demo-pets/:id/room/:assetId/image', async (req,res) => {
  const petId = uuid.parse(req.params.id)
  const assetId = uuid.parse(req.params.assetId)
  if (petId!==config.h5DemoMotionPetId) throw new HttpError(404,'预览素材不存在')
  const library = await demoMotionLibrary(petId)
  if (!roomActions.some(action => roomClip(action,library)?.id===assetId)) throw new HttpError(404,'预览素材不存在')
  res.set('Cache-Control','private, max-age=300').type('webp').send(await demoMotionImage(assetId,roomTileSize))
})

const profilePetType = `CASE WHEN p.species='other' AND (LOCATE('兔',p.breed)>0 OR LOCATE('rabbit',LOWER(p.breed))>0)
  THEN 'rabbit' ELSE p.species END`
const postPetType = `COALESCE(post.pet_type,(${profilePetType}))`
const postSelect = `SELECT post.id,post.title,post.body,post.area,post.topic,post.created_at AS createdAt,
  p.name AS petName,p.species,p.breed,${postPetType} AS petType,u.display_name AS author,
  (post.asset_id IS NOT NULL AND post.hidden_at IS NULL) AS hasImage,
  (post.hidden_at IS NOT NULL) AS hidden,
  (SELECT COUNT(*) FROM h5_reactions r WHERE r.post_id=post.id AND r.kind='like') AS likes
  FROM h5_posts post JOIN pets p ON p.id=post.pet_id JOIN users u ON u.id=post.user_id`

h5Router.get('/posts', async (req, res) => {
  const query = z.object({sort:z.enum(['recommended','latest','hot','near']).default('recommended'),
    area:area.optional(), q:z.string().trim().max(60).default(''), species:species.optional(),
    petType:petTypeInput.optional(), breed:z.string().trim().max(80).default(''),
    topic:topics.optional(),page:z.coerce.number().int().min(1).max(200).default(1)}).parse(req.query)
  const current = h5Areas.find(item => item.id === query.area)
  const order: (string|number)[] = []
  let rank = ''
  if (query.sort === 'hot') {
    rank = `(SELECT COUNT(*) FROM h5_reactions recent WHERE recent.post_id=post.id
      AND recent.kind='like' AND recent.created_at>=UTC_TIMESTAMP(3)-INTERVAL 7 DAY) DESC,`
  } else if (query.sort === 'recommended') {
    if (query.species) {
      rank = '(p.species=?) DESC,'
      order.push(query.species)
    }
    rank += `(likes / (1 + GREATEST(0,TIMESTAMPDIFF(DAY,post.created_at,UTC_TIMESTAMP(3))))) DESC,`
  } else if (query.sort === 'near' && current) {
    const nearby = [...h5Areas].sort((a,b) => areaDistance(current,a) - areaDistance(current,b))
    rank = `COALESCE(NULLIF(FIELD(post.area,${nearby.map(() => '?').join(',')}),0),?) ASC,`
    order.push(...nearby.map(item => item.id),nearby.length+1)
  }
  const records = await rows(`${postSelect}
    WHERE post.hidden_at IS NULL AND (? IS NULL OR post.topic=?)
      AND (? IS NULL OR ${postPetType}=?)
      AND (?='' OR p.breed=?)
      AND (?='' OR LOCATE(?,CONCAT_WS(' ',post.title,post.body,p.name,p.breed,u.display_name,
        CASE ${postPetType} WHEN 'cat' THEN '猫 猫咪' WHEN 'dog' THEN '狗 狗狗 犬' WHEN 'rabbit' THEN '兔 兔子' ELSE '' END))>0)
    ORDER BY ${rank} post.created_at DESC,post.id DESC LIMIT ? OFFSET ?`,
  [query.topic??null,query.topic??null,query.petType??null,query.petType??null,query.breed,query.breed,
    query.q,query.q,...order,pageSize+1,(query.page-1)*pageSize])
  res.json({ posts:records.slice(0,pageSize), hasMore:records.length>pageSize })
})

h5Router.get('/posts/breeds', async (req, res) => {
  const { petType } = z.object({ petType: petTypeInput.optional() }).parse(req.query)
  const breeds = await rows<{ breed: string }>(`SELECT DISTINCT p.breed FROM h5_posts post JOIN pets p ON p.id=post.pet_id
    WHERE post.hidden_at IS NULL AND p.breed<>'' AND (? IS NULL OR ${postPetType}=?)
    ORDER BY p.breed LIMIT 150`, [petType ?? null, petType ?? null])
  res.json({ breeds: breeds.map(row => row.breed) })
})

h5Router.get('/posts/recommendations', optionalAuth, async (req, res) => {
  const query = z.object({
    district: districtInput.optional(), seed: z.string().regex(/^[a-zA-Z0-9-]{1,40}$/).default('guest'),
  }).parse(req.query)
  const owner = req.user?.id
  const [posts, services] = await Promise.all([
    rows<PublicPost>(`${postSelect} WHERE post.hidden_at IS NULL ORDER BY post.created_at DESC,post.id DESC LIMIT 60`),
    servicePosts({ district: query.district, q: '', limit: 60, offset: 0 }, owner),
  ])
  res.json({ items: await recommendedPosts(posts, services, owner, query.seed) })
})

h5Router.get('/posts/:id', async (req, res) => {
  const [post] = await rows(`${postSelect} WHERE post.id=? AND post.hidden_at IS NULL`, [uuid.parse(req.params.id)])
  if (!post) throw new HttpError(404, '动态不存在')
  res.json({post})
})

h5Router.get('/posts/:id/image', async (req, res) => {
  const [image] = await rows<{fileKey:string}>(`SELECT a.file_key AS fileKey FROM h5_posts post
    JOIN assets a ON a.id=post.asset_id AND a.user_id=post.user_id AND a.pet_id=post.pet_id AND a.kind='photo'
    WHERE post.id=? AND post.hidden_at IS NULL`, [uuid.parse(req.params.id)])
  res.type('webp').send(await photoThumbnail(image?.fileKey, 960))
})

h5Router.use(requireAuth)

h5Router.get('/me', async (req, res) => {
  const owner = req.user.id
  const [published, favorites, reactions] = await Promise.all([
    rows(`${postSelect} WHERE post.user_id=? ORDER BY post.created_at DESC,post.id DESC LIMIT 100`, [owner]),
    rows(`${postSelect} JOIN h5_reactions saved ON saved.post_id=post.id AND saved.kind='favorite'
      WHERE saved.user_id=? AND post.hidden_at IS NULL ORDER BY saved.created_at DESC,post.id DESC LIMIT 100`, [owner]),
    rows<{id:string;kind:string}>(`SELECT r.post_id AS id,r.kind FROM h5_reactions r JOIN h5_posts post ON post.id=r.post_id
      WHERE r.user_id=? AND post.hidden_at IS NULL`, [owner]),
  ])
  res.json({published,favorites,likedIds:reactions.filter(item=>item.kind==='like').map(item=>item.id),
    savedIds:reactions.filter(item=>item.kind==='favorite').map(item=>item.id)})
})

h5Router.post('/posts', async (req, res) => {
  const input = z.object({petId:uuid, assetId:uuid.nullable().default(null), area:area.nullable().default(null),
    petType:z.enum(['rabbit','other']).optional(),
    topic:topics.default('daily'),title:z.string().trim().min(1,'请填写标题').max(100), body:z.string().trim().max(3000).default('')}).parse(req.body)
  const owner = req.user.id
  const [pet] = await rows<{species: PostPetType}>('SELECT species FROM pets WHERE id=? AND user_id=?', [input.petId,owner])
  if (!pet) throw new HttpError(404,'宠物不存在')
  if (input.assetId) {
    const asset = await ownedAsset(owner,input.assetId)
    if (asset.kind!=='photo' || asset.petId!==input.petId) throw new HttpError(400,'请选择当前宠物的照片')
  }
  const id = randomUUID()
  await db.execute(`INSERT INTO h5_posts (id,user_id,pet_id,asset_id,title,body,area,topic,pet_type,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
  [id,owner,input.petId,input.assetId,input.title,input.body,input.area,input.topic,pet.species==='other' ? input.petType ?? null : null])
  const [post] = await rows(`${postSelect} WHERE post.id=?`, [id])
  res.status(201).json({post})
})

h5Router.delete('/posts/:id', async (req, res) => {
  const [deleted] = await db.execute<ResultSetHeader>('DELETE FROM h5_posts WHERE id=? AND user_id=?',[
    uuid.parse(req.params.id),req.user.id,
  ])
  if (!deleted.affectedRows) throw new HttpError(404,'动态不存在')
  res.json({ok:true})
})

h5Router.put('/posts/:id/reaction', async (req, res) => {
  const postId = uuid.parse(req.params.id)
  const {kind,active} = z.object({kind:z.enum(['like','favorite']),active:z.boolean()}).parse(req.body)
  const owner = req.user.id
  const likes = await transaction(async conn => {
    const [found] = await conn.execute('SELECT id FROM h5_posts WHERE id=? AND hidden_at IS NULL FOR SHARE', [postId])
    if (!(found as unknown[]).length) throw new HttpError(404,'动态不存在')
    if (active) await conn.execute(`INSERT INTO h5_reactions (post_id,user_id,kind,created_at)
      VALUES (?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE post_id=VALUES(post_id)`, [postId,owner,kind])
    else await conn.execute('DELETE FROM h5_reactions WHERE post_id=? AND user_id=? AND kind=?',[postId,owner,kind])
    const [totals] = await conn.execute("SELECT COUNT(*) AS likes FROM h5_reactions WHERE post_id=? AND kind='like'",[postId])
    return (totals as {likes:number}[])[0].likes
  })
  res.json({active,likes})
})
