import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { canFollowCursor, canonicalCatAction, catClips, catDefaultAction, catFollowAction, catStopFollowAction, resolveCatAction } from '../../shared/cat-motion.mjs'
import { defaultDeskPetId, isSystemDeskPetId, parseCustomDeskPetId } from '../../shared/desk-pets.mjs'
import { db, rows, transaction } from './db.js'
import { config } from './config.js'
import { HttpError } from './errors.js'
import { assetSelect, ownedAsset, ownedPet, removeFile, saveImage, storagePath, type Asset } from './assets.js'
import { createDeskPetGeneration, deskPetCapabilities, getDeskPetGeneration, getPetDeskSpec, listDeskPetProfiles } from './desk-pet-generation.js'
// import { generationRouter } from './generation-routes.js'
import { checkVideoTools, supportsMotionVideo, VIDEO_FPS } from './video.js'
import { supportsForegroundRemoval } from './foreground.js'
import { getMotionAssets, getMotionClipSteps, getMotionPoses } from './motion-batches.js'
import { issuePetIdentity, type NosePrint } from './pet-identity.js'
import { availableNosePrintSpecies, readNosePrint } from './pet-nose-print.js'
import { renderIdentityCode } from './identity-codes.js'
const uuid = z.string().uuid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式不正确').refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value
}, '日期无效')
export const petSchema = z.object({
  name: z.string().trim().min(1, '请输入宠物名字').max(40), species: z.enum(['dog','cat','other']),
  breed: z.string().trim().max(80).default(''), birthday: date.nullable().default(null),
  gender: z.enum(['unknown','male','female']).default('unknown'), notes: z.string().max(2000).default(''),
  avatarAssetId: uuid.nullable().default(null),
})
const petSelect = "p.id,p.name,p.species,p.breed,DATE_FORMAT(p.birthday,'%Y-%m-%d') AS birthday,p.gender,p.notes,p.avatar_asset_id AS avatarAssetId,p.created_at AS createdAt,(SELECT identity_number FROM pet_identities WHERE pet_id=p.id) AS identityNumber,(SELECT COUNT(*) FROM assets a WHERE a.pet_id=p.id) AS assetCount,(SELECT COUNT(*) FROM memories m WHERE m.pet_id=p.id) AS memoryCount"
const listPets = (userId: string) => rows(`SELECT ${petSelect} FROM pets p WHERE p.user_id=? ORDER BY p.created_at DESC`, [userId])
const identityPetQuery = 'SELECT p.species,i.identity_number AS identityNumber FROM pets p LEFT JOIN pet_identities i ON i.pet_id=p.id WHERE p.id=? AND p.user_id=?'
type IdentityPet = { species:z.infer<typeof petSchema>['species']; identityNumber:string|null }
const nosePhoto = z.object({ nosePrintImage:z.string().min(1,'请上传宠物鼻纹照片').max(12 * 1024 * 1024) })
const maxPets = 3
export const apiRouter = Router()
// 暂停 AI 生图和动作生成，保留历史接口实现及素材读取。
// apiRouter.use(generationRouter)
apiRouter.get('/dashboard', async (req, res) => {
  const [stats] = await rows(`SELECT (SELECT COUNT(*) FROM pets WHERE user_id=?) AS pets,(SELECT COUNT(*) FROM assets WHERE user_id=?) AS assets,(SELECT COUNT(*) FROM assets WHERE user_id=? AND kind='sprite') AS sprites,(SELECT COALESCE(SUM(byte_size),0) FROM assets WHERE user_id=?) AS storageBytes,(SELECT COUNT(*) FROM memories WHERE user_id=?) AS memories`, Array(5).fill(req.user.id))
  const generationEnabled = res.locals.generationEnabled === true
  const toolsReady = generationEnabled && Boolean(config.videoKey) && await checkVideoTools()
  res.json({ stats, generationEnabled: toolsReady, model: config.videoModel, videoFps: VIDEO_FPS, videoMatting: generationEnabled && supportsForegroundRemoval(), generationReason: !generationEnabled ? 'AI 生图和动作生成已暂停' : !config.videoKey ? '请配置 Uniwork 视频服务密钥' : !toolsReady ? '请在后端安装 FFmpeg 和 FFprobe 后重启服务' : '' })
})
apiRouter.get('/pets', async (req, res) => res.json({ pets: await listPets(req.user.id) }))

