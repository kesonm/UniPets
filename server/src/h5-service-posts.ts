import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { serviceSorts, sortsByDistance, type ServiceCoordinates, type ServiceSort } from '../../shared/h5-discovery.mjs'
import { legacyDistricts } from '../../shared/h5-districts.mjs'
import { optionalAuth, requireAuth } from './auth.js'
import { catalogVenue, createCatalogItem, servicePostVisible as visible } from './catalog.js'
import { db, rows, transaction } from './db.js'
import { coordinatesInput, districtInput, districtsInServiceRegion, serviceRegionInput } from './districts.js'
import { HttpError } from './errors.js'
import { serviceRecommendation } from './h5-recommendations.js'
import { hasStoreContact, type StoreContact } from './h5-store-binding.js'
import { checkServiceCategory, getServiceCategories, serviceCategoryColumn, serviceCategoryId, serviceCategoryJoin, serviceCategoryLabel } from './service-categories.js'

export const h5ServicePostsRouter = Router()
const uuid = z.string().uuid()
const pageSize = 16
const route = '/catalog/service-posts'
const from = 'FROM h5_catalog_items i JOIN h5_stores store ON store.id=i.store_id'
const district = `COALESCE(store.district_code, CASE store.area
  ${Object.entries(legacyDistricts).map(([area, id]) => `WHEN '${area}' THEN '${id}'`).join(' ')}
  ELSE NULL END)`
const fields = `i.id,i.title,i.description,${serviceCategoryColumn} AS category,${serviceCategoryLabel} AS categoryLabel,
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
  categoryLabel: string
  provider: string
  venue: string
  phone: string
  district: string | null
  priceCents: number | null
  updatedAt: Date
  likes: number
  commentCount: number
  liked: number
  distanceMeters?: number | null
}

interface ServiceFilter {
  district?: string
  category?: string
  region?: string
  sort?: ServiceSort
  location?: ServiceCoordinates
  q: string
  limit: number
  offset: number
}
const sortOrder: Record<Exclude<ServiceSort, 'recommended'>, string> = {
  'likes-desc': 'likes DESC',
  'likes-asc': 'likes ASC',
  'distance-asc': 'distanceMeters IS NULL, distanceMeters ASC',
  'distance-desc': 'distanceMeters IS NULL, distanceMeters DESC',
}

export async function servicePosts(filter: ServiceFilter, viewer?: string) {
  const conditions = [visible]
  const values: Array<string | number | null> = [viewer ?? null]
  let distance = ''
  if (filter.location) {
    distance = `, CASE WHEN store.latitude BETWEEN -90 AND 90 AND store.longitude > -180 AND store.longitude <= 180
      THEN ST_Distance_Sphere(POINT(?,?), POINT(store.longitude, store.latitude)) END AS distanceMeters`
    values.push(filter.location.longitude, filter.location.latitude)
  }
  if (filter.district) {
    conditions.push(`${district}=?`)
    values.push(filter.district)
  }
  if (filter.region) {
    const regionDistricts = districtsInServiceRegion(filter.region)
    const byCity = filter.region.endsWith('0000') ? 'store.city_code LIKE ?' : 'store.city_code=?'
    const legacy = regionDistricts.length
      ? ` OR (store.city_code IS NULL AND ${district} IN (${regionDistricts.map(() => '?').join(',')}))` : ''
    conditions.push(`(${byCity}${legacy})`)
    values.push(filter.region.endsWith('0000') ? filter.region.slice(0,2)+'%' : filter.region, ...regionDistricts)
  }
  if (filter.category) {
    conditions.push(`${serviceCategoryColumn}=?`)
    values.push(filter.category)
  }
  if (filter.q) {
    conditions.push(`LOCATE(?,CONCAT_WS(' ',i.title,i.description,store.name,${catalogVenue},${serviceCategoryLabel}))>0`)
    values.push(filter.q)
  }
  const recommendation = filter.sort === 'recommended' && viewer ? await serviceRecommendation(viewer) : undefined
  const sort = filter.sort === 'recommended' ? recommendation?.sql ?? 'likes DESC' : filter.sort && sortOrder[filter.sort]
  return rows<ServiceRecord>(`SELECT ${fields}${distance} ${from} ${serviceCategoryJoin}
    WHERE ${conditions.join(' AND ')} ORDER BY ${sort ? sort + ',' : ''} i.updated_at DESC,i.id DESC LIMIT ? OFFSET ?`,
    [...values, ...(recommendation?.values ?? []), filter.limit, filter.offset])
}

const filters = z.object({
  district: districtInput.optional(), region: serviceRegionInput.optional(), category: serviceCategoryId.optional(),
  q: z.string().trim().max(60).default(''),
  sort: z.enum(serviceSorts).default('recommended'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
})
async function readServicePosts(filter: z.infer<typeof filters> & { location?: ServiceCoordinates }, viewer?: string) {
  if (sortsByDistance(filter.sort) && !filter.location) throw new HttpError(400, '按距离排序需要定位')
  const posts = await servicePosts({
    ...filter, location: sortsByDistance(filter.sort) ? filter.location : undefined,
    limit: pageSize + 1, offset: (filter.page - 1) * pageSize,
  }, viewer)
  return { posts: posts.slice(0, pageSize), hasMore: posts.length > pageSize && filter.page < 10000 }
}

h5ServicePostsRouter.get('/catalog/service-categories', async (_req, res) => {
  res.json({ items: await getServiceCategories() })
})
h5ServicePostsRouter.get(route, optionalAuth, async (req, res) => {
  res.json(await readServicePosts(filters.parse(req.query), req.user?.id))
})
h5ServicePostsRouter.post(route, requireAuth, async (req,res) => {
  const item = z.object({
    storeId:uuid, category:serviceCategoryId,
    title:z.string().trim().min(1,'请填写服务名称').max(120),
    description:z.string().trim().min(1,'请填写服务详情').max(5000),
    priceCents:z.number().int().min(1).max(10_000_000).nullable().default(null),
  }).strict().parse(req.body)
  await checkServiceCategory(item.category)
  const id = await transaction(async conn => {
    const [[store]] = await conn.execute<(RowDataPacket & StoreContact & {name:string})[]>(`SELECT
      name,phone,area,city_code AS cityCode,district_code AS districtCode FROM h5_stores
      WHERE id=? AND owner_user_id=? AND enabled=TRUE FOR SHARE`, [item.storeId,req.user.id])
    if (!store) throw new HttpError(403,'请选择自己绑定且营业中的门店')
    if (!hasStoreContact(store)) throw new HttpError(400,'请在「我的门店」补齐地区和联系电话')
    return createCatalogItem({
      ...item, module:'services', kind:'article', provider:store.name, publisherId:req.user.id,
      area:null, venue:null, startsAt:null, closesAt:null, stock:null, externalUrl:null, published:true,
    }, conn)
  })
  res.status(201).json({id})
})
h5ServicePostsRouter.post(route + '/search', optionalAuth, async (req, res) => {
  const filter = filters.extend({ location: coordinatesInput.optional() }).strict().parse(req.body)
  res.json(await readServicePosts(filter, req.user?.id))
})

h5ServicePostsRouter.get(route + '/:id', optionalAuth, async (req, res) => {
  const [post] = await rows<ServiceRecord>(
    `SELECT ${fields} ${from} ${serviceCategoryJoin} WHERE i.id=? AND ${visible}`, [req.user?.id ?? null, uuid.parse(req.params.id)],
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
