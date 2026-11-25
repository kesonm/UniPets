import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { catalogArea, catalogKinds, catalogModules, catalogProductHasCover, catalogProvider, catalogStore, catalogVenue, catalogVisible, h5Area } from './catalog.js'
import { rows, transaction } from './db.js'
import { districtAreaIds, districtById, knownDistrictInput } from './districts.js'
import { HttpError } from './errors.js'

export const h5DirectoryRouter = Router()
export { h5Area } from './catalog.js'
const uuid = z.string().uuid()

interface CatalogItem {
  id: string
  module: z.infer<typeof catalogModules>
  category: string
  kind: 'article'|'appointment'|'enrollment'|'product'|'group'|'link'
  title: string
  provider: string
  description: string
  area: string|null
  storeDistrictCode: string|null
  cityCode: string|null
  latitude: number|null
  longitude: number|null
  venue: string|null
  startsAt: Date|null
  closesAt: Date|null
  priceCents: number|null
  stock: number|null
  hasCover: number
  salesCount?: number
  externalUrl: string|null
}
const fields = `i.id,i.module,i.category,i.kind,i.title,${catalogProvider} AS provider,i.description,
  ${catalogArea} AS area,${catalogVenue} AS venue,i.starts_at AS startsAt,i.closes_at AS closesAt,
  store.district_code AS storeDistrictCode,store.city_code AS cityCode,
  CAST(store.latitude AS DOUBLE) AS latitude,CAST(store.longitude AS DOUBLE) AS longitude,
  i.price_cents AS priceCents,i.stock,i.external_url AS externalUrl,
  IF(i.kind='product',${catalogProductHasCover},FALSE) AS hasCover`
const from = `FROM h5_catalog_items i ${catalogStore}`
const salesCount = `CAST((SELECT COALESCE(SUM(line.quantity),0)
  FROM h5_order_items line JOIN h5_orders sale ON sale.id=line.order_id
  WHERE line.item_id=i.id AND sale.status='completed') AS DOUBLE) AS salesCount`

function publicListing({storeDistrictCode, latitude, longitude, ...item}: CatalogItem) {
  let externalUrl: string|null = null
  if (item.externalUrl) {
    try {
      const url = new URL(item.externalUrl)
      if (url.protocol === 'https:' && !url.username && !url.password) externalUrl = url.href
    } catch { /* Invalid catalog links are omitted. */ }
  }
  return { ...item, externalUrl, district:districtById(storeDistrictCode ?? item.area) ?? null,
    coordinates:latitude === null || longitude === null ? null : {latitude, longitude} }
}

h5DirectoryRouter.get('/catalog', async (req, res) => {
  const filter = z.object({module:catalogModules.optional(), area:h5Area.optional(), district:knownDistrictInput.optional(),
    kind:catalogKinds.optional(), local:z.literal('1').optional(),
    category:z.string().trim().max(48).default(''),
    q:z.string().trim().max(60).default('')}).parse(req.query)
  const preferredAreas = filter.district ? districtAreaIds([filter.district]) : [filter.area ?? null]
  const preferredField = filter.district ? `COALESCE(store.district_code,${catalogArea})` : catalogArea
  const preferred = `COALESCE(${preferredField} IN (${preferredAreas.map(() => '?').join(',')}), FALSE)`
  const localAreas = filter.local && filter.district ? preferredAreas : []
  const listings = await rows<CatalogItem>(`SELECT ${fields}${filter.kind === 'product' ? ', '+salesCount : ''} ${from} WHERE ${catalogVisible}
    AND (? IS NULL OR i.module=?)
    AND (? IS NULL OR i.kind=?)
    AND (?='' OR i.category=?)
    AND (?='' OR LOCATE(?, CONCAT_WS(' ',i.title,${catalogProvider},i.description,${catalogVenue}))>0)
    ${localAreas.length ? 'AND '+preferred : ''}
    ORDER BY ${preferred} DESC,
      (i.starts_at IS NOT NULL AND i.starts_at < UTC_TIMESTAMP(3)),
      i.starts_at,i.title,i.id LIMIT 200`,
  [filter.module ?? null, filter.module ?? null, filter.kind ?? null, filter.kind ?? null,
    filter.category, filter.category, filter.q, filter.q, ...localAreas, ...preferredAreas])
  res.json({listings:listings.map(publicListing)})
})

h5DirectoryRouter.get('/catalog/:id', async (req, res) => {
  const [listing] = await rows<CatalogItem>(
    `SELECT ${fields} ${from} WHERE i.id=? AND ${catalogVisible}`, [uuid.parse(req.params.id)])
  if (!listing) throw new HttpError(404, '项目未发布或已下架')
  res.json({listing:publicListing(listing)})
})

h5DirectoryRouter.get('/catalog/:id/cover', async (req,res) => {
  const [cover] = await rows<{image:Buffer}>(`SELECT cover.image ${from}
    JOIN h5_product_covers cover ON cover.item_id=i.id WHERE i.id=? AND i.kind='product' AND ${catalogVisible}`, [uuid.parse(req.params.id)])
  if (!cover) throw new HttpError(404,'商品图片不存在')
  res.type('webp').send(cover.image)
})