async function createPetRecord(owner:string,data:z.infer<typeof petSchema>,nose?:NosePrint) {
  if (data.avatarAssetId) throw new HttpError(400, '请先创建宠物，再设置封面')
  const id = randomUUID()
  await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [owner])
    const [[count]] = await conn.execute<(RowDataPacket & {count:number})[]>('SELECT COUNT(*) AS count FROM pets WHERE user_id=?', [owner])
    if (count.count>=maxPets) throw new HttpError(409, '每个账号最多保留 3 个宠物档案')
    await conn.execute('INSERT INTO pets (id,user_id,name,species,breed,birthday,gender,notes) VALUES (?,?,?,?,?,?,?,?)', [id,owner,data.name,data.species,data.breed,data.birthday,data.gender,data.notes])
    if (nose) await issuePetIdentity(conn,id,nose)
  })
  return (await listPets(owner)).find(pet=>pet.id===id)
}

apiRouter.post('/pets', async (req, res) => {
  const pet=await createPetRecord(req.user.id,petSchema.parse(req.body))
  res.status(201).json({pet})
})
apiRouter.get('/pets/identity', async (_req,res) => {
  res.json({species:await availableNosePrintSpecies()})
})
apiRouter.post('/pets/identity', async (req,res) => {
  const {nosePrintImage,...data}=petSchema.merge(nosePhoto).parse(req.body)
  const [count]=await rows<{count:number}>('SELECT COUNT(*) AS count FROM pets WHERE user_id=?',[req.user.id])
  if (count.count>=maxPets) throw new HttpError(409,'每个账号最多保留 3 个宠物档案')
  const nose=await readNosePrint(data.species,nosePrintImage)
  const pet=await createPetRecord(req.user.id,data,nose)
  res.status(201).json({pet})
})
apiRouter.post('/pets/:id/identity', async (req,res) => {
  const id=uuid.parse(req.params.id), owner=req.user.id
  const {nosePrintImage}=nosePhoto.parse(req.body)
  const [pet]=await rows<IdentityPet>(identityPetQuery,[id,owner])
  if (!pet) throw new HttpError(404,'宠物不存在')
  if (!pet.identityNumber) {
    const nose=await readNosePrint(pet.species,nosePrintImage)
    await transaction(async conn=>{
      await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[owner])
      const [[current]]=await conn.execute<(RowDataPacket & IdentityPet)[]>(identityPetQuery,[id,owner])
      if (!current) throw new HttpError(404,'宠物不存在')
      if (current.identityNumber) return
      if (current.species!==pet.species) throw new HttpError(409,'宠物类型已更新，请重新打开档案登记')
      await issuePetIdentity(conn,id,nose)
    })
  }
  res.json({pet:(await listPets(owner)).find(item=>item.id===id)})
})
apiRouter.get('/pets/:id/identity/codes/:kind', async (req,res) => {
  const id=uuid.parse(req.params.id)
  const kind=z.enum(['barcode','qrcode']).parse(req.params.kind)
  const [pet]=await rows<IdentityPet>(identityPetQuery,[id,req.user.id])
  if (!pet?.identityNumber) throw new HttpError(404,'宠物身份证尚未签发或已删除')
  const image=await renderIdentityCode(pet.identityNumber,kind)
  res.type('png').send(image)
})
apiRouter.route('/pets/:id').patch(updatePet).put(updatePet)
async function updatePet(req: Request, res: Response) {
  const id = uuid.parse(req.params.id), owner=req.user.id
  await updatePetRecord(owner,id,petSchema.parse(req.body))
  res.json({ pet: (await listPets(owner)).find(p => p.id === id) })
}

