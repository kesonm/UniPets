import { randomBytes, randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { servicePhone } from '../../shared/h5-discovery.mjs'
import { photoThumbnail } from './assets.js'
import { adminLogin, authLimiter, requireAuth } from './auth.js'
import { catalogStore, catalogValues, catalogVisible, createCatalogItem, h5Area, managedCatalogInput, managedCatalogUpdate } from './catalog.js'
import { db, rows, transaction } from './db.js'
import { coordinatesInput, districtInput, listDistricts, serviceCityInput } from './districts.js'
import { HttpError } from './errors.js'
import { petSchema, updatePetRecord } from './routes.js'
import { checkServiceCategory, getServiceCategories, serviceCategoryId, serviceCategoryJoin, serviceCategoryLabel, serviceCategoryName } from './service-categories.js'

export const adminRouter = Router()
const uuid = z.string().uuid()
const enabledInput = z.object({enabled:z.boolean()}).strict()
const publishedInput = z.object({published:z.boolean()}).strict()
const hiddenInput = z.object({hidden:z.boolean()}).strict()
const pageInput = z.object({
  q:z.string().trim().max(120).default(''),
  page:z.coerce.number().int().min(1).max(100000).default(1),
  state:z.string().max(20).optional(),
}).strict()
const pageSize = 20

interface ListQuery {
  select: string
  from: string
  search: string
  order: string
  scope?: string
  states: Record<string,string>
}
function list(query: ListQuery): RequestHandler {
  return async (req,res) => {
    const {q,page,state} = pageInput.parse(req.query)
    if (state && !Object.hasOwn(query.states,state)) throw new HttpError(400,'筛选条件不正确')
    const status = state ? query.states[state] : 'TRUE'
    const records = await rows(`SELECT ${query.select} FROM ${query.from}
      WHERE (${query.scope ?? 'TRUE'}) AND (${status}) AND (?='' OR LOCATE(?,CONCAT_WS(' ',${query.search}))>0)
      ORDER BY ${query.order} LIMIT ? OFFSET ?`, [q,q,pageSize+1,(page-1)*pageSize])
    res.json({items:records.slice(0,pageSize),hasMore:records.length>pageSize})
  }
}

async function update(sql: string, values: Array<string|number|boolean|Date|null>, message: string, status = 404) {
  const [result] = await db.execute<ResultSetHeader>(sql,values)
  if (!result.affectedRows) throw new HttpError(status,message)
}

adminRouter.post('/login',authLimiter,adminLogin)
adminRouter.use(requireAuth,(req,_res,next) => {
  if (!req.isAdmin) throw new HttpError(403,'当前账号没有管理员权限')
  next()
})
adminRouter.get('/me',(req,res) => res.json({user:req.user}))

adminRouter.get('/users',list({
  select:`u.id,u.username,u.display_name AS displayName,u.created_at AS createdAt,u.is_admin AS isAdmin,
    (u.wechat_appid IS NOT NULL) AS wechat,(u.disabled_at IS NULL) AS enabled,
    (SELECT COUNT(*) FROM pets p WHERE p.user_id=u.id) AS petCount`,
  from:'users u', search:'u.username,u.display_name,u.id', order:'u.created_at DESC,u.id DESC',
  states:{enabled:'u.disabled_at IS NULL',disabled:'u.disabled_at IS NOT NULL'},
}))
adminRouter.patch('/users/:id',async (req,res) => {
  const id = uuid.parse(req.params.id)
  const changes = z.object({displayName:z.string().trim().min(1,'请填写昵称').max(40).optional(),
    enabled:z.boolean().optional()}).strict().refine(value => Object.keys(value).length>0,'请填写变更内容').parse(req.body)

  await transaction(async conn => {
    const [[user]] = await conn.execute<RowDataPacket[]>('SELECT is_admin AS isAdmin FROM users WHERE id=? FOR UPDATE',[id])
    if (!user) throw new HttpError(404,'用户不存在')
    if (changes.enabled === false && user.isAdmin) throw new HttpError(409,'请先移除该账号的管理员权限')
    if (changes.displayName !== undefined) await conn.execute('UPDATE users SET display_name=? WHERE id=?',[changes.displayName,id])
    if (changes.enabled !== undefined) {
      await conn.execute('UPDATE users SET disabled_at=IF(?,NULL,COALESCE(disabled_at,UTC_TIMESTAMP(3))) WHERE id=?',
        [changes.enabled,id])
      if (!changes.enabled) await conn.execute('DELETE FROM sessions WHERE user_id=?',[id])
    }
  })
  res.json({ok:true})
})

const storeInput = z.object({
  name:z.string().trim().min(1,'请填写门店名称').max(120),
  area:h5Area.nullable(),
  districtCode:districtInput.nullable().optional(),
  cityCode:serviceCityInput.nullable().optional(),
  coordinates:coordinatesInput.nullable().optional(),
  address:z.string().trim().max(160),
  phone:z.string().trim().max(40),
}).strict()
adminRouter.get('/districts', (req,res) => {
  const {q,id} = z.object({q:z.string().trim().max(60).default(''),id:districtInput.optional()}).parse(req.query)
  res.json({items:listDistricts(q,id)})
})
function checkDistrict(id: string | null | undefined) {
  if (id && !listDistricts('',id).length) throw new HttpError(400,'请选择有效的服务区县')
}
adminRouter.get('/stores',list({
  select:`id,name,area,district_code AS districtCode,city_code AS cityCode,
    CAST(latitude AS DOUBLE) AS latitude,CAST(longitude AS DOUBLE) AS longitude,
    address,phone,enabled,created_at AS createdAt`,
  from:'h5_stores', search:'name,address,phone,id', order:'created_at DESC,id DESC',
  states:{enabled:'enabled=TRUE',disabled:'enabled=FALSE'},
}))
adminRouter.post('/stores',async (req,res) => {
  const item = storeInput.parse(req.body)
  checkDistrict(item.districtCode)
  const id = randomUUID()
  await db.execute(`INSERT INTO h5_stores (id,name,area,district_code,city_code,latitude,longitude,address,phone)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [id,item.name,item.area,item.districtCode ?? null,item.cityCode ?? null,
      item.coordinates?.latitude ?? null,item.coordinates?.longitude ?? null,item.address,item.phone])
  res.status(201).json({id})
})
adminRouter.put('/stores/:id',async (req,res) => {
  const item = storeInput.parse(req.body)
  checkDistrict(item.districtCode)
  await update(`UPDATE h5_stores SET name=?,area=?,district_code=IF(?,?,district_code),city_code=IF(?,?,city_code),
    latitude=IF(?,?,latitude),longitude=IF(?,?,longitude),address=?,phone=? WHERE id=?`,
  [item.name,item.area,item.districtCode!==undefined,item.districtCode ?? null,item.cityCode!==undefined,item.cityCode ?? null,
    item.coordinates!==undefined,item.coordinates?.latitude ?? null,item.coordinates!==undefined,item.coordinates?.longitude ?? null,
    item.address,item.phone,uuid.parse(req.params.id)],'门店不存在')
  res.json({ok:true})
})
adminRouter.patch('/stores/:id',async (req,res) => {
  const {enabled} = enabledInput.parse(req.body)
  await update('UPDATE h5_stores SET enabled=? WHERE id=?',[enabled,uuid.parse(req.params.id)],'门店不存在')
  res.json({ok:true})
})

async function checkStore(id: string|null, localService = false) {
  if (!id) {
    if (localService) throw new HttpError(400,'发布周边服务帖前请选择关联门店')
    return
  }
  const [store] = await rows<{ phone:string; area:string|null; districtCode:string|null; cityCode:string|null }>(
    'SELECT phone,area,district_code AS districtCode,city_code AS cityCode FROM h5_stores WHERE id=?',[id])
  if (!store) throw new HttpError(400,'关联门店不存在，请重新选择')
  if (localService && ((!store.area && !store.districtCode && !store.cityCode) || !servicePhone(store.phone))) {
    throw new HttpError(400,'请先在门店管理填写地区和联系电话')
  }
}

const serviceCategoryForm = z.object({label:serviceCategoryName}).strict()
adminRouter.get('/service-categories', async (_req,res) => {
  res.json({items:await getServiceCategories()})
})
adminRouter.post('/service-categories', async (req,res) => {
  const {label} = serviceCategoryForm.parse(req.body)
  const id = 'custom-'+randomBytes(10).toString('hex')
  try {
    await db.execute('INSERT INTO h5_service_categories (id,label) VALUES (?,?)',[id,label])
  } catch (error) {
    if ((error as {code?:string}).code === 'ER_DUP_ENTRY') throw new HttpError(409,'该分类已存在')
    throw error
  }
  res.status(201).json({id,label})
})
adminRouter.put('/service-categories/:id', async (req,res) => {
  const id = serviceCategoryId.parse(req.params.id)
  const {label} = serviceCategoryForm.parse(req.body)
  try {
    await update('UPDATE h5_service_categories SET label=? WHERE id=?',[label,id],'服务分类不存在')
  } catch (error) {
    if ((error as {code?:string}).code === 'ER_DUP_ENTRY') throw new HttpError(409,'该分类已存在')
    throw error
  }
  res.json({id,label})
})

const catalogSections = [
  {path:'/products',name:'商品',scope:"i.kind='product'"},
  {path:'/services',name:'服务',scope:"i.kind NOT IN ('product','group')"},
] as const
for (const section of catalogSections) {
  const isProduct = section.path === '/products'
  const detail = section.path + '/:id'
  adminRouter.get(section.path,list({
    select:`i.id,i.module,i.category,i.kind,i.title,i.provider,i.description,i.area,i.venue,
      i.starts_at AS startsAt,i.closes_at AS closesAt,i.price_cents AS priceCents,i.stock,
      i.external_url AS externalUrl,i.published,i.updated_at AS updatedAt,i.store_id AS storeId,
      store.name AS storeName,store.enabled AS storeEnabled,(${catalogVisible}) AS visible,
      IF(i.module='services' AND i.kind<>'product',${serviceCategoryLabel},NULL) AS categoryLabel`,
    from:`h5_catalog_items i ${catalogStore} ${serviceCategoryJoin}`, scope:section.scope,
    search:'i.title,i.description,i.provider,store.name,i.id', order:'i.updated_at DESC,i.id DESC',
    states:{published:catalogVisible,unpublished:'i.published=FALSE',paused:'i.published=TRUE AND store.enabled=FALSE'},
  }))
  adminRouter.post(section.path,async (req,res) => {
    const item = managedCatalogInput.parse(req.body)
    if ((item.kind === 'product') !== isProduct || item.kind === 'group') throw new HttpError(400,'项目类型不匹配')
    if (!isProduct && item.module==='services') await checkServiceCategory(item.category)
    await checkStore(item.storeId, item.module==='services' && item.published)
    res.status(201).json({id:await createCatalogItem(item)})
  })
  adminRouter.put(detail,async (req,res) => {
    const id = uuid.parse(req.params.id)
    const item = managedCatalogUpdate.parse(req.body)
    if ((item.kind === 'product') !== isProduct || item.kind === 'group') throw new HttpError(400,'项目类型不匹配')
    if (!isProduct && item.module==='services') await checkServiceCategory(item.category)
    await checkStore(item.storeId, item.module==='services' && item.published)
    await update(`UPDATE h5_catalog_items i SET module=?,category=?,kind=?,title=?,provider=?,description=?,area=?,
      venue=?,starts_at=?,closes_at=?,price_cents=?,stock=?,external_url=?,published=?,store_id=?
      WHERE id=? AND updated_at=? AND stock<=>? AND ${section.scope}`,
    [...catalogValues(item),id,new Date(item.updatedAt),item.expectedStock],'记录已变化，请重新打开后编辑',409)
    res.json({ok:true})
  })
  adminRouter.patch(detail,async (req,res) => {
    const {published} = publishedInput.parse(req.body)
    const id = uuid.parse(req.params.id)
    if (!isProduct && published) {
      const [item] = await rows<{ module:string; storeId:string|null }>(
        `SELECT i.module,i.store_id AS storeId FROM h5_catalog_items i WHERE i.id=? AND ${section.scope}`, [id])
      if (item?.module==='services') await checkStore(item.storeId, true)
    }
    await update(`UPDATE h5_catalog_items i SET published=? WHERE id=? AND ${section.scope}`,
      [published,id],section.name+'不存在')
    res.json({ok:true})
  })
}

adminRouter.get('/pets',list({
  select:`p.id,p.name,p.species,p.breed,p.gender,DATE_FORMAT(p.birthday,'%Y-%m-%d') AS birthday,p.notes,
    u.display_name AS owner,u.username AS ownerUsername,i.identity_number AS identityNumber,p.created_at AS createdAt`,
  from:'pets p JOIN users u ON u.id=p.user_id LEFT JOIN pet_identities i ON i.pet_id=p.id',
  search:'p.name,p.breed,u.display_name,u.username,i.identity_number,p.id', order:'p.created_at DESC,p.id DESC',
  states:{cat:"p.species='cat'",dog:"p.species='dog'",other:"p.species='other'"},
}))
adminRouter.put('/pets/:id',async (req,res) => {
  const id = uuid.parse(req.params.id)
  const data = petSchema.omit({avatarAssetId:true}).strict().parse(req.body)
  const [pet] = await rows<{userId:string}>('SELECT user_id AS userId FROM pets WHERE id=?',[id])
  if (!pet) throw new HttpError(404,'宠物不存在')
  await updatePetRecord(pet.userId,id,data)
  res.json({ok:true})
})

const userPet = 'JOIN users u ON u.id=c.user_id JOIN pets p ON p.id=c.pet_id'
const publicContent = 'c.published_at IS NOT NULL OR c.hidden_at IS NOT NULL'
adminRouter.get('/posts',list({
  select:`c.id,c.title,c.topic,c.created_at AS createdAt,u.display_name AS author,p.name AS petName,
    (c.hidden_at IS NOT NULL) AS hidden,(SELECT COUNT(*) FROM h5_post_comments cm WHERE cm.post_id=c.id) AS commentCount`,
  from:`h5_posts c ${userPet}`, search:'c.title,c.body,u.display_name,p.name,c.id', order:'c.created_at DESC,c.id DESC',
  states:{published:'c.hidden_at IS NULL',hidden:'c.hidden_at IS NOT NULL'},
}))
adminRouter.get('/stories',list({
  select:`c.id,c.title,c.updated_at AS updatedAt,c.published_at AS publishedAt,
    u.display_name AS author,p.name AS petName,(c.hidden_at IS NOT NULL) AS hidden,JSON_LENGTH(c.scenes) AS sceneCount`,
  from:`h5_stories c ${userPet}`, search:'c.title,u.display_name,p.name,c.id', order:'c.updated_at DESC,c.id DESC',
  states:{published:'c.hidden_at IS NULL AND c.published_at IS NOT NULL',hidden:'c.hidden_at IS NOT NULL',
    draft:'c.hidden_at IS NULL AND c.published_at IS NULL'},
}))

const contentSections = [
  {path:'/posts',table:'h5_posts',media:'asset_id',details:'c.body',file:'image',scope:'TRUE',name:'动态'},
  {path:'/stories',table:'h5_stories',media:'cover_asset_id',details:'c.scenes',file:'cover',scope:publicContent,name:'作品'},
] as const
for (const section of contentSections) {
  const path = section.path + '/:id'
  const contentFrom = `FROM ${section.table} c LEFT JOIN assets a
    ON a.id=c.${section.media} AND a.kind='photo' AND a.user_id=c.user_id AND a.pet_id=c.pet_id
    WHERE c.id=? AND (${section.scope})`
  adminRouter.get(path,async (req,res) => {
    const [record] = await rows(`SELECT ${section.details},(a.id IS NOT NULL) AS hasImage ${contentFrom}`,[uuid.parse(req.params.id)])
    if (!record) throw new HttpError(404,section.name+'不存在或尚未发布')
    res.json({record})
  })
  adminRouter.get(path+'/'+section.file,async (req,res) => {
    const [image] = await rows<{fileKey:string}>(`SELECT a.file_key AS fileKey ${contentFrom}`,[uuid.parse(req.params.id)])
    res.type('webp').send(await photoThumbnail(image?.fileKey,960))
  })
  adminRouter.patch(path,async (req,res) => {
    const {hidden} = hiddenInput.parse(req.body)
    await update(`UPDATE ${section.table} c SET hidden_at=IF(?,COALESCE(hidden_at,UTC_TIMESTAMP(3)),NULL)
      WHERE id=? AND (${section.scope})`, [hidden,uuid.parse(req.params.id)],section.name+'不存在或尚未发布')
    res.json({ok:true})
  })
}
