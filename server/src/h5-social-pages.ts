import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { ownedPet } from './assets.js'
import { requireAuth } from './auth.js'
import { db, rows, transaction } from './db.js'
import { districtAreaIds, districtById, districtsInServiceRegion, knownDistrictInput, withDistrict } from './districts.js'
import { HttpError } from './errors.js'
import { h5Area } from './h5-directory.js'

export const h5SocialPagesRouter = Router()
const uuid = z.string().uuid()
const intent = z.enum(['friends','dating','both'])
const message = z.object({body:z.string().trim().min(1,'请输入内容').max(500)}).strict()
const commentFields = `SELECT c.id,c.body,c.created_at AS createdAt,u.display_name AS author
  FROM h5_post_comments c JOIN users u ON u.id=c.user_id`

h5SocialPagesRouter.get('/posts/:id/comments', async (req,res) => {
  const postId = uuid.parse(req.params.id)
  const comments = await rows(`${commentFields} JOIN h5_posts post ON post.id=c.post_id AND post.hidden_at IS NULL
    WHERE c.post_id=? ORDER BY c.created_at DESC,c.id LIMIT 60`,[postId])
  res.json({comments})
})

h5SocialPagesRouter.get('/my-comments/:id', requireAuth, async (req,res) => {
  const ids = await rows<{id:string}>('SELECT id FROM h5_post_comments WHERE post_id=? AND user_id=?',
    [uuid.parse(req.params.id),req.user.id])
  res.json({ids:ids.map(comment => comment.id)})
})

h5SocialPagesRouter.post('/posts/:id/comments', requireAuth, async (req,res) => {
  const postId = uuid.parse(req.params.id)
  const {body} = message.parse(req.body)
  const id = randomUUID()
  const [result] = await db.execute<ResultSetHeader>(`INSERT INTO h5_post_comments (id,post_id,user_id,body)
    SELECT ?,id,?,? FROM h5_posts WHERE id=? AND hidden_at IS NULL`, [id,req.user.id,body,postId])
  if (!result.affectedRows) throw new HttpError(404,'动态不存在')
  const [comment] = await rows(`${commentFields} WHERE c.id=?`,[id])
  res.status(201).json({comment})
})

h5SocialPagesRouter.delete('/posts/:id/comments/:commentId', requireAuth, async (req,res) => {
  const ids = z.object({id:uuid,commentId:uuid}).parse(req.params)
  const [result] = await db.execute<ResultSetHeader>(
    'DELETE FROM h5_post_comments WHERE id=? AND post_id=? AND user_id=?', [ids.commentId,ids.id,req.user.id])
  if (!result.affectedRows) throw new HttpError(404,'评论不存在')
  res.json({ok:true})
})

const ageSql = 'GREATEST(0,TIMESTAMPDIFF(MONTH,p.birthday,UTC_DATE()))'
const matchFields = `SELECT m.pet_id AS petId,p.name AS petName,p.species,p.breed,p.gender,
  ${ageSql} AS ageMonths,m.area,m.intent,m.introduction`
type PublicMatch = RowDataPacket & {area: string}
h5SocialPagesRouter.get('/matches', async (req,res) => {
  const filters = z.object({area:h5Area.optional(),district:knownDistrictInput.optional(),intent:intent.optional(),species:z.enum(['cat','dog','other']).optional(),
    breed:z.string().trim().max(60).default(''), gender:z.enum(['female','male']).optional(),
    stage:z.enum(['juvenile','adult','senior']).optional()}).parse(req.query)
  const condition: string[] = []
  const values: string[] = []
  if (filters.district) {
    const city = districtById(filters.district)?.serviceCityCode
    const ids = districtAreaIds(city ? districtsInServiceRegion(city) : [filters.district])
    condition.push(`m.area IN (${ids.map(() => '?').join(',')})`)
    values.push(...ids)
  } else if (filters.area) {condition.push('m.area=?');values.push(filters.area)}
  if (filters.intent) {condition.push("(m.intent=? OR m.intent='both')");values.push(filters.intent)}
  if (filters.species) {condition.push('p.species=?');values.push(filters.species)}
  if (filters.breed) {condition.push('LOCATE(?,p.breed)>0');values.push(filters.breed)}
  if (filters.gender) {condition.push('p.gender=?');values.push(filters.gender)}
  const ages = {juvenile:`${ageSql}<12`,adult:`${ageSql} BETWEEN 12 AND 83`,senior:`${ageSql}>=84`}
  if (filters.stage) condition.push(ages[filters.stage])
  const matches = await rows<PublicMatch>(`${matchFields} FROM h5_match_profiles m JOIN pets p ON p.id=m.pet_id
    ${condition.length ? 'WHERE '+condition.join(' AND ') : ''} ORDER BY m.updated_at DESC,m.pet_id LIMIT 60`, values)
  res.json({matches:matches.map(withDistrict)})
})