type PetEdit = Omit<z.infer<typeof petSchema>, 'avatarAssetId'> & { avatarAssetId?: string|null }
export async function updatePetRecord(owner: string, id: string, data: PetEdit) {
  await transaction(async conn=>{
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[owner])
    const [[pet]]=await conn.execute<(RowDataPacket & IdentityPet)[]>(identityPetQuery,[id,owner])
    if (!pet) throw new HttpError(404,'宠物不存在')
    if (pet.identityNumber && data.species!==pet.species) throw new HttpError(409,'已登记鼻纹的宠物须保留登记时的种类')
    if (data.avatarAssetId) {
      const [[asset]]=await conn.execute<RowDataPacket[]>('SELECT pet_id AS petId,kind FROM assets WHERE id=? AND user_id=?',[data.avatarAssetId,owner])
      if (!asset) throw new HttpError(404,'素材不存在')
      if (asset.petId!==id || asset.kind!=='photo') throw new HttpError(400,'封面必须是该宠物的照片')
    }
    await conn.execute('UPDATE pets SET name=?,species=?,breed=?,birthday=?,gender=?,notes=?,avatar_asset_id=IF(?,avatar_asset_id,?) WHERE id=? AND user_id=?',
      [data.name,data.species,data.breed,data.birthday,data.gender,data.notes,data.avatarAssetId===undefined,data.avatarAssetId??null,id,owner])
  })
}
apiRouter.delete('/pets/:id', async (req, res) => {
  const id = uuid.parse(req.params.id)
  const files = await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id])
    await ownedPet(req.user.id, id)
    if (res.locals.generationEnabled) {
      const [active]: any = await conn.execute("SELECT id FROM generation_jobs WHERE pet_id=? AND status IN ('queued','running')", [id])
      if (active.length) throw new HttpError(409, '请等待该宠物的生成任务结束后再删除')
    }
    const [files] = await conn.execute('SELECT file_key,source_video_key FROM assets WHERE pet_id=? AND user_id=?', [id, req.user.id])
    await conn.execute('DELETE FROM pets WHERE id=? AND user_id=?', [id, req.user.id])
    return files as { file_key: string; source_video_key: string|null }[]
  })
  await Promise.all(files.map(file => removeFile(file.file_key,file.source_video_key))); res.json({ ok: true })
})
apiRouter.get('/assets', async (req, res) => {
  const petId = req.query.petId ? uuid.parse(req.query.petId) : null
  const kind = req.query.kind ? z.enum(['photo','sprite']).parse(req.query.kind) : null
  res.json({ assets: await rows(`SELECT ${assetSelect} FROM assets WHERE user_id=?${petId ? ' AND pet_id=?' : ''}${kind ? ' AND kind=?' : ''} ORDER BY created_at DESC,id DESC LIMIT 500`, [req.user.id,...(petId ? [petId] : []),...(kind ? [kind] : [])]) })
})
apiRouter.post('/assets', async (req, res) => {
  const data = z.object({ petId: uuid, name: z.string().trim().min(1).max(150), image: z.string().max(12 * 1024 * 1024) }).parse(req.body)
  await ownedPet(req.user.id, data.petId)
  const match = data.image.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) throw new HttpError(400, '请上传 JPG、PNG 或 WebP 图片')
  const asset = await saveImage({ userId: req.user.id, petId: data.petId, name: data.name, bytes: Buffer.from(match[1], 'base64') })
  await db.execute('UPDATE pets SET avatar_asset_id=COALESCE(avatar_asset_id,?) WHERE id=? AND user_id=?', [asset.id,data.petId,req.user.id])
  res.status(201).json({ asset })
})
apiRouter.get('/assets/:id/file', async (req, res, next) => {
  const asset = await ownedAsset(req.user.id, uuid.parse(req.params.id))
  res.setHeader('Cache-Control', 'private, no-store')
  res.type(asset.mimeType)
  if (req.query.download === '1') res.attachment(`${asset.id}.png`)
  res.sendFile(storagePath(asset.fileKey), error => { if (error) next(new HttpError(404, '素材文件不存在')) })
})
apiRouter.get('/assets/:id/video', async (req, res, next) => {
  const asset = await ownedAsset(req.user.id, uuid.parse(req.params.id))
  if (!asset.videoKey) throw new HttpError(404, '这份素材没有原视频')
  res.setHeader('Cache-Control', 'private, no-store')
  res.type('video/mp4')
  if (req.query.download === '1') res.attachment(`${asset.id}.mp4`)
  res.sendFile(storagePath(asset.videoKey), error => { if (error) next(new HttpError(404, '原视频文件不存在')) })
})
apiRouter.patch('/assets/:id', async (req, res) => {
  const id = uuid.parse(req.params.id); await ownedAsset(req.user.id, id)
  const { name } = z.object({ name: z.string().trim().min(1).max(150) }).parse(req.body)
  await db.execute('UPDATE assets SET name=? WHERE id=? AND user_id=?', [name,id,req.user.id]); res.json({ ok: true })
})
apiRouter.delete('/assets/:id', async (req, res) => {
  const id = uuid.parse(req.params.id)
  const file = await transaction(async conn => {
    await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id])
    const asset = await ownedAsset(req.user.id, id)
    const [active] = await conn.execute<RowDataPacket[]>(`SELECT j.id FROM generation_jobs j LEFT JOIN generation_jobs batch ON batch.id=j.batch_id
      WHERE j.user_id=? AND (j.status IN ('queued','running') OR batch.status IN ('queued','running'))
        AND (j.reference_asset_id=? OR j.end_asset_id=? OR j.reused_asset_id=? OR (j.batch_id IS NOT NULL AND j.id=?)
          OR JSON_CONTAINS(j.appearance_reference_ids,JSON_QUOTE(?))) LIMIT 1`,[req.user.id,id,id,id,asset.jobId,id])
    if (active.length) {
      const reason = res.locals.generationEnabled ? '这份素材正在用于生成，暂时不能删除' : '这份素材关联了已暂停的生成任务，暂时不能单独删除'
      throw new HttpError(409,reason)
    }
    await conn.execute('UPDATE pets SET avatar_asset_id=NULL WHERE avatar_asset_id=? AND user_id=?', [id,req.user.id])
    await conn.execute('DELETE FROM assets WHERE id=? AND user_id=?', [id,req.user.id])
    return asset
  })
  await removeFile(file.fileKey,file.videoKey); res.json({ ok: true })
})
const keyAction = z.string().transform((value, context) => {
  if (value===catFollowAction || value===catStopFollowAction) return value
  const action = canonicalCatAction(value)
  if (action) return value==='stand_idle' ? value : action
  context.addIssue({code:'custom',message:'请选择关键动作'})
  return z.NEVER
})
apiRouter.get('/motions/:petId', async (req,res) => {
  const petId = uuid.parse(req.params.petId)
  await ownedPet(req.user.id,petId)
  const generationEnabled = res.locals.generationEnabled === true
  const [poses,assets,steps] = await Promise.all([
    getMotionPoses(petId),
    getMotionAssets(req.user.id,petId),
    generationEnabled ? getMotionClipSteps(req.user.id,petId) : [],
  ])
  res.json({poses,assets,steps,poseGenerationEnabled:generationEnabled && Boolean(config.imageKey),clipGenerationEnabled:generationEnabled && Boolean(config.videoKey) && supportsMotionVideo(config.videoModel)})
})

