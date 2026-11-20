import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader } from 'mysql2/promise'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { config } from './config.js'
import { db, rows } from './db.js'
import { HttpError } from './errors.js'
import { catalogModules, engagementSelect, h5Area } from './h5-directory.js'
import { withOrderItems } from './h5-orders.js'

export const h5OperationsRouter = Router()
const uuid=z.string().uuid()
const hasAccess=(id:string)=>config.h5OperatorIds.includes(id)
const catalogInput=z.object({
  module:catalogModules,category:z.string().regex(/^[a-z][a-z-]{0,31}$/),
  kind:z.enum(['article','appointment','enrollment','product','group','link']),
  title:z.string().trim().min(1).max(120),provider:z.string().trim().max(120),
  description:z.string().trim().min(1).max(5000),area:h5Area.nullable(),
  venue:z.string().trim().max(160).nullable(),startsAt:z.string().datetime().nullable(),closesAt:z.string().datetime().nullable(),
  priceCents:z.number().int().min(1).max(10000000).nullable(),stock:z.number().int().min(0).max(100000).nullable(),
  externalUrl:z.string().url().max(500).refine(value=>{
    try {
      const url=new URL(value)
      return url.protocol==='https:'&&!url.username&&!url.password
    } catch {return false}
  },'请输入 HTTPS 官方链接').nullable(),
  published:z.boolean(),
}).strict().superRefine((item, context)=>{
  const issue=(path:string,message:string)=>context.addIssue({code:'custom',path:[path],message})
  if (item.kind==='product'&&(item.priceCents===null||item.stock===null)) issue('stock','商品需填写价格和库存')
  if (item.kind==='appointment'&&!item.startsAt) issue('startsAt','预约项目需填写服务时间')
  if (item.kind==='link'&&!item.externalUrl) issue('externalUrl','外链项目需填写官方链接')
  if ((item.kind==='group')!==(item.module==='friends')) issue('module','交友项目请选择社群类型')
  if (item.module==='shop'&&item.kind!=='product') issue('kind','品牌超市项目请选择商品类型')
  if (item.startsAt&&item.closesAt&&Date.parse(item.closesAt)>Date.parse(item.startsAt)) issue('closesAt','报名截止不能晚于开始时间')
})

h5OperationsRouter.use(requireAuth)
h5OperationsRouter.get('/access',(req,res)=>res.json({allowed:hasAccess(req.user.id)}))
h5OperationsRouter.use((req,_res,next)=>{
  if (!hasAccess(req.user.id)) throw new HttpError(403,'当前账号没有业务管理权限')
  next()
})

h5OperationsRouter.get('/catalog',async (_req,res)=>{
  const listings=await rows(`SELECT id,module,category,kind,title,provider,published,stock,
    starts_at AS startsAt FROM h5_catalog_items ORDER BY published DESC,title,id LIMIT 200`)
  res.json({listings})
})
h5OperationsRouter.post('/catalog',async (req,res)=>{
  const item=catalogInput.parse(req.body)
  const id=randomUUID()
  await db.execute(`INSERT INTO h5_catalog_items
    (id,module,category,kind,title,provider,description,area,venue,starts_at,closes_at,price_cents,stock,external_url,published)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,item.module,item.category,item.kind,item.title,item.provider,
    item.description,item.area,item.venue,item.startsAt?new Date(item.startsAt):null,item.closesAt?new Date(item.closesAt):null,
    item.priceCents,item.stock,item.externalUrl,item.published])
  res.status(201).json({id})
})
h5OperationsRouter.patch('/catalog/:id',async (req,res)=>{
  const {published}=z.object({published:z.boolean()}).strict().parse(req.body)
  const [result]=await db.execute<ResultSetHeader>('UPDATE h5_catalog_items SET published=? WHERE id=?',
    [published,uuid.parse(req.params.id)])
  if (!result.affectedRows) throw new HttpError(404,'项目不存在')
  res.json({ok:true})
})

h5OperationsRouter.get('/engagements',async (_req,res)=>{
  const engagements=await rows(`${engagementSelect} WHERE i.kind IN ('appointment','enrollment')
    AND r.status IN ('requested','confirmed','joined') ORDER BY r.created_at DESC,r.id LIMIT 100`)
  res.json({engagements})
})
h5OperationsRouter.patch('/engagements/:id',async (req,res)=>{
  const id=uuid.parse(req.params.id)
  const data=z.discriminatedUnion('action',[
    z.object({action:z.literal('confirm')}).strict(),
    z.object({action:z.literal('cancel')}).strict(),
    z.object({action:z.literal('complete')}).strict(),
    z.object({action:z.literal('redeem'),code:uuid}).strict(),
  ]).parse(req.body)
  if (data.action==='redeem'&&data.code!==id) throw new HttpError(400,'请核对预约编号')
  const updates={
    confirm:{status:'confirmed',where:"i.kind='appointment' AND r.status='requested'"},
    cancel:{status:'cancelled',where:"i.kind='appointment' AND r.status IN ('requested','confirmed')"},
    redeem:{status:'completed',where:"i.kind='appointment' AND r.status='confirmed'"},
    complete:{status:'completed',where:"i.kind='enrollment' AND r.status IN ('joined','confirmed') AND (i.starts_at IS NULL OR i.starts_at<=UTC_TIMESTAMP(3))"},
  } as const
  const update=updates[data.action]
  const [result]=await db.execute<ResultSetHeader>(`UPDATE h5_engagements r JOIN h5_catalog_items i ON i.id=r.item_id
    SET r.status=? WHERE r.id=? AND ${update.where}`,[update.status,id])
  if (!result.affectedRows) throw new HttpError(409,'这条记录的状态已变化')
  res.json({ok:true})
})

h5OperationsRouter.get('/orders',async (_req,res)=>{
  const orders=await rows<{id:string}>(`SELECT o.id,o.status,o.total_cents AS totalCents,o.created_at AS createdAt,
    s.message AS supportMessage,s.resolved AS supportResolved
    FROM h5_orders o LEFT JOIN h5_order_support s ON s.order_id=o.id
    WHERE o.status IN ('submitted','confirmed') OR s.resolved=FALSE ORDER BY o.created_at DESC,o.id LIMIT 100`)
  res.json({orders:await withOrderItems(orders)})
})
h5OperationsRouter.patch('/orders/:id',async (req,res)=>{
  const id=uuid.parse(req.params.id)
  const {action}=z.object({action:z.enum(['confirm','complete','resolve-support'])}).strict().parse(req.body)
  const sql=action==='resolve-support'?'UPDATE h5_order_support SET resolved=TRUE WHERE order_id=? AND resolved=FALSE':
    action==='confirm'?"UPDATE h5_orders SET status='confirmed' WHERE id=? AND status='submitted'":
    "UPDATE h5_orders SET status='completed' WHERE id=? AND status='confirmed'"
  const [result]=await db.execute<ResultSetHeader>(sql,[id])
  if (!result.affectedRows) throw new HttpError(409,'这条记录的状态已变化')
  res.json({ok:true})
})
