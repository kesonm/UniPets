import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { catalogProvider, catalogStore, catalogVisible } from './catalog.js'
import { rows, transaction } from './db.js'
import { HttpError } from './errors.js'

export const h5OrdersRouter = Router()
const uuid = z.string().uuid()
const orderInput = z.object({
  requestKey: uuid,
  items: z.array(z.object({itemId:uuid, quantity:z.number().int().min(1).max(99),
    unitCents:z.number().int().min(1).max(10000000)}).strict()).min(1).max(40)
    .refine(items => new Set(items.map(item => item.itemId)).size === items.length, '购物车有重复商品'),
}).strict()

interface Ticket extends RowDataPacket {
  id: string
  status: 'submitted'|'confirmed'|'completed'|'cancelled'
  totalCents: number
}
interface OrderLine extends RowDataPacket {
  orderId: string
  itemId: string
  title: string
  provider: string
  unitCents: number
  quantity: number
}
const lineFields = 'order_id AS orderId,item_id AS itemId,title,provider,unit_cents AS unitCents,quantity'

export async function withOrderItems<T extends {id:string}>(orders:T[]) {
  const lines = orders.length ? await rows<OrderLine>(`SELECT ${lineFields} FROM h5_order_items
    WHERE order_id IN (${orders.map(() => '?').join(',')}) ORDER BY provider,title,item_id`, orders.map(item => item.id)) : []
  const byOrder = new Map<string,OrderLine[]>()
  for (const line of lines) {
    const items = byOrder.get(line.orderId) ?? []
    items.push(line)
    byOrder.set(line.orderId,items)
  }
  return orders.map(order => ({...order, items:byOrder.get(order.id) ?? []}))
}

h5OrdersRouter.get('/orders', requireAuth, async (req,res) => {
  const orders = await rows<Ticket>(`SELECT o.id,o.status,o.total_cents AS totalCents,o.created_at AS createdAt,
    s.message AS supportMessage,s.resolved AS supportResolved
    FROM h5_orders o LEFT JOIN h5_order_support s ON s.order_id=o.id WHERE o.user_id=?
    ORDER BY o.created_at DESC,o.id LIMIT 100`, [req.user.id])
  res.json({orders:await withOrderItems(orders)})
})

h5OrdersRouter.post('/orders', requireAuth, async (req,res) => {
  const {requestKey,items} = orderInput.parse(req.body)
  const userId = req.user.id
  const order = await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId])
    const [[previous]] = await conn.execute<Ticket[]>(
      'SELECT id,status,total_cents AS totalCents FROM h5_orders WHERE user_id=? AND request_key=?',
      [userId,requestKey])
    if (previous) {
      const [lines] = await conn.execute<OrderLine[]>(`SELECT ${lineFields} FROM h5_order_items WHERE order_id=?`, [previous.id])
      const matching = lines.length === items.length && items.every(item => lines.some(line =>
        line.itemId === item.itemId && line.quantity === item.quantity && line.unitCents === item.unitCents))
      if (!matching) throw new HttpError(409, '此结算编号已用于另一笔订单')
      return previous
    }

    const sorted = items.slice().sort((a,b) => a.itemId.localeCompare(b.itemId))
    const orderId = randomUUID()
    const snapshots: Array<(typeof items)[number] & {title:string; provider:string}> = []
    for (const item of sorted) {
      const [[product]] = await conn.execute<RowDataPacket[]>(`SELECT i.title,${catalogProvider} AS provider,i.price_cents AS unitCents,i.stock
        FROM h5_catalog_items i ${catalogStore} WHERE i.id=? AND ${catalogVisible} AND i.kind='product' FOR UPDATE OF i`, [item.itemId])
      if (!product) throw new HttpError(409, '购物车内有商品已下架，请重新选择')
      if (product.unitCents !== item.unitCents) throw new HttpError(409, `${product.title}的价格已更新，请刷新后再提交`)
      if (product.stock === null || product.stock < item.quantity) throw new HttpError(409, `${product.title}库存不足`)
      snapshots.push({...item,title:product.title,provider:product.provider})
    }
    const totalCents = snapshots.reduce((total,item) => total + item.quantity * item.unitCents,0)
    await conn.execute('INSERT INTO h5_orders (id,user_id,request_key,total_cents) VALUES (?,?,?,?)',
      [orderId,userId,requestKey,totalCents])
    for (const item of snapshots) {
      await conn.execute(`INSERT INTO h5_order_items (order_id,item_id,title,provider,unit_cents,quantity)
        VALUES (?,?,?,?,?,?)`, [orderId,item.itemId,item.title,item.provider,item.unitCents,item.quantity])
      await conn.execute('UPDATE h5_catalog_items SET stock=stock-? WHERE id=?', [item.quantity,item.itemId])
    }
    return {id:orderId,totalCents,status:'submitted'}
  })
  res.json({order})
})

h5OrdersRouter.post('/orders/:id/cancel', requireAuth, async (req,res) => {
  const id = uuid.parse(req.params.id)
  await transaction(async conn => {
    const [[order]] = await conn.execute<Ticket[]>('SELECT status FROM h5_orders WHERE id=? AND user_id=? FOR UPDATE', [id,req.user.id])
    if (!order) throw new HttpError(404, '订单不存在')
    if (order.status === 'cancelled') return
    if (order.status !== 'submitted') throw new HttpError(409, '请通过售后申请处理这笔订单')
    const [lines] = await conn.execute<OrderLine[]>(`SELECT ${lineFields} FROM h5_order_items WHERE order_id=? ORDER BY item_id`, [id])
    for (const line of lines) await conn.execute('UPDATE h5_catalog_items SET stock=stock+? WHERE id=?', [line.quantity,line.itemId])
    await conn.execute("UPDATE h5_orders SET status='cancelled' WHERE id=?", [id])
  })
  res.json({ok:true})
})

h5OrdersRouter.put('/orders/:id/support', requireAuth, async (req,res) => {
  const id = uuid.parse(req.params.id)
  const {message} = z.object({message:z.string().trim().min(1,'请填写售后诉求').max(500)}).strict().parse(req.body)
  await transaction(async conn => {
    const [[order]] = await conn.execute<Ticket[]>('SELECT status FROM h5_orders WHERE id=? AND user_id=? FOR UPDATE', [id,req.user.id])
    if (!order) throw new HttpError(404, '订单不存在')
    if (order.status === 'cancelled') throw new HttpError(409, '这笔订单已取消')
    await conn.execute(`INSERT INTO h5_order_support (order_id,message) VALUES (?,?)
      ON DUPLICATE KEY UPDATE message=?,resolved=FALSE,created_at=UTC_TIMESTAMP(3)`, [id,message,message])
  })
  res.json({ok:true})
})
