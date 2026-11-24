import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { serviceCategories } from '../../shared/h5-discovery.mjs'
import { legacyDistricts } from '../../shared/h5-districts.mjs'
import { optionalAuth, requireAuth } from './auth.js'
import { catalogVenue } from './catalog.js'
import { db, rows, transaction } from './db.js'
import { districtInput } from './districts.js'
import { HttpError } from './errors.js'

export const h5ServicePostsRouter = Router()
const uuid = z.string().uuid()
const pageSize = 16
const category = z.string().refine(id => serviceCategories.some(item => item.id === id), '服务分类无效')
const route = '/catalog/service-posts'
const from = 'FROM h5_catalog_items i JOIN h5_stores store ON store.id=i.store_id'
const visible = "i.module='services' AND i.kind NOT IN ('product','group') AND i.published=TRUE AND store.enabled=TRUE"
const district = `COALESCE(store.district_code, CASE store.area
  ${Object.entries(legacyDistricts).map(([area, id]) => `WHEN '${area}' THEN '${id}'`).join(' ')}
  ELSE NULL END)`
const categoryColumn = `CASE WHEN i.category='self-service' THEN 'grooming'
  WHEN i.category IN (${serviceCategories.map(item => `'${item.id}'`).join(',')}) THEN i.category
  ELSE 'other' END`
const fields = `i.id,i.title,i.description,${categoryColumn} AS category,
  store.name AS provider,${catalogVenue} AS venue,store.phone,${district} AS district,
  i.price_cents AS priceCents,i.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM h5_service_likes l WHERE l.item_id=i.id) AS likes,
  (SELECT COUNT(*) FROM h5_service_comments c WHERE c.item_id=i.id) AS commentCount,
  EXISTS(SELECT 1 FROM h5_service_likes l WHERE l.item_id=i.id AND l.user_id=?) AS liked`

export interface ServiceRecord {
  id: string
  title: string
  description: string
  category: string
  provider: string
  venue: string
  phone: string
  district: string | null
  priceCents: number | null
  updatedAt: Date
  likes: number
  commentCount: number
  liked: number
}

interface ServiceFilter {
  district?: string
  category?: string
  q: string
  limit: number
  offset: number
}
export function servicePosts(filter: ServiceFilter, viewer?: string) {
  return rows<ServiceRecord>(`SELECT ${fields} ${from} WHERE ${visible}
    AND (? IS NULL OR ${district}=?)
    AND (? IS NULL OR (${categoryColumn})=?)
    AND (?='' OR LOCATE(?,CONCAT_WS(' ',i.title,i.description,store.name,${catalogVenue}))>0)
    ORDER BY i.updated_at DESC,i.id DESC LIMIT ? OFFSET ?`, [
    viewer ?? null, filter.district ?? null, filter.district ?? null, filter.category ?? null, filter.category ?? null,
    filter.q, filter.q, filter.limit, filter.offset,
  ])
}

h5ServicePostsRouter.get(route, optionalAuth, async (req, res) => {
  const filter = z.object({
    district: districtInput.optional(), category: category.optional(),
    q: z.string().trim().max(60).default(''),
    page: z.coerce.number().int().min(1).max(200).default(1),
  }).parse(req.query)
  const posts = await servicePosts({ ...filter, limit: pageSize + 1, offset: (filter.page - 1) * pageSize }, req.user?.id)
  res.json({ posts: posts.slice(0, pageSize), hasMore: posts.length > pageSize })
})

h5ServicePostsRouter.get(route + '/:id', optionalAuth, async (req, res) => {
  const [post] = await rows<ServiceRecord>(
    `SELECT ${fields} ${from} WHERE i.id=? AND ${visible}`, [req.user?.id ?? null, uuid.parse(req.params.id)],
  )
  if (!post) throw new HttpError(404, '服务帖未发布或已下架')
  res.json({ post })
})

h5ServicePostsRouter.put(route + '/:id/like', requireAuth, async (req, res) => {
  const id = uuid.parse(req.params.id)
  const { active } = z.object({ active: z.boolean() }).strict().parse(req.body)
  const likes = await transaction(async conn => {
    const [[post]] = await conn.execute<RowDataPacket[]>(`SELECT i.id ${from}
      WHERE i.id=? AND ${visible} FOR SHARE OF i, store`, [id])
    if (!post) throw new HttpError(404, '服务帖未发布或已下架')
    const key = [id, req.user.id]
    if (active) {
      await conn.execute('INSERT INTO h5_service_likes (item_id,user_id) VALUES (?,?) ON DUPLICATE KEY UPDATE item_id=item_id', key)
    } else {
      await conn.execute('DELETE FROM h5_service_likes WHERE item_id=? AND user_id=?', key)
    }
    const [[total]] = await conn.execute<RowDataPacket[]>('SELECT COUNT(*) AS likes FROM h5_service_likes WHERE item_id=?', [id])
    return total.likes
  })
  res.json({ active, likes })
})

const commentFields = 'c.id,c.body,c.created_at AS createdAt,u.display_name AS author'
h5ServicePostsRouter.get(route + '/:id/comments', async (req, res) => {
  const id = uuid.parse(req.params.id)
  const [post] = await rows(`SELECT i.id ${from} WHERE i.id=? AND ${visible}`, [id])
  if (!post) throw new HttpError(404, '服务帖未发布或已下架')
  const comments = await rows(`SELECT ${commentFields} ${from}
    JOIN h5_service_comments c ON c.item_id=i.id JOIN users u ON u.id=c.user_id
    WHERE i.id=? AND ${visible} ORDER BY c.created_at DESC,c.id DESC LIMIT 60`, [id])
  res.json({ comments })
})

h5ServicePostsRouter.post(route + '/:id/comments', requireAuth, async (req, res) => {
  const itemId = uuid.parse(req.params.id)
  const { body } = z.object({ body: z.string().trim().min(1, '请输入评论').max(500) }).strict().parse(req.body)
  const id = randomUUID()
  const [result] = await db.execute<ResultSetHeader>(`INSERT INTO h5_service_comments (id,item_id,user_id,body)
    SELECT ?,i.id,?,? ${from} WHERE i.id=? AND ${visible}`, [id, req.user.id, body, itemId])
  if (!result.affectedRows) throw new HttpError(404, '服务帖未发布或已下架')
  const [comment] = await rows(`SELECT ${commentFields} FROM h5_service_comments c
    JOIN users u ON u.id=c.user_id WHERE c.id=?`, [id])
  res.status(201).json({ comment })
})
