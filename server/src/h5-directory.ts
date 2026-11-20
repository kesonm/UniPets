import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { h5Areas } from '../../shared/h5-areas.mjs'
import { requireAuth } from './auth.js'
import { rows, transaction } from './db.js'
import { HttpError } from './errors.js'

export const h5DirectoryRouter = Router()
export const catalogModules = z.enum(['immortality','services','friends','charity','shop','medical','travel','education'])
export const h5Area = z.string().refine(id => h5Areas.some(area => area.id === id), '请选择已有商圈')
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
  venue: string|null
  startsAt: Date|null
  closesAt: Date|null
  priceCents: number|null
  stock: number|null
  externalUrl: string|null
}
const fields = `id, module, category, kind, title, provider, description, area, venue,
  starts_at AS startsAt, closes_at AS closesAt, price_cents AS priceCents, stock, external_url AS externalUrl`

function publicListing(item: CatalogItem) {
  let externalUrl: string|null = null
  if (item.externalUrl) {
    try {
      const url = new URL(item.externalUrl)
      if (url.protocol === 'https:' && !url.username && !url.password) externalUrl = url.href
    } catch { /* Invalid catalog links are omitted. */ }
  }
  return { ...item, externalUrl }
}

h5DirectoryRouter.get('/catalog', async (req, res) => {
  const filter = z.object({module:catalogModules.optional(), area:h5Area.optional(),
    kind:z.enum(['article','appointment','enrollment','product','group','link']).optional(),
    q:z.string().trim().max(60).default('')}).parse(req.query)
  const listings = await rows<CatalogItem>(`SELECT ${fields} FROM h5_catalog_items WHERE published=TRUE
    AND (? IS NULL OR module=?)
    AND (? IS NULL OR kind=?)
    AND (?='' OR LOCATE(?, CONCAT_WS(' ',title,provider,description,venue))>0)
    ORDER BY COALESCE(area=?, FALSE) DESC, (starts_at IS NOT NULL AND starts_at < UTC_TIMESTAMP(3)),
      starts_at, title, id LIMIT 200`,
  [filter.module ?? null, filter.module ?? null, filter.kind ?? null, filter.kind ?? null,
    filter.q, filter.q, filter.area ?? null])
  res.json({listings:listings.map(publicListing)})
})

h5DirectoryRouter.get('/catalog/:id', async (req, res) => {
  const [listing] = await rows<CatalogItem>(
    `SELECT ${fields} FROM h5_catalog_items WHERE id=? AND published=TRUE`, [uuid.parse(req.params.id)])
  if (!listing) throw new HttpError(404, '项目未发布或已下架')
  res.json({listing:publicListing(listing)})
})

export const engagementSelect = `SELECT r.id, r.item_id AS itemId, r.pet_id AS petId,
  i.module, i.category, i.kind, i.title, i.provider, i.venue, i.starts_at AS startsAt,
  p.name AS petName, r.status, r.note, r.checked_in_at AS checkedInAt, r.created_at AS createdAt
  FROM h5_engagements r JOIN h5_catalog_items i ON i.id=r.item_id LEFT JOIN pets p ON p.id=r.pet_id`

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
      `SELECT ${fields} FROM h5_catalog_items WHERE id=? AND published=TRUE FOR UPDATE`, [itemId])
    if (!item) throw new HttpError(404, '这个项目已下架')
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
