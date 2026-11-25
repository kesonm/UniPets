import { Router } from 'express'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { catalogProductHasCover, catalogStore, catalogVisible, servicePostScope, servicePostVisible } from './catalog.js'
import { rows } from './db.js'
import { HttpError } from './errors.js'
import { publicStoreJobScope, storeJobsFrom } from './h5-jobs.js'

export const h5StorefrontRouter = Router()
const uuid = z.string().uuid()
const pageSize = 18
const kinds = ['product','service','job','post','story','catalog'] as const

export async function requirePublishingStore(connection: PoolConnection, storeId: string, owner: string) {
  const [[store]] = await connection.execute<RowDataPacket[]>(
    'SELECT id FROM h5_stores WHERE id=? AND owner_user_id=? AND enabled=TRUE FOR SHARE',
    [storeId,owner],
  )
  if (!store) throw new HttpError(404,'门店不存在或暂不可发布')
}

h5StorefrontRouter.get('/catalog/cart-stores', async (req,res) => {
  const {ids} = z.object({
    ids:z.string().max(1479).transform(value => value.split(',')).pipe(z.array(uuid).min(1).max(40)),
  }).parse(req.query)
  const items = await rows(`SELECT i.id AS itemId,store.id AS storeId,store.name AS storeName,${catalogProductHasCover} AS hasCover
    FROM h5_catalog_items i ${catalogStore} WHERE ${catalogVisible} AND i.kind='product'
      AND i.id IN (${ids.map(() => '?').join(',')})`, ids)
  res.json({items})
})

const content = {
  product: `SELECT i.id,'product' AS kind,i.title,LEFT(i.description,130) AS excerpt,i.module,
    ${catalogProductHasCover} AS hasCover,i.price_cents AS priceCents,i.updated_at AS activityAt
    FROM h5_catalog_items i ${catalogStore} WHERE store.id=? AND ${catalogVisible} AND i.kind='product'`,
  service: `SELECT i.id,'service' AS kind,i.title,LEFT(i.description,130) AS excerpt,i.module,
    EXISTS(SELECT 1 FROM h5_service_post_images image WHERE image.item_id=i.id) AS hasCover,
    i.price_cents AS priceCents,i.updated_at AS activityAt
    FROM h5_catalog_items i ${catalogStore} WHERE store.id=? AND ${servicePostVisible}`,
  job: `SELECT j.id,'job' AS kind,j.title,j.salary AS excerpt,NULL AS module,
    EXISTS(SELECT 1 FROM h5_store_job_images image WHERE image.job_id=j.id) AS hasCover,
    NULL AS priceCents,j.published_at AS activityAt FROM ${storeJobsFrom} WHERE s.id=? AND ${publicStoreJobScope}`,
  post: `SELECT p.id,'post' AS kind,p.title,LEFT(p.body,130) AS excerpt,NULL AS module,
    (p.asset_id IS NOT NULL) AS hasCover,NULL AS priceCents,p.created_at AS activityAt
    FROM h5_posts p JOIN h5_stores s ON s.id=p.store_id AND s.owner_user_id=p.user_id
    WHERE s.id=? AND s.enabled=TRUE AND p.hidden_at IS NULL`,
  story: `SELECT p.id,'story' AS kind,p.title,LEFT(JSON_UNQUOTE(JSON_EXTRACT(p.scenes,'$[0]')),130) AS excerpt,NULL AS module,
    EXISTS(SELECT 1 FROM assets a WHERE a.id=p.cover_asset_id AND a.kind='photo' AND a.pet_id=p.pet_id AND a.user_id=p.user_id) AS hasCover,
    NULL AS priceCents,p.published_at AS activityAt
    FROM h5_stories p JOIN h5_stores s ON s.id=p.store_id AND s.owner_user_id=p.user_id
    WHERE s.id=? AND s.enabled=TRUE AND p.published_at IS NOT NULL AND p.hidden_at IS NULL`,
  catalog: `SELECT i.id,'catalog' AS kind,i.title,LEFT(i.description,130) AS excerpt,i.module,
    FALSE AS hasCover,i.price_cents AS priceCents,i.updated_at AS activityAt
    FROM h5_catalog_items i ${catalogStore}
    WHERE store.id=? AND ${catalogVisible} AND i.kind<>'product' AND NOT (${servicePostScope})`,
}

h5StorefrontRouter.get('/catalog/storefront/:id', async (req,res) => {
  const id = uuid.parse(req.params.id)
  const {kind,page} = z.object({
    kind:z.enum(kinds).optional(), page:z.coerce.number().int().min(1).max(10000).default(1),
  }).parse(req.query)
  const [store] = await rows('SELECT id,name,address,phone,city_code AS cityCode FROM h5_stores WHERE id=? AND enabled=TRUE',[id])
  if (!store) throw new HttpError(404,'门店不存在或已停用')
  const types = kind ? [kind] : kinds
  const items = await rows(`SELECT * FROM (${types.map(type => content[type]).join(' UNION ALL ')}) AS publications
    ORDER BY activityAt DESC,id DESC,kind ASC LIMIT ? OFFSET ?`, [...types.map(() => id),pageSize+1,(page-1)*pageSize])
  res.json({store,items:items.slice(0,pageSize),hasMore:items.length > pageSize && page < 10000})
})