const memorySelect = "id,pet_id AS petId,title,content,DATE_FORMAT(happened_on,'%Y-%m-%d') AS happenedOn,asset_id AS assetId,created_at AS createdAt"
const memorySchema = z.object({ petId: uuid, title: z.string().trim().min(1).max(100), content: z.string().max(5000).default(''), happenedOn: date, assetId: uuid.nullable().default(null) })
apiRouter.get('/memories', async (req, res) => res.json({ memories: await rows(`SELECT ${memorySelect} FROM memories WHERE user_id=? ORDER BY happened_on DESC,created_at DESC LIMIT 500`, [req.user.id]) }))
apiRouter.post('/memories', async (req, res) => {
  const data = memorySchema.parse(req.body); await ownedPet(req.user.id, data.petId)
  if (data.assetId && (await ownedAsset(req.user.id, data.assetId)).petId !== data.petId) throw new HttpError(400, '请选择该宠物的照片')
  const id = randomUUID()
  await db.execute('INSERT INTO memories (id,user_id,pet_id,title,content,happened_on,asset_id) VALUES (?,?,?,?,?,?,?)', [id,req.user.id,data.petId,data.title,data.content,data.happenedOn,data.assetId])
  res.status(201).json({ memory: (await rows(`SELECT ${memorySelect} FROM memories WHERE id=?`, [id]))[0] })
})
apiRouter.delete('/memories/:id', async (req, res) => {
  const [result]: any = await db.execute('DELETE FROM memories WHERE id=? AND user_id=?', [uuid.parse(req.params.id),req.user.id])
  if (!result.affectedRows) throw new HttpError(404, '记忆不存在'); res.json({ ok: true })
})
const desktopSelect = 'pet_id AS petId,size,enabled,idle_asset_id AS idleAssetId,happy_asset_id AS happyAssetId,walk_asset_id AS walkAssetId,sleep_asset_id AS sleepAssetId'
apiRouter.get('/desktop/action', async (req,res) => {
  const [command] = await rows(`SELECT id,pet_id AS petId,action,error,
    CASE WHEN status IN ('queued','playing') AND expires_at<=UTC_TIMESTAMP(3) THEN 'expired' ELSE status END AS status
    FROM desktop_action_requests WHERE user_id=?`,[req.user.id])
  res.json({command:command ?? null})
})