h5SocialPagesRouter.get('/my-matches', requireAuth, async (req,res) => {
  const matches = await rows<PublicMatch>(`${matchFields} FROM h5_match_profiles m JOIN pets p ON p.id=m.pet_id WHERE p.user_id=?`, [req.user.id])
  res.json({matches:matches.map(withDistrict)})
})

h5SocialPagesRouter.put('/my-matches/:petId', requireAuth, async (req,res) => {
  const petId = uuid.parse(req.params.petId)
  const data = z.object({area:z.union([h5Area,knownDistrictInput]),intent,introduction:z.string().trim().max(300).default('')}).strict().parse(req.body)
  await ownedPet(req.user.id,petId)
  const fields = [data.area,data.intent,data.introduction]
  await db.execute(`INSERT INTO h5_match_profiles (pet_id,area,intent,introduction) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE area=?,intent=?,introduction=?`,[petId,...fields,...fields])
  res.json({ok:true})
})

h5SocialPagesRouter.delete('/my-matches/:petId', requireAuth, async (req,res) => {
  const petId = uuid.parse(req.params.petId)
  await ownedPet(req.user.id,petId)
  await db.execute('DELETE FROM h5_match_profiles WHERE pet_id=?',[petId])
  res.json({ok:true})
})

const requestSelect = `SELECT f.id,f.status,source.name AS sourceName,target.name AS targetName,
  f.created_at AS createdAt,(target.user_id=?) AS incoming
  FROM h5_friend_requests f JOIN pets source ON source.id=f.source_pet_id JOIN pets target ON target.id=f.target_pet_id`
h5SocialPagesRouter.get('/friend-requests', requireAuth, async (req,res) => {
  const requests = await rows(`${requestSelect} WHERE source.user_id=? OR target.user_id=?
    ORDER BY f.created_at DESC,f.id LIMIT 100`, Array(3).fill(req.user.id))
  res.json({requests})
})

h5SocialPagesRouter.post('/friend-requests', requireAuth, async (req,res) => {
  const {sourcePetId,targetPetId} = z.object({sourcePetId:uuid,targetPetId:uuid}).strict().parse(req.body)
  await ownedPet(req.user.id,sourcePetId)
  const [target] = await rows<{userId:string}>(`SELECT p.user_id AS userId FROM h5_match_profiles m
    JOIN pets p ON p.id=m.pet_id WHERE m.pet_id=?`,[targetPetId])
  if (!target) throw new HttpError(404,'这个宠物已退出匹配')
  if (target.userId === req.user.id) throw new HttpError(400,'请选择其他账号的宠物')
  await db.execute(`INSERT INTO h5_friend_requests (id,source_pet_id,target_pet_id) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE id=id`,[randomUUID(),sourcePetId,targetPetId])
  const [request] = await rows(`${requestSelect} WHERE source.id=? AND target.id=?`,
    [req.user.id,sourcePetId,targetPetId])
  res.json({request})
})

h5SocialPagesRouter.route('/friend-requests/:id').patch(requireAuth, respondToInvite).put(requireAuth, respondToInvite)
async function respondToInvite(req: Request, res: Response) {
  const id = uuid.parse(req.params.id)
  const {status} = z.object({status:z.enum(['accepted','declined'])}).strict().parse(req.body)
  const [updated] = await db.execute<ResultSetHeader>(`UPDATE h5_friend_requests f JOIN pets p ON p.id=f.target_pet_id
    SET f.status=? WHERE f.id=? AND p.user_id=? AND f.status='pending'`,[status,id,req.user.id])
  if (!updated.affectedRows) throw new HttpError(404,'邀请已处理或不存在')
  res.json({ok:true})
}

