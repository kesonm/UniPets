import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { h5Areas } from '../../shared/h5-areas.mjs'
import { db } from './db.js'

export const catalogModules = z.enum(['immortality','services','friends','charity','shop','medical','travel','education'])
export const catalogKinds = z.enum(['article','appointment','enrollment','product','group','link'])
export const h5Area = z.string().refine(id => h5Areas.some(area => area.id === id), '请选择已有商圈')

const fields = z.object({
  module: catalogModules,
  category: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, '分类需为英文标识'),
  kind: catalogKinds,
  title: z.string().trim().min(1, '请填写名称').max(120),
  provider: z.string().trim().max(120),
  description: z.string().trim().min(1, '请填写详情').max(5000),
  area: h5Area.nullable(),
  venue: z.string().trim().max(160).nullable(),
  startsAt: z.string().datetime().nullable(),
  closesAt: z.string().datetime().nullable(),
  priceCents: z.number().int().min(1).max(10000000).nullable(),
  stock: z.number().int().min(0).max(100000).nullable(),
  externalUrl: z.string().url().max(500).refine(value => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch { return false }
  }, '请输入 HTTPS 官方链接').nullable(),
  published: z.boolean(),
}).strict()

type CatalogInput = z.infer<typeof fields>
function validateCatalog(item: CatalogInput, context: z.RefinementCtx) {
  const issue = (path: string, message: string) => context.addIssue({code:'custom',path:[path],message})
  if (item.kind === 'product' && (item.priceCents === null || item.stock === null)) issue('stock','商品需填写价格和库存')
  if (item.kind === 'appointment' && !item.startsAt) issue('startsAt','预约项目需填写服务时间')
  if (item.kind === 'link' && !item.externalUrl) issue('externalUrl','外链项目需填写官方链接')
  if ((item.kind === 'group') !== (item.module === 'friends')) issue('module','交友项目请选择社群类型')
  if (item.module === 'shop' && item.kind !== 'product') issue('kind','品牌超市项目请选择商品类型')
  if (item.startsAt && item.closesAt && Date.parse(item.closesAt) > Date.parse(item.startsAt)) {
    issue('closesAt','报名截止不能晚于开始时间')
  }
}

const manageFields = fields.extend({storeId: z.string().uuid().nullable()})
export const catalogInput = fields.superRefine(validateCatalog)
export const managedCatalogInput = manageFields.superRefine(validateCatalog)
export const managedCatalogUpdate = manageFields.extend({
  updatedAt: z.string().datetime(),
  expectedStock: fields.shape.stock,
}).superRefine(validateCatalog)

export function catalogValues(item: CatalogInput & {storeId?: string|null}) {
  return [item.module,item.category,item.kind,item.title,item.provider,item.description,item.area,item.venue,
    item.startsAt ? new Date(item.startsAt) : null,item.closesAt ? new Date(item.closesAt) : null,
    item.priceCents,item.stock,item.externalUrl,item.published,item.storeId ?? null]
}

export async function createCatalogItem(item: CatalogInput & {storeId?: string|null}) {
  const id = randomUUID()
  await db.execute('INSERT INTO h5_catalog_items (id,module,category,kind,title,provider,description,area,venue,starts_at,closes_at,price_cents,stock,external_url,published,store_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id,...catalogValues(item)])
  return id
}

export const catalogStore = 'LEFT JOIN h5_stores store ON store.id=i.store_id'
export const catalogProvider = 'COALESCE(store.name,i.provider)'
export const catalogArea = 'COALESCE(i.area,store.area)'
export const catalogVenue = 'COALESCE(i.venue,store.address)'
export const catalogVisible = 'i.published=TRUE AND (store.id IS NULL OR store.enabled=TRUE)'