apiRouter.post('/desktop/action', async (req,res) => {
  const {petId,action} = z.object({petId:uuid,action:keyAction}).parse(req.body)
  const target = action==='stand_idle' ? catDefaultAction : action
  const owner = req.user.id
  await ownedPet(owner,petId)
  const id = randomUUID()
  await transaction(async conn => {
    const [[profile]] = await conn.execute<RowDataPacket[]>('SELECT pet_id,enabled FROM desktop_profiles WHERE user_id=? FOR UPDATE',[owner])
    if (profile?.pet_id!==petId || !profile.enabled) throw new HttpError(409,'请先在桌宠设置绑定这只宠物并开启显示')
    const [[active]] = await conn.execute<RowDataPacket[]>(`SELECT id FROM desktop_action_requests WHERE user_id=?
      AND status IN ('queued','playing') AND expires_at>UTC_TIMESTAMP(3)`,[owner])
    if (active) throw new HttpError(409,'桌宠正在切换动作，请稍等')
    const manifest = {poses:await getMotionPoses(petId,conn),assets:await getMotionAssets(owner,petId,conn)}
    if (target===catFollowAction) {
      if (!canFollowCursor(manifest)) throw new HttpError(409,'请先补齐左右走、收步和转身素材')
    } else if (target!==catStopFollowAction) {
      if (!resolveCatAction(catClips[target].from,target,manifest,{allowLegacyStand:action==='stand_idle'})) throw new HttpError(409,'请先生成这个动作的透明素材')
      if (catClips[target].gesture && !resolveCatAction(catClips[target].to,catDefaultAction,manifest)) throw new HttpError(409,'请先补齐返回站立的过渡动作')
    }
    await conn.execute(`INSERT INTO desktop_action_requests (user_id,id,pet_id,action,expires_at)
      VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 SECOND)) AS request
      ON DUPLICATE KEY UPDATE id=request.id,pet_id=request.pet_id,action=request.action,expires_at=request.expires_at,
        status='queued',claimed_by=NULL,error=NULL`,[owner,id,petId,action])
  })
  res.status(202).json({command:{id,petId,action,status:'queued',error:null}})
})