export const engagementSelect = `SELECT r.id, r.item_id AS itemId, r.pet_id AS petId,
  i.module,i.category,i.kind,i.title,${catalogProvider} AS provider,${catalogVenue} AS venue,i.starts_at AS startsAt,
  p.name AS petName, r.status, r.note, r.checked_in_at AS checkedInAt, r.created_at AS createdAt
  FROM h5_engagements r JOIN h5_catalog_items i ON i.id=r.item_id ${catalogStore} LEFT JOIN pets p ON p.id=r.pet_id`

h5DirectoryRouter.get('/engagements', requireAuth, async (req, res) => {
  const engagements = await rows(`${engagementSelect} WHERE r.user_id=? ORDER BY r.created_at DESC,r.id LIMIT 150`, [req.user.id])
  res.json({engagements})
})

h5DirectoryRouter.post('/catalog/:id/participation', requireAuth, async (req, res) => {
  const itemId = uuid.parse(req.params.id)
  const {petId, note} = z.object({petId:uuid.nullable().default(null),
    note:z.string().trim().max(500).default('')}).strict().parse(req.body)
  const engagement = await transaction(async conn => {
    const [[item]] = await conn.execute<(CatalogItem & RowDataPacket)[]>(
      `SELECT ${fields} ${from} WHERE i.id=? AND ${catalogVisible} FOR UPDATE OF i`, [itemId])
    if (!item) throw new HttpError(404, '这个项目已下架')
    if (item.module === 'services' && req.get('X-PetCloud-Client') === 'miniprogram') {
      throw new HttpError(409, '请联系门店电话预约')
    }
    if (!['appointment','enrollment','group'].includes(item.kind)) throw new HttpError(400, '这个项目暂不接受报名')
    const petRequired = item.kind !== 'group' && item.module !== 'charity'
    if (petRequired && !petId) throw new HttpError(400, '请为本次预约选择一只宠物')
    if (!petRequired && petId) throw new HttpError(400, '这个项目以账号参加')
    if (petId) {
      const [[pet]] = await conn.execute<RowDataPacket[]>(
        'SELECT id FROM pets WHERE id=? AND user_id=? FOR SHARE', [petId,req.user.id])
      if (!pet) throw new HttpError(404, '请选择账号下的宠物')
    }
    const subject = petId ?? 'account'
    const keys = [req.user.id,itemId,subject]
    const [[existing]] = await conn.execute<RowDataPacket[]>(
      `${engagementSelect} WHERE r.user_id=? AND r.item_id=? AND r.subject_key=?`, keys)
    if (existing && existing.status !== 'cancelled') return existing

    const deadline = item.closesAt ?? item.startsAt
    if (deadline && deadline.getTime() <= Date.now()) throw new HttpError(409, '这个项目已截止')
    if (item.stock !== null) {
      const [[capacity]] = await conn.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS used FROM h5_engagements WHERE item_id=? AND status<>'cancelled'", [itemId])
      if (Number(capacity.used) >= item.stock) throw new HttpError(409, '这个项目的名额已满')
    }
    const status = item.kind === 'appointment' ? 'requested' : 'joined'
    const id = existing?.id ?? randomUUID()
    if (existing) await conn.execute(
      'UPDATE h5_engagements SET status=?,note=?,checked_in_at=NULL,created_at=UTC_TIMESTAMP(3) WHERE id=?',
      [status,note,id])
    else await conn.execute(`INSERT INTO h5_engagements (id,user_id,item_id,pet_id,subject_key,note,status)
      VALUES (?,?,?,?,?,?,?)`, [id,req.user.id,itemId,petId,subject,note,status])
    const [[record]] = await conn.execute<RowDataPacket[]>(`${engagementSelect} WHERE r.id=?`, [id])
    return record
  })
  res.json({engagement})
})

h5DirectoryRouter.route('/engagements/:id').patch(requireAuth, updateEngagement).put(requireAuth, updateEngagement)
async function updateEngagement(req: Request, res: Response) {
  const id = uuid.parse(req.params.id)
  const {action} = z.object({action:z.enum(['cancel','check-in'])}).strict().parse(req.body)
  const engagement = await transaction(async conn => {
    const [[record]] = await conn.execute<RowDataPacket[]>(`${engagementSelect}
      WHERE r.id=? AND r.user_id=? FOR UPDATE OF r`, [id,req.user.id])
    if (!record) throw new HttpError(404, '参与记录不存在')
    if (action === 'cancel') {
      if (record.status === 'completed' || record.checkedInAt) throw new HttpError(409, '已完成的记录不能取消')
      if (record.status !== 'cancelled') await conn.execute("UPDATE h5_engagements SET status='cancelled' WHERE id=?", [id])
    } else {
      if (record.module !== 'education' || record.kind !== 'enrollment' || !['joined','confirmed','completed'].includes(record.status)) {
        throw new HttpError(409, '请先报名可打卡的学习课程')
      }
      if (record.startsAt && record.startsAt.getTime() > Date.now()) throw new HttpError(409, '课程还未开始')
      await conn.execute('UPDATE h5_engagements SET checked_in_at=COALESCE(checked_in_at,UTC_TIMESTAMP(3)) WHERE id=?', [id])
    }
    const [[updated]] = await conn.execute<RowDataPacket[]>(`${engagementSelect} WHERE r.id=?`, [id])
    return updated
  })
  res.json({engagement})
}