const memberSql = `SELECT r.id FROM h5_engagements r JOIN h5_catalog_items i ON i.id=r.item_id
  WHERE r.user_id=? AND i.id=? AND i.kind='group' AND i.module='friends' AND i.published=TRUE AND r.status='joined'`
const chatFields = `SELECT m.id,m.body,m.created_at AS createdAt,u.display_name AS author
  FROM h5_group_messages m JOIN users u ON u.id=m.user_id`
h5SocialPagesRouter.get('/groups/:id/messages', requireAuth, async (req,res) => {
  const id = uuid.parse(req.params.id)
  const [member] = await rows(memberSql,[req.user.id,id])
  if (!member) throw new HttpError(403,'加入社群后即可查看聊天')
  const messages = await rows(`${chatFields} WHERE m.group_id=? ORDER BY m.created_at DESC,m.id LIMIT 80`,[id])
  res.json({messages:messages.reverse()})
})

h5SocialPagesRouter.post('/groups/:id/messages', requireAuth, async (req,res) => {
  const groupId = uuid.parse(req.params.id)
  const {body} = message.parse(req.body)
  const userId = req.user.id
  const id = randomUUID()
  await transaction(async conn => {
    const [[member]] = await conn.execute<RowDataPacket[]>(`${memberSql} FOR SHARE`,[userId,groupId])
    if (!member) throw new HttpError(403,'加入社群后即可发言')
    await conn.execute('INSERT INTO h5_group_messages (id,group_id,user_id,body) VALUES (?,?,?,?)',
      [id,groupId,userId,body])
  })
  const [record] = await rows(`${chatFields} WHERE m.id=?`,[id])
  res.status(201).json({message:record})
})

const creatorFields = `SELECT c.id,c.bio,c.featured,u.display_name AS name,
  (SELECT COUNT(*) FROM h5_posts p WHERE p.user_id=c.user_id AND p.hidden_at IS NULL) AS postCount
  FROM h5_creators c JOIN users u ON u.id=c.user_id`
h5SocialPagesRouter.get('/creators', async (_req,res) => {
  const creators = await rows(`${creatorFields} WHERE c.published=TRUE ORDER BY c.featured DESC,c.id LIMIT 60`)
  res.json({creators})
})

h5SocialPagesRouter.get('/creators/:id', async (req,res) => {
  const id = uuid.parse(req.params.id)
  const [creator] = await rows(`${creatorFields} WHERE c.id=? AND c.published=TRUE`,[id])
  if (!creator) throw new HttpError(404,'这个达人主页暂未发布')
  const posts = await rows(`SELECT p.id,p.title,p.created_at AS createdAt FROM h5_posts p
    JOIN h5_creators c ON c.user_id=p.user_id WHERE c.id=? AND c.published=TRUE AND p.hidden_at IS NULL
    ORDER BY p.created_at DESC,p.id LIMIT 60`,[id])
  res.json({creator,posts})
})

h5SocialPagesRouter.get('/creator-account', requireAuth, async (req,res) => {
  const [creator] = await rows(`${creatorFields} WHERE c.user_id=? AND c.published=TRUE`,[req.user.id])
  res.json({creator:creator ?? null})
})

h5SocialPagesRouter.get('/community-progress', requireAuth, async (req,res) => {
  const [progress] = await rows(`SELECT
    (SELECT COUNT(*) FROM h5_posts WHERE user_id=?) AS posts,
    (SELECT COUNT(*) FROM h5_post_comments WHERE user_id=?) AS comments,
    (SELECT COUNT(*) FROM h5_engagements e JOIN h5_catalog_items i ON i.id=e.item_id
      WHERE e.user_id=? AND e.status='joined' AND i.kind='group') AS groups`,Array(3).fill(req.user.id))
  res.json({progress})
})