apiRouter.put('/desktop/action/:id', async (req,res) => {
  if (req.get('X-PetCloud-Client')!=='desktop' || !/^Bearer [a-f0-9]{64}$/.test(req.get('Authorization')??'')) {
    throw new HttpError(403,'请通过桌宠客户端更新切换状态')
  }
  const id = uuid.parse(req.params.id)
  const {status,error} = z.object({status:z.enum(['playing','completed','failed']),error:z.string().max(240).optional()}).parse(req.body)
  const [result] = status==='playing'
    ? await db.execute<ResultSetHeader>(`UPDATE desktop_action_requests r JOIN desktop_profiles p ON p.user_id=r.user_id
        AND p.pet_id=r.pet_id AND p.enabled=1
        SET r.status='playing',r.claimed_by=?,r.expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 65 SECOND)
        WHERE r.user_id=? AND r.id=? AND r.status='queued' AND r.expires_at>UTC_TIMESTAMP(3)`,[req.tokenHash,req.user.id,id])
    : await db.execute<ResultSetHeader>(`UPDATE desktop_action_requests SET status=?,error=?
        WHERE user_id=? AND id=? AND claimed_by=? AND status='playing' AND expires_at>UTC_TIMESTAMP(3)`,
        [status,status==='failed'?error??'桌宠切换未完成':null,req.user.id,id,req.tokenHash])
  if (!result.affectedRows) throw new HttpError(409,'这条动作切换指令已处理或过期')
  res.json({ok:true})
})

