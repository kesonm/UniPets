import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader } from 'mysql2/promise'
import { z } from 'zod'
import { servicePhone } from '../../shared/h5-discovery.mjs'
import { employmentTypes, jobCategories, type EmploymentType, type JobCategory, type JobStatus, type StoreJob } from '../../shared/h5-jobs.mjs'
import { requireAuth } from './auth.js'
import { db, rows } from './db.js'
import { districtById, districtInput, serviceCityInput } from './districts.js'
import { HttpError } from './errors.js'

export const h5JobsRouter = Router()
const route = '/jobs'
const uuid = z.string().uuid()
const categoryInput = z.custom<JobCategory>(value => typeof value === 'string' && Object.hasOwn(jobCategories,value), '请选择岗位类别')
const typeInput = z.custom<EmploymentType>(value => typeof value === 'string' && Object.hasOwn(employmentTypes,value), '请选择用工类型')
const page = z.coerce.number().int().min(1).max(100000).default(1)
const pageSize = 18
const listInput = z.object({
  page,
  city: serviceCityInput.optional(),
  category: categoryInput.optional(),
  type: typeInput.optional(),
  district: districtInput.optional(),
  q: z.string().trim().max(60).default(''),
}).strict()
const jobInput = z.object({
  title: z.string().trim().min(1,'请填写岗位名称').max(80),
  category: categoryInput,
  employmentType: typeInput,
  salary: z.string().trim().min(1,'请填写薪资').max(40),
  description: z.string().trim().min(1,'请填写岗位职责和要求').max(2000),
}).strict()

export const storeJobsFrom = 'h5_store_jobs j JOIN h5_stores s ON s.id=j.store_id'
export const storeJobFields = `j.id,j.store_id AS storeId,j.title,j.category,j.employment_type AS employmentType,
  j.salary,j.description,j.status,j.created_at AS createdAt,j.published_at AS publishedAt,
  s.name AS storeName,s.city_code AS cityCode,s.address,s.phone`
const visible = "j.status='published' AND s.enabled=TRUE AND s.owner_user_id IS NOT NULL"

h5JobsRouter.get(route, async (req,res) => {
  const filter = listInput.parse(req.query)
  const conditions = [visible]
  const values: string[] = []
  for (const [column,value] of [['s.city_code',filter.city],['j.category',filter.category],['j.employment_type',filter.type]]) {
    if (value) {
      conditions.push(column+'=?')
      values.push(value)
    }
  }
  if (filter.q) {
    conditions.push("LOCATE(?,CONCAT_WS(' ',j.title,s.name,j.description))>0")
    values.push(filter.q)
  }
  const nearbyCity = filter.city ? undefined : districtById(filter.district)?.serviceCityCode
  const cityOrder = nearbyCity ? '(s.city_code=?) DESC,' : ''
  if (nearbyCity) values.push(nearbyCity)
  const items = await rows<StoreJob>(`SELECT ${storeJobFields} FROM ${storeJobsFrom}
    WHERE ${conditions.join(' AND ')} ORDER BY ${cityOrder}j.published_at DESC,j.id DESC LIMIT ? OFFSET ?`,
  [...values,pageSize+1,(filter.page-1)*pageSize])
  res.json({items:items.slice(0,pageSize),hasMore:items.length>pageSize})
})

h5JobsRouter.get(route+'/:id', async (req,res) => {
  const [job] = await rows<StoreJob>(`SELECT ${storeJobFields} FROM ${storeJobsFrom} WHERE j.id=? AND ${visible}`, [uuid.parse(req.params.id)])
  if (!job) throw new HttpError(404,'岗位不存在或已下架')
  res.json({job})
})

const merchant = route+'/mine/:storeId'

async function ownedStore(storeId: string, userId: string) {
  const [store] = await rows<{name:string;address:string;phone:string;cityCode:string|null;enabled:number}>(`SELECT
    name,address,phone,city_code AS cityCode,enabled FROM h5_stores WHERE id=? AND owner_user_id=?`, [storeId,userId])
  if (!store) throw new HttpError(404,'门店不存在')
  return store
}

h5JobsRouter.get(merchant, requireAuth, async (req,res) => {
  const storeId = uuid.parse(req.params.storeId)
  const currentPage = z.object({page}).strict().parse(req.query).page
  const store = await ownedStore(storeId,req.user.id)
  const items = await rows<StoreJob>(`SELECT ${storeJobFields} FROM ${storeJobsFrom}
    WHERE j.store_id=? AND s.owner_user_id=? ORDER BY j.created_at DESC,j.id DESC LIMIT ? OFFSET ?`,
  [storeId,req.user.id,pageSize+1,(currentPage-1)*pageSize])
  res.json({store:{...store,enabled:Boolean(store.enabled)},items:items.slice(0,pageSize),hasMore:items.length>pageSize})
})

h5JobsRouter.post(merchant, requireAuth, async (req,res) => {
  const storeId = uuid.parse(req.params.storeId)
  const job = jobInput.parse(req.body)
  const store = await ownedStore(storeId,req.user.id)
  if (!store.enabled) throw new HttpError(409,'该门店已停用')
  if (!store.address.trim() || !servicePhone(store.phone) || !serviceCityInput.safeParse(store.cityCode).success) {
    throw new HttpError(409,'请先完善门店所在城市、详细地址和联系电话')
  }
  const id = randomUUID()
  const [created] = await db.execute<ResultSetHeader>(`INSERT INTO h5_store_jobs
    (id,store_id,title,category,employment_type,salary,description)
    SELECT ?,id,?,?,?,?,? FROM h5_stores WHERE id=? AND owner_user_id=? AND enabled=TRUE`,
  [id,job.title,job.category,job.employmentType,job.salary,job.description,storeId,req.user.id])
  if (!created.affectedRows) throw new HttpError(409,'门店状态已变更，请刷新后重试')
  res.status(201).json({id})
})

h5JobsRouter.put(merchant+'/:id/close', requireAuth, async (req,res) => {
  const storeId = uuid.parse(req.params.storeId)
  const id = uuid.parse(req.params.id)
  await ownedStore(storeId,req.user.id)
  const [updated] = await db.execute<ResultSetHeader>(`UPDATE ${storeJobsFrom} SET j.status='closed'
    WHERE j.id=? AND j.store_id=? AND s.owner_user_id=? AND j.status IN ('pending','published')`,
  [id,storeId,req.user.id])
  if (!updated.affectedRows) throw new HttpError(409,'岗位状态已变更，请刷新后重试')
  res.json({ok:true})
})

export async function reviewStoreJob(id: string, status: Exclude<JobStatus,'pending'>) {
  const previous = status === 'closed' ? 'published' : 'pending'
  const [updated] = await db.execute<ResultSetHeader>(`UPDATE ${storeJobsFrom}
    SET j.status=?,j.published_at=IF(?='published',UTC_TIMESTAMP(3),j.published_at)
    WHERE j.id=? AND j.status=? AND (?<>'published' OR (s.enabled=TRUE AND s.owner_user_id IS NOT NULL))`,
  [status,status,id,previous,status])
  if (!updated.affectedRows) throw new HttpError(409,'岗位或门店状态已变更，请刷新后重试')
}