apiRouter.get('/desktop', async (req, res) => {
  const [profile] = await rows(`SELECT ${desktopSelect} FROM desktop_profiles WHERE user_id=?`, [req.user.id])
  const pet = profile.petId ? (await listPets(req.user.id)).find(p => p.id === profile.petId) : null
  const [standing] = pet && !profile.idleAssetId ? await rows<{id:string}>(`SELECT a.id FROM assets a JOIN motion_poses p ON p.pet_id=a.pet_id AND p.pose_key='stand_left'
    WHERE a.user_id=? AND a.pet_id=? AND a.action IN (?, 'stand_idle') AND a.background_removed
      AND a.motion_from_asset_id=p.asset_id AND a.motion_to_asset_id=p.asset_id
    ORDER BY (a.action=?) DESC,a.motion_joinable DESC,a.created_at DESC LIMIT 1`,[req.user.id,pet.id,catDefaultAction,catDefaultAction]) : []
  const ids = [profile.idleAssetId,profile.happyAssetId,profile.walkAssetId,profile.sleepAssetId,standing?.id,pet?.avatarAssetId].filter(Boolean)
  const assets = ids.length ? await rows<Asset>(`SELECT ${assetSelect} FROM assets WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`, [req.user.id,...ids]) : []
  res.json({ profile: { ...profile, enabled: Boolean(profile.enabled) }, pet, assets, motionStandId:standing?.id ?? null })
})
apiRouter.put('/desktop', async (req, res) => {
  const data = z.object({ petId: uuid.nullable(), size: z.number().int().min(120).max(480), enabled: z.boolean(), idleAssetId: uuid.nullable(), happyAssetId: uuid.nullable(), walkAssetId: uuid.nullable(), sleepAssetId: uuid.nullable() }).parse(req.body)
  if (data.petId) await ownedPet(req.user.id, data.petId)
  for (const id of [data.idleAssetId,data.happyAssetId,data.walkAssetId,data.sleepAssetId]) {
    if (!id) continue
    const asset = await ownedAsset(req.user.id, id)
    if (asset.petId !== data.petId) throw new HttpError(400, '动作素材必须属于当前宠物')
  }
  await db.execute('UPDATE desktop_profiles SET pet_id=?,size=?,enabled=?,idle_asset_id=?,happy_asset_id=?,walk_asset_id=?,sleep_asset_id=? WHERE user_id=?', [data.petId,data.size,data.enabled,data.idleAssetId,data.happyAssetId,data.walkAssetId,data.sleepAssetId,req.user.id])
  res.json({ ok: true })
})
async function resolveMiniappDeskPetId(userId: string, candidate?: string | null) {
  if (!candidate || isSystemDeskPetId(candidate)) return candidate && isSystemDeskPetId(candidate) ? candidate : defaultDeskPetId
  const petId = parseCustomDeskPetId(candidate)
  if (!petId) return defaultDeskPetId
  const [match] = await rows<{ id: string }>(
    `SELECT p.id FROM pets p
     WHERE p.id=? AND p.user_id=?
       AND EXISTS (SELECT 1 FROM desk_pet_generations g
         WHERE g.pet_id=p.id AND g.user_id=p.user_id AND g.status='completed')
     LIMIT 1`,
    [petId, userId],
  )
  return match ? candidate : defaultDeskPetId
}
apiRouter.get('/desktop/miniapp/pets', async (req, res) => {
  res.json(await listDeskPetProfiles(req.user.id))
})
apiRouter.get('/desktop/miniapp/pet/:petId', async (req, res) => {
  res.json({ deskPet: await getPetDeskSpec(req.user.id, uuid.parse(req.params.petId)) })
})
apiRouter.post('/desktop/miniapp/generations', async (req, res) => {
  const data = z.object({ petId:uuid, assetId:uuid.optional() }).strict().parse(req.body)
  const generation = await createDeskPetGeneration(req.user.id, data.petId, data.assetId)
  res.status(202).json({ generation })
})
apiRouter.get('/desktop/miniapp/generations/:id', async (req, res) => {
  res.json({ generation: await getDeskPetGeneration(req.user.id, uuid.parse(req.params.id)) })
})
apiRouter.get('/desktop/miniapp', async (req, res) => {
  const [profile] = await rows<{ petId: string; enabled: number }>(
    'SELECT miniapp_pet_id AS petId, miniapp_enabled AS enabled FROM desktop_profiles WHERE user_id=?',
    [req.user.id],
  )
  const petId = await resolveMiniappDeskPetId(req.user.id, profile?.petId)
  res.json({ deskPet: { petId, enabled: profile ? Boolean(profile.enabled) : true }, capabilities: deskPetCapabilities() })
})
apiRouter.put('/desktop/miniapp', async (req, res) => {
  const data = z.object({
    petId: z.string().trim().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
  }).refine(value => value.petId !== undefined || value.enabled !== undefined, '请提供要更新的桌宠设置').parse(req.body)
  let nextPetId: string | undefined
  if (data.petId !== undefined) {
    if (isSystemDeskPetId(data.petId)) {
      nextPetId = data.petId
    } else {
      const customPetId = parseCustomDeskPetId(data.petId)
      if (!customPetId) throw new HttpError(400, '请选择有效的桌宠')
      await ownedPet(req.user.id, customPetId)
      const [sprite] = await rows<{ id: string }>(
        `SELECT id FROM desk_pet_generations WHERE user_id=? AND pet_id=? AND status='completed' LIMIT 1`,
        [req.user.id, customPetId],
      )
      if (!sprite) throw new HttpError(409, '这只宠物还没有生成桌宠')
      nextPetId = data.petId
    }
  }
  const [existing] = await rows<{ petId: string; enabled: number }>(
    'SELECT miniapp_pet_id AS petId, miniapp_enabled AS enabled FROM desktop_profiles WHERE user_id=?',
    [req.user.id],
  )
  const petId = nextPetId ?? await resolveMiniappDeskPetId(req.user.id, existing?.petId)
  const enabled = data.enabled ?? (existing ? Boolean(existing.enabled) : true)
  await db.execute(
    `INSERT INTO desktop_profiles (user_id, miniapp_pet_id, miniapp_enabled) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE miniapp_pet_id=VALUES(miniapp_pet_id), miniapp_enabled=VALUES(miniapp_enabled)`,
    [req.user.id, petId, enabled],
  )
  res.json({ deskPet: { petId, enabled } })
})
